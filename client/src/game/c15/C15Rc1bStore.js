/** Persistent browser store for RC1B journals and immutable resource packs. */
const DB_NAME='spacefighter-c15-rc1b-v1';
const DB_VERSION=1;
const STORES=['meta','partials','files','battles','chunks'];
const memory=()=>{
  const maps=Object.fromEntries(STORES.map(name=>[name,new Map()]));
  return Object.freeze({
    async get(store,key){return structuredClone(maps[store]?.get(key)??null);},
    async put(store,key,value){maps[store].set(key,structuredClone(value));return true;},
    async remove(store,key){maps[store].delete(key);return true;},
    async list(store,prefix=''){return [...maps[store].entries()].filter(([key])=>String(key).startsWith(prefix))
      .map(([key,value])=>({key,value:structuredClone(value)}));},
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
    async put(store,key,value){const db=await ready;return txRequest(db,store,'readwrite',os=>os.put(value,key));},
    async remove(store,key){const db=await ready;return txRequest(db,store,'readwrite',os=>os.delete(key));},
    async list(store,prefix=''){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),os=tx.objectStore(store),out=[];const req=os.openCursor();req.onsuccess=()=>{const cur=req.result;if(!cur)return;const key=String(cur.key);if(key.startsWith(prefix))out.push({key,value:cur.value});cur.continue();};req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);});},
  });
}
export const C15_RC1B_STORE_NAMES=Object.freeze([...STORES]);
