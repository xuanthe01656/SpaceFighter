'use strict';
/**
 * Dungeon C15 V2B.1: a READ-ONLY emulator-only seed / touch formula probe.
 * No server.js routes, Firestore calls, production feature or reward authority.
 *
 * V2A intentionally uses a digest seed and quantized 30Hz directions, whereas
 * DungeonScene uses FNV-based seed and immediate pointermove deltas. This probe
 * makes those differences explicit without treating client movement as proof.
 */
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {GameError} = require('./economy.cjs');
const {parseC15DungeonReplayV2AConfig} = require('./c15DungeonReplayV2A.cjs');

const VERSION = 'c15-dungeon-seed-touch-probe-v2b1';
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const fail = (code, text, http = 423) => { throw new GameError(code, text, http); };
const exact = (x, keys) => x && typeof x === 'object' && !Array.isArray(x) &&
  Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x,k));

function parseC15DungeonSeedTouchV2B1Config(env = {}) {
  if (!env || typeof env !== 'object' || Array.isArray(env))
    throw new TypeError('V2B.1 QA environment required');
  if (env.GAME_C15_DUNGEON_V2B1_ENABLED !== 'true') return null;
  if (env.GAME_C15_DUNGEON_V2B1_QA_APPROVED !== 'true')
    throw new TypeError('V2B.1 local QA approval required');
  const v2a = parseC15DungeonReplayV2AConfig(env);
  if (!v2a) throw new TypeError('V2B.1 requires approved V2A Emulator');
  return freeze({version:VERSION, emulatorOnly:true, projectId:v2a.projectId,
    allowedUids:[...v2a.allowUids]});
}

function disabled() {
  const off = () => fail('C15_DUNGEON_V2B1_DISABLED', 'Dungeon V2B.1 local probe OFF');
  const locked = () => fail('C15_DUNGEON_SERVER_REPLAY_REQUIRED', 'No authoritative Dungeon win');
  return freeze({enabled:false, productionEnabled:false, emulatorOnly:true,
    independentReplayVerified:false, rewardSettlementEnabled:false,
    assessSceneSeed:off, projectPointerSamples:off, finalize:locked, claim:locked});
}

async function createC15DungeonSeedTouchProbeV2B1({env={}, replayService}={}) {
  const config = parseC15DungeonSeedTouchV2B1Config(env);
  if (!config) return disabled();
  if (!replayService || replayService.enabled !== true ||
      replayService.emulatorOnly !== true ||
      typeof replayService.inspect !== 'function')
    throw new TypeError('Approved and running V2A QA replay service required');
  const [shared, encounter] = await Promise.all([
    import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonSeedTouchContractV2B1.js')).href),
    import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonEncounterDirectorV38.js')).href),
  ]);
  function inspected(replayState) {
    // V2A has an instance-local WeakSet: copied or forged replay states fail.
    const report = replayService.inspect(replayState);
    if (report.dungeonId !== 'dung_taurus' || report.roomId !== 'taurus_entry' ||
        report.independentReplayVerified !== false || report.safeForSettlement !== false ||
        replayState.dungeonId !== report.dungeonId || replayState.battleId !== report.battleId ||
        !config.allowedUids.includes(replayState.uid))
      fail('C15_DUNGEON_V2B1_REPLAY_UNTRUSTED', 'V2A QA replay state required', 400);
    return report;
  }
  function assessSceneSeed({replayState, serverProfileId, sceneRunKeySource}={}) {
    const report = inspected(replayState);
    if (sceneRunKeySource !== 'server-issued-battle-id' ||
        typeof serverProfileId !== 'string' || !/^[\w.-]{1,128}$/.test(serverProfileId))
      fail('C15_DUNGEON_V2B1_PROFILE_UNTRUSTED',
        'Profile ID must come from a server-read profile snapshot and a server battle ID', 400);
    // This is the candidate that the CURRENT scene would compute only if its
    // campaignData.profileId matches the server snapshot and activeBattleId is
    // the server battleId (no Dungeon QA seedKey override). NOT yet wired.
    const sceneSeed = shared.dungeonSceneEntrySeedV2B1({
      dungeonId: report.dungeonId, profileId: serverProfileId,
      runKey: report.battleId,
    });
    const plan = encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId: report.dungeonId, roomIndex: 0, seed: sceneSeed,
    });
    const candidate = plan.entries.map(row => ({
      id:row.id, roleId:row.roleId, laneNorm:row.laneNorm,
      tick:Math.max(1,Math.ceil(row.spawnAtMs*30/1000)),
    }));
    const preview = replayState.spawnPlan.map(row => ({
      id:row.id, roleId:row.roleId, laneNorm:row.laneNorm, tick:row.tick,
    }));
    const seedMatchesPreview = sceneSeed === replayState.seed;
    const spawnPlanMatchesPreview = JSON.stringify(candidate) === JSON.stringify(preview);
    return freeze({version:VERSION, battleId:report.battleId,
      dungeonId:report.dungeonId, roomId:report.roomId,
      candidateSceneSeed:sceneSeed, v2aPreviewSeed:replayState.seed,
      seedMatchesPreview, spawnPlanMatchesPreview,
      candidateSpawnCount:candidate.length, v2aSpawnCount:preview.length,
      seedFormulaSharedWithClient:true,
      runtimeSceneProfileAndRunKeyVerified:false,
      inputJournalEquivalent:false, touchRuntimeParityVerified:false,
      independentReplayVerified:false, safeForSettlement:false,
      rewardSettlementEnabled:false, cloudRewards:false});
  }
  function projectPointerSamples({replayState, viewport, deltas}={}) {
    const report = inspected(replayState);
    // Must use the exact reviewed Dungeon camera, and the scene's initial ship
    // position. Browser CSS rect and renderer aspect may legitimately differ.
    if (!exact(viewport, ['canvasWidth','canvasHeight','aspect','halfHeight','inset','pointerSpeedMultiplier']))
      fail('C15_DUNGEON_V2B1_VIEWPORT_INVALID', 'Strict Dungeon viewport required', 400);
    const projected = shared.projectDungeonTouchSamplesV2B1({
      initialPosition:{x:0,z:shared.DUNGEON_LIVE_CAMERA_HALF_HEIGHT_V2B1-2.5},
      viewport,deltas,
    });
    return freeze({version:VERSION, battleId:report.battleId,
      viewportProjection:'current-DungeonScene-pointermove-math',
      positions:projected.positions, finalPosition:projected.finalPosition,
      candidateFormulaParity:true,
      touchEventsTrusted:false, touchRuntimeParityVerified:false,
      inputJournalEquivalent:false, independentReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  }
  const locked = () => fail('C15_DUNGEON_SERVER_REPLAY_REQUIRED', 'Dungeon gameplay verification missing');
  return freeze({enabled:true, emulatorOnly:true, productionEnabled:false,
    independentReplayVerified:false, rewardSettlementEnabled:false,
    assessSceneSeed, projectPointerSamples, finalize:locked, claim:locked});
}
module.exports = freeze({VERSION,parseC15DungeonSeedTouchV2B1Config,
  createC15DungeonSeedTouchProbeV2B1});
