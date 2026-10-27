'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseCandidateConfigC12,createCandidateStagingRuntimeC12}
  =require('../lib/productionCandidateRuntimeC12V8.cjs');
const UID='c12-test-uid';
const KEY=Buffer.alloc(32,0x3d);
const ENV={GAME_C12_CANDIDATE_ENABLED:'true',
  GAME_C12_CANDIDATE_STAGING_APPROVED:'true',
  GAME_C12_CANDIDATE_ALLOW_UIDS:UID,
  GAME_C12_CANDIDATE_HMAC_KEY_ID:'C12QAONLY_KEY',
  GAME_C12_CANDIDATE_HMAC_KEY_B64:KEY.toString('base64')};
const rejectsConfig=env=>assert.throws(()=>parseCandidateConfigC12(env),TypeError);
test('C12 disabled: no HMAC env read and no Firestore, settlement never connected',async()=>{
  assert.equal(parseCandidateConfigC12({GAME_C12_CANDIDATE_ENABLED:'false'}),null);
  const out=await createCandidateStagingRuntimeC12({env:{}});
  assert.deepEqual(out,{version:'v8-c12-candidate-staging-runtime-v1',
    enabled:false,service:null,candidateOnly:true,nonEconomic:true,settlementEnabled:false});
});
test('C12 requires two explicit operator gates; not a generic production reward flag',()=>{
  rejectsConfig({...ENV,GAME_C12_CANDIDATE_STAGING_APPROVED:'false'});
  rejectsConfig({...ENV,GAME_C12_CANDIDATE_STAGING_APPROVED:undefined});
  assert.equal(parseCandidateConfigC12(ENV).uids[0],UID);
});
test('C12 rejects open, wildcard, duplicate or injection UID allowlists',()=>{
  for(const list of ['','*',',',`${UID},${UID}`,'test/other','\u0000',
    Array(11).fill('u').map((u,i)=>u+i).join(','),'u,'.repeat(700)])
    rejectsConfig({...ENV,GAME_C12_CANDIDATE_ALLOW_UIDS:list});
});
test('C12 rejects weak HMAC or wrong encoding, no secret logging',()=>{
  for(const b64 of ['','A'.repeat(50),Buffer.alloc(20).toString('base64'),
    KEY.toString('base64').replace(/=$/,'')])
    rejectsConfig({...ENV,GAME_C12_CANDIDATE_HMAC_KEY_B64:b64});
  rejectsConfig({...ENV,GAME_C12_CANDIDATE_HMAC_KEY_ID:'bad'});
});
test('C12 cannot enable with missing Firestore; enabled runtime contains no C10 bridge',async()=>{
  await assert.rejects(createCandidateStagingRuntimeC12({env:ENV}),/Firestore/);
  const fakeDb={runTransaction:async()=>{throw Error('NO_DB_ACTION_EXPECTED');}};
  const res=await createCandidateStagingRuntimeC12({env:ENV,db:fakeDb,
    catalogModule:{},schemaModule:{}});
  assert.equal(res.enabled,true);assert.equal(res.service.enabled,true);
  assert.equal(res.settlementEnabled,false);
  assert.equal(Object.hasOwn(res.service,'issue'),false);
  assert.equal(Object.hasOwn(res.service,'readForSettlement'),false);
  assert.equal(Object.hasOwn(res.service,'settle'),false);
});
