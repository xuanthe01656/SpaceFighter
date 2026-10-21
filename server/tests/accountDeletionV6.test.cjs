'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { createGameService } = require('../lib/gameService.cjs');
const { createAccountDeletionService } = require('../lib/accountDeletion.cjs');

let schema, config;
const NOW = Date.parse('2026-10-21T08:00:00Z');
before(async () => {
  schema = await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href);
  config = await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
});
const clone = value => structuredClone(value);
class Ref {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new Ref(this.db, `${this.path}/${id}`); }
  collection(name) { return new Ref(this.db, `${this.path}/${name}`); }
  async get() { return this.db.getSnap(this.path); }
  where(field, op, values) {
    assert.equal(op, '<=');
    return { limit: amount => ({ get: async () => ({ docs: [...this.db.store.entries()]
      .filter(([key, value]) => key.startsWith(`${this.path}/`) && !key.slice(this.path.length+1).includes('/') && typeof value[field] === 'number' && value[field] <= values)
      .slice(0, amount).map(([key]) => ({ id: key.slice(this.path.length+1) })) }) }) };
  }
}
class FakeDb {
  constructor() { this.store = new Map(); this.tail = Promise.resolve(); this.actions = []; this.failDelete = null; }
  collection(name) { return new Ref(this, name); }
  getSnap(key) {
    const found = this.store.has(key);
    return { exists: found, data: () => found ? clone(this.store.get(key)) : undefined };
  }
  async runTransaction(callback) {
    const task = async () => {
      const writes = [];
      const t = {
        get: async ref => this.getSnap(ref.path),
        set: (ref, data) => writes.push(['set', ref.path, clone(data)]),
        create: (ref, data) => writes.push(['create', ref.path, clone(data)]),
      };
      const result = await callback(t);
      for (const [method, key] of writes) if (method === 'create' && this.store.has(key)) throw Error('already exists');
      for (const [, key, data] of writes) this.store.set(key, data);
      return result;
    };
    const promise = this.tail.then(task, task);
    this.tail = promise.catch(() => {});
    return promise;
  }
  async recursiveDelete(ref) {
    this.actions.push('firestore');
    if (this.failDelete === 'before') throw Object.assign(Error('simulated DB outage'), { code: 'DB_OFFLINE' });
    for (const key of [...this.store.keys()]) {
      if (key === ref.path || key.startsWith(`${ref.path}/`)) this.store.delete(key);
    }
    if (this.failDelete === 'after') throw Object.assign(Error('simulated partial cleanup'), { code: 'DB_PARTIAL' });
  }
}
function authStub(db) {
  const deleted = new Set();
  const auth = {
    fail: false, deleted,
    async deleteUser(uid) {
      db.actions.push('auth');
      if (this.fail) throw Object.assign(Error('simulated IAM denied'), { code: 'IAM_DENIED' });
      if (deleted.has(uid)) throw Object.assign(Error('already gone'), { code: 'auth/user-not-found' });
      deleted.add(uid);
    },
  };
  return auth;
}
async function harness(uid='player_a') {
  let tick = NOW;
  const db = new FakeDb();
  const auth = authStub(db);
  const srv = await createGameService({ db, now:()=>tick, schemaModule:schema, configModule:config });
  const session = await srv.openSession({ uid, name: 'Tester' });
  const deletion = createAccountDeletionService({ db, auth, now:()=>tick, newId:()=>`lease-${tick}` });
  return { db, auth, srv, session, deletion, uid,
    advance: ms => { tick += ms; },
    profile: () => db.store.get(`users/${uid}`),
    job: () => db.store.get(`accountDeletionJobs/${uid}`),
  };
}
const hasCode = code => error => error?.code === code;

