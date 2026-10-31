/**
 * C15-RC1B local deterministic session orchestrator.
 *
 * The device runs/render the reviewed deterministic kernel without waiting for
 * network. Only input frames are persisted/uploaded. Victory/defeat shown by
 * the device remains provisional until independent server finalize succeeds.
 */
import {createC15BrowserStore,cloneC15PersistentValue} from './C15Rc1bStore.js';
import {ensureC15StageResources,resolveC15ActiveResource} from './C15ResourceDelivery.js';
import {openC15LocalJournal,restoreC15LocalJournal,serializeC15LocalJournal} from '../combat/C15LocalJournal.js';
import {createC15JournalUploader} from './C15JournalUploader.js';
import {openC15KernelRuntime,replayC15KernelRuntime,advanceC15KernelRuntime,c15KernelRuntimeView} from './C15KernelRuntime.js';

const VERSION='c15-rc1b-client-session-v1';
const activeKey=uid=>`active:${uid}`;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const freeze=x=>{if(x&&typeof x==='object'){for(const value of Object.values(x))freeze(value);Object.freeze(x);}return x;};
const appVersion=()=>String(import.meta.env?.VITE_APP_VERSION||'1.2.1');
let defaultApiPromise=null;
async function loadDefaultApi(){
  if(!defaultApiPromise)defaultApiPromise=import('../../services/gameApi.js').then(mod=>Object.freeze({
    openBattle:mod.openC15Rc1bBattle,getStatus:mod.getC15Rc1bStatus,uploadChunk:mod.uploadC15Rc1bChunk,
    finalize:mod.finalizeC15Rc1bBattle,abandon:mod.abandonC15Rc1bBattle,fetchManifest:mod.fetchC15ResourceManifest,
  }));
  return defaultApiPromise;
}

function validateResult(value,battleId){
  if(!record(value)||value.version!=='c15-commercial-replay-result-v1'||value.battleId!==battleId
    ||!['rc1-verified-clear','rc1-verified-defeat'].includes(value.phase)||value.rc1Only!==true
    ||value.nonEconomic!==true||value.safeForSettlement!==false||value.eligibleForSettlement!==false)
    throw new TypeError('C15 RC1B verified result invalid');
  return value;
}
function validateEnvelope(value,uid){
  if(!record(value)||value.version!=='c15-rc1b-runtime-v1'||value.rc1bOnly!==true
    ||value.nonEconomic!==true||value.safeForSettlement!==false||value.settlementEnabled!==false
    ||value.cloudRewards!==false||value.genesis?.uid!==uid||value.genesis?.battleId!==value.battleId
    ||!record(value.runtime)||!record(value.resourceManifest)||typeof value.battleId!=='string'
    ||!['active','finalized','abandoned'].includes(value.phase)||!Number.isSafeInteger(value.uploadedThroughTick)
    ||value.uploadedThroughTick<0||value.uploadedThroughTick>4500||!Number.isSafeInteger(value.chunkCount)
    ||value.chunkCount<0||value.chunkCount>256)
    throw new TypeError('C15 RC1B server envelope invalid');
  if(value.result!==null&&value.result!==undefined)validateResult(value.result,value.battleId);
  return value;
}
function persisted({uid,requestId,envelope,frames,journal,phase,result=null,resourcesReady=false,updatedAtMs=Date.now()}){
  return {version:VERSION,uid,requestId,battleId:envelope.battleId,envelope:cloneC15PersistentValue(envelope),
    frames:frames.map(frame=>({x:frame.x,z:frame.z})),journal:serializeC15LocalJournal(journal),phase,result,
    resourcesReady,updatedAtMs};
}

