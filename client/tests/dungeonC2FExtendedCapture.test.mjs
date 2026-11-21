import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDungeonC2CInputGridV1,DUNGEON_C2F_COMBAT_WINDOW_TICKS} from '../src/game/dungeon/DungeonC2CInputGridV1.js';
import {createDungeonC2ECombatWitnessV1,prepareDungeonC2ECombatWitnessJsonV1,
  C2F_CAUSAL_EVENT_WINDOW_LIMIT} from '../src/game/dungeon/DungeonC2ECombatWitnessV1.js';
const base={sceneSeed:3060395586,seedSource:'local-client-seed',initialPlayer:{x:0,z:12.5}};
const frame={deltaMs:1000/30+.001,player:{x:0,z:12.5},playerHp:3962,shieldHp:0,enemyCount:0};
const advance=(g,n)=>{for(let i=0;i<n;i++)assert.equal(g.captureFrame(frame),true);};
const gesture=g=>{
  assert.equal(g.capturePointer({kind:'down',pointerId:9,atMs:10,position:base.initialPlayer,clientX:200,clientY:700}),true);
  assert.equal(g.capturePointer({kind:'up',pointerId:9,atMs:20,position:base.initialPlayer}),true);
};
const witness=(g)=>createDungeonC2ECombatWitnessV1({sceneSeed:base.sceneSeed,
  seedSource:base.seedSource,getGrid:()=>g.exportCombatEvidence(),getTick:()=>g.tickCount});
