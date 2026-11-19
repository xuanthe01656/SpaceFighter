'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {
  VERSION, ALLOWED_DUNGEONS, parseC15DungeonFoundationV1Config,
  createDungeonContractV1, inspectDungeonJournalV1,
  inspectUntrustedDungeonEventsV1, createC15DungeonFoundationV1,
} = require('../lib/c15DungeonFoundationV1.cjs');

const DEMO = 'demo-spacefighter-dungeon-c15qa';
const UID = 'dungeon-emulator-qa';
const SID = 'f3c33ac2-89b6-462c-84c2-c91c8fb11253';
const WEDNESDAY = Date.UTC(2026, 10, 18, 12, 0, 0);
const env = Object.freeze({
  GAME_C15_DUNGEON_V1_ENABLED: 'true',
  GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED: 'true',
  GAME_C15_DUNGEON_V1_ALLOW_UIDS: UID,
  GOOGLE_CLOUD_PROJECT: DEMO,
  GCLOUD_PROJECT: DEMO,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:38081',
});

class MemoryFirestore {
  constructor() {
    this.app = {options: {projectId: DEMO}};
    this.data = new Map();
    this.pending = Promise.resolve();
  }
  collection(name) { return this.path(name); }
  path(pathName) {
    const db = this;
    return {
      doc(id) { return db.doc(`${pathName}/${id}`); },
    };
  }
  doc(pathName) {
    const db = this;
    return {
      path: pathName,
      collection(name) { return db.path(`${pathName}/${name}`); },
      async get() { return db.snap(pathName); },
    };
  }
  snap(key) {
    const exists = this.data.has(key);
    return {exists, data: () => exists ? structuredClone(this.data.get(key)) : undefined};
  }
  put(key, value) { this.data.set(key, structuredClone(value)); }
  async runTransaction(fn) {
    const task = this.pending.then(async () => {
      const writes = [];
      const tx = {
        get: async ref => this.snap(ref.path),
        set: (ref, value) => writes.push(['set', ref.path, value]),
        create: (ref, value) => writes.push(['create', ref.path, value]),
      };
      const result = await fn(tx);
      for (const [kind, key] of writes) if (kind === 'create' && this.data.has(key))
        throw new Error('CREATE_ALREADY_EXISTS');
      for (const [, key, value] of writes) this.put(key, value);
      return result;
    });
    this.pending = task.catch(() => {});
    return task;
  }
}

async function catalog() {
  const listing = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/constants.js')).href);
  const content = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/game/dungeon/DungeonContentCatalogV393.js')).href);
  return {listings: listing.DUNGEON_CONFIG,
    content: content.DUNGEON_CONTENT_CATALOG_V393,
    hazards: content.DUNGEON_HAZARD_PROFILES_V393,
    objectives: content.DUNGEON_OBJECTIVE_PROFILES_V393};
}
async function fixture({energy = 30, now = WEDNESDAY, account = {}, config = env} = {}) {
  const db = new MemoryFirestore();
  db.put(`users/${UID}`, {sessionId: SID, wallet: {coins: 1000, diamonds: 500, energy},
    campaignData: {materials: {blueprints: 6}}, ...account});
  let time = now;
  const svc = await createC15DungeonFoundationV1({db, env: config, now: () => time, newId: randomUUID});
  return {svc, db, advance(ms) { time += ms; },
    wallet() { return db.snap(`users/${UID}`).data().wallet; },
    operations() { return [...db.data.keys()].filter(k => k.startsWith(`users/${UID}/operations/`)); }};
}
function denial(code) { return error => error?.code === code; }

test('V1 defaults OFF and refuses malformed production/non-emulator config', async () => {
  assert.equal(parseC15DungeonFoundationV1Config({}), null);
  const off = await createC15DungeonFoundationV1({});
  assert.equal(off.enabled, false);
  assert.throws(() => off.admitEmulator(), denial('C15_DUNGEON_V1_DISABLED'));
  for (const override of [
    {FIRESTORE_EMULATOR_HOST: undefined},
    {FIRESTORE_EMULATOR_HOST: '10.0.0.1:8080'},
    {GOOGLE_CLOUD_PROJECT: 'distributed-inn-482605-c6'},
    {FIREBASE_PROJECT_ID: 'distributed-inn-482605-c6'},
    {GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED: 'false'},
    {GAME_C15_DUNGEON_V1_ALLOW_UIDS: `${UID},${UID}`},
  ]) {
    assert.throws(() => parseC15DungeonFoundationV1Config({...env, ...override}), TypeError);
  }
});

