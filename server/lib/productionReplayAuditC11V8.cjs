'use strict';
/**
 * C11 candidate-only independent journal replay, NOT a production verifier.
 * The C6-E simulator is a QA approximation; matching it cannot prove native
 * gameplay parity or authorize C10 outcome issuance / C7 settlement.
 * No HTTP routes, no wallet/operations/progression writes, no C10 imports.
 */
const {isDeepStrictEqual}=require('node:util');
const {createHash}=require('node:crypto');
const {GameError}=require('./economy.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('./combatVerticalSliceV8.cjs');
const {validateChunk,openInputJournal}=require('./combatInputJournalV8.cjs');
const {resolveCampaignAlphaStage1C6E,ENCOUNTER_C6E_VERSION}
  =require('./combatCampaignAlphaC6CV8.cjs');

const AUDIT_VERSION='v8-c11-independent-candidate-audit-v1';
// 15 warm-up frames + ceil((4500-15)/30)=150 steady batches = 151
// chunks for a full-length 30Hz candidate. Allow bounded terminal retries
// while retaining the independent 4500-tick and 2 MiB trace budgets.
// A short-chunk flood still fails closed at this explicit 256-document cap.
const MAX_AUDIT_CHUNKS=256;
const MAX_AUDIT_TICKS=4500;
const MAX_TRACE_BYTES=2*1024*1024;
const HEX=/^[0-9a-f]{64}$/;
const deny=(code,text)=>{throw new GameError(code,text,409);};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length
  &&keys.every(k=>Object.hasOwn(x,k));
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,obj)=>createHash('sha256').update(JSON.stringify([tag,canonical(obj)])).digest('hex');
const traceKeys=['version','battleId','startTick','endTick','frames','receivedAtMs',
  'chunkDigest','nextTick','journalDigest','traceDigest','terminalPhase'];
const safeInt=(n,lo,hi)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;

