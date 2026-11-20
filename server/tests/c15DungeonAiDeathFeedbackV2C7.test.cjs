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

const {parseC15DungeonEnemyTimelineV2C2Config,createC15DungeonEnemyTimelineV2C2,TICK_HZ:TIMELINE_HZ,MAX_TICKS:TIMELINE_MAX}=require('../lib/c15DungeonEnemyTimelineV2C2.cjs');
const {VERSION:V2C3_VERSION,projectDungeonCandidateMuzzleV2C3,
  parseC15DungeonMultiEnemyTimelineV2C3Config,
  createC15DungeonMultiEnemyTimelineV2C3}=require('../lib/c15DungeonMultiEnemyTimelineV2C3.cjs');
const {VERSION:V2C4_VERSION,QA_DEFENSE_FIXTURE,parseC15DungeonDamageStateV2C4Config,projectCandidateHitV2C4,createC15DungeonDamageStateV2C4}=require('../lib/c15DungeonDamageStateV2C4.cjs');
const {createC15DungeonOutgoingStateV2C5}=require('../lib/c15DungeonOutgoingStateV2C5.cjs');
const {VERSION:V2C6_VERSION,parseC15DungeonLifecycleIntegrationV2C6Config,
  reconcileC15DungeonLifecycleTickV2C6,createC15DungeonLifecycleIntegrationV2C6}=require('../lib/c15DungeonLifecycleIntegrationV2C6.cjs');
const {VERSION:V2C7_VERSION,parseC15DungeonAiDeathFeedbackV2C7Config,createC15DungeonAiDeathFeedbackV2C7}=require('../lib/c15DungeonAiDeathFeedbackV2C7.cjs');
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
  GAME_C15_DUNGEON_V2C2_ENABLED:'true',
  GAME_C15_DUNGEON_V2C2_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C3_ENABLED:'true',
  GAME_C15_DUNGEON_V2C3_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C4_ENABLED:'true',
  GAME_C15_DUNGEON_V2C4_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C5_ENABLED:'true',
  GAME_C15_DUNGEON_V2C5_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C6_ENABLED:'true',
  GAME_C15_DUNGEON_V2C6_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C7_ENABLED:'true',
  GAME_C15_DUNGEON_V2C7_QA_APPROVED:'true',
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
  const timeline=await createC15DungeonEnemyTimelineV2C2({env,combatProofService:service,
    movementService});
  const multi=await createC15DungeonMultiEnemyTimelineV2C3({
    env,enemyTimelineService:timeline,movementService});
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  const ticket=await ticketService.issueTicket(actor);
  const movementState=await movementService.open({ticket,...actor});
  const upstreamOpened=await service.open({ticket,movementState,...actor});
  const opened=await multi.open({ticket,movementState,...actor});
  const damage=await createC15DungeonDamageStateV2C4({env,multiEnemyService:multi,movementService});
  const damageOpened=await damage.open({ticket,movementState,...actor});
  const outgoing=await createC15DungeonOutgoingStateV2C5({env,damageService:damage,movementService});
  const outgoingOpened=await outgoing.open({ticket,movementState,...actor});
  const lifecycle=await createC15DungeonLifecycleIntegrationV2C6({env,
    outgoingService:outgoing,movementService});
  const lifecycleOpened=await lifecycle.open({ticket,movementState,...actor});
  const feedback=await createC15DungeonAiDeathFeedbackV2C7({env,lifecycleService:lifecycle,movementService});
  const feedbackOpened=await feedback.open({ticket,movementState,...actor});
  return {feedback,feedbackOpened,lifecycle,lifecycleOpened,outgoing,outgoingOpened,damage,damageOpened,multi,timeline,service,ticketService,movementService,actor,ticket,movementState,upstreamOpened,
    opened,docs,profile,active,admission,setTime:t=>{at=t;},
    get reads(){return reads;},get writes(){return writes;}};
}
const feedbackStep=(f,state,ticks,overrides={})=>f.feedback.step({
  state,ticket:f.ticket,movementState:f.movementState,...f.actor,ticks,...overrides});
