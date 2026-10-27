'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {GameError}=require('../lib/economy.cjs');
let createApp;
try{({createApp}=require('../server.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const UID='c8_test_uid';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const HEADERS={authorization:`Bearer ${'x'.repeat(48)}`,'x-game-session':SID};
const fakeService={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})};
const fakeAuth={verifyIdToken:async() =>({uid:UID})};
async function request(app,endpoint,{headers={},body={},method='POST'}={}){
  const server=http.createServer(app);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const result=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{
      method,headers:{'content-type':'application/json',...headers},
      ...(method==='POST'?{body:JSON.stringify(body)}:{})});
    return {status:result.status,body:await result.json()};
  }finally{await new Promise(r=>server.close(r));}
}
test('C8 HTTP: QA abandoned route is OFF by default, before auth/DB access',
  {skip:!createApp},async()=>{
  const app=createApp('/no-client',{service:fakeService,auth:fakeAuth});
  const res=await request(app,'/api/v1/qa/battle/abandon',{headers:HEADERS,body:{battleId:BID}});
  assert.equal(res.status,503);assert.equal(res.body.code,'QA_BATTLE_DISABLED');
});
test('C8 HTTP: QA abandon requires valid Firebase token even when QA enabled',
  {skip:!createApp},async()=>{
  let calls=0;
  const app=createApp('/no-client',{service:fakeService,auth:fakeAuth,
    qaBattleEnabled:true,qaBattleService:{abandon:async()=>{calls++;return {};}}});
  const res=await request(app,'/api/v1/qa/battle/abandon',{body:{battleId:BID}});
  assert.equal(res.status,401);assert.equal(calls,0);
});
test('C8 HTTP: QA abandon forwards verified token UID and session, not payload UID',
  {skip:!createApp},async()=>{
  const calls=[];
  const app=createApp('/no-client',{service:fakeService,auth:fakeAuth,
    qaBattleEnabled:true,qaBattleService:{abandon:async(...args)=>{
      calls.push(args);return {qaOnly:true,settlementEnabled:false,abandoned:true};}}});
  const body={battleId:BID};const res=await request(app,'/api/v1/qa/battle/abandon',
    {headers:HEADERS,body});
  assert.equal(res.status,200);assert.equal(res.body.settlementEnabled,false);
  assert.deepEqual(calls,[[UID,SID,body]]);
});
test('C8 HTTP: QA simulation cannot call legacy battle finish to mint rewards',
  {skip:!createApp},async()=>{
  const calls=[];
  const app=createApp('/no-client',{service:{...fakeService,
    apply:async(_uid,_sid,req)=>{calls.push(req);throw new GameError('BATTLE_VERIFICATION_UNAVAILABLE','Cloud Battle locked',423);}},
    auth:fakeAuth,qaBattleEnabled:true,qaBattleService:{}});
  const res=await request(app,'/api/v1/command',{headers:HEADERS,
    body:{command:'battle.finish',payload:{victory:true,ticketId:BID},requestId:BID}});
  assert.equal(res.status,423);assert.equal(calls.length,1);
});
