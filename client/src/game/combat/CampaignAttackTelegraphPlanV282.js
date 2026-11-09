export const CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION = 'campaign-attack-telegraph-plan-v2.8.2';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const freeze = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freeze(entry)])));
  }
  return value;
};

const hasWorldOrigin = value => Boolean(value)
  && Number.isFinite(value.x)
  && Number.isFinite(value.z);

const point = (value, fallback = {}) => ({
  x: finite(value?.x, finite(fallback.x, 0)),
  y: finite(value?.y, finite(fallback.y, 0)),
  z: finite(value?.z, finite(fallback.z, 0)),
});

const normalizedLanes = laneNorms => {
  const source = Array.isArray(laneNorms) && laneNorms.length ? laneNorms : [-.62, 0, .62];
  return source.map(value => clamp(finite(value, 0), -.9, .9));
};

const buildPaths = ({ origin, laneNorms, arenaHalfWidth, targetZ, width, projectileSpeed }) => laneNorms.map((laneNorm, index) => {
  const target = point({ x: laneNorm * arenaHalfWidth, y: origin.y, z: targetZ });
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const length = Math.max(.0001, Math.hypot(dx, dz));
  const direction = { x: dx / length, z: dz / length };
  return {
    id: `lane-${index}`,
    laneNorm,
    origin,
    target,
    direction,
    velocity: {
      x: direction.x * projectileSpeed,
      z: direction.z * projectileSpeed,
    },
    midpoint: {
      x: origin.x + dx * .5,
      y: origin.y,
      z: origin.z + dz * .5,
    },
    length,
    yawRadians: Math.atan2(direction.x, direction.z),
    width,
  };
});

const buildPlan = options => {
  const origin = point(options.origin);
  const laneNorms = normalizedLanes(options.laneNorms);
  const arenaHalfWidth = Math.max(.5, Math.abs(finite(options.arenaHalfWidth, 1)));
  const targetZ = finite(options.targetZ, origin.z + 1);
  const width = Math.max(.35, finite(options.width, 1));
  const projectileSpeed = Math.max(.01, finite(options.projectileSpeed, .38));
  const paths = buildPaths({ origin, laneNorms, arenaHalfWidth, targetZ, width, projectileSpeed });
  return freeze({
    version: CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION,
    kind: 'boss_preview_lane_fan',
    phase: options.phase === 'locked' ? 'locked' : 'tracking',
    originSpace: 'world',
    originKind: 'entity_muzzle',
    createdAtMs: Math.max(0, finite(options.createdAtMs, 0)),
    telegraphEndsAtMs: Math.max(0, finite(options.telegraphEndsAtMs, 0)),
    telegraphDurationMs: Math.max(0, finite(options.telegraphEndsAtMs, 0)
      - finite(options.createdAtMs, 0)),
    lockAtMs: Math.max(0, finite(options.lockAtMs, 0)),
    lockLeadMs: Math.max(0, finite(options.telegraphEndsAtMs, 0)
      - finite(options.lockAtMs, 0)),
    lockedAtMs: options.phase === 'locked' ? Math.max(0, finite(options.lockedAtMs, 0)) : null,
    origin,
    laneNorms,
    arenaHalfWidth,
    targetZ,
    width,
    projectileSpeed,
    shotSchedule: paths.map((path, shotIndex) => ({
      shotIndex,
      pathId: path.id,
      fireOffsetMs: 0,
    })),
    paths,
  });
};

export function createBossPreviewLaneAttackPlanV282({
  origin,
  laneNorms = [-.62, 0, .62],
  arenaHalfWidth,
  targetZ,
  width,
  createdAtMs = 0,
  telegraphMs = 850,
  lockLeadMs = 200,
  projectileSpeed = .38,
} = {}) {
  if (!hasWorldOrigin(origin)) {
    throw new TypeError('Boss Preview attack plan requires a finite entity/muzzle world origin.');
  }
  const created = Math.max(0, finite(createdAtMs, 0));
  const duration = Math.max(1, finite(telegraphMs, 850));
  const lead = clamp(finite(lockLeadMs, 200), 0, duration);
  return buildPlan({
    phase: 'tracking',
    createdAtMs: created,
    telegraphEndsAtMs: created + duration,
    lockAtMs: created + duration - lead,
    lockedAtMs: null,
    origin,
    laneNorms,
    arenaHalfWidth,
    targetZ,
    width,
    projectileSpeed,
  });
}

export function trackBossPreviewLaneAttackPlanV282(plan, {
  origin,
  arenaHalfWidth = plan?.arenaHalfWidth,
  targetZ = plan?.targetZ,
} = {}) {
  if (!plan || plan.version !== CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION || plan.phase === 'locked') return plan;
  return buildPlan({
    ...plan,
    phase: 'tracking',
    origin: point(origin, plan.origin),
    arenaHalfWidth,
    targetZ,
  });
}

export function lockBossPreviewLaneAttackPlanV282(plan, {
  nowMs = plan?.lockAtMs,
  origin,
  arenaHalfWidth = plan?.arenaHalfWidth,
  targetZ = plan?.targetZ,
} = {}) {
  if (!plan || plan.version !== CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION || plan.phase === 'locked') return plan;
  const tracked = trackBossPreviewLaneAttackPlanV282(plan, { origin, arenaHalfWidth, targetZ });
  return buildPlan({
    ...tracked,
    phase: 'locked',
    lockedAtMs: Math.max(tracked.createdAtMs, finite(nowMs, tracked.lockAtMs)),
  });
}

export function projectilesFromBossPreviewLaneAttackPlanV282(plan) {
  if (!plan || plan.version !== CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION || plan.phase !== 'locked') {
    return Object.freeze([]);
  }
  return freeze(plan.paths.map((path, index) => ({
    shotIndex: index,
    pathId: path.id,
    fireOffsetMs: plan.shotSchedule[index]?.fireOffsetMs || 0,
    origin: path.origin,
    endpoint: path.target,
    velocity: path.velocity,
    width: path.width,
  })));
}
