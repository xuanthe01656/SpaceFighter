/**
 * C9 presentation-only mapping for the top-down left-handed Babylon QA camera.
 * Camera: eye +Y, forward -Y, up -Z -> screen-right basis -world-X.
 * Therefore POSITIVE server X already projects to screen LEFT: do not negate X.
 * This module never creates a gameplay input, checkpoint, outcome or reward.
 */
export const C9_WORLD_UNIT_SCALE=1000;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const coord=p=>p!==null&&typeof p==='object'&&!Array.isArray(p)
  &&Object.keys(p).length===2&&own(p,'x')&&own(p,'z')&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.z)
  &&Math.abs(p.x)<=60000&&Math.abs(p.z)<=60000;

export function toC9BabylonWorld(p){
  if(!coord(p))throw new TypeError('C9 visual position invalid');
  return Object.freeze({x:p.x/C9_WORLD_UNIT_SCALE,y:.14,z:p.z/C9_WORLD_UNIT_SCALE});
}

/** C9 validated enemies include {id,hp,maxHp} as well as coordinates.
 * Convert ONLY the x/z geometry; never let presentation metadata leak into
 * the strict two-field coordinate contract or affect server-authoritative data. */
export function toC9ServerEntityWorld(entity){
  if(entity===null||typeof entity!=='object'||Array.isArray(entity)
    ||!own(entity,'x')||!own(entity,'z'))
    throw new TypeError('C9 visual entity invalid');
  return toC9BabylonWorld({x:entity.x,z:entity.z});
}

/** Local 30Hz prediction is the bright displayed ship. A server checkpoint
 * remains a dim reference for QA only; server still owns HP, enemy and result. */
export function chooseC9PilotDisplay(frame){
  if(!frame||!coord(frame.pilot)
    ||(frame.predictedGhost!=null&&!coord(frame.predictedGhost)))
    throw new TypeError('C9 visual pilot invalid');
  return Object.freeze({
    primary:frame.predictedGhost??frame.pilot,
    serverReference:frame.predictedGhost==null?null:frame.pilot,
  });
}

/** Visual smoothing only; it never changes the quantized 30Hz sampler. */
export function c9VisualSmoothingAlpha(deltaMs){
  if(typeof deltaMs!=='number'||!Number.isFinite(deltaMs)||deltaMs<0)
    throw new TypeError('C9 visual frame time invalid');
  return 1-Math.exp(-Math.min(64,deltaMs)/22);
}

/** Interpolate BETWEEN already sampled 30Hz client positions. Strictly visual. */
export function c9PilotStepAlpha(elapsedMs){
  if(typeof elapsedMs!=='number'||!Number.isFinite(elapsedMs)||elapsedMs<0)
    throw new TypeError('C9 pilot visual time invalid');
  return Math.min(1,elapsedMs/(1000/30));
}
