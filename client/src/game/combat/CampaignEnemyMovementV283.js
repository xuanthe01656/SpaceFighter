export const CAMPAIGN_ENEMY_MOVEMENT_VERSION = 'campaign-enemy-movement-v2.8.3';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const deepFreeze = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deepFreeze(entry)])));
  }
  return value;
};

export const CAMPAIGN_ENEMY_MOVEMENT_PROFILES_V283 = deepFreeze({
  raider: {
    id: 'raider_flank_pass',
    decisionMs: 920,
    description: 'flank, cross the player lane, then reset instead of direct homing',
  },
  gunner: {
    id: 'gunner_range_strafe',
    decisionMs: 1380,
    description: 'maintain firing range while alternating lateral pressure',
  },
  shieldbearer: {
    id: 'shieldbearer_lane_guard',
    decisionMs: 1650,
    description: 'guard a lane between the backline and the player',
  },
  support: {
    id: 'support_offset_orbit',
    decisionMs: 1500,
    description: 'orbit a support anchor without stacking on the same point',
  },
  artillery: {
    id: 'artillery_backline_relocate',
    decisionMs: 2150,
    description: 'hold the readable backline and periodically change firing position',
  },
  boss_preview: {
    id: 'boss_preview_arc_reposition',
    decisionMs: 1320,
    description: 'arc between attack anchors, slow during tracking and hold after lock',
  },
});

const profileKeyFor = ({ role, encounterKind } = {}) => {
  if (encounterKind === 'boss_preview') return 'boss_preview';
  return CAMPAIGN_ENEMY_MOVEMENT_PROFILES_V283[role] ? role : 'gunner';
};

const stateSeed = ({ lane = 0, strafeDirection = 1, phaseOffset = 0 } = {}) => {
  const lanePart = Math.abs(Math.trunc(finite(lane, 0) * 1000));
  const phasePart = Math.abs(Math.trunc(finite(phaseOffset, 0) * 1000));
  return (lanePart * 31 + phasePart * 17 + (Number(strafeDirection) < 0 ? 97 : 19)) >>> 0;
};

const decisionDurationMs = (profile, seed, decisionIndex) => {
  const jitterBucket = (seed + decisionIndex * 37) % 21;
  const jitter = (jitterBucket - 10) / 100;
  return Math.max(500, Math.round(profile.decisionMs * (1 + jitter)));
};

export function resolveCampaignHudSafeBandV283({
  worldHalfHeight = 15,
  hudOcclusionLineZ,
  encounterScale = 1,
} = {}) {
  const half = Math.max(8, finite(worldHalfHeight, 15));
  const fallbackLine = -half + half * .38;
  const hudLine = clamp(finite(hudOcclusionLineZ, fallbackLine), -half + 2.5, half - 8);
  const scale = clamp(finite(encounterScale, 1), .75, 2.5);
  const visualClearance = clamp(1.45 + Math.max(0, scale - 1) * .9, 1.35, 2.55);
  const topSafeZ = clamp(hudLine + visualClearance, -half + 4.2, half - 8.2);
  return Object.freeze({
    worldHalfHeight: half,
    hudOcclusionLineZ: hudLine,
    topSafeZ,
    miniBossAnchorZ: clamp(topSafeZ + .55, -half + 5.2, half - 7.2),
    bossPreviewAnchorZ: clamp(topSafeZ + 1.65, -half + 6.2, half - 6.4),
    rangedAnchorZ: clamp(topSafeZ + 2.35, -half + 6.8, half - 5.6),
    bottomSafeZ: half - 3.0,
  });
}

export function resolveCampaignMiniBossAnchorZV283({
  worldHalfHeight = 15,
  hudOcclusionLineZ,
  requestedOffsetZ = 5.4,
  encounterScale = 1,
} = {}) {
  const half = Math.max(8, finite(worldHalfHeight, 15));
  const requested = -half + clamp(finite(requestedOffsetZ, 5.4), 3, half * 1.25);
  const band = resolveCampaignHudSafeBandV283({
    worldHalfHeight: half,
    hudOcclusionLineZ,
    encounterScale,
  });
  return Math.max(requested, band.miniBossAnchorZ);
}

