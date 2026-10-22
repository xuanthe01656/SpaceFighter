/**
 * SpaceFighter V8B-2B1: headless, experimental mobile touch-intent sampler.
 *
 * This is NOT connected to the current Campaign/Dungeon controller or to any
 * HTTP/Firebase path. It provides a candidate 30Hz movement policy for future
 * Cloud battles without changing Guest mode's immediate pointer-drag behavior.
 *
 * World units in this module are integers scaled by 1000, matching the V8B-2A
 * core. Input frames contain only {x,z}; never report HP, kills or victory.
 * A sampled frame is not proof of genuine human input, nor of battle victory.
 */
import { worldDragDelta } from './ShipInputController.js';

export const CLOUD_INTENT_VERSION = 'cloud-touch-intent-v8b2b1';
export const CLOUD_INTENT_TICK_HZ = 30;
export const CLOUD_INTENT_WORLD_SCALE = 1000;
export const CLOUD_INTENT_INPUT_MAX = 127;
const MAX_TICKS = CLOUD_INTENT_TICK_HZ * 30 * 60;
const OPEN_KEYS = Object.freeze([
  'arenaHalfHeight', 'arenaHalfWidth', 'aspect', 'canvasHeight', 'canvasWidth',
  'halfHeight', 'hitRadius', 'movePerTick', 'speedMultiplier', 'startX', 'startZ',
]);
const VIEW_KEYS = Object.freeze(['aspect', 'canvasHeight', 'canvasWidth', 'halfHeight', 'speedMultiplier']);
const DRAG_KEYS = Object.freeze(['deltaX', 'deltaY']);
const states = new WeakSet();

export class CloudInputIntentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CloudInputIntentError';
    this.code = code;
  }
}
const fail = (code, message) => { throw new CloudInputIntentError(code, message); };
const plain = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null);
const exact = (obj, keys) => plain(obj) && Object.keys(obj).length === keys.length
  && keys.every(key => Object.hasOwn(obj, key));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const int = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function checkViewport(value) {
  if (!exact(value, VIEW_KEYS)
    || !finite(value.aspect) || value.aspect < 0.1 || value.aspect > 10
    || !finite(value.canvasWidth) || value.canvasWidth < 1 || value.canvasWidth > 20000
    || !finite(value.canvasHeight) || value.canvasHeight < 1 || value.canvasHeight > 20000
    || !finite(value.halfHeight) || value.halfHeight < 1 || value.halfHeight > 50
    || !finite(value.speedMultiplier) || value.speedMultiplier < 0 || value.speedMultiplier > 5) {
    fail('CLOUD_INTENT_VIEWPORT_INVALID', 'Invalid camera/viewport configuration');
  }
}
function seal(state) {
  const result = Object.freeze(state);
  states.add(result);
  return result;
}
function checkState(state) {
  if (!plain(state) || !states.has(state)) {
    fail('CLOUD_INTENT_STATE_INVALID', 'Sampler state must originate from this runtime');
  }
}
function limits(state) {
  return {
    minX: -state.arenaHalfWidth + state.hitRadius,
    maxX: state.arenaHalfWidth - state.hitRadius,
    minZ: -state.arenaHalfHeight + state.hitRadius,
    maxZ: state.arenaHalfHeight - state.hitRadius,
  };
}

/**
 * All movement limits and speed are provisional copies of a FUTURE trusted
 * server snapshot. Client-supplied values can never authorize rewards.
 */
export function openCloudInputIntent(config) {
  if (!exact(config, OPEN_KEYS)
    || !int(config.arenaHalfWidth, 2000, 50000)
    || !int(config.arenaHalfHeight, 2000, 50000)
    || !int(config.hitRadius, 100, 2500)
    || config.hitRadius >= config.arenaHalfWidth
    || config.hitRadius >= config.arenaHalfHeight
    || !int(config.movePerTick, 1, 3000)
    || !int(config.startX, -config.arenaHalfWidth + config.hitRadius,
      config.arenaHalfWidth - config.hitRadius)
    || !int(config.startZ, -config.arenaHalfHeight + config.hitRadius,
      config.arenaHalfHeight - config.hitRadius)) {
    fail('CLOUD_INTENT_CONFIG_INVALID', 'Invalid candidate server-owned movement snapshot');
  }
  checkViewport({
    aspect:config.aspect, canvasHeight:config.canvasHeight,
    canvasWidth:config.canvasWidth, halfHeight:config.halfHeight,
    speedMultiplier:config.speedMultiplier,
  });
  return seal({
    version:CLOUD_INTENT_VERSION, tick:0, suspended:false,
    arenaHalfWidth:config.arenaHalfWidth, arenaHalfHeight:config.arenaHalfHeight,
    hitRadius:config.hitRadius, movePerTick:config.movePerTick,
    positionX:config.startX, positionZ:config.startZ,
    targetX:config.startX, targetZ:config.startZ,
    aspect:config.aspect, canvasWidth:config.canvasWidth, canvasHeight:config.canvasHeight,
    halfHeight:config.halfHeight, speedMultiplier:config.speedMultiplier,
  });
}

