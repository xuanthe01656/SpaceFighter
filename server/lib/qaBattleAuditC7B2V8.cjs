'use strict';
/**
 * C7-B2: independent genesis-to-terminal replay for a CLOSED, QA-only ticket.
 * The origin is written by the authenticated server at ticket creation and
 * every accepted chunk is read from the server-owned trace namespace.
 *
 * This is a consistency/audit proof, NOT a reward authority or anti-cheat
 * signature. In particular, client-write Firestore rules, Android/iOS touch
 * parity and real production encounters require separate verification.
 */
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {GameError}=require('./economy.cjs');
const {openInputJournal,validateChunk}=require('./combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('./combatVerticalSliceV8.cjs');
const {resolveCampaignAlphaStage1C6E,ENCOUNTER_C6E_VERSION}=require('./combatCampaignAlphaC6CV8.cjs');

const QA_GENESIS_VERSION='v8-c7b2-server-genesis-v1';
const QA_AUDIT_VERSION='v8-c7b2-genesis-replay-audit-v1';
const QA_AUDIT_MAX_CHUNKS=128;
const QA_AUDIT_MAX_TICKS=4500;
const QA_AUDIT_MAX_BYTES=2*1024*1024;
const HEX64=/^[a-f0-9]{64}$/;
const deny=(code,message)=>{throw new GameError(code,message,409);};
const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)
  &&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const canonical=v=>Array.isArray(v)?v.map(canonical):record(v)
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=(tag,v)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(v)])).digest('hex');
const same=(a,b)=>isDeepStrictEqual(a,b);
const bounded=(v,lower,upper)=>Number.isSafeInteger(v)&&v>=lower&&v<=upper;
const sized=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const freeze=o=>{if(o&&typeof o==='object'){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};
const exact=(o,keys)=>record(o)&&Object.keys(o).length===keys.length
  &&keys.every(k=>Object.hasOwn(o,k));

function createQaGenesis({uid,sessionId,battleId,issuedAtMs,expiresAtMs,snapshot,
  policy,encounter,journal}) {
  const fields={version:QA_GENESIS_VERSION,uid,sessionId,battleId,
    issuedAtMs,expiresAtMs,qaOnly:true,nonEconomic:true,
    safeForCloudBattle:false,settlementEnabled:false,
    snapshot,policy,encounter,journal};
  return structuredClone({...fields,genesisDigest:hash('sf-c7b2-genesis',fields)});
}
function checkGenesis({genesis,active,receipt,uid,sid,battleId,expectedPolicy,
  sourceVersion,receiptVersion}){
  if(!genesis||!exact(genesis,['version','uid','sessionId','battleId',
    'issuedAtMs','expiresAtMs','qaOnly','nonEconomic','safeForCloudBattle',
    'settlementEnabled','snapshot','policy','encounter','journal','genesisDigest']))
    deny('QA_AUDIT_GENESIS_MISSING','Server-owned battle genesis is missing or malformed');
  const {genesisDigest,...fields}=genesis;
  if(genesis.version!==QA_GENESIS_VERSION||genesis.uid!==uid||genesis.sessionId!==sid
    ||genesis.battleId!==battleId||genesis.qaOnly!==true||genesis.nonEconomic!==true
    ||genesis.safeForCloudBattle!==false||genesis.settlementEnabled!==false
    ||!HEX64.test(genesisDigest||'')||hash('sf-c7b2-genesis',fields)!==genesisDigest
    ||genesis.issuedAtMs!==active.issuedAtMs||genesis.expiresAtMs!==active.expiresAtMs
    ||!same(genesis.policy,expectedPolicy))
    deny('QA_AUDIT_GENESIS_INVALID','Pinned origin or QA policy does not match');
  const snap=genesis.snapshot,context=snap?.context;
  if(!record(snap)||!record(context)||context.uid!==uid
    ||context.sessionId!==sid||context.battleId!==battleId
    ||context.issuedAtMs!==genesis.issuedAtMs
    ||context.expiresAtMs!==genesis.expiresAtMs
    ||!HEX64.test(snap.snapshotHash||''))
    deny('QA_AUDIT_GENESIS_INVALID','Pinned snapshot identity invalid');
  const {snapshotHash,...snapshotFields}=snap;
  if(hash('sf-v8b2c1-snapshot',snapshotFields)!==snapshotHash)
    deny('QA_AUDIT_GENESIS_INVALID','Pinned snapshot checksum invalid');
  const fresh=openInputJournal({uid,sessionId:sid,battleId,
    rulesVersion:context.rulesVersion,loadoutHash:snap.loadoutHash,
    issuedAtMs:genesis.issuedAtMs});
  if(!same(fresh,genesis.journal)
    ||!same(resolveCampaignAlphaStage1C6E({snapshot:freeze(structuredClone(snap))}),genesis.encounter)
    ||genesis.encounter.version!==ENCOUNTER_C6E_VERSION
    ||!same(active.run?.encounter,genesis.encounter))
    deny('QA_AUDIT_GENESIS_INVALID','Origin journal/encounter differs from pinned server policy');
  if(active.version!==sourceVersion||receipt.version!==receiptVersion
    ||receipt.sourceVersion!==sourceVersion
    ||receipt.uid!==uid||receipt.sessionId!==sid||receipt.battleId!==battleId
    ||receipt.qaOnly!==true||receipt.nonEconomic!==true
    ||receipt.safeForCloudBattle!==false||receipt.settlementEnabled!==false
    ||!HEX64.test(receipt.receiptDigest||''))
    deny('QA_AUDIT_RECEIPT_INVALID','QA terminal receipt context invalid');
  const {receiptDigest,...receiptFields}=receipt;
  if(hash('sf-c7b1-qa-receipt',receiptFields)!==receiptDigest)
    deny('QA_AUDIT_RECEIPT_INVALID','QA terminal receipt checksum invalid');
  return genesisDigest;
}

/**
 * Read all accepted trace documents in order from immutable genesis. Never
 * accept a supplied world state or hash as the simulator's initial state.
 * No database writes; caller does reads in a Firestore transaction and may
 * create a separate QA-only audit document after all checks succeed.
 */
async function verifyQaFullReplay({genesis,active,receipt,uid,sid,battleId,
  expectedPolicy,sourceVersion,receiptVersion,readTrace}) {
  if(typeof readTrace!=='function')throw new TypeError('readTrace required');
  const genesisDigest=checkGenesis({genesis,active,receipt,uid,sid,battleId,
    expectedPolicy,sourceVersion,receiptVersion});
  if(!bounded(active.chunkCount,1,QA_AUDIT_MAX_CHUNKS)
    ||!bounded(active.run?.state?.tick,1,QA_AUDIT_MAX_TICKS)
    ||!['lab-clear','lab-defeat'].includes(active.run?.state?.phase))
    deny('QA_AUDIT_BUDGET','Only bounded completed QA battles can be audited');
  let run=openCombatVerticalSlice({snapshot:freeze(structuredClone(genesis.snapshot)),
    policy:freeze(structuredClone(expectedPolicy)),
    journal:freeze(structuredClone(genesis.journal)),
    encounter:freeze(structuredClone(genesis.encounter))});
  let receivedBytes=0;
  for(let index=0;index<active.chunkCount;index++){
    const startTick=run.state.tick;
    if(startTick>=active.run.state.tick||run.state.phase!=='active')
      deny('QA_AUDIT_SEQUENCE_INVALID','Extra QA trace after terminal state');
    const tr=await readTrace(startTick);
    if(!exact(tr,['version','battleId','startTick','endTick','receivedAtMs','frames',
      'chunkDigest','nextTick','journalDigest','traceDigest','terminalPhase'])
      ||tr.version!==sourceVersion||tr.battleId!==battleId
      ||tr.startTick!==startTick||!bounded(tr.receivedAtMs,genesis.issuedAtMs,genesis.expiresAtMs)
      ||!Array.isArray(tr.frames)||!HEX64.test(tr.chunkDigest||'')
      ||!HEX64.test(tr.journalDigest||'')||!HEX64.test(tr.traceDigest||''))
      deny('QA_AUDIT_TRACE_INVALID','Missing or malformed server-accepted input trace');
    receivedBytes+=sized(tr);
    if(receivedBytes>QA_AUDIT_MAX_BYTES)
      deny('QA_AUDIT_BUDGET','QA audit trace exceeds bounded replay budget');
    const chunk={protocol:'pve-input-v1',battleId,startTick,frames:tr.frames};
    const checked=validateChunk(chunk);
    if(checked.chunkDigest!==tr.chunkDigest||checked.endTick!==tr.endTick)
      deny('QA_AUDIT_TRACE_INVALID','Original input envelope differs from persisted trace');
    const step=replayCombatSliceChunk({run,chunk,receivedAtMs:tr.receivedAtMs});
    if(step.duplicate||tr.nextTick!==step.run.state.tick
      ||tr.journalDigest!==step.run.foundation.journal.digest
      ||tr.traceDigest!==step.run.state.traceDigest
      ||tr.terminalPhase!==step.run.state.phase)
      deny('QA_AUDIT_TRACE_INVALID','Independent replay diverged from the accepted trace');
    run=step.run;
  }
  if(run.state.phase==='active'||!same(run,active.run)
    ||run.foundation.journal.nextTick!==run.state.tick
    ||receipt.phase!==run.state.phase||receipt.tick!==run.state.tick
    ||receipt.kills!==run.state.kills||receipt.contacts!==run.state.contacts
    ||receipt.escaped!==run.state.escaped||receipt.hp!==run.state.hp
    ||receipt.chunkCount!==active.chunkCount
    ||receipt.journalDigest!==run.foundation.journal.digest
    ||receipt.stateDigest!==run.state.stateDigest
    ||receipt.traceDigest!==run.state.traceDigest)
    deny('QA_AUDIT_TERMINAL_MISMATCH','Genesis replay does not match the terminal QA receipt');
  return Object.freeze({genesisDigest,verifiedChunks:active.chunkCount,
    verifiedTicks:run.state.tick,phase:run.state.phase,
    journalDigest:run.foundation.journal.digest,
    stateDigest:run.state.stateDigest,traceDigest:run.state.traceDigest,
    receiptDigest:receipt.receiptDigest});
}
const createAuditProof=(ctx,at)=>{
  const fields={version:QA_AUDIT_VERSION,uid:ctx.uid,sessionId:ctx.sid,
    battleId:ctx.battleId,genesisDigest:ctx.origin.genesisDigest,
    receiptDigest:ctx.origin.receiptDigest,
    verifiedChunks:ctx.origin.verifiedChunks,verifiedTicks:ctx.origin.verifiedTicks,
    phase:ctx.origin.phase,journalDigest:ctx.origin.journalDigest,
    stateDigest:ctx.origin.stateDigest,traceDigest:ctx.origin.traceDigest,
    createdAtMs:at,qaOnly:true,nonEconomic:true,
    replayMatched:true,safeForCloudBattle:false,settlementEnabled:false};
  return structuredClone({...fields,auditDigest:hash('sf-c7b2-qa-audit',fields)});
};
function checkStoredProof(p,uid,sid,battleId,receipt,genesis,active,expectedPolicy,sourceVersion,receiptVersion){
  const originDigest=checkGenesis({genesis,active,receipt,uid,sid,battleId,
    expectedPolicy,sourceVersion,receiptVersion});
  if(!record(p)||p.version!==QA_AUDIT_VERSION||p.uid!==uid
    ||p.sessionId!==sid||p.battleId!==battleId
    ||p.qaOnly!==true||p.nonEconomic!==true||p.replayMatched!==true
    ||p.safeForCloudBattle!==false||p.settlementEnabled!==false
    ||p.receiptDigest!==receipt?.receiptDigest
    ||p.genesisDigest!==originDigest
    ||p.stateDigest!==active.run?.state?.stateDigest
    ||p.traceDigest!==active.run?.state?.traceDigest
    ||p.journalDigest!==active.run?.foundation?.journal?.digest
    ||!HEX64.test(p.auditDigest||''))
    deny('QA_AUDIT_PROOF_INVALID','Stored QA-only proof context invalid');
  const {auditDigest,...fields}=p;
  if(hash('sf-c7b2-qa-audit',fields)!==auditDigest)
    deny('QA_AUDIT_PROOF_INVALID','Stored QA-only proof checksum invalid');
}
module.exports=Object.freeze({QA_GENESIS_VERSION,QA_AUDIT_VERSION,
  QA_AUDIT_MAX_CHUNKS,QA_AUDIT_MAX_TICKS,createQaGenesis,
  verifyQaFullReplay,createAuditProof,checkStoredProof});
