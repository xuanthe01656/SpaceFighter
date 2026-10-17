'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {executeCommand,GameError,utcWeek}=require('../lib/economy.cjs');
const {createGameService}=require('../lib/gameService.cjs');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const profilePath=path.resolve(__dirname,'../../client/src/utils/profileSchema.js');
const configPath=path.resolve(__dirname,'../../client/src/constants.js');
let schema,config;
const fixedTime=Date.parse('2026-10-12T12:00:00Z'); // Monday
const rng=()=>0;
const uuid=()=>crypto.randomUUID();
test.before(async()=>{schema=await import(pathToFileURL(profilePath).href);config=await import(pathToFileURL(configPath).href);});
function starter() {
 const s={coins:2000,diamonds:250,energy:50,vipPoints:0,campaignData:schema.createDefaultCampaignData()};
 const doc=schema.createProfileDocument(s,{displayName:'Tester',photoURL:''},fixedTime);
 return {...doc,campaignData:s.campaignData};
}
function perform(doc,command,payload={},extra={}) {
 return executeCommand(doc,command,payload,{now:fixedTime,config,rng,uuid,...extra});
}
function raises(code, fn) {assert.throws(fn,e=>e instanceof GameError && e.code===code);}

test('Gacha charges on server, rolls from authoritative catalogs, cannot overdraft',()=>{
 const doc=starter();
 const a=perform(doc,'gacha.open',{crateId:'basic',amount:2});
 assert.equal(a.document.wallet.coins,1800);
 assert.equal(a.extra.pulls.length,2);
 assert.equal(Object.keys(a.document.inventory.items).length,3);
 assert.equal(doc.wallet.coins,2000);
 raises('INSUFFICIENT_FUNDS',()=>perform(doc,'gacha.open',{crateId:'epic',amount:6}));
 raises('INVALID_INPUT',()=>perform(doc,'gacha.open',{crateId:'basic',amount:100}));
});

test('Client supplied balances and rewards are ignored/rejected',()=>{
 const doc=starter();
 raises('INVALID_INPUT',()=>perform(doc,'profile.preferences',{coins:999999999,diamonds:888888,inventory:{items:{fake:{}}}}));
 const a=perform(doc,'profile.preferences',{});
 assert.equal(a.document.wallet.coins,2000);
 assert.equal(a.document.wallet.diamonds,250);
 assert.ok(!a.document.inventory.items.fake);
 raises('UNKNOWN_COMMAND',()=>perform(doc,'wallet.grant',{amount:1000000}));
});

test('Attendance cannot be claimed twice or made up for future day',()=>{
 const doc=starter();
 const a=perform(doc,'attendance.claim');
 assert.equal(a.document.wallet.coins,2010);
 assert.deepEqual(a.document.attendance.claimedDays,[1]);
 raises('ALREADY_CLAIMED',()=>perform({...a.document,campaignData:schema.restoreProfileDocument(a.document).campaignData},'attendance.claim'));
 raises('INVALID_INPUT',()=>perform(doc,'attendance.makeup',{day:7}));
});

test('Mission grants only after server progress, not arbitrary client claim',()=>{
 const doc=starter();
 raises('NOT_READY',()=>perform(doc,'mission.claim',{missionId:'d_play_3'}));
 raises('INVALID_INPUT',()=>perform(doc,'mission.claim',{missionId:'unknown'}));
});

test('Battle ticket consumes energy, requires elapsed time and rejects forgeries',()=>{
 const doc=starter();
 const start=perform(doc,'battle.start',{mode:'dungeon',dungeonId:'dung_taurus'});
 assert.equal(start.document.wallet.energy,40);
 const withData={...start.document,campaignData:schema.restoreProfileDocument(start.document).campaignData};
 raises('BATTLE_NOT_FOUND',()=>perform(withData,'battle.finish',{ticketId:'bad',victory:true}));
 raises('BATTLE_TIMING',()=>perform(withData,'battle.finish',{ticketId:start.extra.ticket.id,victory:true}));
 const victory=perform(withData,'battle.finish',{ticketId:start.extra.ticket.id,victory:true},{now:fixedTime+9000});
 assert.equal(victory.document.wallet.energy,40);
 assert.ok(victory.document.wallet.coins>2000);
 assert.equal(victory.document.activeBattle,null);
});

