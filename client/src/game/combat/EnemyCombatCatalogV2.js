/**
 * Production-oriented enemy roles for Shared Combat Rules V2.
 * The legacy Babylon scene does not consume this catalog yet; it is a pure,
 * deterministic contract for the next server/client simulation phase.
 */
export const ENEMY_COMBAT_CATALOG_VERSION = 'enemy-combat-v2.0.0';
export const ENEMY_ARCHETYPES_V2 = Object.freeze({
  raider: Object.freeze({
    id: 'raider', role: 'skirmisher', defenseClass: 'light', damageType: 'kinetic',
    unlockStage: 1, hpMultiplier: 0.80, damageMultiplier: 0.85, speedMultiplier: 1.18,
    behavior: 'strafe', preferredRange: 5.5, telegraphTicks: 18, attackCooldownTicks: 66,
    controlResistance: 0.05,
  }),
  gunner: Object.freeze({
    id: 'gunner', role: 'ranged', defenseClass: 'balanced', damageType: 'energy',
    unlockStage: 1, hpMultiplier: 1.00, damageMultiplier: 1.00, speedMultiplier: 1.00,
    behavior: 'keep_range', preferredRange: 8, telegraphTicks: 24, attackCooldownTicks: 78,
    controlResistance: 0.10,
  }),
  charger: Object.freeze({
    id: 'charger', role: 'diver', defenseClass: 'armored', damageType: 'kinetic',
    unlockStage: 2, hpMultiplier: 1.25, damageMultiplier: 1.15, speedMultiplier: 0.92,
    behavior: 'telegraphed_charge', preferredRange: 10, telegraphTicks: 36, attackCooldownTicks: 120,
    controlResistance: 0.20,
  }),
  shieldbearer: Object.freeze({
    id: 'shieldbearer', role: 'defender', defenseClass: 'shielded', damageType: 'energy',
    unlockStage: 4, hpMultiplier: 1.35, damageMultiplier: 0.82, speedMultiplier: 0.78,
    behavior: 'guard_lane', preferredRange: 7, telegraphTicks: 30, attackCooldownTicks: 96,
    shieldRatio: 0.20, controlResistance: 0.30,
  }),
  support: Object.freeze({
    id: 'support', role: 'support', defenseClass: 'light', damageType: 'ion',
    unlockStage: 5, hpMultiplier: 0.85, damageMultiplier: 0.60, speedMultiplier: 0.90,
    behavior: 'support_orbit', preferredRange: 9, telegraphTicks: 30, attackCooldownTicks: 105,
    supportPulseTicks: 150, supportRatio: 0.08, controlResistance: 0.10,
  }),
  artillery: Object.freeze({
    id: 'artillery', role: 'artillery', defenseClass: 'balanced', damageType: 'explosive',
    unlockStage: 6, hpMultiplier: 1.05, damageMultiplier: 1.30, speedMultiplier: 0.68,
    behavior: 'telegraphed_zone', preferredRange: 12, telegraphTicks: 48, attackCooldownTicks: 132,
    controlResistance: 0.15,
  }),
});

export const BOSS_PHASES_V2 = Object.freeze([
  Object.freeze({ id: 'phase_1', enterHpRatio: 1, patterns: Object.freeze(['aimed_burst', 'fan']), cooldownTicks: 84 }),
  Object.freeze({ id: 'phase_2', enterHpRatio: 0.65, patterns: Object.freeze(['fan', 'lane_sweep', 'aimed_burst']), cooldownTicks: 72 }),
  Object.freeze({ id: 'phase_3', enterHpRatio: 0.30, patterns: Object.freeze(['lane_sweep', 'radial_gap', 'aimed_burst']), cooldownTicks: 60 }),
]);

export function bossPhaseForHp(hpRatio) {
  const ratio = Math.max(0, Math.min(1, Number(hpRatio) || 0));
  return BOSS_PHASES_V2.findLast?.(phase => ratio <= phase.enterHpRatio)
    || (ratio <= .30 ? BOSS_PHASES_V2[2] : ratio <= .65 ? BOSS_PHASES_V2[1] : BOSS_PHASES_V2[0]);
}

export function auditEnemyCombatCatalogV2() {
  const issues = [];
  const values = Object.values(ENEMY_ARCHETYPES_V2);
  if (new Set(values.map(value => value.id)).size !== values.length) issues.push('DUPLICATE_ENEMY_ID');
  for (const enemy of values) {
    if (enemy.telegraphTicks < 15) issues.push(`TELEGRAPH_TOO_SHORT:${enemy.id}`);
    if (enemy.attackCooldownTicks <= enemy.telegraphTicks) issues.push(`COOLDOWN_NOT_AFTER_TELEGRAPH:${enemy.id}`);
    if (enemy.controlResistance < 0 || enemy.controlResistance > .5) issues.push(`CONTROL_RESISTANCE:${enemy.id}`);
    if (!['light','balanced','armored','shielded'].includes(enemy.defenseClass))
      issues.push(`DEFENSE_CLASS:${enemy.id}`);
  }
  for (let index = 1; index < BOSS_PHASES_V2.length; index += 1) {
    if (BOSS_PHASES_V2[index].enterHpRatio >= BOSS_PHASES_V2[index - 1].enterHpRatio)
      issues.push('BOSS_PHASE_ORDER');
  }
  return Object.freeze(issues);
}
