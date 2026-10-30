import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateC9MotionHintsV2} from '../src/game/combat/C9MotionHintsV2.js';
import {createC9SmoothWorld} from '../src/game/combat/C9SmoothWorld.js';
import {createServerSceneModelC9} from '../src/game/combat/ServerSceneModelC9.js';
import {requireCandidateReplyC12} from '../src/game/combat/CloudCandidateSessionC12.js';
const bid='bb389091-7e41-4ac3-aadf-9b55074ba915';
const config={arenaHalfWidth:13200,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:400,startX:0,startZ:12500,speedMultiplier:1};
const view=(tick,changes={})=>({version:'sf-c8-alpha1-server-render-qa-v1',
  qaOnly:true,settlementEnabled:false,locationId:'alpha_stage_1',tick,
  phase:'active',hp:1050,maxHp:1050,kills:0,contacts:0,spawnedWaves:1,
  config,pilot:{x:0,z:12500},enemies:[{id:'e_1',x:100,z:7000,hp:10,maxHp:10}],
  shots:[{x:200,z:3000},{x:500,z:4500}],enemyShots:[{x:100,z:8000}],...changes});
const hints=(v,changes={})=>({version:'sf-c9-server-motion-hints-v2',
  tick:v.tick,qaOnly:true,nonEconomic:true,settlementEnabled:false,
  enemies:v.enemies.map(e=>({id:e.id,maxSpeedUnitsPerTick:120})),
  shots:[{id:11,x:200,z:3000,vx:0,vz:-1900},
    {id:12,x:500,z:4500,vx:0,vz:-1900}],
  enemyShots:[{id:7,x:100,z:8000,vx:80,vz:200}],...changes});
const replay=(tick,v,m)=>({ok:true,version:'c11',battleId:bid,nextTick:tick,
  phase:v.phase,expiresAtMs:1234567890000,protocol:'pve-input-v1',
  qaOnly:true,qaSourceModel:true,candidateOnly:true,nonEconomic:true,
  eligibleForSettlement:false,safeForCloudBattle:false,settlementEnabled:false,
  visual:v,visualMotion:m});
const frame=(tick,v,h)=>({serverTick:tick,phase:'active',qaOnly:true,
  settlementEnabled:false,productionOutcomeIssued:false,
  config:v.config,enemies:v.enemies,shots:v.shots,enemyShots:v.enemyShots,motionHints:h});
const sample=(world,at)=>{const rows={shots:[],enemyShots:[],enemies:[]};
  world.each({shot:(i,x,z)=>rows.shots.push({i,x,z}),
    enemyShot:(i,x,z)=>rows.enemyShots.push({i,x,z}),
    enemy:(id,x,z)=>rows.enemies.push({id,x,z})},at);return rows;};
