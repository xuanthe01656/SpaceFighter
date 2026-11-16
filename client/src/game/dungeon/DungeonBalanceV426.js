/**
 * Dungeon balance and damage-integrity contracts V4.2.6.
 *
 * Goals:
 * - keep the authored Taurus -> Nereus -> Abaddon difficulty curve explicit;
 * - make Nereus ion pressure meaningfully drain passive shields without bypassing HP;
 * - keep projectile collision readable on portrait devices;
 * - calibrate QA presets so bosses live long enough to exercise their mechanics.
 *
 * This module does not own rewards, progression, Firebase writes or player loadouts.
 */
export const DUNGEON_BALANCE_VERSION_V426 = 'dungeon-balance-v4.2.6';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

export const DUNGEON_BALANCE_PROFILES_V426 = freezeDeep({
  dung_taurus: {
    rank: 1,
    identity: 'entry_kinetic',
    incomingDamage: { projectile: 1, environment: 1, contact: 1, boss: 1 },
    shieldPressure: { kinetic: 1, energy: 1, ion: 1, void: 1 },
    hitRadius: { normal: 1, elite: 1, boss: 1, max: 1.55 },
  },
  dung_nereus: {
    rank: 2,
    identity: 'ion_control',
    incomingDamage: { projectile: 1.05, environment: 1.10, contact: 1, boss: 1.12 },
    // Extra pressure is shield-only. It never increases HP damage after the shield breaks.
    shieldPressure: { kinetic: 1, energy: 1.35, ion: 1.85, void: 1.20 },
    hitRadius: { normal: 1.10, elite: 1.12, boss: 1.18, max: 1.72 },
  },
  dung_abaddon: {
    rank: 3,
    identity: 'rift_survival',
    incomingDamage: { projectile: 1.08, environment: 1.18, contact: 1.15, boss: 1.18 },
    shieldPressure: { kinetic: 1.12, energy: 1.18, ion: 1.20, void: 1.45 },
    hitRadius: { normal: 1.06, elite: 1.10, boss: 1.12, max: 1.75 },
  },
});

export const DUNGEON_QA_OUTGOING_SCALE_BY_PRESET_V426 = freezeDeep({
  account: 1,
  assault_mk3: .10,
  control_mk3: .22,
  fortress_mk4: .28,
  stress_mk4: .12,
});

export function resolveDungeonBalanceProfileV426(dungeonId = 'dung_taurus') {
  return DUNGEON_BALANCE_PROFILES_V426[dungeonId]
    || DUNGEON_BALANCE_PROFILES_V426.dung_taurus;
}

export function resolveDungeonIncomingDamageV426({
  dungeonId = 'dung_taurus',
  rawDamage = 0,
  source = 'projectile',
  damageType = 'kinetic',
  priority = 'normal',
  passiveShieldHp = 0,
} = {}) {
  const profile = resolveDungeonBalanceProfileV426(dungeonId);
  const sourceKey = source === 'environment' ? 'environment'
    : source === 'contact' ? 'contact'
      : priority === 'boss' ? 'boss' : 'projectile';
  const baseScale = finite(profile.incomingDamage[sourceKey], 1);
  const damage = Math.max(0, finite(rawDamage, 0) * baseScale);
  const shieldMultiplier = Math.max(1,
    finite(profile.shieldPressure[damageType], finite(profile.shieldPressure.energy, 1)));
  const shieldAvailable = Math.max(0, finite(passiveShieldHp, 0));
  const extraShieldDamage = shieldAvailable > 0
    ? Math.min(shieldAvailable, damage * Math.max(0, shieldMultiplier - 1))
    : 0;
  return Object.freeze({
    damage,
    sourceScale: baseScale,
    shieldPressureMultiplier: shieldMultiplier,
    extraShieldDamage,
  });
}

export function resolveDungeonHostileHitRadiusV426({
  dungeonId = 'dung_taurus',
  baseRadius = 1,
  priority = 'normal',
} = {}) {
  const profile = resolveDungeonBalanceProfileV426(dungeonId);
  const key = priority === 'boss' ? 'boss' : priority === 'elite' ? 'elite' : 'normal';
  return clamp(
    finite(baseRadius, 1) * finite(profile.hitRadius[key], 1),
    .85,
    finite(profile.hitRadius.max, 1.55),
  );
}

export function resolveDungeonQaPresetDamageScaleV426(presetId = 'account') {
  return finite(DUNGEON_QA_OUTGOING_SCALE_BY_PRESET_V426[presetId], 1);
}

export function auditDungeonBalanceV426() {
  const issues = [];
  const order = ['dung_taurus', 'dung_nereus', 'dung_abaddon'];
  for (let index = 1; index < order.length; index += 1) {
    const previous = resolveDungeonBalanceProfileV426(order[index - 1]);
    const current = resolveDungeonBalanceProfileV426(order[index]);
    if (!(current.rank > previous.rank)) issues.push(`RANK_CURVE:${order[index]}`);
    if (!(current.incomingDamage.boss > previous.incomingDamage.boss)) {
      issues.push(`BOSS_PRESSURE_CURVE:${order[index]}`);
    }
  }
  const nereus = resolveDungeonIncomingDamageV426({
    dungeonId: 'dung_nereus', rawDamage: 100, damageType: 'ion', passiveShieldHp: 500,
  });
  if (!(nereus.damage > 100 && nereus.extraShieldDamage >= 80)) issues.push('NEREUS_ION_PRESSURE');
  const taurus = resolveDungeonIncomingDamageV426({
    dungeonId: 'dung_taurus', rawDamage: 100, damageType: 'kinetic', passiveShieldHp: 500,
  });
  if (taurus.extraShieldDamage !== 0 || taurus.damage !== 100) issues.push('TAURUS_BASELINE');
  if (!(resolveDungeonHostileHitRadiusV426({ dungeonId: 'dung_nereus', baseRadius: 1.2, priority: 'boss' }) > 1.2)) {
    issues.push('NEREUS_HIT_RADIUS');
  }
  for (const preset of ['assault_mk3', 'control_mk3', 'fortress_mk4', 'stress_mk4']) {
    const scale = resolveDungeonQaPresetDamageScaleV426(preset);
    if (!(scale >= .03 && scale < 1)) issues.push(`QA_SCALE:${preset}`);
  }
  return Object.freeze(issues);
}