test('Inventory upgrade validates blueprint/coins and ownership',()=>{
 const doc=starter();
 raises('INSUFFICIENT_FUNDS',()=>perform(doc,'inventory.upgrade',{kind:'gear',itemId:'item_start_gun'}));
 raises('ITEM_NOT_OWNED',()=>perform(doc,'inventory.upgrade',{kind:'gear',itemId:'fake'}));
});

test('Events expire by server clock, not client timestamp',()=>{
 const doc=starter();
 raises('EVENT_ENDED',()=>perform(doc,'event.claim',{eventId:'event_kill_rush_01',index:0}));
});

test('Monday UTC key stable within week',()=>{
 assert.equal(utcWeek(Date.parse('2026-10-12T00:00:00Z')),'2026-10-12');
 assert.equal(utcWeek(Date.parse('2026-10-18T23:59:59Z')),'2026-10-12');
 assert.equal(utcWeek(Date.parse('2026-10-19T00:00:00Z')),'2026-10-19');
});

// Fully serializable fake transactions: exercises service command idempotency,
// UID session boundary and concurrent duplicate requests without external DB.
class FakeDb {
 constructor(){this.store=new Map();this.tail=Promise.resolve();}
 collection(name){return new Ref(this,name);}
 async runTransaction(func){
  const task=async()=>{
   const queued=[];
   const tx={get:async ref=>{const value=this.store.get(ref.path);return {exists:!!value,data:()=>structuredClone(value)};},
     set:(ref,value)=>queued.push(['set',ref.path,structuredClone(value)]),
     create:(ref,value)=>queued.push(['create',ref.path,structuredClone(value)])};
   const result=await func(tx);
   for(const [op,key,value] of queued){if(op==='create'&&this.store.has(key))throw Error('already exists');this.store.set(key,value);}
   return result;
  };
  const p=this.tail.then(task,task);this.tail=p.catch(()=>{});return p;
 }
}
class Ref {
 constructor(db,path){this.db=db;this.path=path;}
 doc(id){return new Ref(this.db,`${this.path}/${id}`);}
 collection(name){return new Ref(this.db,`${this.path}/${name}`);}
 async get(){const value=this.db.store.get(this.path);return {exists:!!value,data:()=>structuredClone(value)};}
}
test('Production service loads ESM catalog and profile without dependency injection',async()=>{
 const db=new FakeDb();
 const service=await createGameService({db,now:()=>fixedTime});
 const session=await service.openSession({uid:'esm_bootstrap_test',name:'Tester'});
 assert.equal(session.state.energy,50);
 assert.ok(session.sessionId);
});

test('Concurrent retries with same requestId apply only once (durable ledger)',async()=>{
 const db=new FakeDb(), service=await createGameService({db,now:()=>fixedTime,configModule:config,schemaModule:schema,rng,uuidFactory:uuid});
 const session=await service.openSession({uid:'u123',name:'Tester'});
 const doc=db.store.get('users/u123');doc.wallet.coins=2000;db.store.set('users/u123',doc);
 const payload={command:'gacha.open',payload:{crateId:'basic',amount:2},requestId:'test_request_100001'};
 const [a,b]=await Promise.all([service.apply('u123',session.sessionId,payload),service.apply('u123',session.sessionId,payload)]);
 assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);
 assert.equal(b.state.coins,1800);
 assert.equal(db.store.size,2);
 await assert.rejects(()=>service.apply('u123',session.sessionId,{...payload,payload:{crateId:'basic',amount:3}}), e=>e.code==='REQUEST_REUSED');
});
test('Session replacement prevents stale token replay',async()=>{
 const db=new FakeDb(), service=await createGameService({db,now:()=>fixedTime,configModule:config,schemaModule:schema});
 const first=await service.openSession({uid:'u001',name:'Tester'});
 const second=await service.openSession({uid:'u001',name:'Tester'});
 assert.notEqual(first.sessionId,second.sessionId);
 await assert.rejects(()=>service.getProfile('u001',first.sessionId),e=>e.code==='SESSION_EXPIRED');
 assert.equal((await service.getProfile('u001',second.sessionId)).state.energy,50);
});

