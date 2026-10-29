'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyGameApiError}=require('../lib/httpError.cjs');
const {CombatVerticalSliceError}=require('../lib/combatVerticalSliceV8.cjs');

test('C12 terminal tail is a typed, non-economic HTTP 409 with an exact recovery code',()=>{
  const err=new CombatVerticalSliceError('SLICE_TERMINAL_FRAME_TAIL',
    'Inputs continue after the QA battle ended');
  const response=classifyGameApiError(err);
  assert.deepEqual(response,{status:409,code:'SLICE_TERMINAL_FRAME_TAIL',
    message:'Candidate input spans the server terminal tick; submit a shorter prefix'});
  assert.equal(Object.hasOwn(response,'terminalTick'),false);
  for(const field of ['victory','grant','settlement','rewards','eligibleForSettlement'])
    assert.equal(Object.hasOwn(response,field),false);
});
test('C12 cannot launder arbitrary errors into recoverable terminal-tail responses',()=>{
  const spoof=Object.assign(new Error('fake'),{code:'SLICE_TERMINAL_FRAME_TAIL'});
  assert.deepEqual(classifyGameApiError(spoof),{status:500,code:'INTERNAL_ERROR',message:'Server error'});
  const other=new CombatVerticalSliceError('SLICE_MOVEMENT_DRIFT','bad client trajectory');
  assert.deepEqual(classifyGameApiError(other),{status:500,code:'INTERNAL_ERROR',message:'Server error'});
});

let createApp=null;
try{({createApp}=require('../server.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('C12 candidate HTTP preserves terminal-tail 409 without privileged reward fields',
  {skip:!createApp},async()=>{
  const http=require('node:http');
  const prev=process.env.GAME_ALLOWED_ORIGINS;
  process.env.GAME_ALLOWED_ORIGINS='http://localhost';
  const app=createApp('/no-client',{
    service:{openSession:async()=>({}),getProfile:async()=>({}),apply:async()=>({})},
    auth:{verifyIdToken:async(_,checkRevoked)=>{assert.equal(checkRevoked,true);return {uid:'qa_test_uid'};}},
    candidateEnabled:true,candidateService:{enabled:true,
      ingest:async()=>{throw new CombatVerticalSliceError('SLICE_TERMINAL_FRAME_TAIL','private diagnostic');}}
  });
  const server=http.createServer(app);
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/candidate/battle/input`,{
      method:'POST',headers:{origin:'http://localhost','content-type':'application/json',
        authorization:`Bearer ${'a'.repeat(48)}`,'x-game-session':'local-qa-session'},
      body:JSON.stringify({chunk:{}}),
    });
    assert.equal(response.status,409);
    const body=await response.json();
    assert.equal(body.ok,false);
    assert.equal(body.code,'SLICE_TERMINAL_FRAME_TAIL');
    assert.equal(Object.hasOwn(body,'rewards'),false);
    assert.equal(Object.hasOwn(body,'grant'),false);
    assert.equal(Object.hasOwn(body,'terminalTick'),false);
    assert.doesNotMatch(JSON.stringify(body),/private diagnostic/);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(prev===undefined)delete process.env.GAME_ALLOWED_ORIGINS;
    else process.env.GAME_ALLOWED_ORIGINS=prev;
  }
});
