'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createC15Rc1bRuntimeV1,parseC15Rc1bConfig}=require('../lib/c15Rc1bRuntimeV1.cjs');
const {createC15Rc1bResourceCatalog}=require('../lib/c15Rc1bResourceCatalog.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');

const T0=Date.parse('2026-10-30T03:00:00Z');
const UID='c15_rc1b_allowlisted_user';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const KEY_ID='c15_rc1b_key_v1';
const KEY=Buffer.alloc(32,0x6a);
const isCode=code=>error=>error?.code===code;
class Query{constructor(db,p){this.db=db;this.path=p;this.max=Number.MAX_SAFE_INTEGER;}orderBy(f){assert.equal(f,'startTick');return this;}limit(n){this.max=n;return this;}
  async get(){const docs=[...this.db.data].filter(([p])=>p.startsWith(this.path+'/')&&p.slice(this.path.length+1).indexOf('/')===-1)
    .map(([p,v])=>({id:p.slice(p.lastIndexOf('/')+1),raw:v,data:()=>structuredClone(v)})).sort((a,b)=>a.raw.startTick-b.raw.startTick).slice(0,this.max);
    return {docs:docs.map(({id,data})=>({id,data}))};}}
class Ref{constructor(db,p){this.db=db;this.path=p;}doc(id){return new Ref(this.db,`${this.path}/${id}`);}collection(id){return new Ref(this.db,`${this.path}/${id}`);}
  orderBy(field){return new Query(this.db,this.path).orderBy(field);}async get(){const value=this.db.data.get(this.path);return {exists:value!==undefined,data:()=>structuredClone(value)};}}
class FakeDb{constructor(){this.data=new Map();this.ops=[];this.tail=Promise.resolve();this.beforeRunTransaction=null;}collection(id){return new Ref(this,id);}runTransaction(work){const schedule=async()=>{
    if(this.beforeRunTransaction){const hook=this.beforeRunTransaction;this.beforeRunTransaction=null;await hook();}
    const perform=async()=>{const pending=[];let writing=false;
      const t={get:async ref=>{if(writing)throw Error('READ_AFTER_WRITE');return ref.get();},create:(ref,value)=>{writing=true;pending.push(['create',ref.path,structuredClone(value)]);},
        set:(ref,value)=>{writing=true;pending.push(['set',ref.path,structuredClone(value)]);}};const answer=await work(t);
      for(const [kind,p] of pending)if(kind==='create'&&this.data.has(p))throw Error('DUPLICATE_CREATE');
      for(const [kind,p,v] of pending){this.data.set(p,v);this.ops.push({kind,path:p});}return answer;};
    const run=this.tail.then(perform,perform);this.tail=run.catch(()=>{});return run;};return schedule();}}
let catalog,schema;
test.before(async()=>{[catalog,schema]=await Promise.all([
  import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
  import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href)]);});
function fixture(){const db=new FakeDb();let current=T0;const data=schema.createDefaultCampaignData();
  data.loadout={...data.loadout,pilot:'pilot_alpha',aircraft:'ship_xwing',mainGun:'qa_rail',armor:'',wingman:'',drone:''};
  data.ownedPilots={...data.ownedPilots,pilot_alpha:{level:1,stars:1}};data.ownedAircrafts={...data.ownedAircrafts,ship_xwing:{level:1,stars:1}};
  data.items={...data.items,qa_rail:{type:'mainGun',baseId:'gun_rail',level:1,rarity:1}};
  const user=schema.createProfileDocument({coins:1000,diamonds:100,energy:50,campaignData:data},{displayName:'RC1B',photoURL:''},T0);user.sessionId=SID;
  db.data.set(`users/${UID}`,user);const resources=createC15Rc1bResourceCatalog({publicBaseUrl:'https://example.invalid'});
  const create=()=>createC15Rc1bRuntimeV1({db,enabled:true,allowedUids:[UID],signingKeyId:KEY_ID,signingKey:KEY,
    verificationKeys:new Map([[KEY_ID,KEY]]),resourceCatalog:resources,now:()=>current,uuidFactory:()=>BID,randomSeed:()=>11335577,
    catalogModule:catalog,schemaModule:schema});
  return {db,resources,create,setTime:value=>{current=value;},userBefore:structuredClone(user)};}
