import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('Approved Tactical V4 shows actual kills in both lanes without fabricating C15 trusted score',()=>{
  const guest=read('src/components/Campaign/CampaignEngine.jsx');
  const cloud=read('src/components/C15LocalAlpha1/index.jsx');
  const hud=read('src/ui-system/BattleHud.jsx');
  assert.match(guest, /<CampaignTacticalHudV420\b[\s\S]*?announcement=\{battleNotice\}/);
  const campaignHud = read('src/ui-system/CampaignTacticalHudV420.jsx');
  const sharedHud = read('src/ui-system/TacticalCombatHudV411.jsx');
  assert.match(campaignHud, /TacticalCombatHudV411/);
  assert.match(sharedHud, /integer\(kills\)/);
  assert.match(sharedHud, /integer\(score\)/);
  assert.doesNotMatch(sharedHud, /\bfetch\(|gameAction\(|claimReward\(|localStorage|firestore/i);
  assert.match(cloud,/<BattleHud lang=\{lang\}/);
  assert.doesNotMatch(cloud,/score=\{(?:ui|k|.*reward)/);
  assert.match(hud,/metricValue = integer\(kills\)/);
  assert.match(hud,/styles\.leftPod/);
  assert.doesNotMatch(hud,/score=\{(?:k|ui|.*reward)/);
  assert.match(hud,/role="meter"/);
  assert.doesNotMatch(hud,/\bfetch\(|gameAction\(|claimReward\(|localStorage|firestore/i);
});

test('Tactical HUD uses responsive geometry, safe areas, ten real shield segments and pointer-through overlay',()=>{
  const hud=read('src/ui-system/BattleHud.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  assert.match(hud,/length:10/);
  assert.match(hud,/ratio\s*\*\s*10\s*-\s*i/);
  assert.match(hud,/styles\.shieldCenter/);
  assert.match(css,/\.cockpit\s*\{[^}]*position:absolute/);
  assert.match(css,/clip-path:polygon/);
  assert.match(css,/--sf-ui-safe-top/);
  assert.match(css,/pointer-events:none/);
  assert.match(css,/@media\(max-width:359px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('C15 now uses Guest atlas animator and projectile appearance without altering world authority',()=>{
  const renderer=read('src/components/C15LocalAlpha1/C15LocalRenderer.js');
  const emitter=read('src/game/combat/ProjectileEmitter.js');
  assert.match(renderer,/attachBattleEntityVisual\(/);
  assert.match(renderer,/BATTLE_ANIMATION_CLIPS/);
  assert.match(renderer,/BATTLE_ANIMATION_GRID/);
  assert.match(renderer,/atlasSrc:enemyAtlasUrl/);
  assert.match(renderer,/drawProjectileTexture\(ctx,spec\)/);
  assert.match(renderer,/projectileFxProfile\(/);
  assert.match(emitter,/export function drawProjectileTexture/);
  assert.match(renderer,/createC15VisualViewportV1/);
  assert.match(renderer,/viewport\.project/);
  assert.match(renderer,/viewport\.unproject/);
  assert.doesNotMatch(renderer,/wallet|claimSettlement|awardCoins|calculateDamage|setHp/);
});

test('C15 quality uses same adaptive scale as Guest but high-res background is not falsely claimed',()=>{
  const renderer=read('src/components/C15LocalAlpha1/C15LocalRenderer.js');
  const guest=read('src/components/Campaign/CampaignEngine.jsx');
  assert.match(renderer,/choosePerformancePreset\(/);
  assert.match(renderer,/attachAdaptiveRenderQuality\(/);
  assert.match(guest,/attachAdaptiveRenderQuality\(/);
  assert.match(renderer,/qualityId:'mobileLow'/);
  assert.match(renderer,/layerUrlResolver:\(\)=>backgroundUrl/);
  assert.match(renderer,/adaptiveQuality\.dispose/);
});
