import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonC2CInputGridV1} from '../src/game/dungeon/DungeonC2CInputGridV1.js';
import {createDungeonC2ECombatWitnessV1,prepareDungeonC2ECombatWitnessJsonV1}
  from '../src/game/dungeon/DungeonC2ECombatWitnessV1.js';
const grid=()=>createDungeonC2CInputGridV1({sceneSeed:123,
  seedSource:'local-client-seed',initialPlayer:{x:0,z:12.5}});
function witness(){const g=grid();return {g,w:createDungeonC2ECombatWitnessV1({
  sceneSeed:123,seedSource:'local-client-seed',getGrid:()=>g.snapshot()})};}
test('C2E witness is QA-only, finite and carries no ticket, UID or MAC',()=>{
  const {g,w}=witness();
  assert.equal(w.capture({kind:'room_start'}),true);
  const value=w.snapshot();
  assert.equal(value.events.length,0); // no fabricated tick before sampling
  assert.equal(value.safeForSettlement,false);
  assert.equal(value.fullCombatReplayVerified,false);
  assert.equal(value.grid.version,'c15-dungeon-c2c-input-grid-v1');
  assert.equal(JSON.stringify(value).includes('mac'),false);
  assert.equal(g.tickCount,0);
});
test('C2E exports a single paired GRID + bounded real-causal observation',()=>{
  const {g,w}=witness();
  w.capture({kind:'room_start'});
  g.captureFrame({deltaMs:36,player:{x:0,z:12.5},playerHp:100,
    shieldHp:0,enemyCount:0});
  const exported=w.snapshot();
  assert.equal(exported.events[0].tick,1);
  const file=prepareDungeonC2ECombatWitnessJsonV1(exported,new Date('2026-11-21T08:09:10Z'));
  assert.equal(file.fileName,'dungeon_taurus_c2e_20261121_080910.json');
  assert.equal(JSON.parse(file.json).checksum,exported.checksum);
  assert.equal(file.diagnosticOnly,true);
});
test('C2E excludes a combat event after the last sampled grid tick',()=>{
  const {g,w}=witness();
  g.captureFrame({deltaMs:36,player:{x:0,z:12.5},playerHp:100,
    shieldHp:0,enemyCount:0});
  w.capture({kind:'room_start'}); // tick 2 without a corresponding observation
  assert.equal(w.snapshot().events.length,0);
});
test('C2E bounds event count and rejects invalid values without changing combat',()=>{
  const {w}=witness();
  assert.equal(w.capture({kind:'enemy_fire',enemyId:'any',bulletId:'bad',amount:-1}),false);
  assert.equal(w.snapshot().captureError,'C2E_EVENT_INVALID');
});
test('C2E ticket-shaped seed is allowed only with UUID battle ID',()=>{
  const g=grid();
  assert.throws(()=>createDungeonC2ECombatWitnessV1({sceneSeed:123,
    seedSource:'server-ticket-local-unverified',getGrid:()=>g.snapshot()}),/C2E_START_INVALID/);
});
test('C2E rejects export flags claiming economic authority',()=>{
  const {w}=witness();
  const changed={...w.snapshot(),cloudRewards:true};
  assert.throws(()=>prepareDungeonC2ECombatWitnessJsonV1(changed),/C2E_EXPORT_UNSAFE/);
});

test('C2E exported file passes unchanged native sharing adapter contract',async()=>{
  const {g,w}=witness();w.capture({kind:'room_start'});
  g.captureFrame({deltaMs:36,player:{x:0,z:12.5},playerHp:100,shieldHp:0,enemyCount:0});
  const prepared=prepareDungeonC2ECombatWitnessJsonV1(w.snapshot());
  const {shareDungeonQaJsonV2C13}=await import('../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js');
  let submitted;
  const answer=await shareDungeonQaJsonV2C13(prepared,{native:true,
    nativePlugin:{shareJson:async x=>{submitted=x;return {status:'chooser_opened'};}}});
  assert.equal(answer,'NATIVE_SHARE_CHOOSER_OPENED');
  assert.equal(submitted.fileName,prepared.fileName);
  assert.equal(submitted.json,prepared.json);
});
