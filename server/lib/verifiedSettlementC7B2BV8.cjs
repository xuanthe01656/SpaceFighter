'use strict';
/**
 * C7-B2B: DISCONNECTED production settlement transaction foundation.
 *
 * There is NO HTTP route, no runtime instantiation and no feature-flag wiring.
 * It is OFF by default. Its trusted production verifier dependency does not
 * exist in C7-B2A; C7-B2A QA audit/receipt and `lab-clear` MUST NEVER be passed
 * here or upgraded to a payable result.
 *
 * `trustedProductionVerifier` is a SERVER-ONLY, future dependency. It must read
 * an independently authenticated production outcome inside the transaction;
 * accepting a result supplied by client, QA Firestore collections, or merely
 * a SHA-256 digest is a critical security vulnerability. This module alone
 * does NOT establish that this prerequisite exists.
 */
const {createHash}=require('node:crypto');
const {GameError,updateMissions,utcDay}=require('./economy.cjs');
const {assertAccountActive}=require('./accountDeletion.cjs');

const VERSION='v8-c7b2b-settlement-foundation-v1';
const PRODUCTION_OUTCOME_VERSION='v8-production-verified-outcome-v1'; // reserved: no issuer exists yet
const REWARD_POLICY_VERSION='v8-c7b2b-alpha1-conservative-v1';
const MAX_VALUE=1000000000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST=/^[A-Za-z0-9_-]{12,80}$/;
const HEX=/^[0-9a-f]{64}$/;
const deny=(code,msg,status=409)=>{throw new GameError(code,msg,status);};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
  &&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v,keys)=>record(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const asNonnegative=v=>Number.isSafeInteger(v)&&v>=0&&v<=MAX_VALUE;
const canonical=v=>Array.isArray(v)?v.map(canonical):record(v)
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=(tag,v)=>createHash('sha256').update(JSON.stringify([tag,canonical(v)])).digest('hex');
const clone=v=>structuredClone(v);
const GRANT_KEYS=['version','uid','sessionId','battleId','mode','planetId','stage',
  'locationId','rulesVersion','catalogVersion','phase','verifiedAtMs',
  'verifiedTicks','snapshotHash','inputDigest','productionReceiptDigest',
  'qaOnly','nonEconomic','safeForCloudBattle','settlementEnabled'];
const LEDGER_KEYS=['version','uid','sessionId','battleId','requestId','requestDigest',
  'productionReceiptDigest','outcomePhase','rewardPolicyVersion','coins','experience',
  'stars','createdAtMs','ledgerDigest'];

function validateActor(uid,sid,battleId,requestId,allowlist){
  if(typeof uid!=='string'||uid.length<1||uid.length>128||/[\x00-\x1f\x7f/]/.test(uid))
    deny('UNAUTHORIZED','Invalid Firebase identity',401);
  if(!allowlist.has(uid))deny('SETTLEMENT_NOT_ALLOWED','UID not approved for this closed settlement test',403);
  if(typeof sid!=='string'||!UUID.test(sid))deny('SESSION_EXPIRED','Valid session required',401);
  if(typeof battleId!=='string'||!UUID.test(battleId)
    ||typeof requestId!=='string'||!REQUEST.test(requestId))
    deny('SETTLEMENT_INPUT_INVALID','Invalid battleId/requestId',400);
}
function validateProductionOutcome(grant,{uid,sid,battleId,now}){
  // No current QA object can pass: all C7-B2A records have QA flags and
  // non-economic `lab-clear`/`lab-defeat`, not verified production phases.
  if(!exact(grant,GRANT_KEYS)||grant.version!==PRODUCTION_OUTCOME_VERSION
    ||grant.uid!==uid||grant.sessionId!==sid||grant.battleId!==battleId
    ||grant.mode!=='campaign'||grant.planetId!==1||grant.stage!==1
    ||grant.locationId!=='alpha_stage_1'||grant.rulesVersion!=='combat-v1.0.0'
    ||grant.catalogVersion!=='product-v1.0.0'
    ||!['verified-clear','verified-defeat'].includes(grant.phase)
    ||!Number.isSafeInteger(grant.verifiedAtMs)||grant.verifiedAtMs>now
    ||grant.verifiedAtMs<now-10*60*1000
    ||!Number.isSafeInteger(grant.verifiedTicks)
    ||grant.verifiedTicks<1||grant.verifiedTicks>4500
    ||![grant.snapshotHash,grant.inputDigest,grant.productionReceiptDigest]
      .every(x=>typeof x==='string'&&HEX.test(x))
    ||grant.qaOnly!==false||grant.nonEconomic!==false
    ||grant.safeForCloudBattle!==true||grant.settlementEnabled!==true)
    deny('SETTLEMENT_PRODUCTION_PROOF_REQUIRED',
      'A real server-owned production verifier outcome is required');
}
function validateExistingLedger(ledger,{uid,sid,battleId,requestDigest}){
  if(!exact(ledger,LEDGER_KEYS)||ledger.version!==VERSION||ledger.uid!==uid
    ||ledger.sessionId!==sid||ledger.battleId!==battleId
    ||ledger.requestDigest!==requestDigest
    ||ledger.rewardPolicyVersion!==REWARD_POLICY_VERSION
    ||!REQUEST.test(ledger.requestId)||!HEX.test(ledger.productionReceiptDigest)
    ||!['verified-clear','verified-defeat'].includes(ledger.outcomePhase)
    ||!asNonnegative(ledger.coins)||!asNonnegative(ledger.experience)
    ||![0,1].includes(ledger.stars)||!Number.isSafeInteger(ledger.createdAtMs)
    ||!HEX.test(ledger.ledgerDigest))
    deny('SETTLEMENT_LEDGER_INVALID','Stored settlement ledger context invalid');
  const {ledgerDigest,...data}=ledger;
  if(digest('sf-c7b2b-settlement-ledger',data)!==ledgerDigest)
    deny('SETTLEMENT_LEDGER_INVALID','Stored settlement ledger checksum mismatch');
}
function boundedAdd(a,b,code){
  if(!asNonnegative(a)||!asNonnegative(b)||a+b>MAX_VALUE)
    deny(code,'Canonical profile counter invalid or would exceed limit');
  return a+b;
}
function applyStageOneSettlement(raw,grant,{now,catalog,schema}){
  const stage=catalog?.STAGE_CONFIG?.[1];
  if(stage?.waves!==5||stage?.expReward!==100)
    deny('SETTLEMENT_CATALOG_CHANGED','Stage reward catalog needs reviewed policy update');
  const document=clone(raw);
  const state=schema.restoreProfileDocument(document);
  const campaigns=state.campaignData;
  const progress=campaigns.progress;
  const victory=grant.phase==='verified-clear';
  const payout=victory?Math.min(15000,stage.expReward*2+stage.waves*50):0;
  const exp=victory?stage.expReward:0;
  const wallet=document.wallet;
  if(!record(wallet)||!asNonnegative(wallet.coins)
    ||!asNonnegative(wallet.diamonds)||!asNonnegative(wallet.energy)
    ||!asNonnegative(wallet.vipPoints))
    deny('SETTLEMENT_INVALID_PROFILE','Canonical wallet is invalid');
  const newCoins=boundedAdd(wallet.coins,payout,'SETTLEMENT_WALLET_OVERFLOW');
  if(!asNonnegative(progress.exp??0))
    deny('SETTLEMENT_INVALID_PROFILE','Canonical XP is invalid');
  const security=document.security??{};
  if(!record(security))deny('SETTLEMENT_INVALID_PROFILE','Security counters malformed');
  const today=utcDay(now),stat=clone(security);
  if(stat.battleDay!==today){
    stat.battleDay=today;stat.battleStarts=0;stat.battleWins=0;
    stat.battleCoins=0;stat.battleDiamonds=0;
  }
  if(!asNonnegative(stat.battleCoins)||stat.battleCoins+payout>500000
    ||!asNonnegative(stat.battleWins)||stat.battleWins+(victory?1:0)>50)
    deny('SETTLEMENT_DAILY_LIMIT','Daily battle reward/win cap reached',429);
  stat.battleCoins+=payout;
  if(victory)stat.battleWins+=1;
  // This foundation does NOT start battles or apply energy charges. Campaign
  // stage one currently has zero admission energy cost in legacy economy.
  wallet.coins=newCoins;
  campaigns.progress.exp=boundedAdd(progress.exp??0,exp,'SETTLEMENT_XP_OVERFLOW');
  let stars=0;
  if(victory){
    if(!record(campaigns.progress.planets??{}))
      deny('SETTLEMENT_INVALID_PROFILE','Progression planets malformed');
    const planets=clone(campaigns.progress.planets||{});
    const alpha=clone(planets[1]||{highestStage:1,stars:{}});
    if(!record(alpha)||!asNonnegative(alpha.highestStage??1)||!record(alpha.stars??{}))
      deny('SETTLEMENT_INVALID_PROFILE','Alpha stage progress malformed');
    stars=1; // conservative until verified star metric is proven on native
    alpha.stars={...alpha.stars,1:Math.max(alpha.stars[1]||0,stars)};
    alpha.highestStage=Math.max(alpha.highestStage||1,2);
    planets[1]=alpha;campaigns.progress.planets=planets;
    if((campaigns.progress.selectedStage??1)===1)campaigns.progress.selectedStage=2;
  }
  // Scope mission increments through the existing UTC period reset helper;
  // mission claims are NOT automatically paid by this transaction.
  updateMissions(state,now,catalog);
  const m=campaigns.missionData;
  for(const key of victory?['d_play_3','m_clear_planet']:['d_play_3']){
    const old=m.progress[key]??0;
    if(!asNonnegative(old))deny('SETTLEMENT_INVALID_PROFILE','Mission counter invalid');
    m.progress[key]=Math.min(10000000,old+1);
  }
  document.wallet=wallet;
  document.progress=campaigns.progress;
  document.security=stat;
  document.missions=campaigns.missionData;
  return {document,payout,exp,stars};
}

/**
 * This factory is deliberately NOT called from server.js/gameService.cjs.
 * enabled=false is a hard fail-closed default, even when a verifier is passed.
 * The future verifier MUST be independently audited before wiring/enablement.
 */
function createVerifiedSettlementC7B2B({db,enabled=false,allowedUids=[],
  trustedProductionVerifier,catalogModule,schemaModule,now=Date.now}={}){
  if(!db||typeof db.runTransaction!=='function')throw new TypeError('Firestore db required');
  const allowed=new Set(allowedUids);
  if(enabled===true && (typeof trustedProductionVerifier!=='function'
    ||!catalogModule?.STAGE_CONFIG||typeof schemaModule?.restoreProfileDocument!=='function'
    ||!allowed.size||[...allowed].some(x=>typeof x!=='string'||x.length<1
      ||x.length>128||/[\x00-\x1f\x7f/]/.test(x))))
    throw new Error('Production verifier, catalog, schema and closed UID allowlist required');
  const userRef=uid=>db.collection('users').doc(uid);
  const deletionRef=uid=>db.collection('accountDeletionJobs').doc(uid);
  const ledgerRef=(uid,id)=>userRef(uid).collection('verifiedBattleSettlements').doc(id);
  const operationRef=(uid,id)=>userRef(uid).collection('operations').doc(id);
  async function settle(uid,sid,body){
    // Never inspect untrusted body/DB when OFF. No hidden env flag override.
    if(enabled!==true)deny('VERIFIED_SETTLEMENT_DISABLED','Verified settlement is disabled',423);
    if(!exact(body,['battleId','requestId']))
      deny('SETTLEMENT_INPUT_INVALID','Only battleId and requestId are accepted',400);
    const {battleId,requestId}=body;
    validateActor(uid,sid,battleId,requestId,allowed);
    const at=now();
    if(!Number.isSafeInteger(at)||at<=0)throw new Error('Invalid server clock');
    const requestDigest=digest('sf-c7b2b-request',{uid,sid,battleId});
    return db.runTransaction(async t=>{
      const ref=userRef(uid),delRef=deletionRef(uid);
      const lref=ledgerRef(uid,battleId),opRef=operationRef(uid,requestId);
      const [userSnap,jobSnap,ledgerSnap,opSnap]=await Promise.all([
        t.get(ref),t.get(delRef),t.get(lref),t.get(opRef)]);
      if(!userSnap.exists)deny('PROFILE_NOT_FOUND','Profile not initialized',404);
      const raw=userSnap.data();assertAccountActive(raw);
      if(jobSnap.exists)deny('ACCOUNT_DELETION_PENDING','Account deletion pending',423);
      if(raw.sessionId!==sid)deny('SESSION_EXPIRED','Session changed',401);
      if(opSnap.exists){
        const op=opSnap.data();
        if(op.command!=='battle.settle.verified'
          ||op.payloadHash!==requestDigest||op.battleId!==battleId)
          deny('REQUEST_REUSED','Request ID has already been used',409);
      }
      if(ledgerSnap.exists){
        const saved=ledgerSnap.data();
        // One settlement per battle ID; original request is bound to the ledger.
        // A different retry request ID may read the result but NEVER write more.
        validateExistingLedger(saved,{uid,sid,battleId,requestDigest});
        if(opSnap.exists&&saved.requestId!==requestId)
          deny('SETTLEMENT_LEDGER_INVALID','Operation and ledger request mismatch');
        if(!opSnap.exists&&saved.requestId===requestId)
          deny('SETTLEMENT_LEDGER_INVALID','Missing paired operation record');
        return Object.freeze({duplicate:true,battleId,coins:saved.coins,
          experience:saved.experience,stars:saved.stars,
          ledgerDigest:saved.ledgerDigest});
      }
      if(opSnap.exists)
        deny('SETTLEMENT_LEDGER_MISSING','Operation exists without settlement ledger');
      // This callback is NOT implemented by the QA verifier. It MUST read
      // a server-produced production receipt using the transaction; the
      // caller cannot supply a grant or any economic amount through HTTP.
      const grant=await trustedProductionVerifier({transaction:t,uid,sessionId:sid,battleId});
      validateProductionOutcome(grant,{uid,sid,battleId,now:at});
      const {document,payout,exp,stars}=applyStageOneSettlement(raw,grant,
        {now:at,catalog:catalogModule,schema:schemaModule});
      const fields={version:VERSION,uid,sessionId:sid,battleId,requestId,
        requestDigest,productionReceiptDigest:grant.productionReceiptDigest,
        outcomePhase:grant.phase,rewardPolicyVersion:REWARD_POLICY_VERSION,
        coins:payout,experience:exp,stars,createdAtMs:at};
      const ledger={...fields,ledgerDigest:digest('sf-c7b2b-settlement-ledger',fields)};
      // Exactly one atomic transaction, no mixed reads after writes.
      t.set(ref,document);
      t.create(lref,ledger);
      t.create(opRef,{command:'battle.settle.verified',payloadHash:requestDigest,
        battleId,createdAt:at,extra:{ledgerDigest:ledger.ledgerDigest}});
      return Object.freeze({duplicate:false,battleId,coins:payout,
        experience:exp,stars,ledgerDigest:ledger.ledgerDigest});
    });
  }
  return Object.freeze({settle});
}
module.exports=Object.freeze({VERSION,PRODUCTION_OUTCOME_VERSION,REWARD_POLICY_VERSION,
  createVerifiedSettlementC7B2B});
