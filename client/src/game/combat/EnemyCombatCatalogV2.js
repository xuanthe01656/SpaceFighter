import {
  auditCampaignEnemyEngagementV36,
  resolveCampaignEnemyRoleContractV36,
} from './CampaignEnemyEngagementV36.js';

/**
 * Campaign enemy product catalog V3.7.
 *
 * This is the single source of truth for role identity, threat cost, combat
 * output and engagement geometry. The director may scale numeric output by
 * stage, wave, planet and elite state, but it must not redefine role behavior.
 */
export const ENEMY_COMBAT_CATALOG_VERSION = 'enemy-combat-v3.7.0';

const freezeRole = value => Object.freeze({
  ...resolveCampaignEnemyRoleContractV36(value.id),
  rangeMetric: 'forward_depth',
  ...value,
});

export const ENEMY_ARCHETYPES_V2 = Object.freeze({
  raider: freezeRole({
    id: 'raider', role: 'skirmisher', engagementMode: 'skirmisher',
    weaponId: 'enemy_scout_pulse_v1', bulletPattern: 'attack_pass_burst',
    defenseClass: 'light', damageType: 'kinetic',
    tier: 1, threatCost: 1, canShoot: true, canCrossPlayer: false, reengages: true,
    unlockStage: 1, hpMultiplier: 0.82, damageMultiplier: 0.86, speedMultiplier: 1.18,
    behavior: 'strafe', preferredRange: 5.6, fireRangeMin: 4.6, fireRangeMax: 7.4,
    telegraphTicks: 16, attackCooldownTicks: 54,
    fireCooldownMs: 920, projectileSpeed: 0.80, projectileDamage: 28, contactDamage: 125,
    projectileAimMode: 'predictive', projectileLeadFactor: 0.62, projectileMaxLeadMs: 380,
    projectileGuidanceMs: 0, projectileTurnRateRadians: 0, projectileLifetimeMs: 2500,
    projectileVisualId: 'enemy_scout_pulse',
    burstCount: 2, burstGapMs: 100, minVolleysPerFirePhase: 1, maxVolleysPerFirePhase: 1,
    routeVariants: Object.freeze(['hook_return', 'double_hook_return']), controlResistance: 0.05,
  }),
  gunner: freezeRole({
    id: 'gunner', role: 'ranged', engagementMode: 'ranged',
    weaponId: 'enemy_energy_dart_v1', bulletPattern: 'sustained_predictive_burst',
    defenseClass: 'balanced', damageType: 'energy',
    tier: 2, threatCost: 2, canShoot: true, canCrossPlayer: false, reengages: true,
    unlockStage: 1, hpMultiplier: 1.00, damageMultiplier: 1.00, speedMultiplier: 1.04,
    behavior: 'keep_range', preferredRange: 7.8, fireRangeMin: 6.3, fireRangeMax: 9.6,
    telegraphTicks: 17, attackCooldownTicks: 48,
    fireCooldownMs: 1080, projectileSpeed: 0.76, projectileDamage: 34, contactDamage: 145,
    projectileAimMode: 'predictive', projectileLeadFactor: 0.94, projectileMaxLeadMs: 580,
    projectileGuidanceMs: 0, projectileTurnRateRadians: 0, projectileLifetimeMs: 2900,
    projectileVisualId: 'enemy_energy_dart',
    burstCount: 3, burstGapMs: 88, minVolleysPerFirePhase: 1, maxVolleysPerFirePhase: 1,
    routeVariants: Object.freeze(['range_strafe']), controlResistance: 0.10,
  }),
  charger: freezeRole({
    id: 'charger', role: 'diver', engagementMode: 'diver',
    weaponId: 'enemy_contact_charge_v1', bulletPattern: 'telegraphed_contact_charge',
    defenseClass: 'armored', damageType: 'kinetic',
    tier: 4, threatCost: 3, canShoot: false, canCrossPlayer: true, reengages: true,
    unlockStage: 2, hpMultiplier: 1.22, damageMultiplier: 1.18, speedMultiplier: 1.04,
    behavior: 'telegraphed_charge', preferredRange: 8.5, fireRangeMin: 0, fireRangeMax: 0,
    telegraphTicks: 30, attackCooldownTicks: 102,
    fireCooldownMs: 0, projectileSpeed: 0, projectileDamage: 0, contactDamage: 380,
    routeVariants: Object.freeze(['charge_cycle']), controlResistance: 0.20,
  }),
  shieldbearer: freezeRole({
    id: 'shieldbearer', role: 'defender', engagementMode: 'guard',
    weaponId: 'enemy_guard_pulse_v1', bulletPattern: 'guard_lane_spread',
    defenseClass: 'shielded', damageType: 'energy',
    tier: 3, threatCost: 4, canShoot: true, canCrossPlayer: false, reengages: true,
    unlockStage: 4, hpMultiplier: 1.42, damageMultiplier: 0.90, speedMultiplier: 0.88,
    behavior: 'guard_lane', preferredRange: 6.8, fireRangeMin: 5.6, fireRangeMax: 8.4,
    telegraphTicks: 22, attackCooldownTicks: 72,
    fireCooldownMs: 1580, projectileSpeed: 0.68, projectileDamage: 38, contactDamage: 180,
    projectileAimMode: 'predictive', projectileLeadFactor: 0.48, projectileMaxLeadMs: 340,
    projectileGuidanceMs: 0, projectileTurnRateRadians: 0, projectileLifetimeMs: 3100,
    projectileVisualId: 'enemy_guard_pulse',
    burstCount: 2, burstGapMs: 130, minVolleysPerFirePhase: 1, maxVolleysPerFirePhase: 1,
    routeVariants: Object.freeze(['lane_guard']), shieldRatio: 0.20, controlResistance: 0.30,
  }),
  support: freezeRole({
    id: 'support', role: 'support', engagementMode: 'support',
    weaponId: 'enemy_ion_comet_v1', bulletPattern: 'soft_homing_ion_pair',
    defenseClass: 'light', damageType: 'ion',
    tier: 2, threatCost: 4, canShoot: true, canCrossPlayer: false, reengages: true,
    unlockStage: 5, hpMultiplier: 0.90, damageMultiplier: 0.72, speedMultiplier: 0.98,
    behavior: 'support_orbit', preferredRange: 8.8, fireRangeMin: 7.3, fireRangeMax: 10.8,
    telegraphTicks: 20, attackCooldownTicks: 60,
    fireCooldownMs: 1320, projectileSpeed: 0.68, projectileDamage: 36, contactDamage: 130,
    projectileAimMode: 'soft_homing', projectileLeadFactor: 0.34, projectileMaxLeadMs: 320,
    projectileGuidanceMs: 540, projectileTurnRateRadians: 0.048, projectileLifetimeMs: 3200,
    projectileVisualId: 'enemy_ion_comet',
    burstCount: 2, burstGapMs: 116, minVolleysPerFirePhase: 1, maxVolleysPerFirePhase: 1,
    routeVariants: Object.freeze(['support_orbit']),
    supportPulseTicks: 150, supportRatio: 0.08, controlResistance: 0.10,
  }),
  artillery: freezeRole({
    id: 'artillery', role: 'artillery', engagementMode: 'artillery',
    weaponId: 'enemy_plasma_slug_v1', bulletPattern: 'telegraphed_heavy_pair',
    defenseClass: 'balanced', damageType: 'explosive',
    tier: 3, threatCost: 4, canShoot: true, canCrossPlayer: false, reengages: true,
    unlockStage: 6, hpMultiplier: 1.10, damageMultiplier: 1.30, speedMultiplier: 0.82,
    behavior: 'telegraphed_zone', preferredRange: 11.1, fireRangeMin: 9.2, fireRangeMax: 13.4,
    telegraphTicks: 30, attackCooldownTicks: 69,
    fireCooldownMs: 1580, projectileSpeed: 0.72, projectileDamage: 88, contactDamage: 160,
    projectileAimMode: 'predictive', projectileLeadFactor: 1.0, projectileMaxLeadMs: 720,
    projectileGuidanceMs: 0, projectileTurnRateRadians: 0, projectileLifetimeMs: 3600,
    projectileVisualId: 'enemy_plasma_slug',
    burstCount: 2, burstGapMs: 150, minVolleysPerFirePhase: 1, maxVolleysPerFirePhase: 1,
    routeVariants: Object.freeze(['battery_relocate']), controlResistance: 0.15,
  }),
});

