/**
 * Dungeon production tuning V3.9.8.
 *
 * Dungeon reuses the locked Campaign combat FSM and slot allocator. This module
 * adds Dungeon-only presentation/runtime guardrails: compact-screen formation
 * spread, deterministic local separation and a fail-safe fire window when a
 * ranged enemy is visibly aiming but cannot satisfy an exact arrival radius.
 * It does not own HP, damage, rewards, progression or server authority.
 */
export const DUNGEON_PRODUCTION_TUNING_VERSION = 'dungeon-production-tuning-v3.9.8';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const freeze = value => Object.freeze(value);
const hashParts = (...parts) => {
  let hash = 2166136261;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
};

const ROLE_FORMATION_V398 = Object.freeze({
  raider:       Object.freeze({ trackingScale: .82, spacingFloor: 1.95, depthJitter: .20 }),
  charger:      Object.freeze({ trackingScale: .82, spacingFloor: 2.05, depthJitter: .18 }),
  gunner:       Object.freeze({ trackingScale: .76, spacingFloor: 2.12, depthJitter: .24 }),
  shieldbearer: Object.freeze({ trackingScale: .74, spacingFloor: 2.28, depthJitter: .26 }),
  support:      Object.freeze({ trackingScale: .72, spacingFloor: 2.20, depthJitter: .30 }),
  artillery:    Object.freeze({ trackingScale: .68, spacingFloor: 2.42, depthJitter: .34 }),
});

const ROLE_FIRE_GRACE_MS_V398 = Object.freeze({
  raider: 820,
  gunner: 1080,
  shieldbearer: 1260,
  support: 1180,
  artillery: 1420,
});

const ROLE_MAX_LATERAL_V398 = Object.freeze({
  raider: 6.2,
  gunner: 5.4,
  shieldbearer: 5.0,
  support: 5.7,
  artillery: 6.1,
});

/**
 * Project a shared Campaign combat slot into a slightly wider Dungeon formation.
 * The slot lease and slotId remain unchanged; only presentation coordinates are
 * adjusted. This avoids role-mixed enemies collapsing after compact HUD clamps.
 */
export function resolveDungeonCombatSlotV398({
  slot = null,
  seed = 1,
  roleId = 'gunner',
  difficultyRank = 1,
} = {}) {
  if (!slot) return null;
  const profile = ROLE_FORMATION_V398[roleId] || ROLE_FORMATION_V398.gunner;
  const salt = hashParts(seed, roleId, slot.slotId || 'slot', 'dungeon-v398');
  const laneJitter = (((salt >>> 5) % 1001) / 1000 - .5) * .08;
  const depthSign = ((salt >>> 17) % 3) - 1;
  const rank = clamp(Math.round(finite(difficultyRank, 1)), 1, 3);
  return freeze({
    ...slot,
    laneNorm: clamp(finite(slot.laneNorm, 0) + laneJitter, -.92, .92),
    depthOffset: finite(slot.depthOffset, 0) + depthSign * profile.depthJitter,
    trackingStrength: clamp(
      finite(slot.trackingStrength, .5) * profile.trackingScale,
      .24,
      .52,
    ),
    minSpacing: Math.max(
      finite(slot.minSpacing, 1.9),
      profile.spacingFloor + (rank - 1) * .06,
    ),
    phaseRadius: Math.max(.36, finite(slot.phaseRadius, .5) * 1.06),
    dungeonProjectionVersion: DUNGEON_PRODUCTION_TUNING_VERSION,
  });
}

/**
 * Resolve both a steering hint and a very small direct correction. Steering is
 * consumed by the shared choreography; correction prevents already-overlapped
 * colliders from remaining visually stacked for several seconds.
 */
