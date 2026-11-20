/**
 * Dungeon C15 V2B.1: shared seed and direct-touch MATH for local parity QA.
 *
 * This is not an input recorder or a combat verifier. In particular, the live
 * Dungeon pointer controller applies drag deltas immediately, whereas the
 * C15 pve-input-v1 journal contains only 30 Hz quantized {x,z} directions.
 * No function in this module can attest to a human gesture or award rewards.
 */
import { worldDragDelta } from '../combat/ShipInputController.js';

export const DUNGEON_SEED_TOUCH_V2B1_VERSION = 'dungeon-c15-seed-touch-v2b1';
export const DUNGEON_LIVE_CAMERA_HALF_HEIGHT_V2B1 = 15;
export const DUNGEON_LIVE_INPUT_INSET_V2B1 = 1.8;
export const DUNGEON_LIVE_TOUCH_SPEED_V2B1 = 1;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const number = n => typeof n === 'number' && Number.isFinite(n);
const record = n => n !== null && typeof n === 'object' && !Array.isArray(n) &&
  (Object.getPrototypeOf(n) === Object.prototype || Object.getPrototypeOf(n) === null);
const exact = (r, keys) => record(r) && Object.keys(r).length === keys.length &&
  keys.every(key => Object.hasOwn(r, key));

/** Exact FNV-1a seed formerly private to DungeonScene.js: same join('|'), UTF-16
 * code units, Math.imul, unsigned wrap and zero fallback; no new hash scheme. */
export function dungeonSceneStableSeedV2B1(...parts) {
  let hash = 2166136261;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

/** The scene currently calls stableSeed(dungeonId, profileId||'guest',
 * qaRun.seedKey||activeBattleId||'local'). The server must obtain these fields
 * from its OWN session and profile; a client-supplied profileId is not proof. */
export function dungeonSceneEntrySeedV2B1({dungeonId, profileId, runKey} = {}) {
  if (dungeonId !== 'dung_taurus' || typeof profileId !== 'string' ||
      profileId.length < 1 || profileId.length > 128 ||
      typeof runKey !== 'string' || runKey.length < 1 || runKey.length > 128)
    throw new TypeError('Unreviewed Dungeon scene seed inputs');
  return dungeonSceneStableSeedV2B1(dungeonId, profileId, runKey);
}

/**
 * Stateless counterpart of the production ShipInputController pointermove:
 * - CSS-pixel deltas, renderer aspect, orthographic halfHeight;
 * - -X to screen-right and +Z to screen-down;
 * - immediate movement plus the same playerRoot clamp.
 * It is explicitly NOT the 30Hz C15 sampler or server velocity policy.
 */
export function projectDungeonDirectTouchV2B1({position, viewport, delta} = {}) {
  if (!exact(position, ['x', 'z']) || !number(position.x) || !number(position.z) ||
      !exact(viewport, ['canvasWidth', 'canvasHeight', 'aspect', 'halfHeight', 'inset', 'pointerSpeedMultiplier']) ||
      !number(viewport.canvasWidth) || viewport.canvasWidth < 1 || viewport.canvasWidth > 20000 ||
      !number(viewport.canvasHeight) || viewport.canvasHeight < 1 || viewport.canvasHeight > 20000 ||
      !number(viewport.aspect) || viewport.aspect < .1 || viewport.aspect > 10 ||
      viewport.halfHeight !== DUNGEON_LIVE_CAMERA_HALF_HEIGHT_V2B1 ||
      viewport.inset !== DUNGEON_LIVE_INPUT_INSET_V2B1 ||
      viewport.pointerSpeedMultiplier !== DUNGEON_LIVE_TOUCH_SPEED_V2B1 ||
      !exact(delta, ['deltaX', 'deltaY']) || !number(delta.deltaX) ||
      !number(delta.deltaY) || Math.abs(delta.deltaX) > 20000 || Math.abs(delta.deltaY) > 20000)
    throw new TypeError('Invalid local Dungeon touch parity sample');
  const maxX = Math.max(0, viewport.halfHeight * viewport.aspect - viewport.inset);
  const maxZ = Math.max(0, viewport.halfHeight - viewport.inset);
  if (Math.abs(position.x) > maxX || Math.abs(position.z) > maxZ)
    throw new TypeError('Initial playerRoot position outside reviewed bounds');
  const motion = worldDragDelta(delta.deltaX, delta.deltaY,
    viewport.canvasWidth, viewport.canvasHeight, viewport.halfHeight,
    viewport.aspect, viewport.pointerSpeedMultiplier);
  return Object.freeze({
    x: clamp(position.x + motion.x, -maxX, maxX),
    z: clamp(position.z + motion.z, -maxZ, maxZ),
  });
}

export function projectDungeonTouchSamplesV2B1({initialPosition, viewport, deltas} = {}) {
  if (!Array.isArray(deltas) || deltas.length < 1 || deltas.length > 256)
    throw new TypeError('Local Dungeon touch sample count invalid');
  let position = initialPosition;
  const positions = [];
  for (const delta of deltas) {
    position = projectDungeonDirectTouchV2B1({position, viewport, delta});
    positions.push(position);
  }
  return Object.freeze({version: DUNGEON_SEED_TOUCH_V2B1_VERSION,
    positions: Object.freeze(positions), finalPosition: position,
    projectionUsesLivePointerFormula: true,
    inputJournalEquivalent: false, clientRuntimeTelemetryVerified: false,
    independentReplayVerified: false, safeForSettlement: false,
    rewardSettlementEnabled: false, cloudRewards: false});
}
