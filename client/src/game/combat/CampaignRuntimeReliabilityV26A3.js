/**
 * Campaign V2.6A.3 runtime reliability and combat-readability policies.
 *
 * Pure JavaScript only: no React, Babylon, Firebase, rewards or persistence.
 * The scene owns rendering and gameplay objects; this module only provides
 * deterministic limits, watchdog state, enemy-facing math and intro timing.
 */
export const CAMPAIGN_RUNTIME_RELIABILITY_VERSION = 'campaign-runtime-reliability-v2.6a3';

export const CAMPAIGN_RUNTIME_LIMITS_V26A3 = Object.freeze({
  maxActiveEnemies: 48,
  maxPlayerProjectiles: 220,
  maxPendingPlayerShots: 96,
  maxEnemyProjectiles: 160,
  watchdogIntervalMs: 500,
  renderStallMs: 3500,
  simulationStallMs: 4500,
});

export const CAMPAIGN_BOSS_INTRO_PLAN_V26A3 = Object.freeze({
  warningMs: 900,
  revealMs: 750,
  totalMs: 1650,
  firstAttackDelayMs: 1300,
});

export const CAMPAIGN_CHARGER_POLICY_V26A3 = Object.freeze({
  acquireDelayMs: 450,
  telegraphMs: 650,
  chargeMs: 700,
  recoveryMs: 450,
  rearmMs: 550,
  trackingSpeedMultiplier: 0.55,
  chargeSpeedMultiplier: 1.75,
  recoverySpeedMultiplier: 0.12,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeAngleV26A3(angle) {
  let value = finite(angle, 0);
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/**
 * All enemy visual assets use nose-negative-z. Yaw 0 therefore faces screen-up
 * and yaw PI faces screen-down. Rotation is bounded so homing enemies turn
 * smoothly instead of snapping or spinning around their own axis.
 */
export function resolveEnemyFacingYawV26A3({
  currentYaw = 0,
  velocityX = 0,
  velocityZ = 0,
  maxTurnRadians = Math.PI,
} = {}) {
  const vx = finite(velocityX, 0);
  const vz = finite(velocityZ, 0);
  if (Math.hypot(vx, vz) < 0.00001) return normalizeAngleV26A3(currentYaw);
  const targetYaw = Math.atan2(-vx, -vz);
  const delta = normalizeAngleV26A3(targetYaw - finite(currentYaw, 0));
  const step = clamp(Math.abs(finite(maxTurnRadians, Math.PI)), 0, Math.PI * 2);
  return normalizeAngleV26A3(finite(currentYaw, 0) + clamp(delta, -step, step));
}

const directionTo = (fromX, fromZ, toX, toZ) => {
  const dx = finite(toX, 0) - finite(fromX, 0);
  const dz = finite(toZ, 0) - finite(fromZ, 0);
  const length = Math.hypot(dx, dz);
  return length > 0.00001
    ? { x: dx / length, z: dz / length }
    : { x: 0, z: 1 };
};

export function createChargerMotionStateV26A3({ nowMs = 0 } = {}) {
  const now = Math.max(0, finite(nowMs, 0));
  return {
    phase: 'tracking',
    phaseEndsAtMs: 0,
    nextChargeAtMs: now + CAMPAIGN_CHARGER_POLICY_V26A3.acquireDelayMs,
    lockedDirectionX: 0,
    lockedDirectionZ: 1,
  };
}

/**
 * Deterministic charger state machine. The caller owns actual movement and the
 * telegraph mesh; this function only returns direction, speed and transition.
 */
export function stepChargerMotionV26A3(state, {
  nowMs = 0,
  enemyX = 0,
  enemyZ = 0,
  targetX = 0,
  targetZ = 0,
} = {}) {
  const policy = CAMPAIGN_CHARGER_POLICY_V26A3;
  const now = Math.max(0, finite(nowMs, 0));
  const current = state ? { ...state } : createChargerMotionStateV26A3({ nowMs: now });
  const liveDirection = directionTo(enemyX, enemyZ, targetX, targetZ);
  let event = null;

  if (current.phase === 'tracking' && now >= current.nextChargeAtMs) {
    current.phase = 'telegraph';
    current.phaseEndsAtMs = now + policy.telegraphMs;
    current.lockedDirectionX = liveDirection.x;
    current.lockedDirectionZ = liveDirection.z;
    event = 'telegraph_started';
  } else if (current.phase === 'telegraph' && now >= current.phaseEndsAtMs) {
    current.phase = 'charge';
    current.phaseEndsAtMs = now + policy.chargeMs;
    event = 'charge_started';
  } else if (current.phase === 'charge' && now >= current.phaseEndsAtMs) {
    current.phase = 'recovery';
    current.phaseEndsAtMs = now + policy.recoveryMs;
    event = 'recovery_started';
  } else if (current.phase === 'recovery' && now >= current.phaseEndsAtMs) {
    current.phase = 'tracking';
    current.phaseEndsAtMs = 0;
    current.nextChargeAtMs = now + policy.rearmMs;
    event = 'tracking_resumed';
  }

  const locked = {
    x: finite(current.lockedDirectionX, 0),
    z: finite(current.lockedDirectionZ, 1),
  };
  if (current.phase === 'telegraph') {
    return { state: current, direction: locked, speedMultiplier: 0, event };
  }
  if (current.phase === 'charge') {
    return { state: current, direction: locked, speedMultiplier: policy.chargeSpeedMultiplier, event };
  }
  if (current.phase === 'recovery') {
    return { state: current, direction: locked, speedMultiplier: policy.recoverySpeedMultiplier, event };
  }
  return {
    state: current,
    direction: liveDirection,
    speedMultiplier: policy.trackingSpeedMultiplier,
    event,
  };
}

export function createBossIntroPlanV26A3(overrides = {}) {
  const warningMs = clamp(finite(overrides.warningMs, CAMPAIGN_BOSS_INTRO_PLAN_V26A3.warningMs), 300, 3000);
  const revealMs = clamp(finite(overrides.revealMs, CAMPAIGN_BOSS_INTRO_PLAN_V26A3.revealMs), 300, 2500);
  const totalMs = warningMs + revealMs;
  const firstAttackDelayMs = clamp(
    finite(overrides.firstAttackDelayMs, CAMPAIGN_BOSS_INTRO_PLAN_V26A3.firstAttackDelayMs),
    500,
    5000,
  );
  return Object.freeze({
    warningMs,
    revealMs,
    totalMs,
    firstAttackDelayMs,
    phaseAt(elapsedMs) {
      const elapsed = Math.max(0, finite(elapsedMs, 0));
      if (elapsed < warningMs) return 'warning';
      if (elapsed < totalMs) return 'reveal';
      return 'fight';
    },
  });
}

export function createCampaignRuntimeSnapshotV26A3({
  active = true,
  gameState = 'TRANSITION',
  planetId = 1,
  stageId = 1,
  wave = 0,
  wavesTotal = 0,
  tick = 0,
  enemies = 0,
  playerProjectiles = 0,
  pendingPlayerShots = 0,
  enemyProjectiles = 0,
  deathVisuals = 0,
  capacityClamps = null,
} = {}) {
  return Object.freeze({
    version: CAMPAIGN_RUNTIME_RELIABILITY_VERSION,
    active: Boolean(active),
    gameState: String(gameState || 'TRANSITION'),
    planetId: Math.max(1, Math.trunc(finite(planetId, 1))),
    stageId: Math.max(1, Math.trunc(finite(stageId, 1))),
    wave: Math.max(0, Math.trunc(finite(wave, 0))),
    wavesTotal: Math.max(0, Math.trunc(finite(wavesTotal, 0))),
    tick: Math.max(0, finite(tick, 0)),
    enemies: Math.max(0, Math.trunc(finite(enemies, 0))),
    playerProjectiles: Math.max(0, Math.trunc(finite(playerProjectiles, 0))),
    pendingPlayerShots: Math.max(0, Math.trunc(finite(pendingPlayerShots, 0))),
    enemyProjectiles: Math.max(0, Math.trunc(finite(enemyProjectiles, 0))),
    deathVisuals: Math.max(0, Math.trunc(finite(deathVisuals, 0))),
    capacityClamps: Object.freeze({
      enemies: Math.max(0, Math.trunc(finite(capacityClamps?.enemies, 0))),
      playerProjectiles: Math.max(0, Math.trunc(finite(capacityClamps?.playerProjectiles, 0))),
      enemyProjectiles: Math.max(0, Math.trunc(finite(capacityClamps?.enemyProjectiles, 0))),
    }),
  });
}

export function createCampaignRuntimeMonitorV26A3({
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  renderStallMs = CAMPAIGN_RUNTIME_LIMITS_V26A3.renderStallMs,
  simulationStallMs = CAMPAIGN_RUNTIME_LIMITS_V26A3.simulationStallMs,
} = {}) {
  const clock = typeof now === 'function' ? now : (() => Date.now());
  let lastRenderAtMs = Math.max(0, finite(clock(), 0));
  let lastSimulationAtMs = lastRenderAtMs;
  let lastSnapshot = null;
  let lastSimulationTick = null;
  let fault = null;
  let serial = 0;

  const fail = (code, error = null, snapshot = lastSnapshot, atMs = clock()) => {
    if (fault) return fault;
    const message = error instanceof Error ? error.message : (error ? String(error) : '');
    const errorName = error instanceof Error ? error.name : '';
    const stack = error instanceof Error && error.stack ? String(error.stack).slice(0, 4000) : '';
    fault = Object.freeze({
      version: CAMPAIGN_RUNTIME_RELIABILITY_VERSION,
      id: ++serial,
      code: String(code || 'UNKNOWN_RUNTIME_FAULT'),
      message,
      errorName,
      stack,
      atMs: Math.max(0, finite(atMs, 0)),
      snapshot: snapshot || lastSnapshot || null,
    });
    return fault;
  };

  return Object.freeze({
    markRenderSuccess(snapshot = lastSnapshot, atMs = clock()) {
      lastRenderAtMs = Math.max(0, finite(atMs, lastRenderAtMs));
      if (snapshot) lastSnapshot = snapshot;
      return lastRenderAtMs;
    },
    markSimulation(snapshot, atMs = clock()) {
      const current = Math.max(0, finite(atMs, lastSimulationAtMs));
      const nextTick = snapshot ? finite(snapshot.tick, lastSimulationTick ?? 0) : lastSimulationTick;
      const progressed = !lastSnapshot
        || snapshot?.active === false
        || nextTick === null
        || lastSimulationTick === null
        || nextTick > lastSimulationTick + 0.00001
        || snapshot?.gameState !== lastSnapshot?.gameState
        || snapshot?.wave !== lastSnapshot?.wave;
      if (snapshot) lastSnapshot = snapshot;
      if (progressed) {
        lastSimulationAtMs = current;
        lastSimulationTick = nextTick;
      }
      return lastSimulationAtMs;
    },
    detectStall({ visible = true, active = true, atMs = clock() } = {}) {
      if (fault || !visible || !active) return fault;
      const current = Math.max(0, finite(atMs, 0));
      if (current - lastRenderAtMs > renderStallMs) {
        return fail('RENDER_STALL', null, lastSnapshot, current);
      }
      if (current - lastSimulationAtMs > simulationStallMs) {
        return fail('SIMULATION_STALL', null, lastSnapshot, current);
      }
      return null;
    },
    fail,
    reset(atMs = clock()) {
      const current = Math.max(0, finite(atMs, 0));
      lastRenderAtMs = current;
      lastSimulationAtMs = current;
      lastSnapshot = null;
      lastSimulationTick = null;
      fault = null;
    },
    getSnapshot() {
      return Object.freeze({ lastRenderAtMs, lastSimulationAtMs, lastSimulationTick, lastSnapshot, fault });
    },
  });
}
