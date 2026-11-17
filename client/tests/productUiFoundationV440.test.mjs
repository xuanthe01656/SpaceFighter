import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const UI_FILES = [
  'src/ui-system/ProductUiFoundationV440.js',
  'src/ui-system/ProductUiFoundationV440.css',
  'src/ui-system/ProductScreenShell.jsx',
  'src/ui-system/ProductScreenShell.module.css',
  'src/ui-system/ProductStateScreen.jsx',
  'src/ui-system/ProductStateScreen.module.css',
  'src/ui-system/ProductScreenHeader.jsx',
  'src/ui-system/ProductScreenHeader.module.css',
  'src/ui-system/GameIconRegistry.jsx',
  'src/ui-system/StatusBadge.jsx',
  'src/ui-system/StatusBadge.module.css',
];

test('V4.4A product screen policy is immutable and audit-clean', async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'src/ui-system/ProductUiFoundationV440.js')).href;
  const ui = await import(`${moduleUrl}?test=${Date.now()}`);
  assert.equal(ui.PRODUCT_UI_FOUNDATION_VERSION_V440, 'product-ui-foundation-v4.4a');
  assert.deepEqual(ui.auditProductUiFoundationV440(), []);
  assert.equal(ui.resolveProductScreenPolicyV440('campaign').scroll, 'locked');
  assert.equal(ui.resolveProductScreenPolicyV440('dungeon').kind, 'battle');
  assert.equal(ui.resolveProductScreenPolicyV440('portal').kind, 'auth');
  assert.equal(ui.resolveProductScreenPolicyV440('unknown').kind, 'workspace');
});

test('App uses the shared product shell and actionable state screens', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import ProductScreenShell from '\.\/ui-system\/ProductScreenShell\.jsx';/);
  assert.match(app, /import ProductStateScreen from '\.\/ui-system\/ProductStateScreen\.jsx';/);
  assert.match(app, /<ProductScreenShell[\s\S]*screen=\{screen\}[\s\S]*uiSkin=/);
  assert.match(app, /data-sf-ui-skin=\{hudAssetSkinV424Enabled \? 'hud-v2' : 'legacy'\}/);
  assert.match(app, /data-sf-ui-screen=\{screen\}/);
  assert.match(app, /<ProductStateScreen[\s\S]*state="loading"/);
  assert.match(app, /<ProductStateScreen[\s\S]*state="error"/);
  assert.match(app, /<ProductStateScreen[\s\S]*state="disabled"/);
  assert.doesNotMatch(app, /fontFamily:\s*["'].*VT323/);
  assert.doesNotMatch(app, /backgroundColor:\s*'#0d0e15'/);
});

test('shared primitives expose stable non-breaking presentation states', () => {
  const button = read('src/ui-system/GameButton.jsx');
  const panel = read('src/ui-system/GamePanel.jsx');
  const shell = read('src/ui-system/ProductScreenShell.jsx');
  assert.match(button, /busy = false/);
  assert.match(button, /selected = false/);
  assert.match(button, /leadingIcon = null/);
  assert.match(button, /disabled=\{isDisabled\}/);
  assert.match(panel, /tone = 'default'/);
  assert.match(panel, /dangerTone/);
  assert.match(shell, /\.\.\.rootProps/);
  assert.match(shell, /\{\.\.\.rootProps\}/);
});

test('foundation CSS is offline-safe and has no remote font or stylesheet dependency', () => {
  const files = [
    'src/ui-system/GameUiTokens.css',
    'src/ui-system/ProductUiFoundationV440.css',
    'src/ui-system/ProductScreenShell.module.css',
    'src/ui-system/ProductStateScreen.module.css',
    'src/ui-system/ProductScreenHeader.module.css',
    'src/ui-system/StatusBadge.module.css',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /@import\s+url/i, `${file} must not import a remote stylesheet`);
    assert.doesNotMatch(source, /https?:\/\//i, `${file} must not fetch runtime CSS/font assets`);
  }
  const tokens = read('src/ui-system/GameUiTokens.css');
  assert.match(tokens, /--sf-product-title-font:/);
  assert.match(tokens, /--sf-product-body-font:/);
  assert.match(tokens, /--sf-ui-safe-right:/);
  assert.match(tokens, /--sf-ui-safe-left:/);
});

test('UI foundation remains presentation-only', () => {
  const forbidden = /battle\.start|battle\.finish|battle\.abandon|saveUserProfile|gameAction|trustedWrites|rewardMode|consumeEnergy|firebase|firestore/i;
  for (const file of UI_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, forbidden, `${file} must not own gameplay/economy/authority`);
  }
});

test('entry point and package gates include V4.4A foundation', () => {
  const main = read('src/main.jsx');
  const pkg = JSON.parse(read('package.json'));
  assert.match(main, /import '\.\/ui-system\/GameUiTokens\.css';/);
  assert.match(main, /import '\.\/ui-system\/ProductUiFoundationV440\.css';/);
  assert.equal(pkg.scripts['check:ui-v440'], 'node --test tests/productUiFoundationV440.test.mjs');
  assert.match(pkg.scripts.prebuild, /check:ui-v440/);
});
