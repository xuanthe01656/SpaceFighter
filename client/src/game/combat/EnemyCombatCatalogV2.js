/**
 * Campaign enemy product catalog V3.
 *
 * This is the single source of truth for role identity, threat cost, base
 * combat output and movement behavior. The director may scale these values by
 * stage, wave, planet and elite state, but must not duplicate role constants.
 */
export const ENEMY_COMBAT_CATALOG_VERSION = 'enemy-combat-v3.0.0';

const freezeRole = value => Object.freeze({ ...value });

export const ENEMY_ARCHETYPES_V2 = Object.freeze({
  raider: freezeRole({
    id: 'raider', role: 'skirmisher', defenseClass: 'light', damageType: 'kinetic',
    tier: 1, threatCost: 1, canShoot: false,
    unlockStage: 1, hpMultiplier: 0.82, damageMultiplier: 0.88, speedMultiplier: 1.22,
    behavior: 'strafe', preferredRange: 5.2, telegraphTicks: 18, attackCooldownTicks: 60,
    fireCooldownMs: 0, projectileSpeed: 0, projectileDamage: 0, contactDamage: 170,
    routeVariants: Object.freeze(['flyby', 'hook_return']), controlResistance: 0.05,
  }),
  gunner: freezeRole({
    id: 'gunner', role: 'ranged', defenseClass: 'balanced', damageType: 'energy',
    tier: 2, threatCost: 2, canShoot: true,
    unlockStage: 1, hpMultiplier: 1.00, damageMultiplier: 1.00, speedMultiplier: 1.04,
    behavior: 'keep_range', preferredRange: 7.6, telegraphTicks: 18, attackCooldownTicks: 54,
    fireCooldownMs: 1800, projectileSpeed: 0.28, projectileDamage: 180, contactDamage: 180,
    routeVariants: Object.freeze(['range_strafe']), controlResistance: 0.10,
  }),
  charger: freezeRole({
    id: 'charger', role: 'diver', defenseClass: 'armored', damageType: 'kinetic',
    tier: 4, threatCost: 3, canShoot: false,
    unlockStage: 2, hpMultiplier: 1.22, damageMultiplier: 1.18, speedMultiplier: 1.04,
    behavior: 'telegraphed_charge', preferredRange: 10, telegraphTicks: 30, attackCooldownTicks: 102,
    fireCooldownMs: 0, projectileSpeed: 0, projectileDamage: 0, contactDamage: 380,
    routeVariants: Object.freeze(['charge_cycle']), controlResistance: 0.20,
  }),
  shieldbearer: freezeRole({
    id: 'shieldbearer', role: 'defender', defenseClass: 'shielded', damageType: 'energy',
    tier: 3, threatCost: 4, canShoot: false,
    unlockStage: 4, hpMultiplier: 1.42, damageMultiplier: 0.92, speedMultiplier: 0.86,
    behavior: 'guard_lane', preferredRange: 6.8, telegraphTicks: 24, attackCooldownTicks: 84,
    fireCooldownMs: 0, projectileSpeed: 0, projectileDamage: 0, contactDamage: 240,
    routeVariants: Object.freeze(['lane_guard']), shieldRatio: 0.20, controlResistance: 0.30,
  }),
  support: freezeRole({
    id: 'support', role: 'support', defenseClass: 'light', damageType: 'ion',
    tier: 2, threatCost: 4, canShoot: true,
    unlockStage: 5, hpMultiplier: 0.90, damageMultiplier: 0.72, speedMultiplier: 0.98,
    behavior: 'support_orbit', preferredRange: 8.6, telegraphTicks: 21, attackCooldownTicks: 66,
    fireCooldownMs: 2200, projectileSpeed: 0.26, projectileDamage: 145, contactDamage: 150,
    routeVariants: Object.freeze(['support_orbit']),
    supportPulseTicks: 150, supportRatio: 0.08, controlResistance: 0.10,
  }),
  artillery: freezeRole({
    id: 'artillery', role: 'artillery', defenseClass: 'balanced', damageType: 'explosive',
    tier: 3, threatCost: 4, canShoot: true,
    unlockStage: 6, hpMultiplier: 1.10, damageMultiplier: 1.32, speedMultiplier: 0.80,
    behavior: 'telegraphed_zone', preferredRange: 11.4, telegraphTicks: 33, attackCooldownTicks: 75,
    fireCooldownMs: 2500, projectileSpeed: 0.31, projectileDamage: 260, contactDamage: 200,
    routeVariants: Object.freeze(['battery_relocate']), controlResistance: 0.15,
  }),
});

/**
 * Compatibility/runtime projection used by the campaign director and scene.
 * Keeping this derived from ENEMY_ARCHETYPES_V2 removes the former duplicate
 * LEGACY_ROLE_RUNTIME table and prevents catalog/runtime drift.
 */
export const ENEMY_RUNTIME_CATALOG_V3 = Object.freeze(Object.fromEntries(
  Object.values(ENEMY_ARCHETYPES_V2).map(archetype => [archetype.id, Object.freeze({
    id: archetype.id,
    tier: archetype.tier,
    cost: archetype.threatCost,
    canShoot: archetype.canShoot,
    hpMultiplier: archetype.hpMultiplier,
    damageMultiplier: archetype.damageMultiplier,
    speedMultiplier: archetype.speedMultiplier,
    shootMs: archetype.fireCooldownMs,
    projectileSpeed: archetype.projectileSpeed,
    projectileDamage: archetype.projectileDamage,
    contactDamage: archetype.contactDamage,
    damageType: archetype.damageType,
    defenseClass: archetype.defenseClass,
  })]),
));

export function enemyRuntimeFromCatalogV3(roleId = 'raider') {
  return ENEMY_RUNTIME_CATALOG_V3[roleId] || ENEMY_RUNTIME_CATALOG_V3.raider;
}

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
    if (!Number.isInteger(enemy.tier) || enemy.tier < 1 || enemy.tier > 4) issues.push(`TIER:${enemy.id}`);
    if (!Number.isFinite(enemy.threatCost) || enemy.threatCost <= 0) issues.push(`THREAT_COST:${enemy.id}`);
    if (enemy.canShoot && (!(enemy.fireCooldownMs > 0) || !(enemy.projectileSpeed > 0)
      || !(enemy.projectileDamage > 0))) issues.push(`PROJECTILE_RUNTIME:${enemy.id}`);
    if (!(enemy.contactDamage > 0)) issues.push(`CONTACT_DAMAGE:${enemy.id}`);
    if (!Array.isArray(enemy.routeVariants) || !enemy.routeVariants.length) issues.push(`ROUTE_VARIANTS:${enemy.id}`);
    const runtime = ENEMY_RUNTIME_CATALOG_V3[enemy.id];
    if (!runtime || runtime.tier !== enemy.tier || runtime.cost !== enemy.threatCost
      || runtime.canShoot !== enemy.canShoot) issues.push(`RUNTIME_PROJECTION:${enemy.id}`);
  }
  for (let index = 1; index < BOSS_PHASES_V2.length; index += 1) {
    if (BOSS_PHASES_V2[index].enterHpRatio >= BOSS_PHASES_V2[index - 1].enterHpRatio)
      issues.push('BOSS_PHASE_ORDER');
  }
  return Object.freeze(issues);
}
