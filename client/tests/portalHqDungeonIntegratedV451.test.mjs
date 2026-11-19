import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// V4.5.1: read-only integration regression contract.
// It does not mock results, authorize rewards, or change gameplay.
const client = process.cwd();
const repo = path.resolve(client, '..');
const readClient = rel => fs.readFileSync(path.join(client, rel), 'utf8');
const readRepo = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

const portal = readClient('src/components/CampaignPortal/index.jsx');
const portalCss = readClient('src/components/CampaignPortal/CampaignPortal.module.css');
const hq = readClient('src/components/HQ/CommandHangarV444.jsx');
const hqCss = readClient('src/components/HQ/CommandHangarV444.module.css');
const dungeon = readClient('src/components/Dungeon/DungeonEngine.jsx');
const app = readClient('src/App.jsx');
const android = readRepo('.github/workflows/android-native-smoke.yml');

test('V451 Portal two-tier player header and five real resources survive APK integration', () => {
  assert.equal((portal.match(/data-sf-portal-header-v4411="two-tier"/g) || []).length, 1);
  assert.equal((portal.match(/className=\{styles\.currencyLabel\}/g) || []).length, 5);
  for (const id of ['energy', 'coins', 'diamonds', 'blueprints', 'gear']) {
    assert.ok(portal.includes(`formatCompactNumber(${id})`), id);
  }
  assert.match(portalCss, /repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
});

test('V451 Portal retains both real battle entrances and one HQ dock route', () => {
  for (const path of ["handleNav('galaxy_map')", "handleNav('dungeon_select')", "handleNav('inventory')", "handleNav('pilots')", "handleNav('shop_campaign')"]) {
    assert.ok(portal.includes(path), path);
  }
  assert.equal((portal.match(/data-sf-hq-entry-v446=/g) || []).length, 1);
  assert.match(app, /const DungeonEngine = lazy\(loadDungeonEngine\)/);
  assert.match(app, /const HQ = lazy\(/);
});

test('V451 HQ retains all six slots, removes unused wallet and keeps complete ship thumbnails', () => {
  assert.equal((hq.match(/data-sf-hq-header-v4412="no-wallet"/g) || []).length, 1);
  assert.doesNotMatch(hq, /className=\{styles\.wallet\}/);
  for (const id of ['mainGun', 'wingman', 'armor', 'drone', 'pilot', 'skill']) {
    assert.ok(hq.includes(`slot="${id}"`), id);
  }
  for (const marker of ['onEquipItem', 'onUnequipItem', 'onSelectAircraft', 'onLaunch', 'onBack']) {
    assert.ok(hq.includes(marker), marker);
  }
  for (const selector of ['selectorPreview > img', 'fleetPreview > img', 'appearancePreview > img']) {
    assert.ok(hqCss.includes(selector), selector);
  }
  assert.ok((hqCss.match(/object-fit:\s*contain/g) || []).length >= 3);
});

test('V451 HQ WebP CTA content alignment is visual only and no extra wallet is introduced', () => {
  assert.match(hqCss, /--sf-hq-cta-art-x:\s*clamp\(4px,\s*1\.4vw,\s*9px\)/);
  assert.match(hqCss, /--sf-hq-cta-art-y:\s*clamp\(5px,\s*\.85dvh,\s*9px\)/);
  assert.match(hqCss, /translate\(var\(--sf-hq-cta-art-x\),\s*var\(--sf-hq-cta-art-y\)\)/);
  assert.match(hqCss, /sf_neo_button_01__campaign_normal\.webp/);
  assert.match(hqCss, /sf_neo_button_03__campaign_normal\.webp/);
});

test('V451 Dungeon runtime still uses V450 frame guard after the UI promotion', () => {
  assert.match(dungeon, /createDungeonRuntimeMonitorV450/);
  assert.match(dungeon, /renderDungeonFrameV450/);
  assert.match(dungeon, /DUNGEON_RUNTIME_STALL_V450/);
  assert.match(dungeon, /webglcontextlost/);
  assert.match(dungeon, /engine\.runRenderLoop\(renderDungeonFrameV450\)/);
  assert.doesNotMatch(dungeon, /\[gsRef, lang, setScreen, saveUserProfile, gameAction, getRealTime\]/);
});

test('V451 Unified Android QA is manual, local-only and produces APK not AAB', () => {
  assert.match(android, /workflow_dispatch:/);
  assert.match(android, /unified_campaign_dungeon_qa:/);
  assert.match(android, /VITE_SF_UNIFIED_CAMPAIGN_DUNGEON_QA:/);
  assert.match(android, /VITE_SF_DUNGEON_QA_REWARDS:\s*'false'/);
  assert.match(android, /VITE_GAME_API_ENABLED:\s*'false'/);
  assert.match(android, /:app:assembleDebug/);
  assert.match(android, /client\/android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.doesNotMatch(android, /:app:bundleDebug\b/);
  assert.doesNotMatch(android, /outputs\/bundle\/debug\/|app-debug\.aab/);
});

test('V451 previous Portal, HQ, Dungeon regression files are all present', () => {
  for (const rel of [
    'tests/portalGlassBalanceV449.test.mjs',
    'tests/portalHangarVisualV4410.test.mjs',
    'tests/portalHeaderShipPreviewV4411.test.mjs',
    'tests/hqHeaderCtaAdaptiveV4412R2.test.mjs',
    'tests/dungeonRuntimeReliabilityV450.test.mjs',
  ]) assert.ok(fs.existsSync(path.join(client, rel)), rel);
});
