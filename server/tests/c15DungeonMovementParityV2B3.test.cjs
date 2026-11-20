'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {VERSION:V1_VERSION,createDungeonContractV1}=require('../lib/c15DungeonFoundationV1.cjs');
const {createC15DungeonSeedTouchTicketV2B2}=require('../lib/c15DungeonSeedTouchTicketV2B2.cjs');
const {parseC15DungeonMovementParityV2B3Config,
  createC15DungeonMovementParityV2B3}=require('../lib/c15DungeonMovementParityV2B3.cjs');

const UID='dungeon-v2b3-qa-user';
const SID='b2b30000-a004-4af1-8a20-127d021b3ac0';
const BID='b2b30000-a005-4af1-8a20-127d021b3ac0';
const REQ='dungeon_v2b3_entry_request_001';
const ISSUE=Date.UTC(2026,10,20,10,0,0);
const PROJECT='demo-spacefighter-dungeon-v2b3';
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
  GOOGLE_CLOUD_PROJECT:PROJECT,
  GCLOUD_PROJECT:PROJECT,
  FIREBASE_PROJECT_ID:PROJECT,
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:38081',
});
const err=code=>e=>e?.code===code;
const client=rel=>import(pathToFileURL(path.resolve(__dirname,'../../client/src',rel)).href);
let sharedPromise=null,tracePromise=null;
const shared=()=>sharedPromise||(sharedPromise=client('game/dungeon/DungeonSeedTouchContractV2B1.js'));
const traceModule=()=>tracePromise||(tracePromise=client('game/dungeon/DungeonDeviceTouchTraceV2B2.js'));
async function fixture(){
  let at=ISSUE+100;
  const listing=await client('constants.js');
  const content=await client('game/dungeon/DungeonContentCatalogV393.js');
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
  const service=await createC15DungeonMovementParityV2B3({env,ticketService});
  const actor={uid:UID,sessionId:SID,requestId:REQ};
  const ticket=await ticketService.issueTicket(actor);
  return {service,ticketService,actor,ticket,docs,profile,active,admission,
    setTime:t=>{at=t;},get reads(){return reads;},get writes(){return writes;}};
}
const viewport=Object.freeze({canvasWidth:400,canvasHeight:800,aspect:.5,
  halfHeight:15,inset:1.8,pointerSpeedMultiplier:1});
async function makeGesture(ticket,opts={}){
  const t=await traceModule();
  const math=await shared();
  const recorder=t.createDungeonDeviceTouchTraceV2B2({ticket});
  let position=opts.startPosition||{x:0,z:12.5};
  const gestures=opts.gestures||[{
    pointerId:7,time:20,clientX:100,clientY:400,
    moves:[{dx:30,dy:30,dt:15},{dx:15,dy:20,dt:10}]
  }];
  const snapshots=[];
  for (const g of gestures){
    let x=g.clientX,y=g.clientY,at=g.time;
    recorder.capture({kind:'down',pointerId:g.pointerId,atMs:at,
      clientX:x,clientY:y,position:{...position}});
    for(const m of g.moves){
      x+=m.dx;y+=m.dy;at+=m.dt;
      position=math.projectDungeonDirectTouchV2B1({position,
        viewport,delta:{deltaX:m.dx,deltaY:m.dy}});
      recorder.capture({kind:'move',pointerId:g.pointerId,atMs:at,
        clientX:x,clientY:y,position:{...position},viewport:{...viewport},
        delta:{deltaX:m.dx,deltaY:m.dy}});
    }
    at+=6;
    recorder.capture({kind:'up',pointerId:g.pointerId,atMs:at,
      position:{...position}});
    snapshots.push(recorder.snapshot());
  }
  return {snapshots,position,recorder};
}
async function opened(){
  const f=await fixture();
  const state=await f.service.open({ticket:f.ticket,...f.actor});
  return {...f,state};
}
const args=(f,state,trace)=>({state,ticket:f.ticket,trace,...f.actor});

