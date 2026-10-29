import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudCandidateSessionC12} from '../src/game/combat/CloudCandidateSessionC12.js';

const BID='b6d8575c-2cd0-4d37-bcc6-423e7e7868b9';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:400,startX:0,startZ:12500,speedMultiplier:1};
const reply=(tick,phase='active')=>({ok:true,battleId:BID,nextTick:tick,
  phase,expiresAtMs:Date.now()+600000,protocol:'pve-input-v1',
  qaOnly:true,qaSourceModel:true,candidateOnly:true,nonEconomic:true,
  eligibleForSettlement:false,safeForCloudBattle:false,settlementEnabled:false,
  visual:{version:'sf-c8-alpha1-server-render-qa-v1',qaOnly:true,
    settlementEnabled:false,locationId:'alpha_stage_1',tick,phase,
    hp:1050,maxHp:1050,kills:0,config,pilot:{x:0,z:12500},
    enemies:[],shots:[],enemyShots:[]}});
function fixture(){
  let ms=1000,ack=0,inflight=0,maxInflight=0;
  const calls=[];
  const api={
    open:async()=>reply(0),status:async()=>reply(ack),
    input:({chunk})=>{
      assert.equal(inflight,0,'candidate input is strictly serial');
      assert.equal(chunk.startTick,ack);
      assert.deepEqual(Object.keys(chunk.frames[0]).sort(),['x','z']);
      inflight++;maxInflight=Math.max(maxInflight,inflight);
      return new Promise(resolve=>calls.push({count:chunk.frames.length,
        startTick:chunk.startTick,resolve:()=>{
          ack+=chunk.frames.length;inflight--;resolve(reply(ack));
        }}));
    },
    audit:async()=>{throw new Error('never audit active QA run');},
    abandon:async()=>({ok:true,candidateOnly:true,nonEconomic:true,
      eligibleForSettlement:false,abandoned:true}),
  };
  const updates=[];
  const session=createCloudCandidateSessionC12({api,viewport:{aspect:1,
    canvasWidth:360,canvasHeight:640,halfHeight:15},clock:()=>ms,
    randomId:()=>`backpressure_${++ms}`,onUpdate:info=>updates.push(info)});
  const sample=(n)=>{let last=null;for(let i=0;i<n;i++){
    ms+=34;last=session.sample(ms);
  }return last;};
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {session,calls,sample,settle,updates,setTime:t=>{ms=t;},
    get maxInflight(){return maxInflight;}};
}

test('C12 transient congestion stops sampling at 60, then resumes with original contiguous journal',async()=>{
  const f=fixture();await f.session.start();f.sample(60);
  assert.equal(f.session.state.ackTick,0);
  assert.equal(f.session.state.pending,60);
  assert.equal(f.calls.length,1);
  assert.equal(f.sample(35),null);
  assert.equal(f.session.state.diagnostics.sampledTicks,60,'no 35 invented delayed ticks');
  assert.equal(f.session.state.pending,60);
  assert.equal(f.session.state.error,null);
  assert.equal(f.session.state.transport.waiting,true);
  assert.equal(f.session.state.transport.waitCount,1);
  assert.ok(f.session.state.transport.waitMs>1000);
  assert.equal(f.session.state.transport.maxPendingFrames,60);
  assert.equal(f.maxInflight,1);
  assert.ok(f.session.state.transport.inflightMs>1000,
    'inflight age is measured even though maxRtt only includes completed calls');
  f.calls[0].resolve();await f.settle();
  assert.equal(f.session.state.ackTick,15);
  assert.equal(f.session.state.pending,45);
  assert.equal(f.calls.length,2,'second batch sent after first ACK, never concurrently');
  const sampled=f.sample(1);
  assert.equal(sampled.tick,61,'sampling continues from real 60, no catch-up');
  assert.equal(f.session.state.transport.waiting,false);
  assert.equal(f.session.state.transport.waitCount,1);
  assert.ok(f.session.state.transport.totalWaitMs>1000);
  assert.equal(f.session.state.error,null);
  assert.equal(f.session.state.diagnostics.mismatchedCheckpoints,0);
  assert.equal(f.session.state.diagnostics.eligibleForSettlement,false);
  assert.equal(f.maxInflight,1);
  f.session.stopLocal();
});

test('C12 4-second congestion still fails closed, without forging queued frames or a receipt',async()=>{
  const f=fixture();await f.session.start();f.sample(60);
  assert.equal(f.sample(118),null);
  assert.throws(()=>f.sample(1),/C12_NETWORK_BACKPRESSURE_TIMEOUT/);
  const s=f.session.state;
  assert.equal(s.pending,60);
  assert.equal(s.diagnostics.sampledTicks,60);
  assert.equal(s.error?.message,'C12_NETWORK_BACKPRESSURE_TIMEOUT');
  assert.equal(s.diagnostics.interrupted,true);
  assert.equal(s.diagnostics.terminal,false);
  assert.equal(s.diagnostics.auditComplete,false);
  assert.equal(s.diagnostics.eligibleForSettlement,false);
  assert.equal(s.diagnostics.cloudRewards,false);
  assert.equal(f.calls.length,1);
  f.calls[0].resolve();await f.settle();
  assert.equal(f.session.state.ackTick,0,'late ACK after fatal stall is not accepted');
  f.session.stopLocal();
});

test('C12 real Android background gap still fails closed even during network wait',async()=>{
  const f=fixture();await f.session.start();f.sample(60);f.sample(1);
  const sampled=f.session.state.diagnostics.sampledTicks;
  f.setTime(50000);
  assert.throws(()=>f.session.sample(50000),/C12_CLOCK_GAP_RESTART/);
  assert.equal(f.session.state.diagnostics.sampledTicks,sampled);
  assert.equal(f.session.state.diagnostics.eligibleForSettlement,false);
  f.session.stopLocal();
});

test('C12 transport diagnostics are bounded numeric and do not contain identity or raw inputs',async()=>{
  const f=fixture();await f.session.start();f.sample(60);f.sample(3);
  const d=f.session.state.transport;
  assert.equal(d.pendingFrames,60);
  assert.equal(d.maxPendingFrames,60);
  assert.ok(d.waitMs>=0);
  assert.ok(d.inflightMs>=0);
  assert.equal(d.waiting,true);
  for(const secret of ['uid','battleId','accessToken','rawInput','frames','password'])
    assert.equal(Object.hasOwn(d,secret),false);
  f.session.stopLocal();
});
