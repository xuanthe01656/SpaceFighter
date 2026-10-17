import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CAMPAIGN_DATA, AIRCRAFTS, MISSIONS_CONFIG } from '../src/constants.js';
import { monthlyAttendanceGoal, missionGoal, viewCloudMissions } from '../src/utils/missionGoals.js';
import { ensureAttendanceWeek, mondayKeyUTC, weekdayMondayUTC, lastNaturalClaimUTC,
  utcDayKey } from '../src/utils/attendanceWeek.js';
import { ensureGuestMissions, recordGuestAttendance, recordGuestBattle } from '../src/utils/guestProgress.js';

const campaign = () => structuredClone(DEFAULT_CAMPAIGN_DATA);
const at = iso => Date.parse(iso);

test('UTC monthly attendance max 30 and February 28/29: all mission UI goals agree', () => {
  for (const [date, goal] of [
    ['2027-02-01T00:00:00Z', 28], ['2028-02-28T23:59:59Z', 29],
    ['2026-04-30T23:59:59Z', 30], ['2026-10-01T00:00:00Z', 30],
    ['2026-10-31T23:59:59Z', 30], ['2026-11-01T00:00:00Z', 30]
  ]) {
    assert.equal(monthlyAttendanceGoal(at(date)), goal, date);
    assert.equal(missionGoal(MISSIONS_CONFIG.monthly.find(m => m.id === 'm_login_30'), at(date)), goal);
  }
  assert.equal(missionGoal(MISSIONS_CONFIG.monthly.find(m => m.id === 'm_clear_planet'), at('2027-02-01T12:00:00Z')), 30);
});

test('Guest natural attendance counts once, Ghosts do not change lifetime streak or mission counters', () => {
  const c = campaign(), thursday = at('2026-10-15T12:00:00Z');
  const real = recordGuestAttendance(c, {}, thursday);
  assert.deepEqual(real, { ok: true, weeklyComplete: false, isMakeup: false });
  assert.deepEqual(c.attendance.claimedDays, [4]);
  assert.equal(c.attendance.streak, 1);
  assert.equal(c.attendance.lastClaimUTC, '2026-10-15');
  assert.equal(c.missionData.progress.d_login, 1);
  assert.equal(c.missionData.progress.w_login_5, 1);
  assert.equal(c.missionData.progress.m_login_30, 1);
  const snapshot = structuredClone(c.missionData.progress);
  assert.equal(recordGuestAttendance(c, {}, thursday).reason, 'ALREADY_CLAIMED');
  for (const day of [1, 2]) assert.equal(recordGuestAttendance(c, { makeupDay: day }, thursday).ok, true);
  assert.deepEqual(c.attendance.claimedDays, [1, 2, 4]);
  assert.equal(c.attendance.makeupCount, 2);
  assert.equal(c.attendance.weeklyStreak, 3);
  assert.equal(c.attendance.streak, 1);
  assert.equal(c.attendance.lastClaimUTC, '2026-10-15');
  assert.deepEqual(c.missionData.progress, snapshot);
  assert.equal(recordGuestAttendance(c, { makeupDay: 3 }, thursday).reason, 'MAKEUP_LIMIT');
  assert.equal(recordGuestAttendance(c, { makeupDay: 5 }, thursday).reason, 'INVALID_DAY');
  assert.equal(recordGuestAttendance(c, { makeupDay: 2 }, thursday).reason, 'ALREADY_CLAIMED');
  assert.equal(recordGuestAttendance(c, {}, at('2026-10-16T12:00:00Z')).ok, true);
  assert.equal(c.attendance.streak, 2);
  assert.equal(c.missionData.progress.w_login_5, 2); // NOT four days from two Ghosts
  assert.equal(c.missionData.progress.m_login_30, 2);
});

test('Guest first check-in of new month resets monthly counter before the increment; never backfills streak', () => {
  const c = campaign();
  const october = at('2026-10-31T12:00:00Z'), november = at('2026-11-01T12:00:00Z');
  recordGuestAttendance(c, {}, october);
  c.attendance.streak = 22;
  c.missionData.progress.m_login_30 = 27;
  c.missionData.claimed = ['m_login_30'];
  recordGuestAttendance(c, {}, november);
  assert.equal(c.attendance.streak, 23, 'real consecutive streak crosses month legitimately');
  assert.equal(c.missionData.progress.m_login_30, 1, 'no historical streak backfill');
  assert.ok(!c.missionData.claimed.includes('m_login_30'));
  assert.equal(c.missionData.monthlyKey, '2026-11');
  assert.equal(c.missionData.progress.w_login_5, 2, 'same UTC calendar week');
});

test('Guest month-long attendance in February cannot exceed real UTC day count', () => {
  const c = campaign();
  for (let d = 1; d <= 28; d++) {
    const result = recordGuestAttendance(c, {}, Date.UTC(2027, 1, d, 12));
    assert.equal(result.ok, true, `February ${d}`);
  }
  assert.equal(c.missionData.progress.m_login_30, 28);
  assert.equal(monthlyAttendanceGoal(Date.UTC(2027, 1, 28)), 28);
  assert.equal(recordGuestAttendance(c, {}, Date.UTC(2027, 1, 28, 20)).ok, false);
  assert.equal(recordGuestAttendance(c, {}, Date.UTC(2027, 2, 1, 12)).ok, true);
  assert.equal(c.missionData.progress.m_login_30, 1);
});

