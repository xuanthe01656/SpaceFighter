import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ENEMY_ARCHETYPES_V2,
  BOSS_PHASES_V2,
  auditEnemyCombatCatalogV2,
  bossPhaseForHp,
} from '../src/game/combat/EnemyCombatCatalogV2.js';
import {
  CAMPAIGN_PLANET_PROFILES_V27,
  CAMPAIGN_WAVE_DIRECTOR_VERSION,
  CAMPAIGN_WAVE_TEMPLATES_V27,
  createEnemyDirectorV2,
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

test('enemy V2 roles expose readable telegraphs, defense classes and bounded control resistance', () => {
  assert.deepEqual(auditEnemyCombatCatalogV2(), []);
  assert.equal(Object.keys(ENEMY_ARCHETYPES_V2).length, 6);
  assert.equal(BOSS_PHASES_V2.length, 3);
  assert.equal(bossPhaseForHp(.8).id, 'phase_1');
  assert.equal(bossPhaseForHp(.5).id, 'phase_2');
  assert.equal(bossPhaseForHp(.2).id, 'phase_3');
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
  assert.equal(CAMPAIGN_WAVE_DIRECTOR_VERSION, 'campaign-wave-director-v2.8.1');
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

test('Campaign source wires V2.8 encounters only in Guest QA and keeps the frozen non-QA fallback', () => {
  const source = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  assert.match(source, /campaignWaveDirector=guestAbilityQa\?createEnemyDirectorV2/);
  assert.match(source, /buildCampaignStagePlan\(\{/);
  assert.match(source, /spawnEnemy\(nextSpec\)/);
  assert.match(source, /currentWavePlan\.entries\[waveSpawned\]/);
  assert.match(source, /currentWavePlan\?\.guaranteedDrop/);
  assert.match(source, /stepEncounterMechanic\(e,now\)/);
  assert.match(source, /buildReinforcementPlan\(\{/);
  assert.match(source, /resolveBossDamageGateV28\(\{/);
  assert.match(source, /beginBossPhaseTransition\(gateResult\.gate\)/);
  assert.match(source, /bossPhaseState=guestAbilityQa\?createBossPhaseStateV28/);
  assert.match(source, /stepMiniBossEnemy\(e,now,enemyFrame,frameDeltaMs\)/);
  assert.match(source, /createMuzzleChargeTelegraph/);
  assert.match(source, /telegraph\.kind === 'summon_ring'/);
  assert.match(source, /encounterLaneDangerMat/);
  const aiSource = fs.readFileSync(new URL('../src/game/combat/CampaignMiniBossAiV281.js', import.meta.url), 'utf8');
  assert.doesNotMatch(aiSource, /Math\.sin/);
  assert.match(source, /forceCampaignMiniBossRecoveryV281/);
  assert.doesNotMatch(source, /CreateLines\(`enc_lane_/);
  assert.match(source, /Frozen legacy fallback for non-QA lanes/);
  assert.match(source, /waveCount\s*=\s*\(stageConfig\.baseEnemies\|\|5\)\s*\+\s*currentWave\s*\*\s*3/);
  assert.match(source, /spawnInterval\s*=\s*Math\.max\(300,\s*1500\s*-\s*\(currentStage\*100\s*\+\s*currentWave\*50\)\)/);
  assert.doesNotMatch(source, /campaignWaveDirector\s*=\s*createEnemyDirectorV2/);
});
