/**
 * SpaceFighter V8B-2B2: offline, read-only touch UX parity probe.
 *
 * Compare the CURRENT instant-pointer-drag ship motion (Guest controller)
 * against the EXPERIMENTAL 30Hz CloudInputIntentV8 prediction, without changing
 * either implementation. This probe has no DOM, network, timer, persistence,
 * Firebase, victory or reward authority. Events are synthetic, tick-indexed
 * traces: this is NOT a test of actual phone latency or touch event cadence.
 */
import { worldDragDelta } from './ShipInputController.js';
import {
  CLOUD_INTENT_TICK_HZ, CLOUD_INTENT_WORLD_SCALE,
  openCloudInputIntent, addCloudPointerDelta,
  clearCloudPointerTarget, sampleCloudInputTick,
} from './CloudInputIntentV8.js';

export const UX_PROBE_VERSION = 'cloud-touch-ux-probe-v8b2b2';
const RUN_KEYS = Object.freeze(['config', 'events', 'ticks', 'releasePolicy']);
const CONFIG_KEYS = Object.freeze([
  'arenaHalfHeight', 'arenaHalfWidth', 'aspect', 'canvasHeight',
  'canvasWidth', 'halfHeight', 'hitRadius', 'legacyInset', 'movePerTick',
  'speedMultiplier', 'startX', 'startZ',
]);
const DOWN_KEYS = Object.freeze(['tick', 'type']);
const DRAG_KEYS = Object.freeze(['tick', 'type', 'deltaX', 'deltaY']);
const MAX_PROBE_TICKS = 600; // 20-second bounded offline comparison.
const MAX_PROBE_EVENTS = 2048;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const plain = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null);
const exact = (obj, keys) => plain(obj) && Object.keys(obj).length === keys.length
  && keys.every(key => Object.hasOwn(obj, key));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const toWorld = n => n / CLOUD_INTENT_WORLD_SCALE;
const rounded = n => Number(n.toFixed(6));

export class CloudTouchUxProbeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CloudTouchUxProbeError';
    this.code = code;
  }
}
const reject = (code, reason) => { throw new CloudTouchUxProbeError(code, reason); };

function validate(run) {
  if (!exact(run, RUN_KEYS)
    || !Number.isSafeInteger(run.ticks) || run.ticks < 1 || run.ticks > MAX_PROBE_TICKS
    || !['clear', 'carry'].includes(run.releasePolicy)
    || !Array.isArray(run.events) || run.events.length > MAX_PROBE_EVENTS
    || !exact(run.config, CONFIG_KEYS)) {
    reject('UX_PROBE_CONTRACT_INVALID', 'Invalid probe request');
  }
  const c = run.config;
  if (!finite(c.legacyInset) || c.legacyInset < 0 || c.legacyInset > 5) {
    reject('UX_PROBE_INSET_INVALID', 'Legacy scene inset must be a finite world distance');
  }
  const limitX = c.halfHeight * c.aspect - c.legacyInset;
  const limitZ = c.halfHeight - c.legacyInset;
  if (!finite(limitX) || !finite(limitZ) || limitX <= 0 || limitZ <= 0
    || !finite(c.startX) || !finite(c.startZ)
    || Math.abs(toWorld(c.startX)) > limitX
    || Math.abs(toWorld(c.startZ)) > limitZ) {
    reject('UX_PROBE_LEGACY_START_INVALID', 'Start position must be within the live scene bounds');
  }
  let active = false;
  let lastTick = -1;
  for (const evt of run.events) {
    if (!plain(evt) || !Number.isSafeInteger(evt.tick)
      || evt.tick < lastTick || evt.tick < 0 || evt.tick >= run.ticks) {
      reject('UX_PROBE_EVENT_INVALID', 'Events must have ordered in-range tick indices');
    }
    lastTick = evt.tick;
    if (evt.type === 'down') {
      if (!exact(evt, DOWN_KEYS) || active) {
        reject('UX_PROBE_POINTER_SEQUENCE', 'Duplicate or malformed pointer down');
      }
      active = true;
    } else if (evt.type === 'drag') {
      if (!active || !exact(evt, DRAG_KEYS)
        || !finite(evt.deltaX) || !finite(evt.deltaY)
        || Math.abs(evt.deltaX) > 20000 || Math.abs(evt.deltaY) > 20000) {
        reject('UX_PROBE_POINTER_SEQUENCE', 'Drag must follow down and have finite deltas');
      }
    } else if (evt.type === 'up') {
      if (!exact(evt, DOWN_KEYS) || !active) {
        reject('UX_PROBE_POINTER_SEQUENCE', 'Pointer up requires active touch');
      }
      active = false;
    } else {
      reject('UX_PROBE_EVENT_INVALID', 'Unknown pointer event type');
    }
  }
  return { limitX, limitZ };
}

