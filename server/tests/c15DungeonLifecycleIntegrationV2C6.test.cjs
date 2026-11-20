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
  return {lifecycle,lifecycleOpened,outgoing,outgoingOpened,damage,damageOpened,multi,timeline,service,ticketService,movementService,actor,ticket,movementState,upstreamOpened,
    opened,docs,profile,active,admission,setTime:t=>{at=t;},
    get reads(){return reads;},get writes(){return writes;}};
}
const lifecycleStep=(f,state,ticks,overrides={})=>f.lifecycle.step({
  state,ticket:f.ticket,movementState:f.movementState,...f.actor,ticks,...overrides});
async function advance(f,limit=360,chunk=60){
  let state=f.lifecycleOpened.state;
  for(let t=0;t<limit;){
    const n=Math.min(chunk,limit-t);
    f.setTime(ISSUE+1100+Math.ceil((t+n)*1000/TICK_HZ));
    state=(await lifecycleStep(f,state,n)).state;
    t+=n;
  }
  return {state,report:f.lifecycle.inspect(state)};
}

test('V2C.6 OFF by default; claim/finalize cannot settle',async()=>{
  const off=await createC15DungeonLifecycleIntegrationV2C6();
  assert.equal(off.enabled,false);
  assert.equal(off.productionEnabled,false);
  assert.equal(off.safeForSettlement,false);
  assert.equal(off.rewardSettlementEnabled,false);
  assert.equal(off.cloudRewards,false);
  assert.throws(()=>off.open(),err('C15_DUNGEON_V2C6_DISABLED'));
  assert.throws(()=>off.claim(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.6 requires explicit approval plus all earlier gates',()=>{
  for(const patch of [
    {GAME_C15_DUNGEON_V2C6_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C5_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2C4_QA_APPROVED:'false'},
    {FIRESTORE_EMULATOR_HOST:''},
    {GOOGLE_CLOUD_PROJECT:'prod-game'},
  ])assert.throws(()=>parseC15DungeonLifecycleIntegrationV2C6Config({
    ...env,...patch}),TypeError);
});
test('disabled parse returns null when V2C.6 gate OFF',()=>{
  assert.equal(parseC15DungeonLifecycleIntegrationV2C6Config({}),null);
  assert.equal(parseC15DungeonLifecycleIntegrationV2C6Config({
    ...env,GAME_C15_DUNGEON_V2C6_ENABLED:'false'}),null);
});
test('rejects prototype-inherited or nonplain config object',()=>{
  assert.throws(()=>parseC15DungeonLifecycleIntegrationV2C6Config(
    Object.create(env)),TypeError);
  assert.throws(()=>parseC15DungeonLifecycleIntegrationV2C6Config([]),TypeError);
});
test('rejects no V2C.5 service even if QA env approved',async()=>{
  await assert.rejects(createC15DungeonLifecycleIntegrationV2C6({env}),TypeError);
});
test('rejects faux upstream with production/reward flag',async()=>{
  const f=await fixture();
  for(const key of ['productionEnabled','safeForSettlement',
    'rewardSettlementEnabled','cloudRewards']){
    await assert.rejects(createC15DungeonLifecycleIntegrationV2C6({
      env,movementService:f.movementService,outgoingService:{
        ...f.outgoing,[key]:true}}),TypeError);
  }
});
test('initial state binds actor, signed ticket, movement and roster',async()=>{
  const f=await fixture();
  const {report:r,state:s}=f.lifecycleOpened;
  assert.equal(r.version,V2C6_VERSION);
  assert.equal(r.simulatedTicks,0);
  assert.equal(r.candidateDead,0);
  assert.equal(r.candidateAliveActive,0);
  assert.equal(s.ticketMac,f.ticket.mac);
  assert.equal(s.battleId,f.ticket.battleId);
  assert.equal(s.movementDigest,f.movementState.traceDigest);
  assert.ok(s.roster.length>0);
  assert.ok(Object.isFrozen(s));
  assert.equal(f.writes,0);
});
test('one tick advances complete V2C.5 => V2C.4 => V2C.3 chain',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1200);
  const s=(await lifecycleStep(f,f.lifecycleOpened.state,1)).state;
  assert.equal(s.tick,1);
  assert.equal(s.outgoingState.tick,1);
  assert.equal(s.outgoingState.upstreamState.tick,1);
  assert.equal(s.outgoingState.upstreamState.upstreamState.tick,1);
  assert.equal(s.upstreamDigest,s.outgoingState.outgoingDigest);
  assert.match(s.lifecycleDigest,/^[a-f0-9]{64}$/);
  assert.equal(f.writes,0);
});
test('one-step report always declares zero economic authority',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1200);
  const r=(await lifecycleStep(f,f.lifecycleOpened.state,1)).report;
  for(const k of ['safeForSettlement','cloudRewards','rewardSettlementEnabled',
    'independentReplayVerified','actualAccountLoadoutVerified',
    'actualUpstreamEnemyAiDespawnVerified','actualPostDeathIncomingDamageReconciled',
    'battleVictoryVerified','bossAndHazardsVerified',
    'actualPlayerMovementTickParityVerified','liveMuzzleWorldMatrixVerified'])
    assert.equal(r[k],false,k);
});
test('extra client payloads for kills, HP, damage or reward are denied',async()=>{
  const f=await fixture();
  for(const change of [{hp:0},{killedIds:[]},{enemyHp:0},
    {damage:99999},{loot:[]},{reward:{diamonds:1}},
    {victory:true},{forceRemoveEnemyId:'x'},{tick:360}]){
    await assert.rejects(lifecycleStep(f,f.lifecycleOpened.state,1,change),
      err('C15_DUNGEON_V2C6_INPUT_INVALID'));
  }
});
test('unknown actor UID denied at admission',async()=>{
  const f=await fixture();
  await assert.rejects(f.lifecycle.open({ticket:f.ticket,
    movementState:f.movementState,...f.actor,uid:'other-qa'}),
  err('C15_DUNGEON_V2C6_ACTOR_NOT_ALLOWED'));
});
test('untrusted clone state denied',async()=>{
  const f=await fixture();
  await assert.rejects(lifecycleStep(f,
    structuredClone(f.lifecycleOpened.state),1),
    err('C15_DUNGEON_V2C6_STATE_UNTRUSTED'));
});
test('untrusted object with altered HP denied before step',async()=>{
  const f=await fixture();
  const altered={...f.lifecycleOpened.state,
    roster:f.lifecycleOpened.state.roster.map(e=>({...e,hp:0,dead:true}))};
  await assert.rejects(lifecycleStep(f,altered,1),
    err('C15_DUNGEON_V2C6_STATE_UNTRUSTED'));
});
test('ticket MAC, battle ID and scene seed changes denied',async()=>{
  const f=await fixture();
  for(const change of [{mac:'0'.repeat(64)},
    {battleId:'other'}, {sceneSeed:5}]){
    await assert.rejects(lifecycleStep(f,f.lifecycleOpened.state,1,
      {ticket:{...f.ticket,...change}}),
      err('C15_DUNGEON_V2C6_TICKET_MISMATCH'));
  }
});
test('UID/session/request transfer fails',async()=>{
  const f=await fixture();
  for(const changed of [{uid:'other'},{sessionId:'other'},
    {requestId:'other'}]){
    await assert.rejects(lifecycleStep(f,f.lifecycleOpened.state,1,changed),
      err('C15_DUNGEON_V2C6_ACTOR_MISMATCH'));
  }
});
test('wrong tick input, batches and large jumps denied',async()=>{
  const f=await fixture();
  for(const ticks of [0,-1,1.5,61,360,NaN,Infinity]){
    await assert.rejects(lifecycleStep(f,f.lifecycleOpened.state,ticks),
      err('C15_DUNGEON_V2C6_INPUT_INVALID'));
  }
});
test('identical retry uses issued state and digest idempotently',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+2000);
  const start=f.lifecycleOpened.state;
  const a=await lifecycleStep(f,start,8);
  const b=await lifecycleStep(f,start,8);
  assert.equal(a.duplicate,false);
  assert.equal(b.duplicate,true);
  assert.equal(a.state,b.state);
  assert.equal(a.report.lifecycleDigest,b.report.lifecycleDigest);
});
test('reusing state to fork different tick count fails',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+2000);
  const start=f.lifecycleOpened.state;
  await lifecycleStep(f,start,3);
  await assert.rejects(lifecycleStep(f,start,4),
    err('C15_DUNGEON_V2C6_REUSED_STATE'));
});
test('concurrent identical retries share result',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+2200);
  const start=f.lifecycleOpened.state;
  const all=await Promise.all(Array.from({length:6},()=>lifecycleStep(f,start,6)));
  assert.equal(all.filter(x=>x.duplicate===false).length,1);
  assert.ok(all.every(x=>x.state===all[0].state));
  assert.equal(f.writes,0);
});
test('split 1+12+21 and single 34 ticks yield identical candidate digest',async()=>{
  const a=await fixture(),b=await fixture();
  a.setTime(ISSUE+2500);b.setTime(ISSUE+2500);
  const ra=await lifecycleStep(a,a.lifecycleOpened.state,34);
  let x=(await lifecycleStep(b,b.lifecycleOpened.state,1)).state;
  x=(await lifecycleStep(b,x,12)).state;
  x=(await lifecycleStep(b,x,21)).state;
  assert.equal(ra.report.lifecycleDigest,b.lifecycle.inspect(x).lifecycleDigest);
  assert.equal(ra.report.upstreamOutgoingDigest,b.lifecycle.inspect(x).upstreamOutgoingDigest);
});
test('multi-enemy view lists only live spawned enemies',async()=>{
  const f=await fixture();
  const r=(await advance(f,180)).report;
  assert.equal(r.simulatedTicks,180);
  const ids=new Set(r.candidateProjectedActors.map(e=>e.id));
  assert.equal(ids.size,r.candidateProjectedActors.length);
  assert.ok(r.candidateProjectedActors.every(e=>e.hp>0));
  assert.equal(f.writes,0);
});
test('projected combat slots are unique for active enemies',async()=>{
  const f=await fixture();
  const r=(await advance(f,180)).report;
  const slots=r.candidateProjectedActors.map(e=>e.slotId);
  assert.equal(new Set(slots).size,slots.length);
  assert.ok(slots.every(Boolean));
});
test('360 ticks records exactly the server-owned candidate enemy deaths',async()=>{
  const f=await fixture();
  const {state,report:r}=await advance(f,360);
  assert.equal(r.simulatedTicks,360);
  assert.equal(r.candidateDead,5);
  assert.equal(state.deaths.length,5);
  assert.equal(r.candidateDead,state.roster.filter(x=>x.dead).length);
  assert.equal(new Set(state.deaths.map(x=>x.id)).size,r.candidateDead);
  assert.equal(state.outgoingState.enemies.filter(e=>e.dead).length,r.candidateDead);
  assert.equal(r.totalCandidateOutgoingDamage,413);
  assert.equal(f.writes,0);
});
test('dead candidate enemy is absent from projected AI actor list',async()=>{
  const f=await fixture();
  const {state,report:r}=await advance(f,360);
  const deadIds=new Set(state.deaths.map(x=>x.id));
  assert.ok(deadIds.size>0);
  assert.ok(r.candidateProjectedActors.every(e=>!deadIds.has(e.id)));
  assert.ok(r.candidateProjectedActors.length<=state.roster.length-r.candidateDead);
});
test('projected hostile shots exclude only bullets spawned AFTER death',async()=>{
  const f=await fixture();
  const {state}=await advance(f,360);
  const deathTick=new Map(state.deaths.map(x=>[x.id,x.tick]));
  assert.ok(state.knownBullets.every(b=>
    !deathTick.has(b.enemyId)||b.createdTick<=deathTick.get(b.enemyId)));
});
test('projected pending bursts cannot be scheduled after enemy death',async()=>{
  const f=await fixture();
  const {state}=await advance(f,360);
  const deathTick=new Map(state.deaths.map(x=>[x.id,x.tick]));
  assert.ok(state.pending.every(p=>
    !deathTick.has(p.enemyId)||p.dueTick<=deathTick.get(p.enemyId)));
});
test('upstream dead-actor simulations remain explicitly NOT verified',async()=>{
  const f=await fixture();
  const {report:r}=await advance(f,360);
  assert.equal(r.actualUpstreamEnemyAiDespawnVerified,false);
  assert.equal(r.actualPostDeathIncomingDamageReconciled,false);
  assert.equal(r.candidateDeathRemovesFromProjectedView,true);
  assert.ok(r.upstreamGhostEnemyFrames>0);
  assert.ok(r.candidatePostDeathShotsFiltered>=0);
});
test('deaths are monotone with same tick-stamped event in chunks',async()=>{
  const f=await fixture();
  const a=await advance(f,180,60);
  const b=await fixture();
  const c=await advance(b,360,60);
  for(const x of a.state.deaths){
    assert.deepEqual(c.state.deaths.find(y=>y.id===x.id),x);
  }
});
test('candidate lifecycle digest is deterministic across batch boundaries',async()=>{
  const f=await fixture();
  const x=await advance(f,360,60);
  const g=await fixture();
  const y=await advance(g,360,23);
  assert.equal(x.report.lifecycleDigest,y.report.lifecycleDigest);
  assert.equal(x.report.candidateDead,y.report.candidateDead);
  assert.equal(x.report.upstreamOutgoingDigest,y.report.upstreamOutgoingDigest);
});
test('tick 361 rejected after bounded 360-tick replay',async()=>{
  const f=await fixture();
  const {state}=await advance(f,360);
  await assert.rejects(lifecycleStep(f,state,1),
    err('C15_DUNGEON_V2C6_TICK_CAP'));
});
test('no claim or finalize API even after death candidate',async()=>{
  const f=await fixture();
  await advance(f,360);
  assert.throws(()=>f.lifecycle.claim({coins:999}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.lifecycle.finalize({victory:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});
test('pure reconcile rejects unknown/untrusted tick chain',()=>{
  assert.throws(()=>reconcileC15DungeonLifecycleTickV2C6({},{}),TypeError);
  assert.throws(()=>reconcileC15DungeonLifecycleTickV2C6({tick:0,roster:[]},
    {tick:2,enemies:[]}),TypeError);
});
test('pure reconcile rejects fabricated HP delta without hit ledger',async()=>{
  const f=await fixture();
  const start=f.lifecycleOpened.state;
  f.setTime(ISSUE+1300);
  const next=(await f.outgoing.step({state:start.outgoingState,
    ticket:f.ticket,movementState:f.movementState,...f.actor,ticks:1})).state;
  const forged=structuredClone(next);
  forged.enemies[0].hp-=1;
  assert.throws(()=>reconcileC15DungeonLifecycleTickV2C6(start,forged),TypeError);
});
test('pure reconcile rejects forged resurrection state',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1300);
  const start=f.lifecycleOpened.state;
  const next=(await f.outgoing.step({state:start.outgoingState,
    ticket:f.ticket,movementState:f.movementState,...f.actor,ticks:1})).state;
  const forged=structuredClone(next);
  forged.enemies[0].hp+=1;
  assert.throws(()=>reconcileC15DungeonLifecycleTickV2C6(start,forged),TypeError);
});
test('pure reconcile rejects altered incoming/outgoing history digests',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1300);
  const start=f.lifecycleOpened.state;
  const next=(await f.outgoing.step({state:start.outgoingState,
    ticket:f.ticket,movementState:f.movementState,...f.actor,ticks:1})).state;
  const forged=structuredClone(next);
  forged.upstreamState.upstreamDigest='a'.repeat(64);
  assert.throws(()=>reconcileC15DungeonLifecycleTickV2C6(start,forged),TypeError);
});
test('none of Economy, gameplay client or server routes are modified',async()=>{
  const fs=require('node:fs');
  const base=path.resolve(__dirname,'../..');
  assert.doesNotMatch(fs.readFileSync(path.join(base,'server/server.js'),'utf8'),
    /c15DungeonLifecycleIntegrationV2C6/);
  assert.match(fs.readFileSync(path.join(base,'client/src/components/Dungeon/DungeonScene.js'),'utf8'),
    /applyPlayerDamageToEnemy/);
  assert.equal((await createC15DungeonLifecycleIntegrationV2C6()).cloudRewards,false);
});