function generateFrames(opened,kind='victory'){let run=openCombatVerticalSlice({snapshot:opened.runtime.snapshot,
  journal:openInputJournal({uid:UID,sessionId:SID,battleId:BID,rulesVersion:opened.runtime.snapshot.context.rulesVersion,
    loadoutHash:opened.runtime.snapshot.loadoutHash,issuedAtMs:opened.issuedAtMs}),policy:opened.runtime.policy,encounter:opened.runtime.encounter});
  const frames=[];while(run.state.phase==='active'&&frames.length<4500){const me=run.foundation.checkpoint.position;let input;
    if(kind==='defeat')input={x:0,z:-127};else{const choices=run.state.enemies.filter(e=>e.zUnits<8000&&e.zUnits>-19000);
      const enemy=(choices.length?choices:run.state.enemies).slice().sort((a,b)=>b.zUnits-a.zUnits)[0];const dx=(enemy?.xUnits??0)-me.xUnits;
      let x=dx>60?-127:dx< -60?127:0;let threat=null;for(const b of run.state.enemyProjectiles){if(b.vzUnits<=0)continue;const ticks=(me.zUnits-b.zUnits)/b.vzUnits;
        if(ticks<0||ticks>18)continue;const projectedX=b.xUnits+ticks*b.vxUnits;if(Math.abs(projectedX-me.xUnits)<2100&&(!threat||ticks<threat.ticks))threat={projectedX,ticks};}
      if(threat)x=me.xUnits>threat.projectedX?-127:127;input={x,z:0};}
    const startTick=run.state.tick;run=replayCombatSliceChunk({run,chunk:{protocol:'pve-input-v1',battleId:BID,startTick,frames:[input]},
      receivedAtMs:opened.issuedAtMs+Math.ceil((startTick+1)*1000/30)+10}).run;frames.push(input);}
  return {frames,run};}
function chunks(frames){const out=[];let offset=0,size=15;while(offset<frames.length){const n=Math.min(size,frames.length-offset);
  out.push({protocol:'pve-input-v1',battleId:BID,startTick:offset,frames:frames.slice(offset,offset+n)});offset+=n;size=30;}return out;}

test('C15 RC1B config is explicit, allowlisted and requires independent HMAC',()=>{
  assert.equal(parseC15Rc1bConfig({}),null);
  assert.throws(()=>parseC15Rc1bConfig({GAME_C15_RC1B_ENABLED:'true'}),/approval/);
  const env={GAME_C15_RC1B_ENABLED:'true',GAME_C15_RC1B_STAGING_APPROVED:'true',GAME_C15_RC1B_ALLOW_UIDS:UID,
    GAME_C15_RC1B_HMAC_KEY_ID:KEY_ID,GAME_C15_RC1B_HMAC_KEY_B64:KEY.toString('base64')};
  const value=parseC15Rc1bConfig(env);assert.deepEqual(value.uids,[UID]);assert.equal(value.keyId,KEY_ID);
});

test('C15 RC1B open is signed, resource-bound and never mutates economy',async()=>{const f=fixture(),svc=await f.create();
  const before=structuredClone(f.db.data.get(`users/${UID}`));const out=await svc.open(UID,SID,{stageId:'alpha-stage-1',requestId:'c15_rc1b_open_0001',appVersion:'1.2.1',quality:'mobile-low'});
  assert.equal(out.nonEconomic,true);assert.equal(out.safeForSettlement,false);assert.equal(out.cloudRewards,false);assert.equal(out.genesis.mac.length,64);
  assert.equal(out.resourceManifest.manifestDigest,out.genesis.resourceManifestDigest);assert.equal(out.runtime.encounter.waves.length,5);
  assert.deepEqual(f.db.data.get(`users/${UID}`),before);assert.ok(f.db.ops.every(op=>!op.path.includes('wallet')&&!op.path.includes('settlement')));
});

