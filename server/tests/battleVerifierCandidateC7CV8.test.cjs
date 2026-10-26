'use strict';
/** C7-C1: HMAC-sealed QA origin + read-only full replay; NEVER settlement. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {createQaBattleAdmissionC7A}=require('../lib/qaBattleAdmissionC7AV8.cjs');
const {createBattleVerifierCandidateC7C1}=require('../lib/battleVerifierCandidateC7CV8.cjs');
const {issueQaOriginSealC7C1,verifyQaOriginSealC7C1}=require('../lib/battleOriginSealC7CV8.cjs');
const {createVerifiedSettlementC7B2B}=require('../lib/verifiedSettlementC7B2BV8.cjs');
const {replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const {validateChunk}=require('../lib/combatInputJournalV8.cjs');
const T0=Date.parse('2026-10-26T07:00:00Z');
const UID='c7c1_approved_qa_uid',OTHER='c7c1_other_uid';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const OTHER_SID='a223a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const KEY_ID='c7c1-test-key-0001';
const KEY=Buffer.from('5bcf2b5f7e5a92db51d12f6a860e31455d986452a356ef815ca4f16accc9115b','hex');
const WRONG_KEY=Buffer.alloc(32,0x5b);
const failCode=code=>err=>err?.code===code;
const deepFreeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))deepFreeze(v);Object.freeze(x);}return x;};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=(tag,v)=>createHash('sha256').update(JSON.stringify([tag,canonical(v)])).digest('hex');
class Ref{
  constructor(db,p){this.db=db;this.path=p;}
  doc(k){return new Ref(this.db,`${this.path}/${k}`);}
  collection(k){return new Ref(this.db,`${this.path}/${k}`);}
  async get(){const v=this.db.data.get(this.path);return {exists:v!==undefined,data:()=>structuredClone(v)};}
  orderBy(key){assert.equal(key,'startTick');return new Query(this.db,this.path);}
}
class Query{
  constructor(db,p){this.db=db;this.path=p;}
  limit(n){this.max=n;return this;}
  async get(){const prefix=this.path+'/';return {docs:[...this.db.data.entries()]
    .filter(([k])=>k.startsWith(prefix)&&!k.slice(prefix.length).includes('/'))
    .sort((a,b)=>a[1].startTick-b[1].startTick).slice(0,this.max)
    .map(([k,v])=>({id:k.slice(prefix.length),data:()=>structuredClone(v)}))};}
}
class FakeDb{
  constructor(){this.data=new Map();this.operations=[];this.reads=0;this.tail=Promise.resolve();}
  collection(k){return new Ref(this,k);}
  runTransaction(fn){
    const task=async()=>{
      const writes=[];let wrote=false;
      const t={get:async ref=>{if(wrote)throw Error('READ_AFTER_WRITE');this.reads++;return ref.get();},
        create:(ref,v)=>{wrote=true;writes.push({kind:'create',path:ref.path,value:structuredClone(v)});},
        set:(ref,v)=>{wrote=true;writes.push({kind:'set',path:ref.path,value:structuredClone(v)});}};
      const result=await fn(t);
      if(writes.some(x=>x.kind==='create'&&this.data.has(x.path)))throw Error('DUPLICATE_CREATE');
      for(const x of writes){this.data.set(x.path,x.value);this.operations.push({kind:x.kind,path:x.path});}
      return result;
    };
    const promise=this.tail.then(task,task);this.tail=promise.catch(()=>{});return promise;
  }
}
let catalog,schema,golden;
test.before(async()=>{
  [catalog,schema]=await Promise.all([
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href),
  ]);
});
const userPath=`users/${UID}`;
const originPath=`${userPath}/qaBattleGenesis/${BID}`;
const sealPath=`${userPath}/qaBattleOriginSeals/${BID}`;
const receiptPath=`${userPath}/qaBattleReceipts/${BID}`;
const proofPath=`${userPath}/qaBattleAuditProofs/${BID}`;
const currentPath=`${userPath}/qaBattleSessions/current`;
const tracePath=start=>`${userPath}/qaBattleTrace/${BID}/chunks/${String(start).padStart(6,'0')}`;
const request=()=>({battleId:BID});
function fixture(){
  const db=new FakeDb();let clock=T0;
  const campaign=schema.createDefaultCampaignData();
  campaign.loadout={...campaign.loadout,pilot:'pilot_alpha',aircraft:'ship_xwing',
    mainGun:'qa_rail',armor:'',wingman:'',drone:''};
  campaign.ownedPilots={...campaign.ownedPilots,pilot_alpha:{level:1,stars:1}};
  campaign.ownedAircrafts={...campaign.ownedAircrafts,ship_xwing:{level:1,stars:1}};
  campaign.items={...campaign.items,qa_rail:{type:'mainGun',baseId:'gun_rail',level:1,rarity:1}};
  const profile=schema.createProfileDocument({coins:900,diamonds:100,energy:49,
    campaignData:campaign},{displayName:'QA',photoURL:''},T0);
  profile.sessionId=SID;
  db.data.set(userPath,profile);
  return {db,clock:t=>{if(t!==undefined)clock=t;return clock;},
    qa:options=>createQaBattleAdmissionC7A({db,allowedUids:[UID],now:()=>clock,
      uuidFactory:()=>BID,randomSeed:()=>11335577,catalogModule:catalog,
      schemaModule:schema,...options}),
    candidate:options=>createBattleVerifierCandidateC7C1({db,enabled:true,
      allowedUids:[UID],sealKeys:new Map([[KEY_ID,KEY]]),now:()=>clock,...options}),
  };
}
function framesForFullClear(initial){
  let run=initial;const frames=[];
  for(let tick=1;tick<=4500&&run.state.phase==='active';tick++){
    const me=run.foundation.checkpoint.position;
    const enemies=run.state.enemies.filter(e=>e.zUnits<8000&&e.zUnits>-19000);
    const enemy=(enemies.length?enemies:run.state.enemies)
      .slice().sort((a,b)=>b.zUnits-a.zUnits)[0];
    const dx=(enemy?.xUnits??0)-me.xUnits;
    let x=dx>60?-127:dx< -60?127:0;
    let threat=null;
    for(const bullet of run.state.enemyProjectiles){
      if(bullet.vzUnits<=0)continue;
      const steps=(me.zUnits-bullet.zUnits)/bullet.vzUnits;
      if(steps<0||steps>18)continue;
      const xHit=bullet.xUnits+steps*bullet.vxUnits;
      if(Math.abs(xHit-me.xUnits)<2100&&(!threat||steps<threat.steps))
        threat={xHit,steps};
    }
    if(threat)x=me.xUnits>threat.xHit?-127:127;
    const frame={x,z:0};
    run=replayCombatSliceChunk({run,chunk:{protocol:'pve-input-v1',battleId:BID,
      startTick:run.state.tick,frames:[frame]},
      receivedAtMs:T0+Math.ceil((run.state.tick+1)*1000/30)+10}).run;
    frames.push(frame);
  }
  assert.equal(run.state.phase,'lab-clear');assert.equal(run.state.kills,70);
  return frames;
}
async function sealedReady(){
  if(!golden){
    const f=fixture(),qa=await f.qa({originSealConfig:{keyId:KEY_ID,key:KEY}});
    const original=structuredClone(f.db.data.get(userPath));
    await qa.open(UID,SID,{mode:'campaign',locationId:'alpha_stage_1',requestId:'c7c1_qa_open_0000001'});
    const first=structuredClone(f.db.data.get(currentPath));
    const frames=framesForFullClear(deepFreeze(structuredClone(first.run)));
    for(let i=0;i<frames.length;i+=40){
      const part=frames.slice(i,i+40);
      f.clock(T0+Math.ceil((i+part.length)*1000/30)+10);
      await qa.ingest(UID,SID,{chunk:{protocol:'pve-input-v1',battleId:BID,
        startTick:i,frames:part}});
    }
    f.clock(f.clock()+150);
    const receipt=await qa.finalize(UID,SID,request());
    const proof=await qa.audit(UID,SID,request());
    assert.equal(receipt.phase,'lab-clear');assert.equal(proof.replayMatched,true);
    assert.deepEqual(f.db.data.get(userPath),original);
    golden={data:[...f.db.data.entries()].map(([k,v])=>[k,structuredClone(v)]),
      now:f.clock(),operations:f.db.operations.map(o=>({...o}))};
  }
  const f=fixture();f.db.data=new Map(golden.data.map(([k,v])=>[k,structuredClone(v)]));
  f.clock(golden.now);return f;
}
const clone=x=>structuredClone(x);
const change=(db,key,updater)=>{const c=clone(db.data.get(key));updater(c);db.data.set(key,c);};
test('C7-C1 default OFF, no Firestore read or write',async()=>{
  const f=fixture();const svc=createBattleVerifierCandidateC7C1({db:f.db});
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_VERIFIER_DISABLED'));
  assert.equal(f.db.reads,0);assert.equal(f.db.operations.length,0);
});
test('C7-C1 require explicit allowlist and 256-bit server-owned secret',()=>{
  const f=fixture();
  for(const obj of [{allowedUids:[UID]},
    {sealKeys:new Map([[KEY_ID,KEY]])},
    {allowedUids:[UID],sealKeys:new Map([[KEY_ID,Buffer.alloc(8)]])},
    {allowedUids:[UID],sealKeys:new Map([['invalid/key',KEY]])}])
    assert.throws(()=>createBattleVerifierCandidateC7C1({db:f.db,enabled:true,...obj}),/requires|keyId|identifier/i);
  assert.throws(()=>issueQaOriginSealC7C1({genesis:{},keyId:KEY_ID,key:Buffer.alloc(8)}),/32/);
});
test('C7-C1 signed origin emitted atomically and secret is never persisted',async()=>{
  const f=fixture(),qa=await f.qa({originSealConfig:{keyId:KEY_ID,key:KEY}});
  const before=clone(f.db.data.get(userPath));
  await qa.open(UID,SID,{mode:'campaign',locationId:'alpha_stage_1',requestId:'c7c1_qa_open_0000001'});
  assert.deepEqual(f.db.operations.map(x=>x.path),[originPath,sealPath,currentPath]);
  assert.equal(f.db.data.get(sealPath).keyId,KEY_ID);
  assert.equal(verifyQaOriginSealC7C1({genesis:f.db.data.get(originPath),
    seal:f.db.data.get(sealPath),keys:new Map([[KEY_ID,KEY]])}),true);
  assert.ok(!JSON.stringify([...f.db.data.entries()]).includes(KEY.toString('hex')));
  assert.deepEqual(f.db.data.get(userPath),before);
});
test('C7-C1 full 70-enemy replay returns only a NON-economic verification candidate',async()=>{
  const f=await sealedReady();const before=clone(f.db.data.get(userPath));
  const oldWrites=f.db.operations.length;
  const result=await f.candidate().inspect(UID,SID,request());
  assert.equal(result.observedQaPhase,'lab-clear');assert.ok(result.verifiedTicks>=100);
  assert.equal(result.fullReplayMatched,true);assert.equal(result.originSealAuthenticated,true);
  assert.equal(result.qaOnly,true);assert.equal(result.nonEconomic,true);
  assert.equal(result.safeForCloudBattle,false);assert.equal(result.settlementEnabled,false);
  assert.equal(result.productionOutcomeIssued,false);
  assert.equal(result.nativeTouchParityApproved,false);
  assert.equal(result.productionEncounterApproved,false);
  assert.equal('productionReceiptDigest' in result,false);
  assert.equal(result.verifiedChunks,f.db.data.get(currentPath).chunkCount);
  assert.deepEqual(f.db.data.get(userPath),before);
  assert.equal(f.db.operations.length,oldWrites);
});
test('C7-C1 different UID/session and payload injections blocked',async()=>{
  const f=await sealedReady(),svc=f.candidate();
  await assert.rejects(svc.inspect(OTHER,SID,request()),failCode('C7C1_NOT_ALLOWED'));
  await assert.rejects(svc.inspect(UID,OTHER_SID,request()),failCode('SESSION_EXPIRED'));
  for(const x of [{...request(),victory:true},{...request(),coins:99999},
    {battleId:'invalid'},null,{}])
    await assert.rejects(svc.inspect(UID,SID,x),failCode('C7C1_INPUT_INVALID'));
  assert.equal(f.db.operations.length,0);
});
test('C7-C1 rotated session, expired ticket, deletion job and tombstone all deny',async()=>{
  const f=await sealedReady(),svc=f.candidate();
  change(f.db,userPath,u=>{u.sessionId=OTHER_SID;});
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('SESSION_EXPIRED'));
  change(f.db,userPath,u=>{u.sessionId=SID;});
  f.clock(f.db.data.get(currentPath).expiresAtMs+1);
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_TICKET_INVALID'));
  f.clock(golden.now);
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('ACCOUNT_DELETION_PENDING'));
  f.db.data.delete(`accountDeletionJobs/${UID}`);
  change(f.db,userPath,u=>{u.accountDeletion={status:'pending'};});
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('ACCOUNT_DELETION_PENDING'));
});
test('C7-C1 old QA ticket without contemporaneous seal cannot be promoted',async()=>{
  const f=await sealedReady(),svc=f.candidate();f.db.data.delete(sealPath);
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_EVIDENCE_MISSING'));
});
test('C7-C1 modified origin + recomputed SHA cannot forge server HMAC',async()=>{
  const f=await sealedReady(),svc=f.candidate();
  change(f.db,originPath,g=>{
    g.snapshot.equipment.mainGun.level=9;
    const {snapshotHash,...s}=g.snapshot;
    g.snapshot.snapshotHash=digest('sf-v8b2c1-snapshot',s);
    const {genesisDigest,...fields}=g;
    g.genesisDigest=digest('sf-c7b2-genesis',fields);
  });
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_ORIGIN_SEAL_CONTEXT'));
});
test('C7-C1 forged HMAC, unknown key and wrong key reject',async()=>{
  const f=await sealedReady(),svc=f.candidate();
  change(f.db,sealPath,s=>{s.mac='0'.repeat(64);});
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_ORIGIN_SEAL_MAC'));
  const g=await sealedReady();change(g.db,sealPath,s=>{s.keyId='unknown-test-key-001';});
  await assert.rejects(g.candidate().inspect(UID,SID,request()),failCode('C7C1_ORIGIN_SEAL_KEY'));
  const h=await sealedReady();
  await assert.rejects(h.candidate({sealKeys:new Map([[KEY_ID,WRONG_KEY]])})
    .inspect(UID,SID,request()),failCode('C7C1_ORIGIN_SEAL_MAC'));
});
test('C7-C1 changed client frames and recalculated frame checksum reject independent replay',async()=>{
  const f=await sealedReady(),svc=f.candidate();
  change(f.db,tracePath(0),tr=>{
    tr.frames[0]={x:127,z:0};
    tr.chunkDigest=validateChunk({protocol:'pve-input-v1',battleId:BID,startTick:0,
      frames:tr.frames}).chunkDigest;
  });
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('QA_AUDIT_TRACE_INVALID'));
});
test('C7-C1 extra/missing trace docs and missing proof reject',async()=>{
  const f=await sealedReady(),svc=f.candidate();
  f.db.data.set(tracePath(999999),{startTick:999999});
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_TRACE_COUNT'));
  f.db.data.delete(tracePath(999999));f.db.data.delete(tracePath(0));
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_TRACE_COUNT'));
  const g=await sealedReady();g.db.data.delete(proofPath);
  await assert.rejects(g.candidate().inspect(UID,SID,request()),failCode('C7C1_EVIDENCE_MISSING'));
});
test('C7-C1 audit metadata tamper even with recomputed checksum fails replay equality',async()=>{
  const f=await sealedReady(),svc=f.candidate();
  change(f.db,proofPath,p=>{
    p.verifiedTicks+=1;
    const {auditDigest,...fields}=p;
    p.auditDigest=digest('sf-c7b2-qa-audit',fields);
  });
  await assert.rejects(svc.inspect(UID,SID,request()),failCode('C7C1_PROOF_MISMATCH'));
});
test('C7-C1 candidate cannot be used by disconnected settlement even if caller miswires callback',async()=>{
  const f=await sealedReady();const candidate=await f.candidate().inspect(UID,SID,request());
  const before=clone(f.db.data.get(userPath));
  const svc=createVerifiedSettlementC7B2B({db:f.db,enabled:true,allowedUids:[UID],
    trustedProductionVerifier:async()=>candidate,catalogModule:catalog,
    schemaModule:schema,now:()=>f.clock()});
  await assert.rejects(svc.settle(UID,SID,{battleId:BID,requestId:'c7c1_settle_attempt_001'}),
    failCode('SETTLEMENT_PRODUCTION_PROOF_REQUIRED'));
  assert.deepEqual(f.db.data.get(userPath),before);
  assert.ok(![...f.db.data.keys()].some(x=>x.includes('verifiedBattleSettlements')));
});
test('C7-C1 Firestore rule SOURCE is deny-by-default; not a deployed emulator/IAM verdict',()=>{
  const rules=fs.readFileSync(path.resolve(__dirname,'../../security/firestore.rules'),'utf8');
  const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../firebase.json'),'utf8'));
  assert.equal(config.firestore.rules,'security/firestore.rules');
  assert.match(rules,/match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
  assert.match(rules,/match \/\{child=\*\*\} \{ allow read, write: if false; \}/);
  assert.equal(/allow (create|update|write): if true/.test(rules),false);
});
test('C7-C1 production legacy P0 lock remains present and no HTTP/settlement integration',()=>{
  const service=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(server,/battleVerifierCandidateC7CV8|battleOriginSealC7CV8/);
  assert.doesNotMatch(server,/verifiedSettlementC7B2BV8/);
});
