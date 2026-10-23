'use strict';
/**
 * V8B fast lane: one offline PvE vertical slice: trusted snapshot -> V8B1
 * journal -> C2B firing -> projectiles -> contacts -> enemy HP -> lab phase.
 *
 * NOT A VERIFIED VICTORY OR REWARD AUTHORITY. The encounter is a pinned
 * server-side QA fixture, NOT a client payload or a production wave resolver.
 * The enemy AI/HP, collision timing, touch and live wave pacing have not been
 * proven equivalent to Campaign/Dungeon. P0 must remain fail-closed.
 * No HTTP, Firebase, GameService, economy, tickets or settlement imports.
 */
const {createHash} = require('node:crypto');
const {MAX_BATTLE_TICKS, validateChunk} = require('./combatInputJournalV8.cjs');
const {advancePreviewMovement,FOUNDATION_VERSION} = require('./combatMovementWeaponV8.cjs');
const {openFoundationPreview, replayFoundationChunk} = require('./combatPreviewReplayV8.cjs');
const {ENCOUNTER_C6C_VERSION,ALPHA_POLICY_VERSION,resolveCampaignAlphaStage1C6C} = require('./combatCampaignAlphaC6CV8.cjs');

const SLICE_VERSION = 'pve-lab-vertical-slice-v1';
const ENCOUNTER_VERSION = 'pve-server-encounter-qa-v1';
// C4 extends the SAME C3 engine with an opt-in QA-only threat/boss contract.
// Existing v1 encounters, checkpoints and golden tests remain unchanged.
const SLICE_V2_VERSION = 'pve-lab-vertical-slice-v2';
const ENCOUNTER_V2_VERSION = 'pve-server-encounter-qa-v2';
// C5 opt-in QA rule set: regen/mitigation + moving-body/shot swept contacts.
// The v1/v2 checkpoints and execution order must remain byte-for-byte compatible.
const SLICE_V3_VERSION = 'pve-lab-vertical-slice-v3';
const ENCOUNTER_V3_VERSION = 'pve-server-encounter-qa-v3';
// C6-A opt-in static ballistic salvos. This extension is still QA-only and
// continues C5's defensive/swept behavior. No live mode, ticket or settlement.
const SLICE_V4_VERSION = 'pve-lab-vertical-slice-v4';
const ENCOUNTER_V4_VERSION = 'pve-server-encounter-qa-v4';
const BALLISTIC_POLICY_VERSION = 'v8c6a-ballistic-preview-v2';
const BALLISTIC_PAIRS = Object.freeze({spread3:'laser',spread5:'photon',shotgun:'plasma'});
// C6-B is a SEPARATE, opt-in QA contract: never alter C3/C4/C5/C6-A saves.
const SLICE_V5_VERSION = 'pve-lab-vertical-slice-v5';
const ENCOUNTER_V5_VERSION = 'pve-server-encounter-qa-v5';
const PIERCE_BURST_POLICY_VERSION = 'v8c6b-pierce-burst-preview-v3';
const PIERCE_BURST_PAIRS = Object.freeze({pierce:'rail',burst:'pulse'});
// C6-C is a stage-specific, server-pinned offline QA contract. No Cloud authority.
const SLICE_V6_VERSION = 'pve-lab-vertical-slice-v6';
const MAX_PENDING_BURSTS = 64;
const BURST_DELAY_MS = Object.freeze([90,180]);
const HP_MICRO = 1000000;
const MAX_WAVES = 12;
const MAX_TOTAL_ENEMIES = 128;
const MAX_ACTIVE_ENEMIES = 32;
const MAX_PROJECTILES = 128;
const MAX_ENEMY_PROJECTILES = 128;
const HEX64 = /^[a-f0-9]{64}$/;
const OPEN_KEYS = ['snapshot','policy','journal','encounter'];
const ENCOUNTER_KEYS = ['version','qaOnly','snapshotHash','mode','locationId','waves'];
const ENCOUNTER_V2_KEYS = [...ENCOUNTER_KEYS,'damageCooldownTicks','enemyProjectileRadiusUnits'];
const ENCOUNTER_V6_KEYS = [...ENCOUNTER_V2_KEYS,'campaignPolicyVersion','stageId','interWaveDelayTicks'];
const WAVE_KEYS = ['atTick','enemies'];
const WAVE_V6_KEYS = [...WAVE_KEYS,'firstSpawnDelayTicks','spawnIntervalTicks'];
const ENEMY_KEYS = ['id','kind','behavior','xUnits','zUnits','hp','hitRadiusUnits','moveUnitsPerTick','contactDamage'];
const ENEMY_V2_KEYS = [...ENEMY_KEYS,'shootEveryTicks','shotSpeedUnitsPerTick','shotDamage','shotPattern'];
const RUN_KEYS = ['foundation','encounter','encounterDigest','state'];
const ADVANCE_KEYS = ['run','chunk','receivedAtMs'];
const STATE_KEYS = ['version','qaOnly','safeForCloudBattle','battleId','tick','phase','hp','maxHp',
  'spawnedWaves','kills','contacts','nextProjectileId','enemies','projectiles','traceDigest','stateDigest'];
const ACTIVE_ENEMY_KEYS = [...ENEMY_KEYS];
const ACTIVE_ENEMY_V2_KEYS = [...ENEMY_V2_KEYS,'maxHp','spawnTick','enraged','direction'];
const STATE_V2_KEYS = [...STATE_KEYS,'nextEnemyProjectileId','enemyProjectileHits',
  'bossKills','invulnerableUntilTick','enemyProjectiles'];
const STATE_V3_KEYS = [...STATE_V2_KEYS,'regenPerTickMicro','regenRemainderMicro','damageReductionBps'];
const STATE_V4_KEYS = [...STATE_V3_KEYS];
const STATE_V5_KEYS = [...STATE_V4_KEYS,'pendingBursts'];
const STATE_V6_KEYS = [...STATE_V5_KEYS,'spawnedInWave','waveStartedTick','nextSpawnTick','nextWaveTick'];
const ENEMY_PROJECTILE_KEYS = ['id','xUnits','zUnits','vxUnits','vzUnits','damage','sourceId'];
const PROJECTILE_KEYS = ['id','xUnits','zUnits','velocityZUnitsPerTick','atk'];
const PROJECTILE_V4_KEYS = ['id','xUnits','zUnits','velocityXUnitsPerTick','velocityZUnitsPerTick','damageMilli'];
const PROJECTILE_V5_KEYS = [...PROJECTILE_V4_KEYS,'remainingPenetration','hitKeys'];
const PENDING_BURST_KEYS = ['dueTick','xUnits','zUnits','velocityXUnitsPerTick','velocityZUnitsPerTick','damageMilli'];
class CombatVerticalSliceError extends Error {
  constructor(code, message) { super(message); this.name = 'CombatVerticalSliceError'; this.code = code; }
}
const deny = (code, message) => { throw new CombatVerticalSliceError(code, message); };
const record = o => o !== null && typeof o === 'object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null)
  && Object.values(Object.getOwnPropertyDescriptors(o)).every(d => Object.hasOwn(d,'value'));
