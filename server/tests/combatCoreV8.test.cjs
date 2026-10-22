'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openInputJournal } = require('../lib/combatInputJournalV8.cjs');
const { CORE_VERSION, TICK_HZ, UNITS_PER_WORLD, openCombatCore, replayAcceptedChunk }
  = require('../lib/combatCoreV8.cjs');
const ISSUED=Date.parse('2026-10-22T00:00:00Z');
const UID='v8b2_server_fixture';
const BATTLE='62b6a2b9-46c0-4071-9456-4c7242a45da8';
const SESSION='f1b28f12-2562-4115-b337-72c673b621c9';
const HASH='e'.repeat(64);
const frame=(x=0,z=0)=>({x,z});
const packet=(startTick,frames)=>({protocol:'pve-input-v1',battleId:BATTLE,startTick,frames});
function fixture(overrides={}) {
  const journal=openInputJournal({uid:UID,sessionId:SESSION,battleId:BATTLE,
    rulesVersion:'combat-v1.0.0',loadoutHash:HASH,issuedAtMs:ISSUED});
  const pilot={x:0,z:7000,hp:1200,maxHp:1200,armor:20,atk:100,
    movePerTick:600,fireEveryTicks:12,shotSpeed:1560,hitRadius:700,bulletRadius:200,
    critChancePermille:0,critBonusPermille:250,dodgeChancePermille:0,...overrides.pilot};
  const config={journal,seed:247927,arena:{halfWidth:13200,halfHeight:13200},pilot,
    enemies:overrides.enemies??[{id:'enemy_001',x:0,z:-6000,hp:200,
      speedPerTick:0,damage:200,hitRadius:900,behavior:'static'}]};
  return {journal,config,state:openCombatCore(config)};
}
const go=({journal,state},start,frames,at=ISSUED+1000+Math.ceil((start+frames.length)*1000/30)) =>
  replayAcceptedChunk({state,journal,chunk:packet(start,frames),receivedAtMs:at});

