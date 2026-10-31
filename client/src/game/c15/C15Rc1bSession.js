/**
 * C15 local deterministic session orchestrator.
 *
 * Gameplay never waits for network. Input frames are persisted/uploaded and
 * independent server finalize returns a non-economic replay result plus an
 * optional RC2 trusted outcome foundation.
 */
import {createC15BrowserStore,cloneC15PersistentValue} from './C15Rc1bStore.js';
import {ensureC15StageResources,resolveC15ActiveResource} from './C15ResourceDelivery.js';
import {openC15LocalJournal,restoreC15LocalJournal,serializeC15LocalJournal} from '../combat/C15LocalJournal.js';
import {createC15JournalUploader} from './C15JournalUploader.js';
import {openC15KernelRuntime,replayC15KernelRuntime,advanceC15KernelRuntime,c15KernelRuntimeView} from './C15KernelRuntime.js';
import {C15_DEFAULT_CONTROL_PROFILE_ID,resolveC15ControlProfile,
  resolveC15ControlProfileForPolicy} from './C15ControlProfilesV1.js';

const VERSION='c15-rc1b-client-session-v1';
const activeKey=uid=>`active:${uid}`;
const journalKey=battleId=>`journal:${battleId}`;
const recoverableLifecycleCodes=new Set(['C15_RC1B_SESSION_INVALID','C15_RC1B_SESSION_MISSING',
  'C15_RC1B_EXPIRED','C15_RC1B_ABANDONED','C15_RC1B_SESSION_CLOSED','SESSION_EXPIRED']);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const freeze=x=>{if(x&&typeof x==='object'){for(const value of Object.values(x))freeze(value);Object.freeze(x);}return x;};
const appVersion=()=>String(import.meta.env?.VITE_APP_VERSION||'1.2.1');
const defaultControlProfile=()=>String(import.meta.env?.VITE_C15_CONTROL_PROFILE_ID||C15_DEFAULT_CONTROL_PROFILE_ID);
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
    throw new TypeError('C15 verified result invalid');
  return value;
}
function validateOutcome(value,battleId){
  if(value===null||value===undefined)return null;
  if(!record(value)||value.version!=='c15-rc2-trusted-outcome-v1'||value.battleId!==battleId
    ||!['rc2-trusted-clear','rc2-trusted-defeat'].includes(value.phase)||value.nonEconomic!==true
    ||value.safeForSettlement!==false||value.eligibleForSettlement!==false
    ||value.settlementEnabled!==false||value.cloudRewards!==false
    ||typeof value.outcomeDigest!=='string'||!/^[a-f0-9]{64}$/.test(value.outcomeDigest)
    ||typeof value.mac!=='string'||!/^[a-f0-9]{64}$/.test(value.mac))
    throw new TypeError('C15 RC2 trusted outcome invalid');
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
    throw new TypeError('C15 server envelope invalid');
  const control=resolveC15ControlProfileForPolicy(value.runtime.policy);
  if(value.controlProfile&&(value.controlProfile.id!==control.id
    ||value.controlProfile.profileDigest!==control.profileDigest))throw new TypeError('C15 control profile binding invalid');
  if(value.result!==null&&value.result!==undefined)validateResult(value.result,value.battleId);
  if(value.outcome!==null&&value.outcome!==undefined)validateOutcome(value.outcome,value.battleId);
  return {...value,controlProfile:control,outcome:value.outcome??null,rc2OutcomeEnabled:value.rc2OutcomeEnabled===true};
}
function persisted({uid,requestId,envelope,frames,journal,phase,result=null,outcome=null,
  resourcesReady=false,updatedAtMs=Date.now()}){
  return {version:VERSION,uid,requestId,battleId:envelope.battleId,envelope:cloneC15PersistentValue(envelope),
    frames:frames.map(frame=>({x:frame.x,z:frame.z})),journal:serializeC15LocalJournal(journal),phase,
    result:result?cloneC15PersistentValue(result):null,outcome:outcome?cloneC15PersistentValue(outcome):null,
    resourcesReady,updatedAtMs};
}

