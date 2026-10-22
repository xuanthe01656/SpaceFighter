'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROTOCOL_VERSION, TICK_HZ, MAX_CHUNK_FRAMES, MAX_BATTLE_TICKS, MAX_LAG_TICKS,
  openInputJournal, validateChunk, ingestInputChunk,
} = require('../lib/combatInputJournalV8.cjs');

const ticket = 'd9a0ed13-ff8f-4478-9ed2-e8fed65e94a2';
const session = 'd2b2f0a0-1992-4a90-8d53-d0be4bff0324';
const now = Date.parse('2026-10-22T01:00:00Z');
const context = Object.freeze({
  uid: 'player_v8b1', sessionId: session, battleId: ticket,
  rulesVersion: 'combat-v1.0.0', loadoutHash: 'a'.repeat(64), issuedAtMs: now,
});
const chunk = (startTick, frames = [{x:0,z:0}]) => ({
  protocol: PROTOCOL_VERSION, battleId: ticket, startTick, frames,
});
const rejects = (fn, code) => assert.throws(fn, e => e?.code === code);

// Source is deliberately an isolated server-only contract: no GameService,
// Firestore, HTTP, client source or battle-result authority is imported.
test('V8B-1: versioned 30Hz protocol stays within 30-minute legacy ticket bound', () => {
  assert.equal(PROTOCOL_VERSION, 'pve-input-v1');
  assert.equal(TICK_HZ, 30);
  assert.equal(MAX_CHUNK_FRAMES, 60);
  assert.equal(MAX_BATTLE_TICKS, 54000);
  assert.equal(MAX_LAG_TICKS, 300);
});

test('V8B-1: server-owned context is validated and journal is immutable', () => {
  const j = openInputJournal(context);
  assert.equal(j.uid, context.uid);
  assert.equal(j.nextTick, 0);
  assert.equal(j.rulesVersion, context.rulesVersion);
  assert.match(j.digest, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(j));
  rejects(() => openInputJournal({...context, loadoutHash: 'client-string'}), 'INPUT_JOURNAL_INVALID_CONTEXT');
  rejects(() => openInputJournal({...context, issuedAtMs: '2026'}), 'INPUT_JOURNAL_INVALID_CONTEXT');
});

test('V8B-1: two consecutive chunks create reproducible server anchored hashes', () => {
  const first = Array.from({length:30},(_,i)=>({x:i%2?90:0,z:i%2?90:127}));
  const second = Array.from({length:60},()=>({x:-127,z:0}));
  const a1 = ingestInputChunk(openInputJournal(context),chunk(0,first),now+1000);
  const a2 = ingestInputChunk(a1.journal,chunk(30,second),now+3100);
  const b1 = ingestInputChunk(openInputJournal(context),chunk(0,first),now+1000);
  const b2 = ingestInputChunk(b1.journal,chunk(30,second),now+3100);
  assert.equal(a1.journal.nextTick,30);
  assert.equal(a2.journal.nextTick,90);
  assert.equal(a2.journal.digest,b2.journal.digest);
  assert.notEqual(a1.journal.digest,a2.journal.digest);
  assert.ok(Object.isFrozen(a2.journal));
});

test('V8B-1: direct victory, HP, kill, reward and star injection is forbidden', () => {
  for (const forged of [
    {victory:true},{stars:3},{kills:999},{hp:999999},
    {rewards:[{type:'coins',amount:100000}]},{damage:999999},
    {uid:'another_player'},{receivedAtMs:now+100000},
  ]) {
    rejects(() => validateChunk({...chunk(0),...forged}), 'INPUT_CHUNK_INVALID');
    rejects(() => validateChunk({...chunk(0,[{x:0,z:0,...forged}])}), 'INPUT_FRAME_INVALID');
  }
});

test('V8B-1: wrong ticket or protocol is denied', () => {
  const j = openInputJournal(context);
  rejects(()=>ingestInputChunk(j,{...chunk(0),battleId:session},now+1000),'INPUT_WRONG_BATTLE');
  rejects(()=>ingestInputChunk(j,{...chunk(0),protocol:'pve-input-v2'},now+1000),'INPUT_CHUNK_INVALID');
});

