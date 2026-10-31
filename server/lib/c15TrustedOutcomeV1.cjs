'use strict';
/**
 * C15-RC2 create-only trusted outcome foundation.
 *
 * This record is HMAC-authenticated and bound to the signed origin, immutable
 * journal root and independent replay result. It is explicitly non-economic
 * and is NOT a settlement grant or production receipt.
 */
const {createHash,createHmac,timingSafeEqual}=require('node:crypto');
const {verifyC15CommercialOriginV1}=require('./c15CommercialGenesisV1.cjs');
const {verifyC15CommercialReplayResultV1}=require('./c15CommercialReplayV1.cjs');
const {resolveC15ControlProfileForPolicy}=require('./c15ControlProfilesV1.cjs');
const VERSION='c15-rc2-trusted-outcome-v1';
const PURPOSE='trusted-outcome-foundation-rc2';
const KEY_ID=/^[A-Za-z0-9_-]{6,48}$/;
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const safeInt=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,value)=>createHash('sha256').update(JSON.stringify([tag,canonical(value)])).digest('hex');
const sign=(key,value)=>createHmac('sha256',key).update('spacefighter:c15:rc2:trusted-outcome:v1\n')
  .update(JSON.stringify(canonical(value))).digest('hex');
const OUTCOME_KEYS=['version','purpose','keyId','uid','sessionId','battleId','originDigest','journalRootDigest',
  'replayDigest','stateDigest','traceDigest','rulesVersion','rulesDigest','controlProfileId','controlProfileDigest',
  'resourceManifestDigest','phase','ticks','waves','kills','hp','issuedAtMs','outcomeDigest','nonEconomic',
  'safeForSettlement','eligibleForSettlement','settlementEnabled','cloudRewards','mac'];
