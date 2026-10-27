'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {GameError}=require('../lib/economy.cjs');
let createApp;
try{({createApp}=require('../server.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const UID='c12_http_test_user',SID='c651ce11-300d-4516-b5f3-38c9c09714be';
const HEADERS={authorization:`Bearer ${'x'.repeat(48)}`,'x-game-session':SID};
const appSvc={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})};
const auth={verifyIdToken:async()=>({uid:UID})};
async function req(app,uri,{headers={},body=null,method='POST'}={}){
  const server=http.createServer(app);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const r=await fetch(`http://127.0.0.1:${server.address().port}${uri}`,{
      method,headers:{'content-type':'application/json',...headers},
      ...(body!==null?{body:JSON.stringify(body)}:{})});
    return {status:r.status,body:await r.json()};
  }finally{await new Promise(r=>server.close(r));}
}
const fakeCandidate=()=>{
  const calls=[];
  const svc={enabled:true};
  for(const method of ['open','ingest','status','audit','abandon']){
    svc[method]=async(...args)=>{calls.push({method,args});return {candidateOnly:true,
      nonEconomic:true,eligibleForSettlement:false,safeForCloudBattle:false,
      settlementEnabled:false,battleId:'12345678-1234-1234-1234-123456789012'};};
  }
  return {svc,calls};
};
test('C12 HTTP default OFF for every verb even if a different QA route is available',
  {skip:!createApp},async()=>{
  const app=createApp('/no-client',{auth,service:appSvc});
  for(const [p,method] of [['open','POST'],['input','POST'],['status','GET'],
    ['audit','POST'],['abandon','POST']]){
    const x=await req(app,`/api/v1/candidate/battle/${p}`,{method,headers:HEADERS,
      body:method==='POST'?{}:null});
    assert.equal(x.status,503);assert.equal(x.body.code,'C12_CANDIDATE_DISABLED');
  }
});
test('C12 HTTP rejects unauthenticated input before touching candidate service',
  {skip:!createApp},async()=>{
  const f=fakeCandidate(),app=createApp('/no-client',{auth,service:appSvc,
    candidateEnabled:true,candidateService:f.svc});
  const x=await req(app,'/api/v1/candidate/battle/open',{body:{}});
  assert.equal(x.status,401);assert.equal(f.calls.length,0);
});
test('C12 HTTP binds UID and X-Game-Session to verified auth, not request body',
  {skip:!createApp},async()=>{
  const f=fakeCandidate(),app=createApp('/no-client',{auth,service:appSvc,
    candidateEnabled:true,candidateService:f.svc});
  const body={mode:'campaign',locationId:'alpha_stage_1',requestId:'req_c12_123456',
    uid:'spoofed'};
  const x=await req(app,'/api/v1/candidate/battle/open',{body,headers:HEADERS});
  assert.equal(x.status,200);assert.equal(x.body.eligibleForSettlement,false);
  assert.deepEqual(f.calls[0].args,[UID,SID,body]);
});
test('C12 HTTP candidate audit has no routes for issue, settlement or outcomes',
  {skip:!createApp},async()=>{
  const f=fakeCandidate(),app=createApp('/no-client',{auth,service:appSvc,
    candidateEnabled:true,candidateService:f.svc});
  const x=await req(app,'/api/v1/candidate/battle/issue',{body:{},headers:HEADERS});
  const y=await req(app,'/api/v1/candidate/battle/settle',{body:{},headers:HEADERS});
  assert.equal(x.status,404);assert.equal(y.status,404);assert.equal(f.calls.length,0);
});
test('C12 HTTP retains P0 rejection through normal game command',
  {skip:!createApp},async()=>{
  const f=fakeCandidate(),app=createApp('/no-client',{auth,service:{...appSvc,
    apply:async()=>{throw new GameError('BATTLE_VERIFICATION_UNAVAILABLE','P0 locked',423);}},
    candidateEnabled:true,candidateService:f.svc});
  const x=await req(app,'/api/v1/command',{headers:HEADERS,body:{
    command:'battle.finish',payload:{victory:true},requestId:'mock'}});
  assert.equal(x.status,423);assert.equal(f.calls.length,0);
});
test('C12 sources: C10 issuer and settlement are never imported into candidate lane',()=>{
  const root=path.resolve(__dirname,'..');
  for(const name of ['server.js','lib/productionCandidateRuntimeC12V8.cjs',
    'lib/productionBattleCandidateC11V8.cjs']){
    const src=fs.readFileSync(path.join(root,name),'utf8');
    assert.doesNotMatch(src,/require\(['"]\.\/lib\/productionOutcomeAuthorityC10V8|require\(['"]\.\/productionOutcomeAuthorityC10V8|createC10SettlementBridge\(/);
  }
});
