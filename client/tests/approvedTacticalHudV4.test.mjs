import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('HUD notch revision: center top is physically open, not a fake black island', () => {
  const jsx=read('src/ui-system/BattleHud.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  assert.match(jsx,/function CommandFrame\(\)/);
  assert.match(jsx,/viewBox="0 0 400 142"/);
  assert.match(jsx,/Two independent top shoulders/);
  assert.match(jsx,/styles\.cutoutClearance/);
  assert.match(css,/36\.5% 33%,63\.5% 33%/);
  assert.match(css,/\.cutoutClearance\{[^}]*background:transparent/);
  assert.doesNotMatch(jsx,/M144 15 Q149/);
  assert.doesNotMatch(css,/background-image:\s*url\(/);
  assert.match(css,/safe-area-inset-left/);
  assert.match(css,/safe-area-inset-right/);
});

test('HUD shows real kills left, real wave right, shield below notch and stage metadata', () => {
  const jsx=read('src/ui-system/BattleHud.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  const left=jsx.indexOf('styles.leftPod');
  const right=jsx.indexOf('styles.rightPod');
  const middle=jsx.indexOf('styles.shieldCenter');
  assert(left>0&&right>left&&middle>right);
  assert.match(jsx,/metricValue = integer\(kills\)/);
  assert.match(jsx,/styles\.shieldHeading/);
  assert.match(jsx,/styles\.missionSubtitle/);
  assert.match(jsx,/length:10/);
  assert.match(jsx,/ratio \* 10 - i/);
  assert.match(jsx,/aria-valuenow=\{Math\.round\(ratio \* 100\)\}/);
  assert.match(css,/\.shieldCenter\{/);
  assert.match(css,/\.shieldSegments\{[^}]*repeat\(10/);
});

test('Back action remains accessible and HUD decoration never eats gameplay touches', () => {
  const jsx=read('src/ui-system/BattleHud.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  assert.match(jsx,/onClick=\{onRetreat\}/);
  assert.match(jsx,/disabled=\{retreating\}/);
  assert.match(jsx,/aria-label=\{vi \? 'Rút lui khỏi trận'/);
  assert.match(css,/\.hud\s*\{[^}]*pointer-events:none/);
  assert.match(css,/\.retreatAction\{[^}]*pointer-events:auto/);
  assert.match(css,/touch-action:manipulation/);
});

test('Display-only HUD never reads or mutates economy, verification or game rules', () => {
  const jsx=read('src/ui-system/BattleHud.jsx');
  assert.doesNotMatch(jsx,/\bfetch\(|gameAction\(|localStorage|Firebase|Firestore|claimReward\(/i);
  assert.doesNotMatch(jsx,/ĐÃ XÁC MINH|SERVER VERIFIED/);
  assert.doesNotMatch(jsx,/score\s*=/);
});
