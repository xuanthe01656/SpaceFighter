import {c15Sha256Hex} from '../c15/C15Crypto.js';
import {c15StandaloneArrayBuffer} from '../c15/C15Rc1bStore.js';

const NATIVE_FLAG='VITE_C15_RC7_ASSET_DELIVERY_ENABLED';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeProgress=(listener,value)=>{if(typeof listener==='function'){try{listener(Object.freeze({...value}));}catch(_){}}};
const abortError=()=>Object.assign(new Error('Asset download cancelled'),{name:'AbortError',code:'ASSET_DOWNLOAD_CANCELLED'});
let nativeRuntimePromise=null;

export function rc7NativeAssetDeliveryEnabled(env=import.meta.env){
  return String(env?.[NATIVE_FLAG]||'false')==='true';
}

async function loadNativeRuntime(){
  if(!nativeRuntimePromise)nativeRuntimePromise=import('@capacitor/core').then(({Capacitor,registerPlugin})=>{
    if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')return null;
    if(!Capacitor.isPluginAvailable?.('SpaceFighterAssetStore')){
      const error=new Error('Android app-private asset store plugin is unavailable');
      error.code='C15_NATIVE_ASSET_STORE_UNAVAILABLE';throw error;
    }
    return Object.freeze({Capacitor,plugin:registerPlugin('SpaceFighterAssetStore')});
  }).catch(error=>{
    if(error?.code==='C15_NATIVE_ASSET_STORE_UNAVAILABLE')throw error;
    return null;
  });
  return nativeRuntimePromise;
}

export async function downloadAssetBytesResumable({url,sizeBytes,store,key,fetchImpl=fetch,
  maxResponses=16,onProgress=()=>{},signal=null}){
  if(signal?.aborted)throw abortError();
  let saved=await store.get('partials',key);
  let bytes=saved?.bytes?new Uint8Array(saved.bytes):new Uint8Array(0);
  if(bytes.length>sizeBytes){await store.remove('partials',key);bytes=new Uint8Array(0);}
  safeProgress(onProgress,{receivedBytes:bytes.length,totalBytes:sizeBytes,done:bytes.length===sizeBytes});
  for(let attempt=0;bytes.length<sizeBytes&&attempt<maxResponses;attempt++){
    const headers=bytes.length?{Range:`bytes=${bytes.length}-`}:{};
    if(signal?.aborted)throw abortError();
    const response=await fetchImpl(url,{headers,cache:'no-store',signal});
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
      while(true){
        if(signal?.aborted)throw abortError();
        const {done,value}=await reader.read();if(done)break;
        if(!(value instanceof Uint8Array)||value.length===0)continue;
        parts.push(value);length+=value.length;
        if(length>sizeBytes)throw new Error('C15 resource exceeded declared size');
        safeProgress(onProgress,{receivedBytes:length,totalBytes:sizeBytes,done:false});
        if(length-lastPersist>=262144){
          const merged=new Uint8Array(length);let offset=0;
          for(const part of parts){merged.set(part,offset);offset+=part.length;}
          parts.splice(0,parts.length,merged);
          await store.put('partials',key,{bytes:c15StandaloneArrayBuffer(merged),updatedAtMs:Date.now()});
          lastPersist=length;
        }
      }
      const merged=new Uint8Array(length);let offset=0;
      for(const part of parts){merged.set(part,offset);offset+=part.length;}
      bytes=merged;
    }else{
      const incoming=new Uint8Array(await response.arrayBuffer());
      const merged=new Uint8Array(bytes.length+incoming.length);
      merged.set(bytes);merged.set(incoming,bytes.length);bytes=merged;
      safeProgress(onProgress,{receivedBytes:bytes.length,totalBytes:sizeBytes,done:false});
    }
    await store.put('partials',key,{bytes:c15StandaloneArrayBuffer(bytes),updatedAtMs:Date.now()});
  }
  if(bytes.length!==sizeBytes)throw new Error('C15 resource download incomplete');
  safeProgress(onProgress,{receivedBytes:sizeBytes,totalBytes:sizeBytes,done:true});
  return bytes;
}

