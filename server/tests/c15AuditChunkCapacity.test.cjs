'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const audit=require('../lib/productionReplayAuditC11V8.cjs');
const candidate=fs.readFileSync(path.resolve(__dirname,
  '../lib/productionBattleCandidateC11V8.cjs'),'utf8');
const replay=fs.readFileSync(path.resolve(__dirname,
  '../lib/productionReplayAuditC11V8.cjs'),'utf8');
test('C15 candidate: full 4500 tick journal fits capped 30-frame transport',()=>{
  const chunks=1+Math.ceil((audit.MAX_AUDIT_TICKS-15)/30);
  assert.equal(chunks,151);
  assert.ok(audit.MAX_AUDIT_CHUNKS>=chunks);
  assert.ok(audit.MAX_AUDIT_CHUNKS<=256);
  assert.equal(audit.MAX_AUDIT_TICKS,4500);
});
test('C15 candidate: bounded ingest and audit persist server-origin trace',()=>{
  assert.match(candidate,/active\.chunkCount>=MAX_AUDIT_CHUNKS/);
  assert.match(candidate,/\.limit\(MAX_AUDIT_CHUNKS\+1\)/);
  assert.match(candidate,/C11_TRACE_COUNT/);
  assert.match(replay,/safeInt\(active\.chunkCount,1,MAX_AUDIT_CHUNKS\)/);
  assert.match(replay,/const MAX_TRACE_BYTES=2\*1024\*1024/);
  assert.match(replay,/C11_TRACE_TAMPER/);
  assert.match(replay,/C11_TRACE_EXTRA/);
  assert.match(replay,/C11_REPLAY_MISMATCH/);
});
test('C15 candidate: audit authority remains isolated from C10 and settlement',()=>{
  assert.match(replay,/eligibleForSettlement!==false/);
  assert.match(replay,/candidate-clear/);
  assert.doesNotMatch(replay,/createVerifiedSettlement|issueC10Outcome|grantCurrency/);
});
