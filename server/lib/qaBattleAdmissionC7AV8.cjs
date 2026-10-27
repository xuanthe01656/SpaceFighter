'use strict';
/**
 * C7-A / QA-only authenticated combat journal endpoint service.
 * Never use this module for battle.start/battle.finish, energy, progression,
 * missions, rewards, settlement, or production victory verification.
 * Feature is OFF at boot unless an explicit UID allowlist is configured.
 * All combat authority inputs come from the authenticated Firestore user,
 * pinned server policy, server clock and crypto randomness; NEVER request.body.
 */
const crypto=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {assertAccountActive}=require('./accountDeletion.cjs');
const {createServerBattleSnapshot}=require('./battleSnapshotV8.cjs');
const {openInputJournal,validateChunk}=require('./combatInputJournalV8.cjs');
const {ENCOUNTER_C6E_VERSION,ALPHA_POLICY_C6E_VERSION}=require('./combatCampaignAlphaC6CV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('./combatVerticalSliceV8.cjs');
const {createQaGenesis,verifyQaFullReplay,createAuditProof,checkStoredProof}=require('./qaBattleAuditC7B2V8.cjs');
const {issueQaOriginSealC7C1,validateSealKey,validateKeyId}=require('./battleOriginSealC7CV8.cjs');
const {projectQaBattleViewC8}=require('./qaBattleViewC8.cjs');
const {resolveCampaignAlphaStage1C6E,LOCATION_ID,RULES_VERSION,CATALOG_VERSION,
  ARENA_HALF_WIDTH_UNITS,ARENA_HALF_HEIGHT_UNITS}=require('./combatCampaignAlphaC6CV8.cjs');

const QA_VERSION='v8-c7a-qa-admission-v1';
const QA_RECEIPT_VERSION='v8-c7b1-terminal-qa-receipt-v1';
const QA_TTL_MS=10*60*1000;
const QA_MAX_CHUNKS=512;
const QA_MAX_DOC_BYTES=240000;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_ID_RE=/^[a-zA-Z0-9_-]{12,80}$/;
const HEX64_RE=/^[a-f0-9]{64}$/;
const digestReceipt=(data)=>{
  const sorted=v=>Array.isArray(v)?v.map(sorted):plain(v)
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
  return crypto.createHash('sha256').update(JSON.stringify(['sf-c7b1-qa-receipt',sorted(data)])).digest('hex');
};
const POLICY=Object.freeze({version:'v8c6b-pierce-burst-preview-v3',
  keyboardUnitsPer60HzFrame:.3,pilotHitRadiusUnits:700,projectileHitRadiusUnits:200});
const ARENA=Object.freeze({halfWidthUnits:ARENA_HALF_WIDTH_UNITS,
  halfHeightUnits:ARENA_HALF_HEIGHT_UNITS,spawnXUnits:0,spawnZUnits:12500});
const RULES=Object.freeze({mode:'campaign',locationId:LOCATION_ID,
  rulesVersion:RULES_VERSION,catalogVersion:CATALOG_VERSION});
const deny=(code,message,status=400)=>{throw new GameError(code,message,status);};
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)
  &&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length
  &&keys.every(k=>Object.hasOwn(o,k));
