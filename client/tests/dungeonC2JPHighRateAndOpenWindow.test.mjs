import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createDungeonC2JPInputGridV1,DUNGEON_C2JP_GRID_LIMITS} from '../src/game/dungeon/DungeonC2JPInputGridV1.js';
import {createDungeonC2CInputGridV1} from '../src/game/dungeon/DungeonC2CInputGridV1.js';
import {createC2JKFixedBallisticJournal,prepareC2JKFixedBallisticJson,
  prepareC2JNDiagnosticJson} from '../src/game/dungeon/DungeonC2JKFixedBallisticJournalV1.js';
import {projectDungeonDirectTouchV2B1} from '../src/game/dungeon/DungeonSeedTouchContractV2B1.js';
import {C2JK_MAX_TICKS,c2jkHash} from '../src/game/dungeon/DungeonC2JKFixedBallisticCoreV1.js';
const require=createRequire(import.meta.url);
const {auditC2JKFixedReplayV1}=require('../../server/lib/c15DungeonC2JKFixedReplayV1.cjs');
const {auditDungeonC2DInputGridV1}=require('../../server/lib/c15DungeonC2DInputAuditV1.cjs');
const {auditDungeonC2JPInputGridV1}=require('../../server/lib/c15DungeonC2JPInputAuditV1.cjs');
const initial={x:0,z:12.5};
const viewport={canvasWidth:393.8462,canvasHeight:852.9231,aspect:.4615,
  halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
const date=new Date('2026-11-21T10:00:00Z');
function make(){
  const grid=createDungeonC2JPInputGridV1({sceneSeed:321,
    seedSource:'local-client-seed',initialPlayer:initial});
  const journal=createC2JKFixedBallisticJournal({sceneSeed:321,
    seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  return {grid,journal};
}
function play({grid,journal}, {count=270,movesPerTick=0,releaseAt=null}={}){
  let p={...initial},cx=100,cy=200,atMs=10;
  assert.equal(grid.capturePointer({kind:'down',pointerId:7,atMs,
    position:p,clientX:cx,clientY:cy}),true);
  journal.registerShot({id:'proj-1',sourceId:'enemy-1',origin:{x:0,z:-10},
    velocity:{x:0.05,z:0.3},hitRadius:.8,ttlTicks:270});
  for(let i=0;i<count;i++){
    for(let k=0;k<(releaseAt!==null && i>=releaseAt ? 0 : movesPerTick);k++){
      const delta={deltaX:0.05,deltaY:0};
      atMs+=1;cx+=delta.deltaX;cy+=delta.deltaY;
      p=projectDungeonDirectTouchV2B1({position:p,viewport,delta});
      assert.equal(grid.capturePointer({kind:'move',pointerId:7,atMs,
        position:p,clientX:cx,clientY:cy,viewport,delta}),true);
    }
    if(i+1===releaseAt){atMs+=1;
      assert.equal(grid.capturePointer({kind:'up',pointerId:7,atMs,position:p}),true);
    }
    assert.equal(journal.stepFrame(1000/30,p).error,null);
    assert.equal(journal.afterGridFrame(grid.captureFrame({deltaMs:1000/30,
      player:p,playerHp:100,shieldHp:0,enemyCount:0})),true);
  }
  return {p,grid: grid.snapshot(),
    rec:count===C2JK_MAX_TICKS?journal.snapshot():null,
    diagnostics:journal.diagnostics()};
}
const rehash=(record,modify)=>{const r=structuredClone(record);modify(r);
  const {checksum,...body}=r;r.checksum=c2jkHash(body);return r;};

test('C2JP high-rate single 270-tick drag preserves >1000 original accepted events, and never invents up',async()=>{
  const {grid,journal}=make();const out=play({grid,journal},{movesPerTick:5});
  assert.equal(out.grid.pointerEvents.length,1+5*270);
  assert.equal(out.grid.pointerEvents.filter(e=>e.kind==='move').length,1350);
  assert.equal(out.grid.completedGestures,0);
  assert.equal(out.grid.pointerActive,true);
  assert.equal(out.grid.overflow,false);
  assert.equal(out.grid.finished,true);
  assert.equal(out.rec.grid.ticks.length,270);
  assert.equal(out.diagnostics.reasonCode,'C2JP_EXACT_270_OPEN_GESTURE_SUBSET');
  assert.equal(out.rec.safeForSettlement,false);
  const prepared=prepareC2JKFixedBallisticJson(out.rec,date);
  assert.equal(prepared.tickCount,270);
  assert.equal(prepared.fileName,'dungeon_taurus_c2jk_20261121_100000.json');
  assert.doesNotMatch(prepared.json,/"uid"|"mac"|"idToken"/);
  const audited=await auditC2JKFixedReplayV1(out.rec);
  assert.equal(audited.ticksReplayed,270);
  assert.equal(audited.c2jpHighRateGridReprojected,true);
  assert.equal(audited.openGestureSubsetOnly,true);
  assert.equal(audited.inputGestureClosedAtSeal,false);
  assert.equal(audited.serverSignedSameSessionVerified,false);
  assert.equal(audited.fullCombatReplayVerified,false);
  assert.equal(audited.rewardSettlementEnabled,false);
});

test('C2JP 270-tick session with genuine release exports CLOSED input subset',async()=>{
  const {grid,journal}=make();const out=play({grid,journal},
    {movesPerTick:2,releaseAt:90});
  assert.equal(out.grid.pointerActive,false);
  assert.equal(out.grid.completedGestures,1);
  assert.equal(out.diagnostics.reasonCode,'C2JN_EXACT_270_PAIRED');
  assert.equal(prepareC2JKFixedBallisticJson(out.rec,date).tickCount,270);
  const audited=await auditC2JKFixedReplayV1(out.rec);
  assert.equal(audited.openGestureSubsetOnly,false);
  assert.equal(audited.inputGestureClosedAtSeal,true);
  assert.equal(audited.c2jpHighRateGridReprojected,true);
});

test('C2JP 269-tick open gesture cannot be claimed as valid sealed receipt',async()=>{
  const {grid,journal}=make();play({grid,journal},{count:269,movesPerTick:0});
  assert.throws(()=>journal.snapshot(),/C2JL_LIVE_GRID_UNPAIRED/);
  const diag=prepareC2JNDiagnosticJson(journal.diagnostics(),
    journal.diagnostics().reasonCode,date);
  assert.equal(JSON.parse(diag.json).recordValid,false);
  assert.equal(JSON.parse(diag.json).rewardSettlementEnabled,false);
});

test('C2JP 4096-event cap is bounded and fails closed at 4097, legacy C2C 256 remains unchanged',()=>{
  const {grid,journal}=make();
  assert.equal(DUNGEON_C2JP_GRID_LIMITS.pointers,4096);
  assert.equal(grid.capturePointer({kind:'down',pointerId:1,atMs:1,
    position:initial,clientX:100,clientY:200}),true);
  const delta={deltaX:0,deltaY:0};
  for(let i=1;i<4096;i++)assert.equal(grid.capturePointer({kind:'move',pointerId:1,
    atMs:i+1,clientX:100,clientY:200,viewport,delta,position:initial}),true);
  assert.equal(grid.acceptedPointerCount,4096);
  assert.equal(grid.capturePointer({kind:'up',pointerId:1,atMs:4097,position:initial}),false);
  assert.equal(grid.snapshot().overflow,true);
  assert.equal(grid.snapshot().completedGestures,0);
  assert.equal(journal.afterGridFrame(grid.captureFrame({deltaMs:1000/30,
    player:initial,playerHp:100,shieldHp:0,enemyCount:0})),false);
  assert.equal(journal.error,'C2JL_GRID_CAPTURE_FAILED');
  const legacy=createDungeonC2CInputGridV1({sceneSeed:321,
    seedSource:'local-client-seed',initialPlayer:initial});
  legacy.capturePointer({kind:'down',pointerId:1,atMs:1,position:initial,
    clientX:100,clientY:200});
  for(let i=1;i<256;i++)legacy.capturePointer({kind:'move',pointerId:1,
    atMs:i+1,clientX:100,clientY:200,viewport,delta,position:initial});
  assert.equal(legacy.capturePointer({kind:'up',pointerId:1,
    atMs:300,position:initial}),false);
  assert.equal(legacy.snapshot().overflow,true);
});

test('C2JP server refuses new record via OLD C2D validator and accepts only explicit new profile',async()=>{
  const {grid,journal}=make();const out=play({grid,journal},{count:270,movesPerTick:2});
  await assert.rejects(auditDungeonC2DInputGridV1(out.grid),/C2D_RECORD_UNTRUSTED_OR_UNSAFE/);
  const audited=await auditDungeonC2JPInputGridV1(out.grid);
  assert.equal(audited.openGestureSubsetOnly,true);
  assert.equal(audited.subsetInputReprojectionPass,true);
});

test('C2JP Node audit rejects edited pointer position even with both checksum layers recomputed',async()=>{
  const {grid,journal}=make();const out=play({grid,journal},{count:270,movesPerTick:2});
  const forged=rehash(out.rec,rec=>{
    rec.grid.pointerEvents[10].position.x+=1;
    const {checksum,...body}=rec.grid;
    let h=2166136261;const str=JSON.stringify(body);
    for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619)>>>0;
    rec.grid.checksum=h.toString(16).padStart(8,'0');
  });
  await assert.rejects(auditC2JKFixedReplayV1(forged),
    /C2D_POINTER_PROJECTION_DIVERGED|C2D_GRID_INPUT_MISMATCH/);
});

test('C2JP Node audit rejects forged gesture completion and dangerous rewards',async()=>{
  const {grid,journal}=make();const out=play({grid,journal},{count:270,movesPerTick:2});
  const reward=rehash(out.rec,rec=>{rec.rewardSettlementEnabled=true;});
  await assert.rejects(auditC2JKFixedReplayV1(reward),/C2JK_UNSAFE_OR_UNREVIEWED_RECORD/);
  const forged=rehash(out.rec,rec=>{rec.grid.pointerActive=false;rec.grid.completedGestures=1;});
  await assert.rejects(auditC2JKFixedReplayV1(forged),/C2D_CHECKSUM_MISMATCH/);
});

test('C2JP only accepts down, move, up; cancel cannot masquerade as real up',()=>{
  const {grid}=make();grid.capturePointer({kind:'down',pointerId:3,atMs:1,
    position:initial,clientX:100,clientY:200});
  assert.equal(grid.capturePointer({kind:'cancel',pointerId:3,atMs:2,position:initial}),false);
  assert.equal(grid.snapshot().captureError,'C2JP_POINTER_INVALID');
  assert.equal(grid.snapshot().completedGestures,0);
});

test('C2JP recorder is an additive QA-only scene path; C2C/C2E and Cloud Run untouched',()=>{
  const scene=readFileSync(new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url),'utf8');
  const native=readFileSync(new URL('../android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterQaTraceExportPlugin.java',import.meta.url),'utf8');
  assert.match(scene,/getGrid:\(\)=>dungeonC2JPGrid\.snapshot\(\)/);
  assert.match(scene,/dungeonC2CGrid\?\.capturePointer\(event\)/);
  assert.match(scene,/dungeonC2JPGrid\?\.capturePointer\(event\)/);
  assert.match(scene,/dungeonC2CGrid\.captureFrame\(observationC2JP\)/);
  assert.match(scene,/dungeonC2JPGrid\.captureFrame\(observationC2JP\)/);
  assert.match(native,/C2JP_GRID_VERSION/);
  assert.match(native,/4096/);
  assert.match(native,/if \(!BuildConfig\.DEBUG\)/);
  assert.match(native,/!payload\.optBoolean\("rewardSettlementEnabled", true\)/);
});

test('C2JP rejects invalid seed and does not start in server ticket mode',()=>{
  assert.throws(()=>createDungeonC2JPInputGridV1({sceneSeed:0,seedSource:'local-client-seed',initialPlayer:initial}),
    /C2JP_GUEST_QA_ONLY/);
  assert.throws(()=>createDungeonC2JPInputGridV1({sceneSeed:321,
    seedSource:'server-ticket-local-unverified',initialPlayer:initial}),/C2JP_GUEST_QA_ONLY/);
});

test('C2JP ignores all post-270 pointer events and frames without changing the sealed evidence',()=>{
  const {grid,journal}=make();play({grid,journal},{movesPerTick:1});
  const old=journal.snapshot();
  assert.equal(grid.capturePointer({kind:'up',pointerId:7,atMs:20000,
    position:old.grid.ticks.at(-1).inputPosition}),false);
  assert.equal(grid.captureFrame({deltaMs:1000/30,
    player:initial,playerHp:100,shieldHp:0,enemyCount:0}),false);
  assert.equal(journal.snapshot().checksum,old.checksum);
  assert.equal(journal.stepFrame(1000/30,initial).error,null);
  assert.equal(journal.snapshot().checksum,old.checksum);
});

test('C2JP rejects a mismatched final grid tick even if outer FNV is recomputed',async()=>{
  const {grid,journal}=make();const out=play({grid,journal},{movesPerTick:1});
  const bad=rehash(out.rec,r=>r.grid.ticks.pop());
  await assert.rejects(auditC2JKFixedReplayV1(bad),/C2JK_C2C_GRID_UNPAIRED/);
});
