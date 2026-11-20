'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {execFileSync,spawnSync}=require('node:child_process');
const {VERSION,TRACE_VERSION,validateClientTrace,
  compareDungeonApkTraceV2C11}=require('../lib/c15DungeonApkTraceParityV2C11.cjs');
const serverVersion=require('../lib/c15DungeonIntegratedCombatV2C10.cjs').VERSION;
const CLIENT=path.resolve(__dirname,'../../client/src/game/dungeon/DungeonApkCombatTraceV2C11.js');
const SCENE=path.resolve(__dirname,'../../client/src/components/Dungeon/DungeonScene.js');
const SERVER=path.resolve(__dirname,'../server.js');
const CLI=path.resolve(__dirname,'../tools/compareDungeonApkTraceV2C11.cjs');
let imported;
const mod=()=>imported||(imported=import(pathToFileURL(CLIENT).href));
const source=()=>fs.readFileSync(SCENE,'utf8');
const frame=(tick,overrides={})=>({simTick:tick,dtMs:1000/60,roomId:'taurus_entry',
  player:{x:0,z:12.5},playerHp:100,playerShieldHp:12,
  enemies:[{id:'scout_01',position:{x:1,z:-4},hp:35,maxHp:40}],
  projectiles:{player:1,hostile:2},bossActive:false,bossHp:0,...overrides});