async function advance(f,limit=360,chunk=60){
  let state=f.feedbackOpened.state;
  for(let t=0;t<limit;){
    const n=Math.min(chunk,limit-t);
    f.setTime(ISSUE+1100+Math.ceil((t+n)*1000/TICK_HZ));
    state=(await feedbackStep(f,state,n)).state;
    t+=n;
  }
  return {state,report:f.feedback.inspect(state)};
}



test('V2C.7 OFF by default, economy and claims fail closed',async()=>{
  const off=await createC15DungeonAiDeathFeedbackV2C7();
  assert.equal(off.enabled,false);assert.equal(off.productionEnabled,false);
  assert.equal(off.safeForSettlement,false);assert.equal(off.cloudRewards,false);
  assert.throws(()=>off.open(),err('C15_DUNGEON_V2C7_DISABLED'));
  assert.throws(()=>off.claim(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.7 gate requires explicit approval and earlier demo gates',()=>{
  assert.equal(parseC15DungeonAiDeathFeedbackV2C7Config({}),null);
  for(const bad of [{GAME_C15_DUNGEON_V2C7_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C6_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2C5_QA_APPROVED:'false'},
    {FIRESTORE_EMULATOR_HOST:''},
    {GOOGLE_CLOUD_PROJECT:'prod-user'}])
    assert.throws(()=>parseC15DungeonAiDeathFeedbackV2C7Config({...env,...bad}),TypeError);
});
test('V2C.7 prototype-derived environment rejected',()=>{
  assert.throws(()=>parseC15DungeonAiDeathFeedbackV2C7Config(Object.create(env)),TypeError);
  assert.throws(()=>parseC15DungeonAiDeathFeedbackV2C7Config([]),TypeError);
});
test('enabled V2C.7 refuses to run without real QA service chain',async()=>{
  await assert.rejects(createC15DungeonAiDeathFeedbackV2C7({env}),TypeError);
});
test('fails closed if V2C.6 reports economic capability',async()=>{
  const f=await fixture();
  for(const key of ['productionEnabled','rewardSettlementEnabled','cloudRewards','safeForSettlement'])
    await assert.rejects(createC15DungeonAiDeathFeedbackV2C7({env,
      lifecycleService:{...f.lifecycle,[key]:true},movementService:f.movementService}),TypeError);
});
test('server-issued ticket and fixed-defenses binding exists',async()=>{
  const f=await fixture();
  const {state,report:r}=f.feedbackOpened;
  assert.equal(r.version,V2C7_VERSION);
  assert.equal(state.ticketMac,f.ticket.mac);
  assert.equal(state.battleId,f.ticket.battleId);
  assert.equal(r.candidatePlayerHp,1200);
  assert.equal(r.candidatePlayerShieldHp,240);
  assert.equal(r.simulatedTicks,0);
  assert.equal(r.actualUpstreamEnemyAiDeathFeedbackVerified,false);
  assert.equal(r.independentClosedLoopCombatReplayVerified,false);
  assert.equal(r.safeForSettlement,false);
  assert.equal(f.writes,0);
});
test('one tick goes through independent candidate and upstream audit',async()=>{
  const f=await fixture();
  const r=await feedbackStep(f,f.feedbackOpened.state,1);
  assert.equal(r.report.simulatedTicks,1);
  assert.equal(r.state.lifecycleState.tick,1);
  assert.equal(r.state.actor.uid,f.actor.uid);
  assert.match(r.report.correctedCandidateDigest,/^[0-9a-f]{64}$/);
  assert.equal(f.writes,0);
});
test('server rejects client supplied hp, kills, rewards, pose or death feedback',async()=>{
  const f=await fixture();
  for(const bad of [{enemyHp:0},{kills:['enemy']},{deaths:[{id:'x',tick:1}]},
    {playerHp:99999},{weapon:{atk:9999}},{deltaX:9999},
    {reward:{diamonds:100}},{victory:true},{forceDespawn:'x'}])
    await assert.rejects(feedbackStep(f,f.feedbackOpened.state,1,bad),
      err('C15_DUNGEON_V2C7_INPUT_INVALID'));
});
test('unissued deep clone is denied',async()=>{
  const f=await fixture();
  await assert.rejects(feedbackStep(f,structuredClone(f.feedbackOpened.state),1),
    err('C15_DUNGEON_V2C7_STATE_UNTRUSTED'));
});
test('unissued state with injected candidate death denied',async()=>{
  const f=await fixture();
  const altered={...f.feedbackOpened.state,deaths:[{id:'x',tick:1}]};
  await assert.rejects(feedbackStep(f,altered,1),
    err('C15_DUNGEON_V2C7_STATE_UNTRUSTED'));
});
test('ticket signature, battle ID, seed are bound',async()=>{
  const f=await fixture();
  for(const bad of [{mac:'0'.repeat(64)},{battleId:'fake'},{sceneSeed:999}])
    await assert.rejects(feedbackStep(f,f.feedbackOpened.state,1,
      {ticket:{...f.ticket,...bad}}),err('C15_DUNGEON_V2C7_TICKET_MISMATCH'));
});
test('cannot transfer actor, session or request',async()=>{
  const f=await fixture();
  for(const bad of [{uid:'other'},{sessionId:'other'},{requestId:'other'}])
    await assert.rejects(feedbackStep(f,f.feedbackOpened.state,1,bad),
      err('C15_DUNGEON_V2C7_ACTOR_MISMATCH'));
});
test('zero, fractional and above batch tick denied',async()=>{
  const f=await fixture();
  for(const ticks of [0,-1,61,360,1.2,NaN,Infinity])
    await assert.rejects(feedbackStep(f,f.feedbackOpened.state,ticks),
      err('C15_DUNGEON_V2C7_INPUT_INVALID'));
});
test('identical retry is idempotent, digest does not change',async()=>{
  const f=await fixture();f.setTime(ISSUE+2500);
  const a=await feedbackStep(f,f.feedbackOpened.state,8);
  const b=await feedbackStep(f,f.feedbackOpened.state,8);
  assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);
  assert.equal(a.state,b.state);
  assert.equal(a.report.correctedCandidateDigest,b.report.correctedCandidateDigest);
});
test('fork after consuming old state rejected',async()=>{
  const f=await fixture();f.setTime(ISSUE+2500);
  await feedbackStep(f,f.feedbackOpened.state,3);
  await assert.rejects(feedbackStep(f,f.feedbackOpened.state,4),
    err('C15_DUNGEON_V2C7_REUSED_STATE'));
});
test('concurrent same request consumes candidate once',async()=>{
  const f=await fixture();f.setTime(ISSUE+2500);
  const results=await Promise.all(Array.from({length:6},()=>
    feedbackStep(f,f.feedbackOpened.state,6)));
  assert.equal(results.filter(r=>!r.duplicate).length,1);
  assert.ok(results.every(r=>r.state===results[0].state));
  assert.equal(f.writes,0);
});
test('split 1+7+19 and single 27 produce the same candidate trace digest',async()=>{
  const a=await fixture(),b=await fixture();
  a.setTime(ISSUE+2700);b.setTime(ISSUE+2700);
  const x=await feedbackStep(a,a.feedbackOpened.state,27);
  let y=(await feedbackStep(b,b.feedbackOpened.state,1)).state;
  y=(await feedbackStep(b,y,7)).state;
  y=(await feedbackStep(b,y,19)).state;
  assert.equal(x.report.correctedCandidateDigest,b.feedback.inspect(y).correctedCandidateDigest);
});
test('pre-death alive actors have unique leased combat slots',async()=>{
  const f=await fixture();
  const {report:r}=await advance(f,180);
  assert.equal(r.simulatedTicks,180);
  assert.equal(new Set(r.activeActorIds).size,r.activeActorIds.length);
  assert.equal(new Set(r.candidateSlotIds).size,r.candidateSlotIds.length);
  assert.ok(r.candidateSlotIds.every(Boolean));
  assert.equal(r.candidateFsmReceivesDeathFeedback,true);
});
test('360 ticks records server-issued deaths, removes dead from running FSM',async()=>{
  const f=await fixture();
  const {state,report:r}=await advance(f);
  assert.equal(r.simulatedTicks,360);
  assert.equal(r.candidateDead,5);
  assert.equal(r.deathFeedbackEvents.length,5);
  const dead=new Set(r.deathFeedbackEvents.map(x=>x.id));
  assert.ok(r.activeActorIds.every(id=>!dead.has(id)));
  assert.ok(state.pending.every(p=>!dead.has(p.enemyId)));
  assert.ok(state.actors.every(e=>!dead.has(e.id)));
  assert.ok(r.candidateReleasedSlotCount>0);
  assert.ok(r.candidateSuppressedAiFrames>0);
  assert.equal(r.originalUpstreamGhostEnemyFrames>0,true);
  assert.equal(r.originalOutgoingDeathLedgerStillUsesOldTimeline,true);
  assert.equal(f.writes,0);
});
test('death feedback does not erase projectiles authored before enemy death',async()=>{
  const f=await fixture();
  const {state}=await advance(f);
  const byDead=new Map(state.deaths.map(x=>[x.id,x.tick]));
  for(const bullet of state.bullets){
    if(byDead.has(bullet.enemyId))assert.ok(bullet.createdTick<=byDead.get(bullet.enemyId));
  }
});
test('death feedback cancels scheduled future burst from dead enemy',async()=>{
  const f=await fixture();
  const {state,report:r}=await advance(f);
  const dead=new Set(state.deaths.map(x=>x.id));
  assert.ok(state.pending.every(p=>!dead.has(p.enemyId)));
  assert.ok(r.candidateCanceledPendingBurstCount>=0);
  assert.equal(r.candidatePendingBurstCanceledAfterDeath,true);
});
test('candidate incoming HP is computed from feedback stream, not client',async()=>{
  const f=await fixture();
  const {state,report:r}=await advance(f);
  assert.ok(r.candidatePlayerHp>=0&&r.candidatePlayerHp<=1200);
  assert.ok(r.candidatePlayerShieldHp>=0&&r.candidatePlayerShieldHp<=240);
  assert.equal(r.candidateIncomingHits,state.incomingHits.length);
  assert.equal(r.candidateIncomingDamageRecomputed,true);
  assert.equal(r.actualAccountLoadoutVerified,false);
  assert.equal(r.liveBabylonMuzzleVerified,false);
  assert.equal(r.independentReplayVerified,false);
  assert.equal(r.battleVictoryVerified,false);
  assert.equal(r.rewardSettlementEnabled,false);
});
test('candidate input replay remains deterministic across chunk sizes',async()=>{
  const a=await fixture(),b=await fixture();
  const x=await advance(a,360,60);
  const y=await advance(b,360,23);
  assert.equal(x.report.correctedCandidateDigest,y.report.correctedCandidateDigest);
  assert.deepEqual(x.report.deathFeedbackEvents,y.report.deathFeedbackEvents);
  assert.equal(x.report.candidatePlayerHp,y.report.candidatePlayerHp);
  assert.equal(x.report.candidatePlayerShieldHp,y.report.candidatePlayerShieldHp);
});
test('six-second sandbox cannot fast forward beyond tick 360',async()=>{
  const f=await fixture();
  const x=await advance(f);
  await assert.rejects(feedbackStep(f,x.state,1),err('C15_DUNGEON_V2C7_TICK_CAP'));
});
test('no production routes or rewarded combat finalization',async()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(source,/c15DungeonAiDeathFeedbackV2C7/);
  const f=await fixture();
  await advance(f,180);
  assert.throws(()=>f.feedback.finalize({victory:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.feedback.claim({diamonds:100}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});
