/**
 * Campaign planet Boss arsenal V3.3.
 *
 * This catalog is the production source of truth for final-Boss identity.
 * Each planet owns a different projectile grammar and each Stage 5/Stage 10
 * Boss owns a distinct deterministic phase sequence. Runtime may scale a
 * contract by HP phase, but it must not replace these profile identities with
 * one shared generic pattern pool.
 */
export const CAMPAIGN_BOSS_ARSENAL_VERSION = 'campaign-boss-arsenal-v3.3.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const PATTERN = (id, options) => freezeDeep({
  id,
  family: options.family,
  geometry: options.geometry,
  telegraphMs: options.telegraphMs,
  recoveryMs: options.recoveryMs,
  projectileSpeed: options.projectileSpeed,
  width: options.width,
  visualId: options.visualId,
  damageMultiplier: options.damageMultiplier ?? 1,
  shotGapMs: options.shotGapMs ?? 0,
  volleyGapMs: options.volleyGapMs ?? 0,
  shotCount: options.shotCount ?? 0,
  volleys: options.volleys ?? 1,
  spreadRadians: options.spreadRadians ?? 0,
  centerSwingRadians: options.centerSwingRadians ?? 0,
  laneOrder: options.laneOrder ?? [],
  laneCount: options.laneCount ?? 0,
  wallCount: options.wallCount ?? 0,
  radialSlots: options.radialSlots ?? 0,
  gapSlots: options.gapSlots ?? 0,
  arcHalfRadians: options.arcHalfRadians ?? 0,
  leadMs: options.leadMs ?? 0,
  scatter: options.scatter ?? [],
});

/** Pattern geometry is intentionally planet-specific and readable in portrait. */
export const CAMPAIGN_BOSS_PATTERN_CATALOG_V33 = freezeDeep({
  alpha_lock_burst: PATTERN('alpha_lock_burst', {
    family: 'alpha', geometry: 'predictive_burst', telegraphMs: 520, recoveryMs: 800,
    projectileSpeed: .80, width: .34, visualId: 'boss_alpha_rail', damageMultiplier: .94,
    shotCount: 3, spreadRadians: .10, shotGapMs: 88, leadMs: 420,
  }),
  alpha_lane_scan: PATTERN('alpha_lane_scan', {
    family: 'alpha', geometry: 'lane_sequence', telegraphMs: 650, recoveryMs: 900,
    projectileSpeed: .76, width: .52, visualId: 'boss_alpha_matrix', damageMultiplier: 1.0,
    laneOrder: [-.72, .72, -.24, .24, 0], shotGapMs: 72,
  }),
  alpha_crossfire: PATTERN('alpha_crossfire', {
    family: 'alpha', geometry: 'alternating_fan', telegraphMs: 600, recoveryMs: 860,
    projectileSpeed: .78, width: .36, visualId: 'boss_alpha_cross', damageMultiplier: .92,
    shotCount: 5, volleys: 2, spreadRadians: .64, centerSwingRadians: .18,
    shotGapMs: 24, volleyGapMs: 165,
  }),
  alpha_overdrive: PATTERN('alpha_overdrive', {
    family: 'alpha', geometry: 'alternating_fan', telegraphMs: 570, recoveryMs: 780,
    projectileSpeed: .82, width: .34, visualId: 'boss_alpha_cross', damageMultiplier: .88,
    shotCount: 5, volleys: 3, spreadRadians: .72, centerSwingRadians: .22,
    shotGapMs: 20, volleyGapMs: 135,
  }),

  cryo_prism_fan: PATTERN('cryo_prism_fan', {
    family: 'cryo', geometry: 'gap_fan', telegraphMs: 660, recoveryMs: 940,
    projectileSpeed: .78, width: .43, visualId: 'boss_cryo_prism', damageMultiplier: .96,
    radialSlots: 11, gapSlots: 2, volleys: 2, arcHalfRadians: 1.02,
    shotGapMs: 18, volleyGapMs: 220,
  }),
  cryo_wall_shift: PATTERN('cryo_wall_shift', {
    family: 'cryo', geometry: 'lane_wall_gap', telegraphMs: 730, recoveryMs: 980,
    projectileSpeed: .80, width: .58, visualId: 'boss_cryo_wall', damageMultiplier: 1.02,
    laneCount: 7, wallCount: 2, gapSlots: 1, shotGapMs: 24, volleyGapMs: 245,
  }),
  cryo_shard_cage: PATTERN('cryo_shard_cage', {
    family: 'cryo', geometry: 'staggered_tridents', telegraphMs: 700, recoveryMs: 960,
    projectileSpeed: .82, width: .42, visualId: 'boss_cryo_shard', damageMultiplier: .94,
    shotCount: 3, volleys: 3, spreadRadians: .22, centerSwingRadians: .34,
    shotGapMs: 28, volleyGapMs: 175, leadMs: 260,
  }),
  cryo_absolute_zero: PATTERN('cryo_absolute_zero', {
    family: 'cryo', geometry: 'lane_wall_gap', telegraphMs: 760, recoveryMs: 1040,
    projectileSpeed: .84, width: .62, visualId: 'boss_cryo_wall', damageMultiplier: 1.04,
    laneCount: 9, wallCount: 2, gapSlots: 1, shotGapMs: 20, volleyGapMs: 210,
  }),

  inferno_meteor_burst: PATTERN('inferno_meteor_burst', {
    family: 'inferno', geometry: 'target_cluster', telegraphMs: 500, recoveryMs: 720,
    projectileSpeed: .86, width: .50, visualId: 'boss_inferno_meteor', damageMultiplier: 1.08,
    shotCount: 6, shotGapMs: 62, leadMs: 320,
    scatter: [-.82, .58, -.34, .88, .12, -.58],
  }),
  inferno_furnace_fan: PATTERN('inferno_furnace_fan', {
    family: 'inferno', geometry: 'fan_volley', telegraphMs: 530, recoveryMs: 720,
    projectileSpeed: .88, width: .38, visualId: 'boss_inferno_lance', damageMultiplier: .92,
    shotCount: 9, volleys: 2, spreadRadians: 1.12, centerSwingRadians: .12,
    shotGapMs: 14, volleyGapMs: 145,
  }),
  inferno_eruption: PATTERN('inferno_eruption', {
    family: 'inferno', geometry: 'forward_arc_gap', telegraphMs: 580, recoveryMs: 760,
    projectileSpeed: .86, width: .44, visualId: 'boss_inferno_ember', damageMultiplier: .96,
    radialSlots: 19, gapSlots: 3, arcHalfRadians: 1.26, shotGapMs: 9,
  }),
  inferno_doomstorm: PATTERN('inferno_doomstorm', {
    family: 'inferno', geometry: 'target_cluster', telegraphMs: 560, recoveryMs: 700,
    projectileSpeed: .92, width: .52, visualId: 'boss_inferno_meteor', damageMultiplier: 1.02,
    shotCount: 9, shotGapMs: 48, leadMs: 380,
    scatter: [-1, .72, -.52, 1.0, .28, -.78, .52, -.18, .84],
  }),
});