test('Three real Dungeon contracts bind catalog, hazards, objectives and Boss', async () => {
  const data = await catalog();
  assert.deepEqual(ALLOWED_DUNGEONS, ['dung_taurus', 'dung_nereus', 'dung_abaddon']);
  for (const id of ALLOWED_DUNGEONS) {
    const contract = createDungeonContractV1(id, data);
    assert.equal(contract.dungeonId, id);
    assert.equal(contract.rooms[0].id, data.content[id].runStructure.entryRoomId);
    assert.equal(contract.rooms.at(-1).id, data.content[id].runStructure.bossRoomId);
    assert.ok(contract.rooms.some(room => room.hazard));
    assert.ok(contract.rooms.some(room => room.objective?.nodes.length >= 3));
    assert.ok(contract.rooms.at(-1).boss.id);
    assert.match(contract.contractDigest, /^[a-f0-9]{64}$/);
    assert.equal(contract.safeForSettlement, false);
    assert.equal(contract.cloudRewards, false);
    assert.deepEqual(contract, createDungeonContractV1(id, data));
  }
  assert.throws(() => createDungeonContractV1('dung_not_approved', data),
    denial('C15_DUNGEON_UNKNOWN'));
});

test('C15 input journal is schema-validated and hash bound, never replay verified', () => {
  const battleId = randomUUID();
  const chunks = [{protocol: 'pve-input-v1', battleId, startTick: 0,
    frames: [{x: 0, z: 0}, {x: 10, z: -2}]}];
  const result = inspectDungeonJournalV1({battleId, chunks});
  assert.equal(result.inputSyntaxValid, true);
  assert.equal(result.independentReplayVerified, false);
  assert.equal(result.safeForSettlement, false);
  assert.equal(result.ticks, 2);
  assert.match(result.journalRootDigest, /^[0-9a-f]{64}$/);
  assert.throws(() => inspectDungeonJournalV1({battleId,
    chunks: [{...chunks[0], victory: true}]}));
  assert.throws(() => inspectDungeonJournalV1({battleId,
    chunks: [{...chunks[0], startTick: 1}]}), denial('C15_DUNGEON_JOURNAL_SEQUENCE'));
  assert.throws(() => inspectDungeonJournalV1({battleId, chunks: [{...chunks[0],
    frames: [{x: 999, z: 0}]}]}));
});

test('Dungeon telemetry validates identifiers but cannot prove kills, crates or Boss', async () => {
  const policy = createDungeonContractV1('dung_taurus', await catalog());
  const evidence = [
    {kind: 'hazard_contact', roomId: 'taurus_ambush', refId: 'taurus_scrap_lanes', tick: 42},
    {kind: 'objective_destroyed', roomId: 'taurus_salvage', refId: 'taurus_salvage_core', tick: 70},
    {kind: 'boss_defeated', roomId: 'taurus_boss', refId: 'taurus_rust_driller', tick: 3018},
  ];
  const result = inspectUntrustedDungeonEventsV1(policy, evidence);
  assert.equal(result.eventsChecked, 3);
  assert.equal(result.independentReplayVerified, false);
  assert.equal(result.rewardEntitlement, false);
  assert.throws(() => inspectUntrustedDungeonEventsV1(policy, [{...evidence[0], refId: 'unknown'}]),
    denial('C15_DUNGEON_EVENTS_INVALID'));
  assert.throws(() => inspectUntrustedDungeonEventsV1(policy, [{...evidence[0],
    kind: 'crate_collected', refId: 'claim_free_crate'}]), denial('C15_DUNGEON_CRATE_PROVENANCE_REQUIRED'));
  assert.throws(() => inspectUntrustedDungeonEventsV1(policy, [{...evidence[2], roomId: 'taurus_ambush'}]),
    denial('C15_DUNGEON_EVENTS_INVALID'));
  assert.throws(() => inspectUntrustedDungeonEventsV1(policy, [evidence[2], evidence[0]]),
    denial('C15_DUNGEON_EVENTS_INVALID'));
});

