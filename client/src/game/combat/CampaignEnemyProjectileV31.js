/**
 * Campaign enemy projectile fire-control V3.1.
 *
 * Normal enemies share one deterministic shot contract: a finite muzzle-world
 * origin, a target snapshot, optional bounded lead, optional short soft
 * guidance, a finite lifetime and a visual profile. Boss/preview telegraphs
 * keep their own immutable attack-plan contracts and do not use this module.
 */
export const CAMPAIGN_ENEMY_PROJECTILE_VERSION = 'campaign-enemy-projectile-v3.1.0';

export const CAMPAIGN_ENEMY_AIM_MODES_V31 = Object.freeze([
  'snapshot',
  'predictive',
  'soft_homing',
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const hypot = (x, z) => Math.hypot(x, z);
const normalize = (x, z, fallback = { x: 0, z: 1 }) => {
  const length = hypot(x, z);
  if (length < .000001) return Object.freeze({ x: fallback.x, z: fallback.z });
  return Object.freeze({ x: x / length, z: z / length });
};
const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};
const wrapRadians = value => {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
};

export const CAMPAIGN_ENEMY_PROJECTILE_VISUALS_V31 = freezeDeep({
  normal: { width: .28, length: .92, height: .14, pulse: .05 },
  gunner: { width: .26, length: 1.04, height: .13, pulse: .04 },
  support: { width: .34, length: .78, height: .16, pulse: .08 },
  artillery: { width: .42, length: 1.18, height: .18, pulse: .06 },
  boss_preview: { width: .38, length: 1.14, height: .18, pulse: .06 },
  mini_boss: { width: .38, length: 1.16, height: .18, pulse: .06 },
  boss: { width: .44, length: 1.34, height: .20, pulse: .07 },
});

export function resolveCampaignEnemyProjectileVisualV31({ sourceRole, priority } = {}) {
  if (priority === 'boss') return CAMPAIGN_ENEMY_PROJECTILE_VISUALS_V31.boss;
  if (sourceRole === 'mini_boss') return CAMPAIGN_ENEMY_PROJECTILE_VISUALS_V31.mini_boss;
  return CAMPAIGN_ENEMY_PROJECTILE_VISUALS_V31[sourceRole]
    || CAMPAIGN_ENEMY_PROJECTILE_VISUALS_V31.normal;
}

/**
 * Solve a bounded intercept in 60 Hz simulation frames. The result is a fair
 * target snapshot, not indefinite homing. If no positive intercept exists,
 * direct aim is used.
 */
export function resolveCampaignEnemyInterceptV31({
  origin,
  target,
  targetVelocity = { x: 0, z: 0 },
  projectileSpeed = .34,
  leadFactor = 1,
  maxLeadMs = 700,
} = {}) {
  const ox = finite(origin?.x);
  const oz = finite(origin?.z);
  const tx = finite(target?.x);
  const tz = finite(target?.z, 10);
  const vx = finite(targetVelocity?.x);
  const vz = finite(targetVelocity?.z);
  const speed = Math.max(.01, finite(projectileSpeed, .34));
  const rx = tx - ox;
  const rz = tz - oz;
  const a = vx * vx + vz * vz - speed * speed;
  const b = 2 * (rx * vx + rz * vz);
  const c = rx * rx + rz * rz;
  let interceptFrames = 0;

  if (c > .000001) {
    if (Math.abs(a) < .000001) {
      const linear = Math.abs(b) > .000001 ? -c / b : 0;
      if (linear > 0) interceptFrames = linear;
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const t1 = (-b - root) / (2 * a);
        const t2 = (-b + root) / (2 * a);
        const positive = [t1, t2].filter(value => value > 0 && Number.isFinite(value));
        if (positive.length) interceptFrames = Math.min(...positive);
      }
    }
  }

  const maxLeadFrames = Math.max(0, finite(maxLeadMs, 700)) / (1000 / 60);
  const appliedFrames = clamp(interceptFrames * clamp(finite(leadFactor, 1), 0, 1.35), 0, maxLeadFrames);
  const aimPoint = Object.freeze({
    x: tx + vx * appliedFrames,
    z: tz + vz * appliedFrames,
  });
  const direction = normalize(aimPoint.x - ox, aimPoint.z - oz);
  return freezeDeep({
    aimPoint,
    direction,
    velocity: { x: direction.x * speed, z: direction.z * speed },
    interceptFrames,
    appliedLeadFrames: appliedFrames,
  });
}

