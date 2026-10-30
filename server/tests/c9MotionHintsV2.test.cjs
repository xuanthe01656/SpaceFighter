'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {projectQaBattleViewC8}=require('../lib/qaBattleViewC8.cjs');
const {projectQaMotionC9V2,MOTION_VERSION}=require('../lib/qaBattleMotionC9V2.cjs');
function sample(){
  return {state:{qaOnly:true,safeForCloudBattle:false,tick:90,phase:'active',
    hp:100,maxHp:100,kills:0,contacts:0,spawnedWaves:1,
    enemies:[{id:'enemy_7',xUnits:100,zUnits:7000,hp:10,maxHp:10,moveUnitsPerTick:120,
      damage:99,accountId:'do-not-send'}],
    projectiles:[{id:21,xUnits:220,zUnits:1400,
      velocityXUnitsPerTick:-50,velocityZUnitsPerTick:-1900,damageMilli:20000}],
    enemyProjectiles:[{id:8,xUnits:300,zUnits:4000,vxUnits:-170,vzUnits:200,
      damage:8,sourceId:'enemy_7'}]},
    foundation:{checkpoint:{safeForCloudBattle:false,tick:90,
      position:{xUnits:0,zUnits:12000}},preview:{
      arena:{halfWidthUnits:13200,halfHeightUnits:15000},
      pilotHitRadiusUnits:700,movePerTickUnits:400,speedMultiplier:1,
      startPosition:{xUnits:0,zUnits:12500}}}};
}
function derive(run){return projectQaMotionC9V2(run,projectQaBattleViewC8(run));}
test('C9 motion v2: authenticated QA state projects only ID, movement limits and velocity',()=>{
  const motion=derive(sample());
  assert.equal(motion.version,MOTION_VERSION);assert.equal(motion.tick,90);
  assert.deepEqual(motion.enemies,[{id:'enemy_7',maxSpeedUnitsPerTick:120}]);
  assert.deepEqual(motion.shots,[{id:21,x:220,z:1400,vx:-50,vz:-1900}]);
  assert.deepEqual(motion.enemyShots,[{id:8,x:300,z:4000,vx:-170,vz:200}]);
  assert.equal(motion.nonEconomic,true);assert.equal(motion.settlementEnabled,false);
  assert.equal(Object.isFrozen(motion.shots[0]),true);
  for(const s of ['damage','accountId','sourceId','seed','wallet','sessionId','HMAC'])
    assert.equal(JSON.stringify(motion).includes(s),false,s);
});
test('C9 motion v2: v1 response contents and identifiers remain unchanged',()=>{
  const run=sample();const view=projectQaBattleViewC8(run);derive(run);
  assert.equal(view.version,'sf-c8-alpha1-server-render-qa-v1');
  assert.deepEqual(view.shots,[{x:220,z:1400}]);
  assert.deepEqual(view.enemyShots,[{x:300,z:4000}]);
});
test('C9 motion v2: tampered server motion, duplicate IDs and unsigned models reject',()=>{
  for(const change of [
    r=>{r.state.qaOnly=false;},
    r=>{r.state.projectiles[0].velocityZUnitsPerTick=4500;},
    r=>{r.state.projectiles[0].id=-1;},
    r=>{r.state.enemyProjectiles[0].vxUnits=Infinity;},
    r=>{r.state.enemies[0].moveUnitsPerTick=-1;},
  ]){
    const r=sample();change(r);assert.throws(()=>derive(r));
  }
  const r=sample(),view=projectQaBattleViewC8(r);
  view.shots[0].z++;assert.throws(()=>projectQaMotionC9V2(r,view));
});
test('C9 motion v2: candidate answer only adds safe render-only sidecar',()=>{
  const file=fs.readFileSync(path.resolve(__dirname,'../lib/productionBattleCandidateC11V8.cjs'),'utf8');
  assert.match(file,/const visual=projectQaBattleViewC8\(active\.run\)/);
  assert.match(file,/visualMotion:projectQaMotionC9V2\(active\.run,visual\)/);
  assert.doesNotMatch(file,/createVerifiedSettlement|grantCoins|verifiedRewards/);
});
test('C9 motion v2: exported existing QA visual still rejects economic state',()=>{
  const r=sample();r.state.safeForCloudBattle=true;
  assert.throws(()=>derive(r));
});
