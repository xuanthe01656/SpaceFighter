'use strict';
/**
 * C15-RC1B/RC1C staging runtime: signed non-economic open, append-only
 * journal, independent replay and optional RC2 trusted outcome foundation.
 * No wallet, mission, reward or settlement writes.
 */
const crypto=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {assertAccountActive}=require('./accountDeletion.cjs');
const {createServerBattleSnapshot}=require('./battleSnapshotV8.cjs');
const {resolveCampaignAlphaStage1C6E}=require('./combatCampaignAlphaC6CV8.cjs');
const {validateChunk}=require('./combatInputJournalV8.cjs');
const {createC15CommercialOriginV1,verifyC15CommercialOriginV1}=require('./c15CommercialGenesisV1.cjs');
const {replayC15CommercialFoundationV1,verifyC15CommercialReplayResultV1}=require('./c15CommercialReplayV1.cjs');
const {verifyResourceManifestV1}=require('./resourceManifestV1.cjs');
const {DEFAULT_PROFILE_ID,resolveC15ControlProfile,resolveC15ControlProfileForPolicy,
  createC15MovementPolicy}=require('./c15ControlProfilesV1.cjs');
const {journalRoot,createC15TrustedOutcomeV1,verifyC15TrustedOutcomeV1}=require('./c15TrustedOutcomeV1.cjs');