export function resolveDungeonEnemySeparationV398({
  enemyX = 0,
  enemyZ = 0,
  neighbors = [],
  enemyId = null,
  minSpacing = 2,
  seed = 1,
  frameScale = 1,
} = {}) {
  const radius = clamp(Math.max(1.8, finite(minSpacing, 2)), 1.8, 3.1);
  let sumX = 0;
  let sumZ = 0;
  let contributors = 0;
  let strongestPenetration = 0;
  for (let index = 0; index < neighbors.length; index += 1) {
    const neighbor = neighbors[index];
    const neighborId = neighbor?.runtimeId || neighbor?.id || null;
    if (enemyId && neighborId === enemyId) continue;
    if (neighbor?._dead || neighbor?.mesh?.isDisposed?.()) continue;
    const position = neighbor?.mesh?.position || neighbor;
    let dx = finite(enemyX) - finite(position?.x);
    let dz = finite(enemyZ) - finite(position?.z);
    let distance = Math.hypot(dx, dz);
    if (distance >= radius) continue;
    if (distance <= .001) {
      const ownKey = String(enemyId || `seed:${seed}`);
      const neighborKey = String(neighborId || `neighbor:${index}`);
      const firstKey = ownKey < neighborKey ? ownKey : neighborKey;
      const secondKey = ownKey < neighborKey ? neighborKey : ownKey;
      const direction = ownKey < neighborKey ? -1 : 1;
      const angle = (hashParts(firstKey, secondKey, 'separate') % 6284) / 1000;
      dx = Math.cos(angle) * direction;
      dz = Math.sin(angle) * direction;
      distance = 1;
    }
    const penetration = clamp((radius - distance) / radius, 0, 1);
    strongestPenetration = Math.max(strongestPenetration, penetration);
    sumX += dx / distance * penetration;
    sumZ += dz / distance * penetration;
    contributors += 1;
  }
  if (!contributors) return freeze({
    steeringX: 0,
    steeringZ: 0,
    correctionX: 0,
    correctionZ: 0,
    contributors: 0,
  });
  const length = Math.hypot(sumX, sumZ) || 1;
  const normalX = sumX / length;
  const normalZ = sumZ / length;
  const steeringMagnitude = Math.min(1, .42 + contributors * .16);
  const correctionMagnitude = Math.min(.034 * clamp(finite(frameScale, 1), .25, 2),
    .008 + strongestPenetration * .036);
  return freeze({
    steeringX: normalX * steeringMagnitude,
    steeringZ: normalZ * steeringMagnitude * .72,
    correctionX: normalX * correctionMagnitude,
    correctionZ: normalZ * correctionMagnitude * .62,
    contributors,
  });
}

/**
 * The shared Campaign FSM intentionally requires exact arrival for selected
 * firing phases. On a compact Dungeon arena, separation and HUD-safe clamping
 * can keep an enemy just outside that radius forever. After a readable wind-up,
 * this fail-safe permits one normal catalog volley only when the player is still
 * ahead and inside a bounded expanded fire envelope.
 */
export function resolveDungeonEnemyFireDecisionV398({
  choreography = null,
  roleId = 'gunner',
  seed = 1,
  nowMs = 0,
  blockedSinceMs = null,
} = {}) {
  if (!choreography) return freeze({ mayFire: false, forced: false, blockedSinceMs: null, reason: 'no_choreography' });
  if (choreography.mayFire) {
    return freeze({ mayFire: true, forced: false, blockedSinceMs: null, reason: 'shared_ready' });
  }
  if (!choreography.fireWindup) {
    return freeze({ mayFire: false, forced: false, blockedSinceMs: null, reason: 'no_fire_intent' });
  }

  const started = Number.isFinite(Number(blockedSinceMs)) ? Number(blockedSinceMs) : finite(nowMs, 0);
  const salt = hashParts(seed, roleId, choreography.phaseId || 'phase', 'fire-grace');
  const grace = (ROLE_FIRE_GRACE_MS_V398[roleId] || ROLE_FIRE_GRACE_MS_V398.gunner)
    + (salt % 181);
  const elapsed = Math.max(0, finite(nowMs, 0) - started);
  const minRange = Math.max(1.8, finite(choreography.fireRangeMin, 4) * .78);
  const maxRange = Math.max(minRange + 1,
    finite(choreography.fireRangeMax, finite(choreography.preferredRange, 7) + 2) * 1.30);
  const forwardDepth = finite(choreography.forwardDepth, -1);
  const lateralDistance = Math.abs(finite(choreography.lateralDistance, Infinity));
  const directDistance = finite(choreography.directDistance, Infinity);
  const targetAhead = choreography.targetAhead !== false && forwardDepth > 0;
  const withinDepth = forwardDepth >= minRange && forwardDepth <= maxRange;
  const withinLateral = lateralDistance <= (ROLE_MAX_LATERAL_V398[roleId] || 5.4);
  const withinDirect = directDistance <= maxRange * 1.48;
  const forced = elapsed >= grace && targetAhead && withinDepth && withinLateral && withinDirect;
  return freeze({
    mayFire: forced,
    forced,
    blockedSinceMs: started,
    reason: forced ? 'dungeon_arrival_fail_safe' : 'windup',
    elapsedMs: elapsed,
    graceMs: grace,
  });
}

