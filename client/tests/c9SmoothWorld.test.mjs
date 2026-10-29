import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createC9SmoothWorld} from '../src/game/combat/C9SmoothWorld.js';

const config={arenaHalfWidth:13200,arenaHalfHeight:15000};
const enemy=(id,x,z,hp=10)=>({id,x,z,hp,maxHp:10});
const frame=(tick,props={})=>({serverTick:tick,phase:'active',qaOnly:true,
  settlementEnabled:false,productionOutcomeIssued:false,config,
  enemies:[enemy('e1',100,9000)],shots:[],enemyShots:[],...props});
const fixture=()=>{let now=1000;return {
  world:createC9SmoothWorld({clock:()=>now}),time:v=>{now=v;},
}};
function sample(world,now){
  const rows={enemies:[],shots:[],enemyShots:[]};
  world.each({enemy:(id,x,z,hp,maxHp)=>rows.enemies.push({id,x,z,hp,maxHp}),
    shot:(i,x,z)=>rows.shots.push({i,x,z}),
    enemyShot:(i,x,z)=>rows.enemyShots.push({i,x,z})},now);
  return rows;
}

test('C9 smooth: extrapolates an existing server enemy, never invents spawns',()=>{
  const f=fixture();f.world.accept(frame(0));
  assert.deepEqual(sample(f.world,1000).enemies.map(e=>e.id),['e1']);
  f.time(2000);f.world.accept(frame(30,{enemies:[enemy('e1',3100,9000),enemy('new',2000,5000)]}));
  const start=sample(f.world,2000);
  const mid=sample(f.world,2300);
  assert.equal(start.enemies.length,2);
  assert.ok(mid.enemies[0].x>start.enemies[0].x,'confirmed velocity draws between ACKs');
  assert.equal(mid.enemies[1].x,2000,'new spawn has no invented velocity');
  assert.equal(mid.enemies[1].hp,10);
  assert.equal(f.world.latestTick,30);
});

test('C9 smooth: prediction is bounded by time and arena, cannot run indefinitely',()=>{
  const f=fixture();f.world.accept(frame(0,{enemies:[enemy('e1',0,5000)]}));
  f.time(2000);f.world.accept(frame(30,{enemies:[enemy('e1',12000,5000)]}));
  const at850=sample(f.world,2850).enemies[0];
  const at1000=sample(f.world,3000).enemies[0];
  const at1200=sample(f.world,3200).enemies[0];
  assert.ok(at1000.x>=at850.x,'visual motion should not freeze before normal 1s ACK');
  assert.deepEqual(sample(f.world,90000).enemies,[at1200]);
  assert.ok(at1200.x<=config.arenaHalfWidth+3000);
  assert.ok(at1200.z<=config.arenaHalfHeight+3000);
});

test('C9 smooth: latest server checkpoint owns entity existence and terminal snap',()=>{
  const f=fixture();f.world.accept(frame(0));
  f.time(2000);f.world.accept(frame(30,{enemies:[]}));
  assert.deepEqual(sample(f.world,2010).enemies,[]);
  f.time(3000);f.world.accept(frame(60,{phase:'lab-defeat',enemies:[enemy('e2',1000,8000)]}));
  assert.deepEqual(sample(f.world,100000).enemies,[
    {id:'e2',x:1000,z:8000,hp:10,maxHp:10}]);
  assert.throws(()=>f.world.accept(frame(61)),TypeError);
});

test('C9 smooth: projectiles keep exact server counts; only unambiguous shots interpolate',()=>{
  const f=fixture();f.world.accept(frame(0,{shots:[{x:0,z:7000}],enemyShots:[{x:0,z:-1000}]}));
  f.time(2000);f.world.accept(frame(30,{shots:[{x:0,z:5000}],enemyShots:[{x:0,z:1000}]}));
  const a=sample(f.world,2000),b=sample(f.world,2250);
  assert.equal(a.shots.length,1);assert.equal(b.shots.length,1);
  assert.ok(b.shots[0].z<a.shots[0].z);
  assert.ok(b.enemyShots[0].z>a.enemyShots[0].z);
  f.time(3000);f.world.accept(frame(60,{shots:[{x:0,z:4000},{x:0,z:7000}],enemyShots:[]}));
  assert.equal(sample(f.world,3100).shots.length,2);
  assert.equal(sample(f.world,3100).enemyShots.length,0);
});

test('C9 smooth: checks untrusted shape, does not mutate server input or emit economy',()=>{
  const f=fixture(),one=frame(0);
  assert.equal(f.world.accept(one),true);
  one.enemies[0].x=90000;one.enemies.length=0;
  assert.equal(sample(f.world,1000).enemies.length,1);
  for(const bad of [frame(1,{qaOnly:false}),frame(1,{settlementEnabled:true}),
    frame(1,{shots:Array(129).fill({x:0,z:0})}),
    frame(1,{enemies:[enemy('x',1.25,0)]}),
    frame(1,{enemies:[enemy('x',0,0),enemy('x',0,0)]}),
    frame(-1),frame(5000)])assert.throws(()=>f.world.accept(bad),TypeError);
  assert.equal(f.world.latestTick,0);
  const source=readFileSync(fileURLToPath(new URL('../src/game/combat/C9SmoothWorld.js',import.meta.url)),'utf8');
  assert.doesNotMatch(source,/grantReward|settleBattle|writeBatch|gameApi|updateDoc|firebase/i);
});

test('C9 smooth: renderer only refreshes expensive snapshot on new ACK, then renders locally',()=>{
  const ui=readFileSync(fileURLToPath(new URL('../src/components/CloudQaAlpha1/index.jsx',import.meta.url)),'utf8');
  const renderer=readFileSync(fileURLToPath(new URL('../src/components/CloudQaAlpha1/BabylonServerRendererC9.js',import.meta.url)),'utf8');
  assert.match(ui,/sceneModel\.tick!==displayedServerTick/);
  assert.match(ui,/sceneModel\.authoritativeFrame\(\)/);
  assert.match(ui,/babylon\.updatePrediction\(state\.terminal\?null:state\.player\)/);
  assert.match(renderer,/motion\.each\(drawMotion,frameAt\)/);
  assert.match(renderer,/showServerReference=false/);
  assert.doesNotMatch(renderer,/battle\.finish|settleBattle|applyDamage|wallet\./);
});

test('C9 authoritative render snapshot is current server truth, not the old 90ms tween',async()=>{
  const {createServerSceneModelC9}=await import('../src/game/combat/ServerSceneModelC9.js');
  let now=1000;const model=createServerSceneModelC9({clock:()=>now});
  const view=(tick,x)=>({version:'sf-c8-alpha1-server-render-qa-v1',
    qaOnly:true,settlementEnabled:false,locationId:'alpha_stage_1',tick,
    phase:'active',hp:100,maxHp:100,kills:0,contacts:0,spawnedWaves:0,
    config:{...config,hitRadius:700,movePerTick:400,startX:0,startZ:12500,speedMultiplier:1},
    pilot:{x:0,z:12500},enemies:[enemy('e1',x,9000)],shots:[],enemyShots:[]});
  model.accept(view(0,0));now=2000;model.accept(view(30,3000));
  assert.equal(model.frame().enemies[0].x,0,'old tween has visual lag at receive time');
  assert.equal(model.authoritativeFrame().enemies[0].x,3000,'motion must seed from real latest ACK');
  assert.equal(model.authoritativeFrame().serverTick,30);
});
