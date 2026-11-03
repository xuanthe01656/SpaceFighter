'use strict';
/**
 * C15-RC1B immutable remote resource catalog.
 * Visual files only: no combat authority, secrets, rewards or entitlement writes.
 */
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createResourceManifestV1,verifyResourceManifestV1}=require('./resourceManifestV1.cjs');

const DESCRIPTOR_VERSION='c15-resource-pack-descriptor-v1';
const PACK_ID=/^[a-z0-9][a-z0-9._-]{2,79}$/;
const FILE_PATH=/^[a-z0-9][a-z0-9._/-]{1,159}$/;
const HEX=/^[a-f0-9]{64}$/;
const freeze=value=>{if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const descriptorBytes=descriptor=>Buffer.from(JSON.stringify(canonical(descriptor))+'\n','utf8');
const MIME=Object.freeze({'.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.glb':'model/gltf-binary','.ogg':'audio/ogg','.mp3':'audio/mpeg'});

const PACKS=Object.freeze([
  Object.freeze({id:'core-bootstrap',revision:1,quality:'bootstrap',required:true,stageKeys:[],
    minAppVersion:'1.0.0',contentTypes:['ui'],dependencies:[],files:['bootstrap.json']}),
  Object.freeze({id:'campaign-alpha-mobile-low',revision:1,quality:'mobile-low',required:true,
    stageKeys:['alpha-stage-1'],minAppVersion:'1.0.0',contentTypes:['background','enemy-atlas','ship-atlas'],
    dependencies:['core-bootstrap'],files:['alpha_coast_low.webp','p1_small_sheet.webp','ship_xwing_top.png']}),
]);

function normalizeBaseUrl(value){
  if(typeof value!=='string'||value.length<12||value.length>2048||!/^https:\/\//.test(value))
    throw new TypeError('C15 RC1B HTTPS public base URL required');
  return value.replace(/\/+$/,'');
}
function safeJoin(root,relative){
  if(!FILE_PATH.test(relative||'')||relative.includes('..'))throw new TypeError('Invalid C15 resource path');
  const target=path.resolve(root,relative),base=path.resolve(root)+path.sep;
  if(!target.startsWith(base))throw new TypeError('C15 resource path escapes root');
  return target;
}
function normalizePrefix(value){
  const prefix=String(value||'spacefighter-assets/c15-rc1b').replace(/^\/+|\/+$/g,'');
  if(!/^[a-z0-9][a-z0-9._/-]{2,159}$/.test(prefix)||prefix.includes('..')||prefix.includes('//'))
    throw new TypeError('C15 asset path prefix invalid');
  return prefix;
}
function createC15Rc1bResourceCatalog({rootDir=path.resolve(__dirname,'../resources/c15-rc1b'),
  publicBaseUrl,assetBaseUrl=null,assetPathPrefix='spacefighter-assets/c15-rc1b',
  generatedAtMs=Date.now(),catalogVersion='product-v1.0.0'}={}){
  const baseUrl=normalizeBaseUrl(publicBaseUrl);
  const externalBase=assetBaseUrl?normalizeBaseUrl(assetBaseUrl):null;
  const prefix=normalizePrefix(assetPathPrefix);
  const assetRootUrl=externalBase?`${externalBase}/${prefix}`:`${baseUrl}/api/v1/c15/resources`;
  if(!Number.isSafeInteger(generatedAtMs)||generatedAtMs<1)throw new TypeError('C15 resource generatedAt invalid');
  const descriptors=new Map(),files=new Map(),manifestInputs=[];
  for(const pack of PACKS){
    if(!PACK_ID.test(pack.id))throw new TypeError('Invalid built-in C15 pack ID');
    const packRoot=path.join(rootDir,pack.id,`v${pack.revision}`);
    const entries=[];let totalBytes=0;
    for(const relative of pack.files){
      const absolute=safeJoin(packRoot,relative);
      const stat=fs.statSync(absolute);
      if(!stat.isFile()||stat.size<1||stat.size>100_000_000)throw new TypeError(`Invalid C15 resource file: ${relative}`);
      const bytes=fs.readFileSync(absolute),digest=sha(bytes),ext=path.extname(relative).toLowerCase();
      const contentType=MIME[ext]||'application/octet-stream';
      const url=`${assetRootUrl}/packs/${pack.id}/v${pack.revision}/files/${relative}`;
      const entry=freeze({path:relative,sizeBytes:stat.size,sha256:digest,contentType,url});
      entries.push(entry);totalBytes+=stat.size;
      files.set(`${pack.id}:${pack.revision}:${relative}`,freeze({absolute,sizeBytes:stat.size,sha256:digest,contentType}));
    }
    const baseDescriptor={version:DESCRIPTOR_VERSION,id:pack.id,revision:pack.revision,
      quality:pack.quality,required:pack.required,files:entries.sort((a,b)=>a.path.localeCompare(b.path)),totalBytes};
    const descriptor=freeze({...baseDescriptor,descriptorDigest:sha(Buffer.from(JSON.stringify(canonical(baseDescriptor)),'utf8'))});
    const bytes=descriptorBytes(descriptor),descriptorSha=sha(bytes);
    const descriptorUrl=`${assetRootUrl}/packs/${pack.id}/v${pack.revision}/descriptor.json`;
    descriptors.set(`${pack.id}:${pack.revision}`,freeze({descriptor,bytes,sha256:descriptorSha}));
    manifestInputs.push({id:pack.id,revision:pack.revision,sha256:descriptorSha,sizeBytes:totalBytes,
      quality:pack.quality,required:pack.required,stageKeys:pack.stageKeys,url:descriptorUrl,
      minAppVersion:pack.minAppVersion,contentTypes:pack.contentTypes,dependencies:pack.dependencies});
  }
  const manifest=createResourceManifestV1({generatedAtMs,catalogVersion,packs:manifestInputs});
  verifyResourceManifestV1(manifest);
  function getDescriptor(id,revision){return descriptors.get(`${id}:${revision}`)||null;}
  function getFile(id,revision,relative){return files.get(`${id}:${revision}:${relative}`)||null;}
  return freeze({version:'c15-rc1b-resource-catalog-v1',baseUrl,assetRootUrl,assetPathPrefix:prefix,
    externalAssetDelivery:Boolean(externalBase),manifest,getDescriptor,getFile,packIds:freeze(PACKS.map(x=>x.id))});
}
module.exports=freeze({DESCRIPTOR_VERSION,createC15Rc1bResourceCatalog,descriptorBytes});
