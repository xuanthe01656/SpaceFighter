/**
 * Dungeon QA Readiness V4.0.1 — volatile evidence only.
 * Data never leaves this run, is never sent to a server and never writes to
 * campaignData, localStorage, Firebase, economy, or authoritative battle state.
 * QA warnings are review signals, NOT production certification.
 */
export const DUNGEON_QA_READINESS_VERSION_V400 = 'dungeon-qa-readiness-v4.0.1';
export const DUNGEON_QA_READINESS_POLICY_V400 = Object.freeze({
  maxRooms: 15,
  minSampleSpacingMs: 250,
  uiUpdateSpacingMs: 1200,
  lowFpsThreshold: 30,
  fpsReviewThreshold: 35,
  lowFpsReviewPercent: 20,
  silenceReviewMinRangedSpawns: 2,
  silenceReviewMinRoomMs: 8000,
  durationReviewMs: 180000,
  enemyProbeSpacingMs: 300,
  quickEnemyThresholdMs: 1600,
  longLivedUnfiredMs: 3000,
  bossAttackEvidenceMinMs: 5000,
  maxTrackedEnemies: 64,
});

const ROLES = new Set(['raider', 'gunner', 'shieldbearer', 'support', 'artillery', 'charger', 'boss']);
const RANGED_ROLES = new Set(['raider', 'gunner', 'shieldbearer', 'support', 'artillery']);
const SOURCES = new Set(['projectile', 'environment', 'contact', 'unknown']);
const FIRE_PROBE_REASONS = new Set([
  'no_fire_window', 'out_of_envelope', 'windup', 'cooldown', 'no_weapon',
  'invalid_cadence', 'invalid_volley', 'projectile_failed', 'projectile_created',
  'ready', 'other',
]);
const roleCounts = () => Object.fromEntries([...ROLES, 'unknown'].map(role => [role, 0]));
const fireReasonCounts = () => Object.fromEntries([...FIRE_PROBE_REASONS].map(reason => [reason, 0]));
const safeNum = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const positive = (n, fallback = 0) => Math.max(0, safeNum(n, fallback));
const whole = (n, fallback = 0) => Math.floor(positive(n, fallback));
const cleanRole = value => ROLES.has(value) ? value : 'unknown';
const cleanSource = value => SOURCES.has(value) ? value : 'unknown';
const round = (value, digits = 1) => Number(safeNum(value).toFixed(digits));
const shortId = value => String(value || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || 'unknown';
const emptyCounts = () => ({ spawns: 0, rangedSpawns: 0, volleys: 0, projectiles: 0,
  telegraphs: 0, destroyedHazards: 0, objectiveNodesDestroyed: 0, damageTaken: 0, dodged: 0, absorbed: 0,
  damageBySource: { projectile: 0, contact: 0, environment: 0, unknown: 0 },
  shotsByRole: roleCounts(), spawnsByRole: roleCounts(), fireProbeByReason: fireReasonCounts(),
  fireProbeByRole: Object.fromEntries([...ROLES, 'unknown'].map(role => [role, fireReasonCounts()])),
  fireProbeSamples: 0, enemiesResolved: 0, rangedResolved: 0, rangedFired: 0,
  rangedShortLivedWithoutShots: 0, rangedLongLivedWithoutShots: 0,
  rangedLifetimeMsSum: 0, bossEncountered: false, bossDefeated: false,
  bossLifetimeMs: null,
  peakEnemies: 0, peakHostileProjectiles: 0, sampleCount: 0, lowFpsSamples: 0,
  frameMsSum: 0, hpStart: null, hpEnd: null });
const publicCounts = counts => ({
  spawns: counts.spawns, rangedSpawns: counts.rangedSpawns,
  volleys: counts.volleys, projectiles: counts.projectiles, telegraphs: counts.telegraphs,
  destroyedHazards: counts.destroyedHazards, objectiveNodesDestroyed: counts.objectiveNodesDestroyed,
  damageTaken: round(counts.damageTaken), damageBySource: { ...counts.damageBySource },
  dodged: counts.dodged, absorbed: counts.absorbed,
  shotsByRole: { ...counts.shotsByRole }, spawnsByRole: { ...counts.spawnsByRole },
  fireProbeSamples: counts.fireProbeSamples, fireProbeByReason: { ...counts.fireProbeByReason },
  fireProbeByRole: Object.fromEntries(Object.entries(counts.fireProbeByRole)
    .map(([role, reasons]) => [role, { ...reasons }])),
  enemiesResolved: counts.enemiesResolved, rangedResolved: counts.rangedResolved,
  rangedFired: counts.rangedFired,
  rangedShortLivedWithoutShots: counts.rangedShortLivedWithoutShots,
  rangedLongLivedWithoutShots: counts.rangedLongLivedWithoutShots,
  averageRangedLifetimeMs: counts.rangedResolved
    ? Math.round(counts.rangedLifetimeMsSum / counts.rangedResolved) : null,
  bossEncountered: counts.bossEncountered, bossDefeated: counts.bossDefeated,
  bossLifetimeMs: counts.bossLifetimeMs,
  peakEnemies: counts.peakEnemies, peakHostileProjectiles: counts.peakHostileProjectiles,
  averageFps: counts.sampleCount ? round(1000 * counts.sampleCount / counts.frameMsSum) : null,
  lowFpsPercent: counts.sampleCount ? round(100 * counts.lowFpsSamples / counts.sampleCount) : null,
  sampleCount: counts.sampleCount, hpStart: counts.hpStart, hpEnd: counts.hpEnd,
});
const status = (record, nowMs, finished) => {
  const activeMs = Math.max(0, (record.endedAtMs ?? nowMs) - record.startedAtMs);
  const counts = record.counts;
  const notes = [];
  if (counts.rangedSpawns >= DUNGEON_QA_READINESS_POLICY_V400.silenceReviewMinRangedSpawns
      && counts.projectiles === 0
      && activeMs >= DUNGEON_QA_READINESS_POLICY_V400.silenceReviewMinRoomMs) {
    notes.push('RANGED_SPAWNED_NO_PROJECTILE');
  }
  if (counts.sampleCount >= 10 && (1000 * counts.sampleCount / counts.frameMsSum)
      < DUNGEON_QA_READINESS_POLICY_V400.fpsReviewThreshold) notes.push('AVERAGE_FPS_REVIEW');
  if (counts.sampleCount >= 10 && counts.lowFpsSamples * 100 / counts.sampleCount
      > DUNGEON_QA_READINESS_POLICY_V400.lowFpsReviewPercent) notes.push('LOW_FPS_SPIKES_REVIEW');
  if (activeMs > DUNGEON_QA_READINESS_POLICY_V400.durationReviewMs) notes.push('ROOM_DURATION_REVIEW');
  if (finished && record.endedAtMs === null) notes.push('ROOM_NOT_CLEARED');
  if (counts.rangedLongLivedWithoutShots > 0) notes.push('LONG_LIVED_RANGED_NO_SHOT_REVIEW');
  if (finished && counts.bossEncountered && counts.bossLifetimeMs !== null
      && counts.bossLifetimeMs < DUNGEON_QA_READINESS_POLICY_V400.bossAttackEvidenceMinMs
      && counts.telegraphs === 0 && counts.shotsByRole.boss === 0) {
    notes.push('BOSS_ATTACK_WINDOW_UNTESTED');
  }
  if (finished && counts.bossEncountered
      && counts.bossLifetimeMs >= DUNGEON_QA_READINESS_POLICY_V400.bossAttackEvidenceMinMs
      && counts.telegraphs === 0) notes.push('BOSS_TELEGRAPH_UNOBSERVED_REVIEW');
  return notes;
};

/** One bounded aggregate per active room. No per-frame arrays or user identifiers. */
export function createDungeonQaReadinessV400({
  enabled = false, dungeonId = 'dung_taurus', presetId = 'account',
  runMode = 'full_run', expectedRooms = 5, startedAtMs = 0,
} = {}) {
  const active = enabled === true;
  const originMs = positive(startedAtMs);
  const total = emptyCounts();
  const rooms = [];
  let current = null;
  let finished = false;
  let outcome = null;
  let endAtMs = null;
  let lastSampleAtMs = -Infinity;
  // Transient per-room identifiers are used only to correlate lifecycle events.
  // Never include them in a public snapshot or persistent profile.
  const liveEnemies = new Map();
  let bossStartedAtMs = null;
  const flushLiveEnemies = at => {
    for (const id of [...liveEnemies.keys()]) {
      recordEnemyResolved({ enemyId: id, nowMs: at, reason: 'room_end' });
    }
    liveEnemies.clear();
  };

  const buckets = () => current ? [total, current.counts] : [total];
  const beginRoom = ({ roomId, roomIndex, kind = 'entry', nowMs = 0, hp = null } = {}) => {
    if (!active || finished || rooms.length >= DUNGEON_QA_READINESS_POLICY_V400.maxRooms) return false;
    if (current && current.endedAtMs === null) endRoom({ nowMs, hp });
    liveEnemies.clear();
    bossStartedAtMs = null;
    const at = positive(nowMs);
    const room = { roomId: shortId(roomId), roomIndex: whole(roomIndex), kind: shortId(kind),
      startedAtMs: at, endedAtMs: null, counts: emptyCounts() };
    if (Number.isFinite(hp)) {
      room.counts.hpStart = round(positive(hp));
      if (total.hpStart === null) total.hpStart = round(positive(hp));
      total.hpEnd = round(positive(hp));
    }
    rooms.push(room);
    current = room;
    return true;
  };
  const recordSpawn = (roleId, { enemyId = null, nowMs = null } = {}) => {
    if (!active || finished || !current) return;
    const role = cleanRole(roleId);
    for (const b of buckets()) {
      b.spawns += 1;
      b.spawnsByRole[role] += 1;
      if (RANGED_ROLES.has(role)) b.rangedSpawns += 1;
    }
    if (RANGED_ROLES.has(role) && enemyId != null && Number.isFinite(nowMs)
        && liveEnemies.size < DUNGEON_QA_READINESS_POLICY_V400.maxTrackedEnemies) {
      liveEnemies.set(String(enemyId), {
        roleId: role, startedAtMs: positive(nowMs), projectileCount: 0,
        lastProbeAtMs: -Infinity,
      });
    }
  };
  const recordEnemyResolved = ({ enemyId, nowMs = null, reason = 'killed' } = {}) => {
    if (!active || finished || !current || enemyId == null) return false;
    const id = String(enemyId);
    const enemy = liveEnemies.get(id);
    if (!enemy) return false;
    liveEnemies.delete(id);
    if (!Number.isFinite(nowMs)) return false;
    const lifeMs = Math.max(0, positive(nowMs) - enemy.startedAtMs);
    for (const b of buckets()) {
      b.enemiesResolved += 1;
      b.rangedResolved += 1;
      b.rangedLifetimeMsSum += lifeMs;
      if (enemy.projectileCount > 0) b.rangedFired += 1;
      else if (lifeMs < DUNGEON_QA_READINESS_POLICY_V400.quickEnemyThresholdMs) {
        b.rangedShortLivedWithoutShots += 1;
      } else if (lifeMs >= DUNGEON_QA_READINESS_POLICY_V400.longLivedUnfiredMs) {
        b.rangedLongLivedWithoutShots += 1;
      }
    }
    return true;
  };
  const recordFireProbe = ({ enemyId, nowMs = null, reason = 'other' } = {}) => {
    if (!active || finished || !current || enemyId == null || !Number.isFinite(nowMs)) return false;
    const enemy = liveEnemies.get(String(enemyId));
    if (!enemy) return false;
    const at = positive(nowMs);
    if (at - enemy.lastProbeAtMs < DUNGEON_QA_READINESS_POLICY_V400.enemyProbeSpacingMs) return false;
    enemy.lastProbeAtMs = at;
    const key = FIRE_PROBE_REASONS.has(reason) ? reason : 'other';
    for (const b of buckets()) {
      b.fireProbeSamples += 1;
      b.fireProbeByReason[key] += 1;
      b.fireProbeByRole[enemy.roleId][key] += 1;
    }
    return true;
  };
  const recordBossSpawn = ({ nowMs = null } = {}) => {
    if (!active || finished || !current || !Number.isFinite(nowMs)) return false;
    bossStartedAtMs = positive(nowMs);
    for (const b of buckets()) { b.bossEncountered = true; b.bossDefeated = false; }
    return true;
  };
  const recordBossDefeated = ({ nowMs = null } = {}) => {
    if (!active || finished || !current || bossStartedAtMs === null || !Number.isFinite(nowMs)) return false;
    const aliveMs = Math.max(0, positive(nowMs) - bossStartedAtMs);
    for (const b of buckets()) { b.bossLifetimeMs = aliveMs; b.bossDefeated = true; }
    bossStartedAtMs = null;
    return true;
  };
  const recordVolley = roleId => {
    if (!active || finished || !current) return;
    for (const b of buckets()) b.volleys += 1;
  };
  const recordProjectile = (roleId, { enemyId = null } = {}) => {
    if (!active || finished || !current) return;
    const role = cleanRole(roleId);
    if (enemyId != null && liveEnemies.has(String(enemyId))) liveEnemies.get(String(enemyId)).projectileCount += 1;
    for (const b of buckets()) {
      b.projectiles += 1;
      b.shotsByRole[role] += 1;
    }
  };
  const recordTelegraph = () => {
    if (!active || finished || !current) return;
    for (const b of buckets()) b.telegraphs += 1;
  };
  const recordObjectiveNodeDestroyed = () => {
    if (!active || finished || !current) return;
    for (const b of buckets()) b.objectiveNodesDestroyed += 1;
  };
  const recordHazardDestroyed = () => {
    if (!active || finished || !current) return;
    for (const b of buckets()) b.destroyedHazards += 1;
  };
  const recordDamage = ({ source = 'unknown', hpBefore = 0, hpAfter = 0,
    dodged = false, absorbed = false } = {}) => {
    if (!active || finished || !current) return;
    const loss = Math.max(0, positive(hpBefore) - positive(hpAfter));
    const key = cleanSource(source);
    for (const b of buckets()) {
      b.damageTaken += loss;
      b.damageBySource[key] += loss;
      if (dodged) b.dodged += 1;
      if (absorbed) b.absorbed += 1;
    }
  };
  const sample = ({ nowMs = 0, frameMs = 0, enemyCount = 0, projectileCount = 0 } = {}) => {
    if (!active || finished || !current || !Number.isFinite(nowMs) || !Number.isFinite(frameMs)
        || frameMs <= 0 || frameMs > 1000
        || nowMs - lastSampleAtMs < DUNGEON_QA_READINESS_POLICY_V400.minSampleSpacingMs) return false;
    lastSampleAtMs = nowMs;
    for (const b of buckets()) {
      b.sampleCount += 1;
      b.frameMsSum += frameMs;
      if (frameMs > (1000 / DUNGEON_QA_READINESS_POLICY_V400.lowFpsThreshold)) b.lowFpsSamples += 1;
      b.peakEnemies = Math.max(b.peakEnemies, whole(enemyCount));
      b.peakHostileProjectiles = Math.max(b.peakHostileProjectiles, whole(projectileCount));
    }
    return true;
  };
  const endRoom = ({ nowMs = 0, hp = null } = {}) => {
    if (!active || !current || current.endedAtMs !== null) return false;
    current.endedAtMs = Math.max(current.startedAtMs, positive(nowMs));
    if (Number.isFinite(hp)) {
      current.counts.hpEnd = round(positive(hp));
      total.hpEnd = round(positive(hp));
    }
    if (bossStartedAtMs !== null) {
      const life = Math.max(0, current.endedAtMs - bossStartedAtMs);
      for (const b of buckets()) b.bossLifetimeMs = life;
      bossStartedAtMs = null;
    }
    flushLiveEnemies(current.endedAtMs);
    return true;
  };
  const finish = ({ nowMs = 0, hp = null, result = 'defeat' } = {}) => {
    if (!active || finished) return false;
    const at = positive(nowMs);
    if (Number.isFinite(hp)) {
      total.hpEnd = round(positive(hp));
      if (current) current.counts.hpEnd = round(positive(hp));
    }
    if (current && current.endedAtMs === null) {
      flushLiveEnemies(at);
      if (bossStartedAtMs !== null) {
        const life = Math.max(0, at - bossStartedAtMs);
        for (const b of buckets()) b.bossLifetimeMs = life;
        bossStartedAtMs = null;
      }
    }
    finished = true;
    endAtMs = at;
    outcome = ['victory', 'defeat', 'retreat'].includes(result) ? result : 'unknown';
    return true;
  };
  const snapshot = (nowMs = 0) => {
    if (!active) return null;
    const at = finished ? endAtMs : positive(nowMs);
    const roomRows = rooms.map(r => ({
      roomId: r.roomId, roomIndex: r.roomIndex, kind: r.kind,
      durationMs: Math.max(0, (r.endedAtMs ?? at) - r.startedAtMs),
      cleared: r.endedAtMs !== null,
      ...publicCounts(r.counts),
      reviewFlags: status(r, at, finished),
    }));
    const flags = [...new Set(roomRows.flatMap(r => r.reviewFlags))];
    // An entire fast clear with zero hostile bullets is review-worthy even if
    // every individual room finished before the V4.0 8-second room threshold.
    if (finished && runMode !== 'single_room' && total.rangedSpawns >= 2
        && total.projectiles === 0) flags.push('FULL_RUN_RANGED_NO_PROJECTILES_REVIEW');
    if (finished && total.bossEncountered && total.bossLifetimeMs !== null
        && total.bossLifetimeMs < DUNGEON_QA_READINESS_POLICY_V400.bossAttackEvidenceMinMs
        && total.shotsByRole.boss === 0 && total.telegraphs === 0) {
      flags.push('BOSS_ATTACK_WINDOW_UNTESTED');
    }
    // Never silently certify production: a real APK/device assessment is required.
    return {
      version: DUNGEON_QA_READINESS_VERSION_V400,
      scope: 'guest_dungeon_qa_only',
      dungeonId: shortId(dungeonId), presetId: shortId(presetId),
      runMode: runMode === 'single_room' ? 'single_room' : 'full_run',
      expectedRooms: Math.min(15, Math.max(1, whole(expectedRooms, 5))),
      outcome, finished, elapsedMs: Math.max(0, at - originMs),
      ...publicCounts(total), rooms: roomRows,
      reviewFlags: flags,
      releaseStatus: 'APK_QA_REVIEW_REQUIRED',
      productionApproved: false,
      notes: 'QA evidence only; not a reward, balance auto-adjustment or production release gate.',
    };
  };
  return Object.freeze({ beginRoom, recordSpawn, recordVolley, recordProjectile,
    recordTelegraph, recordHazardDestroyed, recordObjectiveNodeDestroyed,
    recordEnemyResolved, recordFireProbe, recordBossSpawn, recordBossDefeated,
    recordDamage, sample, endRoom, finish, snapshot });
}

export function auditDungeonQaReadinessV400() {
  const issues = [];
  const recorder = createDungeonQaReadinessV400({ enabled: true, startedAtMs: 0 });
  recorder.beginRoom({ roomId: 'qa_room', roomIndex: 0, nowMs: 1000, hp: 200 });
  recorder.recordSpawn('gunner');
  recorder.recordProjectile('gunner');
  recorder.recordDamage({ source: 'projectile', hpBefore: 200, hpAfter: 180 });
  recorder.endRoom({ nowMs: 2100, hp: 180 });
  recorder.finish({ nowMs: 2400, hp: 180, result: 'victory' });
  const report = recorder.snapshot(5000);
  if (report.projectiles !== 1 || report.damageTaken !== 20) issues.push('COUNTER_DRIFT');
  if (report.hpStart !== 200 || report.hpEnd !== 180) issues.push('RUN_HP_NULL');
  if (report.rooms.length !== 1 || report.rooms[0].durationMs !== 1100) issues.push('ROOM_TIMING');
  if (!report.finished || report.productionApproved !== false) issues.push('PRODUCTION_FAIL_OPEN');
  if (createDungeonQaReadinessV400().snapshot() !== null) issues.push('PRODUCTION_TELEMETRY_ACTIVE');
  return Object.freeze(issues);
}