/** Expects HMAC-verified origin already; still checks identity and model. */
async function replayCandidateC11({origin,active,uid,sessionId,battleId,readTrace}){
  if(typeof readTrace!=='function')throw new TypeError('readTrace callback required');
  if(!record(origin)||origin.uid!==uid||origin.sessionId!==sessionId
    ||origin.battleId!==battleId||origin.nonEconomic!==true
    ||origin.eligibleForSettlement!==false||origin.qaSourceModel!==true
    ||!record(origin.snapshot)||!record(origin.snapshot.context)
    ||origin.snapshot.context.uid!==uid||origin.snapshot.context.sessionId!==sessionId
    ||origin.snapshot.context.battleId!==battleId)
    deny('C11_ORIGIN_CONTEXT','Candidate origin context invalid');
  if(!record(active)||active.uid!==uid||active.sessionId!==sessionId
    ||active.battleId!==battleId||active.originMac!==origin.mac
    ||active.nonEconomic!==true||active.eligibleForSettlement!==false
    ||!safeInt(active.chunkCount,1,MAX_AUDIT_CHUNKS)
    ||!safeInt(active.run?.state?.tick,1,MAX_AUDIT_TICKS)
    ||!['lab-clear','lab-defeat'].includes(active.run?.state?.phase))
    deny('C11_NOT_TERMINAL','Candidate run not terminal or context differs');
  const freshJournal=openInputJournal({uid,sessionId,battleId,
    rulesVersion:origin.snapshot.context.rulesVersion,
    loadoutHash:origin.snapshot.loadoutHash,issuedAtMs:origin.issuedAtMs});
  if(!isDeepStrictEqual(origin.journal,freshJournal)
    ||origin.encounter?.version!==ENCOUNTER_C6E_VERSION
    ||!isDeepStrictEqual(resolveCampaignAlphaStage1C6E({snapshot:freeze(structuredClone(origin.snapshot))}),origin.encounter))
    deny('C11_ORIGIN_MODEL','Candidate simulator manifest invalid');
  let run=openCombatVerticalSlice({snapshot:freeze(structuredClone(origin.snapshot)),
    journal:freeze(structuredClone(origin.journal)),
    policy:freeze(structuredClone(origin.policy)),
    encounter:freeze(structuredClone(origin.encounter))});
  let bytes=0;
  for(let i=0;i<active.chunkCount;i++){
    const startTick=run.state.tick;
    if(run.state.phase!=='active'||startTick>=active.run.state.tick)
      deny('C11_TRACE_EXTRA','Trace continued past terminal simulation');
    const row=await readTrace(startTick);
    if(!exact(row,traceKeys)||row.version!==active.version
      ||row.battleId!==battleId||row.startTick!==startTick
      ||!safeInt(row.receivedAtMs,origin.issuedAtMs,origin.expiresAtMs)
      ||!HEX.test(row.chunkDigest||'')||!HEX.test(row.journalDigest||'')
      ||!HEX.test(row.traceDigest||'')||!Array.isArray(row.frames))
      deny('C11_TRACE_MISSING','Immutable server-accepted input missing or malformed');
    bytes+=Buffer.byteLength(JSON.stringify(row),'utf8');
    if(bytes>MAX_TRACE_BYTES)deny('C11_TRACE_BUDGET','Trace exceeds bounded audit budget');
    const chunk={protocol:'pve-input-v1',battleId,startTick,frames:row.frames};
    const checked=validateChunk(chunk);
    if(checked.chunkDigest!==row.chunkDigest||checked.endTick!==row.endTick)
      deny('C11_TRACE_TAMPER','Persisted input checksum mismatch');
    const step=replayCombatSliceChunk({run,chunk,receivedAtMs:row.receivedAtMs});
    if(step.duplicate||step.run.state.tick!==row.nextTick
      ||step.run.foundation.journal.digest!==row.journalDigest
      ||step.run.state.traceDigest!==row.traceDigest
      ||step.run.state.phase!==row.terminalPhase)
      deny('C11_TRACE_REPLAY','Replay diverged from recorded trace');
    run=step.run;
  }
  if(!isDeepStrictEqual(run,active.run)||run.state.phase==='active'
    ||run.foundation.journal.nextTick!==run.state.tick)
    deny('C11_REPLAY_MISMATCH','Independent replay differs from stored checkpoint');
  const safeClear=run.state.phase==='lab-clear'&&run.state.kills===70
    &&run.state.contacts===0&&run.state.escaped===0&&run.state.hp>0;
  // Strictly candidate names; do NOT emit C10 REPORT_KEYS or C10 SOURCE.
  return Object.freeze({phase:safeClear?'candidate-clear':run.state.phase==='lab-defeat'
    ?'candidate-defeat':'candidate-nonpayable-clear',
    verifiedTicks:run.state.tick,verifiedChunks:active.chunkCount,
    modelPhase:run.state.phase,kills:run.state.kills,escaped:run.state.escaped,
    contacts:run.state.contacts,finalHp:run.state.hp,
    snapshotHash:origin.snapshot.snapshotHash,
    inputDigest:run.foundation.journal.digest,
    stateDigest:run.state.stateDigest,traceDigest:run.state.traceDigest,
    originMac:origin.mac});
}
function makeCandidateAuditC11({uid,sessionId,battleId,replay,now}){
  if(!safeInt(now,1,Number.MAX_SAFE_INTEGER)||!record(replay))
    deny('C11_AUDIT_INVALID','Invalid candidate audit context');
  const fields={version:AUDIT_VERSION,uid,sessionId,battleId,
    ...replay,createdAtMs:now,candidateOnly:true,nonEconomic:true,
    eligibleForSettlement:false,safeForCloudBattle:false,
    qaSourceModel:true,productionReplayApproved:false};
  return Object.freeze({...fields,auditDigest:digest('sf-c11-candidate-audit',fields)});
}
function verifyCandidateAuditC11(recorded,ctx){
  if(!record(recorded)||!HEX.test(recorded.auditDigest||''))
    deny('C11_AUDIT_INVALID','Candidate audit missing or malformed');
  const expected=makeCandidateAuditC11(ctx);
  if(!isDeepStrictEqual(recorded,expected))
    deny('C11_AUDIT_TAMPER','Candidate audit differs from replay');
  return true;
}
module.exports=Object.freeze({AUDIT_VERSION,MAX_AUDIT_CHUNKS,MAX_AUDIT_TICKS,
  replayCandidateC11,makeCandidateAuditC11,verifyCandidateAuditC11});
