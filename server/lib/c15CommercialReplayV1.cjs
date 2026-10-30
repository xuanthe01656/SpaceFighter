'use strict';
/**
 * C15-RC1 independent full-journal replay foundation.
 * No HTTP wiring, no profile writes, no reward, no settlement authority.
 */
const {createHash}=require('node:crypto');
const {openInputJournal,validateChunk,TICK_HZ}=require('./combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('./combatVerticalSliceV8.cjs');
const {verifyC15CommercialOriginV1}=require('./c15CommercialGenesisV1.cjs');
const VERSION='c15-commercial-replay-result-v1';
const MAX_TICKS=4500,MAX_CHUNKS=256;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const safeInt=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,value)=>createHash('sha256').update(JSON.stringify([tag,canonical(value)])).digest('hex');
function replayC15CommercialFoundationV1({origin,chunks,nowMs,keyRing}){
  verifyC15CommercialOriginV1(origin,keyRing);
  const g=origin.genesis;
  if(!Array.isArray(chunks)||chunks.length<1||chunks.length>MAX_CHUNKS
    ||!safeInt(nowMs,1,Number.MAX_SAFE_INTEGER)||nowMs>g.expiresAtMs)throw new TypeError('Invalid C15 replay request');
  let totalTicks=0,expectedStart=0;
  const normalized=[];
  for(const raw of chunks){
    if(!record(raw)||Object.keys(raw).some(key=>!['protocol','battleId','startTick','frames'].includes(key)))throw new TypeError('C15 replay chunk contains untrusted fields');
    const chunk=validateChunk(raw);
    if(chunk.battleId!==g.battleId||chunk.startTick!==expectedStart)throw new TypeError('C15 replay sequence mismatch');
    expectedStart=chunk.endTick;totalTicks=chunk.endTick;
    if(totalTicks>MAX_TICKS)throw new TypeError('C15 replay tick limit');
    normalized.push(freeze({protocol:raw.protocol,battleId:raw.battleId,startTick:raw.startTick,
      frames:raw.frames.map(frame=>freeze({x:frame.x,z:frame.z}))}));
  }
  const minimumElapsedMs=Math.ceil(totalTicks*1000/TICK_HZ);
  if(nowMs+2000<g.issuedAtMs+minimumElapsedMs)throw new TypeError('C15 replay submitted before deterministic duration elapsed');
  const snapshot=origin.snapshot;
  const journal=openInputJournal({uid:g.uid,sessionId:g.sessionId,battleId:g.battleId,
    rulesVersion:snapshot.context.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs:g.issuedAtMs});
  let run=openCombatVerticalSlice({snapshot,journal,policy:origin.policy,encounter:origin.encounter});
  for(const chunk of normalized){
    if(run.state.phase!=='active')throw new TypeError('C15 replay has chunks after terminal');
    const endTick=chunk.startTick+chunk.frames.length;
    const receivedAtMs=g.issuedAtMs+Math.ceil(endTick*1000/TICK_HZ)+10;
    run=replayCombatSliceChunk({run,chunk,receivedAtMs}).run;
  }
  if(run.state.phase==='active')throw new TypeError('C15 replay is not terminal');
  const phase=run.state.phase==='lab-clear'?'rc1-verified-clear'
    :run.state.phase==='lab-defeat'?'rc1-verified-defeat':null;
  if(!phase)throw new TypeError('C15 replay terminal phase unsupported');
  const fields={version:VERSION,purpose:'commercial-local-replay-rc1',uid:g.uid,sessionId:g.sessionId,
    battleId:g.battleId,phase,ticks:run.state.tick,chunks:normalized.length,hp:run.state.hp,
    maxHp:run.state.maxHp,waves:run.state.spawnedWaves,kills:run.state.kills,
    contacts:run.state.contacts,escaped:run.state.escaped??0,stateDigest:run.state.stateDigest,
    traceDigest:run.state.traceDigest,snapshotHash:g.snapshotHash,loadoutHash:g.loadoutHash,
    descriptorDigest:g.descriptorDigest,encounterDigest:g.stage.encounterDigest,
    verifiedAtMs:nowMs,rc1Only:true,nonEconomic:true,safeForSettlement:false,
    eligibleForSettlement:false};
  return freeze({...fields,replayDigest:digest('sf-c15-commercial-replay-result',fields)});
}
function verifyC15CommercialReplayResultV1(result,expected={}){
  if(!record(result)||result.version!==VERSION||result.rc1Only!==true||result.nonEconomic!==true
    ||result.safeForSettlement!==false||result.eligibleForSettlement!==false
    ||!['rc1-verified-clear','rc1-verified-defeat'].includes(result.phase)
    ||!safeInt(result.ticks,1,MAX_TICKS)||!safeInt(result.chunks,1,MAX_CHUNKS)
    ||typeof result.replayDigest!=='string')throw new TypeError('Invalid C15 replay result');
  const {replayDigest,...fields}=result;
  if(digest('sf-c15-commercial-replay-result',fields)!==replayDigest)throw new TypeError('C15 replay result digest mismatch');
  for(const [key,value] of Object.entries(expected))if(result[key]!==value)throw new TypeError(`C15 replay result context mismatch: ${key}`);
  return true;
}
module.exports=freeze({VERSION,MAX_TICKS,MAX_CHUNKS,replayC15CommercialFoundationV1,
  verifyC15CommercialReplayResultV1});
