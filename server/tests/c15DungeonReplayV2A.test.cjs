'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {
  VERSION, RULES_VERSION, DUNGEON_ID, ROOM_ID,
  parseC15DungeonReplayV2AConfig, createC15DungeonReplayV2A,
} = require('../lib/c15DungeonReplayV2A.cjs');
const {VERSION: V1_VERSION} = require('../lib/c15DungeonFoundationV1.cjs');
const {openInputJournal, validateChunk} = require('../lib/combatInputJournalV8.cjs');

const SID = 'a4b5aaed-8cde-4a58-82dd-774fa8a22901';
const BID = 'ca62f851-9fad-4ceb-8d0c-6d24d6f22d00';
const UID = 'dungeon-v2a-qa-uid';
const ISSUED = Date.UTC(2026, 10, 19, 10, 0, 0);
const HASH = 'a'.repeat(64);
const env = Object.freeze({
  GAME_C15_DUNGEON_V1_ENABLED: 'true',
  GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED: 'true',
  GAME_C15_DUNGEON_V1_ALLOW_UIDS: UID,
  GAME_C15_DUNGEON_V2A_ENABLED: 'true',
  GAME_C15_DUNGEON_V2A_QA_APPROVED: 'true',
  GOOGLE_CLOUD_PROJECT: 'demo-spacefighter-dungeon-v2a',
  GCLOUD_PROJECT: 'demo-spacefighter-dungeon-v2a',
  FIREBASE_PROJECT_ID: 'demo-spacefighter-dungeon-v2a',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:38081',
});
const qaAdmission = contractDigest => ({
  version: V1_VERSION, uid: UID, sessionId: SID, battleId: BID,
  dungeonId: DUNGEON_ID, requestId: 'dungeon_v2a_entry_request_001',
  requestDigest: 'd'.repeat(64), contractDigest, energyCharged: 10,
  admittedAtMs: ISSUED, expiresAtMs: ISSUED + 20 * 60 * 1000,
  status: 'admitted-emulator', qaOnly: true,
  source: 'firestore-emulator', independentReplayVerified: false,
  rewardSettlementEnabled: false, cloudRewards: false,
});
async function make() {
  let time = ISSUED + 10;
  const service = await createC15DungeonReplayV2A({env, now: () => time});
  const listing = await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/constants.js')).href);
  const content = await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonContentCatalogV393.js')).href);
  const {createDungeonContractV1} = require('../lib/c15DungeonFoundationV1.cjs');
  const contract = createDungeonContractV1(DUNGEON_ID, {
    listings: listing.DUNGEON_CONFIG,
    content: content.DUNGEON_CONTENT_CATALOG_V393,
    hazards: content.DUNGEON_HAZARD_PROFILES_V393,
    objectives: content.DUNGEON_OBJECTIVE_PROFILES_V393,
  });
  const admission = qaAdmission(contract.contractDigest);
  return {service, admission, open: () => service.openFromStoredAdmission(admission, {loadoutHash: HASH,
      expectedUid: UID, expectedSessionId: SID, expectedBattleId: BID}),
    setTime: n => {time = n;}, now: () => time};
}
const frame = (x=0,z=0) => ({x,z});
const chunk = (startTick, frames, battleId=BID) => ({
  protocol: 'pve-input-v1', battleId, startTick, frames,
});
const err = code => error => error?.code === code;

test('V2A is default OFF, with settlement always locked', async () => {
  assert.equal(parseC15DungeonReplayV2AConfig({}), null);
  const disabled = await createC15DungeonReplayV2A({});
  assert.equal(disabled.enabled, false);
  assert.throws(() => disabled.openFromStoredAdmission({}), err('C15_DUNGEON_V2A_DISABLED'));
  assert.throws(() => disabled.claim(), err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(() => disabled.finalize(), err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});

test('V2A rejects real projects, remote Emulator and absent V1/QA approval', () => {
  for (const override of [
    {GOOGLE_CLOUD_PROJECT: 'distributed-inn-482605-c6'},
    {GCLOUD_PROJECT: 'another-project'},
    {FIRESTORE_EMULATOR_HOST: '10.0.0.1:8080'},
    {GAME_C15_DUNGEON_V1_ENABLED: 'false'},
    {GAME_C15_DUNGEON_V2A_QA_APPROVED: 'false'},
    {GAME_C15_DUNGEON_V1_ALLOW_UIDS: ''},
  ]) {
    assert.throws(() => parseC15DungeonReplayV2AConfig({...env, ...override}), TypeError);
  }
  assert.equal(parseC15DungeonReplayV2AConfig({...env,
    GAME_C15_DUNGEON_V2A_ENABLED: 'false'}), null);
});

test('V2A pins Taurus entry, shared C15 rules and server-selected spawn plan', async () => {
  const {service, open} = await make();
  const state = open();
  assert.equal(service.enabled, true);
  assert.equal(service.emulatorOnly, true);
  assert.equal(state.version, VERSION);
  assert.equal(state.roomId, ROOM_ID);
  assert.equal(state.journal.rulesVersion, RULES_VERSION);
  assert.equal(state.tick, 0);
  assert.equal(state.spawnCursor, 0);
  assert.equal(state.journal.nextTick, 0);
  assert.ok(state.spawnPlan.length > 0);
  assert.match(state.planDigest, /^[a-f0-9]{64}$/);
  const director = await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonEncounterDirectorV38.js')).href);
  const actual = director.buildDungeonRoomSpawnPlanV38({
    dungeonId: DUNGEON_ID, roomIndex: 0, seed: state.seed,
  });
  assert.deepEqual(state.spawnPlan.map(x => x.id), actual.entries.map(x => x.id));
  assert.deepEqual(state.spawnPlan.map(x => x.roleId), actual.entries.map(x => x.roleId));
  for (let i = 0; i < state.spawnPlan.length; i++) {
    assert.equal(state.spawnPlan[i].tick, Math.max(1,
      Math.ceil(actual.entries[i].spawnAtMs * 30 / 1000)));
  }
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.spawnPlan));
});

