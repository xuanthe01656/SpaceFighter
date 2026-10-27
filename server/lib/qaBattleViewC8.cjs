'use strict';
/**
 * C8: bounded, read-only render projection of a server-owned QA checkpoint.
 * This is NOT a production outcome, economic ledger, or transferable proof.
 * Exposes no UID/session, seed, HMAC, snapshots, catalog internals or rewards.
 */
const VIEW_VERSION='sf-c8-alpha1-server-render-qa-v1';
const deny=message=>{throw new TypeError(`C8 QA view invalid: ${message}`);};
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finite=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
function projectQaBattleViewC8(run){
  const s=run?.state, f=run?.foundation,p=f?.preview, cp=f?.checkpoint;
  if(!record(s)||!record(p)||!record(cp)||s.qaOnly!==true
    ||s.safeForCloudBattle!==false||cp.safeForCloudBattle!==false
    ||cp.tick!==s.tick||!['active','lab-clear','lab-defeat'].includes(s.phase)
    ||!integer(s.tick,0,4500)||!integer(s.hp,0,10000000)
    ||!integer(s.maxHp,1,10000000)||!integer(s.kills,0,128)
    ||!integer(s.spawnedWaves,0,12)||!integer(s.contacts,0,128)
    ||!integer(p.arena?.halfWidthUnits,2000,50000)
    ||!integer(p.arena?.halfHeightUnits,2000,50000)
    ||!integer(p.pilotHitRadiusUnits,100,2500)
    ||!integer(p.movePerTickUnits,1,3000)
    ||!finite(p.speedMultiplier,0,5)
    ||!record(cp.position)||!integer(cp.position.xUnits,-50000,50000)
    ||!integer(cp.position.zUnits,-50000,50000))deny('authoritative checkpoint');
  function objects(list,cap,withHp=false){
    if(!Array.isArray(list)||list.length>cap)deny('object budget');
    return list.map(o=>{
      if(!record(o)||!integer(o.xUnits,-60000,60000)
        ||!integer(o.zUnits,-60000,60000))deny('object coordinate');
      if(withHp){
        if(typeof o.id!=='string'||o.id.length>60||!integer(o.hp,0,10000000)
          ||!integer(o.maxHp,1,10000000))deny('enemy model');
        return {id:o.id,x:o.xUnits,z:o.zUnits,hp:o.hp,maxHp:o.maxHp};
      }
      return {x:o.xUnits,z:o.zUnits};
    });
  }
  const config={arenaHalfWidth:p.arena.halfWidthUnits,
    arenaHalfHeight:p.arena.halfHeightUnits,hitRadius:p.pilotHitRadiusUnits,
    movePerTick:p.movePerTickUnits,startX:cp.position.xUnits,
    startZ:cp.position.zUnits,speedMultiplier:p.speedMultiplier};
  // Public presentation data only. Not an attestation, not a saveable outcome.
  return Object.freeze({version:VIEW_VERSION,qaOnly:true,settlementEnabled:false,
    locationId:'alpha_stage_1',tick:s.tick,phase:s.phase,
    hp:s.hp,maxHp:s.maxHp,kills:s.kills,contacts:s.contacts,
    spawnedWaves:s.spawnedWaves,config,
    pilot:{x:cp.position.xUnits,z:cp.position.zUnits},
    enemies:objects(s.enemies,32,true),
    shots:objects(s.projectiles,128),
    enemyShots:objects(s.enemyProjectiles||[],128),
  });
}
module.exports=Object.freeze({VIEW_VERSION,projectQaBattleViewC8});
