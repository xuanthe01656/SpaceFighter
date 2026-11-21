'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {VERSION,parseC15DungeonSameRunPreflightV2C14C2AConfig,
  createC15DungeonSameRunPreflightV2C14C2A}=require('../lib/c15DungeonSameRunPreflightV2C14C2A.cjs');
const UID='qa-c2a-approved-user';
const SID='e40bebfd-3f3c-4a3e-8895-542ce9e4c519';
const RID='dungeon_c2a_emulator_request_001';
const BID='f61fc764-851c-4b4c-82f9-8264f3e8a019';
const PROJECT='demo-spacefighter-dungeon-c2a';
const NOW=Date.UTC(2026,10,21,3,30,0);
const env={
  GAME_C15_DUNGEON_V1_ENABLED:'true',
  GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V1_ALLOW_UIDS:UID,
  GAME_C15_DUNGEON_V2A_ENABLED:'true',
  GAME_C15_DUNGEON_V2A_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B1_ENABLED:'true',
  GAME_C15_DUNGEON_V2B1_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2B2_ENABLED:'true',
  GAME_C15_DUNGEON_V2B2_QA_APPROVED:'true',
  GAME_C15_DUNGEON_V2C14C2A_ENABLED:'true',
  GAME_C15_DUNGEON_V2C14C2A_QA_APPROVED:'true',
  GOOGLE_CLOUD_PROJECT:PROJECT,GCLOUD_PROJECT:PROJECT,FIREBASE_PROJECT_ID:PROJECT,
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:38081',
};
const actor={uid:UID,sessionId:SID,requestId:RID};
const err=code=>e=>e?.code===code;
function fixture(){
  const profile={sessionId:SID,campaignData:{profileId:'qa_profile_c2a',
    loadout:{pilot:'pilot_1',aircraft:'ship_1',mainGun:'owned_gun',wingman:'',armor:'',drone:''},
    ownedPilots:{pilot_1:{level:1}},ownedAircrafts:{ship_1:{level:3}},
    items:{owned_gun:{baseId:'gun_laser',type:'mainGun',level:1,rarity:1}}}};
  const ticket={version:'c15-dungeon-seed-touch-ticket-v2b2',
    battleId:BID,sessionId:SID,requestId:RID,dungeonId:'dung_taurus',
    roomId:'taurus_entry',profileId:'qa_profile_c2a',sceneSeed:3060395586,
    spawnPlanDigest:'a'.repeat(64),contractDigest:'b'.repeat(64),
    issuedAtMs:NOW-1,expiresAtMs:NOW+90000,qaOnly:true,
    emulatorOnly:true,safeForSettlement:false,rewardSettlementEnabled:false,
    cloudRewards:false,mac:'c'.repeat(64)};
  let t=NOW,reads=0,writes=0,upstreamCalls=0;
  const db={app:{options:{projectId:PROJECT}},collection:name=>({doc:id=>({
    get:async()=>{reads++;if(name!=='users'||id!==UID)throw Error('WRONG_DB_PATH');
      return {exists:true,data:()=>structuredClone(profile)};},
    set:async()=>{writes++;throw Error('FORBIDDEN_WRITE');},
    update:async()=>{writes++;throw Error('FORBIDDEN_WRITE');}
  })})};
  const ticketService={enabled:true,emulatorOnly:true,productionEnabled:false,
    rewardSettlementEnabled:false,
    issueTicket:async(a)=>{upstreamCalls++;if(JSON.stringify(a)!==JSON.stringify(actor))
      throw Error('UPSTREAM_ACTOR_REJECTED');return structuredClone(ticket);},
    verifyTicket:async(tk,a)=>{upstreamCalls++;
      if(JSON.stringify(a)!==JSON.stringify(actor)||
        JSON.stringify(tk)!==JSON.stringify(ticket))
        throw Object.assign(Error('UPSTREAM_TICKET_REJECTED'),{code:'UPSTREAM_REJECTED'});
      return {serverAdmissionVerified:true,serverSceneSeedBound:true,
        battleId:tk.battleId,sceneSeed:tk.sceneSeed,spawnPlanDigest:tk.spawnPlanDigest,
        safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false};}
  };
  return {db,ticketService,ticket,profile,env:{...env},actor:{...actor},
    make:args=>createC15DungeonSameRunPreflightV2C14C2A({
      env:{...env},db,ticketService,now:()=>t,signingKey:Buffer.alloc(32,49),...args}),
    now:v=>{t=v;},get reads(){return reads;},get writes(){return writes;},
    get upstreamCalls(){return upstreamCalls;}};
}