export function createCampaignEnemyMovementStateV283({
  role = 'gunner',
  encounterKind = null,
  lane = 0,
  strafeDirection = 1,
  phaseOffset = 0,
  nowMs = 0,
} = {}) {
  const profileKey = profileKeyFor({ role, encounterKind });
  const profile = CAMPAIGN_ENEMY_MOVEMENT_PROFILES_V283[profileKey];
  const seed = stateSeed({ lane, strafeDirection, phaseOffset });
  const startedAt = Math.max(0, finite(nowMs, 0));
  const decisionIndex = seed % 4;
  return Object.freeze({
    version: CAMPAIGN_ENEMY_MOVEMENT_VERSION,
    profileKey,
    profileId: profile.id,
    role: String(role || 'gunner'),
    encounterKind: encounterKind || null,
    baseLane: clamp(finite(lane, 0), -.88, .88),
    direction: Number(strafeDirection) < 0 ? -1 : 1,
    phaseOffset: finite(phaseOffset, 0),
    seed,
    decisionIndex,
    decisionStartedAt: startedAt,
    nextDecisionAt: startedAt + decisionDurationMs(profile, seed, decisionIndex),
  });
}

const advanceState = (state, nowMs) => {
  const profile = CAMPAIGN_ENEMY_MOVEMENT_PROFILES_V283[state.profileKey]
    || CAMPAIGN_ENEMY_MOVEMENT_PROFILES_V283.gunner;
  let decisionIndex = state.decisionIndex;
  let decisionStartedAt = state.decisionStartedAt;
  let nextDecisionAt = state.nextDecisionAt;
  let hops = 0;
  while (nowMs >= nextDecisionAt && hops < 8) {
    decisionIndex += 1;
    decisionStartedAt = nextDecisionAt;
    nextDecisionAt += decisionDurationMs(profile, state.seed, decisionIndex);
    hops += 1;
  }
  if (decisionIndex === state.decisionIndex && nextDecisionAt === state.nextDecisionAt) return state;
  return Object.freeze({ ...state, decisionIndex, decisionStartedAt, nextDecisionAt });
};

const alternatingDirection = (state, span = 1) => {
  const block = Math.floor(state.decisionIndex / Math.max(1, span));
  return state.direction * (block % 2 === 0 ? 1 : -1);
};

const movement = (options = {}) => Object.freeze({
  mode: options.mode || 'hold',
  targetX: finite(options.targetX, 0),
  targetZ: finite(options.targetZ, 0),
  speedMultiplier: Math.max(0, finite(options.speedMultiplier, 0)),
  arrivalRadius: Math.max(.05, finite(options.arrivalRadius, .35)),
  facePlayer: Boolean(options.facePlayer),
  minZ: finite(options.minZ, -Infinity),
  maxZ: finite(options.maxZ, Infinity),
});

