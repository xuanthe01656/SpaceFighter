import {validateResourceManifestV1,selectResourcePacksV1,planAtomicResourceActivationV1}
  from '../assets/ResourceManifestV1.js';
import {assertAssetPayloadStore,createAutoAssetPayloadStore,downloadAssetBytesResumable}
  from '../assets/AssetPayloadStoreV1.js';
import {c15Sha256Hex,c15CanonicalJson} from './C15Crypto.js';
import {cloneC15PersistentValue} from './C15Rc1bStore.js';

const DESCRIPTOR_VERSION='c15-resource-pack-descriptor-v1';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const HEX=/^[a-f0-9]{64}$/;
const FILE=/^[a-z0-9][a-z0-9._/-]{1,159}$/;
const DESCRIPTOR_KEYS=['version','id','revision','quality','required','files','totalBytes','descriptorDigest'];
const FILE_KEYS=['path','sizeBytes','sha256','contentType','url'];
const ACTIVE_KEY=stageKey=>`active-set:${stageKey}`;
const fileKey=(id,revision,path)=>`${id}:v${revision}:${path}`;
const nativePath=(id,revision,path)=>`packs/${id}/v${revision}/${path}`;
const DEFAULT_FREE_RESERVE_BYTES=128*1024*1024;

function safeProgress(listener,value){if(typeof listener==='function'){try{listener(Object.freeze({...value}));}catch(_){}}}
function rollbackSnapshot(previous,stageKey){
  const source=record(previous)?previous:{};
  // Keep one bounded, JSON-like rollback snapshot. Never persist the previous
  // rollback chain. Immutable payload bytes stay in IndexedDB/native storage.
  return cloneC15PersistentValue({
    version:source.version==='c15-active-resource-set-v1'
      ?source.version:'c15-active-resource-set-v1',
    stageKey,
    manifestDigest:typeof source.manifestDigest==='string'?source.manifestDigest:null,
    activatedAtMs:Number.isSafeInteger(source.activatedAtMs)?source.activatedAtMs:null,
    packs:record(source.packs)?source.packs:{},
    fileIndex:record(source.fileIndex)?source.fileIndex:{},
  });
}

