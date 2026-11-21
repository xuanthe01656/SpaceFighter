'use strict';
/**
 * C15 V2C.14-C2B: read-only, staging-only, allowlisted QA bootstrap ticket.
 * This is NOT the emulator V2B.2 admission ticket. There is no admission,
 * fixed-tick verification, device attestation, replay or rewards authority.
 * Do not reuse this HMAC as a production battle admission credential.
 */
const {createHash,createHmac,timingSafeEqual,randomUUID} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {GameError} = require('./economy.cjs');
const {assertAccountActive} = require('./accountDeletion.cjs');
const {createDungeonContractV1} = require('./c15DungeonFoundationV1.cjs');
const VERSION='c15-dungeon-staging-qa-bootstrap-v2c14c2b';
const HEX64=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const UID=/^[A-Za-z0-9:_-]{6,128}$/;
const PROJECT=/^[a-z][a-z0-9-]{3,80}$/;
const SLOTS=['pilot','aircraft','mainGun','wingman','armor','drone'];
const EQUIPMENT=['mainGun','wingman','armor','drone'];
const TICKET_KEYS=['version','battleId','sessionDigest','actorDigest','dungeonId',
  'roomId','sceneSeed','spawnPlanDigest','contractDigest','serverLoadoutDigest',
  'issuedAtMs','expiresAtMs','qaOnly','stagingOnly','emulatorOnly',
  'serverAdmissionVerified','fixedTickAligned','apkReceiptVerified',
  'independentReplayVerified','safeForSettlement','rewardSettlementEnabled',
  'cloudRewards','mac'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const sha=(tag,x)=>createHash('sha256').update(JSON.stringify([tag,canonical(x)])).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const deny=(code,message,status=403)=>{throw new GameError(code,message,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'No verified same-session replay or reward settlement in C2B',423);

function parseC15DungeonStagingTicketV2C14C2BConfig(env={}){
  if(!env||typeof env!=='object'||Array.isArray(env))throw new TypeError('C2B environment invalid');
  if(env.GAME_C15_DUNGEON_C2B_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_C2B_APPROVED!=='true'||
    env.NODE_ENV!=='production'||env.K_SERVICE!=='spacefighter-api-staging'||
    env.FIRESTORE_EMULATOR_HOST)
    throw new TypeError('C2B must be explicitly approved on real staging only');
  const projectId=env.FIREBASE_PROJECT_ID;
  if(!PROJECT.test(projectId||'')||env.GAME_C15_DUNGEON_C2B_PROJECT_ID!==projectId||
    (env.GOOGLE_CLOUD_PROJECT&&env.GOOGLE_CLOUD_PROJECT!==projectId)||
    (env.GCLOUD_PROJECT&&env.GCLOUD_PROJECT!==projectId))
    throw new TypeError('C2B staging project binding invalid');
  const raw=env.GAME_C15_DUNGEON_C2B_ALLOW_UIDS;
  if(typeof raw!=='string'||!raw.length||raw.length>2048)
    throw new TypeError('C2B closed UID allowlist required');
  const allowedUids=raw.split(',').map(x=>x.trim());
  if(allowedUids.length>10||allowedUids.some(x=>!UID.test(x))||
    new Set(allowedUids).size!==allowedUids.length)
    throw new TypeError('C2B UID allowlist malformed');
  const signingKey=env.GAME_C15_DUNGEON_C2B_HMAC_KEY_HEX;
  if(typeof signingKey!=='string'||!HEX64.test(signingKey))
    throw new TypeError('C2B server-only HMAC key missing or invalid');
  return freeze({version:VERSION,projectId,allowedUids,stagingOnly:true,
    productionEnabled:false,rewardSettlementEnabled:false});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_C2B_DISABLED','C2B staging QA disabled',423);
  return freeze({enabled:false,stagingOnly:true,productionEnabled:false,
    serverAdmissionVerified:false,independentReplayVerified:false,
    rewardSettlementEnabled:false,issue:off,verify:off,claim:locked,finalize:locked});
}
function loadoutDigest(profile,catalog){
  const c=profile?.campaignData,l=c?.loadout;
  if(!plain(c)||typeof c.profileId!=='string'||!/^[A-Za-z0-9_.-]{1,128}$/.test(c.profileId)||
    !plain(l)||!exact(l,SLOTS)||SLOTS.some(s=>typeof l[s]!=='string')||
    !l.pilot||!l.aircraft||!l.mainGun||!plain(c.ownedPilots)||
    !plain(c.ownedAircrafts)||!plain(c.items)||
    !catalog.PILOTS.some(p=>p.id===l.pilot)||
    !catalog.AIRCRAFTS.some(p=>p.id===l.aircraft)||
    !plain(c.ownedPilots[l.pilot])||!plain(c.ownedAircrafts[l.aircraft])||
    !int(c.ownedAircrafts[l.aircraft].level,1,1000))
    deny('C15_DUNGEON_C2B_LOADOUT_INVALID','Server profile/loadout not approved',409);
  const equipped={};
  for(const slot of EQUIPMENT){
    const id=l[slot];
    if(!id){if(slot==='mainGun')deny('C15_DUNGEON_C2B_LOADOUT_INVALID','Missing main gun',409);
      equipped[slot]=null;continue;}
    const item=c.items[id];
    if(!plain(item)||item.type!==slot||!int(item.level,1,1000)||
      !int(item.rarity,1,5)||typeof item.baseId!=='string'||
      !Array.isArray(catalog.GEAR_CATALOG[slot])||
      !catalog.GEAR_CATALOG[slot].some(g=>g.id===item.baseId))
      deny('C15_DUNGEON_C2B_LOADOUT_INVALID','Server-owned gear/catalog invalid',409);
    equipped[slot]={itemId:id,baseId:item.baseId,type:slot,
      level:item.level,rarity:item.rarity};
  }
  return {profileId:c.profileId,digest:sha('sf-c15-c2b-server-selected-inventory',{
    profileId:c.profileId,loadout:l,pilotOwnership:c.ownedPilots[l.pilot],
    aircraftOwnership:c.ownedAircrafts[l.aircraft],equipped})};
}
async function realCatalog(){
  const root=path.resolve(__dirname,'../../client/src');
  const load=f=>import(pathToFileURL(path.join(root,f)).href);
  const [listing,content,encounter,seed]=await Promise.all([
    load('constants.js'),load('game/dungeon/DungeonContentCatalogV393.js'),
    load('game/dungeon/DungeonEncounterDirectorV38.js'),
    load('game/dungeon/DungeonSeedTouchContractV2B1.js')]);
  const contract=createDungeonContractV1('dung_taurus',{
    listings:listing.DUNGEON_CONFIG,content:content.DUNGEON_CONTENT_CATALOG_V393,
    hazards:content.DUNGEON_HAZARD_PROFILES_V393,
    objectives:content.DUNGEON_OBJECTIVE_PROFILES_V393});
  if(contract.rooms[0]?.id!=='taurus_entry'||!HEX64.test(contract.contractDigest||''))
    throw new TypeError('C2B reviewed Taurus contract mismatch');
  return {catalog:listing,contractDigest:contract.contractDigest,
    seed:seed.dungeonSceneStableSeedV2B1,
    plan:encounter.buildDungeonRoomSpawnPlanV38};
}
async function createC15DungeonStagingTicketV2C14C2B({env={},db,now=Date.now,
  newId=randomUUID,reviewedCatalog}={}){
  const config=parseC15DungeonStagingTicketV2C14C2BConfig(env);
  if(!config)return disabled();
  if(!db||typeof db.collection!=='function'||db.app?.options?.projectId!==config.projectId||
    typeof now!=='function'||typeof newId!=='function')
    throw new TypeError('C2B requires matching read-only staging Firestore');
  const catalog=reviewedCatalog||await realCatalog();
  if(!plain(catalog)||!plain(catalog.catalog)||
    !Array.isArray(catalog.catalog.PILOTS)||!Array.isArray(catalog.catalog.AIRCRAFTS)||
    !plain(catalog.catalog.GEAR_CATALOG)||!HEX64.test(catalog.contractDigest||'')||
    typeof catalog.seed!=='function'||typeof catalog.plan!=='function')
    throw new TypeError('C2B reviewed catalog dependencies invalid');
  const allowed=new Set(config.allowedUids);
  const secret=Buffer.from(env.GAME_C15_DUNGEON_C2B_HMAC_KEY_HEX,'hex');
  const mac=body=>createHmac('sha256',secret)
    .update(JSON.stringify([VERSION,canonical(body)])).digest('hex');
  const clock=()=>{const t=now();if(!int(t,1,Number.MAX_SAFE_INTEGER-90000))
    throw new TypeError('Trusted C2B clock invalid');return t;};
  const actor=(uid,sid)=>{
    if(!allowed.has(uid)||!UUID.test(sid||''))
      deny('C15_DUNGEON_C2B_ACTOR_DENIED','Approved Firebase actor and session required',403);
  };
  async function readServer(uid,sid){
    actor(uid,sid);
    const [u,deleted]=await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('accountDeletionJobs').doc(uid).get()]);
    if(!u?.exists||deleted?.exists)
      deny('C15_DUNGEON_C2B_PROFILE_UNAVAILABLE','Server profile unavailable',403);
    const profile=u.data();
    assertAccountActive(profile);
    if(!plain(profile)||profile.sessionId!==sid)
      deny('C15_DUNGEON_C2B_SESSION_CHANGED','Server session does not match',401);
    return loadoutDigest(profile,catalog.catalog);
  }
  const planDigest=(sceneSeed)=>{
    const plan=catalog.plan({dungeonId:'dung_taurus',roomIndex:0,seed:sceneSeed});
    if(plan?.room?.id!=='taurus_entry'||!Array.isArray(plan.entries)||
      !plan.entries.length||plan.entries.length>40)
      throw new TypeError('C2B Taurus spawn plan changed');
    return sha('sf-c15-dungeon-v2b2-spawns',plan.entries.map(e=>({
      id:e.id,roleId:e.roleId,laneNorm:e.laneNorm,
      spawnAtMs:e.spawnAtMs,threatCost:e.threatCost})));
  };
  const sessionDigest=sid=>sha('sf-c15-c2b-session',sid);
  const actorDigest=(uid,sid)=>sha('sf-c15-c2b-actor',{uid,sessionId:sid});
  async function issue({uid,sessionId,body}={}){
    if(!exact(body,['dungeonId','roomId'])||
      body.dungeonId!=='dung_taurus'||body.roomId!=='taurus_entry')
      deny('C15_DUNGEON_C2B_DUNGEON_UNREVIEWED','Only Taurus entry reviewed',400);
    const {profileId,digest}=await readServer(uid,sessionId);
    const battleId=newId();if(!UUID.test(battleId))throw new TypeError('C2B server battle ID invalid');
    const sceneSeed=catalog.seed('dung_taurus',profileId,battleId);
    if(!int(sceneSeed,1,0xffffffff))throw new TypeError('C2B seed invalid');
    const at=clock();
    const ticket={version:VERSION,battleId,sessionDigest:sessionDigest(sessionId),
      actorDigest:actorDigest(uid,sessionId),dungeonId:'dung_taurus',roomId:'taurus_entry',
      sceneSeed,spawnPlanDigest:planDigest(sceneSeed),contractDigest:catalog.contractDigest,
      serverLoadoutDigest:digest,issuedAtMs:at,expiresAtMs:at+90000,
      qaOnly:true,stagingOnly:true,emulatorOnly:false,
      serverAdmissionVerified:false,fixedTickAligned:false,apkReceiptVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false};
    return freeze({ticket:{...ticket,mac:mac(ticket)},
      sameSessionParity:'NOT_VERIFIED',rewardSettlementEnabled:false});
  }
  async function verify({uid,sessionId,ticket}={}){
    actor(uid,sessionId);
    if(!exact(ticket,TICKET_KEYS)||!UUID.test(ticket.battleId||'')||
      !HEX64.test(ticket.mac||'')||!HEX64.test(ticket.sessionDigest||'')||
      !HEX64.test(ticket.actorDigest||'')||!HEX64.test(ticket.spawnPlanDigest||'')||
      !HEX64.test(ticket.contractDigest||'')||!HEX64.test(ticket.serverLoadoutDigest||'')||
      ticket.version!==VERSION||ticket.dungeonId!=='dung_taurus'||
      ticket.roomId!=='taurus_entry'||!int(ticket.sceneSeed,1,0xffffffff)||
      !int(ticket.issuedAtMs,1,Number.MAX_SAFE_INTEGER)||
      !int(ticket.expiresAtMs,ticket.issuedAtMs+1,ticket.issuedAtMs+90000)||
      ticket.qaOnly!==true||ticket.stagingOnly!==true||ticket.emulatorOnly!==false||
      ticket.serverAdmissionVerified!==false||ticket.fixedTickAligned!==false||
      ticket.apkReceiptVerified!==false||ticket.independentReplayVerified!==false||
      ticket.safeForSettlement!==false||ticket.rewardSettlementEnabled!==false||
      ticket.cloudRewards!==false)
      deny('C15_DUNGEON_C2B_TICKET_INVALID','Unreviewed QA ticket',403);
    const {mac:signature,...body}=ticket;
    const expected=mac(body);
    if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))
      deny('C15_DUNGEON_C2B_TICKET_TAMPERED','QA ticket MAC mismatch',403);
    const at=clock();
    if(ticket.issuedAtMs>at||ticket.expiresAtMs<=at||
      ticket.sessionDigest!==sessionDigest(sessionId)||
      ticket.actorDigest!==actorDigest(uid,sessionId))
      deny('C15_DUNGEON_C2B_TICKET_STALE','QA actor, session or expiry changed',403);
    const {profileId,digest}=await readServer(uid,sessionId);
    const seed=catalog.seed('dung_taurus',profileId,ticket.battleId);
    if(seed!==ticket.sceneSeed||catalog.contractDigest!==ticket.contractDigest||
      planDigest(seed)!==ticket.spawnPlanDigest||digest!==ticket.serverLoadoutDigest)
      deny('C15_DUNGEON_C2B_LOADOUT_OR_SEED_DRIFT','Server contract has drifted',409);
    return freeze({version:VERSION,battleId:ticket.battleId,
      serverQaTicketVerified:true,serverSelectedLoadoutDigestMatches:true,
      apkReceiptVerified:false,fixedTickAligned:false,
      independentReplayVerified:false,trueApkServerParity:'NOT_VERIFIED',
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  }
  return freeze({enabled:true,stagingOnly:true,productionEnabled:false,
    serverAdmissionVerified:false,independentReplayVerified:false,
    rewardSettlementEnabled:false,issue,verify,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,parseC15DungeonStagingTicketV2C14C2BConfig,
  createC15DungeonStagingTicketV2C14C2B});
