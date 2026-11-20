'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {VERSION:V1_VERSION,createDungeonContractV1}=require('../lib/c15DungeonFoundationV1.cjs');
const {createC15DungeonSeedTouchTicketV2B2}=require('../lib/c15DungeonSeedTouchTicketV2B2.cjs');
const {createC15DungeonMovementParityV2B3}=require('../lib/c15DungeonMovementParityV2B3.cjs');
const {VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  parseC15DungeonUnifiedCombatV2C8Config,
  createC15DungeonUnifiedCombatV2C8}=require('../lib/c15DungeonUnifiedCombatV2C8.cjs');
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
  GAME_C15_DUNGEON_V2C8_ENABLED:'true',
  GAME_C15_DUNGEON_V2C8_QA_APPROVED:'true',
  GOOGLE_CLOUD_PROJECT:PROJECT,GCLOUD_PROJECT:PROJECT,
  FIREBASE_PROJECT_ID:PROJECT,FIRESTORE_EMULATOR_HOST:'127.0.0.1:38081',
});
const error=code=>e=>e?.code===code;
const client=f=>import(pathToFileURL(path.resolve(__dirname,'../../client/src',f)).href);
let listingPromise,contentPromise;
const listing=()=>listingPromise||(listingPromise=client('constants.js'));
const content=()=>contentPromise||(contentPromise=client('game/dungeon/DungeonContentCatalogV393.js'));
async function fixture(){
  let at=ISSUE+100;
  const [constants,catalog]=await Promise.all([listing(),content()]);
  const contract=createDungeonContractV1('dung_taurus',{
    listings:constants.DUNGEON_CONFIG,content:catalog.DUNGEON_CONTENT_CATALOG_V393,
    hazards:catalog.DUNGEON_HAZARD_PROFILES_V393,
    objectives:catalog.DUNGEON_OBJECTIVE_PROFILES_V393});
  const admission={version:V1_VERSION,uid:UID,sessionId:SID,battleId:BID,
    dungeonId:'dung_taurus',requestId:REQ,requestDigest:'f'.repeat(64),
    contractDigest:contract.contractDigest,energyCharged:contract.energyCost,
    admittedAtMs:ISSUE,expiresAtMs:ISSUE+20*60*1000,
    status:'admitted-emulator',qaOnly:true,source:'firestore-emulator',
    independentReplayVerified:false,rewardSettlementEnabled:false,cloudRewards:false};
  const profile={sessionId:SID,campaignData:{profileId:'qa_profile_42'},wallet:{energy:30}};
  const active={version:V1_VERSION,uid:UID,sessionId:SID,battleId:BID,
    requestId:REQ,status:'admitted-emulator',expiresAtMs:admission.expiresAtMs,
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
      delete:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
    };}
    return ref(name);
  }})};
  const ticketService=await createC15DungeonSeedTouchTicketV2B2({env,db,
    now:()=>at,signingKey:Buffer.alloc(32,99)});
  const movementService=await createC15DungeonMovementParityV2B3({env,ticketService});
  const service=await createC15DungeonUnifiedCombatV2C8({env,ticketService,movementService});
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  const ticket=await ticketService.issueTicket(actor);
  const movementState=await movementService.open({ticket,...actor});
  const opened=await service.open({ticket,movementState,...actor});
  return {service,opened,actor,ticket,movementState,ticketService,movementService,
    docs,admission,profile,active,setTime:t=>{at=t;},
    get reads(){return reads;},get writes(){return writes;}};
}
const step=(f,s,ticks,overrides={})=>f.service.step({state:s,ticket:f.ticket,
  movementState:f.movementState,...f.actor,ticks,...overrides});
async function advance(f,limit=360,chunk=60){
  let state=f.opened.state;
  for(let t=0;t<limit;){
    const n=Math.min(chunk,limit-t);
    f.setTime(ISSUE+1100+Math.ceil((t+n)*1000/TICK_HZ));
    state=(await step(f,state,n)).state;t+=n;
  }
  return {state,report:f.service.inspect(state)};
}

