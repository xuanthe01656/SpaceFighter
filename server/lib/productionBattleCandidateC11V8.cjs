'use strict';
/**
 * C11: production-namespace battle journal CANDIDATE (not production authority).
 * Completely disconnected from server.js / gameService / C10 / settlement.
 * Disabled by default. Uses the UNAPPROVED C6-E QA kernel as a simulator;
 * even a matching replay is non-economic and MUST NOT feed C10 receipts.
 * Only trusted callers can supply actor UID/session. Never forward raw HTTP
 * payload beyond the exact open/ingest schemas validated below.
 */
const crypto=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {assertAccountActive}=require('./accountDeletion.cjs');
const {createServerBattleSnapshot}=require('./battleSnapshotV8.cjs');
const {openInputJournal,validateChunk}=require('./combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('./combatVerticalSliceV8.cjs');
const {resolveCampaignAlphaStage1C6E,LOCATION_ID,RULES_VERSION,CATALOG_VERSION}
  =require('./combatCampaignAlphaC6CV8.cjs');
const {projectQaBattleViewC8}=require('./qaBattleViewC8.cjs');
const {replayCandidateC11,makeCandidateAuditC11,verifyCandidateAuditC11,
  MAX_AUDIT_CHUNKS}=require('./productionReplayAuditC11V8.cjs');

const VERSION='v8-c11-production-namespace-candidate-v1';
const ORIGIN_VERSION='v8-c11-candidate-origin-hmac-v1';
const TTL_MS=10*60*1000;
const MAX_DOC_BYTES=240000;
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KEY_ID=/^[A-Za-z0-9_-]{6,48}$/;
const REQUEST=/^[A-Za-z0-9_-]{12,80}$/;
const HEX=/^[a-f0-9]{64}$/;
const RULES=Object.freeze({mode:'campaign',locationId:LOCATION_ID,
  rulesVersion:RULES_VERSION,catalogVersion:CATALOG_VERSION});
const POLICY=Object.freeze({version:'v8c6b-pierce-burst-preview-v3',
  keyboardUnitsPer60HzFrame:.3,pilotHitRadiusUnits:700,projectileHitRadiusUnits:200});
const ARENA=Object.freeze({halfWidthUnits:13200,halfHeightUnits:15000,
  spawnXUnits:0,spawnZUnits:12500});
const deny=(code,message,status=409)=>{throw new GameError(code,message,status);};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length
  &&keys.every(k=>Object.hasOwn(x,k));
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const macFor=(fields,key)=>crypto.createHmac('sha256',key)
  .update('spacefighter:c11:production-namespace-candidate-origin:v1\n')
  .update(JSON.stringify(canonical(fields))).digest('hex');
const uidValid=x=>typeof x==='string'&&x.length>0&&x.length<=128
  &&!/[/\x00-\x1f\x7f]/.test(x);
const safeInt=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
function safeDoc(x){if(Buffer.byteLength(JSON.stringify(x),'utf8')>MAX_DOC_BYTES)
  deny('C11_DOCUMENT_BUDGET','Candidate document too large',413);return structuredClone(x);}
function sealOrigin(data,keyId,key){
  const fields={version:ORIGIN_VERSION,purpose:'non-economic-production-candidate',
    keyId,...data,candidateOnly:true,qaSourceModel:true,nonEconomic:true,
    eligibleForSettlement:false,safeForCloudBattle:false};
  return safeDoc({...fields,mac:macFor(fields,key)});
}
const ORIGIN_KEYS=['version','purpose','keyId','uid','sessionId','battleId',
  'issuedAtMs','expiresAtMs','snapshot','policy','encounter','journal',
  'candidateOnly','qaSourceModel','nonEconomic','eligibleForSettlement',
  'safeForCloudBattle','mac'];
function checkOrigin(origin,{uid,sessionId,battleId,keys}){
  if(!exact(origin,ORIGIN_KEYS)||origin.version!==ORIGIN_VERSION
    ||origin.purpose!=='non-economic-production-candidate'
    ||origin.uid!==uid||origin.sessionId!==sessionId||origin.battleId!==battleId
    ||origin.candidateOnly!==true||origin.qaSourceModel!==true
    ||origin.nonEconomic!==true||origin.eligibleForSettlement!==false
    ||origin.safeForCloudBattle!==false||!KEY_ID.test(origin.keyId||'')
    ||!HEX.test(origin.mac||'')
    ||!safeInt(origin.issuedAtMs,1,Number.MAX_SAFE_INTEGER)
    ||!safeInt(origin.expiresAtMs,origin.issuedAtMs+1,origin.issuedAtMs+TTL_MS)
    ||!record(origin.snapshot)||!record(origin.encounter)||!record(origin.journal)
    ||!record(origin.policy))deny('C11_ORIGIN_INVALID','Candidate genesis invalid');
  const key=keys.get(origin.keyId);
  if(!Buffer.isBuffer(key)||key.length<32||key.length>128)
    deny('C11_ORIGIN_KEY','Missing server-owned origin verification key');
  const {mac,...fields}=origin;
  const expected=Buffer.from(macFor(fields,key),'hex');
  const actual=Buffer.from(mac,'hex');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))
    deny('C11_ORIGIN_MAC','Candidate genesis HMAC invalid');
  if(origin.snapshot.context?.uid!==uid||origin.snapshot.context?.sessionId!==sessionId
    ||origin.snapshot.context?.battleId!==battleId
    ||origin.snapshot.context?.issuedAtMs!==origin.issuedAtMs
    ||origin.snapshot.context?.expiresAtMs!==origin.expiresAtMs
    ||origin.snapshot.context?.rulesVersion!==RULES.rulesVersion
    ||origin.snapshot.context?.catalogVersion!==RULES.catalogVersion
    ||origin.snapshot.context?.locationId!==LOCATION_ID
    ||JSON.stringify(origin.policy)!==JSON.stringify(POLICY))
    deny('C11_ORIGIN_BINDING','Candidate genesis identity/policy mismatch');
  return true;
}
const answer=(active,duplicate=false)=>Object.freeze({
  version:VERSION,candidateOnly:true,nonEconomic:true,
  safeForCloudBattle:false,eligibleForSettlement:false,
  battleId:active.battleId,expiresAtMs:active.expiresAtMs,
  nextTick:active.run.state.tick,duplicate,
  qaOnly:true,qaSourceModel:true,settlementEnabled:false,
  protocol:'pve-input-v1',phase:active.run.state.phase,
  visual:projectQaBattleViewC8(active.run),
  terminal:active.run.state.phase!=='active',
  // No client/server `victory` or `verified-clear` field exists here.
  replayCandidate:'not-yet-independent-audited',
});

