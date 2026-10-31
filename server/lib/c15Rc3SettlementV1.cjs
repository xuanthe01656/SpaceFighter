'use strict';
/**
 * C15-RC3 staging-only settlement for an immutable RC2 trusted outcome.
 *
 * The client supplies only battleId, outcomeDigest and an idempotency requestId.
 * All reward amounts, mission deltas and progression changes are derived by the
 * server inside one Firestore transaction. Production settlement remains OFF.
 */
const {createHash,createHmac,timingSafeEqual}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError,updateMissions,utcDay}=require('./economy.cjs');
const {assertAccountActive}=require('./accountDeletion.cjs');
const {verifyC15CommercialOriginV1}=require('./c15CommercialGenesisV1.cjs');
const {verifyC15CommercialReplayResultV1}=require('./c15CommercialReplayV1.cjs');
const {journalRoot,verifyC15TrustedOutcomeV1}=require('./c15TrustedOutcomeV1.cjs');

const VERSION='c15-rc3-settlement-v1';
const RECEIPT_VERSION='c15-rc3-settlement-receipt-v1';
const PURPOSE='staging-trusted-outcome-settlement-rc3';
const REWARD_POLICY_VERSION='c15-alpha1-reward-policy-v1';
const SELECTED_CONTROL_PROFILE='arcade-responsive-v1';
const MAX_VALUE=1_000_000_000;
const MAX_CHUNKS=256;
const MAX_OUTCOME_AGE_MS=24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST=/^[A-Za-z0-9_-]{12,80}$/;
const KEY_ID=/^[A-Za-z0-9_-]{6,48}$/;
const B64=/^[A-Za-z0-9+/]+={0,2}$/;
const HEX=/^[0-9a-f]{64}$/;
const deny=(code,message,status=409)=>{throw new GameError(code,message,status);};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const safeInt=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const nonnegative=value=>safeInt(value,0,MAX_VALUE);
const canonical=value=>Array.isArray(value)?value.map(canonical):record(value)
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=(tag,value)=>createHash('sha256').update(JSON.stringify([tag,canonical(value)])).digest('hex');
const sign=(key,value)=>createHmac('sha256',key).update('spacefighter:c15:rc3:settlement-receipt:v1\n')
  .update(JSON.stringify(canonical(value))).digest('hex');
const clone=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){for(const nested of Object.values(value))freeze(nested);Object.freeze(value);}return value;};
const RECEIPT_KEYS=['version','purpose','keyId','uid','sessionId','battleId','requestId','requestDigest',
  'outcomeDigest','journalRootDigest','replayDigest','stateDigest','controlProfileId','resourceManifestDigest',
  'outcomePhase','rewardPolicyVersion','coins','experience','stars','missionDeltas','createdAtMs',
  'stagingOnly','productionSettlementEnabled','productionCloudRewards','receiptDigest','mac'];

