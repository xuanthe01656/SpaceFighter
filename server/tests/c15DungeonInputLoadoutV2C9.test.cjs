'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {VERSION:ADMISSION_VERSION,createDungeonContractV1}=
  require('../lib/c15DungeonFoundationV1.cjs');
const {createC15DungeonSeedTouchTicketV2B2}=
  require('../lib/c15DungeonSeedTouchTicketV2B2.cjs');
const {createC15DungeonMovementParityV2B3}=
  require('../lib/c15DungeonMovementParityV2B3.cjs');
const {VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  parseC15DungeonInputLoadoutV2C9Config,
  projectRelativeTouchTicksV2C9,
  createC15DungeonInputLoadoutV2C9}=
  require('../lib/c15DungeonInputLoadoutV2C9.cjs');

const UID='dungeon-v2c9-emulator-qa-user';
const SID='b2c90000-a004-4af1-8a20-127d021b3ac0';
const BID='b2c90000-a005-4af1-8a20-127d021b3ac0';
const REQ='dungeon_v2c9_entry_request_001';
const ISSUE=Date.UTC(2026,10,20,10,0,0);
const PROJECT='demo-spacefighter-dungeon-v2c9';
const env=Object.freeze({
  GAME_C15_DUNGEON_V1_ENABLED:'true',
  GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V1_ALLOW_UIDS:UID,
  GAME_C15_DUNGEON_V2A_ENABLED:'true',GAME_C15_DUNGEON_V2A_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B1_ENABLED:'true',GAME_C15_DUNGEON_V2B1_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B2_ENABLED:'true',GAME_C15_DUNGEON_V2B2_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B3_ENABLED:'true',GAME_C15_DUNGEON_V2B3_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C1_ENABLED:'true',GAME_C15_DUNGEON_V2C1_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C2_ENABLED:'true',GAME_C15_DUNGEON_V2C2_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C3_ENABLED:'true',GAME_C15_DUNGEON_V2C3_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C4_ENABLED:'true',GAME_C15_DUNGEON_V2C4_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C5_ENABLED:'true',GAME_C15_DUNGEON_V2C5_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C6_ENABLED:'true',GAME_C15_DUNGEON_V2C6_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C7_ENABLED:'true',GAME_C15_DUNGEON_V2C7_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C8_ENABLED:'true',GAME_C15_DUNGEON_V2C8_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C9_ENABLED:'true',GAME_C15_DUNGEON_V2C9_QA_APPROVED:'true',
  GOOGLE_CLOUD_PROJECT:PROJECT,GCLOUD_PROJECT:PROJECT,
  FIREBASE_PROJECT_ID:PROJECT,FIRESTORE_EMULATOR_HOST:'127.0.0.1:38081',
});
const err=code=>e=>e?.code===code;
const client=rel=>import(pathToFileURL(path.resolve(__dirname,'../../client/src',rel)).href);
const viewport=Object.freeze({canvasWidth:400,canvasHeight:800,aspect:.5,
  halfHeight:15,inset:1.8,pointerSpeedMultiplier:1});