test('V8B-1: skipped, reordered, overlapping or old frames cannot advance journal', () => {
  const j = ingestInputChunk(openInputJournal(context),chunk(0),now+1000).journal;
  for(const start of [2,3,99]) {
    rejects(()=>ingestInputChunk(j,chunk(start),now+2000),'INPUT_SEQUENCE_INVALID');
  }
  assert.equal(j.nextTick,1);
});

test('V8B-1: exact previous retry is no-op; changed retry cannot forge result', () => {
  const frames = Array.from({length:3},()=>({x:0,z:0}));
  const j = ingestInputChunk(openInputJournal(context),chunk(0,frames),now+1000).journal;
  const duplicate = ingestInputChunk(j,chunk(0,frames),now+2000);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.acceptedFrames,0);
  assert.strictEqual(duplicate.journal,j);
  rejects(()=>ingestInputChunk(j,chunk(0,[{x:1,z:0},{x:0,z:0},{x:0,z:0}]),now+2000),'INPUT_SEQUENCE_INVALID');
});

test('V8B-1: rejects oversized, empty, fractional, overspeed and inherited input', () => {
  for(const frames of [[],Array.from({length:61},()=>({x:0,z:0}))]) {
    rejects(()=>validateChunk(chunk(0,frames)),'INPUT_CHUNK_INVALID');
  }
  for(const frame of [{x:1.2,z:0},{x:128,z:0},{x:100,z:100},{x:0,z:-128},{x:NaN,z:0}]) {
    rejects(()=>validateChunk(chunk(0,[frame])),'INPUT_FRAME_INVALID');
  }
  rejects(()=>validateChunk(chunk(0,[Object.create({x:0,z:0})])),'INPUT_FRAME_INVALID');
  rejects(()=>validateChunk({...chunk(0),startTick:-1}),'INPUT_CHUNK_INVALID');
  rejects(()=>validateChunk({...chunk(MAX_BATTLE_TICKS),frames:[{x:0,z:0}]}),'INPUT_CHUNK_INVALID');
});

test('V8B-1: server time forbids fast-forward regardless of client claims', () => {
  const j = openInputJournal(context);
  rejects(()=>ingestInputChunk(j,chunk(0,Array.from({length:60},()=>({x:0,z:0}))),now+100),'INPUT_FAST_FORWARD');
  assert.equal(j.nextTick,0);
});

test('V8B-1: large retrospective batches are not accepted as live gameplay', () => {
  const j = openInputJournal(context);
  rejects(()=>ingestInputChunk(j,chunk(0),now+20000),'INPUT_TOO_LATE');
  const tolerated = ingestInputChunk(j,chunk(0),now+6000);
  assert.equal(tolerated.journal.nextTick,1);
});

test('V8B-1: non-monotonic server clock is forbidden', () => {
  const j=ingestInputChunk(openInputJournal(context),chunk(0),now+1000).journal;
  rejects(()=>ingestInputChunk(j,chunk(1),now+999),'INPUT_SERVER_TIME_INVALID');
  rejects(()=>ingestInputChunk(j,chunk(1),now-1),'INPUT_SERVER_TIME_INVALID');
});

test('V8B-1: rejects inputs after the original 30-minute server ticket window', () => {
  rejects(()=>ingestInputChunk(openInputJournal(context),chunk(0),now+1800001),'INPUT_BATTLE_EXPIRED');
});

test('V8B-1: invalid stored journal cannot be advanced', () => {
  const j=openInputJournal(context);
  for(const corrupt of [
    {...j, digest:'0'.repeat(63)}, {...j,nextTick:-1},
    {...j, issuedAtMs:'client'}, {...j,lastReceivedAtMs:now-1},
  ]) rejects(()=>ingestInputChunk(corrupt,chunk(0),now+1000),'INPUT_JOURNAL_INVALID_STATE');
});

test('V8B-1: no combat decision, economy grant, or Firebase integration is exported', () => {
  const exported = require('../lib/combatInputJournalV8.cjs');
  const forbidden = [
    'finishBattle','verifyVictory','grantReward','settleBattle',
    'processBatch','deleteUser','firestore','firebase',
  ];
  forbidden.forEach(name=>assert.equal(Object.hasOwn(exported,name),false));
});