test('V6 removes inline destructive HTTP deletion and defaults to a closed feature gate', () => {
  const src = fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(src, /\.recursiveDelete\(/);
  assert.doesNotMatch(src, /\.deleteUser\(/);
  assert.match(src, /ACCOUNT_DELETION_UNAVAILABLE/);
  assert.match(src, /GAME_ACCOUNT_DELETION_ENABLED/);
  assert.match(src, /GAME_ACCOUNT_DELETION_WORKER_READY/);
  assert.match(src, /accountDeletionEnabled\s*!==\s*true/);
  assert.match(src, /\},202\)\(req,res,next\)/);
});
test('V6 client only confirms request accepted, never claims deletion already completed', () => {
  const hook = fs.readFileSync(path.resolve(__dirname,'../../client/src/hooks/useAuth.jsx'),'utf8');
  const api = fs.readFileSync(path.resolve(__dirname,'../../client/src/services/gameApi.js'),'utf8');
  assert.match(hook, /reply\?\.deletionPending !== true/);
  assert.match(hook, /auth\.currentUser\?\.uid !== expectedUid/);
  assert.match(hook, /đang được xử lý/);
  assert.match(api, /deleteCloudAccount=expectedUid/);
});
test('request rejects missing or wrong game session without writing anything', async () => {
  const h=await harness();
  const count=h.db.store.size;
  await assert.rejects(() => h.deletion.request(h.uid, 'wrong'), hasCode('SESSION_EXPIRED'));
  assert.equal(h.db.store.size, count);
  assert.equal(h.profile().accountDeletion, undefined);
});
test('request transaction creates both durable job and tombstone, without deletion', async () => {
  const h=await harness();
  const result=await h.deletion.request(h.uid,h.session.sessionId);
  assert.deepEqual(result,{deletionPending:true,duplicate:false});
  assert.equal(h.profile().accountDeletion.status, 'pending');
  assert.equal(h.job().status, 'pending');
  assert.equal(h.job().uid,h.uid);
  assert.deepEqual(h.db.actions,[]);
});
test('duplicate request uses same job; concurrent retries cannot create extra deletion jobs', async () => {
  const h=await harness();
  const [a,b]=await Promise.all([
    h.deletion.request(h.uid,h.session.sessionId), h.deletion.request(h.uid,h.session.sessionId)
  ]);
  assert.equal(Number(a.duplicate)+Number(b.duplicate), 1);
  assert.equal(h.db.store.size,2);
  assert.equal(h.job().attempts,0);
});
test('request cannot delete another account using its session ID', async () => {
  const h=await harness();
  await h.srv.openSession({uid:'other_uid',name:'Other'});
  await assert.rejects(()=>h.deletion.request('other_uid',h.session.sessionId),hasCode('SESSION_EXPIRED'));
  assert.equal(h.db.store.get('users/other_uid').accountDeletion, undefined);
});
test('pending account is locked for openSession/getProfile/command/rename', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  await assert.rejects(()=>h.srv.openSession({uid:h.uid}),hasCode('ACCOUNT_DELETION_PENDING'));
  await assert.rejects(()=>h.srv.getProfile(h.uid,h.session.sessionId),hasCode('ACCOUNT_DELETION_PENDING'));
  await assert.rejects(()=>h.srv.apply(h.uid,h.session.sessionId,{
    command:'attendance.claim',payload:{},requestId:'deleteblock_123456'
  }),hasCode('ACCOUNT_DELETION_PENDING'));
  await assert.rejects(()=>h.srv.changeName(h.uid,h.session.sessionId,'New Name'),hasCode('ACCOUNT_DELETION_PENDING'));
  assert.equal(h.profile().wallet.energy,50);
});
test('tombstone prevents profile resurrection after partial Firestore cleanup', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  h.db.store.delete(`users/${h.uid}`);
  await assert.rejects(()=>h.srv.openSession({uid:h.uid}),hasCode('ACCOUNT_DELETION_PENDING'));
  assert.equal(h.db.store.has(`users/${h.uid}`),false);
});
test('worker without a request cannot delete an account', async () => {
  const h=await harness();
  assert.equal((await h.deletion.processOne(h.uid)).processed,false);
  assert.ok(h.profile());
  assert.deepEqual(h.db.actions,[]);
});
test('worker rejects forged or mismatched job, preserving Auth and Firestore data', async () => {
  const h=await harness();
  h.db.store.set(`accountDeletionJobs/${h.uid}`,{
    version:1,uid:'other_uid',status:'pending',requestedAtMs:NOW,attempts:0,nextAttemptAtMs:NOW
  });
  await assert.rejects(()=>h.deletion.processOne(h.uid),hasCode('ACCOUNT_DELETION_INVALID_JOB'));
  assert.deepEqual(h.db.actions,[]);
});
test('worker rejects job without a matching user tombstone', async () => {
  const h=await harness();
  h.db.store.set(`accountDeletionJobs/${h.uid}`,{
    version:1,uid:h.uid,status:'pending',requestedAtMs:NOW,attempts:0,nextAttemptAtMs:NOW
  });
  await assert.rejects(()=>h.deletion.processOne(h.uid),hasCode('ACCOUNT_DELETION_INVALID_JOB'));
  assert.deepEqual(h.db.actions,[]);
});
test('Firebase Auth failure cannot erase Firestore; job remains retryable', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  h.auth.fail=true;
  await assert.rejects(()=>h.deletion.processOne(h.uid),hasCode('IAM_DENIED'));
  assert.ok(h.profile());
  assert.equal(h.job().status,'pending');
  assert.equal(h.job().lastFailureStage,'auth');
  assert.ok(h.job().retryAfterMs>NOW);
  assert.deepEqual(h.db.actions,['auth']);
});
test('successful job deletes Firebase Auth before Firestore and records completion', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  assert.equal((await h.deletion.processOne(h.uid)).completed,true);
  assert.deepEqual(h.db.actions,['auth','firestore']);
  assert.equal(h.db.store.has(`users/${h.uid}`),false);
  assert.ok(h.auth.deleted.has(h.uid));
  assert.equal(h.job().status,'completed');
  assert.equal(h.job().nextAttemptAtMs,Number.MAX_SAFE_INTEGER);
  assert.ok(h.job().expireAt instanceof Date);
});
test('partial Firestore failure retries after auth/user-not-found, without recreating user', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  h.db.failDelete='after';
  await assert.rejects(()=>h.deletion.processOne(h.uid),hasCode('DB_PARTIAL'));
  assert.equal(h.db.store.has(`users/${h.uid}`),false);
  assert.equal(h.job().status,'pending');
  await assert.rejects(()=>h.srv.openSession({uid:h.uid}),hasCode('ACCOUNT_DELETION_PENDING'));
  h.db.failDelete=null;
  h.advance(20000);
  assert.equal((await h.deletion.processOne(h.uid)).completed,true);
  assert.equal(h.job().status,'completed');
  assert.deepEqual(h.db.actions,['auth','firestore','auth','firestore']);
});
test('active processing lease prevents concurrent duplicate deletes', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  h.job().status='processing';
  h.job().leaseId='first-worker';
  h.job().leaseUntilMs=NOW+60000;
  assert.equal((await h.deletion.processOne(h.uid)).processed,false);
  assert.deepEqual(h.db.actions,[]);
  h.advance(60001);
  assert.equal((await h.deletion.processOne(h.uid)).completed,true);
});
test('completed job is ignored by future worker runs', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  await h.deletion.processOne(h.uid);
  const beforeActions=h.db.actions.length;
  assert.equal((await h.deletion.processOne(h.uid)).processed,false);
  assert.equal(h.db.actions.length,beforeActions);
});
test('batch processes pending jobs using the same safe worker path', async () => {
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  const summary=await h.deletion.processBatch(20);
  assert.deepEqual(summary,{scanned:1,completed:1,skipped:0,failed:0});
});
test('worker CLI fails closed without explicit readiness and project target', () => {
  const file=path.resolve(__dirname,'../lib/accountDeletion.cjs');
  const result=spawnSync(process.execPath,[file],{encoding:'utf8',env:{...process.env,
    GAME_ACCOUNT_DELETION_WORKER_ENABLED:'false', FIREBASE_PROJECT_ID:'',
    GAME_ACCOUNT_DELETION_TARGET_PROJECT_ID:''}});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/worker aborted/);
});

