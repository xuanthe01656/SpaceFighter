import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DUNGEON_QA_ACCESS_VERSION,
  DUNGEON_QA_PROFILES_V391,
  auditDungeonQaAccessV391,
  createDungeonQaRunV391,
  getDungeonQaStatusLabelV391,
  isDungeonQaRunV391,
  resolveDungeonQaAccessV391,
} from '../src/game/dungeon/DungeonQaAccessV391.js';
import {
  DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397,
  DUNGEON_QA_LOADOUT_VERSION,
  auditDungeonQaLoadoutsV397,
  buildDungeonQaCampaignDataV397,
  listDungeonQaLoadoutPresetsV397,
} from '../src/game/dungeon/DungeonQaLoadoutV397.js';
import {
  createDungeonEncounterDirectorV38,
  stepDungeonEncounterDirectorV38,
} from '../src/game/dungeon/DungeonEncounterDirectorV38.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8').replace(/\r\n/g, '\n');

test('Dungeon QA V3.9.8 exposes three full five-room profiles without changing production availability', () => {
  assert.equal(DUNGEON_QA_ACCESS_VERSION, 'dungeon-qa-access-v3.9.8');
  assert.deepEqual(auditDungeonQaAccessV391(), []);
  assert.deepEqual(Object.keys(DUNGEON_QA_PROFILES_V391).sort(), [
    'dung_abaddon', 'dung_nereus', 'dung_taurus',
  ]);
  assert.equal(DUNGEON_QA_PROFILES_V391.dung_taurus.readiness, 'production_qa');
  assert.equal(DUNGEON_QA_PROFILES_V391.dung_nereus.readiness, 'production_candidate_qa');
  assert.equal(DUNGEON_QA_PROFILES_V391.dung_abaddon.readiness, 'production_candidate_qa');
  assert.equal(getDungeonQaStatusLabelV391(DUNGEON_QA_PROFILES_V391.dung_taurus, 'vi'), 'PRODUCTION QA · BẬC 1');
  assert.equal(getDungeonQaStatusLabelV391(DUNGEON_QA_PROFILES_V391.dung_nereus, 'vi'), 'QA ỨNG VIÊN · BẬC 2');
  for (const profile of Object.values(DUNGEON_QA_PROFILES_V391)) {
    assert.equal(profile.runtimeMode, 'parity_v398');
    assert.equal(profile.roomBriefs.length, 5);
    assert.equal(profile.allowDirectRoom, true);
  }
});

test('query access is DEV-only while the explicit APK build flag is authoritative', () => {
  const query = '?sfDungeonQa=1&sfDungeon=dung_taurus&sfDungeonRoom=taurus_boss&sfDungeonLoadout=stress_mk4';
  const production = resolveDungeonQaAccessV391({ envEnabled: false, isDev: false, search: query });
  assert.equal(production.enabled, false);
  assert.equal(production.source, 'disabled');

  const dev = resolveDungeonQaAccessV391({ envEnabled: false, isDev: true, search: query });
  assert.equal(dev.enabled, true);
  assert.equal(dev.source, 'dev_query');
  assert.equal(dev.requestedDungeonId, 'dung_taurus');
  assert.equal(dev.requestedRoomId, 'taurus_boss');
  assert.equal(dev.requestedLoadoutPresetId, 'stress_mk4');

  const apk = resolveDungeonQaAccessV391({ envEnabled: true, isDev: false, search: '' });
  assert.equal(apk.enabled, true);
  assert.equal(apk.source, 'build_flag');
});

test('QA run contract is always zero-energy, zero-reward and no trusted writes', () => {
  const access = resolveDungeonQaAccessV391({ envEnabled: true });
  const taurusBoss = createDungeonQaRunV391({
    access,
    dungeonId: 'dung_taurus',
    roomId: 'taurus_boss',
    loadoutPresetId: 'assault_mk3',
  });
  assert.equal(isDungeonQaRunV391(taurusBoss, 'dung_taurus', { runtimeEnabled: true }), true);
  assert.equal(taurusBoss.directRoomIndex, 4);
  assert.equal(taurusBoss.singleRoom, true);
  assert.equal(taurusBoss.rewardMode, 'none');
  assert.equal(taurusBoss.consumeEnergy, false);
  assert.equal(taurusBoss.trustedWrites, false);
  assert.equal(taurusBoss.loadoutPresetId, 'assault_mk3');
  assert.equal(taurusBoss.seedKey, 'qa-v398:dung_taurus:taurus_boss:assault_mk3');
  assert.equal(isDungeonQaRunV391(taurusBoss, 'dung_taurus', { runtimeEnabled: false }), false);
  assert.equal(isDungeonQaRunV391({ ...taurusBoss, runtimeMode: 'forged' }, 'dung_taurus', { runtimeEnabled: true }), false);

  const nereus = createDungeonQaRunV391({
    access,
    dungeonId: 'dung_nereus',
    roomId: 'nereus_oracle',
    loadoutPresetId: 'control_mk3',
  });
  assert.equal(nereus.runtimeMode, 'parity_v398');
  assert.equal(nereus.readiness, 'production_candidate_qa');
  assert.equal(nereus.directRoomId, 'nereus_oracle');
  assert.equal(nereus.directRoomIndex, 4);
  assert.equal(nereus.singleRoom, true);
  assert.equal(nereus.loadoutPresetId, 'control_mk3');
});

