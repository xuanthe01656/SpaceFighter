import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonApkCombatTraceV2C11} from '../src/game/dungeon/DungeonApkCombatTraceV2C11.js';
import {createDungeonApkInputJournalV2C14B} from '../src/game/dungeon/DungeonApkInputJournalV2C14B.js';
import {
  createDungeonApkInputCheckpointV2C14B1,
  isDungeonApkInputCheckpointPairV2C14B1,
  DUNGEON_INPUT_CHECKPOINT_V2C14B1_MIN_FRAMES,
} from '../src/game/dungeon/DungeonApkInputCheckpointV2C14B1.js';
import {prepareDungeonApkInputBundleJsonV2C14B} from '../src/game/dungeon/DungeonApkInputBundleV2C14B.js';
import {projectDungeonDirectTouchV2B1} from '../src/game/dungeon/DungeonSeedTouchContractV2B1.js';
import {mountDungeonApkTraceScreenExportV2C13} from '../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {auditDungeonApkInputBundleV2C14B} = require('../../server/lib/c15DungeonApkInputBundleV2C14B.cjs');
const viewport={canvasWidth:400,canvasHeight:800,aspect:.5,halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
const initial={x:0,z:12.5};
const delta={deltaX:20,deltaY:-20};
const moved=projectDungeonDirectTouchV2B1({position:initial,viewport,delta});
const down={kind:'down',pointerId:7,atMs:100,clientX:100,clientY:400,position:initial};
const move={kind:'move',pointerId:7,atMs:115,clientX:120,clientY:380,position:moved,viewport,delta};
const up={kind:'up',pointerId:7,atMs:125,position:moved};
const frame=(tick,player=initial)=>({simTick:tick,dtMs:16.6,roomId:'taurus_entry',player,
  playerHp:3962,playerShieldHp:0,enemies:[],projectiles:{player:3,hostile:0},bossActive:false,bossHp:0});
function harness(){
  const trace=createDungeonApkCombatTraceV2C11({sceneSeed:3060395586,seedSource:'local-client-seed'});
  const journal=createDungeonApkInputJournalV2C14B({sceneSeed:3060395586,seedSource:'local-client-seed'});
  const checkpoint=createDungeonApkInputCheckpointV2C14B1({getTrace:()=>trace.snapshot(),getInputJournal:()=>journal.snapshot()});
  const addFrame=(tick,player=initial)=>{
    const accepted=trace.captureFrame(frame(tick,player));
    if (accepted) {
      assert.equal(journal.captureFrameMarker({frameSeq:trace.frameCount,simTick:tick,player}),true);
      checkpoint.afterAcceptedFrameMarker();
    }
    return accepted;
  };
  const gesture=()=>{
    for(const e of [down,move,up]) {
      assert.equal(journal.capturePointer(e),true);
      if(e.kind==='up') checkpoint.onAcceptedPointerUp();
    }
  };
  return {trace,journal,checkpoint,addFrame,gesture};
}
function populate(h,n,player=initial){for(let i=1;i<=n;i++)assert.equal(h.addFrame(i,player),true);}

test('no state is captured before a genuine accepted pointerup',()=>{
  const h=harness();populate(h,130);
  assert.equal(h.checkpoint.hasCheckpoint,false);
  assert.equal(h.checkpoint.state,'WAITING_FOR_ACCEPTED_POINTER_UP');
  assert.equal(h.checkpoint.snapshotPair(),null);
});
test('a completed gesture after 120 frames creates one immutable, aligned checkpoint',()=>{
  const h=harness();populate(h,130);
  h.gesture();
  const pair=h.checkpoint.snapshotPair();
  assert.equal(h.checkpoint.hasCheckpoint,true);
  assert.equal(h.checkpoint.state,'LOCAL_QA_CHECKPOINT_READY_UNPAIRED');
  assert.equal(pair.trace.frames.length,130);
  assert.equal(pair.inputJournal.frameMarkers.length,130);
  assert.equal(pair.inputJournal.completedGestures,1);
  assert.equal(pair.inputJournal.pointerActive,false);
  assert.equal(isDungeonApkInputCheckpointPairV2C14B1(pair),true);
  assert.equal(Object.isFrozen(pair.trace.frames[0]),true);
  assert.equal(Object.isFrozen(pair.inputJournal.pointerEvents[0]),true);
});
test('gesture before 120 frames checkpoints exactly after the next accepted marker at 120',()=>{
  const h=harness();populate(h,80);h.gesture();
  assert.equal(h.checkpoint.hasCheckpoint,false);
  assert.equal(h.checkpoint.state,'WAITING_FOR_120_VALID_FRAMES');
  for(let i=81;i<=119;i++)h.addFrame(i,moved);
  assert.equal(h.checkpoint.hasCheckpoint,false);
  h.addFrame(120,moved);
  assert.equal(h.checkpoint.snapshotPair().trace.frames.length,DUNGEON_INPUT_CHECKPOINT_V2C14B1_MIN_FRAMES);
});
test('checkpoint remains unchanged while live trace later hits 720-frame FRAME_CAP',()=>{
  const h=harness();populate(h,150,moved);h.gesture();
  const saved=h.checkpoint.snapshotPair();
  const before=JSON.stringify(saved);
  for(let i=151;i<=720;i++)h.addFrame(i,moved);
  assert.equal(h.addFrame(721,moved),false);
  assert.equal(h.trace.snapshot().error,'FRAME_CAP');
  assert.equal(h.trace.snapshot().truncated,true);
  assert.equal(h.journal.snapshot().frameMarkers.length,720);
  assert.equal(h.checkpoint.snapshotPair(),saved);
  assert.equal(JSON.stringify(saved),before);
  assert.equal(saved.trace.truncated,false);
  assert.equal(saved.trace.frames.length,150);
  assert.equal(saved.inputJournal.pointerOverflow,false);
});
test('after FRAME_CAP, no new valid checkpoint may be forged',()=>{
  const h=harness();populate(h,720);
  assert.equal(h.addFrame(721),false);
  h.gesture();
  assert.equal(h.checkpoint.hasCheckpoint,false);
  assert.equal(h.checkpoint.state,'LIVE_TRACE_OR_INPUT_INVALID');
});
test('no checkpoint can be generated from 720 frames even before the 721st rejection',()=>{
  const h=harness();populate(h,720);h.gesture();
  assert.equal(h.checkpoint.hasCheckpoint,false);
});
test('an open gesture without accepted pointerup cannot create a checkpoint',()=>{
  const h=harness();populate(h,120);
  h.journal.capturePointer(down);h.journal.capturePointer(move);
  h.checkpoint.afterAcceptedFrameMarker();
  assert.equal(h.checkpoint.hasCheckpoint,false);
  h.checkpoint.onAcceptedPointerUp();
  assert.equal(h.checkpoint.hasCheckpoint,false);
});
test('pointer overflow before pointerup fails closed; does not discard events',()=>{
  const h=harness();populate(h,120);
  h.journal.capturePointer(down);
  for(let i=1;i<=255;i++)h.journal.capturePointer({...move,atMs:100+i});
  assert.equal(h.journal.capturePointer({...up,atMs:500}),false);
  h.checkpoint.onAcceptedPointerUp();
  assert.equal(h.checkpoint.hasCheckpoint,false);
  assert.equal(h.journal.snapshot().pointerOverflow,true);
  assert.equal(h.journal.snapshot().pointerEvents.length,256);
});
test('checksum mismatch in the source trace blocks checkpoint',()=>{
  const h=harness();populate(h,130);h.journal.capturePointer(down);h.journal.capturePointer(move);h.journal.capturePointer(up);
  const bad=createDungeonApkInputCheckpointV2C14B1({getTrace:()=>({...h.trace.snapshot(),checksum:'00000000'}),
    getInputJournal:()=>h.journal.snapshot()});
  assert.equal(bad.onAcceptedPointerUp(),false);
  assert.equal(bad.snapshotPair(),null);
});
test('frame alignment mismatch blocks checkpoint even with valid trace checksum',()=>{
  const h=harness();populate(h,130);h.journal.capturePointer(down);h.journal.capturePointer(move);h.journal.capturePointer(up);
  const bad=createDungeonApkInputCheckpointV2C14B1({getTrace:()=>h.trace.snapshot(),getInputJournal:()=>{
    const altered=structuredClone(h.journal.snapshot());altered.frameMarkers[0].simTick=888;return altered;}});
  assert.equal(bad.onAcceptedPointerUp(),false);
  assert.equal(bad.snapshotPair(),null);
});
test('error flag and failed journal capture never become READY',()=>{
  const h=harness();populate(h,120);h.gesture();
  const invalid={...h.journal.snapshot(),captureError:'INVALID_ACCEPTED_POINTER'};
  assert.equal(isDungeonApkInputCheckpointPairV2C14B1({trace:h.trace.snapshot(),inputJournal:invalid}),false);
});
test('QA bundle preserves same stored prefix, metadata untrusted and rewards locked',async()=>{
  const h=harness();populate(h,130,moved);h.gesture();
  const pair=h.checkpoint.snapshotPair();
  const prepared=prepareDungeonApkInputBundleJsonV2C14B(pair.trace,pair.inputJournal);
  assert.equal(prepared.isCompleteShortTrace,true);
  const exported=JSON.parse(prepared.json);
  assert.deepEqual(exported.trace,pair.trace);
  assert.deepEqual(exported.inputJournal,pair.inputJournal);
  assert.equal(exported.serverReportLinked,false);
  assert.equal(exported.safeForSettlement,false);
  assert.equal(exported.rewardSettlementEnabled,false);
  assert.equal(exported.liveApkParityVerified,false);
  const audited=await auditDungeonApkInputBundleV2C14B(exported);
  assert.equal(audited.localCaptureComplete,true);
  assert.equal(audited.pointerProjectionDisagreements,0);
  assert.equal(audited.status,'CLIENT_INPUT_OBSERVED_UNPAIRED');
  assert.equal(audited.trueApkServerParity,'NOT_VERIFIED');
});

test('screen INPUT export uses valid checkpoint even when later live trace is truncated',()=>{
  class Node {
    constructor(tag){this.tag=tag;this.style={};this.children=[];this.handlers={};this.textContent='';this.value='';}
    appendChild(node){this.children.push(node);return node;}
    addEventListener(name,fn){this.handlers[name]=fn;}
    setAttribute(k,v){this[k]=v;}
    remove(){this.removed=true;}focus(){}select(){}
  }
  const h=harness();populate(h,150,moved);h.gesture();
  for(let i=151;i<=720;i++)h.addFrame(i,moved);
  assert.equal(h.addFrame(721,moved),false);
  const body=new Node('body');const doc={body,createElement:tag=>new Node(tag)};
  const dispose=mountDungeonApkTraceScreenExportV2C13({document:doc,
    getSnapshot:()=>h.trace.snapshot(),getInputJournal:()=>h.journal.snapshot(),
    getInputCheckpoint:()=>h.checkpoint.snapshotPair()});
  const trigger=body.children[0].children[0];trigger.handlers.click({stopPropagation(){}});
  const section=body.children[1].children[0];
  const actions=section.children.find(x=>x.tag==='div'&&x.style.display==='flex');
  const view=actions.children.find(x=>x.textContent==='Xem INPUT V2C.14-B');
  view.handlers.click({stopPropagation(){}});
  const content=section.children.find(x=>x.tag==='textarea');
  const exported=JSON.parse(content.value);
  assert.equal(exported.trace.frames.length,150);
  assert.equal(exported.trace.truncated,false);
  assert.equal(exported.inputJournal.frameMarkers.length,150);
  const summary=section.children.find(x=>x.tag==='div'&&x.style.whiteSpace==='pre-wrap');
  assert.match(summary.textContent,/CHECKPOINT sau pointerup/);
  dispose();
});
test('screen with invalid checkpoint falls back to live diagnostic (no invented PASS)',()=>{
  class Node {
    constructor(tag){this.tag=tag;this.style={};this.children=[];this.handlers={};this.textContent='';this.value='';}
    appendChild(node){this.children.push(node);return node;}
    addEventListener(name,fn){this.handlers[name]=fn;}
    setAttribute(k,v){this[k]=v;}
    remove(){this.removed=true;}focus(){}select(){}
  }
  const h=harness();populate(h,720);h.addFrame(721);h.gesture();
  const body=new Node('body');const doc={body,createElement:tag=>new Node(tag)};
  const dispose=mountDungeonApkTraceScreenExportV2C13({document:doc,
    getSnapshot:()=>h.trace.snapshot(),getInputJournal:()=>h.journal.snapshot(),
    getInputCheckpoint:()=>({trace:h.trace.snapshot(),inputJournal:h.journal.snapshot()})});
  body.children[0].children[0].handlers.click({stopPropagation(){}});
  const section=body.children[1].children[0];
  const actions=section.children.find(x=>x.tag==='div'&&x.style.display==='flex');
  actions.children.find(x=>x.textContent==='Xem INPUT V2C.14-B').handlers.click({stopPropagation(){}});
  const content=section.children.find(x=>x.tag==='textarea');
  const exported=JSON.parse(content.value);
  assert.equal(exported.trace.truncated,true);
  assert.equal(exported.trace.error,'FRAME_CAP');
  const summary=section.children.find(x=>x.tag==='div'&&x.style.whiteSpace==='pre-wrap');
  assert.match(summary.textContent,/LIVE \(không có checkpoint hợp lệ\)/);
  dispose();
});
test('recording module requires QA-only getter functions and never registers global state',()=>{
  assert.throws(()=>createDungeonApkInputCheckpointV2C14B1({}),/REQUIRES_QA_RECORDERS/);
  const before=Object.keys(globalThis).filter(k=>k.startsWith('__SF_DUNGEON_C15_'));
  const h=harness();populate(h,130);h.gesture();
  assert.deepEqual(Object.keys(globalThis).filter(k=>k.startsWith('__SF_DUNGEON_C15_')),before);
});
