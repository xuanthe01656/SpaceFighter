'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createQaBattleAdmissionC7A,QA_TTL_MS,QA_VERSION}=require('../lib/qaBattleAdmissionC7AV8.cjs');
const {createGameService}=require('../lib/gameService.cjs');
const T0=Date.parse('2026-10-26T07:00:00Z');
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const OTHER_SID='a223a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const UID='c7a_qa_allowlisted';
const REQUEST='c7a_start_req_0001';
const openBody=()=>({mode:'campaign',locationId:'alpha_stage_1',requestId:REQUEST});
const isCode=code=>err=>err?.code===code;
class Ref{
  constructor(db,path){this.db=db;this.path=path;}
  doc(id){return new Ref(this.db,`${this.path}/${id}`);}
  collection(id){return new Ref(this.db,`${this.path}/${id}`);}
  async get(){const x=this.db.data.get(this.path);return {exists:x!==undefined,data:()=>structuredClone(x)};}
}
class FakeDb{
  constructor(){this.data=new Map();this.operations=[];this.tail=Promise.resolve();}
  collection(path){return new Ref(this,path);}
  runTransaction(fn){
    const task=async()=>{
      const pending=[];let wrote=false;
      const t={get:async ref=>{if(wrote)throw Error('READ_AFTER_WRITE');return ref.get();},
        set:(ref,v)=>{wrote=true;pending.push({method:'set',path:ref.path,data:structuredClone(v)});},
        create:(ref,v)=>{wrote=true;pending.push({method:'create',path:ref.path,data:structuredClone(v)});}};
      const answer=await fn(t);
      for(const p of pending){
        if(p.method==='create'&&this.data.has(p.path))throw Error('DUPLICATE_TRACE');
        this.data.set(p.path,p.data);this.operations.push({method:p.method,path:p.path});
      }
      return answer;
    };
    const running=this.tail.then(task,task);this.tail=running.catch(()=>{});return running;
  }
}
let catalog,schema;
test.before(async()=>{
  [catalog,schema]=await Promise.all([
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href),
  ]);
});
function fixture(options={}){
  const db=new FakeDb();let clock=T0,issued=0;
  const data=schema.createDefaultCampaignData();
  data.loadout={...data.loadout,pilot:'pilot_alpha',aircraft:'ship_xwing',
    mainGun:'qa_rail',armor:'',wingman:'',drone:''};
  data.ownedPilots={...data.ownedPilots,pilot_alpha:{level:1,stars:1}};
  data.ownedAircrafts={...data.ownedAircrafts,ship_xwing:{level:1,stars:1}};
  data.items={...data.items,qa_rail:{type:'mainGun',baseId:options.gunId||'gun_rail',level:1,rarity:1}};
  const user=schema.createProfileDocument({coins:900,diamonds:130,energy:40,
    campaignData:data},{displayName:'QA',photoURL:''},T0);
  user.sessionId=SID;
  db.data.set(`users/${UID}`,user);
  return {
    db,user,clock:ms=>{if(ms!==undefined)clock=ms;return clock;},
    create:(override={})=>createQaBattleAdmissionC7A({db,allowedUids:override.allowedUids||[UID],
      now:()=>clock,uuidFactory:()=>BID.slice(0,-1)+(issued++%9+1),randomSeed:()=>11335577,
      catalogModule:catalog,schemaModule:schema}),
  };
}
const chunk=(battleId,startTick,frames=6)=>({chunk:{protocol:'pve-input-v1',battleId,startTick,
  frames:Array.from({length:frames},()=>({x:0,z:0}))}});

