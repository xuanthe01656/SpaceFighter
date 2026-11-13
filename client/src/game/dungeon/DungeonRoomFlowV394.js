/**
 * Dungeon room flow V3.9.4.
 *
 * Pure deterministic helpers for progressive objective reveals and natural
 * drifting hazards.  No Babylon, DOM, reward or server-authority access.
 */
export const DUNGEON_ROOM_FLOW_VERSION = 'dungeon-room-flow-v3.9.4';

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

const normalizeRevealPolicy = policy => freezeDeep({
  mode: policy?.mode || 'sequential_travel',
  initialDelayMs: Math.max(0, finite(policy?.initialDelayMs, 650)),
  betweenNodesMs: Math.max(250, finite(policy?.betweenNodesMs, 1450)),
  entryDepthOffset: clamp(finite(policy?.entryDepthOffset, 2.2), .8, 5),
  approachSpeed: clamp(finite(policy?.approachSpeed, .075), .025, .18),
  anchorTolerance: clamp(finite(policy?.anchorTolerance, .12), .04, .5),
  requirePreviousDestroyed: policy?.requirePreviousDestroyed !== false,
});

export function createProgressiveObjectiveSequenceV394({
  definitions = [],
  policy = {},
  nowMs = 0,
} = {}) {
  const ordered = [...(definitions || [])]
    .map((definition, index) => ({ ...definition, sequenceIndex: Number.isInteger(definition?.sequenceIndex)
      ? definition.sequenceIndex : index }))
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex || String(a.id).localeCompare(String(b.id)));
  const normalizedPolicy = normalizeRevealPolicy(policy);
  return {
    version: DUNGEON_ROOM_FLOW_VERSION,
    policy: normalizedPolicy,
    totalCount: ordered.length,
    queue: ordered,
    activeId: null,
    spawnedCount: 0,
    destroyedCount: 0,
    nextRevealAtMs: Math.max(0, finite(nowMs, 0)) + normalizedPolicy.initialDelayMs,
    completed: ordered.length === 0,
  };
}

export function stepProgressiveObjectiveSequenceV394(state, {
  nowMs = 0,
  activeIds = [],
} = {}) {
  if (!state) return freezeDeep({ state: null, events: [], remainingCount: 0, completed: true });
  const now = Math.max(0, finite(nowMs, 0));
  const active = new Set(activeIds || []);
  const events = [];

  if (state.activeId && !active.has(state.activeId)) {
    state.destroyedCount = Math.min(state.totalCount, state.destroyedCount + 1);
    state.activeId = null;
    state.nextRevealAtMs = now + state.policy.betweenNodesMs;
    events.push(freezeDeep({ type: 'objective_node_cleared', destroyedCount: state.destroyedCount }));
  }

  const canReveal = !state.activeId
    && state.queue.length > 0
    && now >= state.nextRevealAtMs;
  if (canReveal) {
    const definition = state.queue.shift();
    state.activeId = definition.id;
    state.spawnedCount += 1;
    events.push(freezeDeep({ type: 'spawn_objective_node', definition }));
  }

  state.completed = !state.activeId
    && state.queue.length === 0
    && state.destroyedCount >= state.totalCount;
  return Object.freeze({
    state,
    events: Object.freeze(events),
    remainingCount: state.queue.length + (state.activeId ? 1 : 0),
    completed: state.completed,
    destroyedCount: state.destroyedCount,
    spawnedCount: state.spawnedCount,
  });
}

export function getProgressiveObjectiveSnapshotV394(state) {
  if (!state) return freezeDeep({ totalCount: 0, spawnedCount: 0, destroyedCount: 0, remainingCount: 0, completed: true });
  return freezeDeep({
    version: state.version,
    mode: state.policy.mode,
    totalCount: state.totalCount,
    spawnedCount: state.spawnedCount,
    destroyedCount: state.destroyedCount,
    remainingCount: state.queue.length + (state.activeId ? 1 : 0),
    activeId: state.activeId,
    completed: state.completed,
  });
}

