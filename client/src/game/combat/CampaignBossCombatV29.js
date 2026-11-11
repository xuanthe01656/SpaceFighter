import { BOSS_PHASES_V2, bossPhaseForHp } from './EnemyCombatCatalogV2.js';
import { resolveCampaignCombatSafeBandV29 } from './CampaignCombatChoreographyV29.js';
import {
  CAMPAIGN_BOSS_PATTERN_CATALOG_V33,
  auditCampaignBossArsenalV33,
  resolveCampaignBossPatternContractV33,
  resolveCampaignBossPatternV33,
  resolveCampaignBossProfileV33,
} from './CampaignBossArsenalV33.js';

/**
 * Deterministic final-boss movement and attack choreography for Campaign production and QA.
 * One immutable attack plan is shared by warning VFX and spawned projectiles.
 */
export const CAMPAIGN_BOSS_COMBAT_VERSION = 'campaign-boss-combat-v3.3.0';

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

export const CAMPAIGN_BOSS_PATTERN_CATALOG_V29 = CAMPAIGN_BOSS_PATTERN_CATALOG_V33;

export const CAMPAIGN_BOSS_PHASE_COMBAT_V31 = freezeDeep({
  phase_1: {
    frenzyLevel: 0,
    movementMultiplier: 1,
    recoveryMultiplier: 1,
    projectileSpeedMultiplier: 1,
    telegraphMultiplier: 1,
    damageMultiplier: 1,
    extraBurstShots: 0,
    extraRadialSlots: 0,
    enrageHoldMs: 0,
  },
  phase_2: {
    frenzyLevel: 1,
    movementMultiplier: 1.10,
    recoveryMultiplier: .88,
    projectileSpeedMultiplier: 1.07,
    telegraphMultiplier: .96,
    damageMultiplier: 1.08,
    extraBurstShots: 0,
    extraRadialSlots: 0,
    enrageHoldMs: 0,
  },
  phase_3: {
    frenzyLevel: 2,
    movementMultiplier: 1.32,
    recoveryMultiplier: .62,
    projectileSpeedMultiplier: 1.14,
    telegraphMultiplier: .90,
    damageMultiplier: 1.18,
    extraBurstShots: 2,
    extraRadialSlots: 2,
    enrageHoldMs: 900,
  },
});

const phaseCombatFor = phaseId => CAMPAIGN_BOSS_PHASE_COMBAT_V31[phaseId]
  || CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_1;

const resolvePatternContractV31 = ({ pattern, profile, phaseId }) =>
  resolveCampaignBossPatternContractV33({
    pattern,
    profile,
    phaseId,
    phaseCombat: phaseCombatFor(phaseId),
  });

