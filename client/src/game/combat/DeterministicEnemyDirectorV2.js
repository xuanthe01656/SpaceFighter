import { ENEMY_ARCHETYPES_V2, BOSS_PHASES_V2 } from './EnemyCombatCatalogV2.js';

export const CAMPAIGN_WAVE_DIRECTOR_VERSION = 'campaign-wave-director-v2.7.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const freezeList = values => Object.freeze(values.map(value => Object.freeze(value)));

function rng32(seedValue) {
  let state = (Math.trunc(Number(seedValue) || 1) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
    return state;
  };
}

function hashParts(...parts) {
  let hash = 2166136261;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

const LANE_NORMALIZED_X = Object.freeze([-0.80, -0.40, 0, 0.40, 0.80]);

const LEGACY_ROLE_RUNTIME_V27 = Object.freeze({
  raider: Object.freeze({ tier: 1, cost: 1, canShoot: false, hpMultiplier: .88, speedMultiplier: 1.12, shootMs: 0 }),
  gunner: Object.freeze({ tier: 2, cost: 2, canShoot: true, hpMultiplier: 1, speedMultiplier: .96, shootMs: 2200 }),
  charger: Object.freeze({ tier: 4, cost: 3, canShoot: false, hpMultiplier: 1.18, speedMultiplier: 1.04, shootMs: 0 }),
  shieldbearer: Object.freeze({ tier: 3, cost: 4, canShoot: false, hpMultiplier: 1.55, speedMultiplier: .72, shootMs: 0 }),
  support: Object.freeze({ tier: 2, cost: 4, canShoot: true, hpMultiplier: .92, speedMultiplier: .84, shootMs: 2700 }),
  artillery: Object.freeze({ tier: 3, cost: 4, canShoot: true, hpMultiplier: 1.18, speedMultiplier: .66, shootMs: 3000 }),
});

export const CAMPAIGN_PLANET_PROFILES_V27 = Object.freeze({
  1: Object.freeze({
    id: 'alpha_mechanical', budgetMultiplier: 1, spawnGapMultiplier: 1,
    roleWeights: Object.freeze({ raider: 12, gunner: 11, charger: 6, shieldbearer: 7, support: 3, artillery: 5 }),
    preferredFormations: Object.freeze(['line', 'crossfire', 'escort', 'stagger']),
    modifierId: 'mechanical_formations',
  }),
  2: Object.freeze({
    id: 'cryo_ion', budgetMultiplier: 1.05, spawnGapMultiplier: 1.08,
    roleWeights: Object.freeze({ raider: 7, gunner: 12, charger: 5, shieldbearer: 8, support: 7, artillery: 9 }),
    preferredFormations: Object.freeze(['crossfire', 'stagger', 'lane_sweep', 'escort']),
    modifierId: 'cryo_lane_control',
  }),
  3: Object.freeze({
    id: 'inferno_swarm', budgetMultiplier: 1.10, spawnGapMultiplier: .92,
    roleWeights: Object.freeze({ raider: 12, gunner: 7, charger: 11, shieldbearer: 5, support: 5, artillery: 8 }),
    preferredFormations: Object.freeze(['pincer', 'swarm', 'stagger', 'center_push']),
    modifierId: 'inferno_pressure',
  }),
});

const TEMPLATE = (id, options) => Object.freeze({
  id,
  label: Object.freeze(options.label),
  roles: Object.freeze(options.roles),
  formation: options.formation,
  budgetMultiplier: options.budgetMultiplier ?? 1,
  spawnGapMultiplier: options.spawnGapMultiplier ?? 1,
  interWaveDelayMs: options.interWaveDelayMs ?? 1900,
  guaranteedDrop: options.guaranteedDrop ?? null,
  eliteFirst: Boolean(options.eliteFirst),
  eliteEvery: options.eliteEvery ?? 0,
  bossPreview: Boolean(options.bossPreview),
  boss: Boolean(options.boss),
});

export const CAMPAIGN_WAVE_TEMPLATES_V27 = Object.freeze({
  recon: TEMPLATE('recon', {
    label: { vi: 'TRINH SÁT', en: 'RECON' }, roles: ['raider', 'gunner'], formation: 'line',
    budgetMultiplier: .78, spawnGapMultiplier: 1.08,
  }),
  crossfire: TEMPLATE('crossfire', {
    label: { vi: 'HỎA LỰC HAI CÁNH', en: 'CROSSFIRE' }, roles: ['gunner', 'raider', 'gunner'], formation: 'crossfire',
    budgetMultiplier: .9,
  }),
  first_rush: TEMPLATE('first_rush', {
    label: { vi: 'ĐỘT KÍCH', en: 'FIRST RUSH' }, roles: ['raider', 'charger', 'raider'], formation: 'center_push',
    budgetMultiplier: .95, spawnGapMultiplier: .92,
  }),
  pincer: TEMPLATE('pincer', {
    label: { vi: 'GỌNG KÌM', en: 'PINCER' }, roles: ['raider', 'gunner', 'raider', 'charger'], formation: 'pincer',
    budgetMultiplier: 1.0,
  }),
  escort: TEMPLATE('escort', {
    label: { vi: 'ĐỘI HÌNH HỘ TỐNG', en: 'ESCORT FORMATION' }, roles: ['shieldbearer', 'gunner', 'gunner', 'raider'], formation: 'escort',
    budgetMultiplier: 1.03, spawnGapMultiplier: 1.05,
  }),
  recovery_elite: TEMPLATE('recovery_elite', {
    label: { vi: 'TINH ANH · TIẾP TẾ', en: 'ELITE RECOVERY' }, roles: ['shieldbearer', 'raider', 'gunner'], formation: 'stagger',
    budgetMultiplier: .68, spawnGapMultiplier: 1.12, interWaveDelayMs: 2600, guaranteedDrop: 'heal', eliteFirst: true,
  }),
  lane_sweep: TEMPLATE('lane_sweep', {
    label: { vi: 'QUÉT LÀN', en: 'LANE SWEEP' }, roles: ['artillery', 'gunner', 'raider'], formation: 'lane_sweep',
    budgetMultiplier: 1.02, spawnGapMultiplier: 1.08,
  }),
  support_network: TEMPLATE('support_network', {
    label: { vi: 'MẠNG HỖ TRỢ', en: 'SUPPORT NETWORK' }, roles: ['support', 'gunner', 'shieldbearer', 'raider'], formation: 'escort',
    budgetMultiplier: 1.04,
  }),
  pressure_lanes: TEMPLATE('pressure_lanes', {
    label: { vi: 'ÁP LỰC KHÔNG GIAN', en: 'SPACE PRESSURE' }, roles: ['artillery', 'charger', 'raider', 'gunner'], formation: 'stagger',
    budgetMultiplier: 1.08, spawnGapMultiplier: .96,
  }),
  mixed_pressure: TEMPLATE('mixed_pressure', {
    label: { vi: 'ÁP LỰC HỖN HỢP', en: 'MIXED PRESSURE' }, roles: ['raider', 'gunner', 'charger', 'shieldbearer', 'artillery'],
    budgetMultiplier: 1.12, spawnGapMultiplier: .92,
  }),
  commander: TEMPLATE('commander', {
    label: { vi: 'CHỈ HUY TIỀN TUYẾN', en: 'FIELD COMMANDER' }, roles: ['shieldbearer', 'support', 'gunner', 'raider'], formation: 'escort',
    budgetMultiplier: 1.03, eliteFirst: true,
  }),
  elite_duel: TEMPLATE('elite_duel', {
    label: { vi: 'ĐỐI ĐẦU TINH ANH', en: 'ELITE DUEL' }, roles: ['charger', 'shieldbearer', 'raider'], formation: 'center_push',
    budgetMultiplier: .82, spawnGapMultiplier: 1.14, interWaveDelayMs: 2500, eliteFirst: true,
  }),
  boss_preview_a: TEMPLATE('boss_preview_a', {
    label: { vi: 'MÔ PHỎNG TRÙM I', en: 'BOSS PREVIEW I' }, roles: ['artillery', 'gunner', 'charger'], formation: 'lane_sweep',
    budgetMultiplier: 1.04, bossPreview: true,
  }),
  boss_preview_b: TEMPLATE('boss_preview_b', {
    label: { vi: 'MÔ PHỎNG TRÙM II', en: 'BOSS PREVIEW II' }, roles: ['charger', 'shieldbearer', 'artillery'], formation: 'pincer',
    budgetMultiplier: 1.10, spawnGapMultiplier: .94, bossPreview: true,
  }),
  finale: TEMPLATE('finale', {
    label: { vi: 'CAO TRÀO', en: 'FINALE' }, roles: ['raider', 'gunner', 'charger', 'shieldbearer', 'artillery'],
    budgetMultiplier: 1.16, spawnGapMultiplier: .90, eliteEvery: 4,
  }),
  boss: TEMPLATE('boss', {
    label: { vi: 'TRÙM CUỐI', en: 'FINAL BOSS' }, roles: [], formation: 'center_push', boss: true,
    interWaveDelayMs: 0,
  }),
});

const FORMATION_LANES = Object.freeze({
  line: Object.freeze([-.8, -.4, 0, .4, .8]),
  crossfire: Object.freeze([-.8, .8, -.4, .4, 0]),
  pincer: Object.freeze([-.8, .8, -.8, .8, -.4, .4, 0]),
  center_push: Object.freeze([0, -.4, .4, 0, -.8, .8]),
  escort: Object.freeze([0, -.4, .4, 0, -.8, .8]),
  stagger: Object.freeze([-.8, 0, .8, -.4, .4]),
  lane_sweep: Object.freeze([-.8, -.4, 0, .4, .8, .4, 0, -.4]),
  swarm: Object.freeze([0, -.8, .8, -.4, .4, 0, .8, -.8]),
});

const BOSS_15_SEQUENCE = Object.freeze([
  'recon', 'crossfire', 'first_rush', 'pincer', 'escort',
  'recovery_elite', 'lane_sweep', 'support_network', 'pressure_lanes',
  'mixed_pressure', 'commander', 'elite_duel', 'boss_preview_a', 'boss_preview_b', 'boss',
]);
const BOSS_10_SEQUENCE = Object.freeze([
  'recon', 'crossfire', 'first_rush', 'pincer', 'elite_duel',
  'recovery_elite', 'escort', 'mixed_pressure', 'boss_preview_a', 'boss',
]);
const GENERIC_SEQUENCE = Object.freeze([
  'recon', 'crossfire', 'first_rush', 'pincer', 'escort',
  'recovery_elite', 'lane_sweep', 'support_network', 'mixed_pressure',
  'commander', 'elite_duel', 'finale',
]);

function stageTemplateIds(totalWaves, hasBoss) {
  const count = clamp(Math.trunc(Number(totalWaves) || 1), 1, 20);
  if (hasBoss && count === 15) return BOSS_15_SEQUENCE;
  if (hasBoss && count === 10) return BOSS_10_SEQUENCE;
  const playableCount = Math.max(1, hasBoss ? count - 1 : count);
  const result = [];
  for (let index = 0; index < playableCount; index += 1) {
    const sourceIndex = playableCount === 1 ? 0
      : Math.round(index * (GENERIC_SEQUENCE.length - 1) / (playableCount - 1));
    let id = GENERIC_SEQUENCE[sourceIndex];
    if (index > 0 && id === result[index - 1]) {
      id = GENERIC_SEQUENCE[Math.min(GENERIC_SEQUENCE.length - 1, sourceIndex + 1)];
    }
    result.push(id);
  }
  if (!hasBoss && result.length) {
    result[result.length - 1] = 'finale';
    if (result.length > 1 && result[result.length - 2] === 'finale') {
      result[result.length - 2] = 'elite_duel';
    }
  }
  if (hasBoss) result.push('boss');
  return Object.freeze(result);
}

function weightedRole(next, roles, profile, previousRole) {
  const weighted = [];
  const allowed = roles.filter(role => LEGACY_ROLE_RUNTIME_V27[role]);
  for (const role of allowed) {
    let weight = Number(profile.roleWeights[role] || 1);
    if (role === previousRole) weight *= .38;
    for (let index = 0; index < Math.max(1, Math.round(weight)); index += 1) weighted.push(role);
  }
  return weighted[next() % Math.max(1, weighted.length)] || allowed[0] || 'raider';
}

function resolveFormation(template, profile, next) {
  if (template.formation && FORMATION_LANES[template.formation]) return template.formation;
  const pool = profile.preferredFormations.filter(id => FORMATION_LANES[id]);
  return pool[next() % Math.max(1, pool.length)] || 'line';
}

function buildCampaignEntries({ seed, profile, template, stage, wave, baseEnemies, difficulty }) {
  const next = rng32(seed);
  const formation = resolveFormation(template, profile, next);
  const lanes = FORMATION_LANES[formation] || FORMATION_LANES.line;
  const baseBudget = clamp(Math.round(
    5 + stage * 1.35 + wave * 1.05 + Math.sqrt(Math.max(1, baseEnemies)) * 1.45,
  ), 8, 38);
  const threatBudget = clamp(Math.round(
    baseBudget * profile.budgetMultiplier * template.budgetMultiplier * clamp(difficulty, .75, 2),
  ), 6, 46);
  const gapMs = clamp(Math.round(
    (860 - stage * 17 - wave * 7) * profile.spawnGapMultiplier * template.spawnGapMultiplier,
  ), 360, 1050);
  const allowedRoles = template.roles.filter(role =>
    LEGACY_ROLE_RUNTIME_V27[role] && (ENEMY_ARCHETYPES_V2[role]?.unlockStage || 1) <= stage);
  if (!allowedRoles.length) allowedRoles.push(stage <= 1 ? 'raider' : 'gunner');
  const entries = [];
  let spent = 0;
  let previousRole = null;
  let safety = 0;
  while (spent < threatBudget && safety++ < 80) {
    const scriptedRole = allowedRoles[entries.length % allowedRoles.length];
    const role = entries.length < allowedRoles.length
      ? scriptedRole
      : weightedRole(next, allowedRoles, profile, previousRole);
    const runtime = LEGACY_ROLE_RUNTIME_V27[role] || LEGACY_ROLE_RUNTIME_V27.raider;
    if (entries.length > 0 && spent + runtime.cost > threatBudget + 2) break;
    const elite = template.eliteFirst
      ? entries.length === 0
      : template.eliteEvery > 0 && entries.length % template.eliteEvery === 0;
    const groupPause = entries.length > 0 && entries.length % 5 === 0 ? 420 : 0;
    const previousOffset = entries.at(-1)?.spawnOffsetMs || 0;
    entries.push(Object.freeze({
      index: entries.length,
      spawnOffsetMs: entries.length === 0 ? 500 : previousOffset + gapMs + groupPause,
      lane: lanes[entries.length % lanes.length],
      archetypeId: role,
      tier: runtime.tier,
      canShoot: runtime.canShoot,
      shootMs: runtime.shootMs,
      hpMultiplier: runtime.hpMultiplier * (elite ? 1.85 : 1),
      speedMultiplier: runtime.speedMultiplier * (elite ? .92 : 1),
      elite,
      speedRoll: (next() % 1000) / 999,
      sinePhase: (next() % 6284) / 1000,
      strafeDirection: (next() & 1) === 0 ? -1 : 1,
      defenseClass: ENEMY_ARCHETYPES_V2[role]?.defenseClass || 'balanced',
      damageType: ENEMY_ARCHETYPES_V2[role]?.damageType || 'kinetic',
      formation,
    }));
    spent += runtime.cost + (elite ? 3 : 0);
    previousRole = role;
  }
  return Object.freeze({ entries: freezeList(entries), threatBudget, spawnGapMs: gapMs, formation });
}

export function scaleEnemyStatsV2({ baseHp, baseDamage, baseSpeed, archetype, stage = 1, wave = 1, difficulty = 1 } = {}) {
  const s = clamp(Math.trunc(Number(stage) || 1), 1, 100);
  const w = clamp(Math.trunc(Number(wave) || 1), 1, 20);
  const d = clamp(Number(difficulty) || 1, 0.75, 3);
  const hpScale = clamp(1 + (s - 1) * .12 + (w - 1) * .08 + (d - 1) * .15, .75, 5);
  const damageScale = clamp(1 + (s - 1) * .075 + (w - 1) * .05 + (d - 1) * .12, .75, 4);
  const speedScale = clamp(1 + (s - 1) * .012 + (w - 1) * .01, 1, 1.35);
  return Object.freeze({
    hp: Math.max(1, Math.round((Number(baseHp) || 1) * hpScale * (archetype?.hpMultiplier || 1))),
    damage: Math.max(1, Math.round((Number(baseDamage) || 1) * damageScale * (archetype?.damageMultiplier || 1))),
    speed: Math.max(.01, (Number(baseSpeed) || 1) * speedScale * (archetype?.speedMultiplier || 1)),
    hpScale: Math.round(hpScale * 1000) / 1000,
    damageScale: Math.round(damageScale * 1000) / 1000,
    speedScale: Math.round(speedScale * 1000) / 1000,
  });
}

export function createEnemyDirectorV2({ seed = 1, stage = 1, difficulty = 1, planetId = 1 } = {}) {
  const next = rng32(seed);
  const safeStage = clamp(Math.trunc(Number(stage) || 1), 1, 100);
  const safeDifficulty = clamp(Number(difficulty) || 1, .75, 3);
  const safePlanetId = CAMPAIGN_PLANET_PROFILES_V27[planetId] ? Number(planetId) : 1;

  const available = () => Object.values(ENEMY_ARCHETYPES_V2)
    .filter(enemy => enemy.unlockStage <= safeStage);

  function chooseArchetype(previousId = null) {
    const pool = available();
    const weighted = [];
    for (const enemy of pool) {
      let weight = 10;
      if (enemy.id === 'raider' || enemy.id === 'gunner') weight += 8;
      if (enemy.unlockStage === safeStage) weight -= 2;
      if (enemy.id === previousId) weight = Math.max(2, Math.floor(weight * .35));
      for (let count = 0; count < weight; count += 1) weighted.push(enemy);
    }
    return weighted[next() % weighted.length];
  }

  function buildWavePlan({ wave = 1, count = 8, startTick = 0 } = {}) {
    const safeWave = clamp(Math.trunc(Number(wave) || 1), 1, 20);
    const safeCount = clamp(Math.trunc(Number(count) || 1), 1, 100);
    const interval = clamp(Math.round(66 - safeStage * 2 - safeWave * 1.5), 24, 66);
    const plan = [];
    let previousId = null;
    for (let index = 0; index < safeCount; index += 1) {
      const archetype = chooseArchetype(previousId);
      previousId = archetype.id;
      const jitter = Number(next() % 11) - 5;
      plan.push(Object.freeze({
        index,
        spawnTick: Math.max(0, Math.trunc(startTick) + index * interval + jitter),
        lane: LANE_NORMALIZED_X[next() % LANE_NORMALIZED_X.length],
        archetypeId: archetype.id,
        defenseClass: archetype.defenseClass,
        damageType: archetype.damageType,
        telegraphTicks: archetype.telegraphTicks,
      }));
    }
    return Object.freeze(plan.sort((a, b) => a.spawnTick - b.spawnTick || a.index - b.index));
  }

  function buildCampaignStagePlan({
    planetId: requestedPlanetId = safePlanetId,
    totalWaves = 5,
    hasBoss = false,
    baseEnemies = 5,
  } = {}) {
    const resolvedPlanetId = CAMPAIGN_PLANET_PROFILES_V27[requestedPlanetId]
      ? Number(requestedPlanetId) : safePlanetId;
    const profile = CAMPAIGN_PLANET_PROFILES_V27[resolvedPlanetId];
    const templateIds = stageTemplateIds(totalWaves, hasBoss);
    const waves = templateIds.map((templateId, index) => {
      const template = CAMPAIGN_WAVE_TEMPLATES_V27[templateId] || CAMPAIGN_WAVE_TEMPLATES_V27.recon;
      if (template.boss) {
        return Object.freeze({
          wave: index + 1,
          templateId,
          label: template.label,
          boss: true,
          bossPreview: false,
          entries: Object.freeze([]),
          threatBudget: 0,
          spawnGapMs: 0,
          formation: template.formation,
          interWaveDelayMs: 0,
          guaranteedDrop: null,
          planetProfileId: profile.id,
        });
      }
      const waveSeed = hashParts(seed, resolvedPlanetId, safeStage, index + 1, templateId);
      const built = buildCampaignEntries({
        seed: waveSeed,
        profile,
        template,
        stage: safeStage,
        wave: index + 1,
        baseEnemies,
        difficulty: safeDifficulty,
      });
      return Object.freeze({
        wave: index + 1,
        templateId,
        label: template.label,
        boss: false,
        bossPreview: template.bossPreview,
        entries: built.entries,
        threatBudget: built.threatBudget,
        spawnGapMs: built.spawnGapMs,
        formation: built.formation,
        interWaveDelayMs: template.interWaveDelayMs,
        guaranteedDrop: template.guaranteedDrop,
        planetProfileId: profile.id,
      });
    });
    return Object.freeze({
      version: CAMPAIGN_WAVE_DIRECTOR_VERSION,
      seed: Number(seed) >>> 0,
      planetId: resolvedPlanetId,
      planetProfileId: profile.id,
      stage: safeStage,
      totalWaves: waves.length,
      hasBoss: Boolean(hasBoss),
      waves: Object.freeze(waves),
    });
  }

  function buildBossAttackPlan({ cycles = 12 } = {}) {
    const safeCycles = clamp(Math.trunc(Number(cycles) || 1), 1, 100);
    const result = [];
    let cursor = 0;
    for (let index = 0; index < safeCycles; index += 1) {
      const phase = BOSS_PHASES_V2[Math.min(BOSS_PHASES_V2.length - 1, Math.floor(index / Math.max(1, safeCycles / 3)))];
      const pattern = phase.patterns[next() % phase.patterns.length];
      result.push(Object.freeze({ index, phaseId: phase.id, pattern, telegraphTick: cursor, fireTick: cursor + 30 }));
      cursor += phase.cooldownTicks;
    }
    return Object.freeze(result);
  }

  return Object.freeze({
    version: CAMPAIGN_WAVE_DIRECTOR_VERSION,
    stage: safeStage,
    difficulty: safeDifficulty,
    planetId: safePlanetId,
    buildWavePlan,
    buildCampaignStagePlan,
    buildBossAttackPlan,
  });
}
