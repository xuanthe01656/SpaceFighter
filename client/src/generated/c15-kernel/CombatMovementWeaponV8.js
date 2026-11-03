/**
 * SpaceFighter V8B-2C2A - offline-only movement and main-weapon timing preview.
 *
 * TRUST BOUNDARY: The snapshot MUST have been produced in a trusted server
 * context from authenticated identity, persisted inventory and pinned catalog.
 * Snapshot hashes/frozen objects are NOT cryptographic authorisation.
 * Never expose these helpers through HTTP, GameService, reward settlement or
 * a client supplied 'snapshot'. V8A/P0 remains locked.
 *
 * This contract represents legacy keyboard movement, not instantaneous touch
 * drag; its legacy policy previews beam/single, while C6-A adds an
 * explicitly gated QA-only ballistic policy for three static spread salvos.
 * C6-B adds another isolated QA policy for rail piercing and delayed pulse
 * burst shots. Live timeout scheduling and touch remain unverified.
 * It intentionally
 * does NOT model HP losses, buffs, wingman/drone, boss, victory or rewards.
 */
import {SNAPSHOT_VERSION,CORE_VERSION,TICK_HZ,UNITS_PER_WORLD} from './C15KernelConstants.js';

import {PROTOCOL_VERSION,MAX_BATTLE_TICKS} from './CombatInputJournalV8.js';

const FOUNDATION_VERSION = 'pve-movement-weapon-preview-v1';
const POLICY_VERSION = 'v8b2c2-keyboard-preview-v1';
const BALLISTIC_POLICY_VERSION = 'v8c6a-ballistic-preview-v2';
const PIERCE_BURST_POLICY_VERSION = 'v8c6b-pierce-burst-preview-v3';
const ARCADE_POLICY_VERSION = 'v8c6b-pierce-burst-preview-v4-arcade';
const RC5_ARCADE_POLICY_VERSION = 'v8c6b-pierce-burst-preview-v5-arcade-rc5';
// Isolated QA allowlists, pinned to current client catalog descriptors.
// Homing, splash, wave, charge, ion and all auxiliaries remain UNSUPPORTED.
// These are NOT production loadout catalog resolvers.
const BALLISTIC_PAIRS = Object.freeze({spread3:'laser',spread5:'photon',shotgun:'plasma'});
const PIERCE_BURST_PAIRS = Object.freeze({pierce:'rail',burst:'pulse'});
const TIMER_VERSION = 'v8b2c2-main-fire-clock-v1';
const MICROSECONDS_PER_SECOND = 1000000;
const MAX_CHUNK_TICKS = 60;
const HASH_RE = /^[a-f0-9]{64}$/;

class MovementWeaponError extends Error {
  constructor(code, message) { super(message); this.name = 'MovementWeaponError'; this.code = code; }
}
const deny = (code, message) => { throw new MovementWeaponError(code, message); };
const record = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null)
  && Object.values(Object.getOwnPropertyDescriptors(obj)).every(d => Object.hasOwn(d, 'value'));
const exact = (obj, names) => record(obj) && Object.keys(obj).length === names.length
  && names.every(name => Object.hasOwn(obj, name));
const safeInt = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const freeze = obj => {
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) freeze(value);
    Object.freeze(obj);
  }
  return obj;
};

