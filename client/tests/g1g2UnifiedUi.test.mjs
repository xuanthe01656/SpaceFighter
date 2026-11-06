import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('G1: one CSS/SVG game UI system is imported from both gameplay lanes and resource screens',()=>{
  const paths=['src/components/Campaign/CampaignEngine.jsx','src/components/C15LocalAlpha1/index.jsx',
    'src/components/ResourceDownloads/StartupResourceGate.jsx','src/components/ResourceDownloads/ResourceManagerScreen.jsx'];
  for(const name of paths)assert.match(read(name),/ui-system\/(GameButton|GamePanel|BattleHud)/,name);
  assert.match(read('src/components/Campaign/CampaignEngine.jsx'),/<BattleHud/);
  assert.match(read('src/components/C15LocalAlpha1/index.jsx'),/<BattleHud/);
  assert.match(read('src/ui-system/BattleHud.module.css'),/pointer-events:none/);
  assert.match(read('src/ui-system/GameButton.module.css'),/min-height:var\(--sf-ui-touch-target\)/);
  for(const color of ['--sf-ui-accent','--sf-ui-panel','--sf-ui-stroke'])
    assert.ok(read('src/ui-system/GameUiTokens.css').includes(color));
});

test('G1/G2: Guest HUD is read-only and the original Babylon gameplay data remain authoritative',()=>{
  const scene=read('src/components/Campaign/CampaignScene.js');
  assert.match(scene,/onHudUpdate\(/);
  assert.match(scene,/lastHudPublishAt<100/);
  assert.match(scene,/bossPanel\.isVisible = !externalHud/);
  assert.match(scene,/topBar\.isVisible=!externalHud/);
  assert.match(scene,/recordGuestBattle/);
  assert.match(scene,/createShipInputController/);
  const c15=read('src/components/C15LocalAlpha1/C15LocalRenderer.js');
  assert.match(c15,/createC15VisualViewportV1/);
  assert.match(c15,/viewport\.project/);
  assert.match(c15,/viewport\.unproject/);
  assert.match(read('src/components/C15LocalAlpha1/index.jsx'),/arenaVisualBounds:\{arenaHalfWidth:controlConfig\.arenaHalfWidth/);
  assert.match(c15,/createPlayerShipVisual/);
  assert.doesNotMatch(c15,/wallet|claimSettlement|awardCoins|calculateDamage|setHp/);
});

test('G1: CSS panels and buttons do not bring a new runtime UI engine or remote artwork',()=>{
  const components=['GameButton.jsx','GamePanel.jsx','BattleHud.jsx'];
  for(const component of components){
    const src=read(`src/ui-system/${component}`);
    assert.doesNotMatch(src,/phaser|pixi|three|@radix|\bfetch\(|http:\/\/|https:\/\//);
  }
  assert.match(read('src/components/ResourceDownloads/ResourceDownloads.module.css'),/--sf-ui-accent/);
  assert.doesNotMatch(read('src/components/ResourceDownloads/ResourceDownloads.module.css'),/^\.btn\{/m);
});
