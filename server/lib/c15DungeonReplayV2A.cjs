'use strict';
/**
 * C15 Dungeon V2A: deterministic, NON-ECONOMIC, offline QA projection of
 * Taurus entry inputs and the existing DungeonEncounterDirectorV38 spawn plan.
 *
 * IMPORTANT: this does not simulate the actual Dungeon touch controller,
 * collisions, enemy AI, shooting, HP, crates, objectives, bosses or room clear.
 * It is NOT an independent combat verifier and MUST NOT unlock settlement.
 * No HTTP routes, Firebase client or persistence are introduced by this file.
 * Only server-owned admission objects may be passed by the embedding QA harness.
 */
const {createHash} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {GameError} = require('./economy.cjs');
const {openInputJournal, validateChunk, ingestInputChunk, TICK_HZ} = require('./combatInputJournalV8.cjs');
const {VERSION: ADMISSION_VERSION, createDungeonContractV1,
  parseC15DungeonFoundationV1Config} = require('./c15DungeonFoundationV1.cjs');

const VERSION = 'c15-dungeon-replay-v2a';
const RULES_VERSION = 'dungeon-taurus-entry-v2a';
const DUNGEON_ID = 'dung_taurus';
const ROOM_ID = 'taurus_entry';
const MAX_PREVIEW_TICKS = 4500;
const MOVE_PER_TICK_UNITS = 64; // QA-only projection; NOT Babylon touch speed.
const BOUND_X_UNITS = 6800;
const BOUND_Z_UNITS = 11000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const ADMISSION_KEYS = [
  'version', 'uid', 'sessionId', 'battleId', 'dungeonId', 'requestId',
  'requestDigest', 'contractDigest', 'energyCharged', 'admittedAtMs',
  'expiresAtMs', 'status', 'qaOnly', 'source', 'independentReplayVerified',
  'rewardSettlementEnabled', 'cloudRewards',
];
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const exact = (x, keys) => record(x) && Object.keys(x).length === keys.length &&
  keys.every(k => Object.hasOwn(x, k));
const integer = (x, a, b) => Number.isSafeInteger(x) && x >= a && x <= b;
const canonical = x => Array.isArray(x) ? x.map(canonical) : record(x) ?
  Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const digest = (tag, value) => createHash('sha256')
  .update(JSON.stringify([tag, canonical(value)])).digest('hex');
const deny = (code, message, status = 423) => { throw new GameError(code, message, status); };
const freeze = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const value of Object.values(x)) freeze(value);
    Object.freeze(x);
  }
  return x;
};
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const locked = () => deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Dungeon combat parity, authoritative outcome and settlement remain unavailable');

function parseC15DungeonReplayV2AConfig(env = {}) {
  if (!env || typeof env !== 'object' || Array.isArray(env))
    throw new TypeError('Dungeon V2A environment object required');
  if (env.GAME_C15_DUNGEON_V2A_ENABLED !== 'true') return null;
  if (env.GAME_C15_DUNGEON_V2A_QA_APPROVED !== 'true')
    throw new TypeError('Dungeon V2A local QA approval is required');
  const v1 = parseC15DungeonFoundationV1Config(env);
  if (!v1) throw new TypeError('Dungeon V2A requires approved V1 Emulator config');
  return freeze({version: VERSION, projectId: v1.projectId,
    emulatorHost: v1.emulatorHost, allowUids: [...v1.allowUids]});
}

function disabledService() {
  const off = () => deny('C15_DUNGEON_V2A_DISABLED', 'Dungeon V2A is default OFF');
  return freeze({enabled: false, emulatorOnly: true, productionEnabled: false,
    independentReplayVerified: false, rewardSettlementEnabled: false,
    openFromStoredAdmission: off, applyChunk: off, inspect: off,
    finalize: locked, claim: locked});
}

