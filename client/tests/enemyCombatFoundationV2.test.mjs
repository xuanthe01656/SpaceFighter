import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLANET_ENEMIES } from '../src/game/catalog/worlds.js';
import {
  ENEMY_COMBAT_CATALOG_VERSION,
  ENEMY_ARCHETYPES_V2,
  ENEMY_RUNTIME_CATALOG_V3,
  BOSS_PHASES_V2,
  auditEnemyCombatCatalogV2,
  bossPhaseForHp,
  enemyRuntimeFromCatalogV3,
} from '../src/game/combat/EnemyCombatCatalogV2.js';
import {
  CAMPAIGN_PLANET_PROFILES_V27,
  CAMPAIGN_WAVE_DIRECTOR_VERSION,
  CAMPAIGN_WAVE_TEMPLATES_V27,
  auditCampaignEnemyDirectorV3,
  createEnemyDirectorV2,
  resolveCampaignWavePowerV3,
  scaleEnemyStatsV2,
} from '../src/game/combat/DeterministicEnemyDirectorV2.js';
import {
  CAMPAIGN_ENCOUNTER_ESCALATION_VERSION,
  CAMPAIGN_ENCOUNTER_PROFILES_V28,
  completeBossPhaseGateV28,
  createBossPhaseStateV28,
  resolveBossDamageGateV28,
} from '../src/game/combat/CampaignEncounterEscalationV28.js';
import {
  CAMPAIGN_MINI_BOSS_AI_PROFILES_V281,
  CAMPAIGN_MINI_BOSS_AI_VERSION,
  createCampaignMiniBossAiStateV281,
  forceCampaignMiniBossRecoveryV281,
  stepCampaignMiniBossAiV281,
} from '../src/game/combat/CampaignMiniBossAiV281.js';
import {
  CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION,
  createBossPreviewLaneAttackPlanV282,
  lockBossPreviewLaneAttackPlanV282,
  projectilesFromBossPreviewLaneAttackPlanV282,
  trackBossPreviewLaneAttackPlanV282,
} from '../src/game/combat/CampaignAttackTelegraphPlanV282.js';
import {
  CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION,
  CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30,
  CAMPAIGN_ROLE_CHOREOGRAPHY_V29,
  auditCampaignCombatChoreographyV29,
  createCampaignBossPreviewMotionStateV29,
  createCampaignEnemyChoreographyStateV29,
  createCampaignMiniBossMotionStateV29,
  resolveCampaignMiniBossAnchorV29,
  stepCampaignBossPreviewMotionV29,
  stepCampaignEnemyChoreographyV29,
  stepCampaignMiniBossMotionV29,
} from '../src/game/combat/CampaignCombatChoreographyV29.js';
import {
  CAMPAIGN_BOSS_ARSENAL_VERSION,
  CAMPAIGN_BOSS_PATTERN_CATALOG_V33,
  CAMPAIGN_PLANET_BOSS_PROFILES_V33,
  CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33,
  auditCampaignBossArsenalV33,
  resolveCampaignBossPatternV33,
  resolveCampaignBossProfileV33,
} from '../src/game/combat/CampaignBossArsenalV33.js';
import {
  CAMPAIGN_BOSS_COMBAT_VERSION,
  CAMPAIGN_BOSS_PATTERN_CATALOG_V29,
  CAMPAIGN_BOSS_PHASE_COMBAT_V31,
  auditCampaignBossCombatV29,
  createCampaignBossAttackPlanV29,
  createCampaignBossCombatStateV29,
  projectilesFromCampaignBossAttackPlanV29,
  stepCampaignBossCombatV29,
} from '../src/game/combat/CampaignBossCombatV29.js';
import {
  CAMPAIGN_ENEMY_PROJECTILE_VERSION,
  advanceCampaignEnemyProjectileV31,
  auditCampaignEnemyProjectileV31,
  createCampaignEnemyShotPlanV31,
  resolveCampaignEnemyProjectileVisualV31,
} from '../src/game/combat/CampaignEnemyProjectileV31.js';
import {
  CAMPAIGN_PROJECTILE_VISUAL_VERSION,
  CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32,
  auditCampaignProjectileVisualV32,
  campaignProjectileVisualYawV32,
} from '../src/game/rendering/CampaignProjectileVisualV32.js';

const stagePlan = (options = {}) => createEnemyDirectorV2({
  seed: options.seed ?? 12345,
  stage: options.stage ?? 10,
  planetId: options.planetId ?? 1,
  difficulty: options.difficulty ?? 1,
}).buildCampaignStagePlan({
  planetId: options.planetId ?? 1,
  totalWaves: options.totalWaves ?? 15,
  hasBoss: options.hasBoss ?? true,
  baseEnemies: options.baseEnemies ?? 40,
});

test('enemy V3 catalog is the single runtime source for six readable combat roles', () => {
  assert.equal(ENEMY_COMBAT_CATALOG_VERSION, 'enemy-combat-v3.3.0');
  assert.deepEqual(auditEnemyCombatCatalogV2(), []);
  assert.equal(CAMPAIGN_PROJECTILE_VISUAL_VERSION, 'campaign-projectile-visual-v3.3.0');
  assert.deepEqual(auditCampaignProjectileVisualV32(), []);
  assert.ok(Object.keys(CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32).length >= 18);
  assert.ok(Math.abs(Math.abs(campaignProjectileVisualYawV32(0, 1)) - Math.PI) < 1e-12);
  assert.equal(Object.keys(ENEMY_ARCHETYPES_V2).length, 6);
  assert.deepEqual(Object.keys(ENEMY_RUNTIME_CATALOG_V3).sort(), Object.keys(ENEMY_ARCHETYPES_V2).sort());
  for (const [roleId, archetype] of Object.entries(ENEMY_ARCHETYPES_V2)) {
    const runtime = enemyRuntimeFromCatalogV3(roleId);
    assert.equal(runtime.tier, archetype.tier);
    assert.equal(runtime.cost, archetype.threatCost);
    assert.equal(runtime.canShoot, archetype.canShoot);
    assert.equal(runtime.hpMultiplier, archetype.hpMultiplier);
    assert.equal(runtime.speedMultiplier, archetype.speedMultiplier);
    assert.equal(runtime.contactDamage, archetype.contactDamage);
    if (archetype.canShoot) {
      assert.ok(runtime.shootMs > 0 && runtime.projectileSpeed > 0 && runtime.projectileDamage > 0);
      assert.equal(runtime.projectileAimMode, archetype.projectileAimMode);
      assert.equal(runtime.projectileLifetimeMs, archetype.projectileLifetimeMs);
      assert.equal(runtime.projectileVisualId, archetype.projectileVisualId);
      assert.ok(['predictive', 'soft_homing'].includes(runtime.projectileAimMode));
      assert.ok(runtime.projectileSpeed >= .66);
      assert.ok(runtime.shootMs <= 1650);
    }
  }
  assert.equal(BOSS_PHASES_V2.length, 3);
  assert.equal(bossPhaseForHp(.8).id, 'phase_1');
  assert.equal(bossPhaseForHp(.5).id, 'phase_2');
  assert.equal(bossPhaseForHp(.2).id, 'phase_3');
});