function createStubbedApp(options) {
  const Module = require('node:module');
  const originalLoad = Module._load;
  const routes = new Map();
  const express = () => {
    const app = {
      disable: () => {},
      use: () => {},
      get: (route, callback) => routes.set(`GET ${route}`,callback),
      post: (route, callback) => routes.set(`POST ${route}`,callback),
    };
    return app;
  };
  express.json = () => (_req,_res,next) => next();
  express.static = () => (_req,_res,next) => next();
  try {
    Module._load = function(request, parent, isMain) {
      if (request === 'express') return express;
      if (request === 'dotenv') return { config: () => ({}) };
      return originalLoad.call(this, request, parent, isMain);
    };
    const entry = require.resolve('../server.js');
    delete require.cache[entry];
    const { createApp } = require(entry);
    createApp('/nonexistent',{...options});
    return routes;
  } finally { Module._load = originalLoad; }
}
async function invokeDelete(route,{authTime,token='x'.repeat(40),sid='11111111-1111-4111-8111-111111111111'}={}) {
  const result={ status:null, body:null, error:null };
  const req={body:{},headers:{},get:key=>{
    if (key==='authorization') return `Bearer ${token}`;
    if (key==='x-game-session') return sid;
    return '';
  }};
  const res={status(value){result.status=value;return this;},json(value){result.body=value;return this;}};
  await route(req,res,error=>{result.error=error;});
  return result;
}
test('HTTP endpoint rejects deletion with feature disabled, without touching Firebase',async()=>{
  const routes=createStubbedApp({});
  const result=await invokeDelete(routes.get('POST /api/v1/account/delete'));
  assert.equal(result.status,503);
  assert.equal(result.body.code,'ACCOUNT_DELETION_UNAVAILABLE');
});
test('enabled HTTP deletion accepts only authenticated fresh requests and returns 202',async()=>{
  const calls=[];
  const routes=createStubbedApp({
    service:{},
    auth:{verifyIdToken:async(token,revocation)=>{calls.push(['verify',revocation]);return {uid:'player_a',auth_time:Math.floor(Date.now()/1000)};}},
    accountDeletionEnabled:true,
    accountDeletionService:{request:async(uid,sid)=>{calls.push(['request',uid,sid]);return {deletionPending:true};}},
  });
  const result=await invokeDelete(routes.get('POST /api/v1/account/delete'));
  assert.equal(result.status,202);
  assert.deepEqual(result.body,{ok:true,deletionPending:true});
  assert.equal(calls[0][1],true);
  assert.equal(calls[1][1],'player_a');
});
test('stale/future Firebase auth_time blocks HTTP deletion without writing a job',async()=>{
  let count=0, age=350;
  const routes=createStubbedApp({
    service:{},
    auth:{verifyIdToken:async()=>({uid:'player_a',auth_time:Math.floor(Date.now()/1000)-age})},
    accountDeletionEnabled:true,
    accountDeletionService:{request:async()=>{count++;return {deletionPending:true};}},
  });
  const route=routes.get('POST /api/v1/account/delete');
  let response=await invokeDelete(route);
  assert.equal(response.error?.code,'REAUTH_REQUIRED');
  age=-100;
  response=await invokeDelete(route);
  assert.equal(response.error?.code,'REAUTH_REQUIRED');
  assert.equal(count,0);
});
test('ready-job query skips leases/backoff without starving pending jobs',async()=>{
  const h=await harness();
  await h.deletion.request(h.uid,h.session.sessionId);
  h.db.store.set('accountDeletionJobs/blocked_a',{
    version:1,uid:'blocked_a',status:'processing',requestedAtMs:NOW,
    nextAttemptAtMs:NOW+60000
  });
  const summary=await h.deletion.processBatch(1);
  assert.deepEqual(summary,{scanned:1,completed:1,skipped:0,failed:0});
  assert.equal(h.job().status,'completed');
});
