/**
 * C2JP QA-only, lossless high-rate accepted input observations for Guest Taurus
 * C2JK ballistic subset. C2C V1 remains unchanged for C2B/C2D/C2E/C2F.
 * This is NOT a server-signed, authoritative fixed-tick input journal.
 *
 * No pointer events are dropped, thinned, grouped, fabricated or synthesized.
 * The explicit cap bounds debug APK memory; overflow fails closed.
 */
export const DUNGEON_C2JP_GRID_VERSION = 'c15-dungeon-c2jp-input-grid-v1';
// Separate wire format: an observed Taurus-room boundary, NOT a full 270-tick capture.
export const DUNGEON_C2JQ_EXIT_GRID_VERSION = 'c15-dungeon-c2jq-room-exit-grid-v1';
export const DUNGEON_C2JP_GRID_LIMITS = Object.freeze({ticks:270,pointers:4096,frameDeltaMs:100});
const SOURCE='accepted-controller-plus-babylon-observer-high-rate-untrusted';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const within=(x,a,b)=>finite(x)&&x>=a&&x<=b;
const coord=x=>plain(x)&&within(x.x,-100,100)&&within(x.z,-100,100);
const round=x=>Math.round(x*10000)/10000;
const point=x=>({x:round(x.x),z:round(x.z)});
const clone=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))freeze(v);Object.freeze(x);
}return x;};
function hash(text){let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}

