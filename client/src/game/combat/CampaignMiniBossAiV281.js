export const CAMPAIGN_MINI_BOSS_AI_VERSION = 'campaign-mini-boss-ai-v2.8.1';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const freeze = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freeze(entry)])));
  }
  return value;
};

const normalizeDirection = (x, z, fallback = { x: 0, z: 1 }) => {
  const length = Math.hypot(Number(x) || 0, Number(z) || 0);
  if (length < 0.0001) return Object.freeze({ x: fallback.x, z: fallback.z });
  return Object.freeze({ x: x / length, z: z / length });
};

const PROFILE = options => freeze({
  id: options.id,
  attackType: options.attackType,
  anchorLanes: options.anchorLanes ?? [0, -.42, .42],
  anchorOffsetZ: options.anchorOffsetZ ?? 5.4,
  repositionTimeoutMs: options.repositionTimeoutMs ?? 1100,
  telegraphMs: options.telegraphMs ?? 760,
  recoveryMs: options.recoveryMs ?? 1450,
  movementSpeedMultiplier: options.movementSpeedMultiplier ?? 1.2,
  burstCount: options.burstCount ?? 3,
  shotGapMs: options.shotGapMs ?? 220,
  aimedShotCount: options.aimedShotCount ?? 3,
  spreadRadians: options.spreadRadians ?? .12,
  projectileSpeed: options.projectileSpeed ?? .34,
  projectileSpeedSequence: options.projectileSpeedSequence ?? [],
  lanePatterns: options.lanePatterns ?? [],
  maxSummons: options.maxSummons ?? 0,
  resummonHpRatio: options.resummonHpRatio ?? .48,
  chargeMs: options.chargeMs ?? 700,
  chargeSpeedMultiplier: options.chargeSpeedMultiplier ?? 4.6,
  postChargeShotCount: options.postChargeShotCount ?? 3,
});

const FIVE_LANE_PATTERNS = freeze([
  [-.8, 0, .8],
  [-.8, -.4, .4],
  [-.4, .4, .8],
  [-.4, 0, .4],
]);

export const CAMPAIGN_MINI_BOSS_AI_PROFILES_V281 = freeze({
  mechanical_warden: PROFILE({
    id: 'mechanical_warden', attackType: 'lane_barrage', anchorLanes: [0, -.44, .44],
    telegraphMs: 850, recoveryMs: 1450, burstCount: 3, shotGapMs: 230,
    projectileSpeedSequence: [.34, .38, .34], lanePatterns: FIVE_LANE_PATTERNS,
  }),
  ion_sentinel: PROFILE({
    id: 'ion_sentinel', attackType: 'lane_barrage', anchorLanes: [.38, -.38, 0],
    telegraphMs: 900, recoveryMs: 1550, burstCount: 3, shotGapMs: 260,
    projectileSpeedSequence: [.28, .42, .32], lanePatterns: FIVE_LANE_PATTERNS,
  }),
  frontline_carrier: PROFILE({
    id: 'frontline_carrier', attackType: 'summon_burst', anchorLanes: [-.45, .45, 0],
    telegraphMs: 780, recoveryMs: 1650, burstCount: 3, shotGapMs: 200,
    aimedShotCount: 3, spreadRadians: .11, projectileSpeed: .33,
    maxSummons: 2, resummonHpRatio: .50,
  }),
  repair_frigate: PROFILE({
    id: 'repair_frigate', attackType: 'summon_burst', anchorLanes: [.42, -.42, 0],
    telegraphMs: 820, recoveryMs: 1750, burstCount: 2, shotGapMs: 260,
    aimedShotCount: 4, spreadRadians: .15, projectileSpeed: .30,
    maxSummons: 2, resummonHpRatio: .55,
  }),
  brood_alpha: PROFILE({
    id: 'brood_alpha', attackType: 'summon_burst', anchorLanes: [0, .46, -.46],
    telegraphMs: 760, recoveryMs: 1450, burstCount: 3, shotGapMs: 190,
    aimedShotCount: 5, spreadRadians: .22, projectileSpeed: .36,
    maxSummons: 2, resummonHpRatio: .45,
  }),
  inferno_charger: PROFILE({
    id: 'inferno_charger', attackType: 'charge_cycle', anchorLanes: [0, -.48, .48],
    telegraphMs: 700, recoveryMs: 650, chargeMs: 720, chargeSpeedMultiplier: 5.2,
    postChargeShotCount: 3, spreadRadians: .18, projectileSpeed: .40,
  }),
});

