'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {VERSION:V1_VERSION,createDungeonContractV1}=require('../lib/c15DungeonFoundationV1.cjs');
const {parseC15DungeonSeedTouchTicketV2B2Config,
  createC15DungeonSeedTouchTicketV2B2}=require('../lib/c15DungeonSeedTouchTicketV2B2.cjs');

const UID='dungeon-v2b2-qa-uid';
const SID='a4b5aaed-8cde-4a58-82dd-774fa8a22901';
const BID='ca62f851-9fad-4ceb-8d0c-6d24d6f22d00';
const REQ='dungeon_v2b2_entry_request_001';
const ISSUE=Date.UTC(2026,10,20,10,0,0);
const PROJECT='demo-spacefighter-dungeon-v2b2';
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
  GOOGLE_CLOUD_PROJECT:PROJECT,
  GCLOUD_PROJECT:PROJECT,
  FIREBASE_PROJECT_ID:PROJECT,
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:38081',
});
const err=code=>e=>e?.code===code;
const importClient=rel=>import(pathToFileURL(path.resolve(__dirname,'../../client/src',rel)).href);
async function fixture(){
  let at=ISSUE+100;
  const listing=await importClient('constants.js');
  const content=await importClient('game/dungeon/DungeonContentCatalogV393.js');
  const contract=createDungeonContractV1('dung_taurus',{
    listings:listing.DUNGEON_CONFIG,content:content.DUNGEON_CONTENT_CATALOG_V393,
    hazards:content.DUNGEON_HAZARD_PROFILES_V393,
    objectives:content.DUNGEON_OBJECTIVE_PROFILES_V393,
  });
  const admission={version:V1_VERSION,uid:UID,sessionId:SID,battleId:BID,
    dungeonId:'dung_taurus',requestId:REQ,requestDigest:'f'.repeat(64),
    contractDigest:contract.contractDigest,energyCharged:contract.energyCost,
    admittedAtMs:ISSUE,expiresAtMs:ISSUE+20*60*1000,
    status:'admitted-emulator',qaOnly:true,source:'firestore-emulator',
    independentReplayVerified:false,rewardSettlementEnabled:false,cloudRewards:false};
  const profile={sessionId:SID,campaignData:{profileId:'qa_profile_42'},wallet:{energy:30}};
  const active={version:V1_VERSION,uid:UID,sessionId:SID,battleId:BID,requestId:REQ,
    status:'admitted-emulator',expiresAtMs:admission.expiresAtMs,qaOnly:true,
    rewardSettlementEnabled:false};
  const docs=new Map([
    [`users/${UID}`,profile],
    [`users/${UID}/c15DungeonV1Admissions/${REQ}`,admission],
    [`users/${UID}/c15DungeonV1Sessions/current`,active],
  ]);
  let reads=0,writes=0;
  const db={app:{options:{projectId:PROJECT}},collection:coll=>({doc:id=>{
    const path=`${coll}/${id}`;
    function ref(atPath){
      return {get:async()=>{reads++;const data=docs.get(atPath);return {exists:data!==undefined,
        data:()=>data===undefined?undefined:structuredClone(data)};},
      collection:name=>({doc:child=>ref(`${atPath}/${name}/${child}`)}),
      set:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
      create:()=>{writes++;throw Error('WRITE_FORBIDDEN');}};
    }
    return ref(path);
  }})};
  const service=await createC15DungeonSeedTouchTicketV2B2({env,db,now:()=>at,
    signingKey:Buffer.alloc(32,17)});
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  return {service,admission,profile,active,docs,db,actor,
    setTime:t=>{at=t;},get writes(){return writes;},get reads(){return reads;}};
}
function fakeCanvas(){
  const listeners=new Map();
  const wnd=new Map();
  const on=(m,k,fn)=>{const list=m.get(k)||[];list.push(fn);m.set(k,list);};
  const off=(m,k,fn)=>m.set(k,(m.get(k)||[]).filter(x=>x!==fn));
  const browser={addEventListener:(k,fn)=>on(wnd,k,fn),
    removeEventListener:(k,fn)=>off(wnd,k,fn)};
  const canvas={style:{touchAction:''},tabIndex:-1,ownerDocument:{defaultView:browser},
    getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},
    setPointerCapture:()=>{},hasPointerCapture:()=>false,
    releasePointerCapture:()=>{},focus:()=>{},
    addEventListener:(k,fn)=>on(listeners,k,fn),
    removeEventListener:(k,fn)=>off(listeners,k,fn),
    getBoundingClientRect:()=>({width:400,height:800}),
  };
  const fire=(kind,values={})=>{for(const fn of listeners.get(kind)||[])fn({
    pointerId:7,pointerType:'touch',button:0,clientX:100,clientY:400,
    timeStamp:1,cancelable:false,...values,
  });};
  return {canvas,fire};
}
async function capturedTrace(ticket){
  const {createShipInputController}=await importClient('game/combat/ShipInputController.js');
  const {createDungeonDeviceTouchTraceV2B2}=await importClient('game/dungeon/DungeonDeviceTouchTraceV2B2.js');
  const trace=createDungeonDeviceTouchTraceV2B2({ticket});
  const {canvas,fire}=fakeCanvas();
  const playerRoot={position:{x:0,z:12.5}};
  const observer={add:()=>123,remove:()=>{}};
  const scene={onBeforeRenderObservable:observer,onDisposeObservable:{addOnce:()=>{}}};
  const controller=createShipInputController({canvas,scene,playerRoot,tiltNode:null,
    engine:{getDeltaTime:()=>16.667},halfHeight:15,aspect:()=>.5,
    onPointerTrace:e=>trace.capture(e)});
  fire('pointerdown',{clientX:100,clientY:400,timeStamp:20});
  fire('pointermove',{clientX:130,clientY:430,timeStamp:35});
  fire('pointermove',{clientX:145,clientY:450,timeStamp:44});
  fire('pointerup',{clientX:145,clientY:450,timeStamp:50});
  controller.dispose();
  return {trace:trace.snapshot(),position:playerRoot.position};
}

