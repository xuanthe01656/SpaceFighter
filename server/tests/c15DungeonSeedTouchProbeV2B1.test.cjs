'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createC15DungeonReplayV2A} = require('../lib/c15DungeonReplayV2A.cjs');
const {VERSION:V1_VERSION,createDungeonContractV1} = require('../lib/c15DungeonFoundationV1.cjs');
const {validateChunk} = require('../lib/combatInputJournalV8.cjs');
const {parseC15DungeonSeedTouchV2B1Config,
  createC15DungeonSeedTouchProbeV2B1} = require('../lib/c15DungeonSeedTouchProbeV2B1.cjs');

const SID = 'a4b5aaed-8cde-4a58-82dd-774fa8a22901';
const BID = 'ca62f851-9fad-4ceb-8d0c-6d24d6f22d00';
const UID = 'dungeon-v2b1-qa-uid';
const ISSUED = Date.UTC(2026,10,19,10,0,0);
const env = Object.freeze({
  GAME_C15_DUNGEON_V1_ENABLED:'true',
  GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V1_ALLOW_UIDS:UID,
  GAME_C15_DUNGEON_V2A_ENABLED:'true',
  GAME_C15_DUNGEON_V2A_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B1_ENABLED:'true',
  GAME_C15_DUNGEON_V2B1_QA_APPROVED:'true',
  GOOGLE_CLOUD_PROJECT:'demo-spacefighter-dungeon-v2b1',
  GCLOUD_PROJECT:'demo-spacefighter-dungeon-v2b1',
  FIREBASE_PROJECT_ID:'demo-spacefighter-dungeon-v2b1',
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:38081',
});
const viewport = Object.freeze({canvasWidth:400,canvasHeight:800,aspect:.5,
  halfHeight:15,inset:1.8,pointerSpeedMultiplier:1});
const err = code => error => error?.code===code;
async function imports() {
  const shared = await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonSeedTouchContractV2B1.js')).href);
  const controller = await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/combat/ShipInputController.js')).href);
  return {shared,controller};
}
async function fixture() {
  const replay = await createC15DungeonReplayV2A({env, now:()=>ISSUED+100});
  const listing = await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/constants.js')).href);
  const content = await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonContentCatalogV393.js')).href);
  const contract = createDungeonContractV1('dung_taurus',{
    listings:listing.DUNGEON_CONFIG,content:content.DUNGEON_CONTENT_CATALOG_V393,
    hazards:content.DUNGEON_HAZARD_PROFILES_V393,
    objectives:content.DUNGEON_OBJECTIVE_PROFILES_V393,
  });
  const admission = {
    version:V1_VERSION,uid:UID,sessionId:SID,battleId:BID,
    dungeonId:'dung_taurus',requestId:'dungeon_v2b1_entry_req_001',
    requestDigest:'f'.repeat(64),contractDigest:contract.contractDigest,
    energyCharged:contract.energyCost,admittedAtMs:ISSUED,
    expiresAtMs:ISSUED+20*60*1000,status:'admitted-emulator',
    qaOnly:true,source:'firestore-emulator',independentReplayVerified:false,
    rewardSettlementEnabled:false,cloudRewards:false,
  };
  const replayState = replay.openFromStoredAdmission(admission,{
    loadoutHash:'a'.repeat(64),expectedUid:UID,
    expectedSessionId:SID,expectedBattleId:BID,
  });
  const probe = await createC15DungeonSeedTouchProbeV2B1({env,replayService:replay});
  return {replay,replayState,probe};
}