// Gate and trust-boundary tests.
test('V2B.3 OFF by default, finalize and claim are always forbidden',async()=>{
  assert.equal(parseC15DungeonMovementParityV2B3Config({}),null);
  const off=await createC15DungeonMovementParityV2B3();
  assert.equal(off.enabled,false);
  assert.throws(()=>off.open({}),err('C15_DUNGEON_V2B3_DISABLED'));
  assert.throws(()=>off.finalize({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>off.claim({rewards:{coins:999999}}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('V2B.3 requires explicit approval, all prior gates and demo-only Emulator',()=>{
  for(const e of [
    {GAME_C15_DUNGEON_V2B3_QA_APPROVED:'false'},
    {GAME_C15_DUNGEON_V2B2_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2B1_ENABLED:'false'},
    {GAME_C15_DUNGEON_V2A_ENABLED:'false'},
    {GAME_C15_DUNGEON_V1_ENABLED:'false'},
    {GOOGLE_CLOUD_PROJECT:'distributed-inn-482605-c6'},
    {GCLOUD_PROJECT:'wrong'},
    {FIRESTORE_EMULATOR_HOST:'127.0.0.2:38081'},
  ])assert.throws(()=>parseC15DungeonMovementParityV2B3Config({...env,...e}),TypeError);
  assert.equal(parseC15DungeonMovementParityV2B3Config({...env,
    GAME_C15_DUNGEON_V2B3_ENABLED:'false'}),null);
  assert.equal(parseC15DungeonMovementParityV2B3Config(env).emulatorOnly,true);
});
test('V2B.3 cannot start without an enabled, non-economic V2B.2 inspector',async()=>{
  await assert.rejects(createC15DungeonMovementParityV2B3({env}),TypeError);
  await assert.rejects(createC15DungeonMovementParityV2B3({env,ticketService:{
    enabled:true,emulatorOnly:true,productionEnabled:false,rewardSettlementEnabled:true,
    verifyTicket:async()=>{},inspectDeviceTrace:async()=>{},
  }}),TypeError);
});
test('ticket and spawn schedule are rederived from server-owned V2B.2 data',async()=>{
  const f=await opened();
  const r=f.service.inspect(f.state);
  assert.equal(r.sceneSeed,f.ticket.sceneSeed);
  assert.equal(r.spawnPlanDigest,f.ticket.spawnPlanDigest);
  assert.equal(r.ticketBoundToServerAdmission,true);
  assert.deepEqual(r.replayedPosition,{x:0,z:12.5});
  assert.equal(r.cumulativeEventsVerified,0);
  assert.equal(r.safeForSettlement,false);
  assert.equal(f.writes,0);
  assert.ok(f.reads>0);
});
test('spoofed state or a copied immutable state cannot enter the replay',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket);
  assert.throws(()=>f.service.inspect({...f.state}),err('C15_DUNGEON_V2B3_STATE_UNTRUSTED'));
  await assert.rejects(f.service.ingestSnapshot(args(f,{...f.state},snapshots[0])),
    err('C15_DUNGEON_V2B3_STATE_UNTRUSTED'));
});
test('cannot open or advance another UID/session/request',async()=>{
  const f=await opened();
  await assert.rejects(f.service.open({ticket:f.ticket,...f.actor,uid:'other_user'}));
  const {snapshots}=await makeGesture(f.ticket);
  await assert.rejects(f.service.ingestSnapshot({...args(f,f.state,snapshots[0]),
    sessionId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}));
});
test('spawn plan drift cannot silently be treated as scene parity',async()=>{
  const f=await fixture();
  const original=await client('game/dungeon/DungeonEncounterDirectorV38.js');
  const svc=await createC15DungeonMovementParityV2B3({env,ticketService:f.ticketService,
    encounterModule:{buildDungeonRoomSpawnPlanV38:arg=>{
      const plan=original.buildDungeonRoomSpawnPlanV38(arg);
      return {...plan,entries:plan.entries.map((e,i)=>i===0?{...e,threatCost:e.threatCost+1}:e)};
    }}});
  await assert.rejects(svc.open({ticket:f.ticket,...f.actor}),
    err('C15_DUNGEON_V2B3_SPAWN_MISMATCH'));
});

// Replayed, bounded, *client-reported* device touch path.
test('one accepted gesture gives server-derived pose and anchored path digest',async()=>{
  const f=await opened();
  const {snapshots,position}=await makeGesture(f.ticket);
  const result=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  assert.equal(result.duplicate,false);
  assert.equal(result.report.cumulativeEventsVerified,4);
  assert.equal(result.report.acceptedPointerMoves,2);
  assert.ok(Math.abs(result.report.replayedPosition.x-position.x)<1e-8);
  assert.ok(Math.abs(result.report.replayedPosition.z-position.z)<1e-8);
  assert.match(result.report.traceDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.report.clientReportedTouchFormulaConsistent,true);
  assert.equal(result.report.independentReplayVerified,false);
  assert.equal(result.report.actualDeviceProvenanceVerified,false);
});
test('two cumulative gesture snapshots advance continuously',async()=>{
  const f=await opened();
  const {snapshots,position}=await makeGesture(f.ticket,{gestures:[
    {pointerId:7,time:20,clientX:100,clientY:400,moves:[{dx:20,dy:8,dt:16}]},
    {pointerId:9,time:50,clientX:70,clientY:300,moves:[{dx:-15,dy:2,dt:16},{dx:5,dy:0,dt:10}]},
  ]});
  const first=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  const second=await f.service.ingestSnapshot(args(f,first.state,snapshots[1]));
  assert.equal(first.report.cumulativeEventsVerified,3);
  assert.equal(second.report.cumulativeEventsVerified,7);
  assert.equal(second.report.acceptedPointerMoves,3);
  assert.equal(second.report.snapshotsAccepted,2);
  assert.ok(Math.abs(second.report.replayedPosition.x-position.x)<1e-8);
  assert.equal(f.writes,0);
});
test('same cumulative event stream gives same digest in one vs two snapshots',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket,{gestures:[
    {pointerId:7,time:20,clientX:100,clientY:400,moves:[{dx:20,dy:8,dt:16}]},
    {pointerId:7,time:60,clientX:70,clientY:300,moves:[{dx:-15,dy:2,dt:16}]},
  ]});
  const a=await f.service.ingestSnapshot(args(f,f.state,snapshots[1]));
  const b1=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  const b2=await f.service.ingestSnapshot(args(f,b1.state,snapshots[1]));
  assert.equal(a.report.traceDigest,b2.report.traceDigest);
  assert.deepEqual(a.report.replayedPosition,b2.report.replayedPosition);
  assert.equal(a.report.cumulativeEventsVerified,b2.report.cumulativeEventsVerified);
});
test('identical snapshot retry is idempotent and does not advance state',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket);
  const first=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  const again=await f.service.ingestSnapshot(args(f,first.state,snapshots[0]));
  assert.equal(again.duplicate,true);
  assert.strictEqual(again.state,first.state);
  assert.equal(again.report.traceDigest,first.report.traceDigest);
});
test('changed previously accepted event cannot be accepted as a continuation',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket,{gestures:[
    {pointerId:7,time:20,clientX:100,clientY:400,moves:[{dx:4,dy:2,dt:10}]},
    {pointerId:7,time:60,clientX:100,clientY:400,moves:[{dx:4,dy:2,dt:10}]},
  ]});
  const first=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  const forged=structuredClone(snapshots[1]);
  forged.events[0].atMs=19;
  await assert.rejects(f.service.ingestSnapshot(args(f,first.state,forged)),
    err('C15_DUNGEON_V2B3_HISTORY_CHANGED'));
});
test('fewer cumulative events than already accepted are rejected',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket,{gestures:[
    {pointerId:7,time:20,clientX:100,clientY:400,moves:[{dx:4,dy:2,dt:10}]},
    {pointerId:7,time:60,clientX:100,clientY:400,moves:[{dx:4,dy:2,dt:10}]},
  ]});
  const full=await f.service.ingestSnapshot(args(f,f.state,snapshots[1]));
  await assert.rejects(f.service.ingestSnapshot(args(f,full.state,snapshots[0])),
    err('C15_DUNGEON_V2B3_SNAPSHOT_INVALID'));
});
test('initial pointer down at a teleport location is refused despite valid per-gesture math',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket,{startPosition:{x:2,z:12.5}});
  await assert.rejects(f.service.ingestSnapshot(args(f,f.state,snapshots[0])),
    err('C15_DUNGEON_V2B3_POSITION_JUMP'));
});
test('unreported keyboard or teleport movement between gestures is refused',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket,{gestures:[
    {pointerId:7,time:20,clientX:100,clientY:400,moves:[{dx:4,dy:2,dt:10}]},
    {pointerId:7,time:60,clientX:100,clientY:400,moves:[{dx:4,dy:2,dt:10}]},
  ]});
  const first=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  const altered=structuredClone(snapshots[1]);
  const index=snapshots[0].events.length;
  for (let i=index;i<altered.events.length;i++) altered.events[i].position.x+=0.1;
  await assert.rejects(f.service.ingestSnapshot(args(f,first.state,altered)),
    err('C15_DUNGEON_V2B3_POSITION_JUMP'));
});
test('forged victory/reward fields are rejected, and do not affect wallet',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket);
  const trace={...snapshots[0],victory:true,rewards:{coins:999999}};
  await assert.rejects(f.service.ingestSnapshot(args(f,f.state,trace)));
  assert.equal(f.writes,0);
});
test('truncated device trace cannot be laundered as complete movement',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket);
  await assert.rejects(f.service.ingestSnapshot(args(f,f.state,
    {...snapshots[0],truncated:true})));
});
test('expired ticket cannot continue the replay even after valid first snapshot',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket);
  const first=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  f.setTime(ISSUE+130000);
  await assert.rejects(f.service.ingestSnapshot(args(f,first.state,snapshots[0])),
    err('C15_DUNGEON_V2B2_TICKET_STALE'));
});
test('a new valid ticket for the same battle cannot switch an already opened replay',async()=>{
  const f=await opened();
  f.setTime(ISSUE+200);
  const another=await f.ticketService.issueTicket(f.actor);
  assert.notEqual(another.mac,f.ticket.mac);
  const {snapshots}=await makeGesture(f.ticket);
  await assert.rejects(f.service.ingestSnapshot({...args(f,f.state,snapshots[0]),
    ticket:another}),err('C15_DUNGEON_V2B3_SESSION_MISMATCH'));
});
test('reported device consistency never unlocks damage, room clear or Dungeon claims',async()=>{
  const f=await opened();
  const {snapshots}=await makeGesture(f.ticket);
  const result=await f.service.ingestSnapshot(args(f,f.state,snapshots[0]));
  const r=result.report;
  for(const k of ['actualDeviceProvenanceVerified','fullDeviceMovementVerified',
    'keyboardInputCovered','c15InputJournalEquivalent','combatHitsVerified',
    'enemyDeathsVerified','roomClearVerified','independentReplayVerified',
    'safeForSettlement','rewardSettlementEnabled','cloudRewards'])assert.equal(r[k],false);
  assert.throws(()=>f.service.claim({victory:true}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>f.service.finalize({}),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});
test('actual ShipInputController accepted pointer events replay to the same final pose',async()=>{
  const f=await opened();
  const input=await client('game/combat/ShipInputController.js');
  const {createDungeonDeviceTouchTraceV2B2}=await traceModule();
  const recorder=createDungeonDeviceTouchTraceV2B2({ticket:f.ticket});
  const listeners=new Map(),browserListeners=new Map();
  const on=(map,k,fn)=>map.set(k,[...(map.get(k)||[]),fn]);
  const off=(map,k,fn)=>map.set(k,(map.get(k)||[]).filter(x=>x!==fn));
  const browser={addEventListener:(k,fn)=>on(browserListeners,k,fn),
    removeEventListener:(k,fn)=>off(browserListeners,k,fn)};
  const canvas={style:{touchAction:''},tabIndex:-1,ownerDocument:{defaultView:browser},
    getAttribute:()=>null,removeAttribute:()=>{},focus:()=>{},
    setPointerCapture:()=>{},hasPointerCapture:()=>false,releasePointerCapture:()=>{},
    addEventListener:(k,fn)=>on(listeners,k,fn),
    removeEventListener:(k,fn)=>off(listeners,k,fn),
    getBoundingClientRect:()=>({width:400,height:800})};
  const fire=(kind,values)=>{
    for(const fn of listeners.get(kind)||[])fn({pointerId:7,pointerType:'touch',button:0,
      cancelable:false,clientX:100,clientY:400,timeStamp:20,...values});
  };
  const playerRoot={position:{x:0,z:12.5}};
  const scene={onBeforeRenderObservable:{add:()=>123,remove:()=>{}},
    onDisposeObservable:{addOnce:()=>{}}};
  const controller=input.createShipInputController({canvas,scene,playerRoot,
    tiltNode:null,engine:{getDeltaTime:()=>16.667},halfHeight:15,
    aspect:()=>.5,onPointerTrace:e=>recorder.capture(e)});
  fire('pointerdown',{});
  fire('pointermove',{clientX:125,clientY:420,timeStamp:35});
  fire('pointermove',{clientX:140,clientY:430,timeStamp:45});
  fire('pointerup',{clientX:140,clientY:430,timeStamp:55});
  controller.dispose();
  const result=await f.service.ingestSnapshot(args(f,f.state,recorder.snapshot()));
  assert.equal(result.report.acceptedPointerMoves,2);
  assert.ok(Math.abs(result.report.replayedPosition.x-playerRoot.position.x)<1e-8);
  assert.ok(Math.abs(result.report.replayedPosition.z-playerRoot.position.z)<1e-8);
  assert.equal(result.report.fullDeviceMovementVerified,false);
  assert.equal(f.writes,0);
});
