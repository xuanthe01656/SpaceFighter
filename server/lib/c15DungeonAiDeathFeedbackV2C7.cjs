'use strict';
/**
 * SpaceFighter C15 V2C.7: non-economic, demo-emulator-only DEATH-AWARE QA FSM.
 *
 * This is a separate candidate AI branch. V2C.6's SERVER-ISSUED HP/death
 * history is used to suppress dead actors on their next frame. The branch
 * re-runs reviewed slot, separation, choreography, fire/volley, projectile,
 * collision, balance and BattlePassives helpers. It recomputes candidate
 * incoming defense from its OWN hostile bullets. It NEVER modifies V2C.3/4/5/6
 * upstream state; V2C.5 outgoing deaths still depend on that old upstream.
 * It is not authoritative full combat replay, live Babylon parity or rewards.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonLifecycleIntegrationV2C6Config}=require('./c15DungeonLifecycleIntegrationV2C6.cjs');
const {projectDungeonCandidateMuzzleV2C3}=require('./c15DungeonMultiEnemyTimelineV2C3.cjs');
const {QA_DEFENSE_FIXTURE,projectCandidateHitV2C4}=require('./c15DungeonDamageStateV2C4.cjs');

const VERSION='c15-dungeon-ai-death-feedback-v2c7';
const TICK_HZ=60,MAX_TICKS=360,MAX_BATCH=60,MAX_ENEMIES=12;
const MAX_BULLETS=96,MAX_PENDING=64,MAX_SHOTS=1024,MAX_HITS=1024;
const OPEN=['ticket','movementState','uid','sessionId','requestId'];
const STEP=['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,f)=>plain(x)&&Object.keys(x).length===f.length&&f.every(k=>Object.hasOwn(x,k));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const point=x=>plain(x)&&finite(x.x)&&finite(x.z)&&Math.abs(x.x)<=100&&Math.abs(x.z)<=100;
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,x)=>createHash('sha256').update(JSON.stringify([tag,canonical(x)])).digest('hex');
const frozen=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  for(const v of Object.values(x))frozen(v);Object.freeze(x);
}return x;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const deny=(code,message,status=423)=>{throw new GameError(code,message,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Full combat replay and reward settlement are not verified');
const actor=x=>({uid:x.uid,sessionId:x.sessionId,requestId:x.requestId});

function parseC15DungeonAiDeathFeedbackV2C7Config(env={}){
  if(!plain(env))throw new TypeError('V2C.7 requires a plain QA config');
  if(env.GAME_C15_DUNGEON_V2C7_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C7_QA_APPROVED!=='true')
    throw new TypeError('Explicit V2C.7 QA approval required');
  const previous=parseC15DungeonLifecycleIntegrationV2C6Config(env);
  if(!previous||previous.emulatorOnly!==true||!previous.projectId.startsWith('demo-'))
    throw new TypeError('V2C.7 requires V1-V2C.6 demo-only QA gates');
  return frozen({version:VERSION,emulatorOnly:true,projectId:previous.projectId,
    allowedUids:[...previous.allowedUids]});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C7_DISABLED','Death-feedback candidate QA OFF');
  return frozen({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,claim:locked,finalize:locked});
}

async function createC15DungeonAiDeathFeedbackV2C7({env={},lifecycleService,
  movementService,encounterModule,combatModule,seedModule,slotsModule,
  roleModule,tuningModule,shieldModule,choreoModule,headingModule,hudModule,
  fireModule,volleyModule,projectileModule,integrityModule,balanceModule,
  passivesModule,gateModule}={}){
  const cfg=parseC15DungeonAiDeathFeedbackV2C7Config(env);
  if(!cfg)return disabled();
  if(!lifecycleService||lifecycleService.enabled!==true||
    lifecycleService.emulatorOnly!==true||lifecycleService.productionEnabled!==false||
    lifecycleService.safeForSettlement!==false||
    lifecycleService.rewardSettlementEnabled!==false||lifecycleService.cloudRewards!==false||
    typeof lifecycleService.open!=='function'||typeof lifecycleService.step!=='function'||
    typeof lifecycleService.inspect!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.inspect!=='function')
    throw new TypeError('Server V2C.6 and V2B.3 demo QA services required');
  const root=path.resolve(__dirname,'../../client/src/game');
  const load=f=>import(pathToFileURL(path.join(root,f)).href);
  const [encounter,combat,seedMath,slots,role,tuning,shield,choreo,heading,hud,
    fire,volley,projectile,integrity,balance,passives,gate]=await Promise.all([
    encounterModule||load('dungeon/DungeonEncounterDirectorV38.js'),
    combatModule||load('dungeon/DungeonCombatAdapterV38.js'),
    seedModule||load('dungeon/DungeonSeedTouchContractV2B1.js'),
    slotsModule||load('combat/CampaignEnemyCombatSlotsV37.js'),
    roleModule||load('dungeon/DungeonRoleEngagementV410.js'),
    tuningModule||load('dungeon/DungeonProductionTuningV398.js'),
    shieldModule||load('dungeon/DungeonEnemyEntryShieldV422.js'),
    choreoModule||load('combat/CampaignCombatChoreographyV29.js'),
    headingModule||load('assets/EnemyVisualHeadingV26A4.js'),
    hudModule||load('dungeon/DungeonHudCatalogV396.js'),
    fireModule||load('dungeon/DungeonFireReliabilityV399.js'),
    volleyModule||load('combat/CampaignEnemyVolleyV34.js'),
    projectileModule||load('combat/CampaignEnemyProjectileV31.js'),
    integrityModule||load('dungeon/DungeonCombatIntegrityV392.js'),
    balanceModule||load('dungeon/DungeonBalanceV426.js'),
    passivesModule||load('combat/BattlePassives.js'),
    gateModule||load('combat/PlayerDamagePipelineV25.js'),
  ]);
  for(const [mod,name] of [
    [encounter,'buildDungeonRoomSpawnPlanV38'],[combat,'resolveDungeonEnemySpecV38'],
    [combat,'createDungeonCombatSlotDescriptorV38'],
    [seedMath,'dungeonSceneStableSeedV2B1'],
    [slots,'createCampaignEnemyCombatSlotRegistryV37'],
    [slots,'syncCampaignEnemyCombatSlotsV37'],[slots,'getCampaignEnemyCombatSlotV37'],
    [role,'resolveDungeonRoleEngagementV410'],[role,'projectDungeonCombatSlotV410'],
    [role,'applyDungeonRoleEngagementV410'],[tuning,'resolveDungeonCombatSlotV398'],
    [tuning,'resolveDungeonEnemySeparationV398'],
    [shield,'isDungeonEnemyEntryActiveV422'],[shield,'advanceDungeonEnemyEntryShieldV422'],
    [choreo,'stepCampaignEnemyChoreographyV29'],[heading,'resolveEnemyGameplayYawV26A4'],
    [hud,'resolveDungeonHudOcclusionLineV396'],
    [fire,'resolveDungeonEnemyFireDecisionV399'],[fire,'resolveDungeonVolleyReadinessV399'],
    [volley,'createCampaignEnemyVolleyPlanV34'],
    [projectile,'createCampaignEnemyShotPlanV31'],
    [projectile,'advanceCampaignEnemyProjectileV31'],
    [integrity,'logicalSegmentCircleHitV392'],
    [balance,'resolveDungeonIncomingDamageV426'],
    [passives,'receiveBattleHit'],[gate,'createPlayerDamageGateV25'],
  ])if(typeof mod?.[name]!=='function')throw new TypeError('Reviewed helper missing: '+name);
  const dmgHelpers={integrity,balance,passives};
  const issued=new WeakSet(),used=new WeakMap(),inflight=new WeakMap();
  const make=x=>{const state=frozen(x);issued.add(state);return state;};
  const requireIssued=s=>{if(!plain(s)||!issued.has(s))deny('C15_DUNGEON_V2C7_STATE_UNTRUSTED',
    'Instance-issued candidate state required',403);};
  const recipeFor=seed=>{
    const plan=encounter.buildDungeonRoomSpawnPlanV38({dungeonId:'dung_taurus',roomIndex:0,seed});
    if(plan?.room?.id!=='taurus_entry'||!Array.isArray(plan.entries)||plan.entries.length>40)
      throw new TypeError('Unreviewed Taurus entry catalog');
    const roster=plan.entries.map(entry=>({entry,spec:combat.resolveDungeonEnemySpecV38({
      dungeonId:'dung_taurus',room:plan.room,entry})})).filter(x=>
      x.spec?.canShoot&&x.spec.weapon?.projectile&&x.spec.roleId!=='charger');
    if(roster.length<1||roster.length>MAX_ENEMIES||
      new Set(roster.map(x=>x.entry.id)).size!==roster.length)
      throw new TypeError('Unreviewed Taurus ranged roster');
    return new Map(roster.map(x=>[x.entry.id,x.spec]));
  };
  const report=s=>{
    requireIssued(s);
    return frozen({version:VERSION,battleId:s.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',sceneSeed:s.sceneSeed,
      tickHz:TICK_HZ,simulatedTicks:s.tick,
      candidateActiveEnemies:s.actors.length,candidateDead:s.deaths.length,
      deathFeedbackEvents:s.deaths.map(x=>({...x})),
      activeActorIds:s.actors.map(e=>e.id),
      candidateSlotIds:s.actors.map(e=>e.slotLease?.slotId||null),
      candidatePendingBursts:s.pending.length,
      candidateHostileBullets:s.bullets.length,
      candidateVolleys:s.volleys,candidateProjectileCreated:s.created,
      candidateProjectileExpired:s.expired,
      candidateSuppressedAiFrames:s.suppressedFrames,
      candidateCanceledPendingBurstCount:s.canceledPending,
      candidateReleasedSlotCount:s.releasedSlots,
      candidateIncomingHits:s.incomingHits.length,
      candidatePlayerHp:s.hp,candidatePlayerShieldHp:s.shieldHp,
      originalUpstreamPlayerHp:s.originalIncomingHp,
      originalUpstreamPlayerShieldHp:s.originalIncomingShieldHp,
      originalUpstreamGhostEnemyFrames:s.originalGhostFrames,
      correctedCandidateDigest:s.feedbackDigest,
      upstreamLifecycleDigest:s.upstreamDigest,
      candidateFsmReceivesDeathFeedback:true,
      candidatePendingBurstCanceledAfterDeath:true,
      candidateIncomingDamageRecomputed:true,
      actualUpstreamV2C3Mutated:false,
      actualUpstreamEnemyAiDeathFeedbackVerified:false,
      originalOutgoingDeathLedgerStillUsesOldTimeline:true,
      independentClosedLoopCombatReplayVerified:false,
      actualAccountLoadoutVerified:false,
      playerTouchPerTickVerified:false,
      liveBabylonMuzzleVerified:false,deviceProvenanceVerified:false,
      bossesAndHazardsVerified:false,battleVictoryVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  };
  const validateMovement=(s,m)=>{
    if(m?.battleId!==s.battleId||m?.sceneSeed!==s.sceneSeed||
      m?.traceDigest!==s.movementDigest||
      m?.replayedPosition?.x!==s.player.x||m?.replayedPosition?.z!==s.player.z)
      deny('C15_DUNGEON_V2C7_MOVEMENT_MISMATCH','Frozen QA input changed',409);
  };
  async function open(args={}){
    if(!exact(args,OPEN))deny('C15_DUNGEON_V2C7_INPUT_INVALID','Exact admission input required',400);
    if(!cfg.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C7_ACTOR_NOT_ALLOWED','UID not in demo QA allowlist',403);
    const u=await lifecycleService.open(args);
    const s=u?.state,r=u?.report,m=movementService.inspect(args.movementState);
    const c3=s?.outgoingState?.upstreamState?.upstreamState;
    if(!plain(s)||!plain(c3)||s.tick!==0||c3.tick!==0||
      r?.simulatedTicks!==0||r?.safeForSettlement!==false||
      r?.actualUpstreamEnemyAiDespawnVerified!==false||
      r?.upstreamOutgoingDigest!==s.upstreamDigest||
      s?.ticketMac!==args.ticket?.mac||s?.battleId!==args.ticket?.battleId||
      s?.sceneSeed!==args.ticket?.sceneSeed||s.actor?.uid!==args.uid||
      s.actor?.sessionId!==args.sessionId||s.actor?.requestId!==args.requestId||
      !point(s.player)||s.roster.length>MAX_ENEMIES)
      deny('C15_DUNGEON_V2C7_UPSTREAM_INVALID','Verified lifecycle admission required',403);
    recipeFor(s.sceneSeed);
    const state=make({version:VERSION,tick:0,actor:actor(args),
      ticketMac:s.ticketMac,battleId:s.battleId,sceneSeed:s.sceneSeed,
      movementDigest:s.movementDigest,player:{...s.player},
      lifecycleState:s,upstreamDigest:s.lifecycleDigest,
      seenIds:[],actors:[],bullets:[],pending:[],deaths:[],
      hp:QA_DEFENSE_FIXTURE.maxHp,shieldHp:QA_DEFENSE_FIXTURE.passiveShieldMax,
      incomingHits:[],volleys:0,created:0,expired:0,
      suppressedFrames:0,canceledPending:0,releasedSlots:0,
      originalGhostFrames:0,originalIncomingHp:s.outgoingState.upstreamState.hp,
      originalIncomingShieldHp:s.outgoingState.upstreamState.shieldHp,
      feedbackDigest:digest('sf-c15-v2c7-init',{
        battleId:s.battleId,seed:s.sceneSeed,ticketMac:s.ticketMac,
        movementDigest:s.movementDigest,lifecycleDigest:s.lifecycleDigest})});
    validateMovement(state,m);
    return frozen({state,report:report(state)});
  }
  const makeShot=(e,spec,index,count,player,tick)=>{
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
    if(!point(plan.velocity))throw new TypeError('Invalid QA bullet velocity');
    return {enemyId:e.id,createdTick:tick,
      position:{x:origin.x,z:origin.z},velocity:{...plan.velocity},plan};
  };
  function tickCandidate(before,life,recipe){
    const tick=before.tick+1,nowMs=tick*1000/TICK_HZ;
    const c3=life.outgoingState.upstreamState.upstreamState;
    const c4=life.outgoingState.upstreamState;
    if(life.tick!==tick||c3.tick!==tick||c4.tick!==tick||
      !Array.isArray(c3.enemies)||!Array.isArray(life.deaths)||
      !Array.isArray(life.roster)||life.ticketMac!==before.ticketMac||
      life.movementDigest!==before.movementDigest||
      life.battleId!==before.battleId||life.sceneSeed!==before.sceneSeed||
      !/^[a-f0-9]{64}$/.test(life.lifecycleDigest)||
      life.outgoingState.upstreamDigest!==c4.damageDigest||
      c4.upstreamDigest!==c3.traceDigest)
      throw new TypeError('Invalid instance-issued V2C.6 tick linkage');
    const oldDead=new Map(before.deaths.map(x=>[x.id,x.tick]));
    const killed=life.deaths.filter(x=>!oldDead.has(x.id));
    if(killed.some(x=>x.tick!==tick||!recipe.has(x.id)||
      !life.roster.some(e=>e.id===x.id&&e.dead&&e.deathTick===tick))||
      life.deaths.length!==before.deaths.length+killed.length)
      throw new TypeError('Unjustified candidate death event');
    const known=new Set(before.seenIds);
    const spawned=[];
    for(const e of c3.enemies){
      if(!plain(e)||!recipe.has(e.id)||!point(e.position)||!plain(e.entryShield))
        throw new TypeError('Candidate enemy outside approved catalog');
      if(!known.has(e.id)){
        if(oldDead.has(e.id))throw new TypeError('Dead candidate respawned');
        spawned.push(structuredClone(e));known.add(e.id);
      }
    }
    let actors=before.actors.map(x=>structuredClone(x)).concat(spawned);
    if(actors.length>MAX_ENEMIES||new Set(actors.map(x=>x.id)).size!==actors.length)
      throw new TypeError('Candidate FSM duplicate/overflow');
    const registry=slots.createCampaignEnemyCombatSlotRegistryV37();
    registry.generation=tick-1;
    for(const e of actors)if(e.slotLease)registry.assignments.set(e.id,e.slotLease);
    const desc=actors.map(e=>combat.createDungeonCombatSlotDescriptorV38({
      runtimeId:e.id,seed:e.seed,spec:recipe.get(e.id)}));
    slots.syncCampaignEnemyCombatSlotsV37(registry,desc,{nowMs});
    for(const e of actors){
      e.slotLease=slots.getCampaignEnemyCombatSlotV37(registry,e.id);
      if(!e.slotLease)throw new TypeError('Active enemy missing combat slot');
    }
    let pending=before.pending.map(x=>({...x}));
    let bullets=before.bullets.map(x=>structuredClone(x));
    let volleys=before.volleys,created=before.created,expired=before.expired;
    const createdNow=[];
    const newIds=new Set(spawned.map(e=>e.id));
    const neighbors=actors.map(e=>({runtimeId:e.id,mesh:{position:{...e.position}}}));
    const hudLine=hud.resolveDungeonHudOcclusionLineV396({
      dungeonId:'dung_taurus',worldHalfHeight:15,viewportHeight:852});
    for(const e of actors){
      if(newIds.has(e.id))continue; // Spawn tick pose is taken from verified V2C.3 state.
      const spec=recipe.get(e.id),start={...e.position};
      const engagement=role.resolveDungeonRoleEngagementV410({
        roleId:spec.roleId,playerZ:before.player.z,hudOcclusionLineZ:hudLine,
        worldHalfHeight:15,authoredPreferredRange:spec.preferredRange,
        authoredFireRangeMin:spec.fireRangeMin,authoredFireRangeMax:spec.fireRangeMax});
      const expanded=tuning.resolveDungeonCombatSlotV398({
        slot:e.slotLease,seed:e.seed,roleId:e.roleId,difficultyRank:1});
      const slot=role.projectDungeonCombatSlotV410({slot:expanded,engagement});
      const separation=tuning.resolveDungeonEnemySeparationV398({
        enemyX:start.x,enemyZ:start.z,neighbors,enemyId:e.id,
        minSpacing:slot?.minSpacing||1.95,seed:e.seed,frameScale:1});
      const move=choreo.stepCampaignEnemyChoreographyV29(e.choreography,{
        nowMs,frameScale:1,baseSpeed:spec.speed,
        enemyX:start.x,enemyZ:start.z,playerX:before.player.x,playerZ:before.player.z,
        arenaHalfWidth:7,worldHalfHeight:15,viewportHeight:852,
        hudOcclusionLineZ:hudLine,entityScale:spec.elite?1.15:1,
        hpBarOffsetPx:-34,hpBarHeightPx:6,
        separationX:separation.steeringX,separationZ:separation.steeringZ,
        combatSlot:slot,fireCooldownMs:spec.weapon.cadence?.cooldownMs||0});
      if(move?.handled!==true)throw new TypeError('QA FSM did not handle candidate');
      const projected=role.applyDungeonRoleEngagementV410({choreography:move,engagement});
      e.position.x=clamp(start.x+projected.deltaX+separation.correctionX,-6.65,6.65);
      e.position.z=start.z+projected.deltaZ+separation.correctionZ;
      if(!projected.canCrossPlayer&&finite(projected.maxCombatZ)&&
        e.position.z>projected.maxCombatZ){
        e.position.z=projected.maxCombatZ;
        e.choreography.velocityZ=Math.min(0,e.choreography.velocityZ||0);
      }
      if(!point(e.position))throw new TypeError('Invalid QA candidate movement');
      e.yawRadians=heading.resolveEnemyGameplayYawV26A4({
        currentYaw:e.yawRadians,velocityX:e.position.x-start.x,
        velocityZ:e.position.z-start.z,maxTurnRadians:7/60});
      for(const task of pending)if(task.enemyId===e.id&&task.dueTick<=tick)
        createdNow.push(makeShot(e,spec,task.shotIndex,task.burstCount,before.player,tick));
      if(e.lastBlockedPhase!==move.phaseId){
        e.blockedSinceMs=null;e.lastBlockedPhase=move.phaseId;
      }
      const decision=fire.resolveDungeonEnemyFireDecisionV399({
        choreography:projected,roleId:e.roleId,seed:e.seed,nowMs,
        blockedSinceMs:e.blockedSinceMs,enemyX:e.position.x,
        enemyZ:e.position.z,playerX:before.player.x,playerZ:before.player.z,
        canShoot:spec.canShoot,hasProjectile:Boolean(spec.weapon.projectile)});
      e.blockedSinceMs=decision.blockedSinceMs;e.lastFireGate=decision.reason;
      if(shield.isDungeonEnemyEntryActiveV422(e.entryShield)){
        const readiness=fire.resolveDungeonVolleyReadinessV399({
          mayFire:decision.mayFire,canShoot:spec.canShoot,
          hasProjectile:Boolean(spec.weapon.projectile),nowMs,
          lastShoot:e.lastShootMs,shootMs:spec.weapon.cadence?.cooldownMs||0});
        if(readiness.allowed){
          const cadence=spec.weapon.cadence||{};
          const volleyPlan=volley.createCampaignEnemyVolleyPlanV34({
            roleId:e.roleId,phaseId:projected.phaseId||'attack',
            sequence:e.sequence,burstCount:cadence.burstCount||1,
            burstGapMs:cadence.burstGapMs||0,
            projectileDamage:spec.weapon.projectile.damage,createdAtMs:nowMs});
          if(!volleyPlan.shots?.length||volleyPlan.shots[0].fireOffsetMs!==0)
            throw new TypeError('Invalid shared volley');
          createdNow.push(makeShot(e,spec,volleyPlan.shots[0].index,
            volleyPlan.shots.length,before.player,tick));
          for(const shot of volleyPlan.shots.slice(1))pending.push({
            enemyId:e.id,shotIndex:shot.index,burstCount:volleyPlan.shots.length,
            dueTick:Math.max(tick+1,Math.ceil((nowMs+shot.fireOffsetMs)*TICK_HZ/1000))});
          e.lastShootMs=nowMs;e.sequence++;volleys++;
          e.lastFireGate='projectile_created';
        }
      }else e.lastFireGate='entry_shield';
      shield.advanceDungeonEnemyEntryShieldV422(e.entryShield,{nowMs,
        enemyZ:e.position.z,hudOcclusionLineZ:hudLine});
    }
    pending=pending.filter(x=>x.dueTick>tick);
    bullets.push(...createdNow);created+=createdNow.length;
    if(created>MAX_SHOTS||pending.length>MAX_PENDING)
      throw new TypeError('QA shot/pending capacity exceeded');
    const active=[];
    for(const bullet of bullets){
      if(bullet.createdTick===tick){active.push(bullet);continue;}
      const p=projectile.advanceCampaignEnemyProjectileV31({
        plan:bullet.plan,position:bullet.position,velocity:bullet.velocity,
        target:before.player,targetVelocity:{x:0,z:0},nowMs,frameScale:1});
      const position={x:bullet.position.x+p.delta.x,z:bullet.position.z+p.delta.z};
      if(!point(position)||!point(p.velocity))throw new TypeError('Invalid projected bullet');
      if(p.expired||position.z>18||position.z< -19||Math.abs(position.x)>12){expired++;continue;}
      active.push({...bullet,position,velocity:{...p.velocity}});
    }
    if(active.length>MAX_BULLETS)throw new TypeError('QA projectile capacity exceeded');
    // Recompute candidate incoming damage from the OWN death-aware stream.
    // Match V2C.4's one-tick swept-collision convention: before.bullets -> tick.
    let hp=before.hp,shieldHp=before.shieldHp;
    const incomingHits=before.incomingHits.map(x=>({...x}));
    const hitIds=new Set(incomingHits.map(x=>x.id));
    const gateState=gate.createPlayerDamageGateV25();
    for(const hit of incomingHits)gateState.admitHit({source:'projectile',
      hitId:hit.id,nowMs:hit.atMs});
    for(const bullet of before.bullets){
      if(hp<=0)break;
      const id=digest('sf-c15-v2c4-shot',{enemyId:bullet.enemyId,
        createdTick:bullet.createdTick,plan:bullet.plan});
      if(hitIds.has(id))continue;
      const spec=recipe.get(bullet.enemyId);
      if(!spec)throw new TypeError('Unknown source for QA bullet');
      const motion=projectile.advanceCampaignEnemyProjectileV31({
        plan:bullet.plan,position:bullet.position,velocity:bullet.velocity,
        target:before.player,targetVelocity:{x:0,z:0},nowMs,frameScale:1});
      const from=bullet.position;
      const to={x:from.x+motion.delta.x,z:from.z+motion.delta.z};
      const impact=projectCandidateHitV2C4({from,to,player:before.player,
        rawDamage:Math.max(1,Math.round(spec.weapon.projectile.damage)),
        damageType:spec.weapon.bulletType||spec.archetype.damageType,
        priority:spec.elite?'elite':'normal',visual:bullet.plan.visual,
        vitals:{hp,shieldHp}},dmgHelpers);
      if(!impact.hit)continue;
      const g=gateState.admitHit({source:'projectile',hitId:id,nowMs});
      if(!g.accepted)continue;
      hp=impact.hpAfter;shieldHp=impact.shieldAfter;hitIds.add(id);
      incomingHits.push({id,enemyId:bullet.enemyId,tick,atMs:nowMs,
        hpAfter:hp,shieldAfter:shieldHp});
      if(incomingHits.length>MAX_HITS)throw new TypeError('Incoming QA history overflow');
    }
    let released=0,canceled=0;
    const deadNow=new Set(killed.map(x=>x.id));
    const deadIds=new Set(life.deaths.map(x=>x.id));
    for(const e of actors)if(deadNow.has(e.id)&&e.slotLease)released++;
    for(const p of pending)if(deadIds.has(p.enemyId))canceled++;
    actors=actors.filter(e=>!deadIds.has(e.id));
    pending=pending.filter(p=>!deadIds.has(p.enemyId));
    // Explicitly release death leases and resync the remaining live roster.
    const liveRegistry=slots.createCampaignEnemyCombatSlotRegistryV37();
    liveRegistry.generation=tick;
    for(const e of actors)if(e.slotLease)liveRegistry.assignments.set(e.id,e.slotLease);
    slots.syncCampaignEnemyCombatSlotsV37(liveRegistry,actors.map(e=>
      combat.createDungeonCombatSlotDescriptorV38({runtimeId:e.id,
        seed:e.seed,spec:recipe.get(e.id)})),{nowMs});
    for(const e of actors)e.slotLease=slots.getCampaignEnemyCombatSlotV37(liveRegistry,e.id);
    if(new Set(actors.map(e=>e.slotLease?.slotId)).size!==actors.length)
      throw new TypeError('Duplicate live candidate combat slots');
    const skipped=life.roster.filter(x=>x.dead&&x.deathTick<tick&&
      c3.enemies.some(e=>e.id===x.id)).length;
    const next={...before,tick,lifecycleState:life,upstreamDigest:life.lifecycleDigest,
      seenIds:[...known],actors,bullets:active,pending,deaths:life.deaths.map(x=>({...x})),
      hp,shieldHp,incomingHits,volleys,created,expired,
      suppressedFrames:before.suppressedFrames+skipped,
      releasedSlots:before.releasedSlots+released,
      canceledPending:before.canceledPending+canceled,
      originalGhostFrames:life.ghostFrames,
      originalIncomingHp:c4.hp,originalIncomingShieldHp:c4.shieldHp};
    next.feedbackDigest=digest('sf-c15-v2c7-tick',{
      previous:before.feedbackDigest,tick,
      lifecycle:life.lifecycleDigest,
      actors:actors.map(e=>({id:e.id,p:e.position,slot:e.slotLease?.slotId,
        phase:e.choreography?.phaseId,yaw:e.yawRadians,seq:e.sequence})),
      deaths:next.deaths,
      bullets:active.map(b=>({enemyId:b.enemyId,createdTick:b.createdTick,
        position:b.position,velocity:b.velocity})),
      pending,volleyCount:volleys,created,expired,
      counters:{released,canceled,skipped},
      vitals:{hp,shieldHp,hitCount:incomingHits.length}});
    return next;
  }
  async function step(args={}){
    if(!exact(args,STEP)||!integer(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C7_INPUT_INVALID','Exact bounded candidate request required',400);
    requireIssued(args.state);
    const s=args.state;
    if(args.uid!==s.actor.uid||args.sessionId!==s.actor.sessionId||
      args.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C7_ACTOR_MISMATCH','Cannot transfer candidate state',403);
    if(args.ticket?.mac!==s.ticketMac||args.ticket?.battleId!==s.battleId||
      args.ticket?.sceneSeed!==s.sceneSeed)
      deny('C15_DUNGEON_V2C7_TICKET_MISMATCH','Signed ticket changed',403);
    validateMovement(s,movementService.inspect(args.movementState));
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C7_TICK_CAP','Six-second QA tick cap',400);
    const request=digest('sf-c15-v2c7-operation',{battleId:s.battleId,
      tick:s.tick,ticks:args.ticks,ticketMac:s.ticketMac,
      movementDigest:s.movementDigest});
    const prior=used.get(s);
    if(prior){if(prior.request!==request)
      deny('C15_DUNGEON_V2C7_REUSED_STATE','Consumed state fork denied',409);
      return frozen({duplicate:true,...prior.outcome});}
    const running=inflight.get(s);
    if(running){if(running.request!==request)
      deny('C15_DUNGEON_V2C7_REUSED_STATE','Concurrent fork denied',409);
      return frozen({duplicate:true,...await running.promise});}
    const promise=(async()=>{
      const recipe=recipeFor(s.sceneSeed);
      let current=s;
      for(let i=0;i<args.ticks;i++){
        const u=await lifecycleService.step({state:current.lifecycleState,
          ticket:args.ticket,movementState:args.movementState,...actor(args),ticks:1});
        if(u?.report?.simulatedTicks!==current.tick+1||
          u.report.lifecycleDigest!==u.state?.lifecycleDigest||
          u.report.safeForSettlement!==false||
          u.report.actualUpstreamEnemyAiDespawnVerified!==false)
          deny('C15_DUNGEON_V2C7_UPSTREAM_MISMATCH','Invalid candidate death provenance',403);
        current=tickCandidate(current,u.state,recipe);
      }
      const state=make(current),outcome=frozen({state,report:report(state)});
      used.set(s,{request,outcome});return outcome;
    })();
    inflight.set(s,{request,promise});
    try{return frozen({duplicate:false,...await promise});}
    finally{if(inflight.get(s)?.promise===promise)inflight.delete(s);}
  }
  return frozen({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,claim:locked,finalize:locked});
}
module.exports=frozen({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  parseC15DungeonAiDeathFeedbackV2C7Config,
  createC15DungeonAiDeathFeedbackV2C7});
