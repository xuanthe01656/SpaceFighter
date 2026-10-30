/**
 * C9: server-checkpoint-only render model for the manually enabled C8 Cloud QA cockpit.
 * Presentation math cannot issue victories, rewards, HP, spawn, hits or ticks.
 * This is deliberately NON-ECONOMIC: QA fixture outcomes are NOT production grants.
 */
import {validateC9MotionHintsV2} from './C9MotionHintsV2.js';
export const C9_SERVER_SCENE_VERSION='c9-server-checkpoint-babylon-qa-v1';
const VIEW='sf-c8-alpha1-server-render-qa-v1';
const PHASES=new Set(['active','lab-clear','lab-defeat']);
const LIMITS=Object.freeze({enemies:32,shots:128,enemyShots:128});
const SCENE_FIELDS=['version','qaOnly','settlementEnabled','locationId','tick','phase',
  'hp','maxHp','kills','contacts','spawnedWaves','config','pilot','enemies','shots','enemyShots'];
const CONFIG_FIELDS=['arenaHalfWidth','arenaHalfHeight','hitRadius','movePerTick',
  'startX','startZ','speedMultiplier'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(o,fields)=>obj(o)&&Object.keys(o).length===fields.length
  &&fields.every(field=>Object.hasOwn(o,field));
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const finite=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const error=(code)=>{const err=new Error(code);err.code=code;throw err;};
const position=o=>exact(o,['x','z'])&&integer(o.x,-60000,60000)
  &&integer(o.z,-60000,60000);
function normalizeView(visual){
  if(!exact(visual,SCENE_FIELDS)||visual.version!==VIEW
    ||visual.qaOnly!==true||visual.settlementEnabled!==false
    ||visual.locationId!=='alpha_stage_1'||!PHASES.has(visual.phase)
    ||!integer(visual.tick,0,4500)||!integer(visual.hp,0,10000000)
    ||!integer(visual.maxHp,1,10000000)||visual.hp>visual.maxHp
    ||!integer(visual.kills,0,128)||!integer(visual.contacts,0,128)
    ||!integer(visual.spawnedWaves,0,5)
    ||!exact(visual.config,CONFIG_FIELDS)
    ||!integer(visual.config.arenaHalfWidth,2000,50000)
    ||!integer(visual.config.arenaHalfHeight,2000,50000)
    ||!integer(visual.config.hitRadius,100,2500)
    ||!integer(visual.config.movePerTick,1,3000)
    ||!integer(visual.config.startX,-50000,50000)
    ||!integer(visual.config.startZ,-50000,50000)
    ||!finite(visual.config.speedMultiplier,0,5)
    ||!position(visual.pilot)
    ||Math.abs(visual.pilot.x)>visual.config.arenaHalfWidth
    ||Math.abs(visual.pilot.z)>visual.config.arenaHalfHeight)
    error('C9_SERVER_VISUAL_INVALID');
  for(const [name,limit] of Object.entries(LIMITS)){
    const list=visual[name];
    if(!Array.isArray(list)||list.length>limit)error('C9_SERVER_VISUAL_BUDGET');
    const seen=new Set();
    for(const entry of list){
      if(name==='enemies'){
        if(!exact(entry,['id','x','z','hp','maxHp'])||typeof entry.id!=='string'
          ||entry.id.length<1||entry.id.length>60||seen.has(entry.id)
          ||!integer(entry.hp,0,10000000)||!integer(entry.maxHp,1,10000000)
          ||entry.hp>entry.maxHp||!position({x:entry.x,z:entry.z}))
          error('C9_SERVER_ENEMY_INVALID');
        seen.add(entry.id);
      }else if(!position(entry))error('C9_SERVER_PROJECTILE_INVALID');
    }
  }
  // Structured clone prevents later mutation of the transport response from
  // rewriting previously received server truth used for interpolation.
  return structuredClone(visual);
}
const lerp=(a,b,alpha)=>Math.round(a+(b-a)*alpha);
const mix=(a,b,alpha)=>({x:lerp(a.x,b.x,alpha),z:lerp(a.z,b.z,alpha)});
/** The `predicted` pointer is visual-only; it never updates server-derived data. */
export function createServerSceneModelC9({clock=()=>Date.now(),interpolationMs=90}={}){
  if(typeof clock!=='function'||!integer(interpolationMs,0,150))throw new TypeError('C9 render clock');
  let previous=null,current=null,receivedAt=0,currentMotion=null;
  function accept(visual,motionHints=null){
    const next=normalizeView(visual),at=clock();
    const hints=motionHints==null?null:validateC9MotionHintsV2(motionHints,next);
    if(!finite(at,0,Number.MAX_SAFE_INTEGER)||(current&&at<receivedAt))
      error('C9_RENDER_CLOCK_INVALID');
    if(current){
      if(next.tick<current.tick)error('C9_SERVER_TICK_REWIND');
      if(next.tick===current.tick){
        // Different valid hint availability across a staging deploy must not
        // change or equivocate an immutable visual-v1 checkpoint.
        if(JSON.stringify(next)!==JSON.stringify(current)
          ||(hints&&currentMotion&&JSON.stringify(hints)!==JSON.stringify(currentMotion)))
          error('C9_SERVER_TICK_EQUIVOCATION');
        return false;
      }
      if(current.phase!=='active')error('C9_SERVER_TERMINAL_REOPEN');
      if(next.hp>next.maxHp||next.tick>4500)error('C9_SERVER_VISUAL_INVALID');
      if(JSON.stringify(next.config)!==JSON.stringify(current.config))
        error('C9_SERVER_CONFIG_CHANGED');
    }
    previous=current;current=next;currentMotion=hints;receivedAt=at;
    return true;
  }
  function frame(predicted=null,authoritative=false){
    if(!current)return null;
    const now=clock();
    if(!finite(now,0,Number.MAX_SAFE_INTEGER))error('C9_RENDER_CLOCK_INVALID');
    const eligible=!authoritative&&previous&&previous.phase==='active'&&current.tick-previous.tick<=30
      &&interpolationMs>0&&now>=receivedAt;
    const alpha=eligible?Math.max(0,Math.min(1,(now-receivedAt)/interpolationMs)):1;
    const enemyPrev=new Map((previous?.enemies||[]).map(e=>[e.id,e]));
    const enemies=current.enemies.map(e=>{
      const p=eligible?enemyPrev.get(e.id):null;
      return {...e,...(p?mix(p,e,alpha):{x:e.x,z:e.z})};
    });
    let ghost=null;
    if(position(predicted)
      &&Math.abs(predicted.x)<=current.config.arenaHalfWidth
      &&Math.abs(predicted.z)<=current.config.arenaHalfHeight){
      ghost={x:predicted.x,z:predicted.z};
    }
    // HP, kills, waves, terminal state, enemy existence and projectile count
    // are always copied from CURRENT server truth, never interpolated.
    return {version:C9_SERVER_SCENE_VERSION,serverTick:current.tick,
      phase:current.phase,hp:current.hp,maxHp:current.maxHp,
      kills:current.kills,contacts:current.contacts,spawnedWaves:current.spawnedWaves,
      config:structuredClone(current.config),
      pilot:eligible?mix(previous.pilot,current.pilot,alpha):{...current.pilot},
      predictedGhost:ghost,enemies,shots:structuredClone(current.shots),
      enemyShots:structuredClone(current.enemyShots),
      ...(currentMotion?{motionHints:structuredClone(currentMotion)}:{}),
      qaOnly:true,settlementEnabled:false,productionOutcomeIssued:false};
  }
  return Object.freeze({accept,frame,authoritativeFrame:()=>frame(null,true),
    get tick(){return current?.tick??null;},
    get phase(){return current?.phase??null;}});
}