test('V2B.2 OFF by default and settlement remains unavailable',async()=>{
  assert.equal(parseC15DungeonSeedTouchTicketV2B2Config({}),null);
  const off=await createC15DungeonSeedTouchTicketV2B2();
  assert.equal(off.enabled,false);
  assert.throws(()=>off.issueTicket({}),err('C15_DUNGEON_V2B2_DISABLED'));
  assert.throws(()=>off.claim({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.finalize({}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2B.2 requires all approved prior gates and local demo Emulator',()=>{
  for(const patch of [
    {GAME_C15_DUNGEON_V2B2_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2B1_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2A_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {GCLOUD_PROJECT:'different-project'},
    {FIRESTORE_EMULATOR_HOST:'192.168.1.2:38081'},
    {GAME_C15_DUNGEON_V1_ALLOW_UIDS:''},
  ])assert.throws(()=>parseC15DungeonSeedTouchTicketV2B2Config({...env,...patch}),TypeError);
  assert.equal(parseC15DungeonSeedTouchTicketV2B2Config({...env,
    GAME_C15_DUNGEON_V2B2_ENABLED:'false'}),null);
});
test('V2B.2 requires server DB project and real 32-byte ephemeral key',async()=>{
  await assert.rejects(createC15DungeonSeedTouchTicketV2B2({env}),TypeError);
  const f=await fixture();
  await assert.rejects(createC15DungeonSeedTouchTicketV2B2({env,
    db:{...f.db,app:{options:{projectId:'distributed-inn-482605-c6'}}}}),TypeError);
  await assert.rejects(createC15DungeonSeedTouchTicketV2B2({env,
    db:f.db,signingKey:Buffer.alloc(10)}),TypeError);
});
test('ticket reads server profile/admission and derives exact scene seed',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  const shared=await importClient('game/dungeon/DungeonSeedTouchContractV2B1.js');
  assert.equal(ticket.sceneSeed,shared.dungeonSceneStableSeedV2B1('dung_taurus','qa_profile_42',BID));
  assert.equal(ticket.profileId,'qa_profile_42');
  assert.equal(ticket.dungeonId,'dung_taurus');
  assert.equal(ticket.roomId,'taurus_entry');
  assert.match(ticket.mac,/^[a-f0-9]{64}$/);
  assert.match(ticket.spawnPlanDigest,/^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(ticket));
  assert.equal(f.writes,0);
});
test('server validates issued ticket and explicitly refuses combat authority',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  const verified=await f.service.verifyTicket(ticket,f.actor);
  assert.equal(verified.serverAdmissionVerified,true);
  assert.equal(verified.serverSceneSeedBound,true);
  assert.equal(verified.combatParityVerified,false);
  assert.equal(verified.independentReplayVerified,false);
  assert.equal(verified.safeForSettlement,false);
  assert.equal(f.writes,0);
});
test('valid ticket is still bound to correct server UID, session, request',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  for(const context of [
    {...f.actor,uid:'other_uid'},
    {...f.actor,sessionId:'bddcc605-0938-45c3-b889-cd7bbbe27a01'},
    {...f.actor,requestId:'other_request_0000001'},
  ])await assert.rejects(f.service.verifyTicket(ticket,context));
});
test('HMAC detects modified scene seed, profile, battleId, reward flags and extra fields',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  for(const patch of [
    {sceneSeed:ticket.sceneSeed+1},
    {profileId:'other'},
    {battleId:'bddcc605-0938-45c3-b889-cd7bbbe27a01'},
    {rewardSettlementEnabled:true},
    {safeForSettlement:true},
    {cloudRewards:true},
    {victory:true},
    {mac:'0'.repeat(64)},
    {spawnPlanDigest:'f'.repeat(64)},
  ])await assert.rejects(f.service.verifyTicket({...ticket,...patch},f.actor),
    err('C15_DUNGEON_V2B2_TICKET_INVALID'));
});
test('ticket expires in two minutes and cannot be replayed into later admission',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  f.setTime(ISSUE+130000);
  await assert.rejects(f.service.verifyTicket(ticket,f.actor),
    err('C15_DUNGEON_V2B2_TICKET_STALE'));
});
test('server refuses deleted/pending account or missing admission documents',async()=>{
  const f=await fixture();
  f.docs.set(`users/${UID}`,{...f.profile,accountDeletion:{status:'pending'}});
  await assert.rejects(f.service.issueTicket(f.actor),err('ACCOUNT_DELETION_PENDING'));
  f.docs.delete(`users/${UID}/c15DungeonV1Admissions/${REQ}`);
  await assert.rejects(f.service.issueTicket(f.actor),err('C15_DUNGEON_V2B2_NO_ADMISSION'));
});
test('server rejects changed profile/session and foreign or modified active battle',async()=>{
  const f=await fixture();
  f.docs.set(`users/${UID}`,{...f.profile,sessionId:'bad-session'});
  await assert.rejects(f.service.issueTicket(f.actor),err('C15_DUNGEON_V2B2_ADMISSION_INVALID'));
  f.docs.set(`users/${UID}`,f.profile);
  f.docs.set(`users/${UID}/c15DungeonV1Sessions/current`,{
    ...f.active,battleId:'bddcc605-0938-45c3-b889-cd7bbbe27a01'});
  await assert.rejects(f.service.issueTicket(f.actor),err('C15_DUNGEON_V2B2_ADMISSION_INVALID'));
});
test('client QA only enabled with compile-time DEV, QA run and matching ticket context',async()=>{
  const client=await importClient('game/dungeon/DungeonDeviceTouchTraceV2B2.js');
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  const context={env:{DEV:true,VITE_SF_DUNGEON_V2B2_QA:'true'},qaRun:{},ticket,
    profileId:'qa_profile_42',activeBattleId:BID,dungeonId:'dung_taurus'};
  assert.equal(client.isDungeonV2B2LocalQaEnabledV2B2(context),true);
  for(const patch of [
    {env:{DEV:false,VITE_SF_DUNGEON_V2B2_QA:'true'}},
    {env:{DEV:true,VITE_SF_DUNGEON_V2B2_QA:'false'}},
    {qaRun:null},{activeBattleId:'some-other-battle'},
    {profileId:'claimed-profile'},{dungeonId:'dung_nereus'},
    {ticket:{...ticket,cloudRewards:true}},
  ])assert.equal(client.isDungeonV2B2LocalQaEnabledV2B2({...context,...patch}),false);
});
test('actual accepted controller pointer events yield a bounded local QA trace',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  const captured=await capturedTrace(ticket);
  assert.deepEqual(captured.trace.events.map(x=>x.kind),['down','move','move','up']);
  assert.equal(captured.trace.battleId,BID);
  assert.equal(captured.trace.safeForSettlement,false);
  assert.equal(captured.trace.truncated,false);
  assert.equal(captured.trace.events[2].position.x,captured.position.x);
});
test('server checks reported controller projection but does NOT authenticate device',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  const {trace}=await capturedTrace(ticket);
  const verified=await f.service.inspectDeviceTrace({ticket,trace,...f.actor});
  assert.equal(verified.acceptedPointerMoves,2);
  assert.equal(verified.reportedPointerFormulaConsistent,true);
  assert.equal(verified.deviceAuthenticityVerified,false);
  assert.equal(verified.c15JournalEquivalenceVerified,false);
  assert.equal(verified.independentReplayVerified,false);
  assert.equal(verified.safeForSettlement,false);
  assert.equal(f.writes,0);
});
test('server rejects forged ship position, mismatched delta and extra reward fields',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  const {trace}=await capturedTrace(ticket);
  async function rejectModified(index,patch){
    const events=structuredClone(trace.events);
    events[index]={...events[index],...patch};
    await assert.rejects(f.service.inspectDeviceTrace({ticket,
      trace:{...trace,events},...f.actor}));
  }
  await rejectModified(1,{position:{x:999,z:12}});
  await rejectModified(1,{delta:{deltaX:1000,deltaY:5}});
  await rejectModified(1,{coins:1000000});
  await rejectModified(2,{victory:true});
  await assert.rejects(f.service.inspectDeviceTrace({ticket,
    trace:{...trace,rewards:[{coins:9000}]},...f.actor}),
    err('C15_DUNGEON_V2B2_TRACE_INVALID'));
});
test('server rejects incomplete, reordered, wrong-battle and oversize traces',async()=>{
  const f=await fixture();
  const ticket=await f.service.issueTicket(f.actor);
  const {trace}=await capturedTrace(ticket);
  for(const altered of [
    {...trace,battleId:'bddcc605-0938-45c3-b889-cd7bbbe27a01'},
    {...trace,truncated:true},
    {...trace,events:trace.events.slice(0,-1)},
    {...trace,events:trace.events.slice().reverse()},
    {...trace,events:Array.from({length:257},()=>trace.events[0])},
  ])await assert.rejects(f.service.inspectDeviceTrace({ticket,trace:altered,...f.actor}));
});
test('QA telemetry hook is opt-in and exceptions never break ship movement',async()=>{
  const {createShipInputController}=await importClient('game/combat/ShipInputController.js');
  const {canvas,fire}=fakeCanvas();
  const playerRoot={position:{x:0,z:12.5}};
  const scene={onBeforeRenderObservable:{add:()=>1,remove:()=>{}},
    onDisposeObservable:{addOnce:()=>{}}};
  const control=createShipInputController({canvas,scene,playerRoot,tiltNode:null,
    aspect:()=>.5,onPointerTrace:()=>{throw Error('QA_CALLBACK_ERROR');}});
  fire('pointerdown',{timeStamp:10});
  fire('pointermove',{timeStamp:15,clientX:130,clientY:440});
  fire('pointerup',{timeStamp:20,clientX:130,clientY:440});
  assert.ok(playerRoot.position.x<0);
  assert.ok(playerRoot.position.z>12.5);
  control.dispose();
});
test('existing seed, controller paths and settlement gates are preserved',()=>{
  const scene=fs.readFileSync(path.resolve(__dirname,
    '../../client/src/components/Dungeon/DungeonScene.js'),'utf8');
  assert.match(scene,/dungeonSceneStableSeedV2B1 as stableSeed/);
  assert.match(scene,/const dungeonSceneLegacySeedV38 = stableSeed\(/);
  assert.match(scene,/isDungeonV2B2LocalQaEnabledV2B2/);
  const guard=fs.readFileSync(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonDeviceTouchTraceV2B2.js'),'utf8');
  assert.match(guard,/VITE_SF_DUNGEON_V2B2_QA/);
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(server,/c15DungeonSeedTouchTicketV2B2/);
  const economy=fs.readFileSync(path.resolve(__dirname,'../lib/economy.cjs'),'utf8');
  assert.doesNotMatch(economy,/V2B2/);
});
