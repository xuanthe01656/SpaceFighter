'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const {performance} = require('node:perf_hooks');
require('dotenv').config();
const { createGameService } = require('./lib/gameService.cjs');
const { GameError } = require('./lib/economy.cjs');
const { classifyGameApiError } = require('./lib/httpError.cjs');
const { createAccountDeletionService } = require('./lib/accountDeletion.cjs');

function createApp(clientPath=path.join(__dirname,'..','client','dist'), options={}) {
  const app=express();
  app.disable('x-powered-by');
  if(typeof app.set==='function')app.set('trust proxy',1);
  app.use((_req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    next();
  });
  app.use(express.json({limit:'16kb'}));
  app.get('/ping',(_req,res)=>res.status(200).type('text/plain').send('pong'));
  app.get('/health',(_req,res)=>res.status(200).json({ok:true,service:'space-fighter',phase:1,apiReady:Boolean(options.service)}));

  // In production only allow the exact approved Origins, not CORS('*').
  const allowedOrigins=(process.env.GAME_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  app.use('/api/v1',(req,res,next)=>{
    const origin=req.headers.origin;
    if (origin && !allowedOrigins.includes(origin) && !(options.allowLocalOrigin && /^(https?:\/\/localhost:\d+|capacitor:\/\/localhost|https:\/\/localhost)$/.test(origin))) {
      return res.status(403).json({ok:false,code:'ORIGIN_NOT_ALLOWED'});
    }
    if (origin && (allowedOrigins.includes(origin) || (options.allowLocalOrigin && /^(https?:\/\/localhost:\d+|capacitor:\/\/localhost|https:\/\/localhost)$/.test(origin)))) {
      res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-Game-Session');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      // The preflight cache is independent of the HTTP response cache. Keep
      // ordinary API responses no-store and cache ONLY the allowlisted C12
      // input preflight (not the token, ticket or game state).
      if(req.method==='OPTIONS' && req.path==='/candidate/battle/input'){
        res.setHeader('Access-Control-Max-Age','600');
      }
      if(req.method==='OPTIONS'){
        res.setHeader('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      }
    }
    if (req.method==='OPTIONS') return res.sendStatus(204);
    next();
  });
  const apiReady=Boolean(options.auth && options.service);
  const c12PerfEnabled=options.candidateEnabled===true && options.candidatePerfEnabled===true;
  const c12PerfSink=typeof options.candidatePerfSink==='function'
    ?options.candidatePerfSink : event=>console.info(JSON.stringify(event));
  // Telemetry is opt-in, numeric-only and never allowed to break requests.
  const emitC12Perf=event=>{try{c12PerfSink(Object.freeze(event));}catch(_){/* observability only */}};
  const roundMs=value=>Math.round(Math.max(0,value)*1000)/1000;
  const withAuth = (fn, successStatus=200) => async(req,res,next)=>{
    if(!apiReady) return res.status(503).json({ok:false,code:'GAME_API_UNAVAILABLE',message:'Protected game API not configured'});
    const measure=c12PerfEnabled && req.method==='POST'
      && req.path==='/api/v1/candidate/battle/input';
    const started=measure?performance.now():0;
    let authMs=null,serviceMs=null,outcome='error',responseStatus=500;
    try {
      const header=req.get('authorization')||'';
      if (!/^Bearer [A-Za-z0-9_.-]{20,}$/.test(header)) throw new GameError('UNAUTHORIZED','Firebase ID token required',401);
      const authStart=measure?performance.now():0;
      let decoded;
      try{decoded=await options.auth.verifyIdToken(header.slice(7),true);}
      finally{if(measure)authMs=roundMs(performance.now()-authStart);}
      if (!decoded.uid) throw new GameError('UNAUTHORIZED','Invalid ID token',401);
      const serviceStart=measure?performance.now():0;
      let result;
      try{result=await fn(req,decoded);}
      finally{if(measure)serviceMs=roundMs(performance.now()-serviceStart);}
      outcome='ok';responseStatus=successStatus;
      return res.status(successStatus).json({ok:true,...result});
    }catch(e){responseStatus=classifyGameApiError(e).status;next(e);}
    finally{
      if(measure)emitC12Perf({event:'sf.c12.input.http.v1',outcome,
        status:responseStatus,authVerifyMs:authMs,serviceMs,
        totalMs:roundMs(performance.now()-started)});
    }
  };
  app.post('/api/v1/session',withAuth((_req,user)=>options.service.openSession(user)));
  app.get('/api/v1/profile',withAuth((req,user)=>options.service.getProfile(user.uid,req.get('x-game-session'))));
  app.post('/api/v1/command',withAuth((req,user)=>options.service.apply(user.uid,req.get('x-game-session'),req.body||{})));
  // C15-RC1B immutable visual resources. These routes contain no secrets or
  // gameplay authority. Pack URLs are versioned and cacheable; the manifest
  // remains no-store so the operator may roll forward/rollback atomically.
  const c15ResourceReady=Boolean(options.c15ResourceCatalog?.manifest);
  app.get('/api/v1/c15/resources/manifest',(req,res)=>{
    if(!c15ResourceReady)return res.status(503).json({ok:false,code:'C15_RESOURCES_UNAVAILABLE'});
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ok:true,manifest:options.c15ResourceCatalog.manifest});
  });
  app.get('/api/v1/c15/resources/packs/:id/v:revision/descriptor.json',(req,res)=>{
    if(!c15ResourceReady)return res.status(503).json({ok:false,code:'C15_RESOURCES_UNAVAILABLE'});
    const revision=Number(req.params.revision);
    const found=options.c15ResourceCatalog.getDescriptor(req.params.id,revision);
    if(!found)return res.status(404).json({ok:false,code:'C15_RESOURCE_NOT_FOUND'});
    res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.setHeader('ETag',`"${found.sha256}"`);
    res.type('application/json').status(200).send(found.bytes);
  });
  app.get('/api/v1/c15/resources/packs/:id/v:revision/files/*',(req,res)=>{
    if(!c15ResourceReady)return res.status(503).json({ok:false,code:'C15_RESOURCES_UNAVAILABLE'});
    const revision=Number(req.params.revision),relative=req.params[0]||'';
    const found=options.c15ResourceCatalog.getFile(req.params.id,revision,relative);
    if(!found)return res.status(404).json({ok:false,code:'C15_RESOURCE_NOT_FOUND'});
    const range=req.get('range');
    let start=0,end=found.sizeBytes-1,status=200;
    if(range){
      const match=/^bytes=(\d+)-(\d*)$/.exec(range);
      if(!match)return res.status(416).end();
      start=Number(match[1]);end=match[2]?Number(match[2]):end;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=found.sizeBytes)
        return res.status(416).setHeader('Content-Range',`bytes */${found.sizeBytes}`).end();
      end=Math.min(end,found.sizeBytes-1);status=206;
      res.setHeader('Content-Range',`bytes ${start}-${end}/${found.sizeBytes}`);
      res.setHeader('Accept-Ranges','bytes');
    }
    res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.setHeader('ETag',`"${found.sha256}"`);
    res.setHeader('Content-Type',found.contentType);
    res.setHeader('Content-Length',String(end-start+1));
    return require('fs').createReadStream(found.absolute,{start,end}).pipe(res.status(status));
  });
  // C15-RC1B: local deterministic gameplay with background journal upload and
  // independent replay. This staging lane is allowlisted and NON-ECONOMIC.
  const c15Ready=options.c15Rc1bEnabled===true&&Boolean(options.c15Rc1bService?.enabled);
  const withC15=fn=>async(req,res,next)=>{
    if(!c15Ready)return res.status(503).json({ok:false,code:'C15_RC1B_DISABLED'});
    return withAuth(fn)(req,res,next);
  };
  app.post('/api/v1/c15/battle/open',withC15((req,user)=>options.c15Rc1bService.open(
    user.uid,req.get('x-game-session'),req.body)));
  app.post('/api/v1/c15/battle/chunk',withC15((req,user)=>options.c15Rc1bService.upload(
    user.uid,req.get('x-game-session'),req.body)));
  app.get('/api/v1/c15/battle/status',withC15((req,user)=>options.c15Rc1bService.status(
    user.uid,req.get('x-game-session'))));
  app.post('/api/v1/c15/battle/finalize',withC15((req,user)=>options.c15Rc1bService.finalize(
    user.uid,req.get('x-game-session'),req.body)));
  app.post('/api/v1/c15/battle/abandon',withC15((req,user)=>options.c15Rc1bService.abandon(
    user.uid,req.get('x-game-session'),req.body)));
  // C7-A: isolated, default-OFF, allowlisted QA replay. NEVER legacy battle.start/finish.
  // No energy, rewards, missions, progress or economy mutation in these routes.
  const qaReady=options.qaBattleEnabled===true && Boolean(options.qaBattleService);
  const withQa=(fn)=>async(req,res,next)=>{
    if(!qaReady)return res.status(503).json({ok:false,code:'QA_BATTLE_DISABLED'});
    return withAuth(fn)(req,res,next);
  };
  app.post('/api/v1/qa/battle/open',withQa((req,user)=>options.qaBattleService.open(
    user.uid,req.get('x-game-session'),req.body)));
  app.post('/api/v1/qa/battle/input',withQa((req,user)=>options.qaBattleService.ingest(
    user.uid,req.get('x-game-session'),req.body)));
  app.post('/api/v1/qa/battle/abandon',withQa((req,user)=>options.qaBattleService.abandon(
    user.uid,req.get('x-game-session'),req.body)));
  app.get('/api/v1/qa/battle/status',withQa((req,user)=>options.qaBattleService.status(
    user.uid,req.get('x-game-session'))));
  // C7-B1: server-authored, immutable QA-only terminal receipt. No economy writes.
  app.post('/api/v1/qa/battle/receipt',withQa((req,user)=>options.qaBattleService.finalize(
    user.uid,req.get('x-game-session'),req.body)));
  // C7-B2: full genesis-to-terminal QA audit; NEVER a settlement endpoint.
  app.post('/api/v1/qa/battle/audit',withQa((req,user)=>options.qaBattleService.audit(
    user.uid,req.get('x-game-session'),req.body)));
  // C7-C2A: separate, default-OFF READ-ONLY verifier for sealed QA tickets.
  // It never returns a production outcome or invokes economy/settlement.
  const qaVerifierReady=qaReady && options.qaVerifierEnabled===true
    && typeof options.qaVerifierService?.inspect==='function';
  app.post('/api/v1/qa/battle/verify',(req,res,next)=>{
    if(!qaVerifierReady)return res.status(503).json({ok:false,code:'QA_VERIFIER_DISABLED'});
    return withAuth((r,user)=>options.qaVerifierService.inspect(
      user.uid,r.get('x-game-session'),r.body))(req,res,next);
  });
  // C12: completely separate production-namespace CANDIDATE service.
  // Every route is default OFF, Firebase-authenticated, allowlisted, and
  // NON-ECONOMIC. No calls to C10, settlement or legacy battle.finish.
  const candidateReady=options.candidateEnabled===true
    && Boolean(options.candidateService?.enabled);
  const withCandidate=fn=>async(req,res,next)=>{
    if(!candidateReady)return res.status(503).json({ok:false,code:'C12_CANDIDATE_DISABLED'});
    return withAuth(fn)(req,res,next);
  };
  app.post('/api/v1/candidate/battle/open',withCandidate((req,user)=>
    options.candidateService.open(user.uid,req.get('x-game-session'),req.body)));
  app.post('/api/v1/candidate/battle/input',withCandidate((req,user)=>
    options.candidateService.ingest(user.uid,req.get('x-game-session'),req.body)));
  app.get('/api/v1/candidate/battle/status',withCandidate((req,user)=>
    options.candidateService.status(user.uid,req.get('x-game-session'))));
  app.post('/api/v1/candidate/battle/audit',withCandidate((req,user)=>
    options.candidateService.audit(user.uid,req.get('x-game-session'),req.body)));
  app.post('/api/v1/candidate/battle/abandon',withCandidate((req,user)=>
    options.candidateService.abandon(user.uid,req.get('x-game-session'),req.body)));
  app.post('/api/v1/profile/name',withAuth((req,user)=>options.service.changeName(user.uid,req.get('x-game-session'),req.body?.name)));
  // Never run destructive deletion inline with an HTTP request. This remains
  // disabled until a retryable worker has been provisioned and verified.
  app.post('/api/v1/account/delete',(req,res,next)=>{
    if (options.accountDeletionEnabled !== true || !options.accountDeletionService) {
      return res.status(503).json({ok:false,code:'ACCOUNT_DELETION_UNAVAILABLE',
        message:'Account deletion is temporarily unavailable'});
    }
    return withAuth(async (_req,user)=>{
      const age = Math.floor(Date.now()/1000) - user.auth_time;
      if (!Number.isSafeInteger(user.auth_time) || age < 0 || age > 300) {
        throw new GameError('REAUTH_REQUIRED','Sign in again before deleting the account',403);
      }
      return options.accountDeletionService.request(user.uid,req.get('x-game-session'));
    },202)(req,res,next);
  });
  app.use('/api',(req,res)=>res.status(404).json({ok:false,code:'NOT_FOUND'}));
  app.use(express.static(clientPath,{index:'index.html',fallthrough:true}));
  app.get('*',(_req,res,next)=>{
    const indexPath=path.join(clientPath,'index.html');
    if(!fs.existsSync(indexPath)) return res.status(503).json({ok:false,message:'Client build missing. Run npm run build in client/.'});
    res.sendFile(indexPath,error=>error&&next(error));
  });
  app.use((err,_req,res,_next)=>{
    const {status, code, message} = classifyGameApiError(err);
    if(status>=500) console.error('Game API failure:',err);
    res.status(status).json({ok:false,code,message});
  });
  return app;
}
async function start() {
  const port=Number(process.env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
  let service=null,auth=null,admin=null,accountDeletionService=null,qaBattleService=null,qaVerifierService=null,candidateService=null,c15Rc1bService=null,c15ResourceCatalog=null;
  if(process.env.GAME_API_ENABLED==='true') {
    admin=require('firebase-admin');
    if(!admin.apps.length) {
      const projectId=process.env.FIREBASE_PROJECT_ID;
      const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');
      const credential=clientEmail&&privateKey
        ? admin.credential.cert({projectId,clientEmail,privateKey})
        : admin.credential.applicationDefault();
      admin.initializeApp({credential,projectId});
    }
    auth=admin.auth();
    service=await createGameService({db:admin.firestore()});
    // C7-C2A: no unsealed QA tickets from runtime. BOTH an explicit QA flag
    // and closed UID allowlist + server-held HMAC key are required. Malformed
    // QA configuration only disables QA; the protected Game API stays alive.
    // The verifier has an INDEPENDENT OFF-by-default QA flag.
    if(process.env.GAME_BATTLE_QA_ENABLED==='true'){
      try{
        const {createSealedQaRuntimeC7C2}=require('./lib/qaSealedRuntimeC7C2V8.cjs');
        const qa=await createSealedQaRuntimeC7C2({db:admin.firestore(),env:process.env});
        qaBattleService=qa.qaBattleService;
        qaVerifierService=qa.qaVerifierService;
      }catch(_error){
        // Never log secret/config values, and never downgrade to unsealed QA.
        console.error('Non-economic QA routes disabled: invalid sealed QA configuration');
      }
    }
    // C12: a second, independent operator approval is required even when the
    // feature flag is set. Never fall back to QA credentials or an open UID list.
    if(process.env.GAME_C12_CANDIDATE_ENABLED==='true'){
      try{
        const {createCandidateStagingRuntimeC12}=
          require('./lib/productionCandidateRuntimeC12V8.cjs');
        const candidate=await createCandidateStagingRuntimeC12({
          db:admin.firestore(),env:process.env});
        candidateService=candidate.service;
      }catch(_error){
        console.error('C12 non-economic candidate routes disabled: invalid staged runtime configuration');
      }
    }
    if(process.env.GAME_C15_RC1B_PUBLIC_BASE_URL){
      try{
        const {createC15Rc1bResourceCatalog}=require('./lib/c15Rc1bResourceCatalog.cjs');
        c15ResourceCatalog=createC15Rc1bResourceCatalog({
          publicBaseUrl:process.env.GAME_C15_RC1B_PUBLIC_BASE_URL,generatedAtMs:Date.now()});
      }catch(_error){
        console.error('C15 RC1B resource delivery disabled: invalid immutable resource catalog');
      }
    }
    if(process.env.GAME_C15_RC1B_ENABLED==='true'){
      try{
        if(!c15ResourceCatalog)throw new Error('C15 resource catalog unavailable');
        const {createC15Rc1bStagingRuntime}=require('./lib/c15Rc1bRuntimeV1.cjs');
        c15Rc1bService=await createC15Rc1bStagingRuntime({db:admin.firestore(),env:process.env,
          resourceCatalog:c15ResourceCatalog});
      }catch(_error){
        console.error('C15 RC1B non-economic runtime disabled: invalid staged configuration');
      }
    }
    if (process.env.GAME_ACCOUNT_DELETION_ENABLED==='true' &&
        process.env.GAME_ACCOUNT_DELETION_WORKER_READY==='true') {
      accountDeletionService=createAccountDeletionService({db:admin.firestore(),auth});
    }
  }
  const app=createApp(undefined,{service,auth,admin,
    accountDeletionService, accountDeletionEnabled:Boolean(accountDeletionService),
    qaBattleService,qaBattleEnabled:Boolean(qaBattleService),
    qaVerifierService,qaVerifierEnabled:Boolean(qaVerifierService),
    candidateService,candidateEnabled:Boolean(candidateService),
    candidatePerfEnabled:process.env.GAME_C12_PERF_LOG_ENABLED==='true',
    c15Rc1bService,c15Rc1bEnabled:Boolean(c15Rc1bService),c15ResourceCatalog,
    allowLocalOrigin:process.env.NODE_ENV!=='production'});
  app.listen(port,'0.0.0.0',()=>console.log(`Space Fighter Phase 1 listening on ${port}; API ${service?'enabled':'disabled'}`));
}
if(require.main===module) start().catch(e=>{console.error('Server startup failed:',e);process.exitCode=1;});
module.exports={createApp,start};
