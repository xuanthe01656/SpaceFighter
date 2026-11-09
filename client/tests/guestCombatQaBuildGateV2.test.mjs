import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isGuestCombatQaRuntimeEnabled,
  resolveGuestCombatQaRuntimeFromViteEnv,
} from '../src/game/combat/GuestCombatQaBuildGateV2.js';
import {
  GUEST_COMBAT_QA_ARMOR_IDS,
  GUEST_COMBAT_QA_EQUIPMENT_PRESETS,
  GUEST_COMBAT_QA_EQUIPMENT_PRESET_IDS,
  GUEST_COMBAT_QA_SHIP_IDS,
  createGuestCombatQaBattleDataV26A1,
  cycleGuestCombatQaLoadoutV2,
  resolveGuestCombatQaLoadoutV2,
} from '../src/game/combat/GuestCombatQaLoadoutV2.js';
import { DEFAULT_CAMPAIGN_DATA } from '../src/game/catalog/profileDefaults.js';
import { GEAR_CATALOG } from '../src/game/catalog/gear.js';
import { AIRCRAFTS } from '../src/game/catalog/aircraft.js';
import { PILOTS } from '../src/game/catalog/pilots.js';
import { PLANET_CONFIG } from '../src/game/catalog/worlds.js';
import { deriveBattleLoadout } from '../src/utils/combatStats.js';
import {
  GUEST_BATTLE_QA_BOSS_STAGE_IDS,
  GUEST_BATTLE_QA_PLANET_IDS,
  GUEST_BATTLE_QA_STAGE_IDS,
  createGuestBattleQaResultV26A,
  cycleGuestBattleQaSelectionV26A,
  resolveGuestBattleQaResultActionV26A,
  resolveGuestBattleQaSelectionV26A,
} from '../src/game/combat/GuestBattleQaNavigationV26A.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const mobileQa = overrides => ({
  guestAbilitiesQa: true,
  mobileQaBuild: true,
  buildChannel: 'staging-qa',
  gameApiEnabled: false,
  authenticated: false,
  cloudBattle: false,
  ...overrides,
});

test('Guest Combat V2 browser QA remains DEV-only and guest-only', () => {
  assert.equal(isGuestCombatQaRuntimeEnabled({ isDev: true, guestAbilitiesQa: true }), true);
  assert.equal(isGuestCombatQaRuntimeEnabled({ isDev: true, guestAbilitiesQa: false }), false);
  assert.equal(isGuestCombatQaRuntimeEnabled({ isDev: true, guestAbilitiesQa: true, authenticated: true }), false);
  assert.equal(isGuestCombatQaRuntimeEnabled({ isDev: true, guestAbilitiesQa: true, cloudBattle: true }), false);
});

test('manual staging Android QA can enable Guest Combat V2 in a production-mode Vite build', () => {
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa()), true);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ mobileQaBuild: 'true' })), true);
});

test('release, Cloud, authenticated and Game API builds cannot enable Guest Combat V2', () => {
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ buildChannel: 'release-candidate' })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ gameApiEnabled: true })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ authenticated: true })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ cloudBattle: true })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ mobileQaBuild: false })), false);
});

test('Vite environment adapter applies the same explicit mobile QA contract', () => {
  const env = {
    DEV: false,
    VITE_SF_GUEST_ABILITIES_QA: 'true',
    VITE_SF_GUEST_COMBAT_V2_QA: 'true',
    VITE_SF_BUILD_CHANNEL: 'staging-qa',
    VITE_GAME_API_ENABLED: 'false',
  };
  assert.equal(resolveGuestCombatQaRuntimeFromViteEnv(env), true);
  assert.equal(resolveGuestCombatQaRuntimeFromViteEnv(env, { authenticated: true }), false);
});

