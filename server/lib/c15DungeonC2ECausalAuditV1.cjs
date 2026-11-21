'use strict';
/**
 * C15 C2E: independently rebuild Taurus encounter recipe from catalog + seed,
 * then replay a bounded client-supplied combat EVENT causality witness.
 * This is NOT full authoritative combat (no independent AI, ballistics,
 * collision, damage or battle outcome). Never use for settlement.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {auditDungeonC2DInputGridV1}=require('./c15DungeonC2DInputAuditV1.cjs');
const VERSION='c15-dungeon-c2e-combat-witness-v1';
const REPORT='c15-dungeon-c2e-causal-audit-v1';
const FIELDS=['version','source','dungeonId','roomId','battleId','sceneSeed',
  'seedSource','tickHz','tickBasis','grid','events','finished','overflow',
  'captureError','qaOnly','fixedTickSimulationVerified','fullCombatReplayVerified',
  'safeForSettlement','rewardSettlementEnabled','cloudRewards','checksumAlgorithm','checksum'];
const EVENT=['seq','tick','kind','enemyId','roleId','bulletId','amount','hp','origin','velocity'];
const ID=x=>typeof x==='string'&&x.length>0&&x.length<=128&&/^[A-Za-z0-9_:./@-]+$/.test(x);
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const num=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>obj(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const point=x=>exact(x,['x','z'])&&num(x.x,-100,100)&&num(x.z,-100,100);
const close=(a,b)=>Math.abs(a-b)<=.012;
const fail=code=>{const err=new TypeError(code);err.code=code;throw err;};
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))freeze(v);Object.freeze(x);
}return x;};
function fnv(text){let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
const canonical=x=>Array.isArray(x)?x.map(canonical):obj(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,x)=>createHash('sha256').update(JSON.stringify([tag,canonical(x)])).digest('hex');
let catalogPromise;
const realCatalog=()=>catalogPromise ||= Promise.all([
  import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/dungeon/DungeonEncounterDirectorV38.js')).href),
  import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/dungeon/DungeonCombatAdapterV38.js')).href),
]).then(([encounter,combat])=>({encounter,combat}));
async function auditDungeonC2ECombatWitnessV1(record,{catalog}={}){
  if(!exact(record,FIELDS)||record.version!==VERSION||
    record.source!=='real-babylon-causal-events-untrusted'||
    record.dungeonId!=='dung_taurus'||record.roomId!=='taurus_entry'||
    !int(record.sceneSeed,1,0xffffffff)||record.tickHz!==30||
    record.tickBasis!=='accumulated-babylon-delta-not-fixed-combat-simulation'||
    !['local-client-seed','server-ticket-local-unverified'].includes(record.seedSource)||
    record.finished!==false&&record.finished!==true||
    record.overflow!==false||record.captureError!==null||
    record.qaOnly!==true||record.fixedTickSimulationVerified!==false||
    record.fullCombatReplayVerified!==false||record.safeForSettlement!==false||
    record.rewardSettlementEnabled!==false||record.cloudRewards!==false||
    record.checksumAlgorithm!=='fnv1a32-accidental-corruption-only'||
    !/^[a-f0-9]{8}$/.test(record.checksum||'')||
    !Array.isArray(record.events)||record.events.length>256)
    fail('C2E_UNSAFE_OR_INVALID_RECORD');
  const {checksum,...body}=record;
  if(fnv(JSON.stringify(body))!==checksum)fail('C2E_CHECKSUM_MISMATCH');
  if(!obj(record.grid)||record.grid.sceneSeed!==record.sceneSeed||
    record.grid.battleId!==record.battleId||record.grid.seedSource!==record.seedSource||
    record.grid.dungeonId!==record.dungeonId||record.grid.roomId!==record.roomId)
    fail('C2E_GRID_BATTLE_SEED_MISMATCH');
  const input=await auditDungeonC2DInputGridV1(record.grid);
  if(!input.subsetInputReprojectionPass)fail('C2E_C2D_GRID_INCOMPLETE');
  const deps=catalog||await realCatalog();
  const plan=deps.encounter.buildDungeonRoomSpawnPlanV38({dungeonId:'dung_taurus',
    roomIndex:0,seed:record.sceneSeed});
  if(plan?.room?.id!=='taurus_entry'||!Array.isArray(plan.entries)||
    plan.entries.length<1||plan.entries.length>40||
    new Set(plan.entries.map(e=>e.id)).size!==plan.entries.length)
    fail('C2E_SERVER_ENCOUNTER_CATALOG_INVALID');
  const byId=new Map(plan.entries.map(e=>[e.id,e]));
  const specById=new Map(plan.entries.map(e=>[e.id,deps.combat.resolveDungeonEnemySpecV38({
    dungeonId:'dung_taurus',room:plan.room,entry:e})]));
  const spawnPlanDigest=digest('sf-c15-dungeon-v2b2-spawns',plan.entries.map(e=>({
    id:e.id,roleId:e.roleId,laneNorm:e.laneNorm,
    spawnAtMs:e.spawnAtMs,threatCost:e.threatCost})));
  const spawned=new Map(),shots=new Map();
  let roomStarted=false,roomStartTick=null,spawns=0,fires=0,hits=0,deaths=0,contacts=0,lastTick=0;
  // 30Hz is *observational*, not a fixed engine clock; permit ~10 observed ticks
  // of Babylon/room scheduling jitter before alleging a premature spawn.
  const spawnEarliestSlackMs=350;
  const replayCounts=new Map();
  // The live scene mutates combat before the observation grid samples that frame;
  // each emitted causal event is anchored to the following C2C sample tick.
  for(const [i,e] of record.events.entries()){
    if(!exact(e,EVENT)||e.seq!==i+1||!int(e.tick,lastTick||1,record.grid.ticks.length)||
      !['room_start','enemy_spawn','enemy_fire','enemy_hit','enemy_death',
        'enemy_despawn','projectile_contact'].includes(e.kind)||
      (e.enemyId!==null&&!ID(e.enemyId))||
      (e.roleId!==null&&!ID(e.roleId))||
      (e.bulletId!==null&&!ID(e.bulletId))||
      (e.amount!==null&&!num(e.amount,0,1e9))||
      (e.hp!==null&&!num(e.hp,0,1e9))||
      (e.origin!==null&&!point(e.origin))||
      (e.velocity!==null&&!point(e.velocity)))fail('C2E_EVENT_SCHEMA_OR_ORDER');
    const none=(...values)=>values.every(v=>v===null);
    lastTick=e.tick;
    if(e.kind==='room_start'){
      if(roomStarted||i!==0||!none(e.enemyId,e.roleId,e.bulletId,e.amount,e.hp,e.origin,e.velocity))
        fail('C2E_ROOM_START_INVALID');
      roomStarted=true;roomStartTick=e.tick;
    }else if(e.kind==='enemy_spawn'){
      if(!roomStarted||e.enemyId!==plan.entries[spawns]?.id||
        e.roleId!==byId.get(e.enemyId)?.roleId||
        !num(e.hp,.0001,1e9)||!close(e.hp,specById.get(e.enemyId)?.hp)||
        !none(e.bulletId,e.amount,e.origin,e.velocity))fail('C2E_SPAWN_CATALOG_DIVERGENCE');
      if(spawned.has(e.enemyId))fail('C2E_DUPLICATE_SPAWN');
      // C2F: independently project the *earliest possible* catalog spawn time.
      // Late spawns are allowed (active cap/scene stalls); time is still client
      // reported, so this is QA anomaly detection, not authoritative replay.
      const elapsedLowerBoundMs=(e.tick-roomStartTick)*(1000/30);
      if(elapsedLowerBoundMs+spawnEarliestSlackMs<byId.get(e.enemyId).spawnAtMs)
        fail('C2F_PREMATURE_CATALOG_SPAWN');
      spawned.set(e.enemyId,{hp:e.hp,alive:true,roleId:e.roleId});spawns++;
    }else if(e.kind==='enemy_fire'){
      const s=spawned.get(e.enemyId),spec=specById.get(e.enemyId);
      if(!roomStarted||!s?.alive||!spec?.canShoot||!spec.weapon?.projectile||
        e.roleId!==null||!ID(e.bulletId)||shots.has(e.bulletId)||
        !num(e.amount,.0001,1e9)||!point(e.origin)||!point(e.velocity)||
        !none(e.hp))fail('C2E_UNAUTHORIZED_CAUSAL_SHOT');
      shots.set(e.bulletId,{enemyId:e.enemyId,consumed:false});fires++;
    }else if(e.kind==='enemy_hit'){
      const s=spawned.get(e.enemyId);
      if(!s?.alive||!num(e.amount,0,1e9)||!num(e.hp,0,1e9)||
        !close(Math.max(0,s.hp-e.amount),e.hp)||
        !none(e.roleId,e.bulletId,e.origin,e.velocity))fail('C2E_ENEMY_HP_CAUSAL_DIVERGENCE');
      s.hp=e.hp;hits++;
    }else if(e.kind==='enemy_death'||e.kind==='enemy_despawn'){
      const s=spawned.get(e.enemyId);
      if(!s?.alive||(e.kind==='enemy_death'&&!close(s.hp,0))||
        !none(e.roleId,e.bulletId,e.amount,e.hp,e.origin,e.velocity))
        fail('C2E_ENEMY_RESOLUTION_UNPAIRED');
      s.alive=false;deaths++;
    }else if(e.kind==='projectile_contact'){
      const shot=shots.get(e.bulletId);
      if(!shot||shot.consumed||e.enemyId!==shot.enemyId||
        !num(e.hp,0,1e9)||!none(e.roleId,e.amount,e.origin,e.velocity))
        fail('C2E_PROJECTILE_CONTACT_UNPAIRED');
      shot.consumed=true;contacts++;
    }
    replayCounts.set(e.tick,[...spawned.values()].filter(s=>s.alive).length);
  }
  if(!roomStarted||spawns<1)fail('C2E_NO_OBSERVED_ENCOUNTER_PREFIX');
  // Compares real post-frame active enemy counts with independently catalogued
  // spawn+death ledger. A discrepancy is a diagnostic failure, not a settlement.
  let active=0,j=0,divergent=0;
  for(const row of record.grid.ticks){
    while(j<record.events.length&&record.events[j].tick===row.tick){
      const e=record.events[j++];
      if(e.kind==='enemy_spawn')active++;
      if(e.kind==='enemy_death'||e.kind==='enemy_despawn')active--;
    }
    if(active!==row.observedEnemyCount)divergent++;
  }
  const coherent=divergent===0;
  return freeze({version:REPORT,
    status:coherent?'ENCOUNTER_AND_CAUSAL_SUBSET_REPROJECTED_UNTRUSTED':'ENCOUNTER_OBSERVATION_DIVERGENCE',
    battleId:record.battleId,sceneSeed:record.sceneSeed,
    gridTicks:record.grid.ticks.length,acceptedPointerEvents:input.acceptedPointerEvents,
    encounterCatalogDigest:spawnPlanDigest,authoredEnemyCount:plan.entries.length,
    observedSpawnPrefix:spawns,observedFires:fires,observedEnemyHits:hits,
    observedEnemyResolutions:deaths,observedProjectileContacts:contacts,
    observedEnemyCountDivergenceTicks:divergent,
    earliestSpawnScheduleSlackMs:spawnEarliestSlackMs,
    extendedCaptureWindowTicks:record.grid.ticks.length,
    extendedCaptureAtLeastFiveSeconds:record.grid.ticks.length>=150,
    causalSubsetPass:coherent,serverQaTicketVerified:false,serverSelectedLoadoutVerified:false,
    independentlyReplayedAi:false,independentlyReplayedProjectileDynamics:false,
    independentlyReplayedDamage:false,fixedTickCombatSimulationVerified:false,
    fullCombatReplayVerified:false,trueApkServerParity:'NOT_VERIFIED',
    safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
    notes:['Server independently rebuilt the authored Taurus entry spawn catalog.',
      'Spawn prefix, earliest catalog spawn timing, live shot/contact references and HP arithmetic were checked.',
      'Client-reported combat events, Babylon elapsed time and HP are untrusted.',
      'No independent AI, ballistic collision, damage formula, boss or victory replay.',
      'FNV checksum detects accidental corruption only, not forgery.']});
}
function createC15DungeonC2ECausalAuditV1({env={},c2bService,c2dService}={}){
  const enabled=env.GAME_C15_DUNGEON_C2E_ENABLED==='true'&&
    env.GAME_C15_DUNGEON_C2E_QA_APPROVED==='true'&&
    c2bService?.enabled===true&&c2bService?.stagingOnly===true&&
    c2bService?.rewardSettlementEnabled===false&&
    c2dService?.enabled===true&&c2dService?.stagingOnly===true&&
    c2dService?.rewardSettlementEnabled===false&&typeof c2dService.audit==='function';
  async function audit({uid,sessionId,ticket,record}={}){
    if(!enabled)throw new GameError('C15_DUNGEON_C2E_DISABLED','C2E QA audit is off',423);
    const evidence=await auditDungeonC2ECombatWitnessV1(record);
    if(!evidence.causalSubsetPass||record.seedSource!=='server-ticket-local-unverified'||
      ticket?.battleId!==record.battleId||ticket?.sceneSeed!==record.sceneSeed||
      ticket?.spawnPlanDigest!==evidence.encounterCatalogDigest)
      throw new GameError('C15_DUNGEON_C2E_BATTLE_OR_PLAN_MISMATCH',
        'C2E battle, input or independently computed plan differs',409);
    const bound=await c2dService.audit({uid,sessionId,ticket,record:record.grid});
    if(bound?.serverSignedTicketVerified!==true||
      bound?.serverSelectedLoadoutVerified!==true||
      bound?.battleId!==record.battleId||bound?.rewardSettlementEnabled!==false)
      throw new GameError('C15_DUNGEON_C2E_TICKET_OR_INPUT_UNTRUSTED',
        'C2B/C2D authenticated input gate failed',403);
    return freeze({...evidence,status:'SIGNED_QA_TICKET_AND_CAUSAL_SUBSET_BOUND_NOT_FULL_COMBAT',
      serverQaTicketVerified:true,serverSelectedLoadoutVerified:true,
      fullCombatReplayVerified:false,trueApkServerParity:'NOT_VERIFIED',
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  }
  const locked=()=>{throw new GameError('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
    'No C2E settlement or trusted battle outcome',423);};
  return freeze({enabled,stagingOnly:true,productionEnabled:false,
    independentCombatReplayVerified:false,rewardSettlementEnabled:false,
    audit,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,REPORT,auditDungeonC2ECombatWitnessV1,
  createC15DungeonC2ECausalAuditV1});
