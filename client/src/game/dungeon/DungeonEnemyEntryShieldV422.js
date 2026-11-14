/**
 * Dungeon Enemy Entry Shield V4.2.2 — presentation & targetability safety.
 * Mirrors Campaign's visible-entry / brief reveal policy. Does not modify HP,
 * loot, weapon statistics or scoring. Pure state, no timers / DOM / RNG.
 *
 * 0) While above the HUD-safe visible line, an enemy is not a valid target.
 * 1) On crossing the line, show a protection ring for a bounded reveal delay.
 * 2) Only after the delay may the enemy be damaged, targeted or attack.
 * Determinism: caller supplies wall-clock nowMs (same Dungeon timebase).
 */
export const DUNGEON_ENEMY_ENTRY_SHIELD_VERSION_V422 = 'dungeon-entry-shield-v4.2.2';

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const DUNGEON_ENTRY_REVEAL_MS_V422 = Object.freeze({
  default: 420,
  charger: 650,
  elite: 650,
});

export function createDungeonEnemyEntryShieldV422({roleId = 'raider', elite = false} = {}) {
  const revealMs = elite || roleId === 'charger'
    ? DUNGEON_ENTRY_REVEAL_MS_V422.charger
    : DUNGEON_ENTRY_REVEAL_MS_V422.default;
  return { phase: 'approach', crossedAtMs: null, engageAtMs: null, revealMs };
}

export function advanceDungeonEnemyEntryShieldV422(state, {
  nowMs = 0, enemyZ = -Infinity, hudOcclusionLineZ = -12,
  visibleMargin = .65,
} = {}) {
  if (!state || state.phase === 'active') return state;
  const z = finite(enemyZ, -Infinity);
  const hudZ = finite(hudOcclusionLineZ, -12);
  const now = Math.max(0, finite(nowMs, 0));
  const crossingLine = hudZ + Math.max(.4, finite(visibleMargin, .65));
  if (state.phase === 'approach' && z >= crossingLine) {
    state.phase = 'reveal';
    state.crossedAtMs = now;
    state.engageAtMs = now + state.revealMs;
  }
  if (state.phase === 'reveal' && now >= state.engageAtMs) state.phase = 'active';
  return state;
}

export const isDungeonEnemyEntryActiveV422 = state => !state || state.phase === 'active';
export const isDungeonEnemyEntryRevealingV422 = state => state?.phase === 'reveal';
