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
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  const ticket=await ticketService.issueTicket(actor);
  const movementState=await movementService.open({ticket,...actor});
  const upstreamOpened=await service.open({ticket,movementState,...actor});
  const opened=await timeline.open({ticket,movementState,...actor});
  return {timeline,service,ticketService,movementService,actor,ticket,movementState,upstreamOpened,
    opened,docs,profile,active,admission,setTime:t=>{at=t;},
    get reads(){return reads;},get writes(){return writes;}};
}
const step=(f,state,ticks,extra={})=>f.timeline.step({state,ticket:f.ticket,
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
  return f.timeline.inspect(state);
}


test('V2C.2 is OFF by default and has no reward/settlement capability',async()=>{
  assert.equal(parseC15DungeonEnemyTimelineV2C2Config({}),null);
  const off=await createC15DungeonEnemyTimelineV2C2();
  assert.equal(off.enabled,false);
  assert.throws(()=>off.open({}),err('C15_DUNGEON_V2C2_DISABLED'));
  assert.throws(()=>off.finalize({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.claim({coins:999999}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.2 needs explicit demo approval and all predecessor gates',()=>{
  assert.equal(parseC15DungeonEnemyTimelineV2C2Config(env).emulatorOnly,true);
  for(const extra of [{GAME_C15_DUNGEON_V2C2_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C1_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B2_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {GCLOUD_PROJECT:'not-demo'},
    {FIRESTORE_EMULATOR_HOST:'192.168.1.2:8080'}])
    assert.throws(()=>parseC15DungeonEnemyTimelineV2C2Config({...env,...extra}),TypeError);
  assert.equal(parseC15DungeonEnemyTimelineV2C2Config({...env,
    GAME_C15_DUNGEON_V2C2_ENABLED:'false'}),null);
});
test('V2C.2 rejects missing or economic upstream services',async()=>{
  await assert.rejects(createC15DungeonEnemyTimelineV2C2({env}),TypeError);
  await assert.rejects(createC15DungeonEnemyTimelineV2C2({env,
    combatProofService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      safeForSettlement:false,rewardSettlementEnabled:true,
      open:async()=>{},step:async()=>{},inspect:()=>{}},
    movementService:{enabled:true,emulatorOnly:true,productionEnabled:false,
      rewardSettlementEnabled:false,inspect:()=>({})}}),TypeError);
});
test('open proves actual V2C.1 admission, Taurus seed and V2B.3 movement state',async()=>{
  const f=await fixture();const r=f.opened.report;
  assert.equal(r.battleId,BID);
  assert.equal(r.roomId,'taurus_entry');
  assert.equal(r.sceneSeed,f.ticket.sceneSeed);
  assert.equal(r.simulatedTicks,0);
  assert.equal(r.candidateEnemyCount,0);
  assert.equal(r.actualEnemyAIReplayVerified,false);
  assert.equal(r.playerMovementSnapshotFrozenAtOpen,true);
  assert.equal(r.liveMuzzleTransformVerified,false);
  assert.equal(r.safeForSettlement,false);
  assert.equal(f.writes,0);
  assert.ok(f.reads>0);
});
test('open refuses client claims about enemy, projectiles and wallet',async()=>{
  const f=await fixture();
  for(const extra of [{victory:true},{enemyX:5},{muzzle:{x:0,z:0}},
    {reward:{coins:9999}},{health:0},{projectiles:[{}]}])
    await assert.rejects(f.timeline.open({ticket:f.ticket,movementState:f.movementState,
      ...f.actor,...extra}),err('C15_DUNGEON_V2C2_INPUT_INVALID'));
});
test('no alternate account, session or fabricated ticket',async()=>{
  const f=await fixture();
  await assert.rejects(f.timeline.open({ticket:f.ticket,movementState:f.movementState,
    ...f.actor,uid:'another-user'}));
  await assert.rejects(f.timeline.open({ticket:f.ticket,movementState:f.movementState,
    ...f.actor,sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}));
  await assert.rejects(f.timeline.open({ticket:{...f.ticket,mac:'0'.repeat(64)},
    movementState:f.movementState,...f.actor}));
});
test('open rejects copied V2B.3 movement state',async()=>{
  const f=await fixture();
  await assert.rejects(f.timeline.open({ticket:f.ticket,
    movementState:{...f.movementState},...f.actor}));
});
test('only original instance-issued state can be inspected or stepped',async()=>{
  const f=await fixture();
  assert.throws(()=>f.timeline.inspect({...f.opened.state}),
    err('C15_DUNGEON_V2C2_STATE_UNTRUSTED'));
  await assert.rejects(step(f,{...f.opened.state},1),
    err('C15_DUNGEON_V2C2_STATE_UNTRUSTED'));
});
test('reject zero, noninteger and oversized step counts',async()=>{
  const f=await fixture();
  for(const ticks of [0,-1,1.5,61,999,NaN,Infinity,'5'])
    await assert.rejects(step(f,f.opened.state,ticks),
      err('C15_DUNGEON_V2C2_INPUT_INVALID'));
});
test('reject fabricated shots, kills, coins, muzzle and victory in step body',async()=>{
  const f=await fixture();
  for(const extra of [{enemy:{x:5}},{damage:999},{victory:true},
    {loot:{diamonds:999}},{shotTime:0},{projectileSpeed:999}])
    await assert.rejects(step(f,f.opened.state,1,extra),
      err('C15_DUNGEON_V2C2_INPUT_INVALID'));
});
test('cannot fast-forward beyond V2C.1 server clock',async()=>{
  const f=await fixture();
  await assert.rejects(step(f,f.opened.state,13),
    err('C15_DUNGEON_V2C1_FAST_FORWARD'));
  assert.equal(f.timeline.inspect(f.opened.state).simulatedTicks,0);
});
test('candidate does not spawn before catalog schedule',async()=>{
  const f=await fixture();
  const r=await advance(f,f.opened.state,10,10);
  assert.equal(r.candidateEnemyCount,0);
  assert.equal(r.candidateProjectileCreated,0);
});
test('one authored ranged Taurus candidate spawns with stable identity and bounded motion',async()=>{
  const f=await fixture();
  const r=await advance(f,f.opened.state,120,20);
  assert.equal(r.candidateEnemyCount,1);
  assert.ok(['raider','gunner','shieldbearer','support','artillery'].includes(r.candidateEnemyRole));
  assert.match(r.candidateEnemyId,/^dung_taurus:taurus_entry:enemy:\d+$/);
  assert.ok(Number.isFinite(r.candidateEnemyPosition.x));
  assert.ok(Number.isFinite(r.candidateEnemyPosition.z));
  assert.ok(Math.abs(r.candidateEnemyPosition.x)<=6.65);
  assert.equal(r.liveMuzzleTransformVerified,false);
});
test('enemy candidate uses actual authored spawn and shared choreography functions',async()=>{
  const f=await fixture();
  const [encounter,combat,seedMath]=await Promise.all([
    client('game/dungeon/DungeonEncounterDirectorV38.js'),
    client('game/dungeon/DungeonCombatAdapterV38.js'),
    client('game/dungeon/DungeonSeedTouchContractV2B1.js'),
  ]);
  const plan=encounter.buildDungeonRoomSpawnPlanV38({dungeonId:'dung_taurus',roomIndex:0,
    seed:f.ticket.sceneSeed});
  const entry=plan.entries.find(e=>{
    const spec=combat.resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',room:plan.room,entry:e});
    return spec.canShoot&&!!spec.weapon.projectile&&spec.roleId!=='charger';
  });
  const spec=combat.resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',room:plan.room,entry});
  const due=Math.max(1,Math.ceil(entry.spawnAtMs*TIMELINE_HZ/1000));
  assert.ok(due<=120);
  const f1=await fixture();
  let s=f1.opened.state;
  for(let i=0;i<due;i++){
    f1.setTime(ISSUE+100+20000);
    s=(await step(f1,s,1)).state;
  }
  assert.equal(f1.timeline.inspect(s).candidateEnemyId,entry.id);
  const expected=combat.resolveDungeonEnemySpawnPointV38({laneNorm:spec.laneNorm,
    index:entry.index,arenaHalfWidth:7,worldHalfHeight:15});
  assert.ok(Math.abs(s.enemy.position.x-expected.x)<.1);
  assert.equal(s.enemy.seed,seedMath.dungeonSceneStableSeedV2B1(f1.ticket.sceneSeed,entry.id));
});
test('trace digest is identical across 1/20/60 step batching with one frozen input',async()=>{
  const a=await fixture(),b=await fixture(),c=await fixture();
  const [x,y,z]=await Promise.all([
    advance(a,a.opened.state,180,1),
    advance(b,b.opened.state,180,20),
    advance(c,c.opened.state,180,60),
  ]);
  assert.deepEqual(x,y);assert.deepEqual(y,z);
  assert.match(x.timelineDigest,/^[a-f0-9]{64}$/);
});
test('replayed candidate at 360 ticks cannot update real Firestore profile',async()=>{
  const f=await fixture();const before=structuredClone(f.profile);
  const r=await advance(f,f.opened.state,TIMELINE_MAX,60);
  assert.equal(r.simulatedTicks,TIMELINE_MAX);
  assert.equal(r.candidateEnemyCount,1);
  assert.ok(r.candidateVolleys>0, 'Taurus fixture must exercise shared fire gate');
  assert.equal(f.writes,0);
  assert.deepEqual(f.profile,before);
  assert.equal(r.safeForSettlement,false);
  assert.equal(r.independentReplayVerified,false);
});
test('candidate projectile counts are internally conserved',async()=>{
  const f=await fixture();
  const r=await advance(f,f.opened.state,360,30);
  assert.equal(r.candidateProjectileCreated,
    r.candidateProjectileActive+r.candidateProjectileExpired+r.candidateProjectileHit);
  assert.equal(r.candidateProjectileHit,0); // collision and damage deliberately excluded
  assert.equal(r.damagePipelineVerified,false);
});
test('exact retry is idempotent, not a second volley',async()=>{
  const f=await fixture();f.setTime(ISSUE+2000);
  const first=await step(f,f.opened.state,60);
  const repeated=await step(f,f.opened.state,60);
  assert.equal(first.duplicate,false);
  assert.equal(repeated.duplicate,true);
  assert.equal(first.state,repeated.state);
  assert.equal(first.report.timelineDigest,repeated.report.timelineDigest);
});
test('cannot fork an already consumed state or replay with another tick batch',async()=>{
  const f=await fixture();f.setTime(ISSUE+2000);
  await step(f,f.opened.state,60);
  await assert.rejects(step(f,f.opened.state,59),
    err('C15_DUNGEON_V2C2_REUSED_STATE'));
});
test('runtime refuses movement snapshot replacement after preview starts',async()=>{
  const f=await fixture();
  await oneGesture(f);
  await assert.rejects(step(f,f.opened.state,1),
    err('C15_DUNGEON_V2C2_TOUCH_TIMELINE_UNALIGNED'));
});
test('touch snapshot can be accepted before opening, but not stamped to ticks',async()=>{
  const f=await fixture();
  await oneGesture(f);
  const reopened=await f.timeline.open({ticket:f.ticket,movementState:f.movementState,
    ...f.actor});
  const r=await advance(f,reopened.state,160,20);
  assert.equal(r.playerMovementSnapshotFrozenAtOpen,true);
  assert.equal(r.playerMovementTickTimelineVerified,false);
  assert.equal(r.actualDeviceProvenanceVerified,false);
  assert.equal(r.safeForSettlement,false);
});
test('tampered ticket MAC is rejected at every step',async()=>{
  const f=await fixture();
  await assert.rejects(step(f,f.opened.state,1,{
    ticket:{...f.ticket,mac:'e'.repeat(64)}}),
  err('C15_DUNGEON_V2C2_TICKET_MISMATCH'));
});
test('V2C.2 refuses to step after signed ticket expires',async()=>{
  const f=await fixture();f.setTime(ISSUE+20*60*1000);
  await assert.rejects(step(f,f.opened.state,1));
});
test('six-second tick ceiling cannot be exceeded',async()=>{
  const f=await fixture();let s=f.opened.state;
  for(let i=0;i<6;i++){
    f.setTime(ISSUE+20000);
    s=(await step(f,s,60)).state;
  }
  await assert.rejects(step(f,s,1),err('C15_DUNGEON_V2C2_TICK_CAP'));
});
test('all reports stay frozen and permanently deny settlement',async()=>{
  const f=await fixture();const r=f.timeline.inspect(f.opened.state);
  assert.equal(Object.isFrozen(r),true);
  for(const k of ['independentReplayVerified','safeForSettlement',
    'rewardSettlementEnabled','cloudRewards','battleVictoryVerified',
    'realFiringAndCooldownParityVerified','actualEnemyAIReplayVerified'])
    assert.equal(r[k],false);
  assert.throws(()=>f.timeline.claim({reward:{coins:20000}}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.timeline.finalize({victory:true}),
    err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});

test('retry cannot disclose previous output to a different actor or request',async()=>{
  const f=await fixture();f.setTime(ISSUE+2000);
  await step(f,f.opened.state,60);
  for(const change of [{uid:'other'},{sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},
    {requestId:'different_request_001'}])
    await assert.rejects(step(f,f.opened.state,60,change),
      err('C15_DUNGEON_V2C2_ACTOR_MISMATCH'));
});
test('V2C.2 never registers production HTTP reward or timeline endpoints',async()=>{
  const fs=require('node:fs');
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.ok(!server.includes('c15DungeonEnemyTimelineV2C2'));
  assert.ok(!server.includes('/api/v1/c15/dungeon/v2c2'));
});
