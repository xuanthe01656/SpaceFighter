/**
 * Campaign enemy combat-slot registry V3.7.
 *
 * Ranged enemies must not collapse onto one player-relative anchor.  This
 * registry gives every live non-diver a stable role-specific slot and keeps
 * that lease until the entity is destroyed.  Choreography is still free to
 * strafe/orbit around the slot, but two entities never intentionally own the
 * same authored firing position.
 */
export const CAMPAIGN_ENEMY_COMBAT_SLOT_VERSION = 'campaign-enemy-combat-slots-v3.7.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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

export const CAMPAIGN_ENEMY_COMBAT_SLOT_PROFILES_V37 = freezeDeep({
  raider: {
    columns: [-.86, -.42, .42, .86],
    rows: [-.68, .68],
    trackingStrength: .56,
    minSpacing: 1.75,
    phaseRadius: .52,
  },
  gunner: {
    columns: [-.90, -.54, -.18, .18, .54, .90],
    rows: [-1.08, 0, 1.08],
    trackingStrength: .60,
    minSpacing: 1.90,
    phaseRadius: .62,
  },
  shieldbearer: {
    columns: [-.78, -.26, .26, .78],
    rows: [-.78, .78],
    trackingStrength: .50,
    minSpacing: 2.05,
    phaseRadius: .48,
  },
  support: {
    columns: [-.84, -.40, .40, .84],
    rows: [-1.12, 0, 1.12],
    trackingStrength: .48,
    minSpacing: 1.95,
    phaseRadius: .72,
  },
  artillery: {
    columns: [-.82, -.28, .28, .82],
    rows: [-1.18, 0, 1.18],
    trackingStrength: .42,
    minSpacing: 2.20,
    phaseRadius: .44,
  },
});

const resolveProfile = roleId => CAMPAIGN_ENEMY_COMBAT_SLOT_PROFILES_V37[roleId]
  || CAMPAIGN_ENEMY_COMBAT_SLOT_PROFILES_V37.gunner;

const makeSlotCandidate = (roleId, index) => {
  const profile = resolveProfile(roleId);
  const columns = profile.columns;
  const rows = profile.rows;
  const baseCount = columns.length * rows.length;
  const safeIndex = Math.max(0, Math.trunc(finite(index, 0)));
  const layer = Math.floor(safeIndex / baseCount);
  const local = safeIndex % baseCount;
  const rowIndex = Math.floor(local / columns.length);
  const columnIndex = local % columns.length;
  const layerDirection = layer % 2 === 0 ? 1 : -1;
  const layerMagnitude = Math.ceil(layer / 2) * .08;
  const laneNorm = clamp(columns[columnIndex] + layerDirection * layerMagnitude, -.94, .94);
  const depthDirection = ((columnIndex + layer) & 1) === 0 ? 1 : -1;
  const depthOffset = rows[rowIndex] + depthDirection * layer * .48;
  const phaseSalt = hashParts(roleId, safeIndex, 'slot-phase');
  return Object.freeze({
    slotId: `${roleId}:${safeIndex}`,
    roleId,
    index: safeIndex,
    laneNorm,
    depthOffset,
    trackingStrength: profile.trackingStrength,
    minSpacing: profile.minSpacing,
    phaseRadius: profile.phaseRadius,
    phaseOffset: (phaseSalt % 6284) / 1000,
    side: (phaseSalt & 1) === 0 ? -1 : 1,
  });
};

const descriptorKey = descriptor => String(descriptor?.ownerId || '');
const descriptorSeed = descriptor => Math.max(1, Math.trunc(finite(descriptor?.seed, 1)));
const descriptorPreferredRange = descriptor => Math.max(3.5,
  finite(descriptor?.preferredRange, descriptor?.roleId === 'artillery' ? 11 : 7.5));

const worldSlotPoint = (slot, preferredRange) => ({
  authoredX: finite(slot?.laneNorm, 0) * 6.1,
  z: -Math.max(3.5, finite(preferredRange, 7.5)) + finite(slot?.depthOffset, 0),
  trackingStrength: clamp(finite(slot?.trackingStrength, .5), .20, .72),
  minSpacing: Math.max(1.2, finite(slot?.minSpacing, 1.9)),
});

const projectedSlotX = (point, playerX) => {
  const effectiveTracking = point.trackingStrength * .55;
  return point.authoredX * (1 - effectiveTracking) + playerX * effectiveTracking;
};

