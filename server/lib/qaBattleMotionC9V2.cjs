'use strict';
/**
 * C9 v2 *render hints* derived exclusively from the already validated
 * server-owned C11 candidate simulation. Never a hit/outcome/replay proof.
 * Kept OUTSIDE visual-v1 so previously installed QA APKs remain compatible.
 */
const MOTION_VERSION='sf-c9-server-motion-hints-v2';
const int=(v,lo,hi)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const deny=()=>{throw new TypeError('C9 motion hints invalid');};
const freezeList=rows=>Object.freeze(rows.map(x=>Object.freeze(x)));
function projectQaMotionC9V2(run,visual){
  const s=run?.state;
  if(!s||!visual||s.qaOnly!==true||s.safeForCloudBattle!==false
    ||visual.version!=='sf-c8-alpha1-server-render-qa-v1'
    ||visual.qaOnly!==true||visual.settlementEnabled!==false
    ||s.tick!==visual.tick||s.phase!==visual.phase
    ||!int(s.tick,0,4500)||!Array.isArray(s.enemies)
    ||!Array.isArray(s.projectiles)||!Array.isArray(s.enemyProjectiles)
    ||s.enemies.length!==visual.enemies?.length
    ||s.projectiles.length!==visual.shots?.length
    ||s.enemyProjectiles.length!==visual.enemyShots?.length
    ||s.enemies.length>32||s.projectiles.length>128||s.enemyProjectiles.length>128)
    deny();
  const enemies=freezeList(s.enemies.map((e,i)=>{
    if(typeof e.id!=='string'||e.id!==visual.enemies[i].id
      ||e.xUnits!==visual.enemies[i].x||e.zUnits!==visual.enemies[i].z
      ||!int(e.moveUnitsPerTick,0,900))deny();
    return {id:e.id,maxSpeedUnitsPerTick:e.moveUnitsPerTick};
  }));
  function bullets(source,view,hostile){
    const seen=new Set();
    return freezeList(source.map((b,i)=>{
      const vx=hostile?b.vxUnits:(b.velocityXUnitsPerTick??0);
      const vz=hostile?b.vzUnits:b.velocityZUnitsPerTick;
      if(!int(b.id,1,40000)||seen.has(b.id)||!int(vx,-4000,4000)
        ||!int(vz,-4000,4000)||!int(b.xUnits,-60000,60000)
        ||!int(b.zUnits,-60000,60000)||b.xUnits!==view[i].x
        ||b.zUnits!==view[i].z)deny();
      seen.add(b.id);
      return {id:b.id,x:b.xUnits,z:b.zUnits,vx,vz};
    }));
  }
  return Object.freeze({version:MOTION_VERSION,tick:s.tick,qaOnly:true,
    nonEconomic:true,settlementEnabled:false,enemies,
    shots:bullets(s.projectiles,visual.shots,false),
    enemyShots:bullets(s.enemyProjectiles,visual.enemyShots,true)});
}
module.exports=Object.freeze({MOTION_VERSION,projectQaMotionC9V2});
