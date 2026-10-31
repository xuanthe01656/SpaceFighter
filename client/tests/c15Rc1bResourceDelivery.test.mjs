import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createC15MemoryStore} from '../src/game/c15/C15Rc1bStore.js';
import {ensureC15StageResources,resolveC15ActiveResource,downloadResumable} from '../src/game/c15/C15ResourceDelivery.js';
const require=createRequire(import.meta.url);
const {createC15Rc1bResourceCatalog}=require('../../server/lib/c15Rc1bResourceCatalog.cjs');

function fetchFor(catalog,{chunkBytes=65536,corruptPath=null}={}){
  return async(url,options={})=>{
    const parsed=new URL(url);const descriptor=/\/packs\/([^/]+)\/v(\d+)\/descriptor\.json$/.exec(parsed.pathname);
    if(descriptor){const found=catalog.getDescriptor(descriptor[1],Number(descriptor[2]));
      return found?new Response(found.bytes,{status:200,headers:{'content-type':'application/json'}}):new Response('',{status:404});}
    const file=/\/packs\/([^/]+)\/v(\d+)\/files\/(.+)$/.exec(parsed.pathname);
    if(!file)return new Response('',{status:404});const found=catalog.getFile(file[1],Number(file[2]),file[3]);
    if(!found)return new Response('',{status:404});let bytes=new Uint8Array(await import('node:fs').then(fs=>fs.readFileSync(found.absolute)));
    if(corruptPath===file[3]){bytes=bytes.slice();bytes[0]^=1;}
    let start=0;if(options.headers?.Range){const match=/bytes=(\d+)-/.exec(options.headers.Range);start=Number(match?.[1]||0);}
    const end=Math.min(bytes.length-1,start+chunkBytes-1),body=bytes.slice(start,end+1),partial=end<bytes.length-1||start>0;
    return new Response(body,{status:partial?206:200,headers:partial?{'content-range':`bytes ${start}-${end}/${bytes.length}`}:{}});
  };
}

test('C15 resource delivery downloads versioned packs, verifies SHA and atomically activates',async()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test'}),store=createC15MemoryStore();
  const result=await ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',fetchImpl:fetchFor(catalog,{chunkBytes:2000000})});
  assert.deepEqual(result.selection.packs.map(x=>x.id),['campaign-alpha-mobile-low','core-bootstrap']);
  assert.equal(result.active.packs['campaign-alpha-mobile-low'].revision,1);
  const file=await resolveC15ActiveResource({store,packId:'campaign-alpha-mobile-low',path:'alpha_coast_low.webp'});
  assert.ok(file?.url.startsWith('blob:'));assert.match(file.sha256,/^[a-f0-9]{64}$/);file.revoke();
});

test('C15 resource range download resumes exact bytes and never accepts corrupt payload',async()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test'}),store=createC15MemoryStore();
  const pack=catalog.manifest.packs.find(x=>x.id==='campaign-alpha-mobile-low'),descriptor=catalog.getDescriptor(pack.id,pack.revision).descriptor;
  const target=descriptor.files.find(x=>x.path==='alpha_coast_low.webp');
  const bytes=await downloadResumable({url:target.url,sizeBytes:target.sizeBytes,store,key:'resume-test',fetchImpl:fetchFor(catalog,{chunkBytes:7000})});
  assert.equal(bytes.length,target.sizeBytes);
  const previous={version:'c15-active-resource-set-v1',stageKey:'alpha-stage-1',packs:{},fileIndex:{}};
  await store.put('meta','active-set:alpha-stage-1',previous);
  await assert.rejects(ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',
    fetchImpl:fetchFor(catalog,{corruptPath:'ship_xwing_top.png'})}),/SHA mismatch/);
  assert.deepEqual(await store.get('meta','active-set:alpha-stage-1'),previous);
});

test('C15 active pack metadata is not trusted when a verified disk file is missing',async()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test'}),store=createC15MemoryStore();
  let requests=0;const baseFetch=fetchFor(catalog,{chunkBytes:2_000_000});const counted=async(...args)=>{requests++;return baseFetch(...args);};
  await ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',fetchImpl:counted});
  const firstRequests=requests;assert.ok(firstRequests>0);
  const active=await store.get('meta','active-set:alpha-stage-1');const missing=active.fileIndex['campaign-alpha-mobile-low/ship_xwing_top.png'];
  await store.remove('files',`${missing.packId}:v${missing.revision}:${missing.path}`);
  await ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',fetchImpl:counted});
  assert.ok(requests>firstRequests,'missing disk file must force a verified redownload');
  const restored=await resolveC15ActiveResource({store,packId:'campaign-alpha-mobile-low',path:'ship_xwing_top.png'});
  assert.ok(restored?.url.startsWith('blob:'));restored.revoke();
});


test('C15 resource activation replaces legacy uncloneable rollback with one bounded plain snapshot',async()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test'});
  const memory=createC15MemoryStore();
  const foreignPrevious=runInNewContext(`(()=>{
    class LegacyRollback{}
    return {
      version:'c15-active-resource-set-v1',
      stageKey:'alpha-stage-1',
      packs:{},
      fileIndex:{},
      rollback:new LegacyRollback()
    };
  })()`);
  let firstMetaRead=true;
  const store={
    async get(name,key){
      if(name==='meta'&&key==='active-set:alpha-stage-1'&&firstMetaRead){firstMetaRead=false;return foreignPrevious;}
      return memory.get(name,key);
    },
    async put(name,key,value){return memory.put(name,key,value);},
    async remove(name,key){return memory.remove(name,key);},
    async list(name,prefix=''){return memory.list(name,prefix);},
  };
  await ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',
    fetchImpl:fetchFor(catalog,{chunkBytes:2_000_000})});
  const active=await memory.get('meta','active-set:alpha-stage-1');
  assert.equal(active.rollback.version,'c15-active-resource-set-v1');
  assert.equal(active.rollback.stageKey,'alpha-stage-1');
  assert.deepEqual(active.rollback.packs,{});
  assert.deepEqual(active.rollback.fileIndex,{});
  assert.equal(Object.hasOwn(active.rollback,'rollback'),false,'rollback history must stay one level deep');
});

test('C15 repeated resource activation keeps rollback metadata bounded',async()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test'}),store=createC15MemoryStore();
  const fetchImpl=fetchFor(catalog,{chunkBytes:2_000_000});
  await ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',fetchImpl});
  await ensureC15StageResources({manifest:catalog.manifest,store,quality:'mobile-low',fetchImpl});
  const active=await store.get('meta','active-set:alpha-stage-1');
  assert.equal(Object.hasOwn(active.rollback,'rollback'),false);
  assert.equal(active.rollback.packs['campaign-alpha-mobile-low'].revision,1);
});
