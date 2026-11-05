/**
 * Shared combat math used by HQ, Campaign and Dungeon.
 * Pure (no Babylon, React, network or Firebase dependency) for deterministic tests.
 * Catalogs are supplied by caller so server-side validation can use its own copies.
 */
import { applyBattleModifiers, getBattleEnvironment } from '../game/config/BattleRules.js';
import { ARMOR_TRAITS_V2, SHIP_ACTIVE_SKILLS_V2 } from '../game/combat/GuestAbilityCatalogV2.js';
import { calculateCombatRatingV2 } from '../game/combat/CombatRatingV2.js';

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function dynamicGearStat(base, level = 1, rarity = 1, isHp = false) {
  const value = Math.max(0, finite(base, 0));
  if (!value) return 0;
  const lv = clamp(Math.floor(finite(level, 1)), 1, 1000);
  const rar = clamp(Math.floor(finite(rarity, 1)), 1, 5);
  const perLevel = Math.max(isHp ? 5 : 1, Math.round(value * 0.1 + rar * (isHp ? 10 : 2)));
  return value + perLevel * (lv - 1);
}

/** The main-gun catalog uses seconds, while wingman/drone catalogs use ms. */
export function fireIntervalMs(value, level = 1, fallback = 400, unit = 'legacy') {
  const rate = finite(value, 0);
  if (rate <= 0) return fallback;
  const baseMs = unit === 'seconds' ? rate * 1000 : unit === 'milliseconds' ? rate : rate < 10 ? rate * 1000 : rate;
  return Math.max(50, baseMs * Math.pow(0.985, clamp(Math.floor(finite(level, 1)), 1, 1000) - 1));
}

export function calculateHitDamage(rawDamage, stats, rng = Math.random) {
  const dodgeRate = clamp(finite(stats?.dodgeRate, 0), 0, 0.9);
  if (dodgeRate > 0 && rng() < dodgeRate) return { dodged: true, damage: 0 };
  const armorCap = clamp(finite(stats?.armorCap, 0.9), 0, 0.9);
  const armorReduction = clamp(finite(stats?.armor, 0) / 100, 0, armorCap);
  const pilotReduction = clamp(finite(stats?.dmgReduce, 0), 0, 0.9);
  const damage = Math.max(1, Math.floor(Math.max(0, finite(rawDamage, 0)) * (1 - armorReduction) * (1 - pilotReduction)));
  return { dodged: false, damage };
}

export function calculateProjectileDamage(atk, critBoost = 0, rng = Math.random) {
  const base = Math.max(0, finite(atk, 0));
  const boost = clamp(finite(critBoost, 0), 0, 10);
  return base * (boost > 0 && rng() < 0.15 ? 1 + boost : 1);
}

