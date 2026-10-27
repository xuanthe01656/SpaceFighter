import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudCandidateSessionC12,requireCandidateReplyC12}
  from '../src/game/combat/CloudCandidateSessionC12.js';
const BID='e9c0f3b3-80ce-4eb1-a7b9-147b126590ad';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:400,startX:0,startZ:12500,speedMultiplier:1};
const view=(tick,phase='active')=>({version:'sf-c8-alpha1-server-render-qa-v1',
  qaOnly:true,settlementEnabled:false,locationId:'alpha_stage_1',tick,phase,
  hp:1200,maxHp:1200,kills:0,contacts:0,spawnedWaves:0,config,
  pilot:{x:0,z:12500},enemies:[],shots:[],enemyShots:[]});
const reply=(tick,phase='active')=>({ok:true,version:'v8-c11-production-namespace-candidate-v1',
  battleId:BID,nextTick:tick,phase,terminal:phase!=='active',
  expiresAtMs:Date.now()+600000,protocol:'pve-input-v1',
  qaOnly:true,qaSourceModel:true,candidateOnly:true,nonEconomic:true,
  eligibleForSettlement:false,safeForCloudBattle:false,settlementEnabled:false,
  visual:view(tick,phase)});
const proof=(last=15)=>({ok:true,battleId:BID,phase:'candidate-clear',
  candidateOnly:true,nonEconomic:true,eligibleForSettlement:false,
  safeForCloudBattle:false,productionReplayApproved:false,
  verifiedTicks:last,verifiedChunks:1});
function fixture(options={}){
  let ms=1000,tick=0,opened=0,ended=false;
  const calls=[];
  const api={
    open:async body=>{calls.push(['open',body]);opened++;
      if(options.alreadyActive&&opened===1)throw {code:'C11_TICKET_ACTIVE'};
      return reply(0);},
    status:async()=>{calls.push(['status']);return reply(0);},
    abandon:async body=>{calls.push(['abandon',body]);return {ok:true,abandoned:true,
      candidateOnly:true,nonEconomic:true,eligibleForSettlement:false};},
    input:async body=>{
      calls.push(['input',structuredClone(body)]);
      assert.deepEqual(Object.keys(body),['chunk']);
      const ch=body.chunk;
      assert.deepEqual(Object.keys(ch).sort(),['battleId','frames','protocol','startTick']);
      assert.equal(ch.startTick,tick);
      if(options.terminalTail && tick<options.terminalTail
        && tick+ch.frames.length>options.terminalTail)
        throw {code:'SLICE_TERMINAL_FRAME_TAIL'};
      tick+=ch.frames.length;
      if(options.endAt&&tick>=options.endAt)ended=true;
      if(options.terminalTail&&tick>=options.terminalTail)ended=true;
      return reply(tick,ended?'lab-clear':'active');
    },
    audit:async body=>{calls.push(['audit',body]);return options.badAudit
      ? {...proof(tick),eligibleForSettlement:true}:proof(tick);},
  };
  const updates=[];
  const session=createCloudCandidateSessionC12({api,
    viewport:{aspect:1,canvasWidth:360,canvasHeight:640,halfHeight:15},
    clock:()=>ms,randomId:()=>`c12_req_${++ms}_x123456`,onUpdate:x=>updates.push(x)});
  const sample=()=>{ms+=34;return session.sample(ms);};
  return {session,sample,calls,api,setClock:x=>{ms=x;},updates};
}
test('C12 client: accepts candidate-only server checkpoint and 30Hz quantized input',async()=>{
  const f=fixture();await f.session.start();f.session.drag(10,-20);
  for(let i=0;i<15;i++)f.sample();await f.session.flush();
  assert.equal(f.session.state.ackTick,15);
  assert.equal(f.session.state.current.visual.tick,15);
  const inp=f.calls.find(x=>x[0]==='input')[1];
  assert.ok(inp.chunk.frames.every(x=>Object.keys(x).sort().join(',')==='x,z'));
  assert.equal(JSON.stringify(inp).includes('victory'),false);
  assert.equal(JSON.stringify(inp).includes('rewards'),false);
  await f.session.abandon();
});
test('C12 client: finish requests independent candidate audit, never C10 receipt',async()=>{
  const f=fixture({endAt:15});await f.session.start();
  for(let i=0;i<15;i++)f.sample();await f.session.flush();
  assert.equal(f.session.state.terminal,true);
  const a=await f.session.finish();
  assert.deepEqual(a,{phase:'candidate-clear',verifiedTicks:15,verifiedChunks:1,
    candidateOnly:true,eligibleForSettlement:false});
  assert.deepEqual(f.calls.filter(x=>x[0]==='audit').length,1);
  assert.ok(!f.calls.some(x=>x[0]==='receipt'||x[0]==='settle'));
});
test('C12 client: abandoned prior candidate is closed before new open',async()=>{
  const f=fixture({alreadyActive:true});await f.session.start();
  assert.deepEqual(f.calls.map(x=>x[0]),['open','status','abandon','open']);
});
test('C12 client: terminal tail is split into valid frames, no invented input',async()=>{
  const f=fixture({terminalTail:18});await f.session.start();
  for(let i=0;i<15;i++)f.sample();await f.session.flush();
  for(let i=0;i<15;i++)f.sample();await f.session.flush();
  assert.equal(f.session.state.ackTick,18);assert.equal(f.session.state.terminal,true);
});
test('C12 client: never accepts candidate reply with production reward grant or missing flags',()=>{
  for(const r of [{...reply(0),rewards:{coins:450}},
    {...reply(0),eligibleForSettlement:true},{...reply(0),candidateOnly:false},
    {...reply(0),victory:true},{...reply(0),settlementEnabled:true},
    {...reply(0),visual:{...view(0),tick:1}}])
    assert.throws(()=>requireCandidateReplyC12(r),{code:'C12_UNTRUSTED_CANDIDATE_REPLY'});
});
test('C12 client: audit proof with production settlement entitlement must fail closed',async()=>{
  const f=fixture({endAt:15,badAudit:true});await f.session.start();
  for(let i=0;i<15;i++)f.sample();await f.session.flush();
  await assert.rejects(f.session.finish(),{code:'C12_AUDIT_NOT_NON_ECONOMIC'});
});
test('C12 client: app background clock gap halts sampling; no time catch-up',async()=>{
  const f=fixture();await f.session.start();f.sample();
  f.setClock(999999);
  assert.throws(()=>f.sample(),/C12_CLOCK_GAP_RESTART/);
  assert.equal(f.session.state.ackTick,0);
});
