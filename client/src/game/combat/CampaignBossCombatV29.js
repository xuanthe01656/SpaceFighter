import { BOSS_PHASES_V2, bossPhaseForHp } from './EnemyCombatCatalogV2.js';
import { resolveCampaignCombatSafeBandV29 } from './CampaignCombatChoreographyV29.js';

/**
 * Deterministic final-boss movement and attack choreography for Campaign QA.
 * One immutable attack plan is shared by warning VFX and spawned projectiles.
 */
export const CAMPAIGN_BOSS_COMBAT_VERSION = 'campaign-boss-combat-v3.1.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const hypot = (x, z) => Math.hypot(x, z);
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

export const CAMPAIGN_BOSS_PATTERN_CATALOG_V29 = freezeDeep({
  aimed_burst: {
    telegraphMs: 620,
    recoveryMs: 920,
    projectileSpeed: .52,
    width: .48,
    shotCount: 3,
    spreadRadians: .07,
    shotGapMs: 145,
  },
  fan: {
    telegraphMs: 720,
    recoveryMs: 1080,
    projectileSpeed: .43,
    width: .52,
    shotCount: 7,
    spreadRadians: .92,
    shotGapMs: 35,
  },
  lane_sweep: {
    telegraphMs: 900,
    recoveryMs: 1180,
    projectileSpeed: .42,
    width: .82,
    lanes: [-.72, -.24, .24, .72],
    shotGapMs: 105,
  },
  radial_gap: {
    telegraphMs: 920,
    recoveryMs: 1220,
    projectileSpeed: .39,
    width: .38,
    radialSlots: 16,
    gapSlots: 3,
    shotGapMs: 18,
  },
});


export const CAMPAIGN_BOSS_PHASE_COMBAT_V31 = freezeDeep({
  phase_1: {
    frenzyLevel: 0,
    movementMultiplier: 1,
    recoveryMultiplier: 1,
    projectileSpeedMultiplier: 1,
    extraBurstShots: 0,
    extraRadialSlots: 0,
    enrageHoldMs: 0,
  },
  phase_2: {
    frenzyLevel: 1,
    movementMultiplier: 1.10,
    recoveryMultiplier: .88,
    projectileSpeedMultiplier: 1.06,
    extraBurstShots: 0,
    extraRadialSlots: 0,
    enrageHoldMs: 0,
  },
  phase_3: {
    frenzyLevel: 2,
    movementMultiplier: 1.32,
    recoveryMultiplier: .62,
    projectileSpeedMultiplier: 1.14,
    extraBurstShots: 2,
    extraRadialSlots: 2,
    enrageHoldMs: 900,
  },
});

const phaseCombatFor = phaseId => CAMPAIGN_BOSS_PHASE_COMBAT_V31[phaseId]
  || CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_1;

const resolvePatternContractV31 = (pattern, phaseId) => {
  const base = CAMPAIGN_BOSS_PATTERN_CATALOG_V29[pattern];
  if (!base) return null;
  const phase = phaseCombatFor(phaseId);
  const contract = {
    ...base,
    projectileSpeed: base.projectileSpeed * phase.projectileSpeedMultiplier,
    recoveryMs: Math.max(600, Math.round(base.recoveryMs * phase.recoveryMultiplier)),
  };
  if ((pattern === 'aimed_burst' || pattern === 'fan') && phase.extraBurstShots > 0) {
    contract.shotCount = base.shotCount + phase.extraBurstShots;
  }
  if (pattern === 'radial_gap' && phase.extraRadialSlots > 0) {
    contract.radialSlots = base.radialSlots + phase.extraRadialSlots;
  }
  if (pattern === 'lane_sweep' && phase.frenzyLevel >= 2) {
    contract.lanes = [-.78, -.39, 0, .39, .78];
  }
  return freezeDeep(contract);
};