export function getCampaignMiniBossAiProfileV281(profileId) {
  return CAMPAIGN_MINI_BOSS_AI_PROFILES_V281[profileId] || null;
}

export function createCampaignMiniBossAiStateV281({ profileId, nowMs = 0 } = {}) {
  const profile = getCampaignMiniBossAiProfileV281(profileId);
  if (!profile) return null;
  return Object.freeze({
    version: CAMPAIGN_MINI_BOSS_AI_VERSION,
    profileId: profile.id,
    phase: 'reposition',
    phaseStartedAt: Number(nowMs) || 0,
    cycle: 0,
    targetLane: profile.anchorLanes[0] || 0,
    actionIndex: 0,
    nextActionAt: 0,
    summonCount: 0,
    queuedSummon: false,
    lockedDirection: Object.freeze({ x: 0, z: 1 }),
  });
}

const nextTargetLane = (profile, cycle) => profile.anchorLanes[cycle % profile.anchorLanes.length] || 0;

const telegraphFor = (profile, state, queuedSummon = false) => {
  if (profile.attackType === 'lane_barrage') {
    const patterns = profile.lanePatterns.length ? profile.lanePatterns : FIVE_LANE_PATTERNS;
    return Object.freeze({ kind: 'lane_zones', lanes: patterns[state.cycle % patterns.length] });
  }
  if (profile.attackType === 'charge_cycle') {
    return Object.freeze({ kind: 'charge_corridor', direction: state.lockedDirection });
  }
  if (profile.attackType === 'summon_burst') {
    return Object.freeze({ kind: queuedSummon ? 'summon_ring' : 'muzzle_charge' });
  }
  return Object.freeze({ kind: 'muzzle_charge' });
};

const shouldSummon = (profile, state, hpRatio, addsAlive) => {
  if (profile.maxSummons <= 0 || state.summonCount >= profile.maxSummons || addsAlive > 0) return false;
  return state.cycle === 0 || Number(hpRatio) <= profile.resummonHpRatio;
};

const transition = (state, patch) => Object.freeze({ ...state, ...patch });

