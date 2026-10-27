import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudQaSessionC8,requireQaC8Reply} from '../src/game/combat/CloudQaSessionC8.js';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:400,startX:0,startZ:12500,speedMultiplier:1};
const view=(tick,phase='active')=>({version:'sf-c8-alpha1-server-render-qa-v1',
  qaOnly:true,settlementEnabled:false,locationId:'alpha_stage_1',tick,phase,
  hp:1200,maxHp:1200,kills:0,contacts:0,spawnedWaves:0,config,
  pilot:{x:0,z:12500},enemies:[],shots:[],enemyShots:[]});
const reply=(tick,phase='active')=>({ok:true,qaOnly:true,safeForCloudBattle:false,
  settlementEnabled:false,battleId:BID,protocol:'pve-input-v1',
  version:'v8-c7a-qa-admission-v1',expiresAtMs:Date.now()+600000,
  nextTick:tick,phase,visual:view(tick,phase)});
function fixture(options={}){
  const calls=[];let clock=1000,last=0,openCount=0,ended=false;
  const api={
    open:async body=>{calls.push(['open',body]);openCount++;
      if(options.activeBefore&&openCount===1)throw {code:'QA_BATTLE_ALREADY_ACTIVE'};
      return reply(0);},
    status:async()=>{calls.push(['status']);return reply(0);},
    abandon:async body=>{calls.push(['abandon',body]);return {ok:true};},
    input:async body=>{
      calls.push(['input',structuredClone(body)]);
      assert.deepEqual(Object.keys(body),['chunk']);
      const c=body.chunk;assert.deepEqual(Object.keys(c).sort(),
        ['battleId','frames','protocol','startTick']);
      assert.equal(c.startTick,last);
      if(options.tailAt && c.startTick<options.tailAt
        && c.startTick+c.frames.length>options.tailAt)
        throw {code:'SLICE_TERMINAL_FRAME_TAIL'};
      if(options.changedTick)return reply(last);
      last=c.startTick+c.frames.length;
      if(options.tailAt && last>=options.tailAt)ended=true;
      if(options.endAt && last>=options.endAt)ended=true;
      return reply(last,ended?'lab-clear':'active');
    },
    receipt:async body=>{calls.push(['receipt',body]);return {ok:true,battleId:BID,
      qaOnly:true,settlementEnabled:false,phase:'lab-clear'};},
    audit:async body=>{calls.push(['audit',body]);return {ok:true,battleId:BID,
      qaOnly:true,nonEconomic:true,settlementEnabled:false,
      replayMatched:true,phase:'lab-clear',verifiedTicks:last,verifiedChunks:2};},
  };
  const updates=[];
  const session=createCloudQaSessionC8({api,viewport:{aspect:1,
    canvasWidth:360,canvasHeight:640,halfHeight:15,speedMultiplier:1},
    clock:()=>clock,randomId:()=>`c8_req_${++clock}_abcdef123456`,onUpdate:x=>updates.push(x)});
  const tick=()=>{clock+=34;return session.sample(clock);};
  return {session,tick,api,calls,updates,setClock:n=>{clock=n;},getClock:()=>clock};
}
test('C8 client: pinned admission -> 30Hz quantized intent -> server ack without client result',async()=>{
  const f=fixture();await f.session.start();
  f.session.drag(12,-20);for(let i=0;i<15;i++)f.tick();
  await f.session.flush();
  assert.equal(f.session.state.ackTick,15);
  const body=f.calls.find(x=>x[0]==='input')[1];
  assert.equal(body.chunk.frames.length,15);
  assert.ok(body.chunk.frames.every(frame=>Number.isInteger(frame.x)
    &&Number.isInteger(frame.z)&&Math.abs(frame.x)<=127&&Math.abs(frame.z)<=127));
  assert.equal(JSON.stringify(body).includes('victory'),false);
  assert.equal(JSON.stringify(body).includes('coins'),false);
  assert.equal(f.session.state.current.visual.tick,15);
  await f.session.abandon();
});
test('C8 client: non-economic terminal -> receipt -> genesis audit; no settle',async()=>{
  const f=fixture({endAt:15});await f.session.start();
  for(let i=0;i<15;i++)f.tick();await f.session.flush();
  assert.equal(f.session.state.terminal,true);
  const proof=await f.session.finish();
  assert.deepEqual(proof,{phase:'lab-clear',verifiedTicks:15,verifiedChunks:2,
    qaOnly:true,settlementEnabled:false});
  assert.deepEqual(f.calls.filter(x=>['receipt','audit'].includes(x[0])).map(x=>x[0]),
    ['receipt','audit']);
});
test('C8 client: final chunk with extra post-clear frames splits without forging terminal',async()=>{
  const f=fixture({tailAt:18});await f.session.start();
  for(let i=0;i<15;i++)f.tick();await f.session.flush();
  for(let i=0;i<15;i++)f.tick();await f.session.flush();
  assert.equal(f.session.state.ackTick,18);
  assert.equal(f.session.state.terminal,true);
  assert.ok(f.calls.filter(x=>x[0]==='input').length>=5);
  assert.equal((await f.session.finish()).phase,'lab-clear');
});
test('C8 client: cannot accept forged server response, phase, battleId or reward',()=>{
  for(const invalid of [x=>{x.qaOnly=false;},x=>{x.safeForCloudBattle=true;},
    x=>{x.settlementEnabled=true;},x=>{x.victory=true;},x=>{x.rewards={coins:9};},
    x=>{x.visual.tick=500;},x=>{x.visual.settlementEnabled=true;},
    x=>{x.battleId='other';},x=>{x.protocol='fake';}]){
    const r=reply(15);invalid(r);
    assert.throws(()=>requireQaC8Reply(r),e=>e.code==='C8_QA_SERVER_REPLY_INVALID');
  }
});
test('C8 client: stopped session rejects inputs and does not create a settlement',async()=>{
  const f=fixture();await f.session.start();f.session.stopLocal();
  assert.throws(()=>f.tick(),e=>e.code==='C8_QA_CLOSED');
  assert.equal(f.calls.filter(x=>x[0]==='input').length,0);
});
test('C8 client: guest/accountless scene cannot start without authenticated transport',()=>{
  assert.throws(()=>createCloudQaSessionC8({api:{},clock:()=>1,
    viewport:{},randomId:()=>''}),/dependencies/);
});
test('C8 client: active QA ticket after app crash is abandoned before opening new one',async()=>{
  const f=fixture({activeBefore:true});await f.session.start();
  assert.deepEqual(f.calls.map(c=>c[0]),['open','status','abandon','open']);
});
test('C8 client: local clock gap aborts without backfilling fake inputs',async()=>{
  const f=fixture();await f.session.start();f.tick();
  f.setClock(f.getClock()+400);
  assert.throws(()=>f.tick(),e=>e.code==='C8_QA_CLOCK_GAP');
  assert.equal(f.calls.filter(x=>x[0]==='input').length,0);
});
test('C8 client: high-frequency duplicate timer call cannot create extra ticks',async()=>{
  const f=fixture();await f.session.start();f.tick();
  const next=f.session.sample(f.getClock()+5);assert.equal(next,null);
  assert.equal(f.session.state.pending,1);
});
test('C8 client: receipt reject cannot turn a QA result into a reward',async()=>{
  const f=fixture({endAt:15});f.api.receipt=async()=>({ok:true,qaOnly:false,
    settlementEnabled:true,phase:'lab-clear',battleId:BID});
  await f.session.start();for(let i=0;i<15;i++)f.tick();await f.session.flush();
  await assert.rejects(f.session.finish(),e=>e.code==='C8_QA_RECEIPT_INVALID');
});
test('C8 client: server changes ticket or ack tick -> stop with error',async()=>{
  const f=fixture({changedTick:true});await f.session.start();
  for(let i=0;i<15;i++)f.tick();await f.session.flush();
  assert.equal(f.session.state.error.code,'C8_QA_SERVER_REPLY_INVALID');
});
