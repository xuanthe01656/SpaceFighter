import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397,
  DUNGEON_QA_LOADOUT_PRESETS_V397,
  auditDungeonQaLoadoutsV397,
  buildDungeonQaCampaignDataV397,
} from '../src/game/dungeon/DungeonQaLoadoutV397.js';

const projectedSource = () => ({
  loadout: { aircraft: 'ship_xwing', mainGun: 'owned_laser', wingman: null, armor: null, drone: null },
  ownedAircrafts: { ship_xwing: { level: 1, stars: 1 } },
  items: { owned_laser: { baseId: 'gun_laser', type: 'mainGun', level: 1, rarity: 1 } },
});

test('V4.0.2 keeps Taurus default preset identity while lowering only assault QA numbers', () => {
  assert.equal(DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397, 'assault_mk3');
  const assault = DUNGEON_QA_LOADOUT_PRESETS_V397.assault_mk3;
  assert.deepEqual(assault.aircraft, { id: 'ship_raptor', level: 12, stars: 1 });
  assert.deepEqual(assault.equipment.mainGun, { baseId: 'gun_neutron', type: 'mainGun', level: 10, rarity: 2 });
  for (const [slot, baseId] of Object.entries({ wingman: 'wing_homing', armor: 'armor_reactive', drone: 'drone_laser' })) {
    assert.deepEqual(assault.equipment[slot], { baseId, type: slot, level: 8, rarity: 2 });
  }
  assert.equal(auditDungeonQaLoadoutsV397().length, 0);
});

test('V4.0.2 remains QA-only and does not mutate persistent account source', () => {
  const source = projectedSource();
  const before = structuredClone(source);
  const result = buildDungeonQaCampaignDataV397(source, { enabled: true, loadoutPresetId: 'assault_mk3' });
  assert.notStrictEqual(result, source);
  assert.deepEqual(source, before);
  assert.equal(result.loadout.aircraft, 'ship_raptor');
  assert.equal(result.ownedAircrafts.ship_raptor.level, 12);
  assert.equal(result.qaProjection.ephemeral, true);
  assert.equal(result.qaProjection.trustedWrites, false);
  for (const slot of ['mainGun', 'wingman', 'armor', 'drone']) {
    assert.equal(result.items[result.loadout[slot]].qaOnly, true);
  }
  assert.strictEqual(buildDungeonQaCampaignDataV397(source, { enabled: false, loadoutPresetId: 'assault_mk3' }), source);
  assert.strictEqual(buildDungeonQaCampaignDataV397(source, { enabled: true, loadoutPresetId: 'account' }), source);
});

test('V4.0.2 preserves control/fortress/stress QA presets untouched', () => {
  const presets = DUNGEON_QA_LOADOUT_PRESETS_V397;
  assert.equal(presets.control_mk3.aircraft.level, 38);
  assert.equal(presets.fortress_mk4.aircraft.level, 45);
  assert.equal(presets.stress_mk4.aircraft.level, 48);
  assert.equal(presets.account.useCurrent, true);
});
