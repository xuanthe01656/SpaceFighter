/**
 * Validate the opt-in, read-only C9 rendering sidecar. The visual-v1 truth
 * (HP, entities, phase, rewards) is unchanged. This can never authorize input,
 * combat or settlement; every hint MUST refer to an existing server entity.
 */
export const C9_MOTION_HINTS_VERSION='sf-c9-server-motion-hints-v2';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const exact=(o,keys)=>obj(o)&&Object.keys(o).length===keys.length
  &&keys.every(k=>own(o,k));
const integer=(n,lo,hi)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
const fail=()=>{throw new TypeError('C9_MOTION_HINTS_INVALID');};
export function validateC9MotionHintsV2(hints,visual){
  const tick=visual?.tick??visual?.serverTick;
  if(!exact(hints,['version','tick','qaOnly','nonEconomic','settlementEnabled',
      'enemies','shots','enemyShots'])
    ||hints.version!==C9_MOTION_HINTS_VERSION||hints.qaOnly!==true
    ||hints.nonEconomic!==true||hints.settlementEnabled!==false
    ||!integer(tick,0,4500)||hints.tick!==tick
    ||!obj(visual)||!Array.isArray(visual.enemies)
    ||!Array.isArray(visual.shots)||!Array.isArray(visual.enemyShots))fail();
  for(const kind of ['enemies','shots','enemyShots']){
    const rows=hints[kind],reference=visual[kind],seen=new Set();
    if(!Array.isArray(rows)||rows.length!==reference.length
      ||rows.length>(kind==='enemies'?32:128))fail();
    for(let i=0;i<rows.length;i++){
      const h=rows[i],v=reference[i];
      if(kind==='enemies'){
        if(!exact(h,['id','maxSpeedUnitsPerTick'])
          ||typeof h.id!=='string'||h.id!==v?.id
          ||!integer(h.maxSpeedUnitsPerTick,0,900)||seen.has(h.id))fail();
      }else if(!exact(h,['id','x','z','vx','vz'])
        ||!integer(h.id,1,40000)||seen.has(h.id)
        ||!integer(h.x,-60000,60000)||!integer(h.z,-60000,60000)
        ||!integer(h.vx,-4000,4000)||!integer(h.vz,-4000,4000)
        ||h.x!==v?.x||h.z!==v?.z)fail();
      seen.add(h.id);
    }
  }
  return structuredClone(hints);
}
