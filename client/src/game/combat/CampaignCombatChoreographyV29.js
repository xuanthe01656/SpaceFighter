import { ENEMY_ARCHETYPES_V2 } from './EnemyCombatCatalogV2.js';

/**
 * Campaign combat choreography V2.9.0
 *
 * This module turns the existing EnemyCombatCatalogV2 behavior labels into
 * deterministic, finite combat paths. Targets are sampled only when a state is
 * entered; they are never recomputed every render frame. Runtime state is kept
 * mutable on purpose to avoid per-frame object churn on mobile devices.
 */
export const CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION = 'campaign-combat-choreography-v2.9.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const length2 = (x, z) => Math.hypot(x, z);
const approach = (value, target, maxDelta) => {
  if (value < target) return Math.min(target, value + maxDelta);
  if (value > target) return Math.max(target, value - maxDelta);
  return value;
};
const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const hashParts = (...parts) => {
  let hash = 2166136261;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
};

const phase = (id, durationMs, speedMultiplier, options = {}) => Object.freeze({
  id,
  durationMs,
  speedMultiplier,
  arrivalRadius: options.arrivalRadius ?? .38,
  slowRadius: options.slowRadius ?? 1.7,
  acceleration: options.acceleration ?? .18,
  speedFloor: options.speedFloor ?? 0,
  maxTravelMs: options.maxTravelMs ?? Math.max(4200, durationMs * 2.8),
  dwellMs: options.dwellMs ?? 0,
  holdAtArrival: options.holdAtArrival ?? (options.dwellMs ?? 0) > 0,
  mayFire: Boolean(options.mayFire),
  fireRequiresArrival: Boolean(options.fireRequiresArrival),
  facePlayer: Boolean(options.facePlayer),
  egress: Boolean(options.egress),
});

export const CAMPAIGN_ROLE_CHOREOGRAPHY_V29 = freezeDeep({
  strafe: {
    roleId: 'raider',
    phases: [
      phase('flank_approach', 1300, 1.08, {
        arrivalRadius: .42, acceleration: .2, speedFloor: .052,
        maxTravelMs: 6200, dwellMs: 140,
      }),
      phase('commit_cross', 1050, 1.34, {
        arrivalRadius: .52, slowRadius: 1.1, acceleration: .24,
        speedFloor: .066, maxTravelMs: 4700, dwellMs: 100,
      }),
      phase('egress', 1800, 1.22, {
        egress: true, arrivalRadius: .7, slowRadius: 1.2,
        acceleration: .24, speedFloor: .068,
      }),
    ],
  },
  keep_range: {
    roleId: 'gunner',
    phases: [
      phase('firing_slot', 1500, .94, {
        arrivalRadius: .34, speedFloor: .044, maxTravelMs: 7200, dwellMs: 320,
      }),
      phase('strafe_a', 1550, .88, {
        mayFire: true, facePlayer: true, arrivalRadius: .3,
        speedFloor: .038, maxTravelMs: 4800, dwellMs: 760,
      }),
      phase('strafe_b', 1550, .9, {
        mayFire: true, facePlayer: true, arrivalRadius: .3,
        speedFloor: .039, maxTravelMs: 4800, dwellMs: 760,
      }),
      phase('egress', 1900, 1.05, {
        egress: true, arrivalRadius: .7, acceleration: .22, speedFloor: .064,
      }),
    ],
  },
  telegraphed_charge: {
    roleId: 'charger',
    externalController: 'CampaignRuntimeReliabilityV26A3',
    phases: [],
  },
  guard_lane: {
    roleId: 'shieldbearer',
    phases: [
      phase('guard_approach', 1700, .78, {
        arrivalRadius: .32, speedFloor: .036, maxTravelMs: 7800, dwellMs: 420,
      }),
      phase('guard_hold_a', 1200, .52, {
        facePlayer: true, arrivalRadius: .28, speedFloor: .026,
        maxTravelMs: 4600, dwellMs: 980,
      }),
      phase('guard_hold_b', 1200, .55, {
        facePlayer: true, arrivalRadius: .28, speedFloor: .027,
        maxTravelMs: 4600, dwellMs: 980,
      }),
      phase('egress', 2100, .92, {
        egress: true, arrivalRadius: .7, acceleration: .22, speedFloor: .058,
      }),
    ],
  },
  support_orbit: {
    roleId: 'support',
    phases: [
      phase('support_slot', 1500, .82, {
        arrivalRadius: .34, speedFloor: .041, maxTravelMs: 7200, dwellMs: 340,
      }),
      phase('orbit_0', 1150, .76, {
        mayFire: true, facePlayer: true, arrivalRadius: .3,
        speedFloor: .034, maxTravelMs: 4200, dwellMs: 460,
      }),
      phase('orbit_1', 1150, .78, {
        mayFire: true, facePlayer: true, arrivalRadius: .3,
        speedFloor: .035, maxTravelMs: 4200, dwellMs: 460,
      }),
      phase('orbit_2', 1150, .8, {
        mayFire: true, facePlayer: true, arrivalRadius: .3,
        speedFloor: .036, maxTravelMs: 4200, dwellMs: 460,
      }),
      phase('egress', 2000, 1.0, {
        egress: true, arrivalRadius: .7, acceleration: .22, speedFloor: .062,
      }),
    ],
  },
  telegraphed_zone: {
    roleId: 'artillery',
    phases: [
      phase('battery_approach', 1900, .7, {
        arrivalRadius: .3, speedFloor: .034, maxTravelMs: 8200, dwellMs: 460,
      }),
      phase('brace_a', 1000, .25, {
        mayFire: true, fireRequiresArrival: true, facePlayer: true,
        arrivalRadius: .22, slowRadius: .8, speedFloor: .016,
        maxTravelMs: 2600, dwellMs: 2250,
      }),
      phase('battery_relocate', 1550, .72, {
        arrivalRadius: .3, speedFloor: .034, maxTravelMs: 5200, dwellMs: 380,
      }),
      phase('brace_b', 1000, .25, {
        mayFire: true, fireRequiresArrival: true, facePlayer: true,
        arrivalRadius: .22, slowRadius: .8, speedFloor: .016,
        maxTravelMs: 2600, dwellMs: 2250,
      }),
      phase('egress', 2200, .9, {
        egress: true, arrivalRadius: .7, acceleration: .22, speedFloor: .058,
      }),
    ],
  },
});

