import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AIRCRAFTS } from '../src/game/catalog/aircraft.js';
import { GEAR_CATALOG } from '../src/game/catalog/gear.js';
import {
  ARMOR_TRAITS_V2,
  GUEST_COMBAT_RULES_VERSION,
  GUN_DAMAGE_TYPES_V2,
  SHIP_ACTIVE_SKILLS_V2,
  auditGuestCombatCatalogV2,
  guestCounterMultiplierV2,
  legacyTierDefenseClass,
} from '../src/game/combat/GuestAbilityCatalogV2.js';
import { createGuestAbilityRuntimeV2 } from '../src/game/combat/GuestAbilityRuntimeV2.js';
import {
  createEnemyEntryReadabilityPolicyV26A2,
  createReadableFastEnemyProfileV26A2,
  resolveBattleHudOcclusionRatioV26A2,
} from '../src/game/combat/EnemyEntryReadabilityV26A2.js';
import { calculateCombatRatingV2 } from '../src/game/combat/CombatRatingV2.js';
import { armorMitigationV2, resolveIncomingDamageV2 } from '../src/game/combat/CombatMathV2.js';
import { deriveBattleLoadout } from '../src/utils/combatStats.js';
import { PILOTS } from '../src/game/catalog/pilots.js';

test('V2 catalog has 16 basic ship actions, seven automatic armors and no dash', () => {
  assert.deepEqual(auditGuestCombatCatalogV2(AIRCRAFTS, GEAR_CATALOG.armor), []);
  assert.equal(Object.keys(SHIP_ACTIVE_SKILLS_V2).length, 16);
  assert.equal(Object.keys(ARMOR_TRAITS_V2).length, 7);
  assert.equal(Object.values(SHIP_ACTIVE_SKILLS_V2).some(value => value.kind === 'dash'), false);
  assert.equal(Object.values(ARMOR_TRAITS_V2).some(value => value.trigger === 'manual'), false);
});


test('armor trigger contract uses chance only for Light Armor', () => {
  assert.equal(ARMOR_TRAITS_V2.armor_light.trigger, 'on_eligible_hit');
  assert.equal(ARMOR_TRAITS_V2.armor_light.params.chancePermillePve, 80);
  assert.equal(ARMOR_TRAITS_V2.armor_light.params.chancePermillePvp, 50);
  assert.deepEqual(ARMOR_TRAITS_V2.armor_light.params.eligibleSources, ['projectile']);
  assert.equal(ARMOR_TRAITS_V2.armor_heavy.trigger, 'always');
  assert.equal(ARMOR_TRAITS_V2.armor_shield.trigger, 'always');
  assert.equal(ARMOR_TRAITS_V2.armor_void.trigger, 'always');
  assert.equal(ARMOR_TRAITS_V2.armor_reactive.trigger, 'on_projectile_hit');
  assert.equal(ARMOR_TRAITS_V2.armor_nano.trigger, 'out_of_combat');
  assert.equal(ARMOR_TRAITS_V2.armor_crystal.params.hitsPerProc, 5);
});

test('enemy entry policy clears the top HUD and grants a readable reveal window', () => {
  const ratio = resolveBattleHudOcclusionRatioV26A2({ viewportWidth: 393, viewportHeight: 852 });
  assert.ok(ratio > .18 && ratio < .20);
  const policy = createEnemyEntryReadabilityPolicyV26A2({
    worldHalfHeight: 15, viewportWidth: 393, viewportHeight: 852,
  });
  assert.ok(policy.engagementLineZ > -10 && policy.engagementLineZ < -9);
  const fast = policy.createState({ tier: 4 });
  policy.update(fast, { positionZ: policy.engagementLineZ - .01, nowMs: 1000 });
  assert.equal(policy.isEngageable(fast), false);
  policy.update(fast, { positionZ: policy.engagementLineZ, nowMs: 1000 });
  assert.equal(fast.phase, 'reveal');
  policy.update(fast, { positionZ: policy.engagementLineZ + 1, nowMs: 1649 });
  assert.equal(policy.isEngageable(fast), false);
  policy.update(fast, { positionZ: policy.engagementLineZ + 1, nowMs: 1650 });
  assert.equal(policy.isEngageable(fast), true);
  assert.equal(policy.entrySpeed(.42, 4), .11);
  assert.equal(policy.entrySpeed(.12, 1), .09);
});

