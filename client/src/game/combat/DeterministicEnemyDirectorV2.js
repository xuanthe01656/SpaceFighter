import {
  ENEMY_ARCHETYPES_V2,
  ENEMY_RUNTIME_CATALOG_V3,
  BOSS_PHASES_V2,
  enemyRuntimeFromCatalogV3,
} from './EnemyCombatCatalogV2.js';
import {
  CAMPAIGN_ENCOUNTER_ESCALATION_VERSION,
  resolveCampaignWaveEncounterV28,
} from './CampaignEncounterEscalationV28.js';

export const CAMPAIGN_WAVE_DIRECTOR_VERSION = 'campaign-wave-director-v3.4.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round3 = value => Math.round(Number(value) * 1000) / 1000;
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

/**
 * Planet identity is expressed through composition, tempo and bounded combat
 * multipliers. Existing PLANET_ENEMIES still owns visual/tier base values; this
 * profile owns how those values behave in a full campaign encounter.
 */
export const CAMPAIGN_PLANET_PROFILES_V27 = Object.freeze({
  1: Object.freeze({
    id: 'alpha_mechanical', budgetMultiplier: 1, spawnGapMultiplier: 1.00,
    hpMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1.02,
    projectileSpeedMultiplier: 1, fireCooldownMultiplier: .98,
    scoutReturnRatio: 1, scoutExtraReturnRatio: .16,
    roleWeights: Object.freeze({ raider: 12, gunner: 11, charger: 6, shieldbearer: 7, support: 3, artillery: 5 }),
    preferredFormations: Object.freeze(['line', 'crossfire', 'escort', 'stagger']),
    modifierId: 'mechanical_formations',
  }),
  2: Object.freeze({
    id: 'cryo_ion', budgetMultiplier: 1.08, spawnGapMultiplier: .88,
    hpMultiplier: 1.14, damageMultiplier: 1.10, speedMultiplier: 1.05,
    projectileSpeedMultiplier: 1.08, fireCooldownMultiplier: .88,
    scoutReturnRatio: 1, scoutExtraReturnRatio: .36,
    roleWeights: Object.freeze({ raider: 7, gunner: 12, charger: 5, shieldbearer: 9, support: 8, artillery: 10 }),
    preferredFormations: Object.freeze(['crossfire', 'stagger', 'lane_sweep', 'escort']),
    modifierId: 'cryo_lane_control',
  }),
  3: Object.freeze({
    id: 'inferno_swarm', budgetMultiplier: 1.16, spawnGapMultiplier: .74,
    hpMultiplier: 1.20, damageMultiplier: 1.24, speedMultiplier: 1.14,
    projectileSpeedMultiplier: 1.16, fireCooldownMultiplier: .76,
    scoutReturnRatio: 1, scoutExtraReturnRatio: .62,
    roleWeights: Object.freeze({ raider: 14, gunner: 7, charger: 12, shieldbearer: 4, support: 4, artillery: 8 }),
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
  interWaveDelayMs: options.interWaveDelayMs ?? 1650,
  guaranteedDrop: options.guaranteedDrop ?? null,
  eliteFirst: Boolean(options.eliteFirst),
  eliteEvery: options.eliteEvery ?? 0,
  scoutReturnBias: options.scoutReturnBias ?? 0,
  hpMultiplier: options.hpMultiplier ?? 1,
  damageMultiplier: options.damageMultiplier ?? 1,
  speedMultiplier: options.speedMultiplier ?? 1,
  bossPreview: Boolean(options.bossPreview),
  boss: Boolean(options.boss),
});

export const CAMPAIGN_WAVE_TEMPLATES_V27 = Object.freeze({
  recon: TEMPLATE('recon', {
    label: { vi: 'TRINH SÁT', en: 'RECON' }, roles: ['raider', 'gunner'], formation: 'line',
    budgetMultiplier: .78, spawnGapMultiplier: 1.02, scoutReturnBias: .14,
  }),
  crossfire: TEMPLATE('crossfire', {
    label: { vi: 'HỎA LỰC HAI CÁNH', en: 'CROSSFIRE' }, roles: ['gunner', 'raider', 'gunner'], formation: 'crossfire',
    budgetMultiplier: .9, scoutReturnBias: .08,
  }),
  first_rush: TEMPLATE('first_rush', {
    label: { vi: 'ĐỘT KÍCH', en: 'FIRST RUSH' }, roles: ['raider', 'charger', 'raider'], formation: 'center_push',
    budgetMultiplier: .95, spawnGapMultiplier: .84, scoutReturnBias: -.18, speedMultiplier: 1.04,
  }),
  pincer: TEMPLATE('pincer', {
    label: { vi: 'GỌNG KÌM', en: 'PINCER' }, roles: ['raider', 'gunner', 'raider', 'charger'], formation: 'pincer',
    budgetMultiplier: 1.0, scoutReturnBias: .05,
  }),
  escort: TEMPLATE('escort', {
    label: { vi: 'ĐỘI HÌNH HỘ TỐNG', en: 'ESCORT FORMATION' }, roles: ['shieldbearer', 'gunner', 'gunner', 'raider'], formation: 'escort',
    budgetMultiplier: 1.03, spawnGapMultiplier: .98, hpMultiplier: 1.04,
  }),
  recovery_elite: TEMPLATE('recovery_elite', {
    label: { vi: 'TINH ANH · TIẾP TẾ', en: 'ELITE RECOVERY' }, roles: ['shieldbearer', 'raider', 'gunner'], formation: 'stagger',
    budgetMultiplier: .68, spawnGapMultiplier: 1.04, interWaveDelayMs: 2200,
    guaranteedDrop: 'heal', eliteFirst: true, hpMultiplier: 1.06,
  }),
  lane_sweep: TEMPLATE('lane_sweep', {
    label: { vi: 'QUÉT LÀN', en: 'LANE SWEEP' }, roles: ['artillery', 'gunner', 'raider'], formation: 'lane_sweep',
    budgetMultiplier: 1.02, spawnGapMultiplier: .96, damageMultiplier: 1.04,
  }),
  support_network: TEMPLATE('support_network', {
    label: { vi: 'MẠNG HỖ TRỢ', en: 'SUPPORT NETWORK' }, roles: ['support', 'gunner', 'shieldbearer', 'raider'], formation: 'escort',
    budgetMultiplier: 1.04, hpMultiplier: 1.03,
  }),
  pressure_lanes: TEMPLATE('pressure_lanes', {
    label: { vi: 'ÁP LỰC KHÔNG GIAN', en: 'SPACE PRESSURE' }, roles: ['artillery', 'charger', 'raider', 'gunner'], formation: 'stagger',
    budgetMultiplier: 1.08, spawnGapMultiplier: .88, damageMultiplier: 1.05,
  }),
  mixed_pressure: TEMPLATE('mixed_pressure', {
    label: { vi: 'ÁP LỰC HỖN HỢP', en: 'MIXED PRESSURE' }, roles: ['raider', 'gunner', 'charger', 'shieldbearer', 'artillery'],
    budgetMultiplier: 1.12, spawnGapMultiplier: .84, hpMultiplier: 1.04, damageMultiplier: 1.05,
  }),
  commander: TEMPLATE('commander', {
    label: { vi: 'CHỈ HUY TIỀN TUYẾN', en: 'FIELD COMMANDER' }, roles: ['shieldbearer', 'support', 'gunner', 'raider'], formation: 'escort',
    budgetMultiplier: 1.03, eliteFirst: true, hpMultiplier: 1.06,
  }),
  elite_duel: TEMPLATE('elite_duel', {
    label: { vi: 'ĐỐI ĐẦU TINH ANH', en: 'ELITE DUEL' }, roles: ['charger', 'shieldbearer', 'raider'], formation: 'center_push',
    budgetMultiplier: .82, spawnGapMultiplier: 1.02, interWaveDelayMs: 2200,
    eliteFirst: true, hpMultiplier: 1.08, damageMultiplier: 1.06,
  }),
  boss_preview_a: TEMPLATE('boss_preview_a', {
    label: { vi: 'MÔ PHỎNG TRÙM I', en: 'BOSS PREVIEW I' }, roles: ['artillery', 'gunner', 'charger'], formation: 'lane_sweep',
    budgetMultiplier: 1.04, bossPreview: true, damageMultiplier: 1.05,
  }),
  boss_preview_b: TEMPLATE('boss_preview_b', {
    label: { vi: 'MÔ PHỎNG TRÙM II', en: 'BOSS PREVIEW II' }, roles: ['charger', 'shieldbearer', 'artillery'], formation: 'pincer',
    budgetMultiplier: 1.10, spawnGapMultiplier: .88, bossPreview: true,
    hpMultiplier: 1.05, damageMultiplier: 1.08,
  }),
  finale: TEMPLATE('finale', {
    label: { vi: 'CAO TRÀO', en: 'FINALE' }, roles: ['raider', 'gunner', 'charger', 'shieldbearer', 'artillery'],
    budgetMultiplier: 1.16, spawnGapMultiplier: .82, eliteEvery: 4,
    hpMultiplier: 1.06, damageMultiplier: 1.08, speedMultiplier: 1.04,
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
    if (result.length > 1 && result[result.length - 2] === 'finale') result[result.length - 2] = 'elite_duel';
  }
  if (hasBoss) result.push('boss');
  return Object.freeze(result);
}

export function resolveCampaignWavePowerV3({
  planetId = 1,
  stage = 1,
  wave = 1,
  totalWaves = 5,
  difficulty = 1,
  templateId = 'recon',
} = {}) {
  const profile = CAMPAIGN_PLANET_PROFILES_V27[planetId] || CAMPAIGN_PLANET_PROFILES_V27[1];
  const template = CAMPAIGN_WAVE_TEMPLATES_V27[templateId] || CAMPAIGN_WAVE_TEMPLATES_V27.recon;
  const safeStage = clamp(Math.trunc(Number(stage) || 1), 1, 100);
  const safeWave = clamp(Math.trunc(Number(wave) || 1), 1, 20);
  const playableWaves = Math.max(1, Math.trunc(Number(totalWaves) || 1) - (templateId === 'boss' ? 1 : 0));
  const progress = playableWaves <= 1 ? 0 : clamp((safeWave - 1) / (playableWaves - 1), 0, 1);
  const stageProgress = clamp((safeStage - 1) / 9, 0, 1.5);
  const d = clamp(Number(difficulty) || 1, .75, 3);
  return Object.freeze({
    progress: round3(progress),
    hpMultiplier: round3(profile.hpMultiplier * template.hpMultiplier
      * (1 + progress * .28 + stageProgress * .10 + (d - 1) * .08)),
    damageMultiplier: round3(profile.damageMultiplier * template.damageMultiplier
      * (1 + progress * .22 + stageProgress * .08 + (d - 1) * .08)),
    speedMultiplier: round3(profile.speedMultiplier * template.speedMultiplier
      * (1 + progress * .07 + stageProgress * .035)),
    projectileSpeedMultiplier: round3(profile.projectileSpeedMultiplier * (1 + progress * .10)),
    fireCooldownMultiplier: round3(clamp(profile.fireCooldownMultiplier * (1 - progress * .18), .62, 1.10)),
  });
}

function weightedRole(next, roles, profile, previousRole) {
  const weighted = [];
  const allowed = roles.filter(role => ENEMY_RUNTIME_CATALOG_V3[role]);
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

function resolveRouteVariantV3(role, profile, template, next) {
  const archetype = ENEMY_ARCHETYPES_V2[role] || ENEMY_ARCHETYPES_V2.raider;
  if (role !== 'raider') return archetype.routeVariants?.[0] || archetype.behavior;
  // Campaign scouts always re-engage at least once. Planet/template identity
  // now controls whether they perform a third attack pass, never whether they
  // simply fly through the screen and disappear.
  const extraReturnRatio = clamp(
    Number(profile.scoutExtraReturnRatio || 0) + Number(template.scoutReturnBias || 0) * .55,
    .05,
    .90,
  );
  return (next() % 1000) < Math.round(extraReturnRatio * 1000)
    ? 'double_hook_return' : 'hook_return';
}

function projectRuntimeV3(runtime, wavePower, elite = false) {
  const eliteHp = elite ? 1.68 : 1;
  const eliteDamage = elite ? 1.18 : 1;
  const eliteSpeed = elite ? 1.035 : 1;
  const eliteCooldown = elite ? .86 : 1;
  return Object.freeze({
    tier: runtime.tier,
    canShoot: runtime.canShoot,
    shootMs: runtime.shootMs > 0
      ? Math.max(560, Math.round(runtime.shootMs * wavePower.fireCooldownMultiplier * eliteCooldown)) : 0,
    hpMultiplier: round3(runtime.hpMultiplier * wavePower.hpMultiplier * eliteHp),
    damageMultiplier: round3(runtime.damageMultiplier * wavePower.damageMultiplier * eliteDamage),
    speedMultiplier: round3(runtime.speedMultiplier * wavePower.speedMultiplier * eliteSpeed),
    projectileSpeed: round3(runtime.projectileSpeed * wavePower.projectileSpeedMultiplier),
    projectileAimMode: runtime.projectileAimMode,
    projectileLeadFactor: runtime.projectileLeadFactor,
    projectileMaxLeadMs: runtime.projectileMaxLeadMs,
    projectileGuidanceMs: runtime.projectileGuidanceMs,
    projectileTurnRateRadians: runtime.projectileTurnRateRadians,
    projectileLifetimeMs: runtime.projectileLifetimeMs,
    projectileVisualId: runtime.projectileVisualId,
    burstCount: runtime.burstCount,
    burstGapMs: runtime.burstGapMs,
    minVolleysPerFirePhase: runtime.minVolleysPerFirePhase,
    maxVolleysPerFirePhase: runtime.maxVolleysPerFirePhase,
    projectileDamage: Math.max(0, Math.round(runtime.projectileDamage * wavePower.damageMultiplier * eliteDamage)),
    contactDamage: Math.max(1, Math.round(runtime.contactDamage * wavePower.damageMultiplier * eliteDamage)),
  });
}

function buildCampaignEntries({
  seed,
  profile,
  template,
  stage,
  wave,
  totalWaves,
  baseEnemies,
  difficulty,
  planetId,
}) {
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
    (735 - stage * 11 - wave * 8) * profile.spawnGapMultiplier * template.spawnGapMultiplier,
  ), 260, 850);
  const wavePower = resolveCampaignWavePowerV3({
    planetId, stage, wave, totalWaves, difficulty, templateId: template.id,
  });
  const allowedRoles = template.roles.filter(role =>
    ENEMY_RUNTIME_CATALOG_V3[role] && (ENEMY_ARCHETYPES_V2[role]?.unlockStage || 1) <= stage);
  if (!allowedRoles.length) allowedRoles.push(stage <= 1 ? 'raider' : 'gunner');
  const entries = [];
  let spent = 0;
  let previousRole = null;
  let safety = 0;
  while (spent < threatBudget && safety++ < 80) {
    const scriptedRole = allowedRoles[entries.length % allowedRoles.length];
    const role = entries.length < allowedRoles.length
      ? scriptedRole : weightedRole(next, allowedRoles, profile, previousRole);
    const runtime = enemyRuntimeFromCatalogV3(role);
    if (entries.length > 0 && spent + runtime.cost > threatBudget + 2) break;
    const elite = template.eliteFirst
      ? entries.length === 0
      : template.eliteEvery > 0 && entries.length % template.eliteEvery === 0;
    const projected = projectRuntimeV3(runtime, wavePower, elite);
    const groupPause = entries.length > 0 && entries.length % 6 === 0 ? 220 : 0;
    const previousOffset = entries.at(-1)?.spawnOffsetMs || 0;
    entries.push(Object.freeze({
      index: entries.length,
      spawnOffsetMs: entries.length === 0 ? 420 : previousOffset + gapMs + groupPause,
      lane: lanes[entries.length % lanes.length],
      archetypeId: role,
      routeVariant: resolveRouteVariantV3(role, profile, template, next),
      ...projected,
      elite,
      speedRoll: (next() % 1000) / 999,
      sinePhase: (next() % 6284) / 1000,
      strafeDirection: (next() & 1) === 0 ? -1 : 1,
      defenseClass: runtime.defenseClass,
      damageType: runtime.damageType,
      formation,
      wavePower,
    }));
    spent += runtime.cost + (elite ? 3 : 0);
    previousRole = role;
  }
  return Object.freeze({ entries: freezeList(entries), threatBudget, spawnGapMs: gapMs, formation, wavePower });
}

function roleRuntimeV28(role) {
  return enemyRuntimeFromCatalogV3(role);
}

function decorateEncounterEntriesV28(entries, encounter, seed, context) {
  if (!encounter || encounter.kind === 'boss' || !entries.length) return Object.freeze(entries);
  const next = rng32(seed);
  const trimmed = entries.slice(0, Math.max(1, encounter.maxEntries || entries.length));
  const featuredRole = ENEMY_RUNTIME_CATALOG_V3[encounter.featuredRole]
    ? encounter.featuredRole : trimmed[0].archetypeId;
  const runtime = roleRuntimeV28(featuredRole);
  const featuredBase = trimmed.find(entry => entry.archetypeId === featuredRole) || trimmed[0];
  const rest = trimmed.filter(entry => entry !== featuredBase);
  const wavePower = context?.wavePower || featuredBase.wavePower || Object.freeze({
    hpMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1,
    projectileSpeedMultiplier: 1, fireCooldownMultiplier: 1,
  });
  const encounterElite = projectRuntimeV3(runtime, wavePower, true);
  const encounterDamage = encounter.kind === 'mini_boss' ? 1.18 : 1.10;
  const featured = Object.freeze({
    ...featuredBase,
    index: 0,
    spawnOffsetMs: 420,
    archetypeId: featuredRole,
    routeVariant: resolveRouteVariantV3(featuredRole, context.profile, context.template, next),
    ...encounterElite,
    hpMultiplier: round3(encounterElite.hpMultiplier * Number(encounter.hpMultiplier || 1)),
    damageMultiplier: round3(encounterElite.damageMultiplier * encounterDamage),
    projectileDamage: Math.round(encounterElite.projectileDamage * encounterDamage),
    contactDamage: Math.round(encounterElite.contactDamage * encounterDamage),
    speedMultiplier: round3(encounterElite.speedMultiplier * Number(encounter.speedMultiplier || 1)),
    speedRoll: (next() % 1000) / 999,
    sinePhase: (next() % 6284) / 1000,
    strafeDirection: (next() & 1) === 0 ? -1 : 1,
    defenseClass: runtime.defenseClass,
    damageType: runtime.damageType,
    elite: true,
    encounterKind: encounter.kind,
    encounterId: encounter.id,
    encounterMechanicId: encounter.mechanicId,
    encounterAiProfileId: encounter.aiProfileId,
    encounterLabel: encounter.label,
    encounterFeatured: true,
    mechanicTelegraphMs: encounter.telegraphMs,
    mechanicSummonRoles: Object.freeze([...(encounter.summonRoles || [])]),
    protectUntilMechanic: Boolean(encounter.protectUntilMechanic),
    scaleMultiplier: Number(encounter.scaleMultiplier || 1),
    pointsMultiplier: encounter.kind === 'mini_boss' ? 4 : 2,
  });
  const normalized = [featured, ...rest].map((entry, index) => Object.freeze({
    ...entry,
    index,
    spawnOffsetMs: index === 0 ? 420 : Math.max(760, Number(entry.spawnOffsetMs || 0)),
  }));
  return Object.freeze(normalized);
}

function createReinforcementEntriesV28({
  seed,
  roles,
  formation = 'pincer',
  groupId = 'reinforcement',
  startOffsetMs = 0,
  profile,
  stage,
  difficulty,
  planetId,
}) {
  const next = rng32(seed);
  const list = Array.isArray(roles) && roles.length ? roles : ['raider'];
  const lanes = FORMATION_LANES[formation] || FORMATION_LANES.pincer;
  const template = CAMPAIGN_WAVE_TEMPLATES_V27.pincer;
  const wavePower = resolveCampaignWavePowerV3({
    planetId, stage, wave: 1, totalWaves: 1, difficulty, templateId: template.id,
  });
  return Object.freeze(list.map((role, index) => {
    const runtime = roleRuntimeV28(role);
    const projected = projectRuntimeV3(runtime, wavePower, false);
    return Object.freeze({
      index,
      spawnOffsetMs: Math.max(0, startOffsetMs) + index * 260,
      lane: lanes[index % lanes.length],
      archetypeId: role,
      routeVariant: resolveRouteVariantV3(role, profile, template, next),
      ...projected,
      hpMultiplier: round3(projected.hpMultiplier * .92),
      elite: false,
      speedRoll: (next() % 1000) / 999,
      sinePhase: (next() % 6284) / 1000,
      strafeDirection: (next() & 1) === 0 ? -1 : 1,
      defenseClass: runtime.defenseClass,
      damageType: runtime.damageType,
      formation,
      reinforcementGroupId: groupId,
      bossSupport: groupId.startsWith('boss-'),
      wavePower,
    });
  }));
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
    hpScale: round3(hpScale), damageScale: round3(damageScale), speedScale: round3(speedScale),
  });
}

export function auditCampaignEnemyDirectorV3() {
  const issues = [];
  for (const [id, archetype] of Object.entries(ENEMY_ARCHETYPES_V2)) {
    const runtime = ENEMY_RUNTIME_CATALOG_V3[id];
    if (!runtime) issues.push(`MISSING_RUNTIME:${id}`);
    if (runtime?.tier !== archetype.tier || runtime?.cost !== archetype.threatCost) issues.push(`RUNTIME_DRIFT:${id}`);
  }
  for (const [planetId, profile] of Object.entries(CAMPAIGN_PLANET_PROFILES_V27)) {
    if (!(profile.spawnGapMultiplier > 0)) issues.push(`SPAWN_GAP:${planetId}`);
    if (profile.scoutReturnRatio !== 1) issues.push(`SCOUT_MUST_RETURN:${planetId}`);
    if (!(profile.scoutExtraReturnRatio >= 0 && profile.scoutExtraReturnRatio <= 1))
      issues.push(`SCOUT_EXTRA_RETURN:${planetId}`);
    if (!(profile.damageMultiplier > 0 && profile.speedMultiplier > 0)) issues.push(`PLANET_POWER:${planetId}`);
  }
  const alpha = CAMPAIGN_PLANET_PROFILES_V27[1];
  const cryo = CAMPAIGN_PLANET_PROFILES_V27[2];
  const inferno = CAMPAIGN_PLANET_PROFILES_V27[3];
  if (!(alpha.budgetMultiplier < cryo.budgetMultiplier && cryo.budgetMultiplier < inferno.budgetMultiplier))
    issues.push('PLANET_BUDGET_ORDER');
  if (!(alpha.damageMultiplier < cryo.damageMultiplier && cryo.damageMultiplier < inferno.damageMultiplier))
    issues.push('PLANET_DAMAGE_ORDER');
  if (!(alpha.projectileSpeedMultiplier < cryo.projectileSpeedMultiplier
    && cryo.projectileSpeedMultiplier < inferno.projectileSpeedMultiplier)) issues.push('PLANET_PROJECTILE_ORDER');
  if (!(alpha.fireCooldownMultiplier > cryo.fireCooldownMultiplier
    && cryo.fireCooldownMultiplier > inferno.fireCooldownMultiplier)) issues.push('PLANET_FIRE_RATE_ORDER');
  if (!(alpha.spawnGapMultiplier > cryo.spawnGapMultiplier
    && cryo.spawnGapMultiplier > inferno.spawnGapMultiplier)) issues.push('PLANET_SPAWN_TEMPO_ORDER');
  return Object.freeze(issues);
}

export function createEnemyDirectorV2({ seed = 1, stage = 1, difficulty = 1, planetId = 1 } = {}) {
  const next = rng32(seed);
  const safeStage = clamp(Math.trunc(Number(stage) || 1), 1, 100);
  const safeDifficulty = clamp(Number(difficulty) || 1, .75, 3);
  const safePlanetId = CAMPAIGN_PLANET_PROFILES_V27[planetId] ? Number(planetId) : 1;

  const available = () => Object.values(ENEMY_ARCHETYPES_V2).filter(enemy => enemy.unlockStage <= safeStage);

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
      const encounter = resolveCampaignWaveEncounterV28({
        planetId: resolvedPlanetId,
        wave: index + 1,
        totalWaves: templateIds.length,
        hasBoss,
      });
      if (template.boss) {
        return Object.freeze({
          wave: index + 1, templateId, label: template.label, boss: true, bossPreview: false,
          entries: Object.freeze([]), threatBudget: 0, spawnGapMs: 0, formation: template.formation,
          interWaveDelayMs: 0, guaranteedDrop: null, planetProfileId: profile.id,
          wavePower: resolveCampaignWavePowerV3({
            planetId: resolvedPlanetId, stage: safeStage, wave: index + 1,
            totalWaves: templateIds.length, difficulty: safeDifficulty, templateId,
          }),
          encounterVersion: CAMPAIGN_ENCOUNTER_ESCALATION_VERSION, encounter,
        });
      }
      const waveSeed = hashParts(seed, resolvedPlanetId, safeStage, index + 1, templateId);
      const built = buildCampaignEntries({
        seed: waveSeed, profile, template, stage: safeStage, wave: index + 1,
        totalWaves: templateIds.length, baseEnemies, difficulty: safeDifficulty,
        planetId: resolvedPlanetId,
      });
      const encounterEntries = decorateEncounterEntriesV28(
        built.entries,
        encounter,
        hashParts(waveSeed, encounter?.id || 'standard'),
        { profile, template, wavePower: built.wavePower },
      );
      return Object.freeze({
        wave: index + 1,
        templateId,
        label: encounter?.label || template.label,
        boss: false,
        bossPreview: encounter?.kind === 'boss_preview' || template.bossPreview,
        miniBoss: encounter?.kind === 'mini_boss',
        entries: encounterEntries,
        threatBudget: built.threatBudget,
        spawnGapMs: built.spawnGapMs,
        formation: built.formation,
        interWaveDelayMs: encounter?.kind === 'mini_boss'
          ? Math.max(2200, template.interWaveDelayMs) : template.interWaveDelayMs,
        guaranteedDrop: encounter?.guaranteedDrop || template.guaranteedDrop,
        planetProfileId: profile.id,
        wavePower: built.wavePower,
        encounterVersion: CAMPAIGN_ENCOUNTER_ESCALATION_VERSION,
        encounter,
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
      encounterVersion: CAMPAIGN_ENCOUNTER_ESCALATION_VERSION,
      waves: Object.freeze(waves),
    });
  }

  function buildReinforcementPlan({
    roles = ['raider'], formation = 'pincer', groupId = 'reinforcement', startOffsetMs = 0,
  } = {}) {
    return createReinforcementEntriesV28({
      seed: hashParts(seed, safePlanetId, safeStage, groupId, roles.join(',')),
      roles, formation, groupId, startOffsetMs,
      profile: CAMPAIGN_PLANET_PROFILES_V27[safePlanetId],
      stage: safeStage, difficulty: safeDifficulty, planetId: safePlanetId,
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
    buildReinforcementPlan,
    buildBossAttackPlan,
  });
}