export function auditCampaignBossCombatV29() {
  const issues = [];
  const catalogPatterns = new Set(Object.keys(CAMPAIGN_BOSS_PATTERN_CATALOG_V29));
  for (const phase of BOSS_PHASES_V2) {
    if (!phase.patterns?.length) issues.push(`EMPTY_PHASE:${phase.id}`);
    for (const pattern of phase.patterns || []) {
      if (!catalogPatterns.has(pattern)) issues.push(`MISSING_PATTERN:${phase.id}:${pattern}`);
    }
  }
  for (const [id, pattern] of Object.entries(CAMPAIGN_BOSS_PATTERN_CATALOG_V29)) {
    if (pattern.telegraphMs < 500) issues.push(`SHORT_TELEGRAPH:${id}`);
    if (pattern.recoveryMs < 600) issues.push(`SHORT_RECOVERY:${id}`);
    if (pattern.projectileSpeed <= 0) issues.push(`INVALID_SPEED:${id}`);
  }
  for (const phase of BOSS_PHASES_V2) {
    const combat = CAMPAIGN_BOSS_PHASE_COMBAT_V31[phase.id];
    if (!combat) issues.push(`MISSING_PHASE_COMBAT:${phase.id}`);
    else if (!(combat.movementMultiplier > 0 && combat.recoveryMultiplier > 0
      && combat.projectileSpeedMultiplier > 0)) issues.push(`INVALID_PHASE_COMBAT:${phase.id}`);
  }
  if (!(CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_3.frenzyLevel
    > CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_2.frenzyLevel)) issues.push('FRENZY_LEVEL_ORDER');
  return Object.freeze(issues);
}

const normalize = (x, z, fallback = { x: 0, z: 1 }) => {
  const length = hypot(x, z);
  if (length < .0001) return Object.freeze({ x: fallback.x, z: fallback.z });
  return Object.freeze({ x: x / length, z: z / length });
};

const makePath = ({ origin, direction, speed, width, length = 25, fireOffsetMs = 0, index = 0 }) => {
  const dir = normalize(direction.x, direction.z);
  const endpoint = Object.freeze({
    x: origin.x + dir.x * length,
    y: 0,
    z: origin.z + dir.z * length,
  });
  return Object.freeze({
    index,
    origin,
    endpoint,
    direction: dir,
    velocity: Object.freeze({ x: dir.x * speed, z: dir.z * speed }),
    length,
    width,
    yawRadians: Math.atan2(dir.x, dir.z),
    midpoint: Object.freeze({
      x: (origin.x + endpoint.x) * .5,
      z: (origin.z + endpoint.z) * .5,
    }),
    fireOffsetMs: Math.max(0, Math.trunc(fireOffsetMs)),
  });
};

const makePathTo = ({ origin, endpoint, speed, width, fireOffsetMs = 0, index = 0 }) => {
  const dx = endpoint.x - origin.x;
  const dz = endpoint.z - origin.z;
  const length = hypot(dx, dz) || 1;
  const direction = normalize(dx, dz);
  return Object.freeze({
    index,
    origin,
    endpoint: Object.freeze({ x: endpoint.x, y: 0, z: endpoint.z }),
    direction,
    velocity: Object.freeze({ x: direction.x * speed, z: direction.z * speed }),
    length,
    width,
    yawRadians: Math.atan2(direction.x, direction.z),
    midpoint: Object.freeze({
      x: (origin.x + endpoint.x) * .5,
      z: (origin.z + endpoint.z) * .5,
    }),
    fireOffsetMs: Math.max(0, Math.trunc(fireOffsetMs)),
  });
};