test('Android workflow exposes a manual isolated Guest Combat V2 QA artifact', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/android-native-smoke.yml'), 'utf8');
  assert.match(workflow, /guest_combat_v2_qa:/);
  assert.match(workflow, /VITE_SF_GUEST_ABILITIES_QA:/);
  assert.match(workflow, /VITE_SF_GUEST_COMBAT_V2_QA:/);
  assert.match(workflow, /Guest Combat V2 QA is manual-only/);
  assert.match(workflow, /spacefighter-android-guest-combat-v2-qa-debug-not-for-release/);
  assert.match(workflow, /inputs\.guest_combat_v2_qa == true/);
  assert.match(workflow, /VITE_SF_NATIVE_TOUCH_QA:.*inputs\.touch_qa == true/);
  assert.doesNotMatch(workflow, /VITE_SF_NATIVE_TOUCH_QA:.*guest_combat_v2_qa/);
  assert.doesNotMatch(workflow, /Guest Combat V2 QA requires native touch QA isolation/);
});


test('mobile QA switcher covers 16 ships, seven armors and four equipment presets without losing query flags', () => {
  assert.equal(GUEST_COMBAT_QA_SHIP_IDS.length, 16);
  assert.equal(GUEST_COMBAT_QA_ARMOR_IDS.length, 7);
  assert.deepEqual(GUEST_COMBAT_QA_EQUIPMENT_PRESET_IDS, ['profile', 'field', 'elite', 'boss']);
  const initial = resolveGuestCombatQaLoadoutV2('');
  assert.equal(initial.shipId, 'ship_xwing');
  assert.equal(initial.armorId, 'armor_light');
  assert.equal(initial.equipmentPresetId, 'profile');
  assert.equal(initial.equipmentPresetIndex, 1);
  assert.equal(initial.equipmentPresetTotal, 4);
  const ship = cycleGuestCombatQaLoadoutV2('?sfAbilityDebug=1&sfArmorQa=force-next-projectile', 'ship');
  assert.equal(ship.value, 'ship_scout');
  assert.match(ship.search, /sfAbilityDebug=1/);
  assert.match(ship.search, /sfArmorQa=force-next-projectile/);
  const armor = cycleGuestCombatQaLoadoutV2(ship.search, 'armor');
  assert.equal(armor.value, 'armor_heavy');
  const equipment = cycleGuestCombatQaLoadoutV2(armor.search, 'equipment');
  assert.equal(equipment.value, 'field');
  assert.match(equipment.search, /sfQaGear=field/);
  assert.match(equipment.search, /sfGuestShip=ship_scout/);
  assert.match(equipment.search, /sfGuestArmor=armor_heavy/);
});

test('QA equipment presets use real catalog gear and create isolated battle-local inventory only', () => {
  const catalogIds = slot => new Set(GEAR_CATALOG[slot].map(item => item.id));
  for (const preset of GUEST_COMBAT_QA_EQUIPMENT_PRESETS.filter(value => value.equipment)) {
    assert.equal(catalogIds('mainGun').has(preset.equipment.mainGunId), true, preset.id);
    assert.equal(catalogIds('wingman').has(preset.equipment.wingmanId), true, preset.id);
    assert.equal(catalogIds('drone').has(preset.equipment.droneId), true, preset.id);
    assert.ok(preset.aircraftLevel >= 1 && preset.aircraftLevel <= 100);
    assert.ok(preset.gearLevel >= 1 && preset.gearLevel <= 100);
    assert.ok((preset.armorLevel || preset.gearLevel) >= 1 && (preset.armorLevel || preset.gearLevel) <= 100);
    assert.ok((preset.supportLevel || preset.gearLevel) >= 1 && (preset.supportLevel || preset.gearLevel) <= 100);
    assert.ok(preset.rarity >= 1 && preset.rarity <= 5);
  }
  const source = structuredClone(DEFAULT_CAMPAIGN_DATA);
  const before = structuredClone(source);
  const battle = createGuestCombatQaBattleDataV26A1(source, {
    shipId: 'ship_tank', armorId: 'armor_heavy', equipmentPresetId: 'elite',
    planetId: 3, stageId: 8,
  });
  assert.deepEqual(source, before, 'QA builder must not mutate the profile');
  assert.equal(battle.progress.currentPlanet, 3);
  assert.equal(battle.progress.selectedStage, 8);
  assert.equal(battle.loadout.aircraft, 'ship_tank');
  assert.equal(battle.items[battle.loadout.mainGun].baseId, 'gun_ion');
  assert.equal(battle.items[battle.loadout.wingman].baseId, 'wing_emp');
  assert.equal(battle.items[battle.loadout.drone].baseId, 'drone_repair');
  assert.equal(battle.items[battle.loadout.armor].baseId, 'armor_heavy');
  assert.equal(battle.items[battle.loadout.mainGun].level, 24);
  assert.equal(battle.items[battle.loadout.wingman].level, 22);
  assert.equal(battle.items[battle.loadout.armor].level, 65);
  assert.equal(battle.items[battle.loadout.armor].rarity, 3);
  assert.equal(battle.ownedAircrafts.ship_tank.level, 70);
});