test('V3.2 enemy fire-control leads moving targets, guides support shots briefly and expires every projectile', () => {
  assert.equal(CAMPAIGN_ENEMY_PROJECTILE_VERSION, 'campaign-enemy-projectile-v3.2.0');
  assert.deepEqual(auditCampaignEnemyProjectileV31(), []);

  const predictive = createCampaignEnemyShotPlanV31({
    origin: { x: -2, y: 0, z: -6 },
    target: { x: 0, z: 10 },
    targetVelocity: { x: .09, z: 0 },
    projectileSpeed: .42,
    aimMode: 'predictive',
    leadFactor: .88,
    maxLeadMs: 720,
    lifetimeMs: 4200,
    sourceRole: 'gunner',
    createdAtMs: 1000,
  });
  assert.equal(Object.isFrozen(predictive), true);
  assert.equal(predictive.originKind, 'entity_muzzle');
  assert.ok(predictive.aimPoint.x > 0, 'predictive fire must lead a player moving to the right');
  assert.ok(predictive.velocity.x > 0);
  assert.equal(predictive.expiresAtMs, 5200);
  let projectilePosition = { x: predictive.origin.x, z: predictive.origin.z };
  let movingTarget = { x: predictive.targetSnapshot.x, z: predictive.targetSnapshot.z };
  let closestApproach = Number.POSITIVE_INFINITY;
  for (let frame = 0; frame < 90; frame += 1) {
    projectilePosition = {
      x: projectilePosition.x + predictive.velocity.x,
      z: projectilePosition.z + predictive.velocity.z,
    };
    movingTarget = {
      x: movingTarget.x + predictive.targetVelocitySnapshot.x,
      z: movingTarget.z + predictive.targetVelocitySnapshot.z,
    };
    closestApproach = Math.min(closestApproach, Math.hypot(
      projectilePosition.x - movingTarget.x, projectilePosition.z - movingTarget.z,
    ));
  }
  assert.ok(closestApproach < 1.2,
    'predictive gunner fire must enter the actual player hit radius instead of drifting past');

  const support = createCampaignEnemyShotPlanV31({
    origin: { x: 0, y: 0, z: -5 },
    target: { x: 0, z: 10 },
    projectileSpeed: .36,
    aimMode: 'soft_homing',
    leadFactor: .35,
    maxLeadMs: 420,
    guidanceMs: 760,
    turnRateRadians: .052,
    lifetimeMs: 4600,
    sourceRole: 'support',
    createdAtMs: 2000,
  });
  const guided = advanceCampaignEnemyProjectileV31({
    plan: support,
    position: { x: 0, z: -3 },
    velocity: support.velocity,
    target: { x: 5, z: 10 },
    targetVelocity: { x: .06, z: 0 },
    nowMs: 2300,
    frameScale: 1,
  });
  assert.equal(guided.guidanceActive, true);
  assert.ok(guided.velocity.x > support.velocity.x,
    'bounded support guidance must visibly turn toward the current player position');
  const ballistic = advanceCampaignEnemyProjectileV31({
    plan: support,
    position: { x: 1, z: 3 },
    velocity: guided.velocity,
    target: { x: -6, z: 10 },
    targetVelocity: { x: -.1, z: 0 },
    nowMs: 2900,
    frameScale: 1,
  });
  assert.equal(ballistic.guidanceActive, false,
    'support guidance must stop after the readable bounded guidance window');
  assert.deepEqual(ballistic.velocity, guided.velocity);
  const expired = advanceCampaignEnemyProjectileV31({
    plan: support,
    position: { x: 1, z: 3 },
    velocity: guided.velocity,
    target: { x: 0, z: 10 },
    nowMs: support.expiresAtMs,
    frameScale: 1,
  });
  assert.equal(expired.expired, true);
  const visual = resolveCampaignEnemyProjectileVisualV31({ sourceRole: 'gunner' });
  assert.ok(visual.length > visual.width, 'enemy fire must render as a directional bolt, not a floating sphere');
  const previewVisual = resolveCampaignEnemyProjectileVisualV31({ sourceRole: 'boss_preview' });
  assert.ok(previewVisual.length > previewVisual.width);
});

test('same seed produces the same legacy wave, campaign stage and boss plans', () => {
  const a = createEnemyDirectorV2({ seed: 12345, stage: 7, planetId: 2 });
  const b = createEnemyDirectorV2({ seed: 12345, stage: 7, planetId: 2 });
  assert.deepEqual(a.buildWavePlan({ wave: 4, count: 30 }), b.buildWavePlan({ wave: 4, count: 30 }));
  assert.deepEqual(
    a.buildCampaignStagePlan({ planetId: 2, totalWaves: 10, hasBoss: true, baseEnemies: 20 }),
    b.buildCampaignStagePlan({ planetId: 2, totalWaves: 10, hasBoss: true, baseEnemies: 20 }),
  );
  assert.deepEqual(a.buildBossAttackPlan({ cycles: 12 }), b.buildBossAttackPlan({ cycles: 12 }));
});

