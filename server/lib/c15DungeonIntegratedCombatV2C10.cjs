'use strict';
/**
 * C15 Dungeon V2C.10 -- demo-only, server-read LOADOUT plus relative TOUCH
 * TICK injection into the SAME causal subset combat engine.
 *
 * Derived from the reviewed V2C.8 sandbox, deliberately NOT a production
 * route. The V2C.9 instance reads a demo Firestore Emulator profile, validates
 * HMAC ticket/closed touch trace and owns per-tick poses. This engine consumes
 * those poses and the V2C.9 derived loadout in each AI/player/hostile tick.
 *
 * SUPPORTED QA SUBSET: Taurus ranged enemies; four basic main guns;
 * pilot passives main_damage_boost / movement_speed / wing_fire_rate and armor
 * none or shield. Unsupported equipment MUST fail closed. No real clock,
 * Babylon world-matrix, skill, boss, charger, full dungeon replay or rewards.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonInputLoadoutV2C9Config}=require('./c15DungeonInputLoadoutV2C9.cjs');
const {projectDungeonCandidateMuzzleV2C3}=require('./c15DungeonMultiEnemyTimelineV2C3.cjs');
const {applyCandidateOutgoingHitV2C5}=require('./c15DungeonOutgoingStateV2C5.cjs');
// No V2C.4 fixed-defense candidate preset: incoming damage uses the V2C.9 loadout.

const VERSION='c15-dungeon-integrated-combat-v2c10';
const TICK_HZ=60,MAX_TICKS=360,MAX_BATCH=60,MAX_ENEMIES=12;
const MAX_HOSTILE=96,MAX_PLAYER_SHOTS=96,MAX_PENDING=64;
const MAX_CREATED=1024,MAX_HITS=1024,MAX_DEATHS=12;
const OPEN=['ticket','trace','uid','sessionId','requestId'];
const STEP=['state','ticket','uid','sessionId','requestId','ticks'];
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

function parseC15DungeonIntegratedCombatV2C10Config(env={}){
  if(!plain(env))throw new TypeError('V2C.10 QA environment must be plain');
  if(env.GAME_C15_DUNGEON_V2C10_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C10_QA_APPROVED!=='true')
    throw new TypeError('Explicit V2C.10 QA approval required');
  const previous=parseC15DungeonInputLoadoutV2C9Config(env);
  if(!previous||previous.emulatorOnly!==true||
    typeof previous.projectId!=='string'||!previous.projectId.startsWith('demo-'))
    throw new TypeError('V2C.10 requires all prior demo QA gates');
  return seal({version:VERSION,projectId:previous.projectId,
    allowedUids:[...previous.allowedUids],emulatorOnly:true});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C10_DISABLED','Integrated candidate QA is OFF');
  return seal({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,claim:lock,finalize:lock});
}

async function createC15DungeonIntegratedCombatV2C10({env={},ticketService,inputService,
  encounterModule,combatModule,seedModule,slotsModule,roleModule,tuningModule,
  shieldModule,choreoModule,headingModule,hudModule,fireModule,volleyModule,
  projectileModule,integrityModule,balanceModule,passivesModule,
  weaponsModule,combatMathModule,listingModule}={}){
  const cfg=parseC15DungeonIntegratedCombatV2C10Config(env);
  if(!cfg)return disabled();
  if(!ticketService||ticketService.enabled!==true||
    ticketService.emulatorOnly!==true||ticketService.productionEnabled!==false||
    ticketService.rewardSettlementEnabled!==false||
    typeof ticketService.verifyTicket!=='function'||
    !inputService||inputService.enabled!==true||
    inputService.emulatorOnly!==true||inputService.productionEnabled!==false||
    inputService.rewardSettlementEnabled!==false||
    inputService.cloudRewards!==false||
    typeof inputService.open!=='function'||
    typeof inputService.step!=='function'||
    typeof inputService.inspect!=='function')
    throw new TypeError('V2B.2 ticket and V2C.9 input/loadout DEMO service required');
  const root=path.resolve(__dirname,'../../client/src');
  const load=f=>import(pathToFileURL(path.join(root,f)).href);
  const [encounter,combat,seedMath,slots,role,tuning,shield,choreo,heading,hud,
    fire,volley,projectile,integrity,balance,passives,weapons,combatMath,listing]=await Promise.all([
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
    listingModule||load('constants.js'),
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
  const outgoingDeps={weapons,combatMath};
  const issued=new WeakSet(),used=new WeakMap(),inflight=new WeakMap();
  // Never export V2C.9's private input states to clients or callers.
  const inputStates=new WeakMap();
  const make=(x,input)=>{const s=seal(x);issued.add(s);
    if(input)inputStates.set(s,input);return s;};
  const requireState=s=>{
    if(!plain(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C10_STATE_UNTRUSTED',
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
  const allowedGuns=new Set(['gun_laser','gun_plasma','gun_rail','gun_homing']);
  const allowedPilots=new Set(['main_damage_boost','movement_speed','wing_fire_rate']);
  function verifiedLoadout(report){
    if(!plain(report)||report.serverReadDemoProfileLoadout!==true||
      report.sharedBattleLoadoutMathUsed!==true||
      report.relativeInputTickMappingChecked!==true||
      report.safeForSettlement!==false||report.rewardSettlementEnabled!==false||
      report.cloudRewards!==false||!plain(report.candidateLoadout)||
      typeof report.loadoutDigest!=='string'||
      !/^[a-f0-9]{64}$/.test(report.loadoutDigest)||
      typeof report.profileDigest!=='string'||
      !/^[a-f0-9]{64}$/.test(report.profileDigest)||
      typeof report.traceDigest!=='string'||
      !/^[a-f0-9]{64}$/.test(report.traceDigest))
      deny('C15_DUNGEON_V2C10_LOADOUT_UNTRUSTED',
        'V2C.9 server-read demo loadout proof required',403);
    const l=report.candidateLoadout;
    const gun=listing.GEAR_CATALOG?.mainGun?.find(x=>x.id===l.mainGunId);
    const pilot=listing.PILOTS?.find(x=>x.id===l.pilotId);
    if(!gun||!allowedGuns.has(gun.id)||!pilot||
      !allowedPilots.has(pilot.passive)||
      l.wingmanId!==null||l.droneId!==null||
      !['none','shield'].includes(l.armorPassive)||
      !finite(l.maxHp)||l.maxHp<1||l.maxHp>1e9||
      !finite(l.atk)||l.atk<1||l.atk>100000||
      !finite(l.armor)||l.armor<0||l.armor>10000||
      !finite(l.passiveShieldMax)||l.passiveShieldMax<0||
      l.passiveShieldMax>l.maxHp||
      !finite(l.fireRateMs)||l.fireRateMs<50||l.fireRateMs>60000)
      deny('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT',
        'Only four reviewed main guns / passive subset supported; fail closed',409);
    const pattern=gun.firePattern;
    if(!['single','beam','homing','pierce'].includes(pattern)||
      gun.projectileType==='ion')
      deny('C15_DUNGEON_V2C10_UNSUPPORTED_LOADOUT',
        'Unsupported projectile secondary effect in QA combat',409);
    const weapon={id:gun.id,firePattern:pattern,
      projectileType:gun.projectileType,
      atk:l.atk,fireEveryTicks:Math.max(1,Math.ceil(l.fireRateMs*TICK_HZ/1000)),
      penetration:pattern==='pierce'?3:1};
    return {weapon,loadout:structuredClone(l)};
  }
  function trustedInputReport(r,s,expectedTick,expectedFrames){
    if(!plain(r)||r.battleId!==s.battleId||r.simulatedInputTicks!==expectedTick||
      r.profileDigest!==s.profileDigest||r.loadoutDigest!==s.loadoutDigest||
      r.traceDigest!==s.traceDigest||
      r.safeForSettlement!==false||r.rewardSettlementEnabled!==false||
      r.cloudRewards!==false||
      !Array.isArray(r.lastBatch)||r.lastBatch.length!==expectedFrames||
      !r.lastBatch.every((f,i)=>plain(f)&&
        f.tick===s.tick+i+1&&point(f.player)&&typeof f.changed==='boolean')||
      !point(r.candidatePlayerPosition)||
      r.lastBatch.at(-1).player.x!==r.candidatePlayerPosition.x||
      r.lastBatch.at(-1).player.z!==r.candidatePlayerPosition.z)
      deny('C15_DUNGEON_V2C10_INPUT_DRIFT',
        'V2C.9 issued per-tick positions or profile proof changed',409);
    return r.lastBatch;
  }
  function projectIntegratedIncoming({from,to,player,rawDamage,damageType,
    priority,visual,hp,shieldHp,loadout}){
    const radius=balance.resolveDungeonHostileHitRadiusV426({
      dungeonId:'dung_taurus',priority,
      baseRadius:integrity.resolveDungeonHostileProjectileHitRadiusV392({
        priority,visual})});
    if(!finite(radius)||radius<.5||radius>2)
      throw new TypeError('Integrated hit radius invalid');
    if(!integrity.logicalSegmentCircleHitV392(from,to,player,radius))
      return {hit:false,hpAfter:hp,shieldAfter:shieldHp};
    const incoming=balance.resolveDungeonIncomingDamageV426({
      dungeonId:'dung_taurus',source:'projectile',rawDamage,
      damageType,priority,passiveShieldHp:shieldHp});
    const stats={maxHp:loadout.maxHp,hp,armor:loadout.armor,
      armorCap:.9,dodgeRate:0,dmgReduce:0,reflectRate:0,
      novaExplosionDamage:0};
    const runtime={shieldHp,nextNovaMs:Infinity,nextEchoMs:Infinity};
    const battle=passives.receiveBattleHit(stats,runtime,incoming.damage,{
      source:'projectile',nowMs:0,rng:()=>1});
    if(battle.dodged||battle.reflected||battle.novaDamage)
      throw new TypeError('Unreviewed defensive passive triggered');
    runtime.shieldHp-=Math.min(runtime.shieldHp,
      Math.max(0,incoming.extraShieldDamage));
    return {hit:true,hpAfter:stats.hp,shieldAfter:runtime.shieldHp};
  }
  const verifyTicket=async(ticket,a)=>{
    const proof=await ticketService.verifyTicket(ticket,a);
    if(proof?.serverAdmissionVerified!==true||
      proof?.serverSceneSeedBound!==true||proof?.battleId!==ticket.battleId||
      proof?.sceneSeed!==ticket.sceneSeed||
      proof?.spawnPlanDigest!==ticket.spawnPlanDigest||
      proof?.safeForSettlement!==false||
      proof?.rewardSettlementEnabled!==false||proof?.cloudRewards!==false)
      deny('C15_DUNGEON_V2C10_TICKET_INVALID','Signed demo ticket not verified',403);
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
      serverReadMainGunId:s.weapon.id,
      serverReadLoadoutDigest:s.loadoutDigest,
      serverReadProfileDigest:s.profileDigest,
      acceptedTouchTraceDigest:s.traceDigest,
      playerPositionFrozenAtOpen:false,
      inputPositionsAppliedPerTick:true,
      serverReadLoadoutAppliedToWeaponAndVitals:true,
      candidatePlayerPosition:{...s.player},
      supportedMainGunSubsetOnly:true,
      excludedWingDroneAndComplexPassives:true,
      independentlyVerifiedFullDungeonCombat:false,
      liveGameplayAiParityVerified:false,liveBabylonMuzzleVerified:false,
      playerTouchPerTickVerified:false,relativeInputTickMappingApplied:true,
      actualAccountLoadoutVerified:false,
      actualDeviceProvenanceVerified:false,chargerBossHazardsVerified:false,
      dungeonVictoryVerified:false,independentReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  };
  async function open(args={}){
    if(!exact(args,OPEN))
      deny('C15_DUNGEON_V2C10_INPUT_INVALID',
        'Exact ticket, accepted touch trace and actor required',400);
    if(!cfg.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C10_ACTOR_INVALID','QA UID not allowed',403);
    const a=actor(args);
    const trusted=await verifyTicket(args.ticket,a);
    const inputOpened=await inputService.open({ticket:args.ticket,
      trace:args.trace,...a});
    const inputReport=inputOpened?.report;
    if(inputReport?.battleId!==trusted.battleId||
      inputReport?.simulatedInputTicks!==0||
      !point(inputReport?.candidatePlayerPosition)||
      inputReport.candidatePlayerPosition.x!==0||
      inputReport.candidatePlayerPosition.z!==12.5)
      deny('C15_DUNGEON_V2C10_INPUT_INVALID',
        'V2C.9 initial demo input proof does not match battle',403);
    const {weapon,loadout}=verifiedLoadout(inputReport);
    const recipe=recipeFor(trusted.sceneSeed);
    if(recipe.spawnDigest!==trusted.spawnPlanDigest)
      deny('C15_DUNGEON_V2C10_CATALOG_DRIFT','Signed spawn catalog changed',409);
    const roster=recipe.ranged.map(({entry,spec})=>({id:entry.id,
      roleId:spec.roleId,hp:spec.hp,maxHp:spec.hp,dead:false,deathTick:null}));
    const s=make({version:VERSION,tick:0,actor:a,battleId:trusted.battleId,
      sceneSeed:trusted.sceneSeed,spawnDigest:trusted.spawnPlanDigest,
      ticketMac:args.ticket.mac,
      ticketDigest:digest('sf-c15-v2c10-ticket',args.ticket),
      traceDigest:inputReport.traceDigest,
      inputDigest:inputReport.inputDigest,
      profileDigest:inputReport.profileDigest,
      loadoutDigest:inputReport.loadoutDigest,
      loadout,weapon,player:{x:0,z:12.5},
      roster,actors:[],deaths:[],pending:[],hostileBullets:[],playerShots:[],
      outgoingHits:[],incomingHits:[],
      hp:loadout.maxHp,shieldHp:loadout.passiveShieldMax,
      playerShotsCreated:0,playerShotsConsumed:0,playerShotsExpired:0,
      hostileCreated:0,hostileExpired:0,volleys:0,outgoingDamage:0,
      canceledPending:0,releasedSlots:0,suppressedFrames:0,
      combatDigest:digest('sf-c15-v2c10-init',{
        battleId:trusted.battleId,sceneSeed:trusted.sceneSeed,
        spawnDigest:trusted.spawnPlanDigest,
        ticketMac:args.ticket.mac,traceDigest:inputReport.traceDigest,
        inputDigest:inputReport.inputDigest,
        profileDigest:inputReport.profileDigest,
        loadoutDigest:inputReport.loadoutDigest,roster,weapon,loadout})},
      inputOpened.state);
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
    return {id:digest('sf-c15-v2c10-hostile',{enemyId:e.id,tick,serial}),
      enemyId:e.id,createdTick:tick,position:{x:origin.x,z:origin.z},
      velocity:{...plan.velocity},plan};
  };
  function advanceTick(before,recipe,frame){
    const tick=before.tick+1,nowMs=tick*1000/TICK_HZ;
    if(frame?.tick!==tick||!point(frame.player))
      throw new TypeError('Issued V2C.9 input frame missing');
    const player={x:frame.player.x,z:frame.player.z};
    const weapon=before.weapon;
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
        roleId:spec.roleId,playerZ:player.z,hudOcclusionLineZ:hudLine,
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
        playerX:player.x,playerZ:player.z,
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
          player,tick,hostileCreated++));
      }
      if(e.lastBlockedPhase!==motion.phaseId){
        e.blockedSinceMs=null;e.lastBlockedPhase=motion.phaseId;
      }
      const decision=fire.resolveDungeonEnemyFireDecisionV399({
        choreography:projected,roleId:e.roleId,seed:e.seed,nowMs,
        blockedSinceMs:e.blockedSinceMs,enemyX:e.position.x,
        enemyZ:e.position.z,playerX:player.x,playerZ:player.z,
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
            planned.shots.length,player,tick,hostileCreated++));
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
    if(tick%weapon.fireEveryTicks===0){
      const target=weapons.pickWeaponTarget(alive(),player);
      if(target){
        const salvo=weapons.describeMainSalvo(weapon,player,
          weapon.atk,target);
        if(salvo.length!==1||salvo[0].delayMs||salvo[0].splashRadius||salvo[0].slowMs||salvo[0].waveAmplitude)
          throw new TypeError('Shared QA weapon policy drifted');
        for(const x of salvo){
          if(![x.x,x.z,x.vx,x.vz,x.atk].every(finite)||x.atk<=0||
            x.atk>100000||playerShotsCreated>=MAX_CREATED)
            throw new TypeError('Invalid or excessive outgoing salvo');
          shots.push({id:digest('sf-c15-v2c10-player-shot',{
            battleId:before.battleId,tick,serial:playerShotsCreated}),
            targetId:target.id,createdTick:tick,
            position:{x:x.x,z:x.z},vx:x.vx,vz:x.vz,atk:x.atk,
            remaining:x.penetration||1,isHoming:Boolean(x.homing),hitKeys:[]});
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
        isHoming:shot.isHoming,target,_waveAmplitude:0};
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
        target:player,targetVelocity:{x:0,z:0},nowMs,frameScale:1});
      const to={x:bullet.position.x+p.delta.x,z:bullet.position.z+p.delta.z};
      if(!point(to)||!point(p.velocity))throw new TypeError('Invalid hostile motion');
      if(p.expired||to.z>18||to.z< -19||Math.abs(to.x)>12){
        hostileExpired++;continue;
      }
      if(hp>0&&!oldHitIds.has(bullet.id)){
        const impact=projectIntegratedIncoming({
          from:bullet.position,to,player,
          loadout:before.loadout,hp,shieldHp,rawDamage:Math.max(1,Math.round(spec.weapon.projectile.damage)),
          damageType:spec.weapon.bulletType||spec.archetype.damageType,
          priority:spec.elite?'elite':'normal',visual:bullet.plan.visual,
          });
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
    const next={...before,tick,player,roster,actors,deaths,pending,
      hostileBullets:hostileActive,playerShots:survivingPlayer,
      incomingHits,outgoingHits,hp,shieldHp,playerShotsCreated,
      playerShotsConsumed,playerShotsExpired,hostileCreated,hostileExpired,
      volleys,outgoingDamage,canceledPending:before.canceledPending+canceled,
      releasedSlots:before.releasedSlots+released,suppressedFrames:suppressed};
    next.combatDigest=digest('sf-c15-v2c10-tick',{
      previous:before.combatDigest,tick,player,loadoutDigest:before.loadoutDigest,
      inputFrame:frame,spawned:spawned.map(x=>x.entry.id),
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
      deny('C15_DUNGEON_V2C10_INPUT_INVALID',
        'Only exact ticket/actor/ticks; client stats, position and outcome forbidden',400);
    requireState(args.state);
    const s=args.state;
    if(args.uid!==s.actor.uid||args.sessionId!==s.actor.sessionId||
      args.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C10_ACTOR_MISMATCH',
        'Cannot transfer integrated candidate replay state',403);
    if(args.ticket?.mac!==s.ticketMac||
      args.ticket?.battleId!==s.battleId||
      args.ticket?.sceneSeed!==s.sceneSeed||
      args.ticket?.spawnPlanDigest!==s.spawnDigest||
      digest('sf-c15-v2c10-ticket',args.ticket)!==s.ticketDigest)
      deny('C15_DUNGEON_V2C10_TICKET_MISMATCH',
        'Signed QA ticket was changed',403);
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C10_TICK_CAP','Six-second QA cap',400);
    const inputState=inputStates.get(s);
    if(!inputState)
      deny('C15_DUNGEON_V2C10_STATE_UNTRUSTED','Missing private input state',403);
    const request=digest('sf-c15-v2c10-op',{
      battleId:s.battleId,tick:s.tick,ticks:args.ticks,
      ticketDigest:s.ticketDigest,inputDigest:s.inputDigest,
      loadoutDigest:s.loadoutDigest});
    // Even a duplicate must recheck both admission and server-stored equipment.
    await verifyTicket(args.ticket,actor(args));
    const prior=used.get(s);
    if(prior&&prior.request!==request)
      deny('C15_DUNGEON_V2C10_REUSED_STATE','Consumed state fork denied',409);
    const ongoing=inflight.get(s);
    if(ongoing){
      if(ongoing.request!==request)
        deny('C15_DUNGEON_V2C10_REUSED_STATE','Concurrent fork denied',409);
      await inputService.step({state:inputState,ticket:args.ticket,
        ...actor(args),ticks:args.ticks});
      return seal({duplicate:true,...await ongoing.promise});
    }
    const promise=(async()=>{
      const inputOutcome=await inputService.step({state:inputState,
        ticket:args.ticket,...actor(args),ticks:args.ticks});
      const frames=trustedInputReport(inputOutcome?.report,s,
        s.tick+args.ticks,args.ticks);
      if(prior)return prior.outcome;
      const recipe=recipeFor(s.sceneSeed);
      if(recipe.spawnDigest!==s.spawnDigest)
        deny('C15_DUNGEON_V2C10_CATALOG_DRIFT','Catalog drift',409);
      let current=s;
      for(const frame of frames)current=advanceTick(current,recipe,frame);
      current.inputDigest=inputOutcome.report.inputDigest;
      // Combat digest is per-tick only: same trace must match across batch sizes.
      const state=make(current,inputOutcome.state);
      const outcome=seal({state,report:report(state)});
      used.set(s,{request,outcome});return outcome;
    })();
    inflight.set(s,{request,promise});
    try{return seal({duplicate:Boolean(prior),...await promise});}
    finally{if(inflight.get(s)?.promise===promise)inflight.delete(s);}
  }
  return seal({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,claim:lock,finalize:lock});
}
module.exports=seal({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,MAX_ENEMIES,
  parseC15DungeonIntegratedCombatV2C10Config,
  createC15DungeonIntegratedCombatV2C10});
