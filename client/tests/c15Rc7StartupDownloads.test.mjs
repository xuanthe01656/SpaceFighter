import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createC15MemoryStore} from '../src/game/c15/C15Rc1bStore.js';
import {createBrowserAssetPayloadStore} from '../src/game/assets/AssetPayloadStoreV1.js';
import {createResourceDownloadCoordinator,rc7StartupDownloadEnabled}
  from '../src/game/assets/ResourceDownloadCoordinatorV1.js';
const require=createRequire(import.meta.url);
const {createC15Rc1bResourceCatalog}=require('../../server/lib/c15Rc1bResourceCatalog.cjs');

function testHarness(){
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test'});
  const store=createC15MemoryStore();let descriptorCount=0,fileCount=0,manifestCalls=0,failManifest=false;
  const fetchImpl=async(url)=>{
    const route=new URL(url).pathname;
    const match=/\/packs\/([^/]+)\/v(\d+)\/(descriptor\.json|files\/(.+))$/.exec(route);
    if(!match)return new Response('',{status:404});
    const [,id,revision,kind,file]=match;
    if(kind==='descriptor.json'){
      descriptorCount++;
      const entry=catalog.getDescriptor(id,Number(revision));
      return entry?new Response(entry.bytes,{status:200}):new Response('',{status:404});
    }
    fileCount++;
    const entry=catalog.getFile(id,Number(revision),file);
    return entry?new Response(fs.readFileSync(entry.absolute),{status:200}):new Response('',{status:404});
  };
  const payloadStore=createBrowserAssetPayloadStore({store,fetchImpl});
  const fetchManifest=async()=>{
    manifestCalls++;
    if(failManifest)throw new Error('network temporarily unavailable');
    return catalog.manifest;
  };
  const coordinator=createResourceDownloadCoordinator({store,payloadStore,fetchManifest,fetchImpl});
  return {catalog,store,coordinator,
    getCounts:()=>({descriptorCount,fileCount,manifestCalls}),setOffline:value=>{failManifest=value;}};
}

test('RC7 first launch downloads bootstrap ONLY and reuses verified cached file offline',async()=>{
  const h=testHarness();const progress=[];
  const first=await h.coordinator.ensureStartup({onProgress:entry=>progress.push(entry)});
  assert.deepEqual(first.selection.packs.map(pack=>pack.id),['core-bootstrap']);
  assert.equal(first.active.packs['core-bootstrap'].revision,1);
  assert.equal(first.active.packs['core-bootstrap'].files.length,1);
  assert.ok(progress.some(value=>value.phase==='ready'));
  const counts=h.getCounts();assert.equal(counts.fileCount,1);
  h.setOffline(true);
  await h.coordinator.ensureStartup();
  assert.deepEqual(h.getCounts(),{...counts,manifestCalls:counts.manifestCalls+1});
  const list=await h.coordinator.listContent();
  assert.equal(list.find(pack=>pack.id==='core-bootstrap').installed,true);
  assert.equal(list.find(pack=>pack.id==='campaign-alpha-mobile-low').installed,false);
});

test('RC7 Portal downloads only server-catalogued Alpha pack, removes it without deleting bootstrap',async()=>{
  const h=testHarness();await h.coordinator.ensureStartup();
  const result=await h.coordinator.downloadCampaignAlpha();
  assert.deepEqual(result.selection.packs.map(pack=>pack.id),['campaign-alpha-mobile-low','core-bootstrap']);
  let list=await h.coordinator.listContent();
  assert.equal(list.find(pack=>pack.id==='campaign-alpha-mobile-low').installed,true);
  assert.equal(list.find(pack=>pack.id==='core-bootstrap').installed,true);
  await h.coordinator.removeCampaignAlpha();
  list=await h.coordinator.listContent();
  assert.equal(list.find(pack=>pack.id==='campaign-alpha-mobile-low').installed,false);
  assert.equal(list.find(pack=>pack.id==='core-bootstrap').installed,true);
  assert.equal(list.length,2,'Do not invent not-yet-published packs');
});

test('RC7 rejects tampered remote manifest without falling back to signed cached data',async()=>{
  const h=testHarness();await h.coordinator.ensureStartup();
  const bad={...h.catalog.manifest,catalogVersion:'spoofed-version'};
  const store=h.store,payloadStore=createBrowserAssetPayloadStore({store,fetchImpl:async()=>new Response('')});
  const malicious=createResourceDownloadCoordinator({store,payloadStore,fetchManifest:async()=>bad});
  await assert.rejects(malicious.ensureStartup(),/digest mismatch/);
});

test('RC7 pause/cancel and invalid stages fail closed before activation',async()=>{
  const h=testHarness(),abort=new AbortController();abort.abort();
  await assert.rejects(h.coordinator.downloadCampaignAlpha({signal:abort.signal}),
    error=>error?.code==='ASSET_DOWNLOAD_CANCELLED');
  assert.equal(await h.store.get('meta','active-set:alpha-stage-1'),null);
  assert.equal(Object.hasOwn(h.coordinator,'ensureArbitraryStage'),false,'Only approved stage methods are exposed');
});

test('RC7 feature flag defaults off and is Android-only in startup UI',()=>{
  assert.equal(rc7StartupDownloadEnabled({}),false);
  assert.equal(rc7StartupDownloadEnabled({VITE_C15_RC7_ASSET_DELIVERY_ENABLED:'true'}),true);
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const startup=fs.readFileSync(new URL('../src/components/ResourceDownloads/StartupResourceGate.jsx',import.meta.url),'utf8');
  const manager=fs.readFileSync(new URL('../src/components/ResourceDownloads/ResourceManagerScreen.jsx',import.meta.url),'utf8');
  const java=fs.readFileSync(new URL('../android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterAssetStorePlugin.java',import.meta.url),'utf8');
  assert.match(app,/StartupResourceGate/);assert.match(app,/resource_manager/);
  assert.match(startup,/Capacitor\.isNativePlatform\(\)/);assert.match(startup,/ensureStartup/);
  assert.match(manager,/downloadCampaignAlpha/);assert.match(manager,/removeCampaignAlpha/);
  assert.match(java,/call\.getData\(\)\.opt\("expectedBytes"\)/);
  assert.match(java,/raw instanceof Number/);assert.match(java,/Double\.isFinite/);
  assert.doesNotMatch(java,/call\.getLong\("expectedBytes"\)/);
});
