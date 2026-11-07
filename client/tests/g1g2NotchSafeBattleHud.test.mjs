import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Actual notch void keeps all metrics and retreat below/outside its opening',()=>{
  const hud=read('src/ui-system/BattleHud.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  assert.match(hud,/styles\.cutoutClearance/);
  assert.match(hud,/styles\.leftPod/);
  assert.match(hud,/styles\.rightPod/);
  assert.match(hud,/styles\.shieldCenter/);
  assert.match(css,/top:var\(--sf-native-battle-hud-top, var\(--sf-ui-safe-top/);
  assert.doesNotMatch(css,/--sf-ui-hud-top-guard|top:calc\(max\(var\(--sf-ui-safe-top/);
  assert.match(css,/safe-area-inset-left/);
  assert.match(css,/safe-area-inset-right/);
  assert.match(css,/\.cutoutClearance/);
  assert.match(css,/@media\(pointer:coarse\)/);
  assert.match(hud,/length:10/);
  assert.match(hud,/metricValue = integer\(kills\)/);
  assert.doesNotMatch(hud,/\bfetch\(|Firestore|claimVerifiedReward/);
});

test('Retreat is a working top-left action, not a bottom overlay',()=>{
  const hud=read('src/ui-system/BattleHud.jsx');
  const guest=read('src/components/Campaign/CampaignEngine.jsx');
  const c15=read('src/components/C15LocalAlpha1/index.jsx');
  const css=read('src/ui-system/BattleHud.module.css');
  assert.match(hud,/onRetreat=null/);
  assert.match(hud,/onClick=\{onRetreat\}/);
  assert.match(hud,/styles\.retreatAction/);
  assert.match(css,/\.retreatAction\{[^}]*pointer-events:auto/);
  assert.match(guest,/onRetreat=\{retreat\}/);
  assert.match(c15,/onRetreat=\{retreat\}/);
  assert.doesNotMatch(guest,/dock="bottom-left"/);
  assert.doesNotMatch(c15,/dock="bottom-left"/);
});

test('C15 active-session recovery is explicitly gated; no automatic reset',()=>{
  const c15=read('src/components/C15LocalAlpha1/index.jsx');
  assert.match(c15,/hasActiveConflict=ui\.status==='error'&&ui\.errorCode==='C15_RC1B_ACTIVE'/);
  assert.match(c15,/onClick=\{\(\)=>setConflictConfirm\(true\)\}/);
  assert.match(c15,/await getC15Rc1bStatus\(uid\)/);
  assert.match(c15,/await abandonC15Rc1bBattle\(uid,\{battleId:status\.battleId\}\)/);
  assert.doesNotMatch(c15,/localStorage\.clear\(\)|indexedDB\.deleteDatabase\(/);
});

test('C15 error state never shows fabricated 0/1 HUD',()=>{
  const c15=read('src/components/C15LocalAlpha1/index.jsx');
  assert.match(c15,/\{k&&<BattleHud/);
  assert.match(c15,/TRẬN C15 ĐANG MỞ/);
});
