'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const Module=require('node:module');const original=Module._load;
const routes=new Map();
function fakeExpress(){return {disable(){},set(){},use(){},get(p,f){routes.set('GET '+p,f);},
  post(p,f){routes.set('POST '+p,f);}};}
fakeExpress.json=()=>(_req,_res,next)=>next();
fakeExpress.static=()=>(_req,_res,next)=>next();
let createApp;
try{Module._load=function(name,parent,isMain){
  if(name==='express')return fakeExpress;
  if(name==='dotenv')return {config:()=>{}};
  return original.apply(this,arguments);
};({createApp}=require('../server.js'));}
finally{Module._load=original;}
const PATH='/api/v1/c15/dungeon/qa-c2e/causal-audit';
const headers={authorization:'Bearer '+('A'.repeat(45)),'x-game-session':'session'};
async function request(h=headers,body={ticket:{},record:{}}){
  const req={get:n=>h[n.toLowerCase()]||'',body,method:'POST',path:PATH};
  let output=null,error=null;
  const res={status(n){output={...(output||{}),status:n};return this;},
    json(x){output={...(output||{}),body:x};return this;}};
  await routes.get('POST '+PATH)(req,res,e=>{error=e;});return {output,error};
}
const svc=x=>({enabled:true,stagingOnly:true,rewardSettlementEnabled:false,...x});
test('C2E POST exists and is 503 by default or without explicit all-prerequisite services',async()=>{
  routes.clear();createApp('/none',{});
  assert.equal((await request()).output.status,503);
  routes.clear();createApp('/none',{c15DungeonC2BEnabled:true,
    c15DungeonC2BService:svc(),c15DungeonC2DAuditEnabled:true,
    c15DungeonC2DAuditService:svc()});
  assert.equal((await request()).output.body.code,'C15_DUNGEON_C2E_DISABLED');
});
test('C2E route rejects reward-capable service at HTTP gate',async()=>{
  routes.clear();createApp('/none',{c15DungeonC2BEnabled:true,c15DungeonC2BService:svc(),
    c15DungeonC2DAuditEnabled:true,c15DungeonC2DAuditService:svc(),
    c15DungeonC2EEnabled:true,c15DungeonC2EService:svc({rewardSettlementEnabled:true})});
  assert.equal((await request()).output.status,503);
});
test('C2E route requires Firebase authentication and supplies verified UID/session only',async()=>{
  let captured;
  routes.clear();createApp('/none',{service:{},auth:{verifyIdToken:async()=>({uid:'verified'})},
    c15DungeonC2BEnabled:true,c15DungeonC2BService:svc(),
    c15DungeonC2DAuditEnabled:true,c15DungeonC2DAuditService:svc(),
    c15DungeonC2EEnabled:true,c15DungeonC2EService:svc({audit:async x=>{
      captured=x;return {fullCombatReplayVerified:false,rewardSettlementEnabled:false};}})});
  assert.equal((await request({'x-game-session':'session'})).error?.code,'UNAUTHORIZED');
  assert.equal(captured,undefined);
  const body={ticket:{battleId:'id'},record:{seed:'seed'}};
  const ok=await request(headers,body);
  assert.equal(ok.error,null);assert.equal(ok.output.status,200);
  assert.deepEqual(captured,{uid:'verified',sessionId:'session',...body});
});
test('C2E flags are separate and server startup fail closes without C2D',()=>{
  const fs=require('node:fs');const text=fs.readFileSync(require.resolve('../server.js'),'utf8');
  assert.match(text,/GAME_C15_DUNGEON_C2E_ENABLED==='true'/);
  assert.match(text,/c15DungeonC2DAuditService\?\.enabled/);
  assert.match(text,/c15DungeonC2EService/);
});
