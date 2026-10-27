'use strict';
/**
 * C10: SERVER-ONLY production outcome issuance and signed receipt verification.
 *
 * NOT a production replay implementation. This has NO routes, NO startup wiring,
 * NO secrets from HTTP/Firestore, and is disabled unless ALL review gates are
 * explicitly approved AND a separately reviewed production replay function is
 * injected. The existing QA genesis, `lab-clear`, receipts and audit records
 * MUST NOT be used as `trustedProductionReplay` input/authority.
 *
 * Once a genuinely independent production replay exists, this module pins its
 * outcome to a server-owned HMAC-authenticated, create-only Firestore record,
 * then supplies a transaction-bound verifier to the C7-B2B settlement ledger.
 */
const {createHash,createHmac,timingSafeEqual}=require('node:crypto');
const {GameError}=require('./economy.cjs');
const {assertAccountActive}=require('./accountDeletion.cjs');
const {createVerifiedSettlementC7B2B,PRODUCTION_OUTCOME_VERSION}
  =require('./verifiedSettlementC7B2BV8.cjs');

const VERSION='v8-c10-signed-production-outcome-v1';
const REPLAY_VERSION='v8-c10-independent-production-replay-v1';
const SOURCE='server-owned-production-journal-v1';
const MAX_AGE_MS=10*60*1000;
const MAX_TICKS=4500;
const STAGE_ENEMIES=70;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const KEY_ID=/^[A-Za-z0-9_-]{6,48}$/;
const REPORT_KEYS=['version','source','uid','sessionId','battleId','mode',
  'planetId','stage','locationId','rulesVersion','catalogVersion','phase',
  'verifiedAtMs','verifiedTicks','snapshotHash','inputDigest',
  'enemiesExpected','enemiesKilled','enemiesEscaped','enemyContacts','finalHp',
  'serverOriginAuthenticated','independentReplayMatched','clientVictoryIgnored',
  'qaOnly','nonEconomic'];
const GRANT_KEYS=['version','uid','sessionId','battleId','mode','planetId','stage',
  'locationId','rulesVersion','catalogVersion','phase','verifiedAtMs',
  'verifiedTicks','snapshotHash','inputDigest','productionReceiptDigest',
  'qaOnly','nonEconomic','safeForCloudBattle','settlementEnabled'];
const RECORD_KEYS=['version','uid','sessionId','battleId','keyId','issuedAtMs',
  'report','grant','mac'];
const deny=(code,message,status=409)=>{throw new GameError(code,message,status);};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
  &&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v,keys)=>record(v)&&Object.keys(v).length===keys.length
  &&keys.every(k=>Object.hasOwn(v,k));
const validUid=v=>typeof v==='string'&&v.length>0&&v.length<=128
  &&!/[/\x00-\x1f\x7f]/.test(v);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const canonical=v=>Array.isArray(v)?v.map(canonical):record(v)
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=(tag,data)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(data)])).digest('hex');
const hmac=(key,recordWithoutMac)=>createHmac('sha256',key)
  .update('spacefighter:c10:production-outcome:v1\n')
  .update(JSON.stringify(canonical(recordWithoutMac))).digest('hex');
