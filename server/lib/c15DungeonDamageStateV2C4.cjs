'use strict';
/**
 * C15 Dungeon V2C.4 - strictly non-economic, emulator-only DAMAGE CANDIDATE.
 *
 * Replays V2C.3's instance-issued candidate timeline one 60-Hz tick at a time,
 * sweeps its HOSTILE bullets against the FROZEN V2B.3 player pose, then runs
 * the actual shared V3.9.2 collision, V4.2.6 balance, V2.5 hit gate and
 * BattlePassives math on an IMMUTABLE SERVER-OWNED QA DEFENSE PRESET.
 *
 * Not a live replay: no input-to-tick timestamps, true Babylon mesh/world
 * muzzle, timer/FPS match, manual SHIP skill, actual account gear, outgoing
 * player shots, enemy HP/deaths, charger, hazard, boss, outcome or rewards.
 * A pass is ONLY a fixture math proof, never sufficient for settlement.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonMultiEnemyTimelineV2C3Config}=require('./c15DungeonMultiEnemyTimelineV2C3.cjs');

const VERSION='c15-dungeon-damage-state-v2c4';
const TICK_HZ=60,MAX_TICKS=360,MAX_BATCH=60,MAX_HITS=1024;
const OPEN=['ticket','movementState','uid','sessionId','requestId'];
const STEP=['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>record(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=(tag,value)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(value)])).digest('hex');
const freeze=x=>{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const item of Object.values(x))freeze(item);
    Object.freeze(x);
  }
  return x;
};
const deny=(code,msg,status=423)=>{throw new GameError(code,msg,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Actual combat, loss/victory and reward settlement are not verified');
const actor=a=>({uid:a.uid,sessionId:a.sessionId,requestId:a.requestId});
const FIXTURE=freeze({id:'taurus-fixed-defenses-v2c4-qa-not-account-loadout',
  maxHp:1200,armor:25,armorCap:.75,dmgReduce:.05,
  passiveShieldMax:240,dodgeRate:0,reflectRate:0,
  reflectProjectilesOnly:false,novaExplosionDamage:0,armorPassive:'shield'});

function parseC15DungeonDamageStateV2C4Config(env={}){
  if(!record(env))throw new TypeError('QA environment must be a plain object');
  if(env.GAME_C15_DUNGEON_V2C4_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C4_QA_APPROVED!=='true')
    throw new TypeError('V2C.4 requires explicit QA approval');
  const prev=parseC15DungeonMultiEnemyTimelineV2C3Config(env);
  if(!prev||prev.emulatorOnly!==true||!prev.projectId.startsWith('demo-'))
    throw new TypeError('V2C.4 requires every earlier QA gate and demo Emulator');
  return freeze({version:VERSION,emulatorOnly:true,projectId:prev.projectId,
    allowedUids:[...prev.allowedUids]});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C4_DISABLED','Damage candidate QA is OFF');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,claim:locked,finalize:locked});
}

/** Deterministic proof of the shared collision + damage calculation only.
 * These inputs are SERVER-OWNED fixtures; this method is not an HTTP route.
 */