test('C7-A: explicit allowlist required before service can be constructed',async()=>{
  const f=fixture();
  await assert.rejects(createQaBattleAdmissionC7A({db:f.db,allowedUids:[],
    catalogModule:catalog,schemaModule:schema}),/allowlist/);
});
test('C7-A: server Firestore profile, pinned rules, seed and server time create only QA state',async()=>{
  const f=fixture(),svc=await f.create();
  const before=structuredClone(f.db.data.get(`users/${UID}`));
  const out=await svc.open(UID,SID,openBody());
  assert.equal(out.version,QA_VERSION);assert.equal(out.qaOnly,true);
  assert.equal(out.safeForCloudBattle,false);assert.equal(out.settlementEnabled,false);
  assert.equal(out.phase,'active');assert.equal(out.nextTick,0);
  assert.equal(out.expiresAtMs,T0+QA_TTL_MS);
  assert.equal(out.battleId,BID);assert.equal(out.protocol,'pve-input-v1');
  assert.equal(Object.hasOwn(out,'seed'),false);
  assert.equal(Object.hasOwn(out,'reward'),false);
  assert.equal(Object.hasOwn(out,'victory'),false);
  assert.deepEqual(f.db.data.get(`users/${UID}`),before);
  assert.equal(f.db.operations.some(x=>x.path===`users/${UID}`),false);
  const stored=f.db.data.get(`users/${UID}/qaBattleSessions/current`);
  assert.equal(stored.run.state.qaOnly,true);
  assert.equal(stored.run.encounter.waves.flatMap(w=>w.enemies).length,70);
  assert.equal(stored.run.foundation.journal.uid,UID);
});
test('C7-A: start request retry is idempotent without a second ticket/write',async()=>{
  const f=fixture(),svc=await f.create();
  const one=await svc.open(UID,SID,openBody());
  const n=f.db.operations.length;
  f.clock(T0+1000);
  const again=await svc.open(UID,SID,openBody());
  assert.equal(again.duplicate,true);assert.equal(again.battleId,one.battleId);
  assert.equal(f.db.operations.length,n);
  await assert.rejects(svc.open(UID,SID,{...openBody(),requestId:'c7a_start_req_0002'}),
    isCode('QA_BATTLE_ALREADY_ACTIVE'));
});
test('C7-A: all untrusted start manifest fields are rejected before Firestore',async()=>{
  const f=fixture(),svc=await f.create();
  for(const payload of [{...openBody(),seed:1},{...openBody(),victory:true},
    {...openBody(),waves:[]},{...openBody(),rewards:{coins:999}},
    {...openBody(),locationId:'alpha_stage_2'},
    {...openBody(),mode:'dungeon'}]){
    await assert.rejects(svc.open(UID,SID,payload),isCode('QA_OPEN_INVALID'));
  }
  assert.equal(f.db.operations.length,0);
});
test('C7-A: non-allowlisted user and wrong session fail closed',async()=>{
  const f=fixture(),svc=await f.create();
  await assert.rejects(svc.open('unlisted',SID,openBody()),isCode('QA_BATTLE_NOT_ALLOWED'));
  await assert.rejects(svc.open(UID,OTHER_SID,openBody()),isCode('SESSION_EXPIRED'));
  await assert.rejects(svc.open(UID,'fake',openBody()),isCode('SESSION_EXPIRED'));
  assert.equal(f.db.operations.length,0);
});
test('C7-A: missing/deleting account rejected before creating QA ticket',async()=>{
  const f=fixture(),svc=await f.create();
  f.db.data.set(`accountDeletionJobs/${UID}`,{version:1,status:'pending'});
  await assert.rejects(svc.open(UID,SID,openBody()),isCode('ACCOUNT_DELETION_PENDING'));
  f.db.data.delete(`accountDeletionJobs/${UID}`);
  f.db.data.get(`users/${UID}`).accountDeletion={status:'pending'};
  await assert.rejects(svc.open(UID,SID,openBody()),isCode('ACCOUNT_DELETION_PENDING'));
  assert.equal(f.db.operations.length,0);
});
test('C7-A: unsupported owned loadout is rejected; no QA ticket and no wallet mutation',async()=>{
  const f=fixture({gunId:'gun_laser'}),svc=await f.create();
  const before=structuredClone(f.db.data.get(`users/${UID}`));
  await assert.rejects(svc.open(UID,SID,openBody()),e=>/^(ALPHA_|SLICE_|FOUNDATION_)/.test(e?.code||''));
  assert.equal(f.db.operations.length,0);
  assert.deepEqual(f.db.data.get(`users/${UID}`),before);
});
test('C7-A: valid journal segment persists, survives thaw/freeze, status resumes, duplicate is no-op',async()=>{
  const f=fixture(),svc=await f.create();
  await svc.open(UID,SID,openBody());
  f.clock(T0+400);
  const q=chunk(BID,0,6);
  const one=await svc.ingest(UID,SID,q);
  assert.equal(one.nextTick,6);assert.equal(one.phase,'active');
  assert.equal(one.settlementEnabled,false);
  assert.equal(await svc.status(UID,SID).then(x=>x.nextTick),6);
  const n=f.db.operations.length;
  f.clock(T0+500);
  const duplicate=await svc.ingest(UID,SID,q);
  assert.equal(duplicate.duplicate,true);assert.equal(duplicate.nextTick,6);
  assert.equal(f.db.operations.length,n);
  f.clock(T0+650);
  const second=await svc.ingest(UID,SID,chunk(BID,6,6));
  assert.equal(second.nextTick,12);
  assert.equal(f.db.data.get(`users/${UID}/qaBattleTrace/${BID}/chunks/000000`).chunkDigest.length,64);
  assert.equal(f.db.data.get(`users/${UID}/qaBattleTrace/${BID}/chunks/000006`).nextTick,12);
  assert.equal(f.db.operations.filter(x=>x.path===`users/${UID}`).length,0);
});
test('C7-A: accepts no victory, rewards, forged checksum, other battle or invalid intent',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  const n=f.db.operations.length;f.clock(T0+500);
  for(const payload of [
    {...chunk(BID,0),victory:true},
    {chunk:{...chunk(BID,0).chunk,rewards:{coins:999}}},
    {chunk:{...chunk(BID,0).chunk,snapshotHash:'0'.repeat(64)}},
    chunk('aa9c29c8-39a3-4d9c-8a99-c39d998e9999',0),
    {chunk:{...chunk(BID,0).chunk,frames:[{x:500,z:0}]}}
  ])await assert.rejects(svc.ingest(UID,SID,payload),e=>
    ['QA_INPUT_INVALID','INPUT_CHUNK_INVALID','INPUT_WRONG_BATTLE','INPUT_FRAME_INVALID','QA_BATTLE_CONTEXT'].includes(e?.code));
  assert.equal(f.db.operations.length,n);
});
test('C7-A: rejects fast-forward, out-of-order, previously accepted batch changed',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  f.clock(T0+1);
  await assert.rejects(svc.ingest(UID,SID,chunk(BID,0,60)),isCode('INPUT_FAST_FORWARD'));
  f.clock(T0+400);
  await svc.ingest(UID,SID,chunk(BID,0,6));
  f.clock(T0+500);
  await assert.rejects(svc.ingest(UID,SID,chunk(BID,12,6)),isCode('INPUT_SEQUENCE_INVALID'));
  const changed=chunk(BID,0,6);changed.chunk.frames[0].x=1;
  await assert.rejects(svc.ingest(UID,SID,changed),isCode('INPUT_SEQUENCE_INVALID'));
});
test('C7-A: wrong session/UID/account switch and deletion block replay',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  f.clock(T0+400);
  await assert.rejects(svc.ingest(UID,OTHER_SID,chunk(BID,0)),isCode('SESSION_EXPIRED'));
  await assert.rejects(svc.ingest('other',SID,chunk(BID,0)),isCode('QA_BATTLE_NOT_ALLOWED'));
  f.db.data.get(`users/${UID}`).sessionId=OTHER_SID;
  await assert.rejects(svc.ingest(UID,SID,chunk(BID,0)),isCode('SESSION_EXPIRED'));
  f.db.data.get(`users/${UID}`).sessionId=SID;
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});
  await assert.rejects(svc.ingest(UID,SID,chunk(BID,0)),isCode('ACCOUNT_DELETION_PENDING'));
});
test('C7-A: ticket expires on server time; requests fail with zero economic changes',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  const wallet=structuredClone(f.db.data.get(`users/${UID}`).wallet);
  f.clock(T0+QA_TTL_MS);
  await assert.rejects(svc.ingest(UID,SID,chunk(BID,0)),isCode('QA_BATTLE_EXPIRED'));
  await assert.rejects(svc.status(UID,SID),isCode('QA_BATTLE_EXPIRED'));
  assert.deepEqual(f.db.data.get(`users/${UID}`).wallet,wallet);
});
test('C7-A: same authenticated UID new game session cannot replay old ticket',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  f.db.data.get(`users/${UID}`).sessionId=OTHER_SID;
  f.clock(T0+1200);
  const newer=await svc.open(UID,OTHER_SID,{...openBody(),requestId:'c7a_start_req_0003'});
  assert.equal(newer.duplicate,false);
  assert.notEqual(newer.battleId,BID);
  f.clock(T0+1700);
  await assert.rejects(svc.ingest(UID,OTHER_SID,chunk(BID,0)),
    isCode('QA_BATTLE_CONTEXT'));
});
test('C7-A: duplicate simultaneous QA admission does not write twice',async()=>{
  const f=fixture(),svc=await f.create();
  const both=await Promise.all([svc.open(UID,SID,openBody()),svc.open(UID,SID,openBody())]);
  assert.equal(both[0].battleId,both[1].battleId);
  assert.equal(both.filter(x=>x.duplicate).length,1);
  assert.equal(f.db.operations.filter(x=>x.path.endsWith('/qaBattleSessions/current')).length,1);
});
test('C7-A: local legacy battle.start/forged victory P0 remains locked',async()=>{
  const f=fixture(),game=await createGameService({db:f.db,now:()=>T0,
    configModule:catalog,schemaModule:schema});
  await assert.rejects(game.apply(UID,SID,{command:'battle.start',payload:{mode:'campaign',stage:1},
    requestId:'c7a_p0_req_001'}),isCode('BATTLE_VERIFICATION_UNAVAILABLE'));
  await assert.rejects(game.apply(UID,SID,{command:'battle.finish',payload:{victory:true,stars:3},
    requestId:'c7a_p0_req_002'}),isCode('BATTLE_VERIFICATION_UNAVAILABLE'));
});
test('C7-A/C7-C2A: QA routes default disabled, sealed UID gate and P0 preserved',()=>{
  const http=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  const game=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  const gate=fs.readFileSync(path.resolve(__dirname,'../lib/qaSealedRuntimeC7C2V8.cjs'),'utf8');
  assert.match(http,/GAME_BATTLE_QA_ENABLED==='true'/);
  assert.match(http,/createSealedQaRuntimeC7C2/);
  assert.match(gate,/GAME_BATTLE_QA_ALLOW_UIDS/);
  assert.match(gate,/GAME_BATTLE_QA_ORIGIN_KEY_B64/);
  assert.match(http,/qaBattleEnabled===true/);
  assert.match(http,/withAuth\(fn\)/);
  assert.match(http,/app\.post\('\/api\/v1\/qa\/battle\/open'/);
  assert.match(http,/app\.post\('\/api\/v1\/qa\/battle\/input'/);
  assert.match(game,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(game,/qaBattleAdmissionC7A/);
  assert.doesNotMatch(http,/battle\.finish\s*\(/);
});

// HTTP path exercises real Express only when dependencies are installed.
// The Windows full-server acceptance run must have ZERO skipped tests.
let createApp;
try{({createApp}=require('../server.js'));}catch(error){
  if(error.code!=='MODULE_NOT_FOUND')throw error;
}
const http=require('node:http');
async function send(app,method,route,{headers={},body}={}){
  const srv=http.createServer(app);
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  try{
    const payload=body===undefined?'':JSON.stringify(body);
    return await new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port:srv.address().port,
        method,path:route,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json',
          'Content-Length':Buffer.byteLength(payload)})}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',t=>text+=t);
        res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
      });
      req.on('error',reject);req.end(payload);
    });
  }finally{await new Promise(r=>srv.close(r));}
}
const fakeService={openSession:async()=>({}),getProfile:async()=>({}),
  apply:async()=>({}),changeName:async()=>({})};
