'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {VERSION,parseC15DungeonStagingTicketV2C14C2BConfig,
  createC15DungeonStagingTicketV2C14C2B}=require('../lib/c15DungeonStagingTicketV2C14C2B.cjs');
const UID='qa_c2b_test_user01';
const SID='e40bebfd-3f3c-4a3e-8895-542ce9e4c519';
const BID='f61fc764-851c-4b4c-82f9-8264f3e8a019';
const NOW=Date.UTC(2026,10,21,3,30,0);
const PROJECT='distributed-inn-482605-c6';
const env={NODE_ENV:'production',K_SERVICE:'spacefighter-api-staging',
  FIREBASE_PROJECT_ID:PROJECT,GAME_C15_DUNGEON_C2B_PROJECT_ID:PROJECT,
  GAME_C15_DUNGEON_C2B_ENABLED:'true',GAME_C15_DUNGEON_C2B_APPROVED:'true',
  GAME_C15_DUNGEON_C2B_ALLOW_UIDS:UID,
  GAME_C15_DUNGEON_C2B_HMAC_KEY_HEX:'32'.repeat(32)};
const catalog={catalog:{PILOTS:[{id:'pilot_1'}],AIRCRAFTS:[{id:'ship_1'}],
  GEAR_CATALOG:{mainGun:[{id:'gun_laser'}],wingman:[],armor:[],drone:[]}},
  contractDigest:'a'.repeat(64),seed:()=>3060395586,
  plan:()=>({room:{id:'taurus_entry'},entries:[{id:'e',roleId:'raider',laneNorm:0,
    spawnAtMs:900,threatCost:1}]})};
