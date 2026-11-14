/**
 * V4.0.5 production Raider opening contract for actual Dungeon gameplay.
 *
 * The entry phase has a bounded travel clock; V4.0.4 armed only after reaching
 * the *narrow* fire band, which left many Raiders with no time to complete the
 * wind-up. Arm inside a visible forward APPROACH corridor and preserve that
 * clock through the first attack passes. Fire only inside the authored band.
 *
 * This pure module creates no projectiles and changes no Campaign FSM state;
 * DungeonScene delegates every real volley to the V399 cooldown/muzzle path.
 */
export const DUNGEON_RAIDER_OPENING_VERSION_V405 = 'dungeon-raider-opening-v4.0.5';
export const DUNGEON_RAIDER_OPENING_WINDUP_MS_V405 = 420;
export const DUNGEON_RAIDER_APPROACH_EXTRA_DEPTH_V405 = 8;
const PHASES = new Set(['skirmish_entry', 'attack_pass_a', 'attack_pass_b', 'attack_pass_c']);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const unchanged = (choreography, reason, armedSinceMs = null) => ({
  choreography, reason, armedSinceMs,
});

export function resolveDungeonRaiderOpeningV405({
  choreography = null, nowMs = NaN, armedSinceMs = null, alreadyFired = false,
  enemyX = NaN, enemyZ = NaN, playerX = NaN, playerZ = NaN,
  hudOcclusionLineZ = NaN, fireRangeMin = NaN, fireRangeMax = NaN,
  canShoot = false, hasProjectile = false,
} = {}) {
  if (!choreography || choreography.handled !== true || choreography.completed
      || !PHASES.has(choreography.phaseId)) {
    return unchanged(choreography, 'not_opening_phase');
  }
  if (alreadyFired) return unchanged(choreography, 'opening_consumed');
  if (!canShoot || !hasProjectile) return unchanged(choreography, 'weapon_unavailable');
  if (![nowMs, enemyX, enemyZ, playerX, playerZ, hudOcclusionLineZ,
    fireRangeMin, fireRangeMax].every(finite)
      || fireRangeMin <= 0 || fireRangeMax <= fireRangeMin) {
    return unchanged(choreography, 'invalid_geometry');
  }
  if (choreography.mayFire === true) {
    // Shared FSM or V4.0.4 is already firing: no overriding/double volley.
    return unchanged(choreography, 'shared_ready', armedSinceMs);
  }
  const depth = playerZ - enemyZ;
  const lateral = Math.abs(playerX - enemyX);
  const sidewaysLimit = Math.max(5.6, fireRangeMax * .90);
  if (enemyZ < hudOcclusionLineZ + .55 || depth <= 0
      || depth < fireRangeMin || depth > fireRangeMax + DUNGEON_RAIDER_APPROACH_EXTRA_DEPTH_V405
      || lateral > sidewaysLimit) {
    return unchanged(choreography, 'outside_visible_approach');
  }
  // Begin aiming while approaching. No fireWindup outside the REAL authored
  // band, because V399 recovery otherwise allows early/off-band bullets.
  const armedAt = finite(armedSinceMs) && armedSinceMs <= nowMs ? armedSinceMs : nowMs;
  const inAuthoredBand = depth <= fireRangeMax;
  if (!inAuthoredBand) {
    return unchanged(choreography, 'approaching_fire_band', armedAt);
  }
  const ready = nowMs - armedAt >= DUNGEON_RAIDER_OPENING_WINDUP_MS_V405;
  return {
    armedSinceMs: armedAt,
    reason: ready ? 'opening_ready' : 'in_band_windup',
    choreography: {
      ...choreography,
      // One supplemental first-attack opportunity. Actual cooldown and bullet
      // creation remain strictly authoritative in tryFireDungeonEnemyVolleyV38.
      mayFire: ready,
      fireWindup: !ready,
      facePlayer: true,
      dungeonRaiderOpeningV405: true,
    },
  };
}

export function auditDungeonRaiderOpeningV405() {
  const c = { handled:true, completed:false, phaseId:'skirmish_entry', mayFire:false };
  const p = {choreography:c, nowMs:1000, enemyX:0, enemyZ:-.5,
    playerX:0,playerZ:12.5,hudOcclusionLineZ:-10,
    fireRangeMin:4.6,fireRangeMax:7.4,canShoot:true,hasProjectile:true};
  const start = resolveDungeonRaiderOpeningV405(p);
  const finish = resolveDungeonRaiderOpeningV405({ ...p,
    choreography:{...c,phaseId:'attack_pass_a'}, enemyZ:6,
    nowMs:1600, armedSinceMs:start.armedSinceMs });
  const errors=[];
  if (start.reason !== 'approaching_fire_band') errors.push('APPROACH_NOT_ARMED');
  if (!finish.choreography.mayFire || finish.reason !== 'opening_ready') errors.push('FIRST_FIRE_UNREACHABLE');
  if (resolveDungeonRaiderOpeningV405({...p,enemyZ:6,alreadyFired:true})
      .choreography !== c) errors.push('REPEATED_OPENING');
  return Object.freeze(errors);
}
