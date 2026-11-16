import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const hudJsx = read('client/src/ui-system/TacticalCombatHudV411.jsx');
const hudCss = read('client/src/ui-system/TacticalCombatHudV411.module.css');
const abilityJsx = read('client/src/ui-system/TacticalAbilityClusterV411.jsx');
const abilityCss = read('client/src/ui-system/TacticalAbilityClusterV411.module.css');

const runtimeAssets = [
  'sf_status_shell_compact__campaign.webp',
  'sf_status_shell_compact__dungeon.webp',
  'sf_status_shell_boss__boss.webp',
  'sf_cyan_hex_05.webp',
  'sf_cyan_hex_06.webp',
  'sf_alert_panel_h_01.webp',
  'sf_dungeon_lime_panel_09.webp',
  'sf_ornament_01__cyan.webp',
  'sf_ornament_01__lime.webp',
];

test('V4.2.5 renders high-density HUD art as direct image elements', () => {
  assert.match(hudJsx, /TACTICAL_HUD_ASSET_VISIBILITY_VERSION_V425/);
  assert.match(hudJsx, /assets\/hud\/v425/);
  assert.match(hudJsx, /className=\{styles\.podArt\}/);
  assert.match(hudJsx, /className=\{styles\.badgeArt\}/);
  assert.match(hudJsx, /className=\{styles\.bossArt\}/);
  assert.match(hudJsx, /className=\{styles\.ornamentArt\}/);
  assert.doesNotMatch(hudCss, /\.hud\s*\{[^}]*filter:\s*drop-shadow/s);
  assert.doesNotMatch(hudCss, /z-index:\s*-1/);
  assert.match(hudCss, /\.hud\[data-asset-skin="v425"\]\s+\.frameArt\s*\{\s*display:\s*none/);
  assert.match(hudCss, /object-fit:\s*fill/);
});

test('V4.2.5 keeps skill and armor art sharp without filtering the whole cluster', () => {
  assert.match(abilityJsx, /TACTICAL_ABILITY_ART_VERSION_V425/);
  assert.match(abilityJsx, /assets\/hud\/v425/);
  assert.match(abilityJsx, /<img className=\{styles\.artFrameActive\}/);
  assert.match(abilityJsx, /<img className=\{styles\.artFramePassive\}/);
  assert.match(abilityJsx, /onPointerDown=\{activatePointer\}/);
  assert.doesNotMatch(abilityCss, /\.root\s*\{[^}]*filter:\s*drop-shadow/s);
  assert.match(abilityCss, /\.root\[data-asset-skin="v425"\]/);
  assert.match(abilityCss, /object-fit:\s*contain/);
});

test('all reviewed 2x runtime art files exist and are materially larger than placeholder assets', () => {
  const assetRoot = path.join(root, 'client/public/assets/hud/v425');
  for (const name of runtimeAssets) {
    const file = path.join(assetRoot, name);
    assert.equal(fs.existsSync(file), true, `missing ${name}`);
    assert.ok(fs.statSync(file).size > 10_000, `${name} should be a real high-density asset`);
  }
});
