import test from 'node:test';
import assert from 'node:assert/strict';
import { PILOTS, AIRCRAFTS, GEAR_CATALOG, DEFAULT_CAMPAIGN_DATA, EVENT_CONFIG } from '../src/constants.js';
import { deriveCombatLoadout, dynamicGearStat, fireIntervalMs, calculateHitDamage, calculateProjectileDamage } from '../src/utils/combatStats.js';
import { frameScale, scaledLerpFactor } from '../src/utils/frameTime.js';
import { dungeonDayUTC, isDungeonOpenUTC } from '../src/utils/dungeonSchedule.js';
import { ensureGuestMissions, recordGuestBattle, recordGuestGacha, recordGuestCoinSpend, activeCoinMultiplier, recordGuestEventKill } from '../src/utils/guestProgress.js';

const catalogs={PILOTS,AIRCRAFTS,GEAR_CATALOG};
const state=()=>structuredClone(DEFAULT_CAMPAIGN_DATA);
const guestNow=Date.parse('2026-10-16T09:00:00Z');

test('HQ, Campaign, Dungeon all read same starter attack/HP/armor and CP',()=>{
  const result=deriveCombatLoadout(state(),catalogs);
  assert.ok(result.stats.maxHp>=1000);
  assert.ok(result.stats.atk>0);
  assert.ok(result.stats.armor>=0);
  assert.ok(Number.isFinite(result.cp));
  assert.equal(result.pilotBase.id,'pilot_alpha');
  assert.equal(result.stats.mainGunId,'gun_laser');
});

test('mixed fireRate units: main gun seconds, wingman and drone milliseconds',()=>{
  const s=state();
  s.items.w={baseId:'wing_missile',rarity:1,level:1,type:'wingman'};
  s.items.d={baseId:'drone_sniper',rarity:1,level:1,type:'drone'};
  s.loadout.wingman='w';s.loadout.drone='d';
  const result=deriveCombatLoadout(s,catalogs);
  assert.equal(result.stats.fireRate,350);
  assert.equal(result.stats.wingFireRate,900);
  assert.equal(result.stats.droneFireRate,1200);
  assert.ok(result.cp>0);
});

test('level raises gear stat; fire cadence improves without falling below limit',()=>{
  assert.equal(dynamicGearStat(18,1,1),18);
  assert.ok(dynamicGearStat(18,10,2)>18);
  assert.ok(fireIntervalMs(0.35,10)<350);
  assert.ok(fireIntervalMs(900,999)>=50);
  assert.equal(fireIntervalMs(null,1,800),800);
});

test('pilot damage bonus, damage reduction, dodge/crit and regen have consistent effects',()=>{
  const alpha=deriveCombatLoadout(state(),catalogs).stats;
  const s=state();s.loadout.pilot='pilot_titan';s.ownedPilots.pilot_titan={level:1,stars:1};
  const titan=deriveCombatLoadout(s,catalogs).stats;
  assert.ok(titan.atk<alpha.atk);
  assert.equal(titan.dmgReduce,0.25);
  assert.equal(calculateHitDamage(100,{armor:20,dmgReduce:0.25},()=>1).damage,60);
  s.loadout.pilot='pilot_ghost';s.ownedPilots.pilot_ghost={level:1,stars:1};
  const ghost=deriveCombatLoadout(s,catalogs).stats;
  assert.equal(calculateHitDamage(100,ghost,()=>0).dodged,true);
  assert.equal(calculateProjectileDamage(100,ghost.critDamageBoost,()=>0),125);
  s.loadout.pilot='pilot_bear';s.ownedPilots.pilot_bear={level:1,stars:1};
  assert.equal(deriveCombatLoadout(s,catalogs).stats.hpRegenRate,0.01);
});

test('armor and pilot reduction cannot turn an incoming hit into healing',()=>{
  const huge={armor:500,dmgReduce:20};
  assert.equal(calculateHitDamage(100,huge,()=>1).damage,1);
  assert.equal(calculateProjectileDamage(10,0,()=>0),10);
});

test('frame correction preserves old 60 FPS speeds and handles 30/120 FPS',()=>{
  assert.ok(Math.abs(frameScale(1000/60)-1)<1e-9);
  assert.ok(Math.abs(frameScale(1000/30)-2)<1e-9);
  assert.ok(Math.abs(frameScale(1000/120)-0.5)<1e-9);
  assert.equal(frameScale(1000),2.5);
  assert.equal(frameScale(-10),1);
});

