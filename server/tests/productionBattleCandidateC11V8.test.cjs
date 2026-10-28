'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createProductionBattleCandidateC11,VERSION,ORIGIN_VERSION,TTL_MS}
  =require('../lib/productionBattleCandidateC11V8.cjs');
const {replayCandidateC11}=require('../lib/productionReplayAuditC11V8.cjs');
const {createProductionOutcomeAuthorityC10}=require('../lib/productionOutcomeAuthorityC10V8.cjs');
const {replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const T0=Date.parse('2026-10-27T01:00:00.000Z');
const UID='c11_approved_test_user';
const SID='a32ea84d-9f84-4af1-836a-837674ca8432';
const SID2='0c3ae913-16fb-4f14-a64e-0985d44b6a03';
const BID='e9c0f3b3-80ce-4eb1-a7b9-147b126590ad';
const KEY=Buffer.alloc(32,0x37);
const REQ='c11_open_req_001';
const openBody=()=>({mode:'campaign',locationId:'alpha_stage_1',requestId:REQ});
const chunk=(tick,n=6,frame={x:0,z:0})=>({chunk:{protocol:'pve-input-v1',battleId:BID,
  startTick:tick,frames:Array.from({length:n},()=>({...frame}))}});
const isCode=code=>err=>err?.code===code;
const deepFreeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))deepFreeze(v);Object.freeze(x);}return x;};
class Query {
  constructor(db,p){this.db=db;this.path=p;this.max=Number.MAX_SAFE_INTEGER;}
  orderBy(field){if(field!=='startTick')throw Error('UNSUPPORTED_ORDER');return this;}
  limit(n){this.max=n;return this;}
  async get(){const docs=[...this.db.data].filter(([p])=>p.startsWith(this.path+'/')
    &&p.slice(this.path.length+1).indexOf('/')===-1)
    .map(([p,v])=>({id:p.slice(p.lastIndexOf('/')+1),data:()=>structuredClone(v),raw:v}))
    .sort((a,b)=>a.raw.startTick-b.raw.startTick).slice(0,this.max);
    return {docs:docs.map(({id,data})=>({id,data}))};}
}
class Ref{
  constructor(db,p){this.db=db;this.path=p;}
  doc(id){return new Ref(this.db,this.path+'/'+id);}
  collection(id){return new Ref(this.db,this.path+'/'+id);}
  orderBy(field){return new Query(this.db,this.path).orderBy(field);}
  async get(){const x=this.db.data.get(this.path);return {exists:x!==undefined,data:()=>structuredClone(x)};}
}
class FakeDb{
  constructor(){this.data=new Map();this.ops=[];this.tail=Promise.resolve();}
  collection(k){return new Ref(this,k);}
  runTransaction(work){
    const perform=async()=>{
      const pending=[];let writing=false;
      const t={get:async ref=>{if(writing)throw Error('READ_AFTER_WRITE');return ref.get();},
        create:(ref,value)=>{writing=true;pending.push({kind:'create',path:ref.path,value:structuredClone(value)});},
        set:(ref,value)=>{writing=true;pending.push({kind:'set',path:ref.path,value:structuredClone(value)});}};
      const answer=await work(t);
      for(const op of pending){if(op.kind==='create'&&this.data.has(op.path))
        throw Error('DUPLICATE_CREATE');}
      for(const op of pending){this.data.set(op.path,op.value);
        this.ops.push({kind:op.kind,path:op.path});}
      return answer;
    };
    const current=this.tail.then(perform,perform);this.tail=current.catch(()=>{});
    return current;
  }
}
let catalog,schema;
test.before(async()=>{
  [catalog,schema]=await Promise.all([
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href)]);
});
function fixture(options={}){
  const db=new FakeDb();let current=T0;
  const data=schema.createDefaultCampaignData();
  data.loadout={...data.loadout,pilot:'pilot_alpha',aircraft:'ship_xwing',
    mainGun:'qa_rail',armor:'',wingman:'',drone:''};
  data.ownedPilots={...data.ownedPilots,pilot_alpha:{level:1,stars:1}};
  data.ownedAircrafts={...data.ownedAircrafts,ship_xwing:{level:1,stars:1}};
  data.items={...data.items,qa_rail:{type:'mainGun',baseId:options.gunId||'gun_rail',level:1,rarity:1}};
  const user=schema.createProfileDocument({coins:1200,diamonds:200,energy:40,
    campaignData:data},{displayName:'Test',photoURL:''},T0);
  user.sessionId=SID;
  db.data.set(`users/${UID}`,user);
  const create=(opt={})=>createProductionBattleCandidateC11({db,enabled:true,
    allowedUids:opt.allowedUids||[UID],signingKeyId:'test_key_c11',
    signingKey:KEY,verificationKeys:new Map([['test_key_c11',KEY]]),
    uuidFactory:()=>BID,randomSeed:()=>11335577,now:()=>current,
    catalogModule:catalog,schemaModule:schema,...opt});
  return {db,user,create,setClock:t=>{current=t;},clock:()=>current,
    userPath:`users/${UID}`,
    ticketPath:`users/${UID}/prodBattleCandidateSessions/current`,
    originPath:`users/${UID}/prodBattleCandidateOrigins/${BID}`,
    auditPath:`users/${UID}/prodBattleCandidateAudits/${BID}`,
    tracePrefix:`users/${UID}/prodBattleCandidateTrace/${BID}/chunks/`};
}
async function opened(){const f=fixture(),svc=await f.create();await svc.open(UID,SID,openBody());
  return {f,svc};}
