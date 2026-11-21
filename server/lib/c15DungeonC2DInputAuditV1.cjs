'use strict';
/**
 * C15 C2D read-only input-subset replay. The grid is generated from Babylon
 * frame time, not from an authoritative fixed-step combat simulation.
 * This verifier independently reprojects accepted touch DELTAS; it cannot
 * authenticate an APK, independently replay AI/damage, prove victory, or
 * settle any reward. The optional C2B ticket bridge is staging-only.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const VERSION='c15-dungeon-c2c-input-grid-v1';
const AUDIT_VERSION='c15-dungeon-c2d-input-subset-audit-v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HEX8=/^[a-f0-9]{8}$/;
const KEYS=['version','source','dungeonId','roomId','battleId','sceneSeed','seedSource',
  'tickHz','tickBasis','initialPlayer','pointerEvents','ticks','startedGestures',
  'completedGestures','pointerActive','overflow','captureError','finished',
  'qaOnly','fixedTickSimulationVerified','independentCombatReplayVerified',
  'safeForSettlement','rewardSettlementEnabled','cloudRewards','checksumAlgorithm','checksum'];
const DOWN=['seq','tick','kind','pointerId','atMs','position','clientX','clientY'];
const MOVE=[...DOWN,'viewport','delta'];
const UP=['seq','tick','kind','pointerId','atMs','position'];
const TICK=['tick','frameSeq','inputPosition','observedPlayer',
  'observedHp','observedShieldHp','observedEnemyCount'];
const P=['x','z'];
const VIEW=['canvasWidth','canvasHeight','aspect','halfHeight','inset','pointerSpeedMultiplier'];
const DELTA=['deltaX','deltaY'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>plain(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const int=(v,lo,hi)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const finite=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const point=x=>exact(x,P)&&finite(x.x,-100,100)&&finite(x.z,-100,100);
const near=(a,b,eps=.004)=>Math.abs(a-b)<=eps;
const same=(a,b,eps=.004)=>near(a.x,b.x,eps)&&near(a.z,b.z,eps);
const fail=code=>{const e=new TypeError(code);e.code=code;throw e;};
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))freeze(v);Object.freeze(x);
}return x;};
const sha=(x)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function checksum(text){let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
let projectorPromise;
const getProjector=()=>projectorPromise ||= import(pathToFileURL(path.resolve(__dirname,
  '../../client/src/game/dungeon/DungeonSeedTouchContractV2B1.js')).href)
  .then(m=>m.projectDungeonDirectTouchV2B1);

async function auditDungeonC2DInputGridV1(record){
  if(!exact(record,KEYS)||record.version!==VERSION||
    record.source!=='accepted-controller-plus-babylon-observer-untrusted'||
    record.dungeonId!=='dung_taurus'||record.roomId!=='taurus_entry'||
    !int(record.sceneSeed,1,0xffffffff)||
    !['local-client-seed','server-ticket-local-unverified'].includes(record.seedSource)||
    (record.seedSource==='local-client-seed'?record.battleId!==null:!UUID.test(record.battleId||''))||
    record.tickHz!==30||record.tickBasis!=='accumulated-babylon-delta-not-fixed-combat-simulation'||
    !point(record.initialPlayer)||!Array.isArray(record.pointerEvents)||
    record.pointerEvents.length>256||!Array.isArray(record.ticks)||record.ticks.length>360||
    !int(record.startedGestures,0,256)||
    !int(record.completedGestures,0,record.startedGestures)||
    typeof record.pointerActive!=='boolean'||typeof record.overflow!=='boolean'||
    !(record.captureError===null||typeof record.captureError==='string')||
    typeof record.finished!=='boolean'||record.qaOnly!==true||
    record.fixedTickSimulationVerified!==false||record.independentCombatReplayVerified!==false||
    record.safeForSettlement!==false||record.rewardSettlementEnabled!==false||
    record.cloudRewards!==false||
    record.checksumAlgorithm!=='fnv1a32-accidental-corruption-only'||
    !HEX8.test(record.checksum||''))fail('C2D_RECORD_UNTRUSTED_OR_UNSAFE');
  const {checksum:expected,...body}=record;
  if(checksum(JSON.stringify(body))!==expected)fail('C2D_CHECKSUM_MISMATCH');
  if(record.overflow||record.captureError!==null)fail('C2D_RECORD_TRUNCATED_OR_INVALID');
  if(record.ticks.length===0)fail('C2D_NO_TICKS');
  let pose=record.initialPlayer,active=null,lastAt=-1,lastXY=null;
  let nextSeq=1,nextIndex=0,gestures=0,closed=0,lastFrameSeq=0,drift=0,compared=0;
  const project=await getProjector();
  for(const [index,row] of record.ticks.entries()){
    const t=index+1;
    if(!exact(row,TICK)||row.tick!==t||!int(row.frameSeq,lastFrameSeq||1,10000000)||
      !point(row.inputPosition)||!point(row.observedPlayer)||
      !finite(row.observedHp,0,1e9)||!finite(row.observedShieldHp,0,1e9)||
      !int(row.observedEnemyCount,0,1000))fail('C2D_TICK_INVALID_OR_OUT_OF_ORDER');
    lastFrameSeq=row.frameSeq;
    while(nextIndex<record.pointerEvents.length&&record.pointerEvents[nextIndex].tick===t){
      const e=record.pointerEvents[nextIndex++];
      if(!plain(e)||!int(e.seq,1,256)||e.seq!==nextSeq++||
        !int(e.tick,1,361)||!int(e.pointerId,0,2147483647)||
        !finite(e.atMs,0,Number.MAX_SAFE_INTEGER)||e.atMs<lastAt||!point(e.position))
        fail('C2D_POINTER_INVALID_OR_OUT_OF_ORDER');
      lastAt=e.atMs;
      if(e.kind==='down'){
        if(!exact(e,DOWN)||active!==null||
          !finite(e.clientX,-20000,20000)||!finite(e.clientY,-20000,20000)||
          !same(e.position,pose))fail('C2D_POINTER_DOWN_MISMATCH');
        active=e.pointerId;gestures++;lastXY={x:e.clientX,y:e.clientY};
      }else if(e.kind==='move'){
        if(!exact(e,MOVE)||active!==e.pointerId||
          !finite(e.clientX,-20000,20000)||!finite(e.clientY,-20000,20000)||
          !exact(e.viewport,VIEW)||!exact(e.delta,DELTA)||
          !finite(e.delta.deltaX,-20000,20000)||!finite(e.delta.deltaY,-20000,20000)||
          !near(e.clientX-lastXY.x,e.delta.deltaX,.01)||
          !near(e.clientY-lastXY.y,e.delta.deltaY,.01))
          fail('C2D_POINTER_MOVE_MISMATCH');
        let predicted;
        try{predicted=project({position:pose,viewport:e.viewport,delta:e.delta});}
        catch(_){fail('C2D_POINTER_PROJECTION_INVALID');}
        if(!same(predicted,e.position,.01))fail('C2D_POINTER_PROJECTION_DIVERGED');
        pose=e.position;lastXY={x:e.clientX,y:e.clientY};
      }else if(e.kind==='up'){
        if(!exact(e,UP)||active!==e.pointerId||!same(e.position,pose))
          fail('C2D_POINTER_UP_MISMATCH');
        active=null;closed++;
      }else fail('C2D_POINTER_KIND_UNSUPPORTED');
    }
    if(!same(pose,row.inputPosition))fail('C2D_GRID_INPUT_MISMATCH');
    if(!same(row.observedPlayer,row.inputPosition,.075))drift++;
    compared++;
  }
  if(nextIndex!==record.pointerEvents.length||active!==null!==record.pointerActive||
    closed!==record.completedGestures||gestures!==record.startedGestures)
    fail('C2D_UNCLOSED_OR_UNPAIRED_INPUT');
  const complete=record.ticks.length>=60&&gestures>0&&closed===gestures&&
    record.pointerActive===false&&drift===0;
  return freeze({version:AUDIT_VERSION,
    status:complete?'INPUT_SUBSET_REPROJECTED_UNTRUSTED':'INPUT_SUBSET_INCOMPLETE_OR_OBSERVED_DRIFT',
    battleId:record.battleId,sceneSeed:record.sceneSeed,
    gridHz:30,replayedInputTicks:compared,acceptedPointerEvents:nextIndex,
    completedGestures:closed,observedPoseDivergenceTicks:drift,
    replayDigest:sha([AUDIT_VERSION,record.sceneSeed,record.battleId,
      record.ticks.map(r=>({tick:r.tick,inputPosition:r.inputPosition}))]),
    subsetInputReprojectionPass:complete,
    serverSignedTicketVerified:false,serverSelectedLoadoutVerified:false,
    fixedTickCombatSimulationVerified:false,fullCombatReplayVerified:false,
    trueApkServerParity:'NOT_VERIFIED',safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    notes:[
      'Recomputed pointer delta projection and 30Hz Babylon-time observations only.',
      'Client-supplied input, frame time, HP and enemy observations are not trusted.',
      'No independent simulation of enemy AI, projectiles, damage or victory.',
      'FNV-1a checksum detects accidental corruption only, not forgery.']});
}
function createC15DungeonC2DInputAuditV1({env={},c2bService}={}){
  const enabled=env.GAME_C15_DUNGEON_C2C2D_ENABLED==='true'&&
    env.GAME_C15_DUNGEON_C2C2D_QA_APPROVED==='true'&&
    c2bService?.enabled===true&&c2bService.stagingOnly===true&&
    c2bService.rewardSettlementEnabled===false&&typeof c2bService.verify==='function';
  async function audit({uid,sessionId,ticket,record}={}){
    if(!enabled)throw new GameError('C15_DUNGEON_C2C2D_DISABLED',
      'C2C/C2D staging input audit is disabled',423);
    const evidence=await auditDungeonC2DInputGridV1(record);
    if(!evidence.subsetInputReprojectionPass||
      record.seedSource!=='server-ticket-local-unverified'||
      !plain(ticket)||ticket.battleId!==record.battleId||
      ticket.sceneSeed!==record.sceneSeed||ticket.dungeonId!==record.dungeonId||
      ticket.roomId!==record.roomId)
      throw new GameError('C15_DUNGEON_C2D_INPUT_OR_TICKET_UNPAIRED',
        'Input receipt and ticket cannot be paired',409);
    const verified=await c2bService.verify({uid,sessionId,ticket});
    if(verified?.serverQaTicketVerified!==true||
      verified?.serverSelectedLoadoutDigestMatches!==true||
      verified?.battleId!==record.battleId||verified?.rewardSettlementEnabled!==false)
      throw new GameError('C15_DUNGEON_C2D_TICKET_VERIFICATION_FAILED',
        'Server-issued staging QA ticket verification failed',403);
    return freeze({...evidence,
      status:'C2B_TICKET_AND_INPUT_SUBSET_BOUND_NOT_FULL_COMBAT',
      serverSignedTicketVerified:true,serverSelectedLoadoutVerified:true,
      fullCombatReplayVerified:false,trueApkServerParity:'NOT_VERIFIED',
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  }
  return freeze({enabled,stagingOnly:true,productionEnabled:false,
    rewardSettlementEnabled:false,independentCombatReplayVerified:false,
    audit,claim:()=>{throw new GameError('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
      'Rewards remain locked',423);}});
}
module.exports=freeze({VERSION,AUDIT_VERSION,auditDungeonC2DInputGridV1,
  createC15DungeonC2DInputAuditV1});
