'use strict';
/**
 * SpaceFighter C15 Dungeon V2C.1 - QA-only combat MATH proof for Taurus entry.
 *
 * This runs a deliberately LIMITED, server-derived projectile fixture at 60Hz.
 * It reuses the shipped encounter, enemy spec, projectile, collision, and damage
 * formula functions. It is NOT an independent replay of DungeonScene: NPC AI,
 * actor movement over time, camera/muzzle poses, firing permissions, invulnerability,
 * shields, and full damage application are NOT simulated. In particular, the
 * shot originates at an authored spawn point, not a live Babylon muzzle.
 *
 * The target is the server-recomputed V2B.3 touch pose, but the timestamp of
 * that client-reported pose is NOT independently authenticated or aligned to a
 * combat tick. No cloud routes, Firestore writes, victory or rewards exist.
 */
const {createHash} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {GameError} = require('./economy.cjs');
const {parseC15DungeonMovementParityV2B3Config} = require('./c15DungeonMovementParityV2B3.cjs');
const {VERSION: TICKET_VERSION} = require('./c15DungeonSeedTouchTicketV2B2.cjs');

const VERSION = 'c15-dungeon-combat-tick-proof-v2c1';
const TICK_HZ = 60;
const MAX_TICKS = 360; // six-second bounded QA preview only
const MAX_TICKS_PER_BATCH = 60;
const MAX_AHEAD_TICKS = 12;
const HEX = /^[a-f0-9]{64}$/;
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const integer = (x,a,b) => Number.isSafeInteger(x) && x >= a && x <= b;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const canonical = x => Array.isArray(x) ? x.map(canonical) : record(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k,canonical(x[k])])) : x;
const digest = (tag,value) => createHash('sha256')
  .update(JSON.stringify([tag,canonical(value)])).digest('hex');
const freeze = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const child of Object.values(x)) freeze(child);
    Object.freeze(x);
  }
  return x;
};
const deny = (code,msg,status=423) => {throw new GameError(code,msg,status);};
const locked = () => deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Dungeon independent combat verification and settlement remain unavailable');
const actorFields = ['uid','sessionId','requestId'];
const stepFields = ['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const exactKeys = (obj,fields) => record(obj) && Object.keys(obj).length === fields.length &&
  fields.every(k => Object.hasOwn(obj,k));

function parseC15DungeonCombatTickProofV2C1Config(env={}) {
  if (!record(env)) throw new TypeError('V2C.1 environment object required');
  if (env.GAME_C15_DUNGEON_V2C1_ENABLED !== 'true') return null;
  if (env.GAME_C15_DUNGEON_V2C1_QA_APPROVED !== 'true')
    throw new TypeError('V2C.1 requires explicit demo-only QA approval');
  const prev = parseC15DungeonMovementParityV2B3Config(env);
  if (!prev || prev.emulatorOnly !== true || !prev.projectId.startsWith('demo-'))
    throw new TypeError('V2C.1 requires enabled V1 through V2B.3 in a demo emulator');
  return freeze({version:VERSION,emulatorOnly:true,
    projectId:prev.projectId,allowedUids:[...prev.allowedUids]});
}

function disabled() {
  const off = () => deny('C15_DUNGEON_V2C1_DISABLED','Dungeon combat math QA is OFF');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,finalize:locked,claim:locked});
}