/** Server-pinned keyboard policy. No default pilot radius is invented. */
function previewFromTrustedSnapshot(snapshot, policy) {
  if (!exact(policy, ['version', 'keyboardUnitsPer60HzFrame', 'pilotHitRadiusUnits', 'projectileHitRadiusUnits'])
    || ![POLICY_VERSION,BALLISTIC_POLICY_VERSION,PIERCE_BURST_POLICY_VERSION,ARCADE_POLICY_VERSION,RC5_ARCADE_POLICY_VERSION].includes(policy.version)
    || !finite(policy.keyboardUnitsPer60HzFrame, 0.01, 1.5)
    || !safeInt(policy.pilotHitRadiusUnits, 100, 2500)
    || !safeInt(policy.projectileHitRadiusUnits, 10, 1500)) {
    deny('FOUNDATION_POLICY_INVALID', 'Expected pinned server-only keyboard policy');
  }
  if (!exact(snapshot, ['snapshotVersion', 'context', 'seed', 'arena', 'equipment', 'selectedCatalogHash', 'loadoutHash', 'snapshotHash'])
    || snapshot.snapshotVersion !== SNAPSHOT_VERSION
    || !Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.equipment)
    || !Object.isFrozen(snapshot.arena) || !Object.isFrozen(snapshot.context)
    || !record(snapshot.context) || snapshot.context.coreVersion !== CORE_VERSION
    || snapshot.context.protocolVersion !== PROTOCOL_VERSION
    || !HASH_RE.test(snapshot.loadoutHash || '') || !HASH_RE.test(snapshot.snapshotHash || '')
    || !record(snapshot.arena) || !record(snapshot.equipment)) {
    deny('FOUNDATION_SNAPSHOT_INVALID', 'Expected server-created V8B-2C1 snapshot');
  }
  const arena = snapshot.arena;
  const air = snapshot.equipment.aircraft;
  const pilot = snapshot.equipment.pilot;
  const gun = snapshot.equipment.mainGun;
  if (!record(air) || !record(pilot) || !record(gun)
    || !safeInt(arena.halfWidthUnits, 2000, 50000)
    || !safeInt(arena.halfHeightUnits, 2000, 50000)
    || !safeInt(arena.spawnXUnits, -arena.halfWidthUnits, arena.halfWidthUnits)
    || !safeInt(arena.spawnZUnits, -arena.halfHeightUnits, arena.halfHeightUnits)
    || !safeInt(air.level, 1, 1000) || !safeInt(air.baseArmor, 0, 1000)
    || !safeInt(air.baseAtk, 0, 1000000) || !finite(air.speed, 0.1, 100)
    || !safeInt(gun.level, 1, 1000) || !safeInt(gun.rarity, 1, 5)
    || !finite(gun.baseAtk, 0, 1000000)
    || !finite(gun.fireRate, 0.001, 60) || gun.fireRateUnit !== 'seconds') {
    deny('FOUNDATION_SNAPSHOT_INVALID', 'Invalid trusted arena or selected combat descriptors');
  }
  const left = arena.halfWidthUnits - policy.pilotHitRadiusUnits;
  const top = arena.halfHeightUnits - policy.pilotHitRadiusUnits;
  if (left < 0 || top < 0 || Math.abs(arena.spawnXUnits) > left
    || Math.abs(arena.spawnZUnits) > top) {
    deny('FOUNDATION_SPAWN_OUTSIDE_CORE', 'Server-owned spawn exceeds safe pilot-radius bounds');
  }
  // Client derives armor without clamping the aircraft level-up result;
  // existing V8B-2A core caps armor at 90. Fail visibly, never rebalance.
  const armor = Math.floor(air.baseArmor * (1 + (air.level - 1) * 0.05));
  if (armor > 90) deny('FOUNDATION_ARMOR_CORE_GAP', 'Derived armor exceeds existing core validator');
  const movementBonus = pilot.passive === 'movement_speed' ? Number(pilot.value) : 0;
  if (!finite(movementBonus, -0.9, 10)) {
    deny('FOUNDATION_PASSIVE_INVALID', 'Invalid movement passive in trusted snapshot');
  }
  const speed = air.speed * (1 + movementBonus);
  const speedMultiplier = clamp(speed / 6, 0.15, 3);
  const rawMovePerTickUnits = Math.round(policy.keyboardUnitsPer60HzFrame * UNITS_PER_WORLD * 2 * speedMultiplier);
  const movePerTickUnits = policy.version === RC5_ARCADE_POLICY_VERSION ? Math.min(3600,rawMovePerTickUnits) : rawMovePerTickUnits;
  if (!safeInt(movePerTickUnits, 1, policy.version === RC5_ARCADE_POLICY_VERSION ? 3600 : 3000)) {
    deny('FOUNDATION_MOVEMENT_UNSUPPORTED', 'Movement exceeds core tick limits');
  }
  // Same main-gun progression formula as client fireIntervalMs(seconds).
  const fireIntervalMs = Math.max(50, gun.fireRate * 1000 * Math.pow(0.985, gun.level - 1));
  const periodUs = Math.round(fireIntervalMs * 1000);
  if (!safeInt(periodUs, 50000, 60000000)) {
    deny('FOUNDATION_FIRE_RATE_UNSUPPORTED', 'Fire interval is outside preview bounds');
  }
  // V8B legacy keeps two guns; C6-A permits static spreads; C6-B permits
  // isolated pierce/burst only. C2B events are clock markers; the versioned
  // QA slices handle multi-shot materialisation, NOT a battle verifier.
  const pattern = gun.firePattern;
  const projectileType = gun.projectileType;
  const supported = (pattern === 'beam' && projectileType === 'laser')
    || (pattern === 'single' && projectileType === 'plasma')
    || (policy.version === BALLISTIC_POLICY_VERSION && Object.hasOwn(BALLISTIC_PAIRS,pattern)
      && BALLISTIC_PAIRS[pattern] === projectileType)
    || ([PIERCE_BURST_POLICY_VERSION,ARCADE_POLICY_VERSION,RC5_ARCADE_POLICY_VERSION].includes(policy.version)
      && Object.hasOwn(PIERCE_BURST_PAIRS,pattern)
      && PIERCE_BURST_PAIRS[pattern] === projectileType);
  if (!supported) deny('FOUNDATION_WEAPON_PATTERN_UNMODELED', 'Weapon needs a separate verified projectile rule');
  const bulletSpeedUnitsPerTick = pattern === 'beam' ? 2300 : pattern === 'single' ? 1260
    : pattern === 'shotgun' ? 1720 : pattern === 'pierce' ? 2700
      : pattern === 'burst' ? 1900 : 1700;
  const perLevel = Math.max(1, Math.round(gun.baseAtk * 0.1 + gun.rarity * 2));
  const gunAtk = gun.baseAtk + perLevel * (gun.level - 1);
  const aircraftAtk = Math.floor(air.baseAtk * (1 + (air.level - 1) * 0.05));
  const damageMultiplier = pilot.passive === 'main_damage_boost' ? 1 + Number(pilot.value) : 1;
  if (!finite(damageMultiplier, 0.1, 10)) deny('FOUNDATION_PASSIVE_INVALID', 'Invalid main damage passive');
  const projectileAtk = Math.floor((aircraftAtk + gunAtk) * damageMultiplier);
  if (!safeInt(projectileAtk, 0, 1000000)) deny('FOUNDATION_DAMAGE_UNSUPPORTED', 'Main gun damage exceeds core bounds');
  return freeze({
    version: FOUNDATION_VERSION, previewOnly: true, safeForCloudBattle: false,
    ...([BALLISTIC_POLICY_VERSION,PIERCE_BURST_POLICY_VERSION,ARCADE_POLICY_VERSION,RC5_ARCADE_POLICY_VERSION].includes(policy.version)
      ? {ballisticPolicyVersion:policy.version} : {}),
    rulesVersion: snapshot.context.rulesVersion, loadoutHash: snapshot.loadoutHash,
    arena: {halfWidthUnits:arena.halfWidthUnits, halfHeightUnits:arena.halfHeightUnits},
    startPosition: {xUnits:arena.spawnXUnits, zUnits:arena.spawnZUnits},
    pilotHitRadiusUnits:policy.pilotHitRadiusUnits,
    movePerTickUnits, speedMultiplier, armor,
    mainGun: {pattern, projectileType, periodUs, projectileAtk,
      projectileHitRadiusUnits:policy.projectileHitRadiusUnits,
      shotSpeedUnitsPerTick:bulletSpeedUnitsPerTick, shotSpawnOffsetZUnits:1200},
  });
}