const freeze=o=>{if(o&&typeof o==='object'){
  for(const v of Object.values(o))freeze(v);Object.freeze(o);
}return o;};
const clone=o=>structuredClone(o);
function wrapQaError(err){
  if(err instanceof GameError)throw err;
  if(/^(INPUT_|SLICE_|FOUNDATION_|SNAPSHOT_|ALPHA_)/.test(err?.code||''))
    deny(err.code,err.message,422);
  throw err;
}
function safeDoc(record){
  if(Buffer.byteLength(JSON.stringify(record),'utf8')>QA_MAX_DOC_BYTES)
    deny('QA_DOCUMENT_LIMIT','QA state budget exceeded',413);
  return clone(record);
}
function safeClock(now){
  const t=now();
  if(!Number.isSafeInteger(t)||t<=0||t>Number.MAX_SAFE_INTEGER-QA_TTL_MS)
    throw new Error('Invalid trusted QA server clock');
  return t;
}
function requireActor(uid,sid,allowlist){
  if(typeof uid!=='string'||uid.length<1||uid.length>128||/[\x00-\x1f\x7f/]/.test(uid))
    deny('UNAUTHORIZED','Invalid Firebase identity',401);
  if(!allowlist.has(uid))deny('QA_BATTLE_NOT_ALLOWED','User is not in the closed QA allowlist',403);
  if(typeof sid!=='string'||!UUID_RE.test(sid))deny('SESSION_EXPIRED','Valid game session required',401);
}
function requireProfile(snap,jobSnap,sid){
  if(!snap.exists)deny('PROFILE_NOT_FOUND','Profile not initialized',404);
  if(jobSnap.exists)deny('ACCOUNT_DELETION_PENDING','Deletion prevents QA battle access',423);
  const doc=snap.data();assertAccountActive(doc);
  if(doc.sessionId!==sid)deny('SESSION_EXPIRED','Signed in on another device or session expired',401);
  return doc;
}
function checkCurrent(active,uid,sid,battleId,at){
  if(!active.exists)deny('QA_BATTLE_NOT_FOUND','QA ticket not found',404);
  const data=active.data();
  if(data.version!==QA_VERSION||data.uid!==uid||data.sessionId!==sid
    ||data.battleId!==battleId||!UUID_RE.test(data.battleId))
    deny('QA_BATTLE_CONTEXT','QA ticket does not match this identity/session',409);
  if(!Number.isSafeInteger(data.expiresAtMs)||at>=data.expiresAtMs)
    deny('QA_BATTLE_EXPIRED','QA ticket expired',410);
  if(data.run?.state?.safeForCloudBattle!==false||data.run?.state?.qaOnly!==true)
    deny('QA_BATTLE_STATE_INVALID','QA state must never be Cloud-settleable',409);
  return data;
}
const response=(data,duplicate=false)=>Object.freeze({
  qaOnly:true,safeForCloudBattle:false,settlementEnabled:false,
  battleId:data.battleId,version:data.version,expiresAtMs:data.expiresAtMs,
  duplicate,protocol:'pve-input-v1',nextTick:data.run.state.tick,
  phase:data.run.state.phase,checkpointDigest:data.run.state.stateDigest,
  traceDigest:data.run.state.traceDigest,
  visual:projectQaBattleViewC8(data.run),
});