export function stepCampaignMiniBossAiV281(state, input = {}) {
  if (!state) return Object.freeze({ state: null, movement: null, events: Object.freeze([]) });
  const profile = getCampaignMiniBossAiProfileV281(state.profileId);
  if (!profile) return Object.freeze({ state, movement: null, events: Object.freeze([]) });

  const nowMs = Math.max(0, Number(input.nowMs) || 0);
  const hpRatio = clamp(Number(input.hpRatio) || 0, 0, 1);
  const addsAlive = Math.max(0, Math.trunc(Number(input.addsAlive) || 0));
  const atAnchor = Boolean(input.atAnchor);
  const events = [];
  let next = state;

  if (next.phase === 'reposition') {
    const timedOut = nowMs - next.phaseStartedAt >= profile.repositionTimeoutMs;
    if (atAnchor || timedOut) {
      const direction = normalizeDirection(
        (Number(input.playerX) || 0) - (Number(input.enemyX) || 0),
        (Number(input.playerZ) || 0) - (Number(input.enemyZ) || 0),
      );
      const queuedSummon = profile.attackType === 'summon_burst'
        && shouldSummon(profile, next, hpRatio, addsAlive);
      next = transition(next, {
        phase: 'telegraph',
        phaseStartedAt: nowMs,
        lockedDirection: direction,
        queuedSummon,
        actionIndex: 0,
        nextActionAt: 0,
      });
      events.push(Object.freeze({
        type: 'telegraph_started',
        telegraph: telegraphFor(profile, next, queuedSummon),
      }));
    }
  }

  if (next.phase === 'telegraph' && nowMs - next.phaseStartedAt >= profile.telegraphMs) {
    events.push(Object.freeze({ type: 'telegraph_ended' }));
    next = transition(next, {
      phase: 'attack',
      phaseStartedAt: nowMs,
      actionIndex: 0,
      nextActionAt: nowMs,
    });
    if (profile.attackType === 'charge_cycle') {
      events.push(Object.freeze({ type: 'charge_started', direction: next.lockedDirection }));
    } else if (profile.attackType === 'summon_burst' && next.queuedSummon) {
      events.push(Object.freeze({ type: 'summon' }));
      next = transition(next, {
        summonCount: next.summonCount + 1,
        queuedSummon: false,
        nextActionAt: nowMs + 180,
      });
    }
  }

  if (next.phase === 'attack') {
    if (profile.attackType === 'charge_cycle') {
      if (nowMs - next.phaseStartedAt >= profile.chargeMs) {
        events.push(Object.freeze({
          type: 'fire_aimed_burst',
          shotCount: profile.postChargeShotCount,
          spreadRadians: profile.spreadRadians,
          projectileSpeed: profile.projectileSpeed,
        }));
        next = transition(next, { phase: 'recover', phaseStartedAt: nowMs });
      }
    } else {
      let actionIndex = next.actionIndex;
      let nextActionAt = next.nextActionAt;
      while (actionIndex < profile.burstCount && nowMs >= nextActionAt) {
        if (profile.attackType === 'lane_barrage') {
          const patterns = profile.lanePatterns.length ? profile.lanePatterns : FIVE_LANE_PATTERNS;
          events.push(Object.freeze({
            type: 'fire_lane_volley',
            lanes: patterns[next.cycle % patterns.length],
            projectileSpeed: profile.projectileSpeedSequence[actionIndex % Math.max(1, profile.projectileSpeedSequence.length)]
              || profile.projectileSpeed,
            volleyIndex: actionIndex,
          }));
        } else {
          events.push(Object.freeze({
            type: 'fire_aimed_burst',
            shotCount: profile.aimedShotCount,
            spreadRadians: profile.spreadRadians,
            projectileSpeed: profile.projectileSpeed,
            volleyIndex: actionIndex,
          }));
        }
        actionIndex += 1;
        nextActionAt += profile.shotGapMs;
      }
      next = transition(next, { actionIndex, nextActionAt });
      if (actionIndex >= profile.burstCount) {
        next = transition(next, { phase: 'recover', phaseStartedAt: nowMs });
      }
    }
  }

  if (next.phase === 'recover' && nowMs - next.phaseStartedAt >= profile.recoveryMs) {
    const cycle = next.cycle + 1;
    next = transition(next, {
      phase: 'reposition',
      phaseStartedAt: nowMs,
      cycle,
      targetLane: nextTargetLane(profile, cycle),
      actionIndex: 0,
      nextActionAt: 0,
      queuedSummon: false,
    });
  }

  const movement = (() => {
    if (next.phase === 'reposition') {
      return Object.freeze({
        mode: 'seek_anchor',
        targetLane: next.targetLane,
        anchorOffsetZ: profile.anchorOffsetZ,
        speedMultiplier: profile.movementSpeedMultiplier,
      });
    }
    if (next.phase === 'attack' && profile.attackType === 'charge_cycle') {
      return Object.freeze({
        mode: 'charge',
        direction: next.lockedDirection,
        speedMultiplier: profile.chargeSpeedMultiplier,
      });
    }
    return Object.freeze({ mode: 'hold', facePlayer: true });
  })();

  return Object.freeze({ state: next, movement, events: Object.freeze(events) });
}

export function forceCampaignMiniBossRecoveryV281(state, nowMs = 0) {
  if (!state) return null;
  const profile = getCampaignMiniBossAiProfileV281(state.profileId);
  if (!profile) return state;
  return transition(state, {
    phase: 'recover',
    phaseStartedAt: Math.max(0, Number(nowMs) || 0),
    actionIndex: 0,
    nextActionAt: 0,
  });
}
