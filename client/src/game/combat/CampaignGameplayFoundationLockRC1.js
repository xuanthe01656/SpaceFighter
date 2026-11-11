import { CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION } from './CampaignAttackTelegraphPlanV282.js';
import { CAMPAIGN_BOSS_ARSENAL_VERSION } from './CampaignBossArsenalV33.js';
import {
  CAMPAIGN_BOSS_XSTATE_PACKAGE_VERSION,
  CAMPAIGN_BOSS_XSTATE_VERSION,
} from './CampaignBossStatechartV37.js';
import { CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION } from './CampaignCombatChoreographyV29.js';
import { CAMPAIGN_ENCOUNTER_ESCALATION_VERSION } from './CampaignEncounterEscalationV28.js';
import { CAMPAIGN_ENEMY_COMBAT_SLOT_VERSION } from './CampaignEnemyCombatSlotsV37.js';
import { CAMPAIGN_ENEMY_PROJECTILE_VERSION } from './CampaignEnemyProjectileV31.js';
import { CAMPAIGN_ENEMY_VOLLEY_VERSION } from './CampaignEnemyVolleyV34.js';
import { CAMPAIGN_MINI_BOSS_AI_VERSION } from './CampaignMiniBossAiV281.js';
import { CAMPAIGN_RUNTIME_RELIABILITY_VERSION } from './CampaignRuntimeReliabilityV26A3.js';
import { COMBAT_WEAPON_CATALOG_VERSION } from './CombatWeaponCatalogV37.js';
import { CAMPAIGN_WAVE_DIRECTOR_VERSION } from './DeterministicEnemyDirectorV2.js';
import { ENEMY_COMBAT_CATALOG_VERSION } from './EnemyCombatCatalogV2.js';
import { PLAYER_DAMAGE_PIPELINE_VERSION } from './PlayerDamagePipelineV25.js';

/**
 * Campaign Gameplay Foundation Lock RC1.
 *
 * The purpose of this manifest is not to freeze numeric balance forever.  It
 * freezes the gameplay architecture that Dungeon must reuse: damage, enemy
 * roles, wave/encounter contracts, projectile/volley plans, distributed combat
 * slots, Boss XState orchestration and runtime reliability.
 *
 * After RC1, Campaign changes should be catalog tuning only unless this lock is
 * deliberately versioned to RC2 with a dedicated migration and regression run.
 */
export const CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1_VERSION = 'campaign-gameplay-foundation-lock-rc1.0.0';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

export const CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1 = freezeDeep({
  version: CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1_VERSION,
  baseline: 'v3.7.0',
  status: 'locked',
  branchPolicy: 'main_only',
  architecture: {
    normalEnemyState: 'custom_fsm',
    miniBossState: 'custom_fsm_v2.8.1',
    finalBossState: 'xstate_v5',
    projectileAuthority: 'deterministic_runtime',
    rendererAuthority: 'presentation_only',
    damageAuthority: 'player_damage_pipeline_v2.5',
  },
  contracts: {
    attackTelegraph: CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION,
    bossArsenal: CAMPAIGN_BOSS_ARSENAL_VERSION,
    bossStatechart: CAMPAIGN_BOSS_XSTATE_VERSION,
    bossStatechartPackage: CAMPAIGN_BOSS_XSTATE_PACKAGE_VERSION,
    choreography: CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION,
    encounter: CAMPAIGN_ENCOUNTER_ESCALATION_VERSION,
    enemyCombatSlots: CAMPAIGN_ENEMY_COMBAT_SLOT_VERSION,
    enemyProjectiles: CAMPAIGN_ENEMY_PROJECTILE_VERSION,
    enemyVolleys: CAMPAIGN_ENEMY_VOLLEY_VERSION,
    miniBoss: CAMPAIGN_MINI_BOSS_AI_VERSION,
    runtimeReliability: CAMPAIGN_RUNTIME_RELIABILITY_VERSION,
    weaponCatalog: COMBAT_WEAPON_CATALOG_VERSION,
    waveDirector: CAMPAIGN_WAVE_DIRECTOR_VERSION,
    enemyCatalog: ENEMY_COMBAT_CATALOG_VERSION,
    damagePipeline: PLAYER_DAMAGE_PIPELINE_VERSION,
  },
  permittedTuningFields: [
    'hpMultiplier',
    'damageMultiplier',
    'speedMultiplier',
    'projectileSpeed',
    'projectileDamage',
    'fireCooldownMs',
    'burstCount',
    'burstGapMs',
    'preferredRange',
    'fireRangeMin',
    'fireRangeMax',
    'spawnGapMs',
    'threatBudget',
    'rewardAmount',
  ],
  forbiddenWithoutRc2: [
    'replace_normal_enemy_fsm',
    'replace_damage_pipeline',
    'replace_projectile_authority',
    'replace_boss_statechart',
    'move_gameplay_authority_into_babylon',
    'duplicate_campaign_runtime_for_dungeon',
  ],
});

const EXPECTED_CONTRACTS_RC1 = Object.freeze({
  attackTelegraph: 'campaign-attack-telegraph-plan-v2.8.2',
  bossArsenal: 'campaign-boss-arsenal-v3.3.0',
  bossStatechart: 'campaign-boss-xstate-v3.7.0',
  bossStatechartPackage: '5.33.4',
  choreography: 'campaign-combat-choreography-v3.7.0',
  encounter: 'campaign-encounter-v2.8.1',
  enemyCombatSlots: 'campaign-enemy-combat-slots-v3.7.0',
  enemyProjectiles: 'campaign-enemy-projectile-v3.2.0',
  enemyVolleys: 'campaign-enemy-volley-v3.4.0',
  miniBoss: 'campaign-mini-boss-ai-v2.8.1',
  runtimeReliability: 'campaign-runtime-reliability-v2.6a3',
  weaponCatalog: 'combat-weapon-catalog-v3.7.0',
  waveDirector: 'campaign-wave-director-v3.5.0',
  enemyCatalog: 'enemy-combat-v3.7.0',
  damagePipeline: 'player-damage-pipeline-v2.5.0',
});

export function auditCampaignGameplayFoundationLockRC1() {
  const issues = [];
  for (const [key, expected] of Object.entries(EXPECTED_CONTRACTS_RC1)) {
    const actual = CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1.contracts[key];
    if (actual !== expected) issues.push(`CAMPAIGN_RC1_CONTRACT_DRIFT:${key}:${actual}:${expected}`);
  }
  if (CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1.architecture.finalBossState !== 'xstate_v5') {
    issues.push('CAMPAIGN_RC1_FINAL_BOSS_NOT_XSTATE');
  }
  if (CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1.architecture.rendererAuthority !== 'presentation_only') {
    issues.push('CAMPAIGN_RC1_RENDERER_AUTHORITY_DRIFT');
  }
  return Object.freeze(issues);
}

export function assertCampaignGameplayFoundationLockRC1() {
  const issues = auditCampaignGameplayFoundationLockRC1();
  if (issues.length) throw new Error(`Campaign Gameplay Foundation Lock RC1 failed: ${issues.join(', ')}`);
  return CAMPAIGN_GAMEPLAY_FOUNDATION_LOCK_RC1;
}
