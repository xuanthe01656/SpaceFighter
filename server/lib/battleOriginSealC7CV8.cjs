'use strict';
/**
 * C7-C1: optional server-only HMAC provenance for NEW non-economic QA origins.
 * A SHA-256 snapshot/journal digest is NOT proof of origin. This HMAC attests
 * only that the server possessing the secret saw these origin fields at issue.
 * Neither this seal nor a valid replay authorizes money, progress or Cloud play.
 * No key is read from HTTP, Firestore or a hard-coded environment default.
 */
const {createHmac,timingSafeEqual}=require('node:crypto');
const {GameError}=require('./economy.cjs');
const SEAL_VERSION='v8-c7c1-qa-origin-seal-v1';
const PURPOSE='non-economic-qa-genesis';
const ID=/^[A-Za-z0-9_-]{6,48}$/;
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
  &&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const deny=(code,detail)=>{throw new GameError(code,detail,409);};
function validateSealKey(key){
  if(!Buffer.isBuffer(key)||key.length<32||key.length>128)
    throw new TypeError('C7-C1 origin seal requires an injected 32..128-byte Buffer key');
  return key;
}
function validateKeyId(keyId){
  if(typeof keyId!=='string'||!ID.test(keyId))
    throw new TypeError('C7-C1 origin seal keyId must be an explicit safe identifier');
  return keyId;
}
const exact=(v,keys)=>record(v)&&Object.keys(v).length===keys.length
  &&keys.every(k=>Object.hasOwn(v,k));
const FIELDS=['version','purpose','keyId','uid','sessionId','battleId',
  'issuedAtMs','expiresAtMs','genesisDigest','qaOnly','nonEconomic',
  'safeForCloudBattle','settlementEnabled'];
function fieldsFor(genesis,keyId){
  if(!record(genesis)||typeof genesis.uid!=='string'||genesis.uid.length<1
    ||genesis.uid.length>128||/[/\x00-\x1f\x7f]/.test(genesis.uid)
    ||!UUID.test(genesis.sessionId||'')||!UUID.test(genesis.battleId||'')
    ||!Number.isSafeInteger(genesis.issuedAtMs)||genesis.issuedAtMs<=0
    ||!Number.isSafeInteger(genesis.expiresAtMs)
    ||genesis.expiresAtMs<=genesis.issuedAtMs
    ||!HEX.test(genesis.genesisDigest||'')
    ||genesis.qaOnly!==true||genesis.nonEconomic!==true
    ||genesis.safeForCloudBattle!==false||genesis.settlementEnabled!==false)
    deny('C7C1_ORIGIN_INVALID','Non-economic QA genesis is not sealable');
  return {version:SEAL_VERSION,purpose:PURPOSE,keyId,
    uid:genesis.uid,sessionId:genesis.sessionId,battleId:genesis.battleId,
    issuedAtMs:genesis.issuedAtMs,expiresAtMs:genesis.expiresAtMs,
    genesisDigest:genesis.genesisDigest,qaOnly:true,nonEconomic:true,
    safeForCloudBattle:false,settlementEnabled:false};
}
function calculateMac(fields,key){
  // Explicit field order, domain separation and fixed non-economic flags.
  return createHmac('sha256',key).update('spacefighter:c7c1:qa-origin-seal:v1\n')
    .update(JSON.stringify(FIELDS.map(field=>fields[field]))).digest('hex');
}
function issueQaOriginSealC7C1({genesis,keyId,key}){
  validateKeyId(keyId);validateSealKey(key);
  const fields=fieldsFor(genesis,keyId);
  return Object.freeze({...fields,mac:calculateMac(fields,key)});
}
function verifyQaOriginSealC7C1({genesis,seal,keys}){
  if(!record(seal)||!exact(seal,[...FIELDS,'mac'])||!ID.test(seal.keyId||'')
    ||!HEX.test(seal.mac||'')||!(keys instanceof Map))
    deny('C7C1_ORIGIN_SEAL_INVALID','QA genesis seal missing or malformed');
  const expected=fieldsFor(genesis,seal.keyId);
  if(FIELDS.some(k=>seal[k]!==expected[k]))
    deny('C7C1_ORIGIN_SEAL_CONTEXT','QA genesis seal identity or purpose differs');
  const key=keys.get(seal.keyId);
  if(!key)deny('C7C1_ORIGIN_SEAL_KEY','Unknown QA origin signing key identifier');
  validateSealKey(key);
  const actual=Buffer.from(seal.mac,'hex');
  const reference=Buffer.from(calculateMac(expected,key),'hex');
  if(actual.length!==reference.length||!timingSafeEqual(actual,reference))
    deny('C7C1_ORIGIN_SEAL_MAC','QA genesis seal authentication failed');
  return true;
}
module.exports=Object.freeze({SEAL_VERSION,issueQaOriginSealC7C1,
  verifyQaOriginSealC7C1,validateSealKey,validateKeyId});
