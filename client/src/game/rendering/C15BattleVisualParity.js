/**
 * SpaceFighter C15 Alpha-1 presentation ONLY. C15 remains signed, 30 Hz and
 * server-authoritative; these values never affect position, AI, damage or RNG.
 * The current QA encounter pins ship_xwing + gun_rail level 1.
 * Do not reuse this stage-1 presentation mapping for other loadouts without a
 * versioned, validated visual descriptor from the trusted battle contract.
 */
export function c15Alpha1ProjectileAppearance(hostile = false) {
  // Guest enemy bullets are red orbs, and the pinned Guest railgun is white.
  return hostile
    ? Object.freeze({projectileType: 'plasma', color: 0xff4757, visualScale: 0.65})
    : Object.freeze({projectileType: 'rail', color: 0xffffff, visualScale: 1.8});
}

/** The authoritative view contains velocity per C15 tick, in world units.
 * Rotate only the image so aimed hostile shots visually point in their real
 * travel direction; never extrapolate or change their server-authored path. */
export function c15ProjectileVisualYaw(value, hostile = false) {
  const vx = Number(hostile ? value?.vxUnits : value?.velocityXUnitsPerTick);
  const vz = Number(hostile ? value?.vzUnits : value?.velocityZUnitsPerTick);
  if (!Number.isFinite(vx) || !Number.isFinite(vz) || (vx === 0 && vz === 0))
    return hostile ? Math.PI : 0;
  return Math.atan2(-vx, -vz);
}

/** Return new attack cues from projectiles, bounded to current visible shots.
 * Never synthesize projectiles, AI decisions or hits on the client. */
export function c15NewHostileVolleySources(previousIds, current = []) {
  const previous = previousIds instanceof Set ? previousIds : new Set();
  const nextIds = new Set();
  const sources = new Set();
  for (const projectile of current) {
    if (!projectile || projectile.id == null) continue;
    const id = String(projectile.id);
    nextIds.add(id);
    if (!previous.has(id) && projectile.sourceId != null)
      sources.add(String(projectile.sourceId));
  }
  return Object.freeze({ids: nextIds, sources: [...sources]});
}