test('Rules deny every client-side write under users and hide other players',()=>{
 const txt=fs.readFileSync(path.resolve(__dirname,'../../security/firestore.rules'),'utf8');
 assert.match(txt,/allow\s+get:\s*if\s+request\.auth\s*!=\s*null\s*&&\s*request\.auth\.uid\s*==\s*uid/);
 assert.match(txt,/allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false/);
 assert.match(txt,/allow\s+read,\s*write:\s*if\s+false/);
});

test('Server limits gacha frequency without trusting a client-provided balance',()=>{
 const d=starter();
 d.security={gachaDay:'2026-10-12',gachaCount:100};
 raises('RATE_LIMIT',()=>perform(d,'gacha.open',{crateId:'basic',amount:1}));
 d.security.gachaCount=99;
 raises('RATE_LIMIT',()=>perform(d,'gacha.open',{crateId:'basic',amount:2}));
});

test('Only one active battle ticket is accepted, with daily caps',()=>{
 const d=starter();
 const first=perform(d,'battle.start',{mode:'campaign',planetId:1,stage:1});
 assert.ok(first.extra.ticket.id);
 const active={...first.document,campaignData:schema.restoreProfileDocument(first.document).campaignData};
 raises('BATTLE_ACTIVE',()=>perform(active,'battle.start',{mode:'campaign',planetId:1,stage:1},{now:fixedTime+6000}));
 d.security={battleDay:'2026-10-12',battleStarts:100,lastBattleStartAt:fixedTime-10000};
 raises('RATE_LIMIT',()=>perform(d,'battle.start',{mode:'campaign',planetId:1,stage:1}));
});

test('Battle report cannot inject coins, diamonds, stars or arbitrary mission kills',()=>{
 const d=starter();
 const start=perform(d,'battle.start',{mode:'campaign',planetId:1,stage:1});
 const active={...start.document,campaignData:schema.restoreProfileDocument(start.document).campaignData};
 raises('INVALID_INPUT',()=>perform(active,'battle.finish',{ticketId:start.extra.ticket.id,victory:true,stars:99,kills:999999},{now:fixedTime+9000}));
 const settled=perform(active,'battle.finish',{ticketId:start.extra.ticket.id,victory:true,stars:3,kills:999999,coins:1e9,diamonds:1e9},{now:fixedTime+9000});
 assert.ok(settled.document.wallet.coins<1000000);
 assert.equal(settled.document.wallet.diamonds,250);
 assert.equal(settled.document.missions.progress.d_kill_50||0,0);
 assert.equal(settled.document.progress.planets[1].highestStage,2);
});

test('Existing legacy profile data survives a server command',async()=>{
 const d=starter();
 d.eventData={legacy:{kills:13}};
 d.dungeonHistory={dung_taurus:{lastResult:'victory'}};
 d.materials={...d.materials,crates:{basic:3}};
 const db=new FakeDb();
 const srv=await createGameService({db,now:()=>fixedTime,configModule:config,schemaModule:schema,rng,uuidFactory:uuid});
 db.store.set('users/legacy',{...d,campaignData:undefined});
 const ses=await srv.openSession({uid:'legacy',name:'Legacy'});
 const result=await srv.apply('legacy',ses.sessionId,{command:'gacha.open',payload:{crateId:'basic',amount:1},requestId:'legacy_test_0000001'});
 assert.equal(result.state.campaignData.materials.crates.basic,2);
 assert.equal(result.state.campaignData.eventData.legacy.kills,13);
 assert.equal(result.state.campaignData.dungeonHistory.dung_taurus.lastResult,'victory');
});

