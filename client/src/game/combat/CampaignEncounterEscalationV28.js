export const CAMPAIGN_ENCOUNTER_ESCALATION_VERSION = 'campaign-encounter-v2.8.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const freezeValue = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freezeValue(entry)])));
  }
  return value;
};
const localized = (vi, en) => Object.freeze({ vi, en });

const encounter = options => freezeValue({
  kind: options.kind,
  id: options.id,
  label: options.label,
  mechanicId: options.mechanicId,
  featuredRole: options.featuredRole,
  hpMultiplier: options.hpMultiplier ?? 1,
  speedMultiplier: options.speedMultiplier ?? 1,
  scaleMultiplier: options.scaleMultiplier ?? 1,
  maxEntries: options.maxEntries ?? 6,
  telegraphMs: options.telegraphMs ?? 800,
  summonRoles: options.summonRoles ?? [],
  guaranteedDrop: options.guaranteedDrop ?? null,
  protectUntilMechanic: options.protectUntilMechanic !== false,
});

const phaseGate = options => freezeValue({
  id: options.id,
  threshold: options.threshold,
  label: options.label,
  summonRoles: options.summonRoles,
  formation: options.formation ?? 'pincer',
  transitionMs: options.transitionMs ?? 850,
  bossDamageMultiplierWhileAddsAlive: options.bossDamageMultiplierWhileAddsAlive ?? 1,
});

