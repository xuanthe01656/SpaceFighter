'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {auditDungeonApkInputBundleV2C14B}=require('../lib/c15DungeonApkInputBundleV2C14B.cjs');
const CLIENT=path.resolve(__dirname,'../../client/src/game/dungeon/');
const SCENE=path.resolve(__dirname,'../../client/src/components/Dungeon/DungeonScene.js');
const NATIVE=path.resolve(__dirname,
  '../../client/android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterQaTraceExportPlugin.java');
const CLI=path.resolve(__dirname,'../tools/auditDungeonApkInputBundleV2C14B.cjs');
let deps;
async function modules(){
  return deps ||= Promise.all(['DungeonApkCombatTraceV2C11.js',
    'DungeonApkInputJournalV2C14B.js','DungeonApkInputBundleV2C14B.js',
    'DungeonSeedTouchContractV2B1.js'].map(n=>import(pathToFileURL(path.join(CLIENT,n)).href)));
}
const viewport={canvasWidth:400,canvasHeight:800,aspect:.5,
  halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
async function fixture(){
  const [old,inputs,bundle,seed]=await modules();
  const t=old.createDungeonApkCombatTraceV2C11({sceneSeed:41,
    seedSource:'local-client-seed'});
  const j=inputs.createDungeonApkInputJournalV2C14B({sceneSeed:41,
    seedSource:'local-client-seed'});
  let p={x:0,z:12.5};
  j.capturePointer({kind:'down',pointerId:7,atMs:10,clientX:120,clientY:400,position:p});
  const delta={deltaX:20,deltaY:-20};
  p=seed.projectDungeonDirectTouchV2B1({position:p,viewport,delta});
  j.capturePointer({kind:'move',pointerId:7,atMs:30,clientX:140,clientY:380,
    position:p,viewport,delta});
  j.capturePointer({kind:'up',pointerId:7,atMs:50,position:p});
  t.captureFrame({simTick:1,dtMs:16,roomId:'taurus_entry',player:p,
    playerHp:100,playerShieldHp:0,enemies:[],
    projectiles:{player:3,hostile:0},bossActive:false,bossHp:0});
  j.captureFrameMarker({frameSeq:1,simTick:1,player:p});
  return JSON.parse(bundle.prepareDungeonApkInputBundleJsonV2C14B(t.snapshot(),j.snapshot()).json);
}
const bad=(code)=>e=>e?.code===code;
async function reseal(object){
  const [old]=await modules();
  const {checksum:unused,...body}=object;
  return {...body,checksum:old.checksumDungeonV2C11(JSON.stringify(body))};
}
test('read-only audit checks real accepted pointer projection and stays unpaired',async()=>{
  const b=await fixture();
  const a=await auditDungeonApkInputBundleV2C14B(b);
  assert.equal(a.status,'CLIENT_INPUT_OBSERVED_UNPAIRED');
  assert.equal(a.localCaptureComplete,true);
  assert.equal(a.pointerProjectionDisagreements,0);
  assert.equal(a.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(a.rewardSettlementEnabled,false);
  assert.equal(a.serverTicketVerified,false);
});
test('bundle checksum corruption fails closed',async()=>{
  const b=await fixture();b.inputJournal.pointerEvents[1].clientX=150;
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C14B_BUNDLE_CHECKSUM_MISMATCH'));
});
test('nested V2C11 original checksum stays independently verified',async()=>{
  let b=await fixture();b.trace.frames[0].player.x=0;b=await reseal(b);
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C11_TRACE_CHECKSUM_MISMATCH'));
});
test('recomputed checksum cannot promote settlement or server ticket claim',async()=>{
  let b=await fixture();b.inputJournal.serverTicketVerified=true;b=await reseal(b);
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C14B_JOURNAL_UNSAFE_OR_INVALID'));
  b=await fixture();b.liveApkParityVerified=true;b=await reseal(b);
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C14B_BUNDLE_UNSAFE_OR_INVALID'));
});
test('pointer timestamp / delta ordering validated independently',async()=>{
  let b=await fixture();b.inputJournal.pointerEvents[1].delta.deltaX=21;b=await reseal(b);
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C14B_POINTER_SEQUENCE'));
});
test('pointer projection drift is diagnostic, NEVER parity',async()=>{
  let b=await fixture();b.inputJournal.pointerEvents[1].position.x+=0.5;b=await reseal(b);
  const a=await auditDungeonApkInputBundleV2C14B(b);
  assert.equal(a.pointerProjectionDisagreements>0,true);
  assert.equal(a.localCaptureComplete,false);
  assert.equal(a.trueApkServerParity,'NOT_VERIFIED');
});
test('client frame observation differs from original trace => rejected',async()=>{
  let b=await fixture();b.inputJournal.frameMarkers[0].player.x=9;b=await reseal(b);
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C14B_FRAME_LINK_MISMATCH'));
});
test('unknown new identifier or fake provenance fields fail closed',async()=>{
  let b=await fixture();b.inputJournal.uid='somebody';b=await reseal(b);
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C14B_JOURNAL_UNSAFE_OR_INVALID'));
  b=await fixture();b.extraAuth=true;b=await reseal(b);
  await assert.rejects(()=>auditDungeonApkInputBundleV2C14B(b),bad('V2C14B_BUNDLE_UNSAFE_OR_INVALID'));
});
test('CLI validates local JSON and does not create output files',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2c14b-cli-'));
  const p=path.join(tmp,'taurus.json');
  try {
    fs.writeFileSync(p,JSON.stringify(await fixture()));
    const r=JSON.parse(execFileSync(process.execPath,[CLI,p],{encoding:'utf8'}));
    assert.equal(r.status,'CLIENT_INPUT_OBSERVED_UNPAIRED');
    assert.deepEqual(fs.readdirSync(tmp),['taurus.json']);
    const failed=spawnSync(process.execPath,[CLI,p,'--unsafe'],{encoding:'utf8'});
    assert.notEqual(failed.status,0);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
test('source is strictly gated, reused QA screen, and native debug file validation',()=>{
  const s=fs.readFileSync(SCENE,'utf8');
  const n=fs.readFileSync(NATIVE,'utf8');
  assert.match(s,/const dungeonV2C14BJournal = dungeonV2C11Trace/);
  assert.match(s,/dungeonV2C14BJournal\?\.capturePointer\(event\)/);
  assert.match(s,/dungeonV2C14BJournal\?\.captureFrameMarker/);
  assert.match(s,/getInputJournal: \(\) => dungeonV2C14BJournal\.snapshot\(\)/);
  assert.match(n,/BuildConfig\.DEBUG/);
  assert.match(n,/INPUT_BUNDLE_VERSION/);
  assert.match(n,/INPUT_NAME_REGEX/);
  assert.match(n,/serverTicketVerified/);
  assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname,
    '../lib/c15DungeonApkInputBundleV2C14B.cjs'),'utf8'),/firebase-admin|fetch\(/);
});
