'use strict';
/** C7-B1: QA terminal receipt only. Never authorizes economy settlement. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {createQaBattleAdmissionC7A,QA_RECEIPT_VERSION,QA_TTL_MS}=require('../lib/qaBattleAdmissionC7AV8.cjs');
const {replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const {validateChunk}=require('../lib/combatInputJournalV8.cjs');
const {createGameService}=require('../lib/gameService.cjs');
const T0=Date.parse('2026-10-26T07:00:00Z');
const UID='c7b1_receipt_qa_user';
const OTHER_UID='c7b1_other_user';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const WRONG_SID='a223a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const failCode=code=>err=>err?.code===code;
const deepFreeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))deepFreeze(x);Object.freeze(v);}return v;};
class Ref {
  constructor(db,p){this.db=db;this.path=p;}
  doc(k){return new Ref(this.db,`${this.path}/${k}`);}
  collection(k){return new Ref(this.db,`${this.path}/${k}`);}
  async get(){const v=this.db.data.get(this.path);return {exists:v!==undefined,data:()=>structuredClone(v)};}
}
class FakeDb {
  constructor(){this.data=new Map();this.operations=[];this.tail=Promise.resolve();}
  collection(k){return new Ref(this,k);}
  runTransaction(fn){
    const task=async()=>{
      const writes=[];let wrote=false;
      const t={
        get:async ref=>{if(wrote)throw Error('FIRESTORE_READ_AFTER_WRITE');return ref.get();},
        create:(ref,v)=>{wrote=true;writes.push({method:'create',path:ref.path,data:structuredClone(v)});},
        set:(ref,v)=>{wrote=true;writes.push({method:'set',path:ref.path,data:structuredClone(v)});},
      };
      const result=await fn(t);
      for(const w of writes){
        if(w.method==='create'&&this.data.has(w.path))throw Error('FIRESTORE_ALREADY_EXISTS');
        this.data.set(w.path,w.data);this.operations.push({method:w.method,path:w.path});
      }
      return result;
    };
    const p=this.tail.then(task,task);this.tail=p.catch(()=>{});return p;
  }
}
let catalog,schema,golden;
test.before(async()=>{
  [catalog,schema]=await Promise.all([
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href),
  ]);
});
function fixture(){
  const db=new FakeDb();let current=T0;
  const campaign=schema.createDefaultCampaignData();
  campaign.loadout={...campaign.loadout,pilot:'pilot_alpha',aircraft:'ship_xwing',
    mainGun:'qa_rail',armor:'',wingman:'',drone:''};
  campaign.ownedPilots={...campaign.ownedPilots,pilot_alpha:{level:1,stars:1}};
  campaign.ownedAircrafts={...campaign.ownedAircrafts,ship_xwing:{level:1,stars:1}};
  campaign.items={...campaign.items,qa_rail:{type:'mainGun',baseId:'gun_rail',level:1,rarity:1}};
  const user=schema.createProfileDocument({coins:900,diamonds:100,energy:49,
    campaignData:campaign},{displayName:'QA',photoURL:''},T0);
  user.sessionId=SID;
  db.data.set(`users/${UID}`,user);
  return {db,now:x=>{if(x!==undefined)current=x;return current;},
    create:()=>createQaBattleAdmissionC7A({db,allowedUids:[UID],now:()=>current,
      uuidFactory:()=>BID,randomSeed:()=>11335577,catalogModule:catalog,schemaModule:schema})};
}
function framesForFullClear(initial){
  // This is the offline QA oracle from C6-E, NOT an Android touch trace.
  let run=initial;const frames=[];
  for(let tick=1;tick<=4500&&run.state.phase==='active';tick++){
    const me=run.foundation.checkpoint.position;
    const candidates=run.state.enemies.filter(e=>e.zUnits<8000&&e.zUnits>-19000);
    const enemy=(candidates.length?candidates:run.state.enemies)
      .slice().sort((a,b)=>b.zUnits-a.zUnits)[0];
    const dx=(enemy?.xUnits??0)-me.xUnits;
    let x=dx>60?-127:dx< -60?127:0;
    let threat=null;
    for(const b of run.state.enemyProjectiles){
      if(b.vzUnits<=0)continue;
      const ticks=(me.zUnits-b.zUnits)/b.vzUnits;
      if(ticks<0||ticks>18)continue;
      const projected=b.xUnits+ticks*b.vxUnits;
      if(Math.abs(projected-me.xUnits)<2100&&(!threat||ticks<threat.ticks))
        threat={projected,ticks};
    }
    if(threat)x=me.xUnits>threat.projected?-127:127;
    const frame={x,z:0};
    const chunk={protocol:'pve-input-v1',battleId:BID,startTick:run.state.tick,frames:[frame]};
    run=replayCombatSliceChunk({run,chunk,
      receivedAtMs:T0+Math.ceil((run.state.tick+1)*1000/30)+10}).run;
    frames.push(frame);
  }
  assert.equal(run.state.phase,'lab-clear','QA oracle failed to complete stage');
  assert.equal(run.state.kills,70);
  return frames;
}
async function terminalFixture(){
  if(!golden){
    const f=fixture(),svc=await f.create();await svc.open(UID,SID,
      {mode:'campaign',locationId:'alpha_stage_1',requestId:'c7b1_qa_open_req_01'});
    const first=structuredClone(f.db.data.get(`users/${UID}/qaBattleSessions/current`));
    const frames=framesForFullClear(deepFreeze(structuredClone(first.run)));
    let run=first.run,chunkCount=0;
    for(let i=0;i<frames.length;i+=40){
      const chunk={protocol:'pve-input-v1',battleId:BID,startTick:i,frames:frames.slice(i,i+40)};
      const receivedAtMs=T0+Math.ceil((i+chunk.frames.length)*1000/30)+10;
      const out=replayCombatSliceChunk({run:deepFreeze(structuredClone(run)),chunk,receivedAtMs});
      run=out.run;chunkCount++;
      const v=validateChunk(chunk);
      f.db.data.set(`users/${UID}/qaBattleTrace/${BID}/chunks/${String(i).padStart(6,'0')}`,
        {version:'v8-c7a-qa-admission-v1',battleId:BID,startTick:i,
          endTick:v.endTick,receivedAtMs,frames:chunk.frames,chunkDigest:v.chunkDigest,
          nextTick:run.state.tick,journalDigest:run.foundation.journal.digest,
          traceDigest:run.state.traceDigest,terminalPhase:run.state.phase});
    }
    assert.equal(run.state.phase,'lab-clear');
    f.db.data.set(`users/${UID}/qaBattleSessions/current`,{
      ...first,run:structuredClone(run),chunkCount,updatedAtMs:run.foundation.journal.lastReceivedAtMs});
    const at=run.foundation.journal.lastReceivedAtMs+150;
    assert.ok(at<T0+QA_TTL_MS);
    golden={data:[...f.db.data.entries()].map(([k,v])=>[k,structuredClone(v)]),at};
  }
  const f=fixture();f.db.data=new Map(golden.data.map(([k,v])=>[k,structuredClone(v)]));
  f.now(golden.at);return {...f,svc:await f.create()};
}
const receiptPath=`users/${UID}/qaBattleReceipts/${BID}`;
const finish=()=>({battleId:BID});
const userKey=`users/${UID}`;

test('C7-B1 refuses to finalize an active QA ticket and never touches economy',async()=>{
  const f=fixture(),svc=await f.create();await svc.open(UID,SID,
    {mode:'campaign',locationId:'alpha_stage_1',requestId:'c7b1_qa_open_req_01'});
  const original=structuredClone(f.db.data.get(userKey));
  await assert.rejects(svc.finalize(UID,SID,finish()),failCode('QA_RECEIPT_UNVERIFIED'));
  assert.deepEqual(f.db.data.get(userKey),original);
  assert.equal(f.db.data.has(receiptPath),false);
});
test('C7-B1 valid full QA replay yields immutable non-economic terminal receipt',async()=>{
  const f=await terminalFixture(),before=structuredClone(f.db.data.get(userKey));
  const receipt=await f.svc.finalize(UID,SID,finish());
  assert.equal(receipt.duplicate,false);
  assert.equal(receipt.version,QA_RECEIPT_VERSION);
  assert.equal(receipt.phase,'lab-clear');
  assert.equal(receipt.kills,70);assert.equal(receipt.contacts,0);
  assert.equal(receipt.safeForCloudBattle,false);
  assert.equal(receipt.settlementEnabled,false);
  assert.equal(receipt.nonEconomic,true);assert.equal(receipt.qaOnly,true);
  assert.match(receipt.receiptDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual(f.db.data.get(userKey),before);
  assert.deepEqual(f.db.operations.map(x=>x.path),[receiptPath]);
  const {duplicate,...stored}=receipt;
  assert.deepEqual(f.db.data.get(receiptPath),stored);
});
test('C7-B1 retry after network loss returns same receipt without writing twice',async()=>{
  const f=await terminalFixture();
  const first=await f.svc.finalize(UID,SID,finish());
  const again=await f.svc.finalize(UID,SID,finish());
  assert.equal(again.duplicate,true);assert.equal(again.receiptDigest,first.receiptDigest);
  assert.equal(f.db.operations.length,1);
  f.now(T0+QA_TTL_MS+1000); // duplicate is non-economic and safe after expiry
  const delayed=await f.svc.finalize(UID,SID,finish());
  assert.equal(delayed.duplicate,true);assert.equal(f.db.operations.length,1);
});
test('C7-B1 simultaneous finalize requests create only one immutable receipt',async()=>{
  const f=await terminalFixture();
  const both=await Promise.all([f.svc.finalize(UID,SID,finish()),f.svc.finalize(UID,SID,finish())]);
  assert.equal(both.filter(x=>x.duplicate).length,1);
  assert.equal(both[0].receiptDigest,both[1].receiptDigest);
  assert.equal(f.db.operations.length,1);
});
test('C7-B1 refuses client victory/stars/reward/HP and wrong IDs',async()=>{
  const f=await terminalFixture();
  for(const body of [{...finish(),victory:true},{...finish(),stars:3},
    {...finish(),reward:{coins:999999}},{...finish(),hp:999999},
    {battleId:'bad'},{},{battleId:BID.toUpperCase()}])
    await assert.rejects(f.svc.finalize(UID,SID,body),failCode('QA_RECEIPT_INPUT_INVALID'));
  assert.equal(f.db.operations.length,0);
});
test('C7-B1 denies wrong UID or session, session rotation and account deletion',async()=>{
  const f=await terminalFixture();
  await assert.rejects(f.svc.finalize(OTHER_UID,SID,finish()),failCode('QA_BATTLE_NOT_ALLOWED'));
  await assert.rejects(f.svc.finalize(UID,WRONG_SID,finish()),failCode('SESSION_EXPIRED'));
  f.db.data.get(userKey).sessionId=WRONG_SID;
  await assert.rejects(f.svc.finalize(UID,SID,finish()),failCode('SESSION_EXPIRED'));
  f.db.data.get(userKey).sessionId=SID;
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});
  await assert.rejects(f.svc.finalize(UID,SID,finish()),failCode('ACCOUNT_DELETION_PENDING'));
  assert.equal(f.db.operations.length,0);
});
test('C7-B1 refuses expired, missing ticket or missing last trace without mutating user',async()=>{
  for(const mutate of [
    f=>f.now(T0+QA_TTL_MS),
    f=>f.db.data.delete(`users/${UID}/qaBattleSessions/current`),
    f=>{const a=f.db.data.get(`users/${UID}/qaBattleSessions/current`);
      f.db.data.delete(`users/${UID}/qaBattleTrace/${BID}/chunks/${String(a.run.foundation.journal.lastChunkStart).padStart(6,'0')}`);},
  ]){
    const f=await terminalFixture(),before=structuredClone(f.db.data.get(userKey));
    mutate(f);
    await assert.rejects(f.svc.finalize(UID,SID,finish()));
    assert.equal(f.db.operations.length,0);
    assert.deepEqual(f.db.data.get(userKey),before);
  }
});
test('C7-B1 rejects forged final trace, state hash and journal',async()=>{
  for(const modify of [
    f=>{const a=f.db.data.get(`users/${UID}/qaBattleSessions/current`);
      const k=`users/${UID}/qaBattleTrace/${BID}/chunks/${String(a.run.foundation.journal.lastChunkStart).padStart(6,'0')}`;
      const trace=f.db.data.get(k);trace.frames[0].x=trace.frames[0].x===127?-127:127;},
    f=>{const a=f.db.data.get(`users/${UID}/qaBattleSessions/current`);a.run.state.kills=999;},
    f=>{const a=f.db.data.get(`users/${UID}/qaBattleSessions/current`);a.run.foundation.journal.digest='f'.repeat(64);},
    f=>{const a=f.db.data.get(`users/${UID}/qaBattleSessions/current`);a.run.state.safeForCloudBattle=true;},
  ]){
    const f=await terminalFixture();modify(f);
    await assert.rejects(f.svc.finalize(UID,SID,finish()));
    assert.equal(f.db.operations.length,0);
  }
});
test('C7-B1 independently rejects impossible lifecycle even if the QA state SHA is recomputed',async()=>{
  const f=await terminalFixture(),active=f.db.data.get(`users/${UID}/qaBattleSessions/current`);
  const fields={...active.run.state,kills:69,escaped:0};
  delete fields.stateDigest;
  const stateDigest=createHash('sha256').update(JSON.stringify(['sf-v8b-slice-state',fields])).digest('hex');
  active.run.state={...fields,stateDigest};
  await assert.rejects(f.svc.finalize(UID,SID,finish()),failCode('SLICE_LIFECYCLE_STATE_INVALID'));
  assert.equal(f.db.operations.length,0);
});
test('C7-B1 account switch blocks duplicate QA receipt reads',async()=>{
  const f=await terminalFixture();await f.svc.finalize(UID,SID,finish());
  f.db.data.get(userKey).sessionId=WRONG_SID;
  await assert.rejects(f.svc.finalize(UID,SID,finish()),failCode('SESSION_EXPIRED'));
  assert.equal(f.db.operations.length,1);
});
test('C7-B1 retries reject forged stored receipts even if receipt exists',async()=>{
  const f=await terminalFixture();await f.svc.finalize(UID,SID,finish());
  f.db.data.get(receiptPath).kills=900;
  await assert.rejects(f.svc.finalize(UID,SID,finish()),failCode('QA_RECEIPT_CONTEXT_INVALID'));
  assert.equal(f.db.operations.length,1);
});
test('C7-B1 never connects QA receipt to wallet, energy, missions or legacy victory',async()=>{
  const f=await terminalFixture(),before=structuredClone(f.db.data.get(userKey));
  const game=await createGameService({db:f.db,now:()=>T0,
    configModule:catalog,schemaModule:schema});
  await f.svc.finalize(UID,SID,finish());
  await assert.rejects(game.apply(UID,SID,{command:'battle.finish',
    payload:{victory:true,stars:3,receiptId:BID},requestId:'c7b1_fake_victory_req'}),
    failCode('BATTLE_VERIFICATION_UNAVAILABLE'));
  assert.deepEqual(f.db.data.get(userKey),before);
  const source=fs.readFileSync(path.join(__dirname,'../lib/qaBattleAdmissionC7AV8.cjs'),'utf8');
  assert.doesNotMatch(source,/t\.set\(userRef\(/);
  assert.match(source,/settlementEnabled:false/);
  assert.match(fs.readFileSync(path.join(__dirname,'../lib/gameService.cjs'),'utf8'),
    /BATTLE_VERIFICATION_UNAVAILABLE/);
});
test('C7-B1 route is isolated behind the same default-OFF QA + Firebase gate',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.match(src,/app\.post\('\/api\/v1\/qa\/battle\/receipt',withQa/);
  assert.match(src,/qaBattleEnabled===true/);
  assert.match(src,/GAME_BATTLE_QA_ENABLED==='true'/);
});

let createApp;
try{({createApp}=require('../server.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const http=require('node:http');
async function send(app,method,route,{headers={},body}={}){
  const srv=http.createServer(app);await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  try{return await new Promise((resolve,reject)=>{
    const payload=body===undefined?'':JSON.stringify(body);
    const req=http.request({hostname:'127.0.0.1',port:srv.address().port,method,
      path:route,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(payload)})}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);
        res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
      });req.on('error',reject);req.end(payload);
    });}finally{await new Promise(r=>srv.close(r));}
}
const auth={verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);return {uid:UID};}};
const fakeGame={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({}),changeName:async()=>({})};
const headers={'Authorization':'Bearer fake_firebase_token_for_qa_receipt_tests',
  'X-Game-Session':SID};
test('C7-B1 HTTP receipt disabled returns 503 by default',{skip:!createApp},async()=>{
  const app=createApp('/nonexistent',{service:fakeGame,auth});
  const r=await send(app,'POST','/api/v1/qa/battle/receipt',{headers,body:finish()});
  assert.equal(r.status,503);assert.equal(r.body.code,'QA_BATTLE_DISABLED');
});
test('C7-B1 HTTP receipt requires Firebase token when QA enabled',{skip:!createApp},async()=>{
  const f=await terminalFixture();
  const app=createApp('/nonexistent',{service:fakeGame,auth,
    qaBattleEnabled:true,qaBattleService:f.svc});
  const r=await send(app,'POST','/api/v1/qa/battle/receipt',{body:finish()});
  assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHORIZED');
});
test('C7-B1 HTTP receipt returns server-issued QA-only receipt',{skip:!createApp},async()=>{
  const f=await terminalFixture(),app=createApp('/nonexistent',{
    service:fakeGame,auth,qaBattleEnabled:true,qaBattleService:f.svc});
  const r=await send(app,'POST','/api/v1/qa/battle/receipt',{headers,body:finish()});
  assert.equal(r.status,200);assert.equal(r.body.ok,true);
  assert.equal(r.body.qaOnly,true);assert.equal(r.body.settlementEnabled,false);
  assert.equal(f.db.operations.length,1);
});
