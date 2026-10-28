'use strict';
/** C12-PERF-A: staging-only transport & safe diagnostics regression. */
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {classifyGameApiError}=require('../lib/httpError.cjs');
const {CampaignAlphaC6CError}=require('../lib/combatCampaignAlphaC6CV8.cjs');
let createApp=null;
try{({createApp}=require('../server.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const HDR={authorization:`Bearer ${'a'.repeat(48)}`,'x-game-session':'d62e0e51-9825-4c26-b9cf-aa4095e4be50',origin:'http://localhost'};
const service={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})};
const auth={verifyIdToken:async(_token,checkRevoked)=>{
  assert.equal(checkRevoked,true,'Firebase revocation protection must not be bypassed');
  return {uid:'local_qa_uid'};
}};
async function request(app,uri,method='POST',headers=HDR,body={}){
  const listener=http.createServer(app);
  await new Promise(ok=>listener.listen(0,'127.0.0.1',ok));
  try{
    const res=await fetch(`http://127.0.0.1:${listener.address().port}${uri}`,{
      method,headers:{...(method==='OPTIONS'?{}:{'content-type':'application/json'}),...headers},
      ...(method==='POST'?{body:JSON.stringify(body)}:{})});
    const raw=await res.text();
    return {status:res.status,headers:res.headers,body:raw?JSON.parse(raw):null};
  }finally{await new Promise(ok=>listener.close(ok));}
}
function appOpts(overrides={}){
  return {service,auth,candidateEnabled:true,candidateService:{enabled:true,
    ingest:async()=>({candidateOnly:true,nonEconomic:true,eligibleForSettlement:false,
      settlementEnabled:false,replyType:'test-ack'}),...overrides}};
}
test('C12 known pinned-loadout denial maps to a specific safe 409',()=>{
  const bad=new CampaignAlphaC6CError('ALPHA_C6C_LOADOUT_UNSUPPORTED','internal policy message');
  assert.deepEqual(classifyGameApiError(bad),{status:409,
    code:'ALPHA_C6C_LOADOUT_UNSUPPORTED',
    message:'C12 QA requires Alpha/X-Wing/Rail at level 1 with no auxiliary equipment'});
  assert.deepEqual(classifyGameApiError(new CampaignAlphaC6CError('ALPHA_C6C_UNSUPPORTED','private')),
    {status:500,code:'INTERNAL_ERROR',message:'Server error'});
  assert.deepEqual(classifyGameApiError({code:'ALPHA_C6C_LOADOUT_UNSUPPORTED'}),
    {status:500,code:'INTERNAL_ERROR',message:'Server error'},
    'arbitrary objects must not get privileged error mapping');
});
test('C12 preflight cache is limited to approved input route and exact allowed Origin',
  {skip:!createApp},async()=>{
  const old=process.env.GAME_ALLOWED_ORIGINS;
  process.env.GAME_ALLOWED_ORIGINS='http://localhost,capacitor://localhost';
  try{
    const app=createApp('/no-client',appOpts());
    const pre={...HDR,'access-control-request-method':'POST',
      'access-control-request-headers':'authorization,content-type,x-game-session'};
    const a=await request(app,'/api/v1/candidate/battle/input','OPTIONS',pre);
    assert.equal(a.status,204);
    assert.equal(a.headers.get('access-control-max-age'),'600');
    assert.equal(a.headers.get('access-control-allow-origin'),'http://localhost');
    assert.match(a.headers.get('vary'),/Origin/);
    assert.match(a.headers.get('vary'),/Access-Control-Request-Method/);
    assert.match(a.headers.get('vary'),/Access-Control-Request-Headers/);
    const b=await request(app,'/api/v1/candidate/battle/open','OPTIONS',pre);
    assert.equal(b.status,204);
    assert.equal(b.headers.get('access-control-max-age'),null);
    const c=await request(app,'/api/v1/candidate/battle/input','OPTIONS',{
      ...pre,origin:'https://rogue.example'});
    assert.equal(c.status,403);
    assert.equal(c.headers.get('access-control-allow-origin'),null);
    assert.equal(c.headers.get('access-control-max-age'),null);
    const d=await request(app,'/api/v1/candidate/battle/input','POST',HDR,
      {chunk:{}});
    assert.equal(d.status,200);
    assert.equal(d.headers.get('access-control-max-age'),null);
    assert.equal(d.headers.get('cache-control'),'no-store');
  }finally{
    if(old===undefined)delete process.env.GAME_ALLOWED_ORIGINS;
    else process.env.GAME_ALLOWED_ORIGINS=old;
  }
});
test('C12 HTTP instrumentation requires explicit opt-in and does not leak identifiers',
  {skip:!createApp},async()=>{
  const old=process.env.GAME_ALLOWED_ORIGINS;
  process.env.GAME_ALLOWED_ORIGINS='http://localhost';
  try{
    const received=[];
    const app=createApp('/no-client',{...appOpts(),candidatePerfEnabled:true,
      candidatePerfSink:e=>received.push(e)});
    const good=await request(app,'/api/v1/candidate/battle/input');
    assert.equal(good.status,200);
    assert.equal(received.length,1);
    const perf=received[0];
    assert.equal(perf.event,'sf.c12.input.http.v1');
    assert.equal(perf.outcome,'ok');
    assert.equal(perf.status,200);
    for(const k of ['authVerifyMs','serviceMs','totalMs']) {
      assert.equal(typeof perf[k],'number');assert.ok(perf[k]>=0);
    }
    for(const forbidden of ['uid','session','token','body','headers','battleId'])
      assert.doesNotMatch(JSON.stringify(perf),new RegExp(forbidden,'i'));
    await request(app,'/api/v1/candidate/battle/input','OPTIONS',HDR);
    assert.equal(received.length,1,'preflight must not be logged as input');
    const off=[];
    const defaultOff=createApp('/no-client',{...appOpts(),
      candidatePerfSink:e=>off.push(e)});
    await request(defaultOff,'/api/v1/candidate/battle/input');
    assert.equal(off.length,0);
  }finally{
    if(old===undefined)delete process.env.GAME_ALLOWED_ORIGINS;
    else process.env.GAME_ALLOWED_ORIGINS=old;
  }
});
test('C12 known loadout refusal returns 409 and preserves auth + non-economic lane',
  {skip:!createApp},async()=>{
  const old=process.env.GAME_ALLOWED_ORIGINS;
  process.env.GAME_ALLOWED_ORIGINS='http://localhost';
  try{
    const app=createApp('/no-client',appOpts({
      open:async()=>{throw new CampaignAlphaC6CError('ALPHA_C6C_LOADOUT_UNSUPPORTED','private data');}
    }));
    const res=await request(app,'/api/v1/candidate/battle/open');
    assert.equal(res.status,409);
    assert.equal(res.body.code,'ALPHA_C6C_LOADOUT_UNSUPPORTED');
    assert.doesNotMatch(JSON.stringify(res.body),/private data/);
  }finally{
    if(old===undefined)delete process.env.GAME_ALLOWED_ORIGINS;
    else process.env.GAME_ALLOWED_ORIGINS=old;
  }
});
