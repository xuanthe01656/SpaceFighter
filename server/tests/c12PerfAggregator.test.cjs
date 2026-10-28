'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reviewCandidatePerf}=require('../tools/analyzeC12PerfA.cjs');
function logs(){
  const url='https://example.run.app/api/v1/candidate/battle/input';
  return [
    {httpRequest:{requestMethod:'POST',requestUrl:url,status:200,latency:'0.375s',
      remoteIp:'127.0.0.1',requestSize:'999'}},
    {httpRequest:{requestMethod:'OPTIONS',requestUrl:url,status:204,latency:'0.003s'}},
    {jsonPayload:{event:'sf.c12.input.http.v1',status:200,authVerifyMs:170,
      serviceMs:200,totalMs:375,uid:'secret-should-not-be-forwarded'}},
    {textPayload:JSON.stringify({event:'sf.c12.input.tx.v1',attempts:1,
      transactionMs:190,readMs:70,simulationMs:10,otherMs:110})},
    {httpRequest:{requestMethod:'POST',requestUrl:'https://example.run.app/api/v1/session',
      status:200,latency:'1s'}},
  ];
}
test('C12 offline analyzer reads real Cloud Run latency strings, HTTP spans & safe C13 fields',()=>{
  const report=reviewCandidatePerf(logs(),{version:'sf-c13-candidate-movement-evidence-v1',
    status:'INCOMPLETE',sampledTicks:165,acknowledgedTick:105,meanRttMs:637.971,
    maxRttMs:731.5,matchedCheckpoints:8,mismatchedCheckpoints:0,
    interrupted:true,interruptionCode:'C12_NETWORK_BACKPRESSURE'});
  assert.equal(report.samples.post,1);
  assert.equal(report.samples.preflight,1);
  assert.equal(report.postServerLatency.meanMs,375);
  assert.equal(report.authVerify.meanMs,170);
  assert.equal(report.transaction.meanMs,190);
  assert.equal(report.preflightPerPost,1);
  assert.equal(report.c13.backpressure,true);
  assert.ok(report.findings.includes('C13_INTERRUPTED'));
  assert.doesNotMatch(JSON.stringify(report),/127\.0\.0\.1|secret-should|requestSize/);
  assert.equal(report.assessment,'CANDIDATE_PERF_DIAGNOSTIC_ONLY');
});
test('C12 analyzer does not invent performance averages when no data',()=>{
  const out=reviewCandidatePerf([]);
  assert.equal(out.postServerLatency.p95Ms,null);
  assert.equal(out.preflightPerPost,null);
  assert.equal(out.c13,null);
  assert.ok(out.findings.includes('INSUFFICIENT_POST_SAMPLES'));
});
test('C12 analyzer rejects unsupported data before printing untrusted content',()=>{
  assert.throws(()=>reviewCandidatePerf({}),TypeError);
  assert.throws(()=>reviewCandidatePerf([], {version:'wrong'}),TypeError);
});
