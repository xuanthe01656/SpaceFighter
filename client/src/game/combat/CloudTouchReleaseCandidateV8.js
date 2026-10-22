/**
 * SpaceFighter V8B-2B3: offline candidate policy matrix for touch release.
 *
 * IMPORTANT: not a game controller, not a Cloud battle input endpoint, not a
 * settlement authority, and NOT an approval to ship a different mobile UX.
 * This compares synthetic tick-indexed gestures; actual phone QA is required.
 *
 * clear: drop unsampled target on pointerup (quick flick may vanish).
 * carry: keep target after pointerup (ship may travel after release).
 * boundedFlush: allow one bounded 30Hz sample when released, then clear.
 */
import { runCloudTouchUxParityProbe } from './CloudTouchUxParityProbeV8.js';
import {
  CLOUD_INTENT_TICK_HZ,
  CLOUD_INTENT_WORLD_SCALE,
  openCloudInputIntent,
  addCloudPointerDelta,
  clearCloudPointerTarget,
  sampleCloudInputTick,
} from './CloudInputIntentV8.js';

export const TOUCH_RELEASE_CANDIDATE_VERSION = 'touch-release-candidate-v8b2b3';
export const TOUCH_RELEASE_DECISION = 'UNDECIDED_DEVICE_QA_REQUIRED';
const REQUEST_KEYS = Object.freeze(['config', 'events', 'ticks']);
const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const exact = (o, keys) => plain(o) && Object.keys(o).length === keys.length
  && keys.every(k => Object.hasOwn(o,k));
const ownDataOnly = o => Reflect.ownKeys(o).every(k => {
  const desc=Object.getOwnPropertyDescriptor(o,k);
  return typeof k==='string' && desc && Object.hasOwn(desc,'value');
});
const round = n => Number(n.toFixed(6));

export class CloudTouchReleaseCandidateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CloudTouchReleaseCandidateError';
    this.code = code;
  }
}
const fail = (code, message) => { throw new CloudTouchReleaseCandidateError(code,message); };

function evaluateBoundedFlush(request, legacy) {
  const { legacyInset, ...candidateConfig } = request.config;
  void legacyInset;
  let state = openCloudInputIntent(candidateConfig);
  let pressed = false;
  let cursor = 0;
  let postReleaseTravel = 0;
  let peakGap = 0;
  let totalGap = 0;
  let movingTicks = 0;
  let releaseCount = 0;
  let lastX = state.positionX;
  let lastZ = state.positionZ;
  let lastReleasedTick = -1;
  const samples = [];
  for (let tick = 0; tick < request.ticks; tick++) {
    let releasedThisTick = false;
    while (cursor < request.events.length && request.events[cursor].tick === tick) {
      const event = request.events[cursor++];
      if (event.type === 'down') {
        // A release and a NEW press within one tick need sub-tick ordering;
        // refuse to invent a physical timing interpretation.
        if (releasedThisTick) {
          fail('TOUCH_RELEASE_AMBIGUOUS', 'Multiple touch lifecycles in the same 30Hz tick');
        }
        pressed = true;
      } else if (event.type === 'drag') {
        state = addCloudPointerDelta(state, {deltaX:event.deltaX,deltaY:event.deltaY});
      } else if (event.type === 'up') {
        pressed = false;
        releasedThisTick = true;
        releaseCount++;
        lastReleasedTick = tick;
      }
    }
    const {frame, state:sampled} = sampleCloudInputTick(state);
    state = sampled;
    if (frame.x !== 0 || frame.z !== 0) movingTicks++;
    const traveled = Math.hypot(state.positionX-lastX,state.positionZ-lastZ)/CLOUD_INTENT_WORLD_SCALE;
    if (!pressed) postReleaseTravel += traveled;
    lastX = state.positionX;
    lastZ = state.positionZ;
    // This candidate does not carry the target beyond the sampling tick
    // in which pointerup was observed.
    if (releasedThisTick) state = clearCloudPointerTarget(state);
    const x = state.positionX / CLOUD_INTENT_WORLD_SCALE;
    const z = state.positionZ / CLOUD_INTENT_WORLD_SCALE;
    const base = legacy.samples[tick];
    const gap = Math.hypot(x-base.legacyX,z-base.legacyZ);
    peakGap = Math.max(peakGap,gap);
    totalGap += gap;
    samples.push(Object.freeze({tick, active:pressed, released:releasedThisTick,
      frame, predictedX:round(x), predictedZ:round(z), gapWorld:round(gap),
    }));
  }
  const metrics = Object.freeze({
    peakGapWorld:round(peakGap),meanGapWorld:round(totalGap/request.ticks),
    finalGapWorld:round(samples.at(-1).gapWorld),
    postReleaseTravelWorld:round(postReleaseTravel), movingTicks,releaseCount,
    lastReleasedTick,
  });
  return Object.freeze({releasePolicy:'boundedFlush',metrics,samples:Object.freeze(samples)});
}

/**
 * No phase-B2B3 policy can be selected by this function. It returns evidence,
 * not an instruction to replace ShipInputController or alter server rules.
 * All input fixtures are locally supplied and untrusted for actual gameplay.
 */
export function compareTouchReleaseCandidates(request) {
  if (!exact(request,REQUEST_KEYS) || !ownDataOnly(request)
    || !plain(request.config) || !ownDataOnly(request.config)
    || !Array.isArray(request.events)
    || Object.getPrototypeOf(request.events) !== Array.prototype
    || !ownDataOnly(request.events)
    || request.events.some(e=>!plain(e)||!ownDataOnly(e))) {
    fail('TOUCH_RELEASE_CONTRACT_INVALID', 'Expected plain data-only config/events/ticks');
  }
  // Snapshot the trace ONCE. Getter/proxy mutations between comparisons must
  // never produce different policies from different underlying event streams.
  const stable=Object.freeze({
    ticks:request.ticks,
    config:Object.freeze({...request.config}),
    events:Object.freeze(request.events.map(e=>Object.freeze({...e}))),
  });
  // V8B-2B2 validates physical bounds, event order and legacy trajectory.
  const clear = runCloudTouchUxParityProbe({...stable,releasePolicy:'clear'});
  const carry = runCloudTouchUxParityProbe({...stable,releasePolicy:'carry'});
  const bounded = evaluateBoundedFlush(stable, clear);
  const policies = Object.freeze({
    clear:Object.freeze({releasePolicy:'clear',metrics:clear.metrics}),
    carry:Object.freeze({releasePolicy:'carry',metrics:carry.metrics}),
    boundedFlush:bounded,
  });
  return Object.freeze({
    version:TOUCH_RELEASE_CANDIDATE_VERSION,
    tickHz:CLOUD_INTENT_TICK_HZ,
    decision:TOUCH_RELEASE_DECISION,
    evidence:'SYNTHETIC_TICK_TRACE_ONLY',
    parityVerified:false,
    deviceCaptureVerified:false,
    rewardAuthority:false,
    ticks:stable.ticks,eventCount:stable.events.length,
    policies,
  });
}