async function sample({seed=111,ticks=[1,2],finished=true,events=true}={}){
  const m=await mod();
  const rec=m.createDungeonApkCombatTraceV2C11({sceneSeed:seed,
    seedSource:'local-client-seed'});
  for(const t of ticks)assert.equal(rec.captureFrame(frame(t)),true);
  if(events)assert.equal(rec.captureEvent({kind:'enemy_fire',simTick:ticks[0],
    id:'scout_01',position:{x:1,z:-4},velocity:{x:0,z:1}}),true);
  if(finished)rec.finish();
  return rec.snapshot();
}
function report(tick=1,change={}){
  return {version:serverVersion,dungeonId:'dung_taurus',roomId:'taurus_entry',
    sceneSeed:111,simulatedTicks:tick,candidatePlayerPosition:{x:0,z:12.5},
    candidatePlayerHp:100,candidatePlayerShieldHp:12,
    candidateEnemyHp:[{id:'scout_01',hp:35,maxHp:40,dead:false,deathTick:null}],
    candidateDigest:'a'.repeat(64),inputPositionsAppliedPerTick:true,
    serverReadLoadoutAppliedToWeaponAndVitals:true,
    safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
    independentReplayVerified:false,dungeonVictoryVerified:false,
    liveGameplayAiParityVerified:false,...change};
}
const compare=(trace,reports=[])=>compareDungeonApkTraceV2C11({clientTrace:trace,serverReports:reports});
test('V2C.11 wire contract matches V2C.10 report version',()=>{
  assert.equal(VERSION,'c15-dungeon-apk-parity-v2c11');
  assert.equal(TRACE_VERSION,'c15-dungeon-apk-trace-v2c11');
  assert.equal(serverVersion,'c15-dungeon-integrated-combat-v2c10');
});
test('V2C.11 disabled when compile-time build flag is OFF',async()=>{
  const m=await mod();
  assert.equal(m.isDungeonV2C11ApkTraceEnabled({env:{},qaRun:{},dungeonId:'dung_taurus'}),false);
  assert.equal(m.isDungeonV2C11ApkTraceEnabled({env:{VITE_SF_DUNGEON_V2C11_APK_TRACE:'true'},qaRun:null,dungeonId:'dung_taurus'}),false);
  assert.equal(m.isDungeonV2C11ApkTraceEnabled({env:{VITE_SF_DUNGEON_V2C11_APK_TRACE:'true'},qaRun:{},dungeonId:'dung_nereus'}),false);
  assert.equal(m.isDungeonV2C11ApkTraceEnabled({env:{VITE_SF_DUNGEON_V2C11_APK_TRACE:'true'},qaRun:{},dungeonId:'dung_taurus'}),true);
});
test('V2C.11 rejects nonexistent or malformed seed and provenance',async()=>{
  const m=await mod();
  for(const seed of [0,-1,1.5,NaN,Infinity,0x100000000])
    assert.throws(()=>m.createDungeonApkCombatTraceV2C11({sceneSeed:seed,seedSource:'local-client-seed'}));
  assert.throws(()=>m.createDungeonApkCombatTraceV2C11({sceneSeed:1,seedSource:'server-attested'}));
});
test('V2C.11 recorder captures immutable copies of real-frame shapes',async()=>{
  const m=await mod(),rec=m.createDungeonApkCombatTraceV2C11({sceneSeed:111,seedSource:'local-client-seed'});
  const x=frame(1);rec.captureFrame(x);x.player.x=99;x.enemies[0].hp=0;
  const one=rec.snapshot();assert.equal(one.frames[0].player.x,0);
  assert.equal(one.frames[0].enemies[0].hp,35);
  assert.equal(Object.isFrozen(one.frames[0].enemies[0]),true);
  assert.equal(validateClientTrace(one),true);
});
test('V2C.11 checksum detects accidental post-export JSON edit',async()=>{
  const s=structuredClone(await sample());s.frames[0].player.x=5;
  assert.throws(()=>compare(s),{code:'V2C11_TRACE_CHECKSUM_MISMATCH'});
});
test('V2C.11 checksum is deterministic over client JSON payload',async()=>{
  const m=await mod(),a=await sample(),b=await sample();
  assert.equal(a.checksum,b.checksum);
  const {checksum:expected,...payload}=a;
  assert.equal(m.checksumDungeonV2C11(JSON.stringify(payload)),expected);
});
test('V2C.11 client evidence without reports is explicitly UNPAIRED',async()=>{
  const x=compare(await sample());assert.equal(x.status,'CLIENT_EVIDENCE_UNPAIRED');
  assert.equal(x.aligned,0);assert.equal(x.safeForSettlement,false);
  assert.equal(x.apkDeviceIntegrityVerified,false);
  assert.equal(x.fullCombatParityVerified,false);
});
test('V2C.11 same sampled candidate values are still UNTRUSTED',async()=>{
  const x=compare(await sample(),[report(1),report(2)]);
  assert.equal(x.status,'CANDIDATE_SAMPLES_AGREE_UNTRUSTED');
  assert.equal(x.aligned,2);assert.equal(x.divergences.length,0);
  assert.equal(x.independentReplayVerified,false);
  assert.equal(x.serverReportProvenanceVerified,false);
});
test('V2C.11 player movement discrepancy is surfaced',async()=>{
  const x=compare(await sample(),[report(1,{candidatePlayerPosition:{x:3,z:12.5}})]);
  assert.equal(x.status,'CANDIDATE_DIVERGENCE_OBSERVED');
  assert.equal(x.divergences[0].field,'playerPosition');
});
test('V2C.11 HP discrepancy and shield discrepancy are separate',async()=>{
  const x=compare(await sample(),[report(1,{candidatePlayerHp:70,candidatePlayerShieldHp:7})]);
  assert.deepEqual(x.divergences.map(d=>d.field),['playerHp','playerShieldHp']);
});
test('V2C.11 actual enemy HP mismatch is surfaced when shared ID exists',async()=>{
  const x=compare(await sample(),[report(1,{candidateEnemyHp:[{id:'scout_01',hp:4,maxHp:40,dead:false}]})]);
  assert.equal(x.divergences[0].field,'enemyHp:scout_01');
});
test('V2C.11 does not claim dead/unspawned missing actors mismatch',async()=>{
  const x=compare(await sample(),[report(1,{candidateEnemyHp:[{id:'future_10',hp:10,maxHp:10,dead:false}]})]);
  assert.equal(x.status,'CANDIDATE_SAMPLES_AGREE_UNTRUSTED');
  assert.equal(x.unmatchedEnemySamples,1);
});
test('V2C.11 no exact tick alignment is not a PASS',async()=>{
  const s=await sample({ticks:[1.25,2.5]});
  const x=compare(s,[report(1),report(2)]);
  assert.equal(x.status,'NO_EXACT_TICK_ALIGNMENT');
  assert.equal(x.aligned,0);assert.equal(x.uncheckedFrames,2);
});
test('V2C.11 does not round fractional tick to nearby server tick',async()=>{
  const s=await sample({ticks:[1.02,2]});
  const x=compare(s,[report(1),report(2)]);
  assert.equal(x.aligned,1);assert.equal(x.uncheckedFrames,1);
});
test('V2C.11 records frame delta without confusing it with server fixed ticks',async()=>{
  const s=await sample();assert.equal(s.tickBasis,'frameScale-delta-not-fixed-tick');
  assert.equal(s.frames[0].dtMs,16.6667);
  assert.ok(compare(s,[report(1)]).clock.includes('variable-frame'));
});
test('V2C.11 missing server seed alignment is rejected',async()=>{
  const s=await sample();assert.throws(()=>compare(s,[report(1,{sceneSeed:112})]),
    {code:'V2C11_INVALID_SERVER_CANDIDATE_REPORT'});
});
test('V2C.11 duplicated or descending server ticks are rejected',async()=>{
  const s=await sample();
  assert.throws(()=>compare(s,[report(2),report(1)]));
  assert.throws(()=>compare(s,[report(1),report(1)]));
});
test('V2C.11 refuses forged server winner/reward safety claims',async()=>{
  const s=await sample();
  for(const change of [{safeForSettlement:true},{cloudRewards:true},
    {independentReplayVerified:true},{dungeonVictoryVerified:true}])
    assert.throws(()=>compare(s,[report(1,change)]));
});
test('V2C.11 rejects extra reward claims embedded in client trace',async()=>{
  const s=structuredClone(await sample());s.reward=1000;
  assert.throws(()=>compare(s));
});
test('V2C.11 JSON with fake user fields is rejected, not silently stripped',async()=>{
  const s=structuredClone(await sample());s.uid='real-user';
  assert.throws(()=>compare(s));
});
test('V2C.11 corrupt frame sequence invalid even after recomputing checksum',async()=>{
  const m=await mod(),s=structuredClone(await sample());
  s.frames[1].frameSeq=4;const {checksum,...payload}=s;
  s.checksum=m.checksumDungeonV2C11(JSON.stringify(payload));
  assert.throws(()=>compare(s),{code:'V2C11_INVALID_FRAME'});
});
test('V2C.11 truncated evidence explicitly rejected',async()=>{
  const m=await mod(),rec=m.createDungeonApkCombatTraceV2C11({sceneSeed:111,seedSource:'local-client-seed'});
  rec.captureFrame(frame(1));assert.equal(rec.captureFrame(frame(1)),false);
  const s=rec.snapshot();assert.equal(s.truncated,true);
  assert.throws(()=>compare(s),{code:'V2C11_UNTRUSTED_OR_TRUNCATED_TRACE'});
});
test('V2C.11 invalid duplicate enemy IDs stop recording',async()=>{
  const m=await mod(),rec=m.createDungeonApkCombatTraceV2C11({sceneSeed:111,seedSource:'local-client-seed'});
  const row=frame(1);row.enemies.push({...row.enemies[0]});
  assert.equal(rec.captureFrame(row),false);assert.equal(rec.error,'INVALID_ENEMY_FRAME');
});
test('V2C.11 over-cap frame count rejects rather than dropping evidence',async()=>{
  const m=await mod(),rec=m.createDungeonApkCombatTraceV2C11({sceneSeed:111,seedSource:'local-client-seed'});
  for(let i=1;i<=m.DUNGEON_APK_TRACE_V2C11_LIMITS.frames;i++)assert.equal(rec.captureFrame(frame(i)),true);
  assert.equal(rec.captureFrame(frame(721)),false);assert.equal(rec.error,'FRAME_CAP');
});
test('V2C.11 events are exactly labeled as observed fire or planned salvo',async()=>{
  const s=await sample();assert.equal(s.events[0].kind,'enemy_fire');
  const names=['enemy_fire','enemy_death','player_salvo_plan'];
  const m=await mod(),rec=m.createDungeonApkCombatTraceV2C11({sceneSeed:111,seedSource:'local-client-seed'});
  rec.captureFrame(frame(1));
  for(const name of names)assert.equal(rec.captureEvent({kind:name,simTick:1,id:'main'}),true);
  assert.deepEqual(rec.snapshot().events.map(x=>x.kind),names);
});
test('V2C.11 bad event kind invalidates rather than downgrades',async()=>{
  const m=await mod(),rec=m.createDungeonApkCombatTraceV2C11({sceneSeed:111,seedSource:'local-client-seed'});
  rec.captureFrame(frame(1));
  assert.equal(rec.captureEvent({kind:'reward_claim',simTick:1,id:'main'}),false);
  assert.equal(rec.error,'INVALID_EVENT');
});
test('V2C.11 records completed scene frames only, optional QA callback',()=>{
  const s=source();assert.match(s,/if \(dungeonV2C11Trace && currentRoomV38\?\.id === 'taurus_entry'\)/);
  assert.match(s,/dungeonV2C11Trace\.captureFrame\(/);
  assert.match(s,/onRuntimeHeartbeat\?\.\(/);
  assert.ok(s.indexOf('dungeonV2C11Trace.captureFrame(')>s.indexOf('const frameDeltaMsV410'));
  assert.match(s,/data\.onDungeonC15V2C11QaTrace\?\.\(/);
});
test('V2C.11 scene instrumentation is behind both QA gates',()=>{
  const s=source();assert.match(s,/isDungeonV2C11ApkTraceEnabled/);
  assert.match(s,/env: import\.meta\.env, qaRun: dungeonQaRunV391, dungeonId/);
  assert.match(s,/__SF_DUNGEON_C15_V2C11_APK_TRACE__/);
  assert.match(s,/\/\/ Only QA builds have this manual export accessor/);
});
test('V2C.11 records world muzzle only after logical projectile created',()=>{
  const s=source();assert.ok(s.indexOf('recordDungeonV2C11({kind: \'enemy_fire\'')>s.indexOf('enemyBullets.push(b)'));
  assert.match(s,/position: \{x: b\.position\.x, z: b\.position\.z\}/);
});
test('V2C.11 does not modify economy, session, settlement or production HTTP',()=>{
  const sv=fs.readFileSync(SERVER,'utf8');
  assert.doesNotMatch(sv,/c15DungeonApkTraceParityV2C11|GAME_C15_DUNGEON_V2C11/);
  const lib=fs.readFileSync(path.resolve(__dirname,'../lib/c15DungeonApkTraceParityV2C11.cjs'),'utf8');
  for(const forbidden of ['firebase-admin','firestore().','app.listen(','verifiedSettlement'])
    assert.ok(!lib.includes(forbidden),forbidden);
});
test('V2C.11 CLI with valid JSON returns read-only unpaired diagnostic',async()=>{
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'c15-v2c11-')),'trace.json');
  try {
    fs.writeFileSync(file,JSON.stringify(await sample()));
    const proc=spawnSync(process.execPath,[CLI,file],{encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr);
    assert.equal(JSON.parse(proc.stdout).status,'CLIENT_EVIDENCE_UNPAIRED');
  }finally{fs.rmSync(path.dirname(file),{recursive:true,force:true});}
});
test('V2C.11 CLI rejects modified JSON and does not persist outcome',async()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'c15-v2c11-'));
  try {
    const f=path.join(d,'bad.json'),bad=structuredClone(await sample());
    bad.frames[0].playerHp=500;
    fs.writeFileSync(f,JSON.stringify(bad));
    const proc=spawnSync(process.execPath,[CLI,f],{encoding:'utf8'});
    assert.equal(proc.status,1);assert.match(proc.stderr,/V2C11_TRACE_QA_REJECTED/);
    assert.deepEqual(fs.readdirSync(d),['bad.json']);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('V2C.11 cannot report full replay parity, verified victory or rewards',async()=>{
  const s=await sample(),x=compare(s,[report(1)]);
  assert.equal(x.fullCombatParityVerified,false);
  assert.equal(x.dungeonVictoryVerified,false);
  assert.equal(x.safeForSettlement,false);
  assert.equal(x.rewardSettlementEnabled,false);
  assert.equal(x.cloudRewards,false);
});