const PROFILE = options => freezeDeep({
  id: options.id,
  planetId: options.planetId,
  bossType: options.bossType,
  powerRank: options.powerRank,
  label: options.label,
  damageType: options.damageType,
  baseProjectileDamage: options.baseProjectileDamage,
  projectileSpeedMultiplier: options.projectileSpeedMultiplier,
  recoveryMultiplier: options.recoveryMultiplier,
  telegraphMultiplier: options.telegraphMultiplier,
  movementMultiplier: options.movementMultiplier,
  phasePatterns: options.phasePatterns,
});

export const CAMPAIGN_PLANET_BOSS_PROFILES_V33 = freezeDeep({
  1: {
    mech: PROFILE({
      id: 'alpha_mech_sentinel', planetId: 1, bossType: 'mech', powerRank: 1,
      label: 'Alpha Sentinel', damageType: 'energy', baseProjectileDamage: 125,
      projectileSpeedMultiplier: 1.00, recoveryMultiplier: 1.00,
      telegraphMultiplier: 1.00, movementMultiplier: 1.00,
      phasePatterns: {
        phase_1: ['alpha_lock_burst'],
        phase_2: ['alpha_lane_scan', 'alpha_lock_burst'],
        phase_3: ['alpha_crossfire', 'alpha_lane_scan'],
      },
    }),
    alien: PROFILE({
      id: 'alpha_alien_overseer', planetId: 1, bossType: 'alien', powerRank: 2,
      label: 'Alpha Overseer', damageType: 'energy', baseProjectileDamage: 145,
      projectileSpeedMultiplier: 1.06, recoveryMultiplier: .92,
      telegraphMultiplier: .97, movementMultiplier: 1.05,
      phasePatterns: {
        phase_1: ['alpha_crossfire', 'alpha_lock_burst'],
        phase_2: ['alpha_overdrive', 'alpha_lane_scan'],
        phase_3: ['alpha_overdrive', 'alpha_crossfire', 'alpha_lane_scan'],
      },
    }),
  },
  2: {
    mech: PROFILE({
      id: 'cryo_mech_warden', planetId: 2, bossType: 'mech', powerRank: 3,
      label: 'Cryo Warden', damageType: 'ion', baseProjectileDamage: 155,
      projectileSpeedMultiplier: 1.09, recoveryMultiplier: .88,
      telegraphMultiplier: .95, movementMultiplier: 1.06,
      phasePatterns: {
        phase_1: ['cryo_prism_fan'],
        phase_2: ['cryo_wall_shift', 'cryo_prism_fan'],
        phase_3: ['cryo_shard_cage', 'cryo_wall_shift'],
      },
    }),
    alien: PROFILE({
      id: 'cryo_alien_dragon', planetId: 2, bossType: 'alien', powerRank: 4,
      label: 'Cryo Dragon', damageType: 'ion', baseProjectileDamage: 180,
      projectileSpeedMultiplier: 1.15, recoveryMultiplier: .80,
      telegraphMultiplier: .92, movementMultiplier: 1.10,
      phasePatterns: {
        phase_1: ['cryo_shard_cage', 'cryo_prism_fan'],
        phase_2: ['cryo_wall_shift', 'cryo_shard_cage'],
        phase_3: ['cryo_absolute_zero', 'cryo_wall_shift'],
      },
    }),
  },
  3: {
    mech: PROFILE({
      id: 'inferno_mech_forge', planetId: 3, bossType: 'mech', powerRank: 5,
      label: 'Inferno Forge', damageType: 'explosive', baseProjectileDamage: 195,
      projectileSpeedMultiplier: 1.20, recoveryMultiplier: .75,
      telegraphMultiplier: .90, movementMultiplier: 1.14,
      phasePatterns: {
        phase_1: ['inferno_meteor_burst'],
        phase_2: ['inferno_furnace_fan', 'inferno_meteor_burst'],
        phase_3: ['inferno_eruption', 'inferno_furnace_fan'],
      },
    }),
    alien: PROFILE({
      id: 'inferno_alien_demon', planetId: 3, bossType: 'alien', powerRank: 6,
      label: 'Inferno Demon', damageType: 'explosive', baseProjectileDamage: 225,
      projectileSpeedMultiplier: 1.27, recoveryMultiplier: .66,
      telegraphMultiplier: .86, movementMultiplier: 1.20,
      phasePatterns: {
        phase_1: ['inferno_furnace_fan', 'inferno_meteor_burst'],
        phase_2: ['inferno_eruption', 'inferno_meteor_burst'],
        phase_3: ['inferno_doomstorm', 'inferno_eruption', 'inferno_furnace_fan'],
      },
    }),
  },
});

