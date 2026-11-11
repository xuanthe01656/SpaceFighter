import { ENEMY_ARCHETYPES_V2 } from './EnemyCombatCatalogV2.js';
import {
  resolveCampaignEdgeAwareAnchorXV36,
  resolveCampaignFireEnvelopeV36,
} from './CampaignEnemyEngagementV36.js';

/**
 * Campaign combat choreography V3.6.0
 *
 * Production contract:
 * - every non-diver owns a repeatable engagement loop and remains in combat
 *   until destroyed;
 * - only the charger may cross the player's depth;
 * - ranged roles maintain catalog-authored fire bands and re-position between
 *   volleys instead of drifting through the ship and disappearing;
 * - ranged targets continuously track the player inside edge-safe anchors;
 * - fire range is authored on the forward/depth axis, so horizontal edge play
 *   cannot make a visible target undetectable.
 */
export const CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION = 'campaign-combat-choreography-v3.6.0';

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
  arrivalRadius: options.arrivalRadius ?? .42,
  slowRadius: options.slowRadius ?? .72,
  acceleration: options.acceleration ?? .42,
  speedFloor: options.speedFloor ?? 0,
  maxTravelMs: options.maxTravelMs ?? Math.max(3200, durationMs * 2.2),
  dwellMs: options.dwellMs ?? 0,
  holdAtArrival: Boolean(options.holdAtArrival),
  mayFire: Boolean(options.mayFire),
  fireRequiresArrival: Boolean(options.fireRequiresArrival),
  facePlayer: Boolean(options.facePlayer),
  retreat: Boolean(options.retreat),
  egress: false,
});

const loopingContract = (roleId, phases, loopPhaseIndex = 1, options = {}) => Object.freeze({
  roleId,
  phases: Object.freeze(phases),
  loopPhaseIndex,
  externalController: options.externalController || null,
});

export const CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30 = freezeDeep({
  hook_return: loopingContract('raider', [
    phase('skirmish_entry', 620, 1.54, {
      arrivalRadius: .52, slowRadius: .46, acceleration: .76,
      speedFloor: .122, maxTravelMs: 3200,
    }),
    phase('attack_pass_a', 620, 1.48, {
      mayFire: true, facePlayer: true, arrivalRadius: .56,
      slowRadius: .40, acceleration: .76, speedFloor: .112,
      maxTravelMs: 2100, dwellMs: 80,
    }),
    phase('breakaway', 520, 1.58, {
      retreat: true, arrivalRadius: .58, slowRadius: .42,
      acceleration: .78, speedFloor: .126, maxTravelMs: 1900,
    }),
    phase('attack_pass_b', 620, 1.52, {
      mayFire: true, facePlayer: true, arrivalRadius: .56,
      slowRadius: .40, acceleration: .78, speedFloor: .116,
      maxTravelMs: 2100, dwellMs: 80,
    }),
    phase('tactical_reset', 500, 1.56, {
      retreat: true, arrivalRadius: .58, slowRadius: .42,
      acceleration: .78, speedFloor: .124, maxTravelMs: 1900,
    }),
  ], 1),
  double_hook_return: loopingContract('raider', [
    phase('skirmish_entry', 620, 1.54, {
      arrivalRadius: .52, slowRadius: .46, acceleration: .76,
      speedFloor: .122, maxTravelMs: 3200,
    }),
    phase('attack_pass_a', 600, 1.50, {
      mayFire: true, facePlayer: true, arrivalRadius: .56,
      slowRadius: .39, acceleration: .78, speedFloor: .114,
      maxTravelMs: 2050, dwellMs: 70,
    }),
    phase('breakaway', 500, 1.60, {
      retreat: true, arrivalRadius: .58, slowRadius: .41,
      acceleration: .80, speedFloor: .128, maxTravelMs: 1850,
    }),
    phase('attack_pass_b', 600, 1.54, {
      mayFire: true, facePlayer: true, arrivalRadius: .56,
      slowRadius: .39, acceleration: .80, speedFloor: .118,
      maxTravelMs: 2050, dwellMs: 70,
    }),
    phase('breakaway_2', 490, 1.62, {
      retreat: true, arrivalRadius: .58, slowRadius: .40,
      acceleration: .80, speedFloor: .130, maxTravelMs: 1800,
    }),
    phase('attack_pass_c', 590, 1.58, {
      mayFire: true, facePlayer: true, arrivalRadius: .58,
      slowRadius: .38, acceleration: .82, speedFloor: .120,
      maxTravelMs: 2000, dwellMs: 70,
    }),
    phase('tactical_reset', 490, 1.60, {
      retreat: true, arrivalRadius: .60, slowRadius: .40,
      acceleration: .80, speedFloor: .128, maxTravelMs: 1800,
    }),
  ], 1),
});