export const CAMPAIGN_ENCOUNTER_PROFILES_V28 = freezeValue({
  1: {
    id: 'alpha_mechanical_v28',
    miniBossA: encounter({
      kind: 'mini_boss', id: 'mechanical_warden',
      label: localized('MINI-BOSS · HỘ VỆ CƠ KHÍ', 'MINI-BOSS · MECHANICAL WARDEN'),
      mechanicId: 'lane_sweep', featuredRole: 'shieldbearer', hpMultiplier: 5.2,
      speedMultiplier: .72, scaleMultiplier: 1.38, maxEntries: 5, telegraphMs: 850,
      guaranteedDrop: 'heal',
    }),
    miniBossB: encounter({
      kind: 'mini_boss', id: 'frontline_carrier',
      label: localized('MINI-BOSS · TÀU MẸ TIỀN TUYẾN', 'MINI-BOSS · FRONTLINE CARRIER'),
      mechanicId: 'summon_escort', featuredRole: 'support', hpMultiplier: 5.8,
      speedMultiplier: .68, scaleMultiplier: 1.42, maxEntries: 4, telegraphMs: 900,
      summonRoles: ['gunner', 'raider'], guaranteedDrop: 'heal',
    }),
    previewA: encounter({
      kind: 'boss_preview', id: 'mechanical_lane_preview',
      label: localized('MÔ PHỎNG BOSS · QUÉT LÀN', 'BOSS PREVIEW · LANE SWEEP'),
      mechanicId: 'lane_sweep', featuredRole: 'artillery', hpMultiplier: 3.0,
      speedMultiplier: .72, scaleMultiplier: 1.25, maxEntries: 4, telegraphMs: 850,
    }),
    previewB: encounter({
      kind: 'boss_preview', id: 'mechanical_summon_preview',
      label: localized('MÔ PHỎNG BOSS · GỌI HỘ TỐNG', 'BOSS PREVIEW · ESCORT CALL'),
      mechanicId: 'summon_escort', featuredRole: 'support', hpMultiplier: 3.2,
      speedMultiplier: .75, scaleMultiplier: 1.28, maxEntries: 4, telegraphMs: 900,
      summonRoles: ['gunner', 'raider'],
    }),
    bossPhases: [
      phaseGate({
        id: 'mechanical_guard', threshold: .70,
        label: localized('PHA 2 · KHIÊN HỘ TỐNG', 'PHASE 2 · ESCORT SHIELD'),
        summonRoles: ['shieldbearer', 'gunner'], formation: 'escort',
        bossDamageMultiplierWhileAddsAlive: .68,
      }),
      phaseGate({
        id: 'mechanical_charge', threshold: .35,
        label: localized('PHA 3 · ĐỘT KÍCH TĂNG VIỆN', 'PHASE 3 · CHARGER REINFORCEMENTS'),
        summonRoles: ['charger', 'charger'], formation: 'pincer',
      }),
    ],
  },
  2: {
    id: 'cryo_ion_v28',
    miniBossA: encounter({
      kind: 'mini_boss', id: 'ion_sentinel',
      label: localized('MINI-BOSS · VỆ BINH ION', 'MINI-BOSS · ION SENTINEL'),
      mechanicId: 'lane_sweep', featuredRole: 'artillery', hpMultiplier: 5.0,
      speedMultiplier: .66, scaleMultiplier: 1.36, maxEntries: 5, telegraphMs: 900,
      guaranteedDrop: 'heal',
    }),
    miniBossB: encounter({
      kind: 'mini_boss', id: 'repair_frigate',
      label: localized('MINI-BOSS · HỘ TỐNG SỬA CHỮA', 'MINI-BOSS · REPAIR FRIGATE'),
      mechanicId: 'summon_escort', featuredRole: 'support', hpMultiplier: 5.6,
      speedMultiplier: .64, scaleMultiplier: 1.4, maxEntries: 4, telegraphMs: 950,
      summonRoles: ['support', 'gunner'], guaranteedDrop: 'heal',
    }),
    previewA: encounter({
      kind: 'boss_preview', id: 'ion_lane_preview',
      label: localized('MÔ PHỎNG BOSS · LÀN ION', 'BOSS PREVIEW · ION LANES'),
      mechanicId: 'lane_sweep', featuredRole: 'artillery', hpMultiplier: 3.0,
      speedMultiplier: .68, scaleMultiplier: 1.25, maxEntries: 4, telegraphMs: 900,
    }),
    previewB: encounter({
      kind: 'boss_preview', id: 'repair_call_preview',
      label: localized('MÔ PHỎNG BOSS · DRONE HỖ TRỢ', 'BOSS PREVIEW · SUPPORT DRONES'),
      mechanicId: 'summon_escort', featuredRole: 'support', hpMultiplier: 3.2,
      speedMultiplier: .7, scaleMultiplier: 1.28, maxEntries: 4, telegraphMs: 950,
      summonRoles: ['support', 'gunner'],
    }),
    bossPhases: [
      phaseGate({
        id: 'ion_nodes', threshold: .70,
        label: localized('PHA 2 · NÚT ION', 'PHASE 2 · ION NODES'),
        summonRoles: ['artillery', 'support'], formation: 'crossfire',
        bossDamageMultiplierWhileAddsAlive: .72,
      }),
      phaseGate({
        id: 'repair_screen', threshold: .35,
        label: localized('PHA 3 · MÀN SỬA CHỮA', 'PHASE 3 · REPAIR SCREEN'),
        summonRoles: ['support', 'gunner'], formation: 'escort',
        bossDamageMultiplierWhileAddsAlive: .78,
      }),
    ],
  },
  3: {
    id: 'inferno_swarm_v28',
    miniBossA: encounter({
      kind: 'mini_boss', id: 'brood_alpha',
      label: localized('MINI-BOSS · CHÚA BẦY', 'MINI-BOSS · BROOD ALPHA'),
      mechanicId: 'summon_swarm', featuredRole: 'support', hpMultiplier: 4.8,
      speedMultiplier: .76, scaleMultiplier: 1.34, maxEntries: 5, telegraphMs: 850,
      summonRoles: ['raider', 'raider', 'raider'], guaranteedDrop: 'heal',
    }),
    miniBossB: encounter({
      kind: 'mini_boss', id: 'inferno_charger',
      label: localized('MINI-BOSS · MŨI LAO HỎA NGỤC', 'MINI-BOSS · INFERNO CHARGER'),
      mechanicId: 'charge_rush', featuredRole: 'charger', hpMultiplier: 5.4,
      speedMultiplier: .88, scaleMultiplier: 1.38, maxEntries: 4, telegraphMs: 850,
      guaranteedDrop: 'heal',
    }),
    previewA: encounter({
      kind: 'boss_preview', id: 'inferno_charge_preview',
      label: localized('MÔ PHỎNG BOSS · ĐƯỜNG LAO', 'BOSS PREVIEW · CHARGE LINE'),
      mechanicId: 'charge_rush', featuredRole: 'charger', hpMultiplier: 2.8,
      speedMultiplier: .9, scaleMultiplier: 1.24, maxEntries: 4, telegraphMs: 850,
    }),
    previewB: encounter({
      kind: 'boss_preview', id: 'inferno_swarm_preview',
      label: localized('MÔ PHỎNG BOSS · TRIỆU TẬP BẦY', 'BOSS PREVIEW · SWARM CALL'),
      mechanicId: 'summon_swarm', featuredRole: 'support', hpMultiplier: 3.0,
      speedMultiplier: .78, scaleMultiplier: 1.26, maxEntries: 4, telegraphMs: 850,
      summonRoles: ['raider', 'raider', 'charger'],
    }),
    bossPhases: [
      phaseGate({
        id: 'brood_call', threshold: .70,
        label: localized('PHA 2 · BẦY SĂN MỒI', 'PHASE 2 · HUNTING BROOD'),
        summonRoles: ['raider', 'raider', 'raider'], formation: 'swarm',
      }),
      phaseGate({
        id: 'inferno_guard', threshold: .35,
        label: localized('PHA 3 · HỘ VỆ HỎA NGỤC', 'PHASE 3 · INFERNO GUARD'),
        summonRoles: ['support', 'charger', 'charger'], formation: 'pincer',
        bossDamageMultiplierWhileAddsAlive: .76,
      }),
    ],
  },
});

