'use strict';
/**
 * C14 REAL Security Rules denial matrix against Firebase local emulators only.
 * Uses Auth emulator for test identities and Admin SDK for test seeding.
 * All client reads/writes use REST with signed emulator ID tokens.
 * The Admin SDK bypasses Security Rules, so ADMIN SEEDING IS NOT A RULES TEST.
 * This file MUST NOT run unless project starts demo-spacefighter-c14 and both
 * emulator hosts are IPv4 loopback. Does not prove deployed IAM/Rules.
 * Never log real tokens / UIDs / document bodies; never use a real project.
 */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const VERSION='spacefighter-c14-firestore-client-denial-matrix-v1';
const PROJECT='demo-spacefighter-c14';
const HOST=/^127\.0\.0\.1:(?:[1-9][0-9]{1,4})$/;
const SAFE_SEGMENT=/^[A-Za-z0-9_-]{1,100}$/;
const PROTECTED=Object.freeze([
  'qaBattleSessions/current',
  'qaBattleGenesis/battle_c14',
  'qaBattleOriginSeals/battle_c14',
  'qaBattleReceipts/battle_c14',
  'qaBattleAuditProofs/battle_c14',
  'qaBattleTrace/battle_c14/chunks/000000',
  'prodBattleCandidateSessions/current',
  'prodBattleCandidateOrigins/battle_c14',
  'prodBattleCandidateAudits/battle_c14',
  'prodBattleCandidateTrace/battle_c14/chunks/000000',
  'productionBattleOutcomes/battle_c14',
  'verifiedBattleSettlements/battle_c14',
  'operations/op_c14',
]);
function ensureEmulatorOnly(env=process.env){
  if((env.GCLOUD_PROJECT||'')!==PROJECT
    ||(env.GOOGLE_CLOUD_PROJECT&&env.GOOGLE_CLOUD_PROJECT!==PROJECT)
    ||!HOST.test(env.FIRESTORE_EMULATOR_HOST||'')
    ||!HOST.test(env.FIREBASE_AUTH_EMULATOR_HOST||'')
    ||env.FIRESTORE_EMULATOR_HOST===env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error('C14_LOCAL_ONLY: requires exact demo project and two distinct 127.0.0.1 emulators');
  if(env.GOOGLE_APPLICATION_CREDENTIALS||env.FIREBASE_TOKEN)
    throw new Error('C14_LOCAL_ONLY: no service account or Firebase login token allowed');
  return Object.freeze({project:PROJECT,auth:env.FIREBASE_AUTH_EMULATOR_HOST,
    firestore:env.FIRESTORE_EMULATOR_HOST});
}
function expectedCases(){
  const result=[
    'owner-profile-get-allowed','other-user-profile-get-denied',
    'anon-profile-get-denied','owner-user-list-denied',
    'owner-profile-patch-denied','owner-profile-delete-denied',
    'owner-create-other-profile-denied',
    'owner-deletion-job-create-denied','owner-deletion-job-read-denied',
    'owner-deletion-job-list-denied','anon-deletion-job-get-denied',
  ];
  for(const relative of PROTECTED){
    result.push(`owner-read-denied:${relative}`);
    result.push(`other-read-denied:${relative}`);
    result.push(`owner-patch-denied:${relative}`);
    result.push(`owner-delete-denied:${relative}`);
  }
  return Object.freeze(result);
}
async function request(localUrl,method='GET',token,body){
  const rsp=await fetch(localUrl,{method,
    headers:{'Content-Type':'application/json',
      ...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(12000)});
  return rsp.status;
}
async function signup(host,label){
  const nonce=crypto.randomBytes(10).toString('hex');
  const rsp=await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-emulator-key`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:`${label}-${nonce}@example.invalid`,
      password:`C14-only-${crypto.randomBytes(18).toString('hex')}`,
      returnSecureToken:true}),signal:AbortSignal.timeout(12000)});
  if(rsp.status!==200)throw new Error(`AUTH_EMULATOR_SIGNUP_FAILED HTTP ${rsp.status}`);
  const payload=await rsp.json();
  if(!SAFE_SEGMENT.test(payload.localId||'')||!payload.idToken)
    throw new Error('AUTH_EMULATOR_INVALID_RESPONSE');
  return {uid:payload.localId,token:payload.idToken};
}
async function run(){
  const env=process.env;
  const cfg=ensureEmulatorOnly(process.env);
  // Must be called after local-only checks; Admin SDK uses FIRESTORE_EMULATOR_HOST.
  const admin=require('firebase-admin');
  const app=admin.initializeApp({projectId:cfg.project},`c14-${crypto.randomBytes(5).toString('hex')}`);
  const db=app.firestore();
  const cases=expectedCases(),done=new Set();
  const root=`http://${cfg.firestore}/v1/projects/${cfg.project}/databases/(default)/documents`;
  const url=relative=>`${root}/${relative}`;
  const mutation={fields:{c14Probe:{stringValue:'denied'}}};
  try{
    const owner=await signup(cfg.auth,'owner');
    const other=await signup(cfg.auth,'other');
    const base=`users/${owner.uid}`;
    const paths=PROTECTED.map(s=>`${base}/${s}`);
    // Seed ONLY emulator test docs via Admin SDK (not counted as passing rules).
    const batch=db.batch();
    for(const relative of [`users/${owner.uid}`,`users/${other.uid}`,...paths])
      batch.set(db.doc(relative),{c14Probe:'seed-only'});
    await batch.commit();
    async function check(label,expected,relative,method,token,body){
      if(!cases.includes(label)||done.has(label))throw Error('C14_TEST_CASE_DUPLICATED');
      const actual=await request(url(relative),method,token,body);
      if(actual!==expected){
        throw new Error(`C14_RULES_DENIAL_FAILED ${label}: HTTP ${actual} expected ${expected}`);
      }
      done.add(label);
      console.log(`PASS C14_FIRESTORE_${done.size} ${label}`);
    }
    await check('owner-profile-get-allowed',200,base,'GET',owner.token);
    await check('other-user-profile-get-denied',403,base,'GET',other.token);
    await check('anon-profile-get-denied',403,base,'GET');
    await check('owner-user-list-denied',403,'users','GET',owner.token);
    await check('owner-profile-patch-denied',403,base,'PATCH',owner.token,mutation);
    await check('owner-profile-delete-denied',403,base,'DELETE',owner.token);
    await check('owner-create-other-profile-denied',403,'users/c14-unauthorized-create','PATCH',owner.token,mutation);
    await check('owner-deletion-job-create-denied',403,`accountDeletionJobs/${owner.uid}`,'PATCH',owner.token,mutation);
    await check('owner-deletion-job-read-denied',403,`accountDeletionJobs/${owner.uid}`,'GET',owner.token);
    await check('owner-deletion-job-list-denied',403,'accountDeletionJobs','GET',owner.token);
    await check('anon-deletion-job-get-denied',403,`accountDeletionJobs/${owner.uid}`,'GET');
    for(let i=0;i<PROTECTED.length;i++){
      const rel=PROTECTED[i],full=paths[i];
      await check(`owner-read-denied:${rel}`,403,full,'GET',owner.token);
      await check(`other-read-denied:${rel}`,403,full,'GET',other.token);
      await check(`owner-patch-denied:${rel}`,403,full,'PATCH',owner.token,mutation);
      await check(`owner-delete-denied:${rel}`,403,full,'DELETE',owner.token);
    }
    if(done.size!==cases.length)throw Error('C14_TEST_CASES_MISSING');
    const report=Object.freeze({version:VERSION,projectScope:'demo-spacefighter-c14',
      emulatorsOnly:true,securityRulesFile:'security/firestore.rules',
      testsPassed:done.size,testsFailed:0,protectedDocumentsChecked:PROTECTED.length,
      identityIncluded:false,rawDataIncluded:false,
      deployedRulesVerified:false,cloudIamVerified:false,
      nativeCombatParityVerified:false,productionOutcomeEnabled:false,
      settlementEnabled:false,cloudBattleP0Locked:true,
      conclusion:'LOCAL_EMULATOR_DENIAL_MATRIX_PASS_NOT_PRODUCTION_APPROVAL'});
    const output=env.C14_SECURITY_REPORT_PATH||'c14-firestore-boundary-report.json';
    if(path.resolve(output).startsWith(`${ROOT}/`)!==true||path.extname(output)!=='.json')
      throw Error('C14_REPORT_PATH_INVALID');
    fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(`PASS C14_FIRESTORE_RULES_LOCAL_ONLY PASSED=${done.size} FAILED=0`);
    return report;
  }finally{
    await app.delete();
  }
}
if(require.main===module){
  run().catch(err=>{
    // Do not print emulator tokens, document contents or environment.
    console.error(`C14_FIRESTORE_EMULATOR_FAIL: ${String(err?.message||'UNKNOWN').slice(0,180)}`);
    process.exitCode=1;
  });
}
module.exports=Object.freeze({VERSION,PROTECTED,ensureEmulatorOnly,expectedCases,run});
