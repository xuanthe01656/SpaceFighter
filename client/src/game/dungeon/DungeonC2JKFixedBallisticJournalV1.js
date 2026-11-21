import { C2JK_CORE_VERSION, C2JK_MAX_TICKS, createC2JKFixedClock,
  createC2JKShot, stepC2JKShots, c2jkHash } from './DungeonC2JKFixedBallisticCoreV1.js';

/** QA-only journal for shots moved by the REAL DungeonScene using the shared core.
 * Projectile origin/velocity and input pose still originate from the APK.
 * Neither the hash nor this record is a security credential or settlement proof.
 */
export const C2JK_JOURNAL_VERSION='c15-c2jk-live-fixed-ballistic-journal-v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const quant=x=>Math.round(x*10000)/10000;
const goodId=x=>typeof x==='string'&&/^[A-Za-z0-9_:./@-]{1,128}$/.test(x);
const bad=msg=>{throw new TypeError(msg);};

export function createC2JKFixedBallisticJournal({sceneSeed,seedSource,
  battleId=null,getGrid}={}) {
  if (!Number.isSafeInteger(sceneSeed)||sceneSeed<1||sceneSeed>0xffffffff||
    seedSource!=='local-client-seed'||battleId!==null||typeof getGrid!=='function')
    bad('C2JK_GUEST_QA_ONLY');
  const clock=createC2JKFixedClock(),shotEntries=[],ticks=[];
  let active=[],fatal=null,sealed=null;
  const activeIds=new Set();
  function registerShot({id,sourceId,origin,velocity,hitRadius,ttlTicks}={}) {
    if(fatal||sealed)return false;
    try {
      if(shotEntries.length>=128||activeIds.has(id))bad('C2JK_SHOT_LIMIT_OR_REUSE');
      const shot=createC2JKShot({id,sourceId,spawnTick:clock.tick,
        origin,velocity,hitRadius,ttlTicks});
      shotEntries.push({id:shot.id,sourceId:shot.sourceId,spawnTick:shot.spawnTick,
        origin:{x:shot.x,z:shot.z},velocity:{x:shot.vx,z:shot.vz},
        hitRadius:shot.hitRadius,ttlTicks:shot.ttlTicks});
      activeIds.add(id);active.push(shot);
      return true;
    }catch(err){fatal=err?.message||'C2JK_SHOT_INVALID';return false;}
  }
  function stepFrame(deltaMs,player) {
    if(fatal)return {frames:[],error:fatal};
    const frames=[];
    try {
      const nextTicks=clock.advance(deltaMs);
      for(const tick of nextTicks){
        const result=stepC2JKShots(active,player);
        active=result.active.slice();
        const row={tick,player:{x:quant(player.x),z:quant(player.z)},
          stateDigest:result.stateDigest,activeCount:result.active.length,
          contacts:result.contacts.slice(),expired:result.expired.slice()};
        frames.push({...row,activeShots:result.active.map(s=>({id:s.id,x:s.x,z:s.z}))});
        for(const id of [...result.contacts,...result.expired])activeIds.delete(id);
        if(tick<=C2JK_MAX_TICKS && !sealed){
          ticks.push(row);
        }
      }
    }catch(err){fatal=err?.message||'C2JK_STEP_FAILURE';}
    return {frames,error:fatal};
  }
  function makeSnapshot(){
    const grid=getGrid();
    const body={version:C2JK_JOURNAL_VERSION,coreVersion:C2JK_CORE_VERSION,
      source:'live-taurus-fixed30-hostile-projectiles-untrusted',dungeonId:'dung_taurus',
      roomId:'taurus_entry',sceneSeed,seedSource,battleId,
      tickHz:30,tickBasis:'client-fixed-ballistics-not-full-combat',
      grid:clone(grid),shots:clone(shotEntries.filter(s=>s.spawnTick<ticks.length)),
      ticks:clone(ticks),captureError:fatal,
      qaOnly:true,clientFixedBallisticStepObserved:true,
      independentEnemyAiVerified:false,independentDamageVerified:false,
      fullCombatReplayVerified:false,trueApkServerParity:'NOT_VERIFIED',
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
      checksumAlgorithm:'fnv1a32-accidental-corruption-only'};
    return {...body,checksum:c2jkHash(body)};
  }
  function snapshot(){
    // The observer samples AFTER the actual Babylon combat pass. Sealing in K
    // would store 269 GRID ticks for a 270-tick projectile trace.
    if(!sealed && ticks.length>=C2JK_MAX_TICKS)sealed=makeSnapshot();
    return sealed||makeSnapshot();
  }
  const invalidate=message=>{fatal||=String(message||'C2JK_UNSUPPORTED_SHOT');return false;};
  return Object.freeze({registerShot,stepFrame,snapshot,invalidate,
    get tick(){return clock.tick;},get error(){return fatal;},
    get shotCount(){return shotEntries.length;},get recordedTicks(){return ticks.length;}});
}

export function prepareC2JKFixedBallisticJson(record,date=new Date()){
  if(!record||record.version!==C2JK_JOURNAL_VERSION||record.qaOnly!==true||
    record.safeForSettlement!==false||record.rewardSettlementEnabled!==false||
    record.cloudRewards!==false||record.fullCombatReplayVerified!==false||
    record.trueApkServerParity!=='NOT_VERIFIED'||record.captureError!==null||
    !Array.isArray(record.ticks)||record.ticks.length<60||
    !Array.isArray(record.shots)||!record.grid||
    !(date instanceof Date)||!Number.isFinite(date.getTime()))bad('C2JK_UNSAFE_EXPORT');
  const compact=JSON.stringify(record)+'\n';
  if(new TextEncoder().encode(compact).length>256*1024)bad('C2JK_EXPORT_TOO_LARGE');
  const stamp=date.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
  return Object.freeze({fileName:`dungeon_taurus_c2jk_${stamp}.json`,json:compact,
    tickCount:record.ticks.length,shotCount:record.shots.length,
    evidenceStatus:'CLIENT_LIVE_SHARED_BALLISTIC_SUBSET_UNTRUSTED'});
}