const spacingPenalty = (candidate, preferredRange, occupied) => {
  if (!occupied.length) return 0;
  const point = worldSlotPoint(candidate, preferredRange);
  let penalty = 0;
  // A slot that is separate at screen center can collapse into another slot
  // after role-specific player tracking at an edge. Reserve against all three
  // representative player positions so mixed roles stay distinct everywhere.
  for (const other of occupied) {
    const required = Math.max(1.25, Math.min(point.minSpacing, other.minSpacing) * .72);
    let minimumProjectedDistance = Infinity;
    for (const playerX of [-6.2, 0, 6.2]) {
      const distance = Math.hypot(
        projectedSlotX(point, playerX) - projectedSlotX(other, playerX),
        point.z - other.z,
      );
      minimumProjectedDistance = Math.min(minimumProjectedDistance, distance);
    }
    if (minimumProjectedDistance < required) {
      penalty += (required - minimumProjectedDistance + .25) * 64;
    } else {
      penalty += .04 / Math.max(.25, minimumProjectedDistance);
    }
  }
  return penalty;
};

export function createCampaignEnemyCombatSlotRegistryV37() {
  return {
    version: CAMPAIGN_ENEMY_COMBAT_SLOT_VERSION,
    assignments: new Map(),
    generation: 0,
    lastSyncAt: 0,
  };
}

/**
 * Keep existing leases whenever possible.  New entities choose the free slot
 * closest to their authored spawn lane, with a deterministic seed tie-breaker.
 */
