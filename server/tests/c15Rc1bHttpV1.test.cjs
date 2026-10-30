'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createC15Rc1bResourceCatalog}=require('../lib/c15Rc1bResourceCatalog.cjs');
let createApp;try{({createApp}=require('../server.js'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const UID='c15_http_user',SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const HEADERS={authorization:`Bearer ${'x'.repeat(48)}`,'x-game-session':SID};
const auth={verifyIdToken:async()=>({uid:UID})},service={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})};
async function request(app,uri,{method='GET',headers={},body=null}={}){const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}${uri}`,{method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,headers:response.headers,bytes:new Uint8Array(await response.arrayBuffer())};}
  finally{await new Promise(r=>server.close(r));}}
function runtime(){const calls=[];const svc={enabled:true};for(const method of ['open','upload','status','finalize','abandon'])svc[method]=async(...args)=>{
  calls.push({method,args});return {version:'c15-rc1b-runtime-v1',battleId:'92e2ee38-1cd8-4c5f-869b-56e31f6300a1',rc1bOnly:true,nonEconomic:true,
    safeForSettlement:false,settlementEnabled:false,cloudRewards:false};};return {svc,calls};}

test('C15 RC1B HTTP runtime is default OFF and has no settlement/reward route',{skip:!createApp},async()=>{
  const app=createApp('/no-client',{auth,service});const off=await request(app,'/api/v1/c15/battle/open',{method:'POST',headers:HEADERS,body:{}});
  assert.equal(off.status,503);assert.equal(JSON.parse(new TextDecoder().decode(off.bytes)).code,'C15_RC1B_DISABLED');
  for(const path of ['settle','reward','outcome'])assert.equal((await request(app,`/api/v1/c15/battle/${path}`,{method:'POST',headers:HEADERS,body:{}})).status,404);
});

test('C15 RC1B HTTP binds verified UID/session and exposes only non-economic methods',{skip:!createApp},async()=>{
  const f=runtime(),app=createApp('/no-client',{auth,service,c15Rc1bEnabled:true,c15Rc1bService:f.svc});
  const body={stageId:'alpha-stage-1',requestId:'c15_http_request_001',appVersion:'1.2.1',quality:'mobile-low',uid:'spoof'};
  const response=await request(app,'/api/v1/c15/battle/open',{method:'POST',headers:HEADERS,body});
  assert.equal(response.status,200);const json=JSON.parse(new TextDecoder().decode(response.bytes));assert.equal(json.nonEconomic,true);assert.equal(json.cloudRewards,false);
  assert.deepEqual(f.calls[0].args,[UID,SID,body]);
});

test('C15 RC1B immutable resource HTTP supports manifest, descriptor and byte ranges',{skip:!createApp},async()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://spacefighter.example'}),app=createApp('/no-client',{c15ResourceCatalog:catalog});
  const manifest=await request(app,'/api/v1/c15/resources/manifest');assert.equal(manifest.status,200);
  const parsed=JSON.parse(new TextDecoder().decode(manifest.bytes));assert.equal(parsed.manifest.manifestDigest,catalog.manifest.manifestDigest);
  const pack=catalog.manifest.packs.find(x=>x.id==='campaign-alpha-mobile-low');
  const descriptor=await request(app,`/api/v1/c15/resources/packs/${pack.id}/v${pack.revision}/descriptor.json`);assert.equal(descriptor.status,200);
  const desc=JSON.parse(new TextDecoder().decode(descriptor.bytes));const file=desc.files[0];
  const range=await request(app,new URL(file.url).pathname,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal(range.bytes.length,32);
  assert.equal(range.headers.get('content-range'),`bytes 0-31/${file.sizeBytes}`);
});
