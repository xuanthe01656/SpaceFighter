/**
 * Dungeon Combat UX Parity V4.1.0 — role engagement projection.
 *
 * Campaign owns enemy identities, weapons, cooldowns and deterministic FSMs.
 * Dungeon owns only a projection from the visible mobile combat depth to a
 * role-specific preferred position and firing envelope. This keeps Artillery
 * and Support at long range, Gunner in the middle band, Shieldbearer in front,
 * Raider on readable attack passes, and Charger as a contact-only threat.
 *
 * No HP, damage, reward, progression, persistence or server authority lives in
 * this module. Values are normalized against the post-HUD visible playfield so
 * phones, tablets and notched devices preserve the same combat composition.
 */
export const DUNGEON_COMBAT_UX_VERSION_V410 = 'dungeon-combat-ux-parity-v4.1.0';
export const DUNGEON_ROLE_ENGAGEMENT_VERSION_V410 = 'dungeon-role-engagement-v4.1.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const freeze = value => Object.freeze(value);

/**
 * Ratios are measured from the player toward the HUD-safe upper boundary.
 * 0 = player depth; 1 = top of the visible combat region.
 */
export const DUNGEON_ROLE_ENGAGEMENT_PROFILES_V410 = Object.freeze({
  raider: freeze({
    canShoot: true,
    minRatio: .30,
    preferredRatio: .54,
    maxRatio: .72,
    lateralRatio: .46,
    openingWindupMs: 380,
    label: 'attack_pass',
  }),
  gunner: freeze({
    canShoot: true,
    minRatio: .43,
    preferredRatio: .65,
    maxRatio: .84,
    lateralRatio: .42,
    openingWindupMs: 620,
    label: 'mid_range',
  }),
  shieldbearer: freeze({
    canShoot: true,
    minRatio: .36,
    preferredRatio: .54,
    maxRatio: .74,
    lateralRatio: .38,
    openingWindupMs: 760,
    label: 'front_guard',
  }),
  support: freeze({
    canShoot: true,
    minRatio: .54,
    preferredRatio: .72,
    maxRatio: .90,
    lateralRatio: .45,
    openingWindupMs: 700,
    label: 'rear_support',
  }),
  artillery: freeze({
    canShoot: true,
    minRatio: .66,
    preferredRatio: .82,
    maxRatio: .96,
    lateralRatio: .50,
    openingWindupMs: 900,
    label: 'long_range',
  }),
  charger: freeze({
    canShoot: false,
    minRatio: 0,
    preferredRatio: 0,
    maxRatio: 0,
    lateralRatio: 0,
    openingWindupMs: 0,
    label: 'contact_only',
  }),
});

const resolveProfile = roleId => DUNGEON_ROLE_ENGAGEMENT_PROFILES_V410[roleId]
  || DUNGEON_ROLE_ENGAGEMENT_PROFILES_V410.gunner;

/**
 * Convert normalized role intent into world-space distances from the player.
 * The top boundary already includes HUD occlusion, so no role can shoot from
 * under the fixed HUD or from outside the visible battlefield.
 */
export function resolveDungeonRoleEngagementV410({
  roleId = 'gunner',
  playerZ = 12.5,
  hudOcclusionLineZ = -10,
  worldHalfHeight = 15,
  authoredPreferredRange = 7.5,
  authoredFireRangeMin = 4,
  authoredFireRangeMax = 9,
  visibleMargin = .72,
} = {}) {
  const profile = resolveProfile(roleId);
  const player = clamp(finite(playerZ, 12.5), -worldHalfHeight + 2, worldHalfHeight);
  const half = Math.max(8, finite(worldHalfHeight, 15));
  const topSafeZ = clamp(
    finite(hudOcclusionLineZ, -half + 4) + Math.max(.3, finite(visibleMargin, .72)),
    -half + .25,
    player - 4,
  );
  const combatDepth = Math.max(6, player - topSafeZ);

  if (!profile.canShoot) {
    return freeze({
      version: DUNGEON_ROLE_ENGAGEMENT_VERSION_V410,
      roleId,
      canShoot: false,
      contactOnly: true,
      topSafeZ,
      combatDepth,
      fireRangeMin: 0,
      preferredRange: 0,
      fireRangeMax: 0,
      maxCombatZ: player,
      lateralLimit: 0,
      depthOffsetDelta: 0,
      openingWindupMs: 0,
      label: profile.label,
    });
  }

  const authoredMin = Math.max(2, finite(authoredFireRangeMin, 4));
  const authoredPreferred = Math.max(authoredMin + .4, finite(authoredPreferredRange, 7.5));
  const authoredMax = Math.max(authoredPreferred + .4, finite(authoredFireRangeMax, 9));

  // Normalized depth is authoritative for Dungeon feel. Catalog values remain
  // minimum safety floors, not a second source of role identity.
  const fireRangeMin = clamp(
    Math.max(authoredMin, combatDepth * profile.minRatio),
    2.5,
    combatDepth - 2,
  );
  const preferredRange = clamp(
    Math.max(fireRangeMin + .6, combatDepth * profile.preferredRatio),
    fireRangeMin + .6,
    combatDepth - 1,
  );
  const fireRangeMax = clamp(
    Math.max(authoredMax, preferredRange + .8, combatDepth * profile.maxRatio),
    preferredRange + .8,
    combatDepth - .22,
  );
  const lateralLimit = clamp(
    Math.max(4.2, combatDepth * profile.lateralRatio),
    4.2,
    9.4,
  );

  return freeze({
    version: DUNGEON_ROLE_ENGAGEMENT_VERSION_V410,
    roleId,
    canShoot: true,
    contactOnly: false,
    topSafeZ,
    combatDepth,
    fireRangeMin,
    preferredRange,
    fireRangeMax,
    maxCombatZ: player - fireRangeMin,
    lateralLimit,
    // Campaign choreography targets playerZ - authoredPreferredRange + depthOffset.
    // Add this negative delta to move the same stable combat slot farther up-screen.
    depthOffsetDelta: authoredPreferred - preferredRange,
    openingWindupMs: profile.openingWindupMs,
    label: profile.label,
  });
}

