/**
 * Battle-local defensive abilities. No Firestore, React or Babylon dependency.
 * Mutates only the battle-local stats/runtime passed to it (never catalog/profile).
 * Armor constants v1: shield 20% MaxHP; reactive 15% projectile retaliation;
 * crystal 20% retaliation; nano +0.6% MaxHP/sec; void +15% damage reduction.
 * Nova pilot: 800 AOE on first successful hit, 15s cooldown. Echo: one duplicate
 * after 8s cooldown. Tuning lives in deriveCombatLoadout and can be versioned.
 */
import { calculateHitDamage } from '../../utils/combatStats.js';
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function createBattlePassiveState(stats, nowMs = 0) {
  return {
    shieldHp: Math.max(0, stats?.passiveShieldMax || 0),
    nextNovaMs: 0,
    nextEchoMs: (stats?.echoIntervalMs || 0) ? nowMs + stats.echoIntervalMs : Infinity,
  };
}
export function receiveBattleHit(stats, runtime, rawDamage, {
  source = 'contact', nowMs = 0, rng = Math.random,
} = {}) {
  const hit = calculateHitDamage(rawDamage, stats, rng);
  if (hit.dodged) return { dodged: true, damage: 0, absorbed: 0, reflected: 0, novaDamage: 0 };
  const absorbed = Math.min(runtime.shieldHp, hit.damage);
  runtime.shieldHp -= absorbed;
  const damage = hit.damage - absorbed;
  stats.hp = clamp(stats.hp - damage, 0, stats.maxHp);
  const canReflect = !stats.reflectProjectilesOnly || source === 'projectile';
  const reflected = canReflect && stats.reflectRate > 0 ? Math.round(hit.damage * stats.reflectRate) : 0;
  let novaDamage = 0;
  if (stats.novaExplosionDamage > 0 && nowMs >= runtime.nextNovaMs) {
    novaDamage = stats.novaExplosionDamage;
    runtime.nextNovaMs = nowMs + 15000;
  }
  return { dodged: false, damage, absorbed, reflected, novaDamage };
}
export function shouldEchoShot(stats, runtime, nowMs) {
  if (!(stats?.echoIntervalMs > 0) || nowMs < runtime.nextEchoMs) return false;
  runtime.nextEchoMs = nowMs + stats.echoIntervalMs;
  return true;
}
