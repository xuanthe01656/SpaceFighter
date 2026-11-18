import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442,
  COMMAND_HANGAR_SHIP_IDS_V442,
  COMMAND_HANGAR_VERSION_V442,
  COMMAND_HANGAR_WEAPON_IDS_V442,
  auditCommandHangarAssetPolicyV442,
  resolveCommandHangarCdnDescriptorV442,
  resolveCommandHangarShipPreviewV442,
  resolveCommandHangarWeaponPreviewV442,
} from '../src/game/assets/CommandHangarAssetPolicyV442.js';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const listFiles = relative => fs.readdirSync(path.join(root, relative), { withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => entry.name);

const totalBytes = relativePaths => relativePaths.reduce((sum, relative) => (
  sum + fs.statSync(path.join(root, relative)).size
), 0);

test('V4.4.2 Command Hangar asset policy is local-first and CDN-optional', () => {
  assert.equal(COMMAND_HANGAR_VERSION_V442, 'command-hangar-v4.4.2');
  assert.equal(COMMAND_HANGAR_SHIP_IDS_V442.length, 16);
  assert.equal(COMMAND_HANGAR_WEAPON_IDS_V442.length, 18);
  assert.deepEqual(auditCommandHangarAssetPolicyV442(), []);
  assert.equal(COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.enabledByDefault, false);
  assert.equal(COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.localFallback, 'bundled_webp');
  assert.equal(COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.loadDuringCombat, false);
  assert.match(resolveCommandHangarShipPreviewV442('ship_nova'), /ship_nova\.webp$/);
  assert.match(resolveCommandHangarWeaponPreviewV442('gun_laser'), /gun_laser\.webp$/);
  assert.equal(resolveCommandHangarShipPreviewV442('../bad', 'fallback'), 'fallback');
  assert.equal(resolveCommandHangarCdnDescriptorV442('ship', 'bad-id'), null);
  assert.equal(resolveCommandHangarCdnDescriptorV442('ship', 'ship_xwing')?.required, false);
});

test('V4.4.2 local Hangar payload contains exact lightweight preview inventories and no GLB', () => {
  const ships = listFiles('public/images/hangar/ships');
  const weapons = listFiles('public/images/hangar/weapons');
  const buttons = listFiles('public/assets/ui/spacefighter-hud-v3/neo_buttons');
  const panels = listFiles('public/assets/ui/spacefighter-hud-v3/neo_panels');
  const ranks = listFiles('public/assets/ui/spacefighter-hud-v3/rank_badges');
  assert.equal(ships.filter(name => name.endsWith('.webp')).length, 16);
  assert.equal(weapons.filter(name => name.endsWith('.webp')).length, 18);
  assert.equal(buttons.filter(name => name.endsWith('.webp')).length, 12);
  assert.equal(panels.filter(name => name.endsWith('.webp')).length, 3);
  assert.equal(ranks.filter(name => name.endsWith('.webp')).length, 18);
  const all = [
    ...ships.map(name => `public/images/hangar/ships/${name}`),
    ...weapons.map(name => `public/images/hangar/weapons/${name}`),
    ...buttons.map(name => `public/assets/ui/spacefighter-hud-v3/neo_buttons/${name}`),
    ...panels.map(name => `public/assets/ui/spacefighter-hud-v3/neo_panels/${name}`),
    ...ranks.map(name => `public/assets/ui/spacefighter-hud-v3/rank_badges/${name}`),
  ];
  assert.equal(all.some(name => name.endsWith('.glb')), false);
  assert.ok(all.every(relative => fs.statSync(path.join(root, relative)).size > 0), 'every local Hangar asset must be non-empty');
  assert.ok(totalBytes(all) < 3 * 1024 * 1024, 'local Hangar payload must stay below 3 MiB');
});

test('V446_STRUCTURAL_SUPERSESSION: Headquarters is single-source in a four-button management dock', () => {
  const portal = read('src/components/CampaignPortal/index.jsx');
  const css = read('src/components/CampaignPortal/CampaignPortal.module.css');
  assert.equal((portal.match(/data-sf-hq-entry-v446=/g)||[]).length,1);
  assert.doesNotMatch(portal, /data-sf-hq-entry-v44[234]=/);
  assert.match(portal, /openManagementHqV444/);
  assert.match(portal, /handleNav\('galaxy_map'\)/);
  assert.match(portal, /handleNav\('dungeon_select'\)/);
  assert.match(css, /V4\.4\.6 STRUCTURAL FLIGHT HUB/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);
});

test('HQ delegates presentation to Command Hangar while preserving launch and inventory authority', () => {
  const hq = read('src/components/HQ/index.jsx');
  assert.match(hq, /import CommandHangarV442 from '\.\/CommandHangarV442\.jsx'/);
  assert.match(hq, /commandHangarEnabledV442/);
  assert.match(hq, /slotOverride\s*=\s*selectingSlot/);
  assert.match(hq, /handleEquipFromPopup\(id, 'aircraft'\)/);
  assert.match(hq, /gameAction\('battle\.start'/);
  assert.match(hq, /gameAction\('battle\.abandon'/);
  assert.match(hq, /pendingEnergyCost/);
  assert.match(hq, /saveUserProfile/);
});

test('Command Hangar stays presentation-only and retains the existing loadout slots', () => {
  const component = read('src/components/HQ/CommandHangarV442.jsx');
  const css = read('src/components/HQ/CommandHangarV442.module.css');
  for (const slot of ['mainGun', 'wingman', 'armor', 'drone', 'pilot', 'skill']) {
    assert.match(component, new RegExp(`slot="${slot}"`));
  }
  assert.match(component, /exactly one manual ship skill/i);
  assert.doesNotMatch(component, /battle\.start|battle\.finish|inventory\.equip|firebase|gameAction\(/i);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /sf_neo_panel_side__campaign\.webp/);
  assert.match(css, /sf_neo_button_01__campaign_normal\.webp/);
});

test('Package build gate includes Command Hangar validation', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:ui-v442'], 'node --test tests/commandHangarV442.test.mjs');
  assert.match(pkg.scripts.prebuild, /check:ui-v442/);
});
