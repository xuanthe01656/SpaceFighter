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
const {advancePreviewMovement} = require('./combatMovementWeaponV8.cjs');
const {openFoundationPreview, replayFoundationChunk} = require('./combatPreviewReplayV8.cjs');

const SLICE_VERSION = 'pve-lab-vertical-slice-v1';
const ENCOUNTER_VERSION = 'pve-server-encounter-qa-v1';
const MAX_WAVES = 12;
const MAX_TOTAL_ENEMIES = 128;
const MAX_ACTIVE_ENEMIES = 32;
const MAX_PROJECTILES = 128;
const HEX64 = /^[a-f0-9]{64}$/;
const OPEN_KEYS = ['snapshot','policy','journal','encounter'];
const ENCOUNTER_KEYS = ['version','qaOnly','snapshotHash','mode','locationId','waves'];
const WAVE_KEYS = ['atTick','enemies'];
const ENEMY_KEYS = ['id','kind','behavior','xUnits','zUnits','hp','hitRadiusUnits','moveUnitsPerTick','contactDamage'];
const RUN_KEYS = ['foundation','encounter','encounterDigest','state'];
const ADVANCE_KEYS = ['run','chunk','receivedAtMs'];
const STATE_KEYS = ['version','qaOnly','safeForCloudBattle','battleId','tick','phase','hp','maxHp',
  'spawnedWaves','kills','contacts','nextProjectileId','enemies','projectiles','traceDigest','stateDigest'];