export const CAMPAIGN_MINI_BOSS_MOTION_PROFILES_V29 = freezeDeep({
  mechanical_warden: { depthOffsets: [0, .42, .12], acceleration: .13 },
  ion_sentinel: { depthOffsets: [.18, .52, 0], acceleration: .12 },
  frontline_carrier: { depthOffsets: [.62, .26, .48], acceleration: .105 },
  repair_frigate: { depthOffsets: [.55, .18, .42], acceleration: .10 },
  brood_alpha: { depthOffsets: [.34, .7, .12], acceleration: .14 },
  inferno_charger: { depthOffsets: [.8, .38, .16], acceleration: .18 },
});

export function auditCampaignCombatChoreographyV29() {
  const issues = [];
  const behaviorOwners = new Map();
  for (const archetype of Object.values(ENEMY_ARCHETYPES_V2)) {
    const contract = CAMPAIGN_ROLE_CHOREOGRAPHY_V29[archetype.behavior];
    if (!contract) {
      issues.push(`MISSING_BEHAVIOR:${archetype.id}:${archetype.behavior}`);
      continue;
    }
    const owners = behaviorOwners.get(archetype.behavior) || [];
    owners.push(archetype.id);
    behaviorOwners.set(archetype.behavior, owners);
    if (contract.roleId !== archetype.id) issues.push(`ROLE_BEHAVIOR_MISMATCH:${archetype.id}`);
    if (!contract.externalController && (!Array.isArray(contract.phases) || contract.phases.length < 3)) {
      issues.push(`INSUFFICIENT_PHASES:${archetype.id}`);
    }
    if (!contract.externalController && contract.phases.at(-1)?.egress !== true) {
      issues.push(`NO_FINITE_EGRESS:${archetype.id}`);
    }
  }
  for (const [behavior, owners] of behaviorOwners) {
    if (owners.length > 1) issues.push(`DUPLICATE_BEHAVIOR_OWNER:${behavior}`);
  }
  return Object.freeze(issues);
}

export function resolveCampaignCombatSafeBandV29({
  worldHalfHeight = 15,
  viewportHeight = 852,
  hudOcclusionLineZ,
  entityScale = 1,
  hpBarOffsetPx = -28,
  hpBarHeightPx = 7,
  extraMarginPx = 12,
  playerZ,
} = {}) {
  const half = Math.max(8, finite(worldHalfHeight, 15));
  const height = Math.max(240, finite(viewportHeight, 852));
  const worldPerPixel = half * 2 / height;
  const fallbackHudLine = -half + half * 2 * .19;
  const hudLine = clamp(finite(hudOcclusionLineZ, fallbackHudLine), -half + 2.5, half - 9);
  const scale = clamp(finite(entityScale, 1), .65, 3);
  const barTopWorld = (Math.max(0, -finite(hpBarOffsetPx, -28))
    + Math.max(0, finite(hpBarHeightPx, 7)) * .5) * worldPerPixel;
  const visualTopWorld = 1.34 * scale;
  const marginWorld = clamp(finite(extraMarginPx, 12), 4, 36) * worldPerPixel;
  const clearance = Math.max(barTopWorld, visualTopWorld) + marginWorld;
  const safePlayerZ = clamp(finite(playerZ, half - 2.5), -half + 8, half - 1.5);
  const topSafeRootZ = clamp(hudLine + clearance, -half + 4.4, safePlayerZ - 7.4);
  const backlineZ = clamp(topSafeRootZ + .75, -half + 5.1, safePlayerZ - 7.0);
  const midlineZ = clamp(topSafeRootZ + 2.25, backlineZ + .7, safePlayerZ - 5.2);
  const rangedZ = clamp(safePlayerZ - 7.1, midlineZ, safePlayerZ - 4.2);
  return Object.freeze({
    worldHalfHeight: half,
    viewportHeight: height,
    worldPerPixel,
    hudOcclusionLineZ: hudLine,
    clearance,
    topSafeRootZ,
    backlineZ,
    midlineZ,
    rangedZ,
    previewAnchorZ: clamp(topSafeRootZ + 1.55, backlineZ + .6, safePlayerZ - 5.8),
    bottomSafeZ: half - 2.6,
  });
}