let loaded;
async function modules(){
  return loaded||(loaded=Promise.all([
    client('constants.js'),
    client('game/dungeon/DungeonContentCatalogV393.js'),
    client('game/dungeon/DungeonSeedTouchContractV2B1.js'),
    client('game/dungeon/DungeonDeviceTouchTraceV2B2.js'),
    client('utils/combatStats.js')
  ]));
}
async function makeTrace(ticket,{start=20,moves=[{dx:40,dy:25,dt:20},
  {dx:-20,dy:30,dt:25}],extra=[]}={}){
  const [,,,traceModule,]=await modules();
  const shared=(await modules())[2];
  const recorder=traceModule.createDungeonDeviceTouchTraceV2B2({ticket});
  let position={x:0,z:12.5};
  const gestures=[{start,moves},...extra];
  let pointerId=7;
  for(const g of gestures){
    let x=100,y=400,at=g.start;
    recorder.capture({kind:'down',pointerId,atMs:at,
      clientX:x,clientY:y,position:{...position}});
    for(const m of g.moves){
      at+=m.dt;x+=m.dx;y+=m.dy;
      position=shared.projectDungeonDirectTouchV2B1({position,viewport,
        delta:{deltaX:m.dx,deltaY:m.dy}});
      recorder.capture({kind:'move',pointerId,atMs:at,clientX:x,clientY:y,
        position:{...position},viewport:{...viewport},
        delta:{deltaX:m.dx,deltaY:m.dy}});
    }
    recorder.capture({kind:'up',pointerId,atMs:at+7,position:{...position}});
    pointerId++;
  }
  return {trace:recorder.snapshot(),position};
}
async function fixture({profileMutate}={}){
  let now=ISSUE+100;
  const [constants,content]=await modules();
  const contract=createDungeonContractV1('dung_taurus',{
    listings:constants.DUNGEON_CONFIG,content:content.DUNGEON_CONTENT_CATALOG_V393,
    hazards:content.DUNGEON_HAZARD_PROFILES_V393,
    objectives:content.DUNGEON_OBJECTIVE_PROFILES_V393});
  const admission={version:ADMISSION_VERSION,uid:UID,sessionId:SID,battleId:BID,
    dungeonId:'dung_taurus',requestId:REQ,requestDigest:'a'.repeat(64),
    contractDigest:contract.contractDigest,energyCharged:contract.energyCost,
    admittedAtMs:ISSUE,expiresAtMs:ISSUE+20*60*1000,
    status:'admitted-emulator',qaOnly:true,source:'firestore-emulator',
    independentReplayVerified:false,rewardSettlementEnabled:false,cloudRewards:false};
  const profile={sessionId:SID,campaignData:{...structuredClone(constants.DEFAULT_CAMPAIGN_DATA),
    profileId:'qa_v2c9_profile_1'},wallet:{energy:30}};
  if(profileMutate)profileMutate(profile);
  const active={version:ADMISSION_VERSION,uid:UID,sessionId:SID,battleId:BID,
    requestId:REQ,status:'admitted-emulator',expiresAtMs:admission.expiresAtMs,
    qaOnly:true,rewardSettlementEnabled:false};
  const docs=new Map([
    [`users/${UID}`,profile],
    [`users/${UID}/c15DungeonV1Admissions/${REQ}`,admission],
    [`users/${UID}/c15DungeonV1Sessions/current`,active]]);
  let reads=0,writes=0;
  const db={app:{options:{projectId:PROJECT}},collection:coll=>({doc:id=>{
    function ref(key){return {
      get:async()=>{reads++;const value=docs.get(key);
        return {exists:value!==undefined,data:()=>structuredClone(value)};},
      collection:sub=>({doc:child=>ref(`${key}/${sub}/${child}`)}),
      set:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
      create:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
      update:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
      delete:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
    };}
    return ref(`${coll}/${id}`);
  }})};
  const ticketService=await createC15DungeonSeedTouchTicketV2B2({env,db,
    now:()=>now,signingKey:Buffer.alloc(32,99)});
  const movementService=await createC15DungeonMovementParityV2B3({env,ticketService});
  const svc=await createC15DungeonInputLoadoutV2C9({env,db,ticketService,movementService});
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  const ticket=await ticketService.issueTicket(actor);
  const trace=await makeTrace(ticket);
  const open=()=>svc.open({ticket,trace:trace.trace,...actor});
  return {svc,open,ticket,trace,actor,db,docs,profile,admission,active,
    ticketService,movementService,setTime:t=>{now=t;},
    get writes(){return writes;},get reads(){return reads;}};
}
const step=(f,s,ticks,extra={})=>f.svc.step({state:s,ticket:f.ticket,
  ...f.actor,ticks,...extra});
async function advance(f,s,to,chunk=60){
  let current=s;
  while(current.tick<to)current=(await step(f,current,
    Math.min(chunk,to-current.tick))).state;
  return {state:current,report:f.svc.inspect(current)};
}