test('C2F preserves the legacy C2C first-after-release checkpoint unchanged',()=>{
  const g=createDungeonC2CInputGridV1(base);gesture(g);advance(g,75);
  const old=g.exportEvidence().checksum;
  advance(g,90);
  assert.equal(g.exportEvidence().checksum,old);
  assert.ok(g.exportCombatEvidence().ticks.length>=150);
  assert.ok(g.exportCombatEvidence().ticks.length>g.exportEvidence().ticks.length);
  assert.equal(g.exportCombatEvidence().qaOnly,true);
});
test('C2F retains the later safe observation prefix before C2C frame overflow',()=>{
  const g=createDungeonC2CInputGridV1(base);gesture(g);advance(g,DUNGEON_C2F_COMBAT_WINDOW_TICKS);
  const saved=g.exportCombatEvidence();
  assert.equal(saved.ticks.length,270);
  for(let i=0;i<150;i++)g.captureFrame(frame);
  assert.equal(g.snapshot().overflow,true);
  assert.equal(g.exportCombatEvidence().checksum,saved.checksum);
  assert.equal(g.exportCombatEvidence().overflow,false);
  assert.equal(g.exportCombatEvidence().captureError,null);
});
test('C2F while finger is down at window close retains last completed safe evidence',()=>{
  const g=createDungeonC2CInputGridV1(base);gesture(g);advance(g,220);
  const safe=g.exportCombatEvidence();
  assert.equal(g.capturePointer({kind:'down',pointerId:10,atMs:5000,
    position:base.initialPlayer,clientX:200,clientY:700}),true);
  advance(g,55);
  const chosen=g.exportCombatEvidence();
  assert.equal(chosen.pointerActive,false);
  assert.equal(chosen.completedGestures,1);
  assert.equal(chosen.checksum,safe.checksum);
  assert.ok(chosen.ticks.length>=210&&chosen.ticks.length<=220);
});
test('C2F records combat against live grid tick, not stale 15-tick checkpoint',()=>{
  const g=createDungeonC2CInputGridV1(base);gesture(g);
  const w=witness(g);w.capture({kind:'room_start'});
  advance(g,82);
  const saved=g.exportCombatEvidence().ticks.length;
  assert.ok(saved<g.tickCount);
  assert.equal(w.capture({kind:'enemy_hit',enemyId:'temp',amount:1,hp:1}),true);
  advance(g,11);
  const data=w.snapshot();
  assert.equal(data.events.at(-1).tick,83);
  assert.equal(data.grid.ticks.length>=90,true);
  assert.ok(data.grid.ticks.length>saved);
});
test('C2F stops event capture after 270-tick seal and never sets overflow',()=>{
  const g=createDungeonC2CInputGridV1(base);gesture(g);
  const w=witness(g);w.capture({kind:'room_start'});
  advance(g,270);
  assert.equal(w.capture({kind:'enemy_hit',enemyId:'x',amount:1,hp:1}),false);
  const before=w.snapshot().checksum;
  for(let i=0;i<100;i++)w.capture({kind:'enemy_hit',enemyId:'x',amount:1,hp:1});
  assert.equal(w.snapshot().checksum,before);
  assert.equal(w.snapshot().overflow,false);
  assert.equal(w.snapshot().grid.ticks.length,270);
});
test('C2F seals at 192 causal events without corrupting an existing prefix',()=>{
  const g=createDungeonC2CInputGridV1(base);gesture(g);
  const w=witness(g);w.capture({kind:'room_start'});
  advance(g,1);
  for(let i=1;i<C2F_CAUSAL_EVENT_WINDOW_LIMIT;i++)
    assert.equal(w.capture({kind:'enemy_hit',enemyId:'x',amount:1,hp:1}),true);
  assert.equal(w.capture({kind:'enemy_hit',enemyId:'x',amount:1,hp:1}),false);
  assert.equal(w.eventCount,C2F_CAUSAL_EVENT_WINDOW_LIMIT);
  assert.equal(w.snapshot().overflow,false);
  assert.equal(w.snapshot().captureError,null);
});
test('C2F extended Android JSON remains bounded and explicitly non-settlement',()=>{
  const g=createDungeonC2CInputGridV1(base);gesture(g);
  const w=witness(g);w.capture({kind:'room_start'});
  advance(g,270);
  const prepared=prepareDungeonC2ECombatWitnessJsonV1(w.snapshot());
  assert.equal(prepared.gridTicks,270);
  assert.ok(new TextEncoder().encode(prepared.json).length<256*1024);
  assert.equal(JSON.parse(prepared.json).rewardSettlementEnabled,false);
  assert.doesNotMatch(prepared.json,/"uid"|"idToken"|"mac"/);
  const dense=createDungeonC2CInputGridV1(base);
  const denseW=witness(dense);denseW.capture({kind:'room_start'});
  const v={canvasWidth:400,canvasHeight:800,aspect:.5,halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
  dense.capturePointer({kind:'down',pointerId:1,atMs:100,position:base.initialPlayer,clientX:200,clientY:700});
  for(let i=0;i<254;i++)dense.capturePointer({kind:'move',pointerId:1,atMs:101+i,
    position:base.initialPlayer,clientX:200,clientY:700,viewport:v,delta:{deltaX:0,deltaY:0}});
  dense.capturePointer({kind:'up',pointerId:1,atMs:355,position:base.initialPlayer});
  for(let i=1;i<C2F_CAUSAL_EVENT_WINDOW_LIMIT;i++)
    denseW.capture({kind:'enemy_hit',enemyId:'random_enemy',amount:99999999,hp:88888888});
  advance(dense,270);
  const denseRecord=denseW.snapshot();
  const compact=prepareDungeonC2ECombatWitnessJsonV1(denseRecord);
  assert.equal(denseRecord.grid.pointerEvents.length,256);
  assert.ok(new TextEncoder().encode(compact.json).length<256*1024);
  assert.deepEqual(JSON.parse(compact.json),JSON.parse(JSON.stringify(denseRecord)));
});
test('C2F integration stays passive and uses a separate live tick accessor',()=>{
  const scene=readFileSync(new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js',import.meta.url),'utf8');
  assert.match(scene,/getGrid:\(\) => dungeonC2CGrid\.exportCombatEvidence\(\)/);
  assert.match(scene,/getTick:\(\) => dungeonC2CGrid\.tickCount/);
  assert.match(ui,/Xem C2F COMBAT/);
  assert.doesNotMatch(ui,/C2F.*rewards enabled/i);
});
