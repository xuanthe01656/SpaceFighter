/**
 * Dungeon combat integrity contracts V3.9.2.
 *
 * Keeps logical collision and destructible hazards independent from Babylon
 * presentation meshes.  The renderer may use planes, sprites, GLB or fallback
 * geometry without changing hit results.
 */
export const DUNGEON_COMBAT_INTEGRITY_VERSION = 'dungeon-combat-integrity-v3.9.2';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const freeze = value => Object.freeze(value);

const pointXZ = value => {
  const x = Number(value?.x ?? value?.position?.x);
  const z = Number(value?.z ?? value?.position?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? Object.freeze({ x, z }) : null;
};

export function logicalCircleHitV392(a, b, radius = 1) {
  const pointA = pointXZ(a);
  const pointB = pointXZ(b);
  if (!pointA || !pointB) return false;
  const safeRadius = Math.max(0, finite(radius, 0));
  const dx = pointA.x - pointB.x;
  const dz = pointA.z - pointB.z;
  return dx * dx + dz * dz <= safeRadius * safeRadius;
}

/** Swept logical hit test prevents fast hostile bolts from tunnelling at low FPS. */
export function logicalSegmentCircleHitV392(from, to, center, radius = 1) {
  const start = pointXZ(from);
  const end = pointXZ(to);
  const target = pointXZ(center);
  if (!start || !end || !target) return false;
  const safeRadius = Math.max(0, finite(radius, 0));
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) return logicalCircleHitV392(end, target, safeRadius);
  const projection = ((target.x - start.x) * dx + (target.z - start.z) * dz) / lengthSquared;
  const t = clamp(projection, 0, 1);
  const closestX = start.x + dx * t;
  const closestZ = start.z + dz * t;
  const missX = closestX - target.x;
  const missZ = closestZ - target.z;
  return missX * missX + missZ * missZ <= safeRadius * safeRadius;
}

export function resolveDungeonHostileProjectileHitRadiusV392({
  priority = 'normal',
  visual = null,
  requestedRadius = null,
} = {}) {
  const base = priority === 'boss' ? 1.20 : priority === 'elite' ? 1.08 : 1.00;
  const visualRadius = Math.max(0, finite(visual?.width, 0)) * 1.35;
  const requested = finite(requestedRadius, 0);
  return clamp(Math.max(base, visualRadius, requested), .85, 1.55);
}

export function resolveDungeonHazardCombatV392(hazard = {}) {
  const destructible = hazard.destructible !== false;
  const hp = destructible ? Math.max(1, Math.round(finite(hazard.hp, 180))) : 0;
  return freeze({
    destructible,
    hp,
    maxHp: hp,
    score: destructible ? Math.max(0, Math.round(finite(hazard.score, 45))) : 0,
    hitRadius: clamp(finite(hazard.hitRadius, 1.25), .65, 2.4),
    contactRadius: clamp(finite(hazard.contactRadius, 1.10), .65, 2.4),
  });
}

export function requiredDungeonVisualAssetIdsV392({
  dungeonId = 'dung_taurus',
  bossVisualAssetId = null,
} = {}) {
  const safeDungeonId = typeof dungeonId === 'string' && dungeonId ? dungeonId : 'dung_taurus';
  return freeze([
    freeze({ kind: 'dungeon_enemy', id: `${safeDungeonId}_scout` }),
    freeze({ kind: 'dungeon_enemy', id: `${safeDungeonId}_heavy` }),
    freeze({ kind: 'dungeon_enemy', id: `${safeDungeonId}_elite` }),
    freeze({ kind: 'dungeon_boss', id: bossVisualAssetId || `${safeDungeonId}_boss` }),
  ]);
}

export function auditDungeonCombatIntegrityV392() {
  const issues = [];
  const hazard = resolveDungeonHazardCombatV392({ destructible: true, hp: 180, hitRadius: 1.25 });
  if (!hazard.destructible || hazard.hp !== 180 || !(hazard.hitRadius > 1)) {
    issues.push('DUNGEON_HAZARD_CONTRACT');
  }
  const bossRadius = resolveDungeonHostileProjectileHitRadiusV392({ priority: 'boss', visual: { width: .5 } });
  const normalRadius = resolveDungeonHostileProjectileHitRadiusV392({ priority: 'normal', visual: { width: .3 } });
  if (!(bossRadius >= 1.2 && bossRadius > normalRadius)) issues.push('DUNGEON_PROJECTILE_HIT_RADIUS');
  if (!logicalCircleHitV392({ x: 0, z: 0 }, { x: 1.1, z: 0 }, 1.2)
    || !logicalSegmentCircleHitV392({ x: -2, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 0 }, .4)) {
    issues.push('DUNGEON_LOGICAL_COLLISION');
  }
  if (requiredDungeonVisualAssetIdsV392({ dungeonId: 'dung_taurus' }).length !== 4) {
    issues.push('DUNGEON_VISUAL_PRELOAD_SET');
  }
  return freeze(issues);
}