const getArchetype = roleId => ENEMY_ARCHETYPES_V2[roleId] || ENEMY_ARCHETYPES_V2.gunner;
const choreographyForRole = roleId => CAMPAIGN_ROLE_CHOREOGRAPHY_V29[getArchetype(roleId).behavior]
  || CAMPAIGN_ROLE_CHOREOGRAPHY_V29.keep_range;

export function createCampaignEnemyChoreographyStateV29({
  roleId = 'gunner',
  lane = 0,
  strafeDirection = 1,
  seed = 1,
  nowMs = 0,
} = {}) {
  const archetype = getArchetype(roleId);
  const contract = choreographyForRole(archetype.id);
  return {
    version: CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION,
    roleId: archetype.id,
    behavior: archetype.behavior,
    externalController: contract.externalController || null,
    seed: hashParts(seed, archetype.id, lane, strafeDirection),
    laneNorm: clamp(finite(lane, 0), -.88, .88),
    side: Number(strafeDirection) < 0 ? -1 : 1,
    phaseIndex: 0,
    phaseId: null,
    phaseStartedAt: Math.max(0, finite(nowMs, 0)),
    phaseDeadlineAt: null,
    phaseArrivedAt: null,
    targetX: null,
    targetZ: null,
    velocityX: 0,
    velocityZ: 0,
    completed: false,
  };
}

const targetForEnemyPhase = (state, phaseContract, input, band) => {
  const role = state.roleId;
  const phaseId = phaseContract.id;
  const halfWidth = Math.max(2.8, finite(input.arenaHalfWidth, 7));
  const xBound = Math.max(2.2, halfWidth - .55);
  const playerX = clamp(finite(input.playerX, 0), -xBound, xBound);
  const playerZ = clamp(finite(input.playerZ, band.worldHalfHeight - 2.5),
    band.topSafeRootZ + 5, band.bottomSafeZ);
  const baseX = clamp(state.laneNorm * xBound, -xBound, xBound);
  const side = state.side;
  const egressX = clamp((Math.abs(baseX) > xBound * .28 ? Math.sign(baseX) : side) * xBound * .82,
    -xBound, xBound);

  if (role === 'raider') {
    if (phaseId === 'flank_approach') return {
      x: clamp(playerX + side * Math.min(3.25, xBound * .48), -xBound, xBound),
      z: clamp(playerZ - 5.35, band.midlineZ, playerZ - 3.9),
    };
    if (phaseId === 'commit_cross') return {
      x: clamp(playerX - side * Math.min(2.25, xBound * .34), -xBound, xBound),
      z: clamp(playerZ + 1.65, band.rangedZ, band.bottomSafeZ + .8),
    };
    return { x: egressX, z: band.worldHalfHeight + 5.2 };
  }

  if (role === 'gunner') {
    if (phaseId === 'firing_slot') return {
      x: clamp(baseX + side * .55, -xBound, xBound), z: band.rangedZ,
    };
    if (phaseId === 'strafe_a') return {
      x: clamp(baseX + side * Math.min(2.45, xBound * .38), -xBound, xBound),
      z: band.rangedZ + .15,
    };
    if (phaseId === 'strafe_b') return {
      x: clamp(baseX - side * Math.min(2.45, xBound * .38), -xBound, xBound),
      z: band.rangedZ - .15,
    };
    return { x: egressX, z: band.worldHalfHeight + 5.2 };
  }

  if (role === 'shieldbearer') {
    const guardX = clamp(baseX * .72 + playerX * .28, -xBound, xBound);
    if (phaseId === 'guard_approach') return { x: guardX, z: band.midlineZ };
    if (phaseId === 'guard_hold_a') return {
      x: clamp(guardX + side * 1.05, -xBound, xBound), z: band.midlineZ + .15,
    };
    if (phaseId === 'guard_hold_b') return {
      x: clamp(guardX - side * 1.05, -xBound, xBound), z: band.midlineZ - .15,
    };
    return { x: egressX, z: band.worldHalfHeight + 5.2 };
  }

  if (role === 'support') {
    const anchorX = clamp(baseX * .78 + playerX * .12, -xBound, xBound);
    const radiusX = Math.min(1.85, xBound * .30);
    const radiusZ = .85;
    if (phaseId === 'support_slot') return { x: anchorX, z: band.rangedZ - .7 };
    const point = phaseId === 'orbit_0' ? 0 : phaseId === 'orbit_1' ? 1 : phaseId === 'orbit_2' ? 2 : -1;
    if (point >= 0) {
      const angles = [Math.PI * .15, Math.PI * .85, Math.PI * 1.35];
      const angle = angles[(point + (state.seed % angles.length)) % angles.length] * side;
      return {
        x: clamp(anchorX + Math.cos(angle) * radiusX, -xBound, xBound),
        z: clamp(band.rangedZ - .7 + Math.sin(angle) * radiusZ,
          band.midlineZ, band.bottomSafeZ - 1.4),
      };
    }
    return { x: egressX, z: band.worldHalfHeight + 5.2 };
  }

  // Artillery owns the remaining telegraphed_zone behavior.
  const batteryX = clamp(baseX * .55 + side * xBound * .22, -xBound, xBound);
  if (phaseId === 'battery_approach' || phaseId === 'brace_a') {
    return { x: batteryX, z: band.backlineZ };
  }
  if (phaseId === 'battery_relocate' || phaseId === 'brace_b') {
    return {
      x: clamp(-batteryX + side * .45, -xBound, xBound),
      z: band.backlineZ + .35,
    };
  }
  return { x: egressX, z: band.worldHalfHeight + 5.2 };
};

