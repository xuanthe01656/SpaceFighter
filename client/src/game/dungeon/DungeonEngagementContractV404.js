/**
 * Dungeon real-combat Raider engagement V4.0.4.
 *
 * Campaign's opening `skirmish_entry` is a movement-only phase; on compact
 * Dungeon/mobile arenas Raiders can die before reaching the subsequent attack
 * pass. Dungeon permits ONE authentic approach volley, after a readable visual
 * wind-up, and only inside the catalog's fire band in front of the player.
 *
 * Shared Campaign FSM still owns pathing. V399 owns cadence, muzzle, real
 * projectiles and damage. This module is never activated by QA-only switches.
 * It never mutates Campaign state, enemy HP, rewards or persistence.
 */
export const DUNGEON_ENGAGEMENT_VERSION_V404 = 'dungeon-engagement-v4.0.4';
export const DUNGEON_RAIDER_WINDUP_MS_V404 = 420;
export const DUNGEON_RAIDER_VISIBLE_MARGIN_V404 = 0.55;
export const DUNGEON_RAIDER_APPROACH_MARGIN_V404 = 1.8;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const idle = (choreography, reason) => ({ choreography, enteredAtMs:null, reason });

/**
 * Pure resolver; no shots or timers. On exit/re-entry, wind-up resets to avoid
 * stale attack charges; one successful volley in this phase prevents duplicates
 * even if the normal weapon cooldown expires before this phase ends.
 */
export function resolveDungeonRaiderEntryFireV404({
  enabled = true, choreography = null, roleId = null,
  nowMs = NaN, enteredAtMs = null, lastVolleyPhaseId = null,
  enemyX = NaN, enemyZ = NaN, playerX = NaN, playerZ = NaN,
  hudOcclusionLineZ = NaN, fireRangeMin = NaN, fireRangeMax = NaN,
  canShoot = false, hasProjectile = false,
} = {}) {
  if (enabled !== true || !choreography || roleId !== 'raider' || choreography.phaseId !== 'skirmish_entry'
      || choreography.handled !== true || choreography.completed
      || !canShoot || !hasProjectile || lastVolleyPhaseId === 'skirmish_entry') {
    return idle(choreography, 'shared_fsm');
  }
  if (![nowMs, enemyX, enemyZ, playerX, playerZ, hudOcclusionLineZ,
    fireRangeMin, fireRangeMax].every(finite) || fireRangeMin < 2
      || fireRangeMax <= fireRangeMin) return idle(choreography, 'invalid_geometry');
  const depth = playerZ - enemyZ;
  const lateral = Math.abs(playerX - enemyX);
  // Fail closed: no shots from inside the HUD, behind or too near the player,
  // or from enemies off the authored approach/fire corridor.
  if (enemyZ < hudOcclusionLineZ + DUNGEON_RAIDER_VISIBLE_MARGIN_V404
      || depth < fireRangeMin
      || depth > fireRangeMax + DUNGEON_RAIDER_APPROACH_MARGIN_V404
      || lateral > Math.max(5.6, fireRangeMax * .90)) {
    return idle(choreography, 'entry_out_of_envelope');
  }
  // The approach corridor is for aiming, not shooting. V399 has a bounded
  // recovery envelope; never hand it a wind-up outside the authored fire band.
  const inAuthoredBand = depth <= fireRangeMax;
  const startedAt = inAuthoredBand
    ? (finite(enteredAtMs) && enteredAtMs <= nowMs ? enteredAtMs : nowMs)
    : null;
  const mayFire = inAuthoredBand
    && nowMs - startedAt >= DUNGEON_RAIDER_WINDUP_MS_V404;
  // The visible wind-up is armed ONLY in true catalog fire range. No off-band
  // bullets from V399 recovery, and no charged shot upon range re-entry.
  return {
    choreography: {
      ...choreography,
      mayFire,
      fireWindup: inAuthoredBand && !mayFire,
      facePlayer: true,
      dungeonApproachVolleyV404: true,
    },
    enteredAtMs: startedAt,
    reason: mayFire ? 'entry_fire_ready' : 'entry_windup',
  };
}

export function auditDungeonEngagementV404() {
  const entry = { handled:true, phaseId:'skirmish_entry', mayFire:false, fireWindup:false,
    completed:false,facePlayer:false };
  const sample = { choreography:entry,roleId:'raider',nowMs:1800,
    enemyX:0,enemyZ:4.8,playerX:1,playerZ:12,
    hudOcclusionLineZ:-7,fireRangeMin:4.6,fireRangeMax:7.4,
    canShoot:true,hasProjectile:true };
  const start=resolveDungeonRaiderEntryFireV404(sample);
  const ready=resolveDungeonRaiderEntryFireV404({...sample,nowMs:2300,
    enteredAtMs:start.enteredAtMs});
  if(start.choreography.mayFire || !start.choreography.fireWindup) return Object.freeze(['WINDUP_MISSING']);
  if(!ready.choreography.mayFire) return Object.freeze(['ENTRY_NEVER_FIRES']);
  if(resolveDungeonRaiderEntryFireV404({...sample,lastVolleyPhaseId:'skirmish_entry'})
      .choreography!==entry) return Object.freeze(['DUPLICATE_ENTRY_VOLLEY']);
  return Object.freeze([]);
}
