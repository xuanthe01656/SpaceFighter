'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {planLegacyAttendanceRepair}=require('../lib/legacyAttendanceRepair.cjs');
const {executeCommand,updateMissions}=require('../lib/economy.cjs');
let config,schema;
const at=iso=>Date.parse(iso);
const testNow=at('2026-10-17T00:55:00Z');
test.before(async()=>{
  config=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
  schema=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href);
});
function fixture(){
  const doc=schema.createProfileDocument({coins:340,diamonds:80,energy:41,vipPoints:3,
    campaignData:schema.createDefaultCampaignData()}, {displayName:'Test Account',photoURL:''},testNow);
  doc.attendance={claimedDays:[1,2,5],lastDate:'Fri Oct 16 2026',makeupCount:2,streak:1,
    weekKey:'2026-10-12',weeklyStreak:3};
  doc.missions={claimed:[],dailyKey:'2026-10-16',weeklyKey:'2026-10-12',monthlyKey:'2026-10',
    lastWeeklyLoginDate:'Fri Oct 16 2026',lastDailyReset:1792083600000,
    lastMonthlyReset:1790787600000,lastWeeklyReset:1791738000000,
    progress:{d_login:0,w_login_5:2,m_login_30:0,d_play_3:2}};
  doc.security={battleDay:'2026-10-16',battleStarts:3};
  doc.customLegacyField={keep:'yes'};
  return doc;
}
const request={dayUTC:'2026-10-16',expectedMakeups:2,now:testNow};
test('Dry-run identifies exact October 16 legacy case, no original mutation or wallet damage',()=>{
 const d=fixture(),copy=structuredClone(d);
 const result=planLegacyAttendanceRepair(d,request);
 assert.equal(result.status,'READY');
 assert.equal(result.preview.old.weekly,2);
 assert.equal(result.preview.next.weekly,1);
 assert.equal(result.preview.next.monthly,1);
 assert.equal(result.preview.next.daily,0,'previous UTC daily period must not grant Oct 17 daily credit');
 assert.equal(result.patch.attendance.lastClaimUTC,'2026-10-16');
 assert.deepEqual(result.patch.attendance.naturalClaimDaysUTC,['2026-10-16']);
 assert.deepEqual(result.patch.attendance.claimedDays,[1,2,5]);
 assert.equal(result.patch.attendance.makeupCount,2);
 assert.deepEqual(d,copy,'dry-run never changes Firestore document');
 assert.equal(result.patch.missions.progress.d_play_3,2);
 assert.equal(d.wallet.coins,340);
 assert.deepEqual(d.customLegacyField,{keep:'yes'});
 assert.match(result.fingerprint,/^[a-f0-9]{64}$/);
});
test('Repair is one-shot and blocks wrong date, changed progress or existing mission reward',()=>{
 const d=fixture();
 const ready=planLegacyAttendanceRepair(d,request);
 assert.equal(planLegacyAttendanceRepair({...d,...ready.patch},request).status,'ALREADY_REVIEWED');
 assert.equal(planLegacyAttendanceRepair(d,{...request,dayUTC:'2026-10-15'}).status,'BLOCKED');
 assert.equal(planLegacyAttendanceRepair({...d,missions:{...d.missions,progress:{...d.missions.progress,m_login_30:4}}},request).status,'BLOCKED');
 assert.equal(planLegacyAttendanceRepair({...d,missions:{...d.missions,claimed:['w_login_5']}},request).status,'BLOCKED');
 assert.equal(planLegacyAttendanceRepair({...d,attendance:{...d.attendance,naturalClaimDaysUTC:['2026-10-16']}},request).status,'BLOCKED');
 assert.equal(planLegacyAttendanceRepair(d,{...request,now:at('2026-10-19T12:00:00Z')}).status,'BLOCKED',
  'must not mutate an expired week silently');
});
test('Next Cloud natural check-in counts after 1 repaired day; Ghost cannot count again',()=>{
 const d=fixture(),plan=planLegacyAttendanceRepair(d,request);
 assert.equal(plan.status,'READY');
 const repaired={...d,...plan.patch};
 const cam=schema.restoreProfileDocument(repaired).campaignData;
 const now=at('2026-10-17T13:00:00Z');
 const result=executeCommand({...repaired,campaignData:cam},'attendance.claim',{}, {now,config});
 assert.equal(result.document.missions.progress.d_login,1);
 assert.equal(result.document.missions.progress.w_login_5,2);
 assert.equal(result.document.missions.progress.m_login_30,2);
 assert.deepEqual(result.document.attendance.naturalClaimDaysUTC,['2026-10-16','2026-10-17']);
 assert.deepEqual(result.extra.attendance,{kind:'natural',dayUTC:'2026-10-17'});
 assert.equal(result.document.wallet.coins,350);
 const next=executeCommand({...result.document,campaignData:schema.restoreProfileDocument(result.document).campaignData},
  'mission.claim',{missionId:'d_login'}, {now,config});
 assert.ok(next.document.missions.claimed.includes('d_login'));
 assert.equal(next.document.missions.progress.w_login_5,2);
});
test('Server ledger restores a mission counter that was reset during valid same-period migration',()=>{
 const d=fixture(),p=planLegacyAttendanceRepair(d,request);
 const c=schema.restoreProfileDocument({...d,...p.patch}).campaignData;
 c.missionData={claimed:[],progress:{d_login:0,w_login_5:0,m_login_30:0},
   dailyKey:'2026-10-17',weeklyKey:'2026-10-12',monthlyKey:'2026-10'};
 const m=updateMissions({campaignData:c},testNow,config);
 assert.equal(m.progress.d_login,0);
 assert.equal(m.progress.w_login_5,1);
 assert.equal(m.progress.m_login_30,1);
});
test('Past legacy date alone does NOT automatically invent UTC natural mission progress',()=>{
 const d=fixture();
 const c=schema.restoreProfileDocument(d).campaignData;
 const m=updateMissions({campaignData:c},testNow,config);
 assert.equal(m.progress.m_login_30,0);
 assert.equal(m.progress.w_login_5,2,'ordinary gameplay does not silently erase stored legacy counters');
});