/**
 * Compatibility/runtime projection used by the campaign director and scene.
 * Keeping this derived from ENEMY_ARCHETYPES_V2 prevents catalog/runtime drift.
 */
export const ENEMY_RUNTIME_CATALOG_V3 = Object.freeze(Object.fromEntries(
  Object.values(ENEMY_ARCHETYPES_V2).map(archetype => [archetype.id, Object.freeze({
    id: archetype.id,
    weaponId: archetype.weaponId,
    bulletPattern: archetype.bulletPattern,
    tier: archetype.tier,
    cost: archetype.threatCost,
    canShoot: archetype.canShoot,
    engagementMode: archetype.engagementMode,
    combatClass: archetype.combatClass,
    movementContract: archetype.movementContract,
    engagementRangeLabel: archetype.engagementRangeLabel,
    attackContract: archetype.attackContract,
    rangeMetric: archetype.rangeMetric,
    lateralTrackingStrength: archetype.lateralTrackingStrength,
    edgeInset: archetype.edgeInset,
    canCrossPlayer: archetype.canCrossPlayer,
    reengages: archetype.reengages,
    preferredRange: archetype.preferredRange,
    fireRangeMin: archetype.fireRangeMin,
    fireRangeMax: archetype.fireRangeMax,
    hpMultiplier: archetype.hpMultiplier,
    damageMultiplier: archetype.damageMultiplier,
    speedMultiplier: archetype.speedMultiplier,
    shootMs: archetype.fireCooldownMs,
    projectileSpeed: archetype.projectileSpeed,
    projectileDamage: archetype.projectileDamage,
    projectileAimMode: archetype.projectileAimMode || 'snapshot',
    projectileLeadFactor: archetype.projectileLeadFactor || 0,
    projectileMaxLeadMs: archetype.projectileMaxLeadMs || 0,
    projectileGuidanceMs: archetype.projectileGuidanceMs || 0,
    projectileTurnRateRadians: archetype.projectileTurnRateRadians || 0,
    projectileLifetimeMs: archetype.projectileLifetimeMs || 3600,
    projectileVisualId: archetype.projectileVisualId || 'enemy_energy_dart',
    burstCount: archetype.burstCount || 1,
    burstGapMs: archetype.burstGapMs || 0,
    minVolleysPerFirePhase: archetype.minVolleysPerFirePhase || 1,
    maxVolleysPerFirePhase: archetype.maxVolleysPerFirePhase || 1,
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
  Object.freeze({ id: 'phase_3', enterHpRatio: 0.30, patterns: Object.freeze(['lane_sweep', 'radial_gap', 'fan', 'aimed_burst']), cooldownTicks: 60 }),
]);

export function bossPhaseForHp(hpRatio) {
  const ratio = Math.max(0, Math.min(1, Number(hpRatio) || 0));
  return BOSS_PHASES_V2.findLast?.(phase => ratio <= phase.enterHpRatio)
    || (ratio <= .30 ? BOSS_PHASES_V2[2] : ratio <= .65 ? BOSS_PHASES_V2[1] : BOSS_PHASES_V2[0]);
}

export function auditEnemyCombatCatalogV2() {
  const issues = [...auditCampaignEnemyEngagementV36()];
  const values = Object.values(ENEMY_ARCHETYPES_V2);
  if (new Set(values.map(value => value.id)).size !== values.length) issues.push('DUPLICATE_ENEMY_ID');
  let crossPlayerCount = 0;
  for (const enemy of values) {
    if (enemy.telegraphTicks < 15) issues.push(`TELEGRAPH_TOO_SHORT:${enemy.id}`);
    if (enemy.attackCooldownTicks <= enemy.telegraphTicks) issues.push(`COOLDOWN_NOT_AFTER_TELEGRAPH:${enemy.id}`);
    if (enemy.controlResistance < 0 || enemy.controlResistance > .5) issues.push(`CONTROL_RESISTANCE:${enemy.id}`);
    if (!['light','balanced','armored','shielded'].includes(enemy.defenseClass))
      issues.push(`DEFENSE_CLASS:${enemy.id}`);
    if (!['skirmisher','ranged','diver','guard','support','artillery'].includes(enemy.engagementMode))
      issues.push(`ENGAGEMENT_MODE:${enemy.id}`);
    if (enemy.rangeMetric !== 'forward_depth') issues.push(`RANGE_METRIC:${enemy.id}`);
    if (!enemy.combatClass || !enemy.movementContract || !enemy.attackContract)
      issues.push(`ROLE_CONTRACT:${enemy.id}`);
    if (!String(enemy.weaponId || '').startsWith('enemy_') || !enemy.bulletPattern)
      issues.push(`WEAPON_CONTRACT:${enemy.id}`);
    if (!Number.isInteger(enemy.tier) || enemy.tier < 1 || enemy.tier > 4) issues.push(`TIER:${enemy.id}`);
    if (!Number.isFinite(enemy.threatCost) || enemy.threatCost <= 0) issues.push(`THREAT_COST:${enemy.id}`);
    if (enemy.canCrossPlayer) crossPlayerCount += 1;
    if (enemy.canCrossPlayer !== (enemy.engagementMode === 'diver')) issues.push(`PLAYER_CROSS_POLICY:${enemy.id}`);
    if (enemy.reengages !== true) issues.push(`REENGAGE_POLICY:${enemy.id}`);
    if (enemy.engagementMode !== 'diver' && enemy.canShoot !== true) issues.push(`PASSIVE_NON_DIVER:${enemy.id}`);
    if (enemy.canShoot && (!(enemy.preferredRange > 0) || !(enemy.fireRangeMin > 0)
      || !(enemy.fireRangeMax > enemy.fireRangeMin)
      || enemy.preferredRange < enemy.fireRangeMin || enemy.preferredRange > enemy.fireRangeMax))
      issues.push(`FIRE_RANGE:${enemy.id}`);
    if (enemy.canShoot && (!(enemy.fireCooldownMs > 0) || !(enemy.projectileSpeed > 0)
      || !(enemy.projectileDamage > 0))) issues.push(`PROJECTILE_RUNTIME:${enemy.id}`);
    if (enemy.canShoot && !['snapshot', 'predictive', 'soft_homing'].includes(enemy.projectileAimMode))
      issues.push(`PROJECTILE_AIM_MODE:${enemy.id}`);
    if (enemy.canShoot && (!(enemy.projectileLifetimeMs >= 1600) || enemy.projectileLifetimeMs > 6500))
      issues.push(`PROJECTILE_LIFETIME:${enemy.id}`);
    if (enemy.canShoot && !String(enemy.projectileVisualId || '').startsWith('enemy_'))
      issues.push(`PROJECTILE_VISUAL:${enemy.id}`);
    if (enemy.canShoot && (!(enemy.burstCount >= 2) || enemy.burstCount > 5
      || !(enemy.burstGapMs >= 60) || enemy.burstGapMs > 320))
      issues.push(`PROJECTILE_BURST:${enemy.id}`);
    if (enemy.canShoot && (!(enemy.minVolleysPerFirePhase >= 1)
      || enemy.maxVolleysPerFirePhase < enemy.minVolleysPerFirePhase
      || enemy.maxVolleysPerFirePhase > 3)) issues.push(`VOLLEY_LIMIT:${enemy.id}`);
    if (enemy.projectileAimMode === 'soft_homing'
      && (!(enemy.projectileGuidanceMs > 0) || !(enemy.projectileTurnRateRadians > 0)))
      issues.push(`PROJECTILE_GUIDANCE:${enemy.id}`);
    if (!(enemy.contactDamage > 0)) issues.push(`CONTACT_DAMAGE:${enemy.id}`);
    if (!Array.isArray(enemy.routeVariants) || !enemy.routeVariants.length) issues.push(`ROUTE_VARIANTS:${enemy.id}`);
    const runtime = ENEMY_RUNTIME_CATALOG_V3[enemy.id];
    if (!runtime || runtime.tier !== enemy.tier || runtime.cost !== enemy.threatCost
      || runtime.canShoot !== enemy.canShoot || runtime.engagementMode !== enemy.engagementMode
      || runtime.canCrossPlayer !== enemy.canCrossPlayer
      || runtime.preferredRange !== enemy.preferredRange
      || runtime.weaponId !== enemy.weaponId
      || runtime.bulletPattern !== enemy.bulletPattern) issues.push(`RUNTIME_PROJECTION:${enemy.id}`);
  }
  if (crossPlayerCount !== 1 || ENEMY_ARCHETYPES_V2.charger.canCrossPlayer !== true)
    issues.push('ONLY_CHARGER_MAY_CROSS_PLAYER');
  for (let index = 1; index < BOSS_PHASES_V2.length; index += 1) {
    if (BOSS_PHASES_V2[index].enterHpRatio >= BOSS_PHASES_V2[index - 1].enterHpRatio)
      issues.push('BOSS_PHASE_ORDER');
  }
  return Object.freeze(issues);
}