test('Mechanic observer preset prioritizes survivability without deleting every wave immediately', () => {
  const field = createGuestCombatQaBattleDataV26A1(DEFAULT_CAMPAIGN_DATA, {
    shipId: 'ship_xwing', armorId: 'armor_heavy', equipmentPresetId: 'field', planetId: 3, stageId: 10,
  });
  const observer = createGuestCombatQaBattleDataV26A1(DEFAULT_CAMPAIGN_DATA, {
    shipId: 'ship_xwing', armorId: 'armor_heavy', equipmentPresetId: 'elite', planetId: 3, stageId: 10,
  });
  const catalogs = { PILOTS, AIRCRAFTS, GEAR_CATALOG };
  const fieldCombat = deriveBattleLoadout(field, catalogs, {
    mode: 'campaign', location: PLANET_CONFIG[3], armorPassivePolicy: 'none', combatRatingVersion: 'v2',
  });
  const observerCombat = deriveBattleLoadout(observer, catalogs, {
    mode: 'campaign', location: PLANET_CONFIG[3], armorPassivePolicy: 'none', combatRatingVersion: 'v2',
  });
  assert.ok(observerCombat.combatRatingV2.breakdown.effectiveHp > fieldCombat.combatRatingV2.breakdown.effectiveHp * 2);
  assert.ok(observerCombat.combatRatingV2.breakdown.offenseDps < fieldCombat.combatRatingV2.breakdown.offenseDps);
  assert.equal(observerCombat.gear.drone.base.behavior, 'repair');
});

test('Boss QA preset materially increases offense and survivability without granting profile ownership', () => {
  const base = createGuestCombatQaBattleDataV26A1(DEFAULT_CAMPAIGN_DATA, {
    shipId: 'ship_xwing', armorId: 'armor_heavy', equipmentPresetId: 'profile',
    planetId: 3, stageId: 10,
  });
  const boss = createGuestCombatQaBattleDataV26A1(DEFAULT_CAMPAIGN_DATA, {
    shipId: 'ship_xwing', armorId: 'armor_heavy', equipmentPresetId: 'boss',
    planetId: 3, stageId: 10,
  });
  const catalogs = { PILOTS, AIRCRAFTS, GEAR_CATALOG };
  const baseCombat = deriveBattleLoadout(base, catalogs, {
    mode: 'campaign', location: PLANET_CONFIG[3], armorPassivePolicy: 'none', combatRatingVersion: 'v2',
  });
  const bossCombat = deriveBattleLoadout(boss, catalogs, {
    mode: 'campaign', location: PLANET_CONFIG[3], armorPassivePolicy: 'none', combatRatingVersion: 'v2',
  });
  assert.ok(bossCombat.combatRatingV2.breakdown.offenseDps > baseCombat.combatRatingV2.breakdown.offenseDps * 20);
  assert.ok(bossCombat.combatRatingV2.breakdown.effectiveHp > baseCombat.combatRatingV2.breakdown.effectiveHp * 5);
  assert.ok(bossCombat.gear.wingman.base);
  assert.ok(bossCombat.gear.drone.base);
  assert.deepEqual(DEFAULT_CAMPAIGN_DATA.items, { item_start_gun: { baseId: 'gun_laser', rarity: 1, level: 1, type: 'mainGun' } });
});


