'use strict';
/**
 * C15 Dungeon V2C.3 — emulator-only MULTI-ENEMY CANDIDATE timeline.
 *
 * This service wraps real V2C.2 open/step on every operation. It replays the
 * Taurus room's ranged candidates through the reviewed pure slot allocation,
 * local separation, entry shield, choreography, fire gate, volley schedule,
 * projectile and +Z gameplay-root yaw helpers. It does NOT replicate the full
 * live DungeonScene: no charger/contact, mutable world transforms, frame-time,
 * actual Babylon mesh matrix/scale/pivot, enemy death, first-volley watchdog,
 * raider opening, damage, touch-to-tick timeline, boss or settlement.
 *
 * In particular, a yaw-only muzzle is a THEORETICAL 2-D projection, NOT proof
 * of live muzzle/world-matrix parity. No production route is registered.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonEnemyTimelineV2C2Config}=require('./c15DungeonEnemyTimelineV2C2.cjs');

const VERSION='c15-dungeon-multi-enemy-timeline-v2c3';
const TICK_HZ=60;
const MAX_TICKS=360;
const MAX_BATCH=60;
const MAX_ENEMIES=12;
const MAX_PROJECTILES=96;
const MAX_PENDING_SHOTS=64;
const MAX_TOTAL_SHOTS=1024;
const HEX=/^[a-f0-9]{64}$/;
const fieldsOpen=['ticket','movementState','uid','sessionId','requestId'];
const fieldsStep=['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>record(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=(tag,x)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(x)])).digest('hex');
const freeze=x=>{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const item of Object.values(x))freeze(item);
    Object.freeze(x);
  }
  return x;
};
const deny=(code,msg,status=423)=>{throw new GameError(code,msg,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Full combat replay and independent settlement are not available');
const actor=a=>({uid:a.uid,sessionId:a.sessionId,requestId:a.requestId});

/** 2-D math equivalent to +Z local origin rotated by gameplay-root yaw.
 * Never label this as Babylon's actual mesh getWorldMatrix result. */
function projectDungeonCandidateMuzzleV2C3({position,yawRadians,roleId}={}){
  if(!record(position)||![position.x,position.z,yawRadians].every(finite)||
    Math.abs(position.x)>100||Math.abs(position.z)>100||
    Math.abs(yawRadians)>Math.PI+1e-9)
    throw new TypeError('Finite bounded logical root pose required');
  const forward=roleId==='artillery'?1.02:.76;
  return freeze({x:position.x+Math.sin(yawRadians)*forward,
    y:0,z:position.z+Math.cos(yawRadians)*forward,
    source:'gameplay-root-yaw-candidate-not-babylon-world-matrix'});
}

function parseC15DungeonMultiEnemyTimelineV2C3Config(env={}){
  if(!record(env))throw new TypeError('V2C.3 QA env must be plain');
  if(env.GAME_C15_DUNGEON_V2C3_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C3_QA_APPROVED!=='true')
    throw new TypeError('V2C.3 requires explicit QA approval');
  const previous=parseC15DungeonEnemyTimelineV2C2Config(env);
  if(!previous||previous.emulatorOnly!==true||!previous.projectId.startsWith('demo-'))
    throw new TypeError('V2C.3 requires all earlier QA gates and demo Emulator');
  return freeze({version:VERSION,emulatorOnly:true,projectId:previous.projectId,
    allowedUids:[...previous.allowedUids]});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C3_DISABLED','Multi-enemy timeline QA is OFF');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,finalize:locked,claim:locked});
}

