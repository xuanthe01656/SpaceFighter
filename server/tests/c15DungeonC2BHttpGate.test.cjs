'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const originalLoad=Module._load;
const routes=new Map();
function fakeExpress(){return {
  disable(){},set(){},use(){},
  get(p,f){routes.set('GET '+p,f);},
  post(p,f){routes.set('POST '+p,f);},
};}
fakeExpress.json=()=>(_req,_res,next)=>next();
fakeExpress.static=()=>(_req,_res,next)=>next();
let createApp;
try{
  Module._load=function(request,parent,isMain){
    if(request==='express')return fakeExpress;
    if(request==='dotenv')return {config:()=>{}};
    return originalLoad.apply(this,arguments);
  };
  ({createApp}=require('../server.js'));
}finally{Module._load=originalLoad;}
const path='/api/v1/c15/dungeon/qa-c2b/ticket';
const SID='e40bebfd-3f3c-4a3e-8895-542ce9e4c519';
function makeRequest({headers={},body}={}){
  let response;
  const res={status(code){response={...(response||{}),status:code};return this;},
    json(payload){response={...(response||{}),body:payload};return this;}};
  const req={body:body||{dungeonId:'dung_taurus',roomId:'taurus_entry'},
    method:'POST',path,
    get:name=>headers[name.toLowerCase()]||''};
  return {req,res,reply:()=>response};
}
async function call(app,headers={}){
  const {req,res,reply}=makeRequest({headers});
  const handler=routes.get('POST '+path);assert.equal(typeof handler,'function');
  let error=null;
  await handler(req,res,e=>{error=e;});
  return {error,response:reply()};
}
const validHeaders={authorization:'Bearer '+('X'.repeat(45)),
  'x-game-session':SID};
test('HTTP C2B endpoint exists but remains 503 when service is not explicitly on',async()=>{
  routes.clear();createApp('/none',{});
  const r=await call(null,validHeaders);
  assert.equal(r.response.status,503);
  assert.equal(r.response.body.code,'C15_DUNGEON_C2B_DISABLED');
});
test('HTTP C2B refuses non-staging / reward-capable service despite flag',async()=>{
  for(const service of [{enabled:true,stagingOnly:false,rewardSettlementEnabled:false},
    {enabled:true,stagingOnly:true,rewardSettlementEnabled:true}]){
    routes.clear();createApp('/none',{c15DungeonC2BEnabled:true,c15DungeonC2BService:service});
    const r=await call(null,validHeaders);
    assert.equal(r.response.status,503);
  }
});
test('HTTP C2B requires Firebase ID token and session before service call',async()=>{
  let count=0;
  const service={enabled:true,stagingOnly:true,rewardSettlementEnabled:false,
    issue:async()=>{count++;return {};}};
  routes.clear();createApp('/none',{service:{},auth:{verifyIdToken:async()=>({uid:'qa_http_user'})},
    c15DungeonC2BEnabled:true,c15DungeonC2BService:service});
  const missing=await call(null,{'x-game-session':SID});
  assert.equal(missing.error?.code,'UNAUTHORIZED');
  assert.equal(count,0);
});
test('HTTP C2B forwards only verified Firebase UID + session + strict body',async()=>{
  let seen=null;
  const service={enabled:true,stagingOnly:true,rewardSettlementEnabled:false,
    issue:async(args)=>{seen=args;return {ticket:{qaOnly:true},rewardSettlementEnabled:false};}};
  routes.clear();createApp('/none',{service:{},
    auth:{verifyIdToken:async(_token,checkRevoked)=>{assert.equal(checkRevoked,true);
      return {uid:'verified_http_user'};}},
    c15DungeonC2BEnabled:true,c15DungeonC2BService:service});
  const r=await call(null,validHeaders);
  assert.equal(r.error,null);
  assert.equal(r.response.status,200);
  assert.equal(r.response.body.rewardSettlementEnabled,false);
  assert.deepEqual(seen,{uid:'verified_http_user',sessionId:SID,
    body:{dungeonId:'dung_taurus',roomId:'taurus_entry'}});
});
test('C2B staging module startup remains double-gated and no Dungeon settlement route changes',()=>{
  const fs=require('node:fs'),src=fs.readFileSync(require.resolve('../server.js'),'utf8');
  assert.match(src,/GAME_C15_DUNGEON_C2B_ENABLED==='true'/);
  assert.match(src,/createC15DungeonStagingTicketV2C14C2B/);
  assert.match(src,/c15DungeonC2BService,c15DungeonC2BEnabled/);
  assert.match(src,/\/api\/v1\/c15\/dungeon\/settlement\/claim/);
  assert.match(src,/C15_DUNGEON_SERVER_REPLAY_REQUIRED/);
});
