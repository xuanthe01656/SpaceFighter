import test from 'node:test';
import assert from 'node:assert/strict';
import { mondayKey, mondayKeyUTC, ensureAttendanceWeek } from '../src/utils/attendanceWeek.js';

const date = (value) => new Date(value+'T12:00:00Z').getTime();

test('Monday through Sunday share one key; Monday starts a new week', () => {
  assert.equal(mondayKey(date('2026-10-12')), '2026-10-12');
  assert.equal(mondayKey(date('2026-10-18')), '2026-10-12');
  assert.equal(mondayKey(date('2026-10-19')), '2026-10-19');
});

test('attendance resets weekly claims and makeups but preserves lifetime streak', () => {
  const att = { weekKey:'2026-10-12', claimedDays:[1,2,3,4,5,6,7], makeupCount:2, weeklyStreak:7, streak:9 };
  assert.equal(ensureAttendanceWeek(att,date('2026-10-19')),true);
  assert.deepEqual(att.claimedDays,[]);
  assert.equal(att.makeupCount,0);
  assert.equal(att.weeklyStreak,0);
  assert.equal(att.streak,9);
  assert.equal(att.weekKey,'2026-10-19');
});

test('current-week legacy claims are preserved on migration', () => {
  const att = { lastDate: 'Wed Oct 14 2026', claimedDays:[1,2,3], weeklyStreak:3 };
  ensureAttendanceWeek(att,date('2026-10-16'));
  assert.deepEqual(att.claimedDays,[1,2,3]);
});

test('past-week legacy claims are reset on migration', () => {
  const att = { lastDate: 'Sun Oct 11 2026', claimedDays:[1,2,3], makeupCount:1 };
  ensureAttendanceWeek(att,date('2026-10-16'));
  assert.deepEqual(att.claimedDays,[]);
  assert.equal(att.makeupCount,0);
});

test('authenticated calendar boundaries align with server UTC week', () => {
  assert.equal(mondayKeyUTC(Date.parse('2026-10-18T23:59:59Z')), '2026-10-12');
  assert.equal(mondayKeyUTC(Date.parse('2026-10-19T00:00:00Z')), '2026-10-19');
});