async function createC15DungeonMultiEnemyTimelineV2C3({env={},enemyTimelineService,
  movementService,encounterModule,combatModule,sharedSeedModule,
  choreographyModule,roleModule,hudModule,fireModule,volleyModule,
  projectileModule,slotsModule,tuningModule,entryShieldModule,headingModule}={}){
  const config=parseC15DungeonMultiEnemyTimelineV2C3Config(env);
  if(!config)return disabled();
  if(!enemyTimelineService||enemyTimelineService.enabled!==true||
    enemyTimelineService.emulatorOnly!==true||
    enemyTimelineService.productionEnabled!==false||
    enemyTimelineService.safeForSettlement!==false||
    enemyTimelineService.rewardSettlementEnabled!==false||
    enemyTimelineService.cloudRewards!==false||
    typeof enemyTimelineService.open!=='function'||
    typeof enemyTimelineService.step!=='function'||
    typeof enemyTimelineService.inspect!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||
    movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.inspect!=='function')
    throw new TypeError('V2C.3 requires non-economic V2C.2 and V2B.3 QA services');
  const root=path.resolve(__dirname,'../../client/src/game');
  const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [encounter,combat,seedMath,choreo,role,hud,fire,volley,projectile,
    slots,tuning,entryShield,heading]=await Promise.all([
    encounterModule||load('dungeon/DungeonEncounterDirectorV38.js'),
    combatModule||load('dungeon/DungeonCombatAdapterV38.js'),
    sharedSeedModule||load('dungeon/DungeonSeedTouchContractV2B1.js'),
    choreographyModule||load('combat/CampaignCombatChoreographyV29.js'),
    roleModule||load('dungeon/DungeonRoleEngagementV410.js'),
    hudModule||load('dungeon/DungeonHudCatalogV396.js'),
    fireModule||load('dungeon/DungeonFireReliabilityV399.js'),
    volleyModule||load('combat/CampaignEnemyVolleyV34.js'),
    projectileModule||load('combat/CampaignEnemyProjectileV31.js'),
    slotsModule||load('combat/CampaignEnemyCombatSlotsV37.js'),
    tuningModule||load('dungeon/DungeonProductionTuningV398.js'),
    entryShieldModule||load('dungeon/DungeonEnemyEntryShieldV422.js'),
    headingModule||load('assets/EnemyVisualHeadingV26A4.js'),
  ]);
  for(const [mod,name] of [
    [encounter,'buildDungeonRoomSpawnPlanV38'],
    [combat,'resolveDungeonEnemySpecV38'],
    [combat,'resolveDungeonEnemySpawnPointV38'],
    [combat,'createDungeonEnemyChoreographyStateV38'],
    [combat,'createDungeonCombatSlotDescriptorV38'],
    [seedMath,'dungeonSceneStableSeedV2B1'],
    [choreo,'stepCampaignEnemyChoreographyV29'],
    [role,'resolveDungeonRoleEngagementV410'],
    [role,'projectDungeonCombatSlotV410'],
    [role,'applyDungeonRoleEngagementV410'],
    [hud,'resolveDungeonHudOcclusionLineV396'],
    [fire,'resolveDungeonEnemyFireDecisionV399'],
    [fire,'resolveDungeonVolleyReadinessV399'],
    [volley,'createCampaignEnemyVolleyPlanV34'],
    [projectile,'createCampaignEnemyShotPlanV31'],
    [projectile,'advanceCampaignEnemyProjectileV31'],
    [slots,'createCampaignEnemyCombatSlotRegistryV37'],
    [slots,'syncCampaignEnemyCombatSlotsV37'],
    [slots,'getCampaignEnemyCombatSlotV37'],
    [tuning,'resolveDungeonCombatSlotV398'],
    [tuning,'resolveDungeonEnemySeparationV398'],
    [entryShield,'createDungeonEnemyEntryShieldV422'],
    [entryShield,'advanceDungeonEnemyEntryShieldV422'],
    [entryShield,'isDungeonEnemyEntryActiveV422'],
    [heading,'resolveEnemyGameplayYawV26A4'],
  ]){
    if(typeof mod?.[name]!=='function')throw new TypeError('Reviewed helper missing: '+name);
  }
  const issued=new WeakSet(),used=new WeakMap(),inflight=new WeakMap();
  const makeState=x=>{const s=freeze(x);issued.add(s);return s;};
  const requireState=s=>{
    if(!record(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C3_STATE_UNTRUSTED',
        'Server instance-issued timeline state required',403);
  };
  const recipeFor=seed=>{
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:'dung_taurus',roomIndex:0,seed});
    if(plan?.dungeonId!=='dung_taurus'||plan?.room?.id!=='taurus_entry'||
      !Array.isArray(plan.entries)||plan.entries.length<1||plan.entries.length>40)
      throw new TypeError('Unreviewed Taurus room spawn plan');
    const spawnDigest=hash('sf-c15-dungeon-v2b2-spawns',plan.entries.map(e=>({
      id:e.id,roleId:e.roleId,laneNorm:e.laneNorm,
      spawnAtMs:e.spawnAtMs,threatCost:e.threatCost})));
    const ranged=plan.entries.map(entry=>({entry,
      spec:combat.resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',
        room:plan.room,entry})})).filter(x=>x.spec?.canShoot&&
        x.spec.weapon?.projectile&&x.spec.roleId!=='charger')
      .map(x=>({...x,dueTick:Math.max(1,
        Math.ceil(x.entry.spawnAtMs*TICK_HZ/1000))}));
    if(!ranged.length||ranged.length>MAX_ENEMIES||
      new Set(ranged.map(x=>x.entry.id)).size!==ranged.length)
      throw new TypeError('Unreviewed ranged enemy roster');
    return {ranged,spawnDigest,totalEntries:plan.entries.length};
  };
  const report=state=>{
    requireState(state);
    return freeze({version:VERSION,battleId:state.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',
      sceneSeed:state.sceneSeed,tickHz:TICK_HZ,
      simulatedTicks:state.tick,
      rangedCatalogCandidates:state.rangedCount,
      excludedNonRangedCandidates:state.excludedCount,
      candidateEnemySpawned:state.enemies.length,
      candidateEnemies:state.enemies.map(e=>({id:e.id,roleId:e.roleId,
        position:{...e.position},yawRadians:e.yawRadians,
        candidateMuzzle:projectDungeonCandidateMuzzleV2C3({
          position:e.position,yawRadians:e.yawRadians,roleId:e.roleId}),
        combatSlotId:e.slotLease?.slotId||null,
        entryShieldPhase:e.entryShield.phase,
        phaseId:e.choreography?.phaseId||null,
        fireGate:e.lastFireGate,volleySequence:e.sequence})),
      candidateVolleys:state.volleys,
      candidateProjectileCreated:state.created,
      candidateProjectileExpired:state.expired,
      candidateProjectileActive:state.bullets.length,
      candidateBurstShotsPending:state.pending.length,
      projectedSeparationContributors:state.separationContributors,
      projectedEntryShieldFireBlocks:state.entryShieldFireBlocks,
      timelineDigest:state.traceDigest,
      candidateMuzzleYawProjectionOnly:true,
      multiEnemyCandidateTimelineVerified:true,
      playerMovementSnapshotFrozenAtOpen:true,
      playerMovementTickTimelineVerified:false,
      liveMuzzleTransformVerified:false,
      liveEnemyAISchedulerParityVerified:false,
      liveFrameTimeAndTimerParityVerified:false,
      contactChargerAndEnemyDeathVerified:false,
      actualDeviceProvenanceVerified:false,
      damagePipelineVerified:false,battleVictoryVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  };
  async function open(args={}){
    if(!exact(args,fieldsOpen))
      deny('C15_DUNGEON_V2C3_INPUT_INVALID','Exact ticket/movement/actor required',400);
    if(!config.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C3_ACTOR_NOT_ALLOWED','QA UID not allowlisted',403);
    const upstream=await enemyTimelineService.open(args);
    const r=upstream?.report;
    const m=movementService.inspect(args.movementState);
    if(r?.battleId!==args.ticket?.battleId||
      r?.sceneSeed!==args.ticket?.sceneSeed||
      r?.simulatedTicks!==0||r?.safeForSettlement!==false||
      r?.playerMovementSnapshotFrozenAtOpen!==true||
      m?.battleId!==r.battleId||m?.sceneSeed!==r.sceneSeed||
      !record(m.replayedPosition)||
      !finite(m.replayedPosition.x)||!finite(m.replayedPosition.z)||
      !HEX.test(m.traceDigest||'')||m.safeForSettlement!==false)
      deny('C15_DUNGEON_V2C3_UPSTREAM_INVALID','Verified upstream context required',403);
    const recipe=recipeFor(r.sceneSeed);
    if(recipe.spawnDigest!==args.ticket.spawnPlanDigest)
      deny('C15_DUNGEON_V2C3_CATALOG_DRIFT','Taurus catalog changed',409);
    const s=makeState({version:VERSION,tick:0,actor:actor(args),
      battleId:r.battleId,sceneSeed:r.sceneSeed,
      ticketMac:args.ticket.mac,spawnDigest:recipe.spawnDigest,
      movementDigest:m.traceDigest,player:{x:m.replayedPosition.x,z:m.replayedPosition.z},
      rangedCount:recipe.ranged.length,
      excludedCount:recipe.totalEntries-recipe.ranged.length,
      enemies:[],bullets:[],pending:[],
      volleys:0,created:0,expired:0,
      separationContributors:0,entryShieldFireBlocks:0,
      upstreamState:upstream.state,
      traceDigest:hash('sf-c15-dungeon-v2c3-init',{
        battleId:r.battleId,seed:r.sceneSeed,spawnDigest:recipe.spawnDigest,
        movementDigest:m.traceDigest})});
    return freeze({state:s,report:report(s)});
  }
  const spawn=(entry,spec,seed,tick)=>{
    const origin=combat.resolveDungeonEnemySpawnPointV38({
      laneNorm:spec.laneNorm,index:entry.index,arenaHalfWidth:7,
      worldHalfHeight:15});
    const enemySeed=seedMath.dungeonSceneStableSeedV2B1(seed,entry.id);
    return {id:entry.id,roleId:spec.roleId,seed:enemySeed,
      position:{x:origin.x,z:origin.z},yawRadians:0,
      choreography:combat.createDungeonEnemyChoreographyStateV38(spec,{
        seed:enemySeed,nowMs:tick*1000/TICK_HZ}),
      entryShield:entryShield.createDungeonEnemyEntryShieldV422({
        roleId:spec.roleId,elite:Boolean(spec.elite)}),
      slotLease:null,sequence:0,lastShootMs:tick*1000/TICK_HZ-
        (spec.weapon.cadence?.cooldownMs||0),
      blockedSinceMs:null,lastBlockedPhase:null,lastFireGate:'entry_approach'};
  };
  function makeShot(enemy,spec,shotIndex,burstCount,player,tick){
    const p=spec.weapon.projectile;
    const origin=projectDungeonCandidateMuzzleV2C3({
      position:enemy.position,yawRadians:enemy.yawRadians,roleId:enemy.roleId});
    const nowMs=tick*1000/TICK_HZ;
    const spread=(shotIndex-(burstCount-1)/2)*.20;
    const plan=projectile.createCampaignEnemyShotPlanV31({origin,
      target:{x:player.x+spread,z:player.z},
      targetVelocity:{x:0,z:0},
      projectileSpeed:p.speed,aimMode:p.aimMode,
      leadFactor:p.leadFactor,maxLeadMs:p.maxLeadMs,
      guidanceMs:p.guidanceMs,turnRateRadians:p.turnRateRadians,
      lifetimeMs:p.lifetimeMs,sourceRole:spec.roleId,
      priority:spec.elite?'elite':'normal',
      damageType:spec.weapon.bulletType||spec.archetype.damageType,
      visualId:p.visualId,pattern:spec.weapon.bulletPattern,createdAtMs:nowMs});
    if(![plan.velocity.x,plan.velocity.z].every(finite))
      throw new TypeError('Non-finite projected bullet velocity');
    return {enemyId:enemy.id,position:{x:origin.x,z:origin.z},
      velocity:{...plan.velocity},plan,createdTick:tick};
  }
  function tickStep(before,recipe,tick){
    const nowMs=tick*1000/TICK_HZ;
    const hudLine=hud.resolveDungeonHudOcclusionLineV396({
      dungeonId:'dung_taurus',worldHalfHeight:15,viewportHeight:852});
    const byId=new Map(recipe.ranged.map(x=>[x.entry.id,x.spec]));
    let enemies=before.enemies.map(e=>structuredClone(e));
    let bullets=before.bullets.map(x=>structuredClone(x));
    let pending=before.pending.map(x=>({...x}));
    let spawned=0,volleyStarted=0,created=before.created,
      expired=before.expired,volleys=before.volleys;
    let separationContributors=before.separationContributors;
    let entryShieldFireBlocks=before.entryShieldFireBlocks;
    for(const x of recipe.ranged){
      if(x.dueTick===tick){enemies.push(spawn(x.entry,x.spec,before.sceneSeed,tick));spawned++;}
    }
    if(enemies.length>MAX_ENEMIES)
      deny('C15_DUNGEON_V2C3_ENEMY_CAP','Enemy roster overflow',400);
    // Campaign's real leased slots, derived from CURRENT active descriptors.
    // Registry is reconstructed from previously issued leases, never client input.
    const registry=slots.createCampaignEnemyCombatSlotRegistryV37();
    registry.generation=tick-1;
    for(const e of enemies){
      if(e.slotLease)registry.assignments.set(e.id,e.slotLease);
    }
    const descriptors=enemies.map(e=>combat.createDungeonCombatSlotDescriptorV38({
      runtimeId:e.id,seed:e.seed,spec:byId.get(e.id)}));
    slots.syncCampaignEnemyCombatSlotsV37(registry,descriptors,{nowMs});
    for(const e of enemies){
      e.slotLease=slots.getCampaignEnemyCombatSlotV37(registry,e.id);
      if(!e.slotLease)throw new TypeError('Ranged enemy without combat slot');
    }
    const neighborPositions=enemies.map(e=>({runtimeId:e.id,
      mesh:{position:{...e.position}}}));
    const createdNow=[];
    // Tick-stamped scheduled burst shots use the candidate pose AFTER
    // this tick's movement, not the pose captured when the volley began.
    let activeGateCount=0;
    for(const e of enemies){
      const spec=byId.get(e.id);
      const start={...e.position};
      const engagement=role.resolveDungeonRoleEngagementV410({
        roleId:spec.roleId,playerZ:before.player.z,
        hudOcclusionLineZ:hudLine,worldHalfHeight:15,
        authoredPreferredRange:spec.preferredRange,
        authoredFireRangeMin:spec.fireRangeMin,
        authoredFireRangeMax:spec.fireRangeMax});
      const expanded=tuning.resolveDungeonCombatSlotV398({
        slot:e.slotLease,seed:e.seed,roleId:e.roleId,difficultyRank:1});
      const projectedSlot=role.projectDungeonCombatSlotV410({
        slot:expanded,engagement});
      const separation=tuning.resolveDungeonEnemySeparationV398({
        enemyX:start.x,enemyZ:start.z,
        neighbors:neighborPositions,enemyId:e.id,
        minSpacing:projectedSlot?.minSpacing||1.95,
        seed:e.seed,frameScale:1});
      separationContributors+=separation.contributors;
      const r=choreo.stepCampaignEnemyChoreographyV29(e.choreography,{
        nowMs,frameScale:1,baseSpeed:spec.speed,
        enemyX:start.x,enemyZ:start.z,
        playerX:before.player.x,playerZ:before.player.z,
        arenaHalfWidth:7,worldHalfHeight:15,viewportHeight:852,
        hudOcclusionLineZ:hudLine,entityScale:spec.elite?1.15:1,
        hpBarOffsetPx:-34,hpBarHeightPx:6,
        separationX:separation.steeringX,
        separationZ:separation.steeringZ,
        combatSlot:projectedSlot,
        fireCooldownMs:spec.weapon.cadence?.cooldownMs||0});
      if(r?.handled!==true)throw new TypeError('Multi-enemy FSM not handled');
      const projected=role.applyDungeonRoleEngagementV410({
        choreography:r,engagement});
      e.position.x=clamp(start.x+projected.deltaX+
        separation.correctionX,-6.65,6.65);
      e.position.z=start.z+projected.deltaZ+separation.correctionZ;
      if(!projected.canCrossPlayer&&finite(projected.maxCombatZ)&&
        e.position.z>projected.maxCombatZ){
        e.position.z=projected.maxCombatZ;
        e.choreography.velocityZ=Math.min(0,e.choreography.velocityZ||0);
      }
      if(![e.position.x,e.position.z].every(finite)||
        Math.abs(e.position.z)>100)
        throw new TypeError('Non-finite enemy candidate position');
      e.yawRadians=heading.resolveEnemyGameplayYawV26A4({
        currentYaw:e.yawRadians,
        velocityX:e.position.x-start.x,
        velocityZ:e.position.z-start.z,
        maxTurnRadians:7/60});
      for(const task of pending){
        if(task.enemyId===e.id&&task.dueTick<=tick)
          createdNow.push(makeShot(e,spec,task.shotIndex,task.burstCount,
            before.player,tick));
      }
      if(e.lastBlockedPhase!==r.phaseId){
        e.blockedSinceMs=null;e.lastBlockedPhase=r.phaseId;
      }
      const f=fire.resolveDungeonEnemyFireDecisionV399({
        choreography:projected,roleId:e.roleId,seed:e.seed,nowMs,
        blockedSinceMs:e.blockedSinceMs,
        enemyX:e.position.x,enemyZ:e.position.z,
        playerX:before.player.x,playerZ:before.player.z,
        canShoot:spec.canShoot,hasProjectile:Boolean(spec.weapon.projectile)});
      e.blockedSinceMs=f.blockedSinceMs;
      e.lastFireGate=f.reason;
      if(entryShield.isDungeonEnemyEntryActiveV422(e.entryShield)){
        activeGateCount++;
        const readiness=fire.resolveDungeonVolleyReadinessV399({
          mayFire:f.mayFire,canShoot:spec.canShoot,
          hasProjectile:Boolean(spec.weapon.projectile),nowMs,
          lastShoot:e.lastShootMs,
          shootMs:spec.weapon.cadence?.cooldownMs||0});
        if(readiness.allowed){
          const cadence=spec.weapon.cadence||{};
          const plan=volley.createCampaignEnemyVolleyPlanV34({
            roleId:e.roleId,phaseId:projected.phaseId||'attack',
            sequence:e.sequence,burstCount:cadence.burstCount||1,
            burstGapMs:cadence.burstGapMs||0,
            projectileDamage:spec.weapon.projectile.damage,createdAtMs:nowMs});
          if(!plan.shots?.length||plan.shots[0].fireOffsetMs!==0)
            throw new TypeError('Bad authored volley plan');
          createdNow.push(makeShot(e,spec,plan.shots[0].index,
            plan.shots.length,before.player,tick));
          for(const shot of plan.shots.slice(1)){
            // Timers are continuous wall-clock in client; tick quantization
            // is intentionally an approximation and explicitly reported.
            pending.push({enemyId:e.id,shotIndex:shot.index,
              burstCount:plan.shots.length,
              dueTick:Math.max(tick+1,Math.ceil((nowMs+shot.fireOffsetMs)*TICK_HZ/1000))});
          }
          e.lastShootMs=nowMs;e.sequence++;volleys++;volleyStarted++;
          e.lastFireGate='projectile_created';
        }
      }else{
        if(f.mayFire)entryShieldFireBlocks++;
        e.lastFireGate='entry_shield';
      }
      // DungeonScene advances the shield after runtime movement + fire gate.
      entryShield.advanceDungeonEnemyEntryShieldV422(e.entryShield,{
        nowMs,enemyZ:e.position.z,hudOcclusionLineZ:hudLine});
    }
    pending=pending.filter(task=>task.dueTick>tick);
    bullets.push(...createdNow);
    created+=createdNow.length;
    if(created>MAX_TOTAL_SHOTS||pending.length>MAX_PENDING_SHOTS)
      deny('C15_DUNGEON_V2C3_SHOT_CAP','Unbounded candidate projectile stream',400);
    const active=[];
    for(const bullet of bullets){
      if(bullet.createdTick===tick){active.push(bullet);continue;}
      const p=projectile.advanceCampaignEnemyProjectileV31({
        plan:bullet.plan,position:bullet.position,velocity:bullet.velocity,
        target:before.player,targetVelocity:{x:0,z:0},nowMs,frameScale:1});
      const pos={x:bullet.position.x+p.delta.x,z:bullet.position.z+p.delta.z};
      if(![pos.x,pos.z,p.velocity.x,p.velocity.z].every(finite))
        throw new TypeError('Non-finite candidate projectile');
      if(p.expired||pos.z>18||pos.z< -19||Math.abs(pos.x)>12){
        expired++;continue;
      }
      active.push({...bullet,position:pos,velocity:{...p.velocity}});
    }
    if(active.length>MAX_PROJECTILES)
      deny('C15_DUNGEON_V2C3_PROJECTILE_CAP','Active projectiles exceeded QA cap',400);
    const state={...before,tick,enemies,bullets:active,pending,
      volleys,created,expired,separationContributors,entryShieldFireBlocks};
    state.traceDigest=hash('sf-c15-dungeon-v2c3-tick',{
      previous:before.traceDigest,tick,spawned,volleyStarted,
      createdThisTick:createdNow.length,
      gatesActive:activeGateCount,
      enemies:enemies.map(e=>({id:e.id,position:e.position,
        yaw:e.yawRadians,slot:e.slotLease?.slotId,
        phase:e.choreography?.phaseId,shield:e.entryShield.phase,
        gate:e.lastFireGate,sequence:e.sequence})),
      projectiles:active.map(p=>({enemyId:p.enemyId,
        position:p.position,velocity:p.velocity})),
      pending:pending.map(x=>({...x})),
      counters:{volleys,created,expired,separationContributors,
        entryShieldFireBlocks}});
    return state;
  }
  async function step(args={}){
    if(!exact(args,fieldsStep)||!integer(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C3_INPUT_INVALID','Exact bounded tick request required',400);
    requireState(args.state);
    const s=args.state;
    if(args.uid!==s.actor.uid||args.sessionId!==s.actor.sessionId||
      args.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C3_ACTOR_MISMATCH','Cannot transfer state to another actor',403);
    if(args.ticket?.mac!==s.ticketMac)
      deny('C15_DUNGEON_V2C3_TICKET_MISMATCH','Ticket changed',403);
    const movement=movementService.inspect(args.movementState);
    if(movement?.traceDigest!==s.movementDigest||
      movement?.replayedPosition?.x!==s.player.x||
      movement?.replayedPosition?.z!==s.player.z)
      deny('C15_DUNGEON_V2C3_TOUCH_TIMELINE_UNALIGNED',
        'No per-tick movement evidence available',409);
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C3_TICK_CAP','Six-second QA tick cap',400);
    const wanted=hash('sf-c15-dungeon-v2c3-operation',{
      tick:s.tick,ticks:args.ticks,mac:args.ticket.mac,
      movementDigest:s.movementDigest});
    const prior=used.get(s);
    if(prior){
      if(prior.wanted!==wanted)
        deny('C15_DUNGEON_V2C3_REUSED_STATE','Old state already consumed',409);
      return freeze({duplicate:true,...prior.outcome});
    }
    const running=inflight.get(s);
    if(running){
      if(running.wanted!==wanted)
        deny('C15_DUNGEON_V2C3_REUSED_STATE','Concurrent fork denied',409);
      const outcome=await running.promise;
      return freeze({duplicate:true,...outcome});
    }
    const promise=(async()=>{
      const upstream=await enemyTimelineService.step({
        state:s.upstreamState,ticket:args.ticket,
        movementState:args.movementState,...actor(args),ticks:args.ticks});
      if(upstream?.report?.simulatedTicks!==s.tick+args.ticks||
        upstream?.report?.battleId!==s.battleId||
        upstream?.report?.sceneSeed!==s.sceneSeed||
        upstream?.report?.safeForSettlement!==false)
        deny('C15_DUNGEON_V2C3_UPSTREAM_MISMATCH',
          'V2C.2 step proof not valid',403);
      const recipe=recipeFor(s.sceneSeed);
      if(recipe.spawnDigest!==s.spawnDigest)
        deny('C15_DUNGEON_V2C3_CATALOG_DRIFT','Spawn recipe changed',409);
      let next=s;
      for(let t=s.tick+1;t<=s.tick+args.ticks;t++)
        next=tickStep(next,recipe,t);
      const state=makeState({...next,upstreamState:upstream.state});
      const outcome=freeze({state,report:report(state)});
      used.set(s,{wanted,outcome});
      return outcome;
    })();
    inflight.set(s,{wanted,promise});
    try{
      return freeze({duplicate:false,...await promise});
    }finally{
      if(inflight.get(s)?.promise===promise)inflight.delete(s);
    }
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,finalize:locked,claim:locked});
}
module.exports=freeze({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,MAX_ENEMIES,
  projectDungeonCandidateMuzzleV2C3,
  parseC15DungeonMultiEnemyTimelineV2C3Config,
  createC15DungeonMultiEnemyTimelineV2C3});
