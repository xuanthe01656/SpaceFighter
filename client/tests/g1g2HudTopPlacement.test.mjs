import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../src/ui-system/BattleHud.module.css',import.meta.url),'utf8');
const jsx=fs.readFileSync(new URL('../src/ui-system/BattleHud.jsx',import.meta.url),'utf8');

function hudBlock(){
  const match=css.match(/\.hud\s*\{([^}]*)\}/);
  assert.ok(match,'Battle HUD block must exist');
  return match[1];
}

test('immersive Battle HUD uses one native top anchor and no cosmetic spacer',()=>{
  const hud=hudBlock();
  assert.match(hud,/position:fixed/);
  assert.match(hud,/z-index:70/);
  assert.match(hud,/top:var\(--sf-native-battle-hud-top, var\(--sf-ui-safe-top, env\(safe-area-inset-top, 0px\)\)\)/);
  assert.match(hud,/margin-top:0/);
  assert.match(hud,/padding-top:0/);
  assert.match(hud,/transform:none/);
  assert.doesNotMatch(css,/--sf-ui-hud-top-guard/);
  assert.doesNotMatch(css,/top:calc\(max\(var\(--sf-ui-safe-top/);
  assert.doesNotMatch(css,/\.hud\s*\{[^}]*top:max\(5px,env\(safe-area-inset-top/);
  assert.doesNotMatch(css,/--sf-ui-hud-top-guard:(?:28|44)px/);
});

test('HUD keeps the physical centre cutout and side-safe controls',()=>{
  assert.match(css,/safe-area-inset-left/);
  assert.match(css,/safe-area-inset-right/);
  assert.match(css,/\.cutoutClearance\{[^}]*left:36%;right:36%;top:0;height:34%;background:transparent/);
  assert.match(css,/\.hud\s*\{[^}]*pointer-events:none/);
  assert.match(css,/\.retreatAction\{[^}]*pointer-events:auto/);
  assert.match(jsx,/styles\.leftPod/);
  assert.match(jsx,/styles\.rightPod/);
  assert.match(jsx,/styles\.shieldCenter/);
  assert.match(jsx,/styles\.cutoutClearance/);
  assert.match(jsx,/onClick=\{onRetreat\}/);
});

test('360, 393 and tablet layouts do not introduce width-based top offsets',()=>{
  for(const forbidden of [
    /@media[^\{]*(?:360|393|768)[^\{]*\{[^}]*top:/,
    /@media\(pointer:coarse\)\{\.hud\{[^}]*top:/,
    /@media\(pointer:coarse\)[^\{]*\{\.hud\{[^}]*--sf-ui-hud-top-guard:/,
  ]) assert.doesNotMatch(css,forbidden);
  assert.match(css,/@media\(max-width:359px\)\{/);
  assert.match(css,/@media\(orientation:landscape\) and \(max-height:560px\)\{/);
});
