'use strict';
/**
 * C15 C2H: read-only ballistic *subset* reprojection of Taurus QA evidence.
 * Server resolves authored shot speed/mode from the catalog and projects each
 * client-observed muzzle/velocity through two 60Hz ballistic substeps per 30Hz
 * Babylon observation tick. This is deliberately NOT full combat authority:
 * muzzle positions, shot creation, observed frame time and input originate in
 * an untrusted APK. Never use for rewards or a victory verdict.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {auditDungeonC2ECombatWitnessV1}=require('./c15DungeonC2ECausalAuditV1.cjs');
const VERSION='c15-dungeon-c2h-witnessed-ballistics-v1';
const TICK_HZ=30, SUBSTEP_HZ=60;
const MAX_OBSERVER_SLACK_TICKS=2;
const MAX_HIT_RADIUS=1.55;
const POSITION_TOLERANCE=.30;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const near=(a,b,tol=.025)=>Math.abs(a-b)<=tol;
const fail=code=>{const error=new TypeError(code);error.code=code;throw error;};
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))freeze(v);Object.freeze(x);
}return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,value)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(value)])).digest('hex');
function segmentDistance(from,to,point){
  const dx=to.x-from.x,dz=to.z-from.z;
  const len=dx*dx+dz*dz;
  const t=len>1e-12?Math.max(0,Math.min(1,
    ((point.x-from.x)*dx+(point.z-from.z)*dz)/len)):0;
  return Math.hypot(from.x+dx*t-point.x,from.z+dz*t-point.z);
}
let catalogPromise;
function realCatalog(){
  return catalogPromise ||= import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonCombatAdapterV38.js')).href);
}
async function auditDungeonC2HBallisticReplayV1(record,{combatModule}={}){
  const causal=await auditDungeonC2ECombatWitnessV1(record);
  if(!causal.causalSubsetPass)fail('C2H_C2E_CAUSAL_SUBSET_REQUIRED');
  if(!Array.isArray(record.grid?.ticks)||!Array.isArray(record.events)||
     record.tickHz!==TICK_HZ)fail('C2H_UNREVIEWED_GRID');
  const combat=combatModule||await realCatalog();
  if(typeof combat.resolveDungeonEnemySpecV38!=='function')
    fail('C2H_COMBAT_CATALOG_UNAVAILABLE');
  const planModule=await import(pathToFileURL(path.resolve(__dirname,
    '../../client/src/game/dungeon/DungeonEncounterDirectorV38.js')).href);
  const plan=planModule.buildDungeonRoomSpawnPlanV38({
    dungeonId:'dung_taurus',roomIndex:0,seed:record.sceneSeed});
  if(!Array.isArray(plan.entries)||plan.room?.id!=='taurus_entry')
    fail('C2H_AUTHORED_PLAN_UNAVAILABLE');
  const specs=new Map(plan.entries.map(e=>[e.id,
    combat.resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',room:plan.room,entry:e})]));
  const fired=new Map();
  let matchedContacts=0,unsupportedShots=0,speedValidated=0;
  let matchedHpAtContact=0,matchedHitDistanceMax=0;
  const checkedContacts=[];
  const lastHpEventByTick=new Map();
  for(const event of record.events){
    if(event.kind==='enemy_fire'){
      const projectile=specs.get(event.enemyId)?.weapon?.projectile;
      if(!projectile||!finite(projectile.speed)||projectile.speed<=0)
        fail('C2H_AUTHORED_PROJECTILE_UNAVAILABLE');
      const mode=projectile.aimMode;
      // Guided and non-linear projectiles are not covered by this contract.
      if(!['snapshot','predictive'].includes(mode)||
        (projectile.guidanceMs||0)>0)unsupportedShots++;
      const measured=Math.hypot(event.velocity.x,event.velocity.z);
      if(!near(measured,projectile.speed,Math.max(.006,projectile.speed*.008)))
        fail('C2H_AUTHORED_SHOT_SPEED_DIVERGENCE');
      speedValidated++;
      fired.set(event.bulletId,{event,projectile,mode});
    }
    if(event.kind==='projectile_contact'){
      const shot=fired.get(event.bulletId);
      if(!shot)fail('C2H_CONTACT_WITHOUT_SHOT');
      if(!['snapshot','predictive'].includes(shot.mode)||
        (shot.projectile.guidanceMs||0)>0)continue;
      const ageTicks=event.tick-shot.event.tick;
      if(ageTicks<=0||ageTicks>Math.ceil(shot.projectile.lifetimeMs*TICK_HZ/1000)+MAX_OBSERVER_SLACK_TICKS)
        fail('C2H_PROJECTILE_LIFETIME_OR_SEQUENCE_DIVERGENCE');
      // Babylon sometimes dispatches touch/shot and samples the C2C grid in
      // different frames. Two observer ticks is a deliberate QA-only bound.
      const fromFrames=Math.max(0,(ageTicks-MAX_OBSERVER_SLACK_TICKS)*SUBSTEP_HZ/TICK_HZ);
      const toFrames=(ageTicks+MAX_OBSERVER_SLACK_TICKS)*SUBSTEP_HZ/TICK_HZ;
      const from={x:shot.event.origin.x+shot.event.velocity.x*fromFrames,
        z:shot.event.origin.z+shot.event.velocity.z*fromFrames};
      const to={x:shot.event.origin.x+shot.event.velocity.x*toFrames,
        z:shot.event.origin.z+shot.event.velocity.z*toFrames};
      const pose=record.grid.ticks[event.tick-1]?.inputPosition;
      if(!pose||!finite(pose.x)||!finite(pose.z))
        fail('C2H_IMPACT_TICK_MISSING');
      const miss=segmentDistance(from,to,pose);
      if(miss>MAX_HIT_RADIUS+POSITION_TOLERANCE)
        fail('C2H_PROJECTILE_TRAJECTORY_DIVERGED');
      matchedContacts++;
      matchedHitDistanceMax=Math.max(matchedHitDistanceMax,miss);
      checkedContacts.push({bulletId:event.bulletId,fireTick:shot.event.tick,
        impactTick:event.tick,missDistance:Math.round(miss*10000)/10000});
      lastHpEventByTick.set(event.tick,event.hp);
    }
  }
  // Check *the final projectile contact reported at a sampled tick* against
  // the player's post-frame HP observation. This is NOT independent damage
  // formula calculation; collisions and armor remain client-controlled.
  for(const [tick,hp] of lastHpEventByTick){
    if(!near(record.grid.ticks[tick-1].observedHp,hp,.012))
      fail('C2H_CONTACT_HP_OBSERVER_DIVERGENCE');
    matchedHpAtContact++;
  }
  const hitTicks=new Set(lastHpEventByTick.keys());
  let observedHpDropTicks=0,unpairedHpDropTicks=0;
  const rows=record.grid.ticks;
  for(let i=1;i<rows.length;i++){
    if(rows[i].observedHp<rows[i-1].observedHp-.012){
      observedHpDropTicks++;
      if(!hitTicks.has(rows[i].tick))unpairedHpDropTicks++;
    }
  }
  const pass=matchedContacts>0&&unsupportedShots===0&&
    matchedContacts===causal.observedProjectileContacts&&
    speedValidated===causal.observedFires;
  const projectionDigest=digest(VERSION,{sceneSeed:record.sceneSeed,
    battleId:record.battleId,gridChecksum:record.grid.checksum,
    witnessChecksum:record.checksum,checkedContacts});
  return freeze({version:VERSION,
    status:pass?'WITNESSED_BALLISTICS_REPROJECTED_UNTRUSTED':
      'INSUFFICIENT_OR_UNSUPPORTED_BALLISTIC_SUBSET',
    battleId:record.battleId,sceneSeed:record.sceneSeed,
    inputObserverHz:TICK_HZ,projectileSubstepHz:SUBSTEP_HZ,
    observerSlackTicks:MAX_OBSERVER_SLACK_TICKS,
    comparedFireEvents:speedValidated,comparedContactEvents:matchedContacts,
    sourceContactEvents:causal.observedProjectileContacts,
    unsupportedGuidanceShots:unsupportedShots,
    matchedImpactHpObservationTicks:matchedHpAtContact,
    observedHpDropTicks,observedHpDropsWithoutProjectileContact:unpairedHpDropTicks,
    maximumProjectedMissDistance:Math.round(matchedHitDistanceMax*10000)/10000,
    projectionDigest,ballisticSubsetPass:pass,
    serverSignedTicketVerified:false,serverSelectedLoadoutVerified:false,
    independentlyReprojectedWitnessedStraightLineBallistics:pass,
    independentlySimulatedEnemyAi:false,independentlyComputedDamage:false,
    fixedTickCombatSimulationVerified:false,fullCombatReplayVerified:false,
    trueApkServerParity:'NOT_VERIFIED',safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    notes:['Projectile speed validated from the server-authored Taurus catalog.',
      'Trajectory projected independently from untrusted observed muzzle and velocity.',
      'Babylon observation timing is not the combat simulation clock.',
      'HP comparison checks observation consistency, not independently calculated damage.',
      'No authoritative spawn location, enemy AI, complete combat state or victory replay.',
      'Report fingerprint is NOT an authentication token or anti-replay guarantee.']});
}
module.exports=freeze({VERSION,auditDungeonC2HBallisticReplayV1});
