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
  return {damage,damageOpened,multi,timeline,service,ticketService,movementService,actor,ticket,movementState,upstreamOpened,
    opened,docs,profile,active,admission,setTime:t=>{at=t;},
    get reads(){return reads;},get writes(){return writes;}};
}
const step=(f,state,ticks,extra={})=>f.multi.step({state,ticket:f.ticket,
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
  return f.multi.inspect(state);
}



const damageStep=(f,state,ticks,extra={})=>f.damage.step({state,ticket:f.ticket,
  movementState:f.movementState,...f.actor,ticks,...extra});
async function damageAdvance(f,from,ticks,chunk=60){
  let state=from;
  while(ticks>0){
    const n=Math.min(ticks,chunk);
    // V2C.1 checks that our synthetic QA clock has elapsed through the tick.
    f.setTime(ISSUE+1100+Math.ceil((state.tick+n)*1000/TICK_HZ));
    const outcome=await damageStep(f,state,n);
    state=outcome.state;ticks-=n;
  }
  return f.damage.inspect(state);
}
let mathPromise;
const math=()=>mathPromise||(mathPromise=Promise.all([
  client('game/dungeon/DungeonCombatIntegrityV392.js'),
  client('game/dungeon/DungeonBalanceV426.js'),
  client('game/combat/BattlePassives.js'),
  client('game/combat/PlayerDamagePipelineV25.js'),
]).then(([integrity,balance,passives,gate])=>({integrity,balance,passives,gate})));
const hitInput={from:{x:-3,z:0},to:{x:3,z:0},
  player:{x:0,z:0},rawDamage:100,damageType:'kinetic',priority:'normal',
  visual:{width:.3},vitals:{hp:1200,shieldHp:240}};

test('V2C.4 OFF by default, no claim/finalize route',async()=>{
  assert.equal(parseC15DungeonDamageStateV2C4Config({}),null);
  const off=await createC15DungeonDamageStateV2C4();
  assert.equal(off.enabled,false);
  assert.throws(()=>off.open({}),err('C15_DUNGEON_V2C4_DISABLED'));
  assert.throws(()=>off.claim({coins:1e9}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('all emulator/allowlist/upstream flags must be true',()=>{
  const ok=parseC15DungeonDamageStateV2C4Config(env);
  assert.equal(ok.emulatorOnly,true);
  for(const change of [
    {GAME_C15_DUNGEON_V2C4_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2C2_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {FIRESTORE_EMULATOR_HOST:'0.0.0.0:38081'},
  ]) assert.throws(()=>parseC15DungeonDamageStateV2C4Config({...env,...change}),TypeError);
  assert.equal(parseC15DungeonDamageStateV2C4Config({...env,
    GAME_C15_DUNGEON_V2C4_ENABLED:'false'}),null);
});
test('real V2C.3 and V2B.3 non-economic services required',async()=>{
  await assert.rejects(createC15DungeonDamageStateV2C4({env}),TypeError);
  await assert.rejects(createC15DungeonDamageStateV2C4({env,
    multiEnemyService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      safeForSettlement:true,rewardSettlementEnabled:false,cloudRewards:false,
      open:()=>{},step:()=>{},inspect:()=>{}},
    movementService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      rewardSettlementEnabled:false,inspect:()=>({})}}),TypeError);
});
test('open checks actual server-issued signed ticket and V2C.3 state',async()=>{
  const f=await fixture(),r=f.damageOpened.report;
  assert.equal(r.version,V2C4_VERSION);
  assert.equal(r.sceneSeed,f.ticket.sceneSeed);
  assert.equal(r.battleId,f.ticket.battleId);
  assert.equal(r.candidatePlayerHp,1200);
  assert.equal(r.candidatePlayerShieldHp,240);
  assert.equal(r.serverOwnedQaDefensePreset,QA_DEFENSE_FIXTURE.id);
  assert.equal(r.simulatedTicks,0);
  assert.equal(f.writes,0);
  assert.ok(f.reads>0);
});
test('open fails closed for client supplied HP, damage, gear, victory, reward',async()=>{
  const f=await fixture();
  for(const extra of [{hp:999999},{shieldHp:999999},{enemyHp:0},
    {damage:1e9},{gear:'god-mode'},{victory:true},{reward:{diamonds:100}}])
    await assert.rejects(f.damage.open({ticket:f.ticket,
      movementState:f.movementState,...f.actor,...extra}),
      err('C15_DUNGEON_V2C4_INPUT_INVALID'));
});
test('open rejects different account, session and modified ticket',async()=>{
  const f=await fixture();
  for(const extra of [{uid:'attacker'},{sessionId:'00000000-0000-4000-8000-000000000000'}])
    await assert.rejects(f.damage.open({ticket:f.ticket,
      movementState:f.movementState,...f.actor,...extra}));
  await assert.rejects(f.damage.open({ticket:{...f.ticket,mac:'f'.repeat(64)},
    movementState:f.movementState,...f.actor}));
});
test('no collision gives strictly unchanged HP and shield',async()=>{
  const {integrity,balance,passives}=await math();
  const p=projectCandidateHitV2C4({...hitInput,
    player:{x:40,z:40}},{integrity,balance,passives});
  assert.equal(p.hit,false);
  assert.equal(p.hpAfter,1200);
  assert.equal(p.shieldAfter,240);
  assert.equal(p.appliedHpDamage,0);
});
test('swept collision detects a fast bullet crossing player between frames',async()=>{
  const {integrity,balance,passives}=await math();
  const impact=projectCandidateHitV2C4(hitInput,{integrity,balance,passives});
  assert.equal(impact.hit,true);
  assert.equal(impact.scaledDamage,100);
  assert.equal(impact.hpAfter,1200);
  assert.equal(impact.shieldAfter,169);
  assert.equal(impact.absorbed,71);
  assert.equal(impact.appliedHpDamage,0);
});
test('Taurus damage balance + armor fixed QA profile matches shared BattlePassives',async()=>{
  const {integrity,balance,passives}=await math();
  const impact=projectCandidateHitV2C4({...hitInput,
    rawDamage:400,vitals:{hp:900,shieldHp:0}},
    {integrity,balance,passives});
  assert.equal(impact.hit,true);
  assert.equal(impact.scaledDamage,400);
  assert.equal(impact.hpAfter,615); // floor(400 * .75 * .95) = 285
  assert.equal(impact.shieldAfter,0);
  assert.equal(impact.appliedHpDamage,285);
});
test('remaining shields absorb first and HP takes remainder, bounded at zero',async()=>{
  const {integrity,balance,passives}=await math();
  const impact=projectCandidateHitV2C4({...hitInput,
    rawDamage:500,vitals:{hp:100,shieldHp:50}},
    {integrity,balance,passives});
  assert.equal(impact.hit,true);
  assert.equal(impact.absorbed,50);
  assert.equal(impact.hpAfter,0);
  assert.equal(impact.appliedHpDamage,100);
  assert.equal(impact.shieldAfter,0);
});
test('projected damage accepts only bounded numerical server-owned fixture inputs',async()=>{
  const {integrity,balance,passives}=await math();
  for(const change of [{rawDamage:Infinity},{rawDamage:NaN},
    {rawDamage:-1},{rawDamage:100001},
    {player:{x:Infinity,z:0}},
    {vitals:{hp:1e9,shieldHp:10}},
    {vitals:{hp:200,shieldHp:300}},
    {from:{x:NaN,z:0}}])
    assert.throws(()=>projectCandidateHitV2C4({...hitInput,...change},
      {integrity,balance,passives}),TypeError);
});
test('pure hit gate V2.5 rejects the same deterministic projectile ID',async()=>{
  const {gate}=await math();
  const state=gate.createPlayerDamageGateV25();
  assert.equal(state.admitHit({source:'projectile',hitId:'id_1',nowMs:100}).accepted,true);
  assert.equal(state.admitHit({source:'projectile',hitId:'id_1',nowMs:100}).accepted,false);
  assert.equal(state.admitHit({source:'projectile',hitId:'id_2',nowMs:101}).accepted,true);
});
test('V2C.4 initial state is deeply frozen and cannot be client-edited',async()=>{
  const f=await fixture(),s=f.damageOpened.state;
  assert.ok(Object.isFrozen(s));
  assert.ok(Object.isFrozen(s.upstreamState));
  assert.ok(Object.isFrozen(s.roster));
  assert.throws(()=>{s.hp=999999;},TypeError);
  assert.throws(()=>{s.player.x=88;},TypeError);
});
test('state cloned out of process is rejected',async()=>{
  const f=await fixture();
  await assert.rejects(damageStep(f,structuredClone(f.damageOpened.state),1),
    err('C15_DUNGEON_V2C4_STATE_UNTRUSTED'));
});
test('step rejects external client-reported HP, hits or rewards',async()=>{
  const f=await fixture();
  for(const extra of [{hp:0},{enemyHp:0},{hits:[{damage:1e9}]},
    {money:10000},{reward:true},{outcome:'victory'}])
    await assert.rejects(damageStep(f,f.damageOpened.state,1,extra),
      err('C15_DUNGEON_V2C4_INPUT_INVALID'));
});
test('step rejects actor and ticket transfer',async()=>{
  const f=await fixture();
  for(const extra of [{uid:'attacker'},{requestId:'other'},
    {sessionId:'00000000-0000-4000-8000-000000000000'}])
    await assert.rejects(damageStep(f,f.damageOpened.state,1,extra),
      err('C15_DUNGEON_V2C4_ACTOR_MISMATCH'));
  await assert.rejects(damageStep(f,f.damageOpened.state,1,
    {ticket:{...f.ticket,mac:'f'.repeat(64)}}),
    err('C15_DUNGEON_V2C4_TICKET_MISMATCH'));
});
test('tampered movement snapshot cannot be substituted for the bound proof',async()=>{
  const f=await fixture();
  await oneGesture(f);
  await assert.rejects(damageStep(f,f.damageOpened.state,1),
    err('C15_DUNGEON_V2C4_TOUCH_TIMELINE_UNALIGNED'));
});
test('zero scheduled projectiles in first 10 ticks means zero damage',async()=>{
  const f=await fixture();
  const r=await damageAdvance(f,f.damageOpened.state,10,10);
  assert.equal(r.simulatedTicks,10);
  assert.equal(r.candidateProjectileHits,0);
  assert.equal(r.candidatePlayerHp,1200);
  assert.equal(r.candidatePlayerShieldHp,240);
});
test('fixed-defense candidate HP/shield conservation and finite digest at 360 ticks',async()=>{
  const f=await fixture();
  const r=await damageAdvance(f,f.damageOpened.state,360,60);
  assert.equal(r.simulatedTicks,360);
  assert.match(r.damageDigest,/^[a-f0-9]{64}$/);
  assert.ok(r.candidateProjectileSweeps>0);
  assert.ok(r.candidateProjectileHits>0,'Taurus QA must produce actual projectile-hit candidates');
  assert.ok(r.candidateHpDamage+r.candidateShieldAbsorbed>0);
  assert.ok(r.candidatePlayerHp>=0&&r.candidatePlayerHp<=1200);
  assert.ok(r.candidatePlayerShieldHp>=0&&r.candidatePlayerShieldHp<=240);
  assert.equal(r.candidateHpDamage,1200-r.candidatePlayerHp);
  assert.equal(r.candidateShieldAbsorbed,240-r.candidatePlayerShieldHp);
  assert.equal(f.writes,0);
});
test('identical ticket and input produce same digest with 1/20/60 tick batches',async()=>{
  const [a,b,c]=await Promise.all([fixture(),fixture(),fixture()]);
  const [x,y,z]=await Promise.all([
    damageAdvance(a,a.damageOpened.state,180,1),
    damageAdvance(b,b.damageOpened.state,180,20),
    damageAdvance(c,c.damageOpened.state,180,60),
  ]);
  assert.deepEqual(x,y);assert.deepEqual(y,z);
});
test('same request retry is idempotent and forks from consumed state are rejected',async()=>{
  const f=await fixture();f.setTime(ISSUE+20000);
  const old=f.damageOpened.state;
  const first=await damageStep(f,old,10);
  const retry=await damageStep(f,old,10);
  assert.equal(first.duplicate,false);
  assert.equal(retry.duplicate,true);
  assert.deepEqual(first.report,retry.report);
  assert.equal(first.state,retry.state);
  await assert.rejects(damageStep(f,old,11),
    err('C15_DUNGEON_V2C4_REUSED_STATE'));
});
test('concurrent identical retries resolve to one result and fork is rejected',async()=>{
  const f=await fixture();f.setTime(ISSUE+20000);
  const old=f.damageOpened.state;
  const [a,b]=await Promise.all([damageStep(f,old,10),damageStep(f,old,10)]);
  assert.equal(a.state,b.state);
  assert.equal(+a.duplicate+ +b.duplicate,1);
  await assert.rejects(damageStep(f,old,9),
    err('C15_DUNGEON_V2C4_REUSED_STATE'));
});
test('steps are bounded, no fast-forward more than 60 or past 360',async()=>{
  const f=await fixture();
  for(const n of [0,-1,1.2,61,361,Infinity])
    await assert.rejects(damageStep(f,f.damageOpened.state,n),
      err('C15_DUNGEON_V2C4_INPUT_INVALID'));
  let state=f.damageOpened.state;
  for(let end=60;end<=360;end+=60){
    f.setTime(ISSUE+1100+Math.ceil(end*1000/TICK_HZ));
    state=(await damageStep(f,state,60)).state;
  }
  await assert.rejects(damageStep(f,state,1),
    err('C15_DUNGEON_V2C4_TICK_CAP'));
});
test('all live parity, independent replay and economic verdict flags stay false',async()=>{
  const f=await fixture();
  const r=await damageAdvance(f,f.damageOpened.state,120,30);
  for(const k of [
    'actualAccountLoadoutVerified','manualShipSkillVerified',
    'actualDeviceProvenanceVerified','actualPlayerMovementTickParityVerified',
    'liveMuzzleWorldMatrixVerified','actualEnemyAndProjectileRuntimeParityVerified',
    'outgoingDamageAndEnemyHpVerified','bossAndHazardsVerified',
    'fullCombatDamagePipelineVerified','playerDefeatVerified',
    'battleVictoryVerified','independentReplayVerified','safeForSettlement',
    'rewardSettlementEnabled','cloudRewards'
  ])assert.equal(r[k],false,k);
});
test('no method can turn candidate damage into real victory or settlement',async()=>{
  const f=await fixture();
  for(const fn of ['claim','finalize'])
    assert.throws(()=>f.damage[fn]({victory:true,rewards:100000}),
      err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.damage.productionEnabled,false);
  assert.equal(f.damage.cloudRewards,false);
  assert.equal(f.writes,0);
});
test('service module never registers server or mutates economy/campaign',async()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync(path.resolve(__dirname,
    '../lib/c15DungeonDamageStateV2C4.cjs'),'utf8');
  assert.doesNotMatch(source,/\b(app\.(get|post|put|delete)|router\.post|\.set\(|\.update\()\s*\(/);
  assert.doesNotMatch(source,/\b(firebaseAdmin|firestore\.doc|process\.env)\b/);
  const f=await fixture();
  assert.equal(f.writes,0);
});