test('Guest battle mission rules preserved: 3 Campaign runs, 30 Campaign stage wins including replays', () => {
  const c = campaign(), now = at('2026-10-16T11:00:00Z');
  recordGuestBattle(c, { mode: 'dungeon', victory: true, kills: 4, boss: true }, now);
  assert.equal(c.missionData.progress.d_play_3, 0);
  assert.equal(c.missionData.progress.m_clear_planet, 0);
  for (let i = 0; i < 30; i++) recordGuestBattle(c, { mode: 'campaign', victory: true }, now);
  assert.equal(c.missionData.progress.m_clear_planet, 30);
  assert.equal(c.missionData.progress.d_play_3, 30);
});

test('UTC midnight+weekly calendar is invariant across local timezone offsets', () => {
  for (const time of ['2026-10-18T23:59:59Z', '2026-10-19T00:00:00Z', '2026-11-01T00:00:00Z']) {
    const now = at(time);
    assert.equal(utcDayKey(now), time.slice(0, 10));
    assert.equal(mondayKeyUTC(now), time.startsWith('2026-10-18') ? '2026-10-12' :
      time.startsWith('2026-10-19') ? '2026-10-19' : '2026-10-26');
  }
  assert.equal(weekdayMondayUTC(at('2026-10-18T23:59:59Z')), 7);
  assert.equal(weekdayMondayUTC(at('2026-10-19T00:00:00Z')), 1);
});

test('Guest attendance migration preserves this week, resets expired week without altering lifetime streak', () => {
  const now = at('2026-10-16T09:00:00Z');
  const saved = { lastDate: 'Wed Oct 14 2026', claimedDays: [1, 2, 3], streak: 9, makeupCount: 1 };
  ensureAttendanceWeek(saved, now);
  assert.deepEqual(saved.claimedDays, [1, 2, 3]);
  assert.equal(lastNaturalClaimUTC(saved), '2026-10-14');
  assert.equal(saved.weekKey, '2026-10-12');
  ensureAttendanceWeek(saved, at('2026-10-19T00:00:00Z'));
  assert.deepEqual(saved.claimedDays, []);
  assert.equal(saved.makeupCount, 0);
  assert.equal(saved.streak, 9);
});

test('Guest first UTC mission migration preserves local-current saved progress without rewriting wallet', () => {
  const c = campaign();
  c.missionData = { progress: {}, claimed: [] };
  c.missionData.progress.d_play_3 = 2;
  c.missionData.progress.w_boss_3 = 1;
  c.missionData.progress.m_clear_planet = 20;
  c.missionData.lastDailyReset = new Date('2026-10-16T00:00:00').getTime();
  c.missionData.lastWeeklyReset = new Date('2026-10-12T00:00:00').getTime();
  c.missionData.lastMonthlyReset = new Date('2026-10-01T00:00:00').getTime();
  const now = at('2026-10-16T15:00:00Z');
  ensureGuestMissions(c, now);
  assert.equal(c.missionData.progress.d_play_3, 2);
  assert.equal(c.missionData.progress.w_boss_3, 1);
  assert.equal(c.missionData.progress.m_clear_planet, 20);
  ensureGuestMissions(c, now);
  assert.equal(c.missionData.progress.d_play_3, 2, 'idempotent');
});

test('Cloud mission preview hides an expired period without writing user data', () => {
  const original = {
    claimed: ['d_login', 'w_login_5', 'm_login_30'],
    progress: { d_login: 1, w_login_5: 5, m_login_30: 28, m_clear_planet: 18 },
    dailyKey: '2026-10-15', weeklyKey: '2026-10-12', monthlyKey: '2026-10',
  };
  const old = structuredClone(original);
  const view = viewCloudMissions(original, at('2026-11-01T12:00:00Z'));
  assert.equal(view.progress.d_login, 0);
  assert.equal(view.progress.m_login_30, 0);
  assert.ok(!view.claimed.includes('m_login_30'));
  assert.deepEqual(original, old, 'Cloud state remains server-owned');
});

test('GLB X-Wing accounts for Babylon LH glTF __root__ conversion before rotating nose -Z', () => {
  const xwing = AIRCRAFTS.find(ship => ship.id === 'ship_xwing');
  assert.equal(xwing.modelRotation.y, Math.PI / 2);
  // GLB local -X nose; Babylon LH __root__ rotates Y 180deg and mirrors Z.
  const glbNoseX = -1;
  const importedNoseX = -glbNoseX;
  const noseZ = -Math.sin(xwing.modelRotation.y) * importedNoseX;
  const tailZ = -Math.sin(xwing.modelRotation.y) * (-importedNoseX);
  assert.ok(noseZ < -0.999, 'imported +X nose must map to combat -Z');
  assert.ok(tailZ > 0.999, 'imported -X engines must map behind the player');
  assert.equal(xwing.spriteInvertY, true, 'mobile sprite requires a separate UV correction');
});
