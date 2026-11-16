/**
 * Dungeon Attack Guarantee V4.2.7.
 *
 * Production goals:
 * - a visible ranged enemy cannot live indefinitely without an authentic first
 *   volley merely because shared choreography keeps rotating movement phases;
 * - a charger cannot consume its telegraph/charge cycle while still protected
 *   above the HUD and then enter combat in recovery/return;
 * - required Boss-guard roles are deterministic while all projectile, cadence,
 *   damage and collision authority remain in the existing shared runtime.
 */
export const DUNGEON_ATTACK_GUARANTEE_VERSION_V427 = 'dungeon-attack-guarantee-v4.2.7';

export const DUNGEON_FIRST_VOLLEY_DEADLINE_MS_V427 = Object.freeze({
  raider: 1200,
  gunner: 1300,
  shieldbearer: 1500,
  support: 1500,
  artillery: 1800,
});

export const DUNGEON_CHARGER_VISIBLE_ATTACK_DEADLINE_MS_V427 = 1200;
export const DUNGEON_CHARGER_REARM_DELAY_MS_V427 = 450;

const RANGED_ROLES = new Set(Object.keys(DUNGEON_FIRST_VOLLEY_DEADLINE_MS_V427));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const cleanRole = value => String(value || 'unknown').toLowerCase();
const freeze = value => Object.freeze(value);
const uniqueRoles = values => [...new Set((Array.isArray(values) ? values : [])
  .map(cleanRole).filter(Boolean))];

export function createDungeonAttackGuaranteeStateV427({ roleId = 'unknown' } = {}) {
  return {
    version: DUNGEON_ATTACK_GUARANTEE_VERSION_V427,
    roleId: cleanRole(roleId),
    visibleSinceMs: null,
    firstVolleyAtMs: null,
    firstVolleyForced: false,
    chargerTelegraphs: 0,
    chargerCharges: 0,
    chargerContacts: 0,
    lastChargerPhase: null,
    lastReason: 'created',
  };
}

/**
 * Resolve required deterministic role order for authored room compositions.
 * The caller still owns lane/seed/stat projection and remaining weighted budget.
 */
export function resolveDungeonRequiredRoleSequenceV427({
  requiredRoles = [],
  roleCatalog = {},
  threatBudget = 0,
} = {}) {
  const sequence = [];
  let remainingBudget = Math.max(0, Math.trunc(Number(threatBudget) || 0));
  for (const roleId of uniqueRoles(requiredRoles)) {
    const archetype = roleCatalog?.[roleId];
    if (!archetype) continue;
    const threatCost = Math.max(1, Math.trunc(Number(archetype.threatCost) || 1));
    sequence.push(freeze({ roleId, threatCost, archetype }));
    remainingBudget = Math.max(0, remainingBudget - threatCost);
  }
  return freeze({ sequence: freeze(sequence), remainingBudget });
}

const rangedResult = ({ state, choreography, reason, forced = false, elapsedMs = 0 }) => freeze({
  state,
  choreography,
  reason,
  forced,
  elapsedMs,
});

/**
 * Arm a first-volley clock as soon as a ranged enemy is visible and approaching
 * its authored band. The actual shot is only allowed while inside the authored
 * band and still passes through V399 cooldown + V34 volley + real projectile.
 */
