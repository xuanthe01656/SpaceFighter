'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {VERSION:V1_VERSION,createDungeonContractV1}=require('../lib/c15DungeonFoundationV1.cjs');
const {createC15DungeonSeedTouchTicketV2B2}=require('../lib/c15DungeonSeedTouchTicketV2B2.cjs');
const {createC15DungeonMovementParityV2B3}=require('../lib/c15DungeonMovementParityV2B3.cjs');
const {parseC15DungeonCombatTickProofV2C1Config,
  createC15DungeonCombatTickProofV2C1,TICK_HZ,MAX_TICKS}=require('../lib/c15DungeonCombatTickProofV2C1.cjs');

const UID='dungeon-v2c1-qa-user';
const SID='b2c10000-a004-4af1-8a20-127d021b3ac0';
const BID='b2c10000-a005-4af1-8a20-127d021b3ac0';
const REQ='dungeon_v2c1_entry_request_001';
const ISSUE=Date.UTC(2026,10,20,10,0,0);
const PROJECT='demo-spacefighter-dungeon-v2c1';
const env=Object.freeze({
  GAME_C15_DUNGEON_V1_ENABLED:'true',
  GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V1_ALLOW_UIDS:UID,
  GAME_C15_DUNGEON_V2A_ENABLED:'true',
  GAME_C15_DUNGEON_V2A_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B1_ENABLED:'true',
  GAME_C15_DUNGEON_V2B1_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B2_ENABLED:'true',
  GAME_C15_DUNGEON_V2B2_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B3_ENABLED:'true',
  GAME_C15_DUNGEON_V2B3_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C1_ENABLED:'true',
  GAME_C15_DUNGEON_V2C1_QA_APPROVED:'true',
  GOOGLE_CLOUD_PROJECT:PROJECT,GCLOUD_PROJECT:PROJECT,
  FIREBASE_PROJECT_ID:PROJECT,FIRESTORE_EMULATOR_HOST:'127.0.0.1:38081',
});
const err=code=>e=>e?.code===code;
const client=rel=>import(pathToFileURL(path.resolve(__dirname,'../../client/src',rel)).href);
let contentPromise,constantsPromise,sharedPromise,tracePromise;
const content=()=>contentPromise||(contentPromise=client('game/dungeon/DungeonContentCatalogV393.js'));
const constants=()=>constantsPromise||(constantsPromise=client('constants.js'));
const shared=()=>sharedPromise||(sharedPromise=client('game/dungeon/DungeonSeedTouchContractV2B1.js'));
const traceMod=()=>tracePromise||(tracePromise=client('game/dungeon/DungeonDeviceTouchTraceV2B2.js'));
async function fixture(){
  let at=ISSUE+100;
  const [listing,catalog]=await Promise.all([constants(),content()]);
  const contract=createDungeonContractV1('dung_taurus',{
    listings:listing.DUNGEON_CONFIG,content:catalog.DUNGEON_CONTENT_CATALOG_V393,
    hazards:catalog.DUNGEON_HAZARD_PROFILES_V393,
    objectives:catalog.DUNGEON_OBJECTIVE_PROFILES_V393});
  const admission={version:V1_VERSION,uid:UID,sessionId:SID,battleId:BID,
    dungeonId:'dung_taurus',requestId:REQ,requestDigest:'f'.repeat(64),
    contractDigest:contract.contractDigest,energyCharged:contract.energyCost,
    admittedAtMs:ISSUE,expiresAtMs:ISSUE+20*60*1000,
    status:'admitted-emulator',qaOnly:true,source:'firestore-emulator',
    independentReplayVerified:false,rewardSettlementEnabled:false,cloudRewards:false};
  const profile={sessionId:SID,campaignData:{profileId:'qa_profile_42'},wallet:{energy:30}};
  const active={version:V1_VERSION,uid:UID,sessionId:SID,battleId:BID,requestId:REQ,
    status:'admitted-emulator',expiresAtMs:admission.expiresAtMs,
    qaOnly:true,rewardSettlementEnabled:false};
  const docs=new Map([
    [`users/${UID}`,profile],
    [`users/${UID}/c15DungeonV1Admissions/${REQ}`,admission],
    [`users/${UID}/c15DungeonV1Sessions/current`,active],
  ]);
  let reads=0,writes=0;
  const db={app:{options:{projectId:PROJECT}},collection:coll=>({doc:id=>{
    const name=`${coll}/${id}`;
    function ref(key){return {
      get:async()=>{reads++;const d=docs.get(key);return {exists:d!==undefined,
        data:()=>d===undefined?undefined:structuredClone(d)};},
      collection:sub=>({doc:child=>ref(`${key}/${sub}/${child}`)}),
      set:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
      create:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
      update:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
    };}
    return ref(name);
  }})};
  const ticketService=await createC15DungeonSeedTouchTicketV2B2({env,db,
    now:()=>at,signingKey:Buffer.alloc(32,99)});
  const movementService=await createC15DungeonMovementParityV2B3({env,ticketService});
  const service=await createC15DungeonCombatTickProofV2C1({
    env,ticketService,movementService,now:()=>at});
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  const ticket=await ticketService.issueTicket(actor);
  const movementState=await movementService.open({ticket,...actor});
  const opened=await service.open({ticket,movementState,...actor});
  return {service,ticketService,movementService,actor,ticket,movementState,
    opened,docs,profile,active,admission,setTime:t=>{at=t;},
    get reads(){return reads;},get writes(){return writes;}};
}
const step=(f,state,ticks,extra={})=>f.service.step({state,ticket:f.ticket,
  movementState:f.movementState,...f.actor,ticks,...extra});
