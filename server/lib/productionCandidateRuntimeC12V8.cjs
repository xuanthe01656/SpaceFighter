'use strict';
/**
 * C12: closed allowlist, dedicated HMAC key and independent double opt-in for
 * a NON-ECONOMIC C11 candidate lane. No production settlement authority.
 * Never source a signing key, UID, or gate value from an HTTP payload.
 */
const {createProductionBattleCandidateC11}=require('./productionBattleCandidateC11V8.cjs');
const VERSION='v8-c12-candidate-staging-runtime-v1';
const KEY_ID=/^[A-Za-z0-9_-]{6,48}$/;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const validUid=u=>typeof u==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(u);
const inactive=()=>Object.freeze({version:VERSION,enabled:false,service:null,
  candidateOnly:true,nonEconomic:true,settlementEnabled:false});
function parseCandidateConfigC12(env){
  if(!env||typeof env!=='object'||Array.isArray(env))
    throw new TypeError('C12 explicit server environment required');
  if(env.GAME_C12_CANDIDATE_ENABLED!=='true')return null;
  // A deployment flag alone is insufficient; operator separately approves
  // the staging-only diagnostic. This DOES NOT approve Cloud Battle/rewards.
  if(env.GAME_C12_CANDIDATE_STAGING_APPROVED!=='true')
    throw new TypeError('C12 staging-only approval missing');
  const raw=env.GAME_C12_CANDIDATE_ALLOW_UIDS;
  if(typeof raw!=='string'||raw.length>2048||raw.length<1)
    throw new TypeError('C12 closed UID allowlist required');
  const uids=raw.split(',').map(s=>s.trim());
  if(uids.length<1||uids.length>10||uids.some(u=>!validUid(u))
    ||new Set(uids).size!==uids.length)
    throw new TypeError('C12 UID allowlist invalid');
  const keyId=env.GAME_C12_CANDIDATE_HMAC_KEY_ID;
  if(!KEY_ID.test(keyId||''))throw new TypeError('C12 key ID invalid');
  const b64=env.GAME_C12_CANDIDATE_HMAC_KEY_B64;
  if(typeof b64!=='string'||b64.length<44||b64.length>172
    ||!B64.test(b64))throw new TypeError('C12 HMAC key encoding invalid');
  const key=Buffer.from(b64,'base64');
  if(key.toString('base64')!==b64||key.length<32||key.length>128)
    throw new TypeError('C12 HMAC key length/encoding invalid');
  return Object.freeze({uids:Object.freeze(uids),keyId,key});
}
async function createCandidateStagingRuntimeC12({db,env={},catalogModule,
  schemaModule,now,uuidFactory,randomSeed}={}){
  const config=parseCandidateConfigC12(env);
  if(!config)return inactive();
  if(!db||typeof db.runTransaction!=='function')
    throw new TypeError('C12 Firestore transactional service required');
  const opts={db,enabled:true,allowedUids:config.uids,
    signingKeyId:config.keyId,signingKey:config.key,
    verificationKeys:new Map([[config.keyId,config.key]])};
  if(catalogModule!==undefined)opts.catalogModule=catalogModule;
  if(schemaModule!==undefined)opts.schemaModule=schemaModule;
  if(now!==undefined)opts.now=now;
  if(uuidFactory!==undefined)opts.uuidFactory=uuidFactory;
  if(randomSeed!==undefined)opts.randomSeed=randomSeed;
  const service=await createProductionBattleCandidateC11(opts);
  return Object.freeze({version:VERSION,enabled:true,service,
    candidateOnly:true,nonEconomic:true,settlementEnabled:false});
}
module.exports=Object.freeze({VERSION,parseCandidateConfigC12,
  createCandidateStagingRuntimeC12});
