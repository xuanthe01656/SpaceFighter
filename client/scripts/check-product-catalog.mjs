import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PILOTS, AIRCRAFTS, GEAR_CATALOG, PLANET_CONFIG, STAGE_CONFIG, DUNGEON_CONFIG,
  DEFAULT_CAMPAIGN_DATA, MISSIONS_CONFIG, CRATE_CONFIGS, EVENT_CONFIG } from '../src/constants.js';
import { BALANCE_VERSION, assertModifiers, getBattleEnvironment } from '../src/game/config/BattleRules.js';
import { resolveDungeonDifficulty } from '../src/game/config/DungeonDifficulty.js';
const check = (ok, message) => { if (!ok) throw Error(`CATALOG ERROR: ${message}`); };
const unique = (list, type) => {
  check(Array.isArray(list) && list.length, `${type} must not be empty`);
  const ids = list.map(row => row.id);
  check(ids.every(id => typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id)), `${type} ID format`);
  check(new Set(ids).size === ids.length, `${type} duplicated ID`);
};
unique(PILOTS,'pilots'); unique(AIRCRAFTS,'aircraft');
for (const [type, list] of Object.entries(GEAR_CATALOG)) unique(list,`gear/${type}`);
unique(DUNGEON_CONFIG, 'dungeons'); unique(CRATE_CONFIGS, 'crates'); unique(EVENT_CONFIG,'events');
const pilotKinds = ['main_damage_boost','hp_regen','wing_fire_rate','dodge_and_crit','nova_shield','movement_speed','damage_reduction','bullet_duplicate'];
const armorKinds = ['none','shield','reactive','regen','void','crystal'];
const gunKinds = ['beam','single','spread3','pierce','burst','explosive','spread5','wave','homing','shotgun','charge'];
const droneKinds = ['sniper','shield','bomber','repair','emp','laser','swarm'];
for (const p of PILOTS) check(pilotKinds.includes(p.passive), `unsupported pilot passive ${p.id}`);
for (const g of GEAR_CATALOG.armor) check(armorKinds.includes(g.passive), `unsupported armor passive ${g.id}`);
for (const g of GEAR_CATALOG.mainGun) {
  check(gunKinds.includes(g.firePattern), `unhandled gun pattern ${g.id}`);
  check(Number.isFinite(g.fireRate) && g.fireRate >= 0.05 && g.fireRate <= 60, `mainGun fireRate must be in seconds: ${g.id}`);
}
for (const slot of ['wingman','drone']) {
  for (const g of GEAR_CATALOG[slot]) check(Number.isFinite(g.fireRate) && g.fireRate >= 0 && g.fireRate <= 60000,
    `${slot} fireRate must be milliseconds: ${g.id}`);
}
for (const g of GEAR_CATALOG.drone) check(droneKinds.includes(g.behavior),`unhandled drone behavior ${g.id}`);
for (const [key, p] of Object.entries(PLANET_CONFIG)) {
  check(Number(key) === p.id, `planet key mismatch ${key}`);
  const env = getBattleEnvironment('campaign',p);
  check(env.enemyHpMultiplier === p.enemyHpBuff, `enemyHpBuff legacy mismatch ${p.id}`);
  const slow = env.playerModifiers.find(m=>m.stat==='speed');
  check(Math.abs((slow?.value ?? 1) - (1 - p.speedDebuff)) < .0001, `speedDebuff legacy mismatch ${p.id}`);
}
for (const d of DUNGEON_CONFIG) {
  check(d.waves > 0 && d.waves <= 30, `dungeon waves ${d.id}`);
  check(d.openDays.every(day=>Number.isInteger(day)&&day>=0&&day<=6), `dungeon schedule ${d.id}`);
  check(getBattleEnvironment('dungeon',d).playerModifiers.length === 0, `undocumented dungeon debuff ${d.id}`);
  resolveDungeonDifficulty(d);
}
check(Object.keys(STAGE_CONFIG).length === 10, 'campaign stage count changed');
const campaign = DEFAULT_CAMPAIGN_DATA;
check(AIRCRAFTS.some(a=>a.id===campaign.loadout.aircraft), 'starter aircraft missing');
check(PILOTS.some(p=>p.id===campaign.loadout.pilot), 'starter pilot missing');
for (const slot of ['mainGun','wingman','armor','drone']) {
  const item = campaign.items[campaign.loadout[slot]];
  if (item) check(GEAR_CATALOG[slot].some(g=>g.id===item.baseId), `starter gear missing: ${slot}`);
}
const missionIds = Object.values(MISSIONS_CONFIG).flat().map(m=>m.id);
check(new Set(missionIds).size===missionIds.length, 'duplicate mission IDs');
check(MISSIONS_CONFIG.monthly.some(m=>m.id==='m_login_30' && m.goal===30), 'monthly attendance cap must be 30');
for (const crate of CRATE_CONFIGS) check(Object.values(crate.dropRates).reduce((a,b)=>a+b,0)===100, `dropRates do not sum 100: ${crate.id}`);
for (const event of EVENT_CONFIG) check(event.endTime>event.startTime, `event time window ${event.id}`);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
check(fs.existsSync(path.join(root,'src/game/config/PerformanceProfiles.js')), 'performance profile not found');
console.log(`PASS Product Catalog ${BALANCE_VERSION}: ${AIRCRAFTS.length} ships, ${PILOTS.length} pilots, ${DUNGEON_CONFIG.length} dungeons, ${missionIds.length} missions, ${GEAR_CATALOG.mainGun.length} guns.`);
console.log('PASS persisted IDs/profile, explicit units, loot rates, environment parity and passive compatibility');