test('Account owner boundaries are enforced on reads and writes',async()=>{
 const db=new FakeDb(),srv=await createGameService({db,now:()=>fixedTime,configModule:config,schemaModule:schema});
 const u=await srv.openSession({uid:'real_owner',name:'Owner'});
 await assert.rejects(()=>srv.getProfile('imposter',u.sessionId),e=>e.code==='PROFILE_NOT_FOUND');
 await assert.rejects(()=>srv.apply('real_owner','not_the_session',{command:'profile.preferences',payload:{},requestId:'wrong_session_000001'}),e=>e.code==='SESSION_EXPIRED');
});

test('Legacy attendance date preserves daily streak when moving to UTC server',()=>{
 const d=starter();d.attendance={streak:11,lastDate:'Sun Oct 11 2026',claimedDays:[]};
 d.campaignData.attendance=d.attendance;
 const settled=perform(d,'attendance.claim');
 assert.equal(settled.document.attendance.streak,12);
 assert.equal(settled.document.attendance.lastClaimUTC,'2026-10-12');
});

// Regression: JS Date.parse('Sun Oct 11 2026') is host-local, not UTC.
// Verify the real command path under both eastern and western host timezones.
test('Legacy attendance migration preserves streak across host timezones',()=>{
 const doc=starter();
 doc.attendance={streak:11,lastDate:'Sun Oct 11 2026',claimedDays:[]};
 doc.campaignData.attendance=doc.attendance;
 const base64=Buffer.from(JSON.stringify(doc)).toString('base64');
 const program=`const {executeCommand}=require('./lib/economy.cjs');
 const {pathToFileURL}=require('node:url');
 (async()=>{
   const config=await import(pathToFileURL(process.argv[1]).href);
   const doc=JSON.parse(Buffer.from(process.argv[2],'base64').toString('utf8'));
   const result=executeCommand(doc,'attendance.claim',{},
     {now:Date.parse('2026-10-12T12:00:00Z'),config});
   process.stdout.write(JSON.stringify({streak:result.document.attendance.streak,
     lastClaimUTC:result.document.attendance.lastClaimUTC}));
 })().catch(e=>{console.error(e);process.exitCode=1;});`;
 for(const timezone of ['UTC','Asia/Ho_Chi_Minh','Pacific/Kiritimati','America/Los_Angeles']){
   const output=execFileSync(process.execPath,['-e',program,configPath,base64],{
     cwd:path.resolve(__dirname,'..'),env:{...process.env,TZ:timezone},encoding:'utf8'
   });
   assert.deepEqual(JSON.parse(output),{streak:12,lastClaimUTC:'2026-10-12'},`TZ=${timezone}`);
 }
});

test('Legacy attendance rejects malformed calendar dates rather than normalizing them',()=>{
 for(const lastDate of ['Sun Oct 32 2026','Sun Feb 29 2026','Sun Oct 12 2026','not a date']){
   const doc=starter();
   doc.attendance={streak:11,lastDate,claimedDays:[]};
   doc.campaignData.attendance=doc.attendance;
   assert.equal(perform(doc,'attendance.claim').document.attendance.streak,1,lastDate);
 }
});

// Graphics 2.1.1 + Mission Sync Hotfix regressions.
test('Monthly attendance goal uses UTC Feb=28/29, 30 day cap for October/December',()=>{
 const {monthlyAttendanceGoalUTC}=require('../lib/economy.cjs');
 for(const [date,goal] of [
  ['2027-02-28T23:59:59Z',28],['2028-02-29T23:59:59Z',29],
  ['2026-10-31T23:59:59Z',30],['2026-12-31T23:59:59Z',30],
 ]) assert.equal(monthlyAttendanceGoalUTC(Date.parse(date)),goal,date);
});

