'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {planMissionHistoryReconcile}=require('../lib/missionHistoryReconcile.cjs');
const {executeCommand,updateMissions}=require('../lib/economy.cjs');
let config,schema;
const now=Date.parse('2026-10-17T09:00:00Z');
test.before(async()=>{
 config=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
 schema=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/utils/profileSchema.js')).href);
});
const event=(command,day,extra={},id)=>({id:id||`${command}:${day}:test`,command,
 createdAt:Date.parse(day),extra});
function oldDoc(){
 const base=schema.createProfileDocument({coins:777,diamonds:98,energy:54,vipPoints:3,
  campaignData:schema.createDefaultCampaignData()}, {displayName:'Old Test',photoURL:''},now);
 base.attendance={weekKey:'2026-10-12',lastDate:'Sat Oct 17 2026',lastClaimUTC:'2026-10-17',
   naturalClaimDaysUTC:['2026-10-16'],claimedDays:[1,2,5,6],streak:2,makeupCount:2,weeklyStreak:4};
 base.missions={claimed:['d_login'],dailyKey:'2026-10-17',weeklyKey:'2026-10-12',monthlyKey:'2026-10',
  progress:{d_login:1,w_login_5:1,m_login_30:1,d_play_3:2,m_clear_planet:2,m_pull_gacha:0}};
 base.profile.foo='preserve';base.otherFutureField={a:42};
 return base;
}
test('screenshot account: existing Oct16 manual day + Oct17 operation fixes floor, ignores two Ghosts',()=>{
 const d=oldDoc(), original=structuredClone(d);
 const ops=[
  event('attendance.makeup','2026-10-16T04:04:19Z',{},'paidA'),
  event('attendance.makeup','2026-10-16T04:51:14Z',{},'paidB'),
  event('attendance.claim','2026-10-17T02:20:17Z',{attendance:{kind:'natural',dayUTC:'2026-10-17'}},'natural'),
 ];
 const r=planMissionHistoryReconcile(d,ops,{now,config});
 assert.equal(r.status,'READY');
 assert.equal(r.patch.missions.progress.d_login,1);
 assert.equal(r.patch.missions.progress.w_login_5,2);
 assert.equal(r.patch.missions.progress.m_login_30,2);
 assert.equal(r.patch.missions.progress.d_play_3,2,'retains previously recorded Campaign count');
 assert.equal(r.patch.attendance.weeklyCompletedDays,4);
 assert.equal(r.patch.attendance.weeklyStreak,4);
 assert.deepEqual(r.patch.attendance.naturalClaimDaysUTC,['2026-10-16','2026-10-17']);
 assert.deepEqual(r.patch.attendance.claimedDays,[1,2,5,6]);
 assert.deepEqual(r.patch.missions.claimed,['d_login']);
 assert.deepEqual(d,original,'planner is strictly read-only');
 assert.equal(d.wallet.coins,777);
 const next={...d,...r.patch};
 const r2=planMissionHistoryReconcile(next,ops,{now,config});
 assert.equal(r2.status,'NO_CHANGES','same evidence cannot create another migration');
});
test('legacy natural attendance.claim without extra proves UTC date, old gacha extra.pulls proves count',()=>{
 const d=oldDoc();
 d.attendance.naturalClaimDaysUTC=[];
 d.missions.progress.m_login_30=0;d.missions.progress.w_login_5=0;d.missions.progress.m_pull_gacha=0;
 const ops=[event('attendance.claim','2026-10-16T10:00:00Z',{},'natural1'),
  event('attendance.claim','2026-10-17T09:00:00Z',{},'natural2'),
  event('attendance.claim','2026-10-17T09:00:00Z',{},'replayed-idempotent'),
  event('gacha.open','2026-10-17T08:00:00Z',{pulls:[{baseId:'a'},{baseId:'b'}]},'gacha')];
 const r=planMissionHistoryReconcile(d,ops,{now,config});
 assert.equal(r.status,'READY');
 assert.equal(r.patch.missions.progress.w_login_5,2,'distinct UTC days only');
 assert.equal(r.patch.missions.progress.m_login_30,2);
 assert.equal(r.patch.missions.progress.m_pull_gacha,2);
});
test('server authoritative missionDelta from finish persists and is used after lost snapshot',()=>{
 const d=oldDoc();
 const game=schema.restoreProfileDocument(d).campaignData;
 const done=executeCommand({...d,campaignData:game},'gacha.open',{crateId:config.CRATE_CONFIGS[0].id,amount:1},
  {now,rng:max=>0,uuid:()=> 'unique_uuid',config});
 // The gacha may require diamonds: run stand-alone verified mission count instead.
 assert.ok(done.extra.missionDeltas.m_pull_gacha >= 1);
 assert.equal(done.extra.missionKeys.monthly,'2026-10');
 const db={...d,missions:{...d.missions,progress:{...d.missions.progress,m_pull_gacha:0}}};
 const op=event('gacha.open','2026-10-17T09:00:00Z',done.extra,'gacha1');
 const r=planMissionHistoryReconcile(db,[op],{now,config});
 assert.equal(r.patch.missions.progress.m_pull_gacha,1);
});
test('old battle.finish is not blindly interpreted as verified Campaign/Boss result',()=>{
 const d=oldDoc();
 d.missions.progress.d_play_3=0;d.missions.progress.m_clear_planet=0;
 const ops=[event('battle.finish','2026-10-17T02:00:00Z',{earnedRewards:[{type:'coins',amount:10}]})];
 const r=planMissionHistoryReconcile(d,ops,{now,config});
 assert.equal(r.patch.missions.progress.d_play_3,0);
 assert.equal(r.patch.missions.progress.m_clear_planet,0);
 assert.ok(r.preview.legacyWarnings.some(x=>x.includes('Legacy battle.finish')));
});
test('legacy expired mission period is archived, not carried into current periods/reward',()=>{
 const d=oldDoc();
 d.missions={claimed:['d_login','w_login_5','m_login_30'],dailyKey:'2026-10-16',
 weeklyKey:'2026-10-05',monthlyKey:'2026-09',progress:{d_login:1,w_login_5:5,m_login_30:30,m_clear_planet:3}};
 const r=planMissionHistoryReconcile(d,[],{now,config});
 assert.equal(r.status,'READY');
 assert.equal(r.patch.missions.progress.d_login,0);
 assert.equal(r.patch.missions.progress.w_login_5,1);
 assert.equal(r.patch.missions.progress.m_login_30,1);
 assert.ok(!r.patch.missions.claimed.includes('d_login'));
 assert.deepEqual(r.patch.missions.periodHistory.daily['2026-10-16'].claimed,['d_login']);
 assert.deepEqual(r.patch.missions.periodHistory.monthly['2026-09'].claimed,['m_login_30']);
 assert.equal(r.patch.missions.periodHistory.weekly['2026-10-05'].progress.w_login_5,5);
});
test('anti-data-corruption: Ghosts never count natural; bad timestamps ignored; incomplete audit blocks',()=>{
 const d=oldDoc();d.attendance.naturalClaimDaysUTC=[];
 const ops=[event('attendance.makeup','2026-10-17T03:00:00Z',{attendance:{kind:'makeup',dayUTC:'2026-10-17'}}),
  event('attendance.claim','2026-10-17T03:00:00Z',{attendance:{kind:'natural',dayUTC:'2026-10-16'}}),
  {id:'bad',command:'attendance.claim',createdAt:'not-ms'}];
 const r=planMissionHistoryReconcile(d,ops,{now,config});
 assert.deepEqual(r.patch.attendance.naturalClaimDaysUTC,[]);
 assert.ok(r.preview.legacyWarnings.includes('ATTENDANCE_AUDIT_DAY_CONFLICT'));
 assert.equal(planMissionHistoryReconcile(d,ops,{now,config,incomplete:true}).status,'BLOCKED');
});
test('week completion display and canonical field are independent of natural login mission',()=>{
 const d=oldDoc();
 const r=planMissionHistoryReconcile(d,[],{now,config});
 assert.equal(r.patch.attendance.weeklyCompletedDays,4);
 assert.equal(r.patch.missions.progress.w_login_5,1);
 assert.equal(r.patch.attendance.makeupCount,2);
});
test('read-only Cloud session/profile presentation restores verified same-period progress but never changes Firestore doc',async()=>{
 const {createGameService}=require('../lib/gameService.cjs');
 const d=oldDoc();
 d.missions.progress.d_login=0;d.missions.progress.w_login_5=0;d.missions.progress.m_login_30=0;
 d.attendance.naturalClaimDaysUTC=['2026-10-16','2026-10-17'];
 const old=structuredClone(d);
 const service=await createGameService({db:{},now:()=>now,configModule:config,schemaModule:schema});
 const shown=service.present(d);
 assert.equal(shown.campaignData.missionData.progress.d_login,1);
 assert.equal(shown.campaignData.missionData.progress.w_login_5,2);
 assert.equal(shown.campaignData.missionData.progress.m_login_30,2);
 assert.deepEqual(d,old,'getProfile must be truly read only');
});

