'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const originalLoad=Module._load;
const routes=new Map();
function fakeExpress(){return {
  disable(){},set(){},use(){},get(p,f){routes.set('GET '+p,f);},
  post(p,f){routes.set('POST '+p,f)},
};}
fakeExpress.json=()=>(_req,_res,next)=>next();
fakeExpress.static=()=>(_req,_res,next)=>next();
let createApp;
try{Module._load=function(request,parent,isMain){
  if(request==='express')return fakeExpress;
  if(request==='dotenv')return {config:()=>{}};
  return originalLoad.apply(this,arguments);
};({createApp}=require('../server.js'));}
finally{Module._load=originalLoad;}
const PATH='/api/v1/c15/dungeon/qa-c2c2d/input-audit';
async function request(headers={},body={ticket:{},record:{}}){
  const req={get:n=>headers[n.toLowerCase()]||'',body,method:'POST',path:PATH};
  let output=null,error=null;
  const res={status(n){output={...(output||{}),status:n};return this;},
    json(x){output={...(output||{}),body:x};return this;}};
  const handler=routes.get('POST '+PATH);
  assert.equal(typeof handler,'function');
  await handler(req,res,e=>{error=e;});
  return {output,error};
}
const headers={authorization:'Bearer '+('A'.repeat(45)),
  'x-game-session':'qa_test_session'};
function service(extra={}){return {enabled:true,stagingOnly:true,
  rewardSettlementEnabled:false,...extra};}
test('C2D HTTP route exists OFF by default, including when C2B alone is on',async()=>{
  routes.clear();createApp('/none',{});
  assert.equal((await request(headers)).output.status,503);
  routes.clear();createApp('/none',{c15DungeonC2BEnabled:true,c15DungeonC2BService:service()});
  assert.equal((await request(headers)).output.body.code,'C15_DUNGEON_C2C2D_DISABLED');
});
test('C2D HTTP route refuses non-staging/reward-capable audit service',async()=>{
  for(const bad of [service({stagingOnly:false}),service({rewardSettlementEnabled:true})]){
    routes.clear();createApp('/none',{c15DungeonC2BEnabled:true,c15DungeonC2BService:service(),
      c15DungeonC2DAuditEnabled:true,c15DungeonC2DAuditService:bad});
    assert.equal((await request(headers)).output.status,503);
  }
});
test('C2D HTTP needs verified Firebase ID token before auditing',async()=>{
  let invoked=0;
  routes.clear();createApp('/none',{service:{},
    auth:{verifyIdToken:async()=>({uid:'qa_user'})},
    c15DungeonC2BEnabled:true,c15DungeonC2BService:service(),
    c15DungeonC2DAuditEnabled:true,
    c15DungeonC2DAuditService:service({audit:async()=>{invoked++;return {};}})});
  const r=await request({'x-game-session':'qa_test_session'});
  assert.equal(r.error?.code,'UNAUTHORIZED');assert.equal(invoked,0);
});
test('C2D HTTP uses verified UID and game session; never supplies claims or rewards',async()=>{
  let args;
  routes.clear();createApp('/none',{service:{},
    auth:{verifyIdToken:async()=>({uid:'verified_qa_user'})},
    c15DungeonC2BEnabled:true,c15DungeonC2BService:service(),
    c15DungeonC2DAuditEnabled:true,c15DungeonC2DAuditService:service({
      audit:async data=>{args=data;return {status:'DIAGNOSTIC_ONLY',
        trueApkServerParity:'NOT_VERIFIED',rewardSettlementEnabled:false};},
    })});
  const body={ticket:{battleId:'approved'},record:{source:'diagnostic'}};
  const r=await request(headers,body);
  assert.equal(r.error,null);assert.equal(r.output.status,200);
  assert.deepEqual(args,{uid:'verified_qa_user',sessionId:'qa_test_session',
    ticket:body.ticket,record:body.record});
  assert.equal(r.output.body.rewardSettlementEnabled,false);
});
test('C2D startup requires explicit independent flag and approved C2B service',()=>{
  const src=require('node:fs').readFileSync(require.resolve('../server.js'),'utf8');
  assert.match(src,/GAME_C15_DUNGEON_C2C2D_ENABLED==='true'/);
  const svc=require('node:fs').readFileSync(require.resolve('../lib/c15DungeonC2DInputAuditV1.cjs'),'utf8');
  assert.match(svc,/GAME_C15_DUNGEON_C2C2D_QA_APPROVED/);
  assert.match(src,/c15DungeonC2DAuditService/);
  assert.match(src,/c15DungeonC2BService\?\.enabled/);
});
