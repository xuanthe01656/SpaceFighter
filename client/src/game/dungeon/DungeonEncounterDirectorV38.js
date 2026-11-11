import { ENEMY_ARCHETYPES_V2 } from '../combat/EnemyCombatCatalogV2.js';
import {
  DUNGEON_PARITY_FOUNDATION_VERSION,
  resolveDungeonRuntimeProfileV38,
} from './DungeonEncounterCatalogV38.js';

export const DUNGEON_ENCOUNTER_DIRECTOR_VERSION = 'dungeon-encounter-director-v3.8.0';

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
const rng32 = seed => {
  let value = Math.max(1, Math.trunc(finite(seed, 1))) >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
};

const LANES = Object.freeze([-.82, -.55, -.28, 0, .28, .55, .82]);

const weightedRole = (room, remainingBudget, next) => {
  const candidates = (room.roles || [])
    .map(entry => ({
      ...entry,
      archetype: ENEMY_ARCHETYPES_V2[entry.id],
    }))
    .filter(entry => entry.archetype && entry.archetype.threatCost <= remainingBudget);
  if (!candidates.length) return null;
  const expanded = [];
  for (const entry of candidates) {
    for (let index = 0; index < Math.max(1, Math.trunc(entry.weight)); index += 1) expanded.push(entry);
  }
  return expanded[next() % expanded.length];
};

export function buildDungeonRoomSpawnPlanV38({
  dungeonId = 'dung_taurus',
  roomIndex = 0,
  seed = 1,
} = {}) {
  const profile = resolveDungeonRuntimeProfileV38(dungeonId);
  const safeRoomIndex = clamp(Math.trunc(finite(roomIndex, 0)), 0, Math.max(0, profile.rooms.length - 1));
  const room = profile.rooms[safeRoomIndex];
  const next = rng32(hashParts(seed, dungeonId, room.id, safeRoomIndex));
  const entries = [];
  let remainingBudget = Math.max(0, Math.trunc(finite(room.threatBudget, 0)));
  let guard = 0;

  while (remainingBudget > 0 && guard < 40) {
    guard += 1;
    const selected = weightedRole(room, remainingBudget, next);
    if (!selected) break;
    const archetype = selected.archetype;
    const cost = Math.max(1, Math.trunc(archetype.threatCost));
    const index = entries.length;
    const jitterMs = (Number(next() % 181) - 90);
    const elite = room.kind === 'elite' && (index % 3 === 2 || (next() % 100) < 22);
    const routeVariants = archetype.routeVariants || [];
    const routeVariant = routeVariants.length ? routeVariants[next() % routeVariants.length] : archetype.behavior;
    entries.push(freezeDeep({
      id: `${dungeonId}:${room.id}:enemy:${index}`,
      index,
      roleId: archetype.id,
      laneNorm: LANES[next() % LANES.length],
      strafeDirection: (next() & 1) === 0 ? -1 : 1,
      routeVariant,
      spawnAtMs: Math.max(0, room.introMs + index * room.spawnGapMs + jitterMs),
      threatCost: cost,
      elite,
      hpMultiplier: room.hpMultiplier * (elite ? 1.22 : 1),
      damageMultiplier: room.damageMultiplier * (elite ? 1.14 : 1),
      speedMultiplier: room.speedMultiplier * (elite ? 1.06 : 1),
      projectileSpeedMultiplier: room.projectileSpeedMultiplier * (elite ? 1.05 : 1),
      fireCooldownMultiplier: room.fireCooldownMultiplier * (elite ? .92 : 1),
    }));
    remainingBudget -= cost;
  }

  return freezeDeep({
    version: DUNGEON_ENCOUNTER_DIRECTOR_VERSION,
    foundationVersion: DUNGEON_PARITY_FOUNDATION_VERSION,
    dungeonId,
    roomIndex: safeRoomIndex,
    room,
    entries,
    authoredThreat: entries.reduce((sum, entry) => sum + entry.threatCost, 0),
    unspentThreat: Math.max(0, remainingBudget),
  });
}

const beginRoom = (director, roomIndex, nowMs, events) => {
  director.roomIndex = roomIndex;
  director.roomPlan = buildDungeonRoomSpawnPlanV38({
    dungeonId: director.dungeonId,
    roomIndex,
    seed: director.seed,
  });
  director.status = 'combat';
  director.roomStartedAtMs = nowMs;
  director.roomClearAtMs = null;
  director.spawnCursor = 0;
  director.bossSpawned = false;
  director.bossDefeated = false;
  director.roomsCleared = Math.max(director.roomsCleared, roomIndex);
  events.push(freezeDeep({
    type: 'room_started',
    roomIndex,
    room: director.roomPlan.room,
    roomPlan: director.roomPlan,
  }));
  if (director.roomPlan.room.breakables?.length) {
    events.push(freezeDeep({
      type: 'spawn_breakables',
      roomIndex,
      breakables: director.roomPlan.room.breakables,
    }));
  }
  if (director.roomPlan.room.hazard) {
    events.push(freezeDeep({
      type: 'hazard_started',
      roomIndex,
      hazard: director.roomPlan.room.hazard,
    }));
  }
};

export function createDungeonEncounterDirectorV38({
  dungeonId = 'dung_taurus',
  seed = 1,
  nowMs = 0,
} = {}) {
  const profile = resolveDungeonRuntimeProfileV38(dungeonId);
  return {
    version: DUNGEON_ENCOUNTER_DIRECTOR_VERSION,
    foundationVersion: DUNGEON_PARITY_FOUNDATION_VERSION,
    dungeonId: profile.id,
    profile,
    seed: Math.max(1, Math.trunc(finite(seed, 1))),
    status: 'boot',
    roomIndex: -1,
    roomPlan: null,
    roomStartedAtMs: Math.max(0, finite(nowMs, 0)),
    roomClearAtMs: null,
    spawnCursor: 0,
    bossSpawned: false,
    bossDefeated: false,
    roomsCleared: 0,
    completed: false,
  };
}

