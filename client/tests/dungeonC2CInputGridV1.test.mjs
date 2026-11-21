import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonC2CInputGridV1,prepareDungeonC2CInputGridJsonV1} from '../src/game/dungeon/DungeonC2CInputGridV1.js';
import {shareDungeonQaJsonV2C13} from '../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js';
import {readFileSync} from 'node:fs';
import {projectDungeonDirectTouchV2B1} from '../src/game/dungeon/DungeonSeedTouchContractV2B1.js';
const base={sceneSeed:123,seedSource:'local-client-seed',initialPlayer:{x:0,z:12.5}};
const view={canvasWidth:400,canvasHeight:800,aspect:.5,halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
function create(){const j=createDungeonC2CInputGridV1(base);
  const at={x:0,z:12.5},dx={deltaX:12,deltaY:-4};
  const moved=projectDungeonDirectTouchV2B1({position:at,viewport:view,delta:dx});
  assert.equal(j.capturePointer({kind:'down',pointerId:1,atMs:10,clientX:100,clientY:200,position:at}),true);
  assert.equal(j.capturePointer({kind:'move',pointerId:1,atMs:50,clientX:112,clientY:196,
    viewport:view,delta:dx,position:moved}),true);
  assert.equal(j.capturePointer({kind:'up',pointerId:1,atMs:70,position:moved}),true);
  for(let i=0;i<126;i++)assert.equal(j.captureFrame({deltaMs:16.667,player:moved,
    playerHp:3900,shieldHp:0,enemyCount:4}),true);
  return j;}
test('C2C records accepted pointer gestures on 30Hz observational grid, with no reward authority',()=>{
  const j=create(),r=j.exportEvidence();
  assert.equal(r.version,'c15-dungeon-c2c-input-grid-v1');
  assert.equal(r.tickHz,30);assert.ok(r.ticks.length>=60);
  assert.equal(r.pointerEvents.length,3);assert.equal(r.completedGestures,1);
  assert.equal(r.fixedTickSimulationVerified,false);
  assert.equal(r.independentCombatReplayVerified,false);
  assert.equal(r.safeForSettlement,false);assert.equal(r.rewardSettlementEnabled,false);
  assert.equal(r.cloudRewards,false);assert.equal(r.battleId,null);
  assert.ok(j.tickCount>=r.ticks.length);
});
test('C2C snapshots cannot be modified and never contain UID/MAC/token',()=>{
  const r=create().exportEvidence();
  assert.equal(Object.isFrozen(r),true);assert.equal(Object.isFrozen(r.ticks[0]),true);
  assert.doesNotMatch(JSON.stringify(r),/\"uid\"|\"mac\"|\"idToken\"/);
});
test('C2C staging linkage requires UUID battleId but remains locally unverified',()=>{
  const j=createDungeonC2CInputGridV1({...base,battleId:'7e44d837-66d5-4530-a555-b08f845ce417',
    seedSource:'server-ticket-local-unverified'});
  assert.equal(j.snapshot().battleId,'7e44d837-66d5-4530-a555-b08f845ce417');
  assert.equal(j.snapshot().independentCombatReplayVerified,false);
  assert.throws(()=>createDungeonC2CInputGridV1({...base,seedSource:'server-ticket-local-unverified'}));
});
test('C2C rejects impossible pointer sequence and invalid frame gaps',()=>{
  const j=createDungeonC2CInputGridV1(base);
  assert.equal(j.capturePointer({kind:'up',pointerId:1,atMs:1,position:base.initialPlayer}),false);
  assert.equal(j.snapshot().captureError,'C2C_POINTER_SEQUENCE');
  const other=createDungeonC2CInputGridV1(base);
  assert.equal(other.captureFrame({deltaMs:160,player:base.initialPlayer,playerHp:10,
    shieldHp:0,enemyCount:0}),false);
  assert.equal(other.snapshot().captureError,'C2C_FRAME_GAP_OR_INVALID');
});
test('C2C cannot change saved checkpoint after tick cap',()=>{
  const j=create(),old=j.exportEvidence();
  for(let i=0;i<800;i++)j.captureFrame({deltaMs:16.667,player:old.ticks.at(-1).observedPlayer,
    playerHp:3900,shieldHp:0,enemyCount:4});
  assert.ok(j.snapshot().overflow);
  assert.equal(j.exportEvidence().checksum,old.checksum);
});

test('C2C produces an Android-shareable QA JSON filename without secret ticket',()=>{
  const prepared=prepareDungeonC2CInputGridJsonV1(create().exportEvidence(),
    new Date('2026-11-21T04:00:00.000Z'));
  assert.equal(prepared.fileName,'dungeon_taurus_c2c_20261121_040000.json');
  assert.equal(prepared.subsetCandidateReady,true);
  assert.ok(prepared.tickCount>=60);
  assert.doesNotMatch(prepared.json,/\"mac\"|\"idToken\"/);
});
test('C2C shares only the reviewed debug-only JSON filename through Android bridge',async()=>{
  const prepared=prepareDungeonC2CInputGridJsonV1(create().exportEvidence());
  let count=0;
  const status=await shareDungeonQaJsonV2C13(prepared,{native:true,
    nativePlugin:{shareJson:async args=>{count++;
      assert.equal(args.fileName,prepared.fileName);
      return {status:'chooser_opened'};}}});
  assert.equal(count,1);assert.equal(status,'NATIVE_SHARE_CHOOSER_OPENED');
});
test('C2C Android native JSON share remains gated by DEBUG and strict QA schema',()=>{
  const path=new URL('../android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterQaTraceExportPlugin.java',import.meta.url);
  const java=readFileSync(path,'utf8');
  assert.match(java,/if \(!BuildConfig\.DEBUG\)/);
  assert.match(java,/C2C_NAME_REGEX/);
  assert.match(java,/fixedTickSimulationVerified/);
  assert.match(java,/independentCombatReplayVerified/);
  assert.match(java,/rewardSettlementEnabled/);
});
