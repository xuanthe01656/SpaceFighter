import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudCandidateSessionC12} from '../src/game/combat/CloudCandidateSessionC12.js';
const ID='e9c0f3b3-80ce-4eb1-a7b9-147b126590ad';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:400,startX:0,startZ:12500,speedMultiplier:1};
function fixture({drift=0}={}){
  let ms=0,tick=0,x=0,z=12500;const calls=[];
  const visual=()=>({version:'sf-c8-alpha1-server-render-qa-v1',qaOnly:true,
    settlementEnabled:false,locationId:'alpha_stage_1',phase:'active',tick,
    hp:500,maxHp:500,kills:0,contacts:0,spawnedWaves:0,config,
    pilot:{x:x+drift,z},enemies:[],shots:[],enemyShots:[]});
  const reply=()=>({ok:true,candidateOnly:true,nonEconomic:true,
    eligibleForSettlement:false,safeForCloudBattle:false,
    settlementEnabled:false,qaSourceModel:true,qaOnly:true,
    protocol:'pve-input-v1',battleId:ID,expiresAtMs:12345678900,
    nextTick:tick,phase:'active',visual:visual()});
  const api={open:async()=>reply(),status:async()=>reply(),audit:async()=>{throw Error('unreached');},
    abandon:async()=>({abandoned:true}),input:async({chunk})=>{
      calls.push(chunk);assert.equal(chunk.startTick,tick);
      for(const f of chunk.frames){x=Math.max(-12500,Math.min(12500,x-Math.round(f.x*400/127)));
        z=Math.max(-14300,Math.min(14300,z+Math.round(f.z*400/127)));tick++;}
      return reply();
    }};
  const session=createCloudCandidateSessionC12({api,
    viewport:{aspect:1,canvasWidth:360,canvasHeight:640,halfHeight:15},
    clock:()=>ms,randomId:()=>`req_c13_${++ms}_abcdefghijkl`,onUpdate:()=>{}});
  const step=()=>{ms+=34;return session.sample(ms);};
  return {session,step,calls};
}
test('C13 C12 real quantized input aligns predictor with authoritative 30Hz pilot',async()=>{
  const f=fixture();await f.session.start();f.session.drag(40,-20);
  for(let i=0;i<15;i++)f.step();await f.session.flush();
  const r=f.session.getDiagnostics();
  assert.equal(r.matchedCheckpoints,2); // genesis plus tick 15
  assert.equal(r.mismatchedCheckpoints,0);assert.equal(r.maxAbsDxUnits,0);
  assert.equal(r.acknowledgedTick,15);
  assert.equal(f.calls.length,1);
});
test('C13 C12 reports drift when checkpoint pilot differs from predicted',async()=>{
  const f=fixture({drift:11});await f.session.start();
  for(let i=0;i<15;i++)f.step();await f.session.flush();
  const r=f.session.getDiagnostics();
  assert.equal(r.status,'DRIFT_REVIEW_REQUIRED');
  assert.ok(r.mismatchedCheckpoints>=1);
  assert.equal(r.productionReplayApproved,false);
});
test('C13 session diagnostics do not enter network payload or economy',async()=>{
  const f=fixture();await f.session.start();
  for(let i=0;i<15;i++)f.step();await f.session.flush();
  for(const chunk of f.calls){
    assert.deepEqual(Object.keys(chunk).sort(),['battleId','frames','protocol','startTick']);
    assert.ok(chunk.frames.every(frame=>Object.keys(frame).sort().join(',')==='x,z'));
  }
  const r=f.session.state.diagnostics;
  assert.equal(r.localOnly,true);assert.equal(r.networkUpload,false);
});
