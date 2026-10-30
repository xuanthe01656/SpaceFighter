'use strict';
const {createHash}=require('node:crypto');
const RESOURCE_MANIFEST_VERSION='resource-manifest-v1';
const RESOURCE_PACK_VERSION='resource-pack-v1';
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[a-z0-9][a-z0-9._-]{2,79}$/;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const int=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const qualities=new Set(['bootstrap','mobile-low','mobile-high','tablet-high','desktop']);
const contentTypes=new Set(['ui','background','enemy-atlas','enemy-model','ship-atlas','ship-model','audio','vfx']);
const PACK_INPUT_KEYS=['id','revision','sha256','sizeBytes','quality','required','stageKeys','url','minAppVersion','contentTypes','dependencies'];
function normalizePack(input){
  if(!exact(input,PACK_INPUT_KEYS)||!ID.test(input.id||'')||!int(input.revision,1,1_000_000)
    ||!HEX.test(input.sha256||'')||!int(input.sizeBytes,1,2_000_000_000)||!qualities.has(input.quality)
    ||typeof input.required!=='boolean'||!Array.isArray(input.stageKeys)||input.stageKeys.length>64
    ||input.stageKeys.some(x=>typeof x!=='string'||!ID.test(x))||new Set(input.stageKeys).size!==input.stageKeys.length
    ||typeof input.url!=='string'||!/^https:\/\//.test(input.url)||/\/(?:latest|current)(?:\/|$)/i.test(input.url)
    ||!input.url.includes(`/v${input.revision}/`)
    ||typeof input.minAppVersion!=='string'||!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(input.minAppVersion)
    ||!Array.isArray(input.contentTypes)||input.contentTypes.length<1||input.contentTypes.length>16
    ||input.contentTypes.some(x=>!contentTypes.has(x))||new Set(input.contentTypes).size!==input.contentTypes.length
    ||!Array.isArray(input.dependencies)||input.dependencies.length>32
    ||input.dependencies.some(x=>typeof x!=='string'||!ID.test(x))||new Set(input.dependencies).size!==input.dependencies.length){
    throw new TypeError(`Invalid resource pack: ${input?.id??'(unknown)'}`);
  }
  return freeze({version:RESOURCE_PACK_VERSION,...structuredClone(input),
    stageKeys:[...input.stageKeys].sort(),contentTypes:[...input.contentTypes].sort(),
    dependencies:[...input.dependencies].sort()});
}
function createResourceManifestV1({generatedAtMs,catalogVersion,packs}){
  if(!int(generatedAtMs,1,Number.MAX_SAFE_INTEGER)||typeof catalogVersion!=='string'
    ||!/^[-a-z0-9.]{3,40}$/.test(catalogVersion)||!Array.isArray(packs)
    ||packs.length<1||packs.length>256)throw new TypeError('Invalid resource manifest input');
  const normalized=packs.map(normalizePack).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(normalized.map(x=>x.id)).size!==normalized.length)throw new TypeError('Duplicate resource pack ID');
  const ids=new Set(normalized.map(x=>x.id));
  for(const pack of normalized)for(const dep of pack.dependencies)if(!ids.has(dep))throw new TypeError(`Missing resource dependency: ${dep}`);
  const base={version:RESOURCE_MANIFEST_VERSION,generatedAtMs,catalogVersion,packs:normalized};
  return freeze({...base,manifestDigest:digest(['sf-resource-manifest-v1',base])});
}
function verifyResourceManifestV1(manifest){
  if(!record(manifest)||manifest.version!==RESOURCE_MANIFEST_VERSION||!HEX.test(manifest.manifestDigest||''))throw new TypeError('Invalid resource manifest');
  const {manifestDigest,...base}=manifest;
  if(digest(['sf-resource-manifest-v1',base])!==manifestDigest)throw new TypeError('Resource manifest digest mismatch');
  const rebuilt=createResourceManifestV1({generatedAtMs:base.generatedAtMs,catalogVersion:base.catalogVersion,
    packs:base.packs.map(({version,...pack})=>pack)});
  if(rebuilt.manifestDigest!==manifestDigest)throw new TypeError('Resource manifest normalization mismatch');
  return true;
}
module.exports=freeze({RESOURCE_MANIFEST_VERSION,RESOURCE_PACK_VERSION,createResourceManifestV1,verifyResourceManifestV1,resourceManifestDigest:digest});
