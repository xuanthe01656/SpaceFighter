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

test('C15 and Guest render the same battle HUD primitives, without an early VERIFIED label',()=>{
  const c15=read('src/components/C15LocalAlpha1/index.jsx');
  const guest=read('src/components/Campaign/CampaignEngine.jsx');
  const scene=read('src/components/Campaign/CampaignScene.js');
  const hud=read('src/ui-system/BattleHud.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  assert.match(c15,/BattleHud/);assert.match(c15,/bossHp=/);
  assert.match(guest,/<BattleHud/);assert.match(scene,/onHudUpdate/);
  assert.match(scene,/topBar\.isVisible=!externalHud/);
  assert.match(hud,/styles\.hpBlocks/);assert.match(hud,/styles\.boss/);
  assert.doesNotMatch(hud,/ĐÃ XÁC MINH|Verified battle|Đã xác minh/);
  assert.match(css,/safe-top/);assert.match(css,/pointer-events:none/);
  assert.match(c15,/releaseChannel\.qaControls&&/);
  assert.match(c15,/claimVerifiedReward\(/);
  assert.match(c15,/completeVerified\(/);
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
  assert.match(read('src/ui-system/GameButton.module.css'),/min-height:var\(--sf-ui-touch-target\)/);
});
