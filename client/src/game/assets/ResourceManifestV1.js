/**
 * C15-RC1 remote resource manifest foundation.
 * Visual packs are versioned, immutable and cached before battle. They never
 * carry combat authority, secrets, rewards or settlement decisions.
 */
export const RESOURCE_MANIFEST_VERSION='resource-manifest-v1';
export const RESOURCE_PACK_VERSION='resource-pack-v1';
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[a-z0-9][a-z0-9._-]{2,79}$/;
const VERSION=/^[0-9]+	?$|^v?[0-9]+(?:\.[0-9]+){0,3}$/;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length
  &&keys.every(key=>Object.hasOwn(value,key));
const int=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const unique=list=>new Set(list).size===list.length;
const PACK_KEYS=['version','id','revision','sha256','sizeBytes','quality','required','stageKeys','url','minAppVersion','contentTypes','dependencies'];
const MANIFEST_KEYS=['version','generatedAtMs','catalogVersion','packs','manifestDigest'];
const qualities=new Set(['bootstrap','mobile-low','mobile-high','tablet-high','desktop']);
const contentTypes=new Set(['ui','background','enemy-atlas','enemy-model','ship-atlas','ship-model','audio','vfx']);
function assertPack(pack){
  if(!exact(pack,PACK_KEYS)||pack.version!==RESOURCE_PACK_VERSION||!ID.test(pack.id||'')
    ||!int(pack.revision,1,1_000_000)||!HEX.test(pack.sha256||'')
    ||!int(pack.sizeBytes,1,2_000_000_000)||!qualities.has(pack.quality)
    ||typeof pack.required!=='boolean'||!Array.isArray(pack.stageKeys)||pack.stageKeys.length>64
    ||pack.stageKeys.some(x=>typeof x!=='string'||!ID.test(x))||!unique(pack.stageKeys)
    ||typeof pack.url!=='string'||!/^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{8,2048}$/.test(pack.url)
    ||/\/(?:latest|current)(?:\/|$)/i.test(pack.url)
    ||!pack.url.includes(`/v${pack.revision}/`)
    ||typeof pack.minAppVersion!=='string'||!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pack.minAppVersion)
    ||!Array.isArray(pack.contentTypes)||pack.contentTypes.length<1||pack.contentTypes.length>16
    ||pack.contentTypes.some(x=>!contentTypes.has(x))||!unique(pack.contentTypes)
    ||!Array.isArray(pack.dependencies)||pack.dependencies.length>32
    ||pack.dependencies.some(x=>typeof x!=='string'||!ID.test(x))||!unique(pack.dependencies)){
    throw new TypeError(`Invalid resource pack: ${pack?.id??'(unknown)'}`);
  }
  return true;
}
export function validateResourceManifestV1(manifest){
  if(!exact(manifest,MANIFEST_KEYS)||manifest.version!==RESOURCE_MANIFEST_VERSION
    ||!int(manifest.generatedAtMs,1,Number.MAX_SAFE_INTEGER)
    ||typeof manifest.catalogVersion!=='string'||!/^[-a-z0-9.]{3,40}$/.test(manifest.catalogVersion)
    ||!Array.isArray(manifest.packs)||manifest.packs.length<1||manifest.packs.length>256
    ||!HEX.test(manifest.manifestDigest||''))throw new TypeError('Invalid resource manifest');
  manifest.packs.forEach(assertPack);
  if(!unique(manifest.packs.map(x=>x.id)))throw new TypeError('Duplicate resource pack ID');
  const ids=new Set(manifest.packs.map(x=>x.id));
  for(const pack of manifest.packs){
    for(const dep of pack.dependencies)if(!ids.has(dep))throw new TypeError(`Missing resource dependency: ${dep}`);
  }
  return true;
}
function qualityRank(value){return ['bootstrap','mobile-low','mobile-high','tablet-high','desktop'].indexOf(value);}
export function selectResourcePacksV1({manifest,stageKey,quality,installed={}}){
  validateResourceManifestV1(manifest);
  if(typeof stageKey!=='string'||!ID.test(stageKey)||!qualities.has(quality)||!record(installed)){
    throw new TypeError('Invalid resource selection request');
  }
  const available=manifest.packs.filter(pack=>pack.quality==='bootstrap'
    ||(pack.stageKeys.includes(stageKey)&&qualityRank(pack.quality)<=qualityRank(quality)));
  const byId=new Map(manifest.packs.map(pack=>[pack.id,pack]));
  const selected=new Map();
  const add=pack=>{if(selected.has(pack.id))return;for(const dep of pack.dependencies)add(byId.get(dep));selected.set(pack.id,pack);};
  for(const pack of available){if(!pack)throw new TypeError('Invalid resource dependency graph');add(pack);}
  const packs=[...selected.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const download=packs.filter(pack=>installed[pack.id]?.revision!==pack.revision
    ||installed[pack.id]?.sha256!==pack.sha256);
  const totalBytes=download.reduce((sum,pack)=>sum+pack.sizeBytes,0);
  return freeze({version:'resource-selection-v1',stageKey,quality,packs,download,totalBytes,
    requiredReady:packs.filter(x=>x.required).every(x=>!download.includes(x))});
}
export function planAtomicResourceActivationV1({selection,verifiedDownloads,active}){
  if(!record(selection)||selection.version!=='resource-selection-v1'||!Array.isArray(selection.packs)
    ||!record(verifiedDownloads)||!record(active))throw new TypeError('Invalid activation input');
  const next={...active};
  for(const pack of selection.packs){
    const current=active[pack.id];
    if(current?.revision===pack.revision&&current?.sha256===pack.sha256)continue;
    const verified=verifiedDownloads[pack.id];
    if(!record(verified)||verified.revision!==pack.revision||verified.sha256!==pack.sha256
      ||verified.verified!==true)throw new TypeError(`Resource pack not verified: ${pack.id}`);
    next[pack.id]={revision:pack.revision,sha256:pack.sha256,activatedAtMs:verified.verifiedAtMs};
  }
  return freeze({version:'resource-activation-plan-v1',stageKey:selection.stageKey,
    previous:freeze({...active}),next:freeze(next),rollback:freeze({...active})});
}
