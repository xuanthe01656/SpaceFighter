'use strict';
/** C2K Node replay consumes EXACTLY the same pure ESM 30Hz projectile function
 * that drives Babylon hostile projectile movement in the gated Taurus APK QA.
 * Shot origins, velocity, pointer pose, AI and damage/armor are NOT authoritative.
 * This module cannot grant rewards, issue victory or attest an APK/session.
 */
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {auditDungeonC2DInputGridV1}=require('./c15DungeonC2DInputAuditV1.cjs');
const {auditDungeonC2JPInputGridV1}=require('./c15DungeonC2JPInputAuditV1.cjs');
const C2JP_GRID_VERSION='c15-dungeon-c2jp-input-grid-v1';
const VERSION='c15-c2jk-fixed-ballistic-replay-qa-v1';
const ID=/^[A-Za-z0-9_:./@-]{1,128}$/;
const HEX8=/^[0-9a-f]{8}$/;
const num=x=>typeof x==='number'&&Number.isFinite(x);
const fail=code=>{const e=new TypeError(code);e.code=code;throw e;};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(x,keys)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const point=x=>exact(x,['x','z'])&&num(x.x)&&num(x.z)&&
  Math.abs(x.x)<=100&&Math.abs(x.z)<=100;
const ROW=['tick','player','stateDigest','activeCount','contacts','expired'];
const SHOT=['id','sourceId','spawnTick','origin','velocity','hitRadius','ttlTicks'];
const FIELDS=['version','coreVersion','source','dungeonId','roomId','sceneSeed',
  'seedSource','battleId','tickHz','tickBasis','grid','shots','ticks','captureError',
  'qaOnly','clientFixedBallisticStepObserved','independentEnemyAiVerified',
  'independentDamageVerified','fullCombatReplayVerified','trueApkServerParity',
  'safeForSettlement','rewardSettlementEnabled','cloudRewards',
  'checksumAlgorithm','checksum'];
let purePromise;
function loadPure(){return purePromise ||= import(pathToFileURL(path.resolve(__dirname,
  '../../client/src/game/dungeon/DungeonC2JKFixedBallisticCoreV1.js')).href);}
