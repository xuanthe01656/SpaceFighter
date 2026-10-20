'use strict';
// Phase 1: all authenticated economic changes are commands executed on the
// server against a Firestore transaction. No client-supplied balance or item
// snapshot is accepted. PvE combat verification is intentionally provisional:
// tickets, caps and cooldowns are NOT an authoritative combat simulation.
const { randomUUID, randomInt } = require('node:crypto');

class GameError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'GameError'; this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new GameError(code, message, status); };
const own = (v) => v && typeof v === 'object' && !Array.isArray(v);
const obj = v => own(v) ? v : {};
const safeInt = (value, max = 1000000000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const int = (value, min, max, field) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_INPUT', `Invalid ${field}`);
  return value;
};
const id = (value, field = 'id') => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,90}$/.test(value)) fail('INVALID_INPUT', `Invalid ${field}`);
  return value;
};
const deep = v => structuredClone(v);
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
const utcMonth = ms => utcDay(ms).slice(0, 7);
const utcWeek = ms => { const dt = new Date(ms); dt.setUTCHours(0,0,0,0); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay()+6)%7)); return dt.toISOString().slice(0,10); };
const weekdayMon = ms => ((new Date(ms).getUTCDay()+6)%7)+1;
// Keep the mission definition (30) as the ceiling, not the target for February.
const monthlyAttendanceGoalUTC = ms => {
  const dt = new Date(ms);
  return Math.min(30, new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth()+1, 0)).getUTCDate());
};
const utcLegacyDateLabel = ms => {
  const dt = new Date(ms);
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()]} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()]} ${dt.getUTCDate()} ${dt.getUTCFullYear()}`;
};
const fixedRand = (rng,max) => { const n = rng(max); if (!Number.isInteger(n) || n < 0 || n >= max) throw new Error('Invalid secure RNG'); return n; };
const random = max => randomInt(max);
const credit = (wallet, key, amount, max = 1000000000) => {
  if (!safeInt(amount, max)) fail('INVALID_REWARD', 'Invalid reward');
  wallet[key] = (wallet[key] || 0) + amount;
  if (!safeInt(wallet[key], max)) fail('WALLET_LIMIT', 'Balance limit reached', 409);
};
const charge = (wallet, key, amount) => {
  if (!safeInt(amount) || (wallet[key] || 0) < amount) fail('INSUFFICIENT_FUNDS', `Not enough ${key}`, 409);
  wallet[key] -= amount;
};
const addReward = (state, reward, amountOverride = null) => {
  const type = reward?.type === 'gems' ? 'diamonds' : reward?.type;
  const amount = amountOverride === null ? reward?.amount : amountOverride;
  if (!['coins','diamonds','energy','blueprints','gears'].includes(type)) fail('INVALID_REWARD','Unknown reward type');
  if (type === 'gears' || type === 'blueprints') {
    state.campaignData.materials ||= {};
    credit(state.campaignData.materials, type, amount);
  } else credit(state, type, amount);
};
// These dates are evidence created by this server for *natural* check-ins only.
// Legacy lastDate/claimedDays/streak and paid makeups are NOT authoritative
// proof of UTC natural attendance. Keep 75 days for current month/week repair.
const validUTCDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && utcDay(Date.parse(`${day}T00:00:00Z`)) === day;
const verifiedNaturalDays = a => [...new Set((Array.isArray(a?.naturalClaimDaysUTC) ? a.naturalClaimDaysUTC : [])
  .filter(validUTCDay))].sort();
const recordNaturalDay = (a, now) => {
  const today = utcDay(now);
  const minDay = utcDay(now - 75 * 86400000);
  a.naturalClaimDaysUTC = [...new Set([...verifiedNaturalDays(a), today])]
    .filter(day => day >= minDay && day <= today).sort();
};

const countMission = (state, key, amount = 1) => {
  const track = state.campaignData.missionData ||= { claimed: [], progress: {} };
  track.progress ||= {};
  const before = Math.min(10000000, Math.max(0, Number(track.progress[key]) || 0));
  const after = Math.min(10000000, before + amount);
  track.progress[key] = after;
  // Operation-level evidence for rebuilding active-period counters when a
  // previous client/version saved a stale mission snapshot. Only authoritative
  // server increments are captured (not automatic ledger floors or makeups).
  if (after > before) {
    state._missionDeltas ||= {};
    state._missionDeltas[key] = (state._missionDeltas[key] || 0) + after - before;
  }
};
const updateMissions = (state, now, config) => {
  const m = state.campaignData.missionData ||= {};
  m.progress ||= {}; m.claimed ||= [];
  const keys = [['daily', utcDay(now)], ['weekly',utcWeek(now)], ['monthly',utcMonth(now)]];
  for (const [period, key] of keys) {
    const prop = `${period}Key`;
    if (m[prop] !== key) {
      const oldKey = m[prop];
      const specs = config.MISSIONS_CONFIG[period];
      // Archive exactly the counters/claimed flags saved for the previous
      // period, before reset. It is historic state, NOT proof of unlogged
      // activity and must never be counted towards current-period rewards.
      if (typeof oldKey === 'string' && oldKey < key &&
          (period === 'monthly' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(oldKey)) {
        const history = (m.periodHistory ||= {});
        const stored = (history[period] ||= {});
        if (!Object.prototype.hasOwnProperty.call(stored, oldKey)) {
          stored[oldKey] = {
            progress: Object.fromEntries(specs.map(spec => [spec.id, Number(m.progress[spec.id]) || 0])),
            claimed: specs.map(spec => spec.id).filter(id => m.claimed.includes(id)),
          };
        }
        const keys = Object.keys(stored).sort();
        const maxEntries = period === 'daily' ? 35 : period === 'weekly' ? 12 : 13;
        for (const stale of keys.slice(0, Math.max(0, keys.length - maxEntries))) delete stored[stale];
      }
      // The oldest profiles have no period key. We cannot tell whether those
      // counters belong to this UTC day/week/month, so preserve a copy for
      // audit instead of inventing a current-period reward.
      if (!oldKey) {
        const oldProgress = Object.fromEntries(specs.map(spec => [spec.id, Number(m.progress[spec.id]) || 0]));
        const oldClaims = specs.map(spec => spec.id).filter(id => m.claimed.includes(id));
        if (Object.values(oldProgress).some(n => n > 0) || oldClaims.length) {
          m.legacyUnkeyed ||= {};
          m.legacyUnkeyed[period] ||= {progress: oldProgress, claimed:oldClaims};
        }
      }
      for (const spec of specs) {
        m.progress[spec.id] = 0;
        m.claimed = m.claimed.filter(i => i !== spec.id);
      }
      m[prop] = key;
    }
  }
  // Repair the *minimum proven progress* after a reset, without inventing
  // any historical dates from the legacy local-time attendance records.
  // Never lower counters or re-issue claimed rewards during normal gameplay.
  const verified = verifiedNaturalDays(state.campaignData.attendance);
  const dayKey = utcDay(now), weekKey = utcWeek(now), monthKey = utcMonth(now);
  const floor = {
    d_login: verified.includes(dayKey) ? 1 : 0,
    w_login_5: Math.min(5, verified.filter(day => day >= weekKey && day <= dayKey).length),
    m_login_30: Math.min(monthlyAttendanceGoalUTC(now), verified.filter(day => day.slice(0, 7) === monthKey && day <= dayKey).length),
  };
  for (const [key, value] of Object.entries(floor)) {
    m.progress[key] = Math.max(Number.isSafeInteger(m.progress[key]) ? m.progress[key] : 0, value);
  }
  return m;
};
const updateAttendance = (state, now) => {
  const a = state.campaignData.attendance ||= {};
  const currentWeek = utcWeek(now);
  if (a.weekKey !== currentWeek) {
    // During legacy migration, retain the current week's already-claimed days.
    // No historical/previous-week days are backfilled or carried forward.
    const legacyDay = !a.weekKey ? (validStoredClaimDay(a) ?? legacyCalendarDay(a.lastDate)) : null;
    const sameWeek = legacyDay !== null && utcWeek(legacyDay * 86400000) === currentWeek;
    if (!sameWeek) { a.claimedDays = []; a.weeklyCompletedDays = 0; a.weeklyStreak = 0; a.makeupCount = 0; }
    a.weekKey = currentWeek;
  }
  if (!Array.isArray(a.claimedDays)) a.claimedDays = [];
  a.claimedDays = [...new Set(a.claimedDays.filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((x,y)=>x-y);
  a.weeklyCompletedDays = a.claimedDays.length;
  a.weeklyStreak = a.weeklyCompletedDays; // deprecated mirror for legacy saves
  return a;
};
const gearTypes = ['mainGun', 'wingman', 'armor', 'drone'];
const rollGacha = (state, crate, amount, config, rng, uuid) => {
  const pulls = [];
  state.campaignData.items ||= {};
  state.campaignData.ownedPilots ||= {};
  for (let i=0;i<amount;i++) {
    const roll = fixedRand(rng,100) + 1;
    let sum = 0, rarity = 1;
    for (const r of [5,4,3,2,1]) {
      sum += Number(crate.dropRates[r]) || 0;
      if (roll <= sum) { rarity = r; break; }
    }
    if (crate.id === 'pilot_gacha') {
      const possible = config.PILOTS.filter(p => p.rarity === rarity);
      if (!possible.length) fail('CATALOG_INVALID','Empty pilot pool');
      const chosen = possible[fixedRand(rng,possible.length)];
      state.campaignData.ownedPilots[chosen.id] ||= { level: 1, stars: 1 };
      pulls.push({ type: 'pilot', baseId: chosen.id, rarity });
    } else {
      const type = gearTypes[fixedRand(rng,gearTypes.length)];
      const pool = config.GEAR_CATALOG[type];
      if (!pool?.length) fail('CATALOG_INVALID','Empty item pool');
      const gear = pool[fixedRand(rng,pool.length)];
      const itemId = `item_${uuid().replaceAll('-','')}`;
      const item = { uuid:itemId, baseId:gear.id, rarity, level:1, type };
      state.campaignData.items[itemId] = item;
      pulls.push(item);
    }
  }
  return pulls;
};
// Ownership checks MUST NOT resolve values inherited from Object.prototype.
// Firestore inventory maps are ordinary objects; keys such as '__proto__' and
// 'constructor' are valid-looking strings but are not owned inventory entries.
const ownedItem = (map, key) => {
  const entries = obj(map);
  return Object.hasOwn(entries, key) && own(entries[key]) ? entries[key] : null;
};
const getItem = (c, kind, uuid) => {
  id(uuid,'itemId');
  let item;
  if (kind === 'pilot') item = ownedItem(c.ownedPilots, uuid);
  else if (kind === 'aircraft') item = ownedItem(c.ownedAircrafts, uuid);
  else if (kind === 'gear') item = ownedItem(c.items, uuid);
  else fail('INVALID_INPUT','Unknown item type');
  if (!item) fail('ITEM_NOT_OWNED', 'Item not owned',409);
  return item;
};
const setLoadout = (state, slot, value) => {
  if (!['pilot','aircraft',...gearTypes].includes(slot)) fail('INVALID_INPUT','Invalid loadout slot');
  if (value !== '') id(value,'loadout');
  const c = state.campaignData;
  if (slot === 'pilot' && (!value || !ownedItem(c.ownedPilots, value))) fail('ITEM_NOT_OWNED','Pilot not owned',409);
  if (slot === 'aircraft' && (!value || !ownedItem(c.ownedAircrafts, value))) fail('ITEM_NOT_OWNED','Aircraft not owned',409);
  if (gearTypes.includes(slot) && value) {
    const item = ownedItem(c.items, value);
    if (!item || item.type !== slot) fail('ITEM_NOT_OWNED','Gear not owned',409);
  }
  c.loadout ||= {}; c.loadout[slot] = value;
};
const earnCoinMetric = (state, cost, currency) => { if (currency === 'coins') countMission(state,'w_spend_coins',cost); };
const getMission = (config, missionId) => Object.values(config.MISSIONS_CONFIG).flat().find(m=>m.id === missionId);
const absDay = ms => Math.floor(ms/86400000);
// Phase 0 stored `new Date().toDateString()` as a *calendar date* without
// timezone information (e.g. 'Sun Oct 11 2026'). Date.parse() of that value
// uses the host's local timezone, which can shift it to a different UTC day.
// Recover the intended calendar day deterministically, independent of TZ.
const LEGACY_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEGACY_WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function legacyCalendarDay(value) {
  if (typeof value !== 'string') return null;
  const match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{4})$/.exec(value);
  if (!match) return null;
  const [, weekday, monthName, dayText, yearText] = match;
  const year = Number(yearText), month = LEGACY_MONTHS.indexOf(monthName), day = Number(dayText);
  const ms = Date.UTC(year,month,day);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day ||
      LEGACY_WEEKDAYS[date.getUTCDay()] !== weekday) return null;
  return absDay(ms);
}
function validStoredClaimDay(a) {
  if (typeof a?.lastClaimUTC !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.lastClaimUTC)) return null;
  const ms = Date.parse(`${a.lastClaimUTC}T00:00:00Z`);
  return Number.isFinite(ms) && utcDay(ms) === a.lastClaimUTC ? absDay(ms) : null;
}
function executeCommand(document, type, input, { now = Date.now(), rng=random, uuid=randomUUID, config }) {
  if (!Number.isSafeInteger(now) || !config) throw new Error('Server configuration required');
  const data = deep(document);
  const wallet = data.wallet ||= {};
  const c = data.campaignData ||= {};
  c.progress ||= {}; c.loadout ||= {}; c.items ||= {}; c.ownedPilots ||= {}; c.ownedAircrafts ||= {}; c.materials ||= {};
  c.materials.crates ||= {};
  for (const k of ['coins','diamonds','energy','vipPoints']) {
    if (!safeInt(wallet[k] ?? 0)) fail('INVALID_PROFILE','Invalid economy data',409);
    wallet[k] ||= 0;
  }
  for (const k of ['gears','blueprints']) {
    if (!safeInt(c.materials[k] ?? 0)) fail('INVALID_PROFILE','Invalid material data',409);
    c.materials[k] ||= 0;
  }
  const state = { ...wallet, campaignData:c };
  const missions = updateMissions(state, now, config);
  let extra = {};
  if (type === 'profile.preferences') {
    const p = obj(input);
    if (Object.keys(p).some(k=>!['loadout','currentPlanet','selectedStage'].includes(k))) fail('INVALID_INPUT','Unknown preference field');
    if (p.loadout !== undefined) {
      if (!own(p.loadout) || Object.keys(p.loadout).some(k=>!['pilot','aircraft',...gearTypes].includes(k))) fail('INVALID_INPUT','Invalid loadout');
      for (const [slot,value] of Object.entries(p.loadout)) setLoadout(state,slot,value);
    }
    if (p.currentPlanet !== undefined || p.selectedStage !== undefined) {
      const planet = p.currentPlanet === undefined ? Number(c.progress.currentPlanet)||1 : int(p.currentPlanet,1, Object.keys(config.PLANET_CONFIG).length,'planet');
      const stage = p.selectedStage === undefined ? Number(c.progress.selectedStage)||1 : int(p.selectedStage,1,10,'stage');
      const unlocked = planet === 1 || planet <= (Number(c.progress.highestPlanet)||1);
      const highest = Number(c.progress.planets?.[planet]?.highestStage)||1;
      if (!unlocked || stage > highest) fail('STAGE_LOCKED','Stage is locked',409);
      c.progress.currentPlanet = planet; c.progress.selectedStage = stage;
    }
  } else if (type === 'gacha.open') {
    const crate = config.CRATE_CONFIGS.find(p=>p.id===input?.crateId);
    if (!crate) fail('INVALID_INPUT','Unknown crate');
    const amount = int(input.amount,1,10,'amount');
    const day = utcDay(now), stat = data.security ||= {};
    if (stat.gachaDay !== day) { stat.gachaDay = day; stat.gachaCount = 0; }
    if ((stat.gachaCount||0) + amount > 100) fail('RATE_LIMIT','Daily gacha limit',429);
    if (Object.keys(c.items).length + amount > 500) fail('INVENTORY_FULL','Inventory limit reached',409);
    const stock = Number(c.materials.crates[crate.id])||0;
    if (stock >= amount) c.materials.crates[crate.id] -= amount;
    else { charge(state, crate.currency, crate.cost * amount); earnCoinMetric(state,crate.cost*amount,crate.currency); }
    extra.pulls = rollGacha(state,crate,amount,config,rng,uuid);
    stat.gachaCount += amount;
    countMission(state,'m_pull_gacha',amount);
  } else if (type === 'attendance.claim' || type === 'attendance.makeup') {
    const a = updateAttendance(state,now);
    const day = weekdayMon(now);
    const isMakeup = type === 'attendance.makeup';
    const claimDay = isMakeup ? int(input.day,1,7,'day') : day;
    if (a.claimedDays.includes(claimDay) || (!isMakeup && (validStoredClaimDay(a) === absDay(now) || legacyCalendarDay(a.lastDate) === absDay(now)))) {
      fail('ALREADY_CLAIMED','Attendance already claimed',409);
    }
    if (isMakeup) {
      if (claimDay >= day) fail('INVALID_INPUT','Can only make up past weekdays');
      if ((a.makeupCount||0) >= 2) fail('RATE_LIMIT','Maximum makeup claims reached',409);
      charge(state,'diamonds',a.makeupCount===0?50:150);
      a.makeupCount=(a.makeupCount||0)+1;
    } else {
      const today = utcDay(now);
      // Phase0 used Date.toDateString(). Convert only a valid stored legacy
      // date so existing daily streaks survive the server migration.
      const priorDay = validStoredClaimDay(a) ?? legacyCalendarDay(a.lastDate) ?? -100;
      a.streak=(priorDay === absDay(now)-1) ? (a.streak||0)+1 : 1;
      a.lastClaimUTC = today;
      a.lastDate = utcLegacyDateLabel(now); // legacy UI, timezone-independent
      recordNaturalDay(a, now); // only real claims, never makeups
    }
    a.claimedDays.push(claimDay); a.claimedDays.sort((x,y)=>x-y);
    a.weeklyCompletedDays=a.claimedDays.length;
    a.weeklyStreak=a.weeklyCompletedDays; // legacy mirror
    if (!isMakeup) {
      countMission(state,'d_login',1);
      countMission(state,'w_login_5',1);
      countMission(state,'m_login_30',1);
      missions.progress.w_login_5 = Math.min(5, missions.progress.w_login_5);
      missions.progress.m_login_30 = Math.min(monthlyAttendanceGoalUTC(now), missions.progress.m_login_30);
    } // Ghost check-ins do not count as natural daily/weekly/monthly attendance.
    extra.attendance = isMakeup
      ? { kind: 'makeup', dayUTC: utcDay(now), weekday: claimDay }
      : { kind: 'natural', dayUTC: utcDay(now) };
    if (a.weeklyCompletedDays === 7) {
      if (Object.keys(c.items).length+5>500) fail('INVENTORY_FULL','Inventory limit reached',409);
      const crate = config.CRATE_CONFIGS.find(x=>x.id==='basic');
      extra.pulls = rollGacha(state,crate,5,config,rng,uuid);
    } else addReward(state,{type:'coins',amount:10});
  } else if (type === 'mission.claim') {
    const missionId = id(input?.missionId,'missionId');
    const m = getMission(config,missionId);
    if (!m) fail('INVALID_INPUT','Unknown mission');
    if (missions.claimed.includes(missionId)) fail('ALREADY_CLAIMED','Mission already claimed',409);
    const goal = missionId === 'm_login_30' ? monthlyAttendanceGoalUTC(now) : m.goal;
    if ((missions.progress[missionId]||0) < goal) fail('NOT_READY','Mission goal not reached',409);
    addReward(state,m.reward); missions.claimed.push(missionId);
    extra.reward = m.reward;
  } else if (type === 'event.claim') {
    const event = config.EVENT_CONFIG.find(x=>x.id === input?.eventId);
    if (!event || now < event.startTime || now > event.endTime) fail('EVENT_ENDED','Event not active',409);
    const ed = (c.eventData ||= {});
    const e = ed[event.id] ||= {};
    if (event.milestones) {
      const index = int(input.index,0,event.milestones.length-1,'index');
      if ((e.claimedMilestones||[]).includes(index)) fail('ALREADY_CLAIMED','Milestone claimed',409);
      if ((e.kills||0) < event.milestones[index].kills) fail('NOT_READY','Milestone not reached',409);
      addReward(state,event.milestones[index].reward);
      e.claimedMilestones ||= []; e.claimedMilestones.push(index);
    } else if (event.dailyRewards) {
      const index = int(input.index,0,event.dailyRewards.length-1,'index');
      if ((e.daysCollected||[]).includes(index)) fail('ALREADY_CLAIMED','Event day claimed',409);
      const earliest = event.startTime + index*86400000;
      if (now < earliest) fail('NOT_READY','Event day not yet available',409);
      const reward = event.dailyRewards[index];
      if (reward.type==='aircraft') { id(reward.id); c.ownedAircrafts[reward.id] ||= {level:1,stars:1}; }
      else addReward(state,reward);
      e.daysCollected ||= []; e.daysCollected.push(index);
      e.lastCollectDate=new Date(now).toDateString();
    } else fail('INVALID_INPUT','Event has no claimable rewards');
  } else if (type === 'inventory.lock') {
    const kind = input?.kind, itemId = id(input?.itemId,'itemId');
    const target = getItem(c,kind,itemId); target.isLocked = !Boolean(target.isLocked);
    extra.isLocked = target.isLocked;
  } else if (type === 'inventory.equip') {
    setLoadout(state,input?.slot,input?.itemId);
  } else if (type === 'inventory.salvage' || type === 'inventory.delete') {
    const arr = input?.items;
    if (!Array.isArray(arr) || arr.length < 1 || arr.length > 50) fail('INVALID_INPUT','Invalid item list');
    const keys=new Set(), list=[];
    for (const entry of arr) {
      const kind=entry?.kind, itemId=id(entry?.itemId,'itemId');
      if (keys.has(`${kind}:${itemId}`)) fail('INVALID_INPUT','Duplicate item');
      keys.add(`${kind}:${itemId}`);
      const target=getItem(c,kind,itemId);
      if (target.isLocked) fail('ITEM_LOCKED','Unlock item before deleting',409);
      if (kind==='pilot' && (itemId==='pilot_alpha' || c.loadout.pilot===itemId)) fail('ITEM_LOCKED','Cannot delete starter/equipped pilot',409);
      if (kind==='aircraft' && (itemId==='ship_xwing' || c.loadout.aircraft===itemId)) fail('ITEM_LOCKED','Cannot delete starter/equipped ship',409);
      if (kind==='gear' && (itemId==='item_start_gun' || c.loadout[target.type]===itemId)) fail('ITEM_LOCKED','Cannot delete starter/equipped gear',409);
      const rarity=kind==='gear' ? Number(target.rarity)||1 : kind==='pilot' ? config.PILOTS.find(p=>p.id===itemId)?.rarity||1 : Number(target.stars)||1;
      list.push({kind,itemId,rarity});
    }
    for (const item of list) {
      if (item.kind==='pilot') delete c.ownedPilots[item.itemId];
      if (item.kind==='aircraft') delete c.ownedAircrafts[item.itemId];
      if (item.kind==='gear') delete c.items[item.itemId];
    }
    if (type==='inventory.salvage') { const amount=list.reduce((a,b)=>a+Math.min(10,b.rarity*2),0); addReward(state,{type:'coins',amount}); extra.earnedCoins=amount; }
  } else if (type === 'inventory.upgrade') {
    const kind = input?.kind, itemId=id(input?.itemId,'itemId');
    if (!['gear','aircraft'].includes(kind)) fail('INVALID_INPUT','Unsupported upgrade type');
    const item=getItem(c,kind,itemId);
    const level=int(item.level||1,1,1000,'level');
    const maxLevel=kind==='aircraft'
      ? ({1:30,2:50,3:70,4:100}[config.AIRCRAFTS.find(a=>a.id===itemId)?.tier||1] || 30)
      : ({1:20,2:40,3:60,4:80,5:100}[item.rarity||1] || 20);
    if (level>=maxLevel) fail('MAX_LEVEL','Maximum level reached',409);
    const coinCost=level*150,gemCost=Math.ceil(coinCost/100),bpCost=Math.ceil(level*1.5);
    const cur = state.coins>=coinCost?'coins':'diamonds';
    charge(state,cur,cur==='coins'?coinCost:gemCost);
    charge(c.materials,'blueprints',bpCost);
    earnCoinMetric(state,coinCost,cur);
    item.level=level+1;
  } else if (type === 'inventory.starup' || type === 'pilot.starup') {
    if (type==='pilot.starup') {
      const pilotId=id(input?.pilotId,'pilotId'),pilot=getItem(c,'pilot',pilotId);
      const stars=int(pilot.stars||1,1,5,'stars');
      const options={1:[500,90],2:[1000,70],3:[2000,50],4:[5000,30]};
      if (!options[stars]) fail('MAX_LEVEL','Maximum stars reached',409);
      charge(state,'coins',options[stars][0]); earnCoinMetric(state,options[stars][0],'coins');
      extra.success=fixedRand(rng,100)<options[stars][1];
      if (extra.success) pilot.stars=stars+1;
    } else {
      const itemId=id(input?.itemId,'itemId'),kind=input?.kind;
      if (!['gear','aircraft'].includes(kind)) fail('INVALID_INPUT','Unsupported starup type');
      const item=getItem(c,kind,itemId);
      const rarity=int(kind==='gear'?(item.rarity||1):(item.stars||1),1,5,'stars');
      if (rarity>=5) fail('MAX_LEVEL','Maximum stars reached',409);
      const sacr = input?.sacrifices;
      if (!Array.isArray(sacr) || sacr.length<1 || sacr.length>10 || new Set(sacr).size!==sacr.length || sacr.includes(itemId)) fail('INVALID_INPUT','Invalid sacrifices');
      for (const sid of sacr) {
        const x=getItem(c,'gear',sid);
        if (x.isLocked || c.loadout[x.type]===sid || x.baseId !== item.baseId) fail('INVALID_INPUT','Sacrifices must be unequipped/unlocked duplicates',409);
      }
      const costs={1:[1000,10,1,100],2:[3000,30,2,70],3:[8000,80,3,50],4:[20000,200,4,30]};
      const rule=costs[rarity];
      if (!rule || sacr.length!==rule[2]) fail('INVALID_INPUT','Wrong sacrifice count');
      const coinCost=rule[0],gemCost=rule[1];
      const cur=state.coins>=coinCost?'coins':'diamonds';
      charge(state,cur,cur==='coins'?coinCost:gemCost); earnCoinMetric(state,coinCost,cur);
      for (const sid of sacr) delete c.items[sid];
      extra.success=fixedRand(rng,100)<rule[3];
      if (extra.success) { if (kind==='gear') item.rarity=rarity+1; else item.stars=rarity+1; }
    }
  } else if (type === 'battle.start') {
    const mode = input?.mode;
    if (!['campaign','dungeon'].includes(mode)) fail('INVALID_INPUT','Invalid battle mode');
    const existing=data.activeBattle;
    if (existing && now-existing.startedAt < 30*60*1000) fail('BATTLE_ACTIVE','You already have an active battle',409);
    const stat=data.security ||= {};
    // Per-account daily caps are a fraud-limiting layer, not combat verification.
    const day=utcDay(now);
    if (stat.battleDay!==day) {
      stat.battleDay=day; stat.battleStarts=0; stat.battleWins=0;
      stat.battleCoins=0; stat.battleDiamonds=0;
    }
    if ((stat.battleStarts||0)>=100) fail('RATE_LIMIT','Daily battle limit reached',429);
    if (now-(stat.lastBattleStartAt||0) < 5000) fail('RATE_LIMIT','Please wait before starting another battle',429);
    const ticket={id:uuid(),mode,startedAt:now};
    if (mode==='campaign') {
      const planet=int(input?.planetId,1,Object.keys(config.PLANET_CONFIG).length,'planetId');
      const stage=int(input?.stage,1,10,'stage');
      const highest=Number(c.progress.planets?.[planet]?.highestStage)||1;
      if (planet>(Number(c.progress.highestPlanet)||1) || stage>highest) fail('STAGE_LOCKED','Stage is locked',409);
      ticket.planetId=planet;ticket.stage=stage;
      c.progress.currentPlanet=planet;c.progress.selectedStage=stage;
    } else {
      const dungeon=config.DUNGEON_CONFIG.find(d=>d.id===input?.dungeonId);
      if (!dungeon) fail('INVALID_INPUT','Unknown dungeon');
      if (!dungeon.openDays.includes(new Date(now).getUTCDay())) fail('DUNGEON_CLOSED','Dungeon is closed',409);
      charge(state,'energy',dungeon.energyCost);
      ticket.dungeonId=dungeon.id;
    }
    data.activeBattle=ticket;stat.lastBattleStartAt=now;stat.battleStarts=(stat.battleStarts||0)+1;
    extra.ticket=ticket;
  } else if (type === 'battle.finish' || type === 'battle.abandon') {
    const ticket=data.activeBattle;
    if (!ticket || ticket.id !== input?.ticketId) fail('BATTLE_NOT_FOUND','Active ticket not found',409);
    if (type==='battle.abandon') { data.activeBattle=null; }
    else {
      const victory=input?.victory === true;
      if (typeof input?.victory !== 'boolean') fail('INVALID_INPUT','Invalid result');
      const elapsed=now-ticket.startedAt;
      if (elapsed<5000 || elapsed>30*60*1000) fail('BATTLE_TIMING','Battle timing invalid',409);
      // Reward rate-limits mitigate abuse from forged client victories but do not
      // assert that the client actually fought/won. Authoritative verification
      // remains mandatory before commercial release.
      const stat=data.security ||= {};
      const day=utcDay(now);
      if (stat.battleDay!==day) {
        stat.battleDay=day;stat.battleStarts=0;stat.battleWins=0;
        stat.battleCoins=0;stat.battleDiamonds=0;
      }
      if (victory && (stat.battleWins||0)>=50) fail('RATE_LIMIT','Daily victory limit reached',429);
      if (victory && elapsed<8000) fail('BATTLE_TIMING','Victory reported too quickly',409);
      const coinsBefore=state.coins, diamondsBefore=state.diamonds;
      if (ticket.mode==='campaign') {
        const stage=config.STAGE_CONFIG[ticket.stage];
        const stars=victory?int(input?.stars,1,3,'stars'):0;
        const reward=victory? Math.min(15000,stage.expReward*2 + stage.waves*50):0;
        addReward(state,{type:'coins',amount:reward});
        extra.earnedRewards=[{type:'coins',amount:reward}];
        if (victory) {
          const p=c.progress;
          p.planets ||= {};
          const entry=p.planets[ticket.planetId] ||= {highestStage:1,stars:{}};
          entry.stars ||= {};entry.stars[ticket.stage]=Math.max(entry.stars[ticket.stage]||0,stars);
          if (ticket.stage >= (entry.highestStage||1) && ticket.stage<10) {
            entry.highestStage=ticket.stage+1;
            p.selectedStage=ticket.stage+1;
          }
          if (ticket.stage===10 && ticket.planetId < Object.keys(config.PLANET_CONFIG).length) {
            p.highestPlanet=Math.max(p.highestPlanet||1,ticket.planetId+1);
            p.planets[ticket.planetId+1] ||= {highestStage:1,stars:{}};
            p.currentPlanet=ticket.planetId+1;p.selectedStage=1;
          }
          p.exp=(p.exp||0)+stage.expReward;
          countMission(state,'m_clear_planet',1);
          if (stage.hasBoss) countMission(state,'w_boss_3',1);
        }
        countMission(state,'d_play_3',1);
        // Kills are not verifiable without authoritative simulation; do not
        // credit kill-based mission progress from user-submitted numbers.
        // TODO: verified combat events from a trusted battle process.
      } else {
        const dungeon=config.DUNGEON_CONFIG.find(d=>d.id===ticket.dungeonId);
        if (victory) {
          extra.earnedRewards=[];
          for (const rw of dungeon.rewards) {
            const match=rw.amountStr.replaceAll('K','000').replaceAll(' ','').split('-').map(Number);
            const lo=match[0]||0,hi=match[1]??lo;
            const amount=lo+fixedRand(rng,hi-lo+1);
            addReward(state,rw,amount);
            extra.earnedRewards.push({type:rw.type,amount});
          }
          c.dungeonHistory ||= {};
          c.dungeonHistory[dungeon.id]={lastResult:'victory',lastPlayedAt:now,lastWaves:dungeon.waves};
        } else {
          c.dungeonHistory ||= {};
          c.dungeonHistory[dungeon.id]={lastResult:'defeat',lastPlayedAt:now};
          extra.earnedRewards=[];
        }
      }
      const addedCoins=Math.max(0,state.coins-coinsBefore);
      const addedDiamonds=Math.max(0,state.diamonds-diamondsBefore);
      if ((stat.battleCoins||0)+addedCoins > 500000 || (stat.battleDiamonds||0)+addedDiamonds > 500) {
        fail('RATE_LIMIT','Daily battle reward limit reached',429);
      }
      stat.battleCoins=(stat.battleCoins||0)+addedCoins;
      stat.battleDiamonds=(stat.battleDiamonds||0)+addedDiamonds;
      if (victory) stat.battleWins=(stat.battleWins||0)+1;
      data.activeBattle=null;
    }
  } else fail('UNKNOWN_COMMAND','Command not supported',400);

  // Scope each audited increment to the server's exact UTC period keys.
  // Never trust client-sent mission values or let the client write this audit.
  if (Object.keys(state._missionDeltas || {}).length) {
    extra.missionDeltas = {...state._missionDeltas};
    extra.missionKeys = {
      daily: missions.dailyKey, weekly: missions.weeklyKey, monthly: missions.monthlyKey,
    };
  }
  // Economy MUST be sourced from the mutated server state, never the payload.
  data.wallet={...wallet,coins:state.coins,diamonds:state.diamonds,energy:state.energy,vipPoints:state.vipPoints,
    gears:c.materials.gears,blueprints:c.materials.blueprints};
  // profileDocument stores economy in structured Firestore groups, not a raw campaignData blob.
  data.progress={...c.progress,hasClaimedFirstTopup:Boolean(c.hasClaimedFirstTopup)};
  data.loadout=c.loadout;
  data.inventory={items:c.items,aircrafts:c.ownedAircrafts,pilots:c.ownedPilots};
  data.materials=c.materials;
  data.missions=c.missionData;
  data.attendance=c.attendance;
  data.eventData=c.eventData||{};
  data.dungeonHistory=c.dungeonHistory||{};
  // c only exists transiently for command execution, not in the Firestore doc.
  delete data.campaignData;
  return { document:data, extra };
}
module.exports={ GameError, executeCommand, utcDay,utcWeek,utcMonth,monthlyAttendanceGoalUTC,random,updateMissions,updateAttendance };