export const CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33 = freezeDeep({
  1: { previewProjectileSpeed: .62, miniBossProjectileSpeedMultiplier: 1.40 },
  2: { previewProjectileSpeed: .72, miniBossProjectileSpeedMultiplier: 1.55 },
  3: { previewProjectileSpeed: .82, miniBossProjectileSpeedMultiplier: 1.72 },
});

export function resolveCampaignBossProfileV33({ planetId = 1, bossType = 'mech', profileId = null } = {}) {
  const byId = Object.values(CAMPAIGN_PLANET_BOSS_PROFILES_V33)
    .flatMap(group => Object.values(group));
  if (profileId) {
    const exact = byId.find(profile => profile.id === profileId);
    if (exact) return exact;
  }
  const planet = CAMPAIGN_PLANET_BOSS_PROFILES_V33[planetId]
    || CAMPAIGN_PLANET_BOSS_PROFILES_V33[1];
  return planet[bossType] || planet.mech || Object.values(planet)[0];
}

export function resolveCampaignBossPatternV33({ profile, phaseId = 'phase_1', cycle = 0 } = {}) {
  const resolvedProfile = profile || resolveCampaignBossProfileV33();
  const pool = resolvedProfile.phasePatterns?.[phaseId]
    || resolvedProfile.phasePatterns?.phase_1 || [];
  if (!pool.length) return null;
  const phaseSalt = phaseId === 'phase_3' ? 2 : phaseId === 'phase_2' ? 1 : 0;
  return pool[(Math.max(0, Math.trunc(Number(cycle) || 0)) + phaseSalt) % pool.length];
}

