'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reconcileC15Rc4Settlement}=require('../lib/c15Rc4ReconciliationV1.cjs');
const outcome={battleId:'battle',outcomeDigest:'a'.repeat(64),phase:'rc2-trusted-clear'};
const receipt={battleId:'battle',outcomeDigest:outcome.outcomeDigest,outcomePhase:outcome.phase,receiptDigest:'b'.repeat(64),coins:450,experience:100,stars:1,missionDeltas:{d_play_3:1,m_clear_planet:1}};
const operation={command:'c15.settlement.claim',battleId:'battle',outcomeDigest:outcome.outcomeDigest,extra:{receiptDigest:receipt.receiptDigest}};
const before={wallet:{coins:100},progress:{exp:250,planets:{1:{stars:{1:0}}}},missions:{progress:{d_play_3:0,m_clear_planet:0}}};
const after={wallet:{coins:550},progress:{exp:350,planets:{1:{stars:{1:1}}}},missions:{progress:{d_play_3:1,m_clear_planet:1}}};

test('RC4 reconciliation passes exact outcome/receipt/operation/profile deltas',()=>{
  assert.deepEqual(reconcileC15Rc4Settlement({outcome,receipt,operation,userBefore:before,userAfter:after}),{version:'c15-rc4-reconciliation-v1',status:'PASS',issues:[]});
});

test('RC4 reconciliation detects duplicate/tamper-style mismatches without mutating evidence',()=>{
  const bad=structuredClone(after);bad.wallet.coins=100;bad.missions.progress.m_clear_planet=0;
  const result=reconcileC15Rc4Settlement({outcome,receipt:{...receipt,outcomeDigest:'f'.repeat(64)},operation,userBefore:before,userAfter:bad});
  assert.equal(result.status,'FAIL');assert.ok(result.issues.includes('OUTCOME_DIGEST_MISMATCH'));assert.ok(result.issues.includes('COIN_DELTA_MISMATCH'));assert.ok(result.issues.includes('CLEAR_MISSION_DELTA_MISMATCH'));
  assert.equal(after.wallet.coins,550);
});