// Replaying all 70 kills is expensive; use a deterministic active-state aiming
// test oracle only in ONE full-path test, never a client input authority.
async function finishGolden(f,svc,kind='clear'){
  let cycles=0;
  while(cycles++<130){
    const state=f.db.data.get(f.ticketPath).run;
    if(state.state.phase!=='active')return state.state;
    const startTick=state.state.tick;
    let local=deepFreeze(structuredClone(state)),frames=[];
    for(let k=0;k<45 && local.state.phase==='active';k++){
      const me=local.foundation.checkpoint.position;
      const choices=local.state.enemies.filter(e=>e.zUnits<8000&&e.zUnits>-19000);
      const enemy=(choices.length?choices:local.state.enemies)
        .slice().sort((a,b)=>b.zUnits-a.zUnits)[0];
      const dx=(enemy?.xUnits??0)-me.xUnits;
      let x=dx>60?-127:dx< -60?127:0;
      let threat=null;
      for(const b of local.state.enemyProjectiles){
        if(b.vzUnits<=0)continue;
        const ticks=(me.zUnits-b.zUnits)/b.vzUnits;
        if(ticks<0||ticks>18)continue;
        const projectedX=b.xUnits+ticks*b.vxUnits;
        if(Math.abs(projectedX-me.xUnits)<2100&&(!threat||ticks<threat.ticks))
          threat={projectedX,ticks};
      }
      if(threat)x=me.xUnits>threat.projectedX?-127:127;
      const frame=kind==='defeat'?{x:0,z:0}:{x,z:0};
      frames.push(frame);
      // Offline oracle only. Firestore admission still receives inputs in one
      // bounded chunk; replay at audit never consumes this synthetic oracle.
      const tick=local.state.tick;
      const step=replayCombatSliceChunk({run:local,
        chunk:{protocol:'pve-input-v1',battleId:BID,startTick:tick,frames:[frame]},
        receivedAtMs:T0+Math.ceil((tick+1)*1000/30)+10});
      local=step.run;
    }
    const at=T0+Math.ceil((startTick+frames.length)*1000/30)+25;
    f.setClock(at);
    await svc.ingest(UID,SID,{chunk:{protocol:'pve-input-v1',battleId:BID,
      startTick,frames}});
  }
  throw Error('candidate oracle exceeded bounded chunk count');
}

