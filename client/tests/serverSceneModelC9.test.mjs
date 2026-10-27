import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerSceneModelC9} from '../src/game/combat/ServerSceneModelC9.js';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,movePerTick:400,
  startX:0,startZ:12500,speedMultiplier:1};
const view=(tick,changes={})=>({version:'sf-c8-alpha1-server-render-qa-v1',
  qaOnly:true,settlementEnabled:false,locationId:'alpha_stage_1',tick,phase:'active',
  hp:1200,maxHp:1200,kills:0,contacts:0,spawnedWaves:0,config,
  pilot:{x:0,z:12500},enemies:[{id:'e1',x:120,z:8000,hp:100,maxHp:100}],
  shots:[],enemyShots:[],...changes});
const fixture=()=>{let t=1000;return {model:createServerSceneModelC9({clock:()=>t}),
  time:n=>{t=n;}};};
test('C9 visual: accepted checkpoint drives HUD, world and QA-only flags',()=>{
  const {model}=fixture();model.accept(view(0));const f=model.frame();
  assert.equal(f.serverTick,0);assert.equal(f.hp,1200);
  assert.equal(f.settlementEnabled,false);assert.equal(f.productionOutcomeIssued,false);
  assert.equal(f.enemies.length,1);
});
test('C9 visual: duplicate identical checkpoint is idempotent',()=>{
  const {model}=fixture();model.accept(view(0));assert.equal(model.accept(view(0)),false);
});
test('C9 visual: same tick with different HP cannot rewrite authoritative truth',()=>{
  const {model}=fixture();model.accept(view(5));
  assert.throws(()=>model.accept(view(5,{hp:1})),e=>e.code==='C9_SERVER_TICK_EQUIVOCATION');
});
test('C9 visual: rewound tick and terminal resurrection are rejected',()=>{
  const {model}=fixture();model.accept(view(5));
  assert.throws(()=>model.accept(view(4)),e=>e.code==='C9_SERVER_TICK_REWIND');
  model.accept(view(6,{phase:'lab-clear'}));
  assert.throws(()=>model.accept(view(7)),e=>e.code==='C9_SERVER_TERMINAL_REOPEN');
});
test('C9 visual: reward, victory and production flags are not part of server view',()=>{
  for(const change of [{victory:true},{rewards:{coins:100}},{settlementEnabled:true},
    {qaOnly:false},{productionOutcomeIssued:true}]){
    assert.throws(()=>fixture().model.accept(view(1,change)),
      e=>e.code==='C9_SERVER_VISUAL_INVALID');
  }
});
test('C9 visual: malformed/oversized enemy objects and projectiles are rejected',()=>{
  for(const changes of [
    {enemies:Array(33).fill({id:'x',x:0,z:0,hp:1,maxHp:1})},
    {enemies:[{id:'x',x:0,z:0,hp:1,maxHp:1},{id:'x',x:0,z:0,hp:1,maxHp:1}]},
    {enemies:[{id:'x',x:0,z:0,hp:999,maxHp:10}]},
    {shots:[{x:NaN,z:0}]},
    {shots:[{x:0,z:0,victory:true}]},
    {enemyShots:Array(129).fill({x:0,z:0})},
  ]) assert.throws(()=>fixture().model.accept(view(1,changes)));
});
test('C9 visual: malformed coordinate and configuration shift are denied',()=>{
  const {model}=fixture();model.accept(view(0));
  assert.throws(()=>model.accept(view(1,{pilot:{x:14000,z:0}})));
  assert.throws(()=>model.accept(view(1,{config:{...config,arenaHalfWidth:12000}})),
    e=>e.code==='C9_SERVER_CONFIG_CHANGED');
});
test('C9 visual: interpolate only visuals, never HP or truth',()=>{
  const f=fixture();f.model.accept(view(0,{pilot:{x:0,z:12000}}));
  f.time(1100);f.model.accept(view(15,{pilot:{x:9000,z:12000},hp:10,kills:3}));
  let r=f.model.frame();assert.equal(r.pilot.x,0);assert.equal(r.hp,10);assert.equal(r.kills,3);
  f.time(1145);r=f.model.frame();assert.equal(r.pilot.x,4500);assert.equal(r.hp,10);
  f.time(1300);r=f.model.frame();assert.equal(r.pilot.x,9000);
});
test('C9 visual: newly spawned enemies exist at server position immediately',()=>{
  const f=fixture();f.model.accept(view(0,{enemies:[]}));
  f.time(1100);f.model.accept(view(1,{enemies:[{id:'e1',x:100,z:100,hp:9,maxHp:9}]}));
  assert.deepEqual(f.model.frame().enemies[0],{id:'e1',x:100,z:100,hp:9,maxHp:9});
});
test('C9 visual: fake local predicted ship never changes server pilot or outcome',()=>{
  const f=fixture();f.model.accept(view(1,{phase:'lab-defeat'}));
  const r=f.model.frame({x:2000,z:2000});
  assert.equal(r.phase,'lab-defeat');assert.deepEqual(r.pilot,{x:0,z:12500});
  assert.deepEqual(r.predictedGhost,{x:2000,z:2000});
  assert.equal(f.model.frame({x:99999,z:0}).predictedGhost,null);
});
test('C9 visual: transport mutation after acceptance cannot rewrite server truth',()=>{
  const f=fixture(),input=view(1);f.model.accept(input);
  input.hp=0;input.pilot.x=9999;input.enemies.length=0;
  assert.equal(f.model.frame().hp,1200);
  assert.equal(f.model.frame().pilot.x,0);
  assert.equal(f.model.frame().enemies.length,1);
});
test('C9 visual: clock moving backwards is rejected',()=>{
  const f=fixture();f.model.accept(view(0));f.time(900);
  assert.throws(()=>f.model.accept(view(1)),e=>e.code==='C9_RENDER_CLOCK_INVALID');
});
test('C9 visual: gap larger than 30 ticks snaps to latest server checkpoint',()=>{
  const f=fixture();f.model.accept(view(0,{pilot:{x:0,z:0}}));
  f.time(1100);f.model.accept(view(80,{pilot:{x:10000,z:0}}));
  assert.equal(f.model.frame().pilot.x,10000);
});
test('C9 visual: cannot accept extra properties disguised as input results',()=>{
  const f=fixture();const v=view(0);v.enemies[0].reward=99;
  assert.throws(()=>f.model.accept(v),e=>e.code==='C9_SERVER_ENEMY_INVALID');
});