test('C2A OFF by default; no accidental production enable',async()=>{
  assert.equal(parseC15DungeonSameRunPreflightV2C14C2AConfig({}),null);
  const svc=await createC15DungeonSameRunPreflightV2C14C2A();
  assert.equal(svc.enabled,false);assert.equal(svc.productionEnabled,false);
  assert.throws(()=>svc.issue(actor),err('C15_DUNGEON_V2C14C2A_DISABLED'));
  assert.throws(()=>svc.claim(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('C2A requires explicit operator approval',()=>{
  const e={...env,GAME_C15_DUNGEON_V2C14C2A_QA_APPROVED:'false'};
  assert.throws(()=>parseC15DungeonSameRunPreflightV2C14C2AConfig(e),/approval/);
});
test('C2A cannot bypass V2B2 demo service gates',()=>{
  const e={...env,GAME_C15_DUNGEON_V2B2_ENABLED:'false'};
  assert.throws(()=>parseC15DungeonSameRunPreflightV2C14C2AConfig(e));
});
test('C2A rejects production/non-emulator project',()=>{
  assert.throws(()=>parseC15DungeonSameRunPreflightV2C14C2AConfig({
    ...env,FIRESTORE_EMULATOR_HOST:''}));
  assert.throws(()=>parseC15DungeonSameRunPreflightV2C14C2AConfig({
    ...env,FIREBASE_PROJECT_ID:'prod-project',GCLOUD_PROJECT:'prod-project',
    GOOGLE_CLOUD_PROJECT:'prod-project'}));
});
test('C2A rejects dependency that is not emulator-only',async()=>{
  const f=fixture();f.ticketService.emulatorOnly=false;
  await assert.rejects(f.make(),/approved emulator/);
});
test('C2A rejects too-short HMAC material',async()=>{
  const f=fixture();await assert.rejects(f.make({signingKey:Buffer.alloc(16)}),/HMAC/);
});
test('C2A issues signed preflight only after trusted upstream verification and DB READ',async()=>{
  const f=fixture();const svc=await f.make();const {ticket,preflight}=await svc.issue(f.actor);
  assert.equal(ticket.sceneSeed,3060395586);
  assert.equal(preflight.version,VERSION);assert.equal(preflight.sceneSeed,ticket.sceneSeed);
  assert.equal(preflight.battleId,ticket.battleId);assert.equal(preflight.qaOnly,true);
  assert.match(preflight.serverLoadoutDigest,/^[a-f0-9]{64}$/);
  assert.match(preflight.mac,/^[a-f0-9]{64}$/);
  assert.equal(preflight.apkReceiptVerified,false);
  assert.equal(preflight.fixedTickAligned,false);
  assert.equal(preflight.fullReplayVerified,false);
  assert.equal(preflight.safeForSettlement,false);
  assert.equal(f.reads,1);assert.equal(f.writes,0);assert.equal(f.upstreamCalls,2);
});
test('C2A verifies MAC + live V2B2 admission + unchanged server loadout',async()=>{
  const f=fixture(),svc=await f.make();const {ticket,preflight}=await svc.issue(f.actor);
  const proof=await svc.verify({ticket,preflight,...f.actor});
  assert.equal(proof.serverAdmissionVerified,true);
  assert.equal(proof.serverSelectedLoadoutDigestMatches,true);
  assert.equal(proof.actualApkServerParity,'NOT_VERIFIED');
  assert.equal(proof.deviceInputAuthenticated,false);
  assert.equal(f.writes,0);
});
test('C2A cannot allow client to assert parity, receipts, rewards or extra fields',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  for(const [k,v] of [['apkReceiptVerified',true],['fixedTickAligned',true],
    ['fullReplayVerified',true],['rewardSettlementEnabled',true],
    ['cloudRewards',true],['safeForSettlement',true]]){
    await assert.rejects(svc.verify({...x,...f.actor,
      preflight:{...x.preflight,[k]:v}}),err('C15_DUNGEON_C2A_PREFLIGHT_INVALID'));
  }
  await assert.rejects(svc.verify({...x,...f.actor,
    preflight:{...x.preflight,claimedHp:9999}}),err('C15_DUNGEON_C2A_PREFLIGHT_INVALID'));
});
test('C2A MAC tampering fails closed even when client changes only seed',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  await assert.rejects(svc.verify({...x,...f.actor,
    preflight:{...x.preflight,sceneSeed:3734842694}}),err('C15_DUNGEON_C2A_PREFLIGHT_TAMPERED'));
});
test('C2A rejects changed actor (session, request, uid)',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  for(const a of [{...f.actor,sessionId:'other'},
    {...f.actor,requestId:'other'}, {...f.actor,uid:'other'}]){
    await assert.rejects(svc.verify({...x,...a}));
  }
});
test('C2A rejects changed ticket even with valid preflight',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  await assert.rejects(svc.verify({...x,...f.actor,
    ticket:{...x.ticket,sceneSeed:3734842694}}),err('C15_DUNGEON_C2A_ACTOR_TICKET_MISMATCH'));
});
test('C2A rejects server-read loadout drift',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  f.profile.campaignData.ownedAircrafts.ship_1.level=4;
  await assert.rejects(svc.verify({...x,...f.actor}),err('C15_DUNGEON_C2A_LOADOUT_DRIFT'));
});
test('C2A rejects server session/profile change',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  f.profile.sessionId='changed';
  await assert.rejects(svc.verify({...x,...f.actor}),err('C15_DUNGEON_C2A_PROFILE_MISMATCH'));
});
test('C2A rejects missing items / unowned or invalid main gun',async()=>{
  const f=fixture(),svc=await f.make();
  delete f.profile.campaignData.items.owned_gun;
  await assert.rejects(svc.issue(f.actor),err('C15_DUNGEON_C2A_LOADOUT_INCOMPLETE'));
});
test('C2A rejects expired ticket/preflight',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  f.now(NOW+91000);
  await assert.rejects(svc.verify({...x,...f.actor}),err('C15_DUNGEON_C2A_PREFLIGHT_EXPIRED'));
});
test('C2A fails closed on unreviewed future dungeons instead of faking generic support',async()=>{
  const f=fixture(),svc=await f.make();f.ticket.dungeonId='dung_nereus';
  await assert.rejects(svc.issue(f.actor),err('C15_DUNGEON_C2A_UNSUPPORTED_DUNGEON'));
});
test('C2A cannot accept ticket verification with missing authority flags',async()=>{
  const f=fixture(),old=f.ticketService.verifyTicket;
  f.ticketService.verifyTicket=async(...args)=>({...await old(...args),serverAdmissionVerified:false});
  const svc=await f.make();
  await assert.rejects(svc.issue(f.actor),err('C15_DUNGEON_C2A_TICKET_UNTRUSTED'));
});
test('C2A must never mount API, mutate DB, authorize settlement or claim full parity',async()=>{
  const f=fixture(),svc=await f.make();const x=await svc.issue(f.actor);
  const r=await svc.verify({...x,...f.actor});
  assert.equal(Object.hasOwn(svc,'app'),false);
  assert.equal(Object.hasOwn(svc,'route'),false);
  assert.equal(svc.productionEnabled,false);
  assert.equal(svc.apkSessionVerified,false);
  assert.equal(svc.fullTickJournalVerified,false);
  assert.equal(svc.independentReplayVerified,false);
  assert.equal(r.actualApkServerParity,'NOT_VERIFIED');
  assert.throws(()=>svc.claim(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>svc.finalize(),err('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});

test('C2A real V2B.2 signed service + emulator DB admission integration (no writes)',async()=>{
  const path=require('node:path');
  const {pathToFileURL}=require('node:url');
  const {VERSION:V1_VERSION,createDungeonContractV1}=
    require('../lib/c15DungeonFoundationV1.cjs');
  const {createC15DungeonSeedTouchTicketV2B2}=
    require('../lib/c15DungeonSeedTouchTicketV2B2.cjs');
  const root=path.resolve(__dirname,'../../client/src');
  const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [listing,content]=await Promise.all([
    load('constants.js'),load('game/dungeon/DungeonContentCatalogV393.js')]);
  const contract=createDungeonContractV1('dung_taurus',{
    listings:listing.DUNGEON_CONFIG,content:content.DUNGEON_CONTENT_CATALOG_V393,
    hazards:content.DUNGEON_HAZARD_PROFILES_V393,
    objectives:content.DUNGEON_OBJECTIVE_PROFILES_V393});
  const f=fixture();
  const admission={version:V1_VERSION,uid:UID,sessionId:SID,
    battleId:BID,dungeonId:'dung_taurus',requestId:RID,
    requestDigest:'f'.repeat(64),contractDigest:contract.contractDigest,
    energyCharged:contract.energyCost,admittedAtMs:NOW-1000,
    expiresAtMs:NOW+20*60*1000,status:'admitted-emulator',qaOnly:true,
    source:'firestore-emulator',independentReplayVerified:false,
    rewardSettlementEnabled:false,cloudRewards:false};
  const active={version:V1_VERSION,uid:UID,sessionId:SID,
    battleId:BID,requestId:RID,status:'admitted-emulator',
    expiresAtMs:admission.expiresAtMs,qaOnly:true,
    rewardSettlementEnabled:false};
  const docs=new Map([
    [`users/${UID}`,f.profile],
    [`users/${UID}/c15DungeonV1Admissions/${RID}`,admission],
    [`users/${UID}/c15DungeonV1Sessions/current`,active],
  ]);
  let reads=0,writes=0;
  function ref(key){return {
    get:async()=>{reads++;const p=docs.get(key);return {
      exists:p!==undefined,data:()=>p===undefined?undefined:structuredClone(p)};},
    collection:name=>({doc:id=>ref(`${key}/${name}/${id}`)}),
    set:async()=>{writes++;throw Error('C2A_WRITE_FORBIDDEN');},
    update:async()=>{writes++;throw Error('C2A_WRITE_FORBIDDEN');},
  };}
  const db={app:{options:{projectId:PROJECT}},
    collection:name=>({doc:id=>ref(`${name}/${id}`)})};
  const t=()=>NOW;
  const signedTicketService=await createC15DungeonSeedTouchTicketV2B2({
    env,db,now:t,signingKey:Buffer.alloc(32,63)});
  assert.equal(signedTicketService.enabled,true);
  const c2a=await createC15DungeonSameRunPreflightV2C14C2A({
    env,db,ticketService:signedTicketService,now:t,
    signingKey:Buffer.alloc(32,41)});
  const {ticket,preflight}=await c2a.issue(actor);
  const verification=await c2a.verify({ticket,preflight,...actor});
  assert.equal(verification.serverAdmissionVerified,true);
  assert.equal(verification.serverSelectedLoadoutDigestMatches,true);
  assert.equal(verification.actualApkServerParity,'NOT_VERIFIED');
  assert.equal(verification.fixedTickAligned,false);
  assert.equal(verification.safeForSettlement,false);
  assert.ok(reads>=9);
  assert.equal(writes,0);
});
