import {
  DUNGEON_ATTACK_GUARANTEE_VERSION_V427,
  auditDungeonAttackGuaranteeV427,
} from './DungeonAttackGuaranteeV427.js';
import {
  DUNGEON_BALANCE_VERSION_V426,
  auditDungeonBalanceV426,
} from './DungeonBalanceV426.js';
import { DUNGEON_ENEMY_ENTRY_SHIELD_VERSION_V422 } from './DungeonEnemyEntryShieldV422.js';

export const DUNGEON_ATTACK_RELIABILITY_LOCK_VERSION_V427 = 'dungeon-attack-reliability-lock-v4.2.7';

export const DUNGEON_ATTACK_RELIABILITY_LOCK_V427 = Object.freeze({
  version: DUNGEON_ATTACK_RELIABILITY_LOCK_VERSION_V427,
  status: 'locked',
  contracts: Object.freeze({
    entryShield: DUNGEON_ENEMY_ENTRY_SHIELD_VERSION_V422,
    balance: DUNGEON_BALANCE_VERSION_V426,
    attackGuarantee: DUNGEON_ATTACK_GUARANTEE_VERSION_V427,
  }),
  invariants: Object.freeze([
    'offscreen_or_revealing_enemies_cannot_attack_or_be_targeted',
    'visible_ranged_roles_receive_one_authentic_first_volley_deadline',
    'charger_reveal_telegraph_charge_recovery_cycle_is_bounded',
    'boss_guard_required_roles_are_deterministic',
    'projectile_cadence_collision_damage_and_rewards_keep_existing_authority',
  ]),
});

export function auditDungeonAttackReliabilityLockV427() {
  const issues = [];
  if (DUNGEON_ATTACK_RELIABILITY_LOCK_V427.status !== 'locked') issues.push('LOCK_STATUS');
  if (DUNGEON_ENEMY_ENTRY_SHIELD_VERSION_V422 !== 'dungeon-entry-shield-v4.2.2') issues.push('ENTRY_SHIELD_VERSION');
  if (DUNGEON_BALANCE_VERSION_V426 !== 'dungeon-balance-v4.2.6') issues.push('BALANCE_VERSION');
  if (DUNGEON_ATTACK_GUARANTEE_VERSION_V427 !== 'dungeon-attack-guarantee-v4.2.7') issues.push('ATTACK_GUARANTEE_VERSION');
  issues.push(...auditDungeonBalanceV426().map(issue => `BALANCE:${issue}`));
  issues.push(...auditDungeonAttackGuaranteeV427().map(issue => `ATTACK:${issue}`));
  return Object.freeze(issues);
}

export function assertDungeonAttackReliabilityLockV427() {
  const issues = auditDungeonAttackReliabilityLockV427();
  if (issues.length) throw new Error(`Dungeon attack reliability lock failed: ${issues.join(', ')}`);
  return DUNGEON_ATTACK_RELIABILITY_LOCK_V427;
}