async function createQaBattleAdmissionC7A({db,allowedUids,now=Date.now,
  uuidFactory=crypto.randomUUID,randomSeed=()=>crypto.randomInt(1,0x100000000),
  catalogModule,schemaModule,originSealConfig=null}){
  if(!db||typeof db.runTransaction!=='function')throw new TypeError('Firestore db required');
  // Optional, explicitly injected C7-C1 signing secret. Default remains OFF.
  // Nothing in server.js currently enables this; legacy QA tests retain their path.
  if(originSealConfig!==null){
    if(!plain(originSealConfig)||!exact(originSealConfig,['keyId','key']))
      throw new TypeError('C7-C1 originSealConfig must contain only keyId and key');
    validateKeyId(originSealConfig.keyId);validateSealKey(originSealConfig.key);
  }
  const allowlist=new Set(allowedUids||[]);
  if(!allowlist.size||[...allowlist].some(uid=>typeof uid!=='string'||!uid
    ||uid.length>128||/[\x00-\x1f\x7f/]/.test(uid)))
    throw new Error('A nonempty explicit QA UID allowlist is required');
  const catalog=catalogModule||await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
  const schema=schemaModule||await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href);
  const userRef=uid=>db.collection('users').doc(uid);
  const activeRef=uid=>userRef(uid).collection('qaBattleSessions').doc('current');
  const jobRef=uid=>db.collection('accountDeletionJobs').doc(uid);
  const receiptRef=(uid,battleId)=>userRef(uid).collection('qaBattleReceipts').doc(battleId);
  const genesisRef=(uid,battleId)=>userRef(uid).collection('qaBattleGenesis').doc(battleId);
  const originSealRef=(uid,battleId)=>userRef(uid).collection('qaBattleOriginSeals').doc(battleId);
  const auditRef=(uid,battleId)=>userRef(uid).collection('qaBattleAuditProofs').doc(battleId);
  const traceCollection=(uid,battleId)=>userRef(uid).collection('qaBattleTrace')
    .doc(battleId).collection('chunks');
  const inputRef=(uid,battleId,startTick)=>traceCollection(uid,battleId)
    .doc(String(startTick).padStart(6,'0'));

  async function open(uid,sid,body){
    requireActor(uid,sid,allowlist);
    if(!exact(body,['mode','locationId','requestId'])||body.mode!=='campaign'
      ||body.locationId!==LOCATION_ID||!REQUEST_ID_RE.test(body.requestId))
      deny('QA_OPEN_INVALID','Only pinned Alpha stage 1 QA admission is supported');
    const issuedAtMs=safeClock(now),battleId=uuidFactory(),seed=randomSeed();
    if(!UUID_RE.test(battleId)||!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)
      throw new Error('Invalid server-generated QA identity/seed');
    try{
      return await db.runTransaction(async t=>{
        const [userSnap,jobSnap,activeSnap]=await Promise.all([
          t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid))]);
        const user=requireProfile(userSnap,jobSnap,sid);
        if(activeSnap.exists){
          const prior=activeSnap.data();
          if(prior.uid===uid&&prior.sessionId===sid&&prior.openRequestId===body.requestId){
            if(prior.expiresAtMs<=issuedAtMs)
              deny('QA_BATTLE_EXPIRED','Existing QA request has expired',410);
            if(prior.run?.state?.qaOnly!==true||prior.run?.state?.safeForCloudBattle!==false)
              deny('QA_BATTLE_STATE_INVALID','QA ticket state invalid',409);
            return response(prior,true);
          }
          if(prior.sessionId===sid&&prior.expiresAtMs>issuedAtMs
            &&prior.run?.state?.phase==='active')
            deny('QA_BATTLE_ALREADY_ACTIVE','Finish or expire the active QA ticket',409);
        }
        // Always read persisted Firestore state inside this transaction.
        // Restore normalized loadout/ownership through canonical profile schema.
        const persistedProfile={campaignData:schema.restoreProfileDocument(user).campaignData};
        const snapshot=createServerBattleSnapshot({identity:{uid,sessionId:sid,battleId,
          issuedAtMs,expiresAtMs:issuedAtMs+QA_TTL_MS},persistedProfile,
          approvedCatalog:catalog,rules:RULES,arena:ARENA,seed});
        const encounter=resolveCampaignAlphaStage1C6E({snapshot});
        const journal=openInputJournal({uid,sessionId:sid,battleId,
          rulesVersion:RULES.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs});
        const run=openCombatVerticalSlice({snapshot,policy:POLICY,journal,encounter});
        const doc=safeDoc({version:QA_VERSION,uid,sessionId:sid,battleId,
          issuedAtMs,expiresAtMs:issuedAtMs+QA_TTL_MS,openRequestId:body.requestId,
          chunkCount:0,run,updatedAtMs:issuedAtMs});
        // C7-B2: a separate create-only, server-issued replay origin.
        // Old tickets have no genesis and cannot obtain an audit proof.
        const genesis=safeDoc(createQaGenesis({uid,sessionId:sid,
          battleId,issuedAtMs,expiresAtMs:issuedAtMs+QA_TTL_MS,
          snapshot,policy:POLICY,encounter,journal}));
        t.create(genesisRef(uid,battleId),genesis);
        // Opt-in only: emit the seal in the SAME Firestore transaction as
        // the server-originated genesis. Never retroactively seal old tickets.
        if(originSealConfig!==null)
          t.create(originSealRef(uid,battleId),safeDoc(issueQaOriginSealC7C1({
            genesis,keyId:originSealConfig.keyId,key:originSealConfig.key})));
        t.set(activeRef(uid),doc);
        return response(doc);
      });
    }catch(err){return wrapQaError(err);}
  }

  async function ingest(uid,sid,body){
    requireActor(uid,sid,allowlist);
    if(!exact(body,['chunk']))deny('QA_INPUT_INVALID','Only a bounded input chunk is accepted');
    // Validate size and every frame before touching Firestore.
    let validated;
    try{validated=validateChunk(body.chunk);}catch(err){return wrapQaError(err);}
    const at=safeClock(now);
    try{
      return await db.runTransaction(async t=>{
        const [userSnap,jobSnap,activeSnap]=await Promise.all([
          t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid))]);
        requireProfile(userSnap,jobSnap,sid);
        const current=checkCurrent(activeSnap,uid,sid,validated.battleId,at);
        if(!Number.isSafeInteger(current.chunkCount)||current.chunkCount<0
          ||current.chunkCount>QA_MAX_CHUNKS)deny('QA_BATTLE_STATE_INVALID','Invalid QA chunk count',409);
        // Firestore data is thawed. It is trusted ONLY because this subcollection
        // is server-owned, and the replay kernel revalidates sealed checksums.
        // This is NOT an HMAC and must never be used to authorize rewards.
        const run=freeze(clone(current.run));
        const result=replayCombatSliceChunk({run,chunk:body.chunk,receivedAtMs:at});
        if(result.duplicate)return response(current,true);
        if(current.chunkCount>=QA_MAX_CHUNKS)
          deny('QA_CHUNK_LIMIT','Too many QA submissions; batch input frames',429);
        if(result.run.state.safeForCloudBattle!==false||result.run.state.qaOnly!==true)
          deny('QA_UNVERIFIED_STATE','QA replay cannot authorize Cloud rewards',409);
        const next=safeDoc({...current,run:result.run,
          chunkCount:current.chunkCount+1,updatedAtMs:at});
        const trace=safeDoc({version:QA_VERSION,battleId:current.battleId,
          startTick:validated.startTick,endTick:validated.endTick,
          receivedAtMs:at,frames:body.chunk.frames,
          chunkDigest:validated.chunkDigest,nextTick:result.run.state.tick,
          journalDigest:result.run.foundation.journal.digest,
          traceDigest:result.run.state.traceDigest,
          terminalPhase:result.run.state.phase});
        // Read-only profile and wallet. This is a separate QA-only namespace.
        t.create(inputRef(uid,current.battleId,validated.startTick),trace);
        t.set(activeRef(uid),next);
        return response(next);
      });
    }catch(err){return wrapQaError(err);}
  }

  /**
   * C7-B1 QA-only terminal attestation. This is a durable NON-ECONOMIC
   * record, NOT battle verification for money, progress, energy or stars.
   * It validates the last server-authored trace/checkpoint inside a single
   * Firestore transaction; SHA-256 is consistency checking, not an HMAC.
   * Full input re-simulation, mobile touch parity, and a separately approved
   * verified-outcome trust root remain prerequisites for C7-B2 settlement.
   */
  async function finalize(uid,sid,body){
    requireActor(uid,sid,allowlist);
    if(!exact(body,['battleId'])||typeof body.battleId!=='string'
      ||!UUID_RE.test(body.battleId))
      deny('QA_RECEIPT_INPUT_INVALID','Provide only the QA battle ID');
    const at=safeClock(now),battleId=body.battleId;
    try{
      return await db.runTransaction(async t=>{
        const [userSnap,jobSnap,receiptSnap]=await Promise.all([
          t.get(userRef(uid)),t.get(jobRef(uid)),t.get(receiptRef(uid,battleId))]);
        requireProfile(userSnap,jobSnap,sid);
        if(receiptSnap.exists){
          const old=receiptSnap.data();
          if(old.version!==QA_RECEIPT_VERSION||old.uid!==uid
            ||old.sessionId!==sid||old.battleId!==battleId
            ||old.qaOnly!==true||old.safeForCloudBattle!==false
            ||old.settlementEnabled!==false||old.nonEconomic!==true
            ||!HEX64_RE.test(old.receiptDigest||''))
            deny('QA_RECEIPT_CONTEXT_INVALID','Stored QA receipt context invalid',409);
          const {receiptDigest,...fields}=old;
          if(digestReceipt(fields)!==receiptDigest)
            deny('QA_RECEIPT_CONTEXT_INVALID','Stored QA receipt checksum differs',409);
          return Object.freeze({...old,duplicate:true});
        }
        const activeSnap=await t.get(activeRef(uid));
        const current=checkCurrent(activeSnap,uid,sid,battleId,at);
        const run=current.run,s=run?.state,j=run?.foundation?.journal;
        if(!s||!j||!run.foundation?.checkpoint
          ||run.encounter?.version!==ENCOUNTER_C6E_VERSION
          ||run.encounter?.campaignPolicyVersion!==ALPHA_POLICY_C6E_VERSION
          ||s.version!=='pve-lab-vertical-slice-v8'
          ||!['lab-clear','lab-defeat'].includes(s.phase)
          ||j.uid!==uid||j.sessionId!==sid||j.battleId!==battleId
          ||j.nextTick!==s.tick||run.foundation.checkpoint.tick!==s.tick
          ||!Number.isSafeInteger(current.chunkCount)||current.chunkCount<1
          ||current.chunkCount>QA_MAX_CHUNKS
          ||!Number.isSafeInteger(j.lastChunkStart)||j.lastChunkStart<0
          ||!HEX64_RE.test(j.digest||'')||!HEX64_RE.test(s.traceDigest||'')
          ||!HEX64_RE.test(s.stateDigest||''))
          deny('QA_RECEIPT_UNVERIFIED','Terminal QA replay/checkpoint not eligible',409);
        const traceSnap=await t.get(inputRef(uid,battleId,j.lastChunkStart));
        if(!traceSnap.exists)deny('QA_RECEIPT_TRACE_MISSING','Last accepted trace missing',409);
        const tr=traceSnap.data();
        const chunk={protocol:'pve-input-v1',battleId,startTick:j.lastChunkStart,frames:tr.frames};
        const checked=validateChunk(chunk);
        if(tr.version!==QA_VERSION||tr.battleId!==battleId
          ||tr.startTick!==checked.startTick||tr.endTick!==checked.endTick
          ||tr.nextTick!==s.tick||tr.nextTick!==j.nextTick
          ||tr.receivedAtMs!==j.lastReceivedAtMs
          ||tr.chunkDigest!==checked.chunkDigest||tr.chunkDigest!==j.lastChunkDigest
          ||tr.journalDigest!==j.digest||tr.traceDigest!==s.traceDigest
          ||tr.terminalPhase!==s.phase)
          deny('QA_RECEIPT_TRACE_INVALID','Final trace/checkpoint do not match',409);
        // Deep validation of both sealed journal and world state. This must
        // return DUPLICATE: never advance or simulate an extra frame here.
        const verified=replayCombatSliceChunk({run:freeze(clone(run)),chunk,
          receivedAtMs:tr.receivedAtMs});
        if(!verified.duplicate||verified.run.state.stateDigest!==s.stateDigest)
          deny('QA_RECEIPT_CHECKPOINT_INVALID','Final checkpoint validation failed',409);
        const fields={version:QA_RECEIPT_VERSION,uid,sessionId:sid,battleId,
          sourceVersion:QA_VERSION,encounterVersion:run.encounter.version,
          policyVersion:run.encounter.campaignPolicyVersion,
          phase:s.phase,tick:s.tick,kills:s.kills,contacts:s.contacts,
          escaped:s.escaped,hp:s.hp,chunkCount:current.chunkCount,
          journalDigest:j.digest,stateDigest:s.stateDigest,traceDigest:s.traceDigest,
          createdAtMs:at,qaOnly:true,safeForCloudBattle:false,
          settlementEnabled:false,nonEconomic:true};
        const receipt=safeDoc({...fields,receiptDigest:digestReceipt(fields)});
        // A create-only, immutable QA namespace. NEVER write users/{uid}
        // or operations, wallet, energy, missions, stars or progression.
        t.create(receiptRef(uid,battleId),receipt);
        return Object.freeze({...receipt,duplicate:false});
      });
    }catch(err){return wrapQaError(err);}
  }

  /** C7-B2: full QA replay audit, with NO wallet or progression writes.
   * The receipt and server-pinned genesis must already exist. The complete
   * trace is re-simulated in a bounded Firestore transaction.
   */
  async function audit(uid,sid,body){
    requireActor(uid,sid,allowlist);
    if(!exact(body,['battleId'])||typeof body.battleId!=='string'
      ||!UUID_RE.test(body.battleId))
      deny('QA_AUDIT_INPUT_INVALID','Provide only the QA battle ID');
    const at=safeClock(now),battleId=body.battleId;
    try{
      return await db.runTransaction(async t=>{
        const [userSnap,jobSnap,activeSnap,receiptSnap,genesisSnap,proofSnap]=await Promise.all([
          t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid)),
          t.get(receiptRef(uid,battleId)),t.get(genesisRef(uid,battleId)),
          t.get(auditRef(uid,battleId))]);
        requireProfile(userSnap,jobSnap,sid);
        const active=checkCurrent(activeSnap,uid,sid,battleId,at);
        if(!receiptSnap.exists)
          deny('QA_AUDIT_RECEIPT_MISSING','Finalize the non-economic QA receipt first',409);
        const receipt=receiptSnap.data();
        if(!genesisSnap.exists)
          deny('QA_AUDIT_GENESIS_MISSING','Only tickets opened with server genesis can be audited',409);
        if(proofSnap.exists){
          const old=proofSnap.data();
          checkStoredProof(old,uid,sid,battleId,receipt,genesisSnap.data(),active,
            POLICY,QA_VERSION,QA_RECEIPT_VERSION);
          return Object.freeze({...old,duplicate:true});
        }
        // One bounded ordered Firestore query, rather than 76+ sequential
        // network roundtrips on a typical full Alpha replay. A +1 sentinel
        // detects extra/stray trace docs. Still fully inside one transaction.
        if(!Number.isSafeInteger(active.chunkCount)||active.chunkCount<1
          ||active.chunkCount>128)
          deny('QA_AUDIT_BUDGET','QA replay exceeds its bounded chunk budget',409);
        const traceSnap=await t.get(traceCollection(uid,battleId)
          .orderBy('startTick').limit(129));
        if(!Array.isArray(traceSnap?.docs)
          ||traceSnap.docs.length!==active.chunkCount)
          deny('QA_AUDIT_TRACE_COUNT_INVALID','Persisted trace count differs from accepted QA journal',409);
        const traceDocs=new Map(traceSnap.docs.map(s=>[s.id,s.data()]));
        if(traceDocs.size!==active.chunkCount)
          deny('QA_AUDIT_TRACE_COUNT_INVALID','Duplicate/invalid trace IDs',409);
        const origin=await verifyQaFullReplay({genesis:genesisSnap.data(),
          active,receipt,uid,sid,battleId,expectedPolicy:POLICY,
          sourceVersion:QA_VERSION,receiptVersion:QA_RECEIPT_VERSION,
          readTrace:async startTick=>traceDocs.get(String(startTick).padStart(6,'0'))||null});
        const proof=safeDoc(createAuditProof({uid,sid,battleId,origin},at));
        // QA-only namespace, no profile/operations/economy updates.
        t.create(auditRef(uid,battleId),proof);
        return Object.freeze({...proof,duplicate:false});
      });
    }catch(err){return wrapQaError(err);}
  }

  // Explicitly abandon only this user's current QA match. Does not touch
  // economy/progress and never finalizes or changes any existing proof.
  async function abandon(uid,sid,body){
    requireActor(uid,sid,allowlist);
    if(!exact(body,['battleId'])||!UUID_RE.test(body.battleId||''))
      deny('QA_ABANDON_INVALID','Only battleId is accepted');
    const at=safeClock(now);
    return db.runTransaction(async t=>{
      const [userSnap,jobSnap,activeSnap]=await Promise.all([
        t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid))]);
      requireProfile(userSnap,jobSnap,sid);
      if(!activeSnap.exists)deny('QA_BATTLE_NOT_FOUND','QA ticket not found',404);
      const active=activeSnap.data();
      if(active.uid!==uid||active.sessionId!==sid||active.battleId!==body.battleId
        ||active.version!==QA_VERSION||active.run?.state?.qaOnly!==true
        ||active.run?.state?.safeForCloudBattle!==false)
        deny('QA_BATTLE_CONTEXT','QA ticket identity mismatch',409);
      if(active.expiresAtMs<=at)
        return Object.freeze({qaOnly:true,settlementEnabled:false,abandoned:true,duplicate:true});
      // Invalidate admission only. Never erase journal/genesis/receipt history.
      t.set(activeRef(uid),safeDoc({...active,expiresAtMs:at,updatedAtMs:at}));
      return Object.freeze({qaOnly:true,settlementEnabled:false,abandoned:true,duplicate:false});
    });
  }

  async function status(uid,sid){
    requireActor(uid,sid,allowlist);
    const at=safeClock(now);
    return db.runTransaction(async t=>{
      const [userSnap,jobSnap,activeSnap]=await Promise.all([
        t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid))]);
      requireProfile(userSnap,jobSnap,sid);
      if(!activeSnap.exists)deny('QA_BATTLE_NOT_FOUND','QA ticket not found',404);
      return response(checkCurrent(activeSnap,uid,sid,activeSnap.data().battleId,at));
    });
  }
  return Object.freeze({open,ingest,status,finalize,audit,abandon});
}
module.exports=Object.freeze({QA_VERSION,QA_RECEIPT_VERSION,QA_TTL_MS,QA_MAX_CHUNKS,
  QA_POLICY:POLICY,createQaBattleAdmissionC7A});
