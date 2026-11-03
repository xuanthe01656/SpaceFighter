import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createC15MemoryStore} from '../src/game/c15/C15Rc1bStore.js';
import {createBrowserAssetPayloadStore,downloadAssetBytesResumable,rc7NativeAssetDeliveryEnabled}
  from '../src/game/assets/AssetPayloadStoreV1.js';
import {ensureC15StageResources} from '../src/game/c15/C15ResourceDelivery.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createC15Rc1bResourceCatalog}=require('../../server/lib/c15Rc1bResourceCatalog.cjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function fetchBytes(bytes,{chunk=bytes.length}={}){
  return async(_url,options={})=>{let start=0;
    const range=options.headers?.Range||options.headers?.range;
    if(range){const match=/bytes=(\d+)-/.exec(range);start=Number(match?.[1]||0);}
    const end=Math.min(bytes.length-1,start+chunk-1),partial=start>0||end<bytes.length-1;
    return new Response(bytes.slice(start,end+1),{status:partial?206:200,
      headers:partial?{'content-range':`bytes ${start}-${end}/${bytes.length}`}:{}});
  };
}

test('RC7 browser payload store resumes, verifies, resolves and clears immutable bytes',async()=>{
  const bytes=new TextEncoder().encode('spacefighter-remote-asset-payload-v1');
  const store=createC15MemoryStore(),payload=createBrowserAssetPayloadStore({store,fetchImpl:fetchBytes(bytes,{chunk:7})});
  const progress=[];await payload.download({key:'pack:v1:file.webp',url:'https://assets.example/file.webp',sizeBytes:bytes.length,
    sha256:sha(bytes),contentType:'image/webp',onProgress:value=>progress.push(value)});
  assert.equal(await payload.verify({key:'pack:v1:file.webp',sizeBytes:bytes.length,sha256:sha(bytes)}),true);
  const resolved=await payload.resolve({key:'pack:v1:file.webp',sizeBytes:bytes.length,sha256:sha(bytes),contentType:'image/webp'});
  assert.match(resolved.url,/^blob:/);resolved.revoke();assert.equal(progress.at(-1).done,true);
  assert.equal(await payload.clear(),true);
  assert.equal(await payload.verify({key:'pack:v1:file.webp',sizeBytes:bytes.length,sha256:sha(bytes)}),false);
});

test('RC7 browser payload download honors cancellation without accepting partial bytes',async()=>{
  const bytes=new Uint8Array(64);const store=createC15MemoryStore(),controller=new AbortController();controller.abort();
  await assert.rejects(downloadAssetBytesResumable({url:'https://assets.example/file',sizeBytes:bytes.length,store,key:'cancel',
    fetchImpl:fetchBytes(bytes),signal:controller.signal}),error=>error?.code==='ASSET_DOWNLOAD_CANCELLED');
});

test('RC7 storage reserve fails closed before required packs download',async()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test'}),store=createC15MemoryStore();
  const payload={version:'asset-payload-store-v1',kind:'test-low-storage',async getCapacity(){return {usableBytes:1,totalBytes:1};},
    async verify(){return false;},async download(){throw new Error('must not download');},async resolve(){return null;},
    async remove(){return true;},async clear(){return true;}};
  await assert.rejects(ensureC15StageResources({manifest:catalog.manifest,store,payloadStore:payload,quality:'mobile-low'}),
    error=>error?.code==='C15_ASSET_STORAGE_LOW'&&error.requiredBytes>error.usableBytes);
});

test('RC7 native payload feature is explicit and disabled by default',()=>{
  assert.equal(rc7NativeAssetDeliveryEnabled({}),false);
  assert.equal(rc7NativeAssetDeliveryEnabled({VITE_C15_RC7_ASSET_DELIVERY_ENABLED:'true'}),true);
});