const exact = (o, keys) => record(o) && Object.keys(o).length === keys.length
  && keys.every(k => Object.hasOwn(o,k));
const int = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function freeze(o) { if (o && typeof o === 'object') { for (const v of Object.values(o)) freeze(v); Object.freeze(o); } return o; }
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distanceSquared = (x,z,ex,ez) => (x-ex)**2 + (z-ez)**2;
function sweptFraction(x0,z0,x1,z1,ex,ez,reach) {
  const dx=x1-x0, dz=z1-z0, sq=dx*dx+dz*dz;
  const t=sq === 0 ? 0 : clamp(((ex-x0)*dx+(ez-z0)*dz)/sq,0,1);
  return distanceSquared(x0+t*dx,z0+t*dz,ex,ez) <= reach*reach ? t : null;
}
// v4 calculates earliest circle entry, not the closest-approach timestamp.
// v1/v2/v3 intentionally retain their original collision implementation.
function sweptEntryFraction(x0,z0,x1,z1,ex,ez,reach) {
  const dx=x1-x0,dz=z1-z0,fx=x0-ex,fz=z0-ez;
  const c=fx*fx+fz*fz-reach*reach;
  if(c<=0) return 0;
  const a=dx*dx+dz*dz;
  if(a===0) return null;
  const b=2*(fx*dx+fz*dz),discriminant=b*b-4*a*c;
  if(discriminant<0) return null;
  const t=(-b-Math.sqrt(discriminant))/(2*a);
  return t>=0 && t<=1 ? t : null;
}
/** C6-A: one 30Hz ballistic salvo for the three static multi-pellet patterns.
 * Source oracle: client/src/game/combat/PlayerWeapons.js#describeMainSalvo.
 * 1 Babylon 60Hz frame = 1,000 units * 2 per journal tick; damage milli
 * units preserve the client's .88/.68/.43 factors without rounding to HP.
 * This intentionally does not model mode-specific enemies or live touch.
 */
function ballisticSalvoFromPreview(preview,position) {
  if (!record(preview) || preview.version !== FOUNDATION_VERSION
    || preview.ballisticPolicyVersion !== BALLISTIC_POLICY_VERSION
    || preview.previewOnly !== true || preview.safeForCloudBattle !== false
    || !exact(position,['xUnits','zUnits'])
    || !int(position.xUnits,-preview.arena.halfWidthUnits,preview.arena.halfWidthUnits)
    || !int(position.zUnits,-preview.arena.halfHeightUnits,preview.arena.halfHeightUnits)
    || !Object.hasOwn(BALLISTIC_PAIRS,preview.mainGun.pattern)
    || BALLISTIC_PAIRS[preview.mainGun.pattern] !== preview.mainGun.projectileType
    || !int(preview.mainGun.projectileAtk,0,1000000)) {
    deny('FOUNDATION_BALLISTIC_INVALID','Expected pinned C6-A ballistic QA loadout and position');
  }
  const pattern=preview.mainGun.pattern, attack=preview.mainGun.projectileAtk;
  const shot=(dx,dz,vx,vz,hundredths)=>({
    xUnits:position.xUnits+dx,zUnits:position.zUnits-1200+dz,
    velocityXUnitsPerTick:vx,velocityZUnitsPerTick:vz,
    damageMilli:attack*hundredths*10,
  });
  const pellets=pattern==='spread3'
    ? [shot(0,0,0,-1700,100),shot(-350,150,-440,-1640,88),shot(350,150,440,-1640,88)]
    : pattern==='spread5'
      ? [-2,-1,0,1,2].map(i=>shot(i*180,120,i*320,-1700,68))
      : [-3,-2,-1,0,1,2,3].map(i=>shot(i*120,80,i*360,-1720,43));
  return freeze(pellets);
}

/** C6-B: derive QA ballistic descriptions from client main-salvo descriptors.
 * Burst timers in real Babylon scenes are setTimeout(90/180ms), so 30Hz
 * tick quantisation is an explicit QA approximation, not verified native
 * timing parity. Origin is captured at the initial fire clock tick.
 */
