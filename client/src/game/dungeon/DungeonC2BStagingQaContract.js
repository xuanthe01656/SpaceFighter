/**
 * C15 V2C.14-C2B APK QA bootstrap. Client checks are UX fail-closed guards,
 * NOT HMAC verification, APK attestation, server admission or replay proof.
 * A genuine server must always verify the signed ticket independently.
 */
export const DUNGEON_C2B_STAGING_QA_VERSION = 'c15-dungeon-staging-qa-bootstrap-v2c14c2b';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HEX64=/^[a-f0-9]{64}$/;
const KEYS=['version','battleId','sessionDigest','actorDigest','dungeonId',
  'roomId','sceneSeed','spawnPlanDigest','contractDigest','serverLoadoutDigest',
  'issuedAtMs','expiresAtMs','qaOnly','stagingOnly','emulatorOnly',
  'serverAdmissionVerified','fixedTickAligned','apkReceiptVerified',
  'independentReplayVerified','safeForSettlement','rewardSettlementEnabled',
  'cloudRewards','mac'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;

export function isDungeonC2BOptIn({env={},qaRun,search='',requested=false}={}){
  if(env.VITE_SF_DUNGEON_C2B_APK_QA!=='true'||
     env.VITE_SF_DUNGEON_QA!=='true'||
     env.VITE_SF_DUNGEON_V2C11_APK_TRACE!=='true'||
     qaRun?.enabled!==true||qaRun?.dungeonId!=='dung_taurus'||
     qaRun.rewardMode!=='none'||qaRun.consumeEnergy!==false||
     qaRun.trustedWrites!==false||
     (qaRun.directRoomId!==null&&qaRun.directRoomId!==undefined&&
       qaRun.directRoomId!=='taurus_entry'))return false;
  const q=new URLSearchParams(String(search||'').replace(/^\?/,''));
  return requested===true || q.get('sfDungeonC2B')==='1';
}

export function validateDungeonC2BTicket({ticket,qaRun,nowMs=Date.now()}={}){
  if(!plain(ticket)||!exact(ticket,KEYS)||
    ticket.version!==DUNGEON_C2B_STAGING_QA_VERSION||
    !UUID.test(ticket.battleId||'')||!HEX64.test(ticket.mac||'')||
    !HEX64.test(ticket.sessionDigest||'')||!HEX64.test(ticket.actorDigest||'')||
    !HEX64.test(ticket.spawnPlanDigest||'')||!HEX64.test(ticket.contractDigest||'')||
    !HEX64.test(ticket.serverLoadoutDigest||'')||
    ticket.dungeonId!=='dung_taurus'||ticket.roomId!=='taurus_entry'||
    qaRun?.enabled!==true||qaRun.dungeonId!==ticket.dungeonId||
    (qaRun.directRoomId&&qaRun.directRoomId!==ticket.roomId)||
    !integer(ticket.sceneSeed,1,0xffffffff)||
    !integer(ticket.issuedAtMs,1,Number.MAX_SAFE_INTEGER)||
    !integer(ticket.expiresAtMs,ticket.issuedAtMs+1,ticket.issuedAtMs+90000)||
    !integer(nowMs,ticket.issuedAtMs,ticket.expiresAtMs-1)||
    ticket.qaOnly!==true||ticket.stagingOnly!==true||ticket.emulatorOnly!==false||
    ticket.serverAdmissionVerified!==false||ticket.fixedTickAligned!==false||
    ticket.apkReceiptVerified!==false||ticket.independentReplayVerified!==false||
    ticket.safeForSettlement!==false||ticket.rewardSettlementEnabled!==false||
    ticket.cloudRewards!==false)
    throw new TypeError('C2B_UNTRUSTED_OR_STALE_QA_BOOTSTRAP');
  return Object.freeze({...ticket});
}

export function isDungeonC2BSeedAllowed({env,qaRun,ticket,nowMs}={}){
  if(env?.VITE_SF_DUNGEON_C2B_APK_QA!=='true'||
     env?.VITE_SF_DUNGEON_QA!=='true'||
     env?.VITE_SF_DUNGEON_V2C11_APK_TRACE!=='true')return false;
  try{validateDungeonC2BTicket({ticket,qaRun,nowMs});return true;}
  catch(_error){return false;}
}
