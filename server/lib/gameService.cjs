'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { executeCommand, updateMissions, GameError } = require('./economy.cjs');
const uuid = () => crypto.randomUUID();
const normalizeSession = s => typeof s==='string' && /^[a-f0-9-]{36}$/.test(s);
const normalizeRequestId = s => typeof s==='string' && /^[a-zA-Z0-9_-]{12,80}$/.test(s);
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function createGameService({ db, now=Date.now, rng, uuidFactory=uuid, configModule, schemaModule }) {
  // Use the *same catalogs* in server and client. In production deploy the
  // client/src constants and profileSchema alongside the server.
  const config = configModule || await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
  const schema = schemaModule || await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href);
  const userRef = uid => db.collection('users').doc(uid);
  // Read-only session/profile presentation: restore verified attendance floors
  // even when the profile has stale legacy mission period keys. This does NOT
  // write Firestore, issue rewards, or pull historic counts from a streak.
  const present = doc => {
    const state = schema.restoreProfileDocument(doc);
    updateMissions(state, now(), config);
    return {
      ...state,
      schemaVersion: doc.schemaVersion || 2,
      sessionId: doc.sessionId || '',
      activeBattle: doc.activeBattle || null,
    };
  };
  function hydrate(raw) {
    const restored = schema.restoreProfileDocument(raw);
    const doc = structuredClone(raw);
    doc.wallet = { ...raw.wallet, coins:restored.coins,diamonds:restored.diamonds,energy:restored.energy,vipPoints:restored.vipPoints };
    doc.campaignData = restored.campaignData;
    return doc;
  }
  function newDocument(user, currentTime) {
    const state = {coins:0,diamonds:0,energy:50,vipPoints:0,myName:user.name||'Player',campaignData:schema.createDefaultCampaignData()};
    return schema.createProfileDocument(state,{displayName:user.name||'Player',photoURL:user.picture||''},currentTime);
  }
  async function openSession(user) {
    const sid=uuidFactory(), uid=user.uid;
    const doc=await db.runTransaction(async t=>{
      const ref=userRef(uid), snap=await t.get(ref);
      const saved=snap.exists ? snap.data() : newDocument(user,now());
      if (!snap.exists) saved.createdAt=now();
      saved.sessionId=sid;
      saved.lastSessionAt=now();
      t.set(ref,saved);
      return saved;
    });
    return { state:present(doc),sessionId:sid };
  }
  const requireSession = (doc,sid) => {
    if (!normalizeSession(sid) || sid !== doc.sessionId) throw new GameError('SESSION_EXPIRED','Signed in on another device or session expired',401);
  };
  async function getProfile(uid,sid) {
    const snap=await userRef(uid).get();
    if (!snap.exists) throw new GameError('PROFILE_NOT_FOUND','Profile not initialized',404);
    requireSession(snap.data(),sid);
    return {state:present(snap.data())};
  }
  async function apply(uid,sid,{command,payload={},requestId}) {
    if (typeof command !== 'string' || command.length>64 || !normalizeRequestId(requestId) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new GameError('INVALID_INPUT','Invalid command request');
    }
    const payloadHash=hash({command,payload});
    const response=await db.runTransaction(async t=>{
      const ref=userRef(uid),opRef=ref.collection('operations').doc(requestId);
      // All reads before writes, required by Firestore transactions.
      const [userSnap,opSnap]=await Promise.all([t.get(ref),t.get(opRef)]);
      if (!userSnap.exists) throw new GameError('PROFILE_NOT_FOUND','Profile not initialized',404);
      const base=userSnap.data();requireSession(base,sid);
      if (opSnap.exists) {
        const op=opSnap.data();
        if (op.payloadHash!==payloadHash) throw new GameError('REQUEST_REUSED','Request ID used for a different command',409);
        return { duplicate:true, state:present(base), extra:op.extra || {} };
      }
      const result=executeCommand(hydrate(base),command,payload,{now:now(),rng,uuid:uuidFactory,config});
      // Keep only small result information for the immutable operation audit.
      const extra=result.extra;
      t.set(ref,result.document);
      t.create(opRef,{ command,payloadHash,createdAt:now(),extra });
      return {duplicate:false,state:present(result.document),extra};
    });
    return response;
  }
  async function changeName(uid,sid,name) {
    if (typeof name!=='string' || name.trim()!==name || name.length<3 || name.length>24 || !/^[\p{L}\p{N}_ .-]+$/u.test(name)) {
      throw new GameError('INVALID_NAME','Name must be 3-24 letters, numbers, spaces or underscore');
    }
    // Exact name uniqueness is NOT yet implemented; do not claim it is unique.
    const updated = await db.runTransaction(async t=>{
      const ref=userRef(uid),snap=await t.get(ref);
      if (!snap.exists) throw new GameError('PROFILE_NOT_FOUND','Profile not initialized',404);
      const data=snap.data();requireSession(data,sid);
      data.profile ||= {};data.profile.displayName=name;
      t.set(ref,data);return data;
    });
    return {state:present(updated)};
  }
  return {openSession,getProfile,apply,changeName,requireSession,present};
}
module.exports={createGameService,normalizeRequestId,normalizeSession};
