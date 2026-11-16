import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DUNGEON_BALANCE_VERSION_V426,
  DUNGEON_BALANCE_PROFILES_V426,
  DUNGEON_QA_OUTGOING_SCALE_BY_PRESET_V426,
  auditDungeonBalanceV426,
  resolveDungeonHostileHitRadiusV426,
  resolveDungeonIncomingDamageV426,
  resolveDungeonQaPresetDamageScaleV426,
} from '../src/game/dungeon/DungeonBalanceV426.js';
import { resolveDungeonQaOutgoingDamageScaleV403 } from '../src/game/dungeon/DungeonQaLoadoutV397.js';
import { createDungeonQaReadinessV400 } from '../src/game/dungeon/DungeonQaReadinessV400.js';

const qa = preset => ({
  enabled: true,
  loadoutPresetId: preset,
  rewardMode: 'none',
  trustedWrites: false,
});

test('V4.2.6 defines a monotonic three-Dungeon production pressure curve', () => {
  assert.equal(DUNGEON_BALANCE_VERSION_V426, 'dungeon-balance-v4.2.6');
  assert.deepEqual(auditDungeonBalanceV426(), []);
  assert.equal(DUNGEON_BALANCE_PROFILES_V426.dung_taurus.rank, 1);
  assert.equal(DUNGEON_BALANCE_PROFILES_V426.dung_nereus.rank, 2);
  assert.equal(DUNGEON_BALANCE_PROFILES_V426.dung_abaddon.rank, 3);
  assert.ok(DUNGEON_BALANCE_PROFILES_V426.dung_nereus.incomingDamage.boss
    > DUNGEON_BALANCE_PROFILES_V426.dung_taurus.incomingDamage.boss);
  assert.ok(DUNGEON_BALANCE_PROFILES_V426.dung_abaddon.incomingDamage.boss
    > DUNGEON_BALANCE_PROFILES_V426.dung_nereus.incomingDamage.boss);
});

test('Nereus ion pressure drains passive shield without increasing post-shield HP damage', () => {
  const result = resolveDungeonIncomingDamageV426({
    dungeonId: 'dung_nereus',
    rawDamage: 100,
    source: 'projectile',
    damageType: 'ion',
    passiveShieldHp: 500,
  });
  assert.equal(result.damage, 105);
  assert.equal(result.shieldPressureMultiplier, 1.85);
  assert.ok(Math.abs(result.extraShieldDamage - 89.25) < 1e-9);
  const noShield = resolveDungeonIncomingDamageV426({
    dungeonId: 'dung_nereus', rawDamage: 100, damageType: 'ion', passiveShieldHp: 0,
  });
  assert.equal(noShield.extraShieldDamage, 0);
  assert.equal(noShield.damage, 105);
});

test('Taurus remains baseline while Abaddon keeps the highest survival pressure', () => {
  const taurus = resolveDungeonIncomingDamageV426({
    dungeonId: 'dung_taurus', rawDamage: 100, source: 'contact', passiveShieldHp: 500,
  });
  assert.equal(taurus.damage, 100);
  assert.equal(taurus.extraShieldDamage, 0);
  const abaddon = resolveDungeonIncomingDamageV426({
    dungeonId: 'dung_abaddon', rawDamage: 100, source: 'contact', damageType: 'void', passiveShieldHp: 500,
  });
  assert.ok(Math.abs(abaddon.damage - 115) < 1e-9);
  assert.ok(abaddon.extraShieldDamage > 50);
});

test('Nereus portrait projectile collision is more forgiving without changing Taurus', () => {
  assert.equal(resolveDungeonHostileHitRadiusV426({
    dungeonId: 'dung_taurus', baseRadius: 1.2, priority: 'boss',
  }), 1.2);
  assert.equal(resolveDungeonHostileHitRadiusV426({
    dungeonId: 'dung_nereus', baseRadius: 1.2, priority: 'boss',
  }), 1.416);
  assert.ok(resolveDungeonHostileHitRadiusV426({
    dungeonId: 'dung_abaddon', baseRadius: 1.2, priority: 'boss',
  }) > 1.2);
});

test('QA preset offense is normalized per Dungeon tier while account remains real', () => {
  assert.deepEqual(DUNGEON_QA_OUTGOING_SCALE_BY_PRESET_V426, {
    account: 1, assault_mk3: .10, control_mk3: .22, fortress_mk4: .28, stress_mk4: .12,
  });
  for (const [preset, expected] of Object.entries(DUNGEON_QA_OUTGOING_SCALE_BY_PRESET_V426)) {
    assert.equal(resolveDungeonQaPresetDamageScaleV426(preset), expected);
    assert.equal(resolveDungeonQaOutgoingDamageScaleV403({ qaRun: qa(preset) }), expected);
  }
});

test('QA evidence distinguishes HP loss from shield damage absorbed', () => {
  const recorder = createDungeonQaReadinessV400({
    enabled: true, dungeonId: 'dung_nereus', presetId: 'control_mk3', startedAtMs: 100,
  });
  recorder.beginRoom({ roomId: 'nereus_entry', roomIndex: 0, nowMs: 120, hp: 1000 });
  recorder.recordDamage({
    source: 'projectile', hpBefore: 1000, hpAfter: 1000,
    absorbed: true, absorbedAmount: 85,
  });
  const report = recorder.snapshot(500);
  assert.equal(report.dungeonBalanceVersion, DUNGEON_BALANCE_VERSION_V426);
  assert.equal(report.damageTaken, 0);
  assert.equal(report.shieldDamageAbsorbed, 85);
  assert.equal(report.absorbed, 1);
});

test('live scene and content catalog wire V4.2.6 damage, hit radius and hazard identity', () => {
  const scene = fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js', import.meta.url), 'utf8');
  const catalog = fs.readFileSync(new URL('../src/game/dungeon/DungeonContentCatalogV393.js', import.meta.url), 'utf8');
  assert.match(scene, /resolveDungeonIncomingDamageV426\(/);
  assert.match(scene, /resolveDungeonHostileHitRadiusV426\(/);
  assert.match(scene, /extraPassiveShieldAbsorbedV426/);
  assert.match(scene, /damageType:\s*hazard\.damageType/);
  assert.match(scene, /priority:\s*eb\._priority/);
  assert.match(catalog, /nereus_ion_currents:[\s\S]*damageType:\s*'ion'/);
  assert.match(catalog, /abaddon_gravity_shear:[\s\S]*damageType:\s*'void'/);
  assert.match(catalog, /dung_nereus:[\s\S]*damageMultiplier:\s*1\.12/);
  assert.match(catalog, /nereus_oracle_core[\s\S]*damageMultiplier:\s*1\.10/);
});
