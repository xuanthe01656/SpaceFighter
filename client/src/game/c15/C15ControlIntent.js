/**
 * C15-RC1C deterministic mobile target-follow sampler.
 *
 * Pointer events update a bounded target; only 30Hz {x,z} frames advance the
 * authoritative local kernel. Profiles tune feel without changing journal shape.
 */
import {worldDragDelta} from '../combat/ShipInputController.js';
import {resolveC15ControlProfile} from './C15ControlProfilesV1.js';

export const C15_CONTROL_INTENT_VERSION='c15-control-intent-v1';
const INPUT_MAX=127,MAX_TICKS=30*30*60;
const states=new WeakSet();
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const seal=x=>{const value=Object.freeze(x);states.add(value);return value;};
const check=x=>{if(!record(x)||!states.has(x))throw new TypeError('C15 control state invalid');};
function viewport(value){if(!record(value)||!finite(value.aspect)||value.aspect<.1||value.aspect>10
  ||!finite(value.canvasWidth)||value.canvasWidth<1||value.canvasWidth>20000
  ||!finite(value.canvasHeight)||value.canvasHeight<1||value.canvasHeight>20000
  ||!finite(value.halfHeight)||value.halfHeight<1||value.halfHeight>50
  ||!finite(value.speedMultiplier)||value.speedMultiplier<0||value.speedMultiplier>5)
  throw new TypeError('C15 control viewport invalid');}
function bounds(state){return {minX:-state.arenaHalfWidth+state.hitRadius,maxX:state.arenaHalfWidth-state.hitRadius,
  minZ:-state.arenaHalfHeight+state.hitRadius,maxZ:state.arenaHalfHeight-state.hitRadius};}
function boundedTarget(state,x,z){const limit=state.profile.maxTargetLagUnits;let dx=x-state.positionX,dz=z-state.positionZ;
  const distance=Math.hypot(dx,dz);if(distance>limit){const scale=limit/distance;dx*=scale;dz*=scale;}
  const b=bounds(state);return {x:clamp(Math.round(state.positionX+dx),b.minX,b.maxX),
    z:clamp(Math.round(state.positionZ+dz),b.minZ,b.maxZ)};}

export function openC15ControlIntent(config,{profileId}={}){
  if(!exact(config,['arenaHalfHeight','arenaHalfWidth','aspect','canvasHeight','canvasWidth','halfHeight','hitRadius',
    'movePerTick','speedMultiplier','startX','startZ'])||!integer(config.arenaHalfWidth,2000,50000)
    ||!integer(config.arenaHalfHeight,2000,50000)||!integer(config.hitRadius,100,2500)
    ||!integer(config.movePerTick,1,3000)||!integer(config.startX,-config.arenaHalfWidth+config.hitRadius,config.arenaHalfWidth-config.hitRadius)
    ||!integer(config.startZ,-config.arenaHalfHeight+config.hitRadius,config.arenaHalfHeight-config.hitRadius))
    throw new TypeError('C15 control config invalid');
  viewport(config);const profile=resolveC15ControlProfile(profileId);
  return seal({version:C15_CONTROL_INTENT_VERSION,tick:0,suspended:false,profile,
    arenaHalfWidth:config.arenaHalfWidth,arenaHalfHeight:config.arenaHalfHeight,hitRadius:config.hitRadius,
    movePerTick:config.movePerTick,positionX:config.startX,positionZ:config.startZ,targetX:config.startX,targetZ:config.startZ,
    aspect:config.aspect,canvasWidth:config.canvasWidth,canvasHeight:config.canvasHeight,
    halfHeight:config.halfHeight,speedMultiplier:config.speedMultiplier});
}

export function addC15PointerDelta(state,delta){check(state);if(state.suspended)throw new TypeError('C15 control suspended');
  if(!exact(delta,['deltaX','deltaY'])||!finite(delta.deltaX)||!finite(delta.deltaY)
    ||Math.abs(delta.deltaX)>20000||Math.abs(delta.deltaY)>20000)throw new TypeError('C15 control pointer delta invalid');
  const world=worldDragDelta(delta.deltaX,delta.deltaY,state.canvasWidth,state.canvasHeight,state.halfHeight,
    state.aspect,state.speedMultiplier);const scale=state.profile.pointerTargetScalePermille/1000;
  const next=boundedTarget(state,state.targetX+world.x*1000*scale,state.targetZ+world.z*1000*scale);
  return seal({...state,targetX:next.x,targetZ:next.z});
}

export function sampleC15ControlTick(state){check(state);if(state.suspended)throw new TypeError('C15 control suspended');
  if(state.tick>=MAX_TICKS)throw new TypeError('C15 control tick limit');
  const dx=state.targetX-state.positionX,dz=state.targetZ-state.positionZ,distance=Math.hypot(dx,dz);
  const deadZone=state.movePerTick*state.profile.deadZonePermille/(1000*INPUT_MAX);let x=0,z=0;
  if(distance>deadZone){const fraction=Math.min(1,state.movePerTick/distance);
    x=clamp(Math.round(-dx*fraction*INPUT_MAX/state.movePerTick),-127,127);
    z=clamp(Math.round(dz*fraction*INPUT_MAX/state.movePerTick),-127,127);
    if(x*x+z*z>128*128){const factor=127/Math.hypot(x,z);x=Math.round(x*factor);z=Math.round(z*factor);}}
  const b=bounds(state);const positionX=clamp(state.positionX-Math.round(x*state.movePerTick/127),b.minX,b.maxX);
  const positionZ=clamp(state.positionZ+Math.round(z*state.movePerTick/127),b.minZ,b.maxZ);
  return Object.freeze({frame:Object.freeze({x,z}),state:seal({...state,tick:state.tick+1,positionX,positionZ})});
}

export function releaseC15ControlTarget(state){check(state);if(state.suspended)throw new TypeError('C15 control suspended');
  return state.profile.releasePolicy==='retain-target'?state:seal({...state,targetX:state.positionX,targetZ:state.positionZ});}
export function reconfigureC15ControlViewport(state,next){check(state);viewport(next);
  return seal({...state,aspect:next.aspect,canvasWidth:next.canvasWidth,canvasHeight:next.canvasHeight,
    halfHeight:next.halfHeight,speedMultiplier:next.speedMultiplier});}
export function suspendC15ControlIntent(state){check(state);return seal({...state,suspended:true,targetX:state.positionX,targetZ:state.positionZ});}
export function c15ControlIntentView(state){check(state);return Object.freeze({version:C15_CONTROL_INTENT_VERSION,
  tick:state.tick,profileId:state.profile.id,profileDigest:state.profile.profileDigest,
  position:Object.freeze({xUnits:state.positionX,zUnits:state.positionZ}),
  target:Object.freeze({xUnits:state.targetX,zUnits:state.targetZ}),targetGapUnits:Math.round(Math.hypot(state.targetX-state.positionX,state.targetZ-state.positionZ)),
  movePerTick:state.movePerTick,releasePolicy:state.profile.releasePolicy});}