async function verifyManifestDigest(manifest){
  validateResourceManifestV1(manifest);
  const {manifestDigest,...base}=manifest;
  const actual=await c15Sha256Hex(JSON.stringify(['sf-resource-manifest-v1',JSON.parse(c15CanonicalJson(base))]));
  if(actual!==manifestDigest)throw new TypeError('C15 resource manifest digest mismatch');
  return true;
}
async function validateDescriptor(descriptor,pack){
  if(!exact(descriptor,DESCRIPTOR_KEYS)||descriptor.version!==DESCRIPTOR_VERSION||descriptor.id!==pack.id
    ||descriptor.revision!==pack.revision||descriptor.quality!==pack.quality||descriptor.required!==pack.required
    ||!Array.isArray(descriptor.files)||descriptor.files.length<1||descriptor.files.length>128
    ||!Number.isSafeInteger(descriptor.totalBytes)||descriptor.totalBytes<1||!HEX.test(descriptor.descriptorDigest||''))
    throw new TypeError(`C15 pack descriptor invalid: ${pack.id}`);
  let total=0;const seen=new Set();
  for(const file of descriptor.files){
    if(!exact(file,FILE_KEYS)||!FILE.test(file.path||'')||file.path.includes('..')||seen.has(file.path)
      ||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>2_000_000_000
      ||!HEX.test(file.sha256||'')||typeof file.contentType!=='string'||file.contentType.length<3
      ||typeof file.url!=='string'||!/^https:\/\//.test(file.url)||!file.url.includes(`/v${pack.revision}/`))
      throw new TypeError(`C15 pack file invalid: ${pack.id}`);
    seen.add(file.path);total+=file.sizeBytes;
  }
  if(total!==descriptor.totalBytes||total!==pack.sizeBytes)throw new TypeError(`C15 pack size mismatch: ${pack.id}`);
  const {descriptorDigest,...base}=descriptor;
  if(await c15Sha256Hex(c15CanonicalJson(base))!==descriptorDigest)
    throw new TypeError(`C15 pack descriptor digest mismatch: ${pack.id}`);
  return true;
}

async function downloadPack({pack,payloadStore,fetchImpl,onProgress,totalDownloadBytes,completedBefore,signal}){
  // Manifest hashes the small descriptor. Payload files are resumable and may
  // live in IndexedDB (web preview) or app-private native storage (Android).
  if(signal?.aborted)throw Object.assign(new Error('Asset download cancelled'),{name:'AbortError',code:'ASSET_DOWNLOAD_CANCELLED'});
  const descriptorResponse=await fetchImpl(pack.url,{cache:'no-store',signal});
  if(!descriptorResponse.ok)throw new Error(`C15 descriptor download failed (${descriptorResponse.status})`);
  const descriptorBytes=new Uint8Array(await descriptorResponse.arrayBuffer());
  if(descriptorBytes.length<2||descriptorBytes.length>1_000_000)
    throw new TypeError(`C15 descriptor size invalid: ${pack.id}`);
  if(await c15Sha256Hex(descriptorBytes)!==pack.sha256)throw new TypeError(`C15 descriptor SHA mismatch: ${pack.id}`);
  let descriptor;try{descriptor=JSON.parse(new TextDecoder().decode(descriptorBytes));}
  catch{throw new TypeError(`C15 descriptor JSON invalid: ${pack.id}`);}
  await validateDescriptor(descriptor,pack);
  const files=[];let packCompleted=0;
  for(const file of descriptor.files){
    const key=fileKey(pack.id,pack.revision,file.path);
    const path=nativePath(pack.id,pack.revision,file.path);
    await payloadStore.download({key,nativePath:path,url:file.url,sizeBytes:file.sizeBytes,sha256:file.sha256,
      contentType:file.contentType,signal,onProgress:value=>{
        safeProgress(onProgress,{version:'asset-download-progress-v1',phase:'downloading',packId:pack.id,path:file.path,
          receivedBytes:completedBefore+packCompleted+Math.min(file.sizeBytes,Number(value.receivedBytes||0)),
          totalBytes:totalDownloadBytes,fileReceivedBytes:Number(value.receivedBytes||0),fileTotalBytes:file.sizeBytes,
          storage:payloadStore.kind});
      }});
    packCompleted+=file.sizeBytes;
    files.push({path:file.path,sha256:file.sha256,sizeBytes:file.sizeBytes,contentType:file.contentType,
      storageKey:key,nativePath:path});
  }
  return {revision:pack.revision,sha256:pack.sha256,verified:true,verifiedAtMs:Date.now(),files};
}
async function verifiedInstalledPacks(previous,payloadStore){
  const installed={};
  for(const [id,meta] of Object.entries(previous?.packs||{})){
    if(!Number.isSafeInteger(meta?.revision)||typeof meta?.sha256!=='string'||!Array.isArray(meta?.files)||meta.files.length<1)continue;
    let valid=true;
    for(const file of meta.files){
      if(!record(file)||!FILE.test(file.path||'')||!HEX.test(file.sha256||'')||!Number.isSafeInteger(file.sizeBytes)){valid=false;break;}
      const key=typeof file.storageKey==='string'?file.storageKey:fileKey(id,meta.revision,file.path);
      const path=typeof file.nativePath==='string'?file.nativePath:nativePath(id,meta.revision,file.path);
      if(!await payloadStore.verify({key,nativePath:path,sizeBytes:file.sizeBytes,sha256:file.sha256})){valid=false;break;}
    }
    if(valid)installed[id]=meta;
  }
  return installed;
}

export async function ensureC15StageResources({manifest,stageKey='alpha-stage-1',quality='mobile-low',store,
  payloadStore=null,fetchImpl=fetch,onProgress=()=>{},signal=null,minFreeReserveBytes=DEFAULT_FREE_RESERVE_BYTES}={}){
  if(!store)throw new TypeError('C15 resource store required');
  if(!Number.isSafeInteger(minFreeReserveBytes)||minFreeReserveBytes<0||minFreeReserveBytes>2_000_000_000)
    throw new TypeError('C15 resource storage reserve invalid');
  await verifyManifestDigest(manifest);
  payloadStore=payloadStore||await createAutoAssetPayloadStore({store,fetchImpl});
  assertAssetPayloadStore(payloadStore);
  const previous=(await store.get('meta',ACTIVE_KEY(stageKey)))||{version:'c15-active-resource-set-v1',stageKey,packs:{}};
  const installed=await verifiedInstalledPacks(previous,payloadStore);
  const selection=selectResourcePacksV1({manifest,stageKey,quality,installed});
  if(selection.totalBytes>0){
    const capacity=await payloadStore.getCapacity();
    if(Number.isFinite(capacity?.usableBytes)&&capacity.usableBytes<selection.totalBytes+minFreeReserveBytes){
      const error=new Error('Not enough app-private storage for required game resources');
      error.code='C15_ASSET_STORAGE_LOW';error.requiredBytes=selection.totalBytes+minFreeReserveBytes;
      error.usableBytes=capacity.usableBytes;throw error;
    }
  }
  safeProgress(onProgress,{version:'asset-download-progress-v1',phase:selection.download.length?'planning':'ready',
    receivedBytes:0,totalBytes:selection.totalBytes,storage:payloadStore.kind});
  const verified={};let completed=0;
  for(const pack of selection.download){
    verified[pack.id]=await downloadPack({pack,payloadStore,fetchImpl,onProgress,
      totalDownloadBytes:selection.totalBytes,completedBefore:completed,signal});
    completed+=pack.sizeBytes;
  }
  const plan=planAtomicResourceActivationV1({selection,verifiedDownloads:verified,active:installed});
  const nextPacks={...plan.next};
  for(const pack of selection.packs){const info=verified[pack.id];if(info)nextPacks[pack.id]={...nextPacks[pack.id],files:info.files};}
  const fileIndex={};
  for(const [packId,meta] of Object.entries(nextPacks))for(const file of meta.files||[])
    fileIndex[`${packId}/${file.path}`]={packId,revision:meta.revision,path:file.path,
      storageKey:file.storageKey||fileKey(packId,meta.revision,file.path),
      nativePath:file.nativePath||nativePath(packId,meta.revision,file.path),
      sizeBytes:file.sizeBytes,sha256:file.sha256,contentType:file.contentType};
  const active={version:'c15-active-resource-set-v1',stageKey,manifestDigest:manifest.manifestDigest,
    activatedAtMs:Date.now(),storage:payloadStore.kind,packs:nextPacks,fileIndex,rollback:rollbackSnapshot(previous,stageKey)};
  // Single metadata write is the activation boundary. A failed download leaves
  // the previous active set untouched; immutable files remain safe to reuse.
  await store.put('meta',ACTIVE_KEY(stageKey),active);
  safeProgress(onProgress,{version:'asset-download-progress-v1',phase:'ready',receivedBytes:selection.totalBytes,
    totalBytes:selection.totalBytes,storage:payloadStore.kind});
  return Object.freeze({selection,active,payloadStore});
}
export async function resolveC15ActiveResource({store,payloadStore=null,fetchImpl=fetch,stageKey='alpha-stage-1',packId,path}){
  payloadStore=payloadStore||await createAutoAssetPayloadStore({store,fetchImpl});
  assertAssetPayloadStore(payloadStore);
  const active=await store.get('meta',ACTIVE_KEY(stageKey));
  const index=active?.fileIndex?.[`${packId}/${path}`];
  if(!index)return null;
  return payloadStore.resolve({key:index.storageKey||fileKey(index.packId,index.revision,index.path),
    nativePath:index.nativePath||nativePath(index.packId,index.revision,index.path),sizeBytes:index.sizeBytes,
    sha256:index.sha256,contentType:index.contentType});
}

// Backward-compatible export used by the frozen RC1B tests/evidence.
export const downloadResumable=downloadAssetBytesResumable;
export {verifyManifestDigest,validateDescriptor};