test('wave plan unlocks roles by stage, limits immediate repetition and uses fixed lanes', () => {
  const early = createEnemyDirectorV2({ seed: 9, stage: 1 }).buildWavePlan({ count: 30 });
  assert.equal(early.every(entry => ['raider', 'gunner'].includes(entry.archetypeId)), true);
  const late = createEnemyDirectorV2({ seed: 9, stage: 8 }).buildWavePlan({ count: 80 });
  assert.equal(late.some(entry => entry.archetypeId === 'artillery'), true);
  assert.equal(late.every(entry => [-.8, -.4, 0, .4, .8].includes(entry.lane)), true);
  let longest = 1, run = 1;
  for (let index = 1; index < late.length; index += 1) {
    run = late[index].archetypeId === late[index - 1].archetypeId ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  assert.ok(longest <= 4);
});

test('enemy stat growth is monotonic but capped instead of scaling from player combat power', () => {
  const archetype = ENEMY_ARCHETYPES_V2.gunner;
  const low = scaleEnemyStatsV2({ baseHp: 100, baseDamage: 20, baseSpeed: 1, archetype, stage: 1, wave: 1 });
  const high = scaleEnemyStatsV2({ baseHp: 100, baseDamage: 20, baseSpeed: 1, archetype, stage: 10, wave: 5, difficulty: 2 });
  assert.ok(high.hp > low.hp && high.damage > low.damage && high.speed >= low.speed);
  const capped = scaleEnemyStatsV2({ baseHp: 100, baseDamage: 20, baseSpeed: 1, archetype, stage: 100, wave: 20, difficulty: 3 });
  assert.ok(capped.hpScale <= 5 && capped.damageScale <= 4 && capped.speedScale <= 1.35);
});

test('boss plan telegraphs every attack and changes phase deterministically', () => {
  const plan = createEnemyDirectorV2({ seed: 2468, stage: 10 }).buildBossAttackPlan({ cycles: 12 });
  assert.equal(plan.every(entry => entry.fireTick - entry.telegraphTick === 30), true);
  assert.deepEqual([...new Set(plan.map(entry => entry.phaseId))], ['phase_1', 'phase_2', 'phase_3']);
});

test('V2.8 combines deterministic pacing with mini-bosses and real Boss mechanic previews', () => {
  assert.equal(CAMPAIGN_WAVE_DIRECTOR_VERSION, 'campaign-wave-director-v3.3.0');
  assert.equal(CAMPAIGN_ENCOUNTER_ESCALATION_VERSION, 'campaign-encounter-v2.8.1');
  assert.deepEqual(Object.keys(CAMPAIGN_PLANET_PROFILES_V27), ['1', '2', '3']);
  assert.ok(Object.keys(CAMPAIGN_WAVE_TEMPLATES_V27).length >= 14);

  const long = stagePlan({ totalWaves: 15, hasBoss: true, stage: 10 });
  assert.equal(long.waves.length, 15);
  assert.deepEqual(long.waves.map(wave => wave.templateId), [
    'recon', 'crossfire', 'first_rush', 'pincer', 'escort',
    'recovery_elite', 'lane_sweep', 'support_network', 'pressure_lanes',
    'mixed_pressure', 'commander', 'elite_duel', 'boss_preview_a', 'boss_preview_b', 'boss',
  ]);
  assert.equal(long.waves[4].miniBoss, true);
  assert.equal(long.waves[4].encounter.id, 'mechanical_warden');
  assert.equal(long.waves[4].entries[0].encounterMechanicId, 'lane_sweep');
  assert.equal(long.waves[4].entries[0].encounterAiProfileId, 'mechanical_warden');
  assert.equal(long.waves[4].guaranteedDrop, 'heal');
  assert.equal(long.waves[9].miniBoss, true);
  assert.equal(long.waves[9].encounter.id, 'frontline_carrier');
  assert.deepEqual(long.waves[9].entries[0].mechanicSummonRoles, ['gunner', 'raider']);
  assert.equal(long.waves[9].entries[0].encounterAiProfileId, 'frontline_carrier');
  assert.equal(long.waves[12].bossPreview, true);
  assert.equal(long.waves[12].encounter.kind, 'boss_preview');
  assert.equal(long.waves[12].entries[0].encounterMechanicId, 'lane_sweep');
  assert.equal(long.waves[13].bossPreview, true);
  assert.equal(long.waves[13].entries[0].encounterMechanicId, 'summon_escort');
  assert.equal(long.waves[14].boss, true);
  assert.equal(long.waves[14].entries.length, 0);

  const short = stagePlan({ totalWaves: 10, hasBoss: true, stage: 5, baseEnemies: 20 });
  assert.deepEqual(short.waves.map(wave => wave.templateId), [
    'recon', 'crossfire', 'first_rush', 'pincer', 'elite_duel',
    'recovery_elite', 'escort', 'mixed_pressure', 'boss_preview_a', 'boss',
  ]);
  assert.equal(short.waves[4].miniBoss, true);
  assert.equal(short.waves[8].bossPreview, true);
  assert.equal(short.waves[8].entries[0].protectUntilMechanic, true);
});

test('V2.8.2 Boss Preview uses one immutable entity-origin plan for tracking, lock, VFX width and projectile paths', () => {
  const right = createBossPreviewLaneAttackPlanV282({
    origin: { x: 4, y: 0, z: -5 },
    laneNorms: [-.6, 0, .6],
    arenaHalfWidth: 6,
    targetZ: 12,
    width: 1.25,
    createdAtMs: 1000,
    telegraphMs: 800,
    lockLeadMs: 200,
    projectileSpeed: .4,
  });
  const left = createBossPreviewLaneAttackPlanV282({
    origin: { x: -4, y: 0, z: -5 },
    laneNorms: [-.6, 0, .6],
    arenaHalfWidth: 6,
    targetZ: 12,
    width: 1.25,
    createdAtMs: 1000,
    telegraphMs: 800,
    lockLeadMs: 200,
    projectileSpeed: .4,
  });

  assert.equal(CAMPAIGN_ATTACK_TELEGRAPH_PLAN_VERSION, 'campaign-attack-telegraph-plan-v2.8.2');
  assert.throws(() => createBossPreviewLaneAttackPlanV282({ arenaHalfWidth: 6, targetZ: 12 }),
    /requires a finite entity\/muzzle world origin/);
  assert.equal(right.originSpace, 'world');
  assert.equal(right.originKind, 'entity_muzzle');
  assert.equal(right.telegraphDurationMs, 800);
  assert.equal(right.lockLeadMs, 200);
  assert.equal(Object.isFrozen(right), true);
  assert.equal(Object.isFrozen(right.paths), true);
  assert.equal(right.origin.x, 4);
  assert.equal(left.origin.x, -4);
  assert.equal(right.paths.every(path => path.origin.x === 4), true);
  assert.equal(left.paths.every(path => path.origin.x === -4), true);
  assert.notEqual(right.paths[1].yawRadians, left.paths[1].yawRadians);

  const tracked = trackBossPreviewLaneAttackPlanV282(right, {
    origin: { x: 5, y: 0, z: -4.5 },
    arenaHalfWidth: 6.5,
    targetZ: 12.5,
  });
  assert.notStrictEqual(tracked, right);
  assert.equal(tracked.phase, 'tracking');
  assert.equal(tracked.origin.x, 5);
  assert.equal(tracked.paths.every(path => path.origin.x === 5), true);

  const locked = lockBossPreviewLaneAttackPlanV282(tracked, {
    nowMs: tracked.lockAtMs,
    origin: { x: 4.75, y: 0, z: -4.25 },
    arenaHalfWidth: 6.5,
    targetZ: 12.5,
  });
  assert.equal(locked.phase, 'locked');
  assert.equal(locked.origin.x, 4.75);
  assert.equal(Object.isFrozen(locked.paths[0].origin), true);
  assert.strictEqual(trackBossPreviewLaneAttackPlanV282(locked, {
    origin: { x: -9, y: 0, z: 0 },
    arenaHalfWidth: 9,
    targetZ: 20,
  }), locked);

  const projectiles = projectilesFromBossPreviewLaneAttackPlanV282(locked);
  assert.equal(Object.isFrozen(projectiles), true);
  assert.equal(projectiles.length, locked.paths.length);
  assert.equal(projectiles.every(projectile => projectile.origin.x === locked.origin.x), true);
  assert.equal(projectiles.every(projectile => projectile.width === 1.25), true);
  projectiles.forEach((projectile, index) => {
    const path = locked.paths[index];
    const travelFrames = path.length / locked.projectileSpeed;
    assert.ok(Math.abs(projectile.origin.x + projectile.velocity.x * travelFrames - projectile.endpoint.x) < 1e-9);
    assert.ok(Math.abs(projectile.origin.z + projectile.velocity.z * travelFrames - projectile.endpoint.z) < 1e-9);
  });
});

test('V2.8.1 mini-boss AI uses deliberate anchors and repeats attack cycles instead of one-shot sine patrol', () => {
  assert.equal(CAMPAIGN_MINI_BOSS_AI_VERSION, 'campaign-mini-boss-ai-v2.8.1');
  assert.deepEqual(Object.keys(CAMPAIGN_MINI_BOSS_AI_PROFILES_V281).sort(), [
    'brood_alpha',
    'frontline_carrier',
    'inferno_charger',
    'ion_sentinel',
    'mechanical_warden',
    'repair_frigate',
  ]);
  assert.equal(Object.values(CAMPAIGN_MINI_BOSS_AI_PROFILES_V281)
    .every(profile => Array.isArray(profile.anchorLanes) && profile.anchorLanes.length >= 3), true);

  let state = createCampaignMiniBossAiStateV281({ profileId: 'mechanical_warden', nowMs: 0 });
  let step = stepCampaignMiniBossAiV281(state, {
    nowMs: 0, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 8, hpRatio: 1,
  });
  state = step.state;
  assert.equal(step.events.some(event => event.type === 'telegraph_started'), true);
  assert.equal(step.events[0].telegraph.kind, 'lane_zones');

  step = stepCampaignMiniBossAiV281(state, {
    nowMs: 900, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 8, hpRatio: 1,
  });
  state = step.state;
  assert.equal(step.events.some(event => event.type === 'telegraph_ended'), true);
  assert.equal(step.events.some(event => event.type === 'fire_lane_volley'), true);
  step = stepCampaignMiniBossAiV281(state, {
    nowMs: 1140, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 8, hpRatio: 1,
  });
  state = step.state;
  assert.equal(step.events.filter(event => event.type === 'fire_lane_volley').length, 1);
  step = stepCampaignMiniBossAiV281(state, {
    nowMs: 1380, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 8, hpRatio: 1,
  });
  state = step.state;
  assert.equal(step.events.filter(event => event.type === 'fire_lane_volley').length, 1);
  assert.equal(state.phase, 'recover');
  step = stepCampaignMiniBossAiV281(state, {
    nowMs: 3000, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 8, hpRatio: .8,
  });
  state = step.state;
  step = stepCampaignMiniBossAiV281(state, {
    nowMs: 3001, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 8, hpRatio: .8,
  });
  assert.equal(step.events.some(event => event.type === 'telegraph_started'), true);
});

test('V2.8.1 carrier mini-boss keeps firing between bounded summons and charge mini-boss recovers instead of despawning', () => {
  let carrier = createCampaignMiniBossAiStateV281({ profileId: 'frontline_carrier', nowMs: 0 });
  const carrierTelegraph = stepCampaignMiniBossAiV281(carrier, {
    nowMs: 0, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 1, playerZ: 8, hpRatio: 1, addsAlive: 0,
  });
  assert.equal(carrierTelegraph.events[0].telegraph.kind, 'summon_ring');
  carrier = carrierTelegraph.state;
  let step = stepCampaignMiniBossAiV281(carrier, {
    nowMs: 800, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 1, playerZ: 8, hpRatio: 1, addsAlive: 0,
  });
  carrier = step.state;
  assert.equal(step.events.some(event => event.type === 'summon'), true);
  step = stepCampaignMiniBossAiV281(carrier, {
    nowMs: 1000, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 1, playerZ: 8, hpRatio: 1, addsAlive: 2,
  });
  assert.equal(step.events.some(event => event.type === 'fire_aimed_burst'), true);

  let charger = createCampaignMiniBossAiStateV281({ profileId: 'inferno_charger', nowMs: 0 });
  charger = stepCampaignMiniBossAiV281(charger, {
    nowMs: 0, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 2, playerZ: 8, hpRatio: 1,
  }).state;
  step = stepCampaignMiniBossAiV281(charger, {
    nowMs: 720, atAnchor: true, enemyX: 0, enemyZ: -6, playerX: 2, playerZ: 8, hpRatio: 1,
  });
  charger = step.state;
  assert.equal(step.events.some(event => event.type === 'charge_started'), true);
  assert.equal(step.movement.mode, 'charge');
  step = stepCampaignMiniBossAiV281(charger, {
    nowMs: 1500, atAnchor: false, enemyX: 2, enemyZ: 0, playerX: 2, playerZ: 8, hpRatio: .8,
  });
  assert.equal(step.events.some(event => event.type === 'fire_aimed_burst'), true);
  assert.equal(step.state.phase, 'recover');
  assert.equal(forceCampaignMiniBossRecoveryV281(step.state, 1600).phase, 'recover');
});

 test('V2.8 Boss gates clamp burst damage at 70/35 percent and summon deterministic planet support', () => {
  let state = createBossPhaseStateV28(1);
  const first = resolveBossDamageGateV28({ state, hp: 1000, maxHp: 1000, damage: 450 });
  assert.equal(first.nextHp, 700);
  assert.equal(first.gate.id, 'mechanical_guard');
  assert.deepEqual(first.gate.summonRoles, ['shieldbearer', 'gunner']);
  state = completeBossPhaseGateV28(first.state);
  const second = resolveBossDamageGateV28({ state, hp: first.nextHp, maxHp: 1000, damage: 500 });
  assert.equal(second.nextHp, 350);
  assert.equal(second.gate.id, 'mechanical_charge');
  state = completeBossPhaseGateV28(second.state);
  const terminal = resolveBossDamageGateV28({ state, hp: second.nextHp, maxHp: 1000, damage: 500 });
  assert.equal(terminal.nextHp, 0);
  assert.equal(terminal.gate, null);

  assert.notDeepEqual(
    CAMPAIGN_ENCOUNTER_PROFILES_V28[1].bossPhases[0].summonRoles,
    CAMPAIGN_ENCOUNTER_PROFILES_V28[2].bossPhases[0].summonRoles,
  );
  assert.notDeepEqual(
    CAMPAIGN_ENCOUNTER_PROFILES_V28[2].bossPhases[0].summonRoles,
    CAMPAIGN_ENCOUNTER_PROFILES_V28[3].bossPhases[0].summonRoles,
  );

  const director = createEnemyDirectorV2({ seed: 42, stage: 10, planetId: 3 });
  const a = director.buildReinforcementPlan({ roles: ['raider', 'charger'], formation: 'pincer', groupId: 'boss-test' });
  const b = director.buildReinforcementPlan({ roles: ['raider', 'charger'], formation: 'pincer', groupId: 'boss-test' });
  assert.deepEqual(a, b);
  assert.equal(a.every(entry => entry.bossSupport), true);
});

test('V2.8 threat budgets stay readable, schedules are monotonic and early stages do not leak locked roles', () => {
  const early = stagePlan({ stage: 1, totalWaves: 5, hasBoss: false, baseEnemies: 5 });
  const allowedEarly = new Set(['raider', 'gunner']);
  for (const wave of early.waves) {
    assert.ok(wave.threatBudget >= 6 && wave.threatBudget <= 46);
    assert.ok(wave.entries.length > 0 && wave.entries.length <= 46);
    assert.equal(wave.entries.every(entry => allowedEarly.has(entry.archetypeId)), true);
    assert.equal(wave.entries.every((entry, index, list) => index === 0 || entry.spawnOffsetMs > list[index - 1].spawnOffsetMs), true);
    assert.equal(wave.entries.every(entry => [-.8, -.4, 0, .4, .8].includes(entry.lane)), true);
  }
  const generic = stagePlan({ stage: 9, totalWaves: 12, hasBoss: false, baseEnemies: 35 });
  assert.equal(generic.waves.at(-1).templateId, 'finale');
  assert.equal(generic.waves.some(wave => wave.templateId === 'recovery_elite'), true);
  assert.equal(generic.waves.every((wave, index, waves) => index === 0 || wave.templateId !== waves[index - 1].templateId), true);
});

test('planet profiles create distinct deterministic compositions without changing stage length or boss position', () => {
  const alpha = stagePlan({ planetId: 1, seed: 99 });
  const cryo = stagePlan({ planetId: 2, seed: 99 });
  const inferno = stagePlan({ planetId: 3, seed: 99 });
  assert.equal(alpha.waves.length, cryo.waves.length);
  assert.equal(cryo.waves.length, inferno.waves.length);
  assert.equal(alpha.waves.at(-1).boss, true);
  assert.equal(cryo.waves.at(-1).boss, true);
  assert.equal(inferno.waves.at(-1).boss, true);
  assert.notEqual(alpha.planetProfileId, cryo.planetProfileId);
  assert.notEqual(cryo.planetProfileId, inferno.planetProfileId);
  const signature = plan => plan.waves.slice(0, -1)
    .flatMap(wave => wave.entries.map(entry => entry.archetypeId)).join('|');
  assert.notEqual(signature(alpha), signature(cryo));
  assert.notEqual(signature(cryo), signature(inferno));
});

test('V3 wave power, planet identity and scout route mix are deterministic and materially different', () => {
  assert.deepEqual(auditCampaignEnemyDirectorV3(), []);
  const directorSource = fs.readFileSync(
    new URL('../src/game/combat/DeterministicEnemyDirectorV2.js', import.meta.url), 'utf8');
  assert.doesNotMatch(directorSource, /LEGACY_ROLE_RUNTIME_V27/,
    'role runtime values must be projected from EnemyCombatCatalogV2');

  const alphaEarly = resolveCampaignWavePowerV3({
    planetId: 1, stage: 5, wave: 1, totalWaves: 10, difficulty: 1.1, templateId: 'recon',
  });
  const alphaLate = resolveCampaignWavePowerV3({
    planetId: 1, stage: 5, wave: 9, totalWaves: 10, difficulty: 1.1, templateId: 'recon',
  });
  const cryoEarly = resolveCampaignWavePowerV3({
    planetId: 2, stage: 5, wave: 1, totalWaves: 10, difficulty: 1.1, templateId: 'recon',
  });
  const infernoEarly = resolveCampaignWavePowerV3({
    planetId: 3, stage: 5, wave: 1, totalWaves: 10, difficulty: 1.1, templateId: 'recon',
  });
  assert.ok(alphaLate.hpMultiplier > alphaEarly.hpMultiplier);
  assert.ok(alphaLate.damageMultiplier > alphaEarly.damageMultiplier);
  assert.ok(alphaLate.speedMultiplier > alphaEarly.speedMultiplier);
  assert.ok(alphaLate.fireCooldownMultiplier < alphaEarly.fireCooldownMultiplier);
  assert.ok(cryoEarly.hpMultiplier > alphaEarly.hpMultiplier,
    'Cryo must be tougher than Alpha');
  assert.ok(cryoEarly.damageMultiplier > alphaEarly.damageMultiplier
    && infernoEarly.damageMultiplier > cryoEarly.damageMultiplier,
  'planet damage must increase Alpha < Cryo < Inferno');
  assert.ok(cryoEarly.speedMultiplier > alphaEarly.speedMultiplier
    && infernoEarly.speedMultiplier > cryoEarly.speedMultiplier,
  'planet movement pressure must increase Alpha < Cryo < Inferno');
  assert.ok(cryoEarly.projectileSpeedMultiplier > alphaEarly.projectileSpeedMultiplier
    && infernoEarly.projectileSpeedMultiplier > cryoEarly.projectileSpeedMultiplier,
  'hostile projectile speed must increase by planet');
  assert.ok(cryoEarly.fireCooldownMultiplier < alphaEarly.fireCooldownMultiplier
    && infernoEarly.fireCooldownMultiplier < cryoEarly.fireCooldownMultiplier,
  'hostile fire cadence must become faster by planet');

  const tierBase = (planetId, tier) => PLANET_ENEMIES[planetId].find(enemy => enemy.tier === tier);
  for (const tier of [1, 2, 3, 4]) {
    const alphaBase = tierBase(1, tier);
    const cryoBase = tierBase(2, tier);
    const infernoBase = tierBase(3, tier);
    assert.ok(alphaBase && cryoBase && infernoBase);
    assert.ok(cryoBase.baseHp > alphaBase.baseHp, `Cryo tier ${tier} must exceed Alpha base HP`);
    assert.ok(infernoBase.baseHp > cryoBase.baseHp, `Inferno tier ${tier} must exceed Cryo base HP`);
  }
  const alphaTier1EffectiveHp = tierBase(1, 1).baseHp * alphaEarly.hpMultiplier;
  const cryoTier1EffectiveHp = tierBase(2, 1).baseHp * cryoEarly.hpMultiplier;
  const infernoTier1EffectiveHp = tierBase(3, 1).baseHp * infernoEarly.hpMultiplier;
  assert.ok(alphaTier1EffectiveHp < cryoTier1EffectiveHp
    && cryoTier1EffectiveHp < infernoTier1EffectiveHp);
  assert.ok(infernoTier1EffectiveHp / alphaTier1EffectiveHp < 4,
    'planet scaling must remain strong but bounded instead of multiplying the legacy environment HP twice');

  const routeTotals = new Map([[1, { flyby: 0, hook_return: 0 }],
    [2, { flyby: 0, hook_return: 0 }], [3, { flyby: 0, hook_return: 0 }]]);
  for (const planetId of [1, 2, 3]) {
    for (let seed = 1; seed <= 24; seed += 1) {
      const plan = createEnemyDirectorV2({ seed, stage: 5, planetId, difficulty: 1.1 })
        .buildCampaignStagePlan({ planetId, totalWaves: 10, hasBoss: true, baseEnemies: 20 });
      for (const wave of plan.waves) {
        for (const entry of wave.entries) {
          assert.ok(ENEMY_RUNTIME_CATALOG_V3[entry.archetypeId]);
          assert.ok(entry.hpMultiplier > 0 && entry.speedMultiplier > 0 && entry.contactDamage > 0);
          assert.ok(Number.isFinite(entry.spawnOffsetMs) && Number.isFinite(entry.damageMultiplier));
          if (entry.canShoot) {
            assert.ok(entry.shootMs >= 560 && entry.projectileSpeed > 0 && entry.projectileDamage > 0);
            assert.ok(['predictive', 'soft_homing'].includes(entry.projectileAimMode));
            assert.ok(entry.projectileLifetimeMs >= 1600);
            if (entry.projectileAimMode === 'soft_homing') {
              assert.ok(entry.projectileGuidanceMs > 0 && entry.projectileTurnRateRadians > 0);
            }
          }
          if (entry.archetypeId === 'raider') routeTotals.get(planetId)[entry.routeVariant] += 1;
        }
      }
    }
  }
  const ratio = planetId => {
    const totals = routeTotals.get(planetId);
    return totals.hook_return / (totals.hook_return + totals.flyby);
  };
  assert.ok(routeTotals.get(1).flyby > 0 && routeTotals.get(1).hook_return > 0);
  assert.ok(routeTotals.get(2).flyby > 0 && routeTotals.get(2).hook_return > 0);
  assert.ok(routeTotals.get(3).flyby > 0 && routeTotals.get(3).hook_return > 0);
  assert.ok(ratio(1) > .55, `Alpha scouts should usually return, ratio=${ratio(1)}`);
  assert.ok(ratio(2) > .65, `Cryo scouts should strongly favor return passes, ratio=${ratio(2)}`);
  assert.ok(ratio(3) < .45, `Inferno scouts should favor aggressive flybys, ratio=${ratio(3)}`);
  assert.ok(ratio(2) > ratio(1) && ratio(1) > ratio(3));
});

test('V3 catalog-backed choreography is fast, finite and supports both scout flyby and return routes', () => {
  assert.equal(CAMPAIGN_COMBAT_CHOREOGRAPHY_VERSION, 'campaign-combat-choreography-v3.2.0');
  assert.deepEqual(auditCampaignCombatChoreographyV29(), []);
  assert.deepEqual(Object.keys(CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30).sort(), ['flyby', 'hook_return']);
  assert.deepEqual(
    Object.values(ENEMY_ARCHETYPES_V2).map(archetype => archetype.behavior).sort(),
    Object.keys(CAMPAIGN_ROLE_CHOREOGRAPHY_V29).sort(),
  );

  for (const roleId of Object.keys(ENEMY_ARCHETYPES_V2)) {
    const state = createCampaignEnemyChoreographyStateV29({
      roleId, lane: .4, strafeDirection: -1, seed: 77, nowMs: 0,
      routeVariant: roleId === 'raider' ? 'hook_return' : null,
    });
    const first = stepCampaignEnemyChoreographyV29(state, {
      nowMs: 0, frameScale: 1, baseSpeed: .035,
      enemyX: 2, enemyZ: -16.8, playerX: 0, playerZ: 12,
      arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
      hudOcclusionLineZ: -9.3,
    });
    if (roleId === 'charger') {
      assert.equal(first.handled, false);
      assert.equal(state.externalController, 'CampaignRuntimeReliabilityV26A3');
      continue;
    }
    assert.equal(first.handled, true);
    assert.equal(Number.isFinite(first.targetX) && Number.isFinite(first.targetZ), true);
    const lockedTarget = [state.targetX, state.targetZ];
    stepCampaignEnemyChoreographyV29(state, {
      nowMs: 120, frameScale: 1, baseSpeed: .035,
      enemyX: 2, enemyZ: -16.8, playerX: -6, playerZ: 8,
      arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
      hudOcclusionLineZ: -9.3,
    });
    assert.deepEqual([state.targetX, state.targetZ], lockedTarget,
      `${roleId} must not retarget every render frame`);
  }

  const expectations = [
    { roleId: 'raider', routeVariant: 'flyby', maxMs: 5600,
      required: ['flank_approach', 'commit_cross', 'egress'] },
    { roleId: 'raider', routeVariant: 'hook_return', maxMs: 8500,
      required: ['flank_approach', 'commit_cross', 'hook_turn', 'return_pass', 'egress'] },
    { roleId: 'gunner', maxMs: 7600,
      required: ['firing_slot', 'strafe_a', 'strafe_b', 'egress'] },
    { roleId: 'shieldbearer', maxMs: 7400,
      required: ['guard_approach', 'guard_hold_a', 'guard_hold_b', 'egress'] },
    { roleId: 'support', maxMs: 7800,
      required: ['support_slot', 'orbit_0', 'orbit_1', 'orbit_2', 'egress'] },
    { roleId: 'artillery', maxMs: 8200,
      required: ['battery_approach', 'brace_a', 'battery_relocate', 'brace_b', 'egress'] },
  ];

  for (const expected of expectations) {
    const state = createCampaignEnemyChoreographyStateV29({
      roleId: expected.roleId,
      routeVariant: expected.routeVariant,
      lane: .4, strafeDirection: -1, seed: 77, nowMs: 0,
    });
    let enemyX = 2;
    let enemyZ = -16.8;
    let nowMs = 0;
    let result = null;
    let maxStep = 0;
    let stationaryFrames = 0;
    let sawFireWindow = false;
    const seenPhases = [];
    let lastPhase = null;
    for (let frame = 0; frame < 900; frame += 1) {
      result = stepCampaignEnemyChoreographyV29(state, {
        nowMs, frameScale: 1, baseSpeed: .035,
        enemyX, enemyZ, playerX: 0, playerZ: 12,
        arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
        hudOcclusionLineZ: -9.3, separationX: 0, separationZ: 0,
        fireCooldownMs: 1475,
      });
      if (result.phaseId !== lastPhase) {
        seenPhases.push(result.phaseId);
        lastPhase = result.phaseId;
      }
      sawFireWindow ||= Boolean(result.mayFire);
      const step = Math.hypot(result.deltaX || 0, result.deltaZ || 0);
      maxStep = Math.max(maxStep, step);
      if (step < .005) stationaryFrames += 1;
      if (result.completed) break;
      enemyX += result.deltaX;
      enemyZ += result.deltaZ;
      nowMs += 1000 / 60;
    }
    assert.equal(result?.completed, true, `${expected.roleId}:${expected.routeVariant || 'default'} must complete`);
    assert.ok(nowMs <= expected.maxMs,
      `${expected.roleId}:${expected.routeVariant || 'default'} is too slow: ${nowMs}ms`);
    assert.deepEqual(seenPhases.filter(id => id !== 'complete'), expected.required);
    assert.ok(enemyZ >= 17.7,
      `${expected.roleId} may be removed only after leaving the visible arena, got z=${enemyZ}`);
    assert.ok(maxStep <= .15, `${expected.roleId} steering step must remain readable, got ${maxStep}`);
    const stationaryLimit = expected.roleId === 'artillery' ? 90 : 16;
    assert.ok(stationaryFrames <= stationaryLimit,
      `${expected.roleId} must not spend the route drifting or idling (${stationaryFrames} frames)`);
    if (['gunner', 'support', 'artillery'].includes(expected.roleId)) {
      assert.equal(sawFireWindow, true, `${expected.roleId} must expose a moving/settled fire window`);
    }
  }

  const staggerA = createCampaignEnemyChoreographyStateV29({
    roleId: 'gunner', lane: .2, strafeDirection: 1, seed: 71, nowMs: 0,
  });
  const staggerB = createCampaignEnemyChoreographyStateV29({
    roleId: 'gunner', lane: .2, strafeDirection: 1, seed: 72, nowMs: 0,
  });
  assert.notDeepEqual(
    [staggerA.timingJitterMs, staggerA.laneBiasNorm, staggerA.depthBias],
    [staggerB.timingJitterMs, staggerB.laneBiasNorm, staggerB.depthBias],
    'same-role enemies need deterministic spatial/timing variation instead of synchronized rows',
  );
  const commonInput = {
    nowMs: 0, frameScale: 1, baseSpeed: .035,
    enemyX: 0, enemyZ: -16.8, playerX: 0, playerZ: 12,
    arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
    hudOcclusionLineZ: -9.3,
  };
  const staggerStepA = stepCampaignEnemyChoreographyV29(staggerA, commonInput);
  const staggerStepB = stepCampaignEnemyChoreographyV29(staggerB, commonInput);
  assert.notDeepEqual(
    [staggerStepA.targetX, staggerStepA.targetZ],
    [staggerStepB.targetX, staggerStepB.targetZ],
    'deterministic variation must reach authored movement targets',
  );

  const flyby = createCampaignEnemyChoreographyStateV29({
    roleId: 'raider', routeVariant: 'flyby', seed: 3, nowMs: 0,
  });
  const returning = createCampaignEnemyChoreographyStateV29({
    roleId: 'raider', routeVariant: 'hook_return', seed: 3, nowMs: 0,
  });
  assert.equal(flyby.routeVariant, 'flyby');
  assert.equal(returning.routeVariant, 'hook_return');
  assert.equal(CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30.flyby.phases.some(item => item.id === 'return_pass'), false);
  assert.equal(CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30.hook_return.phases.some(item => item.id === 'return_pass'), true);
});

test('V2.9 Boss Preview and Mini-Boss motion preserve attack locks and a dynamic HUD-safe combat band', () => {
  const compact = resolveCampaignMiniBossAnchorV29({
    profileId: 'mechanical_warden', cycle: 0, targetLane: 0,
    requestedOffsetZ: 5.4, arenaHalfWidth: 7, worldHalfHeight: 15,
    viewportHeight: 852, hudOcclusionLineZ: -9.3,
    entityScale: 1.1, hpBarOffsetPx: -36, hpBarHeightPx: 8, playerZ: 12,
  });
  const large = resolveCampaignMiniBossAnchorV29({
    profileId: 'mechanical_warden', cycle: 0, targetLane: 0,
    requestedOffsetZ: 5.4, arenaHalfWidth: 7, worldHalfHeight: 15,
    viewportHeight: 852, hudOcclusionLineZ: -9.3,
    entityScale: 1.8, hpBarOffsetPx: -52, hpBarHeightPx: 8, playerZ: 12,
  });
  assert.ok(compact.z >= compact.topSafeRootZ);
  assert.ok(large.z >= large.topSafeRootZ);
  assert.ok(large.z > compact.z, 'larger Mini-Boss must be placed farther below the HUD');

  const miniMotion = createCampaignMiniBossMotionStateV29();
  miniMotion.velocityX = .08;
  miniMotion.velocityZ = .06;
  const held = stepCampaignMiniBossMotionV29(miniMotion, {
    profileId: 'mechanical_warden', mode: 'hold', frameScale: 1,
    enemyX: 0, enemyZ: -6, targetX: 2, targetZ: -4, baseSpeed: .05,
  });
  assert.deepEqual([held.deltaX, held.deltaZ, held.velocityX, held.velocityZ], [0, 0, 0, 0]);

  const preview = createCampaignBossPreviewMotionStateV29({
    lane: .4, strafeDirection: 1, seed: 11, nowMs: 0,
  });
  const moving = stepCampaignBossPreviewMotionV29(preview, {
    nowMs: 0, frameScale: 1, baseSpeed: .05,
    enemyX: 2, enemyZ: -7, playerX: 0, playerZ: 12,
    arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
    hudOcclusionLineZ: -9.3, mechanicPhase: 'idle', attackPlanPhase: 'none',
  });
  const clockOnly = stepCampaignBossPreviewMotionV29(preview, {
    nowMs: 5000, frameScale: 1, baseSpeed: .05,
    enemyX: 2, enemyZ: -7, playerX: 0, playerZ: 12,
    arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
    hudOcclusionLineZ: -9.3, mechanicPhase: 'idle', attackPlanPhase: 'none',
  });
  assert.equal(clockOnly.phaseId, 'preposition');
  assert.equal(clockOnly.canArm, false,
    'Boss Preview may arm only after reaching its authored attack slot');
  stepCampaignBossPreviewMotionV29(preview, {
    nowMs: 5020, frameScale: 1, baseSpeed: .05,
    enemyX: preview.targetX, enemyZ: preview.targetZ, playerX: 0, playerZ: 12,
    arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
    hudOcclusionLineZ: -9.3, mechanicPhase: 'idle', attackPlanPhase: 'none',
  });
  const ready = stepCampaignBossPreviewMotionV29(preview, {
    nowMs: 5370, frameScale: 1, baseSpeed: .05,
    enemyX: preview.targetX, enemyZ: preview.targetZ, playerX: 0, playerZ: 12,
    arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
    hudOcclusionLineZ: -9.3, mechanicPhase: 'idle', attackPlanPhase: 'none',
  });
  assert.equal(moving.handled, true);
  assert.equal(ready.canArm, true);
  const tracking = stepCampaignBossPreviewMotionV29(preview, {
    nowMs: 5390, frameScale: 1, baseSpeed: .05,
    enemyX: preview.targetX, enemyZ: preview.targetZ, playerX: 5, playerZ: 12,
    arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
    hudOcclusionLineZ: -9.3, mechanicPhase: 'telegraph',
    attackPlanPhase: 'tracking', attackPlanId: 'preview-plan-right',
  });
  assert.equal(tracking.phaseId, 'tracking_drift');
  assert.ok(Math.hypot(tracking.deltaX, tracking.deltaZ) > 0,
    'Boss Preview should keep a bounded drift while the V2.8.2 plan tracks its muzzle');
  const attackHold = stepCampaignBossPreviewMotionV29(preview, {
    nowMs: 5420, frameScale: 1, baseSpeed: .05,
    enemyX: preview.targetX + tracking.deltaX,
    enemyZ: preview.targetZ + tracking.deltaZ,
    playerX: 5, playerZ: 12,
    arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852,
    hudOcclusionLineZ: -9.3, mechanicPhase: 'telegraph',
    attackPlanPhase: 'locked', attackPlanId: 'preview-plan-right',
  });
  assert.equal(attackHold.holdOrientation, true);
  assert.equal(attackHold.deltaX, 0);
  assert.equal(attackHold.deltaZ, 0);
});

test('V3.3 Boss arsenal gives all six final Bosses distinct deterministic mechanics and ordered planet power', () => {
  assert.equal(CAMPAIGN_BOSS_ARSENAL_VERSION, 'campaign-boss-arsenal-v3.3.0');
  assert.equal(CAMPAIGN_BOSS_COMBAT_VERSION, 'campaign-boss-combat-v3.3.0');
  assert.deepEqual(auditCampaignBossArsenalV33(), []);
  assert.deepEqual(auditCampaignBossCombatV29(), []);
  assert.equal(Object.keys(CAMPAIGN_BOSS_PATTERN_CATALOG_V33).length, 12);
  assert.strictEqual(CAMPAIGN_BOSS_PATTERN_CATALOG_V29, CAMPAIGN_BOSS_PATTERN_CATALOG_V33);

  const profiles = [1, 2, 3].flatMap(planetId =>
    ['mech', 'alien'].map(bossType => resolveCampaignBossProfileV33({ planetId, bossType })));
  assert.equal(profiles.length, 6);
  assert.deepEqual(profiles.map(profile => profile.powerRank), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(profiles.map(profile => profile.id)).size, 6);
  assert.equal(new Set(profiles.map(profile => Object.values(profile.phasePatterns).flat().join('|'))).size, 6);
  for (let index = 1; index < profiles.length; index += 1) {
    assert.ok(profiles[index].baseProjectileDamage > profiles[index - 1].baseProjectileDamage);
    assert.ok(profiles[index].projectileSpeedMultiplier >= profiles[index - 1].projectileSpeedMultiplier);
    assert.ok(profiles[index].recoveryMultiplier < profiles[index - 1].recoveryMultiplier);
  }
  for (const profile of profiles) {
    for (const [phaseId, patternIds] of Object.entries(profile.phasePatterns)) {
      for (const pattern of patternIds) {
        const plan = createCampaignBossAttackPlanV29({
          pattern, planetId: profile.planetId, bossType: profile.bossType,
          origin: { x: 0, y: 0, z: -6 }, playerX: 1.5, playerZ: 11,
          playerVelocityX: .06, playerVelocityZ: 0,
          arenaHalfWidth: 7, worldHalfHeight: 15, createdAtMs: 1000,
          cycle: 2, phaseId,
        });
        assert.equal(plan.bossProfileId, profile.id);
        assert.equal(plan.planetId, profile.planetId);
        assert.equal(plan.bossType, profile.bossType);
        assert.ok(plan.paths.length > 0, `${profile.id}:${pattern} needs a non-empty projectile plan`);
        const latestOffset = Math.max(...plan.paths.map(path => path.fireOffsetMs));
        assert.equal(plan.latestFireOffsetMs, latestOffset);
        assert.ok(plan.recoveryMs >= latestOffset + plan.postVolleyHoldMs,
          `${profile.id}:${pattern} recovery must retain the plan until every delayed shot has spawned`);
        assert.ok(plan.postVolleyHoldMs >= 100);
        assert.equal(Object.isFrozen(plan), true);
      }
    }
  }
  assert.ok(CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[1].previewProjectileSpeed
    < CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[2].previewProjectileSpeed);
  assert.ok(CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[2].previewProjectileSpeed
    < CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[3].previewProjectileSpeed);
  assert.ok(CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[1].miniBossProjectileSpeedMultiplier
    < CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[2].miniBossProjectileSpeedMultiplier);
  assert.ok(CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[2].miniBossProjectileSpeedMultiplier
    < CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[3].miniBossProjectileSpeedMultiplier);

  const alpha = createCampaignBossAttackPlanV29({
    pattern: 'alpha_lock_burst', planetId: 1, bossType: 'mech',
    origin: { x: -2, y: 0, z: -6 }, playerX: 0, playerZ: 11,
    playerVelocityX: .08, playerVelocityZ: 0,
    arenaHalfWidth: 7, worldHalfHeight: 15, createdAtMs: 1000, cycle: 0, phaseId: 'phase_1',
  });
  assert.equal(alpha.bossProfileId, 'alpha_mech_sentinel');
  assert.equal(alpha.patternFamily, 'alpha');
  assert.equal(alpha.paths.length, 3);
  assert.ok(alpha.predictedPlayer.x > 0, 'Alpha rail burst must lead a moving player');
  assert.equal(alpha.visualId, 'boss_alpha_rail');

  const cryo = createCampaignBossAttackPlanV29({
    pattern: 'cryo_absolute_zero', planetId: 2, bossType: 'alien',
    origin: { x: 1, y: 0, z: -6 }, playerX: -4, playerZ: 11,
    arenaHalfWidth: 7, worldHalfHeight: 15, createdAtMs: 1000, cycle: 2, phaseId: 'phase_3',
  });
  assert.equal(cryo.bossProfileId, 'cryo_alien_dragon');
  assert.equal(cryo.patternFamily, 'cryo');
  assert.equal(cryo.visualId, 'boss_cryo_wall');
  assert.equal(cryo.paths.length, 30, 'Cryo Absolute Zero must produce three shifting lane walls with one readable gap');
  assert.equal(cryo.paths.every(path => path.direction.z > 0), true);

  const inferno = createCampaignBossAttackPlanV29({
    pattern: 'inferno_eruption', planetId: 3, bossType: 'mech',
    origin: { x: 3, y: 0, z: -5 }, playerX: -1, playerZ: 11,
    arenaHalfWidth: 7, worldHalfHeight: 15, createdAtMs: 1000, cycle: 2, phaseId: 'phase_3',
  });
  assert.equal(inferno.bossProfileId, 'inferno_mech_forge');
  assert.equal(inferno.patternFamily, 'inferno');
  assert.equal(inferno.paths.length, 18,
    'Inferno frenzy arc must keep a three-slot escape gap in a 21-slot forward arc');
  assert.equal(inferno.paths.every(path => path.direction.z > 0), true,
    'Inferno eruption must pressure down-screen and never shoot above the Boss');
  assert.equal(inferno.visualId, 'boss_inferno_ember');

  assert.notEqual(alpha.pattern, cryo.pattern);
  assert.notEqual(cryo.pattern, inferno.pattern);
  assert.ok(cryo.projectileDamage > alpha.projectileDamage);
  assert.ok(cryo.projectileSpeed > alpha.projectileSpeed);
  assert.ok(inferno.projectileSpeed > cryo.projectileSpeed);
  assert.ok(inferno.recoveryMs < cryo.recoveryMs,
    'Inferno must trade denser pressure and shorter recovery for fewer lane-wall bullets');

  const projectiles = projectilesFromCampaignBossAttackPlanV29(inferno);
  assert.equal(projectiles.length, inferno.paths.length);
  projectiles.forEach((projectile, index) => {
    assert.strictEqual(projectile.origin, inferno.paths[index].origin);
    assert.deepEqual(projectile.velocity, inferno.paths[index].velocity);
    assert.equal(projectile.rawDamage, inferno.projectileDamage);
    assert.equal(projectile.damageType, 'explosive');
    assert.equal(projectile.bossProfileId, 'inferno_mech_forge');
  });
});

test('V3.3 final Boss preserves deterministic reposition-aim-telegraph-fire-recover plans per profile', () => {
  const runToTelegraph = () => {
    const state = createCampaignBossCombatStateV29({
      seed: 91, nowMs: 0, planetId: 2, bossType: 'alien',
    });
    assert.equal(state.profileId, 'cryo_alien_dragon');
    const first = stepCampaignBossCombatV29(state, {
      nowMs: 0, hpRatio: 1, frameScale: 1, baseSpeed: .045,
      enemyX: 0, enemyZ: -7, playerX: 1, playerZ: 12,
      playerVelocityX: .05, playerVelocityZ: 0,
      origin: { x: 0, y: 0, z: -5.1 }, arenaHalfWidth: 7, worldHalfHeight: 15,
      viewportHeight: 852, hudOcclusionLineZ: -9.3,
    });
    const clockOnly = stepCampaignBossCombatV29(state, {
      nowMs: 5000, hpRatio: 1, frameScale: 1, baseSpeed: .045,
      enemyX: 0, enemyZ: -7, playerX: 1, playerZ: 12,
      playerVelocityX: .05, playerVelocityZ: 0,
      origin: { x: 0, y: 0, z: -5.1 }, arenaHalfWidth: 7, worldHalfHeight: 15,
      viewportHeight: 852, hudOcclusionLineZ: -9.3,
    });
    assert.equal(clockOnly.phase, 'reposition',
      'Boss may aim only after reaching the selected combat anchor');
    const aimed = stepCampaignBossCombatV29(state, {
      nowMs: 5020, hpRatio: 1, frameScale: 1, baseSpeed: .045,
      enemyX: state.targetX, enemyZ: state.targetZ, playerX: 1, playerZ: 12,
      playerVelocityX: .05, playerVelocityZ: 0,
      origin: { x: state.targetX, y: 0, z: state.targetZ + 1.9 },
      arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852, hudOcclusionLineZ: -9.3,
    });
    assert.equal(first.phase, 'reposition');
    assert.equal(aimed.phase, 'aim');
    assert.equal(aimed.facePlayer, true);
    const telegraph = stepCampaignBossCombatV29(state, {
      nowMs: 5360, hpRatio: 1, frameScale: 1, baseSpeed: .045,
      enemyX: state.targetX, enemyZ: state.targetZ, playerX: 1, playerZ: 12,
      playerVelocityX: .05, playerVelocityZ: 0,
      origin: { x: state.targetX + .25, y: 0, z: state.targetZ + 1.82 },
      arenaHalfWidth: 7, worldHalfHeight: 15, viewportHeight: 852, hudOcclusionLineZ: -9.3,
    });
    return { state, telegraph };
  };
  const a = runToTelegraph();
  const b = runToTelegraph();
  assert.equal(a.telegraph.events[0].type, 'telegraph_started');
  assert.deepEqual(a.telegraph.events[0].plan, b.telegraph.events[0].plan);
  assert.equal(a.telegraph.events[0].plan.bossProfileId, 'cryo_alien_dragon');
  assert.equal(a.telegraph.events[0].plan.patternFamily, 'cryo');
  assert.equal(a.telegraph.deltaX, 0);
  assert.equal(a.telegraph.deltaZ, 0);
  const plan = a.telegraph.events[0].plan;
  const fired = stepCampaignBossCombatV29(a.state, {
    nowMs: plan.telegraphEndsAtMs, hpRatio: 1, frameScale: 1, baseSpeed: .045,
    enemyX: a.state.targetX, enemyZ: a.state.targetZ, playerX: -4, playerZ: 8,
    playerVelocityX: -.12, playerVelocityZ: 0,
    origin: { x: -9, y: 0, z: -9 }, arenaHalfWidth: 7, worldHalfHeight: 15,
    viewportHeight: 852, hudOcclusionLineZ: -9.3,
  });
  assert.equal(fired.events.some(event => event.type === 'fire_pattern'), true);
  assert.strictEqual(fired.events.find(event => event.type === 'fire_pattern').plan, plan);
  assert.equal(fired.phase, 'recover');
});

test('V3.3 final Boss frenzy is a persistent phase upgrade inside each planet-specific arsenal', () => {
  assert.ok(CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_3.movementMultiplier
    > CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_2.movementMultiplier);
  assert.ok(CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_3.recoveryMultiplier
    < CAMPAIGN_BOSS_PHASE_COMBAT_V31.phase_2.recoveryMultiplier);

  const calm = createCampaignBossAttackPlanV29({
    pattern: 'inferno_meteor_burst', planetId: 3, bossType: 'alien',
    origin: { x: 0, y: 0, z: -5 }, playerX: 2, playerZ: 10,
    createdAtMs: 1000, cycle: 0, phaseId: 'phase_1',
  });
  const frenzy = createCampaignBossAttackPlanV29({
    pattern: 'inferno_meteor_burst', planetId: 3, bossType: 'alien',
    origin: { x: 0, y: 0, z: -5 }, playerX: 2, playerZ: 10,
    createdAtMs: 1000, cycle: 0, phaseId: 'phase_3',
  });
  assert.equal(calm.paths.length, 6);
  assert.equal(frenzy.paths.length, 8);
  assert.ok(frenzy.projectileSpeed > calm.projectileSpeed);
  assert.ok(frenzy.projectileDamage > calm.projectileDamage);
  assert.ok(frenzy.recoveryMs < calm.recoveryMs);
  assert.equal(frenzy.frenzyLevel, 2);

  const state = createCampaignBossCombatStateV29({
    seed: 23, nowMs: 0, planetId: 3, bossType: 'alien',
  });
  const entered = stepCampaignBossCombatV29(state, {
    nowMs: 100, hpRatio: .29, frameScale: 1, baseSpeed: .045,
    enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 12,
    origin: { x: 0, y: 0, z: -4.1 }, arenaHalfWidth: 7, worldHalfHeight: 15,
    viewportHeight: 852, hudOcclusionLineZ: -9.3,
  });
  assert.equal(entered.phase, 'enrage');
  assert.equal(entered.deltaX, 0);
  assert.equal(entered.deltaZ, 0);
  assert.equal(entered.visualState, 'enrage');
  assert.equal(entered.events.some(event => event.type === 'enrage_started'), true);
  assert.equal(state.currentPhaseId, 'phase_3');
  assert.equal(state.profileId, 'inferno_alien_demon');

  const held = stepCampaignBossCombatV29(state, {
    nowMs: 950, hpRatio: .29, frameScale: 1, baseSpeed: .045,
    enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 12,
    origin: { x: 0, y: 0, z: -4.1 }, arenaHalfWidth: 7, worldHalfHeight: 15,
    viewportHeight: 852, hudOcclusionLineZ: -9.3,
  });
  assert.equal(held.phase, 'enrage');
  const released = stepCampaignBossCombatV29(state, {
    nowMs: 1001, hpRatio: .29, frameScale: 1, baseSpeed: .045,
    enemyX: 0, enemyZ: -6, playerX: 0, playerZ: 12,
    origin: { x: 0, y: 0, z: -4.1 }, arenaHalfWidth: 7, worldHalfHeight: 15,
    viewportHeight: 852, hudOcclusionLineZ: -9.3,
  });
  assert.equal(released.phase, 'reposition');
  assert.equal(released.events.some(event => event.type === 'enrage_finished'), true);
});

test('Campaign source enables V3 enemy combat in production while preserving V2.8/V2.8.2 contracts and an explicit kill switch', () => {
  const source = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  assert.match(source, /campaignCombatV3Enabled=import\.meta\.env\.VITE_SF_CAMPAIGN_COMBAT_V3!==['\"]false['\"]/);
  assert.match(source, /campaignWaveDirector=campaignCombatV3Enabled\?createEnemyDirectorV2/);
  assert.doesNotMatch(source, /campaignWaveDirector=guestAbilityQa\?createEnemyDirectorV2/);
  assert.match(source, /stableSeed\(['\"]campaign-wave-v30['\"]/);
  assert.match(source, /buildCampaignStagePlan\(\{/);
  assert.match(source, /spawnEnemy\(nextSpec\)/);
  assert.match(source, /currentWavePlan\.entries\[waveSpawned\]/);
  assert.match(source, /currentWavePlan\?\.guaranteedDrop/);

  assert.match(source, /stepEncounterMechanic\(e,now\)/);
  assert.match(source, /buildReinforcementPlan\(\{/);
  assert.match(source, /resolveBossDamageGateV28\(\{/);
  assert.match(source, /beginBossPhaseTransition\(gateResult\.gate\)/);
  assert.match(source, /bossPhaseState=campaignCombatV3Enabled\?createBossPhaseStateV28/);
  assert.match(source, /stepMiniBossEnemy\(e,now,enemyFrame,frameDeltaMs\)/);
  assert.match(source, /createMuzzleChargeTelegraph/);
  assert.match(source, /telegraph\.kind === ['\"]summon_ring['\"]/);
  assert.match(source, /encounterLaneDangerMat/);

  assert.match(source, /createBossPreviewLaneAttackPlanV282/);
  assert.match(source, /trackBossPreviewLaneAttackPlanV282/);
  assert.match(source, /lockBossPreviewLaneAttackPlanV282/);
  assert.match(source, /projectilesFromBossPreviewLaneAttackPlanV282/);
  assert.match(source, /resolveEncounterMuzzleOrigin/);
  assert.match(source, /_encounterTelegraphKind = ['\"]attack_corridors['\"]/);
  assert.match(source, /new BABYLON\.Vector3\(projectile\.origin\.x, 0, projectile\.origin\.z\)/);
  assert.doesNotMatch(source, /enemy\._encounterLaneXs/);

  const aiSource = fs.readFileSync(new URL('../src/game/combat/CampaignMiniBossAiV281.js', import.meta.url), 'utf8');
  assert.doesNotMatch(aiSource, /Math\.sin/);
  assert.match(source, /forceCampaignMiniBossRecoveryV281/);
  assert.match(source, /resolveCampaignMiniBossAnchorV29/);
  assert.match(source, /stepCampaignEnemyChoreographyV29/);
  assert.match(source, /routeVariant:spawnSpec\.routeVariant/);
  assert.match(source, /stepCampaignBossPreviewMotionV29/);
  assert.match(source, /stepCampaignBossCombatV29/);
  assert.match(source, /planetId:currentPlanetId,bossType:stageConfig\.bossType\|\|['"]mech['"]/);
  assert.doesNotMatch(source, /fallbackPattern=bossEnraged/);
  assert.doesNotMatch(source, /attackType = 1 \+ Math\.floor\(Math\.random\(\)\*3\)/);
  assert.match(source, /createBossAttackTelegraph/);
  assert.match(source, /projectilesFromCampaignBossAttackPlanV29/);
  assert.match(source, /campaignCombatV3Enabled&&bossCombatState/);
  assert.match(source, /Emergency kill-switch legacy boss fallback/);
  assert.match(source, /createCampaignEnemyShotPlanV31/);
  assert.match(source, /advanceCampaignEnemyProjectileV31/);
  assert.match(source, /samplePlayerCombatVelocity\(frameFactor\)/);
  assert.match(source, /resolveEncounterMuzzleOrigin\(enemy\)/);
  assert.match(source, /createCampaignProjectileVisualFactoryV32/);
  assert.match(source, /hostileProjectileVisuals\.create/);
  assert.doesNotMatch(source, /MeshBuilder\.CreateBox\(hitId/);
  assert.match(source, /_projectileAimMode:spawnSpec\?\.projectileAimMode/);
  assert.match(source, /_projectileVisualId:spawnSpec\?\.projectileVisualId/);
  assert.match(source, /activateBossFrenzyV31/);
  assert.match(source, /boss_frenzy_aura_v31/);
  assert.doesNotMatch(source, /for \(let a=0; a < Math\.PI\*2/,
    'the emergency Boss fallback must not restore a full-circle portrait-arena barrage');
  assert.match(source, /event\.type===['"]enrage_started['"]/);
  assert.match(source, /resolveCampaignHostileFireTempoV33\(currentPlanetId\)/);
  assert.match(source, /planetId:currentPlanetId,bossType:bType/);
  assert.match(source, /planetId:currentPlanetId,bossType:stageConfig\.bossType\|\|['"]mech['"]/);
  assert.match(source, /playerVelocityX:playerVelocityFrame\.x/);
  assert.match(source, /rawDamage:projectile\.rawDamage,damageType:projectile\.damageType/);
  assert.match(source, /miniBossProjectileSpeedMultiplier/);
  assert.doesNotMatch(source, /projectileSpeed: \.38,/,
    'Boss Preview projectile speed must come from the planet hostile-fire contract');

  assert.match(source, /const spawnZ = spawnSpec \? -ZOOM - 1\.8 : -ZOOM - 3/);
  assert.match(source, /const environmentHpMultiplier = spawnSpec \? 1 : combat\.environment\.enemyHpMultiplier/);
  assert.match(source, /_projectileDamage:Math\.max\(1,Math\.round\(Number\(spawnSpec\?\.projectileDamage\)\|\|200\)\)/);
  assert.match(source, /_contactDamage:Math\.max\(1,Math\.round\(Number\(spawnSpec\?\.contactDamage\)/);
  assert.match(source, /rawDamage:b\._rawDamage\|\|200/);
  assert.match(source, /rawDamage:e\._contactDamage\|\|\(e\.tier===4\?400:200\)/);
  assert.doesNotMatch(source, /const targetZ = -ZOOM \+ profile\.anchorOffsetZ/);
  assert.doesNotMatch(source, /CreateLines\(`enc_lane_/);

  // The old random lanes/boss remain only behind the explicit production kill
  // switch; they must not be the default path.
  assert.match(source, /Emergency\/legacy movement fallback/);
  assert.match(source, /waveCount\s*=\s*\(stageConfig\.baseEnemies\|\|5\)\s*\+\s*currentWave\s*\*\s*3/);
  assert.match(source, /spawnInterval\s*=\s*Math\.max\(300,\s*1500\s*-\s*\(currentStage\*100\s*\+\s*currentWave\*50\)\)/);

  const choreographySource = fs.readFileSync(
    new URL('../src/game/combat/CampaignCombatChoreographyV29.js', import.meta.url), 'utf8');
  const bossSource = fs.readFileSync(
    new URL('../src/game/combat/CampaignBossCombatV29.js', import.meta.url), 'utf8');
  const projectileSource = fs.readFileSync(
    new URL('../src/game/combat/CampaignEnemyProjectileV31.js', import.meta.url), 'utf8');
  const projectileVisualSource = fs.readFileSync(
    new URL('../src/game/rendering/CampaignProjectileVisualV32.js', import.meta.url), 'utf8');
  const bossArsenalSource = fs.readFileSync(
    new URL('../src/game/combat/CampaignBossArsenalV33.js', import.meta.url), 'utf8');
  assert.match(bossSource, /Math\.atan2\(playerDirection\.x, playerDirection\.z\)/);
  assert.match(bossSource, /toDirection = angle => \(\{ x: Math\.sin\(angle\), z: Math\.cos\(angle\) \}\)/);
  assert.match(bossArsenalSource, /alpha_lock_burst/);
  assert.match(bossArsenalSource, /cryo_absolute_zero/);
  assert.match(bossArsenalSource, /inferno_doomstorm/);
  assert.doesNotMatch(bossArsenalSource, /Math\.random/);
  assert.match(projectileVisualSource, /DynamicTexture/);
  assert.match(projectileVisualSource, /Canvas texture|createLinearGradient/);
  assert.doesNotMatch(choreographySource, /Math\.random/);
  assert.doesNotMatch(bossSource, /Math\.random/);
  assert.doesNotMatch(projectileSource, /Math\.random/);
  assert.match(bossSource, /state\.phase = ['"]enrage['"]/);
  assert.match(bossSource, /extraBurstShots: 2/);
  assert.match(choreographySource, /hardTravelTimeout/);
  assert.match(choreographySource, /CAMPAIGN_RAIDER_ROUTE_VARIANTS_V30/);
});
