import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARMOR_TRAITS_V2,
  COMBAT_TICK_RATE,
  SHIP_ACTIVE_SKILLS_V2,
} from '../src/game/combat/GuestAbilityCatalogV2.js';
import { createGuestAbilityRuntimeV2 } from '../src/game/combat/GuestAbilityRuntimeV2.js';
import {
  GUEST_ABILITY_FEEDBACK_VERSION,
  auditGuestAbilityFeedbackV2,
  createGuestAbilityActivationFeedbackV2,
  createGuestAbilityRejectedFeedbackV2,
  createGuestArmorProcFeedbackV2,
  describeGuestAbilityV2,
  describeGuestArmorV2,
  getGuestAbilityFeedbackProfileV2,
  getGuestArmorFeedbackProfileV2,
  localizeGuestFeedbackV2,
} from '../src/game/combat/GuestAbilityFeedbackV2.js';
import { createGuestAbilityVisualFeedbackV2 } from '../src/game/rendering/GuestAbilityVisualFeedbackV2.js';
import {
  GUEST_ABILITY_ACTIVATION_GATE_VERSION,
  deriveGuestAbilityActivationGateV2,
} from '../src/game/combat/GuestAbilityActivationGateV2.js';


test('scene phase gate allows skill input only during active combat phases', () => {
  const playing = deriveGuestAbilityActivationGateV2({ gameState: 'PLAYING' });
  const boss = deriveGuestAbilityActivationGateV2({ gameState: 'BOSS_FIGHT' });
  assert.equal(playing.version, GUEST_ABILITY_ACTIVATION_GATE_VERSION);
  assert.equal(playing.canActivate, true);
  assert.equal(boss.canActivate, true);
  assert.equal(playing.lockReason, null);

  for (const [phase, reason] of [
    ['TRANSITION', 'TRANSITION'],
    ['BOSS_INTRO', 'BOSS_INTRO'],
    ['CLEAR', 'CLEAR'],
    ['GAMEOVER', 'GAMEOVER'],
    ['UNKNOWN', 'UNAVAILABLE'],
  ]) {
    const gate = deriveGuestAbilityActivationGateV2({ gameState: phase });
    assert.equal(gate.canActivate, false);
    assert.equal(gate.lockReason, reason);
  }
  const forcedGameOver = deriveGuestAbilityActivationGateV2({ gameState: 'PLAYING', gameOver: true });
  assert.equal(forcedGameOver.canActivate, false);
  assert.equal(forcedGameOver.battlePhase, 'GAMEOVER');
  assert.equal(forcedGameOver.lockReason, 'GAMEOVER');
});

