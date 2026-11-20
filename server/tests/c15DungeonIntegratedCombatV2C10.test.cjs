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
const {createC15DungeonInputLoadoutV2C9}=require('../lib/c15DungeonInputLoadoutV2C9.cjs');
const {VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  parseC15DungeonIntegratedCombatV2C10Config,
  createC15DungeonIntegratedCombatV2C10}=require('../lib/c15DungeonIntegratedCombatV2C10.cjs');

const UID='dungeon-v2c10-emulator-qa-user';
const SID='b2c10000-a004-4af1-8a20-127d021b3ac0';
const BID='b2c10000-a005-4af1-8a20-127d021b3ac0';
const REQ='dungeon_v2c10_entry_request_001';
const ISSUE=Date.UTC(2026,10,20,10,0,0);
const PROJECT='demo-spacefighter-dungeon-v2c10';
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
  GAME_C15_DUNGEON_V2C10_ENABLED:'true',GAME_C15_DUNGEON_V2C10_QA_APPROVED:'true',
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
async function fixture({profileMutate,traceOptions}={}){
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
    profileId:'qa_v2c10_profile_1'},wallet:{energy:30}};
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
  const inputService=await createC15DungeonInputLoadoutV2C9({env,db,ticketService,movementService});
  const svc=await createC15DungeonIntegratedCombatV2C10({env,ticketService,inputService});
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  const ticket=await ticketService.issueTicket(actor);
  const trace=await makeTrace(ticket,traceOptions);
  const open=()=>svc.open({ticket,trace:trace.trace,...actor});
  return {svc,inputService,open,ticket,trace,actor,db,docs,profile,admission,active,
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


const addArmor=(p,id='armor_shield')=>{p.campaignData.items.test_armor={baseId:id,type:'armor',rarity:1,level:1};p.campaignData.loadout.armor='test_armor';};
const gun=(p,id='gun_homing')=>{p.campaignData.items.item_start_gun.baseId=id;};
const changeShipLevel=(p,level)=>{p.campaignData.ownedAircrafts.ship_xwing.level=level;};
const addPilot=(p,id)=>{p.campaignData.ownedPilots[id]={level:1};p.campaignData.loadout.pilot=id;};

test('V2C.10 default OFF; claim/finalize remain locked',async()=>{
  assert.equal(parseC15DungeonIntegratedCombatV2C10Config({}),null);
  const svc=await createC15DungeonIntegratedCombatV2C10();
  assert.equal(svc.enabled,false);
  assert.equal(svc.safeForSettlement,false);
  assert.throws(()=>svc.open(),err('C15_DUNGEON_V2C10_DISABLED'));
  assert.throws(()=>svc.claim({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>svc.finalize({rewards:1}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.10 requires explicit approval and all predecessor demo gates',()=>{
  assert.throws(()=>parseC15DungeonIntegratedCombatV2C10Config({...env,GAME_C15_DUNGEON_V2C10_QA_APPROVED:'false'}),TypeError);
  assert.throws(()=>parseC15DungeonIntegratedCombatV2C10Config({...env,GAME_C15_DUNGEON_V2C9_ENABLED:'false'}),TypeError);
  assert.throws(()=>parseC15DungeonIntegratedCombatV2C10Config({...env,FIRESTORE_EMULATOR_HOST:''}),TypeError);
  assert.throws(()=>parseC15DungeonIntegratedCombatV2C10Config({...env,GCLOUD_PROJECT:'production-project'}),TypeError);
  assert.throws(()=>parseC15DungeonIntegratedCombatV2C10Config(Object.create(env)),TypeError);
});
test('V2C.10 on requires ticket and V2C.9 issued service',async()=>{
  await assert.rejects(createC15DungeonIntegratedCombatV2C10({env}),TypeError);
});
test('V2C.10 opens with account-derived base HP, armor and main gun',async()=>{
  const f=await fixture();const opened=await f.open();
  const [constants,]=await modules();
  const loadout=opened.state.loadout;
  assert.equal(loadout.mainGunId,'gun_laser');
  assert.equal(opened.report.serverReadMainGunId,'gun_laser');
  assert.equal(opened.report.candidatePlayerHp,loadout.maxHp);
  assert.equal(opened.report.candidatePlayerShieldHp,loadout.passiveShieldMax);
  assert.equal(opened.state.weapon.atk,loadout.atk);
  assert.equal(opened.state.weapon.fireEveryTicks,Math.ceil(loadout.fireRateMs*TICK_HZ/1000));
  assert.equal(opened.report.candidatePlayerPosition.z,12.5);
  assert.equal(opened.report.serverReadLoadoutAppliedToWeaponAndVitals,true);
  assert.equal(opened.report.playerTouchPerTickVerified,false);
  assert.equal(opened.report.actualAccountLoadoutVerified,false);
  assert.equal(opened.report.safeForSettlement,false);
  assert.equal(f.writes,0);
});
test('V2C.10 per-tick input changes actual combat player pose',async()=>{
  const f=await fixture();const a=await f.open();
  const x=await step(f,a.state,1);
  assert.deepEqual(x.report.candidatePlayerPosition,{x:0,z:12.5});
  const y=await step(f,x.state,1);
  assert.notDeepEqual(y.report.candidatePlayerPosition,{x:0,z:12.5});
  const z=await step(f,y.state,1);
  assert.deepEqual(z.report.candidatePlayerPosition,f.trace.position);
  assert.equal(z.report.simulatedTicks,3);
  assert.equal(z.report.inputPositionsAppliedPerTick,true);
});
test('V2C.10 report and state do not claim device or settlement parity',async()=>{
  const f=await fixture();const a=await f.open();
  for(const r of [a.report,(await step(f,a.state,1)).report]){
    assert.equal(r.independentlyVerifiedFullDungeonCombat,false);
    assert.equal(r.liveGameplayAiParityVerified,false);
    assert.equal(r.liveBabylonMuzzleVerified,false);
    assert.equal(r.actualDeviceProvenanceVerified,false);
    assert.equal(r.actualAccountLoadoutVerified,false);
    assert.equal(r.dungeonVictoryVerified,false);
    assert.equal(r.rewardSettlementEnabled,false);
    assert.equal(r.cloudRewards,false);
  }
  assert.throws(()=>f.svc.claim({}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2C.10 input contract rejects any client hit/damage/position/loadout',async()=>{
  const f=await fixture(),a=await f.open();
  for(const [key,value] of [['hp',9999],['atk',500000],['player',{x:5,z:5}],['kills',99],['victory',true],['reward',1],['loadout',{maxHp:999}],['damage',42],['trace',f.trace.trace]]){
    await assert.rejects(step(f,a.state,1,{[key]:value}),err('C15_DUNGEON_V2C10_INPUT_INVALID'));
  }
  await assert.rejects(step(f,a.state,0),err('C15_DUNGEON_V2C10_INPUT_INVALID'));
  await assert.rejects(step(f,a.state,61),err('C15_DUNGEON_V2C10_INPUT_INVALID'));
});
test('V2C.10 open contract rejects client-supplied combat data',async()=>{
  const f=await fixture();
  await assert.rejects(f.svc.open({ticket:f.ticket,trace:f.trace.trace,...f.actor,hp:999}),err('C15_DUNGEON_V2C10_INPUT_INVALID'));
});
test('V2C.10 state cannot be forged by copying frozen fields',async()=>{
  const f=await fixture();const a=await f.open();
  await assert.rejects(step(f,{...a.state},1),err('C15_DUNGEON_V2C10_STATE_UNTRUSTED'));
});
test('V2C.10 actor binding prevents UID/session/request swap',async()=>{
  const f=await fixture(),a=await f.open();
  for(const [key,value] of [['uid','other'],['sessionId','different'],['requestId','invalid']])
    await assert.rejects(step(f,a.state,1,{[key]:value}),err('C15_DUNGEON_V2C10_ACTOR_MISMATCH'));
});
test('V2C.10 ticket full digest protects signed fields and MAC',async()=>{
  const f=await fixture(),a=await f.open();
  for(const [key,value] of [['battleId','different'],['roomId','wrong'],['mac','aaa']])
    await assert.rejects(step(f,a.state,1,{ticket:{...f.ticket,[key]:value}}),err('C15_DUNGEON_V2C10_TICKET_MISMATCH'));
});
test('V2C.10 incomplete/tampered accepted touch trace rejected at open',async()=>{
  const f=await fixture();
  const bad={...f.trace.trace,events:f.trace.trace.events.slice(0,-1)};
  await assert.rejects(f.svc.open({ticket:f.ticket,trace:bad,...f.actor}));
});
test('V2C.10 exact same operation retry is idempotent',async()=>{
  const f=await fixture(),a=await f.open();
  const x=await step(f,a.state,2);const again=await step(f,a.state,2);
  assert.equal(x.duplicate,false);assert.equal(again.duplicate,true);
  assert.strictEqual(x.state,again.state);
  assert.equal(x.report.candidateDigest,again.report.candidateDigest);
});
test('V2C.10 same consumed state cannot fork to different ticks',async()=>{
  const f=await fixture(),a=await f.open();
  await step(f,a.state,1);
  await assert.rejects(step(f,a.state,2),err('C15_DUNGEON_V2C10_REUSED_STATE'));
});
test('V2C.10 concurrent same-state same-tick calls deduplicate',async()=>{
  const f=await fixture(),a=await f.open();
  const x=await Promise.all(Array.from({length:8},()=>step(f,a.state,3)));
  assert.equal(new Set(x.map(z=>z.state)).size,1);
  assert.equal(x.filter(z=>z.duplicate===false).length,1);
});
test('V2C.10 rejecting admission revocation on idempotent retry',async()=>{
  const f=await fixture(),a=await f.open();
  await step(f,a.state,1);
  f.docs.delete(`users/${UID}/c15DungeonV1Admissions/${REQ}`);
  await assert.rejects(step(f,a.state,1));
});
test('V2C.10 rejecting server profile drift before advancing',async()=>{
  const f=await fixture(),a=await f.open();
  f.docs.get(`users/${UID}`).campaignData.ownedAircrafts.ship_xwing.level=7;
  await assert.rejects(step(f,a.state,1),err('C15_DUNGEON_V2C9_LOADOUT_DRIFT'));
});
test('V2C.10 rejecting server profile drift on idempotent retry',async()=>{
  const f=await fixture(),a=await f.open();
  await step(f,a.state,1);
  f.docs.get(`users/${UID}`).campaignData.ownedAircrafts.ship_xwing.level=7;
  await assert.rejects(step(f,a.state,1),err('C15_DUNGEON_V2C9_LOADOUT_DRIFT'));
});
test('V2C.10 supports derived homing gun with no client weapon injection',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_homing')}),a=await f.open();
  assert.equal(a.state.weapon.firePattern,'homing');
  assert.equal(a.state.weapon.id,'gun_homing');
  assert.equal(a.state.weapon.atk,a.state.loadout.atk);
});
test('V2C.10 supports server-derived railgun penetration count',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_rail')}),a=await f.open();
  assert.equal(a.state.weapon.firePattern,'pierce');
  assert.equal(a.state.weapon.penetration,3);
});
test('V2C.10 supports server-derived plasma basic shot',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_plasma')}),a=await f.open();
  assert.equal(a.state.weapon.firePattern,'single');
  assert.equal(a.state.weapon.projectileType,'plasma');
});
test('V2C.10 rejects spread gun unsupported by current QA subset',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_spread')});
  await assert.rejects(f.open(),err('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT'));
});
test('V2C.10 rejects burst gun unsupported by current QA subset',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_pulse')});
  await assert.rejects(f.open(),err('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT'));
});
test('V2C.10 rejects ion slow effect unsupported by current QA subset',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_ion')});
  await assert.rejects(f.open(),err('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT'));
});
test('V2C.10 rejects player dodge pilot not modeled in deterministic defense',async()=>{
  const f=await fixture({profileMutate:p=>addPilot(p,'pilot_ghost')});
  await assert.rejects(f.open(),err('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT'));
});
test('V2C.10 rejects pilot regen not modeled in candidate vitals',async()=>{
  const f=await fixture({profileMutate:p=>addPilot(p,'pilot_bear')});
  await assert.rejects(f.open(),err('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT'));
});
test('V2C.10 rejects equipped drone not represented in outgoing timeline',async()=>{
  const f=await fixture({profileMutate:p=>{
    p.campaignData.items.test_drone={baseId:'drone_sniper',type:'drone',rarity:1,level:1};
    p.campaignData.loadout.drone='test_drone';
  }});
  await assert.rejects(f.open());
});
test('V2C.10 shield armor drives candidate maxHp and passive shield',async()=>{
  const f=await fixture({profileMutate:p=>addArmor(p)}),a=await f.open();
  assert.equal(a.state.loadout.armorPassive,'shield');
  assert.ok(a.report.candidatePlayerShieldHp>0);
  assert.ok(a.report.candidatePlayerHp>1050);
});
test('V2C.10 unsupported reactive armor fails closed',async()=>{
  const f=await fixture({profileMutate:p=>addArmor(p,'armor_reactive')});
  await assert.rejects(f.open(),err('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT'));
});
test('V2C.10 server ship level changes attack and HP preset',async()=>{
  const a=await fixture(),b=await fixture({profileMutate:p=>changeShipLevel(p,4)});
  const x=await a.open(),y=await b.open();
  assert.ok(y.report.candidatePlayerHp>x.report.candidatePlayerHp);
  assert.ok(y.state.weapon.atk>x.state.weapon.atk);
  assert.notEqual(x.report.serverReadLoadoutDigest,y.report.serverReadLoadoutDigest);
});
test('V2C.10 tick replay digest deterministic across batch splits',async()=>{
  const a=await fixture(),b=await fixture();
  const x=await a.open(),y=await b.open();
  let sx=x.state,sy=y.state;
  for(let t=0;t<180;t+=60) sx=(await step(a,sx,60)).state;
  for(let t=0;t<180;t+=15) sy=(await step(b,sy,15)).state;
  assert.equal(a.svc.inspect(sx).candidateDigest,b.svc.inspect(sy).candidateDigest);
  assert.equal(a.svc.inspect(sx).candidateOutgoingShots,b.svc.inspect(sy).candidateOutgoingShots);
  assert.deepEqual(a.svc.inspect(sx).candidateEnemyHp,b.svc.inspect(sy).candidateEnemyHp);
});
test('V2C.10 input trace changes actual causal candidate combat digest',async()=>{
  const a=await fixture(),b=await fixture({traceOptions:{moves:[{dx:5,dy:-30,dt:20},{dx:20,dy:10,dt:30}]}});
  let x=(await a.open()).state,y=(await b.open()).state;
  x=(await step(a,x,60)).state;
  y=(await step(b,y,60)).state;
  assert.notDeepEqual(a.svc.inspect(x).candidatePlayerPosition,b.svc.inspect(y).candidatePlayerPosition);
  assert.notEqual(a.svc.inspect(x).candidateDigest,b.svc.inspect(y).candidateDigest);
});
test('V2C.10 server profile changes actual candidate combat digest',async()=>{
  const a=await fixture(),b=await fixture({profileMutate:p=>changeShipLevel(p,2)});
  let x=(await a.open()).state,y=(await b.open()).state;
  x=(await step(a,x,60)).state;
  y=(await step(b,y,60)).state;
  assert.notEqual(a.svc.inspect(x).candidateDigest,b.svc.inspect(y).candidateDigest);
});
test('V2C.10 six-second 360 ticks capped and no economic writes',async()=>{
  const f=await fixture(),a=await f.open();
  const r=await advance(f,a.state,360,60);
  assert.equal(r.report.simulatedTicks,360);
  assert.equal(r.report.candidateEnemyHp.length>0,true);
  assert.equal(f.writes,0);
  await assert.rejects(step(f,r.state,1),err('C15_DUNGEON_V2C10_TICK_CAP'));
});
test('V2C.10 candidate death lifecycle stays internally causal',async()=>{
  const f=await fixture({profileMutate:p=>changeShipLevel(p,50)}),a=await f.open();
  const {state,report}=await advance(f,a.state,360,60);
  assert.equal(report.candidateDeadEnemies,report.candidateDeaths.length);
  assert.ok(report.candidateOutgoingShots>=0);
  assert.ok(report.candidateOutgoingDamage>=0);
  assert.equal(state.roster.filter(x=>x.dead).length,report.candidateDeaths.length);
  assert.ok(state.actors.every(x=>!state.roster.find(r=>r.id===x.id).dead));
  assert.equal(f.writes,0);
});
test('V2C.10 never modifies existing V2C.8 sandbox source',()=>{
  const own=fs.readFileSync(path.resolve(__dirname,'../lib/c15DungeonIntegratedCombatV2C10.cjs'),'utf8');
  const old=fs.readFileSync(path.resolve(__dirname,'../lib/c15DungeonUnifiedCombatV2C8.cjs'),'utf8');
  assert.match(old,/QA_WEAPON/);
  assert.match(own,/projectIntegratedIncoming/);
  assert.doesNotMatch(own,/projectCandidateHitV2C4/);
  assert.doesNotMatch(own,/QA_DEFENSE_FIXTURE/);
});
test('V2C.10 production server has no V2C.10 route, flag or settlement coupling',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(source,/GAME_C15_DUNGEON_V2C10_ENABLED/);
  assert.doesNotMatch(source,/c15DungeonIntegratedCombatV2C10/);
});
test('V2C.10 homing gun runs projected live causal loop through firing ticks',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_homing')}),a=await f.open();
  const x=await advance(f,a.state,240,60);
  assert.ok(x.report.candidateOutgoingShots>0);
  assert.ok(x.report.candidateOutgoingDamage>=0);
  assert.equal(x.report.candidatePlayerPosition.x,f.trace.position.x);
  assert.equal(f.writes,0);
});
test('V2C.10 railgun piercing runs without accepting hit claims',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_rail')}),a=await f.open();
  const x=await advance(f,a.state,240,60);
  assert.ok(x.report.candidateOutgoingShots>0);
  assert.equal(x.report.safeForSettlement,false);
  assert.equal(f.writes,0);
});
test('V2C.10 plasma gun runs until projected enemy combat',async()=>{
  const f=await fixture({profileMutate:p=>gun(p,'gun_plasma')}),a=await f.open();
  const x=await advance(f,a.state,240,60);
  assert.ok(x.report.candidateOutgoingShots>0);
  assert.equal(f.writes,0);
});
test('V2C.10 shield from server profile remains bounded through incoming simulation',async()=>{
  const f=await fixture({profileMutate:p=>addArmor(p)}),a=await f.open();
  const x=await advance(f,a.state,360,60);
  assert.ok(x.report.candidatePlayerHp<=a.state.loadout.maxHp);
  assert.ok(x.report.candidatePlayerShieldHp<=a.state.loadout.passiveShieldMax);
  assert.ok(x.report.candidatePlayerHp>=0);
  assert.ok(x.report.candidatePlayerShieldHp>=0);
  assert.equal(f.writes,0);
});