const ACTIVE_ENEMY_KEYS = ['id','kind','behavior','xUnits','zUnits','hp','hitRadiusUnits','moveUnitsPerTick','contactDamage'];
const PROJECTILE_KEYS = ['id','xUnits','zUnits','velocityZUnitsPerTick','atk'];
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
function seal(s) {
  const {stateDigest: ignored,...rest}=s;
  return freeze({...rest, stateDigest:digest(['sf-v8b-slice-state',rest])});
}
function validateEncounter(snapshot, encounter) {
  if (!exact(encounter, ENCOUNTER_KEYS)
    || encounter.version !== ENCOUNTER_VERSION || encounter.qaOnly !== true
    || encounter.snapshotHash !== snapshot.snapshotHash || !HEX64.test(encounter.snapshotHash || '')
    || encounter.mode !== snapshot.context.mode || encounter.locationId !== snapshot.context.locationId
    || !Array.isArray(encounter.waves) || encounter.waves.length < 1 || encounter.waves.length > MAX_WAVES) {
    deny('SLICE_ENCOUNTER_INVALID', 'Expected a trusted QA-only encounter bound to the snapshot');
  }
  let lastTick=0, total=0;
  const ids=new Set();
  const arena=snapshot.arena;
  const waves=encounter.waves.map(w => {
    if (!exact(w,WAVE_KEYS) || !int(w.atTick,lastTick+1,MAX_BATTLE_TICKS)
      || !Array.isArray(w.enemies) || w.enemies.length < 1 || w.enemies.length > MAX_ACTIVE_ENEMIES) {
      deny('SLICE_WAVE_INVALID','Invalid server-authored wave schedule');
    }
    lastTick=w.atTick;
    total+=w.enemies.length;
    if(total>MAX_TOTAL_ENEMIES) deny('SLICE_ENCOUNTER_CAP','Encounter exceeds enemy budget');
    return {atTick:w.atTick,enemies:w.enemies.map(e=> {
      if (!exact(e, ENEMY_KEYS) || typeof e.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(e.id)
        || ids.has(e.id) || e.kind !== 'grunt'
        || !['static','chase'].includes(e.behavior)
        || !int(e.xUnits,-arena.halfWidthUnits,arena.halfWidthUnits)
        || !int(e.zUnits,-arena.halfHeightUnits,arena.halfHeightUnits)
        || !int(e.hp,1,10000000) || !int(e.hitRadiusUnits,100,2500)
        || !int(e.moveUnitsPerTick,0,1000)
        || (e.behavior === 'static' && e.moveUnitsPerTick !== 0)
        || !int(e.contactDamage,0,1000000)) {
        deny('SLICE_ENEMY_INVALID','Unsupported enemy (bosses, shooting and advanced AI fail closed)');
      }
      ids.add(e.id);
      return {...e};
    })};
  });
  return freeze({version:ENCOUNTER_VERSION,qaOnly:true,snapshotHash:encounter.snapshotHash,
    mode:encounter.mode,locationId:encounter.locationId,waves});
}
function checkSupportedLoadout(snapshot, foundation) {
  const items=snapshot.equipment;
  // Fail closed when the lab has not modeled a real aircraft/gear/passive.
  if (items.aircraft.passive !== null || items.wingman !== null || items.drone !== null
    || items.armor !== null || !['main_damage_boost','movement_speed'].includes(items.pilot.passive)
    || !['beam','single'].includes(foundation.preview.mainGun.pattern)) {
    deny('SLICE_LOADOUT_UNMODELED','The current vertical slice does not model all equipped effects');
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
  const hp=checkSupportedLoadout(args.snapshot,foundation);
  const encounterDigest=digest(['sf-v8b-qa-encounter',encounter]);
  const state=seal({version:SLICE_VERSION,qaOnly:true,safeForCloudBattle:false,
    battleId:foundation.journal.battleId,tick:0,phase:'active',hp,maxHp:hp,
    spawnedWaves:0,kills:0,contacts:0,nextProjectileId:0,enemies:[],projectiles:[],
    traceDigest:digest(['sf-v8b-slice-trace',args.snapshot.snapshotHash,encounterDigest]),
  });
  return freeze({foundation,encounter,encounterDigest,state});
}
function validateRun(run) {
  if (!exact(run,RUN_KEYS) || !Object.isFrozen(run)
    || !record(run.foundation) || !Object.isFrozen(run.foundation)
    || !record(run.encounter) || !Object.isFrozen(run.encounter)
    || !HEX64.test(run.encounterDigest||'')
    || digest(['sf-v8b-qa-encounter',run.encounter]) !== run.encounterDigest
    || !exact(run.state,STATE_KEYS) || !Object.isFrozen(run.state)) {
    deny('SLICE_STATE_INVALID','Malformed QA run');
  }
  const s=run.state;
  const {stateDigest,...rest}=s;
  if (s.version!==SLICE_VERSION || s.qaOnly!==true || s.safeForCloudBattle!==false
    || !HEX64.test(s.traceDigest||'') || !HEX64.test(stateDigest||'')
    || digest(['sf-v8b-slice-state',rest])!==stateDigest
    || s.battleId!==run.foundation.journal.battleId
    || run.encounter.snapshotHash!==run.foundation.checkpoint.snapshotHash
    || s.tick!==run.foundation.checkpoint.tick
    || !['active','lab-clear','lab-defeat'].includes(s.phase)
    || !int(s.hp,0,s.maxHp) || !int(s.maxHp,1,10000000)
    || !int(s.spawnedWaves,0,run.encounter.waves.length)
    || !int(s.kills,0,MAX_TOTAL_ENEMIES) || !int(s.contacts,0,MAX_TOTAL_ENEMIES)
    || !int(s.nextProjectileId,0,MAX_BATTLE_TICKS)
    || !Array.isArray(s.enemies) || s.enemies.length>MAX_ACTIVE_ENEMIES
    || !Array.isArray(s.projectiles) || s.projectiles.length>MAX_PROJECTILES
    || s.enemies.some(e=>!exact(e,ACTIVE_ENEMY_KEYS) || !int(e.hp,1,10000000))
    || s.projectiles.some(b=>!exact(b,PROJECTILE_KEYS) || !int(b.id,1,s.nextProjectileId)
      || !int(b.xUnits,-100000,100000) || !int(b.zUnits,-100000,100000)
      || !int(b.atk,0,1000000))) {
    deny('SLICE_STATE_INVALID','QA world state or journal diverged');
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
  const s=run.state;
  const enemies=s.enemies.map(e=>({...e})), bullets=s.projectiles.map(b=>({...b}));
  let hp=s.hp, waves=s.spawnedWaves, kills=s.kills, contacts=s.contacts;
  let nextProjectileId=s.nextProjectileId, position=run.foundation.checkpoint.position;
  let phase='active', traceDigest=s.traceDigest, emittedCursor=0;
  const events=[];
  for (let i=0;i<validated.frames.length;i++) {
    const tick=s.tick+i+1;
    const [x,z]=validated.frames[i];
    position=advancePreviewMovement(p,position,{x,z});
    if (phase==='active') {
      if (waves<run.encounter.waves.length && run.encounter.waves[waves].atTick===tick) {
        const group=run.encounter.waves[waves];
        if(enemies.length+group.enemies.length>MAX_ACTIVE_ENEMIES)
          deny('SLICE_ACTIVE_CAP','Enemy population exceeded configured active budget');
        enemies.push(...group.enemies.map(e=>({...e})));
        waves++;
        events.push(freeze({type:'wave',tick,wave:waves}));
      }
      for (let j=enemies.length-1;j>=0;j--) {
        const e=enemies[j];
        if (e.behavior==='chase' && e.moveUnitsPerTick>0) {
          const dx=position.xUnits-e.xUnits, dz=position.zUnits-e.zUnits;
          const d=Math.hypot(dx,dz);
          if (d>0) {
            e.xUnits=clamp(e.xUnits+Math.round(dx/d*e.moveUnitsPerTick),-arena.halfWidthUnits,arena.halfWidthUnits);
            e.zUnits=clamp(e.zUnits+Math.round(dz/d*e.moveUnitsPerTick),-arena.halfHeightUnits,arena.halfHeightUnits);
          }
        }
        const reach=e.hitRadiusUnits+p.pilotHitRadiusUnits;
        if (distanceSquared(position.xUnits,position.zUnits,e.xUnits,e.zUnits)<=reach*reach) {
          const raw=e.contactDamage;
          const damage=raw>0?Math.max(1,Math.floor(raw*(1-p.armor/100))):0;
          hp=Math.max(0,hp-damage);
          contacts++;
          events.push(freeze({type:'contact',tick,id:e.id,damage}));
          enemies.splice(j,1); // collision is NOT an enemy-kill reward
        }
      }
      while (emittedCursor<simulated.emitted.length && simulated.emitted[emittedCursor].tick===tick) {
        const shot=simulated.emitted[emittedCursor++];
        if (bullets.length>=MAX_PROJECTILES) deny('SLICE_PROJECTILE_CAP','Projectile budget exhausted');
        nextProjectileId++;
        bullets.push({id:nextProjectileId,xUnits:shot.xUnits,zUnits:shot.zUnits,
          velocityZUnitsPerTick:shot.velocityZUnitsPerTick,atk:shot.atk});
      }
      for (let b=bullets.length-1;b>=0;b--) {
        const bullet=bullets[b];
        const oldZ=bullet.zUnits;
        bullet.zUnits+=bullet.velocityZUnitsPerTick;
        let best=-1, fraction=Infinity;
        for (let j=0;j<enemies.length;j++) {
          const e=enemies[j];
          const t=sweptFraction(bullet.xUnits,oldZ,bullet.xUnits,bullet.zUnits,
            e.xUnits,e.zUnits,e.hitRadiusUnits+p.mainGun.projectileHitRadiusUnits);
          if (t!==null && (t<fraction || (t===fraction && (best<0 || e.id<enemies[best].id)))) {
            fraction=t;best=j;
          }
        }
        if (best>=0) {
          const target=enemies[best];
          target.hp-=bullet.atk;
          events.push(freeze({type:'hit',tick,id:target.id,damage:bullet.atk}));
          bullets.splice(b,1);
          if (target.hp<=0) {
            enemies.splice(best,1);kills++;
            events.push(freeze({type:'kill',tick,id:target.id}));
          }
        } else if (bullet.zUnits < -arena.halfHeightUnits-3000) {
          bullets.splice(b,1);
        }
      }
      if(hp===0) phase='lab-defeat';
      else if(waves===run.encounter.waves.length && enemies.length===0
        && kills===run.encounter.waves.reduce((sum,w)=>sum+w.enemies.length,0)) phase='lab-clear';
    }
    traceDigest=digest([traceDigest,tick,position,hp,waves,kills,contacts,enemies,bullets,phase]);
  }
  if (position.xUnits!==simulated.run.checkpoint.position.xUnits
    || position.zUnits!==simulated.run.checkpoint.position.zUnits) {
    deny('SLICE_MOVEMENT_DRIFT','C2B movement parity diverged');
  }
  const state=seal({version:SLICE_VERSION,qaOnly:true,safeForCloudBattle:false,
    battleId:s.battleId,tick:validated.endTick,phase,hp,maxHp:s.maxHp,
    spawnedWaves:waves,kills,contacts,nextProjectileId,enemies,projectiles:bullets,traceDigest});
  const next=freeze({foundation:simulated.run,encounter:run.encounter,encounterDigest:run.encounterDigest,state});
  return Object.freeze({run:next,duplicate:false,events:freeze(events)});
}
module.exports=Object.freeze({SLICE_VERSION,ENCOUNTER_VERSION,CombatVerticalSliceError,
  openCombatVerticalSlice,replayCombatSliceChunk});