test('feedback catalog covers all 16 ship abilities with bilingual copy and VFX profile', () => {
  assert.deepEqual(auditGuestAbilityFeedbackV2(), []);
  const skills = Object.values(SHIP_ACTIVE_SKILLS_V2);
  const icons = new Set();
  assert.equal(skills.length, 16);
  for (const skill of skills) {
    const profile = getGuestAbilityFeedbackProfileV2(skill.id);
    assert.equal(profile.version, GUEST_ABILITY_FEEDBACK_VERSION);
    assert.equal(profile.abilityId, skill.id);
    assert.equal(profile.durationTicks, skill.durationTicks);
    assert.equal(profile.cooldownTicks, skill.cooldownTicks);
    assert.ok(localizeGuestFeedbackV2(profile.name, 'vi').length > 2);
    assert.ok(localizeGuestFeedbackV2(profile.name, 'en').length > 2);
    assert.ok(localizeGuestFeedbackV2(profile.detail, 'vi').length > 5);
    assert.ok(localizeGuestFeedbackV2(profile.detail, 'en').length > 5);
    assert.match(profile.color, /^#[0-9a-f]{6}$/i);
    assert.ok(profile.tone && profile.fx && profile.icon);
    assert.equal(profile.iconKey, skill.id);
    icons.add(profile.icon);
  }
  assert.equal(icons.size, 16);
});

test('X-Wing feedback exposes the exact basic buff and separates active from cooldown', () => {
  const skill = SHIP_ACTIVE_SKILLS_V2.ship_xwing;
  const description = describeGuestAbilityV2(skill);
  assert.match(description.vi, /SÁT THƯƠNG \+8%/);
  assert.match(description.vi, /NHỊP BẮN \+19%/);
  assert.match(description.en, /DAMAGE \+8%/);
  const event = createGuestAbilityActivationFeedbackV2({ abilityId: skill.id, tick: 90, sequence: 4 });
  assert.equal(event.status, 'activated');
  assert.equal(event.startedTick, 90);
  assert.equal(event.activeUntilTick, 90 + 4 * COMBAT_TICK_RATE);
  assert.equal(event.cooldownUntilTick, 90 + 18 * COMBAT_TICK_RATE);
  assert.ok(event.toastUntilTick > event.startedTick);
});

test('instant and duration skills create correct deterministic feedback lifetimes', () => {
  for (const skill of Object.values(SHIP_ACTIVE_SKILLS_V2)) {
    const event = createGuestAbilityActivationFeedbackV2({ abilityId: skill.id, tick: 15, sequence: 1 });
    assert.equal(event.activeUntilTick, 15 + skill.durationTicks);
    assert.equal(event.cooldownUntilTick, 15 + skill.cooldownTicks);
    assert.ok(event.toastUntilTick <= 15 + COMBAT_TICK_RATE);
  }
  const burst = createGuestAbilityActivationFeedbackV2({
    abilityId: SHIP_ACTIVE_SKILLS_V2.ship_spectre.id,
    tick: 15,
  });
  assert.equal(burst.activeUntilTick, 15);
});

test('rejected activation reports no target without consuming a fake active window', () => {
  const skill = SHIP_ACTIVE_SKILLS_V2.ship_scout;
  const feedback = createGuestAbilityRejectedFeedbackV2({
    abilityId: skill.id,
    reason: 'NO_TARGET',
    tick: 33,
  });
  assert.equal(feedback.status, 'rejected');
  assert.equal(feedback.reason, 'NO_TARGET');
  assert.equal(feedback.activeUntilTick, 33);
  assert.match(feedback.detail.vi, /KHÔNG CÓ MỤC TIÊU/);
});

test('armor feedback covers evasion, reflect, crystal and nano repair', () => {
  const samples = [
    ['armor_auto_evade', 'evade', 0],
    ['armor_reactive_plating', 'reactive_reflect', 37],
    ['armor_crystal_prism', 'crystal_prism', 4],
    ['armor_nano_repair', 'nano_repair', 12],
    [null, 'pilot_evade', 0],
  ];
  for (const [armorId, proc, amount] of samples) {
    const feedback = createGuestArmorProcFeedbackV2({ armorId, proc, amount, tick: 8 });
    assert.ok(feedback);
    assert.equal(feedback.status, 'proc');
    assert.ok(feedback.toastUntilTick > 8);
    assert.ok(localizeGuestFeedbackV2(feedback.name, 'vi'));
    assert.ok(localizeGuestFeedbackV2(feedback.detail, 'en'));
  }
  const evade = createGuestArmorProcFeedbackV2({ armorId: 'armor_auto_evade', proc: 'evade', tick: 8 });
  assert.match(evade.name.vi, /NÉ ĐẠN/);
  assert.match(evade.detail.vi, /Đạn hợp lệ/);
});

test('all seven armor traits expose compact icons and pre-battle descriptions', () => {
  const entries = Object.entries(ARMOR_TRAITS_V2);
  assert.equal(entries.length, 7);
  for (const [catalogId, armor] of entries) {
    const profile = getGuestArmorFeedbackProfileV2(catalogId);
    assert.equal(profile.catalogId, catalogId);
    assert.equal(profile.armorId, armor.id);
    assert.match(profile.color, /^#[0-9a-f]{6}$/i);
    assert.ok(profile.icon);
    assert.ok(localizeGuestFeedbackV2(profile.name, 'vi').length > 2);
    assert.ok(localizeGuestFeedbackV2(describeGuestArmorV2(catalogId), 'vi').length > 12);
  }
  assert.match(describeGuestArmorV2('armor_light').vi, /VÔ HIỆU HÓA ĐẠN/);
  assert.match(describeGuestArmorV2('armor_light').vi, /KHÔNG NÉ VA CHẠM/);
});

test('runtime snapshot exposes presentation state without changing deterministic combat', () => {
  const runtime = createGuestAbilityRuntimeV2({
    aircraftId: 'ship_xwing', armorId: 'armor_shield', maxHp: 1000, seed: 77,
  });
  const before = runtime.snapshot();
  assert.equal(before.ship.durationTicks, 4 * COMBAT_TICK_RATE);
  assert.equal(before.ship.active, false);
  assert.equal(before.armor.barrierHp, 120);
  assert.equal(before.armor.barrierMax, 120);
  runtime.activate('ship_skill');
  const active = runtime.snapshot();
  assert.equal(active.ship.active, true);
  assert.equal(active.ship.activeTicks, 4 * COMBAT_TICK_RATE);
  runtime.advanceTicks(4 * COMBAT_TICK_RATE);
  assert.equal(runtime.snapshot().ship.active, false);
});

test('visual feedback factory is a safe no-op without a Babylon scene', () => {
  const visual = createGuestAbilityVisualFeedbackV2();
  assert.doesNotThrow(() => visual.play({}));
  assert.doesNotThrow(() => visual.markTarget(null, null, 0));
  assert.doesNotThrow(() => visual.update());
  assert.doesNotThrow(() => visual.dispose());
});

test('scene, engine and HUD are wired through one presentation-only feedback path', () => {
  const scene = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  const engine = fs.readFileSync(new URL('../src/components/Campaign/CampaignEngine.jsx', import.meta.url), 'utf8');
  const controls = fs.readFileSync(new URL('../src/ui-system/GuestAbilityControls.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/ui-system/GuestAbilityControls.module.css', import.meta.url), 'utf8');
  const visual = fs.readFileSync(new URL('../src/game/rendering/GuestAbilityVisualFeedbackV2.js', import.meta.url), 'utf8');
  const itemModal = fs.readFileSync(new URL('../src/components/ItemModal/ItemModal.jsx', import.meta.url), 'utf8');
  const itemModalCss = fs.readFileSync(new URL('../src/components/ItemModal/ItemModal.module.css', import.meta.url), 'utf8');

  assert.match(scene, /createGuestAbilityActivationFeedbackV2/);
  assert.match(scene, /createGuestAbilityVisualFeedbackV2/);
  assert.match(scene, /guestVisualFeedback\?\.markTarget/);
  assert.match(scene, /data\.onAbilityFeedback\?\./);
  assert.match(scene, /deriveGuestAbilityActivationGateV2/);
  assert.match(scene, /activationGate:getGuestAbilityActivationGate\(\)/);
  assert.match(scene, /setGameState\('TRANSITION'\)/);
  assert.match(scene, /setGameState\('BOSS_INTRO'\)/);
  assert.match(engine, /onAbilityFeedback:guestAbilityQa\?setAbilityFeedback:null/);
  assert.match(engine, /feedback=\{abilityFeedback\}/);
  assert.doesNotMatch(controls, /FeedbackToast/);
  assert.doesNotMatch(controls, /ActiveReadout/);
  assert.match(controls, /radialRing/);
  assert.match(controls, /armorRing/);
  assert.match(controls, /sfAbilityDebug/);
  assert.match(controls, /data-ability-state/);
  assert.match(controls, /data-ability-lock-reason/);
  assert.match(controls, /disabled=\{!slot\.ready \|\| phaseLocked\}/);
  assert.match(controls, /styles\.actionLocked/);
  assert.match(css, /\.actionLocked/);
  assert.match(css, /\.lockBadge/);
  assert.equal((controls.match(/data-ability-slot="ship_skill"/g) || []).length, 1);
  assert.match(controls, /VITE_SF_GUEST_COMBAT_V2_QA/);
  assert.match(controls, /qaSwitcher/);
  assert.doesNotMatch(controls, /armor_active/);
  assert.doesNotMatch(controls, />SHIP</);
  assert.doesNotMatch(controls, /ARMOR · AUTO/);
  assert.match(css, /pointer-events:none/);
  assert.match(css, /\.action\{[\s\S]*pointer-events:auto/);
  assert.match(css, /conic-gradient/);
  assert.match(itemModal, /combatFeature/);
  assert.match(itemModal, /describeGuestArmorV2/);
  assert.match(itemModal, /SHIP_ACTIVE_SKILLS_V2/);
  assert.match(itemModalCss, /\.combatFeature/);
  assert.doesNotMatch(visual, /Firebase|fetch\(|XMLHttpRequest|localStorage/);
});

test('all seven armor traits remain automatic after feedback integration', () => {
  assert.equal(Object.values(ARMOR_TRAITS_V2).length, 7);
  assert.equal(Object.values(ARMOR_TRAITS_V2).every(armor => armor.trigger !== 'manual'), true);
});