async function auditC2JKFixedReplayV1(record,{pureModule}={}){
  const pure=pureModule||await loadPure();
  if(!exact(record,FIELDS)||record.version!=='c15-c2jk-live-fixed-ballistic-journal-v1'||
    record.coreVersion!==pure.C2JK_CORE_VERSION||
    record.source!=='live-taurus-fixed30-hostile-projectiles-untrusted'||
    record.dungeonId!=='dung_taurus'||record.roomId!=='taurus_entry'||
    record.seedSource!=='local-client-seed'||record.battleId!==null||
    !Number.isSafeInteger(record.sceneSeed)||record.sceneSeed<1||record.sceneSeed>0xffffffff||
    record.tickHz!==30||record.tickBasis!=='client-fixed-ballistics-not-full-combat'||
    record.captureError!==null||record.qaOnly!==true||
    record.clientFixedBallisticStepObserved!==true||
    record.independentEnemyAiVerified!==false||record.independentDamageVerified!==false||
    record.fullCombatReplayVerified!==false||record.trueApkServerParity!=='NOT_VERIFIED'||
    record.safeForSettlement!==false||record.rewardSettlementEnabled!==false||
    record.cloudRewards!==false||record.checksumAlgorithm!=='fnv1a32-accidental-corruption-only'||
    !HEX8.test(record.checksum||''))fail('C2JK_UNSAFE_OR_UNREVIEWED_RECORD');
  const {checksum,...body}=record;
  if(pure.c2jkHash(body)!==checksum)fail('C2JK_CHECKSUM_MISMATCH');
  if(!Array.isArray(record.shots)||record.shots.length>128||
    !Array.isArray(record.ticks)||record.ticks.length<60||
    record.ticks.length>pure.C2JK_MAX_TICKS)
    fail('C2JK_LIMITS_OR_MISSING_TICKS');
  if(record.grid?.battleId!==null||record.grid.sceneSeed!==record.sceneSeed||
    record.grid.seedSource!==record.seedSource||record.grid.dungeonId!==record.dungeonId||
    record.grid.roomId!==record.roomId||record.grid.ticks?.length<record.ticks.length||
    (record.grid.version===C2JP_GRID_VERSION &&
      record.grid.ticks.length!==record.ticks.length))
    fail('C2JK_C2C_GRID_UNPAIRED');
  // C2JP is a separate audited format. The original 256-pointer C2D
  // validator, staging admission and HTTP route are never broadened.
  const isC2JP=record.grid.version===C2JP_GRID_VERSION;
  const grid=isC2JP
    ? await auditDungeonC2JPInputGridV1(record.grid)
    : await auditDungeonC2DInputGridV1(record.grid);
  if(grid?.subsetInputReprojectionPass!==true)fail('C2JK_C2D_GRID_NOT_VERIFIED');
  const openSubset=isC2JP && grid.openGestureSubsetOnly===true;
  if(openSubset && (record.ticks.length!==pure.C2JK_MAX_TICKS ||
    record.grid.pointerActive!==true || record.grid.finished!==true))
    fail('C2JK_C2JP_OPEN_WINDOW_INVALID');
  const shotEntries=new Map(),ids=new Set();
  for(const row of record.shots){
    if(!exact(row,SHOT)||!ID.test(row.id||'')||!ID.test(row.sourceId||'')||
      ids.has(row.id)||!Number.isSafeInteger(row.spawnTick)||row.spawnTick<0||
      row.spawnTick>=record.ticks.length||!point(row.origin)||!point(row.velocity)||
      !num(row.hitRadius)||!Number.isSafeInteger(row.ttlTicks))
      fail('C2JK_SHOT_RECORD_INVALID');
    const shot=pure.createC2JKShot(row);
    if(!eq({x:shot.x,z:shot.z},row.origin)||
       !eq({x:shot.vx,z:shot.vz},row.velocity)||shot.hitRadius!==row.hitRadius)
      fail('C2JK_SHOT_QUANTIZATION_INVALID');
    ids.add(row.id);
    shotEntries.set(row.spawnTick,[...(shotEntries.get(row.spawnTick)||[]),shot]);
  }
  let active=[],matchedContacts=0,matchedExpiry=0,peak=0,rowsChecked=0;
  for(const [index,row] of record.ticks.entries()){
    if(!exact(row,ROW)||row.tick!==index+1||!point(row.player)||
      !HEX8.test(row.stateDigest||'')||!Number.isSafeInteger(row.activeCount)||
      !Array.isArray(row.contacts)||!Array.isArray(row.expired)||
      row.contacts.length>128||row.expired.length>128||
      row.contacts.some(x=>!ID.test(x))||row.expired.some(x=>!ID.test(x))||
      !eq(row.player,record.grid.ticks[index].observedPlayer))
      fail('C2JK_FIXED_TICK_INPUT_GRID_MISMATCH');
    // A shot born during the previous tick has not been advanced yet.
    active.push(...(shotEntries.get(index)||[]));
    const step=pure.stepC2JKShots(active,row.player);
    if(!eq(row.contacts,step.contacts)||!eq(row.expired,step.expired)||
      row.stateDigest!==step.stateDigest||row.activeCount!==step.active.length)
      fail('C2JK_REAL_CLIENT_PROJECTILE_DIVERGENCE');
    active=step.active.slice();matchedContacts+=step.contacts.length;
    matchedExpiry+=step.expired.length;peak=Math.max(peak,active.length);
    rowsChecked++;
  }
  return Object.freeze({version:VERSION,
    status:openSubset
      ? 'LIVE_CLIENT_AND_SERVER_SHARED_FIXED_BALLISTIC_OPEN_INPUT_SUBSET_UNTRUSTED'
      : 'LIVE_CLIENT_AND_SERVER_SHARED_FIXED_BALLISTIC_SUBSET_REPLAYED_UNTRUSTED',
    sceneSeed:record.sceneSeed,ticksReplayed:rowsChecked,
    authoredShotsObserved:record.shots.length,contactsReprojected:matchedContacts,
    expiredShotsReprojected:matchedExpiry,peakActiveProjectiles:peak,
    c2cInputGridSubsetVerified:true,clientFixedBallisticCoreReprojected:true,
    openGestureSubsetOnly:openSubset,inputGestureClosedAtSeal:!openSubset,
    c2jpHighRateGridReprojected:isC2JP,
    sharedCoreVersion:pure.C2JK_CORE_VERSION,
    serverSignedSameSessionVerified:false,independentEnemyAiVerified:false,
    independentShotCreationVerified:false,independentDamageVerified:false,
    fixedTickFullCombatVerified:false,fullCombatReplayVerified:false,
    trueApkServerParity:'NOT_VERIFIED',safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    notes:['A single pure 30Hz kernel now moves actual hostile projectiles in gated Guest Taurus QA and on Node.',
      'Untrusted client shot origins, velocities and input poses are replayed; no server-derived AI or damage authority.',
      ...(openSubset ? ['The input gesture remains OPEN at tick 270; no fake pointer-up or session completion.'] : []),
      'FNV32 only detects accidental changes; it is not an authenticated proof or anti-cheat mechanism.']});
}
module.exports={VERSION,auditC2JKFixedReplayV1};
