import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AIRCRAFTS } from '../src/constants.js';
import { resolveShipVisual } from '../src/game/rendering/ShipVisualCatalog.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('all 16 ships keep one nose-up combat orientation contract',()=>{
  assert.equal(AIRCRAFTS.length,16);
  for(const aircraft of AIRCRAFTS){
    const visual=resolveShipVisual(aircraft.id,AIRCRAFTS);
    assert.equal(visual.spriteInvertY,true,aircraft.id);
    assert.ok(['model','sprite','procedural'].includes(visual.runtimeMode));
  }
});

test('legacy mobile drag uses fixed pointer gain while keyboard retains ship speed',()=>{
  const input=read('src/game/combat/ShipInputController.js');
  const campaign=read('src/components/Campaign/CampaignScene.js');
  const dungeon=read('src/components/Dungeon/DungeonScene.js');
  assert.match(input,/pointerSpeedMultiplier\s*=\s*1/);
  assert.match(input,/aspect\(\), pointerSpeedMultiplier\)/);
  assert.match(input,/keyboardUnitsPerFrame \* clamp\(Number\(speedMultiplier\)/);
  assert.match(campaign,/pointerSpeedMultiplier:\s*1/);
  assert.match(dungeon,/pointerSpeedMultiplier:\s*1/);
});

test('Campaign HUD is viewport-fixed and native Android reasserts immersive bars',()=>{
  const engine=read('src/components/Campaign/CampaignEngine.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  const java=read('android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
  assert.match(engine,/position: 'fixed', inset: 0/);
  assert.match(engine,/width: '100dvw', height: '100dvh'/);
  assert.match(css,/\.hud\s*\{[^}]*position:fixed/);
  assert.match(java,/private void applyImmersiveMode\(\)/);
  assert.match(java,/onWindowFocusChanged\(boolean hasFocus\)/);
  assert.match(java,/postDelayed\(this::applyImmersiveMode, 250\)/);
});
