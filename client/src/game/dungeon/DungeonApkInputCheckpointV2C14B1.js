/**
 * Dungeon C15 V2C.14-B.1 - QA-only, one-shot accepted-input checkpoint.
 * Captures an IMMUTABLE prefix of the actual V2C.11 frame trace and the
 * V2C.14-B accepted-pointer journal, after a real accepted pointerup.
 *
 * This is not a truncated-log repair, fixed tick replay, signed ticket,
 * server authority or reward evidence. Once captured it is never replaced
 * by later corrupted/truncated live buffers. If the live buffers are already
 * invalid, the checkpoint must NOT be created.
 */
import { checksumDungeonV2C11 } from './DungeonApkCombatTraceV2C11.js';
import { prepareDungeonApkInputBundleJsonV2C14B } from './DungeonApkInputBundleV2C14B.js';

export const DUNGEON_INPUT_CHECKPOINT_V2C14B1_VERSION = 'c15-dungeon-apk-input-checkpoint-v2c14b1';
export const DUNGEON_INPUT_CHECKPOINT_V2C14B1_MIN_FRAMES = 120;

function goodPair(trace, input) {
  if (!trace || !input || !Array.isArray(trace.frames) || !Array.isArray(input.frameMarkers) ||
      !Array.isArray(input.pointerEvents) || trace.frames.length < DUNGEON_INPUT_CHECKPOINT_V2C14B1_MIN_FRAMES ||
      trace.frames.length >= 720 || trace.truncated !== false || trace.error !== null ||
      input.pointerOverflow !== false || input.frameOverflow !== false ||
      input.captureError !== null || input.pointerActive !== false ||
      input.gestureCount < 1 || input.completedGestures !== input.gestureCount ||
      input.frameMarkers.length !== trace.frames.length ||
      input.pointerEvents.length < 3 || input.pointerEvents.at(-1)?.kind !== 'up' ||
      !input.pointerEvents.some(event => event.kind === 'move') ||
      trace.sceneSeed !== input.sceneSeed || trace.seedSource !== input.seedSource) return false;

  // Prevent corrupt or mismatched snapshots from becoming a 'ready' checkpoint.
  // The server validator still independently checks the full strict schema.
  const { checksum, ...payload } = trace;
  if (checksum !== checksumDungeonV2C11(JSON.stringify(payload))) return false;
  for (let i = 0; i < trace.frames.length; i++) {
    const frame = trace.frames[i];
    const marker = input.frameMarkers[i];
    if (!marker || marker.frameSeq !== frame.frameSeq ||
        marker.simTick !== frame.simTick ||
        marker.player?.x !== frame.player?.x ||
        marker.player?.z !== frame.player?.z) return false;
  }
  return true;
}

export function createDungeonApkInputCheckpointV2C14B1({ getTrace, getInputJournal } = {}) {
  if (typeof getTrace !== 'function' || typeof getInputJournal !== 'function')
    throw new TypeError('V2C14B1_CHECKPOINT_REQUIRES_QA_RECORDERS');
  let pair = null;
  let pendingAfterPointerUp = false;
  let lastState = 'WAITING_FOR_ACCEPTED_POINTER_UP';

  function tryCapture() {
    if (pair || !pendingAfterPointerUp) return Boolean(pair);
    try {
      // Read both sources synchronously on the same JS task; both recorders
      // generate immutable, cloned snapshots, not references to their buffers.
      const trace = getTrace();
      const inputJournal = getInputJournal();
      if (trace?.frames?.length < DUNGEON_INPUT_CHECKPOINT_V2C14B1_MIN_FRAMES) {
        lastState = 'WAITING_FOR_120_VALID_FRAMES';
        return false;
      }
      if (!goodPair(trace, inputJournal)) {
        lastState = 'LIVE_TRACE_OR_INPUT_INVALID';
        return false;
      }
      const prepared = prepareDungeonApkInputBundleJsonV2C14B(trace, inputJournal);
      if (!prepared.isCompleteShortTrace) {
        lastState = 'BUNDLE_NOT_COMPLETE';
        return false;
      }
      // Freeze the pair, not the live recorders. Subsequent game frames may
      // legitimately hit FRAME_CAP without rewriting this earlier evidence.
      pair = Object.freeze({ trace, inputJournal });
      pendingAfterPointerUp = false;
      lastState = 'LOCAL_QA_CHECKPOINT_READY_UNPAIRED';
      return true;
    } catch (_) {
      lastState = 'CHECKPOINT_CAPTURE_REJECTED';
      return false;
    }
  }

  function onAcceptedPointerUp() {
    if (pair) return true;
    pendingAfterPointerUp = true;
    return tryCapture();
  }
  function afterAcceptedFrameMarker() {
    return tryCapture();
  }
  function snapshotPair() { return pair; }
  return Object.freeze({
    onAcceptedPointerUp, afterAcceptedFrameMarker, snapshotPair,
    get state() { return lastState; },
    get hasCheckpoint() { return Boolean(pair); },
  });
}

export function isDungeonApkInputCheckpointPairV2C14B1(pair) {
  return Boolean(pair && goodPair(pair.trace, pair.inputJournal));
}