/**
 * Pointermove affects a TARGET, not the actual simulated ship. An arbitrary
 * pointer jump cannot bypass the server's per-tick velocity limit.
 * The old Guest drag handler is deliberately untouched.
 */
export function addCloudPointerDelta(state, delta) {
  checkState(state);
  if (state.suspended) fail('CLOUD_INTENT_SUSPENDED', 'A suspended match must be re-admitted');
  if (!exact(delta, DRAG_KEYS)
    || !finite(delta.deltaX) || !finite(delta.deltaY)
    || Math.abs(delta.deltaX) > 20000 || Math.abs(delta.deltaY) > 20000) {
    fail('CLOUD_INTENT_DRAG_INVALID', 'Invalid CSS-pixel pointer movement');
  }
  const world = worldDragDelta(delta.deltaX, delta.deltaY,
    state.canvasWidth, state.canvasHeight, state.halfHeight,
    state.aspect, state.speedMultiplier);
  const {minX,maxX,minZ,maxZ} = limits(state);
  return seal({
    ...state,
    targetX:clamp(state.targetX + world.x * CLOUD_INTENT_WORLD_SCALE, minX, maxX),
    targetZ:clamp(state.targetZ + world.z * CLOUD_INTENT_WORLD_SCALE, minZ, maxZ),
  });
}

/**
 * One call per future trusted 30Hz tick. The predicted movement uses exactly
 * the same integer rounding and axis limits as combatCoreV8.advanceOne.
 * Networking and app clocks MUST be rate-checked on the server journal.
 */
export function sampleCloudInputTick(state) {
  checkState(state);
  if (state.suspended) fail('CLOUD_INTENT_SUSPENDED', 'Cannot advance a suspended input sampler');
  if (state.tick >= MAX_TICKS) fail('CLOUD_INTENT_TICK_LIMIT', 'Input sampler tick limit reached');

  const dx=state.targetX-state.positionX;
  const dz=state.targetZ-state.positionZ;
  const distance=Math.hypot(dx,dz);
  // The smallest representable 30Hz movement may be several milliworld units.
  // Suppress sub-quantum jitter instead of oscillating around the pointer.
  const deadZone=state.movePerTick / (2 * CLOUD_INTENT_INPUT_MAX);
  let x=0,z=0;
  if (distance>deadZone) {
    const fraction=Math.min(1,state.movePerTick/distance);
    x=clamp(Math.round(-dx*fraction*CLOUD_INTENT_INPUT_MAX/state.movePerTick),-127,127);
    z=clamp(Math.round(dz*fraction*CLOUD_INTENT_INPUT_MAX/state.movePerTick),-127,127);
    if (x*x+z*z>128*128) {
      const factor=127/Math.hypot(x,z);
      x=Math.round(x*factor);
      z=Math.round(z*factor);
    }
  }
  const {minX,maxX,minZ,maxZ}=limits(state);
  // V8B2A pilot.x -= round(frame.x * movePerTick / 127)
  //       pilot.z += round(frame.z * movePerTick / 127)
  // Negative half-ties are significant: mirror Math.round rather than truncation.
  const positionX=clamp(state.positionX-Math.round(x*state.movePerTick/127),minX,maxX);
  const positionZ=clamp(state.positionZ+Math.round(z*state.movePerTick/127),minZ,maxZ);
  const frame=Object.freeze({x,z});
  return Object.freeze({frame, state:seal({...state, tick:state.tick+1,positionX,positionZ})});
}

/**
 * Optional pointer-release policy: cancel the queued target at the current
 * predicted position. This avoids residual travel after a finger is lifted,
 * but a very quick flick may be lost before the next 30Hz tick. A future
 * mobile UX test must decide when this policy is appropriate.
 */
export function clearCloudPointerTarget(state) {
  checkState(state);
  if (state.suspended) fail('CLOUD_INTENT_SUSPENDED', 'Cannot clear suspended input');
  return seal({...state,targetX:state.positionX,targetZ:state.positionZ});
}

/**
 * Screen rotation changes the CSS projection only. Discard an old touch target
 * to avoid a discontinuity; arena dimensions remain server-owned and cannot
 * change without a newly admitted match.
 */
export function reconfigureCloudViewport(state, viewport) {
  checkState(state);
  if (state.suspended) fail('CLOUD_INTENT_SUSPENDED', 'Cannot reconfigure suspended input');
  checkViewport(viewport);
  return seal({
    ...state, ...viewport,
    targetX:state.positionX, targetZ:state.positionZ,
  });
}

/**
 * Focus loss/backgrounding cannot authorize a local pause/resume of server
 * combat. The caller must abandon or obtain a NEW server-authorized session.
 */
export function suspendCloudInputIntent(state) {
  checkState(state);
  return seal({...state,suspended:true,targetX:state.positionX,targetZ:state.positionZ});
}