function journalRoot(chunks){
  if(!Array.isArray(chunks)||chunks.length<1||chunks.length>256)throw new TypeError('C15 RC2 journal root input invalid');
  let expected=0;const leaves=chunks.map(chunk=>{
    if(!record(chunk)||!safeInt(chunk.startTick,0,4500)||!safeInt(chunk.endTick,1,4500)
      ||chunk.startTick!==expected||chunk.endTick<=chunk.startTick||!HEX.test(chunk.chunkDigest||''))
      throw new TypeError('C15 RC2 journal root sequence invalid');
    expected=chunk.endTick;return {startTick:chunk.startTick,endTick:chunk.endTick,chunkDigest:chunk.chunkDigest};
  });
  return digest('sf-c15-rc2-journal-root',{ticks:expected,chunks:leaves.length,leaves});
}
function createC15TrustedOutcomeV1({origin,replayResult,chunks,keyId,key,issuedAtMs,keyRing}={}){
  if(!Buffer.isBuffer(key)||key.length<32||key.length>128||!KEY_ID.test(keyId||'')
    ||!safeInt(issuedAtMs,1,Number.MAX_SAFE_INTEGER))throw new TypeError('C15 RC2 signing input invalid');
  verifyC15CommercialOriginV1(origin,keyRing);verifyC15CommercialReplayResultV1(replayResult,
    {uid:origin.genesis.uid,sessionId:origin.genesis.sessionId,battleId:origin.genesis.battleId});
  const profile=resolveC15ControlProfileForPolicy(origin.policy);
  const phase=replayResult.phase==='rc1-verified-clear'?'rc2-trusted-clear':'rc2-trusted-defeat';
  const core={version:VERSION,purpose:PURPOSE,keyId,uid:replayResult.uid,sessionId:replayResult.sessionId,
    battleId:replayResult.battleId,originDigest:origin.originDigest,journalRootDigest:journalRoot(chunks),
    replayDigest:replayResult.replayDigest,stateDigest:replayResult.stateDigest,traceDigest:replayResult.traceDigest,
    rulesVersion:origin.genesis.rulesVersion,rulesDigest:origin.genesis.rulesDigest,
    controlProfileId:profile.id,controlProfileDigest:profile.profileDigest,
    resourceManifestDigest:origin.genesis.resourceManifestDigest,phase,ticks:replayResult.ticks,
    waves:replayResult.waves,kills:replayResult.kills,hp:replayResult.hp,issuedAtMs,
    nonEconomic:true,safeForSettlement:false,eligibleForSettlement:false,settlementEnabled:false,cloudRewards:false};
  const outcomeDigest=digest('sf-c15-rc2-trusted-outcome',core);
  const fields={...core,outcomeDigest};
  return freeze({...fields,mac:sign(key,fields)});
}
function verifyC15TrustedOutcomeV1(outcome,keyRing,expected={}){
  if(!record(outcome))throw new TypeError('Invalid C15 RC2 trusted outcome record');
  if(Object.keys(outcome).length!==OUTCOME_KEYS.length||!OUTCOME_KEYS.every(key=>Object.hasOwn(outcome,key)))
    throw new TypeError('Invalid C15 RC2 trusted outcome shape');
  if(outcome.version!==VERSION||outcome.purpose!==PURPOSE)throw new TypeError('Invalid C15 RC2 trusted outcome version');
  if(!KEY_ID.test(outcome.keyId||''))throw new TypeError('Invalid C15 RC2 trusted outcome key id');
  if(!UUID.test(outcome.sessionId||'')||!UUID.test(outcome.battleId||''))throw new TypeError('Invalid C15 RC2 trusted outcome identity');
  if(typeof outcome.uid!=='string'||outcome.uid.length<1||outcome.uid.length>128)throw new TypeError('Invalid C15 RC2 trusted outcome uid');
  if(!['rc2-trusted-clear','rc2-trusted-defeat'].includes(outcome.phase))throw new TypeError('Invalid C15 RC2 trusted outcome phase');
  if(!safeInt(outcome.ticks,1,4500)||!safeInt(outcome.waves,1,5)||!safeInt(outcome.kills,0,70)
    ||!safeInt(outcome.hp,0,1_000_000_000)||!safeInt(outcome.issuedAtMs,1,Number.MAX_SAFE_INTEGER))
    throw new TypeError('Invalid C15 RC2 trusted outcome counters');
  if(typeof outcome.rulesVersion!=='string'||outcome.rulesVersion.length<1||outcome.rulesVersion.length>80
    ||typeof outcome.controlProfileId!=='string'||outcome.controlProfileId.length<1||outcome.controlProfileId.length>80)
    throw new TypeError('Invalid C15 RC2 trusted outcome rules');
  if(outcome.nonEconomic!==true||outcome.safeForSettlement!==false||outcome.eligibleForSettlement!==false
    ||outcome.settlementEnabled!==false||outcome.cloudRewards!==false)
    throw new TypeError('Invalid C15 RC2 trusted outcome safety');
  for(const name of ['originDigest','journalRootDigest','replayDigest','stateDigest','traceDigest','rulesDigest',
    'controlProfileDigest','resourceManifestDigest','outcomeDigest','mac'])if(!HEX.test(outcome[name]||''))
      throw new TypeError(`Invalid C15 RC2 trusted outcome digest: ${name}`);
  const {mac,...fields}=outcome;
  if(digest('sf-c15-rc2-trusted-outcome',Object.fromEntries(Object.entries(fields).filter(([key])=>key!=='outcomeDigest')))!==outcome.outcomeDigest)
    throw new TypeError('C15 RC2 outcome digest mismatch');
  const key=keyRing?.[outcome.keyId];if(!Buffer.isBuffer(key)||key.length<32||key.length>128)
    throw new TypeError('Unknown C15 RC2 outcome key');
  const expectedMac=sign(key,fields);
  if(!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(expectedMac,'hex')))
    throw new TypeError('C15 RC2 outcome signature mismatch');
  for(const [name,value] of Object.entries(expected))if(outcome[name]!==value)
    throw new TypeError(`C15 RC2 outcome context mismatch: ${name}`);
  return true;
}
module.exports=freeze({VERSION,PURPOSE,journalRoot,createC15TrustedOutcomeV1,verifyC15TrustedOutcomeV1});
