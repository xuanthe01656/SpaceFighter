'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {ensureEmulatorOnly,expectedCases,PROTECTED,VERSION}=require('../tools/firestoreAuthorityBoundaryC14.cjs');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const workflow=read('.github/workflows/firestore-authority-security-c14.yml');
const config=JSON.parse(read('firebase.c7c2.qa.json'));
const rules=read('security/firestore.rules');
const server=read('server/server.js');
const outcome=read('server/lib/productionOutcomeAuthorityC10V8.cjs');
const candidate=read('server/lib/productionBattleCandidateC11V8.cjs');
const settlement=read('server/lib/verifiedSettlementC7B2BV8.cjs');
const script=read('server/tools/firestoreAuthorityBoundaryC14.cjs');
const env=Object.freeze({GCLOUD_PROJECT:'demo-spacefighter-c14',
  GOOGLE_CLOUD_PROJECT:'demo-spacefighter-c14',
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'});
test('C14 only permits explicit local emulators with demo project, no auth material',()=>{
  assert.equal(ensureEmulatorOnly(env).project,'demo-spacefighter-c14');
  for(const modify of [
    {GCLOUD_PROJECT:'distributed-inn-482605-c6'},
    {GOOGLE_CLOUD_PROJECT:'prod'},
    {FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443'},
    {FIRESTORE_EMULATOR_HOST:'0.0.0.0:8080'},
    {FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'},
    {FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:8080'},
    {FIRESTORE_EMULATOR_HOST:undefined},
    {GOOGLE_APPLICATION_CREDENTIALS:'private.json'},
    {FIREBASE_TOKEN:'secret'}]){
    assert.throws(()=>ensureEmulatorOnly({...env,...modify}),/C14_LOCAL_ONLY/);
  }
});
test('C14 source uses checked-in rules and binds only IPv4 loopback',()=>{
  assert.equal(config.firestore.rules,'security/firestore.rules');
  assert.equal(config.emulators.auth.host,'127.0.0.1');
  assert.equal(config.emulators.firestore.host,'127.0.0.1');
  assert.equal(config.emulators.ui.enabled,false);
  assert.equal(config.emulators.singleProjectMode,true);
});
test('C14 default rules deny all client writes to profile, nested journal and outcome',()=>{
  assert.match(rules,/allow list, create, update, delete:\s*if false;/);
  assert.match(rules,/match \/\{child=\*\*\} \{ allow read, write: if false; \}/);
  assert.match(rules,/match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
});
test('C14 deny matrix covers actual storage collection names from C7, C10 and C11',()=>{
  for(const [lib,names] of [[read('server/lib/qaBattleAdmissionC7AV8.cjs'),
      ['qaBattleSessions','qaBattleGenesis','qaBattleOriginSeals','qaBattleReceipts',
        'qaBattleAuditProofs','qaBattleTrace']],
    [candidate,['prodBattleCandidateSessions','prodBattleCandidateOrigins',
      'prodBattleCandidateAudits','prodBattleCandidateTrace']],
    [outcome,['productionBattleOutcomes']],
    [settlement,['verifiedBattleSettlements','operations']]]){
    for(const name of names){
      assert.ok(lib.includes(`collection('${name}')`),`Code no longer uses ${name}`);
      assert.ok(PROTECTED.some(p=>p.startsWith(`${name}/`)),`C14 does not test ${name}`);
    }
  }
  assert.equal(PROTECTED.length,13);
});
test('C14 matrix denies owner+other reads, owner PATCH/DELETE on every sensitive document',()=>{
  const cases=expectedCases();
  assert.equal(cases.length,11+PROTECTED.length*4);
  assert.equal(new Set(cases).size,cases.length);
  for(const p of PROTECTED)
    for(const prefix of ['owner-read-denied:','other-read-denied:',
      'owner-patch-denied:','owner-delete-denied:'])
      assert.ok(cases.includes(prefix+p));
});
test('C14 GitHub CI never injects cloud credentials or performs deployment',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/^\s+- main\s*$/m);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.match(workflow,/demo-spacefighter-c14/);
  assert.match(workflow,/firebase-tools@15\.34\.1/);
  assert.match(workflow,/emulators:exec/);
  assert.match(workflow,/--only auth,firestore/);
  assert.match(workflow,/firebase\.c7c2\.qa\.json/);
  assert.doesNotMatch(workflow,/firebase deploy|gcloud run deploy|permissions:\s*write|secrets\./);
});
test('C14 report is explicitly non-authoritative, no wallet or settlement route',()=>{
  assert.match(script,/deployedRulesVerified:false,cloudIamVerified:false/);
  assert.match(script,/settlementEnabled:false,cloudBattleP0Locked:true/);
  assert.match(script,/identityIncluded:false,rawDataIncluded:false/);
  assert.match(server,/candidateEnabled:Boolean\(candidateService\)/);
  assert.doesNotMatch(server,/productionOutcomeAuthorityC10V8|createC10SettlementBridge/);
  assert.doesNotMatch(script,/\/api\/v1\/|\.settle\(|\.issue\(/);
  assert.equal(VERSION,'spacefighter-c14-firestore-client-denial-matrix-v1');
});
