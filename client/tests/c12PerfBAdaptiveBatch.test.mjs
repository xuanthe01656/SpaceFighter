import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudCandidateSessionC12} from '../src/game/combat/CloudCandidateSessionC12.js';

// Isolated QA transport fixture. It models delayed ACKs without real Firebase,
// real networking, or any route capable of changing the economy.
const BID='e9c0f3b3-80ce-4eb1-a7b9-147b126590ad';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:400,startX:0,startZ:12500,speedMultiplier:1};
const reply=tick=>({ok:true,version:'v8-c11-production-namespace-candidate-v1',
  battleId:BID,nextTick:tick,phase:'active',terminal:false,
  expiresAtMs:Date.now()+600000,protocol:'pve-input-v1',qaOnly:true,
  qaSourceModel:true,candidateOnly:true,nonEconomic:true,
  eligibleForSettlement:false,safeForCloudBattle:false,settlementEnabled:false,
  visual:{version:'sf-c8-alpha1-server-render-qa-v1',qaOnly:true,
    settlementEnabled:false,locationId:'alpha_stage_1',tick,phase:'active',
    hp:1050,maxHp:1050,kills:0,config,pilot:{x:0,z:12500},
    enemies:[],shots:[],enemyShots:[]}});
function fixture(){
  let ms=1000,ackTick=0,inFlight=0,maxConcurrent=0;
  const calls=[];
  const api={
    open:async()=>reply(0),status:async()=>reply(ackTick),
    audit:async()=>{throw Error('C12 cannot audit active run');},
    abandon:async()=>({ok:true,candidateOnly:true,nonEconomic:true,
      abandoned:true,eligibleForSettlement:false}),
    input:({chunk})=>{
      assert.equal(chunk.startTick,ackTick);
      assert.equal(inFlight,0,'inputs must never be sent in parallel');
      assert.ok([15,30,1].includes(chunk.frames.length));
      assert.deepEqual(Object.keys(chunk).sort(),['battleId','frames','protocol','startTick']);
      assert.ok(chunk.frames.every(frame=>Object.keys(frame).sort().join(',')==='x,z'));
      inFlight++;maxConcurrent=Math.max(maxConcurrent,inFlight);
      return new Promise(resolve=>calls.push({chunk,resolve:(tick)=>{
        ackTick=tick;inFlight--;resolve(reply(tick));
      }}));
    },
  };
  const session=createCloudCandidateSessionC12({api,
    viewport:{aspect:1,canvasWidth:360,canvasHeight:640,halfHeight:15},
    clock:()=>ms,randomId:()=>`c12_perf_b_${++ms}_a1b2c3`,onUpdate:()=>{}});
  const sample=(n)=>{for(let i=0;i<n;i++){ms+=34;session.sample(ms);}};
  const settle=async()=>{
    // Flush async continuation, including the pump's finally branch.
    await new Promise(resolve=>setImmediate(resolve));
  };
  return {session,calls,sample,settle,get maxConcurrent(){return maxConcurrent;}};
}

test('C12-PERF-B amortizes steady inputs: 15 warmup then sequential 30, preserving C13',async()=>{
  const f=fixture();await f.session.start();
  f.sample(15);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].chunk.startTick,0);
  assert.equal(f.calls[0].chunk.frames.length,15);
  f.sample(24); // 39 sampled while the first server ACK is still pending
  assert.equal(f.session.state.pending,39);
  f.calls[0].resolve(15);await f.settle();
  assert.equal(f.session.state.ackTick,15);
  assert.equal(f.session.state.pending,24);
  f.sample(6);
  assert.equal(f.calls.length,2);
  assert.equal(f.calls[1].chunk.startTick,15);
  assert.equal(f.calls[1].chunk.frames.length,30);
  f.sample(24);
  assert.equal(f.session.state.pending,54);
  f.calls[1].resolve(45);await f.settle();
  assert.equal(f.session.state.ackTick,45);
  assert.equal(f.session.state.pending,24);
  f.sample(6);
  assert.equal(f.calls.length,3);
  assert.equal(f.calls[2].chunk.startTick,45);
  assert.equal(f.calls[2].chunk.frames.length,30);
  f.calls[2].resolve(75);await f.settle();
  const r=f.session.getDiagnostics();
  assert.equal(r.acknowledgedTick,75);
  assert.equal(r.mismatchedCheckpoints,0);
  assert.equal(r.matchedCheckpoints,4); // genesis + three ACKs
  assert.equal(r.eligibleForSettlement,false);
  assert.equal(r.cloudRewards,false);
  assert.equal(f.maxConcurrent,1);
  assert.equal(f.session.state.error,null);
  f.session.stopLocal();
});

test('C12-PERF-B retains strict 60 pending frame limit if server ACK is lost',async()=>{
  const f=fixture();await f.session.start();f.sample(60);
  assert.equal(f.session.state.pending,60);
  assert.equal(f.calls.length,1); // no overlapping/forged chunks
  assert.throws(()=>f.sample(1),/C12_NETWORK_BACKPRESSURE/);
  assert.equal(f.session.state.error?.message,'C12_NETWORK_BACKPRESSURE');
  assert.equal(f.session.state.diagnostics.interrupted,true);
  assert.equal(f.session.state.diagnostics.eligibleForSettlement,false);
  f.session.stopLocal();
});