export function stepDungeonEncounterDirectorV38(director, {
  nowMs = 0,
  activeEnemyCount = 0,
  activeBreakableCount = 0,
  bossAlive = false,
  bossDefeated = false,
  maxSpawnEventsPerStep = 3,
} = {}) {
  if (!director || director.completed) {
    return Object.freeze({
      director,
      events: Object.freeze([]),
      completed: Boolean(director?.completed),
    });
  }
  const now = Math.max(0, finite(nowMs, 0));
  const events = [];

  if (director.status === 'boot') beginRoom(director, 0, now, events);
  const plan = director.roomPlan;
  if (!plan) return Object.freeze({ director, events: Object.freeze(events), completed: false });
  const room = plan.room;

  if (director.status === 'combat') {
    const elapsed = Math.max(0, now - director.roomStartedAtMs);
    let spawnedThisStep = 0;
    const activeCap = Math.max(1, Math.trunc(room.activeEnemyCap || 8));
    while (director.spawnCursor < plan.entries.length
      && spawnedThisStep < Math.max(1, Math.trunc(maxSpawnEventsPerStep))
      && activeEnemyCount + spawnedThisStep < activeCap) {
      const entry = plan.entries[director.spawnCursor];
      if (entry.spawnAtMs > elapsed) break;
      director.spawnCursor += 1;
      spawnedThisStep += 1;
      events.push(freezeDeep({ type: 'spawn_enemy', roomIndex: director.roomIndex, entry }));
    }

    const queueDone = director.spawnCursor >= plan.entries.length;
    const projectedActiveEnemyCount = Math.max(0, Math.trunc(activeEnemyCount)) + spawnedThisStep;
    const noEnemies = projectedActiveEnemyCount === 0;
    const objectiveReady = !room.breakablesRequired
      || Math.max(0, Math.trunc(activeBreakableCount)) === 0;
    if (room.kind === 'boss') {
      if (queueDone && noEnemies && !director.bossSpawned) {
        director.bossSpawned = true;
        events.push(freezeDeep({
          type: 'spawn_boss',
          roomIndex: director.roomIndex,
          boss: room.boss,
        }));
      }
      if (director.bossSpawned && (bossDefeated || director.bossDefeated)) {
        director.bossDefeated = true;
        director.status = 'room_clear';
        director.roomClearAtMs = now;
        director.roomsCleared = director.roomIndex + 1;
        events.push(freezeDeep({ type: 'room_cleared', roomIndex: director.roomIndex, room }));
      }
    } else if (queueDone && noEnemies && objectiveReady) {
      director.status = 'room_clear';
      director.roomClearAtMs = now;
      director.roomsCleared = director.roomIndex + 1;
      events.push(freezeDeep({ type: 'room_cleared', roomIndex: director.roomIndex, room }));
    }
  }

  if (director.status === 'room_clear') {
    const clearDelay = Math.max(0, finite(director.roomPlan?.room?.clearDelayMs, 1000));
    if (now - director.roomClearAtMs >= clearDelay) {
      const nextRoomIndex = director.roomIndex + 1;
      if (nextRoomIndex >= director.profile.rooms.length) {
        director.status = 'complete';
        director.completed = true;
        events.push(freezeDeep({
          type: 'dungeon_completed',
          dungeonId: director.dungeonId,
          roomsCleared: director.roomsCleared,
          totalRooms: director.profile.rooms.length,
        }));
      } else {
        beginRoom(director, nextRoomIndex, now, events);
      }
    }
  }

  return Object.freeze({
    director,
    events: Object.freeze(events),
    status: director.status,
    roomIndex: director.roomIndex,
    roomsCleared: director.roomsCleared,
    completed: director.completed,
    bossAlive: Boolean(bossAlive),
  });
}

export function getDungeonEncounterSnapshotV38(director) {
  if (!director) return null;
  return freezeDeep({
    version: director.version,
    dungeonId: director.dungeonId,
    status: director.status,
    roomIndex: director.roomIndex,
    roomId: director.roomPlan?.room?.id || null,
    spawnCursor: director.spawnCursor,
    totalSpawns: director.roomPlan?.entries?.length || 0,
    bossSpawned: Boolean(director.bossSpawned),
    bossDefeated: Boolean(director.bossDefeated),
    roomsCleared: director.roomsCleared,
    totalRooms: director.profile?.rooms?.length || 0,
    completed: Boolean(director.completed),
  });
}

export function auditDungeonEncounterDirectorV38() {
  const issues = [];
  const a = buildDungeonRoomSpawnPlanV38({ dungeonId: 'dung_taurus', roomIndex: 1, seed: 42 });
  const b = buildDungeonRoomSpawnPlanV38({ dungeonId: 'dung_taurus', roomIndex: 1, seed: 42 });
  if (JSON.stringify(a.entries) !== JSON.stringify(b.entries)) issues.push('DUNGEON_PLAN_NON_DETERMINISTIC');
  if (!a.entries.length || a.entries.some(entry => !ENEMY_ARCHETYPES_V2[entry.roleId])) {
    issues.push('DUNGEON_PLAN_INVALID_ROLE');
  }
  const director = createDungeonEncounterDirectorV38({ dungeonId: 'dung_taurus', seed: 7, nowMs: 0 });
  const first = stepDungeonEncounterDirectorV38(director, { nowMs: 0, activeEnemyCount: 0 });
  if (!first.events.some(event => event.type === 'room_started')) issues.push('DUNGEON_ROOM_START_EVENT');
  return Object.freeze(issues);
}