export function syncCampaignEnemyCombatSlotsV37(registry, descriptors = [], { nowMs = 0 } = {}) {
  if (!registry?.assignments) return registry;
  const active = [...descriptors]
    .filter(item => descriptorKey(item)
      && item?.roleId !== 'charger'
      && item?.encounterFeatured !== true)
    .sort((a, b) => descriptorKey(a).localeCompare(descriptorKey(b)));
  const activeIds = new Set(active.map(descriptorKey));
  for (const ownerId of registry.assignments.keys()) {
    if (!activeIds.has(ownerId)) registry.assignments.delete(ownerId);
  }

  const byRole = new Map();
  for (const descriptor of active) {
    const roleId = CAMPAIGN_ENEMY_COMBAT_SLOT_PROFILES_V37[descriptor.roleId]
      ? descriptor.roleId : 'gunner';
    if (!byRole.has(roleId)) byRole.set(roleId, []);
    byRole.get(roleId).push({ ...descriptor, roleId });
  }

  const globalOccupied = [];
  for (const descriptor of active) {
    const existing = registry.assignments.get(descriptorKey(descriptor));
    if (existing?.roleId === descriptor.roleId) {
      globalOccupied.push(worldSlotPoint(existing, descriptorPreferredRange(descriptor)));
    }
  }

  for (const [roleId, roleDescriptors] of [...byRole.entries()]
    .sort(([a], [b]) => a.localeCompare(b))) {
    const occupied = new Set();
    for (const descriptor of roleDescriptors) {
      const ownerId = descriptorKey(descriptor);
      const existing = registry.assignments.get(ownerId);
      if (existing?.roleId === roleId && !occupied.has(existing.index)) {
        occupied.add(existing.index);
      } else if (existing) {
        registry.assignments.delete(ownerId);
      }
    }

    const pending = roleDescriptors
      .filter(descriptor => !registry.assignments.has(descriptorKey(descriptor)))
      .sort((a, b) => descriptorSeed(a) - descriptorSeed(b)
        || descriptorKey(a).localeCompare(descriptorKey(b)));
    const candidateCount = Math.max(64, roleDescriptors.length * 8);
    for (const descriptor of pending) {
      const laneNorm = clamp(finite(descriptor.laneNorm, 0), -.94, .94);
      const seed = descriptorSeed(descriptor);
      const preferredRange = descriptorPreferredRange(descriptor);
      let best = null;
      let bestScore = Infinity;
      for (let index = 0; index < candidateCount; index += 1) {
        if (occupied.has(index)) continue;
        const candidate = makeSlotCandidate(roleId, index);
        const seedBias = (hashParts(seed, candidate.slotId) % 1000) / 1000000;
        const rowBias = Math.abs(candidate.depthOffset) * .025;
        const score = Math.abs(candidate.laneNorm - laneNorm) * .58
          + rowBias
          + spacingPenalty(candidate, preferredRange, globalOccupied)
          + seedBias;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (!best) best = makeSlotCandidate(roleId, occupied.size);
      occupied.add(best.index);
      const assignment = Object.freeze({
        ...best,
        ownerId: descriptorKey(descriptor),
        seed,
        preferredRange,
        assignedGeneration: registry.generation + 1,
      });
      registry.assignments.set(descriptorKey(descriptor), assignment);
      globalOccupied.push(worldSlotPoint(assignment, preferredRange));
    }
  }

  registry.generation += 1;
  registry.lastSyncAt = Math.max(0, finite(nowMs, 0));
  return registry;
}

export function getCampaignEnemyCombatSlotV37(registry, ownerId) {
  return registry?.assignments?.get?.(String(ownerId || '')) || null;
}

/**
 * Convert a leased slot into an edge-safe player-relative anchor.  Player
 * tracking is intentionally partial: enough to keep pressure on edge play,
 * but never enough to collapse all enemies onto the ship's exact X position.
 */
export function resolveCampaignEnemyCombatSlotAnchorV37({
  slot = null,
  playerX = 0,
  arenaHalfWidth = 7,
  phaseOffsetX = 0,
  trackingStrength = null,
} = {}) {
  const halfWidth = Math.max(2.8, finite(arenaHalfWidth, 7));
  const bound = Math.max(2.2, halfWidth - .72);
  const safeSlot = slot || makeSlotCandidate('gunner', 0);
  const authoredX = clamp(finite(safeSlot.laneNorm, 0) * bound, -bound, bound);
  const player = clamp(finite(playerX, 0), -bound, bound);
  const tracking = clamp(trackingStrength == null
    ? finite(safeSlot.trackingStrength, .5)
    : finite(trackingStrength, safeSlot.trackingStrength), .20, .72);
  // Only part of the authored tracking strength follows the player.  A true
  // convex blend prevents edge clamps from stacking multiple slots on the
  // same X coordinate while still keeping every shooter engaged at the edge.
  const effectiveTracking = tracking * .55;
  const tracked = authoredX * (1 - effectiveTracking) + player * effectiveTracking;
  const phase = clamp(finite(phaseOffsetX, 0), -bound * .38, bound * .38);
  return Object.freeze({
    x: clamp(tracked + phase, -bound, bound),
    depthOffset: finite(safeSlot.depthOffset, 0),
    slotId: safeSlot.slotId,
    laneNorm: safeSlot.laneNorm,
    trackingStrength: tracking,
    minSpacing: Math.max(1.2, finite(safeSlot.minSpacing, 1.9)),
    phaseRadius: Math.max(.25, finite(safeSlot.phaseRadius, .5)),
  });
}

export function auditCampaignEnemyCombatSlotsV37() {
  const issues = [];
  const registry = createCampaignEnemyCombatSlotRegistryV37();
  const descriptors = [];
  for (const roleId of Object.keys(CAMPAIGN_ENEMY_COMBAT_SLOT_PROFILES_V37)) {
    for (let index = 0; index < 16; index += 1) {
      descriptors.push({
        ownerId: `${roleId}-${index}`,
        roleId,
        seed: index + 1,
        laneNorm: ((index % 7) - 3) / 3,
      });
    }
  }
  syncCampaignEnemyCombatSlotsV37(registry, descriptors, { nowMs: 100 });
  for (const roleId of Object.keys(CAMPAIGN_ENEMY_COMBAT_SLOT_PROFILES_V37)) {
    const slots = descriptors
      .filter(item => item.roleId === roleId)
      .map(item => getCampaignEnemyCombatSlotV37(registry, item.ownerId));
    if (slots.some(slot => !slot)) issues.push(`MISSING_SLOT:${roleId}`);
    if (new Set(slots.map(slot => slot?.slotId)).size !== slots.length) {
      issues.push(`DUPLICATE_SLOT:${roleId}`);
    }
  }
  const left = resolveCampaignEnemyCombatSlotAnchorV37({
    slot: makeSlotCandidate('gunner', 0), playerX: -6.2, arenaHalfWidth: 7,
  });
  const right = resolveCampaignEnemyCombatSlotAnchorV37({
    slot: makeSlotCandidate('gunner', 5), playerX: 6.2, arenaHalfWidth: 7,
  });
  if (!(left.x < right.x)) issues.push('EDGE_SLOT_ORDER');
  return Object.freeze(issues);
}
