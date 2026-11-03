/**
 * RC7 integrated download coordinator. Only catalog-signed immutable V1 packs
 * can be activated. The native payload store owns bytes; IndexedDB owns metadata.
 * No wallet/receipt/gameplay state is modified by this module.
 */
import {createC15BrowserStore} from '../c15/C15Rc1bStore.js';
import {createAutoAssetPayloadStore,assertAssetPayloadStore,rc7NativeAssetDeliveryEnabled}
  from './AssetPayloadStoreV1.js';
import {ensureC15StageResources,verifyManifestDigest} from '../c15/C15ResourceDelivery.js';

export const STARTUP_STAGE_KEY='bootstrap-startup';
export const CAMPAIGN_ALPHA_STAGE_KEY='alpha-stage-1';
const MANIFEST_KEY='rc7:verified-remote-manifest-v1';
const activeKey=stage=>`active-set:${stage}`;
const allowedStages=Object.freeze({
  [STARTUP_STAGE_KEY]:'bootstrap',
  [CAMPAIGN_ALPHA_STAGE_KEY]:'mobile-low',
});
const knownPacks=Object.freeze({
  'core-bootstrap':{stageKey:STARTUP_STAGE_KEY,labelVi:'Tài nguyên cơ bản',labelEn:'Core resources',removable:false},
  'campaign-alpha-mobile-low':{stageKey:CAMPAIGN_ALPHA_STAGE_KEY,labelVi:'Chiến dịch Alpha',labelEn:'Campaign Alpha',removable:true},
});
const cancelled=()=>Object.assign(new Error('Asset download paused'),{name:'AbortError',code:'ASSET_DOWNLOAD_CANCELLED'});

export function rc7StartupDownloadEnabled(env=import.meta.env){
  return rc7NativeAssetDeliveryEnabled(env);
}

export function createResourceDownloadCoordinator({store,payloadStore,fetchManifest,fetchImpl=fetch}={}){
  if(!store||typeof fetchManifest!=='function')throw new TypeError('Resource coordinator requires store and fetchManifest');
  assertAssetPayloadStore(payloadStore);
  let activeRequest=null;
  async function manifest({allowOffline=true}={}){
    let value;
    try{
      value=await fetchManifest();
    }catch(error){
      if(!allowOffline)throw error;
      const cached=await store.get('meta',MANIFEST_KEY);
      if(!cached)throw error;
      await verifyManifestDigest(cached);
      return Object.freeze({value:cached,fromCache:true});
    }
    // Never cache an unsigned/mismatched manifest. Integrity errors are fatal;
    // they must not silently fall back to an older manifest.
    await verifyManifestDigest(value);
    await store.put('meta',MANIFEST_KEY,value);
    return Object.freeze({value,fromCache:false});
  }
  async function ensureStage(stageKey,{onProgress=()=>{},signal=null}={}){
    if(!Object.hasOwn(allowedStages,stageKey))throw new TypeError('Unknown resource content stage');
    if(signal?.aborted)throw cancelled();
    // Do not allow two UI downloads to race on the same immutable .part path.
    if(activeRequest)throw Object.assign(new Error('Another resource download is active'),{code:'ASSET_DOWNLOAD_BUSY'});
    const owner={};activeRequest=owner;
    try{
      const {value}=await manifest();
      if(signal?.aborted)throw cancelled();
      return await ensureC15StageResources({manifest:value,stageKey,quality:allowedStages[stageKey],
        store,payloadStore,fetchImpl,onProgress,signal});
    }finally{
      if(activeRequest===owner)activeRequest=null;
    }
  }
  async function installed(pack,stageKey){
    const active=await store.get('meta',activeKey(stageKey));
    const info=active?.packs?.[pack.id];
    if(info?.revision!==pack.revision||info?.sha256!==pack.sha256||!Array.isArray(info.files)
      ||info.files.length<1)return false;
    for(const file of info.files){
      if(!file?.sha256||!file?.sizeBytes||!file?.nativePath||!file?.storageKey)return false;
      if(!await payloadStore.verify({key:file.storageKey,nativePath:file.nativePath,
        sizeBytes:file.sizeBytes,sha256:file.sha256}))return false;
    }
    return true;
  }
  async function listContent(){
    const {value}=await manifest();
    const result=[];
    for(const pack of value.packs){
      const info=knownPacks[pack.id];
      if(!info)continue; // No UI action for unimplemented content types.
      result.push(Object.freeze({id:pack.id,stageKey:info.stageKey,
        labelVi:info.labelVi,labelEn:info.labelEn,removable:info.removable,
        requiredAtStartup:!info.removable,sizeBytes:pack.sizeBytes,
        installed:await installed(pack,info.stageKey)}));
    }
    return Object.freeze(result);
  }
  async function removeCampaignAlpha(){
    if(activeRequest)throw Object.assign(new Error('Cannot remove assets during download'),{code:'ASSET_DOWNLOAD_BUSY'});
    const info=await store.get('meta',activeKey(CAMPAIGN_ALPHA_STAGE_KEY));
    const files=info?.packs?.['campaign-alpha-mobile-low']?.files||[];
    for(const file of files){
      const success=await payloadStore.remove({key:file.storageKey,nativePath:file.nativePath});
      if(!success)throw new Error('Cannot remove campaign pack file');
    }
    // The bootstrap files are shared and deliberately never removed.
    // Dropping the optional active set forces a fresh verified activation.
    await store.remove('meta',activeKey(CAMPAIGN_ALPHA_STAGE_KEY));
    return true;
  }
  return Object.freeze({version:'resource-download-coordinator-v1',manifest,
    ensureStartup:options=>ensureStage(STARTUP_STAGE_KEY,options),
    downloadCampaignAlpha:options=>ensureStage(CAMPAIGN_ALPHA_STAGE_KEY,options),
    listContent,removeCampaignAlpha});
}

let sharedPromise=null;
export function getSharedResourceDownloadCoordinator(){
  if(!sharedPromise){
    sharedPromise=(async()=>{
      const store=createC15BrowserStore();
      const payloadStore=await createAutoAssetPayloadStore({store});
      const {fetchC15ResourceManifest}=await import('../../services/gameApi.js');
      return createResourceDownloadCoordinator({store,payloadStore,fetchManifest:fetchC15ResourceManifest});
    })().catch(error=>{sharedPromise=null;throw error;});
  }
  return sharedPromise;
}
