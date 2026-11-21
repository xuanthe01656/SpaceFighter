import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createDungeonC2CInputGridV1 } from '../src/game/dungeon/DungeonC2CInputGridV1.js';
import { createC2JKFixedBallisticJournal, prepareC2JKFixedBallisticJson,
  prepareC2JNDiagnosticJson } from '../src/game/dungeon/DungeonC2JKFixedBallisticJournalV1.js';
import { shareDungeonQaJsonV2C13 } from '../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js';
const require=createRequire(import.meta.url);
const {auditC2JKFixedReplayV1}=require('../../server/lib/c15DungeonC2JKFixedReplayV1.cjs');
const initial={x:0,z:12.5};
const where=new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url);
function make(){
  const grid=createDungeonC2CInputGridV1({sceneSeed:321,seedSource:'local-client-seed',initialPlayer:initial});
  const rec=createC2JKFixedBallisticJournal({sceneSeed:321,
    seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  return {grid,rec};
}
function down(grid,atMs=10){
  return grid.capturePointer({kind:'down',pointerId:1,atMs,position:initial,clientX:100,clientY:200});
}
function up(grid,atMs=20){
  return grid.capturePointer({kind:'up',pointerId:1,atMs,position:initial});
}
function tick(grid,rec){
  assert.equal(rec.stepFrame(1000/30,initial).error,null);
  return rec.afterGridFrame(grid.captureFrame({deltaMs:1000/30,player:initial,
    playerHp:100,shieldHp:0,enemyCount:0}));
}
function run(grid,rec,n){for(let i=0;i<n;i++)tick(grid,rec);}
const safePrepare=r=>prepareC2JKFixedBallisticJson(r,new Date('2026-11-21T08:00:00Z'));
test('C2JN normal 270-tick paired run still exports full 270 and no settlement',()=>{
  const {grid,rec}=make();down(grid);up(grid);run(grid,rec,270);
  const result=rec.snapshot();
  assert.equal(rec.diagnostics().reasonCode,'C2JN_EXACT_270_PAIRED');
  assert.equal(result.ticks.length,270);assert.equal(result.grid.ticks.length,270);
  assert.equal(result.rewardSettlementEnabled,false);assert.equal(result.safeForSettlement,false);
  assert.equal(JSON.parse(safePrepare(result).json).ticks.length,270);
});
test('C2JN retains last completed-gesture safe prefix if pointer is still held at tick270',async()=>{
  const {grid,rec}=make();down(grid);up(grid);
  assert.equal(rec.registerShot({id:'dungeon-enemy-projectile-1',sourceId:'dung_taurus:taurus_entry:enemy:0',
    origin:{x:0,z:-10},velocity:{x:0.05,z:0},hitRadius:0.8,ttlTicks:250}),true);
  run(grid,rec,180);
  down(grid,12000);run(grid,rec,90);
  const detail=rec.diagnostics(),record=rec.snapshot();
  assert.equal(detail.reasonCode,'C2JN_SAFE_PREFIX_GESTURE_OR_GRID_END');
  assert.equal(detail.ballisticTicks,270);
  assert.ok(detail.safePrefixTicks>=165 && detail.safePrefixTicks<=180);
  assert.equal(record.ticks.length,detail.safePrefixTicks);
  assert.equal(record.grid.ticks.length,detail.safePrefixTicks);
  assert.equal(record.grid.pointerActive,false);
  safePrepare(record);
  const audited=await auditC2JKFixedReplayV1(record);
  assert.equal(audited.clientFixedBallisticCoreReprojected,true);
  assert.equal(audited.ticksReplayed,detail.safePrefixTicks);
  assert.equal(audited.authoredShotsObserved,1);
  assert.equal(audited.trueApkServerParity,'NOT_VERIFIED');
});
test('C2JN captures newer safe prefix after second completed gesture',()=>{
  const {grid,rec}=make();down(grid);up(grid);run(grid,rec,180);
  down(grid,250);run(grid,rec,8);up(grid,300);run(grid,rec,27);
  assert.equal(rec.diagnostics().safePrefixTicks,210);
  down(grid,320);run(grid,rec,55);
  assert.equal(rec.snapshot().ticks.length,210);
});
test('C2JN saves previously valid prefix if 256-touch GRID later overflows',()=>{
  const {grid,rec}=make();down(grid);up(grid);run(grid,rec,90);
  const old=rec.diagnostics().safePrefixTicks;
  // Real rapid gestures can exhaust the 256-event observer budget.
  for(let i=0;i<126;i++){
    assert.equal(down(grid,100+i*2),true);
    assert.equal(up(grid,101+i*2),true);
  }
  assert.equal(down(grid,400),true);
  assert.equal(up(grid,401),true);
  assert.equal(down(grid,402),false);
  assert.equal(grid.snapshot().overflow,true);
  assert.equal(rec.afterGridFrame(grid.captureFrame({deltaMs:1000/30,player:initial,
    playerHp:100,shieldHp:0,enemyCount:0})),true);
  assert.equal(rec.diagnostics().reasonCode,'C2JN_EARLY_SAFE_PREFIX_GRID_STOPPED');
  assert.equal(rec.error,null);
  assert.equal(rec.snapshot().ticks.length,old);
  assert.equal(rec.stepFrame(1000/30,initial).error,null);
  assert.equal(rec.snapshot().checksum,rec.snapshot().checksum);
});
test('C2JN no completed gesture is not promoted to a valid replay at tick270',()=>{
  const {grid,rec}=make();down(grid);run(grid,rec,270);
  assert.equal(rec.error,'C2JL_LIVE_GRID_UNPAIRED');
  assert.throws(()=>safePrepare(rec.snapshot()),/C2JK_UNSAFE_EXPORT/);
  const d=rec.diagnostics();assert.equal(d.pointerActive,true);
  assert.equal(d.completedGestures,0);assert.equal(d.safePrefixTicks,0);
});
test('C2JN premature export makes specific diagnostic instead of blank JSON',()=>{
  const {grid,rec}=make();run(grid,rec,25);
  const detail=rec.diagnostics();
  assert.equal(detail.reasonCode,'C2JN_NEED_AT_LEAST_60_TICKS');
  assert.throws(()=>safePrepare(rec.snapshot()),/C2JL_LIVE_GRID_UNPAIRED|C2JK_UNSAFE_EXPORT/);
  const failure=prepareC2JNDiagnosticJson(detail,detail.reasonCode,
    new Date('2026-11-21T08:00:00Z'));
  assert.equal(failure.fileName,'dungeon_taurus_c2jn_diag_20261121_080000.json');
  const body=JSON.parse(failure.json);
  assert.equal(body.recordValid,false);assert.equal(body.diagnosticOnly,true);
  assert.equal(body.fullCombatReplayVerified,false);
  assert.equal(body.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(body.status.gridTicks,25);
  assert.doesNotMatch(failure.json,/"uid"|"idToken"|"ticket"|"mac"/);
});
test('C2JN diagnostic remains shareable via native QA bridge but is never replay receipt',async()=>{
  const {rec}=make();
  const diag=prepareC2JNDiagnosticJson(rec.diagnostics(),'C2JN_NEED_TOUCH_RELEASE');
  let sent;
  const status=await shareDungeonQaJsonV2C13(diag,{native:true,nativePlugin:{
    shareJson:async record=>{sent=record;return {status:'chooser_opened'};}
  }});
  assert.equal(status,'NATIVE_SHARE_CHOOSER_OPENED');
  assert.match(sent.fileName,/^dungeon_taurus_c2jn_diag_/);
  const json=JSON.parse(sent.json);
  await assert.rejects(auditC2JKFixedReplayV1(json),/C2JK_UNSAFE_OR_UNREVIEWED_RECORD/);
});
test('C2JN dangerous claim is always rejected as normal C2JK replay',()=>{
  const {grid,rec}=make();down(grid);up(grid);run(grid,rec,90);
  assert.throws(()=>safePrepare({...rec.snapshot(),safeForSettlement:true}),/C2JK_UNSAFE_EXPORT/);
  assert.throws(()=>safePrepare({...rec.snapshot(),cloudRewards:true}),/C2JK_UNSAFE_EXPORT/);
});
test('C2JN on-device UI and Scene surface diagnostics without bypassing hard C2JK gate',()=>{
  const scene=readFileSync(where,'utf8');
  const ui=readFileSync(new URL('../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js',import.meta.url),'utf8');
  assert.match(scene,/getC2JKDiagnostics: \(\) => dungeonC2JK\?\.diagnostics/);
  assert.match(ui,/prepareC2JKFixedBallisticJson\(record\)/);
  assert.match(ui,/prepared=prepareC2JNDiagnosticJson/);
});
test('C2JN native Android QA plugin explicitly accepts diagnostic schema, not settlement',()=>{
  const java=readFileSync(new URL('../android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterQaTraceExportPlugin.java',import.meta.url),'utf8');
  assert.match(java,/C2JN_NAME_REGEX/);
  assert.match(java,/else if \(isC2JN\)/);
  assert.match(java,/!payload\.optBoolean\("recordValid", true\)/);
  assert.match(java,/!payload\.optBoolean\("fullCombatReplayVerified", true\)/);
  assert.match(java,/"NOT_VERIFIED"/);
  assert.match(java,/if \(!BuildConfig\.DEBUG\)/);
});
