import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createNativeTouchEvidenceRecorder} from '../src/game/combat/CloudNativeTouchQaC7C2.js';
import {examineNativeTouchTrace,reviewTouchEvidencePack,C7C3_EVIDENCE_REVIEW_VERSION}
  from '../tools/analyzeNativeTouchEvidenceC7C3.mjs';

const folder=dirname(fileURLToPath(import.meta.url));
const cli=resolve(folder,'../tools/analyzeNativeTouchEvidenceC7C3.mjs');
function config(){return {arenaHalfHeight:15000,arenaHalfWidth:22500,aspect:1.5,
  canvasHeight:1000,canvasWidth:1500,halfHeight:15,hitRadius:1800,
  legacyInset:1.8,movePerTick:300,speedMultiplier:1,startX:0,startZ:12500};}
function trace(){
  const r=createNativeTouchEvidenceRecorder(config());
  r.record({type:'down'});r.record({type:'drag',deltaX:80,deltaY:40});
  for(let i=0;i<45;i++){
    if(i===15)r.record({type:'up'});
    r.sample({nowMs:i*1000/30,guestX:-0.5,guestZ:12.7});
  }
  return JSON.parse(JSON.stringify(r.stop('manual')));
}
function pack(){return {'flick':trace(),'hold-release':trace(),'two-axis':trace()};}

test('C7C3 replays original 30Hz policy computations from three locally captured records',()=>{
  const result=reviewTouchEvidencePack(pack());
  assert.equal(result.version,C7C3_EVIDENCE_REVIEW_VERSION);
  assert.equal(result.allTracesReviewable,true);
  assert.equal(result.traces.length,3);
  assert.equal(result.traces.every(x=>x.policyGaps?.clear?.meanGapWorld>=0),true);
});
test('C7C3 cannot choose release policy or authorize settlement even for perfect traces',()=>{
  const result=reviewTouchEvidencePack(pack());
  assert.equal(result.releasePolicySelected,false);
  assert.equal(result.nativeDeviceAttested,false);
  assert.equal(result.productionVerifierApproved,false);
  assert.equal(result.settlementEnabled,false);
  assert.equal(result.cloudBattleP0Locked,true);
});
test('C7C3 rejects a forged release-policy gap metric',()=>{
  const p=trace();p.policies.clear.meanGapWorld+=9;
  const r=examineNativeTouchTrace(p,'flick');
  assert.equal(r.acceptableForReview,false);
  assert.ok(r.findings.includes('POLICY_METRICS_NOT_REPRODUCIBLE'));
});
test('C7C3 rejects fake native attestation and economic flags',()=>{
  const p=trace();p.nativeDeviceAttested=true;p.settlementEnabled=true;
  const r=examineNativeTouchTrace(p,'flick');
  assert.equal(r.acceptableForReview,false);
  assert.ok(r.findings.includes('QA_FLAGS_OR_VERSION_INVALID'));
});
test('C7C3 refuses interrupted/clock-gap touch capture',()=>{
  const p=trace();p.status='clock-gap';p.interrupted=true;
  assert.equal(examineNativeTouchTrace(p,'flick').acceptableForReview,false);
});
test('C7C3 independently validates timing against underlying ticks',()=>{
  const p=trace();p.timing.maxIntervalMs=1;
  assert.ok(examineNativeTouchTrace(p,'flick').findings.includes('TIMING_CLAIM_MISMATCH'));
});
test('C7C3 rejects missing and duplicate gestures',()=>{
  assert.throws(()=>reviewTouchEvidencePack({'flick':trace()}));
  assert.throws(()=>reviewTouchEvidencePack({'flick':trace(),'hold-release':trace(),'foo':trace()}));
});
test('C7C3 reports missing policy evidence without inventing a winner',()=>{
  const p=trace();p.policies=null;
  const result=reviewTouchEvidencePack({'flick':p,'hold-release':trace(),'two-axis':trace()});
  assert.equal(result.allTracesReviewable,false);
  assert.equal(result.policyMeanGaps.clear,null);
  assert.equal(result.releasePolicySelected,false);
});
test('C7C3 output drops raw pointer positions and events and is create-only',()=>{
  const directory=mkdtempSync(join(tmpdir(),'sf-c7c3-'));
  const args=[];
  for(const name of ['flick','hold-release','two-axis']){
    const file=join(directory,`${name}.json`);
    writeFileSync(file,JSON.stringify(trace()));args.push(`--${name}=${file}`);
  }
  const output=join(directory,'report.json');args.push(`--out=${output}`);
  execFileSync(process.execPath,[cli,...args],{stdio:'pipe'});
  const report=readFileSync(output,'utf8');
  assert.match(report,/MANUAL_NATIVE_QA_AND_SECURITY_SIGNOFF_REQUIRED/);
  assert.doesNotMatch(report,/deltaX|guestX|guestZ|pointerActive|firebaseIdToken/);
  assert.throws(()=>execFileSync(process.execPath,[cli,...args],{stdio:'pipe'}));
});
test('C7C3 cannot silently accept event ordering or time abuse',()=>{
  const p=trace();p.events[1].tick=99999;
  assert.equal(examineNativeTouchTrace(p,'flick').acceptableForReview,false);
  const q=trace();q.samples[3].deltaMs=999;
  assert.equal(examineNativeTouchTrace(q,'flick').acceptableForReview,false);
});