export function stepCampaignEnemyMovementV283(state, input = {}) {
  if (!state) return Object.freeze({ state: null, movement: null });
  const nowMs = Math.max(0, finite(input.nowMs, 0));
  const next = advanceState(state, nowMs);
  const arenaHalfWidth = Math.max(2.5, finite(input.arenaHalfWidth, 7));
  const xBound = Math.max(2, arenaHalfWidth - .35);
  const enemyX = clamp(finite(input.enemyX, 0), -xBound, xBound);
  const enemyZ = finite(input.enemyZ, 0);
  const playerX = clamp(finite(input.playerX, 0), -xBound, xBound);
  const playerZ = finite(input.playerZ, 7);
  const band = resolveCampaignHudSafeBandV283({
    worldHalfHeight: input.worldHalfHeight,
    hudOcclusionLineZ: input.hudOcclusionLineZ,
    encounterScale: input.encounterScale,
  });
  const baseX = clamp(next.baseLane * xBound, -xBound, xBound);
  const phase = next.decisionIndex;
  const wave = nowMs * .001 + next.phaseOffset;

  if (next.profileKey === 'boss_preview') {
    const locked = input.attackPlanPhase === 'locked';
    if (locked) {
      return Object.freeze({
        state: next,
        movement: movement({
          mode: 'preview_lock_hold',
          targetX: enemyX,
          targetZ: enemyZ,
          speedMultiplier: 0,
          arrivalRadius: .1,
          // Preserve both position and orientation after V2.8.2 locks the
          // muzzle transform. Turning here would move the local muzzle even
          // though the immutable telegraph/projectile plan is already frozen.
          facePlayer: false,
          minZ: band.topSafeZ,
          maxZ: band.bottomSafeZ,
        }),
      });
    }
    const laneSequence = [.62, -.62, .20, -.24, .46, -.46, 0];
    const laneIndex = (next.seed + phase) % laneSequence.length;
    const laneNorm = clamp(laneSequence[laneIndex] * next.direction + playerX / xBound * .12, -.82, .82);
    const mechanicPhase = String(input.mechanicPhase || 'idle');
    const tracking = mechanicPhase === 'telegraph' || mechanicPhase === 'waiting_charge';
    return Object.freeze({
      state: next,
      movement: movement({
        mode: tracking ? 'preview_attack_track' : 'preview_arc_reposition',
        targetX: laneNorm * xBound,
        targetZ: band.bossPreviewAnchorZ + Math.sin(wave * 1.45) * .62,
        speedMultiplier: tracking ? .58 : mechanicPhase === 'complete' ? 1.02 : .78,
        arrivalRadius: .28,
        facePlayer: tracking,
        minZ: band.topSafeZ,
        maxZ: band.bottomSafeZ - 2,
      }),
    });
  }

  if (next.profileKey === 'raider') {
    const localPhase = phase % 3;
    const direction = alternatingDirection(next, 3);
    if (localPhase === 0) {
      return Object.freeze({ state: next, movement: movement({
        mode: 'raider_flank',
        targetX: clamp(playerX + direction * 3.2, -xBound, xBound),
        targetZ: clamp(playerZ - 4.2, band.topSafeZ + .4, band.bottomSafeZ - 1),
        speedMultiplier: 1.18,
        arrivalRadius: .38,
        minZ: band.topSafeZ,
        maxZ: band.bottomSafeZ,
      }) });
    }
    if (localPhase === 1) {
      return Object.freeze({ state: next, movement: movement({
        mode: 'raider_cross_pass',
        targetX: clamp(playerX - direction * 2.7, -xBound, xBound),
        targetZ: clamp(playerZ + 1.6, band.rangedAnchorZ, band.bottomSafeZ),
        speedMultiplier: 1.34,
        arrivalRadius: .42,
        minZ: band.topSafeZ,
        maxZ: band.bottomSafeZ,
      }) });
    }
    return Object.freeze({ state: next, movement: movement({
      mode: 'raider_reset',
      targetX: clamp(baseX + direction * 1.1, -xBound, xBound),
      targetZ: band.rangedAnchorZ + 1.4,
      speedMultiplier: 1.04,
      arrivalRadius: .36,
      minZ: band.topSafeZ,
      maxZ: band.bottomSafeZ,
    }) });
  }

  if (next.profileKey === 'shieldbearer') {
    const direction = alternatingDirection(next, 1);
    return Object.freeze({ state: next, movement: movement({
      mode: 'shieldbearer_lane_guard',
      targetX: clamp(baseX * .58 + playerX * .42 + direction * .8, -xBound, xBound),
      targetZ: clamp(playerZ - 6.1, band.rangedAnchorZ - .25, band.bottomSafeZ - 2),
      speedMultiplier: .78,
      arrivalRadius: .32,
      facePlayer: true,
      minZ: band.topSafeZ,
      maxZ: band.bottomSafeZ,
    }) });
  }

  if (next.profileKey === 'support') {
    const angle = wave * 1.08 + phase * .42;
    const anchorX = clamp(baseX * .68 + playerX * .18, -xBound, xBound);
    return Object.freeze({ state: next, movement: movement({
      mode: 'support_offset_orbit',
      targetX: clamp(anchorX + Math.cos(angle) * 2.05, -xBound, xBound),
      targetZ: clamp(band.rangedAnchorZ + 1.15 + Math.sin(angle * 1.25) * .85,
        band.topSafeZ, band.bottomSafeZ - 2.2),
      speedMultiplier: .86,
      arrivalRadius: .3,
      facePlayer: true,
      minZ: band.topSafeZ,
      maxZ: band.bottomSafeZ,
    }) });
  }

  if (next.profileKey === 'artillery') {
    const laneSequence = [-.68, .68, -.25, .25, 0];
    const laneNorm = clamp(next.baseLane * .35
      + laneSequence[(next.seed + phase) % laneSequence.length] * .65, -.78, .78);
    return Object.freeze({ state: next, movement: movement({
      mode: 'artillery_backline_relocate',
      targetX: laneNorm * xBound,
      targetZ: band.topSafeZ + 1.05 + Math.sin(wave * .72) * .32,
      speedMultiplier: .72,
      arrivalRadius: .28,
      facePlayer: true,
      minZ: band.topSafeZ,
      maxZ: band.rangedAnchorZ + .7,
    }) });
  }

  const direction = alternatingDirection(next, 1);
  return Object.freeze({ state: next, movement: movement({
    mode: 'gunner_range_strafe',
    targetX: clamp(playerX + direction * (2.75 + Math.abs(next.baseLane) * .75)
      + Math.sin(wave * 1.35) * .55, -xBound, xBound),
    targetZ: clamp(playerZ - 7.2 + Math.cos(wave * 1.1) * .62,
      band.rangedAnchorZ, band.bottomSafeZ - 1.3),
    speedMultiplier: .96,
    arrivalRadius: .32,
    facePlayer: true,
    minZ: band.topSafeZ,
    maxZ: band.bottomSafeZ,
  }) });
}