function actor(uid,sid,bid,allowed){
  if(!validUid(uid)||!UUID.test(sid||'')||!UUID.test(bid||''))
    deny('C10_ACTOR_INVALID','Valid server identity and session required',401);
  if(!allowed.has(uid))deny('C10_NOT_ALLOWED','Closed production test UID allowlist required',403);
}
function checkReport(r,uid,sid,bid,at){
  if(!exact(r,REPORT_KEYS)||r.version!==REPLAY_VERSION||r.source!==SOURCE
    ||r.uid!==uid||r.sessionId!==sid||r.battleId!==bid
    ||r.mode!=='campaign'||r.planetId!==1||r.stage!==1
    ||r.locationId!=='alpha_stage_1'||r.rulesVersion!=='combat-v1.0.0'
    ||r.catalogVersion!=='product-v1.0.0'
    ||!['verified-clear','verified-defeat'].includes(r.phase)
    ||!integer(r.verifiedAtMs,at-MAX_AGE_MS,at)
    ||!integer(r.verifiedTicks,1,MAX_TICKS)
    ||!HEX.test(r.snapshotHash||'')||!HEX.test(r.inputDigest||'')
    ||r.enemiesExpected!==STAGE_ENEMIES
    ||!integer(r.enemiesKilled,0,STAGE_ENEMIES)
    ||!integer(r.enemiesEscaped,0,STAGE_ENEMIES)
    ||!integer(r.enemyContacts,0,STAGE_ENEMIES)
    ||r.enemiesKilled+r.enemiesEscaped+r.enemyContacts>STAGE_ENEMIES
    ||!integer(r.finalHp,0,1000000)
    ||r.serverOriginAuthenticated!==true||r.independentReplayMatched!==true
    ||r.clientVictoryIgnored!==true||r.qaOnly!==false||r.nonEconomic!==false)
    deny('C10_PRODUCTION_REPLAY_REQUIRED',
      'Only an independent server-owned production replay can be issued');
  // A QA `lab-clear` can count contacts/culls. A payable clear must NOT.
  if(r.phase==='verified-clear'&&(r.enemiesKilled!==STAGE_ENEMIES
    ||r.enemiesEscaped!==0||r.enemyContacts!==0||r.finalHp===0))
    deny('C10_UNSAFE_CLEAR','All 70 enemies must be killed without contact or escape');
  if(r.phase==='verified-defeat'&&r.finalHp!==0)
    deny('C10_DEFEAT_INVALID','Defeat requires a server-confirmed zero HP');
}
function deriveGrant(report,uid,sid,bid,keyId,issuedAtMs){
  const receiptDigest=hash('sf-c10-production-receipt',{uid,sid,bid,keyId,
    issuedAtMs,report});
  return {version:PRODUCTION_OUTCOME_VERSION,uid,sessionId:sid,battleId:bid,
    mode:'campaign',planetId:1,stage:1,locationId:'alpha_stage_1',
    rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0',
    phase:report.phase,verifiedAtMs:report.verifiedAtMs,
    verifiedTicks:report.verifiedTicks,snapshotHash:report.snapshotHash,
    inputDigest:report.inputDigest,productionReceiptDigest:receiptDigest,
    qaOnly:false,nonEconomic:false,safeForCloudBattle:true,settlementEnabled:true};
}
function checkRecord(saved,uid,sid,bid,keys,now){
  if(!exact(saved,RECORD_KEYS)||saved.version!==VERSION||saved.uid!==uid
    ||saved.sessionId!==sid||saved.battleId!==bid
    ||!KEY_ID.test(saved.keyId||'')||!HEX.test(saved.mac||'')
    ||!integer(saved.issuedAtMs,1,now)||!exact(saved.grant,GRANT_KEYS))
    deny('C10_RECEIPT_INVALID','Malformed server production receipt');
  const key=keys.get(saved.keyId);
  if(!Buffer.isBuffer(key)||key.length<32||key.length>128)
    deny('C10_RECEIPT_KEY','Receipt signing key unavailable');
  const {mac,...without}=saved;
  const expected=Buffer.from(hmac(key,without),'hex');
  const actual=Buffer.from(mac,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))
    deny('C10_RECEIPT_MAC','Production receipt authentication failed');
  checkReport(saved.report,uid,sid,bid,now);
  const derived=deriveGrant(saved.report,uid,sid,bid,
    saved.keyId,saved.issuedAtMs);
  if(JSON.stringify(canonical(saved.grant))!==JSON.stringify(canonical(derived)))
    deny('C10_RECEIPT_BINDING','Receipt grant does not match replay');
  return structuredClone(derived);
}
/**
 * Must never be instantiated from an HTTP request or client-controlled config.
 * reviewGates are EXTERNAL release approvals, not cryptographic evidence.
 * Even with gates true, safety depends on independent trustedProductionReplay.
 */