const resolveTravelDeadlineAt = (phaseContract, input, target, nowMs) => {
  if (phaseContract.egress) return null;
  const distance = length2(
    target.x - finite(input.enemyX, 0),
    target.z - finite(input.enemyZ, 0),
  );
  const baseSpeed = Math.max(.006, Math.abs(finite(input.baseSpeed, .04)));
  const speedPerFrame = Math.max(
    baseSpeed * Math.max(.05, finite(phaseContract.speedMultiplier, 1)),
    Math.max(0, finite(phaseContract.speedFloor, 0)),
  );
  // Arrival steering deliberately slows near the target. Budget a conservative
  // effective speed so slow catalog roles still reach their authored slot
  // instead of timing out into the next behavior while crossing the arena.
  const effectiveUnitsPerSecond = Math.max(.24, speedPerFrame * 60 * .72);
  const estimatedTravelMs = distance / effectiveUnitsPerSecond * 1000;
  const minimumMs = Math.max(280, finite(phaseContract.durationMs, 1200));
  const maximumMs = Math.max(minimumMs, finite(phaseContract.maxTravelMs, minimumMs * 2.8));
  const budgetMs = clamp(estimatedTravelMs * 1.28 + 260, minimumMs, maximumMs);
  return nowMs + Math.ceil(budgetMs);
};

const enterEnemyPhase = (state, index, nowMs, input, band) => {
  const contract = choreographyForRole(state.roleId);
  const nextPhase = contract.phases[index];
  if (!nextPhase) {
    state.completed = true;
    state.phaseIndex = contract.phases.length;
    state.phaseId = 'complete';
    state.phaseDeadlineAt = null;
    state.phaseArrivedAt = null;
    state.targetX = null;
    state.targetZ = null;
    return null;
  }
  const target = targetForEnemyPhase(state, nextPhase, input, band);
  state.phaseIndex = index;
  state.phaseId = nextPhase.id;
  state.phaseStartedAt = nowMs;
  state.phaseArrivedAt = null;
  state.targetX = target.x;
  state.targetZ = target.z;
  state.phaseDeadlineAt = resolveTravelDeadlineAt(nextPhase, input, target, nowMs);
  return nextPhase;
};