test('C9 hints V2: validates an authenticated-by-transport sidecar without modifying visual V1',()=>{
  const v=view(30),h=hints(v);
  assert.deepEqual(validateC9MotionHintsV2(h,v),h);
  assert.equal(requireCandidateReplyC12(replay(30,v,h)).visual.version,v.version);
});
test('C9 hints V2: malicious fields, forged coordinates, duplicated ID and changed ticks rejected',()=>{
  const v=view(30),h=hints(v);
  const bad=[
    {...h,rewards:{coins:1}},
    {...h,tick:31},
    {...h,settlementEnabled:true},
    {...h,shots:[{...h.shots[0],x:300},h.shots[1]]},
    {...h,shots:[h.shots[0],{...h.shots[1],id:11}]},
    {...h,enemyShots:[{...h.enemyShots[0],damage:99}]},
    {...h,enemies:[{...h.enemies[0],maxSpeedUnitsPerTick:9999}]},
    {...h,shots:[]},
  ];
  for(const b of bad){
    assert.throws(()=>validateC9MotionHintsV2(b,v),/C9_MOTION_HINTS_INVALID/);
    assert.throws(()=>requireCandidateReplyC12(replay(30,v,b)),
      e=>e.code==='C12_UNTRUSTED_CANDIDATE_REPLY');
  }
});
test('C9 hints V2: older C11 candidate replies without motion sidecar are accepted',()=>{
  const v=view(30);const reply=replay(30,v,null);delete reply.visualMotion;
  assert.equal(requireCandidateReplyC12(reply).ok,true);
  const model=createServerSceneModelC9({clock:()=>1000});
  assert.equal(model.accept(v),true);
  assert.equal('motionHints' in model.authoritativeFrame(),false);
});
test('C9 hints V2: sidecar kept read-only through the scene model and rejects changed duplicate',()=>{
  const v=view(30),h=hints(v),model=createServerSceneModelC9({clock:()=>1000});
  model.accept(v,h);const f=model.authoritativeFrame();
  assert.deepEqual(f.motionHints,h);
  f.motionHints.shots[0].vx=999;
  assert.equal(model.authoritativeFrame().motionHints.shots[0].vx,0);
  assert.equal(model.accept(v,h),false);
  assert.throws(()=>model.accept(v,{...h,shots:[{...h.shots[0],vx:100},h.shots[1]]}),
    e=>e.code==='C9_SERVER_TICK_EQUIVOCATION');
});
test('C9 hints V2: server velocities animate existing projectiles between sparse ACKs',()=>{
  let ms=1000;const world=createC9SmoothWorld({clock:()=>ms});
  const v=view(30),h=hints(v);
  world.accept(frame(30,v,h));const start=sample(world,1000);
  const moved=sample(world,1200);
  assert.equal(world.usingServerHintsV2,true);
  assert.equal(start.shots.length,2);
  assert.ok(moved.shots[0].z<start.shots[0].z);
  assert.ok(moved.enemyShots[0].x>start.enemyShots[0].x);
  assert.equal(moved.enemies.length,1);
});
test('C9 hints V2: matching IDs prevent swapping equal-size projectile arrays on subsequent ACKs',()=>{
  let ms=1000;const world=createC9SmoothWorld({clock:()=>ms});
  const v=view(30),h=hints(v);world.accept(frame(30,v,h));
  ms=2000;
  const v2=view(60,{shots:[{x:500,z:-1500},{x:200,z:-2700}]});
  const h2=hints(v2,{shots:[
    {id:12,x:500,z:-1500,vx:0,vz:-1900},
    {id:11,x:200,z:-2700,vx:0,vz:-1900}],enemyShots:[{id:7,x:100,z:8000,vx:80,vz:200}]});
  world.accept(frame(60,v2,h2));
  const sampleNext=sample(world,2150);
  assert.equal(sampleNext.shots.length,2);
  assert.ok(sampleNext.shots[0].z < v2.shots[0].z+10000);
  assert.ok(world.usingServerHintsV2);
});
test('C9 hints V2: terminal snapshot freezes visuals and cannot invent new hostiles',()=>{
  let ms=1000;const world=createC9SmoothWorld({clock:()=>ms});
  const v=view(30),h=hints(v);world.accept(frame(30,v,h));
  ms=2000;const end=view(48,{phase:'lab-defeat',shots:[],enemyShots:[],enemies:[]});
  const endHints=hints(end,{shots:[],enemyShots:[],enemies:[]});
  world.accept({...frame(48,end,endHints),phase:'lab-defeat'});
  assert.deepEqual(sample(world,2000),sample(world,90000));
});

test('C9 hints V2: Babylon renderer binds projectile meshes to server ID, not array index',()=>{
  const source=readFileSync(new URL('../src/components/CloudQaAlpha1/BabylonServerRendererC9.js',import.meta.url),'utf8');
  assert.match(source,/const shotsById=new Map\(\),hostilesById=new Map\(\)/);
  assert.match(source,/updateById\(shotsById,frame\.motionHints\.shots/);
  assert.match(source,/updateById\(hostilesById,frame\.motionHints\.enemyShots/);
  assert.doesNotMatch(source,/setCoins|setWallet|grantRewards|battle\.finish/);
});
