'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {openInputJournal,ingestInputChunk,validateChunk}
  =require('../lib/combatInputJournalV8.cjs');

const uid='c12-perf-b-test-uid',sessionId='52ae6d4d-0f1b-4bd4-8d90-2f403d4b14a5';
const battleId='e9c0f3b3-80ce-4eb1-a7b9-147b126590ad';
const issuedAtMs=1700000000000;
const input=(startTick,length)=>({protocol:'pve-input-v1',battleId,startTick,
  frames:Array.from({length},()=>({x:0,z:0}))});
const origin=()=>openInputJournal({uid,sessionId,battleId,
  rulesVersion:'v8b1-qa',loadoutHash:'a'.repeat(64),issuedAtMs});

test('C12-PERF-B 30-frame chunks satisfy unchanged server anti-fast-forward at real 30Hz',()=>{
  const a=ingestInputChunk(origin(),input(0,15),issuedAtMs+850);
  assert.equal(a.journal.nextTick,15);
  const b=ingestInputChunk(a.journal,input(15,30),issuedAtMs+1800);
  assert.equal(b.journal.nextTick,45);
  const c=ingestInputChunk(b.journal,input(45,30),issuedAtMs+2800);
  assert.equal(c.journal.nextTick,75);
  const duplicated=ingestInputChunk(c.journal,input(45,30),issuedAtMs+2810);
  assert.equal(duplicated.duplicate,true);
  assert.equal(duplicated.journal.digest,c.journal.digest);
});

test('C12-PERF-B 30 frames cannot bypass server clock, sequence or chunk size',()=>{
  assert.throws(()=>ingestInputChunk(origin(),input(0,30),issuedAtMs+100),
    {code:'INPUT_FAST_FORWARD'});
  assert.throws(()=>ingestInputChunk(origin(),input(2,30),issuedAtMs+1100),
    {code:'INPUT_SEQUENCE_INVALID'});
  assert.throws(()=>validateChunk(input(0,61)),{code:'INPUT_CHUNK_INVALID'});
});
