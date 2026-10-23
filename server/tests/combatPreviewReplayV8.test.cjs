'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createServerBattleSnapshot} = require('../lib/battleSnapshotV8.cjs');
const {openInputJournal} = require('../lib/combatInputJournalV8.cjs');
const {POLICY_VERSION, previewMainProjectile, advancePreviewMovement} = require('../lib/combatMovementWeaponV8.cjs');
const api = require('../lib/combatPreviewReplayV8.cjs');
const {REPLAY_VERSION, openFoundationPreview, replayFoundationChunk} = api;

let catalog;
test.before(async () => {
  catalog = await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
});
const context = Object.freeze({
  uid:'c2b_qa', sessionId:'e46b066c-ccbf-42c0-bdc2-2f8ffb86c18b',
  battleId:'7b78a47c-63a8-42c2-816b-28af81ed9737',
  issuedAtMs:1782000000000, expiresAtMs:1782000600000,
});
const policy = Object.freeze({
  version:POLICY_VERSION, keyboardUnitsPer60HzFrame:.30,
  pilotHitRadiusUnits:700, projectileHitRadiusUnits:200,
});
const baseGear={ship:'ship_xwing',pilot:'pilot_alpha',gun:'gun_laser',shipLevel:1,gunLevel:1};
function makeCase(opts={}) {
  const gear={...baseGear,...opts};
  const identity={...context,...(opts.identity||{})};
  const profile={campaignData:{
    loadout:{pilot:gear.pilot,aircraft:gear.ship,mainGun:'qa_gun',wingman:'',armor:'',drone:''},
    ownedPilots:{[gear.pilot]:{level:1,stars:1}},
    ownedAircrafts:{[gear.ship]:{level:gear.shipLevel,stars:1}},
    items:{qa_gun:{baseId:gear.gun,level:gear.gunLevel,rarity:1,type:'mainGun'}},
  }};
  const arena=gear.landscape ? {halfWidthUnits:18000,halfHeightUnits:12000,spawnXUnits:0,spawnZUnits:10000}
    : {halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500};
  const snapshot=createServerBattleSnapshot({
    identity, persistedProfile:profile, approvedCatalog:catalog,
    rules:{mode:gear.landscape?'dungeon':'campaign',locationId:'qa_arena',
      rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},arena,seed:123456789,
  });
  const journal=openInputJournal({
    uid:identity.uid, sessionId:identity.sessionId, battleId:identity.battleId,
    rulesVersion:snapshot.context.rulesVersion,loadoutHash:snapshot.loadoutHash,
    issuedAtMs:identity.issuedAtMs,
  });
  return {snapshot, journal, run:opts.deferOpen ? undefined : openFoundationPreview({snapshot,policy,journal})};
}
const frames=(n, fn=i=>({x:0,z:0}))=>Array.from({length:n},(_,i)=>fn(i));
const chunk=(start,part,battleId=context.battleId)=>({
  protocol:'pve-input-v1',battleId,startTick:start,frames:part,
});
function step(run,part,ms,start=run.checkpoint.tick) {
  return replayFoundationChunk({run,chunk:chunk(start,part,run.journal.battleId),receivedAtMs:context.issuedAtMs+ms});
}
const isCode=c=>e=>e?.code===c;

test('V8B-2C2B: opens frozen, server-context-bound preview without victory/settlement authority',()=>{
  const {run,journal,snapshot}=makeCase();
  assert.equal(run.checkpoint.version,REPLAY_VERSION);
  assert.equal(run.checkpoint.previewOnly,true);
  assert.equal(run.checkpoint.safeForCloudBattle,false);
  assert.equal(run.checkpoint.snapshotHash,snapshot.snapshotHash);
  assert.equal(run.checkpoint.journalDigest,journal.digest);
  assert.equal(run.checkpoint.tick,0);
  assert.deepEqual(run.checkpoint.position,run.preview.startPosition);
  assert.equal(run.checkpoint.fireClock.nextShotIndex,0);
  for(const item of [run,run.preview,run.checkpoint,run.checkpoint.position,run.journal]) assert.equal(Object.isFrozen(item),true);
  for(const k of ['victory','stars','winner','rewards','grant','settlement','coins']) assert.equal(Object.hasOwn(run.checkpoint,k),false);
});

test('V8B-2C2B: identical trusted snapshots/chunks/time produce identical checkpoints and event streams',()=>{
  const a=makeCase(), b=makeCase();
  assert.deepEqual(a.run,b.run);
  const part=frames(24,i=>i%3===0?{x:127,z:0}:i%3===1?{x:0,z:127}:{x:-90,z:-90});
  const r1=step(a.run,part,800),r2=step(b.run,part,800);
  assert.deepEqual(r1,r2);
  assert.equal(r1.run.checkpoint.tick,24);
  assert.equal(r1.run.journal.nextTick,24);
});

