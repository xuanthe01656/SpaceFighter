'use strict';
// Operator-only, guarded repair for ONE manually verified legacy test profile.
// No public API command uses this module. The original legacy lastDate is a
// local calendar label, not proof of a UTC instant; the operator MUST confirm
// the intended UTC date independently before running the write mode.
const { createHash } = require('node:crypto');
const { utcDay, utcWeek, utcMonth } = require('./economy.cjs');

const validDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && utcDay(ms) === value;
};
const weekdayMon = day => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const legacyLabel = day => {
  const d = new Date(`${day}T12:00:00Z`);
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
};
const fingerprintOf = (doc, request) => createHash('sha256')
  .update(JSON.stringify({ attendance:doc.attendance, missions:doc.missions, dayUTC:request.dayUTC,
    expectedMakeups:request.expectedMakeups })).digest('hex');

function planLegacyAttendanceRepair(doc, { dayUTC, expectedMakeups, now }) {
  if (!validDay(dayUTC) || !Number.isSafeInteger(now) || now < 0 ||
      !Number.isInteger(expectedMakeups) || expectedMakeups < 0 || expectedMakeups > 2) {
    throw Error('Invalid dayUTC, expectedMakeups, or now');
  }
  const fingerprint = fingerprintOf(doc, {dayUTC, expectedMakeups});
  const a = doc?.attendance || {};
  const m = doc?.missions || {};
  const p = m.progress || {};
  const today = utcDay(now), week = utcWeek(now), month = utcMonth(now);
  const result = (status, reason, patch = null) => ({status,reason,fingerprint,patch,
    preview: { dayUTC, todayUTC:today, weekUTC:week, monthUTC:month,
      attendanceSlots: Array.isArray(a.claimedDays) ? [...a.claimedDays] : [],
      old: {daily:p.d_login??0,weekly:p.w_login_5??0,monthly:p.m_login_30??0},
      next: patch ? {daily:patch.missions.progress.d_login??0,
        weekly:patch.missions.progress.w_login_5??0,monthly:patch.missions.progress.m_login_30??0} : null }});
  if (m.attendanceRepair212) return result('ALREADY_REVIEWED','Previous 2.1.2 repair record exists');
  if (dayUTC > today || dayUTC.slice(0,7) !== month || utcWeek(Date.parse(`${dayUTC}T12:00:00Z`)) !== week)
    return result('BLOCKED','Confirmed UTC day must be within the active UTC week/month');
  if (a.weekKey !== week || m.weeklyKey !== week || m.monthlyKey !== month)
    return result('BLOCKED','Period keys mismatch; do not guess an expired period');
  if (a.lastDate !== legacyLabel(dayUTC))
    return result('BLOCKED','Legacy lastDate does not match the manually confirmed calendar date');
  if (a.lastClaimUTC !== null && a.lastClaimUTC !== undefined && a.lastClaimUTC !== '')
    return result('BLOCKED','Already has a server-style UTC last claim');
  if (Array.isArray(a.naturalClaimDaysUTC) && a.naturalClaimDaysUTC.length)
    return result('BLOCKED','Already has natural UTC claim evidence; requires a separate audit');
  const slots = a.claimedDays;
  if (!Array.isArray(slots) || slots.some(n=>!Number.isInteger(n)||n<1||n>7) ||
      new Set(slots).size !== slots.length || slots.length !== expectedMakeups + 1 ||
      !slots.includes(weekdayMon(dayUTC)) || a.makeupCount !== expectedMakeups)
    return result('BLOCKED','Week slots/makeup count are not the exact one-natural-day legacy fixture');
  if (p.w_login_5 !== expectedMakeups || (p.m_login_30 ?? 0) !== 0 ||
      (m.dailyKey === dayUTC && (p.d_login??0) !== 0) ||
      !Array.isArray(m.claimed) || m.claimed.some(id=>['d_login','w_login_5','m_login_30'].includes(id)))
    return result('BLOCKED','Existing mission totals/claims are not the expected legacy case');
  const attendance = {...a, lastClaimUTC:dayUTC, naturalClaimDaysUTC:[dayUTC]};
  const missions = {...m,progress:{...p,w_login_5:1,m_login_30:1,
    d_login: m.dailyKey === dayUTC && dayUTC === today ? 1 : (p.d_login??0)},
    attendanceRepair212: {version:'2.1.2',dayUTC,expectedMakeups,
      priorProgress:{d_login:p.d_login??0,w_login_5:p.w_login_5,m_login_30:p.m_login_30??0},
      repairedAtUTC: new Date(now).toISOString(),source:'operator-confirmed-test-legacy-day'} };
  return result('READY','Dry-run only unless explicitly applied with matching fingerprint', {attendance,missions});
}
module.exports={planLegacyAttendanceRepair};
