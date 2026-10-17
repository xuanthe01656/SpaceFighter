#!/usr/bin/env node
'use strict';
// Targeted operator CLI. Default is read-only. Never expose as a game command.
// Requires Google ADC or FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY as the
// existing server does; no Firebase config or security rules are modified.
const {planLegacyAttendanceRepair}=require('../lib/legacyAttendanceRepair.cjs');
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
function flag(name) {const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
async function main() {
  const uid=flag('--uid'), dayUTC=flag('--day'), expectedMakeups=Number(flag('--expect-makeups'));
  const apply=process.argv.includes('--apply'), expected=flag('--fingerprint');
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || !dayUTC ||
      !['0','1','2'].includes(flag('--expect-makeups'))) {
    throw Error('Usage: node scripts/repair-legacy-attendance.cjs --uid YOUR_UID --day YYYY-MM-DD --expect-makeups 2 [--apply --fingerprint SHA256]');
  }
  if (apply && (!/^[a-f0-9]{64}$/.test(expected||'') || process.env.ALLOW_TEST_PROFILE_REPAIR!=='true')) {
    throw Error('Write blocked: set ALLOW_TEST_PROFILE_REPAIR=true and provide exact dry-run --fingerprint (64 hex chars)');
  }
  if (!process.env.FIREBASE_PROJECT_ID) throw Error('FIREBASE_PROJECT_ID must be set explicitly in server/.env');
  const admin=require('firebase-admin');
  if (!admin.apps.length) {
    const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');
    const credential=clientEmail && privateKey ? admin.credential.cert({
      projectId:process.env.FIREBASE_PROJECT_ID,clientEmail,privateKey
    }) : admin.credential.applicationDefault();
    admin.initializeApp({credential,projectId:process.env.FIREBASE_PROJECT_ID});
  }
  const db=admin.firestore(), ref=db.collection('users').doc(uid);
  const args={dayUTC,expectedMakeups,now:Date.now()};
  if (!apply) {
    const snap=await ref.get();
    if (!snap.exists) throw Error('Profile not found');
    const plan=planLegacyAttendanceRepair(snap.data(),args);
    console.log(JSON.stringify({projectId:process.env.FIREBASE_PROJECT_ID,mode:'READ_ONLY_DRY_RUN',
      status:plan.status,reason:plan.reason,fingerprint:plan.fingerprint,preview:plan.preview},null,2));
    return;
  }
  const result=await db.runTransaction(async t=>{
    const snap=await t.get(ref);
    if (!snap.exists) throw Error('Profile not found');
    const plan=planLegacyAttendanceRepair(snap.data(),args);
    if (plan.status!=='READY') throw Error(`Write blocked: ${plan.reason}`);
    if (plan.fingerprint!==expected) throw Error('Profile changed since dry-run; run dry-run again');
    t.update(ref,{attendance:plan.patch.attendance,missions:plan.patch.missions});
    return plan;
  });
  console.log(JSON.stringify({mode:'APPLIED_ONE_PROFILE',status:'SUCCESS',preview:result.preview},null,2));
}
main().catch(e=>{console.error('Legacy attendance repair:',e.message);process.exitCode=1;});