async function createC15DungeonReplayV2A({env = {}, now = Date.now,
  listingModule, contentModule, encounterModule} = {}) {
  const config = parseC15DungeonReplayV2AConfig(env);
  if (!config) return disabledService();
  if (typeof now !== 'function') throw new TypeError('Server QA clock required');
  const [listing, content, encounter] = await Promise.all([
    listingModule || import(pathToFileURL(path.resolve(__dirname, '../../client/src/constants.js')).href),
    contentModule || import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonContentCatalogV393.js')).href),
    encounterModule || import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonEncounterDirectorV38.js')).href),
  ]);
  if (typeof encounter.buildDungeonRoomSpawnPlanV38 !== 'function')
    throw new TypeError('Reviewed Dungeon encounter director missing');
  const contract = createDungeonContractV1(DUNGEON_ID, {
    listings: listing.DUNGEON_CONFIG,
    content: content.DUNGEON_CONTENT_CATALOG_V393,
    hazards: content.DUNGEON_HAZARD_PROFILES_V393,
    objectives: content.DUNGEON_OBJECTIVE_PROFILES_V393,
  });
  if (contract.rooms[0]?.id !== ROOM_ID || contract.rooms[0]?.kind !== 'clear' ||
    contract.rooms[0]?.boss || contract.rooms[0]?.hazard || contract.rooms[0]?.objective)
    throw new TypeError('Taurus entry policy changed; V2A requires review');
  const approved = new Set(config.allowUids);
  const issuedStates = new WeakSet();
  const makeState = fields => {
    const state = freeze(fields);
    issuedStates.add(state);
    return state;
  };
  const requireIssued = state => {
    if (!record(state) || !issuedStates.has(state))
      deny('C15_DUNGEON_V2A_STATE_UNTRUSTED', 'Replay state not issued by this QA service');
  };
  const clock = () => {
    const value = now();
    if (!integer(value, 1, Number.MAX_SAFE_INTEGER)) throw new TypeError('Invalid QA server clock');
    return value;
  };
  function openFromStoredAdmission(admission, {loadoutHash, expectedUid,
    expectedSessionId, expectedBattleId} = {}) {
    // Embedding code must read the admission from server-owned Firestore Emulator.
    // This local-only constructor is not an HTTP authentication boundary.
    const at = clock();
    if (!exact(admission, ADMISSION_KEYS) ||
      admission.uid !== expectedUid || admission.sessionId !== expectedSessionId ||
      admission.battleId !== expectedBattleId ||
      admission.version !== ADMISSION_VERSION || admission.dungeonId !== DUNGEON_ID ||
      !approved.has(admission.uid) || !UUID.test(admission.sessionId || '') ||
      !UUID.test(admission.battleId || '') || !REQUEST.test(admission.requestId || '') ||
      !HASH.test(admission.requestDigest || '') ||
      admission.contractDigest !== contract.contractDigest ||
      admission.energyCharged !== contract.energyCost ||
      admission.status !== 'admitted-emulator' || admission.qaOnly !== true ||
      admission.source !== 'firestore-emulator' ||
      admission.independentReplayVerified !== false ||
      admission.rewardSettlementEnabled !== false || admission.cloudRewards !== false ||
      !integer(admission.admittedAtMs, 1, at) ||
      !integer(admission.expiresAtMs, at, at + 20 * 60 * 1000) ||
      !HASH.test(loadoutHash || ''))
      deny('C15_DUNGEON_V2A_ADMISSION_INVALID', 'Stored Emulator admission and reviewed loadout required', 400);
    // This seed is explicitly NOT the live DungeonScene stableSeed contract.
    // V2B must align client and server seed/origin before claiming parity.
    const seedDigest = digest('sf-c15-dungeon-v2a-seed',
      {uid: admission.uid, sessionId: admission.sessionId, battleId: admission.battleId,
        contractDigest: contract.contractDigest});
    const seed = parseInt(seedDigest.slice(0, 8), 16) || 1;
    const roomPlan = encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId: DUNGEON_ID, roomIndex: 0, seed,
    });
    if (roomPlan?.room?.id !== ROOM_ID || roomPlan?.dungeonId !== DUNGEON_ID ||
      roomPlan?.roomIndex !== 0 || !Array.isArray(roomPlan?.entries) ||
      roomPlan.entries.length < 1 || roomPlan.entries.length > 40)
      throw new TypeError('Dungeon director returned an unreviewed entry plan');
    const ids = new Set();
    let lastTick = 0;
    const spawnPlan = roomPlan.entries.map((entry, index) => {
      const tick = Math.max(1, Math.ceil(entry.spawnAtMs * TICK_HZ / 1000));
      if (entry.id !== `${DUNGEON_ID}:${ROOM_ID}:enemy:${index}` ||
        ids.has(entry.id) || !integer(tick, lastTick, MAX_PREVIEW_TICKS) ||
        typeof entry.roleId !== 'string' || entry.roleId.length < 1 ||
        !Number.isFinite(entry.laneNorm) || Math.abs(entry.laneNorm) > 1 ||
        !integer(entry.threatCost, 1, 100))
        throw new TypeError('Dungeon entry spawn sequence changed');
      ids.add(entry.id);
      lastTick = tick;
      return {id: entry.id, roleId: entry.roleId, laneNorm: entry.laneNorm,
        threatCost: entry.threatCost, tick};
    });
    const planDigest = digest('sf-c15-dungeon-v2a-spawn-plan',
      {seed, contractDigest: contract.contractDigest, spawnPlan});
    const originDigest = digest('sf-c15-dungeon-v2a-origin',
      {uid: admission.uid, sessionId: admission.sessionId, battleId: admission.battleId,
        requestDigest: admission.requestDigest, contractDigest: contract.contractDigest,
        planDigest, loadoutHash, rulesVersion: RULES_VERSION});
    const journal = openInputJournal({uid: admission.uid,
      sessionId: admission.sessionId, battleId: admission.battleId,
      rulesVersion: RULES_VERSION, loadoutHash, issuedAtMs: admission.admittedAtMs});
    return makeState({version: VERSION, dungeonId: DUNGEON_ID, roomId: ROOM_ID,
      battleId: admission.battleId, uid: admission.uid, sessionId: admission.sessionId,
      originDigest, contractDigest: contract.contractDigest, seed,
      planDigest, spawnPlan, journal, tick: 0, spawnCursor: 0,
      xUnits: 0, zUnits: 0,
      traceDigest: digest('sf-c15-dungeon-v2a-trace-initial', {originDigest}),
      inputSyntaxValid: true, deterministicPreview: true,
      independentReplayVerified: false, safeForSettlement: false,
      rewardSettlementEnabled: false, cloudRewards: false});
  }
  function applyChunk(state, chunk, receivedAtMs) {
    requireIssued(state);
    if (!integer(receivedAtMs, 1, Number.MAX_SAFE_INTEGER) || receivedAtMs !== clock())
      deny('C15_DUNGEON_V2A_TIME_UNTRUSTED', 'Caller must use current server QA clock', 400);
    const validated = validateChunk(chunk);
    const sameLastChunk = validated.startTick === state.journal.lastChunkStart &&
      validated.endTick === state.tick &&
      validated.chunkDigest === state.journal.lastChunkDigest;
    if (validated.battleId !== state.battleId ||
      (!sameLastChunk && validated.startTick !== state.tick) ||
      validated.endTick > MAX_PREVIEW_TICKS)
      deny('C15_DUNGEON_V2A_SEQUENCE', 'Dungeon preview input sequence invalid', 409);
    const result = ingestInputChunk(state.journal, chunk, receivedAtMs);
    if (result.duplicate) return freeze({state, duplicate: true, spawned: []});
    let xUnits = state.xUnits;
    let zUnits = state.zUnits;
    let traceDigest = state.traceDigest;
    let cursor = state.spawnCursor;
    const spawned = [];
    for (let index = 0; index < validated.frames.length; index++) {
      const [x, z] = validated.frames[index];
      const tick = state.tick + index + 1;
      xUnits = clamp(xUnits + Math.trunc(x * MOVE_PER_TICK_UNITS / 127),
        -BOUND_X_UNITS, BOUND_X_UNITS);
      zUnits = clamp(zUnits + Math.trunc(z * MOVE_PER_TICK_UNITS / 127),
        -BOUND_Z_UNITS, BOUND_Z_UNITS);
      const emitted = [];
      while (cursor < state.spawnPlan.length && state.spawnPlan[cursor].tick <= tick) {
        emitted.push(state.spawnPlan[cursor].id);
        spawned.push(state.spawnPlan[cursor]);
        cursor++;
      }
      traceDigest = digest('sf-c15-dungeon-v2a-preview-step',
        {traceDigest, tick, x, z, xUnits, zUnits, emitted});
    }
    const next = makeState({...state, journal: result.journal, tick: validated.endTick,
      spawnCursor: cursor, xUnits, zUnits, traceDigest});
    return freeze({state: next, duplicate: false, spawned});
  }
  function inspect(state) {
    requireIssued(state);
    return freeze({version: VERSION, dungeonId: DUNGEON_ID, roomId: ROOM_ID,
      battleId: state.battleId, tick: state.tick,
      positionPreview: {xUnits: state.xUnits, zUnits: state.zUnits},
      scheduledEnemySpawns: state.spawnCursor,
      totalScheduledEnemySpawns: state.spawnPlan.length,
      traceDigest: state.traceDigest, inputJournalDigest: state.journal.digest,
      originDigest: state.originDigest, planDigest: state.planDigest,
      scope: ['c15-input-schema', 'server-clock-check', 'taurus-entry-spawn-plan',
        'fixed-point-movement-projection'],
      combatHitsVerified: false, enemyDeathsVerified: false,
      clientTouchParityVerified: false, spawnTimingParityVerified: false,
      bossVerified: false, crateProvenanceVerified: false,
      roomClearVerified: false, independentReplayVerified: false,
      safeForSettlement: false, rewardSettlementEnabled: false,
      cloudRewards: false});
  }
  return freeze({enabled: true, emulatorOnly: true, productionEnabled: false,
    independentReplayVerified: false, rewardSettlementEnabled: false,
    openFromStoredAdmission, applyChunk, inspect, finalize: locked, claim: locked});
}

module.exports = freeze({VERSION, RULES_VERSION, DUNGEON_ID, ROOM_ID,
  parseC15DungeonReplayV2AConfig, createC15DungeonReplayV2A});