export function createCampaignEnemyShotPlanV31({
  origin,
  target,
  targetVelocity = { x: 0, z: 0 },
  projectileSpeed = .34,
  aimMode = 'predictive',
  leadFactor = .8,
  maxLeadMs = 700,
  guidanceMs = 0,
  turnRateRadians = 0,
  lifetimeMs = 4200,
  sourceRole = null,
  priority = 'normal',
  damageType = 'energy',
  createdAtMs = 0,
} = {}) {
  const ox = Number(origin?.x);
  const oz = Number(origin?.z);
  const tx = Number(target?.x);
  const tz = Number(target?.z);
  if (![ox, oz, tx, tz].every(Number.isFinite)) {
    throw new TypeError('Campaign enemy shot V3.1 requires finite world origin and target coordinates.');
  }
  const mode = CAMPAIGN_ENEMY_AIM_MODES_V31.includes(aimMode) ? aimMode : 'snapshot';
  const speed = Math.max(.08, finite(projectileSpeed, .34));
  const lead = mode === 'snapshot'
    ? resolveCampaignEnemyInterceptV31({
      origin, target, targetVelocity: { x: 0, z: 0 }, projectileSpeed: speed,
      leadFactor: 0, maxLeadMs: 0,
    })
    : resolveCampaignEnemyInterceptV31({
      origin, target, targetVelocity, projectileSpeed: speed, leadFactor, maxLeadMs,
    });
  const startMs = Math.max(0, finite(createdAtMs));
  const boundedGuidanceMs = mode === 'soft_homing'
    ? clamp(finite(guidanceMs, 650), 180, 1100) : 0;
  const boundedTurn = mode === 'soft_homing'
    ? clamp(finite(turnRateRadians, .055), .012, .11) : 0;
  return freezeDeep({
    version: CAMPAIGN_ENEMY_PROJECTILE_VERSION,
    originSpace: 'world',
    originKind: 'entity_muzzle',
    origin: { x: ox, y: finite(origin?.y), z: oz },
    targetSnapshot: { x: tx, z: tz },
    targetVelocitySnapshot: {
      x: finite(targetVelocity?.x),
      z: finite(targetVelocity?.z),
    },
    aimPoint: lead.aimPoint,
    aimMode: mode,
    velocity: lead.velocity,
    speed,
    leadFactor: clamp(finite(leadFactor, .8), 0, 1.35),
    maxLeadMs: Math.max(0, finite(maxLeadMs, 700)),
    appliedLeadFrames: lead.appliedLeadFrames,
    guidanceMs: boundedGuidanceMs,
    turnRateRadians: boundedTurn,
    lifetimeMs: clamp(finite(lifetimeMs, 4200), 1600, 6500),
    createdAtMs: startMs,
    expiresAtMs: startMs + clamp(finite(lifetimeMs, 4200), 1600, 6500),
    sourceRole,
    priority,
    damageType,
    visual: resolveCampaignEnemyProjectileVisualV31({ sourceRole, priority }),
  });
}

/** Advance one projectile without mutating the immutable plan. */
export function advanceCampaignEnemyProjectileV31({
  plan,
  position,
  velocity,
  target,
  targetVelocity = { x: 0, z: 0 },
  nowMs = 0,
  frameScale = 1,
} = {}) {
  if (!plan) return freezeDeep({ expired: true, velocity: { x: 0, z: 0 }, delta: { x: 0, z: 0 } });
  const frame = clamp(finite(frameScale, 1), 0, 4);
  const current = {
    x: finite(velocity?.x, plan.velocity?.x),
    z: finite(velocity?.z, plan.velocity?.z),
  };
  let nextVelocity = current;
  const ageMs = Math.max(0, finite(nowMs) - finite(plan.createdAtMs));
  const guidanceActive = Boolean(plan.aimMode === 'soft_homing'
    && ageMs < finite(plan.guidanceMs) && target);

  if (guidanceActive) {
    const desiredLead = resolveCampaignEnemyInterceptV31({
      origin: position,
      target,
      targetVelocity,
      projectileSpeed: plan.speed,
      leadFactor: Math.min(.55, finite(plan.leadFactor, .35)),
      maxLeadMs: Math.min(420, finite(plan.maxLeadMs, 420)),
    });
    const currentAngle = Math.atan2(current.x, current.z);
    const desiredAngle = Math.atan2(desiredLead.direction.x, desiredLead.direction.z);
    const deltaAngle = wrapRadians(desiredAngle - currentAngle);
    const maxTurn = Math.max(0, finite(plan.turnRateRadians)) * frame;
    const nextAngle = currentAngle + clamp(deltaAngle, -maxTurn, maxTurn);
    nextVelocity = {
      x: Math.sin(nextAngle) * plan.speed,
      z: Math.cos(nextAngle) * plan.speed,
    };
  }

  return freezeDeep({
    expired: finite(nowMs) >= finite(plan.expiresAtMs),
    ageMs,
    guidanceActive,
    velocity: nextVelocity,
    delta: {
      x: nextVelocity.x * frame,
      z: nextVelocity.z * frame,
    },
    yawRadians: Math.atan2(nextVelocity.x, nextVelocity.z),
  });
}

export function auditCampaignEnemyProjectileV31() {
  const issues = [];
  for (const [id, visual] of Object.entries(CAMPAIGN_ENEMY_PROJECTILE_VISUALS_V31)) {
    if (!(visual.width > 0 && visual.length > visual.width && visual.height > 0)) {
      issues.push(`VISUAL_DIMENSIONS:${id}`);
    }
  }
  const predictive = createCampaignEnemyShotPlanV31({
    origin: { x: 0, z: 0 }, target: { x: 0, z: 10 },
    targetVelocity: { x: .08, z: 0 }, projectileSpeed: .4,
    aimMode: 'predictive', leadFactor: 1, createdAtMs: 100,
  });
  if (!(predictive.aimPoint.x > 0 && predictive.velocity.x > 0)) issues.push('PREDICTIVE_LEAD');
  const guided = createCampaignEnemyShotPlanV31({
    origin: { x: 0, z: 0 }, target: { x: 0, z: 10 }, projectileSpeed: .34,
    aimMode: 'soft_homing', guidanceMs: 700, turnRateRadians: .05, createdAtMs: 100,
  });
  if (!(guided.guidanceMs > 0 && guided.turnRateRadians > 0)) issues.push('SOFT_GUIDANCE');
  return Object.freeze(issues);
}