test('fast-enemy atlas starts on a readable frame without mutating the asset catalog', () => {
  const profile = Object.freeze({
    atlasSrc: '/enemy.webp',
    visual: Object.freeze({
      animations: Object.freeze({
        spawn: Object.freeze({ frames: Object.freeze([0, 1, 2]), fps: 10, durationMs: 300 }),
        idle: Object.freeze({ frames: Object.freeze([3, 4]), fps: 7, loop: true, durationMs: 0 }),
      }),
    }),
  });
  const readable = createReadableFastEnemyProfileV26A2(profile, { tier: 4 });
  assert.notEqual(readable, profile);
  assert.deepEqual(readable.visual.animations.spawn.frames, [3]);
  assert.equal(readable.visual.animations.spawn.durationMs, 0);
  assert.deepEqual(profile.visual.animations.spawn.frames, [0, 1, 2]);
  assert.equal(createReadableFastEnemyProfileV26A2(profile, { tier: 3 }), profile);
});

test('Campaign keeps entering enemies visible but untargetable until the readability gate opens', () => {
  const scene = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  assert.match(scene, /createEnemyEntryReadabilityPolicyV26A2/);
  assert.match(scene, /enemyEntryPolicy\.isEngageable\(e\._entryState\)/);
  assert.match(scene, /miniHpBg\.isVisible = false/);
  assert.match(scene, /createReadableFastEnemyProfileV26A2/);
  assert.match(scene, /diameterTop:\.35,diameterBottom:1\.9,height:\.45,tessellation:3/);
  assert.doesNotMatch(scene, /CreateTorus\(`ef4_/);
  assert.match(scene, /CreateTorus\(`entry_\$\{mesh\.uniqueId\}`/);
  assert.match(scene, /entry ring communicates temporary spawn protection/);
});

test('runtime exposes one ship action; armor_active is intentionally unavailable', () => {
  const runtime = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_light' });
  assert.equal(runtime.snapshot().version, GUEST_COMBAT_RULES_VERSION);
  assert.equal(runtime.snapshot().ship.kind, 'overdrive');
  assert.equal(runtime.snapshot().armor.automatic, true);
  assert.deepEqual(runtime.activate('armor_active'), { ok: false, reason: 'NO_MANUAL_ARMOR' });
  assert.equal(runtime.activate('ship_skill').ok, true);
});

test('light armor auto-evades eligible projectile with deterministic chance and internal cooldown', () => {
  const runtime = createGuestAbilityRuntimeV2({
    aircraftId: 'ship_xwing', armorId: 'armor_light', maxHp: 1000, seed: 11,
  });
  const first = runtime.resolveIncomingHit({ damage: 200, source: 'projectile', damageType: 'energy' });
  assert.equal(first.dodged, true);
  assert.equal(first.remaining, 0);
  assert.equal(first.events.some(event => event.type === 'evade'), true);
  assert.equal(runtime.snapshot().armor.procRemainingTicks, 75);
  const immediate = runtime.resolveIncomingHit({ damage: 200, source: 'projectile', damageType: 'energy' });
  assert.equal(immediate.dodged, false);
  const contact = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_light', seed: 11 })
    .resolveIncomingHit({ damage: 200, source: 'contact' });
  assert.equal(contact.dodged, false);
});

test('one-shot QA force waits for the next eligible projectile and does not advance RNG', () => {
  const runtime = createGuestAbilityRuntimeV2({
    aircraftId: 'ship_xwing', armorId: 'armor_light', maxHp: 1000, seed: 1,
    qaForceNextProjectileEvade: true,
  });
  const initial = runtime.snapshot();
  assert.equal(initial.qa.forceNextProjectileEvadeEnabled, true);
  assert.equal(initial.qa.forceNextProjectileEvadePending, true);
  const initialRng = initial.rngState;

  const contact = runtime.resolveIncomingHit({ damage: 200, source: 'contact' });
  assert.equal(contact.dodged, false);
  assert.equal(runtime.snapshot().qa.forceNextProjectileEvadePending, true);

  const unavoidable = runtime.resolveIncomingHit({
    damage: 200, source: 'projectile', damageType: 'energy', unavoidable: true,
  });
  assert.equal(unavoidable.dodged, false);
  assert.equal(runtime.snapshot().qa.forceNextProjectileEvadePending, true);
  assert.equal(runtime.snapshot().rngState, initialRng);

  const forced = runtime.resolveIncomingHit({
    damage: 200, source: 'projectile', damageType: 'energy',
  });
  assert.equal(forced.dodged, true);
  assert.equal(forced.dodgeSource, 'armor');
  assert.equal(forced.forcedQa, true);
  assert.equal(forced.remaining, 0);
  assert.equal(forced.events.some(event => event.type === 'evade' && event.forcedQa === true), true);
  assert.equal(runtime.snapshot().qa.forceNextProjectileEvadePending, false);
  assert.equal(runtime.snapshot().armor.procRemainingTicks, 75);
  assert.equal(runtime.snapshot().rngState, initialRng);
});

test('QA force is inert without Light Armor and never applies to contact', () => {
  const heavy = createGuestAbilityRuntimeV2({
    aircraftId: 'ship_xwing', armorId: 'armor_heavy', seed: 1,
    qaForceNextProjectileEvade: true,
  });
  assert.equal(heavy.snapshot().qa, undefined);
  assert.equal(heavy.resolveIncomingHit({ damage: 100, source: 'projectile' }).dodged, false);

  const light = createGuestAbilityRuntimeV2({
    aircraftId: 'ship_xwing', armorId: 'armor_light', seed: 1,
    qaForceNextProjectileEvade: true,
  });
  const contact = light.resolveIncomingHit({ damage: 100, source: 'contact' });
  assert.equal(contact.dodged, false);
  assert.equal(light.snapshot().qa.forceNextProjectileEvadePending, true);
});

test('heavy armor is a small always-on mitigation, not another shield button', () => {
  const runtime = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_heavy' });
  const hit = runtime.resolveIncomingHit({ damage: 100, source: 'contact' });
  assert.equal(hit.remaining, 92);
  assert.equal(hit.absorbed, 0);
});

test('shield armor starts with a bounded barrier and recharges only after its delay', () => {
  const runtime = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_shield', maxHp: 1000 });
  assert.equal(runtime.snapshot().armorBarrierHp, 120);
  const hit = runtime.resolveIncomingHit({ damage: 200, source: 'projectile' });
  assert.equal(hit.absorbed, 120);
  assert.equal(hit.remaining, 80);
  runtime.advanceTicks(239);
  assert.equal(runtime.snapshot().armorBarrierHp, 0);
  runtime.advanceTicks(31);
  assert.equal(runtime.snapshot().armorBarrierHp, 10);
});

test('V2 defense uses diminishing armor returns and caps total mitigation by mode', () => {
  const low = armorMitigationV2(20, { mode: 'pve' });
  const high = armorMitigationV2(95, { mode: 'pve' });
  const extreme = armorMitigationV2(100000, { mode: 'pve' });
  assert.ok(low > 0 && high > low);
  assert.ok(extreme <= .60);
  assert.ok(armorMitigationV2(95, { mode: 'pvp' }) < high);
  const resolved = resolveIncomingDamageV2({
    rawDamage: 1000, armor: 100000, damageReduction: .9,
    incomingMultipliers: [.25, .25], mode: 'pvp',
  });
  assert.equal(resolved.damage, 350);
  assert.equal(resolved.totalMitigation, .65);
});

test('base defense is applied before shields and a pilot evade never drains the shield', () => {
  const defended = createGuestAbilityRuntimeV2({
    aircraftId: 'ship_xwing', armorId: 'armor_shield', maxHp: 1000,
    baseArmor: 95, baseDamageReduction: .25, seed: 1,
  });
  const hit = defended.resolveIncomingHit({ damage: 200, source: 'projectile', damageType: 'energy' });
  assert.ok(hit.defense.incomingMultiplier < 1);
  assert.ok(hit.absorbed > 0 && hit.absorbed < 120);
  assert.equal(hit.remaining, 0);
  assert.ok(defended.snapshot().armorBarrierHp > 0);

  const evading = createGuestAbilityRuntimeV2({
    aircraftId: 'ship_xwing', armorId: 'armor_shield', maxHp: 1000,
    pilotDodgePermille: 100, seed: 11,
  });
  const evaded = evading.resolveIncomingHit({ damage: 200, source: 'projectile' });
  assert.equal(evaded.dodged, true);
  assert.equal(evaded.dodgeSource, 'pilot');
  assert.equal(evading.snapshot().armorBarrierHp, 120);
});

test('reactive armor reflects projectiles with an internal cooldown but not collisions', () => {
  const runtime = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_reactive' });
  assert.equal(runtime.resolveIncomingHit({ damage: 100, source: 'projectile' }).reflected, 10);
  assert.equal(runtime.resolveIncomingHit({ damage: 100, source: 'projectile' }).reflected, 0);
  runtime.advanceTicks(30);
  assert.equal(runtime.resolveIncomingHit({ damage: 100, source: 'projectile' }).reflected, 10);
  assert.equal(runtime.resolveIncomingHit({ damage: 100, source: 'contact' }).reflected, 0);
});

test('nano armor heals after leaving combat and respects its per-battle cap', () => {
  const runtime = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_nano', maxHp: 1000 });
  runtime.resolveIncomingHit({ damage: 10, source: 'contact' });
  runtime.advanceTicks(119);
  assert.equal(runtime.drainEvents().some(event => event.type === 'heal'), false);
  runtime.advanceTicks(121);
  const healed = runtime.drainEvents().filter(event => event.type === 'heal')
    .reduce((sum, event) => sum + event.amount, 0);
  assert.ok(healed > 0 && healed <= 11);
  runtime.advanceTicks(3000);
  const capped = runtime.drainEvents().filter(event => event.type === 'heal')
    .reduce((sum, event) => sum + event.amount, 0);
  assert.ok(capped <= 200);
});

test('void armor has typed resistance while crystal armor procs predictably every fifth projectile', () => {
  const voidArmor = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_void' });
  assert.equal(voidArmor.resolveIncomingHit({ damage: 100, source: 'projectile', damageType: 'energy' }).remaining, 92);
  assert.equal(voidArmor.resolveIncomingHit({ damage: 100, source: 'projectile', damageType: 'kinetic' }).remaining, 97);

  const crystal = createGuestAbilityRuntimeV2({ aircraftId: 'ship_xwing', armorId: 'armor_crystal' });
  for (let index = 1; index <= 4; index += 1) {
    assert.equal(crystal.resolveIncomingHit({ damage: 100, source: 'projectile' }).remaining, 100);
  }
  const fifth = crystal.resolveIncomingHit({ damage: 100, source: 'projectile' });
  assert.equal(fifth.remaining, 70);
  assert.equal(fifth.reflected, 4);
});

test('identical seed and input trace produces identical runtime snapshots', () => {
  const make = () => createGuestAbilityRuntimeV2({
    aircraftId: 'ship_spectre', armorId: 'armor_light', maxHp: 1800, seed: 271828,
  });
  const a = make();
  const b = make();
  for (const runtime of [a, b]) {
    runtime.activate('ship_skill');
    for (let index = 0; index < 40; index += 1) {
      runtime.resolveIncomingHit({ damage: 91, source: 'projectile', damageType: 'energy' });
      runtime.advanceTicks(3);
    }
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('soft counters use defense classes, stay bounded and do not use rarity tier as the rule', () => {
  assert.equal(Object.keys(GUN_DAMAGE_TYPES_V2).length, 12);
  for (const type of ['kinetic', 'energy', 'ion', 'explosive', 'void']) {
    for (const defense of ['light', 'balanced', 'armored', 'shielded', 'boss']) {
      const value = guestCounterMultiplierV2({ damageType: type, targetDefense: defense });
      assert.ok(value >= 0.9 && value <= 1.1);
    }
  }
  assert.equal(legacyTierDefenseClass(3), 'shielded');
  assert.ok(guestCounterMultiplierV2({ damageType: 'ion', targetDefense: 'shielded' }) > 1);
  assert.ok(guestCounterMultiplierV2({ damageType: 'ion', targetDefense: 'armored' }) < 1);
});

test('combat rating responds to cadence, shielding and mobility without becoming PvP MMR', () => {
  const base = {
    stats: { maxHp: 1500, atk: 75, wingAtk: 0, droneAtk: 0, armor: 20, armorCap: .75,
      speed: 6, fireRate: 400, wingFireRate: 900, droneFireRate: 1000,
      hpRegenRate: 0, dmgReduce: 0, dodgeRate: 0, critDamageBoost: 0,
      passiveShieldMax: 0, echoIntervalMs: 0, echoCount: 0 },
    mainGun: { firePattern: 'single' }, aircraft: { hitboxScale: .8 },
  };
  const normal = calculateCombatRatingV2(base);
  const faster = calculateCombatRatingV2({ ...base, stats: { ...base.stats, fireRate: 300 } });
  const shielded = calculateCombatRatingV2({ ...base, armorTrait: ARMOR_TRAITS_V2.armor_shield });
  const oversized = calculateCombatRatingV2({ ...base, aircraft: { hitboxScale: 1.5 } });
  assert.ok(faster.total > normal.total);
  assert.ok(shielded.total > normal.total);
  assert.ok(oversized.total < normal.total);
  assert.equal(normal.version, 'combat-rating-v2.0.0');
});

test('Guest battle V2 disables duplicate legacy armor passives and exposes rating breakdown', () => {
  const campaignData = {
    loadout: { pilot: PILOTS[0].id, aircraft: 'ship_xwing', mainGun: 'm', armor: 'a' },
    items: { m: { baseId: 'gun_laser', level: 1, rarity: 1 }, a: { baseId: 'armor_shield', level: 1, rarity: 1 } },
    ownedAircrafts: { ship_xwing: { level: 1 } },
  };
  const result = deriveBattleLoadout(campaignData, { PILOTS, AIRCRAFTS, GEAR_CATALOG }, {
    mode: 'campaign', location: {}, armorPassivePolicy: 'none', combatRatingVersion: 'v2',
  });
  assert.equal(result.stats.armorPassive, 'none');
  assert.equal(result.stats.passiveShieldMax, 0);
  assert.equal(result.cp, result.combatRatingV2.total);
  assert.ok(result.combatRatingV2.breakdown.offenseDps > 0);
});

test('scene and HUD source contain no manual armor action or movement dash in V2 wiring', () => {
  const scene = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  const controls = fs.readFileSync(new URL('../src/ui-system/GuestAbilityControls.jsx', import.meta.url), 'utf8');
  assert.match(scene, /createGuestAbilityRuntimeV2/);
  assert.match(scene, /armorPassivePolicy:guestAbilityQa\?'none':'legacy'/);
  assert.doesNotMatch(scene, /event\.type==='dash'/);
  assert.doesNotMatch(controls, /armor_active/);
  assert.equal((controls.match(/data-ability-slot="ship_skill"/g) || []).length, 1);
  assert.match(controls, /VITE_SF_GUEST_COMBAT_V2_QA/);
  assert.match(controls, /qaSwitcher/);
  assert.match(controls, /getGuestArmorFeedbackProfileV2/);
  assert.match(controls, /armorRing/);
  assert.doesNotMatch(controls, /ARMOR · AUTO/);
  assert.doesNotMatch(controls, />SHIP</);
});

test('scene and compact HUD expose only the DEV one-shot force contract', () => {
  const scene = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  const controls = fs.readFileSync(new URL('../src/ui-system/GuestAbilityControls.jsx', import.meta.url), 'utf8');
  assert.match(scene, /sfArmorQa'\)===\'force-next-projectile\'/);
  assert.match(scene, /qaForceNextProjectileEvade:forceNextProjectileEvadeQa/);
  assert.match(scene, /createPlayerDamageGateV25/);
  assert.doesNotMatch(scene, /invincibleUntil|INV_DUR/);
  assert.match(controls, /QA NÉ ĐẠN: ĐÃ NẠP/);
  assert.match(controls, /QA NÉ ĐẠN: ĐÃ KÍCH HOẠT/);
});

test('boss mark and incoming armor resolution use the shared V2.5 hit gate', () => {
  const scene = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  assert.match(scene, /const marked=target\.isBoss\?target\.mesh:target/);
  assert.match(scene, /bossMesh\._guestMarkUntilTick>guestAbilities\.tick/);
  const gate = scene.indexOf('playerDamageGate.admitHit');
  const resolve = scene.indexOf('guestAbilities.resolveIncomingHit');
  assert.ok(gate >= 0 && resolve > gate);
  assert.match(scene, /contactId:bossMesh\._contactHitId\|\|'campaign-boss-contact'/);
});