// The connected API remains OFF; disabled service does not even require a db.
test('C11 default disabled, no HTTP/Cloud authority',async()=>{
  const svc=await createProductionBattleCandidateC11();
  assert.equal(svc.enabled,false);
  assert.throws(()=>svc.open(UID,SID,openBody()),isCode('C11_DISABLED'));
  assert.throws(()=>svc.ingest(UID,SID,chunk(0)),isCode('C11_DISABLED'));
  assert.throws(()=>svc.audit(UID,SID,{battleId:BID}),isCode('C11_DISABLED'));
});
test('C11 enabled factory requires server key ring and closed UID allowlist',async()=>{
  const f=fixture();
  await assert.rejects(f.create({allowedUids:[]}),/C11 requires/);
  await assert.rejects(f.create({signingKey:Buffer.alloc(16)}),/C11 requires/);
  await assert.rejects(f.create({verificationKeys:new Map()}),/C11 requires/);
  await assert.rejects(f.create({signingKeyId:'bad'}),/C11 requires/);
  await assert.rejects(f.create({allowedUids:[UID,UID]}),/C11 requires/);
});
test('C11 open creates signed immutable origin with only candidate flags and no wallet writes',async()=>{
  const f=fixture(),svc=await f.create(),before=structuredClone(f.user);
  const out=await svc.open(UID,SID,openBody());
  assert.equal(out.version,VERSION);assert.equal(out.nextTick,0);
  assert.equal(out.nonEconomic,true);assert.equal(out.eligibleForSettlement,false);
  assert.equal(out.candidateOnly,true);
  const origin=f.db.data.get(f.originPath);
  assert.equal(origin.version,ORIGIN_VERSION);assert.equal(origin.mac.length,64);
  assert.equal(origin.snapshot.context.locationId,'alpha_stage_1');
  assert.equal(origin.encounter.waves.flatMap(w=>w.enemies).length,70);
  assert.equal(origin.qaSourceModel,true);
  assert.deepEqual(f.db.data.get(f.userPath),before);
  assert.deepEqual(f.db.ops.map(x=>x.kind),['create','set']);
  assert.ok(f.db.ops.every(x=>!x.path.endsWith('productionBattleOutcomes')
    &&!x.path.includes('/operations/')&&!x.path.includes('/verifiedBattleSettlements/')));
});
test('C11 open rejects forged victory, rewards, waves, alternate mode/level',async()=>{
  const f=fixture(),svc=await f.create();
  for(const payload of [
    {...openBody(),victory:true},{...openBody(),rewards:{coins:999}},
    {...openBody(),seed:1},{...openBody(),waves:[]},
    {...openBody(),locationId:'alpha_stage_2'},
    {...openBody(),mode:'dungeon'},{}])
    await assert.rejects(svc.open(UID,SID,payload),isCode('C11_OPEN_INVALID'));
  assert.equal(f.db.ops.length,0);
});
test('C11 non-allowlisted actor and invalid session rejected before Firestore',async()=>{
  const f=fixture(),svc=await f.create();
  await assert.rejects(svc.open('other',SID,openBody()),isCode('C11_NOT_ALLOWED'));
  await assert.rejects(svc.open(UID,'bad',openBody()),isCode('C11_ACTOR_INVALID'));
  assert.equal(f.db.ops.length,0);
});
test('C11 wrong persisted session/deletion/unsupported owned weapon rejected',async()=>{
  const f=fixture(),svc=await f.create();
  await assert.rejects(svc.open(UID,SID2,openBody()),isCode('SESSION_EXPIRED'));
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});
  await assert.rejects(svc.open(UID,SID,openBody()),isCode('ACCOUNT_DELETION_PENDING'));
  f.db.data.delete(`accountDeletionJobs/${UID}`);
  f.db.data.get(f.userPath).accountDeletion={status:'pending'};
  await assert.rejects(svc.open(UID,SID,openBody()),isCode('ACCOUNT_DELETION_PENDING'));
  const f2=fixture({gunId:'gun_laser'}),svc2=await f2.create();
  await assert.rejects(svc2.open(UID,SID,openBody()),e=>/^(SLICE_|ALPHA_)/.test(e?.code||''));
});
test('C11 duplicate open is idempotent, different request blocked until terminal/expiry',async()=>{
  const f=fixture(),svc=await f.create();
  const first=await svc.open(UID,SID,openBody());
  const count=f.db.ops.length;
  assert.equal((await svc.open(UID,SID,openBody())).duplicate,true);
  assert.equal(f.db.ops.length,count);
  await assert.rejects(svc.open(UID,SID,{...openBody(),requestId:'c11_open_req_002'}),
    isCode('C11_TICKET_ACTIVE'));
  assert.equal(first.battleId,BID);
});
test('C11 simultaneous duplicate admission creates exactly one genesis and checkpoint',async()=>{
  const f=fixture(),svc=await f.create();
  const [a,b]=await Promise.all([svc.open(UID,SID,openBody()),svc.open(UID,SID,openBody())]);
  assert.equal(a.battleId,b.battleId);
  assert.equal(+a.duplicate+ +b.duplicate,1);
  assert.equal(f.db.ops.length,2);
});
test('C11 status and ingest valid 30Hz frames; duplicate is a no-op',async()=>{
  const {f,svc}=await opened();
  assert.equal((await svc.status(UID,SID)).nextTick,0);
  f.setClock(T0+300);
  const a=await svc.ingest(UID,SID,chunk(0,6));
  assert.equal(a.nextTick,6);
  const prior=f.db.ops.length;
  f.setClock(T0+400);
  const dup=await svc.ingest(UID,SID,chunk(0,6));
  assert.equal(dup.duplicate,true);assert.equal(f.db.ops.length,prior);
  const next=await svc.ingest(UID,SID,chunk(6,6));
  assert.equal(next.nextTick,12);
  const rows=f.db.ops.filter(x=>x.path.includes('prodBattleCandidateTrace/'));
  assert.equal(rows.length,2);
  assert.deepEqual(f.db.data.get(f.userPath),f.user);
});
test('C11 input rejects forged victory, injected HP, reward claims, wrong battle',async()=>{
  const {f,svc}=await opened();f.setClock(T0+300);
  const n=f.db.ops.length;
  for(const forged of [{...chunk(0),victory:true},
    {chunk:{...chunk(0).chunk,stars:3}},
    {chunk:{...chunk(0).chunk,frames:[{x:500,z:0}]}},
    {chunk:{...chunk(0).chunk,battleId:'bb0c502d-6784-4e19-9b3d-e952bdd0bbaf'}},
    {chunk:{...chunk(0).chunk,HP:999}}])
    await assert.rejects(svc.ingest(UID,SID,forged));
  assert.equal(f.db.ops.length,n);
});
test('C11 input rejects fast forward, sequence gaps and changed retries',async()=>{
  const {f,svc}=await opened();f.setClock(T0+1);
  await assert.rejects(svc.ingest(UID,SID,chunk(0,60)),isCode('INPUT_FAST_FORWARD'));
  f.setClock(T0+300);await svc.ingest(UID,SID,chunk(0,6));
  await assert.rejects(svc.ingest(UID,SID,chunk(12,6)),isCode('INPUT_SEQUENCE_INVALID'));
  await assert.rejects(svc.ingest(UID,SID,chunk(0,6,{x:1,z:0})),
    isCode('INPUT_SEQUENCE_INVALID'));
});
test('C11 candidate genesis HMAC detects edited policy, seed and rewritten snapshot checksum',async()=>{
  const {f,svc}=await opened();f.setClock(T0+300);
  const original=structuredClone(f.db.data.get(f.originPath));
  for(const change of [x=>{x.snapshot.seed=1234;},
    x=>{x.policy.pilotHitRadiusUnits=1;},
    x=>{x.snapshot.snapshotHash='b'.repeat(64);},
    x=>{x.mac='c'.repeat(64);},
    x=>{x.purpose='client-win-claim';}]){
    const broken=structuredClone(original);change(broken);
    f.db.data.set(f.originPath,broken);
    await assert.rejects(svc.ingest(UID,SID,chunk(0,6)),e=>/^C11_ORIGIN_/.test(e?.code||''));
  }
  f.db.data.set(f.originPath,original);
  assert.equal((await svc.ingest(UID,SID,chunk(0,6))).nextTick,6);
});
test('C11 signed genesis missing and tampered active origin binding fail closed',async()=>{
  const {f,svc}=await opened();f.setClock(T0+300);
  const original=f.db.data.get(f.originPath);f.db.data.delete(f.originPath);
  await assert.rejects(svc.ingest(UID,SID,chunk(0,6)),isCode('C11_ORIGIN_MISSING'));
  f.db.data.set(f.originPath,original);
  f.db.data.get(f.ticketPath).originMac='0'.repeat(64);
  await assert.rejects(svc.ingest(UID,SID,chunk(0,6)),isCode('C11_ORIGIN_BINDING'));
});
test('C11 session switch, expired ticket and account deletion block status/input/audit',async()=>{
  const {f,svc}=await opened();
  f.db.data.get(f.userPath).sessionId=SID2;
  await assert.rejects(svc.status(UID,SID),isCode('SESSION_EXPIRED'));
  f.db.data.get(f.userPath).sessionId=SID;
  f.setClock(T0+TTL_MS);
  await assert.rejects(svc.status(UID,SID),isCode('C11_TICKET_EXPIRED'));
  f.setClock(T0+200);
  f.db.data.set(`accountDeletionJobs/${UID}`,{status:'pending'});
  await assert.rejects(svc.status(UID,SID),isCode('ACCOUNT_DELETION_PENDING'));
});
test('C11 audit refuses active game, unapproved replay cannot be used for C10 settlement',async()=>{
  const {f,svc}=await opened();
  await assert.rejects(svc.audit(UID,SID,{battleId:BID}),isCode('C11_NOT_TERMINAL'));
  await assert.rejects(svc.audit(UID,SID,{battleId:BID,victory:true}),isCode('C11_AUDIT_INPUT_INVALID'));
  const authority=createProductionOutcomeAuthorityC10({db:f.db,enabled:true,
    allowedUids:[UID],signingKeyId:'prod_key_c10',signingKey:Buffer.alloc(32,8),
    verificationKeys:new Map([['prod_key_c10',Buffer.alloc(32,8)]]),
    trustedProductionReplay:async()=>({version:'not-production',qaOnly:true}),
    reviewGates:{nativeTouchParity:true,productionEncounter:true,
      firestoreRulesIam:true,productionReplay:true},now:()=>T0+100});
  await assert.rejects(authority.issue(UID,SID,BID),isCode('C10_PRODUCTION_REPLAY_REQUIRED'));
  assert.ok(!f.db.ops.some(o=>o.path.includes('/productionBattleOutcomes/')));
});
test('C11 long deterministic replay reaches terminal and creates immutable candidate audit only',async()=>{
  const {f,svc}=await opened();
  const end=await finishGolden(f,svc,'defeat');
  assert.ok(['lab-clear','lab-defeat'].includes(end.phase));
  const before=structuredClone(f.db.data.get(f.userPath));
  const result=await svc.audit(UID,SID,{battleId:BID});
  assert.equal(result.candidateOnly,true);assert.equal(result.nonEconomic,true);
  assert.equal(result.productionReplayApproved,false);
  assert.equal(result.eligibleForSettlement,false);
  assert.ok(['candidate-clear','candidate-nonpayable-clear','candidate-defeat'].includes(result.phase));
  assert.equal(result.verifiedTicks,end.tick);
  assert.equal(result.auditDigest.length,64);
  assert.deepEqual(f.db.data.get(f.userPath),before);
  assert.ok(!f.db.ops.some(o=>/productionBattleOutcomes|operations|verifiedBattleSettlements/.test(o.path)));
  const n=f.db.ops.length;
  const repeated=await svc.audit(UID,SID,{battleId:BID});
  assert.equal(repeated.duplicate,true);assert.equal(f.db.ops.length,n);
});
test('C11 candidate audit rejects omitted or altered persisted trace, no money writes',async()=>{
  const {f,svc}=await opened();
  await finishGolden(f,svc,'defeat');
  const rows=[...f.db.data.keys()].filter(x=>x.startsWith(f.tracePrefix));
  assert.ok(rows.length>0);
  const original=f.db.data.get(rows[0]);
  f.db.data.delete(rows[0]);
  await assert.rejects(svc.audit(UID,SID,{battleId:BID}),isCode('C11_TRACE_COUNT'));
  f.db.data.set(rows[0],original);
  f.db.data.get(rows[0]).frames[0].x=127;
  await assert.rejects(svc.audit(UID,SID,{battleId:BID}),isCode('C11_TRACE_TAMPER'));
});
test('C11 candidate audit rejects changed terminal state and repeat audit after tamper',async()=>{
  const {f,svc}=await opened();
  await finishGolden(f,svc,'defeat');
  const first=await svc.audit(UID,SID,{battleId:BID});
  assert.equal(first.duplicate,false);
  f.db.data.get(f.ticketPath).run.state.hp=999999;
  await assert.rejects(svc.audit(UID,SID,{battleId:BID}),isCode('C11_REPLAY_MISMATCH'));
});
test('C11 audit fails closed on extra trace after terminal',async()=>{
  const {f,svc}=await opened();await finishGolden(f,svc,'defeat');
  const extra=f.tracePrefix+'999999';
  f.db.data.set(extra,{startTick:999999});
  await assert.rejects(svc.audit(UID,SID,{battleId:BID}),isCode('C11_TRACE_COUNT'));
});
test('C11 no C10/settlement/start routes and Firestore client writes remain denied',()=>{
  const read=p=>fs.readFileSync(path.resolve(__dirname,p),'utf8');
  const http=read('../server.js'),game=read('../lib/gameService.cjs');
  const code=read('../lib/productionBattleCandidateC11V8.cjs');
  const audit=read('../lib/productionReplayAuditC11V8.cjs');
  const rules=read('../../security/firestore.rules');
  assert.doesNotMatch(http,/productionBattleCandidateC11V8/);
  assert.doesNotMatch(game,/productionBattleCandidateC11V8/);
  assert.doesNotMatch(code,/productionOutcomeAuthorityC10V8|verifiedSettlementC7B2BV8/);
  assert.doesNotMatch(audit,/productionOutcomeAuthorityC10V8|verifiedSettlementC7B2BV8/);
  assert.match(game,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.match(rules,/match \/\{child=\*\*\} \{ allow read, write: if false; \}/);
});
test('C11 70-kill deterministic complete replay stays non-economic and cannot authorize C10',async()=>{
  const {f,svc}=await opened();
  const end=await finishGolden(f,svc,'clear');
  assert.equal(end.phase,'lab-clear');
  assert.equal(end.kills,70);assert.equal(end.contacts,0);assert.equal(end.escaped,0);
  assert.ok(end.hp>0);
  const proof=await svc.audit(UID,SID,{battleId:BID});
  assert.equal(proof.phase,'candidate-clear');
  assert.equal(proof.modelPhase,'lab-clear');
  assert.equal(proof.eligibleForSettlement,false);
  assert.equal(proof.nonEconomic,true);
  assert.equal(Object.hasOwn(proof,'serverOriginAuthenticated'),false);
  assert.equal(Object.hasOwn(proof,'independentReplayMatched'),false);
  assert.equal(Object.hasOwn(proof,'source'),false);
});
test('C11 audit idempotency rechecks stored proof tampering',async()=>{
  const {f,svc}=await opened();await finishGolden(f,svc,'defeat');
  const once=await svc.audit(UID,SID,{battleId:BID});
  f.db.data.get(f.auditPath).phase='verified-clear';
  await assert.rejects(svc.audit(UID,SID,{battleId:BID}),isCode('C11_AUDIT_TAMPER'));
  const {duplicate,...saved}=once;f.db.data.set(f.auditPath,saved);
  assert.equal((await svc.audit(UID,SID,{battleId:BID})).duplicate,true);
});
test('C11 input duplicate fails if immutable trace record was removed',async()=>{
  const {f,svc}=await opened();f.setClock(T0+300);
  await svc.ingest(UID,SID,chunk(0,6));
  f.db.data.delete(f.tracePrefix+'000000');
  await assert.rejects(svc.ingest(UID,SID,chunk(0,6)),isCode('C11_DUPLICATE_INVALID'));
});
test('C11 final proof is never a C10 production issuer contract even with HMAC genesis',async()=>{
  const {f,svc}=await opened();await finishGolden(f,svc,'defeat');
  const candidate=await svc.audit(UID,SID,{battleId:BID});
  const authority=createProductionOutcomeAuthorityC10({db:f.db,enabled:true,
    allowedUids:[UID],signingKeyId:'prod_key_c10',signingKey:Buffer.alloc(32,8),
    verificationKeys:new Map([['prod_key_c10',Buffer.alloc(32,8)]]),
    trustedProductionReplay:async()=>candidate,
    reviewGates:{nativeTouchParity:true,productionEncounter:true,
      firestoreRulesIam:true,productionReplay:true},now:()=>f.clock()});
  await assert.rejects(authority.issue(UID,SID,BID),isCode('C10_PRODUCTION_REPLAY_REQUIRED'));
  assert.ok(!f.db.ops.some(op=>op.path.includes('productionBattleOutcomes')));
});

test('C12 adapter: C11 replies carry bounded render checkpoint but never secret or reward',async()=>{
  const {f,svc}=await opened();
  const reply=await svc.status(UID,SID);
  assert.equal(reply.qaOnly,true);
  assert.equal(reply.candidateOnly,true);
  assert.equal(reply.settlementEnabled,false);
  assert.equal(reply.eligibleForSettlement,false);
  assert.equal(reply.protocol,'pve-input-v1');
  assert.equal(reply.visual.version,'sf-c8-alpha1-server-render-qa-v1');
  assert.equal(reply.visual.tick,reply.nextTick);
  assert.equal(reply.phase,'active');
  const str=JSON.stringify(reply);
  assert.equal(str.includes('originMac'),false);
  assert.equal(str.includes('sessionId'),false);
  assert.equal(str.includes('mac'),false);
  assert.equal(str.includes('grant'),false);
  assert.deepEqual(f.db.data.get(f.userPath),f.user);
});
test('C12 exit: abandon is idempotent and cannot resume/audit a closed candidate',async()=>{
  const {f,svc}=await opened(),before=structuredClone(f.user);
  const a=await svc.abandon(UID,SID,{battleId:BID});
  assert.equal(a.abandoned,true);assert.equal(a.duplicate,false);
  const b=await svc.abandon(UID,SID,{battleId:BID});
  assert.equal(b.abandoned,true);assert.equal(b.duplicate,true);
  await assert.rejects(svc.status(UID,SID),isCode('C11_TICKET_ABANDONED'));
  await assert.rejects(svc.ingest(UID,SID,chunk(0)),isCode('C11_TICKET_ABANDONED'));
  await assert.rejects(svc.audit(UID,SID,{battleId:BID}),isCode('C11_TICKET_ABANDONED'));
  assert.deepEqual(f.db.data.get(f.userPath),before);
  assert.ok(!f.db.ops.some(x=>x.path.includes('/operations/')
    ||x.path.includes('/verifiedBattleSettlements/')));
});
test('C12 exit: forged extra fields, wrong UID, session and battle ID are rejected',async()=>{
  const {svc}=await opened();
  await assert.rejects(svc.abandon(UID,SID,{battleId:BID,victory:true}),isCode('C11_ABANDON_INPUT'));
  await assert.rejects(svc.abandon('another',SID,{battleId:BID}),isCode('C11_NOT_ALLOWED'));
  await assert.rejects(svc.abandon(UID,SID2,{battleId:BID}),isCode('SESSION_EXPIRED'));
  await assert.rejects(svc.abandon(UID,SID,{battleId:'12345678-1234-1234-1234-123456789abc'}),isCode('C11_TICKET_INVALID'));
});
test('C12 exit: new candidate ticket allowed after abandoned ticket in same session',async()=>{
  const f=fixture();let count=0;
  const svc=await f.create({uuidFactory:()=>++count===1?BID:
    '12345678-1234-1234-1234-123456789abc'});
  const first=await svc.open(UID,SID,openBody());
  await svc.abandon(UID,SID,{battleId:first.battleId});
  const next=await svc.open(UID,SID,{mode:'campaign',locationId:'alpha_stage_1',
    requestId:'c12_second_req_0001'});
  assert.equal(next.nextTick,0);
  assert.notEqual(next.battleId,first.battleId);
  assert.equal(next.eligibleForSettlement,false);
});

test('C12-PERF-A: transaction telemetry remains numeric-only, optional and non-authoritative',async()=>{
  const f=fixture(),metrics=[];
  const svc=await f.create({onPerfInput:event=>metrics.push(event)});
  await svc.open(UID,SID,openBody());
  f.setClock(T0+1000);
  const reply=await svc.ingest(UID,SID,chunk(0,15));
  assert.equal(reply.nextTick,15);
  assert.equal(reply.nonEconomic,true);
  assert.equal(reply.eligibleForSettlement,false);
  assert.equal(metrics.length,1);
  const meter=metrics[0];
  assert.equal(meter.outcome,'ok');
  assert.equal(meter.attempts,1);
  for(const name of ['transactionMs','readMs','simulationMs','otherMs']){
    assert.equal(typeof meter[name],'number');
    assert.ok(Number.isFinite(meter[name])&&meter[name]>=0);
  }
  assert.deepEqual(Object.keys(meter).sort(),
    ['outcome','attempts','transactionMs','readMs','simulationMs','otherMs'].sort());
  assert.doesNotMatch(JSON.stringify(meter),new RegExp(UID+'|'+SID+'|'+BID));
  const f2=fixture(),svc2=await f2.create({onPerfInput:()=>{throw new Error('telemetry sink failed');}});
  await svc2.open(UID,SID,openBody());
  f2.setClock(T0+1000);
  const out2=await svc2.ingest(UID,SID,chunk(0,15));
  assert.equal(out2.nextTick,15,'telemetry must never affect committed candidate input');
});
