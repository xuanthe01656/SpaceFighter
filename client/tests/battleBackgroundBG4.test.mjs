import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BATTLE_BACKGROUND_CATALOG, resolveBattleBackground, previewBg4Variant,
  selectBackgroundLayers, BACKGROUND_CATALOG_VERSION } from '../src/game/catalog/BackgroundCatalog.js';

const c = BATTLE_BACKGROUND_CATALOG;

test('BG4 preview assets are explicit candidate-only, retaining the BG3 demo defaults and planned commercial IDs', () => {
  assert.equal(BACKGROUND_CATALOG_VERSION, '1.3.0');
  assert.equal(resolveBattleBackground({mode:'campaign',planetId:1,stage:1}).id,'alpha_coast_demo');
  assert.equal(resolveBattleBackground({mode:'dungeon',dungeonId:'dung_nereus'}).id,'nereus_ocean_demo');
  for (const id of ['alpha_coast_v1_candidate','nereus_ocean_v1_candidate']) {
    const item=c[id];assert.equal(item.status,'candidate');
    assert.equal(item.artPipelineStatus,'review');
    assert.equal(item.licenseStatus,'prototype_only');
    assert.match(item.provenance,/UP SCALED|UPSCALED/);
    assert.equal(item.layers.length,1);
    assert.ok(Object.isFrozen(item));
    assert.equal(item.layers[0].seamlessY,true);
    assert.equal(selectBackgroundLayers(item,'mobileLow')[0].imageWidth,512);
  }
  assert.equal(c.alpha_coast_v1,undefined);
  assert.equal(c.nereus_ocean_v1,undefined);
});

test('BG4 preview is opt-in only and cannot change other worlds or saved stage bindings', () => {
  const params={mode:'campaign',planetId:1};
  assert.equal(previewBg4Variant({...params,queryString:'?bg=bg4'}),'alpha_coast_v1_candidate');
  assert.equal(previewBg4Variant({...params,queryString:'?bg=legacy'}),null);
  assert.equal(previewBg4Variant({...params,queryString:''}),null);
  assert.equal(previewBg4Variant({mode:'campaign',planetId:2,queryString:'?bg=bg4'}),null);
  assert.equal(previewBg4Variant({mode:'dungeon',dungeonId:'dung_nereus',queryString:'?bg=bg4'}),'nereus_ocean_v1_candidate');
  assert.equal(previewBg4Variant({mode:'dungeon',dungeonId:'dung_taurus',queryString:'?bg=bg4'}),null);
  const id=previewBg4Variant({...params,queryString:'?bg=bg4'});
  assert.equal(resolveBattleBackground({...params,variantId:id}).id,'alpha_coast_v1_candidate');
});

test('BG4 changes are limited to artwork presentation, retaining existing combat, Firebase and legacy visual fallback', () => {
  for(const mode of ['Campaign','Dungeon']){
    const code=fs.readFileSync(new URL(`../src/components/${mode}/${mode}Scene.js`,import.meta.url),'utf8');
    assert.match(code,/previewBg4Variant/);
    assert.match(code,/legacyBattleBackgroundRequested/);
    assert.match(code,/onFallback: createLegacyStarfield/);
  }
  const manifest=JSON.parse(fs.readFileSync(new URL('../docs/BG3_BACKGROUND_ASSET_MANIFEST.json',import.meta.url)));
  assert.equal(manifest.assets.length,8);
  assert.ok(manifest.assets.every(a=>a.sha256.length===64));
  assert.ok(manifest.assets.filter(a=>a.catalogStatus==='candidate').every(a=>a.licenseStatus==='prototype_only'));
});
