/**
 * C9 QA-only motion presentation from accepted SERVER checkpoints.
 * This module never creates bullets/enemies, input ticks, hits or outcomes.
 * Motion is a bounded, best-effort visual estimate, not a replay/verifier.
 */
import {validateC9MotionHintsV2} from './C9MotionHintsV2.js';
export const C9_SMOOTH_WORLD_VERSION='c9-server-motion-visual-qa-v1';
const TICK_MS=1000/30;
// One 30-frame (1000ms) checkpoint interval plus 200ms ACK jitter.
// A shorter 850ms cap caused a visible stop on nearly every ~999ms ACK gap.
const MAX_PREDICTION_MS=1200;
const CORRECTION_MS=140;
const MAX_ENEMY_SPEED=900; // server units/tick, visual estimate safety cap
const MAX_SHOT_SPEED=3000;
const MAX_ENEMIES=32,MAX_SHOTS=128;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const coord=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)
  &&own(o,'x')&&own(o,'z')&&Number.isSafeInteger(o.x)&&Number.isSafeInteger(o.z)
  &&Math.abs(o.x)<=60000&&Math.abs(o.z)<=60000;
const bounded=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const bad=()=>{throw new TypeError('C9 smooth-world checkpoint invalid');};

export function createC9SmoothWorld({clock=()=>performance.now()}={}){
  if(typeof clock!=='function')throw new TypeError('C9 visual clock');
  let lastTick=-1,lastAt=0,phase='active',arenaX=0,arenaZ=0;
  let enemies=new Map(),shots=[],enemyShots=[],hintsActive=false;
  // A single scratch vector avoids allocating hundreds of arrays per RAF.
  const scratch=new Float64Array(2);
  const samplePoint=(track,at)=>{
    if(phase!=='active'){
      scratch[0]=track.x;scratch[1]=track.z;return scratch;
    }
    const elapsed=bounded(at-lastAt,0,MAX_PREDICTION_MS);
    const ticks=elapsed/TICK_MS;
    const fade=Math.exp(-elapsed/CORRECTION_MS);
    const x=track.x+track.vx*ticks+track.correctionX*fade;
    const z=track.z+track.vz*ticks+track.correctionZ*fade;
    // QA entities can legitimately cull just outside the pilot arena.
    // Keep a bounded 3-unit margin to avoid pinning them to the visible edge.
    const boundX=Math.min(60000,arenaX+3000),boundZ=Math.min(60000,arenaZ+3000);
    scratch[0]=bounded(x,-boundX,boundX);
    scratch[1]=bounded(z,-boundZ,boundZ);
    return scratch;
  };
  const estimate=(item,old,tickDelta,at,speed)=>{
    let vx=0,vz=0,correctionX=0,correctionZ=0;
    if(old&&tickDelta>0&&tickDelta<=30&&phase==='active'){
      vx=bounded((item.x-old.x)/tickDelta,-speed,speed);
      vz=bounded((item.z-old.z)/tickDelta,-speed,speed);
      // Smooth the difference between previous visual prediction and the
      // newest authoritative server position, without modifying that position.
      const previous=samplePoint(old,at);
      correctionX=bounded(previous[0]-item.x,-9000,9000);
      correctionZ=bounded(previous[1]-item.z,-9000,9000);
    }
    return {x:item.x,z:item.z,vx,vz,correctionX,correctionZ,
      ...(own(item,'id')?{id:item.id,hp:item.hp,maxHp:item.maxHp}:{})};
  };
  function projectiles(list,previous,tickDelta,at,type,hints=null){
    // Projectiles have no stable ID in C8 visual-v1. Only match small lists
    // with an unambiguous nearest predecessor. Never invent projectile count.
    const eligible=phase==='active'&&tickDelta>0&&tickDelta<=30
      &&list.length===previous.length&&list.length<=16;
    const used=new Set();
    const byId=hints===null?null:new Map(previous.filter(p=>own(p,'id'))
      .map(p=>[p.id,p]));
    return list.map((item,index)=>{
      let matched=null;
      const hint=hints?.[index]??null;
      if(hint&&byId){matched=byId.get(hint.id)??null;}
      if(!hint&&eligible){
        let best=Infinity,second=Infinity,bestIndex=-1;
        for(let i=0;i<previous.length;i++){
          if(used.has(i))continue;
          const old=previous[i];
          const dx=item.x-old.x,dz=item.z-old.z;
          if(type==='friendly'&&dz>0)continue;
          const dist=dx*dx+dz*dz;
          if(dist<best){second=best;best=dist;bestIndex=i;}
          else if(dist<second)second=dist;
        }
        // Require sufficient separation from the second candidate and
        // bounded movement. An ambiguous projectile stays at server position.
        const maxDist=type==='friendly'?24000:16000;
        if(bestIndex>=0&&best<=maxDist*maxDist
          &&(second===Infinity||second>best*1.5+250000)){
          matched=previous[bestIndex];used.add(bestIndex);
        }
      }
      const track=estimate(item,matched,tickDelta,at,MAX_SHOT_SPEED);
      if(hint){
        // These motion vectors are server-derived, presentation ONLY. No new
        // bullet, hit or damage event is ever created by this renderer.
        track.id=hint.id;
        track.vx=hint.vx;
        track.vz=hint.vz;
      }
      if(type==='friendly'&&track.vz>0)track.vz=0;
      return track;
    });
  }
  function accept(frame){
    const at=clock();
    if(!finite(at)||at<0||(lastTick>=0&&at<lastAt)
      ||!frame||frame.qaOnly!==true||frame.settlementEnabled!==false
      ||frame.productionOutcomeIssued!==false
      ||!Number.isSafeInteger(frame.serverTick)||frame.serverTick<0||frame.serverTick>4500
      ||!['active','lab-clear','lab-defeat'].includes(frame.phase)
      ||!frame.config||!Number.isSafeInteger(frame.config.arenaHalfWidth)
      ||!Number.isSafeInteger(frame.config.arenaHalfHeight)
      ||frame.config.arenaHalfWidth<2000||frame.config.arenaHalfHeight<2000
      ||frame.config.arenaHalfWidth>50000||frame.config.arenaHalfHeight>50000
      ||!Array.isArray(frame.enemies)||frame.enemies.length>MAX_ENEMIES
      ||!Array.isArray(frame.shots)||frame.shots.length>MAX_SHOTS
      ||!Array.isArray(frame.enemyShots)||frame.enemyShots.length>MAX_SHOTS)
      bad();
    if(frame.serverTick===lastTick)return false;
    if(frame.serverTick<lastTick||lastTick>=0&&phase!=='active')bad();
    for(const e of frame.enemies){
      if(!coord(e)||typeof e.id!=='string'||!e.id||e.id.length>60
        ||!Number.isSafeInteger(e.hp)||!Number.isSafeInteger(e.maxHp)
        ||e.maxHp<=0||e.hp<0||e.hp>e.maxHp)bad();
    }
    if(frame.shots.some(p=>!coord(p))||frame.enemyShots.some(p=>!coord(p)))bad();
    const ids=frame.enemies.map(e=>e.id);
    if(new Set(ids).size!==ids.length)bad();
    const hints=frame.motionHints==null?null:validateC9MotionHintsV2(
      frame.motionHints,frame);
    const tickDelta=lastTick>=0?frame.serverTick-lastTick:0;
    // Project prior visual motion using the OLD time origin first.
    const oldE=enemies,oldS=shots,oldH=enemyShots;
    const nextE=new Map();
    for(let i=0;i<frame.enemies.length;i++){
      const e=frame.enemies[i];
      // The server-provided upper speed bound narrows visual extrapolation,
      // but still cannot predict changes to chase/sine AI between ACKs.
      const speed=hints?Math.min(MAX_ENEMY_SPEED,
        hints.enemies[i].maxSpeedUnitsPerTick):MAX_ENEMY_SPEED;
      nextE.set(e.id,estimate(e,oldE.get(e.id),tickDelta,at,speed));
    }
    const nextS=projectiles(frame.shots,oldS,tickDelta,at,'friendly',hints?.shots??null);
    const nextH=projectiles(frame.enemyShots,oldH,tickDelta,at,'hostile',hints?.enemyShots??null);
    enemies=nextE;shots=nextS;enemyShots=nextH;hintsActive=Boolean(hints);
    lastAt=at;lastTick=frame.serverTick;phase=frame.phase;
    arenaX=frame.config.arenaHalfWidth;arenaZ=frame.config.arenaHalfHeight;
    return true;
  }
  function each({enemy,shot,enemyShot}={},at=clock()){
    if(!finite(at)||at<0||lastTick<0)return;
    for(const e of enemies.values()){
      const p=samplePoint(e,at);enemy?.(e.id,p[0],p[1],e.hp,e.maxHp);
    }
    for(let i=0;i<shots.length;i++){
      const p=samplePoint(shots[i],at);shot?.(i,p[0],p[1],shots[i].id??null);
    }
    for(let i=0;i<enemyShots.length;i++){
      const p=samplePoint(enemyShots[i],at);enemyShot?.(i,p[0],p[1],enemyShots[i].id??null);
    }
  }
  return Object.freeze({accept,each,
    get latestTick(){return lastTick;},
    get counts(){return Object.freeze({enemies:enemies.size,shots:shots.length,
      enemyShots:enemyShots.length});},
    get lastReceivedAt(){return lastAt;},
    get usingServerHintsV2(){return hintsActive;}});
}