export function getCampaignEncounterProfileV28(planetId = 1) {
  return CAMPAIGN_ENCOUNTER_PROFILES_V28[Number(planetId)] || CAMPAIGN_ENCOUNTER_PROFILES_V28[1];
}

export function resolveCampaignWaveEncounterV28({ planetId = 1, wave = 1, totalWaves = 5, hasBoss = false } = {}) {
  const profile = getCampaignEncounterProfileV28(planetId);
  const w = clamp(Math.trunc(Number(wave) || 1), 1, 20);
  const total = clamp(Math.trunc(Number(totalWaves) || 1), 1, 20);
  if (!hasBoss) return null;
  if (w === total) return freezeValue({ kind: 'boss', id: 'final_boss', profileId: profile.id });
  if (total === 15) {
    if (w === 5) return profile.miniBossA;
    if (w === 10) return profile.miniBossB;
    if (w === 13) return profile.previewA;
    if (w === 14) return profile.previewB;
    return null;
  }
  if (total === 10) {
    if (w === 5) return profile.miniBossA;
    if (w === 9) return profile.previewA;
    return null;
  }
  if (total >= 7) {
    if (w === Math.max(3, Math.floor(total / 2))) return profile.miniBossA;
    if (w === total - 1) return profile.previewA;
  }
  return null;
}

export function createBossPhaseStateV28(planetId = 1) {
  return Object.freeze({
    version: CAMPAIGN_ENCOUNTER_ESCALATION_VERSION,
    planetId: Number(planetId) || 1,
    triggeredGateIds: Object.freeze([]),
    activeGateId: null,
  });
}

export function resolveBossDamageGateV28({ state, hp, maxHp, damage } = {}) {
  const safeMax = Math.max(1, Number(maxHp) || 1);
  const safeHp = clamp(Number(hp) || 0, 0, safeMax);
  const safeDamage = Math.max(0, Number(damage) || 0);
  const current = state || createBossPhaseStateV28(1);
  const profile = getCampaignEncounterProfileV28(current.planetId);
  const triggered = new Set(current.triggeredGateIds || []);
  const nextGate = profile.bossPhases.find(gate => !triggered.has(gate.id));
  if (!nextGate || safeHp <= 0 || safeDamage <= 0) {
    return Object.freeze({ nextHp: Math.max(0, safeHp - safeDamage), appliedDamage: Math.min(safeHp, safeDamage), gate: null, state: current });
  }
  const gateHp = safeMax * nextGate.threshold;
  const rawNext = Math.max(0, safeHp - safeDamage);
  if (safeHp > gateHp && rawNext <= gateHp) {
    const nextTriggered = Object.freeze([...(current.triggeredGateIds || []), nextGate.id]);
    return Object.freeze({
      nextHp: gateHp,
      appliedDamage: safeHp - gateHp,
      gate: nextGate,
      state: Object.freeze({ ...current, triggeredGateIds: nextTriggered, activeGateId: nextGate.id }),
    });
  }
  return Object.freeze({ nextHp: rawNext, appliedDamage: Math.min(safeHp, safeDamage), gate: null, state: current });
}

export function completeBossPhaseGateV28(state) {
  const current = state || createBossPhaseStateV28(1);
  return Object.freeze({ ...current, activeGateId: null });
}
