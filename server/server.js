'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { createGameService } = require('./lib/gameService.cjs');
const { GameError } = require('./lib/economy.cjs');

function createApp(clientPath=path.join(__dirname,'..','client','dist'), options={}) {
  const app=express();
  app.disable('x-powered-by');
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
    }
    if (req.method==='OPTIONS') return res.sendStatus(204);
    next();
  });
  const apiReady=Boolean(options.auth && options.service);
  const withAuth = fn => async(req,res,next)=>{
    if(!apiReady) return res.status(503).json({ok:false,code:'GAME_API_UNAVAILABLE',message:'Protected game API not configured'});
    try {
      const header=req.get('authorization')||'';
      if (!/^Bearer [A-Za-z0-9_.-]{20,}$/.test(header)) throw new GameError('UNAUTHORIZED','Firebase ID token required',401);
      const decoded=await options.auth.verifyIdToken(header.slice(7),true);
      if (!decoded.uid) throw new GameError('UNAUTHORIZED','Invalid ID token',401);
      const result=await fn(req,decoded);
      return res.status(200).json({ok:true,...result});
    }catch(e){next(e);}
  };
  app.post('/api/v1/session',withAuth((_req,user)=>options.service.openSession(user)));
  app.get('/api/v1/profile',withAuth((req,user)=>options.service.getProfile(user.uid,req.get('x-game-session'))));
  app.post('/api/v1/command',withAuth((req,user)=>options.service.apply(user.uid,req.get('x-game-session'),req.body||{})));
  app.post('/api/v1/profile/name',withAuth((req,user)=>options.service.changeName(user.uid,req.get('x-game-session'),req.body?.name)));
  app.post('/api/v1/account/delete',withAuth(async (req,user)=>{
    // Destructive operation: require reauthentication within the last 5 minutes.
    if (!Number.isFinite(user.auth_time) || Math.floor(Date.now()/1000)-user.auth_time > 300) {
      throw new GameError('REAUTH_REQUIRED','Sign in again before deleting the account',403);
    }
    await options.service.getProfile(user.uid,req.get('x-game-session'));
    if (!options.admin) throw new GameError('NOT_AVAILABLE','Account deletion not configured',503);
    await options.admin.firestore().recursiveDelete(options.admin.firestore().collection('users').doc(user.uid));
    await options.admin.auth().deleteUser(user.uid);
    return {deleted:true};
  }));
  app.use('/api',(req,res)=>res.status(404).json({ok:false,code:'NOT_FOUND'}));
  app.use(express.static(clientPath,{index:'index.html',fallthrough:true}));
  app.get('*',(_req,res,next)=>{
    const indexPath=path.join(clientPath,'index.html');
    if(!fs.existsSync(indexPath)) return res.status(503).json({ok:false,message:'Client build missing. Run npm run build in client/.'});
    res.sendFile(indexPath,error=>error&&next(error));
  });
  app.use((err,_req,res,_next)=>{
    const status=err instanceof GameError?err.status:err.code==='auth/id-token-revoked'?401:500;
    const code=err instanceof GameError?err.code:status===401?'UNAUTHORIZED':'INTERNAL_ERROR';
    if(status===500) console.error('Game API failure:',err);
    res.status(status).json({ok:false,code,message:status===500?'Server error':err.message});
  });
  return app;
}
async function start() {
  const port=Number(process.env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
  let service=null,auth=null,admin=null;
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
  }
  const app=createApp(undefined,{service,auth,admin,allowLocalOrigin:process.env.NODE_ENV!=='production'});
  app.listen(port,'0.0.0.0',()=>console.log(`Space Fighter Phase 1 listening on ${port}; API ${service?'enabled':'disabled'}`));
}
if(require.main===module) start().catch(e=>{console.error('Server startup failed:',e);process.exitCode=1;});
module.exports={createApp,start};
