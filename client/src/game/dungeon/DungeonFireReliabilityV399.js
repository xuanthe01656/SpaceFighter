/**
 * Dungeon fire reliability V3.9.9 (Dungeon-only, presentation/combat adapter).
 *
 * Campaign choreography returns mayFire, fireWindup, playerRange, and
 * fireRangeMin/Max. It does not return forwardDepth/lateralDistance/directDistance.
 * Derive those quantities from the actual logical enemy/player positions rather
 * than reading undefined choreography fields, which previously disabled the
 * V3.9.8 recovery window for every real enemy.
 *
 * This module NEVER changes projectile damage, cooldown, FSM or server authority.
 */
export const DUNGEON_FIRE_RELIABILITY_VERSION_V399 = 'dungeon-fire-reliability-v3.9.9';

const GRACE_MS = Object.freeze({
  raider: 820,
  gunner: 1080,
  shieldbearer: 1260,
  support: 1180,
  artillery: 1420,
});
const LATERAL_MAX = Object.freeze({
  raider: 6.2,
  gunner: 5.4,
  shieldbearer: 5.0,
  support: 5.7,
  artillery: 6.1,
});
const hashParts = (...parts) => {
  let hash = 2166136261;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
};
const finite = value => Number.isFinite(value);
const decision = (mayFire, forced, blockedSinceMs, reason, extras = {}) => Object.freeze({
  mayFire, forced, blockedSinceMs, reason, ...extras,
});

/**
 * The shared FSM is authoritative if it permits firing. Only a genuinely
 * blocked wind-up can use Dungeon-specific recovery, after a bounded grace.
 */
export function resolveDungeonEnemyFireDecisionV399({
  choreography = null,
  roleId = 'gunner',
  seed = 1,
  nowMs = 0,
  blockedSinceMs = null,
  enemyX = NaN,
  enemyZ = NaN,
  playerX = NaN,
  playerZ = NaN,
  canShoot = true,
  hasProjectile = true,
} = {}) {
  if (!canShoot || !hasProjectile || roleId === 'charger') {
    return decision(false, false, null, 'non_ranged_role');
  }
  if (!choreography) return decision(false, false, null, 'no_choreography');
  if (choreography.mayFire === true) return decision(true, false, null, 'shared_ready');
  if (choreography.fireWindup !== true) return decision(false, false, null, 'no_fire_intent');

  // Fail closed: never use zero defaults for missing world-space coordinates.
  if (![enemyX, enemyZ, playerX, playerZ].every(finite)) {
    return decision(false, false, null, 'invalid_position');
  }
  const forwardDepth = playerZ - enemyZ;
  const lateralDistance = Math.abs(playerX - enemyX);
  const directDistance = Math.hypot(playerX - enemyX, forwardDepth);
  const authoredMin = finite(choreography.fireRangeMin)
    ? choreography.fireRangeMin : 4;
  const authoredMax = finite(choreography.fireRangeMax)
    ? choreography.fireRangeMax : Math.max(7, authoredMin + 3);
  const minRange = Math.max(1.8, authoredMin * .78);
  const maxRange = Math.max(minRange + 1, authoredMax * 1.30);
  const lateralLimit = finite(choreography.lateralLimit)
    ? Math.max(2.5, choreography.lateralLimit)
    : (LATERAL_MAX[roleId] ?? LATERAL_MAX.gunner);
  const geometryReady = forwardDepth >= minRange && forwardDepth <= maxRange
    && lateralDistance <= lateralLimit
    && directDistance <= maxRange * 1.48;
  const geometry = { forwardDepth, lateralDistance, directDistance, geometryReady };
  if (!geometryReady) {
    // Wind-up must restart when the ship returns to a valid firing envelope.
    return decision(false, false, null, 'out_of_envelope', geometry);
  }

  // Number(null) is zero. Do not treat a null timestamp as an actual start.
  const started = blockedSinceMs !== null && blockedSinceMs !== undefined
    && finite(blockedSinceMs) && blockedSinceMs <= nowMs
    ? blockedSinceMs : nowMs;
  const jitter = hashParts(seed, roleId, choreography.phaseId || 'phase', 'fire-grace') % 181;
  const graceMs = (GRACE_MS[roleId] ?? GRACE_MS.gunner) + jitter;
  const elapsedMs = Math.max(0, nowMs - started);
  if (elapsedMs < graceMs) {
    return decision(false, false, started, 'windup', { ...geometry, elapsedMs, graceMs });
  }
  return decision(true, true, started, 'dungeon_arrival_recovery', {
    ...geometry, elapsedMs, graceMs,
  });
}