test('V2A refuses claimed Dungeon victory, boss, crate or additional admission fields', async () => {
  const f = await make();
  for (const patch of [
    {dungeonId: 'dung_nereus'},
    {rewardSettlementEnabled: true},
    {independentReplayVerified: true},
    {source: 'cloud-run'},
    {qaOnly: false},
    {sessionId: 'c4b5aaed-8cde-4a58-82dd-774fa8a22901'},
    {contractDigest: 'f'.repeat(64)},
    {energyCharged: 0},
    {victory: true},
    {rewards: [{type:'diamonds', amount:9000}]},
  ]) {
    assert.throws(() => f.service.openFromStoredAdmission(
      {...f.admission, ...patch}, {loadoutHash: HASH, expectedUid: UID,
      expectedSessionId: SID, expectedBattleId: BID}),
    err('C15_DUNGEON_V2A_ADMISSION_INVALID'));
  }
  assert.throws(() => f.service.openFromStoredAdmission(f.admission,
    {loadoutHash: 'NOT_VERIFIED', expectedUid: UID, expectedSessionId: SID,
      expectedBattleId: BID}),
    err('C15_DUNGEON_V2A_ADMISSION_INVALID'));
});

test('V2A refuses expired admission even in Emulator QA', async () => {
  const f = await make();
  f.setTime(ISSUED + 21 * 60 * 1000);
  assert.throws(() => f.open(), err('C15_DUNGEON_V2A_ADMISSION_INVALID'));
});

test('C15 input chunk advances deterministic spawn schedule with server-clock gating', async () => {
  const f = await make();
  let state = f.open();
  const frames = Array.from({length: 60}, (_,i) => frame(i%2 ? 127 : -127,0));
  f.setTime(ISSUED + 2100);
  const result = f.service.applyChunk(state, chunk(0,frames), f.now());
  state = result.state;
  assert.equal(result.duplicate, false);
  assert.equal(state.tick, 60);
  assert.equal(state.journal.nextTick, 60);
  assert.ok(result.spawned.length >= 1);
  assert.equal(state.spawnCursor, result.spawned.length);
  assert.ok(result.spawned.every(x => x.tick <= 60));
  assert.equal(state.xUnits, 0);
  assert.equal(state.zUnits, 0);
  assert.equal(f.service.inspect(state).scheduledEnemySpawns, result.spawned.length);
  assert.notEqual(f.service.inspect(state).traceDigest,
    f.service.inspect(f.open()).traceDigest);
});

test('A single 60-frame chunk and two 30-frame chunks have same preview trace', async () => {
  const f1 = await make();
  const f2 = await make();
  const frames = Array.from({length:60}, (_,i)=>frame(i<20?110:-70, i%4===0 ? 15 : -25));
  let a = f1.open();
  let b = f2.open();
  f1.setTime(ISSUED+2100);
  a = f1.service.applyChunk(a,chunk(0,frames),f1.now()).state;
  f2.setTime(ISSUED+1100);
  b = f2.service.applyChunk(b,chunk(0,frames.slice(0,30)),f2.now()).state;
  f2.setTime(ISSUED+2100);
  b = f2.service.applyChunk(b,chunk(30,frames.slice(30)),f2.now()).state;
  assert.equal(a.traceDigest,b.traceDigest);
  assert.equal(a.planDigest,b.planDigest);
  assert.equal(a.xUnits,b.xUnits);
  assert.equal(a.zUnits,b.zUnits);
  assert.equal(a.spawnCursor,b.spawnCursor);
  assert.notEqual(a.journal.digest,b.journal.digest);
});