/** Quantised journal input: screen right -> world -X, down -> +Z. */
function advancePreviewMovement(preview, position, input) {
  if (!record(preview) || preview.version !== FOUNDATION_VERSION || preview.safeForCloudBattle !== false
    || !exact(position, ['xUnits','zUnits']) || !exact(input, ['x','z'])
    || !safeInt(input.x, -127, 127) || !safeInt(input.z, -127, 127)
    || input.x*input.x + input.z*input.z > 128*128
    || !safeInt(position.xUnits, -preview.arena.halfWidthUnits + preview.pilotHitRadiusUnits, preview.arena.halfWidthUnits - preview.pilotHitRadiusUnits)
    || !safeInt(position.zUnits, -preview.arena.halfHeightUnits + preview.pilotHitRadiusUnits, preview.arena.halfHeightUnits - preview.pilotHitRadiusUnits)) {
    deny('FOUNDATION_INPUT_INVALID', 'Expected trusted preview state and validated V8B1 input');
  }
  const left = preview.arena.halfWidthUnits - preview.pilotHitRadiusUnits;
  const top = preview.arena.halfHeightUnits - preview.pilotHitRadiusUnits;
  return Object.freeze({
    xUnits: clamp(position.xUnits - Math.round(input.x*preview.movePerTickUnits/127), -left, left),
    zUnits: clamp(position.zUnits + Math.round(input.z*preview.movePerTickUnits/127), -top, top),
  });
}

