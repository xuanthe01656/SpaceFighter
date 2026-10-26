'use strict';
/** C7-C2A: non-economic QA runtime requires server key + independent gates. */
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {GameError}=require('../lib/economy.cjs');
const {parseSealedQaConfigC7C2,createSealedQaRuntimeC7C2}
  =require('../lib/qaSealedRuntimeC7C2V8.cjs');
const UID='c7c2_qa_approved_uid';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const KEY_ID='c7c2-qa-signing-key-01';
const KEY=Buffer.from('9ab9ea3d1c5d83964f2fc34451901015a83764082afc97594aa0c885deb492c6','hex');
const qaEnv=(overrides={})=>({GAME_BATTLE_QA_ENABLED:'true',
  GAME_BATTLE_QA_ALLOW_UIDS:UID,GAME_BATTLE_QA_ORIGIN_KEY_ID:KEY_ID,
  GAME_BATTLE_QA_ORIGIN_KEY_B64:KEY.toString('base64'),
  GAME_BATTLE_QA_VERIFIER_ENABLED:'false',...overrides});
const fakeDb={runTransaction:async fn=>fn(),collection:()=>{throw Error('DB unexpected');}};

// HTTP is run with the real Express dependency on the full Windows checkout.
let createApp;
try{({createApp}=require('../server.js'));}catch(err){if(err.code!=='MODULE_NOT_FOUND')throw err;}
async function request(app,{url='/api/v1/qa/battle/verify',body={},headers={},method='POST'}={}){
  const server=http.createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{
      method,headers:{'content-type':'application/json',...headers},
      ...(method==='POST'?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  }finally{await new Promise(resolve=>server.close(resolve));}
}
const authHeader={authorization:`Bearer ${'a'.repeat(44)}`,'x-game-session':SID};
const fakeAuth={verifyIdToken:async()=>({uid:UID})};
const fakeService={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})};

