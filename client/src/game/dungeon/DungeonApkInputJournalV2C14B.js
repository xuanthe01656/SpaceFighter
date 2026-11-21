/**
 * Dungeon C15 V2C.14-B: QA ONLY accepted-pointer observations.
 * Records accepted ShipInputController callbacks, not arbitrary synthetic
 * positions. This is NOT a verified 60Hz input journal, device attestation,
 * ticket, authenticated user action or reward / replay proof.
 * No storage, network, profile IDs, ticket secrets, or economics.
 */
export const DUNGEON_INPUT_JOURNAL_V2C14B_VERSION = 'c15-dungeon-apk-accepted-input-v2c14b';
export const DUNGEON_INPUT_JOURNAL_V2C14B_LIMITS = Object.freeze({
  pointerEvents: 256, frameMarkers: 720,
});
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const numeric = x => typeof x === 'number' && Number.isFinite(x);
const within = (x, low, high) => numeric(x) && x >= low && x <= high;
const point = x => plain(x) && within(x.x, -100, 100) && within(x.z, -100, 100);
const finitePoint = x => ({ x: x.x, z: x.z });
const four = x => Math.round(x * 10000) / 10000;
const freeze = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const value of Object.values(x)) freeze(value);
    Object.freeze(x);
  }
  return x;
};

export function createDungeonApkInputJournalV2C14B({ sceneSeed, seedSource } = {}) {
  if (!Number.isSafeInteger(sceneSeed) || sceneSeed <= 0 || sceneSeed > 0xffffffff ||
      !['local-client-seed', 'server-ticket-local-unverified'].includes(seedSource)) {
    throw new TypeError('INVALID_V2C14B_SEED_PROVENANCE');
  }
  const pointerEvents = [];
  const frameMarkers = [];
  let pointerActive = null;
  let lastAtMs = -1;
  let lastSimTick = -1;
  let pointerOverflow = false;
  let frameOverflow = false;
  let captureError = null;
  let finished = false;
  let gestureCount = 0;
  let completedGestures = 0;
  const reject = code => { captureError ||= code; return false; };

  function capturePointer(event) {
    if (finished || captureError || pointerOverflow) return false;
    if (!plain(event) || !['down', 'move', 'up'].includes(event.kind) ||
        !Number.isSafeInteger(event.pointerId) || event.pointerId < 0 ||
        event.pointerId > 2147483647 ||
        !within(event.atMs, 0, Number.MAX_SAFE_INTEGER) ||
        event.atMs < lastAtMs || !point(event.position)) {
      return reject('INVALID_ACCEPTED_POINTER');
    }
    if (pointerEvents.length >= DUNGEON_INPUT_JOURNAL_V2C14B_LIMITS.pointerEvents) {
      pointerOverflow = true;
      return false;
    }
    let row;
    if (event.kind === 'down') {
      if (pointerActive !== null || !within(event.clientX, -20000, 20000) ||
          !within(event.clientY, -20000, 20000)) return reject('INVALID_POINTER_DOWN');
      pointerActive = event.pointerId;
      gestureCount++;
      row = { kind: 'down', pointerId: event.pointerId, atMs: event.atMs,
        clientX: event.clientX, clientY: event.clientY, position: finitePoint(event.position) };
    } else if (event.kind === 'move') {
      if (pointerActive !== event.pointerId ||
          !within(event.clientX, -20000, 20000) ||
          !within(event.clientY, -20000, 20000) ||
          !plain(event.viewport) || !plain(event.delta) ||
          !within(event.delta.deltaX, -20000, 20000) ||
          !within(event.delta.deltaY, -20000, 20000) ||
          !within(event.viewport.canvasWidth, 1, 20000) ||
          !within(event.viewport.canvasHeight, 1, 20000) ||
          !within(event.viewport.aspect, .1, 10) ||
          event.viewport.halfHeight !== 15 || event.viewport.inset !== 1.8 ||
          event.viewport.pointerSpeedMultiplier !== 1) {
        return reject('INVALID_POINTER_MOVE');
      }
      row = { kind: 'move', pointerId: event.pointerId, atMs: event.atMs,
        clientX: event.clientX, clientY: event.clientY,
        position: finitePoint(event.position),
        viewport: { canvasWidth: event.viewport.canvasWidth,
          canvasHeight: event.viewport.canvasHeight, aspect: event.viewport.aspect,
          halfHeight: 15, inset: 1.8, pointerSpeedMultiplier: 1 },
        delta: { deltaX: event.delta.deltaX, deltaY: event.delta.deltaY } };
    } else {
      if (pointerActive !== event.pointerId) return reject('INVALID_POINTER_UP');
      pointerActive = null;
      completedGestures++;
      row = { kind: 'up', pointerId: event.pointerId, atMs: event.atMs,
        position: finitePoint(event.position) };
    }
    pointerEvents.push(freeze(row));
    lastAtMs = event.atMs;
    return true;
  }

  // Snapshots are observations, not server inputs. A successful V2C.11 frame
  // is required first so its frame sequence can be independently cross-checked.
  function captureFrameMarker({ frameSeq, simTick, player } = {}) {
    if (finished || captureError || frameOverflow) return false;
    if (!Number.isSafeInteger(frameSeq) || frameSeq !== frameMarkers.length + 1 ||
        !within(simTick, 0, 1e9) || simTick <= lastSimTick || !point(player)) {
      return reject('INVALID_OBSERVED_FRAME_MARKER');
    }
    if (frameMarkers.length >= DUNGEON_INPUT_JOURNAL_V2C14B_LIMITS.frameMarkers) {
      frameOverflow = true;
      return false;
    }
    frameMarkers.push(freeze({ frameSeq, simTick: four(simTick),
      player: { x: four(player.x), z: four(player.z) } }));
    lastSimTick = simTick;
    return true;
  }
  function snapshot() {
    return freeze({
      version: DUNGEON_INPUT_JOURNAL_V2C14B_VERSION,
      source: 'accepted-ship-input-controller-untrusted',
      sceneSeed, seedSource,
      tickBasis: 'dom-event-time-plus-babylon-variable-frame-NOT-server-fixed',
      pointerEvents: pointerEvents.map(e => structuredClone(e)),
      frameMarkers: frameMarkers.map(e => structuredClone(e)),
      gestureCount, completedGestures, pointerActive: pointerActive !== null,
      pointerOverflow, frameOverflow, captureError, finished,
      keyboardInputCovered: false, skillInputCovered: false,
      serverTicketVerified: false, serverReadLoadoutVerified: false,
      independentReplayVerified: false, fullTickJournalVerified: false,
      safeForSettlement: false, rewardSettlementEnabled: false, cloudRewards: false,
    });
  }
  function finish() { finished = true; return snapshot(); }
  return Object.freeze({ capturePointer, captureFrameMarker, snapshot, finish,
    get pointerCount() { return pointerEvents.length; },
    get markerCount() { return frameMarkers.length; },
  });
}