/** Prevent premature or duplicate volleys without adjusting catalog cadence. */
export function resolveDungeonVolleyReadinessV399({
  mayFire = false,
  canShoot = false,
  hasProjectile = false,
  nowMs = 0,
  lastShoot = 0,
  shootMs = 0,
} = {}) {
  if (!canShoot || !hasProjectile) return Object.freeze({ allowed: false, reason: 'no_weapon' });
  if (!mayFire) return Object.freeze({ allowed: false, reason: 'no_fire_window' });
  if (![nowMs, lastShoot, shootMs].every(finite) || shootMs <= 0) {
    return Object.freeze({ allowed: false, reason: 'invalid_cadence' });
  }
  if (nowMs <= lastShoot + shootMs) {
    return Object.freeze({ allowed: false, reason: 'cooldown' });
  }
  return Object.freeze({ allowed: true, reason: 'ready' });
}

/** Volatile QA-only counters; never persisted or sent to the game server. */
export function createDungeonFireQaMonitorV399({ enabled = false, dungeonId = 'unknown' } = {}) {
  const counts = Object.create(null);
  let lastLogMs = null;
  const record = (roleId, event) => {
    if (!enabled) return;
    const role = GRACE_MS[roleId] ? roleId : String(roleId || 'unknown').slice(0, 32);
    const name = String(event || 'unknown').slice(0, 40);
    if (!counts[role]) counts[role] = Object.create(null);
    counts[role][name] = (counts[role][name] || 0) + 1;
  };
  const snapshot = () => Object.freeze({
    version: DUNGEON_FIRE_RELIABILITY_VERSION_V399,
    dungeonId,
    byRole: Object.fromEntries(Object.entries(counts).map(([role, row]) => [role, { ...row }])),
  });
  const maybeLog = (nowMs, logger) => {
    if (!enabled || !finite(nowMs) || typeof logger !== 'function') return false;
    if (lastLogMs === null) { lastLogMs = nowMs; return false; }
    if (nowMs - lastLogMs < 8000) return false;
    lastLogMs = nowMs;
    if (Object.keys(counts).length === 0) return false;
    logger('[DUNGEON_FIRE_QA_V399]', snapshot());
    return true;
  };
  return Object.freeze({ record, snapshot, maybeLog });
}

export function auditDungeonFireReliabilityV399() {
  const errors = [];
  const intent = { mayFire: false, fireWindup: true, phaseId: 'firing_slot',
    fireRangeMin: 5, fireRangeMax: 9, playerRange: 7.07, rangeReady: false };
  const early = resolveDungeonEnemyFireDecisionV399({
    choreography: intent, roleId: 'gunner', nowMs: 1000,
    enemyX: 0, enemyZ: 0, playerX: 1, playerZ: 7,
  });
  const recovery = resolveDungeonEnemyFireDecisionV399({
    choreography: intent, roleId: 'gunner', nowMs: 3000, blockedSinceMs: 1000,
    enemyX: 0, enemyZ: 0, playerX: 1, playerZ: 7,
  });
  if (early.mayFire || early.blockedSinceMs !== 1000) errors.push('WINDUP_TIMESTAMP');
  if (!recovery.mayFire || !recovery.forced) errors.push('RECOVERY_NEVER_FIRES');
  if (resolveDungeonEnemyFireDecisionV399({ choreography: intent, roleId: 'charger',
    enemyX: 0, enemyZ: 0, playerX: 0, playerZ: 7 }).mayFire) errors.push('CHARGER_SHOT');
  return Object.freeze(errors);
}