test('V2B.1 default OFF and never offers reward settlement', async () => {
  assert.equal(parseC15DungeonSeedTouchV2B1Config({}),null);
  const off=await createC15DungeonSeedTouchProbeV2B1({});
  assert.equal(off.enabled,false);
  assert.equal(off.productionEnabled,false);
  assert.throws(()=>off.assessSceneSeed({}),err('C15_DUNGEON_V2B1_DISABLED'));
  assert.throws(()=>off.projectPointerSamples({}),err('C15_DUNGEON_V2B1_DISABLED'));
  assert.throws(()=>off.claim({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});

test('V2B.1 requires explicit approved V1+V2A emulator; no production project', () => {
  for (const row of [
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {GCLOUD_PROJECT:'distributed-inn-482605-c6'},
    {FIRESTORE_EMULATOR_HOST:'host.example:8080'},
    {FIRESTORE_EMULATOR_HOST:''},
    {GAME_C15_DUNGEON_V2B1_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2A_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ALLOW_UIDS:''},
  ]) assert.throws(()=>parseC15DungeonSeedTouchV2B1Config({...env,...row}),TypeError);
  assert.equal(parseC15DungeonSeedTouchV2B1Config({...env,
    GAME_C15_DUNGEON_V2B1_ENABLED:'false'}),null);
});

test('V2B.1 enabled probe requires V2A service, not client-owned state', async () => {
  await assert.rejects(createC15DungeonSeedTouchProbeV2B1({env}),TypeError);
  await assert.rejects(createC15DungeonSeedTouchProbeV2B1({env,replayService:{
    enabled:true,emulatorOnly:false,inspect:()=>({})}}),TypeError);
});

test('shared FNV seed matches legacy DungeonScene algorithm including unicode and zero fallback', async () => {
  const {shared}=await imports();
  function legacy(...parts) {
    let hash=2166136261;
    for(const char of parts.join('|')) {hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return hash>>>0||1;
  }
  for(const parts of [
    ['dung_taurus','guest','local'],['dung_taurus','abcd-123','battle1'],
    [0,'room',null],['đặc biệt','🌌','1'],['',''],
    ['dung_nereus','boss','dragon'],['dung_abaddon','profile','room2'],
  ]) assert.equal(shared.dungeonSceneStableSeedV2B1(...parts),legacy(...parts));
});

test('DungeonScene now references shared seed; all prior seed callsites preserved', () => {
  const source=fs.readFileSync(path.resolve(__dirname,
    '../../client/src/components/Dungeon/DungeonScene.js'),'utf8');
  assert.match(source,/dungeonSceneStableSeedV2B1 as stableSeed/);
  assert.doesNotMatch(source,/const stableSeed\s*=/);
  assert.match(source,/stableSeed\(\s*dungeonId,\s*gsRef\.current/);
  assert.match(source,/seed:\s*dungeonSeedV38/);
});

test('seed projection requires known Taurus fields and never accepts client reward fields', async () => {
  const {shared}=await imports();
  assert.equal(shared.dungeonSceneEntrySeedV2B1({dungeonId:'dung_taurus',
    profileId:'guest',runKey:'local'}),shared.dungeonSceneStableSeedV2B1('dung_taurus','guest','local'));
  for(const input of [
    {dungeonId:'dung_nereus',profileId:'guest',runKey:'local'},
    {dungeonId:'dung_taurus',profileId:1,runKey:'local'},
    {dungeonId:'dung_taurus',profileId:'guest',runKey:''},
  ]) assert.throws(()=>shared.dungeonSceneEntrySeedV2B1(input),TypeError);
});

test('seed audit makes current V2A and scene seed divergence explicit without authority', async () => {
  const {probe,replayState}=await fixture();
  const report=probe.assessSceneSeed({replayState,serverProfileId:'guest',
    sceneRunKeySource:'server-issued-battle-id'});
  assert.equal(report.candidateSceneSeed,await (async()=>{
    const {shared}=await imports();
    return shared.dungeonSceneStableSeedV2B1('dung_taurus','guest',BID);
  })());
  assert.equal(report.v2aPreviewSeed,replayState.seed);
  assert.equal(typeof report.seedMatchesPreview,'boolean');
  assert.equal(typeof report.spawnPlanMatchesPreview,'boolean');
  assert.equal(report.runtimeSceneProfileAndRunKeyVerified,false);
  assert.equal(report.safeForSettlement,false);
  assert.equal(report.cloudRewards,false);
  assert.ok(Object.isFrozen(report));
});

test('seed probe rejects arbitrary runKey, spoofed profile and mutated state', async () => {
  const {probe,replayState}=await fixture();
  assert.throws(()=>probe.assessSceneSeed({replayState,serverProfileId:'guest',
    sceneRunKeySource:'client-input'}),err('C15_DUNGEON_V2B1_PROFILE_UNTRUSTED'));
  assert.throws(()=>probe.assessSceneSeed({replayState,serverProfileId:'../../secret',
    sceneRunKeySource:'server-issued-battle-id'}),err('C15_DUNGEON_V2B1_PROFILE_UNTRUSTED'));
  assert.throws(()=>probe.assessSceneSeed({replayState:{...replayState},serverProfileId:'guest',
    sceneRunKeySource:'server-issued-battle-id'}),err('C15_DUNGEON_V2A_STATE_UNTRUSTED'));
});

test('touch step equals production worldDragDelta plus immediate clamp', async () => {
  const {shared,controller}=await imports();
  let position={x:0,z:12.5};
  for(const delta of [{deltaX:32,deltaY:12},{deltaX:-110,deltaY:92},
    {deltaX:400,deltaY:-200},{deltaX:1000,deltaY:999},
    {deltaX:-1000,deltaY:-999},{deltaX:0,deltaY:0}]) {
    const motion=controller.worldDragDelta(delta.deltaX,delta.deltaY,
      viewport.canvasWidth,viewport.canvasHeight,15,.5,1);
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
    const expected={x:clamp(position.x+motion.x,-5.7,5.7),
      z:clamp(position.z+motion.z,-13.2,13.2)};
    position=shared.projectDungeonDirectTouchV2B1({position,viewport,delta});
    assert.deepEqual(position,expected);
  }
});

test('portrait and landscape uses CSS rect for deltas and independent renderer aspect', async () => {
  const {shared,controller}=await imports();
  for(const v of [{...viewport,aspect:.45},
    {...viewport,aspect:1.3,canvasWidth:800,canvasHeight:400},
    {...viewport,aspect:.8,canvasWidth:480,canvasHeight:800}]) {
    const position={x:0,z:0};
    const delta={deltaX:45,deltaY:-15};
    const motion=controller.worldDragDelta(45,-15,v.canvasWidth,v.canvasHeight,15,v.aspect,1);
    const result=shared.projectDungeonDirectTouchV2B1({position,viewport:v,delta});
    assert.equal(result.x,motion.x);
    assert.equal(result.z,motion.z);
  }
});

test('bad pixel samples, viewport gains and out-of-bounds origin fail closed', async () => {
  const {shared}=await imports();
  const base={position:{x:0,z:12.5},viewport,delta:{deltaX:10,deltaY:15}};
  for(const override of [
    {delta:{deltaX:10,deltaY:15,victory:true}},
    {delta:{deltaX:NaN,deltaY:15}},
    {delta:{deltaX:30000,deltaY:15}},
    {position:{x:999,z:0}},
    {viewport:{...viewport,inset:0}},
    {viewport:{...viewport,halfHeight:14}},
    {viewport:{...viewport,pointerSpeedMultiplier:4}},
    {viewport:{...viewport,canvasHeight:0}},
  ]) assert.throws(()=>shared.projectDungeonDirectTouchV2B1({...base,...override}),TypeError);
});

test('pointer trace is deterministic but never equated with C15 direction journal', async () => {
  const {shared}=await imports();
  const params={initialPosition:{x:0,z:12.5},viewport,
    deltas:Array.from({length:64},(_,i)=>({deltaX:i%3===0?17:-11,deltaY:i%2?14:-9}))};
  const a=shared.projectDungeonTouchSamplesV2B1(params);
  const b=shared.projectDungeonTouchSamplesV2B1(params);
  assert.deepEqual(a,b);
  assert.ok(Object.isFrozen(a.positions));
  assert.equal(a.inputJournalEquivalent,false);
  assert.equal(a.safeForSettlement,false);
  assert.throws(()=>shared.projectDungeonTouchSamplesV2B1({...params,
    deltas:[]}),TypeError);
  assert.throws(()=>validateChunk({protocol:'pve-input-v1',battleId:BID,startTick:0,
    frames:[{x:0,z:0,deltaX:7,deltaY:4}]}));
});

test('server probe pointer projection binds V2A issued state, still untrusted', async () => {
  const {probe,replayState}=await fixture();
  const projected=probe.projectPointerSamples({replayState,viewport,
    deltas:[{deltaX:10,deltaY:6},{deltaX:-6,deltaY:-3}]});
  assert.equal(projected.positions.length,2);
  assert.equal(projected.battleId,BID);
  assert.equal(projected.touchRuntimeParityVerified,false);
  assert.equal(projected.inputJournalEquivalent,false);
  assert.equal(projected.independentReplayVerified,false);
  assert.equal(projected.rewardSettlementEnabled,false);
  assert.ok(Object.isFrozen(projected));
});

test('server probe rejects copied V2A state and arbitrary viewport schema', async () => {
  const {probe,replayState}=await fixture();
  assert.throws(()=>probe.projectPointerSamples({replayState:structuredClone(replayState),
    viewport,deltas:[{deltaX:1,deltaY:1}]}),err('C15_DUNGEON_V2A_STATE_UNTRUSTED'));
  assert.throws(()=>probe.projectPointerSamples({replayState,
    viewport:{...viewport,coins:100000},deltas:[{deltaX:1,deltaY:1}]}),
    err('C15_DUNGEON_V2B1_VIEWPORT_INVALID'));
});

test('V2B.1 has no API, Firestore writes, settlement or gameplay authority', async () => {
  const {probe}=await fixture();
  assert.equal(probe.productionEnabled,false);
  assert.equal(probe.emulatorOnly,true);
  assert.throws(()=>probe.finalize({bossDefeated:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>probe.claim({coins:1000}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(server,/c15DungeonSeedTouchProbeV2B1/);
  const economy=fs.readFileSync(path.resolve(__dirname,'../lib/economy.cjs'),'utf8');
  assert.doesNotMatch(economy,/V2B1/);
});