test('Cloud mission.claim accepts February 28/29 after valid natural claims only',()=>{
 for(const [year,day] of [[2027,28],[2028,29]]) {
  const now=Date.UTC(year,1,day,12);
  const d=starter();
  d.campaignData.missionData={claimed:[],progress:{m_login_30:day},monthlyKey:`${year}-02`};
  const done=perform(d,'mission.claim',{missionId:'m_login_30'},{now});
  assert.equal(done.document.wallet.diamonds,750);
  assert.ok(done.document.missions.claimed.includes('m_login_30'));
  d.campaignData.missionData.progress.m_login_30=day-1;
  raises('NOT_READY',()=>perform(d,'mission.claim',{missionId:'m_login_30'},{now}));
 }
 for(const [year,month,day] of [[2026,9,30],[2026,11,30]]){
  const now=Date.UTC(year,month,day,12);
  const d=starter();
  d.campaignData.missionData={claimed:[],progress:{m_login_30:30},monthlyKey:`${year}-${String(month+1).padStart(2,'0')}`};
  assert.ok(perform(d,'mission.claim',{missionId:'m_login_30'},{now}).document.missions.claimed.includes('m_login_30'));
 }
});

test('Cloud Ghost makeups never inflate natural streak or day/week/month missions',()=>{
 const now=Date.parse('2026-10-15T12:00:00Z'); // Thu, day 4
 const first=perform(starter(),'attendance.claim',{}, {now});
 const saved=first.document;
 const initial={...saved.missions.progress};
 assert.equal(initial.d_login,1);
 assert.equal(initial.w_login_5,1);
 assert.equal(initial.m_login_30,1);
 let d={...saved,campaignData:schema.restoreProfileDocument(saved).campaignData};
 const prevStreak=d.attendance.streak;
 const prevLast=d.attendance.lastClaimUTC;
 for(const [day,cost] of [[1,50],[2,150]]) {
   const next=perform(d,'attendance.makeup',{day},{now});
   assert.equal(next.document.wallet.diamonds,d.wallet.diamonds-cost);
   assert.equal(next.document.attendance.streak,prevStreak);
   assert.equal(next.document.attendance.lastClaimUTC,prevLast);
   assert.deepEqual(next.document.missions.progress,initial);
   d={...next.document,campaignData:schema.restoreProfileDocument(next.document).campaignData};
 }
 assert.deepEqual(d.attendance.claimedDays,[1,2,4]);
 assert.equal(d.attendance.weeklyStreak,3);
 raises('RATE_LIMIT',()=>perform(d,'attendance.makeup',{day:3},{now}));
 raises('ALREADY_CLAIMED',()=>perform(d,'attendance.claim',{},{now}));
 raises('NOT_READY',()=>perform(d,'mission.claim',{missionId:'w_login_5'},{now}));
});

test('Cloud natural check-ins complete February in UTC; never count Ghost toward monthly total',()=>{
 for(const [year,length] of [[2027,28],[2028,29]]) {
  let d=starter();
  for(let day=1;day<=length;day++) {
   const now=Date.UTC(year,1,day,12);
   const done=perform(d,'attendance.claim',{},{now});
   assert.equal(done.document.missions.progress.m_login_30,day,`day ${day}`);
   d={...done.document,campaignData:schema.restoreProfileDocument(done.document).campaignData};
  }
  assert.equal(d.attendance.lastClaimUTC,`${year}-02-${length}`);
  const now=Date.UTC(year,1,length,12);
  const reward=perform(d,'mission.claim',{missionId:'m_login_30'},{now});
  assert.equal(reward.document.wallet.diamonds,750);
 }
});

