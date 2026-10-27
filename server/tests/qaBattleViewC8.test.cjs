'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {projectQaBattleViewC8,VIEW_VERSION}=require('../lib/qaBattleViewC8.cjs');
const fs=require('node:fs'),path=require('node:path');
function run(){
  return {state:{qaOnly:true,safeForCloudBattle:false,tick:15,phase:'active',
    hp:1200,maxHp:1500,kills:3,contacts:1,spawnedWaves:1,
    enemies:[{id:'enemy_1',xUnits:400,zUnits:-1200,hp:50,maxHp:100,secret:'dont-send'}],
    projectiles:[{id:5,xUnits:0,zUnits:150,damageMilli:50000}],
    enemyProjectiles:[{id:9,xUnits:-200,zUnits:700,sourceId:'private'}]},
    foundation:{checkpoint:{safeForCloudBattle:false,tick:15,
      position:{xUnits:123,zUnits:456},snapshotHash:'do-not-return'},
      preview:{arena:{halfWidthUnits:13200,halfHeightUnits:15000},
        pilotHitRadiusUnits:700,movePerTickUnits:420,speedMultiplier:1.2,
        uid:'never-send',seed:999,loadoutHash:'never-send'}}};
}
test('C8 server: QA visual projection omits identity, HMAC, seeds, rewards and loadout',()=>{
  const r=projectQaBattleViewC8(run());
  assert.equal(r.version,VIEW_VERSION);assert.equal(r.qaOnly,true);
  assert.equal(r.settlementEnabled,false);assert.equal(r.tick,15);
  assert.equal(r.config.startX,123);assert.equal(r.config.movePerTick,420);
  assert.deepEqual(r.enemies,[{id:'enemy_1',x:400,z:-1200,hp:50,maxHp:100}]);
  assert.deepEqual(r.shots,[{x:0,z:150}]);
  assert.deepEqual(r.enemyShots,[{x:-200,z:700}]);
  for(const forbidden of ['uid','sessionId','seed','loadoutHash','snapshotHash',
    'wallet','rewards','coins','victory','HMAC','secret','productionReceiptDigest']){
    assert.equal(JSON.stringify(r).includes(forbidden),false,forbidden);
  }
});
test('C8 server: tampered/mismatched tick and economy flags fail closed',()=>{
  for(const mutate of [r=>{r.state.qaOnly=false;},r=>{r.state.safeForCloudBattle=true;},
    r=>{r.foundation.checkpoint.safeForCloudBattle=true;},
    r=>{r.foundation.checkpoint.tick=14;},r=>{r.state.hp=Number.NaN;},
    r=>{r.state.enemies[0].xUnits=Infinity;},
    r=>{r.state.enemies=Array.from({length:33},()=>({id:'x',xUnits:0,zUnits:0,hp:1,maxHp:1}));},
    r=>{r.foundation.preview.movePerTickUnits=0;}]){
    const r=run();mutate(r);assert.throws(()=>projectQaBattleViewC8(r),/C8 QA view invalid/);
  }
});
test('C8 server: QA terminal phase remains NON-ECONOMIC',()=>{
  const r=run();r.state.phase='lab-clear';r.state.tick=3018;r.foundation.checkpoint.tick=3018;
  const v=projectQaBattleViewC8(r);
  assert.equal(v.phase,'lab-clear');assert.equal(v.settlementEnabled,false);
  assert.equal('safeForCloudBattle' in v,false);
});
test('C8 server: patch never hooks settlement or unlocks gameService P0',()=>{
  const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  const source=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  assert.match(source,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(server,/createVerifiedSettlementC7B2B/);
  assert.match(server,/\/api\/v1\/qa\/battle\/abandon/);
  assert.doesNotMatch(server,/\/api\/v1\/battle\/settle/);
});