export async function openOrResumeC15Rc1bSession({uid,quality='mobile-low',store=createC15BrowserStore(),
  online=()=>globalThis.navigator?.onLine!==false,onChange=()=>{},api=null,fetchImpl=globalThis.fetch,
  clock=Date.now,uuidFactory=()=>crypto.randomUUID()}={}){
  if(typeof uid!=='string'||uid.length<1||!['mobile-low','mobile-high'].includes(quality)
    ||!store||typeof onChange!=='function'||typeof online!=='function'||typeof fetchImpl!=='function'
    ||typeof clock!=='function'||typeof uuidFactory!=='function')
    throw new TypeError('C15 RC1B client session configuration invalid');
  api=api||await loadDefaultApi();
  if(typeof api.openBattle!=='function'||typeof api.getStatus!=='function'||typeof api.uploadChunk!=='function'
    ||typeof api.finalize!=='function'||typeof api.abandon!=='function'||typeof api.fetchManifest!=='function')
    throw new TypeError('C15 RC1B client API invalid');
  const now=()=>{const value=clock();if(!Number.isSafeInteger(value)||value<1)throw new TypeError('C15 client clock invalid');return value;};
  let saved=await store.get('meta',activeKey(uid));
  let envelope,requestId,frames=[],journal,kernel,result=null,phase='opening',resourcesReady=false;
  if(saved?.version===VERSION&&saved.uid===uid&&saved.envelope?.genesis?.expiresAtMs>now()){
    try{
      envelope=validateEnvelope(saved.envelope,uid);requestId=saved.requestId;
      frames=Array.isArray(saved.frames)?saved.frames:[];
      journal=restoreC15LocalJournal(saved.journal);kernel=replayC15KernelRuntime({genesis:envelope.genesis,
        runtime:envelope.runtime,frames});result=saved.result||envelope.result||null;
      phase=result?'verified':kernel.terminal?'provisional-terminal':'active';resourcesReady=saved.resourcesReady===true;
    }catch(_invalidLocal){await store.remove('meta',activeKey(uid));saved=null;}
  }else if(saved){await store.remove('meta',activeKey(uid));saved=null;}
  if(saved&&online()){
    let remoteRaw=null;
    try{remoteRaw=await api.getStatus(uid);}
    catch(error){
      // A timeout/offline fetch may resume from the signed, unexpired local
      // envelope. Authentication/session/server rejections must remain fatal.
      if(error?.code!=='TIMEOUT'&&!(error instanceof TypeError))throw error;
    }
    if(remoteRaw!==null){
      const remote=validateEnvelope(remoteRaw,uid);
      if(remote.battleId!==saved.battleId)throw new TypeError('C15 remote/local battle mismatch');
      envelope=remote;result=remote.result||result;phase=result?'verified':kernel.terminal?'provisional-terminal':'active';
    }
  }
  if(!saved){
    if(!online())throw new Error('C15 battle must be opened online');
    requestId=uuidFactory();
    envelope=validateEnvelope(await api.openBattle(uid,{stageId:'alpha-stage-1',requestId,
      appVersion:appVersion(),quality}),uid);
    frames=[];kernel=openC15KernelRuntime({genesis:envelope.genesis,runtime:envelope.runtime});
    journal=openC15LocalJournal({battleId:envelope.battleId,rulesVersion:envelope.runtime.snapshot.context.rulesVersion,
      loadoutHash:envelope.genesis.loadoutHash,issuedAtMs:envelope.genesis.issuedAtMs});phase='active';
  }
  // Prefer the manifest cryptographically bound into the signed origin. Fetch
  // current manifest only to detect operator rollout; it may not replace the
  // battle-bound digest after the battle is open.
  if(!resourcesReady){
    let manifest=envelope.resourceManifest;
    try{if(online()){const current=await api.fetchManifest();if(current.manifestDigest===manifest.manifestDigest)manifest=current;}}catch(_){/* bound manifest remains usable */}
    await ensureC15StageResources({manifest,stageKey:'alpha-stage-1',quality,store,fetchImpl});resourcesReady=true;
  }
  const subscribers=new Set([onChange]);let disposed=false,persistCounter=0,finalizePromise=null;
  const uploader=createC15JournalUploader({uid,battleId:envelope.battleId,journal,store,
    uploadChunk:api.uploadChunk,online,onUpdate:()=>publish()});
  await uploader.reconcile({uploadedThroughTick:envelope.uploadedThroughTick,chunkCount:envelope.chunkCount});
  journal=uploader.getJournal();
  const view=()=>freeze({version:VERSION,uid,battleId:envelope.battleId,phase,kernel:c15KernelRuntimeView(kernel),
    result,resourcesReady,transport:uploader.getView(),nonEconomic:true,safeForSettlement:false,cloudRewards:false});
  function publish(){if(disposed)return;const value=view();for(const subscriber of subscribers){try{subscriber(value);}catch(_){}}}
  async function persistNow(){journal=uploader.getJournal();await uploader.persistNow();await store.put('meta',activeKey(uid),
    persisted({uid,requestId,envelope,frames,journal,phase,result,resourcesReady,updatedAtMs:now()}));}
  function advance(input){
    if(disposed||phase!=='active')throw new TypeError('C15 local session is not active');
    const advanced=advanceC15KernelRuntime(kernel,input);kernel=advanced.state;frames.push(freeze({x:input.x,z:input.z}));
    journal=uploader.append(input);persistCounter++;
    if(persistCounter>=15){persistCounter=0;void persistNow();}
    if(kernel.terminal){phase='provisional-terminal';void persistNow();void finalizeWhenOnline();}
    publish();return freeze({view:view(),events:advanced.events});
  }
  async function finalizeWhenOnline(){
    if(finalizePromise)return finalizePromise;
    finalizePromise=(async()=>{
      if(!kernel.terminal||!online())return null;
      phase='verifying';publish();
      try{
        await uploader.flush({throwOnError:true});await uploader.close();journal=uploader.getJournal();
        const reply=await api.finalize(uid,{battleId:envelope.battleId});
        if(!record(reply)||reply.nonEconomic!==true||reply.settlementEnabled!==false||!record(reply.result))
          throw new TypeError('C15 finalize response invalid');
        result=freeze(cloneC15PersistentValue(validateResult(reply.result,envelope.battleId)));phase='verified';await persistNow();publish();return result;
      }catch(error){phase='provisional-terminal';await persistNow();publish();throw error;}
      finally{finalizePromise=null;}
    })();return finalizePromise;
  }
  async function retryNetwork(){if(disposed)return null;await uploader.pump();if(kernel.terminal)return finalizeWhenOnline();return null;}
  async function suspend(){await persistNow();return view();}
  async function abandon(){
    if(disposed)return;try{if(online())await api.abandon(uid,{battleId:envelope.battleId});}finally{
      disposed=true;uploader.dispose();await store.remove('meta',activeKey(uid));subscribers.clear();}
  }
  function subscribe(fn){if(typeof fn!=='function')throw new TypeError('C15 subscriber invalid');subscribers.add(fn);fn(view());return()=>subscribers.delete(fn);}
  async function resolveResource(packId,path){return resolveC15ActiveResource({store,stageKey:'alpha-stage-1',packId,path});}
  await persistNow();publish();
  return Object.freeze({advance,finalizeWhenOnline,retryNetwork,suspend,abandon,subscribe,resolveResource,
    getView:view,getKernel:()=>kernel,getEnvelope:()=>envelope,dispose:()=>{disposed=true;uploader.dispose();subscribers.clear();}});
}
