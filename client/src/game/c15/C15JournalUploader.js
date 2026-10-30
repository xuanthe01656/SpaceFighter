/**
 * RC1B background append-only journal transport. Local gameplay never awaits
 * this uploader. Exactly one immutable chunk may be in flight; retries reuse
 * the same bytes and server idempotency. No outcome fields are accepted here.
 */
import {
  appendC15LocalFrame,takeC15UploadChunk,acknowledgeC15UploadChunk,
  closeC15LocalJournal,serializeC15LocalJournal,peekC15InflightChunk,
  reconcileC15UploadProgress,c15JournalSummary,
} from '../combat/C15LocalJournal.js';

const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const freeze=x=>{if(x&&typeof x==='object'){for(const value of Object.values(x))freeze(value);Object.freeze(x);}return x;};
const key=battleId=>`journal:${battleId}`;

export function createC15JournalUploader({uid,battleId,journal,store,uploadChunk,
  online=()=>globalThis.navigator?.onLine!==false,clock=Date.now,onUpdate=()=>{}}={}){
  if(typeof uid!=='string'||uid.length<1||typeof battleId!=='string'||battleId.length<1
    ||!journal||!store||typeof store.put!=='function'||typeof uploadChunk!=='function'
    ||typeof online!=='function'||typeof clock!=='function'||typeof onUpdate!=='function')
    throw new TypeError('C15 journal uploader configuration invalid');
  let current=journal,disposed=false,pumpPromise=null,lastError=null,waitCount=0,totalWaitMs=0,maxWaitMs=0;
  let persistPromise=Promise.resolve(),dirtyFrames=0;
  const persist=()=>{const snapshot=serializeC15LocalJournal(current);dirtyFrames=0;
    persistPromise=persistPromise.then(()=>store.put('battles',key(battleId),snapshot));return persistPromise;};
  const view=()=>freeze({version:'c15-journal-uploader-view-v1',battleId,
    summary:c15JournalSummary(current),online:online(),waiting:Boolean(pumpPromise),
    waitCount,totalWaitMs,maxWaitMs,lastError:lastError?String(lastError.code||lastError.message||'UPLOAD_FAILED'):null});
  const publish=()=>{try{onUpdate(view());}catch(_){/* diagnostics must not break gameplay */}};
  function append(input){
    if(disposed)throw new TypeError('C15 journal uploader disposed');
    current=appendC15LocalFrame(current,input);dirtyFrames++;
    // Persist in bounded 15-frame groups instead of writing IndexedDB every
    // 30Hz tick. A chunk is always persisted before network upload.
    if(dirtyFrames>=15)void persist();publish();
    // Do not await transport. A full first/steady chunk schedules a background pump.
    const pending=serializeC15LocalJournal(current).pending.length;
    if(pending>=(current.chunkCount===0?15:30))queueMicrotask(()=>{void pump().catch(()=>{});});
    return current;
  }
  async function sendOne({flush=false,throwOnError=false}={}){
    if(disposed||!online())return false;
    let chunk=peekC15InflightChunk(current);
    if(!chunk){const taken=takeC15UploadChunk(current,{flush});current=taken.state;chunk=taken.chunk;
      if(!chunk)return false;await persist();}
    const started=clock();
    try{
      const reply=await uploadChunk(uid,{battleId,chunk});
      if(!record(reply)||reply.battleId!==battleId||reply.startTick!==chunk.startTick
        ||reply.endTick!==chunk.startTick+chunk.frames.length)
        throw new TypeError('C15 upload acknowledgement malformed');
      current=acknowledgeC15UploadChunk(current,{startTick:reply.startTick,endTick:reply.endTick});
      lastError=null;const elapsed=Math.max(0,clock()-started);totalWaitMs+=elapsed;maxWaitMs=Math.max(maxWaitMs,elapsed);
      await persist();publish();return true;
    }catch(error){lastError=error;waitCount++;const elapsed=Math.max(0,clock()-started);totalWaitMs+=elapsed;maxWaitMs=Math.max(maxWaitMs,elapsed);
      await persist();publish();if(throwOnError)throw error;return false;}
  }
  async function runPump({flush=false,throwOnError=false}={}){
    let sent=false;
    while(!disposed&&online()){
      const ok=await sendOne({flush,throwOnError});
      if(!ok)break;sent=true;
    }
    return sent;
  }
  function pump(options={}){
    if(disposed)return Promise.resolve(false);
    if(pumpPromise)return pumpPromise;
    pumpPromise=runPump(options).finally(()=>{pumpPromise=null;publish();});
    publish();return pumpPromise;
  }
  async function flush({throwOnError=true}={}){
    await persistPromise;
    while(online()){
      await pump({flush:true,throwOnError});
      const raw=serializeC15LocalJournal(current);
      if(raw.pending.length===0&&raw.inflight===null)break;
      if(lastError)break;
    }
    const raw=serializeC15LocalJournal(current);
    if((raw.pending.length||raw.inflight)&&throwOnError)throw lastError||new Error('C15 journal upload incomplete');
    return c15JournalSummary(current);
  }
  async function close(){await flush({throwOnError:true});current=closeC15LocalJournal(current);await persist();publish();return current;}
  async function reconcile(progress){current=reconcileC15UploadProgress(current,progress);await persist();publish();return current;}
  async function persistNow(){await persist();return true;}
  function dispose(){disposed=true;publish();}
  void persist();publish();
  return Object.freeze({append,pump,flush,close,reconcile,persistNow,dispose,
    getJournal:()=>current,getView:view});
}

export async function loadC15PersistedJournal({store,battleId,restore}){
  if(!store||typeof store.get!=='function'||typeof restore!=='function')throw new TypeError('C15 journal restore input invalid');
  const raw=await store.get('battles',key(battleId));return raw?restore(raw):null;
}