test('Cloud 31st UTC day caps monthly progress at 30, while sequential streak continues',()=>{
 let d=starter();
 for(let day=1;day<=31;day++) {
  const now=Date.UTC(2026,9,day,12);
  const done=perform(d,'attendance.claim',{},{now});
  assert.equal(done.document.missions.progress.m_login_30,Math.min(30,day));
  assert.equal(done.document.attendance.streak,day);
  d={...done.document,campaignData:schema.restoreProfileDocument(done.document).campaignData};
 }
 const next=perform(d,'attendance.claim',{},{now:Date.UTC(2026,10,1,12)});
 assert.equal(next.document.attendance.streak,32);
 assert.equal(next.document.missions.progress.m_login_30,1,'new monthly progress starts at 1');
});

test('Cloud missing-weekKey migration retains this-week legacy days but no past-week slots',()=>{
 const d=starter();
 d.campaignData.attendance={streak:4,lastDate:'Wed Oct 14 2026',claimedDays:[1,2,3],weeklyStreak:3,makeupCount:1};
 const a=perform(d,'attendance.makeup',{day:4},{now:Date.parse('2026-10-16T12:00:00Z')});
 assert.deepEqual(a.document.attendance.claimedDays,[1,2,3,4]);
 assert.equal(a.document.attendance.streak,4);
 assert.equal(a.document.attendance.makeupCount,2);
 const old=starter();
 old.campaignData.attendance={streak:4,lastDate:'Sun Oct 11 2026',claimedDays:[1,2,3],weeklyStreak:3,makeupCount:1};
 const reset=perform(old,'attendance.claim',{},{now:Date.parse('2026-10-19T12:00:00Z')});
 assert.deepEqual(reset.document.attendance.claimedDays,[1]);
 assert.equal(reset.document.attendance.makeupCount,0);
});

test('Cloud natural attendance resists duplicate same UTC date when legacy claimedDays is missing',()=>{
 const d=starter();
 d.campaignData.attendance={lastClaimUTC:'2026-10-12',lastDate:'Mon Oct 12 2026',streak:12,claimedDays:[],weekKey:'2026-10-12'};
 raises('ALREADY_CLAIMED',()=>perform(d,'attendance.claim'));
});

// Graphics 2.1.6.2: Cloud makeup eligibility is enforced on server, not UI.
test('Cloud rejects makeup on Monday and never spends diamonds on invalid days',()=>{
  const d=starter();
  const now=Date.parse('2026-10-12T12:00:00Z');
  raises('INVALID_INPUT',()=>perform(d,'attendance.makeup',{day:1},{now}));
  raises('INVALID_INPUT',()=>perform(d,'attendance.makeup',{day:7},{now}));
  assert.equal(d.wallet.diamonds,250);
});

test('Cloud rejects all already-claimed weekdays and today; never opens a future makeup slot',()=>{
  const now=Date.parse('2026-10-17T12:00:00Z'); // Saturday
  const d=starter();
  d.campaignData.attendance={weekKey:'2026-10-12',claimedDays:[1,2,3,4,5],makeupCount:0};
  for(let day=1;day<=5;day++) raises('ALREADY_CLAIMED',()=>perform(d,'attendance.makeup',{day},{now}));
  raises('INVALID_INPUT',()=>perform(d,'attendance.makeup',{day:6},{now}));
  raises('INVALID_INPUT',()=>perform(d,'attendance.makeup',{day:7},{now}));
  assert.equal(d.wallet.diamonds,250);
});

test('Cloud makeup weekly limit never resets by day, but starts fresh on next UTC Monday',()=>{
  const today=Date.parse('2026-10-17T12:00:00Z');
  const d=starter();
  d.campaignData.attendance={weekKey:'2026-10-12',claimedDays:[1,2,5,6],makeupCount:2,streak:2};
  raises('RATE_LIMIT',()=>perform(d,'attendance.makeup',{day:3},{now:today}));
  const nextMonday=Date.parse('2026-10-19T12:00:00Z');
  const updated=perform(d,'attendance.claim',{},{now:nextMonday});
  assert.equal(updated.document.attendance.makeupCount,0);
  assert.deepEqual(updated.document.attendance.claimedDays,[1]);
  assert.equal(updated.document.attendance.weekKey,'2026-10-19');
});