const denied=code=>error=>error?.code===code;
function fixture(){
  let t=NOW,reads=0,writes=0,jobExists=false;
  const profile={sessionId:SID,campaignData:{profileId:'qa_profile_c2b',
    loadout:{pilot:'pilot_1',aircraft:'ship_1',mainGun:'gun_1',wingman:'',armor:'',drone:''},
    ownedPilots:{pilot_1:{level:1}},ownedAircrafts:{ship_1:{level:3}},
    items:{gun_1:{baseId:'gun_laser',type:'mainGun',rarity:1,level:1}}}};
  const db={app:{options:{projectId:PROJECT}},collection:collection=>({doc:id=>({
    get:async()=>{reads++;if(id!==UID)throw Error('WRONG_ACTOR');
      return collection==='users'?{exists:true,data:()=>structuredClone(profile)}:
      {exists:jobExists};},
    set:async()=>{writes++;throw Error('FORBIDDEN_WRITE');},
    update:async()=>{writes++;throw Error('FORBIDDEN_WRITE');},
    create:async()=>{writes++;throw Error('FORBIDDEN_WRITE');}
  })})};
  const make=opts=>createC15DungeonStagingTicketV2C14C2B({
    env:{...env},db,now:()=>t,newId:()=>BID,reviewedCatalog:catalog,...opts});
  const issue=s=>s.issue({uid:UID,sessionId:SID,
    body:{dungeonId:'dung_taurus',roomId:'taurus_entry'}});
  return {db,profile,make,issue,now:v=>{t=v;},setJob:v=>{jobExists=v;},
    get reads(){return reads;},get writes(){return writes;}};
}
test('C2B is OFF by default and cannot finalize or settle',async()=>{
  assert.equal(parseC15DungeonStagingTicketV2C14C2BConfig({}),null);
  const svc=await createC15DungeonStagingTicketV2C14C2B();
  assert.equal(svc.enabled,false);
  assert.throws(()=>svc.issue(),denied('C15_DUNGEON_C2B_DISABLED'));
  assert.throws(()=>svc.finalize(),denied('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
});
test('C2B requires two independent explicit approvals',()=>{
  assert.throws(()=>parseC15DungeonStagingTicketV2C14C2BConfig({...env,
    GAME_C15_DUNGEON_C2B_APPROVED:'false'}),/approved/);
});
test('C2B refuses production service, local emulator or development runtime',()=>{
  for(const override of [{K_SERVICE:'spacefighter-api'},
    {FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},{NODE_ENV:'development'}]){
    assert.throws(()=>parseC15DungeonStagingTicketV2C14C2BConfig({...env,...override}));
  }
});
test('C2B requires exact staging project binding',()=>{
  for(const override of [{GAME_C15_DUNGEON_C2B_PROJECT_ID:'other'},
    {GCLOUD_PROJECT:'other'},{GOOGLE_CLOUD_PROJECT:'other'}])
    assert.throws(()=>parseC15DungeonStagingTicketV2C14C2BConfig({...env,...override}));
});
test('C2B refuses wildcard/duplicated/missing UID allowlists',()=>{
  for(const allow of ['','*',`${UID},${UID}`,'a'])
    assert.throws(()=>parseC15DungeonStagingTicketV2C14C2BConfig({...env,
      GAME_C15_DUNGEON_C2B_ALLOW_UIDS:allow}));
});
test('C2B demands a server-only 32 byte HMAC key',()=>{
  for(const key of ['','key','f'.repeat(63),'Z'.repeat(64)])
    assert.throws(()=>parseC15DungeonStagingTicketV2C14C2BConfig({...env,
      GAME_C15_DUNGEON_C2B_HMAC_KEY_HEX:key}));
});
test('C2B fails to start when DB project mismatches',async()=>{
  const f=fixture();f.db.app.options.projectId='other';
  await assert.rejects(f.make(),/Firestore/);
});
test('C2B issues HMAC bootstrap only after two Firestore reads and local source review',async()=>{
  const f=fixture(),s=await f.make(),x=await f.issue(s);
  assert.equal(x.ticket.version,VERSION);assert.equal(x.ticket.sceneSeed,3060395586);
  assert.equal(x.ticket.qaOnly,true);assert.equal(x.ticket.stagingOnly,true);
  assert.equal(x.ticket.serverAdmissionVerified,false);
  assert.equal(x.ticket.fixedTickAligned,false);assert.equal(x.ticket.apkReceiptVerified,false);
  assert.equal(x.ticket.independentReplayVerified,false);
  assert.equal(x.ticket.rewardSettlementEnabled,false);
  assert.equal(x.sameSessionParity,'NOT_VERIFIED');
  assert.equal(x.ticket.expiresAtMs-x.ticket.issuedAtMs,90000);
  assert.match(x.ticket.mac,/^[a-f0-9]{64}$/);
  assert.match(x.ticket.serverLoadoutDigest,/^[a-f0-9]{64}$/);
  assert.equal(f.reads,2);assert.equal(f.writes,0);
  assert.equal(Object.hasOwn(x.ticket,'uid'),false);
});
test('C2B authentic server MAC / actor / current profile verification',async()=>{
  const f=fixture(),s=await f.make(),x=await f.issue(s);
  const proof=await s.verify({uid:UID,sessionId:SID,ticket:x.ticket});
  assert.equal(proof.serverQaTicketVerified,true);
  assert.equal(proof.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(proof.apkReceiptVerified,false);
  assert.equal(f.writes,0);
});
test('C2B rejects forged actor and altered session',async()=>{
  const f=fixture(),s=await f.make(),x=await f.issue(s);
  await assert.rejects(s.verify({uid:'unauthorized_qa_uid',sessionId:SID,ticket:x.ticket}),
    denied('C15_DUNGEON_C2B_ACTOR_DENIED'));
  await assert.rejects(s.verify({uid:UID,
    sessionId:'11e8d4ad-9b4c-44f8-80e5-1d317d0d337f',ticket:x.ticket}),
    denied('C15_DUNGEON_C2B_TICKET_STALE'));
});
test('C2B refuses modified seed, MAC, room, flags or injected reward claims',async()=>{
  const f=fixture(),s=await f.make(),x=await f.issue(s);
  for(const patch of [{sceneSeed:1},{mac:'0'.repeat(64)},{dungeonId:'dung_nereus'},
    {rewardSettlementEnabled:true},{serverAdmissionVerified:true},{victory:true}])
    await assert.rejects(s.verify({uid:UID,sessionId:SID,
      ticket:{...x.ticket,...patch}}));
});
test('C2B rejects expired ticket and future issuedAt',async()=>{
  const f=fixture(),s=await f.make(),x=await f.issue(s);
  f.now(NOW+90001);
  await assert.rejects(s.verify({uid:UID,sessionId:SID,ticket:x.ticket}),
    denied('C15_DUNGEON_C2B_TICKET_STALE'));
});
test('C2B refuses unreviewed dungeon / client-supplied battle metadata',async()=>{
  const f=fixture(),s=await f.make();
  for(const body of [{dungeonId:'dung_abaddon',roomId:'abaddon_entry'},
    {dungeonId:'dung_taurus',roomId:'taurus_entry',sceneSeed:12},
    {dungeonId:'dung_taurus',roomId:'taurus_entry',serverLoadout:{}}])
    await assert.rejects(s.issue({uid:UID,sessionId:SID,body}),
      denied('C15_DUNGEON_C2B_DUNGEON_UNREVIEWED'));
});
test('C2B refuses DB session switch and account deletion tombstones',async()=>{
  const f=fixture(),s=await f.make();
  f.profile.sessionId='changed';
  await assert.rejects(f.issue(s),denied('C15_DUNGEON_C2B_SESSION_CHANGED'));
  f.profile.sessionId=SID;f.setJob(true);
  await assert.rejects(f.issue(s),denied('C15_DUNGEON_C2B_PROFILE_UNAVAILABLE'));
  f.setJob(false);f.profile.accountDeletion={status:'pending'};
  await assert.rejects(f.issue(s),denied('ACCOUNT_DELETION_PENDING'));
});
test('C2B detects selected gear drift and invalid inventory',async()=>{
  const f=fixture(),s=await f.make(),x=await f.issue(s);
  f.profile.campaignData.ownedAircrafts.ship_1.level=7;
  await assert.rejects(s.verify({uid:UID,sessionId:SID,ticket:x.ticket}),
    denied('C15_DUNGEON_C2B_LOADOUT_OR_SEED_DRIFT'));
  delete f.profile.campaignData.items.gun_1;
  await assert.rejects(f.issue(s),denied('C15_DUNGEON_C2B_LOADOUT_INVALID'));
});
test('C2B fails closed on changed spawn plan / contract',async()=>{
  const f=fixture(),s=await f.make(),x=await f.issue(s);
  catalog.contractDigest='b'.repeat(64);
  await assert.rejects(s.verify({uid:UID,sessionId:SID,ticket:x.ticket}),
    denied('C15_DUNGEON_C2B_LOADOUT_OR_SEED_DRIFT'));
  catalog.contractDigest='a'.repeat(64);
});
test('C2B never has persistence methods or settlement bypass',async()=>{
  const f=fixture(),s=await f.make();
  assert.equal(s.enabled,true);assert.equal(s.stagingOnly,true);
  assert.equal(s.productionEnabled,false);
  assert.equal(s.serverAdmissionVerified,false);
  assert.throws(()=>s.claim(),denied('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.throws(()=>s.finalize(),denied('C15_DUNGEON_SERVER_REPLAY_REQUIRED'));
  assert.equal(f.writes,0);
});
test('C2B production-path reviewed Taurus catalog imports and signs exact server seed',async()=>{
  const SID='e40bebfd-3f3c-4a3e-8895-542ce9e4c519';
  const profile={sessionId:SID,campaignData:{profileId:'qa_profile_c2b',
    loadout:{pilot:'pilot_alpha',aircraft:'ship_xwing',mainGun:'owned_gun',
      wingman:'',armor:'',drone:''},ownedPilots:{pilot_alpha:{level:1}},
    ownedAircrafts:{ship_xwing:{level:1}},
    items:{owned_gun:{type:'mainGun',baseId:'gun_laser',level:1,rarity:1}}}};
  let writes=0;
  const db={app:{options:{projectId:PROJECT}},collection:coll=>({doc:id=>({
    get:async()=>coll==='users'?{exists:true,data:()=>structuredClone(profile)}:{exists:false},
    set:()=>{writes++;throw Error('NO_WRITE');},
  })})};
  const svc=await createC15DungeonStagingTicketV2C14C2B({env:{...env},db,
    now:()=>NOW,newId:()=>BID});
  const x=await svc.issue({uid:UID,sessionId:SID,
    body:{dungeonId:'dung_taurus',roomId:'taurus_entry'}});
  const proof=await svc.verify({uid:UID,sessionId:SID,ticket:x.ticket});
  assert.equal(proof.serverQaTicketVerified,true);
  assert.equal(proof.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(Number.isSafeInteger(x.ticket.sceneSeed),true);
  assert.ok(x.ticket.sceneSeed>0 && x.ticket.sceneSeed<=0xffffffff);
  assert.equal(writes,0);
});
test('C2B signed server response passes exact APK client envelope but is still unpaired',async()=>{
  const {pathToFileURL}=require('node:url');
  const path=require('node:path');
  const client=await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonC2BStagingQaContract.js')).href);
  const f=fixture(),svc=await f.make(),x=await f.issue(svc);
  const qa={enabled:true,dungeonId:'dung_taurus',directRoomId:null};
  const accepted=client.validateDungeonC2BTicket({ticket:x.ticket,qaRun:qa,nowMs:NOW});
  assert.equal(accepted.mac,x.ticket.mac);
  assert.equal(accepted.sceneSeed,x.ticket.sceneSeed);
  assert.equal(accepted.serverAdmissionVerified,false);
  assert.equal(x.sameSessionParity,'NOT_VERIFIED');
});
