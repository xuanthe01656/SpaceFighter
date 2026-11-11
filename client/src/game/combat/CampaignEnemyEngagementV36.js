/**
 * Campaign enemy engagement geometry V3.6.
 *
 * Portrait shooter contract:
 * - authored engagement ranges are measured on the forward/depth axis;
 * - lateral separation affects where an enemy repositions, never whether it can
 *   detect a player that is still inside the arena;
 * - edge tracking always keeps the enemy's combat anchor inside the arena and
 *   biases the offset back toward the playable centre.
 */
export const CAMPAIGN_ENEMY_ENGAGEMENT_VERSION = 'campaign-enemy-engagement-v3.6.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => {
  if (value == null || value === '') return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
};

export const CAMPAIGN_ENEMY_ROLE_CONTRACTS_V36 = Object.freeze({
  raider: Object.freeze({
    combatClass: 'scout',
    movementContract: 'flank_breakaway_return',
    engagementRangeLabel: 'near_mid',
    attackContract: 'attack_pass_burst',
    lateralTrackingStrength: .72,
    edgeInset: .72,
  }),
  gunner: Object.freeze({
    combatClass: 'shooter',
    movementContract: 'hold_range_strafe',
    engagementRangeLabel: 'mid',
    attackContract: 'continuous_volley_in_range',
    lateralTrackingStrength: .90,
    edgeInset: .82,
  }),
  artillery: Object.freeze({
    combatClass: 'sniper',
    movementContract: 'acquire_backline_slot',
    engagementRangeLabel: 'far',
    attackContract: 'aim_telegraph_high_speed_shot',
    lateralTrackingStrength: .70,
    edgeInset: .95,
  }),
  charger: Object.freeze({
    combatClass: 'kamikaze',
    movementContract: 'lock_charge_return',
    engagementRangeLabel: 'contact',
    attackContract: 'contact_damage',
    lateralTrackingStrength: 1,
    edgeInset: .62,
  }),
  shieldbearer: Object.freeze({
    combatClass: 'heavy',
    movementContract: 'guard_lane_shift_anchor',
    engagementRangeLabel: 'mid',
    attackContract: 'multi_muzzle_or_spread',
    lateralTrackingStrength: .78,
    edgeInset: .92,
  }),
  support: Object.freeze({
    combatClass: 'support',
    movementContract: 'orbit_support_slot',
    engagementRangeLabel: 'mid_far',
    attackContract: 'ion_soft_homing_support',
    lateralTrackingStrength: .82,
    edgeInset: .90,
  }),
});

export function resolveCampaignEnemyRoleContractV36(roleId = 'gunner') {
  return CAMPAIGN_ENEMY_ROLE_CONTRACTS_V36[roleId]
    || CAMPAIGN_ENEMY_ROLE_CONTRACTS_V36.gunner;
}

/**
 * Resolve a combat anchor that follows the player's current lateral position.
 * Near an edge, authored offsets are flipped inward rather than clamped into an
 * unreachable off-screen point. This prevents enemies from remaining on the
 * opposite edge after the player changes lane.
 */
export function resolveCampaignEdgeAwareAnchorXV36({
  roleId = 'gunner',
  playerX = 0,
  baseLaneX = 0,
  desiredOffsetX = 0,
  arenaHalfWidth = 7,
  trackingStrength = null,
  edgeInset = null,
} = {}) {
  const contract = resolveCampaignEnemyRoleContractV36(roleId);
  const halfWidth = Math.max(2.8, finite(arenaHalfWidth, 7));
  const inset = clamp(finite(edgeInset, contract.edgeInset), .45, halfWidth * .38);
  const bound = Math.max(2.2, halfWidth - inset);
  const player = clamp(finite(playerX, 0), -bound, bound);
  const base = clamp(finite(baseLaneX, 0), -bound, bound);
  const strength = clamp(finite(trackingStrength, contract.lateralTrackingStrength), 0, 1);
  const edgeThreshold = bound * .70;
  const offsetMagnitude = Math.min(Math.abs(finite(desiredOffsetX, 0)), bound * .46);
  let signedOffset = finite(desiredOffsetX, 0);

  if (player <= -edgeThreshold) signedOffset = Math.abs(offsetMagnitude);
  else if (player >= edgeThreshold) signedOffset = -Math.abs(offsetMagnitude);

  const trackedBase = base + (player - base) * strength;
  const target = clamp(trackedBase + signedOffset, -bound, bound);
  return Object.freeze({
    x: target,
    playerX: player,
    baseLaneX: base,
    signedOffsetX: signedOffset,
    bound,
    edgeSide: player <= -edgeThreshold ? 'left' : player >= edgeThreshold ? 'right' : 'centre',
  });
}