const HAZARD_LANES = Object.freeze([-.78, -.48, -.16, .18, .50, .79]);

export function resolveDungeonHazardLaneNormV394({ seed = 1, index = 0 } = {}) {
  const hash = hashParts(seed, index, 'hazard-lane');
  const base = HAZARD_LANES[(Math.trunc(index) + (hash % HAZARD_LANES.length)) % HAZARD_LANES.length];
  const jitter = (((hash >>> 8) % 1001) / 1000 - .5) * .12;
  return clamp(base + jitter, -.86, .86);
}

export function createNaturalHazardMotionV394({
  seed = 1,
  index = 0,
  laneNorm = 0,
  speed = .085,
  arenaHalfWidth = 7,
} = {}) {
  const hash = hashParts(seed, index, 'hazard-motion');
  const bound = Math.max(2, finite(arenaHalfWidth, 7) - .75);
  const normalizedLane = clamp(finite(laneNorm, 0), -.88, .88);
  return {
    baseX: normalizedLane * bound,
    bound,
    travel: 0,
    velocityZ: clamp(finite(speed, .085), .025, .22),
    amplitude: .18 + ((hash >>> 4) % 1000) / 1000 * .42,
    frequency: .34 + ((hash >>> 14) % 1000) / 1000 * .32,
    phase: ((hash >>> 22) % 6284) / 1000,
  };
}

export function advanceNaturalHazardMotionV394(motion, frameFactor = 1) {
  if (!motion) return freezeDeep({ x: 0, zDelta: 0, travel: 0 });
  const frame = clamp(finite(frameFactor, 1), .1, 4);
  const zDelta = motion.velocityZ * frame;
  const travel = motion.travel + zDelta;
  const x = clamp(
    motion.baseX + Math.sin(motion.phase + travel * motion.frequency) * motion.amplitude,
    -motion.bound,
    motion.bound,
  );
  motion.travel = travel;
  return freezeDeep({ x, zDelta, travel });
}

export function resolveDungeonHazardCueV394(hazard = {}) {
  const mode = hazard.warningMode || hazard.cueMode || 'edge_pulse';
  return freezeDeep({
    mode,
    durationMs: clamp(finite(hazard.entryCueMs, finite(hazard.warningMs, 280)), 0, 1200),
    width: clamp(finite(hazard.entryCueWidth, finite(hazard.warningWidth, 1.1)), .45, 2.8),
  });
}

export function auditDungeonRoomFlowV394() {
  const issues = [];
  const sequence = createProgressiveObjectiveSequenceV394({
    definitions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    policy: { initialDelayMs: 0, betweenNodesMs: 300 },
    nowMs: 0,
  });
  let step = stepProgressiveObjectiveSequenceV394(sequence, { nowMs: 0, activeIds: [] });
  if (step.events[0]?.definition?.id !== 'a' || step.remainingCount !== 3) issues.push('OBJECTIVE_FIRST_REVEAL');
  step = stepProgressiveObjectiveSequenceV394(sequence, { nowMs: 10, activeIds: ['a'] });
  if (step.events.length) issues.push('OBJECTIVE_DUPLICATE_REVEAL');
  step = stepProgressiveObjectiveSequenceV394(sequence, { nowMs: 20, activeIds: [] });
  if (step.destroyedCount !== 1) issues.push('OBJECTIVE_DESTROY_ACCOUNTING');
  if (resolveDungeonHazardCueV394({ warningMode: 'edge_pulse' }).mode !== 'edge_pulse') issues.push('HAZARD_CUE_MODE');
  const motion = createNaturalHazardMotionV394({ seed: 7, index: 1, laneNorm: .2 });
  const moved = advanceNaturalHazardMotionV394(motion, 1);
  if (!(moved.zDelta > 0) || !Number.isFinite(moved.x)) issues.push('HAZARD_MOTION');
  return Object.freeze(issues);
}
