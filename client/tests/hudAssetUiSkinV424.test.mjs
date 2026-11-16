import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createHudAssetToastOptionsV424 } from '../src/ui-system/HudAssetToastV424.js';

const client = dirname(dirname(fileURLToPath(import.meta.url)));
const source = (name) => readFileSync(join(client, 'src', name), 'utf8');
const publicAsset = (name) => join(client, 'public/assets/hud/v424', name);

test('V4.2.4R1 keeps the reversible non-combat asset skin wiring', () => {
  const app = source('App.jsx');
  assert.match(app, /data-sf-ui-skin=\{hudAssetSkinV424Enabled\s*\?\s*'hud-v2'\s*:\s*'legacy'\}/);
  assert.match(app, /data-sf-ui-screen=\{screen\}/);
  assert.match(app, /VITE_SF_UI_ASSET_SKIN_V424\s*!==\s*'false'/);
  assert.match(app, /createHudAssetToastOptionsV424\(hudAssetSkinV424Enabled\)/);
});

test('V4.2.4R1 stylesheet still imports after legacy CSS', () => {
  const main = source('main.jsx');
  assert.ok(main.indexOf("import './index.css'") < main.indexOf("import './ui-system/HudAssetSkinV424.css'"));
});

test('Asset audit rollback never repurposes panels or icons as buttons', () => {
  const css = source('ui-system/HudAssetSkinV424.css');
  const gameButton = source('ui-system/GameButton.module.css');
  assert.doesNotMatch(css, /button:is\(/);
  assert.doesNotMatch(css, /button\s*\{/);
  assert.doesNotMatch(css, /sf_alert_panel_h_02/);
  assert.doesNotMatch(css, /sf_cyan_hex_04/);
  assert.doesNotMatch(gameButton, /\/assets\/hud\/v424\//);
  assert.match(gameButton, /background:linear-gradient\(120deg,rgba\(17,69,91/);
  assert.match(gameButton, /\.primary\{background:linear-gradient/);
});

test('Panels, headings, labels and badges retain supported non-button assets', () => {
  const css = source('ui-system/HudAssetSkinV424.css');
  assert.match(css, /sf_ornament_01__cyan\.webp/);
  assert.match(css, /sf_purple_notice_card_01\.webp/);
  assert.match(css, /sf_cyan_panel_rect_03\.webp/);
  assert.match(source('ui-system/GamePanel.module.css'), /sf_cyan_panel_rect_03\.webp/);
  assert.match(source('ui-system/GamePanel.module.css'), /border-image-slice:65 fill/);
});

test('Toast status variants keep semantic alert artwork and legacy fallback', () => {
  const legacy = createHudAssetToastOptionsV424(false);
  const theme = createHudAssetToastOptionsV424(true);
  assert.equal(legacy.duration, 3000);
  assert.equal(theme.duration, legacy.duration);
  assert.match(theme.style.backgroundImage, /sf_alert_panel_h_01.webp/);
  assert.match(theme.error.style.backgroundImage, /__red.webp/);
  assert.match(theme.loading.style.backgroundImage, /__amber.webp/);
  assert.ok(theme.error.iconTheme);
});

test('Only assets still used by the corrected UI skin are required', () => {
  const names = [
    'sf_alert_panel_h_01.webp','sf_alert_panel_h_01__amber.webp','sf_alert_panel_h_01__red.webp',
    'sf_cyan_panel_rect_03.webp','sf_purple_main_frame.webp',
    'sf_purple_notice_card_01.webp','sf_ornament_01__cyan.webp',
  ];
  for (const name of names) {
    assert.equal(existsSync(publicAsset(name)), true, `missing ${name}`);
    const data = readFileSync(publicAsset(name));
    assert.ok(data.length > 2000, name);
    assert.equal(createHash('sha256').update(data).digest('hex').length, 64);
  }
  assert.match(readFileSync(publicAsset('THIRD_PARTY_ATTRIBUTION_V424.txt'), 'utf8'), /designed by/i);
});

test('Corrected skin stays presentation-only and does not alter input ownership', () => {
  const css = source('ui-system/HudAssetSkinV424.css');
  assert.doesNotMatch(css, /touch-action/i);
  assert.doesNotMatch(css, /pointer-events/i);
  assert.doesNotMatch(css, /z-index\s*:/i);
});
