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
  GUEST_COMBAT_QA_SHIP_IDS,
  cycleGuestCombatQaLoadoutV2,
  resolveGuestCombatQaLoadoutV2,
} from '../src/game/combat/GuestCombatQaLoadoutV2.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const mobileQa = overrides => ({
  guestAbilitiesQa: true,
  mobileQaBuild: true,
  nativeTouchQa: true,
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
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ nativeTouchQa: '1', mobileQaBuild: 'true' })), true);
});

test('release, Cloud, authenticated and Game API builds cannot enable Guest Combat V2', () => {
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ buildChannel: 'release-candidate' })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ gameApiEnabled: true })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ authenticated: true })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ cloudBattle: true })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ mobileQaBuild: false })), false);
  assert.equal(isGuestCombatQaRuntimeEnabled(mobileQa({ nativeTouchQa: false })), false);
});

test('Vite environment adapter applies the same explicit mobile QA contract', () => {
  const env = {
    DEV: false,
    VITE_SF_GUEST_ABILITIES_QA: 'true',
    VITE_SF_GUEST_COMBAT_V2_QA: 'true',
    VITE_SF_NATIVE_TOUCH_QA: '1',
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
});


test('mobile QA loadout switcher covers all 16 ships and seven armors without losing other query flags', () => {
  assert.equal(GUEST_COMBAT_QA_SHIP_IDS.length, 16);
  assert.equal(GUEST_COMBAT_QA_ARMOR_IDS.length, 7);
  assert.deepEqual(resolveGuestCombatQaLoadoutV2(''), {
    shipId: 'ship_xwing',
    armorId: 'armor_light',
  });
  const ship = cycleGuestCombatQaLoadoutV2('?sfAbilityDebug=1&sfArmorQa=force-next-projectile', 'ship');
  assert.equal(ship.value, 'ship_scout');
  assert.match(ship.search, /sfAbilityDebug=1/);
  assert.match(ship.search, /sfArmorQa=force-next-projectile/);
  const armor = cycleGuestCombatQaLoadoutV2(ship.search, 'armor');
  assert.equal(armor.value, 'armor_heavy');
});

test('Campaign runtime uses the centralized Guest Combat QA build gate', () => {
  const engine = fs.readFileSync(path.join(root, 'client/src/components/Campaign/CampaignEngine.jsx'), 'utf8');
  const scene = fs.readFileSync(path.join(root, 'client/src/components/Campaign/CampaignScene.js'), 'utf8');
  assert.match(engine, /resolveGuestCombatQaRuntimeFromViteEnv\(import\.meta\.env/);
  assert.match(scene, /resolveGuestCombatQaRuntimeFromViteEnv\(import\.meta\.env/);
  assert.match(engine, /cycleGuestCombatQaLoadoutV2/);
  assert.match(scene, /mobileQaLoadout=guestAbilityQa&&import\.meta\.env\.VITE_SF_GUEST_COMBAT_V2_QA/);
  assert.match(scene, /resolveGuestCombatQaLoadoutV2/);
  assert.doesNotMatch(engine, /guestAbilityQa=import\.meta\.env\.DEV===true/);
  assert.doesNotMatch(scene, /guestAbilitiesQa\)\&\&!isCloud\&\&import\.meta\.env\.DEV===true/);
});
