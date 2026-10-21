import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSameAuthUser, runAuthBoundOperation, retrySameAuthUser } from '../src/utils/authRequestGuards.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

test('queued command is blocked if the user changed before its request starts', async () => {
  let uid='user-b',attempt=2,calls=0;
  await assert.rejects(runAuthBoundOperation({
    expectedUid:'user-a',expectedAttempt:1,
    getCurrentUid:()=>uid,getCurrentAttempt:()=>attempt,
    request:async()=>{calls++;return {ok:true};}
  }),{code:'AUTH_STATE_CHANGED'});
  assert.equal(calls,0);
});

test('response from user A cannot overwrite state of user B', async () => {
  let uid='user-a',attempt=1,applied=0;
  const inflight=deferred();
  const running=runAuthBoundOperation({
    expectedUid:'user-a',expectedAttempt:1,
    getCurrentUid:()=>uid,getCurrentAttempt:()=>attempt,
    request:()=>inflight.promise,apply:()=>{applied++;}
  });
  uid='user-b';attempt=2;inflight.resolve({state:{coins:9000}});
  await assert.rejects(running,{code:'AUTH_STATE_CHANGED'});
  assert.equal(applied,0);
});

test('same UID but superseded auth generation cannot apply old response', async () => {
  let attempt=4,applied=0;
  const inflight=deferred();
  const running=runAuthBoundOperation({
    expectedUid:'same-user',expectedAttempt:4,
    getCurrentUid:()=> 'same-user',getCurrentAttempt:()=>attempt,
    request:()=>inflight.promise,apply:()=>{applied++;}
  });
  attempt=5;inflight.resolve({ok:true});
  await assert.rejects(running,{code:'AUTH_STATE_CHANGED'});
  assert.equal(applied,0);
});

test('unchanged auth account can complete and apply state exactly once', async () => {
  let applied=0;
  const result=await runAuthBoundOperation({
    expectedUid:'user-a',expectedAttempt:5,
    getCurrentUid:()=> 'user-a',getCurrentAttempt:()=>5,
    request:async()=>({state:{coins:15}}),apply:reply=>{applied++;return reply.state.coins;}
  });
  assert.equal(result,15);assert.equal(applied,1);
});

test('command timeout after switching accounts does not retry as other user', async () => {
  let uid='user-a',calls=0;
  await assert.rejects(retrySameAuthUser({
    expectedUid:'user-a',getCurrentUid:()=>uid,
    request:async()=>{calls++;uid='user-b';const e=new Error('Timeout');e.code='TIMEOUT';throw e;},
    shouldRetry:error=>error.code==='TIMEOUT'
  }),{code:'AUTH_STATE_CHANGED'});
  assert.equal(calls,1);
});

test('same-user retry reuses the same requestId and succeeds', async () => {
  let calls=0,uid='user-a';
  const op={requestId:'same-request-123456',command:'inventory.lock'};
  const ids=[];
  const response=await retrySameAuthUser({
    expectedUid:'user-a',getCurrentUid:()=>uid,
    request:async()=>{ids.push(op.requestId);calls++;if(calls===1){const e=new Error('Timeout');e.code='TIMEOUT';throw e;}return {ok:true};},
    shouldRetry:error=>error.code==='TIMEOUT'
  });
  assert.deepEqual(ids,[op.requestId,op.requestId]);
  assert.equal(response.ok,true);
});

test('auth user mismatch is rejected even if credentials are otherwise valid', () => {
  assert.doesNotThrow(()=>assertSameAuthUser('user-a','user-a'));
  assert.throws(()=>assertSameAuthUser('user-a','user-b'),{code:'AUTH_STATE_CHANGED'});
  assert.throws(()=>assertSameAuthUser('user-a',undefined),{code:'AUTH_STATE_CHANGED'});
});
