import { DUNGEON_C2JP_GRID_VERSION } from './DungeonC2JPInputGridV1.js';
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
  let active=[],fatal=null,sealed=null,lastSafe=null,lastSafeTick=0;
  let sealReason='NOT_SEALED',lastProbeTick=0;
  const activeIds=new Set();
  function registerShot({id,sourceId,origin,velocity,hitRadius,ttlTicks}={}) {
    if(fatal)return false;
    try {
      if(activeIds.size>=128||activeIds.has(id)||
        (!sealed&&clock.tick<C2JK_MAX_TICKS&&shotEntries.length>=128))
        bad('C2JK_SHOT_LIMIT_OR_REUSE');
      const shot=createC2JKShot({id,sourceId,spawnTick:clock.tick,
        origin,velocity,hitRadius,ttlTicks});
      // The QA evidence is frozen after tick 270, but real ballistics
      // continue under the shared kernel throughout the rest of gameplay.
      if(!sealed&&clock.tick<C2JK_MAX_TICKS)shotEntries.push({
        id:shot.id,sourceId:shot.sourceId,spawnTick:shot.spawnTick,
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
  // C2JP has a separate 270-tick QA observation contract: it may end at
  // EXACTLY tick 270 with an unclosed real touch. This is an explicitly OPEN
  // input subset; never pretend a pointer-up or full session was observed.
  function openC2JPAt270(grid){
    return grid?.version===DUNGEON_C2JP_GRID_VERSION &&
      ticks.length===C2JK_MAX_TICKS && grid.finished===true &&
      grid.pointerActive===true && grid.startedGestures>=1 &&
      grid.completedGestures===grid.startedGestures-1;
  }
  function pairedGrid(grid,allowOpen=false){
    return !!grid && Array.isArray(grid.ticks) &&
      grid.ticks.length===ticks.length && grid.captureError===null &&
      grid.overflow===false && grid.startedGestures>=1 &&
      ((grid.pointerActive===false &&
        grid.completedGestures===grid.startedGestures) ||
       (allowOpen && openC2JPAt270(grid)));
  }
  function makeSnapshot(){
    const grid=getGrid();
    if(!fatal && !pairedGrid(grid,true))bad('C2JL_LIVE_GRID_UNPAIRED');
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
  const invalidate=message=>{fatal||=String(message||'C2JK_UNSUPPORTED_SHOT');return false;};
  // A 270-tick window is ideal. Continuous touch or a 256-event limit may
  // invalidate that END frame; preserve the latest previously complete,
  // paired, independently auditable prefix instead of losing ALL evidence.
  // This never extends the window, invents pointer-up or changes live physics.
  function safeGridForPrefix(grid){
    return !fatal && ticks.length>=60 && ticks.length<=C2JK_MAX_TICKS &&
      pairedGrid(grid,false);
  }
  function trySavePrefix(){
    if(ticks.length<60 || ticks.length%15!==0 || ticks.length===lastProbeTick)return;
    lastProbeTick=ticks.length;
    const grid=getGrid();
    if(!safeGridForPrefix(grid))return;
    lastSafe=makeSnapshot();
    lastSafeTick=ticks.length;
  }
  function sealPrefix(reason){
    if(!lastSafe)return false;
    sealed=lastSafe;
    sealReason=reason;
    return true;
  }
  // DungeonScene calls this AFTER C2C.captureFrame() for the same render.
  // Once frozen, real projectiles continue under the shared deterministic core.
  function afterGridFrame(captured){
    if(sealed)return true;
    if(captured!==true){
      if(sealPrefix('C2JN_EARLY_SAFE_PREFIX_GRID_STOPPED'))return true;
      return invalidate('C2JL_GRID_CAPTURE_FAILED');
    }
    if(fatal)return false;
    try{
      trySavePrefix();
      if(ticks.length>=C2JK_MAX_TICKS){
        const grid=getGrid();
        if(safeGridForPrefix(grid) || (!fatal && pairedGrid(grid,true))){
          sealed=makeSnapshot();
          sealReason=openC2JPAt270(grid)
            ? 'C2JP_EXACT_270_OPEN_GESTURE_SUBSET'
            : 'C2JN_EXACT_270_PAIRED';
        }else if(!sealPrefix('C2JN_SAFE_PREFIX_GESTURE_OR_GRID_END')){
          return invalidate('C2JL_LIVE_GRID_UNPAIRED');
        }
      }
    }catch(err){return invalidate(err?.message||'C2JN_SEAL_FAILURE');}
    return true;
  }
  const snapshot=()=>sealed||makeSnapshot();
  function diagnostics(){
    let grid=null,gridError=null;
    try{grid=getGrid();}catch(err){gridError='C2JN_GRID_SNAPSHOT_ERROR';}
    const n=ticks.length,gridN=Array.isArray(grid?.ticks)?grid.ticks.length:0;
    const activePointer=grid?.pointerActive===true;
    let reason='C2JN_READY';
    if(fatal)reason=fatal;
    else if(sealed)reason=sealReason;
    else if(gridError)reason=gridError;
    else if(n<60)reason='C2JN_NEED_AT_LEAST_60_TICKS';
    else if(grid?.captureError||grid?.overflow)reason='C2JN_GRID_CAPTURE_INVALID';
    else if(n!==gridN)reason='C2JN_GRID_TICK_COUNT_MISMATCH';
    else if(!(grid?.completedGestures>0))reason='C2JN_NEED_TOUCH_RELEASE';
    else if(activePointer||grid?.completedGestures!==grid?.startedGestures)
      reason='C2JN_WAIT_TOUCH_RELEASE';
    return Object.freeze({reasonCode:reason,ballisticTicks:n,gridTicks:gridN,
      pointerEvents:Array.isArray(grid?.pointerEvents)?grid.pointerEvents.length:0,
      startedGestures:Number.isInteger(grid?.startedGestures)?grid.startedGestures:0,
      completedGestures:Number.isInteger(grid?.completedGestures)?grid.completedGestures:0,
      pointerActive:activePointer,gridOverflow:grid?.overflow===true,
      safePrefixTicks:lastSafeTick,exportTicks:sealed?.ticks?.length??0,
      sealed:sealed!==null,shotCount:shotEntries.length,
      captureError:fatal,gridCaptureError:grid?.captureError||gridError||null});
  }
  return Object.freeze({registerShot,stepFrame,afterGridFrame,snapshot,invalidate,
    diagnostics,
    get tick(){return clock.tick;},get error(){return fatal;},
    get sealed(){return sealed!==null;},
    get shotCount(){return shotEntries.length;},get recordedTicks(){return ticks.length;}});
}

export function prepareC2JKFixedBallisticJson(record,date=new Date()){
  if(!record||record.version!==C2JK_JOURNAL_VERSION||record.qaOnly!==true||
    record.safeForSettlement!==false||record.rewardSettlementEnabled!==false||
    record.cloudRewards!==false||record.fullCombatReplayVerified!==false||
    record.trueApkServerParity!=='NOT_VERIFIED'||record.captureError!==null||
    !Array.isArray(record.ticks)||record.ticks.length<60||
    !Array.isArray(record.shots)||!record.grid||
    record.grid.ticks?.length!==record.ticks.length||
    record.grid.captureError!==null||record.grid.overflow!==false||
    !record.grid?.version||
    !(
      (record.grid.pointerActive===false &&
       record.grid.completedGestures>=1 &&
       record.grid.completedGestures===record.grid.startedGestures) ||
      (record.grid.version===DUNGEON_C2JP_GRID_VERSION &&
       record.ticks.length===C2JK_MAX_TICKS &&
       record.grid.finished===true && record.grid.pointerActive===true &&
       record.grid.startedGestures>=1 &&
       record.grid.completedGestures===record.grid.startedGestures-1)
    )||
    !(date instanceof Date)||!Number.isFinite(date.getTime()))bad('C2JK_UNSAFE_EXPORT');
  const compact=JSON.stringify(record)+'\n';
  const maxBytes=record.grid.version===DUNGEON_C2JP_GRID_VERSION ? 2*1024*1024 : 256*1024;
  if(new TextEncoder().encode(compact).length>maxBytes)bad('C2JK_EXPORT_TOO_LARGE');
  const stamp=date.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
  return Object.freeze({fileName:`dungeon_taurus_c2jk_${stamp}.json`,json:compact,
    tickCount:record.ticks.length,shotCount:record.shots.length,
    evidenceStatus:'CLIENT_LIVE_SHARED_BALLISTIC_SUBSET_UNTRUSTED'});
}

/** A FAIL-only debug artifact. Never substitute this for a C2JK replay receipt.
 * Contains counters and error codes only; no ticket, credentials, UID or raw inputs.
 */
export function prepareC2JNDiagnosticJson(diagnostics,reason,date=new Date()){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))bad('C2JN_BAD_DATE');
  const fields=['reasonCode','ballisticTicks','gridTicks','pointerEvents',
    'startedGestures','completedGestures','pointerActive','gridOverflow',
    'safePrefixTicks','exportTicks','sealed','shotCount','captureError','gridCaptureError'];
  const status={};
  for(const key of fields){
    const value=diagnostics?.[key];
    if(typeof value==='number')status[key]=Number.isFinite(value)?Math.max(0,Math.min(100000,value)):0;
    else if(typeof value==='boolean')status[key]=value;
    else status[key]=typeof value==='string'&&/^[A-Za-z0-9_:-]{1,96}$/.test(value)?value:null;
  }
  const reasonCode=/^[A-Za-z0-9_:-]{1,96}$/.test(reason||'')
    ? reason : status.reasonCode||'C2JN_EXPORT_FAILED';
  const record={version:'c15-c2jn-qa-diagnostic-v1',
    source:'guest-taurus-export-blocker-untrusted',
    dungeonId:'dung_taurus',roomId:'taurus_entry',
    qaOnly:true,diagnosticOnly:true,recordValid:false,
    liveApkParityVerified:false,fullCombatReplayVerified:false,
    trueApkServerParity:'NOT_VERIFIED',safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,reasonCode,status};
  const stamp=date.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
  return Object.freeze({fileName:`dungeon_taurus_c2jn_diag_${stamp}.json`,
    json:JSON.stringify(record)+'\n',evidenceStatus:'C2JN_DIAGNOSTIC_ONLY_FAIL_CLOSED'});
}
