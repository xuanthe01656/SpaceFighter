/** Persistent browser store for RC1B journals and immutable resource packs. */
const DB_NAME='spacefighter-c15-rc1b-v1';
const DB_VERSION=1;
const STORES=['meta','partials','files','battles','chunks'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

function storageError(error,store,key){
  const cloneFailure=error?.name==='DataCloneError'||error?.code===25;
  const wrapped=new Error(cloneFailure
    ?`C15 local cache could not clone ${store}:${String(key)}`
    :`C15 local cache write failed for ${store}:${String(key)}`);
  wrapped.name=cloneFailure?'C15DataCloneError':'C15StorageError';
  wrapped.code=cloneFailure?'C15_IDB_DATA_CLONE':'C15_IDB_WRITE_FAILED';
  wrapped.cause=error;
  return wrapped;
}

/**
 * Create a detached-buffer-safe, plain structured-clone payload.
 *
 * Network envelopes and journals are JSON-like. Resource payloads are copied
 * into fresh fixed-length ArrayBuffers before IndexedDB sees them. This avoids
 * Android WebView DataCloneError (legacy DOM code 25) when a BufferSource is
 * backed by a transient/detached implementation buffer.
 */
export function cloneC15PersistentValue(value,path='root'){
  if(value===null||value===undefined||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw Object.assign(new TypeError(`C15 persisted number invalid at ${path}`),{code:'C15_STORE_UNCLONEABLE'});
    return value;
  }
  if(typeof value==='bigint')return value;
  if(value instanceof ArrayBuffer){
    try{return value.slice(0);}catch(error){throw storageError(error,'buffer',path);}
  }
  if(ArrayBuffer.isView(value)){
    let buffer;
    try{buffer=value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);}
    catch(error){throw storageError(error,'buffer-view',path);}
    if(value instanceof DataView)return new DataView(buffer);
    return new value.constructor(buffer);
  }
  if(typeof Blob!=='undefined'&&value instanceof Blob)return value.slice(0,value.size,value.type);
  if(value instanceof Date)return new Date(value.getTime());
  if(Array.isArray(value))return value.map((item,index)=>cloneC15PersistentValue(item,`${path}[${index}]`));
  if(record(value)){
    const out={};
    for(const [key,item] of Object.entries(value))out[key]=cloneC15PersistentValue(item,`${path}.${key}`);
    return out;
  }
  throw Object.assign(new TypeError(`C15 persisted value unsupported at ${path}`),{code:'C15_STORE_UNCLONEABLE'});
}

export function c15StandaloneArrayBuffer(bytes){
  if(bytes instanceof ArrayBuffer)return bytes.slice(0);
  if(ArrayBuffer.isView(bytes))return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  throw Object.assign(new TypeError('C15 binary payload invalid'),{code:'C15_STORE_UNCLONEABLE'});
}

const memory=()=>{
  const maps=Object.fromEntries(STORES.map(name=>[name,new Map()]));
  return Object.freeze({
    async get(store,key){return cloneC15PersistentValue(maps[store]?.get(key)??null);},
    async put(store,key,value){maps[store].set(key,cloneC15PersistentValue(value));return true;},
    async remove(store,key){maps[store].delete(key);return true;},
    async list(store,prefix=''){return [...maps[store].entries()].filter(([key])=>String(key).startsWith(prefix))
      .map(([key,value])=>({key,value:cloneC15PersistentValue(value)}));},
  });
};
function openDb(indexedDBImpl){
  return new Promise((resolve,reject)=>{
    const request=indexedDBImpl.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{const db=request.result;for(const name of STORES)if(!db.objectStoreNames.contains(name))db.createObjectStore(name);};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('C15 IndexedDB open failed'));
  });
}
function txRequest(db,store,mode,work){
  return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),os=tx.objectStore(store);let answer;
    try{answer=work(os);}catch(error){reject(error);return;}
    tx.oncomplete=()=>resolve(answer?.result??answer??true);tx.onerror=()=>reject(tx.error||new Error('C15 IndexedDB transaction failed'));tx.onabort=()=>reject(tx.error||new Error('C15 IndexedDB transaction aborted'));});
}
export function createC15MemoryStore(){return memory();}
export function createC15BrowserStore({indexedDBImpl=globalThis.indexedDB}={}){
  if(!indexedDBImpl)return memory();
  const ready=openDb(indexedDBImpl);
  return Object.freeze({
    async get(store,key){const db=await ready;return txRequest(db,store,'readonly',os=>os.get(key));},
    async put(store,key,value){
      const db=await ready;let safe;
      try{safe=cloneC15PersistentValue(value);}
      catch(error){throw error?.code?error:storageError(error,store,key);}
      try{return await txRequest(db,store,'readwrite',os=>os.put(safe,key));}
      catch(error){throw storageError(error,store,key);}
    },
    async remove(store,key){const db=await ready;return txRequest(db,store,'readwrite',os=>os.delete(key));},
    async list(store,prefix=''){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),os=tx.objectStore(store),out=[];const req=os.openCursor();req.onsuccess=()=>{const cur=req.result;if(!cur)return;const key=String(cur.key);if(key.startsWith(prefix))out.push({key,value:cur.value});cur.continue();};req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);});},
  });
}
export const C15_RC1B_STORE_NAMES=Object.freeze([...STORES]);
