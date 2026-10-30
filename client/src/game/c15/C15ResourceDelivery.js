import {validateResourceManifestV1,selectResourcePacksV1,planAtomicResourceActivationV1}
  from '../assets/ResourceManifestV1.js';
import {c15Sha256Hex,c15CanonicalJson} from './C15Crypto.js';

const DESCRIPTOR_VERSION='c15-resource-pack-descriptor-v1';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const HEX=/^[a-f0-9]{64}$/;
const FILE=/^[a-z0-9][a-z0-9._/-]{1,159}$/;
const DESCRIPTOR_KEYS=['version','id','revision','quality','required','files','totalBytes','descriptorDigest'];
const FILE_KEYS=['path','sizeBytes','sha256','contentType','url'];
const ACTIVE_KEY=stageKey=>`active-set:${stageKey}`;
const partialKey=(kind,id,revision,path='')=>`${kind}:${id}:v${revision}:${path}`;
const fileKey=(id,revision,path)=>`${id}:v${revision}:${path}`;

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
      ||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>100_000_000
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
async function downloadResumable({url,sizeBytes,store,key,fetchImpl=fetch,maxResponses=16}){
  let saved=await store.get('partials',key);let bytes=saved?.bytes?new Uint8Array(saved.bytes):new Uint8Array(0);
  if(bytes.length>sizeBytes){await store.remove('partials',key);bytes=new Uint8Array(0);}
  for(let attempt=0;bytes.length<sizeBytes&&attempt<maxResponses;attempt++){
    const headers=bytes.length?{Range:`bytes=${bytes.length}-`}:{};
    const response=await fetchImpl(url,{headers,cache:'no-store'});
    if(!response.ok&&response.status!==206)throw new Error(`C15 resource download failed (${response.status})`);
    if(bytes.length&&response.status===200)bytes=new Uint8Array(0);
    if(response.status===206){
      const range=response.headers.get('content-range')||'';
      const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
      if(!match||Number(match[1])!==bytes.length||Number(match[3])!==sizeBytes)
        throw new Error('C15 resource range response invalid');
    }
    const reader=response.body?.getReader?.();
    if(reader){
      const parts=[bytes];let length=bytes.length,lastPersist=length;
      while(true){const {done,value}=await reader.read();if(done)break;if(!(value instanceof Uint8Array)||value.length===0)continue;
        parts.push(value);length+=value.length;if(length>sizeBytes)throw new Error('C15 resource exceeded declared size');
        if(length-lastPersist>=262144){const merged=new Uint8Array(length);let offset=0;for(const part of parts){merged.set(part,offset);offset+=part.length;}
          parts.splice(0,parts.length,merged);await store.put('partials',key,{bytes:merged.buffer,updatedAtMs:Date.now()});lastPersist=length;}
      }
      const merged=new Uint8Array(length);let offset=0;for(const part of parts){merged.set(part,offset);offset+=part.length;}bytes=merged;
    }else{
      const incoming=new Uint8Array(await response.arrayBuffer());const merged=new Uint8Array(bytes.length+incoming.length);
      merged.set(bytes);merged.set(incoming,bytes.length);bytes=merged;
    }
    await store.put('partials',key,{bytes:bytes.buffer,updatedAtMs:Date.now()});
  }
  if(bytes.length!==sizeBytes)throw new Error('C15 resource download incomplete');
  return bytes;
}
async function downloadPack({pack,store,fetchImpl}){
  // The manifest hashes the small descriptor itself. Its size is intentionally
  // not part of ResourceManifestV1, so download it once; resumable range
  // requests are reserved for declared file payloads.
  const descriptorResponse=await fetchImpl(pack.url,{cache:'no-store'});
  if(!descriptorResponse.ok)throw new Error(`C15 descriptor download failed (${descriptorResponse.status})`);
  const descriptorBytes=new Uint8Array(await descriptorResponse.arrayBuffer());
  if(descriptorBytes.length<2||descriptorBytes.length>1_000_000)
    throw new TypeError(`C15 descriptor size invalid: ${pack.id}`);
  if(await c15Sha256Hex(descriptorBytes)!==pack.sha256)throw new TypeError(`C15 descriptor SHA mismatch: ${pack.id}`);
  let descriptor;try{descriptor=JSON.parse(new TextDecoder().decode(descriptorBytes));}catch{throw new TypeError(`C15 descriptor JSON invalid: ${pack.id}`);}
  await validateDescriptor(descriptor,pack);
  const files=[];
  for(const file of descriptor.files){
    const key=partialKey('file',pack.id,pack.revision,file.path);
    const bytes=await downloadResumable({url:file.url,sizeBytes:file.sizeBytes,store,key,fetchImpl});
    if(await c15Sha256Hex(bytes)!==file.sha256)throw new TypeError(`C15 resource SHA mismatch: ${file.path}`);
    await store.put('files',fileKey(pack.id,pack.revision,file.path),{bytes:bytes.buffer,
      sha256:file.sha256,sizeBytes:file.sizeBytes,contentType:file.contentType,verifiedAtMs:Date.now()});
    await store.remove('partials',key);files.push({path:file.path,sha256:file.sha256,sizeBytes:file.sizeBytes,contentType:file.contentType});
  }
  return {revision:pack.revision,sha256:pack.sha256,verified:true,verifiedAtMs:Date.now(),files};
}
async function verifiedInstalledPacks(previous,store){
  const installed={};
  for(const [id,meta] of Object.entries(previous?.packs||{})){
    if(!Number.isSafeInteger(meta?.revision)||typeof meta?.sha256!=='string'||!Array.isArray(meta?.files)||meta.files.length<1)continue;
    let valid=true;
    for(const file of meta.files){
      if(!record(file)||!FILE.test(file.path||'')||!HEX.test(file.sha256||'')||!Number.isSafeInteger(file.sizeBytes)){valid=false;break;}
      const saved=await store.get('files',fileKey(id,meta.revision,file.path));
      if(!saved?.bytes||saved.sha256!==file.sha256||saved.sizeBytes!==file.sizeBytes){valid=false;break;}
    }
    if(valid)installed[id]=meta;
  }
  return installed;
}
export async function ensureC15StageResources({manifest,stageKey='alpha-stage-1',quality='mobile-low',store,fetchImpl=fetch}){
  if(!store)throw new TypeError('C15 resource store required');await verifyManifestDigest(manifest);
  const previous=(await store.get('meta',ACTIVE_KEY(stageKey)))||{version:'c15-active-resource-set-v1',stageKey,packs:{}};
  const installed=await verifiedInstalledPacks(previous,store);
  const selection=selectResourcePacksV1({manifest,stageKey,quality,installed});
  const verified={};
  for(const pack of selection.download)verified[pack.id]=await downloadPack({pack,store,fetchImpl});
  const plan=planAtomicResourceActivationV1({selection,verifiedDownloads:verified,active:installed});
  const nextPacks={...plan.next};
  for(const pack of selection.packs){const info=verified[pack.id];if(info)nextPacks[pack.id]={...nextPacks[pack.id],files:info.files};}
  const fileIndex={};
  for(const [packId,meta] of Object.entries(nextPacks))for(const file of meta.files||[])
    fileIndex[`${packId}/${file.path}`]={packId,revision:meta.revision,path:file.path};
  const active={version:'c15-active-resource-set-v1',stageKey,manifestDigest:manifest.manifestDigest,
    activatedAtMs:Date.now(),packs:nextPacks,fileIndex,rollback:previous};
  // Single metadata write is the activation boundary. Any failed download
  // leaves the previous active set untouched.
  await store.put('meta',ACTIVE_KEY(stageKey),active);
  return Object.freeze({selection,active});
}
export async function resolveC15ActiveResource({store,stageKey='alpha-stage-1',packId,path}){
  const active=await store.get('meta',ACTIVE_KEY(stageKey));const index=active?.fileIndex?.[`${packId}/${path}`];
  if(!index)return null;const saved=await store.get('files',fileKey(index.packId,index.revision,index.path));
  if(!saved?.bytes)return null;const blob=new Blob([saved.bytes],{type:saved.contentType||'application/octet-stream'});
  const url=URL.createObjectURL(blob);
  return Object.freeze({url,revoke:()=>URL.revokeObjectURL(url),sha256:saved.sha256});
}
export {verifyManifestDigest,validateDescriptor,downloadResumable};