export function auditCampaignBossCombatV29() {
  const issues = [...auditCampaignBossArsenalV33()];
  for (const phase of BOSS_PHASES_V2) {
    const combat = CAMPAIGN_BOSS_PHASE_COMBAT_V31[phase.id];
    if (!combat) issues.push(`MISSING_PHASE_COMBAT:${phase.id}`);
    else if (!(combat.movementMultiplier > 0 && combat.recoveryMultiplier > 0
      && combat.projectileSpeedMultiplier > 0 && combat.damageMultiplier > 0
      && combat.telegraphMultiplier > 0)) issues.push(`INVALID_PHASE_COMBAT:${phase.id}`);
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
  pattern = null,
  origin,
  playerX = 0,
  playerZ = 10,
  playerVelocityX = 0,
  playerVelocityZ = 0,
  arenaHalfWidth = 7,
  worldHalfHeight = 15,
  createdAtMs = 0,
  cycle = 0,
  phaseId = 'phase_1',
  planetId = 1,
  bossType = 'mech',
  profileId = null,
} = {}) {
  const profile = resolveCampaignBossProfileV33({ planetId, bossType, profileId });
  const profileFamily = profile.planetId === 1 ? 'alpha' : profile.planetId === 2 ? 'cryo' : 'inferno';
  const requestedPattern = CAMPAIGN_BOSS_PATTERN_CATALOG_V33[pattern];
  const resolvedPattern = requestedPattern?.family === profileFamily
    ? pattern : resolveCampaignBossPatternV33({ profile, phaseId, cycle });
  const contract = resolvePatternContractV31({ pattern: resolvedPattern, profile, phaseId });
  if (!contract) throw new Error(`Unknown Campaign Boss V3.3 pattern: ${resolvedPattern || pattern}`);
  const phaseCombat = phaseCombatFor(phaseId);
  const ox = Number(origin?.x);
  const oz = Number(origin?.z);
  if (!Number.isFinite(ox) || !Number.isFinite(oz)) {
    throw new TypeError('Campaign Boss V3.3 attack plan requires a finite world origin.');
  }
  const lockedOrigin = Object.freeze({ x: ox, y: finite(origin?.y, 0), z: oz });
  const halfWidth = Math.max(2.8, finite(arenaHalfWidth, 7));
  const targetZ = Math.max(4, finite(worldHalfHeight, 15)) + 1.5;
  const leadFrames = Math.max(0, finite(contract.leadMs, 0)) / (1000 / 60);
  const predictedPlayer = Object.freeze({
    x: clamp(finite(playerX, 0) + finite(playerVelocityX, 0) * leadFrames, -halfWidth * .92, halfWidth * .92),
    z: finite(playerZ, 10) + finite(playerVelocityZ, 0) * leadFrames,
  });
  const playerDirection = normalize(predictedPlayer.x - ox, predictedPlayer.z - oz);
  const baseAngle = Math.atan2(playerDirection.x, playerDirection.z);
  const toDirection = angle => ({ x: Math.sin(angle), z: Math.cos(angle) });
  const paths = [];
  const addDirectionalPath = ({ direction, fireOffsetMs = 0, index = paths.length }) => {
    paths.push(makePath({
      origin: lockedOrigin,
      direction,
      speed: contract.projectileSpeed,
      width: contract.width,
      length: worldHalfHeight * 2.08,
      fireOffsetMs,
      index,
    }));
  };
  const addLanePath = ({ lane, fireOffsetMs = 0, index = paths.length }) => {
    paths.push(makePathTo({
      origin: lockedOrigin,
      endpoint: { x: clamp(lane, -.92, .92) * halfWidth, z: targetZ },
      speed: contract.projectileSpeed,
      width: contract.width,
      fireOffsetMs,
      index,
    }));
  };

  if (contract.geometry === 'predictive_burst') {
    const count = Math.max(1, Math.trunc(contract.shotCount + phaseCombat.extraBurstShots));
    for (let index = 0; index < count; index += 1) {
      const normalizedIndex = count === 1 ? 0 : index / (count - 1) - .5;
      addDirectionalPath({
        direction: toDirection(baseAngle + normalizedIndex * contract.spreadRadians),
        fireOffsetMs: index * contract.shotGapMs,
      });
    }
  } else if (contract.geometry === 'alternating_fan' || contract.geometry === 'fan_volley') {
    const frenzyVolley = phaseCombat.frenzyLevel >= 2 && contract.geometry === 'fan_volley' ? 1 : 0;
    const volleys = Math.max(1, Math.trunc(contract.volleys + frenzyVolley));
    const count = Math.max(3, Math.trunc(contract.shotCount + phaseCombat.extraBurstShots));
    for (let volley = 0; volley < volleys; volley += 1) {
      const swing = (volley % 2 === 0 ? -1 : 1) * contract.centerSwingRadians;
      for (let index = 0; index < count; index += 1) {
        const normalizedIndex = count === 1 ? 0 : index / (count - 1) - .5;
        addDirectionalPath({
          direction: toDirection(baseAngle + swing + normalizedIndex * contract.spreadRadians),
          fireOffsetMs: volley * contract.volleyGapMs + index * contract.shotGapMs,
        });
      }
    }
  } else if (contract.geometry === 'lane_sequence') {
    const lanes = [...contract.laneOrder];
    if (phaseCombat.frenzyLevel >= 2) lanes.push(-.48, .48);
    lanes.forEach((lane, index) => addLanePath({ lane, fireOffsetMs: index * contract.shotGapMs }));
  } else if (contract.geometry === 'gap_fan') {
    const slots = Math.max(9, Math.trunc(contract.radialSlots + phaseCombat.extraRadialSlots));
    const gapSlots = clamp(Math.trunc(contract.gapSlots), 1, slots - 4);
    const arcHalf = clamp(finite(contract.arcHalfRadians, 1.05), .65, Math.PI / 2 - .06);
    const step = arcHalf * 2 / Math.max(1, slots - 1);
    const playerOffset = clamp(Math.atan2(playerDirection.x, playerDirection.z), -arcHalf, arcHalf);
    const halfGap = Math.floor(gapSlots / 2);
    const baseGap = clamp(Math.round((playerOffset + arcHalf) / step), halfGap, slots - 1 - halfGap);
    for (let volley = 0; volley < Math.max(1, contract.volleys); volley += 1) {
      const shiftedGap = clamp(baseGap + (volley % 2 === 0 ? -1 : 1), halfGap, slots - 1 - halfGap);
      let localIndex = 0;
      for (let slot = 0; slot < slots; slot += 1) {
        if (Math.abs(slot - shiftedGap) <= halfGap) continue;
        const offset = -arcHalf + slot * step;
        addDirectionalPath({
          direction: toDirection(offset),
          fireOffsetMs: volley * contract.volleyGapMs + localIndex * contract.shotGapMs,
        });
        localIndex += 1;
      }
    }
  } else if (contract.geometry === 'lane_wall_gap') {
    let laneCount = Math.max(5, Math.trunc(contract.laneCount + (phaseCombat.frenzyLevel >= 2 ? 2 : 0)));
    if (laneCount % 2 === 0) laneCount += 1;
    const lanes = Array.from({ length: laneCount }, (_, index) => -.84 + index * (1.68 / (laneCount - 1)));
    const closestGap = lanes.reduce((best, lane, index) =>
      Math.abs(lane * halfWidth - predictedPlayer.x) < Math.abs(lanes[best] * halfWidth - predictedPlayer.x)
        ? index : best, 0);
    const wallCount = Math.max(1, Math.trunc(contract.wallCount + (phaseCombat.frenzyLevel >= 2 ? 1 : 0)));
    for (let wall = 0; wall < wallCount; wall += 1) {
      const shift = wall === 0 ? 0 : (wall % 2 === 1 ? 1 : -1) * Math.ceil(wall / 2);
      const gapIndex = clamp(closestGap + shift, 0, lanes.length - 1);
      let localIndex = 0;
      lanes.forEach((lane, index) => {
        if (Math.abs(index - gapIndex) <= Math.floor(contract.gapSlots / 2)) return;
        addLanePath({
          lane,
          fireOffsetMs: wall * contract.volleyGapMs + localIndex * contract.shotGapMs,
        });
        localIndex += 1;
      });
    }
  } else if (contract.geometry === 'staggered_tridents') {
    const volleys = Math.max(1, Math.trunc(contract.volleys + (phaseCombat.frenzyLevel >= 2 ? 1 : 0)));
    const centers = [-contract.centerSwingRadians, 0, contract.centerSwingRadians, 0];
    for (let volley = 0; volley < volleys; volley += 1) {
      const center = centers[volley % centers.length];
      const count = Math.max(3, Math.trunc(contract.shotCount));
      for (let index = 0; index < count; index += 1) {
        const normalizedIndex = count === 1 ? 0 : index / (count - 1) - .5;
        addDirectionalPath({
          direction: toDirection(baseAngle + center + normalizedIndex * contract.spreadRadians),
          fireOffsetMs: volley * contract.volleyGapMs + index * contract.shotGapMs,
        });
      }
    }
  } else if (contract.geometry === 'target_cluster') {
    const count = Math.max(3, Math.trunc(contract.shotCount + phaseCombat.extraBurstShots));
    for (let index = 0; index < count; index += 1) {
      const scatter = contract.scatter[index % Math.max(1, contract.scatter.length)] || 0;
      const laneX = clamp(predictedPlayer.x + scatter * halfWidth * .52, -halfWidth * .88, halfWidth * .88);
      paths.push(makePathTo({
        origin: lockedOrigin,
        endpoint: { x: laneX, z: targetZ },
        speed: contract.projectileSpeed,
        width: contract.width,
        fireOffsetMs: index * contract.shotGapMs,
        index: paths.length,
      }));
    }
  } else if (contract.geometry === 'forward_arc_gap') {
    const slots = Math.max(11, Math.trunc(contract.radialSlots + phaseCombat.extraRadialSlots));
    const gapSlots = clamp(Math.trunc(contract.gapSlots), 1, slots - 4);
    const arcHalf = clamp(finite(contract.arcHalfRadians, 1.22), .65, Math.PI / 2 - .06);
    const step = arcHalf * 2 / Math.max(1, slots - 1);
    const playerOffset = clamp(Math.atan2(playerDirection.x, playerDirection.z), -arcHalf, arcHalf);
    const halfGap = Math.floor(gapSlots / 2);
    const gapCenter = clamp(Math.round((playerOffset + arcHalf) / step), halfGap, slots - 1 - halfGap);
    for (let slot = 0; slot < slots; slot += 1) {
      if (Math.abs(slot - gapCenter) <= halfGap) continue;
      const offset = -arcHalf + slot * step;
      addDirectionalPath({
        direction: toDirection(offset),
        fireOffsetMs: paths.length * contract.shotGapMs,
      });
    }
  }

  const startedAt = Math.max(0, finite(createdAtMs, 0));
  const latestFireOffsetMs = paths.reduce((latest, path) => Math.max(latest, path.fireOffsetMs), 0);
  const postVolleyHoldMs = phaseCombat.frenzyLevel >= 2 ? 100
    : phaseCombat.frenzyLevel === 1 ? 160 : 240;
  // Recovery owns the entire projectile schedule. Without this floor, a dense
  // multi-volley pattern can transition to the next cycle before its last
  // delayed shots spawn; the stale-plan guard would then suppress those shots.
  // Frenzy shortens the pause *after* the final shot instead of deleting shots.
  const recoveryMs = Math.max(contract.recoveryMs, latestFireOffsetMs + postVolleyHoldMs);
  return freezeDeep({
    version: CAMPAIGN_BOSS_COMBAT_VERSION,
    id: `boss-v33-${profile.id}-${phaseId}-${cycle}-${resolvedPattern}`,
    bossProfileId: profile.id,
    planetId: profile.planetId,
    bossType: profile.bossType,
    powerRank: profile.powerRank,
    phaseId,
    frenzyLevel: phaseCombat.frenzyLevel,
    phaseCombat,
    cycle: Math.max(0, Math.trunc(finite(cycle, 0))),
    pattern: resolvedPattern,
    patternFamily: contract.family,
    originSpace: 'world',
    originKind: 'boss_muzzle',
    origin: lockedOrigin,
    predictedPlayer,
    lockedPlayerDirection: playerDirection,
    telegraphStartedAtMs: startedAt,
    telegraphEndsAtMs: startedAt + contract.telegraphMs,
    recoveryMs,
    latestFireOffsetMs,
    postVolleyHoldMs,
    projectileSpeed: contract.projectileSpeed,
    projectileDamage: contract.projectileDamage,
    damageType: contract.damageType,
    visualId: contract.visualId,
    paths,
  });
}