const fakeAuth={verifyIdToken:async(token,checkRevoked)=>{
  assert.equal(checkRevoked,true);
  if(token==='bad_token_that_is_really_invalid_123456789'){
    const err=Error('invalid token');err.code='auth/invalid-id-token';throw err;
  }
  return {uid:UID};
}};
const authHeader={'Authorization':'Bearer valid_dummy_firebase_token_for_local_test',
  'X-Game-Session':SID};
test('C7-A HTTP: when disabled QA open/input/status return 503 even with token',
  {skip:!createApp},async()=>{
    const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth});
    for(const [method,route] of [['POST','open'],['POST','input'],['GET','status']]){
      const r=await send(app,method,`/api/v1/qa/battle/${route}`,{headers:authHeader,body:method==='POST'?{}:undefined});
      assert.equal(r.status,503);assert.equal(r.body.code,'QA_BATTLE_DISABLED');
    }
  });
test('C7-A HTTP: enabled QA still requires valid Firebase token',
  {skip:!createApp},async()=>{
    const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
      qaBattleEnabled:true,qaBattleService:{open:async()=>({})}});
    const noToken=await send(app,'POST','/api/v1/qa/battle/open',{body:openBody()});
    assert.equal(noToken.status,401);
    const bad=await send(app,'POST','/api/v1/qa/battle/open',
      {headers:{...authHeader,Authorization:'Bearer bad_token_that_is_really_invalid_123456789'},body:openBody()});
    assert.equal(bad.status,401);
  });
