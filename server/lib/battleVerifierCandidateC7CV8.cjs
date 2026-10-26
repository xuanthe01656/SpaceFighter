'use strict';
/**
 * C7-C1: read-only, opt-in candidate for a future production verifier.
 * Replays an entire SEPARATELY SEALED QA ticket from immutable genesis and
 * server-persisted chunks, rechecks QA receipt/proof and binds the active
 * Firebase session. Does NOT issue a production settlement grant.
 *
 * This is NOT sufficient anti-cheat: native 30Hz/touch, authoritative timing,
 * production battle policy, deployed Firestore Rules/IAM remain unapproved.
 * No code path here creates an economic document or returns safeForCloudBattle.
 */
const {GameError}=require('./economy.cjs');
const {assertAccountActive}=require('./accountDeletion.cjs');
const {verifyQaOriginSealC7C1,validateSealKey,validateKeyId}=require('./battleOriginSealC7CV8.cjs');
const {verifyQaFullReplay,checkStoredProof,QA_AUDIT_MAX_CHUNKS}=require('./qaBattleAuditC7B2V8.cjs');
const {QA_VERSION,QA_RECEIPT_VERSION,QA_POLICY}=require('./qaBattleAdmissionC7AV8.cjs');
const VERIFIER_CANDIDATE_VERSION='v8-c7c1-sealed-qa-replay-candidate-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const deny=(code,message,status=409)=>{throw new GameError(code,message,status);};
const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)
  &&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(v,keys)=>record(v)&&Object.keys(v).length===keys.length
  &&keys.every(k=>Object.hasOwn(v,k));
function validateActor(uid,sid,body,allowed){
  if(typeof uid!=='string'||uid.length<1||uid.length>128||/[/\x00-\x1f\x7f]/.test(uid))
    deny('UNAUTHORIZED','Invalid authenticated Firebase UID',401);
  if(!allowed.has(uid))deny('C7C1_NOT_ALLOWED','Closed QA allowlist required',403);
  if(typeof sid!=='string'||!UUID.test(sid))
    deny('SESSION_EXPIRED','Valid authenticated session required',401);
  if(!exact(body,['battleId'])||!UUID.test(body.battleId||''))
    deny('C7C1_INPUT_INVALID','Only battleId is accepted',400);
}
/**
 * IMPORTANT: never call this factory from server.js or GameService until the
 * missing native/security/authority gates have been independently approved.
 * Keys are explicit out-of-band Buffer dependencies, not client body fields.
 */