export function projectilesFromCampaignBossAttackPlanV29(plan) {
  if (!plan?.paths?.length) return Object.freeze([]);
  return Object.freeze(plan.paths.map(path => Object.freeze({
    planId: plan.id,
    pattern: plan.pattern,
    visualId: plan.visualId,
    bossProfileId: plan.bossProfileId,
    planetId: plan.planetId,
    bossType: plan.bossType,
    rawDamage: plan.projectileDamage,
    damageType: plan.damageType,
    origin: path.origin,
    endpoint: path.endpoint,
    velocity: path.velocity,
    fireOffsetMs: path.fireOffsetMs,
    width: path.width,
  })));
}

export function createCampaignBossCombatStateV29({
  seed = 1, nowMs = 0, planetId = 1, bossType = 'mech', profileId = null,
} = {}) {
  const profile = resolveCampaignBossProfileV33({ planetId, bossType, profileId });
  return {
    version: CAMPAIGN_BOSS_COMBAT_VERSION,
    seed: hashParts(seed, 'campaign_final_boss_v33', profile.id),
    planetId: profile.planetId,
    bossType: profile.bossType,
    profileId: profile.id,
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

const selectPattern = (state, hpPhase, profile) => resolveCampaignBossPatternV33({
  profile,
  phaseId: hpPhase.id,
  cycle: state.cycle,
});

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
  const profile = resolveCampaignBossProfileV33({
    planetId: state.planetId, bossType: state.bossType, profileId: state.profileId,
  });

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
      phaseCombat.movementMultiplier * profile.movementMultiplier);
    return Object.freeze({
      state, events: Object.freeze(events), phase: state.phase,
      holdOrientation: false, visualState: 'move',
      ...motion,
    });
  }

  if (state.phase === 'aim') {
    const motion = stopBoss(state);
    if (nowMs - state.phaseStartedAt >= 320) {
      const pattern = selectPattern(state, hpPhase, profile);
      state.attackPlan = createCampaignBossAttackPlanV29({
        pattern,
        origin: input.origin,
        playerX: input.playerX,
        playerZ: input.playerZ,
        playerVelocityX: input.playerVelocityX,
        playerVelocityZ: input.playerVelocityZ,
        arenaHalfWidth: input.arenaHalfWidth,
        worldHalfHeight: input.worldHalfHeight,
        createdAtMs: nowMs,
        cycle: state.cycle,
        phaseId: hpPhase.id,
        planetId: profile.planetId,
        bossType: profile.bossType,
        profileId: profile.id,
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
  const recoveryMs = Math.max(360, finite(state.attackPlan?.recoveryMs, 1000));
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
