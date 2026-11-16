import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DUNGEON_ATTACK_RELIABILITY_LOCK_V427,
  DUNGEON_ATTACK_RELIABILITY_LOCK_VERSION_V427,
  assertDungeonAttackReliabilityLockV427,
  auditDungeonAttackReliabilityLockV427,
} from '../src/game/dungeon/DungeonAttackReliabilityLockV427.js';

test('V4.2.7 attack reliability is explicitly locked before V4.3 content expansion', () => {
  assert.equal(DUNGEON_ATTACK_RELIABILITY_LOCK_VERSION_V427, 'dungeon-attack-reliability-lock-v4.2.7');
  assert.equal(DUNGEON_ATTACK_RELIABILITY_LOCK_V427.status, 'locked');
  assert.deepEqual(auditDungeonAttackReliabilityLockV427(), []);
  assert.equal(assertDungeonAttackReliabilityLockV427(), DUNGEON_ATTACK_RELIABILITY_LOCK_V427);
  assert.equal(DUNGEON_ATTACK_RELIABILITY_LOCK_V427.contracts.entryShield, 'dungeon-entry-shield-v4.2.2');
  assert.equal(DUNGEON_ATTACK_RELIABILITY_LOCK_V427.contracts.balance, 'dungeon-balance-v4.2.6');
  assert.equal(DUNGEON_ATTACK_RELIABILITY_LOCK_V427.contracts.attackGuarantee, 'dungeon-attack-guarantee-v4.2.7');
});
