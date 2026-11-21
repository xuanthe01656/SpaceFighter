import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createC2JKFixedClock,createC2JKShot,stepC2JKShot,stepC2JKShots,
  isC2JKSupportedStraightShot} from '../src/game/dungeon/DungeonC2JKFixedBallisticCoreV1.js';
import {createC2JKFixedBallisticJournal,prepareC2JKFixedBallisticJson}
  from '../src/game/dungeon/DungeonC2JKFixedBallisticJournalV1.js';
import {createDungeonC2CInputGridV1}
  from '../src/game/dungeon/DungeonC2CInputGridV1.js';
const mk=()=>createC2JKShot({id:'shot-1',sourceId:'enemy-1',spawnTick:0,
  origin:{x:0,z:0},velocity:{x:0,z:.5},hitRadius:.8,ttlTicks:60});
const initial=()=>createDungeonC2CInputGridV1({sceneSeed:321,
  seedSource:'local-client-seed',initialPlayer:{x:0,z:12.5}});
function fixture(count=90){
  const grid=initial();
  const recorder=createC2JKFixedBallisticJournal({sceneSeed:321,
    seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  grid.capturePointer({kind:'down',pointerId:1,atMs:10,
    position:{x:0,z:12.5},clientX:10,clientY:20});
  grid.capturePointer({kind:'up',pointerId:1,atMs:11,position:{x:0,z:12.5}});
  recorder.registerShot({id:'shot-1',sourceId:'enemy-1',origin:{x:0,z:0},
    velocity:{x:0,z:.5},hitRadius:.8,ttlTicks:60});
  for(let i=0;i<count;i++){
    const step=recorder.stepFrame(1000/30,{x:0,z:12.5});
    assert.equal(step.error,null);
    const gridCaptured=grid.captureFrame({deltaMs:1000/30,player:{x:0,z:12.5},
      playerHp:100,shieldHp:0,enemyCount:0});
    assert.equal(recorder.afterGridFrame(gridCaptured),true);
  }
  return {grid,recorder,record:recorder.snapshot()};
}
test('C2JK fixed clock is frame-chunk independent for 30Hz ticks',()=>{
  const a=createC2JKFixedClock(),b=createC2JKFixedClock();
  for(let i=0;i<30;i++)a.advance(1000/30);
  for(let i=0;i<60;i++)b.advance(1000/60);
  assert.equal(a.tick,30);assert.equal(b.tick,30);
});
test('C2JK clock rejects elapsed-frame anomalies',()=>{
  const c=createC2JKFixedClock();
  assert.throws(()=>c.advance(-1),/C2JK_FRAME_DELTA_UNSUPPORTED/);
  assert.throws(()=>c.advance(105),/C2JK_FRAME_DELTA_UNSUPPORTED/);
});
test('C2JK shot uses exactly two 60Hz substeps in one 30Hz step',()=>{
  const result=stepC2JKShot(mk(),{x:6,z:12});
  assert.equal(result.next.z,1);
  assert.equal(result.next.ageTicks,1);
  assert.equal(result.contact,false);
});
test('C2JK segment collision catches fast overshoot between substeps',()=>{
  const shot=createC2JKShot({id:'shot-2',sourceId:'enemy-1',spawnTick:0,
    origin:{x:0,z:0},velocity:{x:0,z:1.1},hitRadius:.4,ttlTicks:60});
  assert.equal(stepC2JKShot(shot,{x:0,z:.6}).contact,true);
});
test('C2JK collision returns contacts only once',()=>{
  const first=stepC2JKShots([mk()],{x:0,z:.25});
  assert.deepEqual(first.contacts,['shot-1']);
  assert.equal(first.active.length,0);
  assert.equal(stepC2JKShots(first.active,{x:0,z:.25}).contacts.length,0);
});
test('C2JK expiry is deterministic',()=>{
  let shot=createC2JKShot({id:'a',sourceId:'enemy',spawnTick:0,
    origin:{x:0,z:-10},velocity:{x:.1,z:0},hitRadius:.1,ttlTicks:2});
  const one=stepC2JKShot(shot,{x:0,z:14});
  assert.equal(one.expired,false);
  const two=stepC2JKShot(one.next,{x:0,z:14});
  assert.equal(two.expired,true);
});
test('C2JK ID uniqueness is strict',()=>assert.throws(
  ()=>stepC2JKShots([mk(),mk()],{x:0,z:14}),/C2JK_DUPLICATE_SHOT/));
test('C2JK invalid shot shapes and velocities reject',()=>{
  assert.throws(()=>createC2JKShot({id:'x'}),/C2JK_INVALID_SHOT/);
  assert.throws(()=>createC2JKShot({id:'b',sourceId:'e',spawnTick:0,origin:{x:0,z:0},velocity:{x:0,z:0},hitRadius:.8}),/C2JK_INVALID_SPEED/);
});
test('C2JK only supports straight snapshot or predictive attacks',()=>{
  assert.equal(isC2JKSupportedStraightShot({aimMode:'predictive',speed:.5,guidanceMs:0}),true);
  assert.equal(isC2JKSupportedStraightShot({aimMode:'soft_homing',speed:.5,guidanceMs:400}),false);
  assert.equal(isC2JKSupportedStraightShot(null),false);
});
test('C2JK genuine observed contact and 90 ticks are exported QA-only',()=>{
  const {record}=fixture();
  assert.equal(record.ticks.length,90);
  assert.equal(record.ticks.flatMap(r=>r.contacts).length,1);
  assert.equal(record.safeForSettlement,false);
  assert.equal(record.fullCombatReplayVerified,false);
  assert.equal(record.trueApkServerParity,'NOT_VERIFIED');
  const file=prepareC2JKFixedBallisticJson(record,new Date('2026-11-21T13:04:05Z'));
  assert.equal(file.fileName,'dungeon_taurus_c2jk_20261121_130405.json');
});
test('C2JK is disabled for authenticated/staging tickets in this phase',()=>assert.throws(
  ()=>createC2JKFixedBallisticJournal({sceneSeed:1,
    seedSource:'server-ticket-local-unverified',getGrid:()=>initial().snapshot()}),
  /C2JK_GUEST_QA_ONLY/));
test('C2JK recorder records no unreviewed projectile silently',()=>{
  const r=createC2JKFixedBallisticJournal({sceneSeed:1,
    seedSource:'local-client-seed',getGrid:()=>initial().snapshot()});
  assert.equal(r.registerShot({id:'bad'}),false);
  assert.match(r.snapshot().captureError,/C2JK_INVALID_SHOT/);
  assert.throws(()=>prepareC2JKFixedBallisticJson(r.snapshot()),/C2JK_UNSAFE_EXPORT/);
});
test('C2JK scene integration uses shared physics for live meshes and real damage gate',()=>{
  const scene=fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url),'utf8');
  assert.match(scene,/VITE_SF_DUNGEON_C2JK_SHARED_FIXED30/);
  assert.match(scene,/const advancedC2JK = dungeonC2JK\.stepFrame/);
  assert.match(scene,/eb\.position\.x = state\.x/);
  assert.match(scene,/damagePlayer\(\{rawDamage:eb\._damage/);
  assert.match(scene,/if \(!c2jkAdvanced\) for/);
  assert.match(scene,/!dungeonC2BLocalQa && !dungeonV2B2LocalQa/);
});
test('C2JK shared physics rejects full combat settlement claims',()=>{
  const record=fixture().record;
  assert.throws(()=>prepareC2JKFixedBallisticJson({...record,cloudRewards:true}),/C2JK_UNSAFE_EXPORT/);
});
test('C2JK bundle uses existing APK QA share interface',async()=>{
  const {shareDungeonQaJsonV2C13}=await import('../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js');
  const prepared=prepareC2JKFixedBallisticJson(fixture().record);
  let sent;
  const status=await shareDungeonQaJsonV2C13(prepared,{native:true,
    nativePlugin:{shareJson:async value=>{sent=value;return {status:'chooser_opened'};}}});
  assert.equal(status,'NATIVE_SHARE_CHOOSER_OPENED');
  assert.equal(sent.fileName,prepared.fileName);
});

test('C2JK native export whitelist requires QA-only shared-core schema',()=>{
  const java=fs.readFileSync(new URL('../android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterQaTraceExportPlugin.java',import.meta.url),'utf8');
  assert.match(java,/C2JK_NAME_REGEX/);
  assert.match(java,/else if \(isC2JK\)/);
  assert.match(java,/payload\.optBoolean\("clientFixedBallisticStepObserved", false\)/);
  assert.match(java,/!payload\.optBoolean\("fullCombatReplayVerified", true\)/);
  assert.match(java,/payload\.isNull\("battleId"\)/);
});

// C2JL: the user APK produced 261 real ballistic ticks with only 136 cached
// C2F GRID ticks. Never silently approve this as an exact same-window replay.
test('C2JL the 261-ballistic / 136-grid stale window is rejected at export',()=>{
  const {record}=fixture(261);
  const stale=structuredClone(record);
  stale.grid.ticks=stale.grid.ticks.slice(0,136);
  assert.equal(stale.ticks.length,261);
  assert.equal(stale.grid.ticks.length,136);
  assert.throws(()=>prepareC2JKFixedBallisticJson(stale),/C2JK_UNSAFE_EXPORT/);
});
test('C2JL live recorder rejects a frozen legacy C2F grid before JSON export',()=>{
  const grid=initial();
  let chosenGrid;
  const recorder=createC2JKFixedBallisticJournal({sceneSeed:321,
    seedSource:'local-client-seed',getGrid:()=>chosenGrid||grid.snapshot()});
  grid.capturePointer({kind:'down',pointerId:1,atMs:10,
    position:{x:0,z:12.5},clientX:10,clientY:20});
  grid.capturePointer({kind:'up',pointerId:1,atMs:11,position:{x:0,z:12.5}});
  for(let i=0;i<261;i++){
    recorder.stepFrame(1000/30,{x:0,z:12.5});
    const ok=grid.captureFrame({deltaMs:1000/30,player:{x:0,z:12.5},
      playerHp:100,shieldHp:0,enemyCount:0});
    if(i===135)chosenGrid=grid.snapshot();
    if(i<269)assert.equal(recorder.afterGridFrame(ok),true);
  }
  assert.equal(chosenGrid.ticks.length,136);
  assert.throws(()=>recorder.snapshot(),/C2JL_LIVE_GRID_UNPAIRED/);
});
test('C2JL seals 270 exact matching GRID ticks automatically after render observation',()=>{
  const {record,recorder}=fixture(270);
  assert.equal(recorder.sealed,true);
  assert.equal(record.grid.ticks.length,270);
  assert.equal(record.ticks.length,270);
  assert.equal(recorder.error,null);
});
test('C2JL preserved paired snapshot survives extended gameplay and GRID overflow',()=>{
  const {grid,recorder,record}=fixture(270);
  for(let i=0;i<110;i++){
    assert.equal(recorder.stepFrame(1000/30,{x:0,z:12.5}).error,null);
    recorder.afterGridFrame(grid.captureFrame({deltaMs:1000/30,
      player:{x:0,z:12.5},playerHp:100,shieldHp:0,enemyCount:0}));
  }
  assert.equal(recorder.error,null);
  assert.equal(recorder.snapshot().checksum,record.checksum);
  assert.equal(recorder.snapshot().grid.ticks.length,270);
  assert.equal(recorder.recordedTicks,270);
});
test('C2JL live projectiles continue after 270-tick evidence seal',()=>{
  const {recorder,record}=fixture(270);
  assert.equal(recorder.registerShot({id:'postseal-1',sourceId:'enemy-1',
    origin:{x:0,z:-1},velocity:{x:0,z:.5},hitRadius:.5,ttlTicks:20}),true);
  const advanced=recorder.stepFrame(1000/30,{x:0,z:12.5});
  assert.equal(advanced.error,null);
  assert.equal(advanced.frames.length,1);
  assert.equal(advanced.frames[0].activeShots.some(s=>s.id==='postseal-1'),true);
  assert.equal(recorder.snapshot().checksum,record.checksum);
});
test('C2JL failed grid observation makes QA fail closed without crashing gameplay',()=>{
  const grid=initial();
  const recorder=createC2JKFixedBallisticJournal({sceneSeed:321,
    seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  assert.equal(recorder.afterGridFrame(false),false);
  assert.equal(recorder.error,'C2JL_GRID_CAPTURE_FAILED');
  assert.equal(recorder.stepFrame(1000/30,{x:0,z:12.5}).error,'C2JL_GRID_CAPTURE_FAILED');
});
test('C2JL incomplete pointer gesture at seal is not accepted as QA',()=>{
  const grid=initial();
  const recorder=createC2JKFixedBallisticJournal({sceneSeed:321,
    seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  grid.capturePointer({kind:'down',pointerId:1,atMs:10,
    position:{x:0,z:12.5},clientX:10,clientY:20});
  let last;
  for(let i=0;i<270;i++){
    recorder.stepFrame(1000/30,{x:0,z:12.5});
    last=recorder.afterGridFrame(grid.captureFrame({deltaMs:1000/30,
      player:{x:0,z:12.5},playerHp:100,shieldHp:0,enemyCount:0}));
  }
  assert.equal(last,false);
  assert.equal(recorder.error,'C2JL_LIVE_GRID_UNPAIRED');
});
test('C2JP scene pairs its own live GRID after observer frame, preserving C2E legacy',()=>{
  const scene=fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url),'utf8');
  assert.match(scene,/getGrid:\(\)=>dungeonC2JPGrid\.snapshot\(\)/);
  assert.match(scene,/dungeonC2JK\?\.afterGridFrame\(gridCapturedC2JP\)/);
  assert.match(scene,/dungeonC2JK\?\.invalidate\('C2JL_GRID_CAPTURE_EXCEPTION'\)/);
  assert.match(scene,/getGrid:\(\)\s*=>\s*dungeonC2CGrid\.exportCombatEvidence\(\)/);
});
