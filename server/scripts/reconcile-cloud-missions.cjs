#!/usr/bin/env node
'use strict';
/** Firestore current-period evidence reconciliation: dry-run by default.
 * --uid <UID> [--apply --fingerprint <SHA256>]
 * --all --output <report.json> [--max-users N] [--start-after UID]
 * --apply-report <report.json> --confirm-project <projectId> --allow-bulk
 * All writes are transaction guarded and require ALLOW_TEST_MISSION_REPAIR=true.
 */
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {planMissionHistoryReconcile}=require('../lib/missionHistoryReconcile.cjs');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const getArg=name=>{const n=process.argv.indexOf(name);return n<0?null:process.argv[n+1];};
const has=name=>process.argv.includes(name);
const validUID=uid=>typeof uid==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
const limit=(v,def,max)=>v===null?def:(Number.isSafeInteger(Number(v)) && Number(v)>=1 && Number(v)<=max ? Number(v) : (()=>{throw Error('Invalid numerical limit');})());
async function main(){
  const uid=getArg('--uid'), all=has('--all'), apply=has('--apply'), applyReport=getArg('--apply-report');
  if (Number(Boolean(uid))+Number(all)+Number(Boolean(applyReport))!==1)
    throw Error('Choose exactly one: --uid UID, --all, or --apply-report local.json');
  if (uid&&!validUID(uid))throw Error('Invalid UID');
  const projectId=process.env.FIREBASE_PROJECT_ID;
  if (!projectId)throw Error('Set FIREBASE_PROJECT_ID in server/.env');
  if (apply||applyReport){
    if(process.env.ALLOW_TEST_MISSION_REPAIR!=='true')throw Error('Write blocked: set ALLOW_TEST_MISSION_REPAIR=true');
    if(!uid&&!applyReport)throw Error('Bulk writes require a reviewed --apply-report, not --all');
  }
  const maxOps=limit(getArg('--max-ops'),500,500);
  const maxUsers=limit(getArg('--max-users'),1000,10000);
  const now=Date.now();
  const config=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
  const admin=require('firebase-admin');
  if(!admin.apps.length){
    const email=process.env.FIREBASE_CLIENT_EMAIL,key=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');
    const credential=email&&key?admin.credential.cert({projectId,clientEmail:email,privateKey:key}):admin.credential.applicationDefault();
    admin.initializeApp({credential,projectId});
  }
  const db=admin.firestore();
  function operationsQuery(ref,at){
    const d=new Date(at),monthStart=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);
    const monday=new Date(at);monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
    return ref.collection('operations').where('createdAt','>=',Math.min(monthStart,monday.getTime())).limit(maxOps+1);
  }
  async function planOne(ref,tx, at){
    // Transaction reads must precede writes: query + doc are both read before update.
    const [snap,opsSnap]=tx ? await Promise.all([tx.get(ref),tx.get(operationsQuery(ref,at))]) :
      await Promise.all([ref.get(),operationsQuery(ref,at).get()]);
    if(!snap.exists)return {status:'PROFILE_NOT_FOUND'};
    const evidence=opsSnap.docs.map(x=>({id:x.id,...x.data()}));
    return planMissionHistoryReconcile(snap.data(),evidence,{now:at,config,incomplete:opsSnap.size>maxOps});
  }
  async function applyOne(targetUid,expected){
    if(!validUID(targetUid)||!(/^[a-f0-9]{64}$/.test(expected||'')))throw Error('Invalid UID/fingerprint');
    const ref=db.collection('users').doc(targetUid);
    return db.runTransaction(async tx=>{
      const planned=await planOne(ref,tx,Date.now());
      if(planned.status==='NO_CHANGES')return {status:'NO_CHANGES'};
      if(planned.status!=='READY')return {status:planned.status,reason:planned.reason};
      if(planned.fingerprint!==expected)return {status:'CONFLICT',reason:'Evidence or profile changed since dry-run'};
      tx.update(ref,{attendance:planned.patch.attendance,missions:planned.patch.missions});
      return {status:'APPLIED',before:planned.preview.old,after:planned.preview.next};
    });
  }
  if(uid){
    if(apply){
      const result=await applyOne(uid,getArg('--fingerprint'));
      console.log(JSON.stringify({projectId,mode:'ONE_PROFILE_APPLY',...result},null,2));
      if(result.status==='CONFLICT'||result.status==='BLOCKED')process.exitCode=2;
    } else {
      const p=await planOne(db.collection('users').doc(uid),null,now);
      console.log(JSON.stringify({projectId,mode:'READ_ONLY_DRY_RUN',status:p.status,
        reason:p.reason,fingerprint:p.fingerprint,preview:p.preview},null,2));
    }
    return;
  }
  if(all){
    if(apply)throw Error('Never use --all --apply; write a reviewed report first');
    const output=getArg('--output');
    if(!output)throw Error('--all requires --output local-report.json');
    if(fs.existsSync(output))throw Error('Output file already exists; refusing overwrite');
    const entries=[];let after=getArg('--start-after');let ended=false;
    while(entries.length<maxUsers){
      const pageSize=Math.min(100,maxUsers-entries.length);
      let query=db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
      if(after){if(!validUID(after))throw Error('Invalid --start-after UID');query=query.startAfter(after);}
      const batch=await query.get();
      if(batch.empty){ended=true;break;}
      for(const doc of batch.docs){
        const p=await planOne(doc.ref,null,now);
        entries.push({uid:doc.id,status:p.status,reason:p.reason,fingerprint:p.fingerprint,preview:p.preview});
        after=doc.id;
      }
      if(batch.size<pageSize){ended=true;break;}
    }
    const report={projectId,dayUTC:new Date(now).toISOString().slice(0,10),mode:'READ_ONLY_DRY_RUN',
      reachedEnd:ended,nextStartAfter:ended?null:after,accounts:entries};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({projectId,mode:'READ_ONLY_DRY_RUN',path:path.resolve(output),
      scanned:entries.length,ready:entries.filter(x=>x.status==='READY').length,
      blocked:entries.filter(x=>x.status==='BLOCKED').length,
      reachedEnd:ended,nextStartAfter:report.nextStartAfter},null,2));
    return;
  }
  // Apply only the exact reviewed evidence snapshots in a local report.
  if(has('--allow-bulk')!==true||getArg('--confirm-project')!==projectId)throw Error(
    'Bulk write blocked: pass --allow-bulk --confirm-project exact-project-id');
  const report=JSON.parse(fs.readFileSync(applyReport,'utf8'));
  if(report.projectId!==projectId||report.mode!=='READ_ONLY_DRY_RUN'||report.dayUTC!==new Date(now).toISOString().slice(0,10))
    throw Error('Report belongs to a different project/day or is not a dry-run');
  if(!Array.isArray(report.accounts)||report.accounts.length>maxUsers)throw Error('Report too large/invalid');
  const results=[];
  for(const item of report.accounts.filter(x=>x.status==='READY')){
    const result=await applyOne(item.uid,item.fingerprint);
    results.push({uid:item.uid,...result});
  }
  console.log(JSON.stringify({projectId,mode:'REVIEWED_REPORT_APPLY',attempted:results.length,
    applied:results.filter(x=>x.status==='APPLIED').length,
    skipped:results.filter(x=>x.status!=='APPLIED').length,details:results},null,2));
}
main().catch(err=>{console.error('Mission reconciliation:',err.message);process.exitCode=1;});