/**
 * Execute a deterministic synthetic trace with both movement policies.
 *
 * Events for a tick are processed before that tick's Cloud sample. The legacy
 * controller moves on every drag event, independently of the render/tick loop;
 * the preview can move only at 30Hz. 'clear' clears pending intent on pointerup;
 * 'carry' preserves the target after release. Neither is selected for gameplay.
 *
 * Config is a local diagnostic fixture, NOT a server-authorized battle config.
 */
export function runCloudTouchUxParityProbe(run) {
  const { limitX, limitZ } = validate(run);
  const { legacyInset, ...cloudConfig } = run.config;
  let preview = openCloudInputIntent(cloudConfig);
  let legacyX = toWorld(run.config.startX);
  let legacyZ = toWorld(run.config.startZ);
  let pressed = false, at = 0, gapTotal = 0, maxGap = 0;
  let previewPreviousX = preview.positionX;
  let previewPreviousZ = preview.positionZ;
  let postReleaseDistance = 0, activeTicks = 0, movingTicks = 0;
  const samples = [];

  for (let tick = 0; tick < run.ticks; tick++) {
    let releases = 0;
    while (at < run.events.length && run.events[at].tick === tick) {
      const evt = run.events[at++];
      if (evt.type === 'down') pressed = true;
      if (evt.type === 'drag') {
        const delta = worldDragDelta(evt.deltaX, evt.deltaY,
          run.config.canvasWidth, run.config.canvasHeight, run.config.halfHeight,
          run.config.aspect, run.config.speedMultiplier);
        legacyX = clamp(legacyX + delta.x, -limitX, limitX);
        legacyZ = clamp(legacyZ + delta.z, -limitZ, limitZ);
        preview = addCloudPointerDelta(preview, {deltaX: evt.deltaX, deltaY: evt.deltaY});
      }
      if (evt.type === 'up') {
        pressed = false;
        releases++;
        if (run.releasePolicy === 'clear') preview = clearCloudPointerTarget(preview);
      }
    }
    if (pressed) activeTicks++;
    const result = sampleCloudInputTick(preview);
    preview = result.state;
    if (result.frame.x !== 0 || result.frame.z !== 0) movingTicks++;
    const travelled = Math.hypot(preview.positionX - previewPreviousX,
      preview.positionZ - previewPreviousZ) / CLOUD_INTENT_WORLD_SCALE;
    if (!pressed) postReleaseDistance += travelled;
    previewPreviousX = preview.positionX;
    previewPreviousZ = preview.positionZ;
    const previewWorldX = toWorld(preview.positionX);
    const previewWorldZ = toWorld(preview.positionZ);
    const gap = Math.hypot(legacyX - previewWorldX, legacyZ - previewWorldZ);
    gapTotal += gap;
    maxGap = Math.max(maxGap, gap);
    samples.push(Object.freeze({
      tick, active: pressed, releases, frame: result.frame,
      legacyX: rounded(legacyX), legacyZ: rounded(legacyZ),
      previewX: rounded(previewWorldX), previewZ: rounded(previewWorldZ),
      gapWorld: rounded(gap),
    }));
  }
  return Object.freeze({
    version: UX_PROBE_VERSION,
    tickHz: CLOUD_INTENT_TICK_HZ,
    releasePolicy: run.releasePolicy,
    ticks: run.ticks,
    eventCount: run.events.length,
    metrics: Object.freeze({
      peakGapWorld: rounded(maxGap),
      meanGapWorld: rounded(gapTotal / run.ticks),
      finalGapWorld: rounded(samples[samples.length - 1].gapWorld),
      postReleaseTravelWorld: rounded(postReleaseDistance),
      activeTicks, movingTicks,
    }),
    samples: Object.freeze(samples),
  });
}
