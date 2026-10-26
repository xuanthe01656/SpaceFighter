'use strict';
/**
 * C7-C2A: fail-closed configuration bridge for NON-ECONOMIC, allowlisted QA.
 * This does not create a production outcome, authorize settlement, or relax P0.
 * A sealed ticket can be inspected only with an independent QA verifier gate.
 * Secret bytes come from an explicit injected runtime environment (Secret
 * Manager in a future approved QA deployment), never from an HTTP request.
 */
const {validateSealKey,validateKeyId}=require('./battleOriginSealC7CV8.cjs');
const {createQaBattleAdmissionC7A}=require('./qaBattleAdmissionC7AV8.cjs');
const {createBattleVerifierCandidateC7C1}=require('./battleVerifierCandidateC7CV8.cjs');

const VERSION='v8-c7c2a-sealed-qa-runtime-v1';
const BASE64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const validUid=u=>typeof u==='string'&&u.length>=1&&u.length<=128
  &&!/[\x00-\x1f\x7f/]/.test(u);
const inactive=()=>Object.freeze({version:VERSION,qaBattleService:null,
  qaVerifierService:null,qaBattleEnabled:false,qaVerifierEnabled:false,
  qaOnly:true,nonEconomic:true,settlementEnabled:false});

function parseSealedQaConfigC7C2(env){
  if(!env||typeof env!=='object'||Array.isArray(env))
    throw new TypeError('Explicit environment configuration required');
  if(env.GAME_BATTLE_QA_ENABLED!=='true')return null;
  const raw=env.GAME_BATTLE_QA_ALLOW_UIDS;
  if(typeof raw!=='string'||!raw||raw.length>2048)
    throw new TypeError('Closed QA UID allowlist missing or oversized');
  const uids=raw.split(',').map(x=>x.trim());
  if(uids.length<1||uids.length>10||uids.some(x=>!validUid(x))
    ||new Set(uids).size!==uids.length)
    throw new TypeError('QA UID allowlist invalid or duplicated');
  const keyId=env.GAME_BATTLE_QA_ORIGIN_KEY_ID;
  validateKeyId(keyId);
  const encoded=env.GAME_BATTLE_QA_ORIGIN_KEY_B64;
  if(typeof encoded!=='string'||encoded.length<40||encoded.length>172
    ||!BASE64.test(encoded))
    throw new TypeError('QA origin signing key must be strict base64 from server config');
  const key=Buffer.from(encoded,'base64');
  if(key.toString('base64')!==encoded)
    throw new TypeError('QA origin signing key must be canonical base64');
  validateSealKey(key);
  const verifierEnabled=env.GAME_BATTLE_QA_VERIFIER_ENABLED==='true';
  if(env.GAME_BATTLE_QA_VERIFIER_ENABLED!==undefined
    &&!['true','false'].includes(env.GAME_BATTLE_QA_VERIFIER_ENABLED))
    throw new TypeError('Explicit QA verifier flag must be true or false');
  return {uids,keyId,key,verifierEnabled};
}

async function createSealedQaRuntimeC7C2({db,env={},catalogModule,schemaModule,now}={}){
  // A disabled QA feature MUST NOT parse secrets, access Firestore or enable
  // an HTTP route. Even GAME_BATTLE_QA_VERIFIER_ENABLED=true cannot override.
  const config=parseSealedQaConfigC7C2(env);
  if(!config)return inactive();
  if(!db||typeof db.runTransaction!=='function')
    throw new TypeError('Firestore transaction API required for sealed QA');
  const optionalClock=now===undefined?{}:{now};
  const qaBattleService=await createQaBattleAdmissionC7A({db,
    allowedUids:config.uids,originSealConfig:{keyId:config.keyId,key:config.key},
    catalogModule,schemaModule,...optionalClock});
  const qaVerifierService=config.verifierEnabled
    ?createBattleVerifierCandidateC7C1({db,enabled:true,allowedUids:config.uids,
      sealKeys:new Map([[config.keyId,config.key]]),...optionalClock})
    :null;
  return Object.freeze({version:VERSION,qaBattleService,qaVerifierService,
    qaBattleEnabled:true,qaVerifierEnabled:Boolean(qaVerifierService),
    qaOnly:true,nonEconomic:true,settlementEnabled:false});
}
module.exports=Object.freeze({VERSION,parseSealedQaConfigC7C2,createSealedQaRuntimeC7C2});