// 1
 test('C7-C2A all QA flags OFF: no secrets parsed, no services',async()=>{
  const runtime=await createSealedQaRuntimeC7C2({env:{GAME_BATTLE_QA_ENABLED:'false',
    GAME_BATTLE_QA_VERIFIER_ENABLED:'true'},db:{}});
  assert.equal(runtime.qaBattleEnabled,false);assert.equal(runtime.qaVerifierEnabled,false);
  assert.equal(runtime.qaBattleService,null);assert.equal(runtime.qaVerifierService,null);
  assert.equal(runtime.settlementEnabled,false);
});
// 2
 test('C7-C2A never enable QA without UID allowlist',()=>{
  for(const raw of ['',',',`${UID},${UID}`,'bad/uid',Array(12).fill(UID).join(','),
    'abc\nxyz'])assert.throws(()=>parseSealedQaConfigC7C2(qaEnv({GAME_BATTLE_QA_ALLOW_UIDS:raw})),
      /allowlist|UID/);
});
// 3
 test('C7-C2A missing signing key is rejected; unsealed fallback forbidden',async()=>{
  const env=qaEnv();delete env.GAME_BATTLE_QA_ORIGIN_KEY_B64;
  assert.throws(()=>parseSealedQaConfigC7C2(env),/base64/);
  await assert.rejects(createSealedQaRuntimeC7C2({env,db:fakeDb}),/base64/);
});
// 4
 test('C7-C2A malformed or weak secret fails closed',()=>{
  for(const encoded of ['not-base64*!','AQID','eA==',
    Buffer.alloc(32,1).toString('base64').replace(/=+$/,''),
    Buffer.alloc(129,1).toString('base64'),
    '\n'+KEY.toString('base64')])assert.throws(()=>parseSealedQaConfigC7C2(
      qaEnv({GAME_BATTLE_QA_ORIGIN_KEY_B64:encoded})),/key|base64/);
});
// 5
 test('C7-C2A rejects unsafe keyId or tri-state verifier flag',()=>{
  assert.throws(()=>parseSealedQaConfigC7C2(qaEnv({GAME_BATTLE_QA_ORIGIN_KEY_ID:'../prod'})),/keyId/);
  for(const v of ['TRUE','1','yes',''])
    assert.throws(()=>parseSealedQaConfigC7C2(qaEnv({GAME_BATTLE_QA_VERIFIER_ENABLED:v})),/flag/);
});
// 6
 test('C7-C2A exact server signing bytes preserved and verifier separate OFF',()=>{
  const conf=parseSealedQaConfigC7C2(qaEnv());
  assert.deepEqual(conf.uids,[UID]);assert.equal(conf.keyId,KEY_ID);
  assert.deepEqual(conf.key,KEY);assert.equal(conf.verifierEnabled,false);
});
// 7
 test('C7-C2A sealed admission service can be built without enabling verifier',async()=>{
  const runtime=await createSealedQaRuntimeC7C2({env:qaEnv(),db:fakeDb});
  assert.equal(runtime.qaBattleEnabled,true);assert.equal(runtime.qaVerifierEnabled,false);
  assert.equal(typeof runtime.qaBattleService.open,'function');
  assert.equal(runtime.qaVerifierService,null);
  assert.equal(runtime.qaOnly,true);assert.equal(runtime.nonEconomic,true);
});
// 8
 test('C7-C2A verifier needs a separate explicit gate and is QA non-economic',async()=>{
  const runtime=await createSealedQaRuntimeC7C2({env:qaEnv({GAME_BATTLE_QA_VERIFIER_ENABLED:'true'}),db:fakeDb});
  assert.equal(runtime.qaBattleEnabled,true);assert.equal(runtime.qaVerifierEnabled,true);
  assert.equal(typeof runtime.qaVerifierService.inspect,'function');
  assert.equal(runtime.settlementEnabled,false);
});
// 9
 test('C7-C2A bad db cannot enable any QA runtime',async()=>{
  await assert.rejects(createSealedQaRuntimeC7C2({env:qaEnv(),db:{}}),/Firestore/);
});
// 10
 test('C7-C2A HTTP verifier route OFF even if a service object was injected',
   {skip:!createApp},async()=>{
  let calls=0;
  const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
    qaBattleEnabled:true,qaBattleService:{},qaVerifierService:{inspect:async()=>{calls++;return {};}}});
  const r=await request(app,{headers:authHeader,body:{battleId:BID}});
  assert.equal(r.status,503);assert.equal(r.body.code,'QA_VERIFIER_DISABLED');
  assert.equal(calls,0);
});
// 11
 test('C7-C2A HTTP verifier cannot work while admission is disabled',
   {skip:!createApp},async()=>{
  const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
    qaVerifierEnabled:true,qaVerifierService:{inspect:async()=>({})}});
  const r=await request(app,{headers:authHeader,body:{battleId:BID}});
  assert.equal(r.status,503);assert.equal(r.body.code,'QA_VERIFIER_DISABLED');
});
// 12
 test('C7-C2A HTTP verifier requires Firebase ID token even when QA gates are on',
   {skip:!createApp},async()=>{
  let calls=0;
  const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
    qaBattleEnabled:true,qaBattleService:{},qaVerifierEnabled:true,
    qaVerifierService:{inspect:async()=>{calls++;return {};}}});
  const r=await request(app,{body:{battleId:BID}});
  assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHORIZED');
  assert.equal(calls,0);
});
// 13
 test('C7-C2A HTTP verifier only forwards token UID, session header and body',
   {skip:!createApp},async()=>{
  const calls=[];
  const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
    qaBattleEnabled:true,qaBattleService:{},qaVerifierEnabled:true,
    qaVerifierService:{inspect:async(...args)=>{
      calls.push(args);return {qaOnly:true,settlementEnabled:false,
        productionOutcomeIssued:false,safeForCloudBattle:false};}}});
  const body={battleId:BID};const r=await request(app,{headers:authHeader,body});
  assert.equal(r.status,200);assert.equal(r.body.qaOnly,true);
  assert.equal(r.body.settlementEnabled,false);
  assert.deepEqual(calls,[[UID,SID,body]]);
});
// 14
 test('C7-C2A HTTP verifier passes invalid body to strict verifier (never manufactures victory)',
   {skip:!createApp},async()=>{
  const calls=[];
  const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
    qaBattleEnabled:true,qaBattleService:{},qaVerifierEnabled:true,
    qaVerifierService:{inspect:async(...args)=>{calls.push(args);throw new GameError(
      'C7C1_INPUT_INVALID','Rejected untrusted input',400);}}});
  const body={battleId:BID,victory:true};const r=await request(app,{headers:authHeader,body});
  assert.equal(r.status,400);assert.equal(r.body.code,'C7C1_INPUT_INVALID');
  assert.deepEqual(calls,[[UID,SID,body]]);
});
// 15
 test('C7-C2A HTTP verifier route is POST-only and cannot mutate via GET',
   {skip:!createApp},async()=>{
  const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
    qaBattleEnabled:true,qaBattleService:{},qaVerifierEnabled:true,
    qaVerifierService:{inspect:async()=>({qaOnly:true})}});
  const r=await request(app,{method:'GET'});
  assert.equal(r.status,404);
});
