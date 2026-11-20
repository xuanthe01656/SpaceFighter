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
  return {multi,timeline,service,ticketService,movementService,actor,ticket,movementState,upstreamOpened,
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



test('V2C.3 defaults OFF, no reward or victory API',async()=>{
  assert.equal(parseC15DungeonMultiEnemyTimelineV2C3Config({}),null);
  const off=await createC15DungeonMultiEnemyTimelineV2C3();
  assert.equal(off.enabled,false);
  assert.throws(()=>off.open({}),err('C15_DUNGEON_V2C3_DISABLED'));
  assert.throws(()=>off.claim({coins:10000}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('all prior emulator-only gates and explicit approval are required',()=>{
  assert.equal(parseC15DungeonMultiEnemyTimelineV2C3Config(env).emulatorOnly,true);
  for(const extra of [{GAME_C15_DUNGEON_V2C3_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C2_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2C1_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {GCLOUD_PROJECT:'distributed-inn-482605-c6'},
    {FIRESTORE_EMULATOR_HOST:'192.168.1.2:8080'}])
    assert.throws(()=>parseC15DungeonMultiEnemyTimelineV2C3Config({...env,...extra}),TypeError);
  assert.equal(parseC15DungeonMultiEnemyTimelineV2C3Config({...env,
    GAME_C15_DUNGEON_V2C3_ENABLED:'false'}),null);
});
test('requires actual non-economic V2C.2 and V2B.3 injected QA services',async()=>{
  await assert.rejects(createC15DungeonMultiEnemyTimelineV2C3({env}),TypeError);
  await assert.rejects(createC15DungeonMultiEnemyTimelineV2C3({env,
    enemyTimelineService:{enabled:true,emulatorOnly:true,
      productionEnabled:false,safeForSettlement:false,rewardSettlementEnabled:true,
      cloudRewards:false,open:()=>{},step:()=>{},inspect:()=>{}},
    movementService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      rewardSettlementEnabled:false,inspect:()=>({})}}),TypeError);
});
test('open binds real signed admission ticket, scene seed, movement and Taurus catalog',async()=>{
  const f=await fixture(),r=f.opened.report;
  assert.equal(r.version,V2C3_VERSION);
  assert.equal(r.sceneSeed,f.ticket.sceneSeed);
  assert.equal(r.battleId,f.ticket.battleId);
  assert.equal(r.simulatedTicks,0);
  assert.ok(r.rangedCatalogCandidates>=3);
  assert.equal(r.candidateEnemySpawned,0);
  assert.equal(r.candidateMuzzleYawProjectionOnly,true);
  assert.equal(r.safeForSettlement,false);
  assert.equal(f.writes,0);
  assert.ok(f.reads>0);
});
test('input is exact: denies client enemy position, muzzle or reward claims',async()=>{
  const f=await fixture();
  for(const extra of [{enemyState:[]},{muzzle:{x:1,z:2}},{victory:true},
    {damage:99999},{reward:{coins:1e9}},{shots:[{}]}])
    await assert.rejects(f.multi.open({ticket:f.ticket,movementState:f.movementState,
      ...f.actor,...extra}),err('C15_DUNGEON_V2C3_INPUT_INVALID'));
});
test('cannot open for different account, different session or modified signed ticket',async()=>{
  const f=await fixture();
  for(const extra of [{uid:'other'},{sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}])
    await assert.rejects(f.multi.open({ticket:f.ticket,movementState:f.movementState,
      ...f.actor,...extra}));
  await assert.rejects(f.multi.open({ticket:{...f.ticket,mac:'f'.repeat(64)},
    movementState:f.movementState,...f.actor}));
});
test('zero spawned candidates before the first Taurus schedule tick',async()=>{
  const f=await fixture();f.setTime(ISSUE+20000);
  const r=await advance(f,f.opened.state,10,10);
  assert.equal(r.candidateEnemySpawned,0);
  assert.equal(r.candidateProjectileCreated,0);
});
test('multiple ranged enemies are spawned and lease distinct slots',async()=>{
  const f=await fixture(),r=await advance(f,f.opened.state,360,60);
  assert.ok(r.candidateEnemySpawned>=3);
  assert.equal(r.candidateEnemySpawned,r.rangedCatalogCandidates);
  assert.equal(new Set(r.candidateEnemies.map(e=>e.id)).size,r.candidateEnemySpawned);
  assert.equal(new Set(r.candidateEnemies.map(e=>e.combatSlotId)).size,r.candidateEnemySpawned);
  assert.ok(r.candidateEnemies.every(e=>e.entryShieldPhase && e.combatSlotId));
  assert.equal(f.writes,0);
});
test('multi-enemy candidate invokes real slot and separation helpers',async()=>{
  const f=await fixture(),r=await advance(f,f.opened.state,360,30);
  assert.ok(r.projectedSeparationContributors>=0);
  assert.ok(r.candidateEnemies.every(e=>Number.isFinite(e.position.x)
    &&Number.isFinite(e.position.z)));
  assert.ok(r.candidateEnemies.some(e=>e.position.x!==0));
  assert.ok(r.candidateEnemies.some(e=>e.phaseId!==null));
});
test('entries remain gated and can become active only through shared shield helper',async()=>{
  const f=await fixture();
  const early=await advance(f,f.opened.state,70,10);
  assert.ok(early.candidateEnemies.length>=1);
  assert.ok(early.candidateEnemies.every(e=>['approach','reveal','active'].includes(e.entryShieldPhase)));
  assert.ok(early.candidateEnemies.some(e=>e.entryShieldPhase!=='active'));
  const later=await fixture();
  const late=await advance(later,later.opened.state,360,60);
  assert.ok(late.candidateEnemies.some(e=>e.entryShieldPhase==='active'));
});
test('yaw uses exact shared +Z-forward turn helper',async()=>{
  const yaw=await client('game/assets/EnemyVisualHeadingV26A4.js');
  assert.equal(yaw.resolveEnemyGameplayYawV26A4({currentYaw:0,velocityX:0,velocityZ:1,maxTurnRadians:7/60}),0);
  assert.equal(projectDungeonCandidateMuzzleV2C3({position:{x:2,z:3},yawRadians:0,roleId:'gunner'}).z,3.76);
});
test('yaw-only muzzle projection matches 2D rotation math but never asserts Babylon matrix',()=>{
  const cases=[{theta:0,dx:0,dz:.76},{theta:Math.PI/2,dx:.76,dz:0},
    {theta:-Math.PI/2,dx:-.76,dz:0},{theta:Math.PI,dx:0,dz:-.76}];
  for(const {theta,dx,dz} of cases){
    const o=projectDungeonCandidateMuzzleV2C3({position:{x:1,z:5},yawRadians:theta,roleId:'gunner'});
    assert.ok(Math.abs(o.x-(1+dx))<1e-12);
    assert.ok(Math.abs(o.z-(5+dz))<1e-12);
    assert.match(o.source,/not-babylon-world-matrix/);
  }
  assert.equal(projectDungeonCandidateMuzzleV2C3({position:{x:0,z:1},
    yawRadians:0,roleId:'artillery'}).z,2.02);
  for(const p of [{position:{x:NaN,z:0},yawRadians:0},
    {position:{x:0,z:0},yawRadians:Infinity},
    {position:{x:0,z:0},yawRadians:4}])
    assert.throws(()=>projectDungeonCandidateMuzzleV2C3(p),TypeError);
});
test('candidate multi-enemy volley and projectile counts remain conserved',async()=>{
  const f=await fixture(),r=await advance(f,f.opened.state,360,60);
  assert.ok(r.candidateVolleys>0,'At least one ranged candidate should fire');
  assert.ok(r.candidateProjectileCreated>r.candidateVolleys, "Burst scheduling should emit more than first shot");
  assert.equal(r.candidateProjectileCreated,
    r.candidateProjectileExpired+r.candidateProjectileActive);
  assert.ok(r.candidateBurstShotsPending>=0);
  assert.equal(r.damagePipelineVerified,false);
});
test('inspect freezes all report details and no live matrix parity is claimed',async()=>{
  const f=await fixture(),r=await advance(f,f.opened.state,300,60);
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.candidateEnemies));
  assert.ok(r.candidateEnemies.every(e=>Object.isFrozen(e.candidateMuzzle)));
  for(const field of ['liveMuzzleTransformVerified','liveEnemyAISchedulerParityVerified',
    'liveFrameTimeAndTimerParityVerified','contactChargerAndEnemyDeathVerified',
    'playerMovementTickTimelineVerified','actualDeviceProvenanceVerified',
    'damagePipelineVerified','battleVictoryVerified','independentReplayVerified',
    'safeForSettlement','rewardSettlementEnabled','cloudRewards'])
    assert.equal(r[field],false,field);
});
test('same ticket/seed/input produces identical timeline across batches 1,20,60',async()=>{
  const [a,b,c]=await Promise.all([fixture(),fixture(),fixture()]);
  const [x,y,z]=await Promise.all([
    advance(a,a.opened.state,180,1),
    advance(b,b.opened.state,180,20),
    advance(c,c.opened.state,180,60),
  ]);
  assert.deepEqual(x,y);assert.deepEqual(y,z);
  assert.match(x.timelineDigest,/^[a-f0-9]{64}$/);
});
test('final digest identical at 360 ticks across different batching',async()=>{
  const [a,b]=await Promise.all([fixture(),fixture()]);
  const [x,y]=await Promise.all([
    advance(a,a.opened.state,360,20),
    advance(b,b.opened.state,360,60),
  ]);
  assert.deepEqual(x,y);
});
test('state must be issued by the exact instance, not shallow or deep copy',async()=>{
  const a=await fixture(),b=await fixture();
  for(const state of [{...a.opened.state},structuredClone(a.opened.state),b.opened.state])
    await assert.rejects(step(a,state,1),err('C15_DUNGEON_V2C3_STATE_UNTRUSTED'));
});
test('cannot replay step for any other user/session/request',async()=>{
  const f=await fixture();
  for(const change of [{uid:'other'},{sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},
    {requestId:'another_request_001'}])
    await assert.rejects(step(f,f.opened.state,1,change),
      err('C15_DUNGEON_V2C3_ACTOR_MISMATCH'));
});
test('tampered HMAC or client-provided battle state rejected before stepping',async()=>{
  const f=await fixture();
  await assert.rejects(step(f,f.opened.state,1,{ticket:{...f.ticket,mac:'a'.repeat(64)}}),
    err('C15_DUNGEON_V2C3_TICKET_MISMATCH'));
  for(const extra of [{victory:true},{playerHp:0},{projectiles:[{}]},{coins:10}])
    await assert.rejects(step(f,f.opened.state,1,extra),
      err('C15_DUNGEON_V2C3_INPUT_INVALID'));
});
test('frozen-at-open touch cannot be replaced by a new movement snapshot',async()=>{
  const f=await fixture();await oneGesture(f);
  await assert.rejects(step(f,f.opened.state,1),
    err('C15_DUNGEON_V2C3_TOUCH_TIMELINE_UNALIGNED'));
});
test('a new touch trace BEFORE open is allowed but never stamped onto ticks',async()=>{
  const f=await fixture();await oneGesture(f);
  const open=await f.multi.open({ticket:f.ticket,movementState:f.movementState,...f.actor});
  const r=await advance(f,open.state,120,20);
  assert.equal(r.playerMovementTickTimelineVerified,false);
  assert.equal(r.candidateEnemySpawned>=1,true);
});
test('identical retries reuse the same issued state without extra bullets',async()=>{
  const f=await fixture();f.setTime(ISSUE+20000);
  const a=await step(f,f.opened.state,60);
  const b=await step(f,f.opened.state,60);
  assert.equal(a.duplicate,false);
  assert.equal(b.duplicate,true);
  assert.equal(a.state,b.state);
  assert.equal(a.report.timelineDigest,b.report.timelineDigest);
});
test('concurrent identical retries coalesce, no duplicate state or volleys',async()=>{
  const f=await fixture();f.setTime(ISSUE+20000);
  const [a,b]=await Promise.all([step(f,f.opened.state,60),
    step(f,f.opened.state,60)]);
  assert.equal(a.state,b.state);
  assert.deepEqual([a.duplicate,b.duplicate].sort(),[false,true]);
});
test('concurrent or sequential attempt to fork state with other tick count is rejected',async()=>{
  const f=await fixture();f.setTime(ISSUE+20000);
  const first=step(f,f.opened.state,60);
  await assert.rejects(step(f,f.opened.state,59),
    err('C15_DUNGEON_V2C3_REUSED_STATE'));
  await first;
  await assert.rejects(step(f,f.opened.state,1),
    err('C15_DUNGEON_V2C3_REUSED_STATE'));
});
test('enforces 1..60 request and six-second 360 tick cap',async()=>{
  const f=await fixture();
  for(const n of [0,-1,61,1.5,Infinity,'60',null])
    await assert.rejects(step(f,f.opened.state,n),
      err('C15_DUNGEON_V2C3_INPUT_INVALID'));
  let s=f.opened.state;
  f.setTime(ISSUE+20000);
  for(let i=0;i<6;i++)s=(await step(f,s,60)).state;
  await assert.rejects(step(f,s,1),err('C15_DUNGEON_V2C3_TICK_CAP'));
});
test('server clock and expiry of signed ticket are enforced by V2C.2 at every step',async()=>{
  const f=await fixture();f.setTime(ISSUE+20*60*1000);
  await assert.rejects(step(f,f.opened.state,1));
});
test('cannot ask multi-enemy replay to settle, finalize or grant loot',async()=>{
  const f=await fixture();
  assert.throws(()=>f.multi.claim({coins:999999}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.multi.finalize({victory:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
  assert.equal(f.docs.get(`users/${UID}`)?.wallet.energy,30);
});
test('no production HTTP integration or Economy changes were made',()=>{
  const fs=require('node:fs');
  const root=path.resolve(__dirname,'..');
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.ok(!server.includes('c15DungeonMultiEnemyTimelineV2C3'));
  assert.ok(!server.includes('/api/v1/c15/dungeon/v2c3'));
  assert.ok(!fs.readFileSync(path.join(root,'lib','economy.cjs'),'utf8')
    .includes('c15DungeonMultiEnemyTimelineV2C3'));
});