test('lerp over 2x frame time matches two original frames',()=>{
  const a=0.2;
  assert.ok(Math.abs(scaledLerpFactor(a,2)-(1-(1-a)**2))<1e-12);
  assert.ok(Math.abs(scaledLerpFactor(a,0.5)-(1-Math.sqrt(1-a)))<1e-12);
});

test('guest mission progress increments by true guest battle result, not arbitrary seed',()=>{
  const c=state();
  let m=recordGuestBattle(c,{mode:'campaign',victory:true,kills:7,boss:true},guestNow);
  assert.equal(m.progress.d_play_3,1);
  assert.equal(m.progress.m_clear_planet,1);
  assert.equal(m.progress.w_boss_3,1);
  assert.equal(m.progress.d_kill_50,7);
  m=recordGuestBattle(c,{mode:'campaign',victory:false,kills:3},guestNow);
  assert.equal(m.progress.d_play_3,2);
  assert.equal(m.progress.m_clear_planet,1);
  assert.equal(m.progress.d_kill_50,10);
});

test('guest gacha and coin spend counters accrue and cap',()=>{
  const c=state();
  recordGuestGacha(c,10,guestNow);
  recordGuestCoinSpend(c,1200,guestNow);
  assert.equal(c.missionData.progress.m_pull_gacha,10);
  assert.equal(c.missionData.progress.w_spend_coins,1200);
  recordGuestGacha(c,-5,guestNow);
  assert.equal(c.missionData.progress.m_pull_gacha,10);
});

test('guest login/mission claims reset on day/week/month boundaries',()=>{
  const c=state();
  const fri=Date.parse('2026-10-16T10:00:00Z');
  const mon=Date.parse('2026-10-19T10:00:00Z');
  recordGuestBattle(c,{mode:'campaign',victory:true,kills:5,boss:true},fri);
  recordGuestGacha(c,3,fri);
  c.missionData.claimed=['d_play_3','w_boss_3','m_pull_gacha'];
  ensureGuestMissions(c,mon);
  assert.equal(c.missionData.progress.d_play_3,0);
  assert.equal(c.missionData.progress.w_boss_3,0);
  assert.equal(c.missionData.progress.m_pull_gacha,3);
  assert.deepEqual(c.missionData.claimed,['m_pull_gacha']);
  ensureGuestMissions(c,Date.parse('2026-11-01T10:00:00Z'));
  assert.equal(c.missionData.progress.m_pull_gacha,0);
  assert.deepEqual(c.missionData.claimed,[]);
});

test('seasonal coin multiplier only follows active server-matching calendar',()=>{
  assert.equal(activeCoinMultiplier(EVENT_CONFIG,guestNow),1);
  const ev=[{id:'old',type:'coin_fever',startTime:1000,endTime:2000,multiplier:2}];
  assert.equal(activeCoinMultiplier(ev,3000),1);
  assert.equal(activeCoinMultiplier(ev,1500),2);
  assert.equal(activeCoinMultiplier([],1500),1);
});

test('guest mission helpers do not change currency or inventory',()=>{
  const c=state(), before=structuredClone(c.items);
  recordGuestBattle(c,{mode:'dungeon',victory:true,kills:6},guestNow);
  assert.deepEqual(c.items,before);
  assert.equal(c.missionData.progress.d_kill_50,6);
  assert.equal(c.missionData.progress.d_play_3,0);
});

test('dungeon availability matches server UTC day near local midnight',()=>{
  const saturdayUTC=Date.parse('2026-10-17T23:30:00Z');
  const sundayUTC=Date.parse('2026-10-18T00:30:00Z');
  const saturdayOnly={openDays:[6]};
  assert.equal(dungeonDayUTC(saturdayUTC),6);
  assert.equal(dungeonDayUTC(sundayUTC),0);
  assert.equal(isDungeonOpenUTC(saturdayOnly,saturdayUTC),true);
  assert.equal(isDungeonOpenUTC(saturdayOnly,sundayUTC),false);
  assert.throws(()=>dungeonDayUTC(NaN));
});

test('guest kill-rush counters ignore expired and unrelated events',()=>{
  const c=state();
  const events=[{id:'active',type:'kill_rush',startTime:100,endTime:200},
    {id:'expired',type:'kill_rush',startTime:1,endTime:99},
    {id:'other',type:'coin_fever',startTime:100,endTime:200}];
  assert.equal(recordGuestEventKill(c,events,150),1);
  assert.equal(c.eventData.active.kills,1);
  assert.equal(c.eventData.expired,undefined);
  assert.equal(recordGuestEventKill(c,events,250),0);
  assert.equal(c.eventData.active.kills,1);
});