const VERSION='c15-rc1b-runtime-v1';
const TTL_MS=20*60*1000;
const MAX_CHUNKS=256;
const MAX_TICKS=4500;
const PHASES=new Set(['active','finalized','abandoned']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const REQUEST=/^[A-Za-z0-9_-]{12,80}$/;
const KEY_ID=/^[A-Za-z0-9_-]{6,48}$/;
const B64=/^[A-Za-z0-9+/]+={0,2}$/;
const HEX=/^[a-f0-9]{64}$/;
const uidValid=value=>typeof value==='string'&&value.length>=1&&value.length<=128&&!/[\u0000-\u001f\u007f/]/.test(value);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const safeInt=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const freeze=x=>{if(x&&typeof x==='object'&&!ArrayBuffer.isView(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const RULES=freeze({mode:'campaign',locationId:'alpha_stage_1',rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'});
const ARENA=freeze({halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500});
function decodeKey(env,{enabledName,approvalName,keyIdName,keyName,label}){
  if(env[enabledName]!=='true')return null;
  if(env[approvalName]!=='true')throw new TypeError(`${label} staging approval missing`);
  const keyId=env[keyIdName],b64=env[keyName];
  if(!KEY_ID.test(keyId||'')||typeof b64!=='string'||b64.length<44||b64.length>172||!B64.test(b64))
    throw new TypeError(`${label} HMAC config invalid`);
  const key=Buffer.from(b64,'base64');
  if(key.toString('base64')!==b64||key.length<32||key.length>128)throw new TypeError(`${label} HMAC key invalid`);
  return freeze({keyId,key});
}
function parseC15Rc1bConfig(env){
  if(!env||typeof env!=='object'||Array.isArray(env))throw new TypeError('C15 RC1B explicit environment required');
  if(env.GAME_C15_RC1B_ENABLED!=='true')return null;
  if(env.GAME_C15_RC1B_STAGING_APPROVED!=='true')throw new TypeError('C15 RC1B staging approval missing');
  const raw=env.GAME_C15_RC1B_ALLOW_UIDS;
  if(typeof raw!=='string'||raw.length<1||raw.length>2048)throw new TypeError('C15 RC1B closed allowlist required');
  const uids=raw.split(',').map(x=>x.trim());
  if(uids.length<1||uids.length>10||uids.some(x=>!uidValid(x))||new Set(uids).size!==uids.length)
    throw new TypeError('C15 RC1B UID allowlist invalid');
  const genesis=decodeKey(env,{enabledName:'GAME_C15_RC1B_ENABLED',approvalName:'GAME_C15_RC1B_STAGING_APPROVED',
    keyIdName:'GAME_C15_RC1B_HMAC_KEY_ID',keyName:'GAME_C15_RC1B_HMAC_KEY_B64',label:'C15 RC1B'});
  const outcome=decodeKey(env,{enabledName:'GAME_C15_RC2_OUTCOME_ENABLED',approvalName:'GAME_C15_RC2_OUTCOME_STAGING_APPROVED',
    keyIdName:'GAME_C15_RC2_OUTCOME_HMAC_KEY_ID',keyName:'GAME_C15_RC2_OUTCOME_HMAC_KEY_B64',label:'C15 RC2 outcome'});
  return freeze({uids,keyId:genesis.keyId,key:genesis.key,outcome});
}
function disabled(){
  const block=()=>{throw new GameError('C15_RC1B_DISABLED','C15 RC1B runtime disabled',423);};
  return freeze({enabled:false,open:block,upload:block,status:block,finalize:block,abandon:block,
    nonEconomic:true,settlementEnabled:false,rc2OutcomeEnabled:false});
}
function createC15Rc1bRuntimeV1({db,enabled=false,allowedUids=[],signingKeyId,signingKey,
  verificationKeys,resourceCatalog,now=Date.now,uuidFactory=crypto.randomUUID,
  randomSeed=()=>crypto.randomInt(1,0x100000000),catalogModule,schemaModule,
  outcomeEnabled=false,outcomeSigningKeyId,outcomeSigningKey,outcomeVerificationKeys}={}){
  if(enabled!==true)return Promise.resolve(disabled());
  const outcomeValid=outcomeEnabled!==true||(KEY_ID.test(outcomeSigningKeyId||'')&&Buffer.isBuffer(outcomeSigningKey)
    &&outcomeSigningKey.length>=32&&outcomeSigningKey.length<=128&&outcomeVerificationKeys instanceof Map
    &&Buffer.isBuffer(outcomeVerificationKeys.get(outcomeSigningKeyId))
    &&outcomeSigningKey.equals(outcomeVerificationKeys.get(outcomeSigningKeyId)));
  if(!db||typeof db.runTransaction!=='function'||!Array.isArray(allowedUids)||allowedUids.length<1
    ||allowedUids.length>10||new Set(allowedUids).size!==allowedUids.length||allowedUids.some(x=>!uidValid(x))
    ||!KEY_ID.test(signingKeyId||'')||!Buffer.isBuffer(signingKey)||signingKey.length<32||signingKey.length>128
    ||!(verificationKeys instanceof Map)||!Buffer.isBuffer(verificationKeys.get(signingKeyId))
    ||!signingKey.equals(verificationKeys.get(signingKeyId))||!resourceCatalog?.manifest
    ||typeof resourceCatalog.getDescriptor!=='function'||typeof now!=='function'||typeof uuidFactory!=='function'
    ||!outcomeValid)
    throw new TypeError('C15 RC1B explicit Firestore, allowlist, resource catalog and HMAC rings required');
  verifyResourceManifestV1(resourceCatalog.manifest);
  return Promise.all([
    catalogModule?Promise.resolve(catalogModule):import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    schemaModule?Promise.resolve(schemaModule):import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href),
  ]).then(([catalog,schema])=>{
    const allow=new Set(allowedUids),keyRing={[signingKeyId]:signingKey};
    const outcomeKeyRing=outcomeEnabled?{[outcomeSigningKeyId]:outcomeSigningKey}:null;
    const userRef=uid=>db.collection('users').doc(uid);
    const jobRef=uid=>db.collection('accountDeletionJobs').doc(uid);
    const activeRef=uid=>userRef(uid).collection('c15Rc1bSessions').doc('current');
    const originRef=(uid,bid)=>userRef(uid).collection('c15Rc1bOrigins').doc(bid);
    const resultRef=(uid,bid)=>userRef(uid).collection('c15Rc1bResults').doc(bid);
    const outcomeRef=(uid,bid)=>userRef(uid).collection('c15Rc2Outcomes').doc(bid);
    const chunksRef=(uid,bid)=>userRef(uid).collection('c15Rc1bTrace').doc(bid).collection('chunks');
    const chunkRef=(uid,bid,start)=>chunksRef(uid,bid).doc(String(start).padStart(6,'0'));
    const clock=()=>{const value=now();if(!safeInt(value,1,Number.MAX_SAFE_INTEGER-TTL_MS))throw new Error('C15 RC1B clock invalid');return value;};
    function actor(uid,sid){
      if(!uidValid(uid)||!UUID.test(sid||''))throw new GameError('C15_RC1B_ACTOR_INVALID','Invalid C15 actor',401);
      if(!allow.has(uid))throw new GameError('C15_RC1B_NOT_ALLOWED','C15 RC1B UID not allowlisted',403);
    }
    function profile(user,job,sid){
      if(!user.exists)throw new GameError('PROFILE_NOT_FOUND','Profile not initialized',404);
      const data=user.data();assertAccountActive(data);
      if(job.exists)throw new GameError('ACCOUNT_DELETION_PENDING','Account deletion pending',423);
      if(data.sessionId!==sid)throw new GameError('SESSION_EXPIRED','Account session changed',401);
      return data;
    }
    function active(doc,uid,sid,bid,at,{live=true}={}){
      if(!doc.exists)throw new GameError('C15_RC1B_SESSION_MISSING','C15 battle session missing',404);
      const value=doc.data();
      if(value.version!==VERSION||value.uid!==uid||value.sessionId!==sid||value.battleId!==bid
        ||value.nonEconomic!==true||value.safeForSettlement!==false||!PHASES.has(value.phase)
        ||!safeInt(value.uploadedThroughTick,0,MAX_TICKS)||!safeInt(value.chunkCount,0,MAX_CHUNKS)
        ||(value.controlProfileId!==undefined&&typeof value.controlProfileId!=='string')
        ||(value.controlProfileDigest!==undefined&&!HEX.test(value.controlProfileDigest||'')))
        throw new GameError('C15_RC1B_SESSION_INVALID','C15 battle session invalid',409);
      if(live&&value.abandonedAtMs!==undefined)throw new GameError('C15_RC1B_ABANDONED','C15 battle abandoned',410);
      if(live&&at>=value.expiresAtMs)throw new GameError('C15_RC1B_EXPIRED','C15 battle expired',410);
      return value;
    }
    function response(session,origin,{duplicate=false,result=null,outcome=null}={}){
      const control=resolveC15ControlProfileForPolicy(origin.policy);
      if(session.controlProfileId!==undefined&&(session.controlProfileId!==control.id
        ||session.controlProfileDigest!==control.profileDigest))
        throw new GameError('C15_RC1B_CONTROL_CHANGED','C15 control profile binding changed',409);
      return freeze({version:VERSION,battleId:session.battleId,duplicate,issuedAtMs:session.issuedAtMs,
        expiresAtMs:session.expiresAtMs,uploadedThroughTick:session.uploadedThroughTick,
        chunkCount:session.chunkCount,phase:session.phase,genesis:origin.genesis,
        runtime:freeze({snapshot:origin.snapshot,encounter:origin.encounter,policy:origin.policy}),
        controlProfile:control,resourceManifest:resourceCatalog.manifest,result,outcome,
        rc1bOnly:true,rc2OutcomeEnabled:outcomeEnabled===true,nonEconomic:true,
        safeForSettlement:false,settlementEnabled:false,cloudRewards:false});
    }
    async function open(uid,sid,body){
      actor(uid,sid);
      const four=['stageId','requestId','appVersion','quality'];
      const five=[...four,'controlProfileId'];
      if(!(exact(body,four)||exact(body,five))||body.stageId!=='alpha-stage-1'
        ||!REQUEST.test(body.requestId||'')||typeof body.appVersion!=='string'||body.appVersion.length<3||body.appVersion.length>40
        ||!['mobile-low','mobile-high'].includes(body.quality))
        throw new GameError('C15_RC1B_OPEN_INVALID','Invalid C15 RC1B open request',400);
      let control;try{control=resolveC15ControlProfile(body.controlProfileId||DEFAULT_PROFILE_ID);}catch(error){
        throw new GameError('C15_RC1B_CONTROL_INVALID',error.message,400);}
      const policy=createC15MovementPolicy(control.id);
      const at=clock(),battleId=uuidFactory(),seed=randomSeed();
      if(!UUID.test(battleId||'')||!safeInt(seed,1,0xffffffff))throw new Error('C15 RC1B server ID/seed invalid');
      return db.runTransaction(async t=>{
        const [user,job,previous]=await Promise.all([t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid))]);
        const data=profile(user,job,sid);
        if(previous.exists){
          const old=previous.data();
          if(old.uid===uid&&old.sessionId===sid&&old.requestId===body.requestId){
            const current=active(previous,uid,sid,old.battleId,at,{live:false});
            const originSnap=await t.get(originRef(uid,current.battleId));
            if(!originSnap.exists)throw new GameError('C15_RC1B_ORIGIN_MISSING','C15 origin missing',409);
            const origin=originSnap.data();verifyC15CommercialOriginV1(origin,keyRing);
            const priorControl=resolveC15ControlProfileForPolicy(origin.policy);
            if(priorControl.id!==control.id)throw new GameError('C15_RC1B_RETRY_CHANGED','C15 open retry changed control profile',409);
            let result=null,outcome=null;
            if(current.phase==='finalized'){
              const [resultSnap,outcomeSnap]=await Promise.all([t.get(resultRef(uid,current.battleId)),t.get(outcomeRef(uid,current.battleId))]);
              result=resultSnap.exists?resultSnap.data():null;outcome=outcomeSnap.exists?outcomeSnap.data():null;
            }
            return response(current,origin,{duplicate:true,result,outcome});
          }
          if(old.sessionId===sid&&old.phase==='active'&&old.expiresAtMs>at&&old.abandonedAtMs===undefined)
            throw new GameError('C15_RC1B_ACTIVE','A C15 local battle is already active',409);
        }
        const snapshot=createServerBattleSnapshot({identity:{uid,sessionId:sid,battleId,issuedAtMs:at,expiresAtMs:at+TTL_MS},
          persistedProfile:{campaignData:schema.restoreProfileDocument(data).campaignData},approvedCatalog:catalog,
          rules:RULES,arena:ARENA,seed});
        const encounter=resolveCampaignAlphaStage1C6E({snapshot});
        const origin=createC15CommercialOriginV1({snapshot,encounter,policy,
          resourceManifest:resourceCatalog.manifest,selectedResourcePackIds:['core-bootstrap','campaign-alpha-mobile-low'],
          keyId:signingKeyId,key:signingKey,issuedAtMs:at,expiresAtMs:at+TTL_MS});
        const session=freeze({version:VERSION,uid,sessionId:sid,battleId,requestId:body.requestId,
          issuedAtMs:at,expiresAtMs:at+TTL_MS,uploadedThroughTick:0,chunkCount:0,phase:'active',
          originDigest:origin.originDigest,controlProfileId:control.id,controlProfileDigest:control.profileDigest,
          updatedAtMs:at,nonEconomic:true,safeForSettlement:false});
        t.create(originRef(uid,battleId),origin);t.set(activeRef(uid),session);
        return response(session,origin);
      });
    }
    async function upload(uid,sid,body){
      actor(uid,sid);
      if(!exact(body,['battleId','chunk'])||!UUID.test(body.battleId||''))
        throw new GameError('C15_RC1B_UPLOAD_INVALID','Invalid C15 journal upload',400);
      const checked=validateChunk(body.chunk),at=clock();
      if(checked.battleId!==body.battleId||checked.endTick>MAX_TICKS)
        throw new GameError('C15_RC1B_UPLOAD_INVALID','C15 journal identity invalid',400);
      return db.runTransaction(async t=>{
        const ref=chunkRef(uid,body.battleId,checked.startTick);
        const [user,job,sessionSnap,originSnap,existing]=await Promise.all([
          t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid)),t.get(originRef(uid,body.battleId)),t.get(ref)]);
        profile(user,job,sid);const session=active(sessionSnap,uid,sid,body.battleId,at);
        if(session.phase!=='active')throw new GameError('C15_RC1B_SESSION_CLOSED','C15 battle is no longer active',409);
        if(!originSnap.exists)throw new GameError('C15_RC1B_ORIGIN_MISSING','C15 origin missing',409);
        const origin=originSnap.data();verifyC15CommercialOriginV1(origin,keyRing);
        if(origin.originDigest!==session.originDigest)throw new GameError('C15_RC1B_ORIGIN_CHANGED','C15 origin changed',409);
        if(existing.exists){
          const prior=existing.data();
          if(prior.chunkDigest!==checked.chunkDigest||prior.endTick!==checked.endTick)
            throw new GameError('C15_RC1B_RETRY_CHANGED','C15 retry changed an accepted chunk',409);
          return freeze({version:VERSION,battleId:body.battleId,startTick:checked.startTick,
            endTick:checked.endTick,duplicate:true,uploadedThroughTick:session.uploadedThroughTick,
            chunkCount:session.chunkCount,nonEconomic:true});
        }
        if(checked.startTick!==session.uploadedThroughTick)
          throw new GameError('C15_RC1B_SEQUENCE','C15 journal chunk missing or reordered',409);
        if(session.chunkCount>=MAX_CHUNKS)throw new GameError('C15_RC1B_CHUNK_LIMIT','C15 journal chunk limit reached',409);
        const stored=freeze({version:'c15-rc1b-chunk-v1',battleId:body.battleId,startTick:checked.startTick,
          endTick:checked.endTick,frames:body.chunk.frames.map(frame=>freeze({x:frame.x,z:frame.z})),
          chunkDigest:checked.chunkDigest,receivedAtMs:at});
        const next=freeze({...session,uploadedThroughTick:checked.endTick,chunkCount:session.chunkCount+1,updatedAtMs:at});
        t.create(ref,stored);t.set(activeRef(uid),next);
        return freeze({version:VERSION,battleId:body.battleId,startTick:checked.startTick,endTick:checked.endTick,
          duplicate:false,uploadedThroughTick:next.uploadedThroughTick,chunkCount:next.chunkCount,nonEconomic:true});
      });
    }
    async function status(uid,sid){
      actor(uid,sid);const at=clock();
      const [user,job,sessionSnap]=await Promise.all([userRef(uid).get(),jobRef(uid).get(),activeRef(uid).get()]);
      profile(user,job,sid);const session=active(sessionSnap,uid,sid,sessionSnap.data()?.battleId,at,{live:false});
      const originSnap=await originRef(uid,session.battleId).get();
      if(!originSnap.exists)throw new GameError('C15_RC1B_ORIGIN_MISSING','C15 origin missing',409);
      const origin=originSnap.data();verifyC15CommercialOriginV1(origin,keyRing);
      let result=null,outcome=null;if(session.phase==='finalized'){
        const [resultSnap,outcomeSnap]=await Promise.all([resultRef(uid,session.battleId).get(),outcomeRef(uid,session.battleId).get()]);
        result=resultSnap.exists?resultSnap.data():null;outcome=outcomeSnap.exists?outcomeSnap.data():null;
        if(outcome)verifyC15TrustedOutcomeV1(outcome,outcomeKeyRing,{uid,sessionId:sid,battleId:session.battleId});
      }
      return response(session,origin,{result,outcome});
    }
    async function finalize(uid,sid,body){
      actor(uid,sid);
      if(!exact(body,['battleId'])||!UUID.test(body.battleId||''))
        throw new GameError('C15_RC1B_FINALIZE_INVALID','Invalid C15 finalize request',400);
      const at=clock();
      const [user,job,sessionSnap,originSnap,existingResult,existingOutcome,traceSnap]=await Promise.all([
        userRef(uid).get(),jobRef(uid).get(),activeRef(uid).get(),originRef(uid,body.battleId).get(),
        resultRef(uid,body.battleId).get(),outcomeRef(uid,body.battleId).get(),
        chunksRef(uid,body.battleId).orderBy('startTick').limit(MAX_CHUNKS+1).get()]);
      profile(user,job,sid);const session=active(sessionSnap,uid,sid,body.battleId,at,{live:false});
      if(session.phase==='abandoned')throw new GameError('C15_RC1B_ABANDONED','C15 battle abandoned',410);
      if(!originSnap.exists)throw new GameError('C15_RC1B_ORIGIN_MISSING','C15 origin missing',409);
      if(traceSnap.docs.length!==session.chunkCount||traceSnap.docs.length<1||traceSnap.docs.length>MAX_CHUNKS)
        throw new GameError('C15_RC1B_TRACE_INCOMPLETE','C15 journal upload is incomplete',409);
      const origin=originSnap.data();verifyC15CommercialOriginV1(origin,keyRing);
      const storedChunks=traceSnap.docs.map(doc=>doc.data());
      const currentJournalRoot=journalRoot(storedChunks);
      const chunks=storedChunks.map(value=>({protocol:'pve-input-v1',battleId:body.battleId,startTick:value.startTick,frames:value.frames}));
      let result;
      if(existingResult.exists){result=existingResult.data();verifyC15CommercialReplayResultV1(result,{battleId:body.battleId,uid,sessionId:sid});}
      else{try{result=replayC15CommercialFoundationV1({origin,chunks,nowMs:at,keyRing});}
        catch(error){throw new GameError('C15_RC1B_REPLAY_REJECTED',error?.message||'C15 replay rejected',409);}}
      let proposedOutcome=null;
      if(outcomeEnabled){proposedOutcome=createC15TrustedOutcomeV1({origin,replayResult:result,chunks:storedChunks,
        keyId:outcomeSigningKeyId,key:outcomeSigningKey,issuedAtMs:at,keyRing});}
      if(existingResult.exists&&(!outcomeEnabled||existingOutcome.exists)){
        const outcome=existingOutcome.exists?existingOutcome.data():null;
        if(outcome)verifyC15TrustedOutcomeV1(outcome,outcomeKeyRing,{uid,sessionId:sid,battleId:body.battleId,
          originDigest:origin.originDigest,journalRootDigest:currentJournalRoot,replayDigest:result.replayDigest,
          stateDigest:result.stateDigest,traceDigest:result.traceDigest,resourceManifestDigest:origin.genesis.resourceManifestDigest});
        return freeze({version:VERSION,battleId:body.battleId,duplicate:true,result,outcome,
          rc2OutcomeEnabled:outcomeEnabled===true,nonEconomic:true,safeForSettlement:false,settlementEnabled:false,cloudRewards:false});
      }
      return db.runTransaction(async t=>{
        const [latest,priorResult,priorOutcome]=await Promise.all([
          t.get(activeRef(uid)),t.get(resultRef(uid,body.battleId)),t.get(outcomeRef(uid,body.battleId))]);
        const current=active(latest,uid,sid,body.battleId,at,{live:false});
        if(current.phase!=='active'&&current.phase!=='finalized')
          throw new GameError('C15_RC1B_FINALIZE_RETRY','C15 session changed during finalize',409);
        if(current.chunkCount!==session.chunkCount||current.uploadedThroughTick!==session.uploadedThroughTick
          ||current.originDigest!==session.originDigest)
          throw new GameError('C15_RC1B_FINALIZE_RETRY','C15 journal changed during finalize; retry required',409);
        const savedResult=priorResult.exists?priorResult.data():result;
        verifyC15CommercialReplayResultV1(savedResult,{battleId:body.battleId,uid,sessionId:sid});
        if(!priorResult.exists)t.create(resultRef(uid,body.battleId),savedResult);
        let savedOutcome=null;
        if(outcomeEnabled){
          savedOutcome=priorOutcome.exists?priorOutcome.data():proposedOutcome;
          verifyC15TrustedOutcomeV1(savedOutcome,outcomeKeyRing,{uid,sessionId:sid,battleId:body.battleId,
            originDigest:origin.originDigest,journalRootDigest:currentJournalRoot,replayDigest:savedResult.replayDigest,
            stateDigest:savedResult.stateDigest,traceDigest:savedResult.traceDigest,
            resourceManifestDigest:origin.genesis.resourceManifestDigest});
          if(!priorOutcome.exists)t.create(outcomeRef(uid,body.battleId),savedOutcome);
        }
        const finalSession=freeze({...current,phase:'finalized',finalizedAtMs:current.finalizedAtMs??at,
          outcomeDigest:savedOutcome?.outcomeDigest??current.outcomeDigest??null,updatedAtMs:at});
        t.set(activeRef(uid),finalSession);
        return freeze({version:VERSION,battleId:body.battleId,duplicate:priorResult.exists,
          result:savedResult,outcome:savedOutcome,rc2OutcomeEnabled:outcomeEnabled===true,
          nonEconomic:true,safeForSettlement:false,settlementEnabled:false,cloudRewards:false});
      });
    }
    async function abandon(uid,sid,body){
      actor(uid,sid);
      if(!exact(body,['battleId'])||!UUID.test(body.battleId||''))throw new GameError('C15_RC1B_ABANDON_INVALID','Invalid C15 abandon request',400);
      const at=clock();return db.runTransaction(async t=>{
        const [user,job,sessionSnap]=await Promise.all([t.get(userRef(uid)),t.get(jobRef(uid)),t.get(activeRef(uid))]);
        profile(user,job,sid);const session=active(sessionSnap,uid,sid,body.battleId,at,{live:false});
        if(session.abandonedAtMs!==undefined)return freeze({version:VERSION,battleId:body.battleId,duplicate:true,nonEconomic:true});
        t.set(activeRef(uid),freeze({...session,phase:'abandoned',abandonedAtMs:at,updatedAtMs:at}));
        return freeze({version:VERSION,battleId:body.battleId,duplicate:false,nonEconomic:true});
      });
    }
    return freeze({version:VERSION,enabled:true,open,upload,status,finalize,abandon,
      rc1bOnly:true,rc2OutcomeEnabled:outcomeEnabled===true,nonEconomic:true,
      safeForSettlement:false,settlementEnabled:false});
  });
}
async function createC15Rc1bStagingRuntime({db,env={},resourceCatalog,catalogModule,schemaModule,now,uuidFactory,randomSeed}={}){
  const config=parseC15Rc1bConfig(env);if(!config)return disabled();
  return createC15Rc1bRuntimeV1({db,enabled:true,allowedUids:config.uids,signingKeyId:config.keyId,
    signingKey:config.key,verificationKeys:new Map([[config.keyId,config.key]]),resourceCatalog,
    outcomeEnabled:Boolean(config.outcome),outcomeSigningKeyId:config.outcome?.keyId,outcomeSigningKey:config.outcome?.key,
    outcomeVerificationKeys:config.outcome?new Map([[config.outcome.keyId,config.outcome.key]]):undefined,
    catalogModule,schemaModule,now,uuidFactory,randomSeed});
}
module.exports=freeze({VERSION,TTL_MS,parseC15Rc1bConfig,createC15Rc1bRuntimeV1,createC15Rc1bStagingRuntime});
