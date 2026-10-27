'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createQaBattleAdmissionC7A}=require('../lib/qaBattleAdmissionC7AV8.cjs');
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const OTHER='5a3f357d-28c3-469b-9e0f-69d16a1f3228';
const UID='c8_allowlisted';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const T0=Date.parse('2026-10-26T08:00:00Z');
class Ref{
  constructor(db,p){this.db=db;this.p=p;}
  doc(v){return new Ref(this.db,`${this.p}/${v}`);}
  collection(v){return new Ref(this.db,`${this.p}/${v}`);}
  async get(){const v=this.db.docs.get(this.p);return {exists:v!==undefined,data:()=>structuredClone(v)};}
}
class FakeDb{
  constructor(){this.docs=new Map();this.writes=[];this.tail=Promise.resolve();}
  collection(p){return new Ref(this,p);}
  runTransaction(fn){
    const work=async()=>{
      let wrote=false;const pending=[];
      const t={get:async ref=>{if(wrote)throw Error('READ_AFTER_WRITE');return ref.get();},
        set:(ref,value)=>{wrote=true;pending.push({method:'set',p:ref.p,value:structuredClone(value)});},
        create:(ref,value)=>{wrote=true;pending.push({method:'create',p:ref.p,value:structuredClone(value)});}};
      const result=await fn(t);
      for(const q of pending){
        if(q.method==='create'&&this.docs.has(q.p))throw Error('CREATE_ALREADY_EXISTS');
        this.docs.set(q.p,q.value);this.writes.push({method:q.method,p:q.p});
      }
      return result;
    };
    const p=this.tail.then(work,work);this.tail=p.catch(()=>{});return p;
  }
}
let schema,catalog;
test.before(async()=>{[schema,catalog]=await Promise.all([
  import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href),
  import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
]);});
async function fixture(){
  const db=new FakeDb();const cd=schema.createDefaultCampaignData();
  cd.loadout={...cd.loadout,pilot:'pilot_alpha',aircraft:'ship_xwing',mainGun:'qa_rail',armor:'',wingman:'',drone:''};
  cd.ownedPilots={...cd.ownedPilots,pilot_alpha:{level:1,stars:1}};
  cd.ownedAircrafts={...cd.ownedAircrafts,ship_xwing:{level:1,stars:1}};
  cd.items={...cd.items,qa_rail:{type:'mainGun',baseId:'gun_rail',level:1,rarity:1}};
  const user=schema.createProfileDocument({coins:100,diamonds:100,energy:20,campaignData:cd},
    {displayName:'QA',photoURL:''},T0);user.sessionId=SID;
  db.docs.set(`users/${UID}`,user);
  const svc=await createQaBattleAdmissionC7A({db,allowedUids:[UID],now:()=>T0,
    uuidFactory:()=>BID,randomSeed:()=>7777,schemaModule:schema,catalogModule:catalog});
  return {db,svc,user};
}
const body=()=>({mode:'campaign',locationId:'alpha_stage_1',requestId:'c8_open_0001'});
test('C8 admission: abandoning a server QA ticket never writes wallet/profile/settlement',async()=>{
  const f=await fixture(),ticket=await f.svc.open(UID,SID,body());
  assert.equal(ticket.visual.tick,0);
  const old=structuredClone(f.db.docs.get(`users/${UID}`));
  const r=await f.svc.abandon(UID,SID,{battleId:BID});
  assert.equal(r.qaOnly,true);assert.equal(r.settlementEnabled,false);
  assert.equal(r.abandoned,true);assert.equal(r.duplicate,false);
  assert.deepEqual(f.db.docs.get(`users/${UID}`),old);
  assert.equal(f.db.writes.filter(x=>x.p===`users/${UID}`).length,0);
  assert.equal(f.db.writes.some(x=>/settlement|wallet|reward|missions|operations/i.test(x.p)),false);
  await assert.rejects(f.svc.status(UID,SID),e=>e.code==='QA_BATTLE_EXPIRED');
});
test('C8 admission: cannot abandon another ticket/UID/session or inject outcome',async()=>{
  const f=await fixture();await f.svc.open(UID,SID,body());
  for(const p of [{battleId:BID,rewards:{coins:123}},{battleId:BID,victory:true}]){
    await assert.rejects(f.svc.abandon(UID,SID,p),e=>e.code==='QA_ABANDON_INVALID');
  }
  await assert.rejects(f.svc.abandon(UID,OTHER,{battleId:BID}),e=>e.code==='SESSION_EXPIRED');
  await assert.rejects(f.svc.abandon('other_uid',SID,{battleId:BID}),e=>e.code==='QA_BATTLE_NOT_ALLOWED');
  await assert.rejects(f.svc.abandon(UID,SID,{battleId:'c8_other_id'}),e=>e.code==='QA_ABANDON_INVALID');
  assert.equal((await f.svc.status(UID,SID)).phase,'active');
});
test('C8 admission: duplicate abandon is safe and never reactivates ticket',async()=>{
  const f=await fixture();await f.svc.open(UID,SID,body());
  await f.svc.abandon(UID,SID,{battleId:BID});
  const n=f.db.writes.length;
  const r=await f.svc.abandon(UID,SID,{battleId:BID});
  assert.equal(r.duplicate,true);assert.equal(f.db.writes.length,n);
  await assert.rejects(f.svc.ingest(UID,SID,{chunk:{protocol:'pve-input-v1',battleId:BID,
    startTick:0,frames:[{x:0,z:0}]}}),e=>e.code==='QA_BATTLE_EXPIRED');
});
