/** Guest-only mission bookkeeping. Never submit guest counters as Cloud proof. */
import { mondayKeyUTC, utcDayKey, weekdayMondayUTC, ensureAttendanceWeek,
  lastNaturalClaimUTC, utcLegacyDateLabel } from './attendanceWeek.js';
import { monthlyAttendanceGoal } from './missionGoals.js';

// Guest-only evidence; Cloud never accepts this client-side ledger for rewards.
const appendNaturalDay = (attendance, now) => {
  const today = utcDayKey(now), minDay = utcDayKey(now - 75 * 86400000);
  const days = Array.isArray(attendance.naturalClaimDaysUTC) ? attendance.naturalClaimDaysUTC : [];
  attendance.naturalClaimDaysUTC = [...new Set([...days, today])]
    .filter(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= minDay && day <= today)
    .sort();
};

const periods = {
  daily: ['d_login', 'd_play_3', 'd_kill_50'],
  weekly: ['w_login_5', 'w_boss_3', 'w_spend_coins'],
  monthly: ['m_clear_planet', 'm_pull_gacha', 'm_login_30'],
};

// Only on a one-time migration: old Guest reset values were LOCAL midnights.
// Compare their local calendar label, not milliseconds, to avoid erasing current
// period progress merely because the timezone changed in Graphics 2.1.1.
function legacyPeriodKey(value, period) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'daily') return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  if (period === 'monthly') return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}`;
  local.setDate(local.getDate() - ((local.getDay() + 6) % 7));
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

export function ensureGuestMissions(campaignData, now = Date.now()) {
  const c = campaignData || {};
  const m = (c.missionData ||= { claimed: [], progress: {} });
  m.progress ||= {};
  m.claimed ||= [];
  const today = utcDayKey(now);
  const keys = { daily: today, weekly: mondayKeyUTC(now), monthly: today.slice(0, 7) };
  for (const [period, key] of Object.entries(keys)) {
    const prop = `${period}Key`;
    const oldResetProp = `last${period.charAt(0).toUpperCase()}${period.slice(1)}Reset`;
    if (m[prop] !== key) {
      const previouslyCurrent = !m[prop] && legacyPeriodKey(m[oldResetProp], period) === key;
      if (!previouslyCurrent) {
        for (const missionId of periods[period]) {
          m.progress[missionId] = 0;
          m.claimed = m.claimed.filter(id => id !== missionId);
        }
      }
      m[prop] = key;
    }
  }
  // Restore a floor only from dates created by our own natural check-ins.
  // Do not backfill from legacy lifetime streak or two paid Ghost slots.
  const dates = Array.isArray(c.attendance?.naturalClaimDaysUTC) ? [...new Set(c.attendance.naturalClaimDaysUTC)] : [];
  const currentDates = dates.filter(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today);
  m.progress.d_login = Math.max(Number(m.progress.d_login) || 0, currentDates.includes(today) ? 1 : 0);
  m.progress.w_login_5 = Math.max(Number(m.progress.w_login_5) || 0, Math.min(5, currentDates.filter(day => day >= keys.weekly).length));
  m.progress.m_login_30 = Math.max(Number(m.progress.m_login_30) || 0, Math.min(monthlyAttendanceGoal(now), currentDates.filter(day => day.slice(0, 7) === keys.monthly).length));
  return m;
}

function inc(m, key, value) {
  if (!Number.isSafeInteger(value) || value <= 0) return;
  m.progress[key] = Math.min(10000000, (Number(m.progress[key]) || 0) + value);
}

/**
 * Natural check-in updates day/week/month missions once and the real consecutive
 * streak. Ghost makeups affect only this week's claimed slots and makeup count.
 * The caller handles the cost/reward after a successful result.
 */
export function recordGuestAttendance(campaignData, { makeupDay = null } = {}, now = Date.now()) {
  const c = campaignData;
  if (!c || typeof c !== 'object') throw new TypeError('Guest campaign required');
  const a = (c.attendance ||= { streak: 0, lastDate: '', claimedDays: [], makeupCount: 0 });
  ensureAttendanceWeek(a, now);
  const m = ensureGuestMissions(c, now);
  const today = utcDayKey(now);
  const dayOfWeek = weekdayMondayUTC(now);
  const isMakeup = makeupDay !== null;
  const claimDay = isMakeup ? makeupDay : dayOfWeek;
  if (!Number.isInteger(claimDay) || claimDay < 1 || claimDay > 7 || (isMakeup && claimDay >= dayOfWeek)) {
    return { ok: false, reason: 'INVALID_DAY' };
  }
  if (a.claimedDays.includes(claimDay) || (!isMakeup && lastNaturalClaimUTC(a) === today)) {
    return { ok: false, reason: 'ALREADY_CLAIMED' };
  }
  if (isMakeup && (a.makeupCount || 0) >= 2) return { ok: false, reason: 'MAKEUP_LIMIT' };
  if (isMakeup) {
    a.makeupCount = (a.makeupCount || 0) + 1;
  } else {
    const priorDay = lastNaturalClaimUTC(a);
    const yesterday = utcDayKey(now - 86400000);
    a.streak = priorDay === yesterday ? Math.max(0, Number(a.streak) || 0) + 1 : 1;
    a.lastClaimUTC = today;
    a.lastDate = utcLegacyDateLabel(now); // preserve schema/legacy consumers
    appendNaturalDay(a, now);
    m.progress.d_login = 1;
    m.progress.w_login_5 = Math.min(5, (Number(m.progress.w_login_5) || 0) + 1);
    m.progress.m_login_30 = Math.min(monthlyAttendanceGoal(now), (Number(m.progress.m_login_30) || 0) + 1);
  }
  a.claimedDays.push(claimDay);
  a.claimedDays.sort((x, y) => x - y);
  a.weeklyCompletedDays = a.claimedDays.length;
  a.weeklyStreak = a.weeklyCompletedDays; // deprecated mirror
  return { ok: true, weeklyComplete: a.claimedDays.length === 7, isMakeup };
}

export function recordGuestBattle(campaignData, { mode, victory, kills = 0, boss = false } = {}, now = Date.now()) {
  const m = ensureGuestMissions(campaignData, now);
  const safeKills = Number.isSafeInteger(kills) && kills >= 0 ? Math.min(kills, 10000) : 0;
  if (mode === 'campaign') {
    inc(m, 'd_play_3', 1);
    if (victory) inc(m, 'm_clear_planet', 1);
    if (victory && boss) inc(m, 'w_boss_3', 1);
  }
  inc(m, 'd_kill_50', safeKills);
  return m;
}

export function recordGuestGacha(campaignData, amount = 1, now = Date.now()) {
  const m = ensureGuestMissions(campaignData, now);
  inc(m, 'm_pull_gacha', amount);
  return m;
}

export function recordGuestCoinSpend(campaignData, amount, now = Date.now()) {
  const m = ensureGuestMissions(campaignData, now);
  inc(m, 'w_spend_coins', amount);
  return m;
}

export function activeCoinMultiplier(events, now = Date.now()) {
  const found = (events || []).filter(e => e.type === 'coin_fever' &&
    Number.isFinite(e.startTime) && Number.isFinite(e.endTime) && now >= e.startTime && now <= e.endTime);
  return found.length ? Math.max(1, ...found.map(x => Number(x.multiplier) || 1)) : 1;
}

export function recordGuestEventKill(campaignData, events, now = Date.now()) {
  if (!campaignData || !Array.isArray(events)) return 0;
  let updated = 0;
  for (const ev of events) {
    if (ev?.type !== 'kill_rush' || typeof ev.id !== 'string' ||
        !Number.isFinite(ev.startTime) || !Number.isFinite(ev.endTime) ||
        now < ev.startTime || now > ev.endTime) continue;
    const record = (campaignData.eventData ||= {})[ev.id] ||= { kills: 0, claimedMilestones: [] };
    record.kills = Math.min(10000000, (Number(record.kills) || 0) + 1);
    updated++;
  }
  return updated;
}