/**
 * Fire-range gate for a vertical shooter.
 *
 * The catalog's range means distance ahead of the player on the gameplay Z
 * axis. It must not become a diagonal Euclidean gate: a player at the opposite
 * horizontal edge is still visible and targetable. Lateral distance is exposed
 * for steering/telemetry only.
 */
export function resolveCampaignFireEnvelopeV36({
  canShoot = true,
  enemyX = 0,
  enemyZ = 0,
  playerX = 0,
  playerZ = 0,
  fireRangeMin = 4,
  fireRangeMax = 9,
  rangeTolerance = .28,
} = {}) {
  const ex = finite(enemyX, 0);
  const ez = finite(enemyZ, 0);
  const px = finite(playerX, 0);
  const pz = finite(playerZ, 0);
  const minimum = Math.max(0, finite(fireRangeMin, 4));
  const maximum = Math.max(minimum + .5, finite(fireRangeMax, 9));
  const tolerance = clamp(finite(rangeTolerance, .28), 0, .75);
  const forwardDepth = pz - ez;
  const lateralDistance = Math.abs(px - ex);
  const directDistance = Math.hypot(px - ex, pz - ez);
  const targetAhead = forwardDepth > .05;
  const tooClose = !targetAhead || forwardDepth < minimum - tolerance;
  const tooFar = forwardDepth > maximum + tolerance;
  const rangeReady = Boolean(canShoot) && targetAhead && !tooClose && !tooFar;

  return Object.freeze({
    rangeMetric: 'forward_depth',
    rangeReady,
    targetAhead,
    tooClose,
    tooFar,
    forwardDepth,
    lateralDistance,
    directDistance,
    fireRangeMin: minimum,
    fireRangeMax: maximum,
  });
}

export function auditCampaignEnemyEngagementV36() {
  const issues = [];
  const required = ['raider', 'gunner', 'artillery', 'charger', 'shieldbearer', 'support'];
  for (const roleId of required) {
    const contract = CAMPAIGN_ENEMY_ROLE_CONTRACTS_V36[roleId];
    if (!contract) issues.push(`MISSING_ROLE_CONTRACT:${roleId}`);
    else {
      if (!contract.combatClass) issues.push(`MISSING_COMBAT_CLASS:${roleId}`);
      if (!contract.movementContract) issues.push(`MISSING_MOVEMENT_CONTRACT:${roleId}`);
      if (!contract.attackContract) issues.push(`MISSING_ATTACK_CONTRACT:${roleId}`);
      if (!(contract.lateralTrackingStrength >= 0 && contract.lateralTrackingStrength <= 1)) {
        issues.push(`INVALID_TRACKING_STRENGTH:${roleId}`);
      }
    }
  }

  for (const playerX of [-6.2, 6.2]) {
    const envelope = resolveCampaignFireEnvelopeV36({
      enemyX: -playerX,
      enemyZ: -1,
      playerX,
      playerZ: 6.8,
      fireRangeMin: 6.3,
      fireRangeMax: 9.6,
    });
    if (!envelope.rangeReady) issues.push(`EDGE_FIRE_GATE:${playerX}`);
  }
  return Object.freeze(issues);
}
