'use strict';
/** C7-B2: independent full journal audit (strictly non-economic). */
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
  orderBy(field){assert.equal(field,'startTick');return new Query(this.db,this.path);}
}
class Query{
  constructor(db,path){this.db=db;this.path=path;}
  limit(n){this.max=n;return this;}
  get(){const prefix=this.path+'/';const docs=[...this.db.data.entries()]
    .filter(([k])=>k.startsWith(prefix)&&!k.slice(prefix.length).includes('/'))
    .sort((a,b)=>a[1].startTick-b[1].startTick).slice(0,this.max)
    .map(([k,v])=>({id:k.slice(prefix.length),data:()=>structuredClone(v)}));
    return {docs};}
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

const userKey=`users/${UID}`;
const receiptPath=`users/${UID}/qaBattleReceipts/${BID}`;
const auditPath=`users/${UID}/qaBattleAuditProofs/${BID}`;
const genesisPath=`users/${UID}/qaBattleGenesis/${BID}`;
const tracePath=start=>`users/${UID}/qaBattleTrace/${BID}/chunks/${String(start).padStart(6,'0')}`;
const finish=()=>({battleId:BID});
async function ready(){const f=await terminalFixture();await f.svc.finalize(UID,SID,finish());return f;}

test('C7-B2 ticket origin is stored separately by the server, create-only and non-economic',async()=>{
  const f=fixture(),svc=await f.create(),before=structuredClone(f.db.data.get(userKey));
  await svc.open(UID,SID,{mode:'campaign',locationId:'alpha_stage_1',requestId:'c7b2_open_request_0001'});
  const origin=f.db.data.get(genesisPath);
  assert.ok(origin);assert.equal(origin.uid,UID);assert.equal(origin.sessionId,SID);
  assert.equal(origin.qaOnly,true);assert.equal(origin.safeForCloudBattle,false);
  assert.equal(origin.nonEconomic,true);assert.equal(origin.settlementEnabled,false);
  assert.equal(origin.snapshot.equipment.mainGun.baseId,'gun_rail');
  assert.match(origin.genesisDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual(f.db.data.get(userKey),before);
  assert.deepEqual(f.db.operations.map(o=>o.path),[genesisPath,`users/${UID}/qaBattleSessions/current`]);
});
test('C7-B2 full 70-kill replay produces independent QA proof without wallet change',async()=>{
  const f=await ready(),user=structuredClone(f.db.data.get(userKey));
  const proof=await f.svc.audit(UID,SID,finish());
  const active=f.db.data.get(`users/${UID}/qaBattleSessions/current`);
  assert.equal(proof.duplicate,false);
  assert.equal(proof.phase,'lab-clear');assert.equal(proof.verifiedTicks,active.run.state.tick);
  assert.equal(proof.verifiedChunks,active.chunkCount);
  assert.equal(proof.replayMatched,true);assert.equal(proof.qaOnly,true);
  assert.equal(proof.safeForCloudBattle,false);assert.equal(proof.nonEconomic,true);
  assert.equal(proof.settlementEnabled,false);
  assert.match(proof.auditDigest,/^[a-f0-9]{64}$/);
  assert.equal(f.db.data.get(auditPath).auditDigest,proof.auditDigest);
  assert.deepEqual(f.db.data.get(userKey),user);
  assert.deepEqual(f.db.operations.map(o=>o.path),[receiptPath,auditPath]);
});
test('C7-B2 network retry and concurrent duplicate audits do not write twice',async()=>{
  const f=await ready();
  const [a,b]=await Promise.all([f.svc.audit(UID,SID,finish()),f.svc.audit(UID,SID,finish())]);
  assert.equal([a,b].filter(v=>v.duplicate).length,1);
  assert.equal(a.auditDigest,b.auditDigest);
  const again=await f.svc.audit(UID,SID,finish());
  assert.equal(again.duplicate,true);assert.equal(again.auditDigest,a.auditDigest);
  assert.equal(f.db.operations.filter(o=>o.path===auditPath).length,1);
});
test('C7-B2 requires finalized C7-B1 receipt before full audit',async()=>{
  const f=await terminalFixture();
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_RECEIPT_MISSING'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 refuses unsupported old sessions with no immutable genesis',async()=>{
  const f=await ready();f.db.data.delete(genesisPath);
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_GENESIS_MISSING'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 rejects missing initial or middle trace even when the terminal checkpoint is valid',async()=>{
  for(const toRemove of [0,40]){
    const f=await ready();f.db.data.delete(tracePath(toRemove));
    await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_TRACE_COUNT_INVALID'));
    assert.equal(f.db.data.has(auditPath),false);
  }
});
test('C7-B2 detects changed first frame even though the last chunk and receipt are intact',async()=>{
  const f=await ready(),tr=f.db.data.get(tracePath(0));
  tr.frames[0].x=tr.frames[0].x===127?-127:127;
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_TRACE_INVALID'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 rejects a forged first chunk even when attacker recalculates its chunk checksum',async()=>{
  const f=await ready(),tr=f.db.data.get(tracePath(0));
  tr.frames[0].x=tr.frames[0].x===127?-127:127;
  tr.chunkDigest=validateChunk({protocol:'pve-input-v1',battleId:BID,
    startTick:0,frames:tr.frames}).chunkDigest;
  // A weak last-checkpoint-only verification would not read this older chunk.
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_TRACE_INVALID'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 refuses orphaned extra chunks even if all required chunks still match',async()=>{
  const f=await ready();
  const copy=structuredClone(f.db.data.get(tracePath(0)));
  f.db.data.set(tracePath(999999),copy);
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_TRACE_COUNT_INVALID'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 fails on earlier chunk metadata tamper and changed server receive timing',async()=>{
  for(const mutate of [
    tr=>{tr.startTick=1;},tr=>{tr.endTick+=1;},
    tr=>{tr.receivedAtMs+=33;},tr=>{tr.journalDigest='f'.repeat(64);},
    tr=>{tr.terminalPhase='lab-clear';},
  ]){
    const f=await ready(),tr=f.db.data.get(tracePath(0));mutate(tr);
    await assert.rejects(f.svc.audit(UID,SID,finish()));
    assert.equal(f.db.data.has(auditPath),false);
  }
});
test('C7-B2 fails when genesis snapshot hash or seed is tampered',async()=>{
  for(const mutate of [g=>{g.snapshot.seed=99999;},g=>{g.snapshot.snapshotHash='f'.repeat(64);},
    g=>{g.policy.keyboardUnitsPer60HzFrame=100;}]){
    const f=await ready();mutate(f.db.data.get(genesisPath));
    await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_GENESIS_INVALID'));
    assert.equal(f.db.data.has(auditPath),false);
  }
});
test('C7-B2 re-derives the pinned encounter after attacker rehashes a changed genesis seed',async()=>{
  const f=await ready(),gen=f.db.data.get(genesisPath);
  gen.snapshot.seed=9899999;
  const canonical=o=>Array.isArray(o)?o.map(canonical):o&&typeof o==='object'
    ?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;
  const hash=(tag,data)=>createHash('sha256')
    .update(JSON.stringify([tag,canonical(data)])).digest('hex');
  const {snapshotHash,...snapshotFields}=gen.snapshot;
  gen.snapshot.snapshotHash=hash('sf-v8b2c1-snapshot',snapshotFields);
  const {genesisDigest,...genFields}=gen;
  gen.genesisDigest=hash('sf-c7b2-genesis',genFields);
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_GENESIS_INVALID'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 rejects forged server receipt and forged terminal state even after a successful C7-B1 finalize',async()=>{
  for(const mutate of [
    f=>{f.db.data.get(receiptPath).kills=999;},
    f=>{f.db.data.get(`users/${UID}/qaBattleSessions/current`).run.state.hp=999;},
  ]){
    const f=await ready();mutate(f);
    await assert.rejects(f.svc.audit(UID,SID,finish()));
    assert.equal(f.db.data.has(auditPath),false);
  }
});
test('C7-B2 denies wrong UID, session, switch, deletion and expired QA ticket',async()=>{
  const f=await ready();
  await assert.rejects(f.svc.audit(OTHER_UID,SID,finish()),failCode('QA_BATTLE_NOT_ALLOWED'));
  await assert.rejects(f.svc.audit(UID,WRONG_SID,finish()),failCode('SESSION_EXPIRED'));
  f.db.data.get(userKey).sessionId=WRONG_SID;
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('SESSION_EXPIRED'));
  f.db.data.get(userKey).sessionId=SID;
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('ACCOUNT_DELETION_PENDING'));
  f.db.data.delete(`accountDeletionJobs/${UID}`);
  f.now(T0+QA_TTL_MS);
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_BATTLE_EXPIRED'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 rejects forged client outcome fields and invalid battle IDs before Firestore writes',async()=>{
  const f=await ready();
  for(const body of [{...finish(),victory:true},{...finish(),reward:{coins:999}},
    {...finish(),stars:3},{...finish(),kills:70},{battleId:'invalid'},{},null])
    await assert.rejects(f.svc.audit(UID,SID,body),failCode('QA_AUDIT_INPUT_INVALID'));
  assert.equal(f.db.data.has(auditPath),false);
});
test('C7-B2 tampered persisted proof cannot be replayed as a duplicate success',async()=>{
  const f=await ready();await f.svc.audit(UID,SID,finish());
  f.db.data.get(auditPath).settlementEnabled=true;
  await assert.rejects(f.svc.audit(UID,SID,finish()),failCode('QA_AUDIT_PROOF_INVALID'));
  assert.equal(f.db.operations.filter(o=>o.path===auditPath).length,1);
});
test('C7-B2 duplicate proof is rejected if receipt or genesis has changed since issue',async()=>{
  for(const mutate of [f=>{f.db.data.get(receiptPath).kills+=1;},
    f=>{f.db.data.get(genesisPath).snapshot.seed+=1;}]){
    const f=await ready();await f.svc.audit(UID,SID,finish());
    mutate(f);
    await assert.rejects(f.svc.audit(UID,SID,finish()));
    assert.equal(f.db.operations.filter(o=>o.path===auditPath).length,1);
  }
});
test('C7-B2 legacy P0 still refuses forged victory and QA audit does not modify user wallet',async()=>{
  const f=await ready(),before=structuredClone(f.db.data.get(userKey));
  const service=await createGameService({db:f.db,now:()=>T0,
    configModule:catalog,schemaModule:schema});
  await f.svc.audit(UID,SID,finish());
  await assert.rejects(service.apply(UID,SID,{command:'battle.finish',
    payload:{victory:true,stars:3,auditId:BID},requestId:'c7b2_legacy_reward_attack_01'}),
  failCode('BATTLE_VERIFICATION_UNAVAILABLE'));
  assert.deepEqual(f.db.data.get(userKey),before);
  const api=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.match(api,/qaBattleEnabled===true/);
  assert.match(api,/app\.post\('\/api\/v1\/qa\/battle\/audit',withQa/);
});
let createApp;
try{({createApp}=require('../server.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const http=require('node:http');
async function send(app,route,{headers={},body}={}){
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await new Promise((resolve,reject)=>{
    const payload=JSON.stringify(body||finish());
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,method:'POST',path:route,
      headers:{...headers,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);
        res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
      });req.on('error',reject);req.end(payload);
  });}finally{await new Promise(resolve=>server.close(resolve));}
}
const auth={verifyIdToken:async(_token,checkRevoked)=>{
  assert.equal(checkRevoked,true);return {uid:UID};}};
const fakeGame={openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({}),changeName:async()=>({})};
const headers={'Authorization':'Bearer fake_firebase_token_for_qa_b2_audit_tests','X-Game-Session':SID};
test('C7-B2 HTTP is disabled by default',{skip:!createApp},async()=>{
  const app=createApp('/nonexistent',{service:fakeGame,auth});
  const out=await send(app,'/api/v1/qa/battle/audit',{headers,body:finish()});
  assert.equal(out.status,503);assert.equal(out.body.code,'QA_BATTLE_DISABLED');
});
test('C7-B2 HTTP requires Firebase token when QA flag is explicitly enabled',{skip:!createApp},async()=>{
  const f=await ready(),app=createApp('/nonexistent',{service:fakeGame,auth,
    qaBattleEnabled:true,qaBattleService:f.svc});
  const out=await send(app,'/api/v1/qa/battle/audit',{body:finish()});
  assert.equal(out.status,401);assert.equal(out.body.code,'UNAUTHORIZED');
});
test('C7-B2 HTTP returns non-economic full replay audit only to allowlisted authenticated UID',
  {skip:!createApp},async()=>{
    const f=await ready(),app=createApp('/nonexistent',{service:fakeGame,auth,
      qaBattleEnabled:true,qaBattleService:f.svc});
    const out=await send(app,'/api/v1/qa/battle/audit',{headers,body:finish()});
    assert.equal(out.status,200);assert.equal(out.body.ok,true);
    assert.equal(out.body.replayMatched,true);
    assert.equal(out.body.safeForCloudBattle,false);
    assert.equal(out.body.settlementEnabled,false);
    assert.equal(f.db.operations.filter(o=>o.path===auditPath).length,1);
  });