export function createDungeonC2JPInputGridV1({sceneSeed,seedSource,battleId=null,initialPlayer}={}){
  if(!Number.isSafeInteger(sceneSeed)||sceneSeed<1||sceneSeed>0xffffffff||
    seedSource!=='local-client-seed'||battleId!==null||!coord(initialPlayer))
    throw new TypeError('C2JP_GUEST_QA_ONLY');
  const pointerEvents=[],ticks=[];
  let active=null,lastAt=-1,startedGestures=0,completedGestures=0;
  let acc=0,frameSeq=0,overflow=false,error=null,finished=false;
  let roomExit=null,windowPointerCount=null;
  let acceptedPosition=point(initialPlayer);
  const fail=reason=>{error ||= reason;return false;};

  function capturePointer(e){
    if(finished||overflow||error)return false;
    if(!plain(e)||!['down','move','up'].includes(e.kind)||
      !Number.isSafeInteger(e.pointerId)||e.pointerId<0||e.pointerId>2147483647||
      !within(e.atMs,0,Number.MAX_SAFE_INTEGER)||e.atMs<lastAt||
      !coord(e.position))return fail('C2JP_POINTER_INVALID');
    if(pointerEvents.length>=DUNGEON_C2JP_GRID_LIMITS.pointers){
      overflow=true;return false;
    }
    const row={seq:pointerEvents.length+1,tick:ticks.length+1,
      kind:e.kind,pointerId:e.pointerId,atMs:round(e.atMs),position:point(e.position)};
    if(e.kind==='down'){
      if(active!==null||!within(e.clientX,-20000,20000)||!within(e.clientY,-20000,20000))
        return fail('C2JP_POINTER_SEQUENCE');
      active=e.pointerId;startedGestures++;
      row.clientX=round(e.clientX);row.clientY=round(e.clientY);
    }else if(e.kind==='move'){
      if(active!==e.pointerId||!within(e.clientX,-20000,20000)||
        !within(e.clientY,-20000,20000)||!plain(e.viewport)||!plain(e.delta)||
        !within(e.delta.deltaX,-20000,20000)||!within(e.delta.deltaY,-20000,20000)||
        !within(e.viewport.canvasWidth,1,20000)||!within(e.viewport.canvasHeight,1,20000)||
        !within(e.viewport.aspect,.1,10)||e.viewport.halfHeight!==15||
        e.viewport.inset!==1.8||e.viewport.pointerSpeedMultiplier!==1)
        return fail('C2JP_POINTER_SEQUENCE');
      row.clientX=round(e.clientX);row.clientY=round(e.clientY);
      row.viewport={canvasWidth:round(e.viewport.canvasWidth),
        canvasHeight:round(e.viewport.canvasHeight),aspect:round(e.viewport.aspect),
        halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
      row.delta={deltaX:round(e.delta.deltaX),deltaY:round(e.delta.deltaY)};
    }else{
      if(active!==e.pointerId)return fail('C2JP_POINTER_SEQUENCE');
      active=null;completedGestures++;
    }
    pointerEvents.push(freeze(row));acceptedPosition=point(e.position);lastAt=e.atMs;
    return true;
  }

  function captureFrame({deltaMs,player,playerHp,shieldHp,enemyCount}={}){
    if(finished||overflow||error)return false;
    if(!within(deltaMs,0,DUNGEON_C2JP_GRID_LIMITS.frameDeltaMs)||
      !coord(player)||!within(playerHp,0,1e9)||!within(shieldHp,0,1e9)||
      !Number.isSafeInteger(enemyCount)||enemyCount<0||enemyCount>1000)
      return fail('C2JP_FRAME_GAP_OR_INVALID');
    frameSeq++;acc+=deltaMs;
    const step=1000/30;
    while(acc+1e-9>=step && ticks.length<DUNGEON_C2JP_GRID_LIMITS.ticks){
      ticks.push(freeze({tick:ticks.length+1,frameSeq,
        inputPosition:point(acceptedPosition),observedPlayer:point(player),
        observedHp:round(playerHp),observedShieldHp:round(shieldHp),
        observedEnemyCount:enemyCount}));
      acc-=step;
    }
    // The observed 270-tick window is immutable after capture. A finger may
    // still be down at its boundary; the C2JP server auditor marks OPEN, not UP.
    if(ticks.length===DUNGEON_C2JP_GRID_LIMITS.ticks)finished=true;
    return true;
  }

  // End evidence as the director transitions OUT of Taurus entry. Any
  // pointer events tagged to tick N+1 have NO matching observed simulation
  // tick. They are OUTSIDE the captured window, never replayed or fabricated.
  // The original accepted buffer remains untouched; only the sealed subset
  // is exported. This is a client-reported, untrusted room boundary.
  function sealAtRoomExit(){
    if(finished||overflow||error||ticks.length<60||
      ticks.length>=DUNGEON_C2JP_GRID_LIMITS.ticks)return false;
    const keep=pointerEvents.findIndex(e=>e.tick>ticks.length);
    const included=keep<0?pointerEvents.length:keep;
    let id=null,starts=0,ends=0;
    for(let i=0;i<included;i++){
      const e=pointerEvents[i];
      if(e.kind==='down'){if(id!==null)return fail('C2JQ_EXIT_INPUT_INVALID');id=e.pointerId;starts++;}
      else if(e.kind==='up'){if(id!==e.pointerId)return fail('C2JQ_EXIT_INPUT_INVALID');id=null;ends++;}
      else if(id!==e.pointerId)return fail('C2JQ_EXIT_INPUT_INVALID');
    }
    if(starts<1 || ends<starts-1)return false;
    windowPointerCount=included;
    roomExit=freeze({kind:'next_room_started',finalTick:ticks.length,
      excludedUnsampledPointerEvents:pointerEvents.length-included});
    finished=true;
    return true;
  }
  function snapshot(){
    const included=windowPointerCount===null?pointerEvents:pointerEvents.slice(0,windowPointerCount);
    let starts=startedGestures,ends=completedGestures,pointerIsActive=active!==null;
    if(roomExit){
      starts=0;ends=0;let id=null;
      for(const e of included){
        if(e.kind==='down'){starts++;id=e.pointerId;}
        else if(e.kind==='up'){ends++;id=null;}
      }
      pointerIsActive=id!==null;
    }
    const body={version:roomExit?DUNGEON_C2JQ_EXIT_GRID_VERSION:DUNGEON_C2JP_GRID_VERSION,source:SOURCE,
      dungeonId:'dung_taurus',roomId:'taurus_entry',battleId,
      sceneSeed,seedSource,tickHz:30,
      tickBasis:'accumulated-babylon-delta-not-fixed-combat-simulation',
      initialPlayer:point(initialPlayer),pointerEvents:clone(included),ticks:clone(ticks),
      startedGestures:starts,completedGestures:ends,pointerActive:pointerIsActive,
      overflow,captureError:error,finished,qaOnly:true,
      fixedTickSimulationVerified:false,independentCombatReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
      checksumAlgorithm:'fnv1a32-accidental-corruption-only',
      ...(roomExit?{roomExit}: {})};
    return freeze({...body,checksum:hash(JSON.stringify(body))});
  }
  function finish(){finished=true;return snapshot();}
  return Object.freeze({capturePointer,captureFrame,snapshot,finish,sealAtRoomExit,
    get tickCount(){return ticks.length;},
    get acceptedPointerCount(){return pointerEvents.length;}});
}
