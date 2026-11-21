'use strict';
/**
 * C2I: explicit opt-in staging READ ONLY endpoint for binding a C2H ballistic
 * QA report to the existing Firebase-authenticated, C2B-HMAC-ticketed C2E
 * causal audit. Never writes Firestore or grants rewards. No full combat parity.
 * Receipt digests identify matching reports, NOT session proof against replay.
 */
const {createHash}=require('node:crypto');
const {GameError}=require('./economy.cjs');
const {auditDungeonC2HBallisticReplayV1}=require('./c15DungeonC2HBallisticReplayV1.cjs');
const VERSION='c15-dungeon-c2hi-same-session-ballistic-qa-v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HEX64=/^[0-9a-f]{64}$/;
const deny=(code,message,status=423)=>{throw new GameError(code,message,status);};
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))freeze(v);Object.freeze(x);
}return x;};
const fingerprint=parts=>createHash('sha256').update(JSON.stringify([VERSION,parts])).digest('hex');
function createC15DungeonC2HISameSessionQaV1({env={},c2eService,
  ballisticAudit=auditDungeonC2HBallisticReplayV1}={}){
  const enabled=env.GAME_C15_DUNGEON_C2HI_ENABLED==='true'&&
    env.GAME_C15_DUNGEON_C2HI_QA_APPROVED==='true'&&
    c2eService?.enabled===true&&c2eService?.stagingOnly===true&&
    c2eService?.rewardSettlementEnabled===false&&
    typeof c2eService.audit==='function'&&typeof ballisticAudit==='function';
  async function audit({uid,sessionId,ticket,record}={}){
    if(!enabled)deny('C15_DUNGEON_C2HI_DISABLED','C2HI QA disabled');
    if(typeof uid!=='string'||!uid||uid.length>128||!UUID.test(sessionId||'')||
      !ticket||!UUID.test(ticket.battleId||'')||!HEX64.test(ticket.mac||'')||
      !HEX64.test(ticket.serverLoadoutDigest||'')||
      !HEX64.test(ticket.spawnPlanDigest||'')||
      ticket.qaOnly!==true||ticket.stagingOnly!==true||
      ticket.safeForSettlement!==false||ticket.rewardSettlementEnabled!==false||
      !record||record.seedSource!=='server-ticket-local-unverified'||
      record.battleId!==ticket.battleId||record.sceneSeed!==ticket.sceneSeed||
      record.dungeonId!==ticket.dungeonId||record.roomId!==ticket.roomId||
      record.grid?.battleId!==ticket.battleId||record.grid?.sceneSeed!==ticket.sceneSeed)
      deny('C15_DUNGEON_C2HI_SESSION_UNPAIRED','C2HI record/ticket mismatch',409);
    // Stage 1: independent observed shot projection and range/HP QA checks.
    const projected=await ballisticAudit(record);
    if(projected?.ballisticSubsetPass!==true||
      projected?.battleId!==record.battleId||
      projected?.trueApkServerParity!=='NOT_VERIFIED'||
      projected?.safeForSettlement!==false||
      projected?.rewardSettlementEnabled!==false)
      deny('C15_DUNGEON_C2HI_BALLISTICS_UNTRUSTED',
        'Observed ballistic subset insufficient',409);
    // Stage 2: C2E calls C2D which verifies server-issued C2B HMAC and
    // current Firebase UID/session/profile/loadout from Firestore (read-only).
    const bound=await c2eService.audit({uid,sessionId,ticket,record});
    if(bound?.serverQaTicketVerified!==true||
      bound?.serverSelectedLoadoutVerified!==true||
      bound?.battleId!==record.battleId||
      bound?.sceneSeed!==record.sceneSeed||
      bound?.encounterCatalogDigest!==ticket.spawnPlanDigest||
      bound?.causalSubsetPass!==true||
      bound?.rewardSettlementEnabled!==false||
      bound?.safeForSettlement!==false||
      bound?.fullCombatReplayVerified!==false||
      bound?.trueApkServerParity!=='NOT_VERIFIED')
      deny('C15_DUNGEON_C2HI_C2B_C2E_BINDING_FAILED',
        'Ticket/session/input audit did not establish reviewed QA subset',403);
    const receiptDigest=fingerprint({uid,sessionId,battleId:record.battleId,
      ticketMac:ticket.mac,serverLoadoutDigest:ticket.serverLoadoutDigest,
      spawnPlanDigest:ticket.spawnPlanDigest,gridChecksum:record.grid.checksum,
      witnessChecksum:record.checksum,projectionDigest:projected.projectionDigest});
    return freeze({...projected,version:VERSION,
      status:'C2B_SIGNED_SAME_SESSION_AND_C2H_BALLISTIC_SUBSET_QA_ONLY',
      reportDigest:receiptDigest,
      serverQaTicketVerified:true,serverSelectedLoadoutVerified:true,
      sameSessionQaBindingVerified:true,
      replayProtectionAcrossCloudRunInstances:false,
      independentlySimulatedEnemyAi:false,independentlyComputedDamage:false,
      fixedTickCombatSimulationVerified:false,fullCombatReplayVerified:false,
      trueApkServerParity:'NOT_VERIFIED',safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  }
  const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
    'C2HI never settles a reward or verifies a full combat outcome');
  return freeze({enabled,stagingOnly:true,productionEnabled:false,
    independentCombatReplayVerified:false,rewardSettlementEnabled:false,
    audit,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,createC15DungeonC2HISameSessionQaV1});
