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
const {VERSION:V2C5_VERSION,QA_WEAPON,parseC15DungeonOutgoingStateV2C5Config,
  applyCandidateOutgoingHitV2C5,createC15DungeonOutgoingStateV2C5}=require('../lib/c15DungeonOutgoingStateV2C5.cjs');
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
  return {outgoing,outgoingOpened,damage,damageOpened,multi,timeline,service,ticketService,movementService,actor,ticket,movementState,upstreamOpened,
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


const outgoingStep=(f,state,ticks,extra={})=>f.outgoing.step({state,ticket:f.ticket,
  movementState:f.movementState,...f.actor,ticks,...extra});
async function outgoingAdvance(f,from,ticks,chunk=60){
  let state=from;
  while(ticks>0){
    const n=Math.min(ticks,chunk);
    f.setTime(ISSUE+1100+Math.ceil((state.tick+n)*1000/TICK_HZ));
    const result=await outgoingStep(f,state,n);
    state=result.state;ticks-=n;
  }
  return f.outgoing.inspect(state);
}
let weaponsPromise;
const weapons=()=>weaponsPromise||(weaponsPromise=Promise.all([
  client('game/combat/PlayerWeapons.js'),client('utils/combatStats.js')
]).then(([w,c])=>({weapons:w,combatMath:c})));
const makeEnemy=(hp=180)=>({id:'test-enemy',hp,maxHp:180,entryActive:true,
  position:{x:0,z:0}});
const makeShot=()=>({id:'qa-shot',atk:90,remaining:1,hitKeys:[],
  position:{x:0,z:0}});

test('V2C.5 OFF by default, claim/finalize permanently locked',async()=>{
  assert.equal(parseC15DungeonOutgoingStateV2C5Config({}),null);
  const off=await createC15DungeonOutgoingStateV2C5();
  assert.equal(off.enabled,false);
  assert.throws(()=>off.open({}),err('C15_DUNGEON_V2C5_DISABLED'));
  assert.throws(()=>off.claim({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize({diamonds:999}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.5 requires explicit QA approval and full V1 through V2C.4 gates',()=>{
  const ok=parseC15DungeonOutgoingStateV2C5Config(env);
  assert.equal(ok.emulatorOnly,true);
  for(const change of [
    {GAME_C15_DUNGEON_V2C5_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C4_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2C3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B2_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {FIRESTORE_EMULATOR_HOST:'0.0.0.0:38081'},
  ])assert.throws(()=>parseC15DungeonOutgoingStateV2C5Config({...env,...change}),TypeError);
  assert.equal(parseC15DungeonOutgoingStateV2C5Config({
    ...env,GAME_C15_DUNGEON_V2C5_ENABLED:'false'}),null);
});
test('V2C.5 rejects missing or economic upstream service',async()=>{
  await assert.rejects(createC15DungeonOutgoingStateV2C5({env}),TypeError);
  await assert.rejects(createC15DungeonOutgoingStateV2C5({env,
    damageService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      safeForSettlement:true,rewardSettlementEnabled:false,cloudRewards:false,
      open:()=>{},step:()=>{},inspect:()=>{}},
    movementService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      rewardSettlementEnabled:false,inspect:()=>({})}}),TypeError);
});
test('V2C.5 open uses actual signed admission and account session binding',async()=>{
  const f=await fixture(),r=f.outgoingOpened.report;
  assert.equal(r.version,V2C5_VERSION);
  assert.equal(r.battleId,f.ticket.battleId);
  assert.equal(r.sceneSeed,f.ticket.sceneSeed);
  assert.equal(r.simulatedTicks,0);
  assert.equal(r.candidateShotsCreated,0);
  assert.equal(r.candidateEnemyDeaths,0);
  assert.equal(r.qaWeaponPreset,QA_WEAPON.id);
  assert.ok(r.candidateEnemyHp.length>=1);
  assert.ok(r.candidateEnemyHp.every(e=>e.hp===e.maxHp&&e.hp>0));
  assert.equal(r.rewardSettlementEnabled,false);
  assert.equal(f.writes,0);
  assert.ok(f.reads>0);
});
test('extra client-claimed attack, enemy HP, rewards, win, gear rejected at open',async()=>{
  const f=await fixture();
  for(const extra of [{atk:999999},{enemyHp:0},{killed:999},{loot:{coins:999}},
    {victory:true},{playerProjectiles:[{atk:1000}]},{gear:'god-mode'},
    {weaponId:'legendary'},{damage:1e9}])
    await assert.rejects(f.outgoing.open({ticket:f.ticket,
      movementState:f.movementState,...f.actor,...extra}),
      err('C15_DUNGEON_V2C5_INPUT_INVALID'));
});
test('wrong actor/session or forged seed ticket fails on open',async()=>{
  const f=await fixture();
  await assert.rejects(f.outgoing.open({ticket:f.ticket,
    movementState:f.movementState,...f.actor,uid:'other-account'}));
  await assert.rejects(f.outgoing.open({ticket:f.ticket,
    movementState:f.movementState,...f.actor,sessionId:'new-session'}));
  await assert.rejects(f.outgoing.open({ticket:{...f.ticket,mac:'0'.repeat(64)},
    movementState:f.movementState,...f.actor}));
});
test('pure outgoing hits share PlayerWeapons and combatStats damage arithmetic',async()=>{
  const modules=await weapons();
  const hit=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(),
    shot:makeShot(),position:{x:0,z:0}},modules);
  assert.equal(hit.hit,true);
  assert.equal(hit.damageApplied,90);
  assert.equal(hit.hpAfter,90);
  assert.equal(hit.consumed,true);
  assert.deepEqual(hit.hitKeys,['test-enemy']);
});
test('single projectile cannot hit same enemy twice',async()=>{
  const modules=await weapons();
  const bullet={...makeShot(),remaining:2};
  const first=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(),
    shot:bullet,position:{x:0,z:0}},modules);
  assert.equal(first.hit,true);
  assert.equal(first.consumed,false);
  const replay=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(90),
    shot:{...bullet,remaining:first.remaining,hitKeys:first.hitKeys},
    position:{x:0,z:0}},modules);
  assert.equal(replay.hit,false);
  assert.equal(replay.damageApplied,0);
});
test('single projectile penetration consumes after first distinct enemy',async()=>{
  const modules=await weapons();
  const first=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(),
    shot:makeShot(),position:{x:0,z:0}},modules);
  assert.equal(first.consumed,true);
  assert.equal(first.remaining,0);
});
test('no hit when outside live point collider radius',async()=>{
  const modules=await weapons();
  const r=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(),shot:makeShot(),
    position:{x:1.5001,z:0}},modules);
  assert.equal(r.hit,false);
  assert.equal(r.hpAfter,180);
});
test('exact collider radius boundary is included',async()=>{
  const modules=await weapons();
  const r=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(),shot:makeShot(),
    position:{x:1.5,z:0}},modules);
  assert.equal(r.hit,true);
});
test('entry shield and dead enemy prevent damage',async()=>{
  const modules=await weapons();
  const guarded=applyCandidateOutgoingHitV2C5({enemy:{...makeEnemy(),entryActive:false},
    shot:makeShot(),position:{x:0,z:0}},modules);
  assert.equal(guarded.hit,false);
  const dead=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(0),
    shot:makeShot(),position:{x:0,z:0}},modules);
  assert.equal(dead.hit,false);
});
test('damage capped at remaining HP; enemy death candidate not authority',async()=>{
  const modules=await weapons();
  const r=applyCandidateOutgoingHitV2C5({enemy:makeEnemy(25),
    shot:makeShot(),position:{x:0,z:0}},modules);
  assert.equal(r.hit,true);
  assert.equal(r.damageApplied,25);
  assert.equal(r.hpAfter,0);
  assert.equal(r.killed,true);
});
test('damage inputs reject NaN, infinities, prototype pollution, unsafe HP',async()=>{
  const modules=await weapons();
  for(const x of [
    {enemy:makeEnemy(-1),shot:makeShot(),position:{x:0,z:0}},
    {enemy:makeEnemy(181),shot:makeShot(),position:{x:0,z:0}},
    {enemy:makeEnemy(Number.NaN),shot:makeShot(),position:{x:0,z:0}},
    {enemy:makeEnemy(),shot:{...makeShot(),atk:Infinity},position:{x:0,z:0}},
    {enemy:makeEnemy(),shot:{...makeShot(),atk:1e12},position:{x:0,z:0}},
    {enemy:makeEnemy(),shot:{...makeShot(),remaining:9},position:{x:0,z:0}},
    {enemy:makeEnemy(),shot:{...makeShot(),hitKeys:['x',6]},position:{x:0,z:0}},
    {enemy:makeEnemy(),shot:makeShot(),position:{x:Infinity,z:0}},
  ])assert.throws(()=>applyCandidateOutgoingHitV2C5(x,modules),TypeError);
});
test('player pure homing shot moves toward target with shared frame formula',async()=>{
  const {weapons:w}=await weapons();
  const target={_dead:false,mesh:{position:{x:2,z:-8}}};
  const [shot]=w.describeMainSalvo(QA_WEAPON,{x:0,z:12.5},110,target);
  assert.equal(shot.homing,true);
  const bullet={position:{x:shot.x,z:shot.z},_vx:shot.vx,
    _vz:shot.vz,isHoming:true,target,_waveAmplitude:0};
  w.advancePlayerProjectile(bullet,1);
  assert.ok(bullet.position.z<shot.z);
  assert.ok(bullet.position.x>shot.x);
});
test('initial per-battle server QA weapon cannot be changed by client',async()=>{
  const f=await fixture();
  for(const extra of [{atk:2000000},{weapon:'god'},{firePattern:'shotgun'},
    {enemyHp:0},{victory:true},{damage:999999},{reward:{diamonds:5}}])
    await assert.rejects(outgoingStep(f,f.outgoingOpened.state,1,extra),
      err('C15_DUNGEON_V2C5_INPUT_INVALID'));
});
test('forged snapshot cannot be a server-issued state',async()=>{
  const f=await fixture();
  await assert.rejects(outgoingStep(f,structuredClone(f.outgoingOpened.state),1),
    err('C15_DUNGEON_V2C5_STATE_UNTRUSTED'));
});
test('mutated ticket on step fails closed',async()=>{
  const f=await fixture();
  await assert.rejects(outgoingStep(f,f.outgoingOpened.state,1,
    {ticket:{...f.ticket,mac:'f'.repeat(64)}}),
    err('C15_DUNGEON_V2C5_TICKET_MISMATCH'));
});
test('other account and session cannot borrow outgoing state',async()=>{
  const f=await fixture();
  for(const extra of [{uid:'other'},{sessionId:'evil'},
    {requestId:'other'}])
    await assert.rejects(outgoingStep(f,f.outgoingOpened.state,1,extra),
      err('C15_DUNGEON_V2C5_ACTOR_MISMATCH'));
});
test('frozen player pose cannot be silently changed',async()=>{
  const f=await fixture();
  await oneGesture(f);
  await assert.rejects(outgoingStep(f,f.outgoingOpened.state,1),
    err('C15_DUNGEON_V2C5_MOVEMENT_MISMATCH'));
});
test('zero, fractional, negative and huge ticks fail closed',async()=>{
  const f=await fixture();
  for(const ticks of [0,-1,.5,61,Infinity,NaN,99999])
    await assert.rejects(outgoingStep(f,f.outgoingOpened.state,ticks),
      err('C15_DUNGEON_V2C5_INPUT_INVALID'));
});
test('one tick advances real V2C.4 dependency without external writes',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1150);
  const a=await outgoingStep(f,f.outgoingOpened.state,1);
  assert.equal(a.report.simulatedTicks,1);
  assert.equal(a.state.upstreamState.tick,1);
  assert.equal(a.report.candidateShotsCreated,0);
  assert.equal(a.report.candidateHpDamage,0);
  assert.equal(f.writes,0);
});
test('retry with identical operation is idempotent and same issued state',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1400);
  const start=f.outgoingOpened.state;
  const a=await outgoingStep(f,start,5);
  const retry=await outgoingStep(f,start,5);
  assert.equal(a.duplicate,false);
  assert.equal(retry.duplicate,true);
  assert.equal(retry.state,a.state);
  assert.equal(retry.report.outgoingDigest,a.report.outgoingDigest);
});
test('same issued state cannot fork its tick count',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1400);
  const start=f.outgoingOpened.state;
  await outgoingStep(f,start,4);
  await assert.rejects(outgoingStep(f,start,5),
    err('C15_DUNGEON_V2C5_REUSED_STATE'));
});
test('concurrent retries have one deterministic result',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+1450);
  const start=f.outgoingOpened.state;
  const all=await Promise.all(Array.from({length:5},()=>outgoingStep(f,start,4)));
  assert.equal(all[0].duplicate,false);
  assert.ok(all.slice(1).every(x=>x.duplicate===true));
  assert.ok(all.every(x=>x.state===all[0].state));
  assert.equal(f.writes,0);
});
test('step split across 1 / 10 / 23 tick batches preserves digest',async()=>{
  const f=await fixture();
  f.setTime(ISSUE+2200);
  const a=await outgoingStep(f,f.outgoingOpened.state,34);
  const f2=await fixture();
  f2.setTime(ISSUE+2200);
  const b=await outgoingStep(f2,f2.outgoingOpened.state,1);
  const c=await outgoingStep(f2,b.state,10);
  const d=await outgoingStep(f2,c.state,23);
  assert.equal(a.report.outgoingDigest,d.report.outgoingDigest);
  assert.equal(a.report.upstreamDamageDigest,d.report.upstreamDamageDigest);
});
test('multiple ticks never trust client projectile or artificial kills',async()=>{
  const f=await fixture();
  const r=await outgoingAdvance(f,f.outgoingOpened.state,120);
  assert.equal(r.simulatedTicks,120);
  assert.ok(r.candidateShotsCreated>=0);
  assert.equal(r.qaWeaponPreset,QA_WEAPON.id);
  assert.equal(r.actualAccountLoadoutVerified,false);
  assert.equal(r.fullEnemyAiDeathFeedbackVerified,false);
  assert.equal(r.battleVictoryVerified,false);
  assert.equal(r.safeForSettlement,false);
  assert.equal(f.writes,0);
});
test('six seconds creates bounded outgoing projectiles and catalog HP events',async()=>{
  const f=await fixture();
  const r=await outgoingAdvance(f,f.outgoingOpened.state,360);
  assert.equal(r.simulatedTicks,360);
  assert.equal(r.candidateOutgoingHits,5);
  assert.equal(r.candidateEnemyDeaths,5);
  assert.equal(r.candidateShotsCreated,8);
  assert.equal(r.candidateHpDamage,413);
  assert.ok(r.candidateShotsCreated>0);
  assert.ok(r.candidateShotsCreated<=20);
  assert.ok(r.candidateShotsActive<=96);
  assert.ok(r.candidateEnemyHp.every(e=>e.hp>=0&&e.hp<=e.maxHp));
  assert.equal(r.candidateEnemyDeaths,r.candidateEnemyHp.filter(e=>e.dead).length);
  assert.equal(r.cloudRewards,false);
  assert.equal(f.writes,0);
});
test('six-second cap rejects tick 361',async()=>{
  const f=await fixture();
  const r=await outgoingAdvance(f,f.outgoingOpened.state,360);
  // Build states remain in instance, but 360-tick outcome state from QA has to
  // be reconstructed by a second clean service request for this boundary.
  const f2=await fixture();
  let s=f2.outgoingOpened.state;
  for(let i=0;i<6;i++){
    f2.setTime(ISSUE+1100+Math.ceil((s.tick+60)*1000/TICK_HZ));
    s=(await outgoingStep(f2,s,60)).state;
  }
  await assert.rejects(outgoingStep(f2,s,1),
    err('C15_DUNGEON_V2C5_TICK_CAP'));
  assert.equal(r.simulatedTicks,360);
});
test('no battle claim or reward path exists even after candidate death',async()=>{
  const f=await fixture();
  await outgoingAdvance(f,f.outgoingOpened.state,360);
  assert.throws(()=>f.outgoing.claim({coins:999,diamonds:999}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.outgoing.finalize({victory:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});
test('negative compatibility: source gameplay and Economy are not modified',async()=>{
  const fs=require('node:fs');
  const p=path.resolve(__dirname,'../../client/src/components/Dungeon/DungeonScene.js');
  assert.match(fs.readFileSync(p,'utf8'),/applyPlayerDamageToEnemy/);
  const server=path.resolve(__dirname,'../server.js');
  assert.doesNotMatch(fs.readFileSync(server,'utf8'),/c15DungeonOutgoingStateV2C5/);
  const service=await createC15DungeonOutgoingStateV2C5();
  assert.equal(service.productionEnabled,false);
});
