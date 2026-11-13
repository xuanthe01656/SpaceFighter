/**
 * Dungeon world traversal V3.9.5.
 *
 * Deterministic movement helpers for objective objects that belong to the
 * scrolling world. Objectives never anchor to the camera while stars/debris
 * continue moving. Missed objectives loop back from the top with preserved HP
 * so a room cannot dead-lock.
 */
export const DUNGEON_WORLD_TRAVERSAL_VERSION = 'dungeon-world-traversal-v3.9.5';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
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

const passLaneJitter = (seed, passIndex, maxNorm) => {
  const hash = hashParts(seed, passIndex, 'objective-pass-lane');
  const normalized = ((hash % 2001) / 1000) - 1;
  return normalized * maxNorm;
};

export function createDungeonObjectiveWorldMotionV395({
  seed = 1,
  definition = {},
  policy = {},
  arenaHalfWidth = 7,
  worldHalfHeight = 15,
  nowMs = 0,
} = {}) {
  const bound = Math.max(2, finite(arenaHalfWidth, 7) - .82);
  const halfHeight = Math.max(8, finite(worldHalfHeight, 15));
  const laneNorm = clamp(finite(definition.laneNorm, 0), -.86, .86);
  const depthNorm = clamp(finite(definition.depthNorm, 0), -.75, .75);
  const entryDepthOffset = clamp(finite(policy.entryDepthOffset, 2.4), .8, 5);
  const exitDepthOffset = clamp(finite(policy.exitDepthOffset, 2.2), .8, 5);
  const approachSpeed = clamp(finite(policy.approachSpeed, .064), .025, .18);
  const cruiseSpeed = clamp(finite(policy.cruiseSpeed, .034), .014, .12);
  const amplitude = clamp(finite(policy.driftAmplitude, .26), 0, .85);
  const frequency = clamp(finite(policy.driftFrequency, .30), .08, .85);
  const reentryDelayMs = clamp(finite(policy.reentryDelayMs, 900), 250, 4000);
  const passLaneShiftNorm = clamp(finite(policy.passLaneShiftNorm, .12), 0, .28);
  const hash = hashParts(seed, definition.id || definition.visualId || 'objective');
  const entryZ = -halfHeight - entryDepthOffset;
  const engagementZ = -halfHeight * .30 + depthNorm * halfHeight * .45;

  return {
    version: DUNGEON_WORLD_TRAVERSAL_VERSION,
    seed: hash,
    bound,
    halfHeight,
    baseLaneNorm: laneNorm,
    baseX: laneNorm * bound,
    entryZ,
    exitZ: halfHeight + exitDepthOffset,
    engagementZ,
    approachSpeed,
    cruiseSpeed,
    amplitude,
    frequency,
    phaseOffset: ((hash >>> 8) % 6284) / 1000,
    reentryDelayMs,
    passLaneShiftNorm,
    passIndex: 0,
    travel: 0,
    x: laneNorm * bound,
    z: entryZ,
    visible: true,
    phase: 'approach',
    reentryAtMs: Math.max(0, finite(nowMs, 0)),
  };
}

/**
 * Mutates the motion record just like the existing hazard motion helper.
 * Visible objectives always advance down-screen; there is no anchored state.
 */
export function advanceDungeonObjectiveWorldMotionV395(motion, {
  nowMs = 0,
  frameFactor = 1,
} = {}) {
  if (!motion) return freezeDeep({ x: 0, z: 0, visible: false, wrapped: false, zDelta: 0, passIndex: 0 });
  const now = Math.max(0, finite(nowMs, 0));
  const frame = clamp(finite(frameFactor, 1), .1, 4);

  if (motion.phase === 'reentry_wait') {
    if (now < motion.reentryAtMs) {
      motion.visible = false;
      return freezeDeep({
        x: motion.x,
        z: motion.z,
        visible: false,
        wrapped: false,
        zDelta: 0,
        passIndex: motion.passIndex,
        phase: motion.phase,
      });
    }
    motion.passIndex += 1;
    motion.travel = 0;
    motion.z = motion.entryZ;
    motion.phase = 'approach';
    motion.visible = true;
  }

  const speed = motion.z < motion.engagementZ ? motion.approachSpeed : motion.cruiseSpeed;
  const zDelta = speed * frame;
  motion.z += zDelta;
  motion.travel += zDelta;
  const laneShift = passLaneJitter(motion.seed, motion.passIndex, motion.passLaneShiftNorm) * motion.bound;
  motion.x = clamp(
    motion.baseX + laneShift
      + Math.sin(motion.phaseOffset + motion.travel * motion.frequency) * motion.amplitude,
    -motion.bound,
    motion.bound,
  );
  if (motion.phase === 'approach' && motion.z >= motion.engagementZ) motion.phase = 'cruise';

  let wrapped = false;
  if (motion.z > motion.exitZ) {
    motion.phase = 'reentry_wait';
    motion.visible = false;
    motion.reentryAtMs = now + motion.reentryDelayMs;
    wrapped = true;
  }

  return freezeDeep({
    x: motion.x,
    z: motion.z,
    visible: motion.visible,
    wrapped,
    zDelta,
    passIndex: motion.passIndex,
    phase: motion.phase,
  });
}

export function auditDungeonWorldTraversalV395() {
  const issues = [];
  const motion = createDungeonObjectiveWorldMotionV395({
    seed: 91,
    definition: { id: 'node-a', laneNorm: .3, depthNorm: -.2 },
    policy: { approachSpeed: .08, cruiseSpeed: .03, reentryDelayMs: 300 },
    arenaHalfWidth: 7,
    worldHalfHeight: 15,
    nowMs: 0,
  });
  let previousZ = motion.z;
  let reachedCruise = false;
  let wrapped = false;
  for (let frame = 0; frame < 2000; frame += 1) {
    const step = advanceDungeonObjectiveWorldMotionV395(motion, { nowMs: frame * 16.667, frameFactor: 1 });
    if (step.visible && step.phase !== 'reentry_wait') {
      if (!(step.z > previousZ)) issues.push('OBJECTIVE_MUST_KEEP_DRIFTING');
      previousZ = step.z;
      if (step.phase === 'cruise') reachedCruise = true;
    }
    if (step.wrapped) { wrapped = true; break; }
  }
  if (!reachedCruise) issues.push('OBJECTIVE_NEVER_REACHED_CRUISE');
  if (!wrapped) issues.push('OBJECTIVE_NEVER_WRAPPED');
  const wait = advanceDungeonObjectiveWorldMotionV395(motion, { nowMs: motion.reentryAtMs - 1, frameFactor: 1 });
  if (wait.visible) issues.push('OBJECTIVE_REENTRY_WAIT_VISIBLE');
  const reentry = advanceDungeonObjectiveWorldMotionV395(motion, { nowMs: motion.reentryAtMs, frameFactor: 1 });
  if (!reentry.visible || motion.passIndex !== 1 || !(motion.z > motion.entryZ)) issues.push('OBJECTIVE_REENTRY_FAILED');
  return Object.freeze(issues);
}
