'use strict';
/**
 * C15 Dungeon V2C.2 - QA-only, six-second *candidate* enemy/volley timeline.
 *
 * The V2C.1 proof service owns ticket/admission, replay-state provenance,
 * session, expiration and server-clock guards. This module invokes that proof
 * on EVERY step, then runs shared Campaign/Dungeon pure choreography, firing
 * gates, volley and projectile functions against an intentionally limited
 * single-enemy scenario. It NEVER certifies the live DungeonScene.
 *
 * Not simulated: other active enemies/slot leases/separation, entry shield,
 * raider opening and first-volley watchdogs, actual wall-clock and frameTime,
 * live Babylon yaw/muzzle matrix, player input position at each tick, combat
 * damage/HP, boss, objective or loot. Enemy and shot positions are CANDIDATES.
 * It must not be used for reward settlement or any production HTTP route.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonCombatTickProofV2C1Config}=require('./c15DungeonCombatTickProofV2C1.cjs');

const VERSION='c15-dungeon-enemy-timeline-v2c2';
const TICK_HZ=60;
const MAX_TICKS=360;
const MAX_BATCH=60;
const MAX_PROJECTILES=16;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const isFiniteNumber=x=>typeof x==='number'&&Number.isFinite(x);
const isInt=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const canonical=x=>Array.isArray(x)?x.map(canonical):isRecord(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,value)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(value)])).digest('hex');
const freezeDeep=x=>{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const child of Object.values(x))freezeDeep(child);
    Object.freeze(x);
  }
  return x;
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const deny=(code,msg,status=423)=>{throw new GameError(code,msg,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Dungeon combat replay and reward settlement not verified');
const stepFields=['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const openFields=['ticket','movementState','uid','sessionId','requestId'];
const exact=(x,fields)=>isRecord(x)&&Object.keys(x).length===fields.length&&
  fields.every(f=>Object.hasOwn(x,f));

function parseC15DungeonEnemyTimelineV2C2Config(env={}){
  if(!isRecord(env))throw new TypeError('V2C.2 config requires plain env');
  if(env.GAME_C15_DUNGEON_V2C2_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C2_QA_APPROVED!=='true')
    throw new TypeError('V2C.2 requires explicit QA approval');
  const prev=parseC15DungeonCombatTickProofV2C1Config(env);
  if(!prev||prev.emulatorOnly!==true||!prev.projectId.startsWith('demo-'))
    throw new TypeError('V2C.2 requires V1-V2C.1 gates and demo Firestore Emulator');
  return freezeDeep({version:VERSION,emulatorOnly:true,
    projectId:prev.projectId,allowedUids:[...prev.allowedUids]});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C2_DISABLED','Dungeon AI timeline QA is OFF');
  return freezeDeep({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,finalize:locked,claim:locked});
}

async function createC15DungeonEnemyTimelineV2C2({env={},combatProofService,
  movementService,encounterModule,combatModule,sharedSeedModule,
  choreographyModule,roleModule,hudModule,fireModule,volleyModule,
  projectileModule}={}){
  const config=parseC15DungeonEnemyTimelineV2C2Config(env);
  if(!config)return disabled();
  if(!combatProofService||combatProofService.enabled!==true||
    combatProofService.emulatorOnly!==true||combatProofService.productionEnabled!==false||
    combatProofService.safeForSettlement!==false||
    combatProofService.rewardSettlementEnabled!==false||
    typeof combatProofService.open!=='function'||
    typeof combatProofService.step!=='function'||
    typeof combatProofService.inspect!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.inspect!=='function')
    throw new TypeError('V2C.2 requires real non-economic V2C.1 + V2B.3 QA instances');
  const root=path.resolve(__dirname,'../../client/src/game');
  const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [encounter,combat,seedMath,choreo,role,hud,fire,volley,projectile]=await Promise.all([
    encounterModule||load('dungeon/DungeonEncounterDirectorV38.js'),
    combatModule||load('dungeon/DungeonCombatAdapterV38.js'),
    sharedSeedModule||load('dungeon/DungeonSeedTouchContractV2B1.js'),
    choreographyModule||load('combat/CampaignCombatChoreographyV29.js'),
    roleModule||load('dungeon/DungeonRoleEngagementV410.js'),
    hudModule||load('dungeon/DungeonHudCatalogV396.js'),
    fireModule||load('dungeon/DungeonFireReliabilityV399.js'),
    volleyModule||load('combat/CampaignEnemyVolleyV34.js'),
    projectileModule||load('combat/CampaignEnemyProjectileV31.js'),
  ]);
  for(const [mod,name] of [[encounter,'buildDungeonRoomSpawnPlanV38'],
    [combat,'resolveDungeonEnemySpecV38'],[combat,'resolveDungeonEnemySpawnPointV38'],
    [combat,'createDungeonEnemyChoreographyStateV38'],
    [seedMath,'dungeonSceneStableSeedV2B1'],
    [choreo,'stepCampaignEnemyChoreographyV29'],
    [role,'resolveDungeonRoleEngagementV410'],
    [role,'applyDungeonRoleEngagementV410'],
    [hud,'resolveDungeonHudOcclusionLineV396'],
    [fire,'resolveDungeonEnemyFireDecisionV399'],
    [fire,'resolveDungeonVolleyReadinessV399'],
    [volley,'createCampaignEnemyVolleyPlanV34'],
    [projectile,'createCampaignEnemyShotPlanV31'],
    [projectile,'advanceCampaignEnemyProjectileV31']]){
    if(typeof mod?.[name]!=='function')throw new TypeError('Reviewed shared helper missing: '+name);
  }
  const issued=new WeakSet(),used=new WeakMap();
  const makeState=o=>{const s=freezeDeep(o);issued.add(s);return s;};
  const requireState=s=>{
    if(!isRecord(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C2_STATE_UNTRUSTED','Instance-issued timeline state required',403);
  };
  const actorOf=a=>({uid:a.uid,sessionId:a.sessionId,requestId:a.requestId});
  const readMovement=s=>{
    const m=movementService.inspect(s);
    if(!isRecord(m)||!isRecord(m.replayedPosition)||
      !isFiniteNumber(m.replayedPosition.x)||!isFiniteNumber(m.replayedPosition.z)||
      !isInt(m.cumulativeEventsVerified,0,256)||
      typeof m.traceDigest!=='string'||!/^[a-f0-9]{64}$/.test(m.traceDigest)||
      m.independentReplayVerified!==false||m.safeForSettlement!==false)
      deny('C15_DUNGEON_V2C2_MOVEMENT_INVALID','Untrusted movement proof',403);
    return m;
  };
  const recipeFor=sceneSeed=>{
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:'dung_taurus',roomIndex:0,seed:sceneSeed});
    if(plan?.room?.id!=='taurus_entry'||!Array.isArray(plan.entries)||
      plan.entries.length===0||plan.entries.length>40)
      throw new TypeError('Taurus entry catalog not reviewed');
    const chosen=plan.entries.map(entry=>({entry,spec:combat.resolveDungeonEnemySpecV38({
      dungeonId:'dung_taurus',room:plan.room,entry})})).find(x=>x.spec?.canShoot&&
      x.spec.weapon?.projectile&&x.spec.roleId!=='charger');
    if(!chosen)throw new TypeError('No ranged candidate in Taurus entry');
    const dueTick=Math.max(1,Math.ceil(chosen.entry.spawnAtMs*TICK_HZ/1000));
    if(!isInt(dueTick,1,MAX_TICKS))
      throw new TypeError('First ranged candidate outside QA time range');
    return {...chosen,dueTick};
  };
  function report(state){
    requireState(state);
    const e=state.enemy;
    return freezeDeep({version:VERSION,battleId:state.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',sceneSeed:state.sceneSeed,
      tickHz:TICK_HZ,simulatedTicks:state.tick,
      candidateEnemyCount:e?1:0,
      candidateEnemyId:e?.id||null,candidateEnemyRole:e?.roleId||null,
      candidateEnemyPosition:e?{...e.position}:null,
      candidateEnemyPhase:e?.choreography?.phaseId||null,
      candidateEnemyFiringWindow:e?.lastFireGate||'not_spawned',
      candidateVolleys:state.volleys,
      candidateProjectileCreated:state.created,
      candidateProjectileExpired:state.expired,
      candidateProjectileActive:state.bullets.length,
      candidateProjectileHit:state.hits,
      timelineDigest:state.traceDigest,
      playerMovementSnapshotFrozenAtOpen:true,
      singleRangedEnemyNoSlotOrSeparation:true,
      actualEnemyAIReplayVerified:false,
      liveMuzzleTransformVerified:false,
      realFiringAndCooldownParityVerified:false,
      actualDeviceProvenanceVerified:false,
      playerMovementTickTimelineVerified:false,
      damagePipelineVerified:false,battleVictoryVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  }
  async function open(args={}){
    if(!exact(args,openFields))
      deny('C15_DUNGEON_V2C2_INPUT_INVALID','Exact ticket/movement/actor required',400);
    // Upstream verifies server admission, signed ticket, seed and instance-issued
    // movement. No user-supplied enemy state, projectile or outcome accepted.
    const upstream=await combatProofService.open(args);
    const trusted=upstream.report;
    const move=readMovement(args.movementState);
    if(trusted?.dungeonId!=='dung_taurus'||trusted?.roomId!=='taurus_entry'||
      !isInt(trusted.sceneSeed,1,4294967295)||trusted?.battleId!==move?.battleId||
      trusted?.sceneSeed!==move.sceneSeed||
      trusted?.independentReplayVerified!==false||
      trusted?.safeForSettlement!==false||trusted?.cloudRewards!==false)
      deny('C15_DUNGEON_V2C2_CONTEXT_INVALID','V2C.1 source context mismatch',403);
    if(!config.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C2_ACTOR_NOT_ALLOWED','QA UID not allowlisted',403);
    const recipe=recipeFor(trusted.sceneSeed);
    const s=makeState({version:VERSION,tick:0,actor:actorOf(args),battleId:trusted.battleId,
      sceneSeed:trusted.sceneSeed,ticketMac:args.ticket.mac,
      movementDigest:move.traceDigest,movementEvents:move.cumulativeEventsVerified,
      player:{x:move.replayedPosition.x,z:move.replayedPosition.z},
      dueTick:recipe.dueTick,enemy:null,bullets:[],
      volleys:0,created:0,expired:0,hits:0,
      upstreamState:upstream.state,traceDigest:digest('sf-c15-dungeon-v2c2-init',{
        battleId:trusted.battleId,seed:trusted.sceneSeed,
        seedTouch:move.traceDigest,spawnEntry:recipe.entry.id})});
    return freezeDeep({state:s,report:report(s)});
  }
  function spawnEnemy(recipe,sceneSeed,tick){
    const {entry,spec}=recipe;
    const origin=combat.resolveDungeonEnemySpawnPointV38({
      laneNorm:spec.laneNorm,index:entry.index,arenaHalfWidth:7,worldHalfHeight:15});
    const seed=seedMath.dungeonSceneStableSeedV2B1(sceneSeed,entry.id);
    return {id:entry.id,roleId:spec.roleId,seed,
      position:{x:origin.x,z:origin.z},
      choreography:combat.createDungeonEnemyChoreographyStateV38(spec,{
        seed,nowMs:tick*1000/TICK_HZ}),
      blockedSinceMs:null,lastShootMs:tick*1000/TICK_HZ-(spec.weapon.cadence?.cooldownMs||0),
      sequence:0,lastFireGate:'spawn',
    };
  }
  function makeBullet(enemy,spec,shotIndex,count,player,tick){
    const p=spec.weapon.projectile;
    // This is NOT a live Babylon transform. The production muzzle is local +Z
    // transformed by the actual mesh world matrix; yaw/3D pose is not known.
    const origin={x:enemy.position.x,z:enemy.position.z+(spec.roleId==='artillery'?1.02:.76),y:0};
    const atMs=tick*1000/TICK_HZ;
    const spread=(shotIndex-(count-1)/2)*.20;
    const plan=projectile.createCampaignEnemyShotPlanV31({origin,
      target:{x:player.x+spread,z:player.z},targetVelocity:{x:0,z:0},
      projectileSpeed:p.speed,aimMode:p.aimMode,leadFactor:p.leadFactor,
      maxLeadMs:p.maxLeadMs,guidanceMs:p.guidanceMs,
      turnRateRadians:p.turnRateRadians,lifetimeMs:p.lifetimeMs,
      sourceRole:spec.roleId,priority:spec.elite?'elite':'normal',
      damageType:spec.weapon.bulletType||spec.archetype.damageType,
      visualId:p.visualId,pattern:spec.weapon.bulletPattern,createdAtMs:atMs});
    return {position:{x:origin.x,z:origin.z},velocity:{...plan.velocity},
      plan,origin,createdTick:tick};
  }
  function simulateTick(prior,recipe,tick,player){
    const nowMs=tick*1000/TICK_HZ;
    let enemy=prior.enemy?structuredClone(prior.enemy):null;
    let bullets=prior.bullets.map(x=>structuredClone(x));
    let volleys=prior.volleys,created=prior.created,expired=prior.expired,hits=prior.hits;
    let spawned=false,volleyNow=false,shotNow=0;
    if(!enemy&&tick===recipe.dueTick){
      enemy=spawnEnemy(recipe,prior.sceneSeed,tick);spawned=true;
    }
    if(enemy){
      const spec=recipe.spec;
      const hudLine=hud.resolveDungeonHudOcclusionLineV396({
        dungeonId:'dung_taurus',worldHalfHeight:15,viewportHeight:852});
      const engagement=role.resolveDungeonRoleEngagementV410({
        roleId:spec.roleId,playerZ:player.z,hudOcclusionLineZ:hudLine,
        worldHalfHeight:15,authoredPreferredRange:spec.preferredRange,
        authoredFireRangeMin:spec.fireRangeMin,authoredFireRangeMax:spec.fireRangeMax});
      const r=choreo.stepCampaignEnemyChoreographyV29(enemy.choreography,{
        nowMs,frameScale:1,baseSpeed:spec.speed,
        enemyX:enemy.position.x,enemyZ:enemy.position.z,
        playerX:player.x,playerZ:player.z,arenaHalfWidth:7,worldHalfHeight:15,
        viewportHeight:852,hudOcclusionLineZ:hudLine,entityScale:spec.elite?1.15:1,
        hpBarOffsetPx:-34,hpBarHeightPx:6,separationX:0,separationZ:0,
        combatSlot:null,fireCooldownMs:spec.weapon.cadence?.cooldownMs||0});
      if(!r.handled)throw new TypeError('Candidate enemy FSM not handled');
      const projected=role.applyDungeonRoleEngagementV410({choreography:r,engagement});
      enemy.position.x=clamp(enemy.position.x+projected.deltaX,-6.65,6.65);
      enemy.position.z+=projected.deltaZ;
      if(!projected.canCrossPlayer&&isFiniteNumber(projected.maxCombatZ))
        enemy.position.z=Math.min(enemy.position.z,projected.maxCombatZ);
      if(![enemy.position.x,enemy.position.z].every(isFiniteNumber))
        throw new TypeError('Non-finite enemy candidate position');
      const f=fire.resolveDungeonEnemyFireDecisionV399({
        choreography:projected,roleId:spec.roleId,seed:enemy.seed,nowMs,
        blockedSinceMs:enemy.blockedSinceMs,
        enemyX:enemy.position.x,enemyZ:enemy.position.z,
        playerX:player.x,playerZ:player.z,
        canShoot:spec.canShoot,hasProjectile:Boolean(spec.weapon.projectile)});
      enemy.blockedSinceMs=f.blockedSinceMs;
      enemy.lastFireGate=f.reason;
      const readiness=fire.resolveDungeonVolleyReadinessV399({
        mayFire:f.mayFire,canShoot:spec.canShoot,
        hasProjectile:Boolean(spec.weapon.projectile),nowMs,
        lastShoot:enemy.lastShootMs,
        shootMs:spec.weapon.cadence?.cooldownMs||0});
      if(readiness.allowed){
        const cadence=spec.weapon.cadence||{};
        const volleyPlan=volley.createCampaignEnemyVolleyPlanV34({
          roleId:spec.roleId,phaseId:projected.phaseId||'attack',
          sequence:enemy.sequence,burstCount:cadence.burstCount||1,
          burstGapMs:cadence.burstGapMs||0,
          projectileDamage:spec.weapon.projectile.damage,createdAtMs:nowMs});
        if(volleyPlan.shots?.[0]?.fireOffsetMs!==0)
          throw new TypeError('Unexpected nonzero first projectile offset');
        // Only first shot is projected: later scheduled bursts depend on
        // window timers, life-cycle and live scene state, which are not modeled.
        bullets.push(makeBullet(enemy,spec,0,volleyPlan.shots.length,player,tick));
        enemy.lastShootMs=nowMs;enemy.sequence++;volleys++;created++;
        volleyNow=true;shotNow=1;
      }
    }
    const active=[];
    for(const bullet of bullets){
      if(bullet.createdTick===tick){active.push(bullet);continue;}
      const p=projectile.advanceCampaignEnemyProjectileV31({
        plan:bullet.plan,position:bullet.position,velocity:bullet.velocity,
        target:player,targetVelocity:{x:0,z:0},nowMs,frameScale:1});
      const point={x:bullet.position.x+p.delta.x,z:bullet.position.z+p.delta.z};
      if(![point.x,point.z,p.velocity.x,p.velocity.z].every(isFiniteNumber))
        throw new TypeError('Non-finite projectile math');
      if(p.expired||point.z>18||point.z< -19||Math.abs(point.x)>12){expired++;continue;}
      active.push({...bullet,position:point,velocity:{...p.velocity}});
    }
    if(active.length>MAX_PROJECTILES)
      deny('C15_DUNGEON_V2C2_PROJECTILE_CAP','QA proof projectile cap exceeded',400);
    const next={...prior,tick,enemy,bullets:active,
      volleys,created,expired,hits};
    next.traceDigest=digest('sf-c15-dungeon-v2c2-tick',{
      prev:prior.traceDigest,tick,spawned,volleyNow,shotNow,
      player,enemy:enemy?{id:enemy.id,pos:enemy.position,
        phase:enemy.choreography.phaseId,fireGate:enemy.lastFireGate,
        sequence:enemy.sequence}:null,
      activeBullets:active.map(b=>({x:b.position.x,z:b.position.z,
        vx:b.velocity.x,vz:b.velocity.z})),
      created,expired});
    return next;
  }
  async function step(args={}){
    if(!exact(args,stepFields)||!isInt(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C2_INPUT_INVALID','Exact bounded tick step required',400);
    requireState(args.state);
    const prior=args.state;
    if(args.uid!==prior.actor.uid||args.sessionId!==prior.actor.sessionId||
       args.requestId!==prior.actor.requestId)
      deny('C15_DUNGEON_V2C2_ACTOR_MISMATCH',
        'Timeline state cannot be transferred between accounts/sessions',403);
    const m=readMovement(args.movementState);
    // Freeze one player pose for this six-second diagnostic. The live scene
    // moves per pointer event; V2B.3 has no server-clock combat tick stamps.
    if(m.traceDigest!==prior.movementDigest||
      m.cumulativeEventsVerified!==prior.movementEvents||
      m.replayedPosition.x!==prior.player.x||m.replayedPosition.z!==prior.player.z)
      deny('C15_DUNGEON_V2C2_TOUCH_TIMELINE_UNALIGNED',
        'Movement snapshots cannot be assigned to combat ticks',409);
    const wanted=digest('sf-c15-dungeon-v2c2-operation',{
      tick:prior.tick,ticks:args.ticks,movementDigest:m.traceDigest,
      ticketMac:args.ticket?.mac});
    const previous=used.get(prior);
    if(previous){
      if(previous.wanted!==wanted)
        deny('C15_DUNGEON_V2C2_REUSED_STATE','Timeline state already consumed',409);
      return freezeDeep({duplicate:true,...previous.outcome});
    }
    if(prior.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C2_TICK_CAP','Timeline preview max 360 ticks',400);
    if(args.ticket?.mac!==prior.ticketMac)
      deny('C15_DUNGEON_V2C2_TICKET_MISMATCH','Ticket changed',403);
    const checked=await combatProofService.step({
      state:prior.upstreamState,ticket:args.ticket,
      movementState:args.movementState,...actorOf(args),ticks:args.ticks});
    if(checked.report?.simulatedTicks!==prior.tick+args.ticks||
      checked.report?.battleId!==prior.battleId||
      checked.report?.sceneSeed!==prior.sceneSeed||
      checked.report?.safeForSettlement!==false)
      deny('C15_DUNGEON_V2C2_UPSTREAM_MISMATCH','Upstream combat proof mismatch',403);
    const recipe=recipeFor(prior.sceneSeed);
    let current=prior;
    for(let tick=prior.tick+1;tick<=prior.tick+args.ticks;tick++)
      current=simulateTick(current,recipe,tick,prior.player);
    const next=makeState({...current,upstreamState:checked.state});
    const outcome=freezeDeep({state:next,report:report(next)});
    used.set(prior,{wanted,outcome});
    return freezeDeep({duplicate:false,...outcome});
  }
  return freezeDeep({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,finalize:locked,claim:locked});
}
module.exports=freezeDeep({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  parseC15DungeonEnemyTimelineV2C2Config,createC15DungeonEnemyTimelineV2C2});
