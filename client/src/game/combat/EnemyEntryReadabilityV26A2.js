/**
 * Versioned presentation/readability policy for enemies entering the battle.
 *
 * This module owns no rewards, AI decisions, damage values or persistence. It
 * only defines when an enemy is readable enough to become targetable and how
 * fast high-speed enemies may travel while hidden behind the top HUD. The
 * policy is pure and can later be mirrored by Shared Combat Rules.
 */
export const ENEMY_ENTRY_READABILITY_VERSION = 'enemy-entry-readability-v2.6a2';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function resolveBattleHudOcclusionRatioV26A2({
  viewportWidth = 393,
  viewportHeight = 852,
  externalHud = true,
  marginPx = 18,
} = {}) {
  const width = Math.max(1, finite(viewportWidth, 393));
  const height = Math.max(1, finite(viewportHeight, 852));
  // BattleHud.module.css: height: clamp(126px, 36vw, 142px).
  const hudHeight = externalHud ? clamp(width * 0.36, 126, 142) : 65;
  return clamp((hudHeight + clamp(finite(marginPx, 18), 0, 48)) / height, 0.14, 0.28);
}

export function createEnemyEntryReadabilityPolicyV26A2({
  worldHalfHeight = 15,
  viewportWidth = 393,
  viewportHeight = 852,
  externalHud = true,
  normalRevealMs = 420,
  fastRevealMs = 650,
  normalEntrySpeedCap = 0.09,
  fastEntrySpeedCap = 0.11,
} = {}) {
  const halfHeight = Math.max(1, finite(worldHalfHeight, 15));
  const occlusionRatio = resolveBattleHudOcclusionRatioV26A2({
    viewportWidth, viewportHeight, externalHud,
  });
  const engagementLineZ = -halfHeight + halfHeight * 2 * occlusionRatio;

  const createState = ({ tier = 1 } = {}) => ({
    phase: 'approach',
    tier: Math.max(1, Math.trunc(finite(tier, 1))),
    crossedAtMs: null,
    engageAtMs: null,
  });

  const update = (state, { positionZ, nowMs } = {}) => {
    if (!state || state.phase === 'active') return state;
    const z = finite(positionZ, -Infinity);
    const now = Math.max(0, finite(nowMs, 0));
    if (state.phase === 'approach' && z >= engagementLineZ) {
      state.phase = 'reveal';
      state.crossedAtMs = now;
      state.engageAtMs = now + (state.tier === 4 ? fastRevealMs : normalRevealMs);
    }
    if (state.phase === 'reveal' && now >= state.engageAtMs) state.phase = 'active';
    return state;
  };

  const isEngageable = state => !state || state.phase === 'active';
  const entrySpeed = (baseSpeed, tier = 1) => Math.min(
    Math.max(0, finite(baseSpeed, 0)),
    Number(tier) === 4 ? fastEntrySpeedCap : normalEntrySpeedCap,
  );

  return Object.freeze({
    version: ENEMY_ENTRY_READABILITY_VERSION,
    engagementLineZ,
    occlusionRatio,
    createState,
    update,
    isEngageable,
    entrySpeed,
  });
}

/**
 * Some temporary 4x4 atlases have nearly empty spawn cells 0..2. Fast enemies
 * can cross the screen before those cells finish. Re-map only the fast-enemy
 * spawn clip to the first readable idle frame without mutating the catalog.
 */
export function createReadableFastEnemyProfileV26A2(profile, { tier = 1 } = {}) {
  if (!profile || Number(tier) !== 4 || !profile.atlasSrc || !profile.visual?.animations) return profile;
  const animations = profile.visual.animations;
  const readableFrame = animations.idle?.frames?.[0] ?? 3;
  const spawn = Object.freeze({
    frames: Object.freeze([readableFrame]),
    fps: 1,
    loop: true,
    durationMs: 0,
  });
  return Object.freeze({
    ...profile,
    visual: Object.freeze({
      ...profile.visual,
      animations: Object.freeze({ ...animations, spawn }),
    }),
  });
}