const viewport=Object.freeze({canvasWidth:400,canvasHeight:800,aspect:.5,
  halfHeight:15,inset:1.8,pointerSpeedMultiplier:1});
async function oneGesture(f){
  const t=await traceMod(),math=await shared();
  const recorder=t.createDungeonDeviceTouchTraceV2B2({ticket:f.ticket});
  let position={x:0,z:12.5};
  recorder.capture({kind:'down',pointerId:7,atMs:20,clientX:100,clientY:400,
    position:{...position}});
  position=math.projectDungeonDirectTouchV2B1({position,viewport,
    delta:{deltaX:30,deltaY:20}});
  recorder.capture({kind:'move',pointerId:7,atMs:35,clientX:130,clientY:420,
    position:{...position},viewport:{...viewport},delta:{deltaX:30,deltaY:20}});
  recorder.capture({kind:'up',pointerId:7,atMs:42,position:{...position}});
  const accepted=await f.movementService.ingestSnapshot({state:f.movementState,
    ticket:f.ticket,trace:recorder.snapshot(),...f.actor});
  f.movementState=accepted.state;
  return position;
}
async function advance(f,from,ticks,chunk=60){
  let state=from;
  while (ticks>0) {
    const n=Math.min(chunk,ticks);
    f.setTime(ISSUE+100+Math.ceil((state.tick+n)*1000/TICK_HZ)+1000);
    const result=await step(f,state,n);
    state=result.state;
    ticks-=n;
  }
  return f.service.inspect(state);
}