async function createC15DungeonCombatTickProofV2C1({env={},ticketService,
  movementService,now=Date.now,encounterModule,combatModule,projectileModule,
  integrityModule,balanceModule}={}) {
  const config=parseC15DungeonCombatTickProofV2C1Config(env);
  if (!config) return disabled();
  if (!ticketService || ticketService.enabled!==true || ticketService.emulatorOnly!==true ||
      ticketService.productionEnabled!==false ||
      ticketService.rewardSettlementEnabled!==false ||
      typeof ticketService.verifyTicket!=='function' ||
      !movementService || movementService.enabled!==true ||
      movementService.emulatorOnly!==true || movementService.productionEnabled!==false ||
      movementService.rewardSettlementEnabled!==false ||
      typeof movementService.inspect!=='function')
    throw new TypeError('V2C.1 requires active non-economic V2B.2 and V2B.3 services');
  if (typeof now!=='function') throw new TypeError('Server clock required');
  const root=path.resolve(__dirname,'../../client/src/game');
  const clientImport=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [encounter,combat,projectile,integrity,balance] = await Promise.all([
    encounterModule||clientImport('dungeon/DungeonEncounterDirectorV38.js'),
    combatModule||clientImport('dungeon/DungeonCombatAdapterV38.js'),
    projectileModule||clientImport('combat/CampaignEnemyProjectileV31.js'),
    integrityModule||clientImport('dungeon/DungeonCombatIntegrityV392.js'),
    balanceModule||clientImport('dungeon/DungeonBalanceV426.js'),
  ]);
  for(const [module,name] of [[encounter,'buildDungeonRoomSpawnPlanV38'],
      [combat,'resolveDungeonEnemySpecV38'],[combat,'resolveDungeonEnemySpawnPointV38'],
      [projectile,'createCampaignEnemyShotPlanV31'],
      [projectile,'advanceCampaignEnemyProjectileV31'],
      [integrity,'logicalSegmentCircleHitV392'],
      [integrity,'resolveDungeonHostileProjectileHitRadiusV392'],
      [balance,'resolveDungeonHostileHitRadiusV426'],
      [balance,'resolveDungeonIncomingDamageV426']]) {
    if (typeof module?.[name]!=='function')
      throw new TypeError('Reviewed Dungeon combat dependency unavailable: '+name);
  }
  const issued = new WeakSet();
  const used = new WeakMap();
  const makeState = values => {const state=freeze(values);issued.add(state);return state;};
  const requireState = state => {
    if (!record(state) || !issued.has(state))
      deny('C15_DUNGEON_V2C1_STATE_UNTRUSTED','Instance-issued state required',403);
  };
  const actorOf = input => ({uid:input.uid,sessionId:input.sessionId,
    requestId:input.requestId});
  const verified = async (ticket,actor) => {
    if (!record(ticket) || ticket.version!==TICKET_VERSION ||
      ticket.dungeonId!=='dung_taurus' || ticket.roomId!=='taurus_entry' ||
      ticket.qaOnly!==true || ticket.emulatorOnly!==true ||
      ticket.safeForSettlement!==false || ticket.rewardSettlementEnabled!==false ||
      ticket.cloudRewards!==false || !HEX.test(ticket.mac||'') ||
      !record(actor) || !config.allowedUids.includes(actor.uid))
      deny('C15_DUNGEON_V2C1_CONTEXT_INVALID','Approved local QA actor/ticket required',403);
    const trusted=await ticketService.verifyTicket(ticket,actor);
    if (!record(trusted) || trusted.battleId!==ticket.battleId ||
      trusted.sceneSeed!==ticket.sceneSeed || trusted.spawnPlanDigest!==ticket.spawnPlanDigest ||
      trusted.serverAdmissionVerified!==true || trusted.serverSceneSeedBound!==true ||
      trusted.independentReplayVerified!==false ||
      trusted.safeForSettlement!==false || trusted.cloudRewards!==false)
      deny('C15_DUNGEON_V2C1_TICKET_UNTRUSTED','Ticket verification failed',403);
    return trusted;
  };
  const checkedMovement = (movementState,trusted) => {
    // This inspect belongs to the *actual* V2B.3 instance and rejects cloned states.
    const view=movementService.inspect(movementState);
    if (!record(view) || view.battleId!==trusted.battleId ||
        view.sceneSeed!==trusted.sceneSeed ||
        view.spawnPlanDigest!==trusted.spawnPlanDigest ||
        view.ticketBoundToServerAdmission!==true ||
        view.spawnPlanDigestBound!==true ||
        !integer(view.cumulativeEventsVerified,0,256) ||
        !HEX.test(view.traceDigest||'') || !record(view.replayedPosition) ||
        !finite(view.replayedPosition.x) || !finite(view.replayedPosition.z) ||
        view.independentReplayVerified!==false || view.safeForSettlement!==false ||
        view.rewardSettlementEnabled!==false || view.cloudRewards!==false)
      deny('C15_DUNGEON_V2C1_MOVEMENT_INVALID','V2B.3 issued movement proof required',403);
    return view;
  };
  const planFor = trusted => {
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:'dung_taurus',roomIndex:0,seed:trusted.sceneSeed});
    if (plan?.dungeonId!=='dung_taurus' || plan?.room?.id!=='taurus_entry' ||
      !Array.isArray(plan.entries) || plan.entries.length<1 || plan.entries.length>40)
      throw new TypeError('Taurus entry spawn catalog no longer approved');
    const spawnDigest=digest('sf-c15-dungeon-v2b2-spawns',plan.entries.map(e=>({
      id:e.id,roleId:e.roleId,laneNorm:e.laneNorm,
      spawnAtMs:e.spawnAtMs,threatCost:e.threatCost})));
    if (spawnDigest!==trusted.spawnPlanDigest)
      deny('C15_DUNGEON_V2C1_SPAWN_MISMATCH','Server spawn catalog drift',409);
    const candidates=plan.entries.map(e=>{
      if (!integer(e.index,0,40) || !finite(e.spawnAtMs) || e.spawnAtMs<0)
        throw new TypeError('Malformed enemy schedule');
      return freeze({...e,dueTick:Math.max(1,Math.ceil(e.spawnAtMs*TICK_HZ/1000))});
    });
    const ranged=candidates.map(e=>({entry:e,spec:combat.resolveDungeonEnemySpecV38({
      dungeonId:'dung_taurus',room:plan.room,entry:e})})).find(row=>
      row.spec?.canShoot===true && row.spec?.weapon?.projectile);
    if (!ranged) throw new TypeError('No ranged Taurus entry enemy for QA fixture');
    const fireAtTick=Math.max(1,ranged.entry.dueTick+2);
    if (fireAtTick>MAX_TICKS) throw new TypeError('QA fixture fire tick out of bound');
    return {plan,candidates,ranged,fireAtTick};
  };
  const shotFrom = (recipe,pose,atTick) => {
    const {entry,spec}=recipe.ranged;
    const origin=combat.resolveDungeonEnemySpawnPointV38({
      laneNorm:entry.laneNorm,index:entry.index,arenaHalfWidth:7,worldHalfHeight:15});
    if (!record(origin) || !finite(origin.x) || !finite(origin.z))
      throw new TypeError('Reviewed enemy spawn point unavailable');
    const p=spec.weapon.projectile;
    const atMs=atTick*1000/TICK_HZ;
    const priority=spec.elite?'elite':'normal';
    const plan=projectile.createCampaignEnemyShotPlanV31({
      origin:{x:origin.x,z:origin.z,y:0},target:pose,
      targetVelocity:{x:0,z:0},projectileSpeed:p.speed,
      aimMode:p.aimMode,leadFactor:p.leadFactor,maxLeadMs:p.maxLeadMs,
      guidanceMs:p.guidanceMs,turnRateRadians:p.turnRateRadians,
      lifetimeMs:p.lifetimeMs,sourceRole:spec.roleId,priority,
      damageType:spec.weapon.bulletType||spec.archetype.damageType,
      visualId:p.visualId,pattern:spec.weapon.bulletPattern,createdAtMs:atMs});
    const radius=balance.resolveDungeonHostileHitRadiusV426({
      dungeonId:'dung_taurus',priority,
      baseRadius:integrity.resolveDungeonHostileProjectileHitRadiusV392({
        priority,visual:plan.visual})});
    const rawDamage=Math.max(1,Math.round(p.damage));
    return freeze({roleId:spec.roleId,enemyId:entry.id,
      plan,position:{x:origin.x,z:origin.z},velocity:{...plan.velocity},
      radius,rawDamage,damageType:plan.damageType,priority});
  };
  const report = state => {
    requireState(state);
    return freeze({version:VERSION,battleId:state.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',
      sceneSeed:state.sceneSeed,tickHz:TICK_HZ,simulatedTicks:state.tick,
      spawnCandidatesDue:state.spawnDue,
      candidateProjectileCreated:state.shotCount,
      candidateProjectileHit:state.hitCount,
      candidateProjectileExpired:state.expireCount,
      candidateRawDamage:state.rawDamage,
      candidateScaledDamage:state.scaledDamage,
      traceDigest:state.traceDigest,
      inputTouchEventCount:state.movementEvents,
      fixtureOriginIsEnemySpawnNotLiveMuzzle:true,
      projectileMathSharedWithDungeonScene:true,
      collisionMathSharedWithDungeonScene:true,
      incomingDamageFormulaShared:true,
      actualEnemyAIReplayVerified:false,
      firingCadenceVerified:false,
      liveMuzzleTransformVerified:false,
      playerMovementTickTimelineVerified:false,
      actualDeviceProvenanceVerified:false,
      fullCombatDamagePipelineVerified:false,
      battleVictoryVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  };
  async function open(args={}) {
    if (!exactKeys(args,['ticket','movementState',...actorFields]))
      deny('C15_DUNGEON_V2C1_INPUT_INVALID','Exact open QA input required',400);
    const actor=actorOf(args);
    const trusted=await verified(args.ticket,actor);
    const movement=checkedMovement(args.movementState,trusted);
    const recipe=planFor(trusted);
    const time=now();
    if (!integer(time,1,Number.MAX_SAFE_INTEGER) ||
      time>=args.ticket.expiresAtMs)
      deny('C15_DUNGEON_V2C1_CLOCK_INVALID','Server QA time invalid',403);
    const initial=digest('sf-c15-dungeon-v2c1-init',{
      battleId:trusted.battleId,seed:trusted.sceneSeed,
      plan:trusted.spawnPlanDigest,ticketMac:args.ticket.mac});
    const state=makeState({version:VERSION,battleId:trusted.battleId,
      ticketMac:args.ticket.mac,sceneSeed:trusted.sceneSeed,
      spawnPlanDigest:trusted.spawnPlanDigest,
      tick:0,openedAtMs:time,spawnCursor:0,spawnDue:0,
      shotCount:0,hitCount:0,expireCount:0,shot:null,
      rawDamage:0,scaledDamage:0,traceDigest:initial,
      movementEvents:movement.cumulativeEventsVerified,
      movementDigest:movement.traceDigest});
    return freeze({state,report:report(state)});
  }
  async function step(args={}) {
    if (!exactKeys(args,stepFields) || !integer(args.ticks,1,MAX_TICKS_PER_BATCH))
      deny('C15_DUNGEON_V2C1_INPUT_INVALID','Only bounded tick count accepted',400);
    requireState(args.state);
    const actor=actorOf(args),trusted=await verified(args.ticket,actor);
    const prior=args.state;
    if (trusted.battleId!==prior.battleId ||
      trusted.sceneSeed!==prior.sceneSeed ||
      trusted.spawnPlanDigest!==prior.spawnPlanDigest ||
      args.ticket.mac!==prior.ticketMac)
      deny('C15_DUNGEON_V2C1_SESSION_MISMATCH','Ticket or seed changed',409);
    const movement=checkedMovement(args.movementState,trusted);
    if (movement.cumulativeEventsVerified<prior.movementEvents ||
      (movement.cumulativeEventsVerified===prior.movementEvents &&
       movement.traceDigest!==prior.movementDigest))
      deny('C15_DUNGEON_V2C1_MOVEMENT_ROLLBACK','Movement trace rollback',409);
    const wanted=digest('sf-c15-dungeon-v2c1-operation',{
      tick:prior.tick,ticks:args.ticks,moveCount:movement.cumulativeEventsVerified,
      moveDigest:movement.traceDigest,position:movement.replayedPosition});
    const previous=used.get(prior);
    if (previous) {
      if (previous.wanted!==wanted)
        deny('C15_DUNGEON_V2C1_REUSED_STATE','Replay state used for another operation',409);
      return freeze({duplicate:true,...previous.outcome});
    }
    if (prior.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C1_TICK_CAP','Combat math preview tick cap exceeded',400);
    const time=now();
    if (!integer(time,prior.openedAtMs,Number.MAX_SAFE_INTEGER) ||
      time>=args.ticket.expiresAtMs ||
      prior.tick+args.ticks > Math.floor((time-prior.openedAtMs)*TICK_HZ/1000)+MAX_AHEAD_TICKS)
      deny('C15_DUNGEON_V2C1_FAST_FORWARD','Server time restricts simulated ticks',409);
    const recipe=planFor(trusted);
    const pose={...movement.replayedPosition};
    let shot=prior.shot,spawnCursor=prior.spawnCursor;
    let spawnDue=prior.spawnDue,shotCount=prior.shotCount;
    let hitCount=prior.hitCount,expireCount=prior.expireCount;
    let rawDamage=prior.rawDamage,scaledDamage=prior.scaledDamage;
    let traceDigest=prior.traceDigest;
    for (let tick=prior.tick+1;tick<=prior.tick+args.ticks;tick++) {
      const nowMs=tick*1000/TICK_HZ;
      const due=[];
      // These are catalog-due SPAWN CANDIDATES, not real live Director spawns.
      // The live Director also checks enemy cap, deaths and room objectives.
      while (spawnCursor<recipe.candidates.length &&
        recipe.candidates[spawnCursor].dueTick<=tick) {
        due.push(recipe.candidates[spawnCursor].id);
        spawnCursor++;
        spawnDue++;
      }
      let fired=false,hit=false,expired=false;
      if (tick===recipe.fireAtTick) {
        shot=shotFrom(recipe,pose,tick);
        shotCount++;
        fired=true;
      }
      if (shot && !fired) {
        const advanced=projectile.advanceCampaignEnemyProjectileV31({
          plan:shot.plan,position:shot.position,velocity:shot.velocity,
          target:pose,targetVelocity:{x:0,z:0},
          nowMs,frameScale:1});
        const next={x:shot.position.x+advanced.delta.x,
          z:shot.position.z+advanced.delta.z};
        if (![next.x,next.z,advanced.velocity.x,advanced.velocity.z].every(finite))
          throw new TypeError('Nonfinite projectile simulation');
        if (integrity.logicalSegmentCircleHitV392(shot.position,next,pose,shot.radius)) {
          const damage=balance.resolveDungeonIncomingDamageV426({
            dungeonId:'dung_taurus',rawDamage:shot.rawDamage,
            source:'projectile',damageType:shot.damageType,priority:shot.priority,
            passiveShieldHp:0});
          if (!finite(damage.damage) || damage.damage<0)
            throw new TypeError('Nonfinite projectile damage');
          hit=true;hitCount++;rawDamage+=shot.rawDamage;
          scaledDamage+=damage.damage;shot=null;
        } else if (advanced.expired || next.z>18 || next.z< -19 ||
          Math.abs(next.x)>12) {
          expired=true;expireCount++;shot=null;
        } else {
          shot=freeze({...shot,position:next,velocity:{...advanced.velocity}});
        }
      }
      traceDigest=digest('sf-c15-dungeon-v2c1-tick',{
        prior:traceDigest,tick,due,fired,hit,expired,
        bullet:shot?{position:shot.position,velocity:shot.velocity}:null,
        target:pose,hitCount,rawDamage,scaledDamage});
    }
    const state=makeState({...prior,tick:prior.tick+args.ticks,
      shot,spawnCursor,spawnDue,shotCount,hitCount,expireCount,
      rawDamage,scaledDamage,traceDigest,
      movementEvents:movement.cumulativeEventsVerified,
      movementDigest:movement.traceDigest});
    const outcome=freeze({state,report:report(state)});
    used.set(prior,{wanted,outcome});
    return freeze({duplicate:false,...outcome});
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,finalize:locked,claim:locked});
}
module.exports=freeze({VERSION,TICK_HZ,MAX_TICKS,MAX_TICKS_PER_BATCH,
  parseC15DungeonCombatTickProofV2C1Config,createC15DungeonCombatTickProofV2C1});