test('February 28/29 and 31-day months use UTC attendance goal ceiling 30',()=>{
 for(const [year,days] of [[2025,28],[2024,29]]){
  const time=Date.UTC(year,1,days,12);
  const d=oldDoc();
  d.attendance.naturalClaimDaysUTC=Array.from({length:days},(_,i)=>`${year}-02-${String(i+1).padStart(2,'0')}`);
  d.missions={progress:{},claimed:[],dailyKey:`${year}-02-${days}`,weeklyKey:
   new Date(time).toISOString().slice(0,10),monthlyKey:`${year}-02`};
  const r=planMissionHistoryReconcile(d,[],{now:time,config});
  assert.equal(r.patch.missions.progress.m_login_30,days);
 }
 const time=Date.UTC(2026,9,31,12),d=oldDoc();
 d.attendance.naturalClaimDaysUTC=Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
 const r=planMissionHistoryReconcile(d,[],{now:time,config});
 assert.equal(r.patch.missions.progress.m_login_30,30);
});

test('a keyless legacy mission snapshot is preserved for audit rather than falsely credited today',()=>{
 const d=oldDoc();
 d.missions={claimed:['d_play_3'],progress:{d_play_3:2,w_login_5:4,m_login_30:5}};
 const r=planMissionHistoryReconcile(d,[],{now,config});
 assert.equal(r.status,'READY');
 assert.equal(r.patch.missions.progress.d_play_3,0);
 assert.equal(r.patch.missions.progress.w_login_5,1);
 assert.equal(r.patch.missions.legacyUnkeyed.daily.progress.d_play_3,2);
 assert.equal(r.patch.missions.legacyUnkeyed.weekly.progress.w_login_5,4);
 assert.equal(r.patch.missions.legacyUnkeyed.monthly.progress.m_login_30,5);
});