// Contract/golden fixtures. These tests do not imply production Campaign/Dungeon parity.
test('V8B-2A: headless 30Hz integer-scale kernel, no combat settlement export',()=>{
  const c=require('../lib/combatCoreV8.cjs');
  assert.equal(TICK_HZ,30);assert.equal(UNITS_PER_WORLD,1000);
  assert.equal(CORE_VERSION,'pve-core-poc-v1');
  assert.deepEqual(Object.keys(c).sort(),['CORE_VERSION','CombatCoreError','MAX_BULLETS',
    'MAX_ENEMIES','TICK_HZ','UNITS_PER_WORLD','openCombatCore','replayAcceptedChunk'].sort());
  assert.equal(/firebase|babylon|reward|gameService|economy/i.test(require('node:fs')
    .readFileSync(require.resolve('../lib/combatCoreV8.cjs'),'utf8')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'')),false);
});
test('V8B-2A: same accepted frames, seed and server timestamps replay identically',()=>{
  const a=fixture(), b=fixture();
  let ra=go(a,0,Array(30).fill(null).map(()=>frame(0,0)));
  let rb=go(b,0,Array(30).fill(null).map(()=>frame(0,0)));
  assert.equal(ra.state.stateDigest,rb.state.stateDigest);
  assert.equal(ra.journal.digest,rb.journal.digest);
  ra=go(ra,30,Array(30).fill(null).map(()=>frame(127,0)),ISSUED+2500);
  rb=go(rb,30,Array(30).fill(null).map(()=>frame(127,0)),ISSUED+2500);
  assert.equal(ra.state.stateDigest,rb.state.stateDigest);
  assert.equal(ra.state.tick,60);
  assert.equal(ra.state.pilot.x,-13200+ra.state.pilot.hitRadius); // boundary clamp
  assert.equal(ra.state.enemyKills,1); // server-computed damage, not client claim
});
test('V8B-2A: keyboard x=right moves Babylon world -X, z=down moves +Z',()=>{
  const f=fixture({enemies:[]});
  const r=go(f,0,[frame(127,0),frame(0,127),frame(-90,-90)]);
  assert.equal(r.state.pilot.x, -600 + Math.round(90*600/127));
  assert.equal(r.state.pilot.z, 7600-Math.round(90*600/127));
});
test('V8B-2A: illegal client victory/kills/rewards and floating or teleport frames rejected',()=>{
  const f=fixture();
  for(const extra of [{victory:true},{rewards:{coins:9999}},{kills:12},{hp:100000},{stars:3}]){
    assert.throws(()=>replayAcceptedChunk({state:f.state,journal:f.journal,
      chunk:{...packet(0,[frame()]),...extra},receivedAtMs:ISSUED+1000}),/Invalid input/i);
  }
  for(const illegal of [{x:128,z:0},{x:127,z:127},{x:1.5,z:0},{x:0,z:0,teleport:true}]){
    assert.throws(()=>go(f,0,[illegal]),e=>e.code==='INPUT_FRAME_INVALID');
  }
});
test('V8B-2A: wrong journal battle, UID, session, rules or loadout cannot replay',()=>{
  const f=fixture();
  for (const key of ['battleId','uid','sessionId','rulesVersion','loadoutHash']) {
    const bad={...f.journal,[key]:key==='loadoutHash'?'f'.repeat(64):'other'};
    assert.throws(()=>go({state:f.state,journal:bad},0,[frame()]),/do not match/);
  }
});
test('V8B-2A: V8B1 fast-forward and duplicate retry preserved exactly',()=>{
  const f=fixture();
  assert.throws(()=>go(f,0,Array(60).fill(null).map(()=>frame()),ISSUED+100),e=>e.code==='INPUT_FAST_FORWARD');
  const one=go(f,0,[frame(90,90)],ISSUED+1000);
  const again=replayAcceptedChunk({state:one.state,journal:one.journal,
    chunk:packet(0,[frame(90,90)]),receivedAtMs:ISSUED+1050});
  assert.equal(again.duplicate,true);
  assert.equal(again.state,one.state);
  assert.equal(again.journal,one.journal);
  assert.throws(()=>replayAcceptedChunk({state:one.state,journal:one.journal,
    chunk:packet(0,[frame(-90,90)]),receivedAtMs:ISSUED+1050}),e=>e.code==='INPUT_SEQUENCE_INVALID');
});
test('V8B-2A: pellet vs enemy uses swept collision so fast bullet cannot tunnel',()=>{
  const f=fixture({enemies:[{id:'enemy_001',x:0,z:4200,hp:100,speedPerTick:0,
    damage:0,hitRadius:100,behavior:'static'}],pilot:{shotSpeed:3900,bulletRadius:100}});
  const r=go(f,0,[frame()],ISSUED+1000);
  assert.equal(r.state.enemyKills,1);
  assert.equal(r.state.enemies.length,0);
});
test('V8B-2A: server-authored enemy snapshot defines HP and damage',()=>{
  const enemy={id:'enemy_001',x:0,z:6000,hp:200,speedPerTick:0,
    damage:200,hitRadius:500,behavior:'static'};
  const f=fixture({enemies:[enemy],pilot:{atk:1,hitRadius:700}});
  const r=go(f,0,[frame()],ISSUED+1000);
  assert.equal(r.state.pilot.hp,1040); // floor(200*(1-20% armor))
  assert.equal(r.state.enemyKills,0); // contact cull is not a verified kill
});
test('V8B-2A: seed-based dodge and critical results reproducible',()=>{
  const opts={enemies:[{id:'enemy_001',x:0,z:6000,hp:500,speedPerTick:0,
    damage:200,hitRadius:500,behavior:'static'}],pilot:{dodgeChancePermille:500,critChancePermille:500}};
  const a=fixture(opts), b=fixture(opts);
  const ra=go(a,0,Array(18).fill(null).map(()=>frame()),ISSUED+1500);
  const rb=go(b,0,Array(18).fill(null).map(()=>frame()),ISSUED+1500);
  assert.equal(ra.state.stateDigest,rb.state.stateDigest);
  assert.equal(ra.state.pilot.hp,rb.state.pilot.hp);
});
test('V8B-2A: server fixture rejects clients inventing enemies, weapons or extra properties',()=>{
  const f=fixture();
  assert.throws(()=>openCombatCore({...f.config,pilot:{...f.config.pilot,coins:1000}}),
    e=>e.code==='CORE_CONFIG_INVALID');
  assert.throws(()=>openCombatCore({...f.config,enemies:[{...f.config.enemies[0],id:'enemy',victory:true}]}),
    e=>e.code==='CORE_CONFIG_INVALID');
  assert.throws(()=>openCombatCore({...f.config,enemies:[f.config.enemies[0],f.config.enemies[0]]}),
    e=>e.code==='CORE_CONFIG_INVALID');
  assert.throws(()=>openCombatCore({...f.config,seed:0}),e=>e.code==='CORE_CONFIG_INVALID');
});
test('V8B-2A: initial server journal digest cannot be forged',()=>{
  const f=fixture();
  assert.throws(()=>openCombatCore({...f.config,journal:{...f.journal,digest:'a'.repeat(64)}}),
    e=>e.code==='CORE_JOURNAL_INVALID');
});
test('V8B-2A: result is deeply immutable, state and journal cannot diverge',()=>{
  const f=fixture(); const r=go(f,0,[frame()]);
  assert.equal(Object.isFrozen(r.state),true);
  assert.equal(Object.isFrozen(r.state.pilot),true);
  assert.equal(Object.isFrozen(r.state.enemies),true);
  assert.throws(()=>{r.state.pilot.hp=0;},TypeError);
  assert.throws(()=>replayAcceptedChunk({state:{...r.state,pilot:{...r.state.pilot,hp:0}},journal:r.journal,
    chunk:packet(1,[frame()]),receivedAtMs:ISSUED+1500}),e=>e.code==='CORE_STATE_INVALID');
  assert.throws(()=>replayAcceptedChunk({state:r.state,journal:f.journal,
    chunk:packet(0,[frame()]),receivedAtMs:ISSUED+1500}),e=>e.code==='CORE_CONTEXT_MISMATCH');
});
test('V8B-2A: tests compare render 30/60/120 FPS after sampling identical 30Hz controls',()=>{
  // A future UI adapter must sample controls at a fixed tick boundary. Under
  // equal tick controls, simulation cannot depend on how often Babylon renders.
  const hashes=[];
  for (const fps of [30,60,120]) {
    const rendered=Array.from({length:fps},(_,i)=> i/fps);
    const frames=Array.from({length:30},(_,i)=>{
      const sampleAt=i/30;
      const input=sampleAt<0.5?frame(127,0):frame(-127,0);
      assert.ok(rendered.some(t=>Math.abs(t-sampleAt)<1e-9));
      return input;
    });
    const f=fixture({enemies:[]});
    hashes.push(go(f,0,frames).state.stateDigest);
  }
  assert.equal(new Set(hashes).size,1);
});
test('V8B-2A: 200 chunks of server-bounded input have finite state and bounded arrays',()=>{
  let f=fixture({enemies:[]});
  for(let i=0;i<200;i++) {
    f=go(f,i*30,Array.from({length:30},(_,t)=>frame((i+t)%2?127:-127,0)),
      ISSUED+(i+1)*1000);
    assert.ok(f.state.bullets.length<=96);
  }
  assert.equal(f.state.tick,6000);
  assert.ok(Number.isInteger(f.state.pilot.x));
});