export function createCampaignBossAttackPlanV29({
  pattern,
  origin,
  playerX = 0,
  playerZ = 10,
  arenaHalfWidth = 7,
  worldHalfHeight = 15,
  createdAtMs = 0,
  cycle = 0,
  phaseId = 'phase_1',
} = {}) {
  const contract = resolvePatternContractV31(pattern, phaseId);
  if (!contract) throw new Error(`Unknown Campaign Boss V3.1 pattern: ${pattern}`);
  const phaseCombat = phaseCombatFor(phaseId);
  const ox = Number(origin?.x);
  const oz = Number(origin?.z);
  if (!Number.isFinite(ox) || !Number.isFinite(oz)) {
    throw new TypeError('Campaign Boss V2.9 attack plan requires a finite world origin.');
  }
  const lockedOrigin = Object.freeze({ x: ox, y: finite(origin?.y, 0), z: oz });
  const playerDirection = normalize(finite(playerX, 0) - ox, finite(playerZ, 10) - oz);
  const paths = [];

  if (pattern === 'aimed_burst' || pattern === 'fan') {
    const count = Math.max(1, Math.trunc(contract.shotCount));
    for (let index = 0; index < count; index += 1) {
      const normalizedIndex = count === 1 ? 0 : index / (count - 1) - .5;
      const angle = Math.atan2(playerDirection.z, playerDirection.x)
        + normalizedIndex * contract.spreadRadians;
      const direction = { x: Math.cos(angle), z: Math.sin(angle) };
      paths.push(makePath({
        origin: lockedOrigin,
        direction,
        speed: contract.projectileSpeed,
        width: contract.width,
        length: worldHalfHeight * 2.05,
        fireOffsetMs: index * contract.shotGapMs,
        index,
      }));
    }
  } else if (pattern === 'lane_sweep') {
    const halfWidth = Math.max(2.8, finite(arenaHalfWidth, 7));
    const targetZ = Math.max(4, finite(worldHalfHeight, 15)) + 1.5;
    contract.lanes.forEach((lane, index) => {
      paths.push(makePathTo({
        origin: lockedOrigin,
        endpoint: { x: clamp(lane, -.9, .9) * halfWidth, z: targetZ },
        speed: contract.projectileSpeed,
        width: contract.width,
        fireOffsetMs: index * contract.shotGapMs,
        index,
      }));
    });
  } else if (pattern === 'radial_gap') {
    const slots = Math.max(8, Math.trunc(contract.radialSlots));
    const gapSlots = clamp(Math.trunc(contract.gapSlots), 1, slots - 2);
    const playerAngle = Math.atan2(playerDirection.z, playerDirection.x);
    const step = Math.PI * 2 / slots;
    const gapCenter = Math.round(playerAngle / step);
    for (let slot = 0; slot < slots; slot += 1) {
      let wrapped = ((slot - gapCenter + Math.floor(slots / 2)) % slots + slots) % slots
        - Math.floor(slots / 2);
      if (Math.abs(wrapped) <= Math.floor(gapSlots / 2)) continue;
      const angle = slot * step;
      paths.push(makePath({
        origin: lockedOrigin,
        direction: { x: Math.cos(angle), z: Math.sin(angle) },
        speed: contract.projectileSpeed,
        width: contract.width,
        length: worldHalfHeight * 1.75,
        fireOffsetMs: paths.length * contract.shotGapMs,
        index: paths.length,
      }));
    }
  }

  const startedAt = Math.max(0, finite(createdAtMs, 0));
  return freezeDeep({
    version: CAMPAIGN_BOSS_COMBAT_VERSION,
    id: `boss-v29-${phaseId}-${cycle}-${pattern}`,
    phaseId,
    frenzyLevel: phaseCombat.frenzyLevel,
    phaseCombat,
    cycle: Math.max(0, Math.trunc(finite(cycle, 0))),
    pattern,
    originSpace: 'world',
    originKind: 'boss_muzzle',
    origin: lockedOrigin,
    lockedPlayerDirection: playerDirection,
    telegraphStartedAtMs: startedAt,
    telegraphEndsAtMs: startedAt + contract.telegraphMs,
    recoveryMs: contract.recoveryMs,
    projectileSpeed: contract.projectileSpeed,
    paths,
  });
}

export function projectilesFromCampaignBossAttackPlanV29(plan) {
  if (!plan?.paths?.length) return Object.freeze([]);
  return Object.freeze(plan.paths.map(path => Object.freeze({
    planId: plan.id,
    pattern: plan.pattern,
    origin: path.origin,
    endpoint: path.endpoint,
    velocity: path.velocity,
    fireOffsetMs: path.fireOffsetMs,
    width: path.width,
  })));
}

export function createCampaignBossCombatStateV29({ seed = 1, nowMs = 0 } = {}) {
  return {
    version: CAMPAIGN_BOSS_COMBAT_VERSION,
    seed: hashParts(seed, 'campaign_final_boss_v29'),
    phase: 'reposition',
    phaseStartedAt: Math.max(0, finite(nowMs, 0)),
    cycle: 0,
    targetX: null,
    targetZ: null,
    velocityX: 0,
    velocityZ: 0,
    attackPlan: null,
    currentPhaseId: 'phase_1',
    enrageUntilMs: 0,
  };
}

const phaseIndexOf = id => Math.max(0, BOSS_PHASES_V2.findIndex(phase => phase.id === id));

const selectPattern = (state, hpPhase) => {
  const patterns = hpPhase.patterns;
  const phaseIndex = phaseIndexOf(hpPhase.id);
  const index = (state.seed + state.cycle * 5 + phaseIndex * 11) % patterns.length;
  return patterns[index];
};

const resolveBossAnchor = (state, input, band) => {
  const halfWidth = Math.max(3, finite(input.arenaHalfWidth, 7));
  const xBound = Math.max(2.4, halfWidth - 1.45);
  const lanes = [-.52, .52, 0, -.28, .28, -.64, .64];
  const lane = lanes[(state.seed + state.cycle * 3) % lanes.length];
  const depthSequence = [1.75, 2.35, 1.35, 2.05];
  const depth = depthSequence[(state.seed + state.cycle) % depthSequence.length];
  return {
    x: clamp(lane * xBound, -xBound, xBound),
    z: clamp(band.topSafeRootZ + depth, band.backlineZ + .8, band.rangedZ - 1.8),
  };
};