function projectCandidateHitV2C4({from,to,player,rawDamage,
  damageType='kinetic',priority='normal',visual=null,vitals},
  {integrity,balance,passives}){
  if(![from?.x,from?.z,to?.x,to?.z,player?.x,player?.z,rawDamage]
    .every(finite)||rawDamage<=0||rawDamage>100000||
    Math.abs(player.x)>100||Math.abs(player.z)>100||
    !record(vitals)||!finite(vitals.hp)||!finite(vitals.shieldHp)||
    vitals.hp<0||vitals.hp>FIXTURE.maxHp||vitals.shieldHp<0||
    vitals.shieldHp>FIXTURE.passiveShieldMax)
    throw new TypeError('Bounded server-only QA damage inputs required');
  const baseRadius=integrity.resolveDungeonHostileProjectileHitRadiusV392({
    priority,visual});
  const radius=balance.resolveDungeonHostileHitRadiusV426({
    dungeonId:'dung_taurus',priority,baseRadius});
  if(!finite(radius)||radius<.5||radius>2)throw new TypeError('Invalid shared hit radius');
  if(!integrity.logicalSegmentCircleHitV392(from,to,player,radius))
    return freeze({hit:false,radius,rawDamage,hpAfter:vitals.hp,
      shieldAfter:vitals.shieldHp,appliedHpDamage:0,
      absorbed:0,scaledDamage:0});
  const incoming=balance.resolveDungeonIncomingDamageV426({
    dungeonId:'dung_taurus',source:'projectile',rawDamage,
    damageType,priority,passiveShieldHp:vitals.shieldHp});
  const stats={...FIXTURE,hp:vitals.hp};
  const runtime={shieldHp:vitals.shieldHp,nextNovaMs:Infinity,nextEchoMs:Infinity};
  // A fixed zero-dodge, no-active-skill preset, NOT the player's actual gear.
  const battle=passives.receiveBattleHit(stats,runtime,incoming.damage,{
    source:'projectile',nowMs:0,rng:()=>1});
  if(battle.dodged||battle.reflected||battle.novaDamage||
    ![stats.hp,runtime.shieldHp,battle.absorbed].every(finite))
    throw new TypeError('QA fixed-defense profile unexpectedly invoked a passive');
  const extra=Math.min(runtime.shieldHp,Math.max(0,incoming.extraShieldDamage));
  runtime.shieldHp-=extra;
  return freeze({hit:true,radius,rawDamage,
    scaledDamage:incoming.damage,hpAfter:stats.hp,
    shieldAfter:runtime.shieldHp,appliedHpDamage:vitals.hp-stats.hp,
    absorbed:battle.absorbed+extra});
}