test('V8B-2A: golden checkpoint digests pin deterministic result and journal contract',()=>{
  const f=fixture();
  assert.equal(f.state.stateDigest,'a9ebf4f30dc1d2752ebfae13ef48d46dcecb6bcf896fe0e8e94d60b96d8f3805');
  const r=go(f,0,Array.from({length:30},()=>frame()),ISSUED+2000);
  assert.equal(r.state.stateDigest,'d204c7de586bfdc5c559674e291a0818ed52d8e1d311adac81fee60e2d2a0df7');
  assert.equal(r.journal.digest,'a7adfaea34575f1da7fb4ac2c77ee2e623bc150add97d1dc8c0f09d4404cf285');
  assert.equal(r.state.enemyKills,1);
});
test('V8B-2A: network chunk segmentation cannot change physics for identical frame sequence',()=>{
  const f=fixture();
  const input=Array.from({length:60},(_,i)=> i<20?frame(127,0):frame(-127,0));
  const whole=go(f,0,input,ISSUED+2500);
  let split=go(f,0,input.slice(0,30),ISSUED+1200);
  split=go(split,30,input.slice(30),ISSUED+2500);
  for(const key of ['pilot','enemies','bullets','rngState','nextBulletId','enemyKills','tick']) {
    assert.deepEqual(whole.state[key],split.state[key]);
  }
  assert.notEqual(whole.journal.digest,split.journal.digest); // receipt timing is auditable
});
test('V8B-2A: serialized server checkpoint resumes without trusting a client result',()=>{
  const f=fixture();
  const r=go(f,0,Array.from({length:30},()=>frame()),ISSUED+1000);
  const onDisk=JSON.parse(JSON.stringify({state:r.state,journal:r.journal}));
  const restored=go(onDisk,30,Array.from({length:30},()=>frame(127,0)),ISSUED+2200);
  const live=go(r,30,Array.from({length:30},()=>frame(127,0)),ISSUED+2200);
  assert.equal(restored.state.stateDigest,live.state.stateDigest);
  assert.equal(restored.journal.digest,live.journal.digest);
});
test('V8B-2A: reject extra replay arguments, stale and mismatched journal',()=>{
  const f=fixture();
  assert.throws(()=>replayAcceptedChunk({state:f.state,journal:f.journal,
    chunk:packet(0,[frame()]),receivedAtMs:ISSUED+1000,rewards:{coins:1000}}),
    e=>e.code==='CORE_CONTEXT_MISMATCH');
  assert.throws(()=>go(f,1,[frame()]),e=>e.code==='INPUT_SEQUENCE_INVALID');
  assert.throws(()=>go(f,0,[frame()],ISSUED+31*60*1000),
    e=>e.code==='INPUT_BATTLE_EXPIRED');
});
test('V8B-2A: deterministic pursuit and arena boundary are server-owned',()=>{
  const enemy={id:'enemy_001',x:12000,z:-9000,hp:5000,
    speedPerTick:100,damage:0,hitRadius:100,behavior:'chase'};
  const f=fixture({enemies:[enemy],pilot:{atk:0,z:0}});
  const r=go(f,0,Array.from({length:40},()=>frame(-90,90)),ISSUED+1800);
  assert.equal(r.state.pilot.x,12500);
  assert.equal(r.state.pilot.z,12500);
  assert.ok(r.state.enemies[0].z > enemy.z);
  assert.ok(r.state.enemies[0].x <= enemy.x);
});
test('V8B-2A: P0 barrier remains intact and no core import is connected to HTTP/economy',()=>{
  const fs=require('node:fs');
  const service=fs.readFileSync(require.resolve('../lib/gameService.cjs'),'utf8');
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(service,/require\([^)]*combatCoreV8/);
  assert.doesNotMatch(service,/require\([^)]*combatInputJournalV8/);
  for(const word of ['victory','reward','settlement','winner']) {
    const state=fixture().state;
    assert.equal(Object.hasOwn(state,word),false);
  }
});
