/**
 * Dungeon QA Readiness V4.0.0 — volatile evidence only.
 * Data never leaves this run, is never sent to a server and never writes to
 * campaignData, localStorage, Firebase, economy, or authoritative battle state.
 * QA warnings are review signals, NOT production certification.
 */
export const DUNGEON_QA_READINESS_VERSION_V400 = 'dungeon-qa-readiness-v4.0.0';
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
});

const ROLES = new Set(['raider', 'gunner', 'shieldbearer', 'support', 'artillery', 'charger', 'boss']);
const RANGED_ROLES = new Set(['raider', 'gunner', 'shieldbearer', 'support', 'artillery']);
const SOURCES = new Set(['projectile', 'environment', 'contact', 'unknown']);
const safeNum = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const positive = (n, fallback = 0) => Math.max(0, safeNum(n, fallback));
const whole = (n, fallback = 0) => Math.floor(positive(n, fallback));
const cleanRole = value => ROLES.has(value) ? value : 'unknown';
const cleanSource = value => SOURCES.has(value) ? value : 'unknown';
const round = (value, digits = 1) => Number(safeNum(value).toFixed(digits));
const shortId = value => String(value || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || 'unknown';
const emptyCounts = () => ({ spawns: 0, rangedSpawns: 0, volleys: 0, projectiles: 0,
  telegraphs: 0, destroyedHazards: 0, damageTaken: 0, dodged: 0, absorbed: 0,
  damageBySource: { projectile: 0, contact: 0, environment: 0, unknown: 0 },
  shotsByRole: { raider: 0, gunner: 0, shieldbearer: 0, support: 0,
    artillery: 0, charger: 0, boss: 0, unknown: 0 },
  peakEnemies: 0, peakHostileProjectiles: 0, sampleCount: 0, lowFpsSamples: 0,
  frameMsSum: 0, hpStart: null, hpEnd: null });
const publicCounts = counts => ({
  spawns: counts.spawns, rangedSpawns: counts.rangedSpawns,
  volleys: counts.volleys, projectiles: counts.projectiles, telegraphs: counts.telegraphs,
  destroyedHazards: counts.destroyedHazards,
  damageTaken: round(counts.damageTaken), damageBySource: { ...counts.damageBySource },
  dodged: counts.dodged, absorbed: counts.absorbed,
  shotsByRole: { ...counts.shotsByRole },
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

  const buckets = () => current ? [total, current.counts] : [total];
  const beginRoom = ({ roomId, roomIndex, kind = 'entry', nowMs = 0, hp = null } = {}) => {
    if (!active || finished || rooms.length >= DUNGEON_QA_READINESS_POLICY_V400.maxRooms) return false;
    if (current && current.endedAtMs === null) endRoom({ nowMs, hp });
    const at = positive(nowMs);
    const room = { roomId: shortId(roomId), roomIndex: whole(roomIndex), kind: shortId(kind),
      startedAtMs: at, endedAtMs: null, counts: emptyCounts() };
    if (Number.isFinite(hp)) room.counts.hpStart = round(positive(hp));
    rooms.push(room);
    current = room;
    return true;
  };
  const recordSpawn = roleId => {
    if (!active || finished || !current) return;
    for (const b of buckets()) {
      b.spawns += 1;
      if (RANGED_ROLES.has(roleId)) b.rangedSpawns += 1;
    }
  };
  const recordVolley = roleId => {
    if (!active || finished || !current) return;
    for (const b of buckets()) b.volleys += 1;
  };
  const recordProjectile = roleId => {
    if (!active || finished || !current) return;
    const role = cleanRole(roleId);
    for (const b of buckets()) {
      b.projectiles += 1;
      b.shotsByRole[role] += 1;
    }
  };
  const recordTelegraph = () => {
    if (!active || finished || !current) return;
    for (const b of buckets()) b.telegraphs += 1;
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
    if (Number.isFinite(hp)) current.counts.hpEnd = round(positive(hp));
    return true;
  };
  const finish = ({ nowMs = 0, hp = null, result = 'defeat' } = {}) => {
    if (!active || finished) return false;
    const at = positive(nowMs);
    if (current && current.endedAtMs === null && Number.isFinite(hp)) {
      current.counts.hpEnd = round(positive(hp));
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
    recordTelegraph, recordHazardDestroyed, recordDamage, sample, endRoom, finish, snapshot });
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
  if (report.rooms.length !== 1 || report.rooms[0].durationMs !== 1100) issues.push('ROOM_TIMING');
  if (!report.finished || report.productionApproved !== false) issues.push('PRODUCTION_FAIL_OPEN');
  if (createDungeonQaReadinessV400().snapshot() !== null) issues.push('PRODUCTION_TELEMETRY_ACTIVE');
  return Object.freeze(issues);
}
