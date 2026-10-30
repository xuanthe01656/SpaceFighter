import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createC15MemoryStore} from '../src/game/c15/C15Rc1bStore.js';
import {openOrResumeC15Rc1bSession} from '../src/game/c15/C15Rc1bSession.js';
const require=createRequire(import.meta.url);
const {createC15Rc1bResourceCatalog}=require('../../server/lib/c15Rc1bResourceCatalog.cjs');
const {createC15CommercialOriginV1}=require('../../server/lib/c15CommercialGenesisV1.cjs');
const {createC15Rc1Fixture,generateC15DefeatFrames,T0,UID,BID,KEY}=require('../../server/tools/c15Rc1Fixture.cjs');

function fetchFor(catalog){
  return async url=>{
    const parsed=new URL(url);const descriptor=/\/packs\/([^/]+)\/v(\d+)\/descriptor\.json$/.exec(parsed.pathname);
    if(descriptor){const found=catalog.getDescriptor(descriptor[1],Number(descriptor[2]));
      return found?new Response(found.bytes,{status:200}):new Response('',{status:404});}
    const file=/\/packs\/([^/]+)\/v(\d+)\/files\/(.+)$/.exec(parsed.pathname);
    if(!file)return new Response('',{status:404});const found=catalog.getFile(file[1],Number(file[2]),file[3]);
    if(!found)return new Response('',{status:404});const fs=await import('node:fs');
    return new Response(fs.readFileSync(found.absolute),{status:200});
  };
}
async function harness(){
  const fixture=await createC15Rc1Fixture();
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test',generatedAtMs:T0});
  const origin=createC15CommercialOriginV1({snapshot:fixture.snapshot,encounter:fixture.encounter,policy:fixture.policy,
    resourceManifest:catalog.manifest,selectedResourcePackIds:['core-bootstrap','campaign-alpha-mobile-low'],
    keyId:'c15_rc1b_key_v1',key:KEY,issuedAtMs:T0,expiresAtMs:fixture.snapshot.context.expiresAtMs});
  let uploadedThroughTick=0,chunkCount=0,openCount=0,statusCount=0,finalizeCount=0;
  const chunks=[];
  const envelope=()=>({version:'c15-rc1b-runtime-v1',battleId:BID,duplicate:false,issuedAtMs:T0,
    expiresAtMs:fixture.snapshot.context.expiresAtMs,uploadedThroughTick,chunkCount,phase:'active',genesis:origin.genesis,
    runtime:{snapshot:origin.snapshot,encounter:origin.encounter,policy:origin.policy},resourceManifest:catalog.manifest,
    result:null,rc1bOnly:true,nonEconomic:true,safeForSettlement:false,settlementEnabled:false,cloudRewards:false});
  const api={
    async openBattle(){openCount++;return envelope();},
    async getStatus(){statusCount++;return envelope();},
    async uploadChunk(_uid,{battleId,chunk}){assert.equal(battleId,BID);assert.equal(chunk.startTick,uploadedThroughTick);
      chunks.push(structuredClone(chunk));uploadedThroughTick+=chunk.frames.length;chunkCount++;
      return {battleId,startTick:chunk.startTick,endTick:uploadedThroughTick,uploadedThroughTick,chunkCount,nonEconomic:true};},
    async finalize(){finalizeCount++;return {version:'c15-rc1b-runtime-v1',battleId:BID,duplicate:false,nonEconomic:true,
      safeForSettlement:false,settlementEnabled:false,cloudRewards:false,result:{version:'c15-commercial-replay-result-v1',
        battleId:BID,phase:'rc1-verified-defeat',ticks:uploadedThroughTick,rc1Only:true,nonEconomic:true,
        safeForSettlement:false,eligibleForSettlement:false}};},
    async abandon(){return {battleId:BID,nonEconomic:true};},
    async fetchManifest(){return catalog.manifest;},
  };
  return {fixture,catalog,origin,api,envelope,chunks,counts:()=>({openCount,statusCount,finalizeCount,uploadedThroughTick,chunkCount})};
}

const waitFor=async(predicate,limit=200)=>{for(let i=0;i<limit;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2));}throw new Error('condition timeout');};

test('C15 session persists, resumes offline without opening a second battle, then uploads idempotently',async()=>{
  const h=await harness(),store=createC15MemoryStore();let online=true;
  const options={uid:UID,store,api:h.api,fetchImpl:fetchFor(h.catalog),online:()=>online,clock:()=>T0+1000,
    uuidFactory:()=> 'rc1b_request_0001'};
  const first=await openOrResumeC15Rc1bSession(options);assert.equal(h.counts().openCount,1);
  online=false;for(let i=0;i<45;i++)first.advance({x:0,z:0});await first.suspend();first.dispose();
  const second=await openOrResumeC15Rc1bSession(options);assert.equal(h.counts().openCount,1);
  assert.equal(second.getView().kernel.tick,45);assert.equal(h.counts().statusCount,0);
  online=true;await second.retryNetwork();await waitFor(()=>h.counts().uploadedThroughTick===45);
  assert.equal(h.counts().chunkCount,2);assert.deepEqual(h.chunks.map(x=>x.frames.length),[15,30]);
  await second.suspend();second.dispose();
});

test('C15 session keeps local gameplay independent from upload and finalizes only after all frames are acknowledged',async()=>{
  const h=await harness(),store=createC15MemoryStore();let online=true;
  const session=await openOrResumeC15Rc1bSession({uid:UID,store,api:h.api,fetchImpl:fetchFor(h.catalog),
    online:()=>online,clock:()=>T0+120000,uuidFactory:()=> 'rc1b_request_0002'});
  const defeat=generateC15DefeatFrames(h.fixture);
  // Local deterministic gameplay advances synchronously; network transport is
  // deliberately not awaited on the critical render/input path.
  for(const frame of defeat.frames)session.advance(frame);
  assert.equal(session.getView().kernel.provisionalPhase,'local-defeat');
  await session.finalizeWhenOnline();
  assert.equal(session.getView().phase,'verified');
  assert.equal(h.counts().uploadedThroughTick,defeat.frames.length);
  assert.equal(h.counts().finalizeCount,1);
  assert.equal(session.getView().result.phase,'rc1-verified-defeat');
  session.dispose();
});

test('C15 session resumes an unexpired signed local battle after a transient status timeout',async()=>{
  const h=await harness(),store=createC15MemoryStore();
  const first=await openOrResumeC15Rc1bSession({uid:UID,store,api:h.api,fetchImpl:fetchFor(h.catalog),
    online:()=>true,clock:()=>T0+1000,uuidFactory:()=> 'rc1b_request_0003'});
  for(let i=0;i<10;i++)first.advance({x:0,z:0});await first.suspend();first.dispose();
  const timeoutApi={...h.api,async getStatus(){const error=new Error('timeout');error.code='TIMEOUT';throw error;}};
  const resumed=await openOrResumeC15Rc1bSession({uid:UID,store,api:timeoutApi,fetchImpl:fetchFor(h.catalog),
    online:()=>true,clock:()=>T0+2000,uuidFactory:()=> 'should_not_open'});
  assert.equal(resumed.getView().kernel.tick,10);assert.equal(h.counts().openCount,1);resumed.dispose();
});
