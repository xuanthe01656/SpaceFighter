import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonApkInputJournalV2C14B} from '../src/game/dungeon/DungeonApkInputJournalV2C14B.js';
import {createDungeonApkCombatTraceV2C11} from '../src/game/dungeon/DungeonApkCombatTraceV2C11.js';
import {prepareDungeonApkInputBundleJsonV2C14B} from '../src/game/dungeon/DungeonApkInputBundleV2C14B.js';
import {projectDungeonDirectTouchV2B1} from '../src/game/dungeon/DungeonSeedTouchContractV2B1.js';
import {mountDungeonApkTraceScreenExportV2C13,shareDungeonQaJsonV2C13}
  from '../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js';

const viewport={canvasWidth:400,canvasHeight:800,aspect:.5,
  halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
const origin={x:0,z:12.5};
const delta={deltaX:20,deltaY:-20};
const moved=projectDungeonDirectTouchV2B1({position:origin,viewport,delta});
const begin={kind:'down',pointerId:7,atMs:10,clientX:100,clientY:400,position:origin};
const move={kind:'move',pointerId:7,atMs:30,clientX:120,clientY:380,
  position:moved,viewport,delta};
const end={kind:'up',pointerId:7,atMs:50,position:moved};
const combatFrame=(tick,player)=>({simTick:tick,dtMs:16.6,roomId:'taurus_entry',
  player,playerHp:100,playerShieldHp:0,enemies:[],
  projectiles:{player:2,hostile:0},bossActive:false,bossHp:0});
function fixtures(){
  const t=createDungeonApkCombatTraceV2C11({sceneSeed:17,seedSource:'local-client-seed'});
  const j=createDungeonApkInputJournalV2C14B({sceneSeed:17,seedSource:'local-client-seed'});
  j.capturePointer(begin);j.capturePointer(move);j.capturePointer(end);
  t.captureFrame(combatFrame(1,moved));
  j.captureFrameMarker({frameSeq:1,simTick:1,player:moved});
  return {trace:t.snapshot(),journal:j.snapshot()};
}
test('records only accepted pointer shapes, 1:1 frame observations and safety flags',()=>{
  const {trace,journal}=fixtures();
  assert.equal(trace.frames.length,1);
  assert.equal(journal.pointerEvents.length,3);
  assert.equal(journal.frameMarkers[0].player.x,trace.frames[0].player.x);
  assert.equal(journal.completedGestures,1);
  assert.equal(journal.serverTicketVerified,false);
  assert.equal(journal.fullTickJournalVerified,false);
  assert.equal(journal.rewardSettlementEnabled,false);
  assert.equal(journal.keyboardInputCovered,false);
});
test('freeze and clone original pointer evidence; no runtime identifiers',()=>{
  const recorder=createDungeonApkInputJournalV2C14B({sceneSeed:17,seedSource:'local-client-seed'});
  const e=structuredClone(begin);recorder.capturePointer(e);e.position.x=10;
  const snap=recorder.snapshot();
  assert.equal(snap.pointerEvents[0].position.x,0);
  assert.equal(Object.isFrozen(snap.pointerEvents[0]),true);
  assert.equal(JSON.stringify(snap).includes('uid'),false);
});
test('invalid pointer order and nonnumeric values fail closed but do not throw into gameplay',()=>{
  const recorder=createDungeonApkInputJournalV2C14B({sceneSeed:17,seedSource:'local-client-seed'});
  assert.equal(recorder.capturePointer(move),false);
  assert.equal(recorder.snapshot().captureError,'INVALID_POINTER_MOVE');
  assert.equal(recorder.capturePointer(begin),false);
});
test('illegal seed/provenance rejected',()=>{
  for(const sceneSeed of [0,-1,NaN,1.4,0x100000000])
    assert.throws(()=>createDungeonApkInputJournalV2C14B({sceneSeed,seedSource:'local-client-seed'}));
  assert.throws(()=>createDungeonApkInputJournalV2C14B({sceneSeed:1,seedSource:'server-attested'}));
});
test('frame marker must follow accepted V2C11 frame sequence',()=>{
  const j=createDungeonApkInputJournalV2C14B({sceneSeed:1,seedSource:'local-client-seed'});
  assert.equal(j.captureFrameMarker({frameSeq:2,simTick:1,player:origin}),false);
  assert.equal(j.snapshot().captureError,'INVALID_OBSERVED_FRAME_MARKER');
});
test('256-pointer cap is diagnostic and never claims full journal',()=>{
  const j=createDungeonApkInputJournalV2C14B({sceneSeed:1,seedSource:'local-client-seed'});
  assert.equal(j.capturePointer(begin),true);
  for(let i=1;i<=255;i++){
    const x={...move,atMs:10+i,clientX:100+20*i,clientY:400-20*i,
      position:moved, delta};
    assert.equal(j.capturePointer(x),true);
  }
  assert.equal(j.capturePointer({...end,atMs:400}),false);
  assert.equal(j.snapshot().pointerOverflow,true);
  assert.equal(j.snapshot().pointerEvents.length,256);
});
test('bundle exports original unaltered V2C11 trace plus pointer journal',()=>{
  const {trace,journal}=fixtures();
  const prepared=prepareDungeonApkInputBundleJsonV2C14B(trace,journal,new Date('2026-11-21T04:00:00Z'));
  const obj=JSON.parse(prepared.json);
  assert.equal(prepared.fileName,'dungeon_taurus_v2c14b_20261121_040000.json');
  assert.deepEqual(obj.trace,trace);
  assert.deepEqual(obj.inputJournal,journal);
  assert.equal(prepared.isCompleteShortTrace,true);
  assert.equal(obj.serverReportLinked,false);
  assert.equal(obj.checksumAlgorithm,'fnv1a32-accidental-corruption-only');
});
test('bundle refuses mixed seed and fabricated authority, identifiers',()=>{
  const {trace,journal}=fixtures();
  for(const bad of [{...journal,sceneSeed:99},
    {...journal,serverTicketVerified:true},
    {...journal,uid:'unexpected'},
    {...journal,cloudRewards:true}])
    assert.throws(()=>prepareDungeonApkInputBundleJsonV2C14B(trace,bad),/INVALID_OR_NON_QA/);
});
test('input bundle with open gesture remains diagnostic only',()=>{
  const {trace,journal}=fixtures();
  const out=prepareDungeonApkInputBundleJsonV2C14B(trace,{...journal,pointerActive:true});
  assert.equal(out.isCompleteShortTrace,false);
});
test('Android native share forwards unchanged v2c14b bundle after click',async()=>{
  const {trace,journal}=fixtures();
  const prepared=prepareDungeonApkInputBundleJsonV2C14B(trace,journal);
  let payload;
  const state=await shareDungeonQaJsonV2C13(prepared,{native:true,
    nativePlugin:{shareJson:async p=>(payload=p,{status:'chooser_opened'})}});
  assert.equal(state,'NATIVE_SHARE_CHOOSER_OPENED');
  assert.equal(payload.json,prepared.json);
});
test('shared QA panel can switch V2C11 to V2C14B and back; dispose cleans UI',()=>{
  class N{constructor(tag){this.tag=tag;this.style={};this.children=[];this.handlers={};this.textContent='';this.value='';}
    appendChild(x){this.children.push(x);return x;}
    setAttribute(k,v){this[k]=v;}addEventListener(t,cb){this.handlers[t]=cb;}
    remove(){this.removed=true;}focus(){}select(){}
  }
  const body=new N('body');const doc={body,createElement:tag=>new N(tag)};
  const {trace,journal}=fixtures();
  const dispose=mountDungeonApkTraceScreenExportV2C13({document:doc,
    getSnapshot:()=>trace,getInputJournal:()=>journal});
  const toggle=body.children[0].children[0];toggle.handlers.click({stopPropagation(){}});
  const section=body.children[1].children[0];
  const actions=section.children.find(x=>x.style?.display==='flex' && x.tag==='div');
  const input=actions.children.find(x=>x.textContent==='Xem INPUT V2C.14-B');
  const old=actions.children.find(x=>x.textContent==='Xem TRACE V2C.11');
  assert.ok(input&&old);
  input.handlers.click({stopPropagation(){}});
  const textarea=section.children.find(x=>x.tag==='textarea');
  assert.equal(JSON.parse(textarea.value).version,'c15-dungeon-apk-input-bundle-v2c14b');
  old.handlers.click({stopPropagation(){}});
  assert.equal(JSON.parse(textarea.value).version,'c15-dungeon-apk-trace-v2c11');
  dispose();assert.equal(body.children[0].removed,true);
});
