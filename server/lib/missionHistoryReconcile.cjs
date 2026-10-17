'use strict';
/**
 * Firestore operator-only mission reconciliation planner.
 * - Rebuild *current* UTC period counters from existing persisted counters plus
 *   verifiable operation audit entries; never assume a lifetime streak or
 *   paid makeup means a natural UTC login.
 * - Preserve prior-period progress via updateMissions.periodHistory.
 * - No rewards, wallet, equipment, Auth, or Firestore SDK in this pure module.
 * - Older battle.finish records lack verified mode/result/ticket linkage; they
 *   are intentionally not counted unless a server-issued mission delta exists.
 */
const { createHash } = require('node:crypto');
const { utcDay, utcWeek, utcMonth, updateMissions, monthlyAttendanceGoalUTC } = require('./economy.cjs');
const per = {
  daily: new Set(['d_login','d_play_3','d_kill_50']),
  weekly: new Set(['w_login_5','w_boss_3','w_spend_coins']),
  monthly: new Set(['m_login_30','m_clear_planet','m_pull_gacha']),
};
const attendanceMissionIds = new Set(['d_login','w_login_5','m_login_30']);
const canonical = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && utcDay(Date.parse(`${day}T00:00:00Z`)) === day;
const toMillis = value => Number.isSafeInteger(value) && value > 0 ? value :
  (value && typeof value.toMillis === 'function' ? value.toMillis() : null);