export const CAMPAIGN_ROLE_CHOREOGRAPHY_V29 = freezeDeep({
  strafe: CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30.hook_return,
  keep_range: loopingContract('gunner', [
    phase('firing_slot', 680, 1.46, {
      mayFire: true, fireRequiresArrival: true, holdAtArrival: true, facePlayer: true,
      arrivalRadius: .48, slowRadius: .42, acceleration: .74,
      speedFloor: .112, maxTravelMs: 3200, dwellMs: 680,
    }),
    phase('strafe_a', 650, 1.36, {
      mayFire: true, facePlayer: true, arrivalRadius: .46,
      slowRadius: .36, acceleration: .74, speedFloor: .100,
      maxTravelMs: 1950, dwellMs: 65,
    }),
    phase('fallback', 500, 1.48, {
      retreat: true, arrivalRadius: .50, slowRadius: .40,
      acceleration: .76, speedFloor: .116, maxTravelMs: 1800,
    }),
    phase('strafe_b', 650, 1.40, {
      mayFire: true, facePlayer: true, arrivalRadius: .46,
      slowRadius: .36, acceleration: .76, speedFloor: .102,
      maxTravelMs: 1950, dwellMs: 65,
    }),
    phase('range_reset', 500, 1.46, {
      retreat: true, arrivalRadius: .50, slowRadius: .40,
      acceleration: .76, speedFloor: .114, maxTravelMs: 1800,
    }),
  ], 1),
  telegraphed_charge: loopingContract('charger', [], 0, {
    externalController: 'CampaignRuntimeReliabilityV26A3',
  }),
  guard_lane: loopingContract('shieldbearer', [
    phase('guard_slot', 760, 1.28, {
      mayFire: true, fireRequiresArrival: true, holdAtArrival: true, facePlayer: true,
      arrivalRadius: .46, slowRadius: .44, acceleration: .68,
      speedFloor: .098, maxTravelMs: 3000, dwellMs: 720,
    }),
    phase('guard_sweep_a', 680, 1.16, {
      mayFire: true, facePlayer: true, arrivalRadius: .44,
      slowRadius: .36, acceleration: .70, speedFloor: .084,
      maxTravelMs: 1850, dwellMs: 90,
    }),
    phase('cover_reset', 560, 1.30, {
      retreat: true, arrivalRadius: .48, slowRadius: .40,
      acceleration: .72, speedFloor: .100, maxTravelMs: 1800,
    }),
    phase('guard_sweep_b', 680, 1.18, {
      mayFire: true, facePlayer: true, arrivalRadius: .44,
      slowRadius: .36, acceleration: .70, speedFloor: .086,
      maxTravelMs: 1850, dwellMs: 90,
    }),
    phase('guard_reset', 540, 1.28, {
      retreat: true, arrivalRadius: .48, slowRadius: .40,
      acceleration: .72, speedFloor: .098, maxTravelMs: 1800,
    }),
  ], 1),
  support_orbit: loopingContract('support', [
    phase('support_slot', 700, 1.40, {
      mayFire: true, fireRequiresArrival: true, holdAtArrival: true, facePlayer: true,
      arrivalRadius: .48, slowRadius: .42, acceleration: .72,
      speedFloor: .108, maxTravelMs: 3200, dwellMs: 680,
    }),
    phase('orbit_0', 570, 1.26, {
      mayFire: true, facePlayer: true, arrivalRadius: .42,
      slowRadius: .34, acceleration: .72, speedFloor: .092,
      maxTravelMs: 1700, dwellMs: 50,
    }),
    phase('orbit_1', 570, 1.30, {
      mayFire: true, facePlayer: true, arrivalRadius: .42,
      slowRadius: .34, acceleration: .74, speedFloor: .094,
      maxTravelMs: 1700, dwellMs: 50,
    }),
    phase('support_reset', 500, 1.42, {
      retreat: true, arrivalRadius: .48, slowRadius: .39,
      acceleration: .74, speedFloor: .110, maxTravelMs: 1750,
    }),
    phase('orbit_2', 570, 1.32, {
      mayFire: true, facePlayer: true, arrivalRadius: .42,
      slowRadius: .34, acceleration: .74, speedFloor: .096,
      maxTravelMs: 1700, dwellMs: 50,
    }),
    phase('orbit_3', 570, 1.34, {
      mayFire: true, facePlayer: true, arrivalRadius: .42,
      slowRadius: .34, acceleration: .74, speedFloor: .098,
      maxTravelMs: 1700, dwellMs: 50,
    }),
    phase('support_return', 500, 1.42, {
      retreat: true, arrivalRadius: .48, slowRadius: .39,
      acceleration: .74, speedFloor: .110, maxTravelMs: 1750,
    }),
  ], 1),
  telegraphed_zone: loopingContract('artillery', [
    phase('battery_approach', 820, 1.30, {
      arrivalRadius: .44, slowRadius: .44, acceleration: .68,
      speedFloor: .098, maxTravelMs: 3000, dwellMs: 40,
    }),
    phase('brace_a', 720, .22, {
      mayFire: true, fireRequiresArrival: true, facePlayer: true,
      arrivalRadius: .26, slowRadius: .38, speedFloor: .012,
      acceleration: .68, maxTravelMs: 1450, dwellMs: 680, holdAtArrival: true,
    }),
    phase('battery_relocate', 680, 1.30, {
      arrivalRadius: .44, slowRadius: .38, acceleration: .72,
      speedFloor: .098, maxTravelMs: 1950, dwellMs: 40,
    }),
    phase('brace_b', 720, .22, {
      mayFire: true, fireRequiresArrival: true, facePlayer: true,
      arrivalRadius: .26, slowRadius: .38, speedFloor: .012,
      acceleration: .68, maxTravelMs: 1450, dwellMs: 680, holdAtArrival: true,
    }),
    phase('tactical_retreat', 560, 1.36, {
      retreat: true, arrivalRadius: .48, slowRadius: .40,
      acceleration: .72, speedFloor: .104, maxTravelMs: 1850,
    }),
    phase('battery_return', 650, 1.32, {
      arrivalRadius: .44, slowRadius: .38, acceleration: .72,
      speedFloor: .100, maxTravelMs: 1900, dwellMs: 35,
    }),
    phase('brace_c', 720, .22, {
      mayFire: true, fireRequiresArrival: true, facePlayer: true,
      arrivalRadius: .26, slowRadius: .38, speedFloor: .012,
      acceleration: .68, maxTravelMs: 1450, dwellMs: 680, holdAtArrival: true,
    }),
    phase('battery_reset', 560, 1.34, {
      retreat: true, arrivalRadius: .48, slowRadius: .40,
      acceleration: .72, speedFloor: .102, maxTravelMs: 1850,
    }),
  ], 1),
});

