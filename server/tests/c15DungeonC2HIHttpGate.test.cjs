'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
const routes=new Map();
const jsonLimits=new Map();
function express(){return {disable(){},set(){},use(path,fn){if(typeof path==='string'&&fn?.qaJsonLimit)jsonLimits.set(path,fn.qaJsonLimit);},
  get(p,fn){routes.set('GET '+p,fn);},post(p,fn){routes.set('POST '+p,fn);}};}
express.json=({limit}={})=>{const fn=(_req,_res,next)=>next();fn.qaJsonLimit=limit;return fn;};
express.static=()=> (_req,_res,next)=>next();
let createApp;
try{Module._load=function(name,parent,isMain){
  if(name==='express')return express;
  if(name==='dotenv')return {config:()=>{}};
  return original.apply(this,arguments);
};({createApp}=require('../server.js'));}
finally{Module._load=original;}
const PATH='/api/v1/c15/dungeon/qa-c2hi/same-session-ballistics';
const headers={authorization:'Bearer '+('X'.repeat(42)), 'x-game-session':'session'};
async function request(h=headers,body={ticket:{},record:{}}){
  const req={get:k=>h[k.toLowerCase()]||'',path:PATH,method:'POST',body};
  let output=null,error=null;
  const res={status(n){output={...(output||{}),status:n};return this;},
    json(x){output={...(output||{}),body:x};return this;}};
  await routes.get('POST '+PATH)(req,res,e=>{error=e;});
  return {output,error};
}
const svc=x=>({enabled:true,stagingOnly:true,rewardSettlementEnabled:false,...x});
const options=x=>({c15DungeonC2BEnabled:true,c15DungeonC2BService:svc(),
  c15DungeonC2DAuditEnabled:true,c15DungeonC2DAuditService:svc(),
  c15DungeonC2EEnabled:true,c15DungeonC2EService:svc(),...x});
test('C2HI HTTP route exists but is 503 by default',async()=>{
  routes.clear();createApp('/unused',{});
  const r=await request();assert.equal(r.output.status,503);
  assert.equal(r.output.body.code,'C15_DUNGEON_C2HI_DISABLED');
});
test('C2HI does not open if a prior C2B/C2D/C2E stage is missing',async()=>{
  routes.clear();createApp('/unused',{c15DungeonC2HIEnabled:true,c15DungeonC2HIService:svc()});
  assert.equal((await request()).output.status,503);
});
test('C2HI HTTP gate refuses reward-capable and non-staging services',async()=>{
  for(const extra of [{rewardSettlementEnabled:true},{stagingOnly:false}]){
    routes.clear();createApp('/unused',options({c15DungeonC2HIEnabled:true,
      c15DungeonC2HIService:svc(extra)}));
    assert.equal((await request()).output.status,503);
  }
});
test('C2HI endpoint requires Firebase auth and forwards verified actor/session',async()=>{
  let seen;
  routes.clear();createApp('/unused',options({service:{},
    auth:{verifyIdToken:async()=>({uid:'verified-firebase-uid'})},
    c15DungeonC2HIEnabled:true,c15DungeonC2HIService:svc({audit:async x=>{
      seen=x;return {sameSessionQaBindingVerified:true,
        fullCombatReplayVerified:false,rewardSettlementEnabled:false};}})}));
  const unauthorized=await request({'x-game-session':'session'});
  assert.equal(unauthorized.error?.code,'UNAUTHORIZED');
  assert.equal(seen,undefined);
  const body={ticket:{battleId:'A'},record:{sceneSeed:99}};
  const valid=await request(headers,body);
  assert.equal(valid.error,null);assert.equal(valid.output.status,200);
  assert.deepEqual(seen,{uid:'verified-firebase-uid',sessionId:'session',...body});
});
test('C2HI JSON size limit is isolated from normal 16kb game API',()=>{
  jsonLimits.clear();routes.clear();createApp('/unused',{});
  assert.equal(jsonLimits.get(PATH),'256kb');
  const content=require('node:fs').readFileSync(require.resolve('../server.js'),'utf8');
  assert.match(content,/GAME_C15_DUNGEON_C2HI_ENABLED==='true'/);
  assert.match(content,/C2E staging verified service required/);
  assert.match(content,/c15DungeonC2HIService/);
});