async function createProductionBattleCandidateC11({db,enabled=false,allowedUids=[],
  signingKeyId,signingKey,verificationKeys,
  now=Date.now,uuidFactory=crypto.randomUUID,
  randomSeed=()=>crypto.randomInt(1,0x100000000),catalogModule,schemaModule}={}){
  if(enabled!==true){
    const blocked=()=>deny('C11_DISABLED','C11 candidate is disabled',423);
    return Object.freeze({enabled:false,open:blocked,ingest:blocked,
      status:blocked,audit:blocked,abandon:blocked});
  }
  if(!db||typeof db.runTransaction!=='function'||!Array.isArray(allowedUids)
    ||allowedUids.length<1||allowedUids.length>10||new Set(allowedUids).size!==allowedUids.length
    ||allowedUids.some(u=>!uidValid(u))||!KEY_ID.test(signingKeyId||'')
    ||!Buffer.isBuffer(signingKey)||signingKey.length<32||signingKey.length>128
    ||!(verificationKeys instanceof Map)
    ||!Buffer.isBuffer(verificationKeys.get(signingKeyId))
    ||!signingKey.equals(verificationKeys.get(signingKeyId))
    ||[...verificationKeys].some(([id,key])=>!KEY_ID.test(id)
      ||!Buffer.isBuffer(key)||key.length<32||key.length>128)
    ||typeof now!=='function'||typeof uuidFactory!=='function'
    ||typeof randomSeed!=='function')
    throw new Error('C11 requires explicit server config, closed allowlist and HMAC key ring');
  const catalog=catalogModule||await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/constants.js')).href);
  const schema=schemaModule||await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/utils/profileSchema.js')).href);
  const allow=new Set(allowedUids);
  const userRef=u=>db.collection('users').doc(u);
  const jobRef=u=>db.collection('accountDeletionJobs').doc(u);
  const activeRef=u=>userRef(u).collection('prodBattleCandidateSessions').doc('current');
  const originRef=(u,b)=>userRef(u).collection('prodBattleCandidateOrigins').doc(b);
  const auditRef=(u,b)=>userRef(u).collection('prodBattleCandidateAudits').doc(b);
  const traceQuery=(u,b)=>userRef(u).collection('prodBattleCandidateTrace')
    .doc(b).collection('chunks');
  const chunkRef=(u,b,t)=>traceQuery(u,b).doc(String(t).padStart(6,'0'));
  const clock=()=>{const t=now();if(!safeInt(t,1,Number.MAX_SAFE_INTEGER-TTL_MS))
    throw new Error('C11 server clock invalid');return t;};
  function actor(uid,sid){
    if(!uidValid(uid)||!ID.test(sid||''))deny('C11_ACTOR_INVALID','Invalid actor',401);
    if(!allow.has(uid))deny('C11_NOT_ALLOWED','Candidate UID not allowlisted',403);
  }
  function profile(user,job,sid){
    if(!user.exists)deny('PROFILE_NOT_FOUND','No account profile',404);
    const data=user.data();assertAccountActive(data);
    if(job.exists)deny('ACCOUNT_DELETION_PENDING','Account deletion pending',423);
    if(data.sessionId!==sid)deny('SESSION_EXPIRED','Account session changed',401);
    return data;
  }
  function checkActive(doc,uid,sid,battleId,at,{requireLive=true}={}){
    if(!doc.exists)deny('C11_TICKET_MISSING','Candidate ticket missing',404);
    const cur=doc.data();
    if(cur.version!==VERSION||cur.uid!==uid||cur.sessionId!==sid
      ||cur.battleId!==battleId||!ID.test(cur.battleId||'')
      ||cur.nonEconomic!==true||cur.eligibleForSettlement!==false
      ||!HEX.test(cur.originMac||'')
      ||!safeInt(cur.chunkCount,0,MAX_AUDIT_CHUNKS)
      ||cur.run?.state?.qaOnly!==true||cur.run?.state?.safeForCloudBattle!==false
      ||cur.run?.foundation?.journal?.uid!==uid
      ||cur.run?.foundation?.journal?.sessionId!==sid
      ||cur.run?.foundation?.journal?.battleId!==battleId)
      deny('C11_TICKET_INVALID','Candidate ticket state or identity invalid');
    if(requireLive&&cur.abandonedAtMs!==undefined)
      deny('C11_TICKET_ABANDONED','Candidate ticket was abandoned',410);
    if(requireLive&&at>=cur.expiresAtMs)
      deny('C11_TICKET_EXPIRED','Candidate ticket expired',410);
    return cur;
  }
  async function open(uid,sid,body){
    actor(uid,sid);
    if(!exact(body,['mode','locationId','requestId'])||body.mode!=='campaign'
      ||body.locationId!==LOCATION_ID||!REQUEST.test(body.requestId||''))
      deny('C11_OPEN_INVALID','Only Alpha 1 request ID may be submitted',400);
    const at=clock(),battleId=uuidFactory(),seed=randomSeed();
    if(!ID.test(battleId||'')||!safeInt(seed,1,0xffffffff))
      throw new Error('C11 server UUID/seed invalid');
    return db.runTransaction(async t=>{
      const [user,job,previous]=await Promise.all([t.get(userRef(uid)),
        t.get(jobRef(uid)),t.get(activeRef(uid))]);
      const data=profile(user,job,sid);
      if(previous.exists){
        const old=previous.data();
        if(old.uid===uid&&old.sessionId===sid&&old.requestId===body.requestId){
          const valid=checkActive(previous,uid,sid,old.battleId,at);
          const originSnap=await t.get(originRef(uid,valid.battleId));
          if(!originSnap.exists)deny('C11_ORIGIN_MISSING','Existing genesis missing');
          checkOrigin(originSnap.data(),{uid,sessionId:sid,battleId:valid.battleId,
            keys:verificationKeys});
          if(valid.originMac!==originSnap.data().mac)
            deny('C11_ORIGIN_BINDING','Stored active ticket origin changed');
          return answer(valid,true);
        }
        if(old.sessionId===sid&&old.expiresAtMs>at
          &&old.abandonedAtMs===undefined
          &&old.run?.state?.phase==='active')
          deny('C11_TICKET_ACTIVE','Existing candidate battle still active');
      }
      const snapshot=createServerBattleSnapshot({identity:{uid,sessionId:sid,
        battleId,issuedAtMs:at,expiresAtMs:at+TTL_MS},
        persistedProfile:{campaignData:schema.restoreProfileDocument(data).campaignData},
        approvedCatalog:catalog,rules:RULES,arena:ARENA,seed});
      const encounter=resolveCampaignAlphaStage1C6E({snapshot});
      const journal=openInputJournal({uid,sessionId:sid,battleId,
        rulesVersion:RULES.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs:at});
      const run=openCombatVerticalSlice({snapshot,policy:POLICY,journal,encounter});
      const origin=sealOrigin({uid,sessionId:sid,battleId,issuedAtMs:at,
        expiresAtMs:at+TTL_MS,snapshot,policy:POLICY,encounter,journal},
        signingKeyId,signingKey);
      const doc=safeDoc({version:VERSION,uid,sessionId:sid,battleId,
        issuedAtMs:at,expiresAtMs:at+TTL_MS,requestId:body.requestId,
        chunkCount:0,run,originMac:origin.mac,updatedAtMs:at,
        nonEconomic:true,eligibleForSettlement:false});
      // Atomic server genesis and active checkpoint. Cannot be client-written.
      t.create(originRef(uid,battleId),origin);
      t.set(activeRef(uid),doc);
      return answer(doc);
    });
  }
  async function ingest(uid,sid,body){
    actor(uid,sid);
    if(!exact(body,['chunk']))deny('C11_INPUT_INVALID','Only input chunk accepted',400);
    const checked=validateChunk(body.chunk),at=clock();
    return db.runTransaction(async t=>{
      const [user,job,activeSnap,originSnap]=await Promise.all([
        t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid)),
        t.get(originRef(uid,checked.battleId))]);
      profile(user,job,sid);
      const active=checkActive(activeSnap,uid,sid,checked.battleId,at);
      if(!originSnap.exists)deny('C11_ORIGIN_MISSING','Cannot ingest without signed origin');
      const origin=originSnap.data();
      checkOrigin(origin,{uid,sessionId:sid,battleId:checked.battleId,keys:verificationKeys});
      if(origin.mac!==active.originMac)
        deny('C11_ORIGIN_BINDING','Active checkpoint has different origin');
      const run=freeze(structuredClone(active.run));
      const step=replayCombatSliceChunk({run,chunk:body.chunk,receivedAtMs:at});
      if(step.duplicate){
        const existing=await t.get(chunkRef(uid,checked.battleId,checked.startTick));
        if(!existing.exists||existing.data().chunkDigest!==checked.chunkDigest)
          deny('C11_DUPLICATE_INVALID','Missing/mismatched stored duplicate chunk');
        return answer(active,true);
      }
      if(active.chunkCount>=MAX_AUDIT_CHUNKS)
        deny('C11_CHUNK_LIMIT','Candidate journal full',429);
      if(step.run.state.qaOnly!==true||step.run.state.safeForCloudBattle!==false
        ||step.run.foundation.journal.nextTick!==step.run.state.tick)
        deny('C11_MODEL_UNSAFE','Unapproved simulator returned unsafe state');
      const next=safeDoc({...active,run:step.run,chunkCount:active.chunkCount+1,
        updatedAtMs:at});
      const row=safeDoc({version:VERSION,battleId:checked.battleId,
        startTick:checked.startTick,endTick:checked.endTick,frames:body.chunk.frames,
        receivedAtMs:at,chunkDigest:checked.chunkDigest,
        nextTick:step.run.state.tick,journalDigest:step.run.foundation.journal.digest,
        traceDigest:step.run.state.traceDigest,terminalPhase:step.run.state.phase});
      t.create(chunkRef(uid,checked.battleId,checked.startTick),row);
      t.set(activeRef(uid),next);
      return answer(next);
    });
  }
  async function status(uid,sid){
    actor(uid,sid);const at=clock();
    return db.runTransaction(async t=>{
      const [user,job,activeSnap]=await Promise.all([t.get(userRef(uid)),
        t.get(jobRef(uid)),t.get(activeRef(uid))]);
      profile(user,job,sid);
      if(!activeSnap.exists)deny('C11_TICKET_MISSING','No candidate ticket',404);
      const active=activeSnap.data();checkActive(activeSnap,uid,sid,active.battleId,at);
      const orig=await t.get(originRef(uid,active.battleId));
      if(!orig.exists)deny('C11_ORIGIN_MISSING','Signed genesis missing');
      checkOrigin(orig.data(),{uid,sessionId:sid,battleId:active.battleId,
        keys:verificationKeys});
      if(orig.data().mac!==active.originMac)
        deny('C11_ORIGIN_BINDING','Active checkpoint origin differs');
      return answer(active);
    });
  }
  async function audit(uid,sid,body){
    actor(uid,sid);
    if(!exact(body,['battleId'])||!ID.test(body.battleId||''))
      deny('C11_AUDIT_INPUT_INVALID','Only battleId accepted',400);
    const at=clock(),bid=body.battleId;
    return db.runTransaction(async t=>{
      const [user,job,activeSnap,originSnap,prior]=await Promise.all([
        t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid)),
        t.get(originRef(uid,bid)),t.get(auditRef(uid,bid))]);
      profile(user,job,sid);
      const active=checkActive(activeSnap,uid,sid,bid,at);
      if(!originSnap.exists)deny('C11_ORIGIN_MISSING','Signed genesis missing');
      const origin=originSnap.data();
      checkOrigin(origin,{uid,sessionId:sid,battleId:bid,keys:verificationKeys});
      if(origin.mac!==active.originMac)
        deny('C11_ORIGIN_BINDING','Active checkpoint changed genesis');
      if(active.run.state.phase==='active'||active.chunkCount<1)
        deny('C11_NOT_TERMINAL','Cannot audit an unfinished candidate');
      // One bounded query inside transaction; +1 detects stray extra docs.
      const query=await t.get(traceQuery(uid,bid).orderBy('startTick')
        .limit(MAX_AUDIT_CHUNKS+1));
      if(!Array.isArray(query?.docs)||query.docs.length!==active.chunkCount)
        deny('C11_TRACE_COUNT','Stored candidate trace count does not match');
      const entries=new Map(query.docs.map(x=>[x.id,x.data()]));
      if(entries.size!==active.chunkCount)
        deny('C11_TRACE_DUPLICATE','Duplicate trace document identifiers');
      const replay=await replayCandidateC11({origin,active,uid,
        sessionId:sid,battleId:bid,
        readTrace:async tick=>entries.get(String(tick).padStart(6,'0'))||null});
      const proof=makeCandidateAuditC11({uid,sessionId:sid,battleId:bid,
        replay,now:at});
      if(prior.exists){
        // A retry is re-audited. Recomputed proof must match previous values,
        // except time: retain the original create timestamp for comparison.
        verifyCandidateAuditC11(prior.data(),{uid,sessionId:sid,battleId:bid,
          replay,now:prior.data().createdAtMs});
        return Object.freeze({...prior.data(),duplicate:true});
      }
      t.create(auditRef(uid,bid),safeDoc(proof));
      return Object.freeze({...proof,duplicate:false});
    });
  }
  async function abandon(uid,sid,body){
    actor(uid,sid);
    if(!exact(body,['battleId'])||!ID.test(body.battleId||''))
      deny('C11_ABANDON_INPUT','Only battleId accepted',400);
    const at=clock();
    return db.runTransaction(async t=>{
      const [user,job,activeSnap,originSnap]=await Promise.all([
        t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid)),
        t.get(originRef(uid,body.battleId))]);
      profile(user,job,sid);
      const active=checkActive(activeSnap,uid,sid,body.battleId,at,{requireLive:false});
      if(!originSnap.exists)deny('C11_ORIGIN_MISSING','Signed genesis missing');
      checkOrigin(originSnap.data(),{uid,sessionId:sid,battleId:body.battleId,
        keys:verificationKeys});
      if(active.originMac!==originSnap.data().mac)
        deny('C11_ORIGIN_BINDING','Candidate origin changed');
      if(active.abandonedAtMs!==undefined)
        return Object.freeze({version:VERSION,battleId:body.battleId,
          candidateOnly:true,nonEconomic:true,eligibleForSettlement:false,
          settlementEnabled:false,abandoned:true,duplicate:true});
      t.set(activeRef(uid),safeDoc({...active,abandonedAtMs:at,updatedAtMs:at}));
      return Object.freeze({version:VERSION,battleId:body.battleId,
        candidateOnly:true,nonEconomic:true,eligibleForSettlement:false,
        settlementEnabled:false,abandoned:true,duplicate:false});
    });
  }
  return Object.freeze({enabled:true,open,ingest,status,audit,abandon});
}
module.exports=Object.freeze({VERSION,ORIGIN_VERSION,TTL_MS,
  createProductionBattleCandidateC11});