/** Offline projectile reference only. No hit/damage/settlement authority. */
function previewMainProjectile(preview, position) {
  if (!record(preview) || preview.version !== FOUNDATION_VERSION
    || !exact(position, ['xUnits', 'zUnits'])
    || !safeInt(position.xUnits, -preview.arena.halfWidthUnits, preview.arena.halfWidthUnits)
    || !safeInt(position.zUnits, -preview.arena.halfHeightUnits, preview.arena.halfHeightUnits)) {
    deny('FOUNDATION_PROJECTILE_INVALID', 'Invalid preview projectile origin');
  }
  return Object.freeze({
    xUnits: position.xUnits,
    zUnits: position.zUnits - preview.mainGun.shotSpawnOffsetZUnits,
    velocityXUnitsPerTick: 0,
    velocityZUnitsPerTick: -preview.mainGun.shotSpeedUnitsPerTick,
    atk: preview.mainGun.projectileAtk,
    pattern: preview.mainGun.pattern,
    projectileType: preview.mainGun.projectileType,
  });
}

const shotTick = (periodUs, index) => 1 + Math.ceil(index * periodUs * TICK_HZ / MICROSECONDS_PER_SECOND);
const CLOCK_KEYS = ['version','periodUs','processedThroughTick','nextShotIndex'];
/** First shot occurs on tick 1, matching the old core's initial cadence. */
function openFireClock(periodUs) {
  if (!safeInt(periodUs, 50000, 60000000)) {
    deny('FOUNDATION_CLOCK_INVALID', 'Invalid trusted main-gun period');
  }
  return Object.freeze({version:TIMER_VERSION, periodUs, processedThroughTick:0, nextShotIndex:0});
}
function advanceFireClock(clock, throughTick) {
  if (!exact(clock, CLOCK_KEYS) || clock.version !== TIMER_VERSION
    || !safeInt(clock.periodUs, 50000, 60000000)
    || !safeInt(clock.processedThroughTick, 0, MAX_BATTLE_TICKS)
    || !safeInt(clock.nextShotIndex, 0, MAX_BATTLE_TICKS)
    || !safeInt(throughTick, clock.processedThroughTick, MAX_BATTLE_TICKS)
    || throughTick-clock.processedThroughTick > MAX_CHUNK_TICKS
    || (clock.nextShotIndex > 0 && shotTick(clock.periodUs, clock.nextShotIndex - 1) > clock.processedThroughTick)
    || shotTick(clock.periodUs, clock.nextShotIndex) <= clock.processedThroughTick) {
    deny('FOUNDATION_CLOCK_INVALID', 'Invalid or divergent server-owned fire clock');
  }
  const due = [];
  let index = clock.nextShotIndex;
  while (shotTick(clock.periodUs, index) <= throughTick) {
    due.push(shotTick(clock.periodUs, index));
    index++;
    if (due.length > MAX_CHUNK_TICKS || index > MAX_BATTLE_TICKS) {
      deny('FOUNDATION_CLOCK_LIMIT', 'Unexpected number of scheduled shots');
    }
  }
  return freeze({clock:{version:TIMER_VERSION, periodUs:clock.periodUs,
    processedThroughTick:throughTick, nextShotIndex:index}, shotTicks:due});
}
export {FOUNDATION_VERSION,POLICY_VERSION,ARCADE_POLICY_VERSION,RC5_ARCADE_POLICY_VERSION,TIMER_VERSION,MovementWeaponError,previewFromTrustedSnapshot,advancePreviewMovement,previewMainProjectile,openFireClock,advanceFireClock};