export function resolveCampaignBossPatternContractV33({ profile, phaseId, pattern, phaseCombat } = {}) {
  const resolvedProfile = profile || resolveCampaignBossProfileV33();
  const base = CAMPAIGN_BOSS_PATTERN_CATALOG_V33[pattern];
  if (!base) return null;
  const phase = phaseCombat || {};
  const telegraphMultiplier = resolvedProfile.telegraphMultiplier
    * (Number(phase.telegraphMultiplier) || 1);
  const recoveryMultiplier = resolvedProfile.recoveryMultiplier
    * (Number(phase.recoveryMultiplier) || 1);
  const projectileSpeedMultiplier = resolvedProfile.projectileSpeedMultiplier
    * (Number(phase.projectileSpeedMultiplier) || 1);
  const damageMultiplier = (Number(phase.damageMultiplier) || 1) * base.damageMultiplier;
  return freezeDeep({
    ...base,
    profileId: resolvedProfile.id,
    planetId: resolvedProfile.planetId,
    bossType: resolvedProfile.bossType,
    phaseId,
    telegraphMs: Math.max(420, Math.round(base.telegraphMs * telegraphMultiplier)),
    recoveryMs: Math.max(360, Math.round(base.recoveryMs * recoveryMultiplier)),
    projectileSpeed: base.projectileSpeed * projectileSpeedMultiplier,
    projectileDamage: Math.max(1, Math.round(resolvedProfile.baseProjectileDamage * damageMultiplier)),
    damageType: resolvedProfile.damageType,
  });
}

export function resolveCampaignHostileFireTempoV33(planetId = 1) {
  return CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[planetId]
    || CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33[1];
}

export function auditCampaignBossArsenalV33() {
  const issues = [];
  const patterns = CAMPAIGN_BOSS_PATTERN_CATALOG_V33;
  const profiles = Object.values(CAMPAIGN_PLANET_BOSS_PROFILES_V33)
    .flatMap(group => Object.values(group));
  if (profiles.length !== 6) issues.push('BOSS_PROFILE_COUNT');
  if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) issues.push('DUPLICATE_PROFILE_ID');
  const ranks = profiles.map(profile => profile.powerRank).sort((a, b) => a - b);
  if (ranks.join(',') !== '1,2,3,4,5,6') issues.push('POWER_RANK_ORDER');
  for (const profile of profiles) {
    if (!(profile.baseProjectileDamage > 0 && profile.projectileSpeedMultiplier > 0))
      issues.push(`PROFILE_POWER:${profile.id}`);
    if (!(profile.recoveryMultiplier > 0 && profile.telegraphMultiplier > 0
      && profile.movementMultiplier > 0)) issues.push(`PROFILE_TEMPO:${profile.id}`);
    const ids = Object.values(profile.phasePatterns || {}).flat();
    if (!ids.length) issues.push(`PROFILE_PATTERNS:${profile.id}`);
    for (const patternId of ids) {
      const pattern = patterns[patternId];
      if (!pattern) issues.push(`MISSING_PATTERN:${profile.id}:${patternId}`);
      else if (pattern.family !== (profile.planetId === 1 ? 'alpha' : profile.planetId === 2 ? 'cryo' : 'inferno'))
        issues.push(`PATTERN_FAMILY:${profile.id}:${patternId}`);
    }
  }
  for (const [id, pattern] of Object.entries(patterns)) {
    if (!(pattern.telegraphMs >= 480 && pattern.recoveryMs >= 650)) issues.push(`READABILITY:${id}`);
    if (!(pattern.projectileSpeed >= .72 && pattern.projectileSpeed <= 1)) issues.push(`SPEED:${id}`);
    if (!String(pattern.visualId || '').startsWith('boss_')) issues.push(`VISUAL:${id}`);
  }
  const tempo = Object.values(CAMPAIGN_PLANET_HOSTILE_FIRE_TEMPO_V33);
  for (let index = 1; index < tempo.length; index += 1) {
    if (!(tempo[index].previewProjectileSpeed > tempo[index - 1].previewProjectileSpeed
      && tempo[index].miniBossProjectileSpeedMultiplier > tempo[index - 1].miniBossProjectileSpeedMultiplier)) {
      issues.push('PLANET_HOSTILE_TEMPO_ORDER');
    }
  }
  const signatures = [1, 2, 3].map(planetId => Object.values(CAMPAIGN_PLANET_BOSS_PROFILES_V33[planetId])
    .flatMap(profile => Object.values(profile.phasePatterns).flat()).sort().join('|'));
  if (new Set(signatures).size !== signatures.length) issues.push('PLANET_PATTERN_IDENTITY');
  return Object.freeze(issues);
}

export function clampCampaignBossProfileValueV33(value, min, max) {
  return clamp(Number(value) || 0, min, max);
}