const steerState = (state, input, phaseContract, targetX, targetZ, options = {}) => {
  const frameScale = clamp(finite(input.frameScale, 1), 0, 4);
  const baseSpeed = Math.max(.006, Math.abs(finite(input.baseSpeed, .04)));
  const dx = targetX - finite(input.enemyX, 0);
  const dz = targetZ - finite(input.enemyZ, 0);
  const distance = length2(dx, dz);
  const speedScale = distance < phaseContract.slowRadius
    ? clamp(distance / Math.max(.01, phaseContract.slowRadius), .12, 1) : 1;
  const authoredSpeed = Math.max(
    baseSpeed * phaseContract.speedMultiplier,
    Math.max(0, finite(phaseContract.speedFloor, 0)),
  );
  const maxSpeed = authoredSpeed * speedScale;
  const inv = distance > .0001 ? 1 / distance : 0;
  let desiredX = dx * inv * maxSpeed;
  let desiredZ = dz * inv * maxSpeed;
  if (!phaseContract.egress) {
    const separationX = clamp(finite(input.separationX, 0), -1, 1);
    const separationZ = clamp(finite(input.separationZ, 0), -1, 1);
    desiredX += separationX * maxSpeed * .38;
    desiredZ += separationZ * maxSpeed * .24;
    const desiredLength = length2(desiredX, desiredZ);
    if (desiredLength > maxSpeed && desiredLength > .0001) {
      desiredX = desiredX / desiredLength * maxSpeed;
      desiredZ = desiredZ / desiredLength * maxSpeed;
    }
  }
  if (options.hold) {
    desiredX = 0;
    desiredZ = 0;
  }
  const maxDelta = Math.max(.0015,
    Math.min(.014, Math.max(baseSpeed, authoredSpeed) * phaseContract.acceleration * frameScale));
  state.velocityX = approach(state.velocityX, desiredX, maxDelta);
  state.velocityZ = approach(state.velocityZ, desiredZ, maxDelta);
  return {
    distance,
    velocityX: state.velocityX,
    velocityZ: state.velocityZ,
    deltaX: state.velocityX * frameScale,
    deltaZ: state.velocityZ * frameScale,
  };
};

export function stepCampaignEnemyChoreographyV29(state, input = {}) {
  if (!state || state.externalController || state.completed) {
    return Object.freeze({
      state,
      handled: false,
      completed: Boolean(state?.completed),
      phaseId: state?.phaseId || null,
      mayFire: false,
      facePlayer: false,
      deltaX: 0,
      deltaZ: 0,
      velocityX: 0,
      velocityZ: 0,
    });
  }
  const nowMs = Math.max(0, finite(input.nowMs, 0));
  const archetype = getArchetype(state.roleId);
  const contract = choreographyForRole(state.roleId);
  const band = resolveCampaignCombatSafeBandV29({
    worldHalfHeight: input.worldHalfHeight,
    viewportHeight: input.viewportHeight,
    hudOcclusionLineZ: input.hudOcclusionLineZ,
    entityScale: input.entityScale,
    hpBarOffsetPx: input.hpBarOffsetPx,
    hpBarHeightPx: input.hpBarHeightPx,
    playerZ: input.playerZ,
  });

  let current = state.phaseId ? contract.phases[state.phaseIndex] : enterEnemyPhase(state, 0, nowMs, input, band);
  let transitions = 0;
  while (current && transitions < 2) {
    const distance = length2(state.targetX - finite(input.enemyX, 0), state.targetZ - finite(input.enemyZ, 0));
    const arrived = distance <= current.arrivalRadius;
    if (arrived && state.phaseArrivedAt == null) state.phaseArrivedAt = nowMs;
    const offscreenExit = current.egress
      && finite(input.enemyZ, 0) >= band.worldHalfHeight + 3.6;
    const arrivedOffscreen = current.egress && arrived
      && finite(input.enemyZ, 0) >= band.worldHalfHeight + 2.8;
    const dwellComplete = !current.egress && state.phaseArrivedAt != null
      && nowMs - state.phaseArrivedAt >= Math.max(0, finite(current.dwellMs, 0));
    const travelTimedOut = !current.egress && state.phaseArrivedAt == null
      && state.phaseDeadlineAt != null && nowMs >= state.phaseDeadlineAt;
    // Egress is spatial, never clock-only. An enemy is removed only after its
    // root has moved below the visible arena; a slow role cannot disappear in
    // the middle of the screen because an arbitrary duration elapsed.
    const mayAdvance = current.egress
      ? offscreenExit || arrivedOffscreen
      : dwellComplete || travelTimedOut;
    if (!mayAdvance) break;
    current = enterEnemyPhase(state, state.phaseIndex + 1, nowMs, input, band);
    transitions += 1;
  }

  if (!current || state.completed) {
    state.velocityX = approach(state.velocityX, 0, .02);
    state.velocityZ = approach(state.velocityZ, 0, .02);
    return Object.freeze({
      state, handled: true, completed: true, phaseId: state.phaseId,
      mayFire: false, facePlayer: false,
      deltaX: 0, deltaZ: 0, velocityX: state.velocityX, velocityZ: state.velocityZ,
    });
  }

  const holdingAtArrival = current.holdAtArrival && state.phaseArrivedAt != null;
  const motion = steerState(state, input, current, state.targetX, state.targetZ, {
    hold: holdingAtArrival,
  });
  const telegraphMs = Math.max(0, finite(archetype.telegraphTicks, 0)) * (1000 / 30);
  const fireCooldownMs = Math.max(600,
    Math.trunc(Math.max(1, finite(archetype.attackCooldownTicks, 60)) * (1000 / 30)));
  const fireDelayMs = Math.min(Math.max(220, telegraphMs), Math.max(220, current.durationMs - 280));
  const fireClockStart = current.fireRequiresArrival
    ? state.phaseArrivedAt
    : state.phaseStartedAt;
  const fireAge = fireClockStart == null ? -1 : nowMs - fireClockStart;
  const mayFire = current.mayFire && fireAge >= fireDelayMs;
  return Object.freeze({
    state,
    handled: true,
    completed: false,
    phaseId: state.phaseId,
    targetX: state.targetX,
    targetZ: state.targetZ,
    mayFire,
    fireCooldownMs,
    fireWindup: current.mayFire && !mayFire,
    settled: state.phaseArrivedAt != null,
    facePlayer: current.facePlayer,
    egress: current.egress,
    deltaX: motion.deltaX,
    deltaZ: motion.deltaZ,
    velocityX: motion.velocityX,
    velocityZ: motion.velocityZ,
  });
}