test('QA loadouts are complete, selectable and projected without mutating account data', () => {
  assert.equal(DUNGEON_QA_LOADOUT_VERSION, 'dungeon-qa-loadout-v3.9.7');
  assert.equal(DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397, 'assault_mk3');
  assert.deepEqual(auditDungeonQaLoadoutsV397(), []);
  assert.equal(listDungeonQaLoadoutPresetsV397().length, 5);

  const account = {
    loadout: { aircraft: 'ship_xwing', mainGun: 'item_start_gun', wingman: '', armor: '', drone: '' },
    ownedAircrafts: { ship_xwing: { level: 1, stars: 1 } },
    items: { item_start_gun: { baseId: 'gun_laser', rarity: 1, level: 1, type: 'mainGun' } },
  };
  const projected = buildDungeonQaCampaignDataV397(account, {
    enabled: true,
    loadoutPresetId: 'fortress_mk4',
  });
  assert.equal(account.loadout.aircraft, 'ship_xwing');
  assert.equal(account.loadout.wingman, '');
  assert.equal(projected.loadout.aircraft, 'ship_eternal');
  assert.ok(projected.loadout.wingman.startsWith('qa_v397_fortress_mk4_'));
  assert.equal(projected.items[projected.loadout.armor].baseId, 'armor_void');
  assert.equal(projected.items[projected.loadout.drone].baseId, 'drone_repair');
  assert.equal(projected.qaProjection.ephemeral, true);
  assert.equal(projected.qaProjection.trustedWrites, false);
});

test('direct-room director starts at the selected authored room and completes only that room', () => {
  const director = createDungeonEncounterDirectorV38({
    dungeonId: 'dung_taurus',
    seed: 391,
    nowMs: 0,
    startRoomIndex: 4,
    endAfterRoomIndex: 4,
  });
  const first = stepDungeonEncounterDirectorV38(director, { nowMs: 0, activeEnemyCount: 0 });
  assert.equal(first.events.find(event => event.type === 'room_started')?.room?.id, 'taurus_boss');

  stepDungeonEncounterDirectorV38(director, {
    nowMs: 100_000,
    activeEnemyCount: 0,
    maxSpawnEventsPerStep: 99,
  });
  const bossSpawn = stepDungeonEncounterDirectorV38(director, {
    nowMs: 100_100,
    activeEnemyCount: 0,
    maxSpawnEventsPerStep: 99,
  });
  assert.equal(bossSpawn.events.some(event => event.type === 'spawn_boss'), true);

  const clear = stepDungeonEncounterDirectorV38(director, {
    nowMs: 100_200,
    activeEnemyCount: 0,
    bossDefeated: true,
  });
  assert.equal(clear.events.some(event => event.type === 'room_cleared'), true);

  const complete = stepDungeonEncounterDirectorV38(director, {
    nowMs: 102_000,
    activeEnemyCount: 0,
    bossDefeated: true,
  });
  assert.equal(complete.events.some(event => event.type === 'dungeon_completed'), true);
  assert.equal(director.completed, true);
});

test('UI, launch, result and workflow wiring preserve QA isolation', () => {
  const select = read('client/src/components/DungeonSelect/index.jsx');
  const hq = read('client/src/components/HQ/index.jsx');
  const engine = read('client/src/components/Dungeon/DungeonEngine.jsx');
  const scene = read('client/src/components/Dungeon/DungeonScene.js');
  const result = read('client/src/components/DungeonResult/index.jsx');
  const workflow = read('.github/workflows/android-native-smoke.yml');
  const worlds = read('client/src/game/catalog/worlds.js');

  const qaAccess = read('client/src/game/dungeon/DungeonQaAccessV391.js');
  assert.match(qaAccess, /VITE_SF_DUNGEON_QA/);
  assert.match(select, /resolveDungeonQaRuntimeAccessV391/);
  assert.match(select, /createDungeonQaRunV391/);
  assert.match(select, /qaRoomSelections/);
  assert.match(select, /qaLoadoutSelections/);
  assert.match(select, /qaSetupPanel/);
  assert.match(select, /<details/);
  assert.match(select, /QA XUẤT KÍCH/);
  assert.match(select, /listDungeonQaLoadoutPresetsV397/);
  assert.match(hq, /!dungeonQaRun/);
  assert.match(hq, /NO ENERGY · NO REWARDS · NO PROFILE WRITES/);
  assert.match(engine, /Boolean\(auth\.currentUser\) \|\| Boolean\(dungeonQaRun\)/);
  assert.match(engine, /qa\s+: dungeonQaRun/);
  assert.match(scene, /dungeonQaRunV391\?\.seedKey/);
  assert.match(scene, /buildDungeonQaCampaignDataV397/);
  assert.match(scene, /qaEnabled: Boolean\(dungeonQaRunV391\)/);
  assert.match(scene, /qaLoadoutLabel/);
  assert.match(scene, /startRoomIndex: qaStartRoomIndexV391/);
  assert.match(scene, /endAfterRoomIndex: dungeonQaRunV391\?\.singleRoom/);
  assert.match(result, /if \(qaRun\)/);
  assert.match(result, /No energy, rewards, progression, or trusted writes/);

  assert.match(workflow, /guest_dungeon_v39_qa:/);
  assert.match(workflow, /VITE_SF_DUNGEON_QA:/);
  assert.match(workflow, /VITE_SF_DUNGEON_QA_REWARDS: 'false'/);
  assert.match(workflow, /spacefighter-android-dungeon-v398-production-hardening-qa-debug-no-rewards/);
  assert.match(workflow, /Dungeon QA cannot be combined with C15 release candidates/);

  // Production schedule remains authored in the catalog; QA never rewrites it.
  assert.match(worlds, /openDays: \[1, 3, 5, 0\]/);
  assert.match(worlds, /openDays: \[2, 4, 6, 0\]/);
  assert.match(worlds, /openDays: \[0, 6\]/);
  assert.doesNotMatch(worlds, /VITE_SF_DUNGEON_QA/);
});
