import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../src/ui-system/BattleHud.module.css',import.meta.url),'utf8');
const jsx=fs.readFileSync(new URL('../src/ui-system/BattleHud.jsx',import.meta.url),'utf8');
test('F12/Coarse pointer HUD has no artificial 28px or 44px top spacer',()=>{
  assert.match(css,/top:calc\(max\(var\(--sf-ui-safe-top, 0px\), var\(--sf-ui-hud-top-guard, 2px\)\) \+ 1px\)/);
  assert.match(css,/@media\(pointer:coarse\)\{\.hud\{--sf-ui-hud-top-guard:2px\}\}/);
  assert.doesNotMatch(css,/--sf-ui-hud-top-guard:(28|44)px/);
});
test('HUD still respects native safe area, notch void and touch pass-through',()=>{
  assert.match(css,/--sf-ui-safe-top/);
  assert.match(css,/safe-area-inset-left/);
  assert.match(css,/safe-area-inset-right/);
  assert.match(css,/\.cutoutClearance\{[^}]*background:transparent/);
  assert.match(css,/\.hud\s*\{[^}]*pointer-events:none/);
  assert.match(css,/\.retreatAction\{[^}]*pointer-events:auto/);
  assert.match(jsx,/styles\.leftPod/);
  assert.match(jsx,/styles\.rightPod/);
  assert.match(jsx,/styles\.shieldCenter/);
  assert.match(jsx,/styles\.cutoutClearance/);
  assert.match(jsx,/onClick=\{onRetreat\}/);
});