export function createCampaignBossPreviewMotionStateV29({
  lane = 0,
  strafeDirection = 1,
  seed = 1,
  nowMs = 0,
} = {}) {
  return {
    version: CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION,
    phase: 'preposition',
    phaseStartedAt: Math.max(0, finite(nowMs, 0)),
    seed: hashParts(seed, 'boss_preview', lane, strafeDirection),
    baseLane: clamp(finite(lane, 0), -.88, .88),
    side: Number(strafeDirection) < 0 ? -1 : 1,
    targetX: null,
    targetZ: null,
    velocityX: 0,
    velocityZ: 0,
    postAttackIndex: 0,
    trackingPlanId: null,
  };
}

const previewTarget = (state, input, band, postAttack = false) => {
  const halfWidth = Math.max(2.8, finite(input.arenaHalfWidth, 7));
  const xBound = Math.max(2.2, halfWidth - .8);
  const laneCandidates = postAttack
    ? [.52, -.52, .18, -.18, .36, -.36]
    : [.58, -.58, .28, -.28, 0];
  const index = (state.seed + (postAttack ? state.postAttackIndex * 7 : 0)) % laneCandidates.length;
  const lane = clamp(laneCandidates[index] * state.side + state.baseLane * .18, -.76, .76);
  return {
    x: clamp(lane * xBound, -xBound, xBound),
    z: band.previewAnchorZ + (postAttack ? .4 : 0),
  };
};

const PREVIEW_MOVE_PHASE = phase('preview_move', 1800, .84, {
  arrivalRadius: .32, acceleration: .15, speedFloor: .042, maxTravelMs: 6200,
});
const PREVIEW_TRACK_PHASE = phase('preview_track', 900, .42, {
  arrivalRadius: .18, slowRadius: .85, acceleration: .12,
  speedFloor: .018, maxTravelMs: 2600,
});
const PREVIEW_HOLD_PHASE = phase('preview_hold', 1000, 0, { arrivalRadius: .15, acceleration: .24 });

