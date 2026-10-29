import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudCandidateSessionC12} from '../src/game/combat/CloudCandidateSessionC12.js';

// This fixture is intentionally QA-only: no Firebase identity, real HTTP,
// production outcome, payout, or ability to change authoritative battle state.
const BID='c6d811b9-93b1-48b8-a6e8-83b97d6ff15a';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:400,startX:0,startZ:12500,speedMultiplier:1};
const reply=(tick,phase='active')=>({ok:true,version:'v8-c11-production-namespace-candidate-v1',
  battleId:BID,nextTick:tick,phase,terminal:phase!=='active',
  expiresAtMs:Date.now()+600000,protocol:'pve-input-v1',qaOnly:true,
  qaSourceModel:true,candidateOnly:true,nonEconomic:true,
  eligibleForSettlement:false,safeForCloudBattle:false,settlementEnabled:false,
  visual:{version:'sf-c8-alpha1-server-render-qa-v1',qaOnly:true,
    settlementEnabled:false,locationId:'alpha_stage_1',tick,phase,
    hp:1050,maxHp:1050,kills:0,config,pilot:{x:0,z:12500},
    enemies:[],shots:[],enemyShots:[]}});
function fixture({terminalAt=40,maliciousError=false,pausePrefix=false}={}){
  let ms=1000,serverTick=0,inFlight=0,maxConcurrent=0,pendingResume=null;
  const calls=[],accepted=[];
  let pauseTriggered=false;
  const api={
    open:async()=>reply(0),status:async()=>reply(serverTick),
    audit:async()=>({ok:true,battleId:BID,phase:'candidate-defeat',
      verifiedTicks:serverTick,verifiedChunks:accepted.length,candidateOnly:true,
      nonEconomic:true,eligibleForSettlement:false,safeForCloudBattle:false,
      productionReplayApproved:false}),
    abandon:async()=>({ok:true,candidateOnly:true,nonEconomic:true,
      eligibleForSettlement:false,abandoned:true}),
    input:async({chunk})=>{
      assert.equal(inFlight,0,'never send parallel network chunks');inFlight++;
      maxConcurrent=Math.max(maxConcurrent,inFlight);
      try{
        assert.equal(chunk.startTick,serverTick,'must use contiguous server-ACK start');
        assert.equal(chunk.protocol,'pve-input-v1');
        assert.equal(chunk.battleId,BID);
        assert.ok(chunk.frames.length>=1&&chunk.frames.length<=30);
        assert.ok(chunk.frames.every(f=>Object.keys(f).sort().join(',')==='x,z'));
        calls.push({startTick:chunk.startTick,count:chunk.frames.length});
        if(pausePrefix&& !pauseTriggered && chunk.startTick===15 && chunk.frames.length===15){
          pauseTriggered=true;
          await new Promise(resolve=>{pendingResume=resolve;});
        }
        if(maliciousError && chunk.frames.length===30)
          throw Object.assign(new Error('unrecoverable'),{code:'INTERNAL_ERROR',status:500});
        // Authoritative simulator refuses the whole request if its input
        // includes even ONE frame after the exact server terminal tick.
        if(chunk.startTick+chunk.frames.length>terminalAt)
          throw Object.assign(new Error('terminal tail'),
            {code:'SLICE_TERMINAL_FRAME_TAIL',status:409});
        serverTick+=chunk.frames.length;
        accepted.push({start:chunk.startTick,frames:structuredClone(chunk.frames)});
        return reply(serverTick,serverTick===terminalAt?'lab-defeat':'active');
      }finally{inFlight--;}
    }
  };
  const s=createCloudCandidateSessionC12({api,viewport:{aspect:1,
    canvasWidth:360,canvasHeight:640,halfHeight:15},clock:()=>ms,
    randomId:()=>`c12_terminal_${++ms}`,onUpdate:()=>{}});
  const sample=n=>{const arr=[];for(let i=0;i<n;i++){ms+=34;arr.push(s.sample(ms));}return arr;};
  const awaitPaused=async()=>{
    for(let i=0;i<12&&!pendingResume;i++)await new Promise(r=>setImmediate(r));
    assert.equal(typeof pendingResume,'function');
  };
  return {s,sample,calls,accepted,awaitPaused,
    resume:()=>{const fn=pendingResume;pendingResume=null;fn();},
    get serverTick(){return serverTick;},get maxConcurrent(){return maxConcurrent;}};
}

test('C12-PERF-B terminal mid-30-frame request recovers only original ordered prefixes',async()=>{
  const f=fixture({terminalAt:40});await f.s.start();
  f.sample(15);await f.s.flush();assert.equal(f.s.state.ackTick,15);
  f.sample(30);await f.s.flush();
  assert.equal(f.serverTick,40);
  assert.equal(f.s.state.ackTick,40);
  assert.equal(f.s.state.terminal,true);
  assert.equal(f.s.state.error,null);
  assert.equal(f.s.state.pending,0);
  assert.equal(f.s.state.diagnostics.interrupted,false);
  assert.equal(f.s.state.diagnostics.mismatchedCheckpoints,0);
  assert.equal(f.s.state.diagnostics.eligibleForSettlement,false);
  assert.ok(f.calls.length<=10,'bounded number of retries, not 30 singleton requests');
  assert.ok(f.calls.some(c=>c.count===30));
  assert.ok(f.accepted.every(({start,frames})=>start+frames.length<=40));
  let previous=0;
  for(const e of f.accepted){assert.equal(e.start,previous);previous+=e.frames.length;}
  assert.equal(previous,40);
  assert.equal(f.maxConcurrent,1);
  const proof=await f.s.finish();
  assert.equal(proof.eligibleForSettlement,false);
  assert.equal(proof.verifiedTicks,40);
});

test('C12 recovery pauses local sampling while searching the authoritative boundary',async()=>{
  const f=fixture({terminalAt:40,pausePrefix:true});await f.s.start();
  f.sample(15);await f.s.flush();
  f.sample(30);
  await f.awaitPaused();
  const before=f.s.state.diagnostics.sampledTicks;
  const pending=f.s.state.pending;
  assert.ok(f.sample(15).every(x=>x===null));
  assert.equal(f.s.state.diagnostics.sampledTicks,before);
  assert.equal(f.s.state.pending,pending);
  f.resume();await f.s.flush();
  assert.equal(f.s.state.ackTick,40);
  assert.equal(f.s.state.error,null);
  assert.equal(f.s.state.diagnostics.maxPendingFrames<=60,true);
  f.s.stopLocal();
});

test('C12 can recover a terminal at the first tick of a 30-frame batch',async()=>{
  const f=fixture({terminalAt:16});await f.s.start();
  f.sample(15);await f.s.flush();
  f.sample(30);await f.s.flush();
  assert.equal(f.s.state.ackTick,16);
  assert.equal(f.s.state.terminal,true);
  assert.ok(f.calls.length<=9);
  assert.equal(f.maxConcurrent,1);
});

test('C12 does not suppress real HTTP 500 into terminal recovery',async()=>{
  const f=fixture({terminalAt:40,maliciousError:true});await f.s.start();
  f.sample(15);await f.s.flush();
  f.sample(30);await f.s.flush();
  assert.equal(f.s.state.ackTick,15);
  assert.equal(f.s.state.error?.code,'INTERNAL_ERROR');
  assert.equal(f.s.state.diagnostics.interrupted,true);
  assert.equal(f.s.state.terminal,false);
  assert.equal(f.calls.filter(c=>c.startTick===15).length,1);
});