const steerBoss = (state, input, target, speedMultiplier = 1) => {
  const frameScale = clamp(finite(input.frameScale, 1), 0, 4);
  const baseSpeed = Math.max(.012, finite(input.baseSpeed, .045));
  const dx = target.x - finite(input.enemyX, 0);
  const dz = target.z - finite(input.enemyZ, 0);
  const distance = hypot(dx, dz);
  const inv = distance > .0001 ? 1 / distance : 0;
  const slow = distance < 2.2 ? clamp(distance / 2.2, .12, 1) : 1;
  const maxSpeed = Math.max(baseSpeed * speedMultiplier, .034) * slow;
  const desiredX = dx * inv * maxSpeed;
  const desiredZ = dz * inv * maxSpeed;
  const maxDelta = Math.max(.0018, baseSpeed * .115 * frameScale);
  state.velocityX = approach(state.velocityX, desiredX, maxDelta);
  state.velocityZ = approach(state.velocityZ, desiredZ, maxDelta);
  return {
    distance,
    deltaX: state.velocityX * frameScale,
    deltaZ: state.velocityZ * frameScale,
    velocityX: state.velocityX,
    velocityZ: state.velocityZ,
  };
};

const holdBoss = (state, input) => {
  const frameScale = clamp(finite(input.frameScale, 1), 0, 4);
  const baseSpeed = Math.max(.012, finite(input.baseSpeed, .045));
  const maxDelta = Math.max(.002, baseSpeed * .2 * frameScale);
  state.velocityX = approach(state.velocityX, 0, maxDelta);
  state.velocityZ = approach(state.velocityZ, 0, maxDelta);
  return {
    deltaX: state.velocityX * frameScale,
    deltaZ: state.velocityZ * frameScale,
    velocityX: state.velocityX,
    velocityZ: state.velocityZ,
  };
};

const stopBoss = state => {
  state.velocityX = 0;
  state.velocityZ = 0;
  return {
    deltaX: 0,
    deltaZ: 0,
    velocityX: 0,
    velocityZ: 0,
  };
};

