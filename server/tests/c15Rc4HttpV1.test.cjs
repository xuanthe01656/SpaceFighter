'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {parseC15Rc4ReleaseGateConfig,createC15Rc4ReleaseGate}=require('../lib/c15Rc4ReleaseGateV1.cjs');
let createApp;try{({createApp}=require('../server.js'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const UID='c15_rc4_http_user',SID='88888888-8888-4888-8888-888888888888';
const body={battleId:'99999999-9999-4999-8999-999999999999',outcomeDigest:'a'.repeat(64),requestId:'c15_rc4_http_req_0001'};
const appSvc={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})};const auth={verifyIdToken:async()=>({uid:UID})};
const config=kill=>parseC15Rc4ReleaseGateConfig({GAME_C15_RC4_RELEASE_GATE_ENABLED:'true',GAME_C15_RC4_DEPLOYMENT_MODE:'staging',GAME_C15_RC4_GLOBAL_KILL_SWITCH:String(kill),GAME_C15_RC4_CANARY_UIDS:UID,GAME_C15_RC4_MIN_APP_VERSION:'1.2.1',GAME_C15_RC4_ALLOWED_BUILD_CHANNELS:'release-candidate'});
async function request(app,headers){const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/c15/settlement/claim`,{method:'POST',headers:{authorization:`Bearer ${'x'.repeat(48)}`,'x-game-session':SID,'content-type':'application/json',...headers},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}finally{await new Promise(resolve=>server.close(resolve));}}
function settlement(){const calls=[];return {calls,service:{enabled:true,settle:async(...args)=>{calls.push(args);return {version:'c15-rc3-settlement-v1',duplicate:false,battleId:body.battleId,receipt:{coins:450,experience:100,stars:1},stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false};}}};}

test('RC4 HTTP kill switch blocks before settlement transaction',{skip:!createApp},async()=>{const fake=settlement(),events=[],app=createApp('/none',{auth,service:appSvc,c15Rc3SettlementEnabled:true,c15Rc3SettlementService:fake.service,c15Rc4ReleaseGate:createC15Rc4ReleaseGate(config(true)),c15Rc4LogSink:event=>events.push(event)});
  const response=await request(app,{'x-sf-app-version':'1.2.1','x-sf-build-channel':'release-candidate'});assert.equal(response.status,423);assert.equal(response.body.code,'C15_RC4_KILL_SWITCH');assert.equal(fake.calls.length,0);assert.equal(events.length,1);assert.doesNotMatch(JSON.stringify(events[0]),new RegExp(UID));});
test('RC4 HTTP canary forwards exact verified settlement only after release admission',{skip:!createApp},async()=>{const fake=settlement(),events=[],app=createApp('/none',{auth,service:appSvc,c15Rc3SettlementEnabled:true,c15Rc3SettlementService:fake.service,c15Rc4ReleaseGate:createC15Rc4ReleaseGate(config(false)),c15Rc4LogSink:event=>events.push(event)});
  const response=await request(app,{'x-sf-app-version':'1.2.1','x-sf-build-channel':'release-candidate'});assert.equal(response.status,200);assert.equal(fake.calls.length,1);assert.equal(events[0].outcome,'ok');assert.equal(events[0].statusCode,200);});
