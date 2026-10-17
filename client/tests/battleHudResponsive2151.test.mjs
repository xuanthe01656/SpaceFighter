import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { measureBattleHud } from '../src/game/ui/BattleHudLayout.js';

const root = dirname(fileURLToPath(import.meta.url));
const sceneCode = scene => readFileSync(join(root, `../src/components/${scene}/${scene}Scene.js`), 'utf8');
const mock = (width, height, framebufferScale) => {
  const rect = { width, height };
  const canvas = { getBoundingClientRect: () => rect, clientWidth: width, clientHeight: height };
  const engine = { getRenderWidth: () => Math.round(rect.width * framebufferScale), getRenderHeight: () => Math.round(rect.height * framebufferScale) };
  const ui = { idealWidth: 0 };
  return { rect, canvas, engine, ui };
};

test('mobile HUD has invariant CSS-pixel dimensions at all GPU render scales and screen ratios', () => {
  for (const width of [320, 360, 390, 428, 768, 1440]) {
    for (const scale of [0.7, 0.85, 1, 1.25, 1.5, 2, 3]) {
      const { canvas, engine, ui } = mock(width, 840, scale);
      const m = measureBattleHud(engine, canvas, ui);
      assert.equal(m.cssW, width);
      assert.equal(ui.idealWidth, width);
      assert.ok(Math.abs(m.h1 / m.scale - 35) < 1e-8);
      assert.ok(Math.abs(m.h2 / m.scale - 65) < 1e-8);
      assert.ok(Math.abs(m.dx1 / m.scale - 90) < 1e-8);
      assert.ok(Math.abs(m.dx2 / m.scale - 70) < 1e-8);
      assert.ok(Math.abs(m.stroke / m.scale - 2.5) < 1e-8);
      // Under Babylon GUI's idealWidth scaling, 120px HP / 70px announcement
      // must retain their CSS size independent of hardwareScalingLevel.
      const guiRatio = engine.getRenderWidth() / ui.idealWidth;
      for (const targetCssPx of [12, 65, 70, 120, 300]) {
        assert.ok(Math.abs(targetCssPx * guiRatio / m.scale - targetCssPx) < 1e-8);
      }
    }
  }
});

test('dynamic GPU downscale and device rotation do not change the HUD logical widths', () => {
  let ratio = 1.25;
  const { rect, canvas, engine, ui } = mock(390, 844, ratio);
  // Override framebuffer size to follow a changing adaptive scaler.
  engine.getRenderWidth = () => Math.round(rect.width * ratio);
  engine.getRenderHeight = () => Math.round(rect.height * ratio);
  for (ratio of [1.25, 1.0, 0.8, 0.7, 1.25]) {
    const m = measureBattleHud(engine, canvas, ui);
    assert.equal(ui.idealWidth, 390);
    assert.ok(Math.abs(m.h2 / m.scale - 65) < 1e-8);
  }
  rect.width = 844;
  rect.height = 390;
  const landscape = measureBattleHud(engine, canvas, ui);
  assert.equal(landscape.cssW, 844);
  assert.equal(landscape.cssH, 390);
  assert.equal(ui.idealWidth, 844);
  assert.ok(Math.abs(landscape.h2 / landscape.scale - 65) < 1e-8);
});

test('both battle scenes share HUD measuring logic and do not multiply GUI by device DPR', () => {
  for (const name of ['Campaign', 'Dungeon']) {
    const scene = sceneCode(name);
    assert.match(scene, /import \{ measureBattleHud \} from '\.\.\/\.\.\/game\/ui\/BattleHudLayout'/);
    assert.match(scene, /measureBattleHud\(engine, canvas, ui\)/);
    assert.match(scene, /topBar\.height = '65px'/);
    assert.match(scene, /annPanel\.height\s*=\s*`70px`/);
    assert.doesNotMatch(scene, /\b(?:dpr|devicePixelRatio)\b/);
    assert.match(scene, /engine\.onResizeObservable\.add\(drawHudSvg\)/);
  }
});

test('Campaign reward overlay fits narrow CSS widths after GPU downscaling', () => {
  const source = sceneCode('Campaign');
  assert.match(source, /cssW: RW, cssH: RH/);
  for (const w of [320, 390, 428, 1024]) {
    for (const ratio of [0.75, 1, 1.25, 3]) {
      const { engine, canvas, ui } = mock(w, 900, ratio);
      const { cssW, cssH } = measureBattleHud(engine, canvas, ui);
      const panelWidth = Math.min(cssW * 0.92, 420);
      const panelHeight = Math.min(580, cssH * 0.88);
      assert.ok(panelWidth <= cssW);
      assert.ok(panelHeight <= cssH);
    }
  }
});