function pierceBurstSalvoFromPreview(preview,position,tick) {
  if (!record(preview) || preview.version!==FOUNDATION_VERSION
    || preview.ballisticPolicyVersion!==PIERCE_BURST_POLICY_VERSION
    || preview.previewOnly!==true || preview.safeForCloudBattle!==false
    || !exact(position,['xUnits','zUnits'])
    || !int(position.xUnits,-preview.arena.halfWidthUnits,preview.arena.halfWidthUnits)
    || !int(position.zUnits,-preview.arena.halfHeightUnits,preview.arena.halfHeightUnits)
    || !Object.hasOwn(PIERCE_BURST_PAIRS,preview.mainGun.pattern)
    || PIERCE_BURST_PAIRS[preview.mainGun.pattern]!==preview.mainGun.projectileType
    || !int(preview.mainGun.projectileAtk,0,1000000)) {
    deny('SLICE_PIERCE_BURST_INVALID','Expected pinned C6-B QA loadout and position');
  }
  const burst=preview.mainGun.pattern==='burst';
  const body={xUnits:position.xUnits,zUnits:position.zUnits-1200,
    velocityXUnitsPerTick:0,velocityZUnitsPerTick:burst?-1900:-2700,
    damageMilli:preview.mainGun.projectileAtk*(burst?520:1000)};
  const now={...body,remainingPenetration:burst?1:3,hitKeys:[]};
  const later=burst?BURST_DELAY_MS.map(delayMs=>({
    dueTick:tick+Math.ceil(delayMs*30/1000),...body,
  })):[];
  return freeze({now,later});
}
function seal(s) {
  const {stateDigest: ignored,...rest}=s;
  return freeze({...rest, stateDigest:digest(['sf-v8b-slice-state',rest])});
}
function validateEncounter(snapshot, encounter) {
  const stage6=record(encounter) && encounter.version===ENCOUNTER_C6C_VERSION;
  const advanced=record(encounter) && [ENCOUNTER_V2_VERSION,ENCOUNTER_V3_VERSION,ENCOUNTER_V4_VERSION,ENCOUNTER_V5_VERSION,ENCOUNTER_C6C_VERSION].includes(encounter.version);
  if (!(stage6 ? exact(encounter,ENCOUNTER_V6_KEYS) : advanced ? exact(encounter,ENCOUNTER_V2_KEYS) : exact(encounter,ENCOUNTER_KEYS))
    || (!advanced && encounter.version !== ENCOUNTER_VERSION) || encounter.qaOnly !== true
    || (advanced && (!int(encounter.damageCooldownTicks,1,120)
      || !int(encounter.enemyProjectileRadiusUnits,10,1500)))
    || encounter.snapshotHash !== snapshot.snapshotHash || !HEX64.test(encounter.snapshotHash || '')
    || encounter.mode !== snapshot.context.mode || encounter.locationId !== snapshot.context.locationId
    || !Array.isArray(encounter.waves) || encounter.waves.length < 1 || encounter.waves.length > MAX_WAVES) {
    deny('SLICE_ENCOUNTER_INVALID', 'Expected a trusted QA-only encounter bound to the snapshot');
  }
  // Do NOT accept even a well-formed client-crafted stage manifest: recompute
  // every enemy, timing, seed roll and wave from the pinned resolver.
  if(stage6){
    let authoritative;
    try{authoritative=resolveCampaignAlphaStage1C6C({snapshot});}
    catch(_){deny('SLICE_STAGE_UNSUPPORTED','C6-C stage policy is unavailable for this snapshot');}
    if(encounter.campaignPolicyVersion!==ALPHA_POLICY_VERSION
      || encounter.stageId!==1 || encounter.interWaveDelayTicks!==60
      || digest(encounter)!==digest(authoritative))
      deny('SLICE_STAGE_FORGED','QA stage manifest differs from pinned server policy');
  }
  let lastTick=0, total=0, bossCount=0;
  const ids=new Set();
  const arena=snapshot.arena;
  const waves=encounter.waves.map(w => {
    if (!(stage6 ? exact(w,WAVE_V6_KEYS):exact(w,WAVE_KEYS))
      || !int(w.atTick,lastTick+1,MAX_BATTLE_TICKS)
      || (stage6 && (!int(w.firstSpawnDelayTicks,1,120)||!int(w.spawnIntervalTicks,1,120)))
      || !Array.isArray(w.enemies) || w.enemies.length < 1 || w.enemies.length > MAX_ACTIVE_ENEMIES) {
      deny('SLICE_WAVE_INVALID','Invalid server-authored wave schedule');
    }
    lastTick=w.atTick;
    total+=w.enemies.length;
    if(total>MAX_TOTAL_ENEMIES) deny('SLICE_ENCOUNTER_CAP','Encounter exceeds enemy budget');
    return {atTick:w.atTick,...(stage6?{firstSpawnDelayTicks:w.firstSpawnDelayTicks,
      spawnIntervalTicks:w.spawnIntervalTicks}:{}),enemies:w.enemies.map(e=> {
      if (!(advanced ? exact(e, ENEMY_V2_KEYS) : exact(e,ENEMY_KEYS))
        || typeof e.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(e.id)
        || ids.has(e.id) || !['grunt', ...(advanced ? ['boss'] : [])].includes(e.kind)
        || !(e.kind === 'boss' ? e.behavior === 'patrol' : ['static','chase'].includes(e.behavior))
        || (advanced && (
           !int(e.shootEveryTicks,0,1800) || !int(e.shotSpeedUnitsPerTick,0,3000)
           || !int(e.shotDamage,0,1000000) || !['none','aimed','fan5'].includes(e.shotPattern)
           || (e.shotPattern === 'none' ?
                (e.shootEveryTicks !== 0 || e.shotSpeedUnitsPerTick !== 0 || e.shotDamage !== 0)
                : (e.shootEveryTicks === 0 || e.shotSpeedUnitsPerTick === 0 || e.shotDamage === 0))
           || (e.kind === 'boss' ? e.shotPattern !== 'fan5' : e.shotPattern === 'fan5')
           || (e.kind === 'boss' && (e.behavior !== 'patrol' || e.moveUnitsPerTick === 0))
          ))
        || !int(e.xUnits,-arena.halfWidthUnits,arena.halfWidthUnits)
        || !(stage6 ? e.zUnits===-arena.halfHeightUnits-3000
          : int(e.zUnits,-arena.halfHeightUnits,arena.halfHeightUnits))
        || !int(e.hp,1,10000000) || !int(e.hitRadiusUnits,100,2500)
        || !int(e.moveUnitsPerTick,0,1000)
        || (e.behavior === 'static' && e.moveUnitsPerTick !== 0)
        || !int(e.contactDamage,0,1000000)) {
        deny('SLICE_ENEMY_INVALID','Unsupported enemy (bosses, shooting and advanced AI fail closed)');
      }
      if(e.kind === 'boss') {
        bossCount++;
        if (!advanced || bossCount > 1 || w !== encounter.waves[encounter.waves.length-1]
          || w.enemies.length !== 1) deny('SLICE_BOSS_SCHEDULE_INVALID','Boss must be alone in final wave');
      }
      ids.add(e.id);
      return {...e};
    })};
  });
  return freeze({version:encounter.version,qaOnly:true,snapshotHash:encounter.snapshotHash,
    mode:encounter.mode,locationId:encounter.locationId,waves,
    ...(advanced ? {damageCooldownTicks:encounter.damageCooldownTicks,
      enemyProjectileRadiusUnits:encounter.enemyProjectileRadiusUnits} : {}),
    ...(stage6?{campaignPolicyVersion:encounter.campaignPolicyVersion,stageId:1,
      interWaveDelayTicks:encounter.interWaveDelayTicks}:{})});
}
function checkSupportedLoadout(snapshot, foundation, defensive=false, ballistic=false, piercingBurst=false) {
  const items=snapshot.equipment;
  // Fail closed when the lab has not modeled a real aircraft/gear/passive.
  const allowedPilots = defensive
    ? ['main_damage_boost','movement_speed','hp_regen','damage_reduction']
    : ['main_damage_boost','movement_speed'];
  if (items.aircraft.passive !== null || items.wingman !== null || items.drone !== null
    || items.armor !== null || !allowedPilots.includes(items.pilot.passive)
    || !(piercingBurst ? ['pierce','burst'] : ballistic
      ? ['spread3','spread5','shotgun'] : ['beam','single']).includes(foundation.preview.mainGun.pattern)) {
    deny('SLICE_LOADOUT_UNMODELED','The current vertical slice does not model all equipped effects');
  }
  // Do not treat unknown pilot effects as no-op. Values originate from
  // the server-approved catalog captured in the immutable battle snapshot.
  if (defensive && (items.pilot.passive === 'hp_regen' || items.pilot.passive === 'damage_reduction')
    && (typeof items.pilot.value !== 'number' || !Number.isFinite(items.pilot.value)
      || items.pilot.value < 0 || items.pilot.value > (items.pilot.passive==='hp_regen'?0.15:0.9))) {
    deny('SLICE_PASSIVE_INVALID','QA v3 defensive passive value unsupported');
  }
  const hp=Math.floor(items.aircraft.baseHp*(1+(items.aircraft.level-1)*0.05));
  if (!int(hp,1,10000000)) deny('SLICE_HP_INVALID','Derived player HP is outside safe range');
  return hp;
}
/** Only trusted server test code may build the encounter and call this. */
function openCombatVerticalSlice(args) {
  if (!exact(args,OPEN_KEYS)) deny('SLICE_OPEN_INVALID','Unexpected slice open arguments');
  const foundation=openFoundationPreview({snapshot:args.snapshot, policy:args.policy,journal:args.journal});
  const encounter=validateEncounter(args.snapshot,args.encounter);
  const v6=encounter.version===ENCOUNTER_C6C_VERSION;
  const v5=v6||encounter.version===ENCOUNTER_V5_VERSION;
  const v4=encounter.version===ENCOUNTER_V4_VERSION;
  const v3=encounter.version===ENCOUNTER_V3_VERSION;
  const defensive=v3||v4||v5;
  const wanted=v5?PIERCE_BURST_POLICY_VERSION:v4?BALLISTIC_POLICY_VERSION:undefined;
  if (foundation.preview.ballisticPolicyVersion!==wanted)
    deny('SLICE_POLICY_VERSION_MISMATCH','QA ballistic policy cannot cross encounter versions');
  const hp=checkSupportedLoadout(args.snapshot,foundation,defensive,v4,v5);
  const pilot=args.snapshot.equipment.pilot;
  // Deterministic micro-HP carries across journal chunks; never grants any Cloud reward.
  const regenPerTickMicro=defensive && pilot.passive==='hp_regen'
    ? Math.round(hp*pilot.value*HP_MICRO/30) : 0;
  const damageReductionBps=defensive && pilot.passive==='damage_reduction'
    ? Math.round(pilot.value*10000) : 0;
  const encounterDigest=digest(['sf-v8b-qa-encounter',encounter]);
  const state=seal({version:v6 ? SLICE_V6_VERSION : v5 ? SLICE_V5_VERSION : v4 ? SLICE_V4_VERSION : v3 ? SLICE_V3_VERSION
      : encounter.version===ENCOUNTER_V2_VERSION ? SLICE_V2_VERSION : SLICE_VERSION,
    qaOnly:true,safeForCloudBattle:false,
    battleId:foundation.journal.battleId,tick:0,phase:'active',hp,maxHp:hp,
    spawnedWaves:0,kills:0,contacts:0,nextProjectileId:0,enemies:[],projectiles:[],
    traceDigest:digest(['sf-v8b-slice-trace',args.snapshot.snapshotHash,encounterDigest]),
    ...([ENCOUNTER_V2_VERSION,ENCOUNTER_V3_VERSION,ENCOUNTER_V4_VERSION,ENCOUNTER_V5_VERSION,ENCOUNTER_C6C_VERSION].includes(encounter.version)
      ? {nextEnemyProjectileId:0,enemyProjectileHits:0,bossKills:0,invulnerableUntilTick:0,enemyProjectiles:[]} : {}),
    ...(defensive ? {regenPerTickMicro,regenRemainderMicro:0,damageReductionBps}:{}),
    ...(v5 ? {pendingBursts:[]} : {}),
    ...(v6 ? {spawnedInWave:0,waveStartedTick:0,nextSpawnTick:0,
      nextWaveTick:encounter.waves[0].atTick} : {}),
  });
  return freeze({foundation,encounter,encounterDigest,state});
}
function validateRun(run) {
  if (!exact(run,RUN_KEYS) || !Object.isFrozen(run)
    || !record(run.foundation) || !Object.isFrozen(run.foundation)
    || !record(run.encounter) || !Object.isFrozen(run.encounter)
    || !HEX64.test(run.encounterDigest||'')
    || digest(['sf-v8b-qa-encounter',run.encounter]) !== run.encounterDigest
    || !(run.encounter.version===ENCOUNTER_C6C_VERSION ? exact(run.state,STATE_V6_KEYS)
      : run.encounter.version===ENCOUNTER_V5_VERSION ? exact(run.state,STATE_V5_KEYS)
      : run.encounter.version===ENCOUNTER_V4_VERSION ? exact(run.state,STATE_V4_KEYS)
      : run.encounter.version===ENCOUNTER_V3_VERSION ? exact(run.state,STATE_V3_KEYS)
      : run.encounter.version===ENCOUNTER_V2_VERSION ? exact(run.state,STATE_V2_KEYS)
      : exact(run.state,STATE_KEYS))
    || !Object.isFrozen(run.state)) {
    deny('SLICE_STATE_INVALID','Malformed QA run');
  }
  const s=run.state;
  const {stateDigest,...rest}=s;
  const v6=run.encounter.version===ENCOUNTER_C6C_VERSION;
  const v5=v6||run.encounter.version===ENCOUNTER_V5_VERSION;
  const v4=run.encounter.version===ENCOUNTER_V4_VERSION;
  const ballistic=v4||v5;
  const v3=run.encounter.version===ENCOUNTER_V3_VERSION;
  const defensive=v3||ballistic;
  const advanced=defensive || run.encounter.version===ENCOUNTER_V2_VERSION;
  if (s.version!==(v6?SLICE_V6_VERSION:v5?SLICE_V5_VERSION:v4?SLICE_V4_VERSION:v3?SLICE_V3_VERSION:advanced?SLICE_V2_VERSION:SLICE_VERSION)
    || s.qaOnly!==true || s.safeForCloudBattle!==false
    || !HEX64.test(s.traceDigest||'') || !HEX64.test(stateDigest||'')
    || digest(['sf-v8b-slice-state',rest])!==stateDigest
    || s.battleId!==run.foundation.journal.battleId
    || run.encounter.snapshotHash!==run.foundation.checkpoint.snapshotHash
    || s.tick!==run.foundation.checkpoint.tick
    || !['active','lab-clear','lab-defeat'].includes(s.phase)
    || !int(s.hp,0,s.maxHp) || !int(s.maxHp,1,10000000)
    || !int(s.spawnedWaves,0,run.encounter.waves.length)
    || !int(s.kills,0,MAX_TOTAL_ENEMIES)
    || !int(s.contacts,0,advanced?MAX_BATTLE_TICKS:MAX_TOTAL_ENEMIES)
    || !int(s.nextProjectileId,0,MAX_BATTLE_TICKS*(ballistic?7:1))
    || !Array.isArray(s.enemies) || s.enemies.length>MAX_ACTIVE_ENEMIES
    || !Array.isArray(s.projectiles) || s.projectiles.length>MAX_PROJECTILES
    || s.enemies.some(e=> !(advanced ? exact(e,ACTIVE_ENEMY_V2_KEYS) : exact(e,ACTIVE_ENEMY_KEYS))
      || !(ballistic ? (typeof e.hp==='number' && Number.isFinite(e.hp) && e.hp>0 && e.hp<=10000000
        && Math.abs(e.hp*1000-Math.round(e.hp*1000))<0.00001) : int(e.hp,1,10000000))
      || (advanced && (!int(e.maxHp,Math.ceil(e.hp),10000000)
        || !int(e.spawnTick,1,s.tick) || typeof e.enraged!=='boolean'
        || ![-1,1].includes(e.direction) || (e.kind!=='boss' && e.enraged))))
    || s.projectiles.some(b=>!(v5?exact(b,PROJECTILE_V5_KEYS):v4?exact(b,PROJECTILE_V4_KEYS):exact(b,PROJECTILE_KEYS))
      || !int(b.id,1,s.nextProjectileId)
      || !int(b.xUnits,-100000,100000) || !int(b.zUnits,-100000,100000)
      || (ballistic ? (!int(b.velocityXUnitsPerTick,-4000,4000)
        || !int(b.velocityZUnitsPerTick,-4000,0) || !int(b.damageMilli,0,1000000000)
        || (v5 && (!int(b.remainingPenetration,1,3) || !Array.isArray(b.hitKeys)
          || b.hitKeys.length>3 || new Set(b.hitKeys).size!==b.hitKeys.length
          || b.hitKeys.some(key=>typeof key!=='string' || !/^[a-z0-9_-]{1,40}$/.test(key))
          || b.hitKeys.length+b.remainingPenetration
            !==(run.foundation.preview.mainGun.pattern==='pierce'?3:1))))
        : !int(b.atk,0,1000000)))) {
    deny('SLICE_STATE_INVALID','QA world state or journal diverged');
  }
  if (v6 && (!int(s.spawnedInWave,0,20) || !int(s.waveStartedTick,0,s.tick)
    || !int(s.nextSpawnTick,0,MAX_BATTLE_TICKS+120)
    || !int(s.nextWaveTick,0,MAX_BATTLE_TICKS+120)
    || (s.spawnedWaves===0 && (s.spawnedInWave!==0 || s.waveStartedTick!==0
      || s.nextSpawnTick!==0 || s.nextWaveTick!==run.encounter.waves[0].atTick))
    || (s.spawnedWaves>0 && s.spawnedInWave>run.encounter.waves[s.spawnedWaves-1].enemies.length)
    || (s.nextSpawnTick!==0 && (s.spawnedWaves===0
      || s.spawnedInWave===run.encounter.waves[s.spawnedWaves-1].enemies.length
      || s.nextSpawnTick<=s.tick))
    || (s.nextWaveTick!==0 && (s.spawnedWaves===run.encounter.waves.length
      || s.nextWaveTick<=s.tick))
    || (s.nextSpawnTick!==0 && s.nextWaveTick!==0))) {
    deny('SLICE_STAGE_STATE_INVALID','Invalid C6-C wave progression state');
  }
  if (v5 && (!Array.isArray(s.pendingBursts) || s.pendingBursts.length>MAX_PENDING_BURSTS
    || (run.foundation.preview.mainGun.pattern==='pierce' && s.pendingBursts.length!==0)
    || s.pendingBursts.some(q=>!exact(q,PENDING_BURST_KEYS)
      || !int(q.dueTick,s.tick+1,MAX_BATTLE_TICKS+6)
      || !int(q.xUnits,-100000,100000) || !int(q.zUnits,-100000,100000)
      || q.velocityXUnitsPerTick!==0 || q.velocityZUnitsPerTick!==-1900
      || !int(q.damageMilli,0,1000000000)))) {
    deny('SLICE_STATE_INVALID','Pending QA burst timer state invalid');
  }
  if (defensive && (!int(s.regenPerTickMicro,0,500000000000)
    || !int(s.regenRemainderMicro,0,HP_MICRO-1)
    || !int(s.damageReductionBps,0,9000))) {
    deny('SLICE_STATE_INVALID','Invalid QA v3 defensive state');
  }
  if (advanced && (!int(s.nextEnemyProjectileId,0,MAX_BATTLE_TICKS*5)
    || !int(s.enemyProjectileHits,0,MAX_BATTLE_TICKS*5)
    || !int(s.bossKills,0,1) || !int(s.invulnerableUntilTick,0,MAX_BATTLE_TICKS+120)
    || !Array.isArray(s.enemyProjectiles) || s.enemyProjectiles.length>MAX_ENEMY_PROJECTILES
    || s.enemyProjectiles.some(b=>!exact(b,ENEMY_PROJECTILE_KEYS)
      || !int(b.id,1,s.nextEnemyProjectileId)
      || !int(b.xUnits,-100000,100000) || !int(b.zUnits,-100000,100000)
      || !int(b.vxUnits,-3000,3000) || !int(b.vzUnits,-3000,3000)
      || !int(b.damage,1,1000000) || typeof b.sourceId!=='string'
      || !/^[a-z0-9_-]{1,40}$/.test(b.sourceId)))) {
    deny('SLICE_STATE_INVALID','QA hostile state diverged');
  }
}
/**
 * One atomic offline simulation step. Caller stores both returned journals +
 * state or neither. A world checksum is NOT an authentication mechanism.
 */