export function stepCampaignBossCombatV29(state, input = {}) {
  if (!state) return Object.freeze({ state: null, events: Object.freeze([]), deltaX: 0, deltaZ: 0 });
  const nowMs = Math.max(0, finite(input.nowMs, 0));
  const hpRatio = clamp(finite(input.hpRatio, 1), 0, 1);
  const events = [];
  const hpPhase = bossPhaseForHp(hpRatio);

  if (input.suspended) {
    if (state.attackPlan) events.push(Object.freeze({ type: 'telegraph_cancelled', planId: state.attackPlan.id }));
    state.attackPlan = null;
    state.phase = 'reposition';
    state.phaseStartedAt = nowMs;
    state.targetX = null;
    state.targetZ = null;
    const motion = holdBoss(state, input);
    return Object.freeze({
      state, events: Object.freeze(events), phase: state.phase,
      holdOrientation: true, visualState: 'enrage',
      ...motion,
    });
  }

  if (hpPhase.id !== state.currentPhaseId) {
    const previousPhaseId = state.currentPhaseId;
    state.currentPhaseId = hpPhase.id;
    events.push(Object.freeze({ type: 'phase_changed', previousPhaseId, phaseId: hpPhase.id }));
    if (hpPhase.id === 'phase_3') {
      if (state.attackPlan) {
        events.push(Object.freeze({ type: 'telegraph_cancelled', planId: state.attackPlan.id }));
      }
      state.attackPlan = null;
      state.phase = 'enrage';
      state.phaseStartedAt = nowMs;
      state.enrageUntilMs = nowMs + phaseCombatFor(hpPhase.id).enrageHoldMs;
      state.targetX = null;
      state.targetZ = null;
      const motion = stopBoss(state);
      events.push(Object.freeze({
        type: 'enrage_started',
        phaseId: hpPhase.id,
        frenzyLevel: phaseCombatFor(hpPhase.id).frenzyLevel,
        holdMs: phaseCombatFor(hpPhase.id).enrageHoldMs,
      }));
      return Object.freeze({
        state, events: Object.freeze(events), phase: state.phase,
        holdOrientation: true, visualState: 'enrage', frenzyLevel: 2,
        ...motion,
      });
    }
  }

  if (state.phase === 'enrage') {
    const motion = stopBoss(state);
    if (nowMs >= state.enrageUntilMs) {
      state.phase = 'reposition';
      state.phaseStartedAt = nowMs;
      state.targetX = null;
      state.targetZ = null;
      events.push(Object.freeze({ type: 'enrage_finished', phaseId: state.currentPhaseId }));
    }
    return Object.freeze({
      state, events: Object.freeze(events), phase: state.phase,
      holdOrientation: true,
      visualState: nowMs < state.enrageUntilMs ? 'enrage' : 'move',
      frenzyLevel: phaseCombatFor(state.currentPhaseId).frenzyLevel,
      ...motion,
    });
  }

  const band = resolveCampaignCombatSafeBandV29({
    worldHalfHeight: input.worldHalfHeight,
    viewportHeight: input.viewportHeight,
    hudOcclusionLineZ: input.hudOcclusionLineZ,
    entityScale: input.entityScale ?? 1.7,
    hpBarOffsetPx: 0,
    hpBarHeightPx: 0,
    extraMarginPx: 22,
    playerZ: input.playerZ,
  });

  if (state.phase === 'reposition') {
    if (state.targetX == null || state.targetZ == null) {
      const target = resolveBossAnchor(state, input, band);
      state.targetX = target.x;
      state.targetZ = target.z;
      state.phaseStartedAt = nowMs;
    }
    const distance = hypot(state.targetX - finite(input.enemyX, 0), state.targetZ - finite(input.enemyZ, 0));
    // Position is part of the attack readability contract. Never switch to
    // aim merely because a fixed timer elapsed while the Boss is still crossing
    // the arena; telegraphing from an in-between location looks like a demo.
    if (distance <= .42) {
      stopBoss(state);
      state.phase = 'aim';
      state.phaseStartedAt = nowMs;
      return Object.freeze({
        state, events: Object.freeze(events), phase: state.phase,
        holdOrientation: false, facePlayer: true, visualState: 'idle',
        deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0,
      });
    }
    const phaseCombat = phaseCombatFor(hpPhase.id);
    const motion = steerBoss(state, input, { x: state.targetX, z: state.targetZ },
      phaseCombat.movementMultiplier);
    return Object.freeze({
      state, events: Object.freeze(events), phase: state.phase,
      holdOrientation: false, visualState: 'move',
      ...motion,
    });
  }

  if (state.phase === 'aim') {
    const motion = stopBoss(state);
    if (nowMs - state.phaseStartedAt >= 320) {
      const pattern = selectPattern(state, hpPhase);
      state.attackPlan = createCampaignBossAttackPlanV29({
        pattern,
        origin: input.origin,
        playerX: input.playerX,
        playerZ: input.playerZ,
        arenaHalfWidth: input.arenaHalfWidth,
        worldHalfHeight: input.worldHalfHeight,
        createdAtMs: nowMs,
        cycle: state.cycle,
        phaseId: hpPhase.id,
      });
      state.phase = 'telegraph';
      state.phaseStartedAt = nowMs;
      events.push(Object.freeze({ type: 'telegraph_started', plan: state.attackPlan }));
    }
    return Object.freeze({
      state, events: Object.freeze(events), phase: state.phase,
      holdOrientation: state.phase === 'telegraph', facePlayer: state.phase === 'aim',
      visualState: state.phase === 'telegraph' ? 'attack' : 'idle',
      ...motion,
    });
  }

  if (state.phase === 'telegraph') {
    const motion = holdBoss(state, input);
    if (state.attackPlan && nowMs >= state.attackPlan.telegraphEndsAtMs) {
      const plan = state.attackPlan;
      events.push(Object.freeze({ type: 'fire_pattern', plan }));
      events.push(Object.freeze({ type: 'telegraph_ended', planId: plan.id }));
      state.phase = 'recover';
      state.phaseStartedAt = nowMs;
    }
    return Object.freeze({
      state, events: Object.freeze(events), phase: state.phase,
      holdOrientation: true, visualState: 'attack',
      ...motion,
    });
  }

  const motion = holdBoss(state, input);
  const recoveryMs = Math.max(600, finite(state.attackPlan?.recoveryMs, 1000));
  if (nowMs - state.phaseStartedAt >= recoveryMs) {
    state.cycle += 1;
    state.phase = 'reposition';
    state.phaseStartedAt = nowMs;
    state.targetX = null;
    state.targetZ = null;
    state.attackPlan = null;
  }
  return Object.freeze({
    state, events: Object.freeze(events), phase: state.phase,
    holdOrientation: true, visualState: state.phase === 'recover' ? 'idle' : 'move',
    ...motion,
  });
}