export function deriveCombatLoadout(campaignData, { PILOTS, AIRCRAFTS, GEAR_CATALOG }, {
  armorPassivePolicy = 'legacy',
  combatRatingVersion = 'legacy',
} = {}) {
  const c = campaignData || {};
  const loadout = c.loadout || {};
  const items = c.items || {};
  const pilotBase = PILOTS.find(p => p.id === loadout.pilot) || PILOTS[0];
  const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
  const level = clamp(Math.floor(finite(c.ownedAircrafts?.[loadout.aircraft]?.level, 1)), 1, 1000);
  const gear = {};
  for (const slot of ['mainGun', 'wingman', 'armor', 'drone']) {
    const item = items[loadout[slot]] || null;
    gear[slot] = { item, base: item ? GEAR_CATALOG[slot]?.find(g => g.id === item.baseId) || null : null };
  }
  const baseAcHp = Math.floor((aircraftBase?.baseHp || 1000) * (1 + (level - 1) * 0.05));
  const baseAcAtk = Math.floor((aircraftBase?.baseAtk || 10) * (1 + (level - 1) * 0.05));
  const baseAcArmor = Math.floor((aircraftBase?.baseArmor || 20) * (1 + (level - 1) * 0.05));
  const atkGun = dynamicGearStat(gear.mainGun.base?.baseAtk, gear.mainGun.item?.level, gear.mainGun.item?.rarity);
  const atkWing = dynamicGearStat(gear.wingman.base?.baseAtk, gear.wingman.item?.level, gear.wingman.item?.rarity);
  const atkDrone = dynamicGearStat(gear.drone.base?.baseAtk, gear.drone.item?.level, gear.drone.item?.rarity);
  const extraHp = dynamicGearStat(gear.armor.base?.baseHp, gear.armor.item?.level, gear.armor.item?.rarity, true);
  let mainAtkMultiplier = 1, wingRateMultiplier = 1, speedMultiplier = 1;
  let hpRegenRate = 0, dmgReduce = 0, dodgeRate = 0, critDamageBoost = 0;
  const value = pilotBase?.value;
  switch (pilotBase?.passive) {
    case 'main_damage_boost': mainAtkMultiplier += finite(value, 0); break;
    case 'wing_fire_rate': wingRateMultiplier = clamp(1 - finite(value, 0), 0.1, 1); break;
    case 'movement_speed': speedMultiplier += finite(value, 0); break;
    case 'hp_regen': hpRegenRate = clamp(finite(value, 0), 0, 1); break;
    case 'damage_reduction': dmgReduce = clamp(finite(value, 0), 0, 0.9); break;
    case 'dodge_and_crit':
      dodgeRate = clamp(finite(value?.dodge, 0.15), 0, 0.9);
      critDamageBoost = clamp(finite(value?.critDamage, 0.25), 0, 10);
      break;
    default: break;
  }
  const stats = {
    maxHp: Math.floor(baseAcHp + extraHp), hp: Math.floor(baseAcHp + extraHp),
    atk: Math.floor((baseAcAtk + atkGun) * mainAtkMultiplier),
    wingAtk: atkWing, droneAtk: atkDrone, armor: baseAcArmor,
    speed: (aircraftBase?.speed || 6) * speedMultiplier,
    fireRate: fireIntervalMs(gear.mainGun.base?.fireRate, gear.mainGun.item?.level, 400, 'seconds'),
    wingFireRate: fireIntervalMs(gear.wingman.base?.fireRate, gear.wingman.item?.level, 600, 'milliseconds') * wingRateMultiplier,
    droneFireRate: fireIntervalMs(gear.drone.base?.fireRate, gear.drone.item?.level, 800, 'milliseconds'),
    mainGunId: gear.mainGun.base?.id || 'gun_laser',
    wingmanId: gear.wingman.base?.id || null,
    droneId: gear.drone.base?.id || null,
    hpRegenRate, dmgReduce, dodgeRate, critDamageBoost,
    // Production candidate uses a lower cap so extreme armor values cannot
    // approach immunity. Legacy callers keep the previous 90% behavior.
    armorCap: combatRatingVersion === 'v2' ? 0.75 : 0.9,
  };
  // All equipped armor passives are resolved from catalog IDs, not stored in
  // the player profile. Only active battle runtime owns their mutable state.
  const armorPassive = armorPassivePolicy === 'legacy' ? gear.armor.base?.passive || 'none' : 'none';
  stats.armorPassive = armorPassive;
  stats.passiveShieldMax = armorPassive === 'shield' ? Math.round(stats.maxHp * 0.20) : 0;
  stats.reflectRate = armorPassive === 'reactive' ? 0.15 : armorPassive === 'crystal' ? 0.20 : 0;
  stats.reflectProjectilesOnly = armorPassive === 'reactive';
  if (armorPassive === 'regen') stats.hpRegenRate = clamp(stats.hpRegenRate + 0.006, 0, .15);
  if (armorPassive === 'void') stats.dmgReduce = clamp(stats.dmgReduce + 0.15, 0, .9);
  stats.novaExplosionDamage = pilotBase?.passive === 'nova_shield' ? Math.max(0, finite(value, 0)) : 0;
  stats.echoIntervalMs = pilotBase?.passive === 'bullet_duplicate' ? clamp(finite(value?.interval, 8000), 1000, 60000) : 0;
  stats.echoCount = pilotBase?.passive === 'bullet_duplicate' ? clamp(Math.floor(finite(value?.count, 1)), 1, 3) : 0;
  const effectiveHp = stats.maxHp / Math.max(0.1, (1 - stats.dmgReduce));
  const pilotBonus = ['nova_shield', 'bullet_duplicate'].includes(pilotBase?.passive) ? (pilotBase.rarity || 1) * 500 : 0;
  const legacyCp = Math.floor((stats.atk + stats.wingAtk + stats.droneAtk) * 3 + effectiveHp * 0.5 + stats.armor * 10 + pilotBonus);
  const combatRatingV2 = calculateCombatRatingV2({
    stats,
    mainGun: gear.mainGun.base,
    wingman: gear.wingman.base,
    drone: gear.drone.base,
    aircraft: aircraftBase,
    shipSkill: SHIP_ACTIVE_SKILLS_V2[aircraftBase?.id] || null,
    armorTrait: ARMOR_TRAITS_V2[gear.armor.base?.id] || null,
  });
  const cp = combatRatingVersion === 'v2' ? combatRatingV2.total : legacyCp;
  return { stats, cp, legacyCp, combatRatingV2, pilotBase, aircraftBase, gear, aircraftLevel: level };
}

/** Battle-local effective loadout; safe to recompute without saving profile. */
export function deriveBattleLoadout(campaignData, catalogs, {
  mode,
  location,
  nowMs = 0,
  armorPassivePolicy = 'legacy',
  combatRatingVersion = 'legacy',
}) {
  const base = deriveCombatLoadout(campaignData, catalogs, { armorPassivePolicy, combatRatingVersion });
  const environment = getBattleEnvironment(mode, location);
  const stats = applyBattleModifiers(base.stats, environment.playerModifiers, nowMs);
  if (stats.armorPassive === 'shield') stats.passiveShieldMax = Math.round(stats.maxHp * .20);
  return { ...base, stats, baseStats: base.stats, environment };
}