function decodeKey(env,keyIdName,keyName,label){
  const keyId=env[keyIdName],encoded=env[keyName];
  if(!KEY_ID.test(keyId||'')||typeof encoded!=='string'||encoded.length<44||encoded.length>172||!B64.test(encoded))
    throw new TypeError(`${label} HMAC config invalid`);
  const key=Buffer.from(encoded,'base64');
  if(key.toString('base64')!==encoded||key.length<32||key.length>128)throw new TypeError(`${label} HMAC key invalid`);
  return freeze({keyId,key});
}
function parseC15Rc3SettlementConfig(env){
  if(!env||typeof env!=='object'||Array.isArray(env))throw new TypeError('C15 RC3 explicit environment required');
  if(env.GAME_C15_RC3_SETTLEMENT_ENABLED!=='true')return null;
  if(env.GAME_C15_RC3_SETTLEMENT_STAGING_APPROVED!=='true')throw new TypeError('C15 RC3 staging approval missing');
  const raw=env.GAME_C15_RC3_SETTLEMENT_ALLOW_UIDS;
  if(typeof raw!=='string'||raw.length<1||raw.length>2048)throw new TypeError('C15 RC3 closed allowlist required');
  const uids=raw.split(',').map(value=>value.trim());
  if(uids.length<1||uids.length>10||new Set(uids).size!==uids.length
    ||uids.some(value=>typeof value!=='string'||value.length<1||value.length>128||/[\x00-\x1f\x7f/]/.test(value)))
    throw new TypeError('C15 RC3 UID allowlist invalid');
  const genesis=decodeKey(env,'GAME_C15_RC1B_HMAC_KEY_ID','GAME_C15_RC1B_HMAC_KEY_B64','C15 RC1B genesis');
  const outcome=decodeKey(env,'GAME_C15_RC2_OUTCOME_HMAC_KEY_ID','GAME_C15_RC2_OUTCOME_HMAC_KEY_B64','C15 RC2 outcome');
  const receipt=decodeKey(env,'GAME_C15_RC3_RECEIPT_HMAC_KEY_ID','GAME_C15_RC3_RECEIPT_HMAC_KEY_B64','C15 RC3 receipt');
  return freeze({uids,genesis,outcome,receipt});
}
function validateActor(uid,sessionId,battleId,requestId,outcomeDigest,allowlist){
  if(typeof uid!=='string'||uid.length<1||uid.length>128||/[\x00-\x1f\x7f/]/.test(uid))
    deny('UNAUTHORIZED','Invalid Firebase identity',401);
  if(!allowlist.has(uid))deny('C15_RC3_NOT_ALLOWED','UID not approved for RC3 staging settlement',403);
  if(!UUID.test(sessionId||''))deny('SESSION_EXPIRED','Valid game session required',401);
  if(!UUID.test(battleId||'')||!REQUEST.test(requestId||'')||!HEX.test(outcomeDigest||''))
    deny('C15_RC3_INPUT_INVALID','Invalid battleId, outcomeDigest or requestId',400);
}
function boundedAdd(left,right,code){
  if(!nonnegative(left)||!nonnegative(right)||left+right>MAX_VALUE)deny(code,'Canonical profile counter invalid or exceeds limit');
  return left+right;
}
function applyAlphaStageOne(raw,outcome,{now,catalog,schema}){
  const stage=catalog?.STAGE_CONFIG?.[1];
  if(stage?.waves!==5||stage?.expReward!==100)deny('C15_RC3_CATALOG_CHANGED','Stage reward catalog requires reviewed policy update');
  const document=clone(raw),state=schema.restoreProfileDocument(document),campaigns=state.campaignData,progress=campaigns.progress;
  const victory=outcome.phase==='rc2-trusted-clear';
  const coins=victory?Math.min(15000,stage.expReward*2+stage.waves*50):0;
  const experience=victory?stage.expReward:0;
  const wallet=document.wallet;
  if(!record(wallet)||!nonnegative(wallet.coins)||!nonnegative(wallet.diamonds)||!nonnegative(wallet.energy)
    ||!nonnegative(wallet.vipPoints))deny('C15_RC3_PROFILE_INVALID','Canonical wallet is invalid');
  wallet.coins=boundedAdd(wallet.coins,coins,'C15_RC3_WALLET_OVERFLOW');
  if(!nonnegative(progress.exp??0))deny('C15_RC3_PROFILE_INVALID','Canonical XP is invalid');
  progress.exp=boundedAdd(progress.exp??0,experience,'C15_RC3_XP_OVERFLOW');
  const today=utcDay(now),security=clone(document.security??{});
  if(!record(security))deny('C15_RC3_PROFILE_INVALID','Security counters malformed');
  if(security.battleDay!==today){security.battleDay=today;security.battleStarts=0;security.battleWins=0;
    security.battleCoins=0;security.battleDiamonds=0;}
  if(!nonnegative(security.battleCoins)||security.battleCoins+coins>500000
    ||!nonnegative(security.battleWins)||security.battleWins+(victory?1:0)>50)
    deny('C15_RC3_DAILY_LIMIT','Daily battle reward/win cap reached',429);
  security.battleCoins+=coins;if(victory)security.battleWins+=1;
  let stars=0;
  if(victory){
    if(!record(progress.planets??{}))deny('C15_RC3_PROFILE_INVALID','Progression planets malformed');
    const planets=clone(progress.planets||{}),alpha=clone(planets[1]||{highestStage:1,stars:{}});
    if(!record(alpha)||!nonnegative(alpha.highestStage??1)||!record(alpha.stars??{}))
      deny('C15_RC3_PROFILE_INVALID','Alpha stage progress malformed');
    stars=1;alpha.stars={...alpha.stars,1:Math.max(alpha.stars[1]||0,stars)};
    alpha.highestStage=Math.max(alpha.highestStage||1,2);planets[1]=alpha;progress.planets=planets;
    if((progress.selectedStage??1)===1)progress.selectedStage=2;
  }
  updateMissions(state,now,catalog);
  const missionData=campaigns.missionData,missionDeltas={d_play_3:1,m_clear_planet:victory?1:0};
  for(const [key,amount] of Object.entries(missionDeltas)){
    if(amount===0)continue;const prior=missionData.progress[key]??0;
    if(!nonnegative(prior))deny('C15_RC3_PROFILE_INVALID','Mission counter invalid');
    missionData.progress[key]=Math.min(10_000_000,prior+amount);
  }
  document.wallet=wallet;document.progress=progress;document.security=security;document.missions=missionData;
  return freeze({document,coins,experience,stars,missionDeltas:freeze(missionDeltas)});
}
function createReceipt(fields,keyId,key){
  const base={version:RECEIPT_VERSION,purpose:PURPOSE,keyId,...fields,stagingOnly:true,
    productionSettlementEnabled:false,productionCloudRewards:false};
  const receiptDigest=digest('sf-c15-rc3-settlement-receipt',base),signed={...base,receiptDigest};
  return freeze({...signed,mac:sign(key,signed)});
}
function verifyC15Rc3SettlementReceiptV1(receipt,keyRing,expected={}){
  if(!exact(receipt,RECEIPT_KEYS)||receipt.version!==RECEIPT_VERSION||receipt.purpose!==PURPOSE
    ||!KEY_ID.test(receipt.keyId||'')||!UUID.test(receipt.sessionId||'')||!UUID.test(receipt.battleId||'')
    ||typeof receipt.uid!=='string'||receipt.uid.length<1||receipt.uid.length>128||!REQUEST.test(receipt.requestId||'')
    ||!HEX.test(receipt.requestDigest||'')||!HEX.test(receipt.outcomeDigest||'')||!HEX.test(receipt.journalRootDigest||'')
    ||!HEX.test(receipt.replayDigest||'')||!HEX.test(receipt.stateDigest||'')||!HEX.test(receipt.resourceManifestDigest||'')
    ||receipt.controlProfileId!==SELECTED_CONTROL_PROFILE||!['rc2-trusted-clear','rc2-trusted-defeat'].includes(receipt.outcomePhase)
    ||receipt.rewardPolicyVersion!==REWARD_POLICY_VERSION||!nonnegative(receipt.coins)||!nonnegative(receipt.experience)
    ||![0,1].includes(receipt.stars)||!exact(receipt.missionDeltas,['d_play_3','m_clear_planet'])
    ||!nonnegative(receipt.missionDeltas.d_play_3)||!nonnegative(receipt.missionDeltas.m_clear_planet)
    ||!safeInt(receipt.createdAtMs,1,Number.MAX_SAFE_INTEGER)||receipt.stagingOnly!==true
    ||receipt.productionSettlementEnabled!==false||receipt.productionCloudRewards!==false
    ||!HEX.test(receipt.receiptDigest||'')||!HEX.test(receipt.mac||''))
    deny('C15_RC3_RECEIPT_INVALID','Stored RC3 settlement receipt invalid');
  const {mac,...signed}=receipt,{receiptDigest,...base}=signed;
  if(digest('sf-c15-rc3-settlement-receipt',base)!==receiptDigest)
    deny('C15_RC3_RECEIPT_INVALID','Stored RC3 receipt digest mismatch');
  const key=keyRing?.[receipt.keyId];
  if(!Buffer.isBuffer(key)||key.length<32||key.length>128)deny('C15_RC3_RECEIPT_INVALID','Unknown RC3 receipt key');
  const expectedMac=sign(key,signed);
  if(!timingSafeEqual(Buffer.from(receipt.mac,'hex'),Buffer.from(expectedMac,'hex')))
    deny('C15_RC3_RECEIPT_INVALID','Stored RC3 receipt signature mismatch');
  for(const [name,value] of Object.entries(expected))if(receipt[name]!==value)
    deny('C15_RC3_RECEIPT_INVALID',`Stored RC3 receipt context mismatch: ${name}`);
  return true;
}
function disabled(){const block=async()=>deny('C15_RC3_SETTLEMENT_DISABLED','RC3 staging settlement is disabled',423);
  return freeze({enabled:false,settle:block,stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false});}

