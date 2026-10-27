import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateMovementEvidenceC13} from '../src/game/combat/CandidateMovementEvidenceC13.js';
import {reviewCandidateMovementC13} from '../tools/analyzeCandidateMovementC13.mjs';
function trace({drift=0,terminal=true,auditComplete=true,points=2,ms=100}={}){
  const a=createCandidateMovementEvidenceC13();a.open({x:0,z:12500});
  for(let k=1;k<=15*points;k++){
    a.sample({tick:k,x:-k*10,z:12500-k*5,queued:(k-1)%15+1});
    if(k%15===0)a.acknowledge({tick:k,pilot:{x:-k*10+drift,z:12500-k*5},rttMs:ms});
  }
  return a.report({terminal,auditComplete});
}
test('C13 offline review accepts matched 30Hz checkpoint report only as manual diagnostic',()=>{
  const out=reviewCandidateMovementC13(trace());
  assert.equal(out.checkpointMatchDiagnostic,'MATCHED_FOR_MANUAL_REVIEW');
  assert.equal(out.nativeGuestCombatParityApproved,false);
  assert.equal(out.productionOutcomeEnabled,false);
  assert.equal(out.settlementEnabled,false);
});
test('C13 offline review blocks drifts and interrupted reports',()=>{
  assert.ok(reviewCandidateMovementC13(trace({drift:3})).findings.includes('CLIENT_SERVER_MOVEMENT_DRIFT'));
  assert.ok(reviewCandidateMovementC13(trace({terminal:false})).findings.includes('NON_TERMINAL_OR_NO_INDEPENDENT_AUDIT'));
});
test('C13 offline review blocks too few ticks and delayed server acknowledgement',()=>{
  const a=reviewCandidateMovementC13(trace({points:1}));
  assert.equal(a.checkpointMatchDiagnostic,'NOT_READY');
  const b=reviewCandidateMovementC13(trace({ms:1700}));
  assert.ok(b.findings.includes('TRANSPORT_LATENCY_OR_BACKPRESSURE_REVIEW'));
});
test('C13 offline review refuses fake production approval or identity',()=>{
  for(const extra of [{uid:'private-id'}, {productionReplayApproved:true},
    {cloudRewards:true},{frames:[{x:0,z:0}]},{grants:{coins:450}}]){
    assert.throws(()=>reviewCandidateMovementC13({...trace(),...extra}),/C13_EVIDENCE_REJECTED/);
  }
});
test('C13 offline review refuses false match and tampered numbers',()=>{
  for(const extra of [{status:'MOVEMENT_CHECKPOINTS_MATCHED',mismatchedCheckpoints:1},
    {meanDistanceUnits:10000,maxDistanceUnits:0},
    {acknowledgedTick:5000},{maxPendingFrames:100}])
    assert.throws(()=>reviewCandidateMovementC13({...trace(),...extra}),/C13_EVIDENCE_REJECTED/);
});