test('V2C.8 disabled by default and claims always locked',async()=>{
  const s=await createC15DungeonUnifiedCombatV2C8();
  assert.equal(s.enabled,false);assert.equal(s.safeForSettlement,false);
  assert.equal(s.rewardSettlementEnabled,false);assert.equal(s.cloudRewards,false);
  assert.throws(()=>s.open(),error('C15_DUNGEON_V2C8_DISABLED'));
  assert.throws(()=>s.claim({victory:true}),error('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>s.finalize(),error('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.8 explicit gate and every predecessor demo gate required',()=>{
  assert.equal(parseC15DungeonUnifiedCombatV2C8Config({}),null);
  for(const bad of [
    {GAME_C15_DUNGEON_V2C8_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C7_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2C6_QA_APPROVED:'false'},
    {FIRESTORE_EMULATOR_HOST:''},{GOOGLE_CLOUD_PROJECT:'prod-realm'},
  ])assert.throws(()=>parseC15DungeonUnifiedCombatV2C8Config({...env,...bad}),TypeError);
});
test('V2C.8 prototype-inherited or array environment rejected',()=>{
  assert.throws(()=>parseC15DungeonUnifiedCombatV2C8Config(Object.create(env)),TypeError);
  assert.throws(()=>parseC15DungeonUnifiedCombatV2C8Config([]),TypeError);
});
test('enabled V2C.8 rejects absent ticket/movement chain',async()=>{
  await assert.rejects(createC15DungeonUnifiedCombatV2C8({env}),TypeError);
});
test('rejects economic privilege in ticket service',async()=>{
  const f=await fixture();
  for(const key of ['productionEnabled','rewardSettlementEnabled'])
    await assert.rejects(createC15DungeonUnifiedCombatV2C8({env,
      ticketService:{...f.ticketService,[key]:true},movementService:f.movementService}),TypeError);
});
test('rejects economic privilege in movement service',async()=>{
  const f=await fixture();
  for(const key of ['productionEnabled','rewardSettlementEnabled'])
    await assert.rejects(createC15DungeonUnifiedCombatV2C8({env,
      ticketService:f.ticketService,movementService:{...f.movementService,[key]:true}}),TypeError);
});
test('signed admission, seed, catalog, fixed player pose and loadout',async()=>{
  const f=await fixture();const r=f.opened.report,s=f.opened.state;
  assert.equal(r.version,VERSION);assert.equal(r.simulatedTicks,0);
  assert.equal(s.ticketMac,f.ticket.mac);
  assert.equal(s.sceneSeed,f.ticket.sceneSeed);
  assert.equal(s.spawnDigest,f.ticket.spawnPlanDigest);
  assert.equal(s.hp,1200);assert.equal(s.shieldHp,240);
  assert.equal(r.qaWeaponPreset,'taurus-homing-main-v2c5-NOT-account-loadout');
  assert.equal(r.independentlyVerifiedFullDungeonCombat,false);
  assert.equal(r.rewardSettlementEnabled,false);
  assert.equal(f.writes,0);
});
test('closed-loop API does not depend on V2C3-7 step results',async()=>{
  const f=await fixture();
  const r=await step(f,f.opened.state,1);
  assert.equal(r.report.previousUpstreamV2C3ToV2C7StepCalls,0);
  assert.equal(r.report.causallyLinkedCandidateTickLoop,true);
  assert.equal(r.report.candidateDeathsComputedInsideSameTickLoop,true);
  assert.equal(r.report.outgoingUsesSameTickAiPositions,true);
  assert.equal(r.report.incomingUsesSameLoopHostileProjectiles,true);
  assert.equal(f.writes,0);
});
test('only exact allowed tick arguments, no client HP or kills',async()=>{
  const f=await fixture();
  for(const bad of [{hp:0},{shieldHp:0},{enemyHp:0},{deathTick:1},
    {kills:['x']},{reward:{gems:999}},{victory:true},
    {damage:90000},{attack:99999},{position:{x:0,z:0}},
    {clientTick:1000},{slotId:'mine'}, {debugForceHit:true}])
    await assert.rejects(step(f,f.opened.state,1,bad),
      error('C15_DUNGEON_V2C8_INPUT_INVALID'));
});
test('unissued clone of server state is rejected',async()=>{
  const f=await fixture();
  await assert.rejects(step(f,structuredClone(f.opened.state),1),
    error('C15_DUNGEON_V2C8_STATE_UNTRUSTED'));
});
test('tampered state HP, slot or digest rejected',async()=>{
  const f=await fixture();
  for(const bad of [{hp:0},{combatDigest:'0'.repeat(64)},
    {deaths:[{id:'x',tick:1}]},{actors:[{id:'forged'}]}])
    await assert.rejects(step(f,{...f.opened.state,...bad},1),
      error('C15_DUNGEON_V2C8_STATE_UNTRUSTED'));
});
test('changing ticket MAC, battle, seed or catalog denied',async()=>{
  const f=await fixture();
  for(const bad of [{mac:'f'.repeat(64)},{battleId:'other'},
    {sceneSeed:42},{spawnPlanDigest:'0'.repeat(64)}])
    await assert.rejects(step(f,f.opened.state,1,
      {ticket:{...f.ticket,...bad}}),error('C15_DUNGEON_V2C8_TICKET_MISMATCH'));
});
test('actor, session and request are non-transferable',async()=>{
  const f=await fixture();
  for(const bad of [{uid:'other'},{sessionId:'other'},{requestId:'other'}])
    await assert.rejects(step(f,f.opened.state,1,bad),
      error('C15_DUNGEON_V2C8_ACTOR_MISMATCH'));
});
test('zero, fractional, negative and over-batch ticks rejected',async()=>{
  const f=await fixture();
  for(const ticks of [0,1.5,61,360,-1,NaN,Infinity])
    await assert.rejects(step(f,f.opened.state,ticks),
      error('C15_DUNGEON_V2C8_INPUT_INVALID'));
});
test('one tick advances exactly one causal loop without client input',async()=>{
  const f=await fixture();const u=await step(f,f.opened.state,1);
  assert.equal(u.duplicate,false);assert.equal(u.report.simulatedTicks,1);
  assert.match(u.report.candidateDigest,/^[a-f0-9]{64}$/);
  assert.equal(u.state.roster.length,f.opened.state.roster.length);
});
test('immutable issued state cannot mutate enemy HP or its history',async()=>{
  const f=await fixture();const u=await step(f,f.opened.state,18);
  assert.equal(Object.isFrozen(u.state),true);
  assert.equal(Object.isFrozen(u.state.roster[0]),true);
  assert.throws(()=>{u.state.roster[0].hp=0;},TypeError);
  assert.throws(()=>{u.state.deaths.push({id:'x',tick:18});},TypeError);
});
test('same request retry is idempotent and returns identical sealed state',async()=>{
  const f=await fixture();const a=await step(f,f.opened.state,9);
  const b=await step(f,f.opened.state,9);
  assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);
  assert.equal(a.state,b.state);
  assert.equal(a.report.candidateDigest,b.report.candidateDigest);
});
test('consumed old state cannot fork with different tick count',async()=>{
  const f=await fixture();await step(f,f.opened.state,9);
  await assert.rejects(step(f,f.opened.state,10),
    error('C15_DUNGEON_V2C8_REUSED_STATE'));
});
test('concurrent identical attempts consume state once',async()=>{
  const f=await fixture();const rs=await Promise.all(Array.from({length:9},()=>
    step(f,f.opened.state,7)));
  assert.equal(rs.filter(x=>!x.duplicate).length,1);
  assert.ok(rs.every(x=>x.state===rs[0].state));
  assert.equal(f.writes,0);
});
test('wrong movement snapshot from other instance rejected',async()=>{
  const a=await fixture(),b=await fixture();
  await assert.rejects(step(a,a.opened.state,1,{movementState:b.movementState}),
    error('C15_DUNGEON_V2B3_STATE_UNTRUSTED'));
});
test('deleted QA admission rejects next operation; no stale authority',async()=>{
  const f=await fixture();
  f.docs.delete(`users/${UID}/c15DungeonV1Admissions/${REQ}`);
  await assert.rejects(step(f,f.opened.state,1),
    error('C15_DUNGEON_V2B2_NO_ADMISSION'));
  assert.equal(f.writes,0);
});
test('six second replay never exceeds cap',async()=>{
  const f=await fixture();const x=await advance(f,360);
  assert.equal(x.report.simulatedTicks,MAX_TICKS);
  await assert.rejects(step(f,x.state,1),error('C15_DUNGEON_V2C8_TICK_CAP'));
});
test('causal enemy deaths originate from same-loop player hits',async()=>{
  const f=await fixture();const {state,report:r}=await advance(f);
  assert.ok(r.candidateDeadEnemies>0);
  assert.equal(r.candidateDeaths.length,r.candidateDeadEnemies);
  for(const death of state.deaths){
    const hit=state.outgoingHits.find(h=>h.shotId===death.shotId&&
      h.enemyId===death.id&&h.tick===death.tick&&h.killed);
    assert.ok(hit,'every death requires a real same-loop outgoing hit');
    assert.equal(state.roster.find(e=>e.id===death.id).deathTick,death.tick);
  }
  assert.equal(f.writes,0);
});
test('dead enemy leaves live FSM/slot roster and never respawns',async()=>{
  const f=await fixture();const {state,report:r}=await advance(f);
  const dead=new Set(state.deaths.map(d=>d.id));
  assert.ok(state.actors.every(e=>!dead.has(e.id)));
  assert.ok(state.pending.every(x=>!dead.has(x.enemyId)));
  assert.ok(r.candidateReleasedSlots>0);
  assert.ok(r.candidateDeathAwareFsmSkipped>0);
  assert.equal(new Set(r.candidateLiveCombatSlotIds).size,r.candidateLiveCombatSlotIds.length);
});
test('no hostile shots created AFTER the originating enemy death',async()=>{
  const f=await fixture();const {state}=await advance(f);
  const byDeath=new Map(state.deaths.map(d=>[d.id,d.tick]));
  for(const b of state.hostileBullets){
    const at=byDeath.get(b.enemyId);
    if(at!==undefined)assert.ok(b.createdTick<=at);
  }
  assert.ok(state.pending.every(p=>!byDeath.has(p.enemyId)));
});
test('previously launched hostile projectiles remain causally possible',async()=>{
  const f=await fixture();const {state,report:r}=await advance(f);
  assert.ok(r.candidateHostileShots>=r.candidateActiveHostileShots);
  assert.ok(state.incomingHits.every(h=>h.tick>0));
  assert.equal(r.incomingUsesSameLoopHostileProjectiles,true);
});
test('candidate player and shield HP remain in server fixture bounds',async()=>{
  const f=await fixture();const {state,report:r}=await advance(f);
  assert.ok(r.candidatePlayerHp>=0&&r.candidatePlayerHp<=1200);
  assert.ok(r.candidatePlayerShieldHp>=0&&r.candidatePlayerShieldHp<=240);
  assert.equal(r.candidateHostileHits,state.incomingHits.length);
  assert.ok(state.incomingHits.every(h=>h.shotId&&h.enemyId));
  assert.equal(r.actualAccountLoadoutVerified,false);
});
test('unified replay deterministic with different chunk boundaries',async()=>{
  const a=await fixture(),b=await fixture();
  const x=await advance(a,360,60),y=await advance(b,360,23);
  assert.equal(x.report.candidateDigest,y.report.candidateDigest);
  assert.deepEqual(x.report.candidateDeaths,y.report.candidateDeaths);
  assert.deepEqual(x.report.candidateEnemyHp,y.report.candidateEnemyHp);
  assert.equal(x.report.candidatePlayerHp,y.report.candidatePlayerHp);
});
test('short replay chunk equals a single batched replay',async()=>{
  const a=await fixture(),b=await fixture();
  const x=await step(a,a.opened.state,39);
  const y=await advance(b,39,13);
  assert.equal(x.report.candidateDigest,y.report.candidateDigest);
});
test('no source code references to economic routes for V2C.8',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(source,/c15DungeonUnifiedCombatV2C8/);
  assert.doesNotMatch(source,/GAME_C15_DUNGEON_V2C8_ENABLED/);
});
test('no full live parity or economic capability is ever advertised',async()=>{
  const f=await fixture();const {report:r}=await advance(f,180);
  for(const field of ['independentlyVerifiedFullDungeonCombat',
    'liveGameplayAiParityVerified','liveBabylonMuzzleVerified',
    'playerTouchPerTickVerified','actualAccountLoadoutVerified',
    'actualDeviceProvenanceVerified','chargerBossHazardsVerified',
    'dungeonVictoryVerified','independentReplayVerified','safeForSettlement',
    'rewardSettlementEnabled','cloudRewards'])
    assert.equal(r[field],false,field);
  assert.throws(()=>f.service.claim({gems:100}),
    error('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.service.finalize({victory:true}),
    error('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});
test('provenance is demo DB read-only with no production HTTP, Firestore writes',async()=>{
  const f=await fixture();await advance(f,120);
  assert.ok(f.reads>0);assert.equal(f.writes,0);
  assert.equal(f.service.productionEnabled,false);
  assert.equal(f.service.emulatorOnly,true);
});
test('same MAC with tampered ticket fields rejected even on consumed retry',async()=>{
  const f=await fixture();await step(f,f.opened.state,2);
  await assert.rejects(step(f,f.opened.state,2,
    {ticket:{...f.ticket,profileId:'qa_other'}}),
  error('C15_DUNGEON_V2C8_TICKET_MISMATCH'));
});
test('idempotent retry after admission revoked fails closed',async()=>{
  const f=await fixture();await step(f,f.opened.state,2);
  f.docs.delete(`users/${UID}/c15DungeonV1Admissions/${REQ}`);
  await assert.rejects(step(f,f.opened.state,2),
    error('C15_DUNGEON_V2B2_NO_ADMISSION'));
});