test('V2C.1 is OFF by default; finalize and claim always fail closed',async()=>{
  assert.equal(parseC15DungeonCombatTickProofV2C1Config({}),null);
  const off=await createC15DungeonCombatTickProofV2C1();
  assert.equal(off.enabled,false);
  assert.throws(()=>off.open({}),err('C15_DUNGEON_V2C1_DISABLED'));
  assert.throws(()=>off.claim({rewards:{coins:999999}}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('all predecessor gates and demo-only emulator approval are mandatory',()=>{
  assert.equal(parseC15DungeonCombatTickProofV2C1Config(env).emulatorOnly,true);
  for(const extra of [
    {GAME_C15_DUNGEON_V2C1_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2B3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B2_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B1_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2A_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {GCLOUD_PROJECT:'wrong'},
    {FIRESTORE_EMULATOR_HOST:'127.0.0.2:38081'},
  ]) assert.throws(()=>parseC15DungeonCombatTickProofV2C1Config({...env,...extra}),TypeError);
  assert.equal(parseC15DungeonCombatTickProofV2C1Config({...env,
    GAME_C15_DUNGEON_V2C1_ENABLED:'false'}),null);
});
test('no V2C.1 service without genuine non-economic ticket and movement APIs',async()=>{
  await assert.rejects(createC15DungeonCombatTickProofV2C1({env}),TypeError);
  await assert.rejects(createC15DungeonCombatTickProofV2C1({env,
    ticketService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      rewardSettlementEnabled:false,verifyTicket:async()=>({})},
    movementService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      rewardSettlementEnabled:true,inspect:()=>({})}}),TypeError);
});
test('opening ties battle, seed and real V2B.3 instance-issued movement to QA fixture',async()=>{
  const f=await fixture(),r=f.opened.report;
  assert.equal(r.battleId,BID);
  assert.equal(r.roomId,'taurus_entry');
  assert.equal(r.sceneSeed,f.ticket.sceneSeed);
  assert.equal(r.simulatedTicks,0);
  assert.equal(r.candidateProjectileCreated,0);
  assert.equal(r.projectileMathSharedWithDungeonScene,true);
  assert.equal(r.actualEnemyAIReplayVerified,false);
  assert.equal(r.safeForSettlement,false);
  assert.equal(f.writes,0);
  assert.ok(f.reads>0);
});
test('opening rejects non-allowlisted UID and mismatching session',async()=>{
  const f=await fixture();
  await assert.rejects(f.service.open({ticket:f.ticket,movementState:f.movementState,
    ...f.actor,uid:'some-other-uid'}));
  await assert.rejects(f.service.open({ticket:f.ticket,movementState:f.movementState,
    ...f.actor,sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}));
});
test('open rejects fabricated or cloned V2B.3 state, not just plausible fields',async()=>{
  const f=await fixture();
  await assert.rejects(f.service.open({ticket:f.ticket,movementState:{...f.movementState},
    ...f.actor}),err('C15_DUNGEON_V2B3_STATE_UNTRUSTED'));
});
test('cannot spoof outcome, HP, kills, coins or projectile plan in opening body',async()=>{
  const f=await fixture();
  for(const extra of [{victory:true},{kills:999},{rewards:{coins:99999}},
    {projectile:{damage:9999}},{hp:0}]) {
    await assert.rejects(f.service.open({ticket:f.ticket,
      movementState:f.movementState,...f.actor,...extra}),
    err('C15_DUNGEON_V2C1_INPUT_INVALID'));
  }
});
test('unauthorized state and copied state cannot be stepped or inspected',async()=>{
  const f=await fixture();
  assert.throws(()=>f.service.inspect({...f.opened.state}),
    err('C15_DUNGEON_V2C1_STATE_UNTRUSTED'));
  await assert.rejects(step(f,{...f.opened.state},1),
    err('C15_DUNGEON_V2C1_STATE_UNTRUSTED'));
});
test('reject negative, fractional, zero, too large tick batches and foreign body keys',async()=>{
  const f=await fixture();
  for(const ticks of [-1,0,1.5,61,1000,NaN,Infinity,'10'])
    await assert.rejects(step(f,f.opened.state,ticks),
      err('C15_DUNGEON_V2C1_INPUT_INVALID'));
  for(const extra of [{hit:true},{damage:200},{killCount:1},{victory:true},{rewards:{coins:9}}])
    await assert.rejects(step(f,f.opened.state,1,extra),
      err('C15_DUNGEON_V2C1_INPUT_INVALID'));
});
test('server clock rejects forward ticks beyond allowed lead',async()=>{
  const f=await fixture();
  await assert.rejects(step(f,f.opened.state,13),
    err('C15_DUNGEON_V2C1_FAST_FORWARD'));
  assert.equal(f.service.inspect(f.opened.state).simulatedTicks,0);
});
test('server ticket expiration closes the preview',async()=>{
  const f=await fixture();f.setTime(ISSUE+20*60*1000);
  await assert.rejects(step(f,f.opened.state,1));
});
test('server battle receipt and ticket MAC cannot be replaced after open',async()=>{
  const f=await fixture();
  const changed={...f.ticket,mac:'f'.repeat(64)};
  await assert.rejects(f.service.step({state:f.opened.state,ticket:changed,
    movementState:f.movementState,...f.actor,ticks:1}));
});
test('initial replay tick generates no projectile until actual catalog schedule is due',async()=>{
  const f=await fixture();
  const r=await advance(f,f.opened.state,10,10);
  assert.equal(r.simulatedTicks,10);
  assert.equal(r.candidateProjectileCreated,0);
  assert.equal(r.spawnCandidatesDue,0);
  assert.equal(r.candidateRawDamage,0);
});
test('Taurus entry spawn candidates and one ranged fixture shot are server-derived',async()=>{
  const f=await fixture();
  const r=await advance(f,f.opened.state,120,40);
  assert.equal(r.simulatedTicks,120);
  assert.ok(r.spawnCandidatesDue>=1);
  assert.equal(r.candidateProjectileCreated,1);
  assert.match(r.traceDigest,/^[a-f0-9]{64}$/);
  assert.equal(r.firingCadenceVerified,false);
  assert.equal(r.liveMuzzleTransformVerified,false);
});
test('projectile math remains deterministic across 1, 20 and 60 tick chunking',async()=>{
  const a=await fixture(),b=await fixture(),c=await fixture();
  const [x,y,z]=await Promise.all([
    advance(a,a.opened.state,160,1),
    advance(b,b.opened.state,160,20),
    advance(c,c.opened.state,160,60),
  ]);
  assert.deepEqual(x,y);assert.deepEqual(y,z);
});
test('projectile step can reach swept segment hit or expiry with bounded energy',async()=>{
  const f=await fixture();
  const r=await advance(f,f.opened.state,MAX_TICKS,30);
  assert.equal(r.simulatedTicks,MAX_TICKS);
  assert.equal(r.candidateProjectileCreated,1);
  assert.equal(r.candidateProjectileHit+r.candidateProjectileExpired,1);
  assert.ok(r.candidateScaledDamage>=0);
  assert.equal(r.fullCombatDamagePipelineVerified,false);
  assert.equal(r.battleVictoryVerified,false);
});
test('collision and damage remain projections, never update Firestore HP or wallet',async()=>{
  const f=await fixture();
  const before=structuredClone(f.profile);
  const r=await advance(f,f.opened.state,300,60);
  assert.equal(f.writes,0);
  assert.deepEqual(f.profile,before);
  assert.equal(r.safeForSettlement,false);
  assert.equal(r.independentReplayVerified,false);
  assert.equal(r.cloudRewards,false);
});
test('retry exact old state and operation is idempotent, not a second shot',async()=>{
  const f=await fixture();f.setTime(ISSUE+2000);
  const first=await step(f,f.opened.state,60);
  const again=await step(f,f.opened.state,60);
  assert.equal(first.duplicate,false);
  assert.equal(again.duplicate,true);
  assert.equal(first.state,again.state);
  assert.equal(first.report.traceDigest,again.report.traceDigest);
});
test('cannot fork an already consumed state with another tick count',async()=>{
  const f=await fixture();f.setTime(ISSUE+2000);
  await step(f,f.opened.state,60);
  await assert.rejects(step(f,f.opened.state,59),
    err('C15_DUNGEON_V2C1_REUSED_STATE'));
});
test('cannot exceed six-second proof budget after a valid run',async()=>{
  const f=await fixture();
  let state=f.opened.state;
  for(let i=0;i<6;i++){
    f.setTime(ISSUE+20000);
    state=(await step(f,state,60)).state;
  }
  await assert.rejects(step(f,state,1),err('C15_DUNGEON_V2C1_TICK_CAP'));
});
test('server-replayed movement changes candidate aim, not authorization or rewards',async()=>{
  const stationary=await fixture(),moving=await fixture();
  const position=await oneGesture(moving);
  assert.ok(Math.abs(position.x)>0.01);
  const s=await advance(stationary,stationary.opened.state,180,30);
  // Reopen after trace is accepted; V2C.1 is server-derived and bound to the V2B.3 state.
  const reopened=await moving.service.open({ticket:moving.ticket,
    movementState:moving.movementState,...moving.actor});
  const m=await advance(moving,reopened.state,180,30);
  assert.equal(m.inputTouchEventCount,3);
  assert.notEqual(m.traceDigest,s.traceDigest);
  assert.equal(m.playerMovementTickTimelineVerified,false);
  assert.equal(m.actualDeviceProvenanceVerified,false);
  assert.equal(m.safeForSettlement,false);
});
test('changing V2B.3 movement digest without increasing events is rejected',async()=>{
  const f=await fixture();
  const other=await fixture();
  await assert.rejects(f.service.step({state:f.opened.state,
    ticket:f.ticket,movementState:other.movementState,
    ...f.actor,ticks:1}));
});
test('server-attested replay position is read from V2B.3, not client input body',async()=>{
  const f=await fixture();
  const pos=await oneGesture(f);
  const result=await f.service.open({ticket:f.ticket,
    movementState:f.movementState,...f.actor});
  const r=await advance(f,result.state,120,20);
  assert.equal(r.inputTouchEventCount,3);
  assert.ok(pos.x!==0);
  assert.equal(r.playerMovementTickTimelineVerified,false);
});
test('test fixture checks actual projectile/collision/damage exports are present',async()=>{
  const f=await fixture();
  assert.equal(f.service.enabled,true);
  assert.equal(TICK_HZ,60);
  assert.equal(MAX_TICKS,360);
});
test('all inspected reports are frozen and have permanent settlement lock',async()=>{
  const f=await fixture();
  const r=f.service.inspect(f.opened.state);
  assert.ok(Object.isFrozen(r));
  assert.equal(r.rewardSettlementEnabled,false);
  assert.equal(r.fullCombatDamagePipelineVerified,false);
  assert.throws(()=>f.service.finalize({state:f.opened.state,victory:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.service.claim({battleId:BID,coins:999999}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
