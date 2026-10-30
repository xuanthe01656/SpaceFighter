import test from 'node:test';
import assert from 'node:assert/strict';
import {openC15LocalJournal,appendC15LocalFrame,takeC15UploadChunk,serializeC15LocalJournal,restoreC15LocalJournal,
  c15JournalSummary} from '../src/game/combat/C15LocalJournal.js';
import {createC15JournalUploader} from '../src/game/c15/C15JournalUploader.js';
import {createC15MemoryStore} from '../src/game/c15/C15Rc1bStore.js';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const open=()=>openC15LocalJournal({battleId:BID,rulesVersion:'combat-v1.0.0',loadoutHash:'a'.repeat(64),issuedAtMs:1});

test('C15 journal serialization restores exact pending/inflight continuity',()=>{
  let state=open();for(let i=0;i<20;i++)state=appendC15LocalFrame(state,{x:i%2?127:0,z:0});
  const taken=takeC15UploadChunk(state);state=taken.state;const restored=restoreC15LocalJournal(serializeC15LocalJournal(state));
  assert.deepEqual(serializeC15LocalJournal(restored),serializeC15LocalJournal(state));
});


test('C15 uploader batches 15 then 30, retries immutable in-flight chunk and closes',async()=>{
  const store=createC15MemoryStore(),sent=[];let failOnce=true,now=100;
  const upload=async(_uid,body)=>{sent.push(structuredClone(body.chunk));if(failOnce){failOnce=false;throw Object.assign(new Error('offline'),{code:'TIMEOUT'});}
    return {battleId:BID,startTick:body.chunk.startTick,endTick:body.chunk.startTick+body.chunk.frames.length};};
  const uploader=createC15JournalUploader({uid:'u',battleId:BID,journal:open(),store,uploadChunk:upload,clock:()=>++now,online:()=>true});
  for(let i=0;i<45;i++)uploader.append({x:0,z:0});
  await uploader.flush({throwOnError:false});assert.equal(sent[0].startTick,0);assert.equal(sent[0].frames.length,15);
  await uploader.flush();const summary=await uploader.close().then(()=>uploader.getView().summary);
  assert.equal(summary.ticks,45);assert.equal(summary.chunks,2);assert.equal(summary.closed,true);
  assert.deepEqual(sent[0],sent[1]);assert.equal(sent.at(-1).frames.length,30);
});

test('C15 uploader keeps gameplay local while offline and resumes later',async()=>{
  const store=createC15MemoryStore(),sent=[];let online=false;
  const uploader=createC15JournalUploader({uid:'u',battleId:BID,journal:open(),store,online:()=>online,
    uploadChunk:async(_uid,body)=>{sent.push(body.chunk);return {battleId:BID,startTick:body.chunk.startTick,endTick:body.chunk.startTick+body.chunk.frames.length};}});
  for(let i=0;i<60;i++)uploader.append({x:0,z:0});
  await uploader.pump();assert.equal(sent.length,0);assert.equal(c15JournalSummary(uploader.getJournal()).ticks,60);
  online=true;await uploader.flush();assert.equal(sent.length,3);assert.deepEqual(sent.map(x=>x.frames.length),[15,30,15]);
});
