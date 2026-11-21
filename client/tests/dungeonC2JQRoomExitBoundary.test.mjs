import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createDungeonC2JPInputGridV1,DUNGEON_C2JQ_EXIT_GRID_VERSION} from '../src/game/dungeon/DungeonC2JPInputGridV1.js';
import {createC2JKFixedBallisticJournal, prepareC2JKFixedBallisticJson} from '../src/game/dungeon/DungeonC2JKFixedBallisticJournalV1.js';
import {projectDungeonDirectTouchV2B1} from '../src/game/dungeon/DungeonSeedTouchContractV2B1.js';
import {c2jkHash} from '../src/game/dungeon/DungeonC2JKFixedBallisticCoreV1.js';
const require=createRequire(import.meta.url);
const {auditC2JKFixedReplayV1}=require('../../server/lib/c15DungeonC2JKFixedReplayV1.cjs');
const {auditDungeonC2JPInputGridV1}=require('../../server/lib/c15DungeonC2JPInputAuditV1.cjs');
const initial={x:0,z:12.5},viewport={canvasWidth:393.8462,canvasHeight:852.9231,
  aspect:.4615,halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
function run({ticks=253,moves=5,tailMoves=0,releaseAt=null}={}){
  const grid=createDungeonC2JPInputGridV1({sceneSeed:1234,seedSource:'local-client-seed',initialPlayer:initial});
  const journal=createC2JKFixedBallisticJournal({sceneSeed:1234,seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  let p={...initial},cx=200,cy=600,ms=1;
  assert.equal(grid.capturePointer({kind:'down',pointerId:7,atMs:ms,position:p,clientX:cx,clientY:cy}),true);
  assert.equal(journal.registerShot({id:'projectile-1',sourceId:'taurus:enemy-1',origin:{x:0,z:-9},velocity:{x:.02,z:.3},hitRadius:.8,ttlTicks:250}),true);
  function move(){
    const delta={deltaX:.03,deltaY:0};cx+=delta.deltaX;cy+=delta.deltaY;ms++;
    p=projectDungeonDirectTouchV2B1({position:p,viewport,delta});
    assert.equal(grid.capturePointer({kind:'move',pointerId:7,atMs:ms,position:p,clientX:cx,clientY:cy,viewport,delta}),true);
  }
  for(let i=0;i<ticks;i++){
    if(releaseAt===null||i<releaseAt)for(let m=0;m<moves;m++)move();
    if(releaseAt!==null&&i===releaseAt-1){
      ms++;
      assert.equal(grid.capturePointer({kind:'up',pointerId:7,atMs:ms,position:p}),true);
    }
    assert.equal(journal.stepFrame(1000/30,p).error,null);
    assert.equal(journal.afterGridFrame(grid.captureFrame({deltaMs:1000/30,player:p,
      playerHp:3900,shieldHp:0,enemyCount:0})),true);
  }
  if(releaseAt===null)for(let i=0;i<tailMoves;i++)move();
  return {grid,journal,p,ms};
}
function rehash(r,fn){
  const x=structuredClone(r);fn(x);
  const {checksum:ignored,...body}=x.grid;
  x.grid.checksum=c2jkHash(body);
  const {checksum:ignored2,...outer}=x;
  x.checksum=c2jkHash(outer);return x;
}

test('C2JQ closes a real 253-tick Taurus window with >1000 events, no fake UP or missing ticks',async()=>{
  const {grid,journal}=run({ticks:253,moves:5,tailMoves:80});
  assert.equal(grid.snapshot().pointerEvents.length,1+253*5+80);
  assert.equal(grid.sealAtRoomExit(),true);
  assert.equal(journal.sealAtRoomExit(),true);
  const record=journal.snapshot();
  assert.equal(record.grid.version,DUNGEON_C2JQ_EXIT_GRID_VERSION);
  assert.equal(record.grid.roomExit.finalTick,253);
  assert.equal(record.grid.roomExit.excludedUnsampledPointerEvents,80);
  assert.equal(record.grid.pointerEvents.length,1266);
  assert.equal(record.grid.pointerEvents.at(-1).tick,253);
  assert.equal(record.grid.pointerActive,true);
  assert.equal(record.grid.completedGestures,0);
  assert.equal(record.ticks.length,253);
  assert.equal(record.grid.ticks.length,253);
  assert.equal(record.safeForSettlement,false);
  assert.equal(record.rewardSettlementEnabled,false);
  assert.equal(record.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(grid.capturePointer({kind:'up',pointerId:7,atMs:20000,position:initial}),false);
  assert.equal(grid.captureFrame({deltaMs:1000/30,player:initial,playerHp:100,
    shieldHp:0,enemyCount:0}),false);
  assert.equal(journal.snapshot().checksum,record.checksum);
  const audited=await auditC2JKFixedReplayV1(record);
  assert.equal(audited.ticksReplayed,253);
  assert.equal(audited.openGestureSubsetOnly,true);
  assert.equal(audited.taurusRoomExitSubsetOnly,true);
  assert.equal(audited.safeForSettlement,false);
});

test('C2JQ with real pointer UP before exit stays a closed input subset',async()=>{
  const {grid,journal}=run({ticks:253,moves:2,releaseAt:180});
  assert.equal(grid.sealAtRoomExit(),true);
  assert.equal(journal.sealAtRoomExit(),true);
  const r=await auditC2JKFixedReplayV1(journal.snapshot());
  assert.equal(r.taurusRoomExitSubsetOnly,true);
  assert.equal(r.inputGestureClosedAtSeal,true);
  assert.equal(r.openGestureSubsetOnly,false);
});

test('C2JQ endpoint cannot synthesize early 59-tick proof',()=>{
  const {grid,journal}=run({ticks:59,moves:2});
  assert.equal(grid.sealAtRoomExit(),false);
  assert.equal(journal.sealAtRoomExit(),false);
  assert.equal(journal.error,'C2JQ_ROOM_EXIT_NOT_PAIRED');
  assert.throws(()=>prepareC2JKFixedBallisticJson(journal.snapshot()),/C2JK_UNSAFE_EXPORT/);
});

test('C2JP 253-tick unsealed JSON with many unsampled tick-254 MOVEs remains fail-closed',()=>{
  const {grid,journal,p}=run({ticks:253,moves:3,tailMoves:200});
  assert.equal(grid.capturePointer({kind:'up',pointerId:7,atMs:10000,position:p}),true);
  assert.equal(journal.diagnostics().reasonCode,'C2JQ_UNSAMPLED_POINTER_EVENTS_AFTER_GRID_STOP');
  assert.equal(journal.diagnostics().unsampledPointerEvents,200);
  assert.throws(()=>journal.snapshot(),/C2JL_LIVE_GRID_UNPAIRED/);
});

test('C2JQ auditor rejects appended unsampled movement even after both checksum layers recomputed',async()=>{
  const {grid,journal}=run({ticks:253,moves:1});grid.sealAtRoomExit();journal.sealAtRoomExit();
  const bad=rehash(journal.snapshot(),r=>{
    const last=r.grid.pointerEvents.at(-1);
    r.grid.pointerEvents.push({...last,seq:last.seq+1,tick:254,atMs:last.atMs+1});
  });
  await assert.rejects(auditC2JKFixedReplayV1(bad),/C2JQ_UNSAMPLED_POINTER_IN_SEALED_WINDOW/);
});

test('C2JQ auditor rejects false end boundary despite rehashed records',async()=>{
  const {grid,journal}=run({ticks:253,moves:1});grid.sealAtRoomExit();journal.sealAtRoomExit();
  const forged=rehash(journal.snapshot(),r=>{r.grid.roomExit.finalTick=240;});
  await assert.rejects(auditC2JKFixedReplayV1(forged),/C2JQ_ROOM_EXIT_INVALID/);
});

test('C2JQ CLI accepts 500KB QA evidence without weakening legacy 256KB guard',()=>{
  const {grid,journal}=run({ticks:253,moves:5});grid.sealAtRoomExit();journal.sealAtRoomExit();
  const prepared=prepareC2JKFixedBallisticJson(journal.snapshot());
  assert.ok(Buffer.byteLength(prepared.json)>262144);
  const dir=mkdtempSync(join(tmpdir(),'c2jq-'));
  try{
    const file=join(dir,prepared.fileName);writeFileSync(file,prepared.json);
    const tool=new URL('../../server/tools/auditDungeonC2JKFixedReplayV1.cjs',import.meta.url).pathname;
    const run=spawnSync(process.execPath,[tool,file],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(run.stdout).taurusRoomExitSubsetOnly,true);
    const legacy=join(dir,'legacy.json');
    writeFileSync(legacy,JSON.stringify({grid:{version:'c15-dungeon-c2c-input-grid-v1'},pad:'x'.repeat(300000)}));
    const rejected=spawnSync(process.execPath,[tool,legacy],{encoding:'utf8'});
    assert.notEqual(rejected.status,0);
    assert.match(rejected.stderr,/C2JK_JSON_EXCEEDS_256K/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('C2JQ scene and UI only hook Taurus room exit, leave legacy C2C and native rewards locked',()=>{
  const scene=readFileSync(new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url),'utf8');
  const screen=readFileSync(new URL('../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js',import.meta.url),'utf8');
  const native=readFileSync(new URL('../android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterQaTraceExportPlugin.java',import.meta.url),'utf8');
  assert.match(scene,/currentRoomV38\?\.id === 'taurus_entry' &&/);
  assert.match(scene,/dungeonC2JPGrid\.sealAtRoomExit\(\)/);
  assert.match(scene,/dungeonC2JK\.sealAtRoomExit\(\)/);
  assert.match(scene,/dungeonC2CGrid\?\.capturePointer\(event\)/);
  assert.match(screen,/C2JQ ROOM EXIT/);
  assert.match(native,/C2JQ_GRID_VERSION/);
  assert.match(native,/!payload\.optBoolean\("rewardSettlementEnabled", true\)/);
});