test('V8B-2C2B: starter beam 350ms keeps non-drifting 1,12,22,33,43 tick cadence',()=>{
  const {run}=makeCase();
  const result=step(run,frames(50),1700);
  assert.deepEqual(result.emitted.map(e=>e.tick),[1,12,22,33,43]);
  assert.deepEqual(result.emitted.map(e=>e.id),[1,2,3,4,5]);
  const reference=previewMainProjectile(run.preview,run.preview.startPosition);
  for(const event of result.emitted) {
    assert.equal(event.atk,reference.atk);
    assert.equal(event.zUnits,reference.zUnits);
    assert.equal(event.velocityZUnitsPerTick,reference.velocityZUnitsPerTick);
    assert.equal(Object.isFrozen(event),true);
  }
  assert.equal(result.run.checkpoint.totalShots,5);
});

test('V8B-2C2B: tick order is movement then emit projectile, explicitly QA-only',()=>{
  const {run}=makeCase();
  const result=step(run,[{x:127,z:0},{x:0,z:-127}],100);
  const moved=advancePreviewMovement(run.preview,run.preview.startPosition,{x:127,z:0});
  assert.equal(result.emitted.length,1);
  assert.equal(result.emitted[0].tick,1);
  assert.equal(result.emitted[0].xUnits,moved.xUnits);
  assert.equal(result.emitted[0].zUnits,moved.zUnits-run.preview.mainGun.shotSpawnOffsetZUnits);
});

test('V8B-2C2B: splitting identical 60-frame stream never changes movement or event chain',()=>{
  const seq=frames(60,i=>i%4===0?{x:127,z:0}:i%4===1?{x:0,z:127}:i%4===2?{x:-127,z:0}:{x:0,z:-127});
  const whole=step(makeCase().run,seq,2000);
  let run=makeCase().run;
  const batchedEvents=[];
  for(const [index,time] of [[0,700],[20,1400],[40,2000]]) {
    const r=step(run,seq.slice(index,index+20),time);run=r.run;batchedEvents.push(...r.emitted);
  }
  assert.deepEqual(whole.emitted,batchedEvents);
  assert.deepEqual(whole.run.checkpoint.position,run.checkpoint.position);
  assert.deepEqual(whole.run.checkpoint.fireClock,run.checkpoint.fireClock);
  assert.equal(whole.run.checkpoint.eventDigest,run.checkpoint.eventDigest);
  // Input journal digest intentionally includes server receipt and chunk hashes.
  assert.notEqual(whole.run.journal.digest,run.journal.digest);
});

test('V8B-2C2B: 30/60/120 display FPS have identical server tick controls',()=>{
  const seq=frames(36,i=>i%2?{x:0,z:127}:{x:127,z:0});
  const digestList=[];
  for(const renderFps of [30,60,120]) {
    const samples=[];
    const framesPerTick=renderFps/30;
    for(let displayFrame=0;displayFrame<seq.length*framesPerTick;displayFrame++) {
      if(displayFrame%framesPerTick===0) samples.push(seq[displayFrame/framesPerTick]);
    }
    const r=step(makeCase().run,samples,1200);
    digestList.push(r.run.checkpoint.checkpointDigest);
  }
  assert.equal(new Set(digestList).size,1);
});

test('V8B-2C2B: immediately previous identical retry is no-op and emits no new shot',()=>{
  const original=makeCase().run;
  const part=frames(15);
  const first=step(original,part,500);
  const retry=step(first.run,part,510,0);
  assert.equal(retry.duplicate,true);
  assert.equal(retry.run,first.run);
  assert.deepEqual(retry.emitted,[]);
  assert.equal(retry.run.checkpoint.totalShots,first.run.checkpoint.totalShots);
});

test('V8B-2C2B: duplicate with modified frame or stale chunk is rejected',()=>{
  const first=step(makeCase().run,frames(15),500);
  assert.throws(()=>step(first.run,frames(15,i=>i===0?{x:1,z:0}:{x:0,z:0}),510,0),isCode('INPUT_SEQUENCE_INVALID'));
  const second=step(first.run,frames(15),1000);
  assert.throws(()=>step(second.run,frames(15),1100,0),isCode('INPUT_SEQUENCE_INVALID'));
});

test('V8B-2C2B: snapshot and journal identity are never interchangeable between UIDs',()=>{
  const {snapshot,journal}=makeCase();
  const alt=openInputJournal({uid:'another_user',sessionId:journal.sessionId,battleId:journal.battleId,
    rulesVersion:journal.rulesVersion,loadoutHash:journal.loadoutHash,issuedAtMs:journal.issuedAtMs});
  assert.throws(()=>openFoundationPreview({snapshot,policy,journal:alt}),isCode('FOUNDATION_REPLAY_CONTEXT_INVALID'));
  assert.throws(()=>openFoundationPreview({snapshot,policy,journal:{...journal,nextTick:1}}),isCode('FOUNDATION_REPLAY_CONTEXT_INVALID'));
});

