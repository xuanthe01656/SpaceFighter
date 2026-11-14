/** Campaign V4.2.3: player-relative, role-specific first-fire and hold bands.
 * Stateless presentation-space geometry; no HP, damage, cadence, or rewards.
 * The topSafeRootZ is the live HUD/HP-safe limit from V3.7 choreography.
 */
export const CAMPAIGN_ADAPTIVE_ENGAGEMENT_VERSION_V423 = 'campaign-adaptive-engagement-v4.2.3';

const ROLE_FRACTIONS = Object.freeze({
  raider: Object.freeze({ fraction: .49, tolerance: .85 }),
  gunner: Object.freeze({ fraction: .58, tolerance: .95 }),
  shieldbearer: Object.freeze({ fraction: .53, tolerance: .90 }),
  support: Object.freeze({ fraction: .66, tolerance: 1.00 }),
  artillery: Object.freeze({ fraction: .76, tolerance: 1.10 }),
});
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value) => Number.isFinite(value);

/**
 * The player is always the positional anchor, never the bottom-screen edge.
 * Range is forward depth (player Z - enemy Z), not diagonal distance.
 * If the pilot flies upward, the target band compresses toward the visible
 * upper arena instead of bringing enemies down near the player's ship.
 */
export function resolveCampaignAdaptiveEngagementV423({roleId, playerZ, topSafeRootZ} = {}) {
  const role = ROLE_FRACTIONS[roleId];
  if (!role || !finite(playerZ) || !finite(topSafeRootZ)) return null;
  const visibleDepth = Math.max(4.8, playerZ - topSafeRootZ - .42);
  const preferredRange = clamp(visibleDepth * role.fraction, 3.65, visibleDepth - .55);
  const fireRangeMin = clamp(preferredRange - role.tolerance, 2.8, visibleDepth - .65);
  const fireRangeMax = clamp(preferredRange + role.tolerance, fireRangeMin + .45, visibleDepth + .1);
  return Object.freeze({
    version: CAMPAIGN_ADAPTIVE_ENGAGEMENT_VERSION_V423,
    roleId,
    rangeMetric: 'forward_depth',
    visibleDepth,
    preferredRange,
    fireRangeMin,
    fireRangeMax,
    minimumEnemyZ: topSafeRootZ,
    aimAnchorZ: playerZ - preferredRange,
  });
}

export function resolveCampaignAdaptiveEnemyArchetypeV423(archetype, input) {
  if (!archetype?.canShoot || archetype.canCrossPlayer || input?.enabled === false) return archetype;
  const band = resolveCampaignAdaptiveEngagementV423({
    roleId: archetype.id,
    playerZ: input?.playerZ,
    topSafeRootZ: input?.topSafeRootZ,
  });
  return band ? {...archetype, ...{
    preferredRange: band.preferredRange,
    fireRangeMin: band.fireRangeMin,
    fireRangeMax: band.fireRangeMax,
  }} : archetype;
}
