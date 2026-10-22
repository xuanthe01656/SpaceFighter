'use strict';
/**
 * SpaceFighter V8B-2A: EXPERIMENTAL deterministic, headless PvE kernel.
 *
 * THIS IS NOT A VICTORY VERIFIER OR A REWARD AUTHORITY. It does not model
 * Campaign waves/bosses, Dungeon waves/drops, all weapon types or passives.
 * It does not access Firebase, Cloud Run, client input, clock or randomness.
 * P0 gate must stay closed. Server must create/store the configuration; never
 * accept a client-authored state, seed, loadout, or enemy fixture.
 *
 * Integer world units: 1000 = 1 Babylon world unit. Tick is 30 Hz.
 * Legacy keyboard reference: 0.30 units/60Hz frame => 600 units/30Hz tick.
 * Touch drag in legacy scenes can teleport immediately and is NOT compatible
 * until a server-bound input adapter is created. No production parity claim.
 */
const { createHash } = require('node:crypto');
const { PROTOCOL_VERSION, TICK_HZ, MAX_BATTLE_TICKS,
  openInputJournal, validateChunk, ingestInputChunk } = require('./combatInputJournalV8.cjs');

const CORE_VERSION = 'pve-core-poc-v1';
const UNITS_PER_WORLD = 1000;
const MAX_ENEMIES = 32;
const MAX_BULLETS = 96;
const INPUT_MAX = 127;
const UINT32_MAX = 0xffffffff;
const STATE_KEYS = Object.freeze(['arena', 'battleId', 'bullets', 'coreVersion', 'enemyKills', 'enemies',
  'journalDigest', 'loadoutHash', 'nextBulletId', 'pilot', 'protocol', 'rngState', 'rulesVersion',
  'seed', 'sessionId', 'stateDigest', 'tick', 'uid']);

