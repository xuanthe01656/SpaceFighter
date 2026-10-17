import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFTS } from '../src/constants.js';
import { resolveShipVisual, shipOutline, chooseShipRenderQuality } from '../src/game/rendering/ShipVisualCatalog.js';
import { SHIP_ASSET_MANIFEST } from '../src/game/rendering/shipAssets.generated.js';

const all = AIRCRAFTS.map(a => resolveShipVisual(a.id, AIRCRAFTS));

test('each catalog ship resolves to its own ID; no silent X-Wing substitution', () => {
  assert.equal(all.length, 16);
  assert.equal(new Set(all.map(a => a.id)).size, 16);
  for (const desc of all) {
    assert.ok(desc.known);
    assert.equal(desc.aircraft.id, desc.id);
    assert.ok(desc.previewHQSrc && desc.previewTopSrc);
    assert.equal(desc.silhouette.length, 14);
  }
  const missing = resolveShipVisual('ship_not_registered', AIRCRAFTS);
  assert.equal(missing.known, false);
  assert.equal(missing.aircraft, null);
  assert.equal(missing.modelSrc, null);
  assert.equal(missing.topSrc, null);
  assert.equal(missing.runtimeMode, 'procedural');
  assert.ok(!missing.previewTopSrc.includes('ship_xwing'));
});

test('asset manifest reflects known Phase 2 ships, models and missing art', () => {
  assert.deepEqual(Object.keys(SHIP_ASSET_MANIFEST).sort(), AIRCRAFTS.map(a => a.id).sort());
  assert.equal(all.filter(d => d.modelSrc).length, 1);
  assert.equal(all.filter(d => d.topSrc).length, 7);
  assert.equal(all.filter(d => d.hqSrc).length, 7);
  assert.equal(all.filter(d => d.runtimeMode === 'procedural').length, 9);
  assert.equal(resolveShipVisual('ship_xwing', AIRCRAFTS).modelSrc, '/models/ships/ship_xwing.glb');
});

test('missing art uses a readable, stable, per-ID placeholder, not broken URL', () => {
  const noAssets = all.filter(d => !d.topSrc);
  const distinct = new Set(noAssets.map(d => d.previewTopSrc));
  assert.equal(distinct.size, 9);
  for (const desc of noAssets) {
    assert.match(desc.previewTopSrc, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.equal(desc.previewHQSrc, desc.previewTopSrc);
    assert.ok(!desc.previewTopSrc.includes('/images/no_image'));
    assert.equal(resolveShipVisual(desc.id, AIRCRAFTS).previewTopSrc, desc.previewTopSrc);
  }
});

test('2D top preview and Babylon procedural fallback share the same silhouette data', () => {
  for (const aircraft of AIRCRAFTS) {
    const outline = shipOutline(aircraft.id, aircraft.role);
    assert.deepEqual(resolveShipVisual(aircraft.id, AIRCRAFTS).silhouette, outline);
    assert.deepEqual(outline[0][0], 0);
    assert.ok(outline[0][1] < 0, 'nose must point towards -Z');
    assert.ok(outline.at(-1)[0] < 0);
    assert.ok(outline.some(([x]) => x > 0));
  }
});

test('ship catalog does not mutate account progress or combat stats', () => {
  const save = JSON.stringify(AIRCRAFTS);
  for (const a of AIRCRAFTS) resolveShipVisual(a.id, AIRCRAFTS);
  assert.equal(JSON.stringify(AIRCRAFTS), save);
});

test('high-poly mismatched GLB defaults to sprite on mobile AND desktop; explicit quality still supports GLB QA', () => {
  const x = resolveShipVisual('ship_xwing', AIRCRAFTS);
  assert.ok(x.modelTriangles > 1_000_000);
  assert.ok(x.modelBytes > 50_000_000);
  assert.equal(chooseShipRenderQuality(x, 'Mozilla/5.0 (Linux; Android 15; Pixel)'), 'sprite');
  assert.equal(chooseShipRenderQuality(x, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'sprite');
  assert.equal(chooseShipRenderQuality(x, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'sprite');
  assert.equal(chooseShipRenderQuality(resolveShipVisual('ship_scout', AIRCRAFTS), 'Android'), 'sprite');
  assert.equal(chooseShipRenderQuality(resolveShipVisual('ship_spectre', AIRCRAFTS), 'Android'), 'procedural');
});
