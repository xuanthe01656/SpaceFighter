/**
 * V2C.14-B QA-only one-file bundle of the original V2C.11 trace and accepted
 * controller input observations. Local checksum is NOT provenance, ticket,
 * authenticity or a server replay claim. No uploads or server writes.
 */
import { checksumDungeonV2C11 } from './DungeonApkCombatTraceV2C11.js';
import { DUNGEON_INPUT_JOURNAL_V2C14B_VERSION } from './DungeonApkInputJournalV2C14B.js';

export const DUNGEON_APK_INPUT_BUNDLE_V2C14B_VERSION = 'c15-dungeon-apk-input-bundle-v2c14b';
const TRACE_KEYS = Object.freeze([
  'version','source','dungeonId','roomId','sceneSeed','seedSource','tickBasis',
  'frames','events','finished','truncated','error','safeForSettlement',
  'rewardSettlementEnabled','cloudRewards','liveApkParityVerified','checksum',
]);
const JOURNAL_KEYS = Object.freeze([
  'version','source','sceneSeed','seedSource','tickBasis','pointerEvents',
  'frameMarkers','gestureCount','completedGestures','pointerActive',
  'pointerOverflow','frameOverflow','captureError','finished',
  'keyboardInputCovered','skillInputCovered','serverTicketVerified',
  'serverReadLoadoutVerified','independentReplayVerified','fullTickJournalVerified',
  'safeForSettlement','rewardSettlementEnabled','cloudRewards',
]);
const exact = (obj, keys) => obj !== null && typeof obj === 'object' &&
  !Array.isArray(obj) && Object.keys(obj).length === keys.length &&
  keys.every(k => Object.hasOwn(obj,k));

export function prepareDungeonApkInputBundleJsonV2C14B(trace, journal, date = new Date()) {
  if (!exact(trace, TRACE_KEYS) || !exact(journal, JOURNAL_KEYS) ||
      trace.version !== 'c15-dungeon-apk-trace-v2c11' ||
      trace.source !== 'qa-babylon-observer-untrusted' ||
      trace.dungeonId !== 'dung_taurus' || trace.roomId !== 'taurus_entry' ||
      journal.version !== DUNGEON_INPUT_JOURNAL_V2C14B_VERSION ||
      journal.source !== 'accepted-ship-input-controller-untrusted' ||
      journal.sceneSeed !== trace.sceneSeed || journal.seedSource !== trace.seedSource ||
      journal.tickBasis !== 'dom-event-time-plus-babylon-variable-frame-NOT-server-fixed' ||
      !Array.isArray(trace.frames) || !Array.isArray(journal.pointerEvents) ||
      !Array.isArray(journal.frameMarkers) ||
      !Number.isSafeInteger(journal.gestureCount) || journal.gestureCount < 0 ||
      journal.keyboardInputCovered !== false || journal.skillInputCovered !== false ||
      journal.serverTicketVerified !== false || journal.serverReadLoadoutVerified !== false ||
      journal.independentReplayVerified !== false || journal.fullTickJournalVerified !== false ||
      ![trace, journal].every(x => x.safeForSettlement === false &&
        x.rewardSettlementEnabled === false && x.cloudRewards === false) ||
      trace.liveApkParityVerified !== false ||
      !(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('INVALID_OR_NON_QA_V2C14B_BUNDLE');
  }
  // Snapshot both at the same user gesture; never rewrite V2C.11's checksum.
  // Validate the complete nested evidence offline in the server audit.
  const payload = {
    version: DUNGEON_APK_INPUT_BUNDLE_V2C14B_VERSION,
    source: 'qa-local-apk-input-bundle-untrusted',
    dungeonId: 'dung_taurus', roomId: 'taurus_entry',
    qaOnly: true, trace, inputJournal: journal,
    safeForSettlement: false, rewardSettlementEnabled: false,
    cloudRewards: false, liveApkParityVerified: false,
    serverReportLinked: false,
    checksumAlgorithm: 'fnv1a32-accidental-corruption-only',
  };
  const bundle = {...payload, checksum: checksumDungeonV2C11(JSON.stringify(payload))};
  const json = `${JSON.stringify(bundle,null,2)}\n`;
  if (new TextEncoder().encode(json).length > 4 * 1024 * 1024) {
    throw new TypeError('V2C14B_BUNDLE_SIZE_LIMIT');
  }
  const stamp = date.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
  return Object.freeze({
    fileName: `dungeon_taurus_v2c14b_${stamp}.json`,json,
    frameCount: trace.frames.length,
    eventCount: journal.pointerEvents.length,
    isCompleteShortTrace: trace.frames.length > 0 && !trace.truncated &&
      trace.error === null && !journal.pointerOverflow && !journal.frameOverflow &&
      journal.captureError === null && journal.pointerEvents.length >= 3 &&
      journal.completedGestures > 0 && !journal.pointerActive &&
      journal.frameMarkers.length === trace.frames.length,
    evidenceStatus: 'CLIENT_ACCEPTED_INPUT_UNTRUSTED_UNPAIRED',
  });
}