export async function openOrResumeC15Rc1bSession({uid,quality='mobile-low',controlProfileId=defaultControlProfile(),
  store=createC15BrowserStore(),online=()=>globalThis.navigator?.onLine!==false,onChange=()=>{},api=null,
  fetchImpl=globalThis.fetch,clock=Date.now,uuidFactory=()=>crypto.randomUUID()}={}){
  if(typeof uid!=='string'||uid.length<1||!['mobile-low','mobile-high'].includes(quality)
    ||!store||typeof onChange!=='function'||typeof online!=='function'||typeof fetchImpl!=='function'
    ||typeof clock!=='function'||typeof uuidFactory!=='function')throw new TypeError('C15 client session configuration invalid');
  resolveC15ControlProfile(controlProfileId);
  api=api||await loadDefaultApi();
  if(typeof api.openBattle!=='function'||typeof api.getStatus!=='function'||typeof api.uploadChunk!=='function'
    ||typeof api.finalize!=='function'||typeof api.abandon!=='function'||typeof api.fetchManifest!=='function')
    throw new TypeError('C15 client API invalid');
  const now=()=>{const value=clock();if(!Number.isSafeInteger(value)||value<1)throw new TypeError('C15 client clock invalid');return value;};
  const clearPersistedBattle=async battleId=>{await store.remove('meta',activeKey(uid));
    if(typeof battleId==='string'&&battleId.length)await store.remove('battles',journalKey(battleId));};
  let saved=await store.get('meta',activeKey(uid));
  let envelope,requestId,frames=[],journal,kernel,result=null,outcome=null,phase='opening',resourcesReady=false;
  const resetSavedState=async()=>{const oldBattleId=saved?.battleId||envelope?.battleId;
    await clearPersistedBattle(oldBattleId);saved=null;envelope=undefined;requestId=undefined;frames=[];journal=undefined;
    kernel=undefined;result=null;outcome=null;phase='opening';resourcesReady=false;};
  if(saved?.version===VERSION&&saved.uid===uid&&saved.envelope?.genesis?.expiresAtMs>now()){
    try{
      envelope=validateEnvelope(saved.envelope,uid);requestId=saved.requestId;frames=Array.isArray(saved.frames)?saved.frames:[];
      journal=restoreC15LocalJournal(saved.journal);kernel=replayC15KernelRuntime({genesis:envelope.genesis,
        runtime:envelope.runtime,frames});result=saved.result||envelope.result||null;outcome=saved.outcome||envelope.outcome||null;
      if(result)validateResult(result,envelope.battleId);if(outcome)validateOutcome(outcome,envelope.battleId);
      phase=result&&(!envelope.rc2OutcomeEnabled||outcome)?'verified':kernel.terminal?'provisional-terminal':'active';resourcesReady=saved.resourcesReady===true;
    }catch(_invalidLocal){await store.remove('meta',activeKey(uid));saved=null;}
  }else if(saved){await clearPersistedBattle(saved.battleId);saved=null;}
  if(saved&&envelope.controlProfile.id!==controlProfileId){
    if(result){await resetSavedState();}
    else{
      if(!online()){const error=new Error('C15 control profile change requires network');
        error.code='C15_RC1C_PROFILE_SWITCH_REQUIRES_ONLINE';throw error;}
      try{await api.abandon(uid,{battleId:envelope.battleId});}
      catch(error){if(!recoverableLifecycleCodes.has(error?.code))throw error;}
      await resetSavedState();
    }
  }
  if(saved&&online()){
    let remoteRaw=null;
    try{remoteRaw=await api.getStatus(uid);}catch(error){
      if(recoverableLifecycleCodes.has(error?.code))await resetSavedState();
      else if(error?.code!=='TIMEOUT'&&!(error instanceof TypeError))throw error;
    }
    if(saved&&remoteRaw!==null){const remote=validateEnvelope(remoteRaw,uid);
      if(remote.battleId!==saved.battleId)throw new TypeError('C15 remote/local battle mismatch');
      envelope=remote;result=remote.result||result;outcome=remote.outcome||outcome;
      phase=result&&(!remote.rc2OutcomeEnabled||outcome)?'verified':kernel.terminal?'provisional-terminal':'active';}
  }
  if(!saved){
    if(!online())throw new Error('C15 battle must be opened online');
    requestId=uuidFactory();envelope=validateEnvelope(await api.openBattle(uid,{stageId:'alpha-stage-1',requestId,
      appVersion:appVersion(),quality,controlProfileId}),uid);
    frames=[];kernel=openC15KernelRuntime({genesis:envelope.genesis,runtime:envelope.runtime});
    journal=openC15LocalJournal({battleId:envelope.battleId,rulesVersion:envelope.runtime.snapshot.context.rulesVersion,
      loadoutHash:envelope.genesis.loadoutHash,issuedAtMs:envelope.genesis.issuedAtMs});phase='active';
  }
  if(!resourcesReady){let manifest=envelope.resourceManifest;
    try{if(online()){const current=await api.fetchManifest();if(current.manifestDigest===manifest.manifestDigest)manifest=current;}}catch(_){}
    await ensureC15StageResources({manifest,stageKey:'alpha-stage-1',quality,store,fetchImpl});resourcesReady=true;}
  const subscribers=new Set([onChange]);let disposed=false,persistCounter=0,finalizePromise=null;let persistChain=Promise.resolve();
  const uploader=createC15JournalUploader({uid,battleId:envelope.battleId,journal,store,
    uploadChunk:api.uploadChunk,online,onUpdate:()=>publish()});
  await uploader.reconcile({uploadedThroughTick:envelope.uploadedThroughTick,chunkCount:envelope.chunkCount});
  journal=uploader.getJournal();
  const view=()=>freeze({version:VERSION,uid,battleId:envelope.battleId,phase,kernel:c15KernelRuntimeView(kernel),
    controlProfile:envelope.controlProfile,result,outcome,resourcesReady,transport:uploader.getView(),
    rc2OutcomeEnabled:envelope.rc2OutcomeEnabled===true,nonEconomic:true,safeForSettlement:false,cloudRewards:false});
  function publish(){if(disposed)return;const value=view();for(const subscriber of subscribers){try{subscriber(value);}catch(_){}}}
  function persistNow(){const run=async()=>{if(disposed)return false;journal=uploader.getJournal();await uploader.persistNow();
      if(disposed)return false;const snapshot=persisted({uid,requestId,envelope,frames,journal,phase,result,outcome,
        resourcesReady,updatedAtMs:now()});if(disposed)return false;await store.put('meta',activeKey(uid),snapshot);return true;};
    persistChain=persistChain.then(run,run);return persistChain;}
  function advance(input){if(disposed||phase!=='active')throw new TypeError('C15 local session is not active');
    const advanced=advanceC15KernelRuntime(kernel,input);kernel=advanced.state;frames.push(freeze({x:input.x,z:input.z}));
    journal=uploader.append(input);persistCounter++;if(persistCounter>=15){persistCounter=0;void persistNow();}
    if(kernel.terminal){phase='provisional-terminal';void persistNow();void finalizeWhenOnline();}
    publish();return freeze({view:view(),events:advanced.events});}
  async function finalizeWhenOnline(){if(finalizePromise)return finalizePromise;
    finalizePromise=(async()=>{if(!kernel.terminal||!online())return null;phase='verifying';publish();
      try{await uploader.flush({throwOnError:true});await uploader.close();journal=uploader.getJournal();
        const reply=await api.finalize(uid,{battleId:envelope.battleId});
        if(!record(reply)||reply.nonEconomic!==true||reply.settlementEnabled!==false||!record(reply.result))
          throw new TypeError('C15 finalize response invalid');
        result=freeze(cloneC15PersistentValue(validateResult(reply.result,envelope.battleId)));
        outcome=reply.outcome?freeze(cloneC15PersistentValue(validateOutcome(reply.outcome,envelope.battleId))):null;
        if(envelope.rc2OutcomeEnabled===true&&!outcome)throw new TypeError('C15 RC2 signed outcome missing');
        phase='verified';await persistNow();publish();return result;
      }catch(error){phase='provisional-terminal';await persistNow();publish();throw error;}finally{finalizePromise=null;}})();return finalizePromise;}
  async function retryNetwork(){if(disposed)return null;await uploader.pump();if(kernel.terminal)return finalizeWhenOnline();return null;}
  async function suspend(){if(disposed)return view();await persistNow();return view();}
  async function clearLocalSession(){if(disposed)return;disposed=true;uploader.dispose();
    try{await persistChain.catch(()=>{});}finally{await clearPersistedBattle(envelope.battleId);subscribers.clear();}}
  async function completeVerified(){if(disposed)return result;
    if(phase!=='verified'||!result||(envelope.rc2OutcomeEnabled===true&&!outcome)){const error=new Error('C15 verified result and trusted outcome required before continuing');
      error.code='C15_RC1B_RESULT_NOT_VERIFIED';throw error;}const completed=result;await clearLocalSession();return completed;}
  async function abandon(){if(disposed)return;if(phase==='verified'){await clearLocalSession();return;}
    try{if(online())await api.abandon(uid,{battleId:envelope.battleId});}finally{await clearLocalSession();}}
  function subscribe(fn){if(typeof fn!=='function')throw new TypeError('C15 subscriber invalid');subscribers.add(fn);fn(view());return()=>subscribers.delete(fn);}
  async function resolveResource(packId,path){return resolveC15ActiveResource({store,stageKey:'alpha-stage-1',packId,path});}
  await persistNow();publish();
  return Object.freeze({advance,finalizeWhenOnline,retryNetwork,suspend,completeVerified,abandon,subscribe,resolveResource,
    getView:view,getKernel:()=>kernel,getEnvelope:()=>envelope,getControlProfile:()=>envelope.controlProfile,
    dispose:()=>{disposed=true;uploader.dispose();subscribers.clear();}});
}
