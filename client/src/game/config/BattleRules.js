/**
 * Product Balance v1. Pure, deterministic and versioned combat rules.
 * Modifier schema: {id, stat, op:'add'|'multiply', value,
 *   stackGroup?, maxStacks?, durationMs?, appliedAtMs?}.
 * Effective stat = clamp((base + sum(add)) * product(multiply)).
 * No mutation of base combat loadout. No device/render dependence.
 */
export const BALANCE_VERSION = 'combat-v1.0.0';
export const REFERENCE_SHIP_SPEED = 6; // preserves X-Wing beginner speed.
export const BATTLE_WORLD_HALF_HEIGHT = 15;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export const STAT_BOUNDS = Object.freeze({
  maxHp: [1, 1_000_000_000],
  atk: [0, 1_000_000_000], wingAtk: [0, 1_000_000_000], droneAtk: [0, 1_000_000_000],
  armor: [0, 90], speed: [0.5, 30],
  fireRate: [50, 60_000], wingFireRate: [50, 60_000], droneFireRate: [50, 60_000],
  dodgeRate: [0, 0.9], dmgReduce: [0, 0.9],
  hpRegenRate: [0, 0.15], critDamageBoost: [0, 10],
});
export function assertModifiers(modifiers) {
  if (!Array.isArray(modifiers)) throw new TypeError('playerModifiers must be an array');
  for (const m of modifiers) {
    if (!m || typeof m.id !== 'string' || !m.id || !Object.hasOwn(STAT_BOUNDS, m.stat)
      || !['add', 'multiply'].includes(m.op) || !finite(m.value)
      || (m.op === 'multiply' && (m.value < 0 || m.value > 10))
      || (m.op === 'add' && Math.abs(m.value) > 1_000_000_000)
      || (m.durationMs !== undefined && (!finite(m.durationMs) || m.durationMs < 0))
      || (m.appliedAtMs !== undefined && !finite(m.appliedAtMs))
      || (m.maxStacks !== undefined && (!Number.isInteger(m.maxStacks) || m.maxStacks < 1 || m.maxStacks > 16))) {
      throw new TypeError(`Invalid battle modifier ${m?.id ?? '(unknown)'}`);
    }
  }
  return true;
}
export function getBattleEnvironment(mode, location) {
  if (!['campaign', 'dungeon'].includes(mode)) throw new TypeError('Unknown battle mode');
  if (!location) throw new TypeError('Unknown battle location');
  const playerModifiers = location.battle?.playerModifiers ?? [];
  assertModifiers(playerModifiers);
  const enemyHpMultiplier = mode === 'campaign'
    ? location.battle?.enemyHpMultiplier ?? location.enemyHpBuff ?? 1 : 1;
  if (!finite(enemyHpMultiplier) || enemyHpMultiplier < 0.1 || enemyHpMultiplier > 100)
    throw new TypeError('Invalid enemyHpMultiplier');
  return Object.freeze({ mode, locationId: location.id, playerModifiers, enemyHpMultiplier });
}
export function applyBattleModifiers(baseStats, modifiers = [], nowMs = 0) {
  assertModifiers(modifiers);
  if (!finite(nowMs)) throw new TypeError('nowMs must be finite');
  const result = { ...baseStats };
  const stacks = new Map();
  const combined = new Map();
  // For current catalog, modifier ordering is fixed. For future stacking,
  // callers must sort by (appliedAtMs, id) to prioritize newest/oldest effects.
  for (const m of modifiers) {
    if (m.durationMs !== undefined) {
      if (m.appliedAtMs === undefined) throw new TypeError(`Missing appliedAtMs for ${m.id}`);
      if (nowMs >= m.appliedAtMs + m.durationMs) continue;
    }
    const group = `${m.stat}:${m.stackGroup || m.id}`;
    const count = stacks.get(group) || 0;
    if (count >= (m.maxStacks ?? 1)) continue;
    stacks.set(group, count + 1);
    const entry = combined.get(m.stat) || { add: 0, multiply: 1 };
    if (m.op === 'add') entry.add += m.value;
    else entry.multiply *= m.value;
    combined.set(m.stat, entry);
  }
  for (const [stat, { add, multiply }] of combined) {
    const value = Number(baseStats[stat]);
    if (!finite(value)) throw new TypeError(`Invalid base stat ${stat}`);
    result[stat] = clamp((value + add) * multiply, ...STAT_BOUNDS[stat]);
  }
  if (combined.has('maxHp')) {
    const fraction = clamp((Number(baseStats.hp) || 0) / Math.max(1, Number(baseStats.maxHp) || 1), 0, 1);
    result.hp = Math.round(result.maxHp * fraction);
  }
  return result;
}
export function battleSpeedMultiplier(stats) {
  return clamp(Number(stats?.speed || REFERENCE_SHIP_SPEED) / REFERENCE_SHIP_SPEED, 0.15, 3);
}