test('C7-A HTTP: enabled route forwards ONLY verified UID and server game-session header',
  {skip:!createApp},async()=>{
    const calls=[];
    const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
      qaBattleEnabled:true,qaBattleService:{open:async(...args)=>{
        calls.push(args);return {qaOnly:true,safeForCloudBattle:false,settlementEnabled:false};
      }}});
    const r=await send(app,'POST','/api/v1/qa/battle/open',
      {headers:authHeader,body:openBody()});
    assert.equal(r.status,200);assert.equal(r.body.qaOnly,true);
    assert.equal(r.body.settlementEnabled,false);
    assert.deepEqual(calls,[[UID,SID,openBody()]]);
  });
test('C7-A HTTP: invalid stage and Client rewards remain rejected by QA service',
  {skip:!createApp},async()=>{
    const f=fixture(),svc=await f.create();
    const app=createApp('/nonexistent',{service:fakeService,auth:fakeAuth,
      qaBattleEnabled:true,qaBattleService:svc});
    const start=await send(app,'POST','/api/v1/qa/battle/open',
      {headers:authHeader,body:{...openBody(),rewards:999}});
    assert.equal(start.status,400);assert.equal(start.body.code,'QA_OPEN_INVALID');
    const legacy=await send(app,'POST','/api/v1/qa/battle/open',
      {headers:authHeader,body:{...openBody(),mode:'dungeon'}});
    assert.equal(legacy.status,400);assert.equal(legacy.body.code,'QA_OPEN_INVALID');
    assert.equal(f.db.operations.length,0);
  });