// Gate and data trust boundary.
test('V2C.9 off by default, claim/finalize locked',async()=>{
  assert.equal(parseC15DungeonInputLoadoutV2C9Config({}),null);
  const s=await createC15DungeonInputLoadoutV2C9();
  assert.equal(s.enabled,false);assert.equal(s.safeForSettlement,false);
  assert.throws(()=>s.open(),err('C15_DUNGEON_V2C9_DISABLED'));
  assert.throws(()=>s.claim({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>s.finalize({rewards:{gems:999}}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.9 requires every predecessor and explicit QA gate',()=>{
  for(const bad of [
    {GAME_C15_DUNGEON_V2C9_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2C8_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2C7_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2B3_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'production'},
    {FIRESTORE_EMULATOR_HOST:'127.0.0.2:38081'}])
    assert.throws(()=>parseC15DungeonInputLoadoutV2C9Config({...env,...bad}),TypeError);
  assert.equal(parseC15DungeonInputLoadoutV2C9Config(env).emulatorOnly,true);
});
test('V2C.9 rejects prototype inherited and array env',()=>{
  assert.throws(()=>parseC15DungeonInputLoadoutV2C9Config(Object.create(env)),TypeError);
  assert.throws(()=>parseC15DungeonInputLoadoutV2C9Config([]),TypeError);
});
test('cannot create enabled service without exact demo DB / ticket / movement chain',async()=>{
  await assert.rejects(createC15DungeonInputLoadoutV2C9({env}),TypeError);
  const f=await fixture();
  await assert.rejects(createC15DungeonInputLoadoutV2C9({env,
    db:{app:{options:{projectId:'real-project'}},collection:()=>{}},
    ticketService:f.ticketService,movementService:f.movementService}),TypeError);
  await assert.rejects(createC15DungeonInputLoadoutV2C9({env,db:f.db,
    ticketService:{...f.ticketService,rewardSettlementEnabled:true},
    movementService:f.movementService}),TypeError);
  await assert.rejects(createC15DungeonInputLoadoutV2C9({env,db:f.db,
    ticketService:f.ticketService,
    movementService:{...f.movementService,productionEnabled:true}}),TypeError);
});
test('emulator server profile and pure shared stats determine loadout',async()=>{
  const f=await fixture();const s=await f.open();
  const r=s.report;
  assert.equal(r.serverReadDemoProfileLoadout,true);
  assert.equal(r.sharedBattleLoadoutMathUsed,true);
  assert.equal(r.candidateLoadout.pilotId,'pilot_alpha');
  assert.equal(r.candidateLoadout.aircraftId,'ship_xwing');
  assert.equal(r.candidateLoadout.mainGunId,'gun_laser');
  const [constants,,,,stats]=await modules();
  const computed=stats.deriveBattleLoadout(f.profile.campaignData,{
    PILOTS:constants.PILOTS,AIRCRAFTS:constants.AIRCRAFTS,
    GEAR_CATALOG:constants.GEAR_CATALOG},{mode:'dungeon',
    location:constants.DUNGEON_CONFIG.find(d=>d.id==='dung_taurus')});
  assert.equal(r.candidateLoadout.atk,computed.stats.atk);
  assert.equal(r.candidateLoadout.maxHp,computed.stats.maxHp);
  assert.equal(r.candidateLoadout.fireRateMs,computed.stats.fireRate);
  assert.ok(f.reads>0);assert.equal(f.writes,0);
});
test('rejects client-supplied loadout, attack, health and outcome in open',async()=>{
  const f=await fixture();
  for(const bad of [{loadout:{}},{atk:900000},{hp:0},
    {kills:['enemy']},{reward:{gems:900}},{victory:true},
    {clientTick:360},{debugForceHit:true}])
    await assert.rejects(f.svc.open({ticket:f.ticket,
      trace:f.trace.trace,...f.actor,...bad}),err('C15_DUNGEON_V2C9_INPUT_INVALID'));
});
test('rejects forged UID and different session or request at open',async()=>{
  const f=await fixture();
  for(const bad of [{uid:'another-user'},
    {sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},
    {requestId:'other_req_dungeon_v2c9'}])
    await assert.rejects(f.svc.open({ticket:f.ticket,
      trace:f.trace.trace,...f.actor,...bad}));
});
test('ticket modified after issuing is rejected',async()=>{
  const f=await fixture();
  for(const bad of [{mac:'f'.repeat(64)},{sceneSeed:12345},
    {profileId:'impostor'},{roomId:'other'},
    {safeForSettlement:true}])
    await assert.rejects(f.svc.open({ticket:{...f.ticket,...bad},
      trace:f.trace.trace,...f.actor}));
});
test('missing or changed account profile rejects open',async()=>{
  const f=await fixture();
  f.docs.delete(`users/${UID}`);
  await assert.rejects(f.open(),err('C15_DUNGEON_V2B2_NO_ADMISSION'));
});
test('inventory rejects unowned aircraft and pilot, unknown IDs',async()=>{
  for(const mutate of [
    p=>{delete p.campaignData.ownedAircrafts.ship_xwing;},
    p=>{delete p.campaignData.ownedPilots.pilot_alpha;},
    p=>{p.campaignData.loadout.aircraft='ship_fake';},
    p=>{p.campaignData.loadout.pilot='pilot_fake';},
  ]){const f=await fixture();mutate(f.docs.get(`users/${UID}`));
    await assert.rejects(f.open(),err('C15_DUNGEON_V2C9_LOADOUT_INVALID'));
  }
});
test('inventory rejects gear UUID/type/base mismatch',async()=>{
  for(const mutate of [
    p=>{p.campaignData.loadout.mainGun='missing';},
    p=>{p.campaignData.items.item_start_gun.type='armor';},
    p=>{p.campaignData.items.item_start_gun.baseId='unknown';},
    p=>{p.campaignData.items.item_start_gun.level=1001;},
    p=>{p.campaignData.items.item_start_gun.rarity=0;},
  ]){const f=await fixture();mutate(f.docs.get(`users/${UID}`));
    await assert.rejects(f.open(),err('C15_DUNGEON_V2C9_LOADOUT_INVALID'));
  }
});
test('no silent fallback for missing or malformed loadout fields',async()=>{
  const f=await fixture();
  const p=f.docs.get(`users/${UID}`);
  delete p.campaignData.loadout.mainGun;
  await assert.rejects(f.open(),err('C15_DUNGEON_V2C9_LOADOUT_INVALID'));
});
test('input trace is validated through actual V2B2 and V2B3 helpers',async()=>{
  const f=await fixture();const s=await f.open();
  assert.equal(s.report.acceptedPointerEvents,4);
  assert.equal(s.report.acceptedPointerMoves,2);
  assert.equal(s.report.reportedTouchProjectionChecked,true);
  assert.equal(s.report.relativeInputTickMappingChecked,true);
  assert.equal(s.report.absoluteClientServerClockAligned,false);
  assert.equal(s.report.realDeviceInputAuthenticated,false);
});
test('forged touch coordinate or wrong pointer sequence rejected',async()=>{
  const f=await fixture();
  for(const change of [
    t=>{t.events[1].position.x+=1;},
    t=>{t.events[2].pointerId=555;},
    t=>{t.events[2].delta.deltaX+=5;},
    t=>{t.events[3].position.z+=2;},
  ]){
    const trace=structuredClone(f.trace.trace);change(trace);
    await assert.rejects(f.svc.open({ticket:f.ticket,trace,...f.actor}));
  }
});
test('trace longer than six-second QA candidate window rejected',async()=>{
  const f=await fixture();const trace=structuredClone(f.trace.trace);
  trace.events[1].atMs=6100;trace.events[2].atMs=6120;
  trace.events[3].atMs=6127;
  await assert.rejects(f.svc.open({ticket:f.ticket,trace,...f.actor}),
    err('C15_DUNGEON_V2C9_TIME_INVALID'));
});
test('relative event clock, not client-provided absolute tick, selects candidate poses',async()=>{
  const f=await fixture();const opened=await f.open();
  assert.deepEqual(opened.report.candidatePlayerPosition,{x:0,z:12.5});
  const first=await step(f,opened.state,1);
  const second=await step(f,first.state,1);
  const final=await advance(f,second.state,360,60);
  assert.equal(first.report.simulatedInputTicks,1);
  assert.equal(second.report.simulatedInputTicks,2);
  assert.equal(first.report.lastBatch.length,1);
  assert.equal(second.report.lastBatch[0].tick,2);
  assert.ok(final.report.candidatePlayerPosition.x!==0||
    final.report.candidatePlayerPosition.z!==12.5);
  assert.ok(Math.abs(final.report.candidatePlayerPosition.x-f.trace.position.x)<1e-6);
  assert.ok(Math.abs(final.report.candidatePlayerPosition.z-f.trace.position.z)<1e-6);
  assert.equal(final.report.integratedIntoV2C8CombatTick,false);
  assert.equal(final.report.liveAccountLoadoutVerified,false);
  assert.equal(f.writes,0);
});
test('same accepted trace with shifted absolute timestamps maps identically',async()=>{
  const f=await fixture();const input=structuredClone(f.trace.trace);
  const shifted=structuredClone(input);
  shifted.events.forEach(e=>{e.atMs+=500000;});
  const a=projectRelativeTouchTicksV2C9(input,f.trace.position);
  const b=projectRelativeTouchTicksV2C9(shifted,f.trace.position);
  assert.deepEqual(a.poses,b.poses);
  assert.equal(a.moveCount,b.moveCount);
});
test('per-tick projection rejects position jump even with clean event envelope',async()=>{
  const f=await fixture();const input=structuredClone(f.trace.trace);
  input.events[2].position.x+=9;
  assert.throws(()=>projectRelativeTouchTicksV2C9(input,f.trace.position),TypeError);
  await assert.rejects(f.svc.open({ticket:f.ticket,trace:input,...f.actor}));
});
test('input projection is not a gameplay live-timing claim',async()=>{
  const f=await fixture(),opened=await f.open();
  for(const key of ['absoluteClientServerClockAligned','realDeviceInputAuthenticated',
    'liveAccountLoadoutVerified','integratedIntoV2C8CombatTick',
    'independentFullDungeonReplayVerified','safeForSettlement',
    'rewardSettlementEnabled','cloudRewards'])
    assert.equal(opened.report[key],false,key);
});
test('state is frozen and replay rejects cloned or forged states',async()=>{
  const f=await fixture(),o=await f.open();
  assert.equal(Object.isFrozen(o.state),true);
  assert.equal(Object.isFrozen(o.state.loadout),true);
  assert.throws(()=>{o.state.loadout.atk=999999;},TypeError);
  await assert.rejects(step(f,structuredClone(o.state),1),
    err('C15_DUNGEON_V2C9_STATE_UNTRUSTED'));
  await assert.rejects(step(f,{...o.state,loadout:{atk:999}},1),
    err('C15_DUNGEON_V2C9_STATE_UNTRUSTED'));
});
test('step rejects client-controlled player pose, equipment and damage',async()=>{
  const f=await fixture(),o=await f.open();
  for(const bad of [{position:{x:5,z:5}},{player:{x:9,z:9}},
    {loadout:{atk:1e9}},{attack:1e9},{hp:0},{kills:['x']},
    {reward:{coins:1e9}},{clientFrame:20},{trace:f.trace.trace}])
    await assert.rejects(step(f,o.state,1,bad),err('C15_DUNGEON_V2C9_INPUT_INVALID'));
});
test('step rejects actors and ticket mismatches',async()=>{
  const f=await fixture(),o=await f.open();
  for(const bad of [{uid:'another-user'},
    {sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},
    {requestId:'another_request_00001'}])
    await assert.rejects(step(f,o.state,1,bad),err('C15_DUNGEON_V2C9_ACTOR_MISMATCH'));
  for(const bad of [{mac:'a'.repeat(64)},{battleId:'invalid'},
    {sceneSeed:0},{profileId:'different'}])
    await assert.rejects(step(f,o.state,1,{ticket:{...f.ticket,...bad}}),
      err('C15_DUNGEON_V2C9_TICKET_MISMATCH'));
});
test('invalid tick input denied and six-second boundary enforced',async()=>{
  const f=await fixture(),o=await f.open();
  for(const t of [0,-1,1.5,61,361,NaN,Infinity])
    await assert.rejects(step(f,o.state,t),err('C15_DUNGEON_V2C9_INPUT_INVALID'));
  const done=await advance(f,o.state,MAX_TICKS);
  await assert.rejects(step(f,done.state,1),err('C15_DUNGEON_V2C9_TICK_CAP'));
});
test('step is idempotent under retry, no double input steps',async()=>{
  const f=await fixture(),o=await f.open();
  const a=await step(f,o.state,12),b=await step(f,o.state,12);
  assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);
  assert.equal(a.state,b.state);
  assert.equal(a.report.inputDigest,b.report.inputDigest);
});
test('used or in-flight state cannot fork across batch sizes',async()=>{
  const f=await fixture(),o=await f.open();
  await step(f,o.state,6);
  await assert.rejects(step(f,o.state,7),err('C15_DUNGEON_V2C9_REUSED_STATE'));
});
test('concurrent exact retry consumes one input batch',async()=>{
  const f=await fixture(),o=await f.open();
  const all=await Promise.all(Array.from({length:10},()=>step(f,o.state,16)));
  assert.equal(all.filter(x=>!x.duplicate).length,1);
  assert.ok(all.every(x=>x.state===all[0].state));
  assert.equal(f.writes,0);
});
test('same 360 ticks yields deterministic digest across batch sizes',async()=>{
  const f=await fixture();const a=await f.open(),b=await f.open();
  const x=await advance(f,a.state,360,60),y=await advance(f,b.state,360,17);
  assert.equal(x.report.inputDigest,y.report.inputDigest);
  assert.deepEqual(x.report.candidatePlayerPosition,y.report.candidatePlayerPosition);
  assert.deepEqual(x.report.candidateLoadout,y.report.candidateLoadout);
});
test('revoke emulator admission blocks even same retry',async()=>{
  const f=await fixture(),o=await f.open();
  await step(f,o.state,1);
  f.docs.delete(`users/${UID}/c15DungeonV1Admissions/${REQ}`);
  await assert.rejects(step(f,o.state,1),err('C15_DUNGEON_V2B2_NO_ADMISSION'));
});
test('mid-replay server-owned weapon/ship edits invalidate next tick',async()=>{
  const f=await fixture(),o=await f.open();
  const a=await step(f,o.state,5);
  const p=f.docs.get(`users/${UID}`);
  p.campaignData.items.item_start_gun.level=5;
  await assert.rejects(step(f,a.state,1),
    err('C15_DUNGEON_V2C9_LOADOUT_DRIFT'));
});
test('mid-replay account profile ID or session change is rejected',async()=>{
  const f=await fixture(),o=await f.open();
  const s=(await step(f,o.state,1)).state;
  f.docs.get(`users/${UID}`).sessionId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  await assert.rejects(step(f,s,1),err('C15_DUNGEON_V2B2_ADMISSION_INVALID'));
});
test('no HTTP/economic route wired for V2C.9',()=>{
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(server,/c15DungeonInputLoadoutV2C9/);
  assert.doesNotMatch(server,/GAME_C15_DUNGEON_V2C9_ENABLED/);
});
test('rewards remain locked on enabled service regardless of simulated ticks',async()=>{
  const f=await fixture(),o=await f.open();
  const done=await advance(f,o.state,MAX_TICKS);
  assert.equal(done.report.safeForSettlement,false);
  assert.equal(done.report.rewardSettlementEnabled,false);
  assert.throws(()=>f.svc.claim({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.svc.finalize({kills:99}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});
