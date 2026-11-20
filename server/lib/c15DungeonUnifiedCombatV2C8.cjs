'use strict';
/**
 * C15 Dungeon V2C.8 -- non-economic, demo-emulator-only CAUSAL COMBAT QA.
 *
 * Unlike V2C.7, this candidate loop does NOT step V2C.3-7 to obtain an
 * outgoing death ledger. Every 60 Hz tick uses ONE set of live enemy poses:
 * spawn -> enemy FSM/fire -> player shots/hits/deaths -> hostile sweeps ->
 * post-death slot/pending cleanup -> sealed digest. Dead enemies cannot enter
 * the next FSM tick. This is a closed loop for the *reviewed QA subset* only.
 *
 * The player pose is fixed at an instance-issued V2B.3 movement snapshot;
 * weapon/defenses are SERVER-OWNED QA presets. World matrices, full client
 * frame timing, skill/loadout, charger, boss, stage result, and device origin
 * are NOT verified. No production routes and NO reward settlement.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonAiDeathFeedbackV2C7Config}=require('./c15DungeonAiDeathFeedbackV2C7.cjs');
const {projectDungeonCandidateMuzzleV2C3}=require('./c15DungeonMultiEnemyTimelineV2C3.cjs');
const {QA_WEAPON,applyCandidateOutgoingHitV2C5}=require('./c15DungeonOutgoingStateV2C5.cjs');
const {QA_DEFENSE_FIXTURE,projectCandidateHitV2C4}=require('./c15DungeonDamageStateV2C4.cjs');

const VERSION='c15-dungeon-unified-combat-v2c8';
const TICK_HZ=60,MAX_TICKS=360,MAX_BATCH=60,MAX_ENEMIES=12;
const MAX_HOSTILE=96,MAX_PLAYER_SHOTS=96,MAX_PENDING=64;
const MAX_CREATED=1024,MAX_HITS=1024,MAX_DEATHS=12;
const OPEN=['ticket','movementState','uid','sessionId','requestId'];
const STEP=['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>plain(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const boundedInt=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const point=x=>plain(x)&&finite(x.x)&&finite(x.z)&&
  Math.abs(x.x)<=100&&Math.abs(x.z)<=100;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,x)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(x)])).digest('hex');
const seal=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))seal(v);Object.freeze(x);
}return x;};
const deny=(code,message,status=423)=>{throw new GameError(code,message,status);};
const lock=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Full combat parity and economic settlement are NOT verified');
const actor=x=>({uid:x.uid,sessionId:x.sessionId,requestId:x.requestId});

function parseC15DungeonUnifiedCombatV2C8Config(env={}){
  if(!plain(env))throw new TypeError('V2C.8 QA environment must be plain');
  if(env.GAME_C15_DUNGEON_V2C8_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C8_QA_APPROVED!=='true')
    throw new TypeError('Explicit V2C.8 QA approval required');
  const previous=parseC15DungeonAiDeathFeedbackV2C7Config(env);
  if(!previous||previous.emulatorOnly!==true||
    typeof previous.projectId!=='string'||!previous.projectId.startsWith('demo-'))
    throw new TypeError('V2C.8 requires all prior demo QA gates');
  return seal({version:VERSION,projectId:previous.projectId,
    allowedUids:[...previous.allowedUids],emulatorOnly:true});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C8_DISABLED','Unified candidate QA is OFF');
  return seal({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,claim:lock,finalize:lock});
}

async function createC15DungeonUnifiedCombatV2C8({env={},ticketService,movementService,
  encounterModule,combatModule,seedModule,slotsModule,roleModule,tuningModule,
  shieldModule,choreoModule,headingModule,hudModule,fireModule,volleyModule,
  projectileModule,integrityModule,balanceModule,passivesModule,
  weaponsModule,combatMathModule}={}){
  const cfg=parseC15DungeonUnifiedCombatV2C8Config(env);
  if(!cfg)return disabled();
  if(!ticketService||ticketService.enabled!==true||
    ticketService.emulatorOnly!==true||ticketService.productionEnabled!==false||
    ticketService.rewardSettlementEnabled!==false||
    typeof ticketService.verifyTicket!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.inspect!=='function')
    throw new TypeError('V2B.2 ticket and V2B.3 movement demo services required');
  const root=path.resolve(__dirname,'../../client/src');
  const load=f=>import(pathToFileURL(path.join(root,f)).href);
  const [encounter,combat,seedMath,slots,role,tuning,shield,choreo,heading,hud,
    fire,volley,projectile,integrity,balance,passives,weapons,combatMath]=await Promise.all([
    encounterModule||load('game/dungeon/DungeonEncounterDirectorV38.js'),
    combatModule||load('game/dungeon/DungeonCombatAdapterV38.js'),
    seedModule||load('game/dungeon/DungeonSeedTouchContractV2B1.js'),
    slotsModule||load('game/combat/CampaignEnemyCombatSlotsV37.js'),
    roleModule||load('game/dungeon/DungeonRoleEngagementV410.js'),
    tuningModule||load('game/dungeon/DungeonProductionTuningV398.js'),
    shieldModule||load('game/dungeon/DungeonEnemyEntryShieldV422.js'),
    choreoModule||load('game/combat/CampaignCombatChoreographyV29.js'),
    headingModule||load('game/assets/EnemyVisualHeadingV26A4.js'),
    hudModule||load('game/dungeon/DungeonHudCatalogV396.js'),
    fireModule||load('game/dungeon/DungeonFireReliabilityV399.js'),
    volleyModule||load('game/combat/CampaignEnemyVolleyV34.js'),
    projectileModule||load('game/combat/CampaignEnemyProjectileV31.js'),
    integrityModule||load('game/dungeon/DungeonCombatIntegrityV392.js'),
    balanceModule||load('game/dungeon/DungeonBalanceV426.js'),
    passivesModule||load('game/combat/BattlePassives.js'),
    weaponsModule||load('game/combat/PlayerWeapons.js'),
    combatMathModule||load('utils/combatStats.js'),
  ]);
  for(const [mod,name] of [
    [encounter,'buildDungeonRoomSpawnPlanV38'],
    [combat,'resolveDungeonEnemySpecV38'],
    [combat,'resolveDungeonEnemySpawnPointV38'],
    [combat,'createDungeonEnemyChoreographyStateV38'],
    [combat,'createDungeonCombatSlotDescriptorV38'],
    [seedMath,'dungeonSceneStableSeedV2B1'],
    [slots,'createCampaignEnemyCombatSlotRegistryV37'],
    [slots,'syncCampaignEnemyCombatSlotsV37'],
    [slots,'getCampaignEnemyCombatSlotV37'],
    [role,'resolveDungeonRoleEngagementV410'],
    [role,'projectDungeonCombatSlotV410'],
    [role,'applyDungeonRoleEngagementV410'],
    [tuning,'resolveDungeonCombatSlotV398'],
    [tuning,'resolveDungeonEnemySeparationV398'],
    [shield,'createDungeonEnemyEntryShieldV422'],
    [shield,'isDungeonEnemyEntryActiveV422'],
    [shield,'advanceDungeonEnemyEntryShieldV422'],
    [choreo,'stepCampaignEnemyChoreographyV29'],
    [heading,'resolveEnemyGameplayYawV26A4'],
    [hud,'resolveDungeonHudOcclusionLineV396'],
    [fire,'resolveDungeonEnemyFireDecisionV399'],
    [fire,'resolveDungeonVolleyReadinessV399'],
    [volley,'createCampaignEnemyVolleyPlanV34'],
    [projectile,'createCampaignEnemyShotPlanV31'],
    [projectile,'advanceCampaignEnemyProjectileV31'],
    [integrity,'logicalSegmentCircleHitV392'],
    [integrity,'resolveDungeonHostileProjectileHitRadiusV392'],
    [balance,'resolveDungeonIncomingDamageV426'],
    [balance,'resolveDungeonHostileHitRadiusV426'],
    [passives,'receiveBattleHit'],
    [weapons,'describeMainSalvo'],
    [weapons,'advancePlayerProjectile'],
    [weapons,'pickWeaponTarget'],
    [weapons,'projectileHitsPoint'],
    [weapons,'registerProjectileHit'],
    [combatMath,'calculateProjectileDamage'],
  ])if(typeof mod?.[name]!=='function')
    throw new TypeError('Reviewed shared combat helper missing: '+name);
  const hitsDeps={integrity,balance,passives};
  const outgoingDeps={weapons,combatMath};
  const issued=new WeakSet(),used=new WeakMap(),inflight=new WeakMap();
  const make=x=>{const s=seal(x);issued.add(s);return s;};
  const requireState=s=>{
    if(!plain(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C8_STATE_UNTRUSTED',
        'Only instance-issued frozen QA state is accepted',403);
  };
  const recipeFor=sceneSeed=>{
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:'dung_taurus',roomIndex:0,seed:sceneSeed});
    if(plan?.dungeonId!=='dung_taurus'||plan?.room?.id!=='taurus_entry'||
      !Array.isArray(plan.entries)||plan.entries.length<1||plan.entries.length>40)
      throw new TypeError('Unreviewed Taurus entry spawn plan');
    const spawnDigest=digest('sf-c15-dungeon-v2b2-spawns',plan.entries.map(e=>({
      id:e.id,roleId:e.roleId,laneNorm:e.laneNorm,
      spawnAtMs:e.spawnAtMs,threatCost:e.threatCost})));
    const ranged=plan.entries.map(entry=>({entry,
      spec:combat.resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',
        room:plan.room,entry})})).filter(x=>x.spec?.canShoot&&
        x.spec?.weapon?.projectile&&x.spec.roleId!=='charger')
      .map(x=>({...x,dueTick:Math.max(1,
        Math.ceil(x.entry.spawnAtMs*TICK_HZ/1000))}));
    if(ranged.length<1||ranged.length>MAX_ENEMIES||
      new Set(ranged.map(x=>x.entry.id)).size!==ranged.length||
      ranged.some(x=>!finite(x.spec.hp)||x.spec.hp<=0||x.spec.hp>1000000))
      throw new TypeError('Unreviewed Taurus ranged HP roster');
    return {spawnDigest,ranged,total:plan.entries.length,
      byId:new Map(ranged.map(x=>[x.entry.id,x.spec]))};
  };
  const verifyMovement=(s,m)=>{
    if(m?.battleId!==s.battleId||m?.sceneSeed!==s.sceneSeed||
      m?.spawnPlanDigest!==s.spawnDigest||m?.traceDigest!==s.movementDigest||
      m?.replayedPosition?.x!==s.player.x||
      m?.replayedPosition?.z!==s.player.z||
      m?.safeForSettlement!==false||m?.independentReplayVerified!==false)
      deny('C15_DUNGEON_V2C8_MOVEMENT_MISMATCH',
        'Frozen verified QA touch snapshot changed',409);
  };
  const verifyTicket=async(ticket,a)=>{
    const proof=await ticketService.verifyTicket(ticket,a);
    if(proof?.serverAdmissionVerified!==true||
      proof?.serverSceneSeedBound!==true||proof?.battleId!==ticket.battleId||
      proof?.sceneSeed!==ticket.sceneSeed||
      proof?.spawnPlanDigest!==ticket.spawnPlanDigest||
      proof?.safeForSettlement!==false||
      proof?.rewardSettlementEnabled!==false||proof?.cloudRewards!==false)
      deny('C15_DUNGEON_V2C8_TICKET_INVALID','Signed demo ticket not verified',403);
    return proof;
  };
  const report=s=>{
    requireState(s);
    return seal({version:VERSION,battleId:s.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',
      sceneSeed:s.sceneSeed,tickHz:TICK_HZ,simulatedTicks:s.tick,
      candidateLiveEnemies:s.actors.length,candidateDeadEnemies:s.deaths.length,
      candidateDeaths:s.deaths.map(x=>({...x})),
      candidateLiveActorIds:s.actors.map(e=>e.id),
      candidateLiveCombatSlotIds:s.actors.map(e=>e.slotLease?.slotId||null),
      candidateOutgoingShots:s.playerShotsCreated,
      candidateOutgoingHits:s.outgoingHits.length,
      candidateOutgoingDamage:s.outgoingDamage,
      candidateEnemyHp:s.roster.map(e=>({id:e.id,hp:e.hp,maxHp:e.maxHp,
        dead:e.dead,deathTick:e.deathTick})),
      candidateEnemyVolleys:s.volleys,
      candidateHostileShots:s.hostileCreated,
      candidateHostileHits:s.incomingHits.length,
      candidatePlayerHp:s.hp,candidatePlayerShieldHp:s.shieldHp,
      candidateCanceledPending:s.canceledPending,
      candidateReleasedSlots:s.releasedSlots,
      candidateDeathAwareFsmSkipped:s.suppressedFrames,
      candidatePendingBursts:s.pending.length,
      candidateActiveHostileShots:s.hostileBullets.length,
      candidateActivePlayerShots:s.playerShots.length,
      candidateDigest:s.combatDigest,
      causallyLinkedCandidateTickLoop:true,
      candidateDeathsComputedInsideSameTickLoop:true,
      outgoingUsesSameTickAiPositions:true,
      incomingUsesSameLoopHostileProjectiles:true,
      previousUpstreamV2C3ToV2C7StepCalls:0,
      qaWeaponPreset:QA_WEAPON.id,
      qaDefensePreset:QA_DEFENSE_FIXTURE.id,
      playerPositionFrozenAtOpen:true,
      independentlyVerifiedFullDungeonCombat:false,
      liveGameplayAiParityVerified:false,liveBabylonMuzzleVerified:false,
      playerTouchPerTickVerified:false,actualAccountLoadoutVerified:false,
      actualDeviceProvenanceVerified:false,chargerBossHazardsVerified:false,
      dungeonVictoryVerified:false,independentReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  };
  async function open(args={}){
    if(!exact(args,OPEN))
      deny('C15_DUNGEON_V2C8_INPUT_INVALID',
        'Exact signed ticket, movement and actor required',400);
    if(!cfg.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C8_ACTOR_INVALID','QA UID not allowed',403);
    const a=actor(args);
    const trusted=await verifyTicket(args.ticket,a);
    const movement=movementService.inspect(args.movementState);
    if(!point(movement?.replayedPosition)||
      movement.battleId!==trusted.battleId||
      movement.sceneSeed!==trusted.sceneSeed||
      movement.spawnPlanDigest!==trusted.spawnPlanDigest)
      deny('C15_DUNGEON_V2C8_MOVEMENT_INVALID','Instance-issued QA pose required',403);
    const recipe=recipeFor(trusted.sceneSeed);
    if(recipe.spawnDigest!==trusted.spawnPlanDigest)
      deny('C15_DUNGEON_V2C8_CATALOG_DRIFT','Signed spawn catalog changed',409);
    const roster=recipe.ranged.map(({entry,spec})=>({id:entry.id,
      roleId:spec.roleId,hp:spec.hp,maxHp:spec.hp,dead:false,deathTick:null}));
    const s=make({version:VERSION,tick:0,actor:a,battleId:trusted.battleId,
      sceneSeed:trusted.sceneSeed,spawnDigest:trusted.spawnPlanDigest,
      ticketMac:args.ticket.mac,
      ticketDigest:digest('sf-c15-v2c8-ticket',args.ticket),
      movementDigest:movement.traceDigest,
      player:{x:movement.replayedPosition.x,z:movement.replayedPosition.z},
      roster,actors:[],deaths:[],pending:[],hostileBullets:[],playerShots:[],
      outgoingHits:[],incomingHits:[],
      hp:QA_DEFENSE_FIXTURE.maxHp,shieldHp:QA_DEFENSE_FIXTURE.passiveShieldMax,
      playerShotsCreated:0,playerShotsConsumed:0,playerShotsExpired:0,
      hostileCreated:0,hostileExpired:0,volleys:0,outgoingDamage:0,
      canceledPending:0,releasedSlots:0,suppressedFrames:0,
      combatDigest:digest('sf-c15-v2c8-init',{
        battleId:trusted.battleId,sceneSeed:trusted.sceneSeed,
        spawnDigest:trusted.spawnPlanDigest,ticketMac:args.ticket.mac,
        movementDigest:movement.traceDigest,roster,
        weapon:QA_WEAPON.id,defense:QA_DEFENSE_FIXTURE.id})});
    verifyMovement(s,movement);
    return seal({state:s,report:report(s)});
  }
  const spawn=(entry,spec,sceneSeed,tick)=>{
    const pos=combat.resolveDungeonEnemySpawnPointV38({
      laneNorm:spec.laneNorm,index:entry.index,arenaHalfWidth:7,
      worldHalfHeight:15});
    const enemySeed=seedMath.dungeonSceneStableSeedV2B1(sceneSeed,entry.id);
    return {id:entry.id,roleId:spec.roleId,seed:enemySeed,
      position:{x:pos.x,z:pos.z},yawRadians:0,
      choreography:combat.createDungeonEnemyChoreographyStateV38(spec,{
        seed:enemySeed,nowMs:tick*1000/TICK_HZ}),
      entryShield:shield.createDungeonEnemyEntryShieldV422({
        roleId:spec.roleId,elite:Boolean(spec.elite)}),
      slotLease:null,sequence:0,
      lastShootMs:tick*1000/TICK_HZ-(spec.weapon.cadence?.cooldownMs||0),
      blockedSinceMs:null,lastBlockedPhase:null,lastFireGate:'entry_approach'};
  };
  const makeHostile=(e,spec,index,count,player,tick,serial)=>{
    const p=spec.weapon.projectile;
    const origin=projectDungeonCandidateMuzzleV2C3({position:e.position,
      yawRadians:e.yawRadians,roleId:e.roleId});
    const spread=(index-(count-1)/2)*.20;
    const plan=projectile.createCampaignEnemyShotPlanV31({origin,
      target:{x:player.x+spread,z:player.z},targetVelocity:{x:0,z:0},
      projectileSpeed:p.speed,aimMode:p.aimMode,leadFactor:p.leadFactor,
      maxLeadMs:p.maxLeadMs,guidanceMs:p.guidanceMs,
      turnRateRadians:p.turnRateRadians,lifetimeMs:p.lifetimeMs,
      sourceRole:spec.roleId,priority:spec.elite?'elite':'normal',
      damageType:spec.weapon.bulletType||spec.archetype.damageType,
      visualId:p.visualId,pattern:spec.weapon.bulletPattern,
      createdAtMs:tick*1000/TICK_HZ});
    if(!point(plan.velocity))throw new TypeError('Projected hostile shot invalid');
    return {id:digest('sf-c15-v2c8-hostile',{enemyId:e.id,tick,serial}),
      enemyId:e.id,createdTick:tick,position:{x:origin.x,z:origin.z},
      velocity:{...plan.velocity},plan};
  };
  function advanceTick(before,recipe){
    const tick=before.tick+1,nowMs=tick*1000/TICK_HZ;
    const roster=before.roster.map(e=>({...e})),byHp=new Map(roster.map(e=>[e.id,e]));
    const previousDead=new Set(before.deaths.map(e=>e.id));
    let actors=before.actors.map(e=>structuredClone(e));
    const spawned=recipe.ranged.filter(x=>x.dueTick===tick);
    for(const x of spawned){
      if(previousDead.has(x.entry.id)||actors.some(e=>e.id===x.entry.id))
        throw new TypeError('Dead or duplicate enemy spawn');
      actors.push(spawn(x.entry,x.spec,before.sceneSeed,tick));
    }
    if(actors.length>MAX_ENEMIES)throw new TypeError('Active roster overflow');
    const registry=slots.createCampaignEnemyCombatSlotRegistryV37();
    registry.generation=tick-1;
    for(const e of actors)if(e.slotLease)registry.assignments.set(e.id,e.slotLease);
    slots.syncCampaignEnemyCombatSlotsV37(registry,actors.map(e=>
      combat.createDungeonCombatSlotDescriptorV38({runtimeId:e.id,
        seed:e.seed,spec:recipe.byId.get(e.id)})),{nowMs});
    for(const e of actors){
      e.slotLease=slots.getCampaignEnemyCombatSlotV37(registry,e.id);
      if(!e.slotLease)throw new TypeError('Enemy without a candidate slot');
    }
    let pending=before.pending.map(x=>({...x}));
    let hostileCreated=before.hostileCreated,hostileExpired=before.hostileExpired,
      volleys=before.volleys;
    const hostileNew=[];
    const neighbors=actors.map(e=>({runtimeId:e.id,mesh:{position:{...e.position}}}));
    const hudLine=hud.resolveDungeonHudOcclusionLineV396({
      dungeonId:'dung_taurus',worldHalfHeight:15,viewportHeight:852});
    for(const e of actors){
      const spec=recipe.byId.get(e.id),start={...e.position};
      const engagement=role.resolveDungeonRoleEngagementV410({
        roleId:spec.roleId,playerZ:before.player.z,hudOcclusionLineZ:hudLine,
        worldHalfHeight:15,authoredPreferredRange:spec.preferredRange,
        authoredFireRangeMin:spec.fireRangeMin,
        authoredFireRangeMax:spec.fireRangeMax});
      const expanded=tuning.resolveDungeonCombatSlotV398({
        slot:e.slotLease,seed:e.seed,roleId:e.roleId,difficultyRank:1});
      const slot=role.projectDungeonCombatSlotV410({slot:expanded,engagement});
      const separation=tuning.resolveDungeonEnemySeparationV398({
        enemyX:start.x,enemyZ:start.z,neighbors,enemyId:e.id,
        minSpacing:slot?.minSpacing||1.95,seed:e.seed,frameScale:1});
      const motion=choreo.stepCampaignEnemyChoreographyV29(e.choreography,{
        nowMs,frameScale:1,baseSpeed:spec.speed,
        enemyX:start.x,enemyZ:start.z,
        playerX:before.player.x,playerZ:before.player.z,
        arenaHalfWidth:7,worldHalfHeight:15,viewportHeight:852,
        hudOcclusionLineZ:hudLine,entityScale:spec.elite?1.15:1,
        hpBarOffsetPx:-34,hpBarHeightPx:6,
        separationX:separation.steeringX,separationZ:separation.steeringZ,
        combatSlot:slot,fireCooldownMs:spec.weapon.cadence?.cooldownMs||0});
      if(motion?.handled!==true)throw new TypeError('Candidate enemy FSM did not run');
      const projected=role.applyDungeonRoleEngagementV410({
        choreography:motion,engagement});
      e.position.x=clamp(start.x+projected.deltaX+separation.correctionX,-6.65,6.65);
      e.position.z=start.z+projected.deltaZ+separation.correctionZ;
      if(!projected.canCrossPlayer&&finite(projected.maxCombatZ)&&
        e.position.z>projected.maxCombatZ){
        e.position.z=projected.maxCombatZ;
        e.choreography.velocityZ=Math.min(0,e.choreography.velocityZ||0);
      }
      if(!point(e.position))throw new TypeError('Non-finite candidate enemy pose');
      e.yawRadians=heading.resolveEnemyGameplayYawV26A4({
        currentYaw:e.yawRadians,velocityX:e.position.x-start.x,
        velocityZ:e.position.z-start.z,maxTurnRadians:7/60});
      for(const task of pending)if(task.enemyId===e.id&&task.dueTick<=tick){
        hostileNew.push(makeHostile(e,spec,task.shotIndex,task.burstCount,
          before.player,tick,hostileCreated++));
      }
      if(e.lastBlockedPhase!==motion.phaseId){
        e.blockedSinceMs=null;e.lastBlockedPhase=motion.phaseId;
      }
      const decision=fire.resolveDungeonEnemyFireDecisionV399({
        choreography:projected,roleId:e.roleId,seed:e.seed,nowMs,
        blockedSinceMs:e.blockedSinceMs,enemyX:e.position.x,
        enemyZ:e.position.z,playerX:before.player.x,playerZ:before.player.z,
        canShoot:spec.canShoot,hasProjectile:Boolean(spec.weapon.projectile)});
      e.blockedSinceMs=decision.blockedSinceMs;
      e.lastFireGate=decision.reason;
      if(shield.isDungeonEnemyEntryActiveV422(e.entryShield)){
        const ready=fire.resolveDungeonVolleyReadinessV399({
          mayFire:decision.mayFire,canShoot:spec.canShoot,
          hasProjectile:Boolean(spec.weapon.projectile),nowMs,
          lastShoot:e.lastShootMs,shootMs:spec.weapon.cadence?.cooldownMs||0});
        if(ready.allowed){
          const cadence=spec.weapon.cadence||{};
          const planned=volley.createCampaignEnemyVolleyPlanV34({
            roleId:e.roleId,phaseId:projected.phaseId||'attack',
            sequence:e.sequence,burstCount:cadence.burstCount||1,
            burstGapMs:cadence.burstGapMs||0,
            projectileDamage:spec.weapon.projectile.damage,createdAtMs:nowMs});
          if(!planned.shots?.length||planned.shots[0].fireOffsetMs!==0)
            throw new TypeError('Unexpected shared volley');
          hostileNew.push(makeHostile(e,spec,planned.shots[0].index,
            planned.shots.length,before.player,tick,hostileCreated++));
          for(const x of planned.shots.slice(1))pending.push({enemyId:e.id,
            shotIndex:x.index,burstCount:planned.shots.length,
            dueTick:Math.max(tick+1,
              Math.ceil((nowMs+x.fireOffsetMs)*TICK_HZ/1000))});
          e.lastShootMs=nowMs;e.sequence++;volleys++;
          e.lastFireGate='projectile_created';
        }
      }else e.lastFireGate='entry_shield';
      shield.advanceDungeonEnemyEntryShieldV422(e.entryShield,{
        nowMs,enemyZ:e.position.z,hudOcclusionLineZ:hudLine});
    }
    pending=pending.filter(x=>x.dueTick>tick);
    if(hostileCreated>MAX_CREATED||pending.length>MAX_PENDING)
      throw new TypeError('Hostile shot or burst QA capacity exceeded');

    // Player fire uses the EXACT same live enemy poses and entry flags from
    // the just-computed AI tick, not V2C.3's parallel upstream timeline.
    let shots=before.playerShots.map(x=>({...x,hitKeys:[...x.hitKeys]}));
    let playerShotsCreated=before.playerShotsCreated;
    let playerShotsConsumed=before.playerShotsConsumed;
    let playerShotsExpired=before.playerShotsExpired;
    const outgoingHits=before.outgoingHits.map(x=>({...x}));
    let outgoingDamage=before.outgoingDamage;
    const alive=()=>actors.filter(e=>byHp.get(e.id)?.hp>0&&
      shield.isDungeonEnemyEntryActiveV422(e.entryShield))
      .map(e=>({id:e.id,_dead:false,mesh:{position:{...e.position}}}));
    if(tick%QA_WEAPON.fireEveryTicks===0){
      const target=weapons.pickWeaponTarget(alive(),before.player);
      if(target){
        const salvo=weapons.describeMainSalvo(QA_WEAPON,before.player,
          QA_WEAPON.atk,target);
        if(salvo.length!==1||salvo[0].homing!==true)
          throw new TypeError('Shared QA weapon policy drifted');
        for(const x of salvo){
          if(![x.x,x.z,x.vx,x.vz,x.atk].every(finite)||x.atk<=0||
            x.atk>100000||playerShotsCreated>=MAX_CREATED)
            throw new TypeError('Invalid or excessive outgoing salvo');
          shots.push({id:digest('sf-c15-v2c8-player-shot',{
            battleId:before.battleId,tick,serial:playerShotsCreated}),
            targetId:target.id,createdTick:tick,
            position:{x:x.x,z:x.z},vx:x.vx,vz:x.vz,atk:x.atk,
            remaining:QA_WEAPON.penetration,hitKeys:[]});
          playerShotsCreated++;
        }
      }
    }
    const deaths=before.deaths.map(x=>({...x}));
    const killedThisTick=[];
    const survivingPlayer=[];
    for(const shot of shots){
      if(!boundedInt(shot.createdTick,1,tick))throw new TypeError('Shot tick invalid');
      const target=alive().find(x=>x.id===shot.targetId)||null;
      const b={position:{...shot.position},_vx:shot.vx,_vz:shot.vz,
        isHoming:true,target,_waveAmplitude:0};
      weapons.advancePlayerProjectile(b,1);
      if(!point(b.position)||![b._vx,b._vz].every(finite))
        throw new TypeError('Invalid shared QA player projectile');
      const moving={...shot,position:{...b.position},vx:b._vx,vz:b._vz};
      if(tick-moving.createdTick>120||moving.position.z< -18||
        moving.position.z>18||Math.abs(moving.position.x)>10){
        playerShotsExpired++;continue;
      }
      let consumed=false;
      for(const candidate of alive()){
        const e=byHp.get(candidate.id);
        const impact=applyCandidateOutgoingHitV2C5({
          enemy:{...e,entryActive:true,position:candidate.mesh.position},
          shot:moving,position:candidate.mesh.position},outgoingDeps);
        if(!impact.hit)continue;
        if(outgoingHits.length>=MAX_HITS)throw new TypeError('Outgoing ledger capacity');
        e.hp=impact.hpAfter;
        outgoingDamage+=impact.damageApplied;
        const killed=impact.killed&&!e.dead;
        if(killed){e.dead=true;e.deathTick=tick;
          const death={id:e.id,tick,shotId:shot.id};
          deaths.push(death);killedThisTick.push(death);
        }
        outgoingHits.push({tick,shotId:shot.id,enemyId:e.id,
          damage:impact.damageApplied,hpAfter:e.hp,killed});
        moving.hitKeys=impact.hitKeys;
        moving.remaining=impact.remaining;
        consumed=impact.consumed;
        if(consumed)playerShotsConsumed++;
        break;
      }
      if(!consumed)survivingPlayer.push(moving);
    }
    if(deaths.length>MAX_DEATHS||outgoingHits.length>MAX_HITS||
      survivingPlayer.length>MAX_PLAYER_SHOTS)
      throw new TypeError('Outgoing QA state bound exceeded');

    // Hostile bullets from PREVIOUS ticks advance and can hurt the player.
    // A projectile created by an enemy before/in its death tick persists.
    let hp=before.hp,shieldHp=before.shieldHp;
    const incomingHits=before.incomingHits.map(x=>({...x}));
    const oldHitIds=new Set(incomingHits.map(x=>x.shotId));
    const hostileActive=[];
    for(const bullet of before.hostileBullets){
      const spec=recipe.byId.get(bullet.enemyId);
      if(!spec)throw new TypeError('Unknown hostile shot provenance');
      const p=projectile.advanceCampaignEnemyProjectileV31({
        plan:bullet.plan,position:bullet.position,velocity:bullet.velocity,
        target:before.player,targetVelocity:{x:0,z:0},nowMs,frameScale:1});
      const to={x:bullet.position.x+p.delta.x,z:bullet.position.z+p.delta.z};
      if(!point(to)||!point(p.velocity))throw new TypeError('Invalid hostile motion');
      if(p.expired||to.z>18||to.z< -19||Math.abs(to.x)>12){
        hostileExpired++;continue;
      }
      if(hp>0&&!oldHitIds.has(bullet.id)){
        const impact=projectCandidateHitV2C4({
          from:bullet.position,to,player:before.player,
          rawDamage:Math.max(1,Math.round(spec.weapon.projectile.damage)),
          damageType:spec.weapon.bulletType||spec.archetype.damageType,
          priority:spec.elite?'elite':'normal',visual:bullet.plan.visual,
          vitals:{hp,shieldHp}},hitsDeps);
        if(impact.hit){
          hp=impact.hpAfter;shieldHp=impact.shieldAfter;
          incomingHits.push({tick,shotId:bullet.id,enemyId:bullet.enemyId,
            hpAfter:hp,shieldAfter:shieldHp});
          oldHitIds.add(bullet.id);
          if(incomingHits.length>MAX_HITS)throw new TypeError('Incoming ledger cap');
          continue; // consumed on impact
        }
      }
      hostileActive.push({...bullet,position:to,velocity:{...p.velocity}});
    }
    hostileActive.push(...hostileNew);
    if(hostileActive.length>MAX_HOSTILE)throw new TypeError('Hostile QA bullet cap');

    const deadIds=new Set(deaths.map(x=>x.id));
    const released=actors.filter(e=>deadIds.has(e.id)&&e.slotLease).length;
    const canceled=pending.filter(p=>deadIds.has(p.enemyId)).length;
    actors=actors.filter(e=>!deadIds.has(e.id));
    pending=pending.filter(p=>!deadIds.has(p.enemyId));
    const suppressed=before.suppressedFrames+
      Array.from(deadIds).filter(id=>recipe.ranged.some(x=>x.entry.id===id&&
        x.dueTick<tick)).length;
    if(new Set(actors.map(e=>e.id)).size!==actors.length||
      new Set(actors.map(e=>e.slotLease?.slotId)).size!==actors.length||
      roster.filter(e=>e.dead).length!==deaths.length||
      actors.some(e=>byHp.get(e.id)?.dead)||
      pending.some(x=>deadIds.has(x.enemyId))||
      hostileActive.some(b=>deadIds.has(b.enemyId)&&
        b.createdTick>roster.find(e=>e.id===b.enemyId).deathTick))
      throw new TypeError('Unified death/slot/projectile invariants failed');
    const next={...before,tick,roster,actors,deaths,pending,
      hostileBullets:hostileActive,playerShots:survivingPlayer,
      incomingHits,outgoingHits,hp,shieldHp,playerShotsCreated,
      playerShotsConsumed,playerShotsExpired,hostileCreated,hostileExpired,
      volleys,outgoingDamage,canceledPending:before.canceledPending+canceled,
      releasedSlots:before.releasedSlots+released,suppressedFrames:suppressed};
    next.combatDigest=digest('sf-c15-v2c8-tick',{
      previous:before.combatDigest,tick,spawned:spawned.map(x=>x.entry.id),
      actors:actors.map(e=>({id:e.id,position:e.position,
        slot:e.slotLease?.slotId,phase:e.choreography?.phaseId,
        shield:e.entryShield.phase,seq:e.sequence,gate:e.lastFireGate})),
      roster:roster.map(e=>({id:e.id,hp:e.hp,dead:e.dead,deathTick:e.deathTick})),
      deaths:killedThisTick,playerShots:survivingPlayer.map(s=>({
        id:s.id,p:s.position,vx:s.vx,vz:s.vz,remaining:s.remaining,
        hitKeys:s.hitKeys})),
      outgoingHits:outgoingHits.filter(e=>e.tick===tick),
      hostile:hostileActive.map(e=>({id:e.id,from:e.enemyId,
        createdTick:e.createdTick,p:e.position,v:e.velocity})),
      incomingHits:incomingHits.filter(e=>e.tick===tick),pending,
      counters:{hostileCreated,hostileExpired,playerShotsCreated,
        playerShotsConsumed,playerShotsExpired,volleys,outgoingDamage,
        canceled,released},vitals:{hp,shieldHp}});
    return next;
  }
  async function step(args={}){
    if(!exact(args,STEP)||!boundedInt(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C8_INPUT_INVALID',
        'Exact bounded tick request required; no client damage, HP or kills',400);
    requireState(args.state);
    const s=args.state;
    if(args.uid!==s.actor.uid||args.sessionId!==s.actor.sessionId||
      args.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C8_ACTOR_MISMATCH',
        'Cannot transfer candidate replay state',403);
    if(args.ticket?.mac!==s.ticketMac||
      args.ticket?.battleId!==s.battleId||
      args.ticket?.sceneSeed!==s.sceneSeed||
      args.ticket?.spawnPlanDigest!==s.spawnDigest||
      digest('sf-c15-v2c8-ticket',args.ticket)!==s.ticketDigest)
      deny('C15_DUNGEON_V2C8_TICKET_MISMATCH','Signed QA ticket changed',403);
    verifyMovement(s,movementService.inspect(args.movementState));
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C8_TICK_CAP','Six-second QA limit',400);
    const request=digest('sf-c15-v2c8-operation',{
      battleId:s.battleId,tick:s.tick,ticks:args.ticks,
      ticketMac:s.ticketMac,movementDigest:s.movementDigest});
    // Even an idempotent retry requires a still-valid demo admission.
    await verifyTicket(args.ticket,actor(args));
    const prior=used.get(s);
    if(prior){if(prior.request!==request)
      deny('C15_DUNGEON_V2C8_REUSED_STATE','Consumed state fork denied',409);
      return seal({duplicate:true,...prior.outcome});}
    const running=inflight.get(s);
    if(running){if(running.request!==request)
      deny('C15_DUNGEON_V2C8_REUSED_STATE','Concurrent state fork denied',409);
      return seal({duplicate:true,...await running.promise});}
    const promise=(async()=>{
      const recipe=recipeFor(s.sceneSeed);
      if(recipe.spawnDigest!==s.spawnDigest)
        deny('C15_DUNGEON_V2C8_CATALOG_DRIFT','Catalog drift',409);
      let current=s;
      for(let i=0;i<args.ticks;i++)current=advanceTick(current,recipe);
      const state=make(current);
      const outcome=seal({state,report:report(state)});
      used.set(s,{request,outcome});return outcome;
    })();
    inflight.set(s,{request,promise});
    try{return seal({duplicate:false,...await promise});}
    finally{if(inflight.get(s)?.promise===promise)inflight.delete(s);}
  }
  return seal({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,claim:lock,finalize:lock});
}
module.exports=seal({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,MAX_ENEMIES,
  parseC15DungeonUnifiedCombatV2C8Config,createC15DungeonUnifiedCombatV2C8});
