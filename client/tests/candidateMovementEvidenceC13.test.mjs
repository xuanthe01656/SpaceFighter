import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateMovementEvidenceC13,C13_EVIDENCE_VERSION}
  from '../src/game/combat/CandidateMovementEvidenceC13.js';
const init=()=>{const a=createCandidateMovementEvidenceC13();a.open({x:0,z:12500});return a;};
const sample=(a,n)=>{for(let i=1;i<=n;i++)a.sample({tick:i,x:-i*10,z:12500-i*5,queued:Math.min(i,60)});};
test('C13 matches at acknowledged tick, not latest client prediction',()=>{
  const a=init();sample(a,30);
  a.acknowledge({tick:15,pilot:{x:-150,z:12425},rttMs:78});
  a.acknowledge({tick:30,pilot:{x:-300,z:12350},rttMs:100});
  const r=a.report({terminal:true,auditComplete:true});
  assert.equal(r.status,'MOVEMENT_CHECKPOINTS_MATCHED');
  assert.equal(r.matchedCheckpoints,2);assert.equal(r.mismatchedCheckpoints,0);
  assert.equal(r.maxPendingFrames,30);assert.equal(r.meanRttMs,89);
  assert.equal(r.acknowledgedTick,30);assert.equal(r.latestSampledTick,30);
  assert.equal(r.version,C13_EVIDENCE_VERSION);
});
test('C13 detects a real server/client position drift; never self-approves',()=>{
  const a=init();sample(a,15);
  a.acknowledge({tick:15,pilot:{x:-147,z:12425},rttMs:9});
  const r=a.report({terminal:true,auditComplete:true});
  assert.equal(r.status,'DRIFT_REVIEW_REQUIRED');assert.equal(r.mismatchedCheckpoints,1);
  assert.equal(r.maxAbsDxUnits,3);assert.equal(r.eligibleForSettlement,false);
  assert.equal(r.nativeGuestParityApproved,false);assert.equal(r.productionReplayApproved,false);
  assert.equal(r.cloudRewards,false);
});
test('C13 incomplete ticket cannot be mistaken for production approval',()=>{
  const a=init();sample(a,15);
  assert.equal(a.report().status,'INCOMPLETE');
  assert.equal(a.report({terminal:true,auditComplete:false}).status,'INCOMPLETE');
});
test('C13 rejects out-of-order tick and forged checkpoints',()=>{
  const a=init();sample(a,3);
  for(const bad of [{tick:4,pilot:{x:1,z:2}},
    {tick:3,pilot:{x:Infinity,z:0}},
    {tick:3,pilot:{x:0,z:0},rttMs:-1}])
    assert.throws(()=>a.acknowledge(bad),{code:'C13_CHECKPOINT_INVALID'});
  assert.throws(()=>a.sample({tick:5,x:0,z:0,queued:1}),{code:'C13_SAMPLE_SEQUENCE_INVALID'});
});
test('C13 restricts memory to bounded 90 pending positions',()=>{
  const a=init();sample(a,89);
  assert.throws(()=>a.sample({tick:90,x:0,z:0,queued:50}),{code:'C13_SAMPLE_SEQUENCE_INVALID'});
});
test('C13 report contains no account, battle, input vectors or secret data',()=>{
  const a=init();sample(a,15);a.acknowledge({tick:15,pilot:{x:-150,z:12425}});
  const r=a.report({error:{code:'C12_NETWORK_BACKPRESSURE'}});
  assert.equal(r.interrupted,true);assert.equal(r.interruptionCode,'C12_NETWORK_BACKPRESSURE');
  for(const key of ['uid','sessionId','battleId','frames','input','reward','grant','mac'])
    assert.equal(Object.keys(r).includes(key),false);
  assert.equal(r.containsIdentity,false);assert.equal(r.containsRawInput,false);
  assert.equal(r.networkUpload,false);assert.equal(r.localOnly,true);
  assert.equal(r.status,'INCOMPLETE');
});
test('C13 sanitizes untrusted network error strings',()=>{
  const a=init();
  assert.equal(a.report({error:{code:'TOKEN bearer secrets'}}).interruptionCode,
    'C13_UNCLASSIFIED_INTERRUPTION');
});
test('C13 duplicate same-tick acknowledgement is idempotent',()=>{
  const a=init();sample(a,15);
  a.acknowledge({tick:15,pilot:{x:-150,z:12425},rttMs:20});
  a.acknowledge({tick:15,pilot:{x:-150,z:12425},rttMs:50});
  assert.equal(a.report().acknowledgementCount,1);
  assert.equal(a.report().matchedCheckpoints,1);
});
test('C13 flags missing recorded tick (never claims matched)',()=>{
  const a=init();sample(a,20);
  a.acknowledge({tick:15,pilot:{x:-150,z:12425}});
  a.acknowledge({tick:16,pilot:{x:-160,z:12420}});
  assert.equal(a.report().matchedCheckpoints,2);
});