function createBattleVerifierCandidateC7C1({db,enabled=false,allowedUids=[],
  sealKeys=new Map(),now=Date.now}={}){
  if(!db||typeof db.runTransaction!=='function')throw new TypeError('Firestore DB required');
  if(enabled===true){
    if(!Array.isArray(allowedUids)||!allowedUids.length
      ||allowedUids.some(u=>typeof u!=='string'||u.length<1||u.length>128
        ||/[/\x00-\x1f\x7f]/.test(u)))
      throw new TypeError('C7-C1 requires closed UID allowlist');
    if(!(sealKeys instanceof Map)||sealKeys.size<1)
      throw new TypeError('C7-C1 requires explicit server-held HMAC verification keys');
    for(const [keyId,key] of sealKeys){validateKeyId(keyId);validateSealKey(key);}
    if(typeof now!=='function')throw new TypeError('Trusted server clock required');
  }
  const allowed=new Set(allowedUids);
  const userRef=uid=>db.collection('users').doc(uid);
  const childRef=(uid,c,id)=>userRef(uid).collection(c).doc(id);
  const traceQuery=(uid,bid)=>childRef(uid,'qaBattleTrace',bid)
    .collection('chunks').orderBy('startTick').limit(QA_AUDIT_MAX_CHUNKS+1);
  async function inspect(uid,sid,body){
    // When disabled, reject before accessing body, DB or any secret.
    if(enabled!==true)deny('C7C1_VERIFIER_DISABLED','C7-C1 verifier candidate disabled',423);
    validateActor(uid,sid,body,allowed);
    const at=now(),bid=body.battleId;
    if(!Number.isSafeInteger(at)||at<=0)throw new Error('Invalid trusted clock');
    return db.runTransaction(async t=>{
      const [user,job,activeSnap,genesisSnap,sealSnap,receiptSnap,proofSnap]=await Promise.all([
        t.get(userRef(uid)),t.get(db.collection('accountDeletionJobs').doc(uid)),
        t.get(childRef(uid,'qaBattleSessions','current')),
        t.get(childRef(uid,'qaBattleGenesis',bid)),
        t.get(childRef(uid,'qaBattleOriginSeals',bid)),
        t.get(childRef(uid,'qaBattleReceipts',bid)),
        t.get(childRef(uid,'qaBattleAuditProofs',bid)),
      ]);
      if(!user.exists)deny('PROFILE_NOT_FOUND','Profile is missing',404);
      if(job.exists)deny('ACCOUNT_DELETION_PENDING','Account deletion pending',423);
      const profile=user.data();assertAccountActive(profile);
      if(profile.sessionId!==sid)deny('SESSION_EXPIRED','User session has rotated',401);
      if(![activeSnap,genesisSnap,sealSnap,receiptSnap,proofSnap].every(s=>s.exists))
        deny('C7C1_EVIDENCE_MISSING','A new sealed, audited QA ticket is required');
      const active=activeSnap.data(),genesis=genesisSnap.data(),seal=sealSnap.data();
      const receipt=receiptSnap.data(),proof=proofSnap.data();
      if(active.version!==QA_VERSION||active.uid!==uid||active.sessionId!==sid
        ||active.battleId!==bid||!Number.isSafeInteger(active.expiresAtMs)
        ||at>=active.expiresAtMs||active.run?.state?.qaOnly!==true
        ||active.run?.state?.safeForCloudBattle!==false
        ||!Number.isSafeInteger(active.chunkCount)||active.chunkCount<1
        ||active.chunkCount>QA_AUDIT_MAX_CHUNKS)
        deny('C7C1_TICKET_INVALID','QA ticket context/expiry invalid');
      verifyQaOriginSealC7C1({genesis,seal,keys:sealKeys});
      checkStoredProof(proof,uid,sid,bid,receipt,genesis,active,
        QA_POLICY,QA_VERSION,QA_RECEIPT_VERSION);
      const traces=await t.get(traceQuery(uid,bid));
      if(!Array.isArray(traces?.docs)||traces.docs.length!==active.chunkCount)
        deny('C7C1_TRACE_COUNT','Complete server-accepted trace is required');
      const docs=new Map(traces.docs.map(d=>[d.id,d.data()]));
      if(docs.size!==active.chunkCount)deny('C7C1_TRACE_INDEX','Trace IDs must be unique');
      const origin=await verifyQaFullReplay({genesis,active,receipt,uid,sid,battleId:bid,
        expectedPolicy:QA_POLICY,sourceVersion:QA_VERSION,
        receiptVersion:QA_RECEIPT_VERSION,
        readTrace:async tick=>docs.get(String(tick).padStart(6,'0'))||null});
      if(proof.genesisDigest!==origin.genesisDigest
        ||proof.receiptDigest!==origin.receiptDigest
        ||proof.verifiedChunks!==origin.verifiedChunks
        ||proof.verifiedTicks!==origin.verifiedTicks
        ||proof.phase!==origin.phase||proof.stateDigest!==origin.stateDigest
        ||proof.traceDigest!==origin.traceDigest
        ||proof.journalDigest!==origin.journalDigest)
        deny('C7C1_PROOF_MISMATCH','Stored QA audit differs from fresh full replay');
      // This intentionally cannot satisfy validateProductionOutcome() in
      // verifiedSettlementC7B2BV8.cjs (different schema/version/flags).
      return Object.freeze({version:VERIFIER_CANDIDATE_VERSION,
        uid,sessionId:sid,battleId:bid,checkedAtMs:at,
        observedQaPhase:origin.phase,verifiedTicks:origin.verifiedTicks,
        verifiedChunks:origin.verifiedChunks,genesisDigest:origin.genesisDigest,
        receiptDigest:origin.receiptDigest,sealKeyId:seal.keyId,
        originSealAuthenticated:true,fullReplayMatched:true,
        qaOnly:true,nonEconomic:true,safeForCloudBattle:false,
        settlementEnabled:false,productionOutcomeIssued:false,
        nativeTouchParityApproved:false,productionEncounterApproved:false});
    });
  }
  return Object.freeze({inspect});
}
module.exports=Object.freeze({VERIFIER_CANDIDATE_VERSION,createBattleVerifierCandidateC7C1});
