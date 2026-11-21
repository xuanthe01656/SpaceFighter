/**
 * C15 C2C: passive 30Hz INPUT OBSERVATION, NOT a fixed-step combat engine.
 * Events are emitted only by the reviewed accepted ShipInputController hook.
 * Quantization uses accumulated Babylon frame time. No attestation, replay
 * authority, ticket MAC, UID, network, inventory or reward mutation here.
 */
export const DUNGEON_C2C_GRID_V1='c15-dungeon-c2c-input-grid-v1';
export const DUNGEON_C2C_GRID_HZ=30;
export const DUNGEON_C2C_GRID_LIMITS=Object.freeze({ticks:360,pointers:256,frameDeltaMs:100});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const within=(x,a,b)=>finite(x)&&x>=a&&x<=b;
const coord=x=>plain(x)&&within(x.x,-100,100)&&within(x.z,-100,100);
const round=x=>Math.round(x*10000)/10000;
const point=x=>({x:round(x.x),z:round(x.z)});
const deepFreeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const value of Object.values(x))deepFreeze(value);Object.freeze(x);
}return x;};
const clone=x=>JSON.parse(JSON.stringify(x));
function checksum(text){let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0;
  return hash.toString(16).padStart(8,'0');
}
export function createDungeonC2CInputGridV1({sceneSeed,seedSource,battleId=null,initialPlayer}={}){
  if(!Number.isSafeInteger(sceneSeed)||sceneSeed<1||sceneSeed>0xffffffff||
    !['local-client-seed','server-ticket-local-unverified'].includes(seedSource)||
    (seedSource==='local-client-seed'?battleId!==null:!UUID.test(battleId||''))||
    !coord(initialPlayer))throw new TypeError('C2C_UNTRUSTED_START');
  const pointerEvents=[],ticks=[];
  let lastPointerAt=-1,active=null,completedGestures=0,startedGestures=0;
  let acc=0,frameSeq=0,overflow=false,error=null,finished=false;
  let acceptedPosition=point(initialPlayer),checkpoint=null;
  const fail=message=>{error ||= message;return false;};
  function capturePointer(e){
    if(finished||error||overflow)return false;
    if(!plain(e)||!['down','move','up'].includes(e.kind)||
      !Number.isSafeInteger(e.pointerId)||e.pointerId<0||e.pointerId>2147483647||
      !within(e.atMs,0,Number.MAX_SAFE_INTEGER)||e.atMs<lastPointerAt||
      !coord(e.position))return fail('C2C_POINTER_INVALID');
    if(pointerEvents.length>=DUNGEON_C2C_GRID_LIMITS.pointers){overflow=true;return false;}
    const row={seq:pointerEvents.length+1,tick:ticks.length+1,
      kind:e.kind,pointerId:e.pointerId,atMs:round(e.atMs),position:point(e.position)};
    if(e.kind==='down'){
      if(active!==null||!within(e.clientX,-20000,20000)||!within(e.clientY,-20000,20000))
        return fail('C2C_POINTER_SEQUENCE');
      active=e.pointerId;startedGestures++;
      row.clientX=round(e.clientX);row.clientY=round(e.clientY);
    }else if(e.kind==='move'){
      if(active!==e.pointerId||!within(e.clientX,-20000,20000)||
        !within(e.clientY,-20000,20000)||!plain(e.viewport)||!plain(e.delta)||
        !within(e.delta.deltaX,-20000,20000)||!within(e.delta.deltaY,-20000,20000)||
        !within(e.viewport.canvasWidth,1,20000)||!within(e.viewport.canvasHeight,1,20000)||
        !within(e.viewport.aspect,.1,10)||e.viewport.halfHeight!==15||
        e.viewport.inset!==1.8||e.viewport.pointerSpeedMultiplier!==1)
        return fail('C2C_POINTER_SEQUENCE');
      row.clientX=round(e.clientX);row.clientY=round(e.clientY);
      row.viewport={canvasWidth:round(e.viewport.canvasWidth),
        canvasHeight:round(e.viewport.canvasHeight),aspect:round(e.viewport.aspect),
        halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
      row.delta={deltaX:round(e.delta.deltaX),deltaY:round(e.delta.deltaY)};
    }else{
      if(active!==e.pointerId)return fail('C2C_POINTER_SEQUENCE');
      active=null;completedGestures++;
    }
    acceptedPosition=point(e.position);
    lastPointerAt=e.atMs;
    pointerEvents.push(deepFreeze(row));
    return true;
  }
  function captureFrame({deltaMs,player,playerHp,shieldHp,enemyCount}={}){
    if(finished||error||overflow)return false;
    if(!within(deltaMs,0,DUNGEON_C2C_GRID_LIMITS.frameDeltaMs)||
      !coord(player)||!within(playerHp,0,1e9)||!within(shieldHp,0,1e9)||
      !Number.isSafeInteger(enemyCount)||enemyCount<0||enemyCount>1000)
      return fail('C2C_FRAME_GAP_OR_INVALID');
    frameSeq++;
    acc+=deltaMs;
    const step=1000/DUNGEON_C2C_GRID_HZ;
    while(acc+1e-9>=step){
      if(ticks.length>=DUNGEON_C2C_GRID_LIMITS.ticks){overflow=true;return false;}
      ticks.push(deepFreeze({tick:ticks.length+1,frameSeq,
        inputPosition:point(acceptedPosition),observedPlayer:point(player),
        observedHp:round(playerHp),observedShieldHp:round(shieldHp),
        observedEnemyCount:enemyCount}));
      acc-=step;
    }
    if(!checkpoint&&ticks.length>=60&&completedGestures>0&&
       completedGestures===startedGestures&&active===null&&!overflow&&!error){
      checkpoint=snapshotNow(false);
    }
    return true;
  }
  function snapshotNow(isFinished){
    const payload={version:DUNGEON_C2C_GRID_V1,
      source:'accepted-controller-plus-babylon-observer-untrusted',
      dungeonId:'dung_taurus',roomId:'taurus_entry',battleId,
      sceneSeed,seedSource,tickHz:DUNGEON_C2C_GRID_HZ,
      tickBasis:'accumulated-babylon-delta-not-fixed-combat-simulation',
      initialPlayer:point(initialPlayer),pointerEvents:clone(pointerEvents),ticks:clone(ticks),
      startedGestures,completedGestures,pointerActive:active!==null,
      overflow,captureError:error,finished:isFinished,qaOnly:true,
      fixedTickSimulationVerified:false,independentCombatReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
      checksumAlgorithm:'fnv1a32-accidental-corruption-only'};
    return deepFreeze({...payload,checksum:checksum(JSON.stringify(payload))});
  }
  const snapshot=()=>snapshotNow(finished);
  function finish(){finished=true;return snapshot();}
  return Object.freeze({capturePointer,captureFrame,snapshot,finish,
    exportEvidence:()=>checkpoint||snapshot(),
    get tickCount(){return ticks.length;},get acceptedPointerCount(){return pointerEvents.length;}});
}

/** Local file export only; unlike a staging POST it never includes ticket MAC. */
export function prepareDungeonC2CInputGridJsonV1(record,date=new Date()){
  if(!plain(record)||record.version!==DUNGEON_C2C_GRID_V1||
    record.qaOnly!==true||record.safeForSettlement!==false||
    record.rewardSettlementEnabled!==false||record.cloudRewards!==false||
    !Array.isArray(record.ticks)||!Array.isArray(record.pointerEvents)||
    !(date instanceof Date)||!Number.isFinite(date.getTime()))
    throw new TypeError('C2C_EXPORT_UNSAFE');
  const json=`${JSON.stringify(record,null,2)}\n`;
  if(new TextEncoder().encode(json).length>128*1024)throw new TypeError('C2C_EXPORT_TOO_LARGE');
  const stamp=date.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
  return Object.freeze({fileName:`dungeon_taurus_c2c_${stamp}.json`,json,
    tickCount:record.ticks.length,eventCount:record.pointerEvents.length,
    subsetCandidateReady:record.ticks.length>=60&&record.completedGestures>0&&
      record.completedGestures===record.startedGestures&&!record.pointerActive&&
      !record.overflow&&record.captureError===null,
    evidenceStatus:'CLIENT_GRID_OBSERVATION_UNTRUSTED'});
}
