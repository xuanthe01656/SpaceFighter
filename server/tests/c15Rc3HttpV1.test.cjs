'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
let createApp;
try{({createApp}=require('../server.js'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const UID='c15_rc3_http_user',SID='88888888-8888-4888-8888-888888888888';
const HEADERS={authorization:`Bearer ${'x'.repeat(48)}`,'x-game-session':SID};
const appSvc={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})};
const auth={verifyIdToken:async()=>({uid:UID})};
async function request(app,uri,{headers={},body=null,method='POST'}={}){
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}${uri}`,{
      method,headers:{'content-type':'application/json',...headers},...(body===null?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};}
  finally{await new Promise(resolve=>server.close(resolve));}
}
function fakeSettlement(){const calls=[];return {calls,service:{enabled:true,settle:async(...args)=>{calls.push(args);return {
  version:'c15-rc3-settlement-v1',duplicate:false,battleId:args[2].battleId,receipt:{coins:450,experience:100,stars:1},
  stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false};}}};}

test('C15 RC3 settlement HTTP is default OFF even when a service object is injected',{skip:!createApp},async()=>{
  const fake=fakeSettlement(),app=createApp('/no-client',{auth,service:appSvc,c15Rc3SettlementService:fake.service});
  const response=await request(app,'/api/v1/c15/settlement/claim',{headers:HEADERS,body:{}});
  assert.equal(response.status,503);assert.equal(response.body.code,'C15_RC3_SETTLEMENT_DISABLED');assert.equal(fake.calls.length,0);
});
test('C15 RC3 settlement HTTP authenticates before touching settlement service',{skip:!createApp},async()=>{
  const fake=fakeSettlement(),app=createApp('/no-client',{auth,service:appSvc,c15Rc3SettlementEnabled:true,c15Rc3SettlementService:fake.service});
  const response=await request(app,'/api/v1/c15/settlement/claim',{body:{}});
  assert.equal(response.status,401);assert.equal(fake.calls.length,0);
});
test('C15 RC3 settlement HTTP binds verified UID and game session and forwards exact body',{skip:!createApp},async()=>{
  const fake=fakeSettlement(),app=createApp('/no-client',{auth,service:appSvc,c15Rc3SettlementEnabled:true,c15Rc3SettlementService:fake.service});
  const body={battleId:'99999999-9999-4999-8999-999999999999',outcomeDigest:'a'.repeat(64),requestId:'c15_rc3_http_req_0001'};
  const response=await request(app,'/api/v1/c15/settlement/claim',{headers:HEADERS,body});
  assert.equal(response.status,200);assert.equal(response.body.ok,true);assert.equal(response.body.productionSettlementEnabled,false);
  assert.deepEqual(fake.calls,[ [UID,SID,body] ]);
});
test('C15 RC3 settlement exposes POST claim only and no generic production settle route',{skip:!createApp},async()=>{
  const fake=fakeSettlement(),app=createApp('/no-client',{auth,service:appSvc,c15Rc3SettlementEnabled:true,c15Rc3SettlementService:fake.service});
  const get=await request(app,'/api/v1/c15/settlement/claim',{method:'GET',headers:HEADERS});
  const legacy=await request(app,'/api/v1/battle/settle',{headers:HEADERS,body:{}});
  assert.equal(get.status,404);assert.equal(legacy.status,404);assert.equal(fake.calls.length,0);
});
