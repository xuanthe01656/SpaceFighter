/**
 * Dungeon C15 V2C.11 — QA-only live Babylon frame observation.
 * Passive evidence, NOT anti-cheat authority or a replay validator.
 * No uploads, localStorage, wallet/profile/battle writes, identifiers, or MACs.
 * A QA-controlled APK may export via the explicitly gated console accessor.
 */
export const DUNGEON_APK_TRACE_V2C11_VERSION='c15-dungeon-apk-trace-v2c11';
export const DUNGEON_APK_TRACE_V2C11_LIMITS=Object.freeze({
  frames:720,events:512,enemiesPerFrame:32,maxFrameMs:250,
});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const int=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const point=x=>plain(x)&&finite(x.x)&&finite(x.z)&&
  Math.abs(x.x)<=100&&Math.abs(x.z)<=100;
const identifier=x=>typeof x==='string'&&x.length>=1&&x.length<=128&&
  /^[A-Za-z0-9_:./@\-]+$/.test(x);
const number=(x)=>Math.round(x*10000)/10000;
const fpoint=x=>({x:number(x.x),z:number(x.z)});
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  Object.values(x).forEach(freeze);Object.freeze(x);
}return x;};
// FNV1a32 detects accidental corruption; it is NOT a cryptographic signature.
export function checksumDungeonV2C11(text){
  if(typeof text!=='string')throw new TypeError('Trace checksum text required');
  let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
export function isDungeonV2C11ApkTraceEnabled({env,qaRun,dungeonId}={}){
  return env?.VITE_SF_DUNGEON_V2C11_APK_TRACE==='true'&&
    Boolean(qaRun)&&dungeonId==='dung_taurus';
}
export function createDungeonApkCombatTraceV2C11({sceneSeed,seedSource}={}){
  if(!int(sceneSeed,1,0xffffffff)||
    !['server-ticket-local-unverified','local-client-seed'].includes(seedSource))
    throw new TypeError('V2C.11 QA seed/provenance required');
  const frames=[],events=[];
  let truncated=false,finished=false,error=null,previousTick=-1;
  const mark=(code)=>{error=error||code;truncated=true;};
  function captureFrame(frame){
    if(finished||truncated)return false;
    if(!plain(frame)||!finite(frame.simTick)||frame.simTick<0||
      frame.simTick<=previousTick||!finite(frame.dtMs)||frame.dtMs<0||
      frame.dtMs>DUNGEON_APK_TRACE_V2C11_LIMITS.maxFrameMs||
      typeof frame.roomId!=='string'||frame.roomId.length>80||
      !point(frame.player)||!finite(frame.playerHp)||
      !finite(frame.playerShieldHp)||frame.playerHp<0||
      frame.playerShieldHp<0||!Array.isArray(frame.enemies)||
      !plain(frame.projectiles)||!int(frame.projectiles.player,0,9999)||
      !int(frame.projectiles.hostile,0,9999)||
      typeof frame.bossActive!=='boolean'||
      !finite(frame.bossHp)||frame.bossHp<0){mark('INVALID_FRAME');return false;}
    if(frames.length>=DUNGEON_APK_TRACE_V2C11_LIMITS.frames||
      frame.enemies.length>DUNGEON_APK_TRACE_V2C11_LIMITS.enemiesPerFrame){
      mark('FRAME_CAP');return false;
    }
    const ids=new Set(),enemyRows=[];
    for(const enemy of frame.enemies){
      if(!plain(enemy)||!identifier(enemy.id)||ids.has(enemy.id)||
        !point(enemy.position)||!finite(enemy.hp)||!finite(enemy.maxHp)||
        enemy.maxHp<=0||enemy.hp<0||enemy.hp>enemy.maxHp*2){
        mark('INVALID_ENEMY_FRAME');return false;
      }
      ids.add(enemy.id);
      enemyRows.push({id:enemy.id,position:fpoint(enemy.position),
        hp:number(enemy.hp),maxHp:number(enemy.maxHp)});
    }
    const rec={frameSeq:frames.length+1,simTick:number(frame.simTick),
      dtMs:number(frame.dtMs),roomId:frame.roomId,
      player:fpoint(frame.player),playerHp:number(frame.playerHp),
      playerShieldHp:number(frame.playerShieldHp),
      enemies:enemyRows,projectiles:{player:frame.projectiles.player,
        hostile:frame.projectiles.hostile},bossActive:frame.bossActive,
      bossHp:number(frame.bossHp)};
    frames.push(freeze(rec));previousTick=frame.simTick;return true;
  }
  function captureEvent(event){
    if(finished||truncated)return false;
    if(!plain(event)||!['enemy_fire','enemy_death','player_salvo_plan'].includes(event.kind)||
      !finite(event.simTick)||event.simTick<0||
      ![null,undefined].includes(event.id)&&!identifier(event.id)||
      (event.position!==undefined&&!point(event.position))||
      (event.velocity!==undefined&&!point(event.velocity))||
      (event.count!==undefined&&!int(event.count,1,32))){
      mark('INVALID_EVENT');return false;
    }
    if(events.length>=DUNGEON_APK_TRACE_V2C11_LIMITS.events){
      mark('EVENT_CAP');return false;
    }
    const row={kind:event.kind,simTick:number(event.simTick),
      id:event.id??null,position:event.position?fpoint(event.position):null,
      velocity:event.velocity?fpoint(event.velocity):null,count:event.count??1};
    events.push(freeze(row));return true;
  }
  function snapshot(){
    const payload={version:DUNGEON_APK_TRACE_V2C11_VERSION,
      source:'qa-babylon-observer-untrusted',
      dungeonId:'dung_taurus',roomId:'taurus_entry',
      sceneSeed,seedSource,tickBasis:'frameScale-delta-not-fixed-tick',
      frames:frames.map(f=>structuredClone(f)),
      events:events.map(e=>structuredClone(e)),
      finished,truncated,error,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
      liveApkParityVerified:false};
    return freeze({...payload,checksum:checksumDungeonV2C11(JSON.stringify(payload))});
  }
  function finish(){finished=true;return snapshot();}
  return Object.freeze({captureFrame,captureEvent,snapshot,finish,
    get finished(){return finished;},get frameCount(){return frames.length;},
    get error(){return error;}});
}