class CombatCoreError extends Error {
  constructor(code, message) { super(message); this.name = 'CombatCoreError'; this.code = code; }
}
const deny = (code, message) => { throw new CombatCoreError(code, message); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(desc => Object.hasOwn(desc, 'value'));
const exact = (value, keys) => isRecord(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deepFreeze = o => { if (o && typeof o === 'object') { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); } return o; };
const ARENA_KEYS = ['halfWidth', 'halfHeight'];
const PILOT_KEYS = ['x','z','hp','maxHp','armor','atk','movePerTick','fireEveryTicks',
  'shotSpeed','hitRadius','bulletRadius','critChancePermille','critBonusPermille','dodgeChancePermille'];
const ENEMY_KEYS = ['id','x','z','hp','speedPerTick','damage','hitRadius','behavior'];
const BULLET_KEYS = ['id','x','z','atk','hitRadius'];
const OPEN_KEYS = ['journal','seed','arena','pilot','enemies'];
const REPLAY_KEYS = ['state','journal','chunk','receivedAtMs'];

function assertContext(journal) {
  if (!isRecord(journal) || journal.nextTick !== 0 || journal.lastChunkStart !== -1
    || journal.lastChunkDigest !== null) {
    deny('CORE_JOURNAL_INVALID', 'Expected fresh server-created V8B1 journal');
  }
  let expected;
  try {
    expected = openInputJournal({
      uid:journal.uid, sessionId:journal.sessionId, battleId:journal.battleId,
      rulesVersion:journal.rulesVersion, loadoutHash:journal.loadoutHash,
      issuedAtMs:journal.issuedAtMs,
    });
  } catch (_) { deny('CORE_JOURNAL_INVALID', 'Invalid journal identity'); }
  if (Object.keys(expected).length !== Object.keys(journal).length
    || Object.keys(expected).some(key => expected[key] !== journal[key])) {
    deny('CORE_JOURNAL_INVALID', 'Journal does not match initialized server context');
  }
}

function assertConfig({arena, pilot, enemies, seed}) {
  if (!exact(arena, ARENA_KEYS) || !integer(arena.halfWidth, 2000, 50000)
    || !integer(arena.halfHeight, 2000, 50000)) {
    deny('CORE_CONFIG_INVALID', 'Invalid server arena');
  }
  if (!exact(pilot, PILOT_KEYS)
    || !integer(pilot.hitRadius, 100, 2500)
    || !integer(pilot.bulletRadius, 10, 1500)
    || !integer(pilot.hp, 1, 10000000) || !integer(pilot.maxHp, pilot.hp, 10000000)
    || !integer(pilot.x, -arena.halfWidth+pilot.hitRadius, arena.halfWidth-pilot.hitRadius)
    || !integer(pilot.z, -arena.halfHeight+pilot.hitRadius, arena.halfHeight-pilot.hitRadius)
    || !integer(pilot.armor, 0, 90) || !integer(pilot.atk, 0, 1000000)
    || !integer(pilot.movePerTick, 1, 3000)
    || !integer(pilot.fireEveryTicks, 2, 1800)
    || !integer(pilot.shotSpeed, 100, 4000)
    || !integer(pilot.critChancePermille, 0, 900)
    || !integer(pilot.critBonusPermille, 0, 10000)
    || !integer(pilot.dodgeChancePermille, 0, 900)) {
    deny('CORE_CONFIG_INVALID', 'Invalid server pilot snapshot');
  }
  if (!Array.isArray(enemies) || enemies.length > MAX_ENEMIES
    || !integer(seed, 1, UINT32_MAX)) {
    deny('CORE_CONFIG_INVALID', 'Invalid server enemies or seed');
  }
  const ids = new Set();
  for (const enemy of enemies) {
    if (!exact(enemy, ENEMY_KEYS)
      || typeof enemy.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(enemy.id)
      || ids.has(enemy.id)
      || !integer(enemy.x, -arena.halfWidth, arena.halfWidth)
      || !integer(enemy.z, -arena.halfHeight, arena.halfHeight)
      || !integer(enemy.hp, 1, 10000000)
      || !integer(enemy.speedPerTick, 0, 1000)
      || !integer(enemy.damage, 0, 1000000)
      || !integer(enemy.hitRadius, 100, 5000)
      || !['static','chase'].includes(enemy.behavior)) {
      deny('CORE_CONFIG_INVALID', 'Invalid server enemy snapshot');
    }
    ids.add(enemy.id);
  }
}

function seal(data) {
  const {stateDigest: ignoredPreviousDigest, ...value} = data;
  value.stateDigest = hash(['sf-v8b2a-combat-state', value]);
  return deepFreeze(value);
}
function verifyState(state) {
  if (!exact(state, STATE_KEYS) || state.coreVersion !== CORE_VERSION
    || state.protocol !== PROTOCOL_VERSION || !integer(state.tick, 0, MAX_BATTLE_TICKS)
    || !integer(state.nextBulletId, 0, MAX_BATTLE_TICKS)
    || !integer(state.enemyKills, 0, MAX_ENEMIES)
    || !integer(state.seed, 1, UINT32_MAX) || !integer(state.rngState, 1, UINT32_MAX)
    || !Array.isArray(state.bullets) || state.bullets.length > MAX_BULLETS
    || !Array.isArray(state.enemies) || state.enemies.length > MAX_ENEMIES
    || !exact(state.pilot, PILOT_KEYS) || !exact(state.arena, ARENA_KEYS)
    || !/^[a-f0-9]{64}$/.test(state.journalDigest || '')
    || !/^[a-f0-9]{64}$/.test(state.stateDigest || '')) {
    deny('CORE_STATE_INVALID', 'Invalid combat state envelope');
  }
  const {stateDigest, ...withoutDigest} = state;
  if (hash(['sf-v8b2a-combat-state', withoutDigest]) !== stateDigest) {
    deny('CORE_STATE_INVALID', 'Combat state integrity mismatch');
  }
  if (!integer(state.pilot.hp, 0, state.pilot.maxHp)
    || !integer(state.pilot.x, -state.arena.halfWidth, state.arena.halfWidth)
    || !integer(state.pilot.z, -state.arena.halfHeight, state.arena.halfHeight)) {
    deny('CORE_STATE_INVALID', 'Invalid simulated pilot position or HP');
  }
  const ids = new Set();
  for (const enemy of state.enemies) {
    if (!exact(enemy, ENEMY_KEYS) || !integer(enemy.hp, 1, 10000000) || ids.has(enemy.id)) {
      deny('CORE_STATE_INVALID', 'Invalid simulated enemy');
    }
    ids.add(enemy.id);
  }
  const shotIds = new Set();
  for (const bullet of state.bullets) {
    if (!exact(bullet, BULLET_KEYS) || !integer(bullet.id, 1, state.nextBulletId)
      || shotIds.has(bullet.id) || !Number.isSafeInteger(bullet.x)
      || !Number.isSafeInteger(bullet.z) || !integer(bullet.atk, 0, 1000000)
      || !integer(bullet.hitRadius, 10, 1500)) {
      deny('CORE_STATE_INVALID', 'Invalid simulated projectile');
    }
    shotIds.add(bullet.id);
  }
  // Hash is a deterministic checksum, NOT an authentication code. Never
  // accept a client-authored state, even if its checksum matches.
}

/** Caller is a future trusted server admission handler, NEVER an API payload. */
function openCombatCore(config) {
  if (!exact(config, OPEN_KEYS)) {
    deny('CORE_CONFIG_INVALID', 'Unexpected server combat configuration keys');
  }
  const {journal, seed, arena, pilot, enemies} = config;
  assertContext(journal);
  assertConfig({seed, arena, pilot, enemies});
  return seal({
    coreVersion:CORE_VERSION, protocol:PROTOCOL_VERSION,
    uid:journal.uid, sessionId:journal.sessionId, battleId:journal.battleId,
    rulesVersion:journal.rulesVersion, loadoutHash:journal.loadoutHash,
    journalDigest:journal.digest, tick:0, seed, rngState:seed,
    arena:{...arena}, pilot:{...pilot},
    enemies:enemies.map(e=>({...e})).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    bullets:[], nextBulletId:0, enemyKills:0,
  });
}
function randomRoll(seed) {
  let next = seed >>> 0;
  next ^= next << 13; next ^= next >>> 17; next ^= next << 5;
  next >>>= 0;
  return {value:next % 1000, seed:next || 1};
}
const circleHit = (x1,z1,r1,x2,z2,r2) => {
  const dx=x1-x2, dz=z1-z2, radius=r1+r2;
  return dx*dx + dz*dz <= radius*radius;
};
// Swept test handles bullets that cross a target between two fixed ticks.
function sweptHit(x0,z0,x1,z1,radius, ex,ez) {
  const dx=x1-x0, dz=z1-z0, sq=dx*dx+dz*dz;
  const t=sq===0?0:clamp(((ex-x0)*dx+(ez-z0)*dz)/sq,0,1);
  const px=x0+dx*t-ex, pz=z0+dz*t-ez;
  return px*px+pz*pz <= radius*radius ? t : null;
}
function advanceOne(state, input) {
  const nextTick=state.tick+1;
  const arena=state.arena, pilot={...state.pilot};
  const enemies=state.enemies.map(e=>({...e}));
  const bullets=state.bullets.map(b=>({...b}));
  let nextBulletId=state.nextBulletId, enemyKills=state.enemyKills;
  let rngState=state.rngState;
  if (pilot.hp>0) {
    // V8B1 x=+127 means screen-right, which is Babylon world -X.
    pilot.x=clamp(pilot.x-Math.round(input[0]*pilot.movePerTick/INPUT_MAX),
      -arena.halfWidth+pilot.hitRadius, arena.halfWidth-pilot.hitRadius);
    pilot.z=clamp(pilot.z+Math.round(input[1]*pilot.movePerTick/INPUT_MAX),
      -arena.halfHeight+pilot.hitRadius, arena.halfHeight-pilot.hitRadius);
    for (let i=enemies.length-1;i>=0;i--) {
      const enemy=enemies[i];
      if (enemy.behavior==='chase' && enemy.speedPerTick>0) {
        const dx=pilot.x-enemy.x, dz=pilot.z-enemy.z, length=Math.hypot(dx,dz);
        if (length>0) {
          enemy.x+=Math.round(dx/length*enemy.speedPerTick);
          enemy.z+=Math.round(dz/length*enemy.speedPerTick);
        }
      }
      if (circleHit(pilot.x,pilot.z,pilot.hitRadius,enemy.x,enemy.z,enemy.hitRadius)) {
        if (enemy.damage>0) {
          const roll=randomRoll(rngState); rngState=roll.seed;
          if (roll.value>=pilot.dodgeChancePermille) {
            const mitigation=clamp(pilot.armor/100,0,.9);
            pilot.hp=Math.max(0,pilot.hp-Math.max(1,Math.floor(enemy.damage*(1-mitigation))));
          }
        }
        enemies.splice(i,1); // Legacy contact destroys the enemy without a kill reward.
      }
    }
    if (pilot.hp>0 && pilot.atk>0 && (nextTick-1)%pilot.fireEveryTicks===0) {
      if (bullets.length>=MAX_BULLETS) deny('CORE_CAP_REACHED', 'Projectile cap reached');
      nextBulletId+=1;
      bullets.push({id:nextBulletId,x:pilot.x,z:pilot.z-750,atk:pilot.atk,hitRadius:pilot.bulletRadius});
    }
    for (let i=bullets.length-1;i>=0;i--) {
      const b=bullets[i];
      const oldZ=b.z;
      b.z-=pilot.shotSpeed;
      let bestIndex=-1, bestT=Infinity;
      for (let j=0;j<enemies.length;j++) {
        const enemy=enemies[j];
        const t=sweptHit(b.x,oldZ,b.x,b.z,b.hitRadius+enemy.hitRadius,enemy.x,enemy.z);
        if (t!==null && t<bestT) { bestT=t;bestIndex=j; }
      }
      if (bestIndex!==-1) {
        const roll=randomRoll(rngState); rngState=roll.seed;
        const damage=roll.value<pilot.critChancePermille
          ? Math.max(1,Math.floor(b.atk*(1000+pilot.critBonusPermille)/1000))
          : b.atk;
        const enemy=enemies[bestIndex];
        enemy.hp-=damage;
        bullets.splice(i,1);
        if (enemy.hp<=0) {enemies.splice(bestIndex,1); enemyKills+=1;}
      } else if (b.z < -arena.halfHeight-5000) {
        bullets.splice(i,1);
      }
    }
  } else {
    bullets.length=0;
  }
  return {...state, tick:nextTick, pilot, enemies, bullets, nextBulletId, enemyKills, rngState};
}

/**
 * A server accepts a V8B1 chunk, then replays identical quantized controls.
 * Pure: returns a new immutable pair; caller must persist both atomically.
 * No winner flag or reward API is exposed.
 */
function replayAcceptedChunk(args) {
  if (!exact(args, REPLAY_KEYS)) {
    deny('CORE_CONTEXT_MISMATCH', 'Unexpected replay arguments');
  }
  const {state, journal, chunk, receivedAtMs} = args;
  verifyState(state);
  if (!isRecord(journal)
    || state.battleId!==journal.battleId || state.uid!==journal.uid
    || state.sessionId!==journal.sessionId || state.rulesVersion!==journal.rulesVersion
    || state.loadoutHash!==journal.loadoutHash || state.tick!==journal.nextTick
    || state.journalDigest!==journal.digest) {
    deny('CORE_CONTEXT_MISMATCH', 'Journal and simulator checkpoint do not match');
  }
  // V8B1 validates exact packet keys, tick order and server time. The core
  // never trusts client-reported damage, enemy deaths, hp, rewards or victory.
  const validated=validateChunk(chunk);
  const receipt=ingestInputChunk(journal,chunk,receivedAtMs);
  if (receipt.duplicate) return Object.freeze({state,journal,duplicate:true});
  let result=state;
  for (const frame of validated.frames) result=advanceOne(result,frame);
  return Object.freeze({
    state:seal({...result,journalDigest:receipt.journal.digest}),
    journal:receipt.journal, duplicate:false,
  });
}
module.exports=Object.freeze({
  CORE_VERSION, TICK_HZ, UNITS_PER_WORLD, MAX_ENEMIES, MAX_BULLETS,
  CombatCoreError, openCombatCore, replayAcceptedChunk,
});
