/**
 * Scene-owned timed buff/debuff controller, deterministic from caller's UTC ms.
 * Rebuilds affected stats from a captured combat baseline (no timer races and
 * no repeated +/- drift). Does not store effects in the player profile.
 */
import { applyBattleModifiers, assertModifiers } from '../config/BattleRules.js';
export function createActiveEffects(stats) {
  const base = { ...stats };
  let effects = [];
  let nextExpiry = Infinity;
  const changedStats = new Set();
  const recalc = nowMs => {
    const resolved = applyBattleModifiers(base, effects, nowMs);
    for (const stat of changedStats) stats[stat] = resolved[stat];
    nextExpiry = Math.min(Infinity, ...effects.filter(m=>m.durationMs!==undefined).map(m=>m.appliedAtMs+m.durationMs));
  };
  return {
    add(modifier, nowMs) {
      assertModifiers([modifier]);
      if (modifier.durationMs === undefined) throw new TypeError('Timed effects need durationMs');
      const effect = { ...modifier, appliedAtMs: nowMs };
      effects.push(effect);
      changedStats.add(effect.stat);
      recalc(nowMs);
    },
    update(nowMs) {
      if (nowMs < nextExpiry) return;
      effects = effects.filter(m=>nowMs < m.appliedAtMs+m.durationMs);
      recalc(nowMs);
    },
    activeCount: () => effects.length,
  };
}