export function resolveDungeonRangedFirstVolleyV427({
  state = null,
  choreography = null,
  roleId = 'gunner',
  nowMs = NaN,
  entryActive = false,
  enemyX = NaN,
  enemyZ = NaN,
  playerX = NaN,
  playerZ = NaN,
  hudOcclusionLineZ = NaN,
  fireRangeMin = NaN,
  fireRangeMax = NaN,
  canShoot = false,
  hasProjectile = false,
} = {}) {
  const role = cleanRole(roleId);
  const current = { ...(state || createDungeonAttackGuaranteeStateV427({ roleId: role })) };
  current.roleId = role;
  if (!RANGED_ROLES.has(role) || !canShoot || !hasProjectile) {
    current.lastReason = 'non_ranged_role';
    return rangedResult({ state: current, choreography, reason: current.lastReason });
  }
  if (!choreography || choreography.handled !== true || choreography.completed) {
    current.lastReason = 'no_choreography';
    return rangedResult({ state: current, choreography, reason: current.lastReason });
  }
  if (current.firstVolleyAtMs !== null) {
    current.lastReason = 'first_volley_complete';
    return rangedResult({ state: current, choreography, reason: current.lastReason });
  }
  if (![nowMs, enemyX, enemyZ, playerX, playerZ, hudOcclusionLineZ,
    fireRangeMin, fireRangeMax].every(finite)
      || fireRangeMin <= 0 || fireRangeMax <= fireRangeMin) {
    current.lastReason = 'invalid_geometry';
    return rangedResult({ state: current, choreography, reason: current.lastReason });
  }
  if (!entryActive || enemyZ < hudOcclusionLineZ + .45) {
    current.visibleSinceMs = null;
    current.lastReason = 'entry_protected';
    return rangedResult({ state: current, choreography, reason: current.lastReason });
  }
  if (choreography.mayFire === true) {
    current.lastReason = 'shared_ready';
    return rangedResult({ state: current, choreography, reason: current.lastReason });
  }

  const depth = playerZ - enemyZ;
  const lateral = Math.abs(playerX - enemyX);
  const approachExtra = role === 'artillery' ? 5.2 : role === 'support' ? 4.4 : 3.8;
  const lateralLimit = Math.max(5.2, fireRangeMax * .88);
  const inApproach = depth > 0 && depth >= fireRangeMin * .82
    && depth <= fireRangeMax + approachExtra && lateral <= lateralLimit;
  if (!inApproach) {
    current.lastReason = 'first_volley_outside_approach';
    return rangedResult({ state: current, choreography, reason: current.lastReason });
  }

  if (!finite(current.visibleSinceMs) || current.visibleSinceMs > nowMs) {
    current.visibleSinceMs = nowMs;
  }
  const elapsedMs = Math.max(0, nowMs - current.visibleSinceMs);
  const inAuthoredBand = depth >= fireRangeMin && depth <= fireRangeMax * 1.05
    && lateral <= lateralLimit;
  if (!inAuthoredBand) {
    current.lastReason = 'first_volley_waiting_band';
    return rangedResult({ state: current, choreography, reason: current.lastReason, elapsedMs });
  }

  const deadlineMs = DUNGEON_FIRST_VOLLEY_DEADLINE_MS_V427[role];
  if (elapsedMs < deadlineMs) {
    current.lastReason = 'first_volley_arming';
    return rangedResult({ state: current, choreography, reason: current.lastReason, elapsedMs });
  }

  current.lastReason = 'first_volley_deadline';
  return rangedResult({
    state: current,
    reason: current.lastReason,
    forced: true,
    elapsedMs,
    choreography: {
      ...choreography,
      mayFire: true,
      fireWindup: false,
      facePlayer: true,
      dungeonFirstVolleyGuaranteeV427: true,
    },
  });
}

export function markDungeonFirstVolleyV427(state, {
  nowMs = NaN,
  forced = false,
} = {}) {
  const current = { ...(state || createDungeonAttackGuaranteeStateV427()) };
  if (current.firstVolleyAtMs !== null || !finite(nowMs)) {
    return freeze({ state: current, recorded: false, timeToFirstVolleyMs: null });
  }
  current.firstVolleyAtMs = nowMs;
  current.firstVolleyForced = Boolean(forced);
  current.lastReason = forced ? 'first_volley_forced_recorded' : 'first_volley_shared_recorded';
  const timeToFirstVolleyMs = finite(current.visibleSinceMs)
    ? Math.max(0, nowMs - current.visibleSinceMs) : null;
  return freeze({ state: current, recorded: true, timeToFirstVolleyMs });
}

const parkCharger = (chargerState, nowMs) => ({
  ...(chargerState || {}),
  phase: 'tracking',
  phaseEndsAtMs: 0,
  nextChargeAtMs: nowMs + DUNGEON_CHARGER_REARM_DELAY_MS_V427,
  lockedDirectionX: finite(chargerState?.lockedDirectionX) ? chargerState.lockedDirectionX : 0,
  lockedDirectionZ: finite(chargerState?.lockedDirectionZ) ? chargerState.lockedDirectionZ : 1,
  returnTargetX: null,
  returnTargetZ: null,
});

/**
 * Prevent chargers from spending telegraph/charge while still entry-protected.
 * Once visible, the normal shared state machine owns the cycle; the watchdog
 * only shortens an abnormally delayed tracking state to a real telegraph.
 */
