/**
 * Enemy/Boss presentation heading contract V2.6A.4.
 *
 * Source art and reviewed GLBs are authored nose-first on -Z. The shared
 * BattleEntityVisual adapter rotates that source presentation by PI so every
 * gameplay root uses +Z as its forward axis. Campaign and Dungeon therefore
 * resolve root yaw from actual X/Z velocity using one pure deterministic rule.
 */
export const ENEMY_VISUAL_HEADING_VERSION_V26A4 = 'enemy-visual-heading-v2.6a4';
export const ENEMY_SOURCE_NOSE_AXIS_V26A4 = '-Z';
export const ENEMY_GAMEPLAY_FORWARD_AXIS_V26A4 = '+Z';
export const ENEMY_SOURCE_TO_ROOT_YAW_V26A4 = Math.PI;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeEnemyYawV26A4(angle) {
  let value = finite(angle, 0);
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/**
 * Gameplay-root +Z is forward. A velocity of {x:0,z:1} therefore maps to yaw 0,
 * while a velocity of {x:0,z:-1} maps to yaw PI. Rotation is bounded so actors
 * take the shortest turn without snapping or spinning around their own axis.
 */
export function resolveEnemyGameplayYawV26A4({
  currentYaw = 0,
  velocityX = 0,
  velocityZ = 0,
  maxTurnRadians = Math.PI,
} = {}) {
  const vx = finite(velocityX, 0);
  const vz = finite(velocityZ, 0);
  if (Math.hypot(vx, vz) < 0.00001) return normalizeEnemyYawV26A4(currentYaw);
  const targetYaw = Math.atan2(vx, vz);
  const delta = normalizeEnemyYawV26A4(targetYaw - finite(currentYaw, 0));
  const step = clamp(Math.abs(finite(maxTurnRadians, Math.PI)), 0, Math.PI * 2);
  return normalizeEnemyYawV26A4(finite(currentYaw, 0) + clamp(delta, -step, step));
}