test('C7-A: expired retry never resurrects stale ticket',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  f.clock(T0+QA_TTL_MS);
  await assert.rejects(svc.open(UID,SID,openBody()),isCode('QA_BATTLE_EXPIRED'));
  assert.equal(f.db.operations.length,2); // ticket + immutable C7-B2 server genesis
});
test('C7-A: tampered persisted QA checkpoint fails before new trace/write',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  const record=f.db.data.get(`users/${UID}/qaBattleSessions/current`);
  record.run.state.hp+=999;
  f.clock(T0+400);const n=f.db.operations.length;
  await assert.rejects(svc.ingest(UID,SID,chunk(BID,0)),isCode('SLICE_STATE_INVALID'));
  assert.equal(f.db.operations.length,n);
});
test('C7-A: exact pre/post user doc and wallet hashes unaffected across QA retry',async()=>{
  const f=fixture(),svc=await f.create(),before=JSON.stringify(f.db.data.get(`users/${UID}`));
  await svc.open(UID,SID,openBody());f.clock(T0+400);
  await svc.ingest(UID,SID,chunk(BID,0));f.clock(T0+450);
  await svc.ingest(UID,SID,chunk(BID,0));
  assert.equal(JSON.stringify(f.db.data.get(`users/${UID}`)),before);
  assert.equal([...f.db.data.keys()].filter(k=>k.endsWith('/operations')||k.includes('/operations/')).length,0);
});