test('V2.6A combines planet, stage and boss navigation while preserving QA query flags', () => {
  assert.deepEqual(GUEST_BATTLE_QA_PLANET_IDS, [1, 2, 3]);
  assert.equal(GUEST_BATTLE_QA_STAGE_IDS.length, 10);
  assert.deepEqual(GUEST_BATTLE_QA_BOSS_STAGE_IDS, [5, 10]);
  const start = '?sfGuestShip=ship_tank&sfGuestArmor=armor_heavy&sfAbilityDebug=1&sfQaPlanet=1&sfQaStage=4';
  assert.deepEqual(resolveGuestBattleQaSelectionV26A(start), {
    version: 'guest-battle-qa-v2.6a', planetId: 1, stageId: 4,
    planetIndex: 1, planetTotal: 3, stageIndex: 4, stageTotal: 10, isBoss: false,
  });
  const boss = cycleGuestBattleQaSelectionV26A(start, 'boss');
  assert.equal(boss.selection.stageId, 5);
  assert.equal(boss.selection.isBoss, true);
  assert.match(boss.search, /sfGuestShip=ship_tank/);
  assert.match(boss.search, /sfGuestArmor=armor_heavy/);
  assert.match(boss.search, /sfAbilityDebug=1/);
  const gearedBoss = cycleGuestBattleQaSelectionV26A(`${boss.search}&sfQaGear=boss`, 'replay');
  assert.match(gearedBoss.search, /sfQaGear=boss/);
  const nextBoss = cycleGuestBattleQaSelectionV26A(boss.search, 'boss');
  assert.equal(nextBoss.selection.stageId, 10);
  const nextPlanet = cycleGuestBattleQaSelectionV26A('?sfQaPlanet=3&sfQaStage=10', 'next');
  assert.deepEqual([nextPlanet.selection.planetId, nextPlanet.selection.stageId], [1, 1]);
});

test('V2.6A result contract is navigation-only and cannot create reward or profile authority', () => {
  const result = createGuestBattleQaResultV26A({
    outcome: 'victory', planetId: 2, stageId: 10, isBoss: true,
    kills: 34.9, score: 777.8, hp: 1200, maxHp: 1550, durationMs: 65432,
  });
  assert.equal(result.outcome, 'victory');
  assert.equal(result.kills, 34);
  assert.equal(result.score, 777);
  assert.equal(result.rewardsWritten, false);
  assert.equal(result.profileWritten, false);
  assert.equal(result.trustedOutcome, false);
  const next = resolveGuestBattleQaResultActionV26A('?sfQaPlanet=2&sfQaStage=10&sfArmorQa=force-next-projectile', result, 'next');
  assert.deepEqual([next.selection.planetId, next.selection.stageId], [3, 1]);
  assert.match(next.search, /sfArmorQa=force-next-projectile/);
  const exit = resolveGuestBattleQaResultActionV26A(next.search, result, 'exit');
  assert.equal(exit.exit, true);
  const defeat = createGuestBattleQaResultV26A({ outcome: 'defeat', planetId: 1, stageId: 3 });
  const blockedNext = resolveGuestBattleQaResultActionV26A('?sfQaPlanet=1&sfQaStage=3', defeat, 'next');
  assert.equal(blockedNext.selection.stageId, 3);
});

