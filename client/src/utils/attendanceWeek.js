/** Single UTC attendance calendar for Guest and Cloud (server UTC midnight). */
export function utcDayKey(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid attendance timestamp');
  return date.toISOString().slice(0, 10);
}

export function mondayKeyUTC(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid UTC timestamp');
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function weekdayMondayUTC(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid UTC timestamp');
  return ((date.getUTCDay() + 6) % 7) + 1;
}

// Backward-compatible name; no longer mixes a local Guest week with Cloud UTC.
export const mondayKey = mondayKeyUTC;

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Validate a legacy Date.toDateString() without host-dependent Date.parse(). */
export function legacyAttendanceUTC(value) {
  if (typeof value !== 'string') return null;
  const match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{4})$/.exec(value);
  if (!match) return null;
  const [, weekday, monthName, dayText, yearText] = match;
  const year = Number(yearText), month = months.indexOf(monthName), day = Number(dayText);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day ||
      weekdays[date.getUTCDay()] !== weekday) return null;
  return date.toISOString().slice(0, 10);
}

export function lastNaturalClaimUTC(attendance) {
  const raw = attendance?.lastClaimUTC;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
      !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) && utcDayKey(Date.parse(`${raw}T00:00:00Z`)) === raw) return raw;
  return legacyAttendanceUTC(attendance?.lastDate);
}

export function utcLegacyDateLabel(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid attendance timestamp');
  return `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

/** Returns whether the attendance record needed initialization/reset. */
export function ensureAttendanceWeek(attendance, timestamp) {
  if (!attendance || typeof attendance !== 'object' || Array.isArray(attendance)) {
    throw new TypeError('Attendance object required');
  }
  const currentWeek = mondayKeyUTC(timestamp);
  const oldKey = attendance.weekKey;
  const lastDay = lastNaturalClaimUTC(attendance);
  const priorWeek = oldKey || (lastDay ? mondayKeyUTC(`${lastDay}T12:00:00Z`) : currentWeek);
  let changed = oldKey !== currentWeek;
  if (priorWeek !== currentWeek) {
    attendance.claimedDays = [];
    attendance.weeklyCompletedDays = 0;
    attendance.weeklyStreak = 0;
    attendance.makeupCount = 0;
    changed = true;
  }
  if (!Array.isArray(attendance.claimedDays)) {
    attendance.claimedDays = [];
    changed = true;
  }
  // Old local data may contain repeated/invalid weekday values; do not count twice.
  const valid = [...new Set(attendance.claimedDays.filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
  if (JSON.stringify(valid) !== JSON.stringify(attendance.claimedDays)) {
    attendance.claimedDays = valid;
    changed = true;
  }
  if (attendance.weeklyCompletedDays !== attendance.claimedDays.length ||
      attendance.weeklyStreak !== attendance.claimedDays.length) {
    attendance.weeklyCompletedDays = attendance.claimedDays.length;
    attendance.weeklyStreak = attendance.weeklyCompletedDays; // deprecated mirror
    changed = true;
  }
  attendance.weekKey = currentWeek;
  return changed;
}

/** Read-only eligibility preview, shared by Guest/Cloud attendance UI.
 * A makeup is a missed, *past* UTC weekday in this week. Limit checks are
 * separate because previously used makeups must not reopen any slots.
 */
export function eligibleMakeupDaysUTC(attendance, timestamp) {
  const weekday = weekdayMondayUTC(timestamp);
  const sameWeek = attendance?.weekKey === mondayKeyUTC(timestamp);
  const claimed = sameWeek && Array.isArray(attendance?.claimedDays) ? attendance.claimedDays : [];
  return Array.from({ length: weekday - 1 }, (_, i) => i + 1)
    .filter(day => !claimed.includes(day));
}
