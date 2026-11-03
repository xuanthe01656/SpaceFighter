import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('C15 and Guest use distinct gameplay lanes, but C15 delegates visual-only ship/background/FX to shared renderers',()=>{
  const routing=read('src/components/Campaign/CampaignEngine.jsx');
  const renderer=read('src/components/C15LocalAlpha1/C15LocalRenderer.js');
  const ship=read('src/game/rendering/ShipVisualFactory.js');
  const bg=read('src/game/rendering/ScrollingBackgroundRenderer.js');
  assert.match(routing,/Boolean\(auth\.currentUser\)/);
  assert.match(routing,/C15LocalAlpha1/);
  assert.match(routing,/LegacyCampaignEngine/);
  assert.match(renderer,/createPlayerShipVisual\(/);
  assert.match(renderer,/createShipEngineFx\(/);
  assert.match(renderer,/createScrollingBattleBackground\(/);
  assert.match(renderer,/presentationTopSrc:pilotTextureUrl/);
  assert.match(renderer,/layerUrlResolver:\(\)=>backgroundUrl/);
  assert.match(ship,/presentationTopSrc/);
  assert.match(bg,/layerUrlResolver/);
  assert.match(renderer,/sharedShipVisual:true/);
  assert.match(renderer,/remoteEnemyAtlas/);
  assert.doesNotMatch(renderer,/claimSettlement|wallet|awardCoins|calculateDamage|setHp/);
});

test('C15 battle uses production-facing HUD, not a permanent RC7 debug banner',()=>{
  const src=read('src/components/C15LocalAlpha1/index.jsx');
  const css=read('src/components/C15LocalAlpha1/C15Presentation.module.css');
  assert.match(src,/Chiến dịch Alpha/);
  assert.match(src,/styles\.hpBlocks/);
  assert.match(src,/styles\.boss/);
  assert.match(src,/styles\.resultButton/);
  assert.match(src,/releaseChannel\.qaControls&&/);
  assert.match(css,/safe-area-inset-top/);
  assert.match(css,/focus-visible/);
  assert.match(src,/claimVerifiedReward\(/);
  assert.match(src,/completeVerified\(/);
});

test('Resource UI is a functional accessible content manager with verified status, no invented packs',()=>{
  const manager=read('src/components/ResourceDownloads/ResourceManagerScreen.jsx');
  const startup=read('src/components/ResourceDownloads/StartupResourceGate.jsx');
  const css=read('src/components/ResourceDownloads/ResourceDownloads.module.css');
  const coordinator=read('src/game/assets/ResourceDownloadCoordinatorV1.js');
  for(const marker of ['listContent()','downloadCampaignAlpha','removeCampaignAlpha','confirm','progressbar','aria-valuenow'])
    assert.match(manager,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  for(const marker of ['ensureStartup','progressbar','AbortController','aria-live'])assert.match(startup,new RegExp(marker,'i'));
  assert.match(manager,/styles\.statusUnavailable/);
  assert.match(coordinator,/campaign-alpha-mobile-low/);
  assert.match(coordinator,/core-bootstrap/);
  assert.doesNotMatch(coordinator,/dungeon-nereus-mobile-low/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/min-height:47px/);
});
