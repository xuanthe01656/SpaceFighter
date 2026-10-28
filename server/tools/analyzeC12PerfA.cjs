'use strict';
/**
 * C12-PERF-A offline, redacted Cloud Run performance summary.
 * Inputs: Cloud Logging JSON array + optional local C13 JSON.
 * No network calls, writes, secrets or identity fields in output.
 */
const fs=require('node:fs');
const VERSION='sf-c12-perf-a-review-v1';
const INPUT='/api/v1/candidate/battle/input';
const round=n=>Math.round(n*1000)/1000;
function median(values,q){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return round(sorted[Math.ceil(q*sorted.length)-1]);
}
function describe(values){
  const xs=values.filter(n=>Number.isFinite(n)&&n>=0);
  if(!xs.length)return {count:0,minMs:null,meanMs:null,p50Ms:null,p95Ms:null,maxMs:null};
  return {count:xs.length,minMs:round(Math.min(...xs)),
    meanMs:round(xs.reduce((s,n)=>s+n,0)/xs.length),
    p50Ms:median(xs,.5),p95Ms:median(xs,.95),maxMs:round(Math.max(...xs))};
}
function parsedEvent(log){
  if(log&&typeof log.jsonPayload==='object'&&log.jsonPayload!==null)
    return log.jsonPayload;
  try{return JSON.parse(log?.textPayload||'');}catch(_){return null;}
}
function isInputUrl(url){
  if(typeof url!=='string')return false;
  try{return new URL(url).pathname===INPUT;}
  catch(_){return url.split('?')[0]===INPUT;}
}
function latencyMs(latency){
  if(typeof latency==='string' && /^\d+(?:\.\d+)?s$/.test(latency))
    return Number(latency.slice(0,-1))*1000;
  return null;
}
function reviewCandidatePerf(records,c13=null){
  if(!Array.isArray(records)||records.length>20000)
    throw new TypeError('Bounded Cloud Logging JSON array (max 20000) required');
  const posts=[],options=[],httpPerf=[],txPerf=[];
  for(const log of records){
    const req=log?.httpRequest;
    if(req&&isInputUrl(req.requestUrl)){
      const item={status:req.status,latencyMs:latencyMs(req.latency)};
      if(req.requestMethod==='POST')posts.push(item);
      else if(req.requestMethod==='OPTIONS')options.push(item);
    }
    const event=parsedEvent(log);
    if(event?.event==='sf.c12.input.http.v1')httpPerf.push(event);
    if(event?.event==='sf.c12.input.tx.v1')txPerf.push(event);
  }
  const ms=(items,key)=>describe(items.map(x=>x?.[key]));
  const countStatus=(arr,status)=>arr.filter(r=>r.status===status).length;
  const findings=[];
  if(posts.length<20)findings.push('INSUFFICIENT_POST_SAMPLES');
  if(httpPerf.length<20||txPerf.length<20)
    findings.push('INSTRUMENTATION_OFF_OR_INSUFFICIENT_SAMPLES');
  const serverMs=ms(posts,'latencyMs');
  if(serverMs.p95Ms!==null&&serverMs.p95Ms>=500)
    findings.push('SERVER_P95_EXCEEDS_15_FRAME_BUDGET');
  if(c13){
    if(c13.version!=='sf-c13-candidate-movement-evidence-v1'
      || !['INCOMPLETE','DRIFT_REVIEW_REQUIRED','MOVEMENT_CHECKPOINTS_MATCHED'].includes(c13.status)
      || ![c13.sampledTicks,c13.acknowledgedTick,c13.matchedCheckpoints,
        c13.mismatchedCheckpoints].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=4500)
      || ![c13.meanRttMs,c13.maxRttMs].every(n=>typeof n==='number'
        && Number.isFinite(n)&&n>=0&&n<=600000)
      || typeof c13.interrupted!=='boolean'
      || !(c13.interruptionCode===null || (typeof c13.interruptionCode==='string'
        && /^[A-Z][A-Z0-9_]{2,63}$/.test(c13.interruptionCode))))
      throw new TypeError('C13 report has unsupported or unsafe fields');
    if(c13.interrupted===true)findings.push('C13_INTERRUPTED');
    if(c13.status!=='COMPLETE')findings.push('C13_NOT_COMPLETE');
  }
  if(!findings.length)findings.push('MEASURED_ONLY_NOT_PRODUCTION_APPROVAL');
  return {version:VERSION,assessment:'CANDIDATE_PERF_DIAGNOSTIC_ONLY',
    samples:{post:posts.length,preflight:options.length,
      httpPerf:httpPerf.length,transactionPerf:txPerf.length},
    postStatuses:{success200:countStatus(posts,200),other:posts.length-countStatus(posts,200)},
    preflightStatuses:{success204:countStatus(options,204),other:options.length-countStatus(options,204)},
    preflightPerPost:posts.length?round(options.length/posts.length):null,
    postServerLatency:serverMs,
    preflightServerLatency:ms(options,'latencyMs'),
    authVerify:ms(httpPerf,'authVerifyMs'),
    service:ms(httpPerf,'serviceMs'),
    httpTotal:ms(httpPerf,'totalMs'),
    transaction:ms(txPerf,'transactionMs'),
    firestoreReads:ms(txPerf,'readMs'),
    simulation:ms(txPerf,'simulationMs'),
    transactionOther:ms(txPerf,'otherMs'),
    c13:c13?{status:c13.status,sampledTicks:c13.sampledTicks,
      acknowledgedTick:c13.acknowledgedTick,matchedCheckpoints:c13.matchedCheckpoints,
      mismatchedCheckpoints:c13.mismatchedCheckpoints,
      meanRttMs:c13.meanRttMs,maxRttMs:c13.maxRttMs,
      interrupted:c13.interrupted===true,
      backpressure:c13.interruptionCode==='C12_NETWORK_BACKPRESSURE'}:null,
    findings};
}
if(require.main===module){
  if(![3,4].includes(process.argv.length)){
    process.stderr.write('Usage: node server/tools/analyzeC12PerfA.cjs cloud_run_logs.json [c13_report.json]\n');
    process.exitCode=2;
  }else{
    try{
      const records=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
      const c13=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):null;
      console.log(JSON.stringify(reviewCandidatePerf(records,c13),null,2));
    }catch(e){process.stderr.write(`Analysis failed: ${e.message}\n`);process.exitCode=1;}
  }
}
module.exports={VERSION,reviewCandidatePerf};