export const CAMPAIGN_MINI_BOSS_MOTION_PROFILES_V29 = freezeDeep({
  mechanical_warden: { depthOffsets: [0, .42, .12], acceleration: .19 },
  ion_sentinel: { depthOffsets: [.18, .52, 0], acceleration: .18 },
  frontline_carrier: { depthOffsets: [.62, .26, .48], acceleration: .165 },
  repair_frigate: { depthOffsets: [.55, .18, .42], acceleration: .16 },
  brood_alpha: { depthOffsets: [.34, .7, .12], acceleration: .21 },
  inferno_charger: { depthOffsets: [.8, .38, .16], acceleration: .24 },
});

export function auditCampaignCombatChoreographyV29() {
  const issues = [];
  const behaviorOwners = new Map();
  for (const archetype of Object.values(ENEMY_ARCHETYPES_V2)) {
    const contract = archetype.id === 'raider'
      ? CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30.hook_return
      : CAMPAIGN_ROLE_CHOREOGRAPHY_V29[archetype.behavior];
    if (!contract) {
      issues.push(`MISSING_BEHAVIOR:${archetype.id}:${archetype.behavior}`);
      continue;
    }
    const owners = behaviorOwners.get(archetype.behavior) || [];
    owners.push(archetype.id);
    behaviorOwners.set(archetype.behavior, owners);
    if (contract.roleId !== archetype.id) issues.push(`ROLE_BEHAVIOR_MISMATCH:${archetype.id}`);
    if (contract.externalController) continue;
    if (!Array.isArray(contract.phases) || contract.phases.length < 4)
      issues.push(`INSUFFICIENT_PHASES:${archetype.id}`);
    if (!Number.isInteger(contract.loopPhaseIndex)
      || contract.loopPhaseIndex < 0 || contract.loopPhaseIndex >= contract.phases.length)
      issues.push(`NO_REENGAGE_LOOP:${archetype.id}`);
    if (contract.phases.some(item => item.egress)) issues.push(`UNEXPECTED_EGRESS:${archetype.id}`);
    if (archetype.canShoot && contract.phases.filter(item => item.mayFire).length < 2)
      issues.push(`INSUFFICIENT_FIRE_WINDOWS:${archetype.id}`);
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
const choreographyForRole = (roleId, routeVariant = null) => {
  const archetype = getArchetype(roleId);
  if (archetype.id === 'raider') {
    return CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30[routeVariant]
      || CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30.hook_return;
  }
  return CAMPAIGN_ROLE_CHOREOGRAPHY_V29[archetype.behavior]
    || CAMPAIGN_ROLE_CHOREOGRAPHY_V29.keep_range;
};
const choreographyForState = state => choreographyForRole(state?.roleId, state?.routeVariant);

export function createCampaignEnemyChoreographyStateV29({
  roleId = 'gunner',
  lane = 0,
  strafeDirection = 1,
  seed = 1,
  nowMs = 0,
  routeVariant = null,
} = {}) {
  const archetype = getArchetype(roleId);
  const resolvedRouteVariant = archetype.id === 'raider'
    ? (CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30[routeVariant] ? routeVariant : 'hook_return')
    : (archetype.routeVariants?.[0] || archetype.behavior);
  const contract = choreographyForRole(archetype.id, resolvedRouteVariant);
  const resolvedSeed = hashParts(seed, archetype.id, lane, strafeDirection);
  return {
    version: CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION,
    roleId: archetype.id,
    behavior: archetype.behavior,
    routeVariant: resolvedRouteVariant,
    externalController: contract.externalController || null,
    seed: resolvedSeed,
    timingJitterMs: (resolvedSeed % 101) - 50,
    laneBiasNorm: (((resolvedSeed >>> 8) % 101) / 100 - .5) * .10,
    depthBias: (((resolvedSeed >>> 16) % 101) / 100 - .5) * .70,
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
    cycleCount: 0,
    phaseVisitCount: 0,
    completed: false,
  };
}

const targetForEnemyPhase = (state, phaseContract, input, band) => {
  const archetype = getArchetype(state.roleId);
  const role = state.roleId;
  const phaseId = phaseContract.id;
  const halfWidth = Math.max(2.8, finite(input.arenaHalfWidth, 7));
  const xBound = Math.max(2.2, halfWidth - .55);
  const playerX = clamp(finite(input.playerX, 0), -xBound, xBound);
  const playerZ = clamp(finite(input.playerZ, band.worldHalfHeight - 2.5),
    band.topSafeRootZ + 5, band.bottomSafeZ);
  const baseX = clamp((state.laneNorm + finite(state.laneBiasNorm, 0)) * xBound, -xBound, xBound);
  const depthBias = finite(state.depthBias, 0);
  const cycleSide = state.side * (state.cycleCount % 2 === 0 ? 1 : -1);
  const edgeAnchorX = (desiredOffsetX = 0, trackingStrength = archetype.lateralTrackingStrength) =>
    resolveCampaignEdgeAwareAnchorXV36({
      roleId: role,
      playerX,
      baseLaneX: baseX,
      desiredOffsetX,
      arenaHalfWidth: halfWidth,
      trackingStrength,
      edgeInset: archetype.edgeInset,
    }).x;
  const preferredRange = Math.max(3.5, finite(archetype.preferredRange, 7));
  const fireRangeMin = Math.max(2.5, finite(archetype.fireRangeMin, preferredRange - 1.2));
  const fireRangeMax = Math.max(preferredRange + .6, finite(archetype.fireRangeMax, preferredRange + 1.8));
  const combatZ = offset => clamp(
    playerZ - preferredRange + depthBias * .45 + finite(offset, 0),
    band.topSafeRootZ,
    playerZ - fireRangeMin - .18,
  );
  const retreatZ = offset => clamp(
    playerZ - fireRangeMax + depthBias * .35 + finite(offset, 0),
    band.topSafeRootZ,
    playerZ - preferredRange - .45,
  );

  if (role === 'raider') {
    if (phaseId === 'skirmish_entry') return {
      x: edgeAnchorX(cycleSide * Math.min(3.0, xBound * .46), .82),
      z: combatZ(-.25),
    };
    if (phaseId === 'attack_pass_a') return {
      x: edgeAnchorX(-cycleSide * Math.min(2.75, xBound * .42), .86),
      z: combatZ(.18),
    };
    if (phaseId === 'breakaway' || phaseId === 'breakaway_2' || phaseId === 'tactical_reset') return {
      x: clamp(baseX + cycleSide * (phaseId === 'breakaway_2' ? 1.55 : .85), -xBound, xBound),
      z: retreatZ(phaseId === 'tactical_reset' ? -.45 : -.15),
    };
    if (phaseId === 'attack_pass_b') return {
      x: edgeAnchorX(cycleSide * Math.min(2.55, xBound * .39), .86),
      z: combatZ(-.12),
    };
    if (phaseId === 'attack_pass_c') return {
      x: edgeAnchorX(-cycleSide * Math.min(1.75, xBound * .29), .88),
      z: combatZ(.28),
    };
  }

  if (role === 'gunner') {
    if (phaseId === 'firing_slot') return { x: edgeAnchorX(cycleSide * .45), z: combatZ(0) };
    if (phaseId === 'strafe_a') return {
      x: edgeAnchorX(cycleSide * Math.min(2.45, xBound * .38)),
      z: combatZ(.28),
    };
    if (phaseId === 'fallback' || phaseId === 'range_reset') return {
      x: edgeAnchorX(-cycleSide * .7, .78),
      z: retreatZ(phaseId === 'range_reset' ? -.35 : -.1),
    };
    if (phaseId === 'strafe_b') return {
      x: edgeAnchorX(-cycleSide * Math.min(2.45, xBound * .38)),
      z: combatZ(-.28),
    };
  }

  if (role === 'shieldbearer') {
    const guardX = edgeAnchorX(cycleSide * .18, .78);
    if (phaseId === 'guard_slot') return { x: guardX, z: combatZ(0) };
    if (phaseId === 'guard_sweep_a') return { x: clamp(guardX + cycleSide * 1.15, -xBound, xBound), z: combatZ(.18) };
    if (phaseId === 'cover_reset' || phaseId === 'guard_reset') return {
      x: clamp(guardX - cycleSide * .45, -xBound, xBound), z: retreatZ(-.15),
    };
    if (phaseId === 'guard_sweep_b') return { x: clamp(guardX - cycleSide * 1.15, -xBound, xBound), z: combatZ(-.18) };
  }

  if (role === 'support') {
    const anchorX = edgeAnchorX(cycleSide * .28, .82);
    const radiusX = Math.min(1.9, xBound * .30);
    const radiusZ = .92;
    if (phaseId === 'support_slot') return { x: anchorX, z: combatZ(0) };
    const pointMap = { orbit_0: 0, orbit_1: 1, orbit_2: 2, orbit_3: 3 };
    if (Object.hasOwn(pointMap, phaseId)) {
      const point = pointMap[phaseId];
      const angles = [Math.PI * .15, Math.PI * .70, Math.PI * 1.18, Math.PI * 1.68];
      const angle = angles[(point + (state.seed % angles.length)) % angles.length] * cycleSide;
      return {
        x: clamp(anchorX + Math.cos(angle) * radiusX, -xBound, xBound),
        z: clamp(combatZ(0) + Math.sin(angle) * radiusZ,
          playerZ - fireRangeMax + .15, playerZ - fireRangeMin - .2),
      };
    }
    if (phaseId === 'support_reset' || phaseId === 'support_return') return {
      x: clamp(anchorX - cycleSide * .75, -xBound, xBound), z: retreatZ(-.2),
    };
  }

  // Artillery owns the remaining telegraphed_zone behavior.
  const batteryX = edgeAnchorX(cycleSide * xBound * .24, .70);
  if (phaseId === 'battery_approach' || phaseId === 'brace_a') return { x: batteryX, z: combatZ(-.15) };
  if (phaseId === 'battery_relocate' || phaseId === 'brace_b') return {
    x: clamp(-batteryX + cycleSide * .45, -xBound, xBound), z: combatZ(.20),
  };
  if (phaseId === 'tactical_retreat' || phaseId === 'battery_reset') return {
    x: clamp(baseX - cycleSide * .65, -xBound, xBound), z: retreatZ(-.35),
  };
  if (phaseId === 'battery_return' || phaseId === 'brace_c') return {
    x: clamp(batteryX - cycleSide * .9, -xBound, xBound), z: combatZ(-.05),
  };
  return { x: baseX, z: combatZ(0) };
};

const refreshEnemyPhaseTargetV36 = (state, phaseContract, input, band) => {
  if (!phaseContract || state.externalController || state.completed) return;
  const fresh = targetForEnemyPhase(state, phaseContract, input, band);
  const frameScale = clamp(finite(input.frameScale, 1), 0, 4);
  const baseSpeed = Math.max(.006, Math.abs(finite(input.baseSpeed, .04)));
  const tracking = clamp(finite(getArchetype(state.roleId).lateralTrackingStrength, .75), .35, 1);
  const targetStepX = Math.max(.09, baseSpeed * (4.8 + tracking * 3.2) * frameScale);
  const targetStepZ = Math.max(.055, baseSpeed * 3.4 * frameScale);
  state.targetX = state.targetX == null ? fresh.x : approach(state.targetX, fresh.x, targetStepX);
  state.targetZ = state.targetZ == null ? fresh.z : approach(state.targetZ, fresh.z, targetStepZ);

  if (state.phaseArrivedAt != null) {
    const distance = length2(
      state.targetX - finite(input.enemyX, 0),
      state.targetZ - finite(input.enemyZ, 0),
    );
    if (distance > phaseContract.arrivalRadius * 1.45) state.phaseArrivedAt = null;
  }
};

const resolveTravelDeadlineAt = (phaseContract, input, target, nowMs) => {
  const distance = length2(target.x - finite(input.enemyX, 0), target.z - finite(input.enemyZ, 0));
  const baseSpeed = Math.max(.006, Math.abs(finite(input.baseSpeed, .04)));
  const speedPerFrame = Math.max(
    baseSpeed * Math.max(.05, finite(phaseContract.speedMultiplier, 1)),
    Math.max(0, finite(phaseContract.speedFloor, 0)),
  );
  const effectiveUnitsPerSecond = Math.max(.24, speedPerFrame * 60 * .72);
  const estimatedTravelMs = distance / effectiveUnitsPerSecond * 1000;
  const minimumMs = Math.max(280, finite(phaseContract.durationMs, 1200));
  const maximumMs = Math.max(minimumMs, finite(phaseContract.maxTravelMs, minimumMs * 2.8));
  const budgetMs = clamp(estimatedTravelMs * 1.28 + 260, minimumMs, maximumMs);
  return nowMs + Math.ceil(budgetMs);
};

const enterEnemyPhase = (state, requestedIndex, nowMs, input, band) => {
  const contract = choreographyForState(state);
  let index = requestedIndex;
  if (!contract.phases[index] && Number.isInteger(contract.loopPhaseIndex)) {
    index = contract.loopPhaseIndex;
    state.cycleCount += 1;
    state.side *= -1;
  }
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
  state.phaseVisitCount += 1;
  return nextPhase;
};

const steerState = (state, input, phaseContract, targetX, targetZ, options = {}) => {
  const frameScale = clamp(finite(input.frameScale, 1), 0, 4);
  const baseSpeed = Math.max(.006, Math.abs(finite(input.baseSpeed, .04)));
  const dx = targetX - finite(input.enemyX, 0);
  const dz = targetZ - finite(input.enemyZ, 0);
  const distance = length2(dx, dz);
  const speedScale = distance < phaseContract.slowRadius
    ? clamp(distance / Math.max(.01, phaseContract.slowRadius), .58, 1) : 1;
  const authoredSpeed = Math.max(
    baseSpeed * phaseContract.speedMultiplier,
    Math.max(0, finite(phaseContract.speedFloor, 0)),
  );
  const maxSpeed = authoredSpeed * speedScale;
  const inv = distance > .0001 ? 1 / distance : 0;
  let desiredX = dx * inv * maxSpeed;
  let desiredZ = dz * inv * maxSpeed;
  const archetype = options.archetype || getArchetype(state.roleId);
  if (options.hold) {
    desiredX = 0;
    desiredZ = 0;
  }
  if (!phaseContract.retreat) {
    const separationX = clamp(finite(input.separationX, 0), -1, 1);
    const separationZ = clamp(finite(input.separationZ, 0), -1, 1);
    desiredX += separationX * maxSpeed * .34;
    desiredZ += separationZ * maxSpeed * .18;
  }

  if (!archetype.canCrossPlayer) {
    const enemyZ = finite(input.enemyZ, 0);
    const playerZ = finite(input.playerZ, enemyZ + archetype.preferredRange);
    const clearanceZ = playerZ - enemyZ;
    const minimum = Math.max(2.5, finite(archetype.fireRangeMin, 4));
    const maximum = Math.max(minimum + 1, finite(archetype.fireRangeMax, minimum + 2));
    if (clearanceZ < minimum + .18) {
      const urgency = clamp((minimum + .18 - clearanceZ) / 1.5, .35, 1);
      desiredZ = Math.min(desiredZ, -authoredSpeed * urgency);
    } else if (clearanceZ > maximum + 1.2 && phaseContract.mayFire) {
      desiredZ = Math.max(desiredZ, authoredSpeed * .55);
    }
  }

  const desiredLength = length2(desiredX, desiredZ);
  if (desiredLength > maxSpeed && desiredLength > .0001) {
    desiredX = desiredX / desiredLength * maxSpeed;
    desiredZ = desiredZ / desiredLength * maxSpeed;
  }
  const maxDelta = Math.max(.0045,
    Math.min(.045, Math.max(baseSpeed, authoredSpeed) * phaseContract.acceleration * frameScale));
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
  const contract = choreographyForState(state);
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
    refreshEnemyPhaseTargetV36(state, current, input, band);
    const distance = length2(state.targetX - finite(input.enemyX, 0), state.targetZ - finite(input.enemyZ, 0));
    const arrived = distance <= current.arrivalRadius;
    if (arrived && state.phaseArrivedAt == null) state.phaseArrivedAt = nowMs;
    const activeMs = nowMs - state.phaseStartedAt;
    const minimumActiveMs = Math.max(180,
      finite(current.durationMs, 500) + finite(state.timingJitterMs, 0));
    const dwellComplete = state.phaseArrivedAt != null
      && activeMs >= minimumActiveMs
      && nowMs - state.phaseArrivedAt >= Math.max(0, finite(current.dwellMs, 0));
    const hardTravelTimeout = state.phaseArrivedAt == null
      && state.phaseDeadlineAt != null && nowMs >= state.phaseDeadlineAt + 1400;
    if (!dwellComplete && !hardTravelTimeout) break;
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
    archetype,
  });
  const telegraphMs = Math.max(0, finite(archetype.telegraphTicks, 0)) * (1000 / 30);
  const catalogCooldownMs = Math.max(520,
    Math.trunc(Math.max(1, finite(archetype.attackCooldownTicks, 60)) * (1000 / 30)));
  const fireCooldownMs = Math.max(520,
    Math.trunc(finite(input.fireCooldownMs, archetype.fireCooldownMs || catalogCooldownMs)));
  const fireDelayMs = Math.min(
    Math.max(160, telegraphMs + finite(state.timingJitterMs, 0)),
    Math.max(180, current.durationMs - 180),
  );
  const fireClockStart = current.fireRequiresArrival ? state.phaseArrivedAt : state.phaseStartedAt;
  const fireAge = fireClockStart == null ? -1 : nowMs - fireClockStart;
  const fireEnvelope = resolveCampaignFireEnvelopeV36({
    canShoot: archetype.canShoot,
    enemyX: input.enemyX,
    enemyZ: input.enemyZ,
    playerX: input.playerX,
    playerZ: input.playerZ,
    fireRangeMin: archetype.fireRangeMin,
    fireRangeMax: archetype.fireRangeMax,
  });
  const playerRange = fireEnvelope.forwardDepth;
  const rangeReady = fireEnvelope.rangeReady;
  const mayFire = current.mayFire && rangeReady && fireAge >= fireDelayMs;
  return Object.freeze({
    state,
    handled: true,
    completed: false,
    phaseId: state.phaseId,
    cycleCount: state.cycleCount,
    targetX: state.targetX,
    targetZ: state.targetZ,
    mayFire,
    fireCooldownMs,
    fireWindup: current.mayFire && !mayFire,
    rangeReady,
    playerRange,
    rangeMetric: fireEnvelope.rangeMetric,
    forwardDepth: fireEnvelope.forwardDepth,
    lateralDistance: fireEnvelope.lateralDistance,
    directDistance: fireEnvelope.directDistance,
    targetAhead: fireEnvelope.targetAhead,
    preferredRange: archetype.preferredRange,
    fireRangeMin: archetype.fireRangeMin,
    fireRangeMax: archetype.fireRangeMax,
    canCrossPlayer: archetype.canCrossPlayer,
    maxCombatZ: finite(input.playerZ, 0) - archetype.fireRangeMin,
    settled: state.phaseArrivedAt != null,
    facePlayer: current.facePlayer,
    retreat: current.retreat,
    egress: false,
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

const PREVIEW_MOVE_PHASE = phase('preview_move', 1350, 1.05, {
  arrivalRadius: .36, slowRadius: .7, acceleration: .34, speedFloor: .058, maxTravelMs: 4400,
});
const PREVIEW_TRACK_PHASE = phase('preview_track', 760, .62, {
  arrivalRadius: .2, slowRadius: .62, acceleration: .30,
  speedFloor: .026, maxTravelMs: 2200,
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
    slowRadius: .95,
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