function replayCombatSliceChunk(args) {
  if (!exact(args,ADVANCE_KEYS)) deny('SLICE_INPUT_INVALID','Unexpected replay arguments');
  const {run,chunk,receivedAtMs}=args;
  validateRun(run);
  // V8B1/C2B performs all identity, sequencing, rate and retry validation.
  const simulated=replayFoundationChunk({run:run.foundation,chunk,receivedAtMs});
  if (simulated.duplicate) return Object.freeze({run,duplicate:true,events:Object.freeze([])});
  if (run.state.phase!=='active') deny('SLICE_TERMINAL','Closed QA simulation cannot accept further inputs');
  const validated=validateChunk(chunk), p=run.foundation.preview, arena=p.arena;
  const s=run.state, v6=run.encounter.version===ENCOUNTER_C6C_VERSION;
  const v5=v6||run.encounter.version===ENCOUNTER_V5_VERSION;
  const v4=run.encounter.version===ENCOUNTER_V4_VERSION, ballistic=v4||v5;
  const v3=run.encounter.version===ENCOUNTER_V3_VERSION;
  const defensive=v3||ballistic;
  const advanced=defensive || run.encounter.version===ENCOUNTER_V2_VERSION;
  const enemies=s.enemies.map(e=>({...e})), bullets=s.projectiles.map(b=>v5
    ? {...b,hitKeys:[...b.hitKeys]}:{...b});
  let pendingBursts=v5?s.pendingBursts.map(q=>({...q})):[];
  const hostiles=advanced?s.enemyProjectiles.map(b=>({...b})):[];
  let hp=s.hp, waves=s.spawnedWaves, kills=s.kills, contacts=s.contacts;
  let nextEnemyProjectileId=advanced?s.nextEnemyProjectileId:0;
  let enemyProjectileHits=advanced?s.enemyProjectileHits:0;
  let bossKills=advanced?s.bossKills:0;
  let regenRemainderMicro=defensive?s.regenRemainderMicro:0;
  let invulnerableUntilTick=advanced?s.invulnerableUntilTick:0;
  let nextProjectileId=s.nextProjectileId, position=run.foundation.checkpoint.position;
  let spawnedInWave=v6?s.spawnedInWave:0,waveStartedTick=v6?s.waveStartedTick:0;
  let nextSpawnTick=v6?s.nextSpawnTick:0,nextWaveTick=v6?s.nextWaveTick:0;
  let phase='active', traceDigest=s.traceDigest, emittedCursor=0;
  const events=[];
  for (let i=0;i<validated.frames.length;i++) {
    const tick=s.tick+i+1;
    const [x,z]=validated.frames[i];
    const priorPosition=position;
    position=advancePreviewMovement(p,position,{x,z});
    if (phase==='active') {
      // Client heals by maxHp*regenRate/second. Quantise to one micro-HP,
      // carry remainder through split chunks and discard surplus at full HP.
      if (defensive && s.regenPerTickMicro>0) {
        if (hp>=s.maxHp) regenRemainderMicro=0;
        else {
          const sum=regenRemainderMicro+s.regenPerTickMicro;
          hp=Math.min(s.maxHp,hp+Math.floor(sum/HP_MICRO));
          regenRemainderMicro=hp>=s.maxHp?0:sum%HP_MICRO;
        }
      }
      // Record start-of-tick enemy positions for relative swept collisions.
      // v1/v2 retain their existing endpoint-only enemy contact semantics.
      const enemyPrior=defensive?new Map(enemies.map(e=>[e.id,{xUnits:e.xUnits,zUnits:e.zUnits}])):null;
      if (waves<run.encounter.waves.length
        && (v6 ? nextWaveTick!==0 && tick>=nextWaveTick
          : run.encounter.waves[waves].atTick===tick)) {
        const group=run.encounter.waves[waves];
        if(v6){
          waveStartedTick=tick;nextWaveTick=0;spawnedInWave=0;
          nextSpawnTick=tick+group.firstSpawnDelayTicks;
        }else{
          if(enemies.length+group.enemies.length>MAX_ACTIVE_ENEMIES)
            deny('SLICE_ACTIVE_CAP','Enemy population exceeded configured active budget');
          enemies.push(...group.enemies.map(e=>advanced?
            {...e,maxHp:e.hp,spawnTick:tick,enraged:false,direction:1}:{...e}));
          if (defensive) for(const e of group.enemies)
            enemyPrior.set(e.id,{xUnits:e.xUnits,zUnits:e.zUnits});
        }
        waves++;
        events.push(freeze({type:'wave',tick,wave:waves}));
      }
      // C6-C: one enemy at each pinned 30Hz spawn slot, relative to the
      // player's then-current X. No client-provided wave manifest is consulted.
      if(v6 && waves>0 && nextSpawnTick!==0 && tick>=nextSpawnTick){
        const group=run.encounter.waves[waves-1];
        if(enemies.length>=MAX_ACTIVE_ENEMIES)
          deny('SLICE_ACTIVE_CAP','Enemy population exceeded configured active budget');
        const selected=group.enemies[spawnedInWave];
        if(!selected) deny('SLICE_STAGE_STATE_INVALID','Spawn cursor outside pinned wave');
        const bound=arena.halfWidthUnits-selected.hitRadiusUnits;
        const actualX=clamp(position.xUnits+selected.xUnits,-bound,bound);
        const active={...selected,xUnits:actualX,maxHp:selected.hp,spawnTick:tick,
          enraged:false,direction:1};
        enemies.push(active);enemyPrior.set(active.id,{xUnits:actualX,zUnits:active.zUnits});
        spawnedInWave++;
        nextSpawnTick=spawnedInWave<group.enemies.length
          ?tick+group.spawnIntervalTicks:0;
        events.push(freeze({type:'spawn',tick,wave:waves,id:active.id}));
      }
      for (let j=enemies.length-1;j>=0;j--) {
        const e=enemies[j];
        if (advanced && e.behavior==='patrol') {
          const newX=e.xUnits+e.moveUnitsPerTick*e.direction*(e.enraged?2:1);
          const bound=arena.halfWidthUnits-e.hitRadiusUnits;
          e.xUnits=clamp(newX,-bound,bound);
          if (newX>=bound || newX<=-bound) e.direction*=-1;
        }
        if (e.behavior==='chase' && e.moveUnitsPerTick>0) {
          const dx=position.xUnits-e.xUnits, dz=position.zUnits-e.zUnits;
          const d=Math.hypot(dx,dz);
          if (d>0) {
            e.xUnits=clamp(e.xUnits+Math.round(dx/d*e.moveUnitsPerTick),-arena.halfWidthUnits,arena.halfWidthUnits);
            e.zUnits=clamp(e.zUnits+Math.round(dz/d*e.moveUnitsPerTick),-arena.halfHeightUnits,arena.halfHeightUnits);
          }
        }
        const reach=e.hitRadiusUnits+p.pilotHitRadiusUnits;
        const oldEnemy=defensive?enemyPrior.get(e.id):null;
        const contacted=defensive
          ? sweptFraction(oldEnemy.xUnits-priorPosition.xUnits,oldEnemy.zUnits-priorPosition.zUnits,
            e.xUnits-position.xUnits,e.zUnits-position.zUnits,0,0,reach)!==null
          : distanceSquared(position.xUnits,position.zUnits,e.xUnits,e.zUnits)<=reach*reach;
        if (contacted) {
          const raw=e.contactDamage;
          const damage=raw>0?Math.max(1,Math.floor(raw*(1-p.armor/100)
            *(defensive?1-s.damageReductionBps/10000:1))):0;
          const acceptedDamage=advanced && tick<invulnerableUntilTick ? 0 : damage;
          hp=Math.max(0,hp-acceptedDamage);
          if (advanced && acceptedDamage>0) invulnerableUntilTick=tick+run.encounter.damageCooldownTicks;
          // A persistent boss overlap must not flood the contact ledger during
          // temporary invulnerability. Ordinary enemies still despawn on contact.
          if(!advanced || e.kind!=='boss' || acceptedDamage>0) {
            contacts++;
            events.push(freeze({type:'contact',tick,id:e.id,damage:acceptedDamage}));
          }
          if(!(e.kind==='boss' && advanced)) enemies.splice(j,1); // no kill reward
        }
      }
      while (emittedCursor<simulated.emitted.length && simulated.emitted[emittedCursor].tick===tick) {
        const shot=simulated.emitted[emittedCursor++];
        if (ballistic) {
          if (shot.xUnits!==position.xUnits || shot.zUnits!==position.zUnits-p.mainGun.shotSpawnOffsetZUnits
            || shot.atk!==p.mainGun.projectileAtk) deny('SLICE_MOVEMENT_DRIFT','Fire origin diverged');
          if (v5) {
            const salvo=pierceBurstSalvoFromPreview(p,position,tick);
            if (bullets.length+1>MAX_PROJECTILES) deny('SLICE_PROJECTILE_CAP','Shot exceeds projectile budget');
            if (pendingBursts.length+salvo.later.length>MAX_PENDING_BURSTS)
              deny('SLICE_BURST_QUEUE_CAP','Pending burst timer budget exhausted');
            bullets.push({id:++nextProjectileId,...salvo.now,hitKeys:[]});
            pendingBursts.push(...salvo.later);
          } else {
            const salvo=ballisticSalvoFromPreview(p,position);
            if (bullets.length+salvo.length>MAX_PROJECTILES) deny('SLICE_PROJECTILE_CAP','Salvo exceeds projectile budget');
            for(const pellet of salvo) bullets.push({id:++nextProjectileId,...pellet});
          }
        } else {
          if (bullets.length>=MAX_PROJECTILES) deny('SLICE_PROJECTILE_CAP','Projectile budget exhausted');
          nextProjectileId++;
          bullets.push({id:nextProjectileId,xUnits:shot.xUnits,zUnits:shot.zUnits,
            velocityZUnitsPerTick:shot.velocityZUnitsPerTick,atk:shot.atk});
        }
      }
      if (v5 && pendingBursts.length) {
        const due=pendingBursts.filter(q=>q.dueTick===tick);
        pendingBursts=pendingBursts.filter(q=>q.dueTick!==tick);
        if (bullets.length+due.length>MAX_PROJECTILES)
          deny('SLICE_PROJECTILE_CAP','Due delayed burst exceeds projectile budget');
        for(const queued of due) {
          const {dueTick:ignored,...body}=queued;
          bullets.push({id:++nextProjectileId,...body,remainingPenetration:1,hitKeys:[]});
        }
      }
      if (advanced) {
        // Deterministic hostile fire; fixed 30Hz. Enemy schedules and patterns are
        // pinned in the QA encounter, NEVER taken from client combat results.
        for (const e of enemies) {
          if (e.shotPattern==='none') continue;
          const basePeriod=e.shootEveryTicks;
          const effectivePeriod=e.kind==='boss' && e.enraged
            ? Math.max(1,Math.floor(basePeriod/2)) : basePeriod;
          if (tick<=e.spawnTick || (tick-e.spawnTick)%effectivePeriod!==0) continue;
          const dx=position.xUnits-e.xUnits, dz=position.zUnits-e.zUnits;
          const aim=Math.atan2(dz,dx);
          const fan=e.shotPattern==='fan5' ? [-0.32,-0.16,0,0.16,0.32] : [0];
          if(hostiles.length+fan.length>MAX_ENEMY_PROJECTILES)
            deny('SLICE_ENEMY_PROJECTILE_CAP','Hostile projectile budget exhausted');
          for(const offset of fan) {
            const vx=Math.round(Math.cos(aim+offset)*e.shotSpeedUnitsPerTick);
            const vz=Math.round(Math.sin(aim+offset)*e.shotSpeedUnitsPerTick);
            nextEnemyProjectileId++;
            hostiles.push({id:nextEnemyProjectileId,xUnits:e.xUnits,zUnits:e.zUnits,
              vxUnits:vx,vzUnits:vz,damage:e.shotDamage,sourceId:e.id});
          }
          events.push(freeze({type:'enemy-fire',tick,id:e.id,bullets:fan.length}));
        }
        // Swept relative collision: both the hostile shot and the player's
        // movement happen during a tick. Applies a pinned invulnerability window.
        for(let b=hostiles.length-1;b>=0;b--) {
          const shot=hostiles[b],oldX=shot.xUnits,oldZ=shot.zUnits;
          shot.xUnits+=shot.vxUnits;shot.zUnits+=shot.vzUnits;
          const reach=p.pilotHitRadiusUnits+run.encounter.enemyProjectileRadiusUnits;
          const hit=sweptFraction(oldX-priorPosition.xUnits,oldZ-priorPosition.zUnits,
            shot.xUnits-position.xUnits,shot.zUnits-position.zUnits,0,0,reach);
          if(hit!==null) {
            const raw=shot.damage;
            const damage=raw>0?Math.max(1,Math.floor(raw*(1-p.armor/100)
              *(defensive?1-s.damageReductionBps/10000:1))):0;
            const accepted=tick<invulnerableUntilTick?0:damage;
            if(accepted>0) {hp=Math.max(0,hp-accepted);invulnerableUntilTick=tick+run.encounter.damageCooldownTicks;}
            enemyProjectileHits++;
            events.push(freeze({type:'enemy-hit',tick,id:shot.sourceId,damage:accepted}));
            hostiles.splice(b,1);
          } else if(Math.abs(shot.xUnits)>arena.halfWidthUnits+3000 ||
            Math.abs(shot.zUnits)>arena.halfHeightUnits+3000) hostiles.splice(b,1);
        }
      }
      for (let b=bullets.length-1;b>=0;b--) {
        const bullet=bullets[b];
        const oldX=bullet.xUnits,oldZ=bullet.zUnits;
        if(ballistic) bullet.xUnits+=bullet.velocityXUnitsPerTick;
        bullet.zUnits+=bullet.velocityZUnitsPerTick;
        if(v5) {
          // A rail shot may touch up to three DISTINCT IDs across ticks,
          // including multiple enemies within one swept step. Process in
          // earliest-entry order, never repeat damage to a previous ID.
          const contacts=[];
          for(const e of enemies) {
            if(bullet.hitKeys.includes(e.id)) continue;
            const prior=enemyPrior.get(e.id);
            const t=sweptEntryFraction(oldX-prior.xUnits,oldZ-prior.zUnits,
              bullet.xUnits-e.xUnits,bullet.zUnits-e.zUnits,0,0,
              e.hitRadiusUnits+p.mainGun.projectileHitRadiusUnits);
            if(t!==null) contacts.push({id:e.id,t});
          }
          contacts.sort((a,b)=>a.t-b.t || (a.id<b.id?-1:a.id>b.id?1:0));
          let consumed=false;
          for(const contact of contacts) {
            const index=enemies.findIndex(e=>e.id===contact.id);
            if(index<0 || bullet.hitKeys.includes(contact.id)) continue;
            const target=enemies[index], damage=bullet.damageMilli/1000;
            bullet.hitKeys.push(target.id);bullet.remainingPenetration--;
            target.hp=Math.round(target.hp*1000-bullet.damageMilli)/1000;
            events.push(freeze({type:'hit',tick,id:target.id,damage}));
            if (target.kind==='boss' && !target.enraged
              && target.hp>0 && target.hp*10<=target.maxHp*3) {
              target.enraged=true;events.push(freeze({type:'boss-enrage',tick,id:target.id}));
            }
            if (target.hp<=0) {
              enemies.splice(index,1);kills++;
              if (target.kind==='boss') bossKills++;
              events.push(freeze({type:target.kind==='boss'?'boss-kill':'kill',tick,id:target.id}));
            }
            if (bullet.remainingPenetration===0) {
              bullets.splice(b,1);consumed=true;break;
            }
          }
          if(!consumed && (bullet.zUnits < -arena.halfHeightUnits-3000
            || Math.abs(bullet.xUnits)>arena.halfWidthUnits+3000
            || bullet.zUnits>arena.halfHeightUnits+3000)) bullets.splice(b,1);
          continue;
        }
        let best=-1, fraction=Infinity;
        for (let j=0;j<enemies.length;j++) {
          const e=enemies[j];
          const t=ballistic
            ? sweptEntryFraction(oldX-enemyPrior.get(e.id).xUnits,
              oldZ-enemyPrior.get(e.id).zUnits,
              bullet.xUnits-e.xUnits,bullet.zUnits-e.zUnits,0,0,
              e.hitRadiusUnits+p.mainGun.projectileHitRadiusUnits)
            : v3
            ? sweptFraction(bullet.xUnits-enemyPrior.get(e.id).xUnits,
              oldZ-enemyPrior.get(e.id).zUnits,
              bullet.xUnits-e.xUnits,bullet.zUnits-e.zUnits,0,0,
              e.hitRadiusUnits+p.mainGun.projectileHitRadiusUnits)
            : sweptFraction(bullet.xUnits,oldZ,bullet.xUnits,bullet.zUnits,
              e.xUnits,e.zUnits,e.hitRadiusUnits+p.mainGun.projectileHitRadiusUnits);
          if (t!==null && (t<fraction || (t===fraction && (best<0 || e.id<enemies[best].id)))) {
            fraction=t;best=j;
          }
        }
        if (best>=0) {
          const target=enemies[best];
          const damage=ballistic?bullet.damageMilli/1000:bullet.atk;
          target.hp=ballistic?Math.round(target.hp*1000-bullet.damageMilli)/1000:target.hp-damage;
          events.push(freeze({type:'hit',tick,id:target.id,damage}));
          bullets.splice(b,1);
          if (advanced && target.kind==='boss' && !target.enraged
            && target.hp>0 && target.hp*10<=target.maxHp*3) {
            target.enraged=true;events.push(freeze({type:'boss-enrage',tick,id:target.id}));
          }
          if (target.hp<=0) {
            enemies.splice(best,1);kills++;
            if (advanced && target.kind==='boss') bossKills++;
            events.push(freeze({type:target.kind==='boss'?'boss-kill':'kill',tick,id:target.id}));
          }
        } else if (bullet.zUnits < -arena.halfHeightUnits-3000
          || (ballistic && (Math.abs(bullet.xUnits)>arena.halfWidthUnits+3000
            || bullet.zUnits>arena.halfHeightUnits+3000))) {
          bullets.splice(b,1);
        }
      }
      if(hp===0) phase='lab-defeat';
      else if(v6){
        const total=run.encounter.waves.reduce((sum,w)=>sum+w.enemies.length,0);
        const last=waves>0?run.encounter.waves[waves-1]:null;
        if(last && spawnedInWave===last.enemies.length && enemies.length===0
          && nextSpawnTick===0 && nextWaveTick===0){
          if(waves===run.encounter.waves.length){
            // Never count contact/cull as a kill. QA-only clear, not receipt.
            if(kills===total)phase='lab-clear';
          }else{
            nextWaveTick=tick+run.encounter.interWaveDelayTicks;
            events.push(freeze({type:'wave-cleared',tick,wave:waves}));
          }
        }
      }else if(waves===run.encounter.waves.length && enemies.length===0
        && kills===run.encounter.waves.reduce((sum,w)=>sum+w.enemies.length,0)) phase='lab-clear';
    }
    traceDigest=advanced
      ? digest([traceDigest,tick,position,hp,waves,kills,contacts,enemies,bullets,
        hostiles,enemyProjectileHits,bossKills,invulnerableUntilTick,
        ...(defensive?[regenRemainderMicro,s.regenPerTickMicro,s.damageReductionBps]:[]),
        ...(v5?[pendingBursts]:[]),
        ...(v6?[spawnedInWave,waveStartedTick,nextSpawnTick,nextWaveTick]:[]),phase])
      : digest([traceDigest,tick,position,hp,waves,kills,contacts,enemies,bullets,phase]);
  }
  if (position.xUnits!==simulated.run.checkpoint.position.xUnits
    || position.zUnits!==simulated.run.checkpoint.position.zUnits) {
    deny('SLICE_MOVEMENT_DRIFT','C2B movement parity diverged');
  }
  const state=seal({version:v6?SLICE_V6_VERSION:v5?SLICE_V5_VERSION:v4?SLICE_V4_VERSION:v3?SLICE_V3_VERSION:advanced?SLICE_V2_VERSION:SLICE_VERSION,
    qaOnly:true,safeForCloudBattle:false,
    battleId:s.battleId,tick:validated.endTick,phase,hp,maxHp:s.maxHp,
    spawnedWaves:waves,kills,contacts,nextProjectileId,enemies,projectiles:bullets,traceDigest,
    ...(advanced?{nextEnemyProjectileId,enemyProjectileHits,bossKills,
      invulnerableUntilTick,enemyProjectiles:hostiles}:{}),
    ...(defensive?{regenPerTickMicro:s.regenPerTickMicro,regenRemainderMicro,
      damageReductionBps:s.damageReductionBps}:{}),
    ...(v5?{pendingBursts}:{}),
    ...(v6?{spawnedInWave,waveStartedTick,nextSpawnTick,nextWaveTick}:{}),
  });
  const next=freeze({foundation:simulated.run,encounter:run.encounter,encounterDigest:run.encounterDigest,state});
  return Object.freeze({run:next,duplicate:false,events:freeze(events)});
}
module.exports=Object.freeze({SLICE_VERSION,ENCOUNTER_VERSION,CombatVerticalSliceError,
  openCombatVerticalSlice,replayCombatSliceChunk});
