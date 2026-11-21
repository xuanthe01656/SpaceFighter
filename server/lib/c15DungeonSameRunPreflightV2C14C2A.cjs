'use strict';
/**
 * C15 V2C.14-C2A: server-only, emulator-only QA preflight bundle.
 * Proves that a V2B.2 signed admission ticket and a fresh server-read loadout
 * originated from the SAME emulator actor/session BEFORE starting a test run.
 *
 * This module does not mount an HTTP route, create a runtime fixed-tick journal,
 * authenticate an APK, replay a live Dungeon, or authorize economic settlement.
 * Its preflight is NOT evidence that the phone ever received/used the ticket.
 */
const {createHash,createHmac,timingSafeEqual,randomBytes} = require('node:crypto');
const {GameError} = require('./economy.cjs');
const {parseC15DungeonSeedTouchTicketV2B2Config} = require('./c15DungeonSeedTouchTicketV2B2.cjs');
const VERSION='c15-dungeon-same-run-preflight-v2c14c2a';
const HEX64=/^[a-f0-9]{64}$/;
const REF=['version','battleId','dungeonId','roomId','sceneSeed','spawnPlanDigest',
  'contractDigest','ticketDigest','actorDigest','serverLoadoutDigest','issuedAtMs',
  'expiresAtMs','qaOnly','emulatorOnly','apkReceiptVerified','fixedTickAligned',
  'deviceInputAuthenticated','fullReplayVerified','safeForSettlement',
  'rewardSettlementEnabled','cloudRewards','mac'];