export function stepCampaignBossPreviewMotionV29(state, input = {}) {
  if (!state) return Object.freeze({ state: null, handled: false, canArm: false, deltaX: 0, deltaZ: 0 });
  const nowMs = Math.max(0, finite(input.nowMs, 0));
  const mechanicPhase = String(input.mechanicPhase || 'idle');
  const attackPlanPhase = String(input.attackPlanPhase || 'none');
  const mechanicComplete = Boolean(input.mechanicComplete);
  const band = resolveCampaignCombatSafeBandV29({
    worldHalfHeight: input.worldHalfHeight,
    viewportHeight: input.viewportHeight,
    hudOcclusionLineZ: input.hudOcclusionLineZ,
    entityScale: input.entityScale,
    hpBarOffsetPx: input.hpBarOffsetPx,
    hpBarHeightPx: input.hpBarHeightPx,
    playerZ: input.playerZ,
  });

  // The accepted charger controller remains authoritative after its preview has
  // armed. It owns telegraph, charge and recovery for charge_rush encounters.
  if (mechanicPhase === 'waiting_charge') {
    state.velocityX = 0;
    state.velocityZ = 0;
    return Object.freeze({
      state, handled: false, canArm: false, holdOrientation: false,
      deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0,
    });
  }

  const attackHolding = attackPlanPhase === 'locked'
    || (mechanicPhase === 'telegraph' && attackPlanPhase === 'none');
  if (attackHolding) {
    state.phase = 'attack_hold';
    // V2.8.2 locks one immutable world-space origin for warning and bullets.
    // Stop the entity root exactly; easing residual velocity here would move
    // the muzzle after lock and visually break that spatial contract.
    state.velocityX = 0;
    state.velocityZ = 0;
    return Object.freeze({
      state, handled: true, canArm: false, holdOrientation: true,
      phaseId: state.phase, mayFire: false,
      deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0,
    });
  }

  if (attackPlanPhase === 'tracking') {
    const planId = String(input.attackPlanId || 'tracking');
    if (state.phase !== 'tracking_drift' || state.trackingPlanId !== planId) {
      state.phase = 'tracking_drift';
      state.phaseStartedAt = nowMs;
      state.trackingPlanId = planId;
      const halfWidth = Math.max(2.8, finite(input.arenaHalfWidth, 7));
      const xBound = Math.max(2.2, halfWidth - .8);
      const enemyX = finite(input.enemyX, 0);
      const enemyZ = finite(input.enemyZ, band.previewAnchorZ);
      const requestedSide = enemyX + state.side * 1.05;
      if (requestedSide > xBound || requestedSide < -xBound) state.side *= -1;
      state.targetX = clamp(enemyX + state.side * (0.82 + (state.seed % 4) * .09), -xBound, xBound);
      const depthNudge = ((state.seed >>> 4) & 1) === 0 ? -.22 : .32;
      state.targetZ = clamp(enemyZ + depthNudge,
        band.previewAnchorZ - .48, band.previewAnchorZ + .72);
    }
    const distance = length2(
      state.targetX - finite(input.enemyX, 0),
      state.targetZ - finite(input.enemyZ, 0),
    );
    const settled = distance <= PREVIEW_TRACK_PHASE.arrivalRadius;
    if (settled) {
      state.velocityX = 0;
      state.velocityZ = 0;
    }
    const motion = settled
      ? { deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0 }
      : steerState(state, input, PREVIEW_TRACK_PHASE, state.targetX, state.targetZ);
    return Object.freeze({
      state, handled: true, canArm: false, holdOrientation: settled,
      phaseId: state.phase, mayFire: false, facePlayer: false,
      deltaX: motion.deltaX, deltaZ: motion.deltaZ,
      velocityX: motion.velocityX, velocityZ: motion.velocityZ,
    });
  }

  if (mechanicComplete) {
    state.trackingPlanId = null;
    if (!['post_relocate', 'post_hold'].includes(state.phase)) {
      state.phase = 'post_relocate';
      state.phaseStartedAt = nowMs;
      state.postAttackIndex += 1;
      const target = previewTarget(state, input, band, true);
      state.targetX = target.x;
      state.targetZ = target.z;
    }
    const distance = length2(state.targetX - finite(input.enemyX, 0), state.targetZ - finite(input.enemyZ, 0));
    if (state.phase === 'post_relocate' && distance <= .34) {
      state.phase = 'post_hold';
      state.phaseStartedAt = nowMs;
    } else if (state.phase === 'post_hold' && nowMs - state.phaseStartedAt >= 1650) {
      state.phase = 'post_relocate';
      state.phaseStartedAt = nowMs;
      state.postAttackIndex += 1;
      const target = previewTarget(state, input, band, true);
      state.targetX = target.x;
      state.targetZ = target.z;
    }
    const hold = state.phase === 'post_hold';
    if (hold) {
      state.velocityX = 0;
      state.velocityZ = 0;
    }
    const motion = hold
      ? { deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0 }
      : steerState(state, input, PREVIEW_MOVE_PHASE, state.targetX, state.targetZ);
    return Object.freeze({
      state, handled: true, canArm: false, holdOrientation: hold,
      phaseId: state.phase, mayFire: hold,
      facePlayer: hold,
      deltaX: motion.deltaX, deltaZ: motion.deltaZ,
      velocityX: motion.velocityX, velocityZ: motion.velocityZ,
    });
  }

  if (state.phase === 'attack_hold') {
    state.phase = 'ready';
    state.phaseStartedAt = nowMs;
  }
  if (state.targetX == null || state.phase === 'preposition') {
    const target = previewTarget(state, input, band, false);
    state.targetX = target.x;
    state.targetZ = target.z;
  }
  if (state.phase === 'preposition') {
    const distance = length2(state.targetX - finite(input.enemyX, 0), state.targetZ - finite(input.enemyZ, 0));
    if (distance <= .34) {
      state.phase = 'settle';
      state.phaseStartedAt = nowMs;
    }
  }
  if (state.phase === 'settle' && nowMs - state.phaseStartedAt >= 320) {
    state.phase = 'ready';
    state.phaseStartedAt = nowMs;
    state.velocityX = 0;
    state.velocityZ = 0;
  }
  const hold = state.phase === 'settle' || state.phase === 'ready';
  const motion = state.phase === 'ready'
    ? { deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0 }
    : steerState(state, input, hold ? PREVIEW_HOLD_PHASE : PREVIEW_MOVE_PHASE,
      hold ? finite(input.enemyX, 0) : state.targetX,
      hold ? finite(input.enemyZ, 0) : state.targetZ,
      { hold });
  return Object.freeze({
    state, handled: true, canArm: state.phase === 'ready', holdOrientation: hold,
    phaseId: state.phase, mayFire: false,
    facePlayer: hold,
    deltaX: motion.deltaX, deltaZ: motion.deltaZ,
    velocityX: motion.velocityX, velocityZ: motion.velocityZ,
  });
}