const owned = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const ownedArray = value => Array.isArray(value) ? value : [];
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function summarizeOperations(operations, now) {
  const summary = [], warnings = [];
  for (const op of operations || []) {
    if (!op || typeof op.command !== 'string') continue;
    const ms = toMillis(op.createdAt);
    if (!Number.isSafeInteger(ms) || ms > now || ms < 0) {
      warnings.push('OPERATION_TIMESTAMP_INVALID');
      continue;
    }
    const extra = owned(op.extra), login = owned(extra.attendance), deltas = owned(extra.missionDeltas);
    summary.push({
      id:String(op.id||'').slice(0,150), command:op.command, createdAt:ms,
      attendanceKind:login.kind||null, dayUTC:login.dayUTC||null,
      missionDeltas:Object.fromEntries(Object.entries(deltas).filter(([k,v]) =>
        typeof k === 'string' && Number.isSafeInteger(v) && v > 0 && v <= 10000000).sort(([a],[b])=>a.localeCompare(b))),
      missionKeys:{...owned(extra.missionKeys)},
      pullCount:Array.isArray(extra.pulls) ? extra.pulls.length : 0,
    });
  }
  summary.sort((a,b) => a.createdAt-b.createdAt || a.id.localeCompare(b.id));
  return {summary,warnings};
}
function planMissionHistoryReconcile(doc, operations, {now, config, incomplete=false}={}) {
  if (!doc || !Number.isSafeInteger(now) || !config?.MISSIONS_CONFIG) throw Error('Invalid profile, time, or mission catalog');
  const rawAttendance=owned(doc.attendance), rawMission=owned(doc.missions);
  const day=utcDay(now), week=utcWeek(now), month=utcMonth(now);
  const {summary,warnings} = summarizeOperations(operations,now);
  const fingerprint=sha({attendance:rawAttendance,missions:rawMission,operations:summary,day,week,month});
  const oldProgress=owned(rawMission.progress);
  const compact=(m)=>Object.fromEntries([...per.daily,...per.weekly,...per.monthly].map(k=>[k,Math.max(0,Number(m?.[k])||0)]));
  const report={
    periodKeys:{daily:day,weekly:week,monthly:month},
    auditedOperations:summary.length,
    verifiedNaturalDays:[],
    old:compact(oldProgress),next:null,
    legacyWarnings:[],
  };
  const finish=(status,reason,patch=null)=>({status,reason,fingerprint,patch,preview:report});
  if (incomplete) return finish('BLOCKED','Operation query exceeded audit safety limit; no partial reconciliation');
  const verified = new Set(ownedArray(rawAttendance.naturalClaimDaysUTC).filter(x => validDay(x) && x <= day));
  const evidenceCount=Object.fromEntries([...per.daily,...per.weekly,...per.monthly].map(k=>[k,0]));
  let naturalOps = 0, oldGachaOps = 0, unverifiableLegacyBattles = 0;
  for (const op of summary) {
    const opDay=utcDay(op.createdAt),opWeek=utcWeek(op.createdAt),opMonth=utcMonth(op.createdAt);
    if (op.command === 'attendance.claim') {
      // The command itself is server-authoritative evidence even for old
      // records where extra.attendance/dayUTC was not written yet.
      if (op.attendanceKind !== null && op.attendanceKind !== 'natural') continue;
      if (op.dayUTC != null && (!validDay(op.dayUTC) || op.dayUTC !== opDay)) {
        warnings.push('ATTENDANCE_AUDIT_DAY_CONFLICT'); continue;
      }
      verified.add(opDay); naturalOps++;
    }
    // Date-specific mission increments from the server-generated operation audit.
    const keys=op.missionKeys;
    for (const [missionId,delta] of Object.entries(op.missionDeltas)) {
      if (attendanceMissionIds.has(missionId)) continue; // distinct natural dates only
      const period=Object.keys(per).find(p=>per[p].has(missionId));
      if (!period) continue;
      const eventKey=period==='daily' ? opDay : period==='weekly' ? opWeek : opMonth;
      const currentKey=period==='daily' ? day : period==='weekly' ? week : month;
      if (eventKey===currentKey && keys[period]===currentKey) evidenceCount[missionId]+=delta;
    }
    if (op.command==='gacha.open' && !Object.hasOwn(op.missionDeltas,'m_pull_gacha') &&
      opMonth===month && op.pullCount>0 && op.pullCount<=10) {
      evidenceCount.m_pull_gacha += op.pullCount;oldGachaOps++;
    }
    if (op.command==='battle.finish' && !Object.keys(op.missionDeltas).length) unverifiableLegacyBattles++;
  }
  const knownDays=[...verified].sort();
  report.verifiedNaturalDays=knownDays.filter(d=>d.slice(0,7)===month);
  report.evidence={naturalOperations:naturalOps,legacyGachaOperations:oldGachaOps,
    legacyBattlesWithoutMissionAudit:unverifiableLegacyBattles};
  const attendance={...rawAttendance};
  const retained=[...new Set([...ownedArray(attendance.naturalClaimDaysUTC).filter(validDay),...knownDays])].sort();
  if (retained.length || Array.isArray(attendance.naturalClaimDaysUTC)) attendance.naturalClaimDaysUTC=retained;
  // This counter tracks completed *calendar slots*, not natural login streak.
  // For a stale week, keep the old slots for audit, but the UI shows 0 until reset.
  if (Array.isArray(attendance.claimedDays)) {
    const completed=new Set(attendance.claimedDays.filter(v=>Number.isInteger(v)&&v>=1&&v<=7)).size;
    attendance.weeklyCompletedDays=completed;
    attendance.weeklyStreak=completed; // read compatibility for legacy clients
  }
  const mission={...rawMission};
  const state={campaignData:{attendance,missionData:{...rawMission,progress:{...oldProgress},claimed:[...ownedArray(rawMission.claimed)]}}};
  updateMissions(state,now,config);
  const restored=state.campaignData.missionData;
  for (const [k,count] of Object.entries(evidenceCount)) {
    if (!count) continue;
    const spec=Object.values(config.MISSIONS_CONFIG).flat().find(x=>x.id===k);
    const goal=Number.isFinite(spec?.goal) ? spec.goal : 10000000;
    restored.progress[k]=Math.max(restored.progress[k]||0, Math.min(goal,count));
  }
  // Limit the verified login missions to their genuine calendar goals, not
  // completion slots; never lower a saved legacy counter automatically.
  const provenWeek=knownDays.filter(d=>d>=week && d<=day).length;
  const provenMonth=knownDays.filter(d=>d.slice(0,7)===month && d<=day).length;
  const floors={d_login:verified.has(day)?1:0,w_login_5:Math.min(5,provenWeek),
    m_login_30:Math.min(monthlyAttendanceGoalUTC(now),provenMonth)};
  for (const [k,value] of Object.entries(floors)) {
    restored.progress[k]=Math.max(restored.progress[k]||0,value);
    if ((rawMission[ k.startsWith('d_')?'dailyKey':k.startsWith('w_')?'weeklyKey':'monthlyKey' ] ===
      (k.startsWith('d_')?day:k.startsWith('w_')?week:month)) && (oldProgress[k]||0)>value) {
      report.legacyWarnings.push(`${k}: SAVED_PROGRESS_EXCEEDS_VERIFIED_DAYS - keep value, review manually`);
    }
  }
  if (unverifiableLegacyBattles>0) report.legacyWarnings.push(
    'Legacy battle.finish operations lack trustworthy mission deltas; preserve saved Campaign/Boss counters');
  report.legacyWarnings.push(...[...new Set(warnings)]);
  const evidenceHash=sha({verifiedNaturalDays:report.verifiedNaturalDays,
    missionEvidence:evidenceCount,periodKeys:report.periodKeys});
  const nextMission={...mission,...restored,
    reconcile213:{version:'2.1.3', evidenceHash}};
  report.next=compact(nextMission.progress);
  if (canonical(attendance,rawAttendance) && canonical(nextMission,rawMission))
    return finish('NO_CHANGES','Profile is already reconciled for currently available evidence');
  return finish('READY','Only current-period verifiable evidence is added; old rewards, wallet and unknown fields stay intact',
    {attendance,missions:nextMission});
}
module.exports={planMissionHistoryReconcile};
