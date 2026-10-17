import { mondayKeyUTC, utcDayKey } from './attendanceWeek.js';

/** Month attendance: Feb=28/29, all 30/31-day months=30. UTC, like the server. */
export function monthlyAttendanceGoal(now) {
  const d = new Date(now);
  if (!Number.isFinite(d.getTime())) throw new TypeError('Invalid mission timestamp');
  return Math.min(30, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate());
}

export function missionGoal(mission, now) {
  return mission.id === 'm_login_30' ? monthlyAttendanceGoal(now) : mission.goal;
}

const idsByPeriod = {
  daily: ['d_login', 'd_play_3', 'd_kill_50'],
  weekly: ['w_login_5', 'w_boss_3', 'w_spend_coins'],
  monthly: ['m_clear_planet', 'm_pull_gacha', 'm_login_30'],
};

/** A read-only preview for Cloud: period resets are actually persisted by server commands. */
export function viewCloudMissions(track, now) {
  const source = track || {};
  const view = {
    ...source,
    progress: { ...(source.progress || {}) },
    claimed: [...(source.claimed || [])],
  };
  const current = { daily: utcDayKey(now), weekly: mondayKeyUTC(now), monthly: utcDayKey(now).slice(0, 7) };
  for (const [period, key] of Object.entries(current)) {
    if (source[`${period}Key`] !== key) {
      for (const id of idsByPeriod[period]) {
        view.progress[id] = 0;
        view.claimed = view.claimed.filter(claimedId => claimedId !== id);
      }
    }
  }
  return view;
}