const ALLOWED_SLOTS=['pilot','aircraft','mainGun','wingman','armor','drone'];
const EQUIPMENT=['mainGun','wingman','armor','drone'];
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&
  keys.every(k=>Object.hasOwn(x,k));
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const sha=(tag,x)=>createHash('sha256').update(JSON.stringify([tag,canonical(x)])).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const deny=(code,message,status=403)=>{throw new GameError(code,message,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Independent same-run replay and settlement are not implemented',423);

function parseC15DungeonSameRunPreflightV2C14C2AConfig(env={}){
  if(!record(env))throw new TypeError('C2A QA environment must be plain');
  if(env.GAME_C15_DUNGEON_V2C14C2A_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C14C2A_QA_APPROVED!=='true')
    throw new TypeError('C2A requires explicit operator QA approval');
  const upstream=parseC15DungeonSeedTouchTicketV2B2Config(env);
  if(!upstream||upstream.emulatorOnly!==true||
    typeof upstream.projectId!=='string'||!upstream.projectId.startsWith('demo-')||
    typeof env.FIRESTORE_EMULATOR_HOST!=='string'||!env.FIRESTORE_EMULATOR_HOST)
    throw new TypeError('C2A must use approved demo Firestore Emulator V2B.2 only');
  return freeze({projectId:upstream.projectId,allowedUids:[...upstream.allowUids],
    emulatorOnly:true,version:VERSION});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C14C2A_DISABLED','C2A preflight is disabled',423);
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    apkSessionVerified:false,fullTickJournalVerified:false,independentReplayVerified:false,
    safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
    issue:off,verify:off,claim:locked,finalize:locked});
}
function getReadOnlyLoadoutDigest(profile,ticket,actor){
  if(!record(profile)||profile.sessionId!==actor.sessionId||
    !record(profile.campaignData)||profile.campaignData.profileId!==ticket.profileId)
    deny('C15_DUNGEON_C2A_PROFILE_MISMATCH','QA profile / session drift',409);
  const c=profile.campaignData,l=c.loadout;
  if(!record(l)||!record(c.ownedPilots)||!record(c.ownedAircrafts)||
    !record(c.items)||!ALLOWED_SLOTS.every(k=>typeof l[k]==='string')||
    Object.keys(l).some(k=>!ALLOWED_SLOTS.includes(k))||
    !l.pilot||!l.aircraft||!l.mainGun||
    !record(c.ownedPilots[l.pilot])||!record(c.ownedAircrafts[l.aircraft])||
    !integer(c.ownedAircrafts[l.aircraft].level,1,1000))
    deny('C15_DUNGEON_C2A_LOADOUT_INCOMPLETE',
      'Server-read loadout ownership missing; no client substitute',409);
  const equipped={};
  for(const key of EQUIPMENT){
    const id=l[key];
    if(!id){if(key==='mainGun')deny('C15_DUNGEON_C2A_LOADOUT_INCOMPLETE',
      'Main gun must be equipped',409);equipped[key]=null;continue;}
    const item=c.items[id];
    if(!record(item)||item.type!==key||typeof item.baseId!=='string'||!item.baseId||
      !integer(item.rarity,1,5)||!integer(item.level,1,1000))
      deny('C15_DUNGEON_C2A_LOADOUT_INCOMPLETE',
        'Server-read equipment ownership invalid',409);
    equipped[key]={itemId:id,baseId:item.baseId,type:item.type,
      level:item.level,rarity:item.rarity};
  }
  // A fingerprint of selected server-owned inventory, NOT derived combat stats.
  // V2C.9 must independently validate catalog, stat math and supported subset.
  const snapshot={profileId:c.profileId,loadout:structuredClone(l),
    pilotOwnership:structuredClone(c.ownedPilots[l.pilot]),
    aircraftOwnership:structuredClone(c.ownedAircrafts[l.aircraft]),equipped};
  return sha('sf-c15-v2c14c2a-server-selected-loadout',snapshot);
}
function checkTicketShape(ticket){
  if(!record(ticket)||!HEX64.test(ticket.mac||'')||
    typeof ticket.battleId!=='string'||!ticket.battleId||
    ticket.version!=='c15-dungeon-seed-touch-ticket-v2b2'||
    ticket.qaOnly!==true||ticket.emulatorOnly!==true||
    ticket.safeForSettlement!==false||ticket.rewardSettlementEnabled!==false||
    ticket.cloudRewards!==false||!integer(ticket.sceneSeed,1,0xffffffff)||
    !HEX64.test(ticket.spawnPlanDigest||'')||!HEX64.test(ticket.contractDigest||'')||
    !integer(ticket.issuedAtMs,1,Number.MAX_SAFE_INTEGER)||
    !integer(ticket.expiresAtMs,ticket.issuedAtMs+1,Number.MAX_SAFE_INTEGER))
    deny('C15_DUNGEON_C2A_TICKET_UNTRUSTED','Valid V2B.2 ticket required');
}
function matchServiceProof(ticket,proof){
  if(!record(proof)||proof.serverAdmissionVerified!==true||
    proof.serverSceneSeedBound!==true||proof.battleId!==ticket.battleId||
    proof.sceneSeed!==ticket.sceneSeed||
    proof.spawnPlanDigest!==ticket.spawnPlanDigest||
    proof.safeForSettlement!==false||proof.rewardSettlementEnabled!==false||
    proof.cloudRewards!==false)
    deny('C15_DUNGEON_C2A_TICKET_UNTRUSTED',
      'V2B.2 authoritative service proof is insufficient');
}
async function createC15DungeonSameRunPreflightV2C14C2A({
  env={},db,ticketService,signingKey,now=Date.now
}={}){
  const cfg=parseC15DungeonSameRunPreflightV2C14C2AConfig(env);
  if(!cfg)return disabled();
  if(!db||typeof db.collection!=='function'||db.app?.options?.projectId!==cfg.projectId||
    !ticketService||ticketService.enabled!==true||
    ticketService.emulatorOnly!==true||ticketService.productionEnabled!==false||
    ticketService.rewardSettlementEnabled!==false||
    typeof ticketService.issueTicket!=='function'||
    typeof ticketService.verifyTicket!=='function'||typeof now!=='function')
    throw new TypeError('C2A requires approved emulator DB and V2B.2 service');
  const secret=signingKey===undefined?randomBytes(32):Buffer.from(signingKey);
  if(secret.length<32||secret.length>128)throw new TypeError('C2A HMAC secret length invalid');
  const mac=body=>createHmac('sha256',secret).update(JSON.stringify([VERSION,canonical(body)])).digest('hex');
  const actor=a=>{
    if(!record(a)||Object.keys(a).length!==3||
      typeof a.uid!=='string'||!cfg.allowedUids.includes(a.uid)||
      typeof a.sessionId!=='string'||!a.sessionId||
      typeof a.requestId!=='string'||!a.requestId)
      deny('C15_DUNGEON_C2A_ACTOR_INVALID','Allowlisted actor required',401);
    return {uid:a.uid,sessionId:a.sessionId,requestId:a.requestId};
  };
  const checkTime=()=>{
    const t=now();if(!integer(t,1,Number.MAX_SAFE_INTEGER))
      throw new TypeError('C2A trusted time invalid');return t;
  };
  const account=async(a,ticket)=>{
    const ref=db.collection('users').doc(a.uid);
    if(typeof ref.get!=='function')throw new TypeError('C2A read-only DB required');
    const snap=await ref.get();
    if(!snap?.exists)deny('C15_DUNGEON_C2A_PROFILE_MISSING','Server profile missing');
    return getReadOnlyLoadoutDigest(snap.data(),ticket,a);
  };
  async function issue(a0={}){
    const a=actor(a0);
    const ticket=await ticketService.issueTicket(a);
    checkTicketShape(ticket);
    if(ticket.dungeonId!=='dung_taurus'||ticket.roomId!=='taurus_entry'||
      ticket.sessionId!==a.sessionId||ticket.requestId!==a.requestId)
      deny('C15_DUNGEON_C2A_UNSUPPORTED_DUNGEON',
        'Current upstream V2B.2 only reviews Taurus entry',409);
    const proof=await ticketService.verifyTicket(ticket,a);
    matchServiceProof(ticket,proof);
    const t=checkTime();
    if(ticket.expiresAtMs<=t||ticket.issuedAtMs>t)
      deny('C15_DUNGEON_C2A_TICKET_EXPIRED','Ticket expired',409);
    const loadoutDigest=await account(a,ticket);
    const body={version:VERSION,battleId:ticket.battleId,
      dungeonId:ticket.dungeonId,roomId:ticket.roomId,
      sceneSeed:ticket.sceneSeed,spawnPlanDigest:ticket.spawnPlanDigest,
      contractDigest:ticket.contractDigest,
      ticketDigest:sha('sf-c15-v2c14c2a-v2b2-ticket',ticket),
      actorDigest:sha('sf-c15-v2c14c2a-actor',a),
      serverLoadoutDigest:loadoutDigest,
      issuedAtMs:t,expiresAtMs:ticket.expiresAtMs,
      qaOnly:true,emulatorOnly:true,apkReceiptVerified:false,
      fixedTickAligned:false,deviceInputAuthenticated:false,
      fullReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false};
    return freeze({ticket:structuredClone(ticket),preflight:{...body,mac:mac(body)}});
  }
  async function verify({ticket,preflight,...a0}={}){
    const a=actor(a0);
    checkTicketShape(ticket);
    if(!exact(preflight,REF)||preflight.version!==VERSION||
      !HEX64.test(preflight.mac||'')||!HEX64.test(preflight.ticketDigest||'')||
      !HEX64.test(preflight.actorDigest||'')||
      !HEX64.test(preflight.serverLoadoutDigest||'')||
      preflight.qaOnly!==true||preflight.emulatorOnly!==true||
      preflight.apkReceiptVerified!==false||preflight.fixedTickAligned!==false||
      preflight.deviceInputAuthenticated!==false||preflight.fullReplayVerified!==false||
      preflight.safeForSettlement!==false||preflight.rewardSettlementEnabled!==false||
      preflight.cloudRewards!==false)
      deny('C15_DUNGEON_C2A_PREFLIGHT_INVALID','Unsafe/unreviewed preflight',403);
    const {mac:signature,...body}=preflight;
    const expected=mac(body);
    if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))
      deny('C15_DUNGEON_C2A_PREFLIGHT_TAMPERED','Preflight MAC mismatch');
    if(preflight.battleId!==ticket.battleId||
      preflight.dungeonId!==ticket.dungeonId||preflight.roomId!==ticket.roomId||
      preflight.sceneSeed!==ticket.sceneSeed||
      preflight.spawnPlanDigest!==ticket.spawnPlanDigest||
      preflight.contractDigest!==ticket.contractDigest||
      preflight.ticketDigest!==sha('sf-c15-v2c14c2a-v2b2-ticket',ticket)||
      preflight.actorDigest!==sha('sf-c15-v2c14c2a-actor',a))
      deny('C15_DUNGEON_C2A_ACTOR_TICKET_MISMATCH',
        'QA admission and actor not from same session',403);
    const t=checkTime();
    if(!integer(preflight.issuedAtMs,t-120000,t)||
      preflight.expiresAtMs!==ticket.expiresAtMs||preflight.expiresAtMs<=t)
      deny('C15_DUNGEON_C2A_PREFLIGHT_EXPIRED','Preflight expired or clock invalid',409);
    const proof=await ticketService.verifyTicket(ticket,a);
    matchServiceProof(ticket,proof);
    const actual=await account(a,ticket);
    if(actual!==preflight.serverLoadoutDigest)
      deny('C15_DUNGEON_C2A_LOADOUT_DRIFT',
        'Server profile changed since preflight',409);
    return freeze({version:VERSION,battleId:ticket.battleId,
      sceneSeed:ticket.sceneSeed,serverAdmissionVerified:true,
      serverSelectedLoadoutDigestMatches:true,
      readyForApkIntegrationReview:true,
      apkReceiptVerified:false,fixedTickAligned:false,
      deviceInputAuthenticated:false,fullReplayVerified:false,
      actualApkServerParity:'NOT_VERIFIED',
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    apkSessionVerified:false,fullTickJournalVerified:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    issue,verify,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,parseC15DungeonSameRunPreflightV2C14C2AConfig,
  createC15DungeonSameRunPreflightV2C14C2A});