async function createC15Rc3SettlementV1({db,enabled=false,allowedUids=[],genesisVerificationKeys,
  outcomeVerificationKeys,receiptSigningKeyId,receiptSigningKey,receiptVerificationKeys,
  catalogModule,schemaModule,now=Date.now}={}){
  if(enabled!==true)return disabled();
  if(!db||typeof db.runTransaction!=='function'||!Array.isArray(allowedUids)||allowedUids.length<1||allowedUids.length>10
    ||new Set(allowedUids).size!==allowedUids.length||allowedUids.some(value=>typeof value!=='string'||value.length<1||value.length>128||/[\x00-\x1f\x7f/]/.test(value))
    ||!(genesisVerificationKeys instanceof Map)||!(outcomeVerificationKeys instanceof Map)
    ||!KEY_ID.test(receiptSigningKeyId||'')||!Buffer.isBuffer(receiptSigningKey)||receiptSigningKey.length<32||receiptSigningKey.length>128
    ||!(receiptVerificationKeys instanceof Map)||!Buffer.isBuffer(receiptVerificationKeys.get(receiptSigningKeyId))
    ||!receiptSigningKey.equals(receiptVerificationKeys.get(receiptSigningKeyId))||typeof now!=='function')
    throw new TypeError('C15 RC3 explicit Firestore, allowlist and HMAC rings required');
  const [catalog,schema]=await Promise.all([
    catalogModule?Promise.resolve(catalogModule):import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    schemaModule?Promise.resolve(schemaModule):import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href),
  ]);
  const allowlist=new Set(allowedUids),genesisRing=Object.fromEntries(genesisVerificationKeys),outcomeRing=Object.fromEntries(outcomeVerificationKeys),
    receiptRing=Object.fromEntries(receiptVerificationKeys);
  const userRef=uid=>db.collection('users').doc(uid),jobRef=uid=>db.collection('accountDeletionJobs').doc(uid);
  const sessionRef=uid=>userRef(uid).collection('c15Rc1bSessions').doc('current');
  const originRef=(uid,bid)=>userRef(uid).collection('c15Rc1bOrigins').doc(bid);
  const resultRef=(uid,bid)=>userRef(uid).collection('c15Rc1bResults').doc(bid);
  const outcomeRef=(uid,bid)=>userRef(uid).collection('c15Rc2Outcomes').doc(bid);
  const traceQuery=(uid,bid)=>userRef(uid).collection('c15Rc1bTrace').doc(bid).collection('chunks').orderBy('startTick').limit(MAX_CHUNKS+1);
  const receiptRef=(uid,bid)=>userRef(uid).collection('c15Rc3Settlements').doc(bid);
  const operationRef=(uid,id)=>userRef(uid).collection('operations').doc(id);
  const clock=()=>{const value=now();if(!safeInt(value,1,Number.MAX_SAFE_INTEGER))throw new Error('C15 RC3 clock invalid');return value;};
  async function settle(uid,sessionId,body){
    if(!exact(body,['battleId','outcomeDigest','requestId']))deny('C15_RC3_INPUT_INVALID','Only battleId, outcomeDigest and requestId are accepted',400);
    const {battleId,outcomeDigest,requestId}=body;validateActor(uid,sessionId,battleId,requestId,outcomeDigest,allowlist);
    const at=clock(),requestDigest=digest('sf-c15-rc3-settlement-request',{uid,sessionId,battleId,outcomeDigest});
    return db.runTransaction(async transaction=>{
      const uref=userRef(uid),dref=jobRef(uid),sref=sessionRef(uid),oref=originRef(uid,battleId),rref=resultRef(uid,battleId),
        outref=outcomeRef(uid,battleId),settleRef=receiptRef(uid,battleId),opref=operationRef(uid,requestId);
      const [userSnap,jobSnap,sessionSnap,originSnap,resultSnap,outcomeSnap,receiptSnap,operationSnap,traceSnap]=await Promise.all([
        transaction.get(uref),transaction.get(dref),transaction.get(sref),transaction.get(oref),transaction.get(rref),
        transaction.get(outref),transaction.get(settleRef),transaction.get(opref),transaction.get(traceQuery(uid,battleId))]);
      if(!userSnap.exists)deny('PROFILE_NOT_FOUND','Profile not initialized',404);
      const raw=userSnap.data();assertAccountActive(raw);if(jobSnap.exists)deny('ACCOUNT_DELETION_PENDING','Account deletion pending',423);
      if(raw.sessionId!==sessionId)deny('SESSION_EXPIRED','Account session changed',401);
      if(!sessionSnap.exists||!originSnap.exists||!resultSnap.exists||!outcomeSnap.exists)
        deny('C15_RC3_OUTCOME_REQUIRED','Finalized RC2 outcome is required');
      const session=sessionSnap.data(),origin=originSnap.data(),result=resultSnap.data(),outcome=outcomeSnap.data();
      if(session.version!=='c15-rc1b-runtime-v1'||session.uid!==uid||session.sessionId!==sessionId||session.battleId!==battleId
        ||session.phase!=='finalized'||session.outcomeDigest!==outcomeDigest)
        deny('C15_RC3_SESSION_INVALID','Finalized C15 session context invalid');
      verifyC15CommercialOriginV1(origin,genesisRing);
      verifyC15CommercialReplayResultV1(result,{uid,sessionId,battleId});
      verifyC15TrustedOutcomeV1(outcome,outcomeRing,{uid,sessionId,battleId,outcomeDigest,
        originDigest:origin.originDigest,replayDigest:result.replayDigest,stateDigest:result.stateDigest,
        traceDigest:result.traceDigest,resourceManifestDigest:origin.genesis.resourceManifestDigest,
        controlProfileId:SELECTED_CONTROL_PROFILE});
      if(outcome.issuedAtMs>at||outcome.issuedAtMs<at-MAX_OUTCOME_AGE_MS)
        deny('C15_RC3_OUTCOME_EXPIRED','RC2 outcome is outside the RC3 settlement window',410);
      if(traceSnap.docs.length!==session.chunkCount||traceSnap.docs.length<1||traceSnap.docs.length>MAX_CHUNKS)
        deny('C15_RC3_TRACE_INVALID','Stored journal trace is incomplete');
      const storedChunks=traceSnap.docs.map(doc=>doc.data()),computedRoot=journalRoot(storedChunks);
      if(computedRoot!==outcome.journalRootDigest||session.uploadedThroughTick!==result.ticks)
        deny('C15_RC3_TRACE_INVALID','Stored journal root no longer matches RC2 outcome');
      if(operationSnap.exists){const op=operationSnap.data();
        if(op.command!=='c15.settlement.claim'||op.payloadHash!==requestDigest||op.battleId!==battleId||op.outcomeDigest!==outcomeDigest)
          deny('REQUEST_REUSED','Request ID has already been used',409);}
      if(receiptSnap.exists){const saved=receiptSnap.data();verifyC15Rc3SettlementReceiptV1(saved,receiptRing,
          {uid,sessionId,battleId,outcomeDigest,requestDigest});
        if(operationSnap.exists&&saved.requestId!==requestId)
          deny('C15_RC3_RECEIPT_INVALID','Current request operation conflicts with stored receipt');
        const pairedOperationSnap=saved.requestId===requestId?operationSnap:await transaction.get(operationRef(uid,saved.requestId));
        if(!pairedOperationSnap.exists)deny('C15_RC3_RECEIPT_INVALID','Missing paired operation record');
        const pairedOperation=pairedOperationSnap.data();
        if(pairedOperation.command!=='c15.settlement.claim'||pairedOperation.payloadHash!==saved.requestDigest
          ||pairedOperation.battleId!==battleId||pairedOperation.outcomeDigest!==outcomeDigest
          ||pairedOperation.extra?.receiptDigest!==saved.receiptDigest
          ||pairedOperation.extra?.rewardPolicyVersion!==REWARD_POLICY_VERSION)
          deny('C15_RC3_RECEIPT_INVALID','Paired operation record is inconsistent with stored receipt');
        return freeze({version:VERSION,duplicate:true,battleId,receipt:saved,
          wallet:freeze({coins:raw.wallet?.coins??0,diamonds:raw.wallet?.diamonds??0,energy:raw.wallet?.energy??0}),
          progress:freeze({experience:raw.progress?.exp??0,stageOneStars:raw.progress?.planets?.[1]?.stars?.[1]??0}),
          stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false});}
      if(operationSnap.exists)deny('C15_RC3_RECEIPT_MISSING','Operation exists without RC3 receipt');
      const applied=applyAlphaStageOne(raw,outcome,{now:at,catalog,schema});
      const receipt=createReceipt({uid,sessionId,battleId,requestId,requestDigest,outcomeDigest,
        journalRootDigest:outcome.journalRootDigest,replayDigest:outcome.replayDigest,stateDigest:outcome.stateDigest,
        controlProfileId:outcome.controlProfileId,resourceManifestDigest:outcome.resourceManifestDigest,
        outcomePhase:outcome.phase,rewardPolicyVersion:REWARD_POLICY_VERSION,coins:applied.coins,
        experience:applied.experience,stars:applied.stars,missionDeltas:applied.missionDeltas,createdAtMs:at},
        receiptSigningKeyId,receiptSigningKey);
      transaction.set(uref,applied.document);transaction.create(settleRef,receipt);
      transaction.create(opref,{command:'c15.settlement.claim',payloadHash:requestDigest,battleId,outcomeDigest,
        createdAt:at,extra:{receiptDigest:receipt.receiptDigest,rewardPolicyVersion:REWARD_POLICY_VERSION}});
      return freeze({version:VERSION,duplicate:false,battleId,receipt,
        wallet:freeze({coins:applied.document.wallet.coins,diamonds:applied.document.wallet.diamonds,energy:applied.document.wallet.energy}),
        progress:freeze({experience:applied.document.progress.exp,stageOneStars:applied.document.progress.planets?.[1]?.stars?.[1]??0}),
        stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false});
    });
  }
  return freeze({version:VERSION,enabled:true,settle,stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false});
}
async function createC15Rc3StagingSettlement({db,env={},catalogModule,schemaModule,now}={}){
  const config=parseC15Rc3SettlementConfig(env);if(!config)return disabled();
  return createC15Rc3SettlementV1({db,enabled:true,allowedUids:config.uids,
    genesisVerificationKeys:new Map([[config.genesis.keyId,config.genesis.key]]),
    outcomeVerificationKeys:new Map([[config.outcome.keyId,config.outcome.key]]),
    receiptSigningKeyId:config.receipt.keyId,receiptSigningKey:config.receipt.key,
    receiptVerificationKeys:new Map([[config.receipt.keyId,config.receipt.key]]),
    catalogModule,schemaModule,now});
}
module.exports=freeze({VERSION,RECEIPT_VERSION,PURPOSE,REWARD_POLICY_VERSION,SELECTED_CONTROL_PROFILE,
  parseC15Rc3SettlementConfig,verifyC15Rc3SettlementReceiptV1,createC15Rc3SettlementV1,createC15Rc3StagingSettlement});