export function createCampaignMiniBossMotionStateV29() {
  return {
    version: CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION,
    velocityX: 0,
    velocityZ: 0,
  };
}

export function resolveCampaignMiniBossAnchorV29({
  profileId,
  cycle = 0,
  targetLane = 0,
  requestedOffsetZ = 5.4,
  arenaHalfWidth = 7,
  worldHalfHeight = 15,
  viewportHeight = 852,
  hudOcclusionLineZ,
  entityScale = 1.4,
  hpBarOffsetPx = -40,
  hpBarHeightPx = 8,
  playerZ,
} = {}) {
  const half = Math.max(8, finite(worldHalfHeight, 15));
  const xBound = Math.max(2.2, finite(arenaHalfWidth, 7) - 1.0);
  const motionProfile = CAMPAIGN_MINI_BOSS_MOTION_PROFILES_V29[profileId]
    || CAMPAIGN_MINI_BOSS_MOTION_PROFILES_V29.mechanical_warden;
  const band = resolveCampaignCombatSafeBandV29({
    worldHalfHeight: half,
    viewportHeight,
    hudOcclusionLineZ,
    entityScale,
    hpBarOffsetPx,
    hpBarHeightPx,
    extraMarginPx: 16,
    playerZ,
  });
  const depthOffsets = motionProfile.depthOffsets;
  const depthOffset = depthOffsets[Math.max(0, Math.trunc(finite(cycle, 0))) % depthOffsets.length] || 0;
  const requestedZ = -half + clamp(finite(requestedOffsetZ, 5.4), 3.5, half * 1.25) + depthOffset;
  return Object.freeze({
    x: clamp(finite(targetLane, 0), -.82, .82) * xBound,
    z: clamp(Math.max(requestedZ, band.topSafeRootZ), band.topSafeRootZ, band.midlineZ + .35),
    topSafeRootZ: band.topSafeRootZ,
    worldPerPixel: band.worldPerPixel,
  });
}

export function stepCampaignMiniBossMotionV29(state, input = {}) {
  if (!state) return Object.freeze({ state: null, deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0 });
  const mode = String(input.mode || 'hold');
  const frameScale = clamp(finite(input.frameScale, 1), 0, 4);
  const baseSpeed = Math.max(.008, Math.abs(finite(input.baseSpeed, .04)));
  const profile = CAMPAIGN_MINI_BOSS_MOTION_PROFILES_V29[input.profileId]
    || CAMPAIGN_MINI_BOSS_MOTION_PROFILES_V29.mechanical_warden;

  if (mode === 'charge') {
    const dx = finite(input.directionX, 0);
    const dz = finite(input.directionZ, 1);
    const length = length2(dx, dz) || 1;
    const speed = baseSpeed * Math.max(1, finite(input.speedMultiplier, 4.5));
    state.velocityX = dx / length * speed;
    state.velocityZ = dz / length * speed;
    return Object.freeze({
      state,
      deltaX: state.velocityX * frameScale,
      deltaZ: state.velocityZ * frameScale,
      velocityX: state.velocityX,
      velocityZ: state.velocityZ,
      atAnchor: false,
      holdOrientation: false,
    });
  }

  const hold = mode !== 'seek_anchor';
  const targetX = hold ? finite(input.enemyX, 0) : finite(input.targetX, 0);
  const targetZ = hold ? finite(input.enemyZ, 0) : finite(input.targetZ, 0);
  if (hold) {
    // Telegraph/attack phases must be spatially stable. Do not let residual
    // steering velocity drag a Mini-Boss after its warning has started.
    state.velocityX = 0;
    state.velocityZ = 0;
    return Object.freeze({
      state, deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0,
      atAnchor: true, holdOrientation: true,
    });
  }
  const contract = {
    speedMultiplier: Math.max(0, finite(input.speedMultiplier, 1.15)),
    slowRadius: 1.8,
    acceleration: profile.acceleration,
    egress: false,
  };
  const motion = steerState(state, input, contract, targetX, targetZ);
  return Object.freeze({
    state,
    deltaX: motion.deltaX,
    deltaZ: motion.deltaZ,
    velocityX: motion.velocityX,
    velocityZ: motion.velocityZ,
    atAnchor: length2(targetX - finite(input.enemyX, 0), targetZ - finite(input.enemyZ, 0)) <= .45,
    holdOrientation: false,
  });
}