test('C15 RC1B local full battle uploads in background and finalizes by independent replay',async()=>{const f=fixture(),svc=await f.create();
  const opened=await svc.open(UID,SID,{stageId:'alpha-stage-1',requestId:'c15_rc1b_open_0002',appVersion:'1.2.1',quality:'mobile-low'});
  const golden=generateFrames(opened,'victory'),list=chunks(golden.frames);assert.equal(golden.run.state.phase,'lab-clear');
  for(const chunk of list)await svc.upload(UID,SID,{battleId:BID,chunk});
  const retry=await svc.upload(UID,SID,{battleId:BID,chunk:list[0]});assert.equal(retry.duplicate,true);
  f.setTime(T0+Math.ceil(golden.frames.length*1000/30)+5000);const final=await svc.finalize(UID,SID,{battleId:BID});
  assert.equal(final.result.phase,'rc1-verified-clear');assert.equal(final.result.waves,5);assert.equal(final.result.kills,70);
  assert.equal(final.nonEconomic,true);assert.equal(final.safeForSettlement,false);assert.equal(final.cloudRewards,false);
  const duplicate=await svc.finalize(UID,SID,{battleId:BID});assert.equal(duplicate.duplicate,true);
  const afterTerminal={protocol:'pve-input-v1',battleId:BID,startTick:golden.frames.length,frames:[{x:0,z:0}]};
  await assert.rejects(svc.upload(UID,SID,{battleId:BID,chunk:afterTerminal}),isCode('C15_RC1B_SESSION_CLOSED'));
});

test('C15 RC1B fails closed on reordered, changed retry and incomplete journal',async()=>{const f=fixture(),svc=await f.create();
  const opened=await svc.open(UID,SID,{stageId:'alpha-stage-1',requestId:'c15_rc1b_open_0003',appVersion:'1.2.1',quality:'mobile-low'});
  const golden=generateFrames(opened,'defeat'),list=chunks(golden.frames);
  await assert.rejects(svc.upload(UID,SID,{battleId:BID,chunk:list[1]}),isCode('C15_RC1B_SEQUENCE'));
  await svc.upload(UID,SID,{battleId:BID,chunk:list[0]});const changed=structuredClone(list[0]);changed.frames[0]={x:127,z:0};
  await assert.rejects(svc.upload(UID,SID,{battleId:BID,chunk:changed}),isCode('C15_RC1B_RETRY_CHANGED'));
  f.setTime(T0+Math.ceil(golden.frames.length*1000/30)+5000);
  await assert.rejects(svc.finalize(UID,SID,{battleId:BID}),isCode('C15_RC1B_REPLAY_REJECTED'));
});


test('C15 RC1B finalize fails closed if journal changes during independent replay',async()=>{
  const f=fixture(),svc=await f.create();
  const opened=await svc.open(UID,SID,{stageId:'alpha-stage-1',requestId:'c15_rc1b_open_race',appVersion:'1.2.1',quality:'mobile-low'});
  const golden=generateFrames(opened,'victory'),list=chunks(golden.frames);
  for(const chunk of list)await svc.upload(UID,SID,{battleId:BID,chunk});
  f.setTime(T0+Math.ceil(golden.frames.length*1000/30)+5000);
  let enter,release;const entered=new Promise(resolve=>{enter=resolve;});const blocked=new Promise(resolve=>{release=resolve;});
  f.db.beforeRunTransaction=async()=>{enter();await blocked;};
  const finalizing=svc.finalize(UID,SID,{battleId:BID});
  await entered;
  const extra={protocol:'pve-input-v1',battleId:BID,startTick:golden.frames.length,frames:[{x:0,z:0}]};
  await svc.upload(UID,SID,{battleId:BID,chunk:extra});
  release();
  await assert.rejects(finalizing,isCode('C15_RC1B_FINALIZE_RETRY'));
  await assert.rejects(svc.finalize(UID,SID,{battleId:BID}),isCode('C15_RC1B_REPLAY_REJECTED'));
});