export function createBrowserAssetPayloadStore({store,fetchImpl=fetch}={}){
  if(!store)throw new TypeError('Browser asset metadata store required');
  return Object.freeze({
    version:'asset-payload-store-v1',kind:'browser-indexeddb',
    async getCapacity(){const estimate=await globalThis.navigator?.storage?.estimate?.();
      return Object.freeze({usableBytes:Number(estimate?.quota||Number.MAX_SAFE_INTEGER)-Number(estimate?.usage||0),
        totalBytes:Number(estimate?.quota||Number.MAX_SAFE_INTEGER)});},
    async verify({key,sizeBytes,sha256}){const saved=await store.get('files',key);
      if(!saved?.bytes||saved.sizeBytes!==sizeBytes||saved.sha256!==sha256)return false;
      return await c15Sha256Hex(new Uint8Array(saved.bytes))===sha256;},
    async download({key,url,sizeBytes,sha256,contentType,onProgress,signal}){
      const bytes=await downloadAssetBytesResumable({url,sizeBytes,store,key,fetchImpl,onProgress,signal});
      if(await c15Sha256Hex(bytes)!==sha256)throw new TypeError('C15 resource SHA mismatch');
      await store.put('files',key,{bytes:c15StandaloneArrayBuffer(bytes),sha256,sizeBytes,contentType,verifiedAtMs:Date.now()});
      await store.remove('partials',key);
      return Object.freeze({key,sizeBytes,sha256,storage:'browser-indexeddb'});
    },
    async resolve({key,contentType,sha256}){const saved=await store.get('files',key);
      if(!saved?.bytes||saved.sha256!==sha256)return null;
      const blob=new Blob([saved.bytes],{type:saved.contentType||contentType||'application/octet-stream'});
      const url=URL.createObjectURL(blob);
      return Object.freeze({url,revoke:()=>URL.revokeObjectURL(url),sha256,storage:'browser-indexeddb'});},
    async remove({key}){await store.remove('files',key);await store.remove('partials',key);return true;},
    async clear(){for(const name of ['files','partials']){for(const entry of await store.list(name,''))await store.remove(name,entry.key);}return true;},
  });
}

export async function createNativeAndroidAssetPayloadStore(){
  const runtime=await loadNativeRuntime();
  if(!runtime)return null;
  const {Capacitor,plugin}=runtime;
  return Object.freeze({
    version:'asset-payload-store-v1',kind:'android-app-private',
    async getCapacity(){const result=await plugin.getCapacity();return Object.freeze({
      usableBytes:Number(result.usableBytes||0),totalBytes:Number(result.totalBytes||0)});},
    async verify({nativePath,sizeBytes,sha256}){const result=await plugin.verify({path:nativePath,expectedBytes:sizeBytes,sha256});
      return result?.valid===true;},
    async download({nativePath,url,sizeBytes,sha256,onProgress,signal}){
      if(signal?.aborted)throw abortError();
      const requestId=globalThis.crypto?.randomUUID?.()||`asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let listener=null;const abort=()=>{void plugin.cancel({requestId}).catch(()=>{});};
      try{
        signal?.addEventListener?.('abort',abort,{once:true});
        listener=await plugin.addListener('downloadProgress',value=>{
          if(value?.requestId===requestId&&value?.path===nativePath)safeProgress(onProgress,{path:nativePath,
            receivedBytes:Number(value.receivedBytes||0),totalBytes:Number(value.totalBytes||sizeBytes),done:value.done===true});
        });
        const result=await plugin.download({requestId,path:nativePath,url,expectedBytes:sizeBytes,sha256});
        if(signal?.aborted)throw abortError();
        return Object.freeze({nativePath,sizeBytes:Number(result.sizeBytes||sizeBytes),sha256,storage:'android-app-private'});
      }catch(error){if(signal?.aborted)throw abortError();throw error;}
      finally{signal?.removeEventListener?.('abort',abort);try{await listener?.remove?.();}catch(_){}}
    },
    async resolve({nativePath,sizeBytes,sha256}){const result=await plugin.verify({path:nativePath,expectedBytes:sizeBytes,sha256});
      if(result?.valid!==true||typeof result.fileUri!=='string')return null;
      return Object.freeze({url:Capacitor.convertFileSrc(result.fileUri),revoke:()=>{},sha256,storage:'android-app-private'});},
    async remove({nativePath}){const result=await plugin.remove({path:nativePath});return result?.removed===true;},
    async clear(){const result=await plugin.clear({scope:'downloaded-assets'});return result?.cleared===true;},
  });
}

export async function createAutoAssetPayloadStore({store,fetchImpl=fetch,env=import.meta.env}={}){
  if(rc7NativeAssetDeliveryEnabled(env)){
    const native=await createNativeAndroidAssetPayloadStore();
    if(native)return native;
  }
  return createBrowserAssetPayloadStore({store,fetchImpl});
}

export function assertAssetPayloadStore(store){
  if(!record(store)||store.version!=='asset-payload-store-v1'
    ||typeof store.getCapacity!=='function'||typeof store.verify!=='function'
    ||typeof store.download!=='function'||typeof store.resolve!=='function'||typeof store.remove!=='function'||typeof store.clear!=='function')
    throw new TypeError('Invalid asset payload store');
  return store;
}