test('V2.6A Campaign wiring keeps QA result/navigation isolated from real progression', () => {
  const engine = fs.readFileSync(path.join(root, 'client/src/components/Campaign/CampaignEngine.jsx'), 'utf8');
  const scene = fs.readFileSync(path.join(root, 'client/src/components/Campaign/CampaignScene.js'), 'utf8');
  const controls = fs.readFileSync(path.join(root, 'client/src/ui-system/GuestAbilityControls.jsx'), 'utf8');
  assert.match(engine, /resolveGuestBattleQaSelectionV26A/);
  assert.match(engine, /resolveGuestBattleQaResultActionV26A/);
  assert.match(engine, /onQaResult:guestAbilityQa/);
  assert.match(engine, /qaResult=\{qaResult\}/);
  assert.match(scene, /createGuestCombatQaBattleDataV26A1\(campaignData/);
  assert.match(scene, /planetId:currentPlanetId/);
  assert.match(scene, /stageId:currentStage/);
  assert.match(scene, /publishGuestBattleQaResult\('victory'\)/);
  assert.match(scene, /publishGuestBattleQaResult\('defeat'\)/);
  assert.match(scene, /if\(guestAbilityQa\)\{[\s\S]*KHÔNG LƯU THƯỞNG[\s\S]*publishGuestBattleQaResult\('victory'\)/);
  assert.match(controls, /P \$\{qaSelection\.planetIndex\}\/\$\{qaSelection\.planetTotal\}/);
  assert.match(controls, /T \$\{qaSelection\.stageIndex\}\/\$\{qaSelection\.stageTotal\}/);
  assert.match(controls, /KHÔNG LƯU DỮ LIỆU/);
  assert.match(controls, /onQaResultAction/);
  assert.doesNotMatch(controls, /saveUserProfile|battle\.finish|recordGuestBattle/);
});

test('Campaign runtime uses the centralized Guest Combat QA build gate', () => {
  const engine = fs.readFileSync(path.join(root, 'client/src/components/Campaign/CampaignEngine.jsx'), 'utf8');
  const scene = fs.readFileSync(path.join(root, 'client/src/components/Campaign/CampaignScene.js'), 'utf8');
  assert.match(engine, /resolveGuestCombatQaRuntimeFromViteEnv\(import\.meta\.env/);
  assert.match(scene, /resolveGuestCombatQaRuntimeFromViteEnv\(import\.meta\.env/);
  assert.match(engine, /cycleGuestCombatQaLoadoutV2/);
  assert.match(scene, /mobileQaLoadout=guestAbilityQa&&import\.meta\.env\.VITE_SF_GUEST_COMBAT_V2_QA/);
  assert.match(scene, /resolveGuestCombatQaLoadoutV2/);
  assert.match(scene, /createGuestCombatQaBattleDataV26A1/);
  assert.match(scene, /equipmentPresetId:requestedEquipmentPreset/);
  assert.doesNotMatch(engine, /guestAbilityQa=import\.meta\.env\.DEV===true/);
  assert.doesNotMatch(scene, /guestAbilitiesQa\)\&\&!isCloud\&\&import\.meta\.env\.DEV===true/);
});

test('Android combat QA uses pointerdown multi-touch controls and keeps S/A persistent', () => {
  const controls = fs.readFileSync(path.join(root, 'client/src/ui-system/GuestAbilityControls.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'client/src/ui-system/GuestAbilityControls.module.css'), 'utf8');
  assert.match(controls, /onPointerDown=\{event => \{/);
  assert.match(controls, /event\.preventDefault\(\)/);
  assert.match(controls, /event\.detail === 0/);
  assert.doesNotMatch(controls, /if \(!enabled \|\| activationGate\?\.canActivate !== false\) return null/);
  assert.match(controls, /data-qa-battle-phase/);
  assert.match(controls, /E \$\{current\.equipmentPresetIndex\}\/\$\{current\.equipmentPresetTotal\}/);
  assert.match(controls, /onQaCycle, 'equipment'/);
  assert.match(css, /\.action\{[\s\S]*touch-action:none/);
  assert.match(css, /\.qaSwitcher button\{[\s\S]*touch-action:none/);
});