export function summarizeDungeonDifficultyV398(profile = {}) {
  const stats = profile.enemyStats || {};
  const effectiveHp = Math.max(1, finite(stats.baseHp, 1) * finite(stats.hpMultiplier, 1));
  const pressure = Math.max(.01,
    finite(stats.damageMultiplier, 1)
    * finite(stats.projectileSpeedMultiplier, 1)
    / Math.max(.25, finite(stats.fireCooldownMultiplier, 1)));
  const mobility = Math.max(.01,
    finite(stats.baseSpeed, .04) * finite(stats.speedMultiplier, 1));
  return freeze({
    id: profile.id || 'unknown',
    rank: Math.max(1, Math.round(finite(profile.difficultyRank, 1))),
    effectiveHp,
    pressure,
    mobility,
    recommendedPower: Math.max(0, Math.round(finite(profile.productionProfile?.recommendedPower, 0))),
  });
}

export function auditDungeonDifficultyCurveV398(catalog = {}) {
  const issues = [];
  const order = ['dung_taurus', 'dung_nereus', 'dung_abaddon'];
  const summaries = order.map(id => summarizeDungeonDifficultyV398(catalog[id] || {}));
  for (let index = 1; index < summaries.length; index += 1) {
    const previous = summaries[index - 1];
    const current = summaries[index];
    const hpRatio = current.effectiveHp / previous.effectiveHp;
    const pressureRatio = current.pressure / previous.pressure;
    if (!(current.rank > previous.rank)) issues.push(`DUNGEON_DIFFICULTY_RANK:${current.id}`);
    if (!(current.recommendedPower > previous.recommendedPower)) issues.push(`DUNGEON_POWER_CURVE:${current.id}`);
    if (hpRatio < 1.12 || hpRatio > 1.90) issues.push(`DUNGEON_HP_CURVE:${current.id}:${hpRatio.toFixed(3)}`);
    if (pressureRatio < 1.10 || pressureRatio > 1.60) issues.push(`DUNGEON_PRESSURE_CURVE:${current.id}:${pressureRatio.toFixed(3)}`);
  }
  return Object.freeze(issues);
}

export function auditDungeonProductionTuningV398() {
  const issues = [];
  const slot = resolveDungeonCombatSlotV398({
    slot: { slotId: 'gunner:0', laneNorm: 0, depthOffset: 0, trackingStrength: .6, minSpacing: 1.9, phaseRadius: .62 },
    seed: 77,
    roleId: 'gunner',
    difficultyRank: 2,
  });
  if (!slot || slot.trackingStrength >= .6 || slot.minSpacing < 2.12) issues.push('DUNGEON_SLOT_PROJECTION');
  const separation = resolveDungeonEnemySeparationV398({
    enemyX: 0,
    enemyZ: 0,
    neighbors: [{ id: 'other', x: .2, z: .1 }],
    minSpacing: 2.1,
    seed: 2,
  });
  if (!(Math.hypot(separation.correctionX, separation.correctionZ) > 0)) issues.push('DUNGEON_SEPARATION');
  const decision = resolveDungeonEnemyFireDecisionV398({
    choreography: {
      mayFire: false,
      fireWindup: true,
      phaseId: 'firing_slot',
      targetAhead: true,
      forwardDepth: 7,
      lateralDistance: 1,
      directDistance: 7.1,
      fireRangeMin: 5,
      fireRangeMax: 9,
      preferredRange: 7,
    },
    roleId: 'gunner',
    seed: 1,
    nowMs: 2200,
    blockedSinceMs: 0,
  });
  if (!decision.mayFire || !decision.forced) issues.push('DUNGEON_FIRE_FAIL_SAFE');
  return Object.freeze(issues);
}