function createProductionOutcomeAuthorityC10({db,enabled=false,allowedUids=[],
  signingKeyId,signingKey,verificationKeys,
  trustedProductionReplay,reviewGates,now=Date.now}={}){
  if(enabled!==true){
    const disabled=()=>deny('C10_AUTHORITY_DISABLED',
      'Production outcome issuer and settlement authority are disabled',423);
    return Object.freeze({enabled:false,issue:disabled,readForSettlement:disabled});
  }
  if(!db||typeof db.runTransaction!=='function'
    ||!Array.isArray(allowedUids)||allowedUids.length<1||allowedUids.length>10
    ||allowedUids.some(u=>!validUid(u))||new Set(allowedUids).size!==allowedUids.length
    ||!KEY_ID.test(signingKeyId||'')||!Buffer.isBuffer(signingKey)
    ||signingKey.length<32||signingKey.length>128
    ||!(verificationKeys instanceof Map)
    ||!Buffer.isBuffer(verificationKeys.get(signingKeyId))
    ||!signingKey.equals(verificationKeys.get(signingKeyId))
    ||typeof trustedProductionReplay!=='function'||typeof now!=='function'
    ||!exact(reviewGates,['nativeTouchParity','productionEncounter','firestoreRulesIam','productionReplay'])
    ||Object.values(reviewGates).some(v=>v!==true))
    throw new Error('C10 requires independent production replay, 4 approvals, UID allowlist and a dedicated signing key');
  for(const [id,k] of verificationKeys){
    if(!KEY_ID.test(id)||!Buffer.isBuffer(k)||k.length<32||k.length>128)
      throw new Error('C10 verification key ring malformed');
  }
  const allowed=new Set(allowedUids);
  const userRef=uid=>db.collection('users').doc(uid);
  const deletionRef=uid=>db.collection('accountDeletionJobs').doc(uid);
  const receiptRef=(uid,bid)=>userRef(uid).collection('productionBattleOutcomes').doc(bid);
  const clock=()=>{const n=now();if(!integer(n,1,Number.MAX_SAFE_INTEGER))
    throw new Error('C10 server clock invalid');return n;};
  async function issue(uid,sid,bid){
    actor(uid,sid,bid,allowed);
    const at=clock();
    return db.runTransaction(async t=>{
      const [profile,job,old]=await Promise.all([t.get(userRef(uid)),
        t.get(deletionRef(uid)),t.get(receiptRef(uid,bid))]);
      if(!profile.exists)deny('PROFILE_NOT_FOUND','Profile not initialized',404);
      const data=profile.data();assertAccountActive(data);
      if(job.exists)deny('ACCOUNT_DELETION_PENDING','Account deletion pending',423);
      if(data.sessionId!==sid)deny('SESSION_EXPIRED','Session changed',401);
      if(old.exists){
        const grant=checkRecord(old.data(),uid,sid,bid,verificationKeys,at);
        return Object.freeze({duplicate:true,battleId:bid,phase:grant.phase,
          receiptDigest:grant.productionReceiptDigest});
      }
      // THIS dependency must be a separately reviewed production replay from
      // a production-only journal. It is NOT C7 QA audit or C7 QA verifier.
      const report=await trustedProductionReplay({transaction:t,
        uid,sessionId:sid,battleId:bid});
      checkReport(report,uid,sid,bid,at);
      const grant=deriveGrant(report,uid,sid,bid,signingKeyId,at);
      const fields={version:VERSION,uid,sessionId:sid,battleId:bid,
        keyId:signingKeyId,issuedAtMs:at,report:structuredClone(report),grant};
      const signed={...fields,mac:hmac(signingKey,fields)};
      // Immutable create-only proof. Profile, wallet and operations untouched.
      t.create(receiptRef(uid,bid),signed);
      return Object.freeze({duplicate:false,battleId:bid,phase:grant.phase,
        receiptDigest:grant.productionReceiptDigest});
    });
  }
  async function readForSettlement({transaction,uid,sessionId,battleId}){
    actor(uid,sessionId,battleId,allowed);
    if(!transaction||typeof transaction.get!=='function')
      deny('C10_TRANSACTION_REQUIRED','Settlement must read within its transaction');
    const at=clock();
    const stored=await transaction.get(receiptRef(uid,battleId));
    if(!stored.exists)deny('C10_RECEIPT_MISSING',
      'No server-issued production outcome exists',409);
    return checkRecord(stored.data(),uid,sessionId,battleId,verificationKeys,at);
  }
  return Object.freeze({enabled:true,issue,readForSettlement});
}
/**
 * Integration at the service layer only. No public route, env, or startup use.
 * If source production replay is not independently approved, leave OFF.
 */
function createC10SettlementBridge({db,authority,enabled=false,
  allowedUids=[],catalogModule,schemaModule,now=Date.now}={}){
  if(enabled===true&&(!authority||authority.enabled!==true
    ||typeof authority.readForSettlement!=='function'))
    throw new Error('C10 settlement bridge requires enabled signed production authority');
  return createVerifiedSettlementC7B2B({db,enabled,allowedUids,
    trustedProductionVerifier:authority?.readForSettlement,
    catalogModule,schemaModule,now});
}
module.exports=Object.freeze({VERSION,REPLAY_VERSION,SOURCE,STAGE_ENEMIES,
  createProductionOutcomeAuthorityC10,createC10SettlementBridge});