/** Preserve the stable Campaign slot lease while projecting its depth to Dungeon. */
export function projectDungeonCombatSlotV410({ slot = null, engagement = null } = {}) {
  if (!slot || !engagement || engagement.canShoot !== true) return slot;
  return freeze({
    ...slot,
    depthOffset: finite(slot.depthOffset, 0) + finite(engagement.depthOffsetDelta, 0),
    preferredRange: engagement.preferredRange,
    dungeonRoleEngagementVersion: DUNGEON_ROLE_ENGAGEMENT_VERSION_V410,
  });
}

/**
 * Project the resolved envelope onto the shared choreography result. Movement
 * remains Campaign-authored; Dungeon only replaces the geometry used by the
 * fire gate and the lower-depth clamp.
 */
export function applyDungeonRoleEngagementV410({ choreography = null, engagement = null } = {}) {
  if (!choreography || !engagement || engagement.canShoot !== true) return choreography;
  return freeze({
    ...choreography,
    preferredRange: engagement.preferredRange,
    fireRangeMin: engagement.fireRangeMin,
    fireRangeMax: engagement.fireRangeMax,
    lateralLimit: engagement.lateralLimit,
    maxCombatZ: engagement.maxCombatZ,
    dungeonRoleEngagementVersion: DUNGEON_ROLE_ENGAGEMENT_VERSION_V410,
  });
}

export function auditDungeonRoleEngagementV410() {
  const issues = [];
  const order = ['shieldbearer', 'raider', 'gunner', 'support', 'artillery'];
  const rows = Object.fromEntries(order.map(roleId => [roleId, resolveDungeonRoleEngagementV410({
    roleId,
    playerZ: 12.5,
    hudOcclusionLineZ: -10.5,
    worldHalfHeight: 15,
    authoredPreferredRange: roleId === 'artillery' ? 11.1 : 7.5,
    authoredFireRangeMin: roleId === 'artillery' ? 9.2 : 4.6,
    authoredFireRangeMax: roleId === 'artillery' ? 13.4 : 9.6,
  })]));
  for (const [roleId, row] of Object.entries(rows)) {
    if (!(row.fireRangeMin > 0 && row.fireRangeMin < row.preferredRange
      && row.preferredRange < row.fireRangeMax && row.fireRangeMax <= row.combatDepth)) {
      issues.push(`INVALID_RANGE:${roleId}`);
    }
    if (!(row.maxCombatZ < 10.5)) issues.push(`TOO_CLOSE:${roleId}`);
  }
  if (!(rows.artillery.preferredRange > rows.support.preferredRange
    && rows.support.preferredRange > rows.gunner.preferredRange
    && rows.gunner.preferredRange > rows.shieldbearer.preferredRange)) {
    issues.push('ROLE_DEPTH_ORDER');
  }
  const charger = resolveDungeonRoleEngagementV410({ roleId: 'charger' });
  if (charger.canShoot || !charger.contactOnly || charger.fireRangeMax !== 0) {
    issues.push('CHARGER_PROJECTILE_RANGE');
  }
  return Object.freeze(issues);
}