test('Emulator QA admission debits exactly one energy cost; 20 duplicate requests no double debit', async () => {
  const f = await fixture();
  const body = {dungeonId: 'dung_taurus', requestId: 'dungeon_entry_idempotent_001'};
  const preview = await f.svc.preview(UID, SID, body.dungeonId);
  assert.equal(preview.dungeon.energyCost, 10);
  const calls = await Promise.all(Array.from({length: 20}, () => f.svc.admitEmulator(UID, SID, body)));
  assert.equal(calls.filter(c => !c.duplicate).length, 1);
  assert.equal(calls.filter(c => c.duplicate).length, 19);
  assert.equal(f.wallet().energy, 20);
  assert.equal(f.wallet().coins, 1000);
  assert.equal(f.wallet().diamonds, 500);
  assert.equal(f.operations().length, 1);
  assert.equal(new Set(calls.map(c => c.admission.battleId)).size, 1);
  assert.equal(calls[0].admission.rewardSettlementEnabled, false);
  assert.equal(calls[0].admission.independentReplayVerified, false);
  await assert.rejects(f.svc.admitEmulator(UID, SID, {...body, dungeonId: 'dung_nereus'}),
    denial('REQUEST_REUSED'));
  await assert.rejects(f.svc.admitEmulator(UID, SID,
    {dungeonId: 'dung_taurus', requestId: 'another_dungeon_entry_002'}),
    denial('C15_DUNGEON_ACTIVE'));
});

test('Admission rejects insufficient energy, non-open UTC days and auth/session confusion', async () => {
  const f = await fixture({energy: 2});
  const body = {dungeonId: 'dung_taurus', requestId: 'dungeon_insufficient_001'};
  await assert.rejects(f.svc.admitEmulator(UID, SID, body), denial('INSUFFICIENT_FUNDS'));
  assert.equal(f.wallet().energy, 2);
  assert.equal(f.operations().length, 0);
  await assert.rejects(f.svc.admitEmulator('not_allowlisted', SID, body), denial('C15_DUNGEON_NOT_ALLOWED'));
  await assert.rejects(f.svc.admitEmulator(UID, randomUUID(), body), denial('SESSION_EXPIRED'));
  await assert.rejects(f.svc.admitEmulator(UID, SID, {...body, rewards: [{type:'coins',amount:99999}]}),
    denial('C15_DUNGEON_INPUT_INVALID'));
  const closed = await fixture({now: WEDNESDAY});
  await assert.rejects(closed.svc.admitEmulator(UID, SID,
    {dungeonId: 'dung_nereus', requestId: 'dungeon_closed_daily_001'}),
    denial('DUNGEON_CLOSED'));
  assert.equal(closed.wallet().energy, 30);
});

test('Spent request ID cannot be reused, expired active admission cannot mint rewards', async () => {
  const f = await fixture({energy: 50});
  const body = {dungeonId:'dung_taurus',requestId:'dungeon_reused_request_001'};
  await f.svc.admitEmulator(UID, SID, body);
  await assert.rejects(f.svc.admitEmulator(UID, SID, {...body,dungeonId:'dung_nereus'}),
    denial('REQUEST_REUSED'));
  const before = {...f.wallet()};
  assert.throws(() => f.svc.claim(UID, SID, {
    dungeonId:'dung_taurus', battleId:randomUUID(), victory:true,
    rewards:[{type:'diamonds',amount:500}] }), denial('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.deepEqual(f.wallet(), before);
  f.advance(21*60*1000);
  const result = await f.svc.admitEmulator(UID, SID,
    {dungeonId:'dung_taurus',requestId:'dungeon_new_request_002'});
  assert.equal(result.duplicate, false);
  assert.equal(f.wallet().energy, 30);
  assert.equal(f.operations().length, 2);
});

test('Pending account deletion fails closed without wallet changes', async () => {
  const f = await fixture({account:{accountDeletion:{status:'pending'}}});
  await assert.rejects(f.svc.admitEmulator(UID, SID,
    {dungeonId: 'dung_taurus', requestId:'dungeon_delete_pending_001'}),
    denial('ACCOUNT_DELETION_PENDING'));
  assert.equal(f.wallet().energy, 30);
  assert.equal(f.operations().length, 0);
});

test('20 distinct concurrent entry requests allow only one energy debit and ledger operation', async () => {
  const f = await fixture({energy: 10});
  const result = await Promise.allSettled(Array.from({length: 20}, (_, i) =>
    f.svc.admitEmulator(UID, SID, {
      dungeonId: 'dung_taurus',
      requestId: `dungeon_distinct_concurrent_${String(i).padStart(3, '0')}`,
    })));
  assert.equal(result.filter(x => x.status === 'fulfilled').length, 1);
  assert.ok(result.filter(x => x.status === 'rejected')
    .every(x => x.reason?.code === 'C15_DUNGEON_ACTIVE'));
  assert.equal(f.wallet().energy, 0);
  assert.equal(f.operations().length, 1);
});