export function resolveDungeonChargerWatchdogV427({
  state = null,
  chargerState = null,
  nowMs = NaN,
  entryActive = false,
  enemyZ = NaN,
  hudOcclusionLineZ = NaN,
} = {}) {
  const current = { ...(state || createDungeonAttackGuaranteeStateV427({ roleId: 'charger' })) };
  if (![nowMs, enemyZ, hudOcclusionLineZ].every(finite)) {
    current.lastReason = 'invalid_geometry';
    return freeze({ state: current, chargerState, reason: current.lastReason, forced: false });
  }
  const visible = entryActive && enemyZ >= hudOcclusionLineZ + .45;
  if (!visible) {
    current.visibleSinceMs = null;
    current.lastReason = 'charger_entry_protected';
    return freeze({
      state: current,
      chargerState: parkCharger(chargerState, nowMs),
      reason: current.lastReason,
      forced: false,
    });
  }
  if (!finite(current.visibleSinceMs) || current.visibleSinceMs > nowMs) {
    current.visibleSinceMs = nowMs;
  }
  const phase = String(chargerState?.phase || 'tracking');
  const elapsedMs = Math.max(0, nowMs - current.visibleSinceMs);
  if (phase === 'tracking'
      && elapsedMs >= DUNGEON_CHARGER_VISIBLE_ATTACK_DEADLINE_MS_V427
      && finite(chargerState?.nextChargeAtMs)
      && chargerState.nextChargeAtMs > nowMs) {
    current.lastReason = 'charger_watchdog_telegraph';
    return freeze({
      state: current,
      chargerState: { ...chargerState, nextChargeAtMs: nowMs },
      reason: current.lastReason,
      forced: true,
      elapsedMs,
    });
  }
  current.lastReason = `charger_${phase}`;
  return freeze({ state: current, chargerState, reason: current.lastReason, forced: false, elapsedMs });
}

export function observeDungeonChargerStepV427(state, {
  event = null,
  phase = null,
  contact = false,
} = {}) {
  const current = { ...(state || createDungeonAttackGuaranteeStateV427({ roleId: 'charger' })) };
  if (event === 'telegraph_started') current.chargerTelegraphs += 1;
  if (event === 'charge_started') current.chargerCharges += 1;
  if (contact) current.chargerContacts += 1;
  if (phase) current.lastChargerPhase = String(phase);
  if (event) current.lastReason = String(event);
  return current;
}

export function auditDungeonAttackGuaranteeV427() {
  const issues = [];
  const base = createDungeonAttackGuaranteeStateV427({ roleId: 'artillery' });
  const choreography = { handled: true, completed: false, phaseId: 'battery_relocate', mayFire: false };
  const armed = resolveDungeonRangedFirstVolleyV427({
    state: base, choreography, roleId: 'artillery', nowMs: 1000,
    entryActive: true, enemyX: 0, enemyZ: 1, playerX: 0, playerZ: 12,
    hudOcclusionLineZ: -10, fireRangeMin: 9.2, fireRangeMax: 13.4,
    canShoot: true, hasProjectile: true,
  });
  const ready = resolveDungeonRangedFirstVolleyV427({
    state: armed.state, choreography, roleId: 'artillery', nowMs: 3000,
    entryActive: true, enemyX: 0, enemyZ: 1, playerX: 0, playerZ: 12,
    hudOcclusionLineZ: -10, fireRangeMin: 9.2, fireRangeMax: 13.4,
    canShoot: true, hasProjectile: true,
  });
  if (!ready.choreography?.mayFire || ready.reason !== 'first_volley_deadline') {
    issues.push('RANGED_FIRST_VOLLEY_UNREACHABLE');
  }
  const hiddenCharger = resolveDungeonChargerWatchdogV427({
    state: createDungeonAttackGuaranteeStateV427({ roleId: 'charger' }),
    chargerState: { phase: 'charge', nextChargeAtMs: 0 }, nowMs: 1000,
    entryActive: false, enemyZ: -12, hudOcclusionLineZ: -9,
  });
  if (hiddenCharger.chargerState?.phase !== 'tracking'
      || hiddenCharger.chargerState?.nextChargeAtMs <= 1000) {
    issues.push('CHARGER_OFFSCREEN_CYCLE');
  }
  const required = resolveDungeonRequiredRoleSequenceV427({
    requiredRoles: ['charger', 'artillery', 'charger'],
    roleCatalog: { charger: { threatCost: 3 }, artillery: { threatCost: 4 } },
    threatBudget: 8,
  });
  if (required.sequence.map(row => row.roleId).join(',') !== 'charger,artillery') {
    issues.push('REQUIRED_ROLE_ORDER');
  }
  return freeze(issues);
}
