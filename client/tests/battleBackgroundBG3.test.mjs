import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BATTLE_BACKGROUND_CATALOG, BACKGROUND_CATALOG_VERSION,
  BACKGROUND_ART_BIOMES, BACKGROUND_ART_ROADMAP, BACKGROUND_COMBAT_READABILITY,
  selectBackgroundLayers, resolveBattleBackground } from '../src/game/catalog/BackgroundCatalog.js';
import { collectBackgroundAssets, buildBackgroundAssetManifest } from '../scripts/lib/background-asset-utils.mjs';

const clientRoot = new URL('../',import.meta.url);

test('BG3 art roadmap and safe zones do not register planned IDs for live battles',()=>{
  assert.equal(BACKGROUND_CATALOG_VERSION,'1.3.0');
  assert.equal(BACKGROUND_COMBAT_READABILITY.shipForwardOnScreen,'up');
  assert.equal(BACKGROUND_COMBAT_READABILITY.sceneryMotionOnScreen,'down');
  assert.ok(Object.keys(BACKGROUND_ART_BIOMES).length>=6);
  for(const brief of BACKGROUND_ART_ROADMAP){
    assert.equal(brief.status,'planned');
    assert.ok(BACKGROUND_ART_BIOMES[brief.biomeId]);
    assert.equal(BATTLE_BACKGROUND_CATALOG[brief.artBriefId],undefined);
    assert.equal(resolveBattleBackground({variantId:brief.artBriefId}),null);
  }
  assert.equal(resolveBattleBackground({mode:'campaign',planetId:1,stage:1})?.id,'alpha_coast_demo');
  assert.equal(resolveBattleBackground({mode:'dungeon',dungeonId:'dung_nereus'})?.id,'nereus_ocean_demo');
});

test('BG3 mobileLow loads compact art; other quality profiles keep original, no mutation',()=>{
  for(const name of ['alpha_coast_demo','nereus_ocean_demo']){
    const c=BATTLE_BACKGROUND_CATALOG[name];
    const full=selectBackgroundLayers(c,'desktop')[0];
    const med=selectBackgroundLayers(c,'mobile')[0];
    const lite=selectBackgroundLayers(c,'mobileLow')[0];
    assert.ok(full.src.endsWith('.webp'));
    assert.equal(med.src,full.src);
    assert.ok(lite.src.endsWith('_low.webp'));
    assert.equal(lite.imageWidth,512);assert.equal(lite.imageHeight,1024);
    assert.ok(lite.scrollCssPixelsPerSecond===full.scrollCssPixelsPerSecond);
    assert.ok(lite.seamlessY&&Object.isFrozen(c.layers[0]));
    assert.equal(c.artPipelineStatus,'prototype_qa');
    assert.equal(c.licenseStatus,'prototype_only');
    assert.equal(c.layers[0].src,full.src);
    assert.equal(c.layers[0].qualityVariants.mobileLow.src,lite.src);
  }
});

test('asset manifest contains reproducible SHA-256 for each source and quality variant',()=>{
  const manifest=buildBackgroundAssetManifest(BATTLE_BACKGROUND_CATALOG,fileURLToPath(new URL('../public/',import.meta.url)),{
    catalogVersion:BACKGROUND_CATALOG_VERSION,artDirectionVersion:'1.0.0',
  });
  assert.equal(manifest.assets.length,8);
  assert.equal(collectBackgroundAssets(BATTLE_BACKGROUND_CATALOG).length,8);
  const committed=JSON.parse(fs.readFileSync(new URL('../docs/BG3_BACKGROUND_ASSET_MANIFEST.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest,committed);
  assert.ok(committed.assets.every(a=>/^[0-9a-f]{64}$/.test(a.sha256) && a.bytes<1_500_000));
});

test('no production art can be falsely advertised by this demo release',()=>{
  assert.ok(Object.values(BATTLE_BACKGROUND_CATALOG).every(b=>['demo','candidate'].includes(b.status)&&b.licenseStatus!=='approved'));
  const catalogSource=fs.readFileSync(new URL('../scripts/check-background-catalog.mjs',import.meta.url),'utf8');
  assert.match(catalogSource,/licenseStatus==='approved'/);
  assert.match(catalogSource,/artPipelineStatus==='released'/);
  assert.match(catalogSource,/releaseEvidenceId/);
  const sources=['../src/components/Campaign/CampaignScene.js','../src/components/Dungeon/DungeonScene.js'];
  for(const rel of sources){
    const scene=fs.readFileSync(new URL(rel,import.meta.url),'utf8');
    assert.match(scene,/createScrollingBattleBackground/);
    assert.doesNotMatch(scene,/BACKGROUND_ART_ROADMAP/);
  }
});