test('C15 last-chunk replay is a no-op and never spawns a second time', async () => {
  const f = await make();
  const inputs=Array.from({length:60},()=>frame(70,0));
  f.setTime(ISSUED+2100);
  const first=f.service.applyChunk(f.open(),chunk(0,inputs),f.now());
  const again=f.service.applyChunk(first.state,chunk(0,inputs),f.now());
  assert.equal(again.duplicate,true);
  assert.equal(again.state,first.state);
  assert.deepEqual(again.spawned,[]);
  assert.equal(again.state.traceDigest,first.state.traceDigest);
});

test('Changed repeated chunk, reordered input, wrong battle and client-declared rewards fail', async () => {
  const f=await make();
  const inputs=Array.from({length:30},()=>frame(0,-80));
  f.setTime(ISSUED+1100);
  const first=f.service.applyChunk(f.open(),chunk(0,inputs),f.now());
  assert.throws(() => f.service.applyChunk(first.state,chunk(0,[...inputs.slice(0,29),frame(8,0)]),f.now()),
    err('C15_DUNGEON_V2A_SEQUENCE'));
  assert.throws(() => f.service.applyChunk(first.state,chunk(32,inputs),f.now()),
    err('C15_DUNGEON_V2A_SEQUENCE'));
  assert.throws(() => f.service.applyChunk(first.state,chunk(30,inputs,
    'bddcc605-0938-45c3-b889-cd7bbbe27a01'),f.now()),
    err('C15_DUNGEON_V2A_SEQUENCE'));
  assert.throws(() => f.service.applyChunk(first.state,{...chunk(30,inputs),victory:true},f.now()),
    err('INPUT_CHUNK_INVALID'));
  assert.throws(() => f.service.applyChunk(first.state,chunk(30,[frame(200,0)]),f.now()),
    err('INPUT_FRAME_INVALID'));
  assert.ok(validateChunk(chunk(30, inputs)));
});

test('Fast-forward, stale backlog and spoofed server receive-time are rejected', async () => {
  const f=await make();
  const state=f.open();
  f.setTime(ISSUED+100);
  assert.throws(() => f.service.applyChunk(state,
    chunk(0,Array.from({length:60},()=>frame())),f.now()),
    err('INPUT_FAST_FORWARD'));
  assert.throws(() => f.service.applyChunk(state,chunk(0,[frame()]),ISSUED+999999),
    err('C15_DUNGEON_V2A_TIME_UNTRUSTED'));
  f.setTime(ISSUED+30000);
  assert.throws(() => f.service.applyChunk(state,chunk(0,[frame()]),f.now()),
    err('INPUT_TOO_LATE'));
});

test('Out-of-service state, fabricated digests and JSON copies cannot be accepted', async () => {
  const f=await make();
  const other=await make();
  const state=f.open();
  f.setTime(ISSUED+1050);
  assert.throws(() => f.service.applyChunk({...state},chunk(0,[frame()]),f.now()),
    err('C15_DUNGEON_V2A_STATE_UNTRUSTED'));
  assert.throws(() => f.service.inspect(structuredClone(state)),
    err('C15_DUNGEON_V2A_STATE_UNTRUSTED'));
  assert.throws(() => other.service.inspect(state),
    err('C15_DUNGEON_V2A_STATE_UNTRUSTED'));
});

test('No HP, kills, boss, crates, room-clear or settlement authority can be claimed', async () => {
  const f=await make();
  let state=f.open();
  f.setTime(ISSUED+1200);
  state=f.service.applyChunk(state,chunk(0,Array.from({length:30},()=>frame())),f.now()).state;
  const view=f.service.inspect(state);
  assert.equal(view.dungeonId,DUNGEON_ID);
  assert.equal(view.roomId,ROOM_ID);
  for(const key of ['combatHitsVerified','enemyDeathsVerified','clientTouchParityVerified',
    'spawnTimingParityVerified','bossVerified','crateProvenanceVerified',
    'roomClearVerified','independentReplayVerified','safeForSettlement',
    'rewardSettlementEnabled','cloudRewards']) assert.equal(view[key],false,key);
  assert.throws(() => f.service.claim({coins:999999,victory:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(() => f.service.finalize({bossDefeated:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(view.scope.includes('taurus-entry-spawn-plan'),true);
});

test('Existing V1 admission and legacy server are unchanged by V2A module', async () => {
  const f=await make();
  assert.equal(f.service.productionEnabled,false);
  assert.equal(f.service.rewardSettlementEnabled,false);
  assert.equal(typeof f.service.applyChunk,'function');
  const source=require('node:fs').readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.match(source,/C15_DUNGEON_SERVER_REPLAY_REQUIRED/);
  assert.doesNotMatch(source,/c15DungeonReplayV2A/);
  const journal=openInputJournal({uid:UID,sessionId:SID,battleId:BID,
    rulesVersion:RULES_VERSION,loadoutHash:HASH,issuedAtMs:ISSUED});
  assert.equal(journal.protocol,'pve-input-v1');
});
