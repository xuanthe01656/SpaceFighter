'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const lb=require('../lib/leaderboardContractV1.cjs');
const outcome={verified:true,authority:'c15_trusted_outcome',rulesVersion:'shared-combat-v2.0.0',outcomeId:'o-1'};
const pvpOutcome={...outcome,authority:'pvp_authority'};

test('monthly season ID is UTC stable and previous versions can remain distinct',()=>{
 assert.equal(lb.utcMonthSeasonId(Date.UTC(2026,10,30,23,59)),'2026-11');
 assert.equal(lb.utcMonthSeasonId(Date.UTC(2026,11,1,0,0)),'2026-12');
});
test('leaderboard rejects client/unverified outcomes and sanitizes public identity',()=>{
 assert.throws(()=>lb.createLeaderboardEntry({boardId:'pve_campaign',playerId:'u',outcome:{verified:false}}),/not server verified/);
 assert.throws(()=>lb.createLeaderboardEntry({boardId:'pvp_ranked',playerId:'u',outcome}),/does not match board/);
 assert.throws(()=>lb.createLeaderboardEntry({boardId:'pve_campaign',playerId:'u',outcome,seasonId:'2099-01',achievedAtMs:1}),/does not match/);
 const entry=lb.createLeaderboardEntry({boardId:'pve_campaign',playerId:'private-user-id',displayName:'\u0000  Ace Pilot  ',outcome,
  score:5000,clearTimeMs:90000,achievedAtMs:Date.UTC(2026,10,5)});
 assert.equal(entry.displayName,'Ace Pilot');assert.equal(Object.hasOwn(lb.publicLeaderboardEntry(entry),'playerId'),false);
});
test('PvP ranking uses conservative skill, not combat power, with provisional placement',()=>{
 const a=lb.createLeaderboardEntry({boardId:'pvp_ranked',playerId:'a',displayName:'A',outcome:pvpOutcome,mu:31,sigma:2,matches:12,wins:8,losses:4,achievedAtMs:1});
 const b=lb.createLeaderboardEntry({boardId:'pvp_ranked',playerId:'b',displayName:'B',outcome:pvpOutcome,mu:60,sigma:1,matches:5,wins:5,losses:0,achievedAtMs:2});
 assert.ok(b.conservativeSkill>a.conservativeSkill);assert.equal(a.provisional,false);assert.equal(b.provisional,true);
 assert.equal([b,a].sort(lb.compareLeaderboardEntries)[0].playerId,'a');
 assert.equal(Object.hasOwn(a,'combatPower'),false);
});
test('PvE tie-breaks by faster clear, lower damage and earlier achievement',()=>{
 const make=(id,time,damage,at)=>lb.createLeaderboardEntry({boardId:'pve_campaign',playerId:id,displayName:id,outcome,score:10000,clearTimeMs:time,damageTaken:damage,achievedAtMs:at});
 const entries=[make('slow',100000,0,1),make('fast',90000,200,2),make('clean',90000,100,3)];
 entries.sort(lb.compareLeaderboardEntries);assert.deepEqual(entries.map(x=>x.playerId),['clean','fast','slow']);
});
test('event boards are versioned by event ID with deterministic tie-breakers',()=>{
 const e=lb.createLeaderboardEntry({boardId:'event_points',playerId:'u',displayName:'U',outcome:{...outcome,authority:'event_authority'},eventId:'event-2026-11-boss',score:100,completedObjectives:4,achievedAtMs:3});
 assert.equal(e.seasonId,'event-2026-11-boss');assert.equal(e.provisional,false);
});