test('V8B-2C2B: client victory, reward, damage and extraneous chunk fields are rejected',()=>{
  const {run}=makeCase();
  for(const payload of [
    {...chunk(0,frames(1)),victory:true},
    {...chunk(0,frames(1)),rewards:{coins:99999}},
    chunk(0,[{x:0,z:0,damage:9999}]),
    chunk(0,[{x:127,z:127}]),
  ]) {
    assert.throws(()=>replayFoundationChunk({run,chunk:payload,receivedAtMs:context.issuedAtMs+100}));
  }
  assert.throws(()=>replayFoundationChunk({run,chunk:chunk(0,frames(1)),receivedAtMs:context.issuedAtMs+100,victory:true}),
    isCode('FOUNDATION_REPLAY_INPUT_INVALID'));
});

test('V8B-2C2B: rejects fast forward, stale server receipt, oversized input',()=>{
  const {run}=makeCase();
  assert.throws(()=>step(run,frames(60),100),isCode('INPUT_FAST_FORWARD'));
  assert.throws(()=>step(run,frames(1),31*60*1000),isCode('INPUT_BATTLE_EXPIRED'));
  assert.throws(()=>step(run,frames(61),2100),isCode('INPUT_CHUNK_INVALID'));
});

test('V8B-2C2B: malformed or forged checkpoint cannot resume even if Object.freeze is used',()=>{
  const {run}=makeCase();
  const altered=Object.freeze({...run,checkpoint:Object.freeze({...run.checkpoint,totalShots:70})});
  assert.throws(()=>step(altered,frames(2),100),isCode('FOUNDATION_REPLAY_STATE_INVALID'));
  const forged=Object.freeze({...run,checkpoint:Object.freeze({...run.checkpoint,coins:999999})});
  assert.throws(()=>step(forged,frames(2),100),isCode('FOUNDATION_REPLAY_STATE_INVALID'));
});

test('V8B-2C2B: arena boundaries preserved in 60-tick batches for both portrait/landscape',()=>{
  for(const landscape of [false,true]) {
    let run=makeCase({landscape}).run;
    for(let start=0;start<300;start+=60) run=step(run,frames(60,()=>({x:90,z:90})),(start+60)*1000/30).run;
    const {xUnits,zUnits}=run.checkpoint.position;
    assert.equal(xUnits,-run.preview.arena.halfWidthUnits+run.preview.pilotHitRadiusUnits);
    assert.equal(zUnits,run.preview.arena.halfHeightUnits-run.preview.pilotHitRadiusUnits);
  }
});

test('V8B-2C2B: advanced weapon patterns stay denied before opening offline replay',()=>{
  const {snapshot,journal}=makeCase({gun:'gun_spread',deferOpen:true});
  assert.throws(()=>openFoundationPreview({snapshot,policy,journal}),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'));
});

test('V8B-2C2B: emits bounded events per batch and does not accumulate unbounded projectile arrays',()=>{
  let run=makeCase().run;
  for(let batch=0;batch<30;batch++) {
    const r=step(run,frames(60),((batch+1)*60*1000)/30);
    run=r.run;
    assert.ok(r.emitted.length<=60);
    assert.ok(!Object.hasOwn(run.checkpoint,'bullets'));
    assert.ok(!Object.hasOwn(run.checkpoint,'enemies'));
  }
  assert.equal(run.checkpoint.tick,1800);
  assert.ok(run.checkpoint.totalShots>100);
});

test('V8B-2C2B: unsupported armor/passive configuration fails closed in foundation',()=>{
  const {snapshot,journal}=makeCase({ship:'ship_tank',shipLevel:20,deferOpen:true});
  assert.throws(()=>openFoundationPreview({snapshot,policy,journal}),isCode('FOUNDATION_ARMOR_CORE_GAP'));
});

test('V8B-2C2B: no game API, economy, or reward integration; P0 source unchanged',()=>{
  const service=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  const apiSource=fs.readFileSync(require.resolve('../lib/combatPreviewReplayV8.cjs'),'utf8');
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(service,/require\([^\n]*combatPreviewReplayV8/);
  assert.doesNotMatch(server,/combatPreviewReplayV8/);
  assert.doesNotMatch(apiSource,/require\([^\n]*(?:economy|gameService|firebase-admin|server\.js)/);
  assert.deepEqual(Object.keys(api).sort(),[
    'REPLAY_VERSION','FoundationReplayError','openFoundationPreview','replayFoundationChunk',
  ].sort());
});