async function createC15DungeonDamageStateV2C4({env={},multiEnemyService,
  movementService,encounterModule,combatModule,projectileModule,
  integrityModule,balanceModule,passivesModule,gateModule}={}){
  const config=parseC15DungeonDamageStateV2C4Config(env);
  if(!config)return disabled();
  if(!multiEnemyService||multiEnemyService.enabled!==true||
    multiEnemyService.emulatorOnly!==true||
    multiEnemyService.productionEnabled!==false||
    multiEnemyService.safeForSettlement!==false||
    multiEnemyService.rewardSettlementEnabled!==false||
    multiEnemyService.cloudRewards!==false||
    typeof multiEnemyService.open!=='function'||
    typeof multiEnemyService.step!=='function'||
    typeof multiEnemyService.inspect!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||
    movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.inspect!=='function')
    throw new TypeError('V2C.4 requires non-economic V2C.3 and V2B.3 QA services');
  const root=path.resolve(__dirname,'../../client/src');
  const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [encounter,combat,projectile,integrity,balance,passives,gateMod]=await Promise.all([
    encounterModule||load('game/dungeon/DungeonEncounterDirectorV38.js'),
    combatModule||load('game/dungeon/DungeonCombatAdapterV38.js'),
    projectileModule||load('game/combat/CampaignEnemyProjectileV31.js'),
    integrityModule||load('game/dungeon/DungeonCombatIntegrityV392.js'),
    balanceModule||load('game/dungeon/DungeonBalanceV426.js'),
    passivesModule||load('game/combat/BattlePassives.js'),
    gateModule||load('game/combat/PlayerDamagePipelineV25.js'),
  ]);
  for(const [module,name] of [
    [encounter,'buildDungeonRoomSpawnPlanV38'],
    [combat,'resolveDungeonEnemySpecV38'],
    [projectile,'advanceCampaignEnemyProjectileV31'],
    [integrity,'logicalSegmentCircleHitV392'],
    [integrity,'resolveDungeonHostileProjectileHitRadiusV392'],
    [balance,'resolveDungeonHostileHitRadiusV426'],
    [balance,'resolveDungeonIncomingDamageV426'],
    [passives,'receiveBattleHit'],
    [gateMod,'createPlayerDamageGateV25'],
  ]) if(typeof module?.[name]!=='function')
    throw new TypeError('Missing reviewed pure damage dependency '+name);
  const modules={integrity,balance,passives};
  const issued=new WeakSet(),used=new WeakMap(),inflight=new WeakMap();
  const makeState=x=>{const s=freeze(x);issued.add(s);return s;};
  const requireState=s=>{
    if(!record(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C4_STATE_UNTRUSTED',
        'Instance-issued server state is required',403);
  };
  const roster=seed=>{
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:'dung_taurus',roomIndex:0,seed});
    if(plan?.room?.id!=='taurus_entry'||!Array.isArray(plan.entries)||
      plan.entries.length<1||plan.entries.length>40)
      throw new TypeError('Taurus room no longer matches the QA fixture');
    const rows=plan.entries.map(entry=>({entry,
      spec:combat.resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',
        room:plan.room,entry})})).filter(x=>x.spec?.canShoot&&
        x.spec?.weapon?.projectile&&x.spec?.roleId!=='charger')
      .map(({entry,spec})=>({enemyId:entry.id,priority:spec.elite?'elite':'normal',
        rawDamage:Math.max(1,Math.round(Number(spec.weapon.projectile.damage))),
        damageType:spec.weapon.bulletType||spec.archetype.damageType,
        roleId:spec.roleId}));
    if(!rows.length||rows.length>12||
      new Set(rows.map(e=>e.enemyId)).size!==rows.length||
      rows.some(e=>!finite(e.rawDamage)||e.rawDamage>100000))
      throw new TypeError('Unsupported candidate damage roster');
    return rows;
  };
  const report=state=>{
    requireState(state);
    return freeze({version:VERSION,battleId:state.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',sceneSeed:state.sceneSeed,
      tickHz:TICK_HZ,simulatedTicks:state.tick,
      serverOwnedQaDefensePreset:FIXTURE.id,
      candidateProjectileSweeps:state.sweeps,
      candidateProjectileHits:state.hits.length,
      candidateRawDamageSum:state.rawDamageSum,
      candidateScaledDamageSum:state.scaledDamageSum,
      candidateHpDamage:state.hpDamage,
      candidateShieldAbsorbed:state.shieldAbsorbed,
      candidatePlayerHp:state.hp,candidatePlayerShieldHp:state.shieldHp,
      candidateHpDepleted:state.hp<=0,
      damageDigest:state.damageDigest,
      upstreamTimelineDigest:state.upstreamDigest,
      playerPositionFrozenAtOpen:true,
      candidateFixedLoadoutOnly:true,
      sharedSweptCollisionMathUsed:true,
      sharedDamageBalanceMathUsed:true,
      sharedBattlePassivesMathUsed:true,
      sharedPlayerHitGateMathUsed:true,
      actualAccountLoadoutVerified:false,
      manualShipSkillVerified:false,actualDeviceProvenanceVerified:false,
      actualPlayerMovementTickParityVerified:false,
      liveMuzzleWorldMatrixVerified:false,
      actualEnemyAndProjectileRuntimeParityVerified:false,
      outgoingDamageAndEnemyHpVerified:false,
      bossAndHazardsVerified:false,
      fullCombatDamagePipelineVerified:false,
      playerDefeatVerified:false,battleVictoryVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  };
  async function open(args={}){
    if(!exact(args,OPEN))
      deny('C15_DUNGEON_V2C4_INPUT_INVALID','Exact ticket/movement/actor required',400);
    if(!config.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C4_ACTOR_NOT_ALLOWED','UID not in demo QA allowlist',403);
    const upstream=await multiEnemyService.open(args);
    const r=upstream?.report;
    const m=movementService.inspect(args.movementState);
    if(r?.battleId!==args.ticket?.battleId||
      r?.sceneSeed!==args.ticket?.sceneSeed||
      r?.simulatedTicks!==0||r?.safeForSettlement!==false||
      r?.playerMovementSnapshotFrozenAtOpen!==true||
      r?.liveMuzzleTransformVerified!==false||
      r?.damagePipelineVerified!==false||
      m?.traceDigest!==upstream.state?.movementDigest||
      m?.battleId!==r.battleId||
      !record(upstream.state.player)||
      !finite(upstream.state.player.x)||!finite(upstream.state.player.z))
      deny('C15_DUNGEON_V2C4_UPSTREAM_UNVERIFIED',
        'V2C.3 instance-issued candidate and V2B.3 movement required',403);
    const rows=roster(r.sceneSeed);
    if(rows.length!==r.rangedCatalogCandidates)
      deny('C15_DUNGEON_V2C4_CATALOG_DRIFT','Roster changed',409);
    const state=makeState({version:VERSION,tick:0,
      actor:actor(args),battleId:r.battleId,sceneSeed:r.sceneSeed,
      ticketMac:args.ticket.mac,movementDigest:m.traceDigest,
      player:{...upstream.state.player},roster:rows,
      upstreamState:upstream.state,upstreamDigest:r.timelineDigest,
      hp:FIXTURE.maxHp,shieldHp:FIXTURE.passiveShieldMax,
      sweeps:0,hits:[],rawDamageSum:0,scaledDamageSum:0,
      hpDamage:0,shieldAbsorbed:0,
      damageDigest:hash('sf-c15-v2c4-init',{battleId:r.battleId,
        seed:r.sceneSeed,movementDigest:m.traceDigest,
        upstreamDigest:r.timelineDigest,fixture:FIXTURE.id})});
    return freeze({state,report:report(state)});
  }
  function nextTick(before,nextUpstream){
    const tick=before.tick+1, nowMs=tick*1000/TICK_HZ;
    const seen=new Set(),hitSet=new Set(before.hits.map(x=>x.id));
    const gate=gateMod.createPlayerDamageGateV25();
    for(const hit of before.hits)gate.admitHit({source:'projectile',
      hitId:hit.id,nowMs:hit.atMs});
    let hp=before.hp,shieldHp=before.shieldHp,sweeps=before.sweeps;
    let rawDamageSum=before.rawDamageSum,
      scaledDamageSum=before.scaledDamageSum,
      hpDamage=before.hpDamage,shieldAbsorbed=before.shieldAbsorbed;
    const hits=before.hits.slice(),tickHits=[];
    const byId=new Map(before.roster.map(x=>[x.enemyId,x]));
    for(const bullet of before.upstreamState.bullets){
      if(!record(bullet)||!record(bullet.plan)||
        !record(bullet.position)||!record(bullet.velocity))
        throw new TypeError('V2C.3 candidate projectile malformed');
      const id=hash('sf-c15-v2c4-shot',{enemyId:bullet.enemyId,
        createdTick:bullet.createdTick,plan:bullet.plan});
      if(seen.has(id))
        deny('C15_DUNGEON_V2C4_DUPLICATE_CANDIDATE_SHOT',
          'Ambiguous duplicate projectile identity',409);
      seen.add(id);
      if(hitSet.has(id)||hp<=0)continue;
      const spec=byId.get(bullet.enemyId);
      if(!spec||!integer(bullet.createdTick,0,tick-1))
        throw new TypeError('Bullet outside signed Taurus candidate roster');
      const motion=projectile.advanceCampaignEnemyProjectileV31({
        plan:bullet.plan,position:bullet.position,velocity:bullet.velocity,
        target:before.player,targetVelocity:{x:0,z:0},nowMs,frameScale:1});
      const from=bullet.position;
      const to={x:from.x+motion.delta.x,z:from.z+motion.delta.z};
      if(![to.x,to.z].every(finite))throw new TypeError('Non-finite candidate projectile');
      sweeps++;
      const impact=projectCandidateHitV2C4({from,to,player:before.player,
        rawDamage:spec.rawDamage,damageType:spec.damageType,
        priority:spec.priority,visual:bullet.plan.visual,
        vitals:{hp,shieldHp}},modules);
      if(!impact.hit)continue;
      const admission=gate.admitHit({source:'projectile',hitId:id,nowMs});
      if(!admission.accepted)continue;
      if(hits.length>=MAX_HITS)
        deny('C15_DUNGEON_V2C4_HIT_CAP','QA damage history exceeded',400);
      hp=impact.hpAfter;shieldHp=impact.shieldAfter;
      rawDamageSum+=impact.rawDamage;
      scaledDamageSum+=impact.scaledDamage;
      hpDamage+=impact.appliedHpDamage;
      shieldAbsorbed+=impact.absorbed;
      const event={id,enemyId:bullet.enemyId,tick,atMs:nowMs,
        rawDamage:impact.rawDamage,scaledDamage:impact.scaledDamage,
        hpAfter:hp,shieldAfter:shieldHp,absorption:impact.absorbed};
      hits.push(event);tickHits.push(event);hitSet.add(id);
    }
    const digest=hash('sf-c15-v2c4-tick',{
      previous:before.damageDigest,tick,
      upstreamDigest:nextUpstream.report.timelineDigest,
      player:before.player,tickHits,
      vitals:{hp,shieldHp},counters:{sweeps,rawDamageSum,
        scaledDamageSum,hpDamage,shieldAbsorbed}});
    return {...before,tick,upstreamState:nextUpstream.state,
      upstreamDigest:nextUpstream.report.timelineDigest,
      hp,shieldHp,sweeps,hits,rawDamageSum,
      scaledDamageSum,hpDamage,shieldAbsorbed,damageDigest:digest};
  }
  async function step(args={}){
    if(!exact(args,STEP)||!integer(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C4_INPUT_INVALID','Exact bounded tick input required',400);
    requireState(args.state);
    const s=args.state;
    if(args.uid!==s.actor.uid||args.sessionId!==s.actor.sessionId||
      args.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C4_ACTOR_MISMATCH','Cannot transfer QA state',403);
    if(args.ticket?.mac!==s.ticketMac)
      deny('C15_DUNGEON_V2C4_TICKET_MISMATCH','Ticket changed',403);
    const m=movementService.inspect(args.movementState);
    if(m?.traceDigest!==s.movementDigest||
      m?.replayedPosition?.x!==s.player.x||
      m?.replayedPosition?.z!==s.player.z)
      deny('C15_DUNGEON_V2C4_TOUCH_TIMELINE_UNALIGNED',
        'Per-tick player movement not independently validated',409);
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C4_TICK_CAP','Six-second QA cap',400);
    const requested=hash('sf-c15-v2c4-op',{battleId:s.battleId,
      tick:s.tick,ticks:args.ticks,ticketMac:s.ticketMac,
      movementDigest:s.movementDigest});
    const consumed=used.get(s);
    if(consumed){
      if(consumed.requested!==requested)
        deny('C15_DUNGEON_V2C4_REUSED_STATE','Fork or rewind denied',409);
      return freeze({duplicate:true,...consumed.outcome});
    }
    const running=inflight.get(s);
    if(running){
      if(running.requested!==requested)
        deny('C15_DUNGEON_V2C4_REUSED_STATE','Concurrent fork denied',409);
      return freeze({duplicate:true,...await running.promise});
    }
    const promise=(async()=>{
      let current=s;
      for(let index=0;index<args.ticks;index++){
        const result=await multiEnemyService.step({state:current.upstreamState,
          ticket:args.ticket,movementState:args.movementState,
          ...actor(args),ticks:1});
        if(result?.report?.simulatedTicks!==current.tick+1||
          result.report.battleId!==s.battleId||
          result.report.sceneSeed!==s.sceneSeed||
          result.report.safeForSettlement!==false||
          result.report.liveMuzzleTransformVerified!==false||
          result.report.damagePipelineVerified!==false)
          deny('C15_DUNGEON_V2C4_UPSTREAM_MISMATCH',
            'Upstream candidate timeline is not trustworthy',403);
        current=nextTick(current,result);
      }
      const next=makeState(current);
      const outcome=freeze({state:next,report:report(next)});
      used.set(s,{requested,outcome});
      return outcome;
    })();
    inflight.set(s,{requested,promise});
    try{return freeze({duplicate:false,...await promise});}
    finally{if(inflight.get(s)?.promise===promise)inflight.delete(s);}
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  QA_DEFENSE_FIXTURE:FIXTURE,
  parseC15DungeonDamageStateV2C4Config,
  projectCandidateHitV2C4,createC15DungeonDamageStateV2C4});
