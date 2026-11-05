/**
 * Versioned, explainable combat-rating candidate.
 *
 * This is NOT PvP matchmaking rating. It estimates the equipped loadout's
 * battle output from the same effective stats used in combat. Player skill is
 * tracked separately by a server-owned seasonal MMR.
 */
import { resolveIncomingDamageV2 } from './CombatMathV2.js';

export const COMBAT_RATING_VERSION = 'combat-rating-v2.0.0';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const MAIN_PATTERN_VALUE = Object.freeze({
  beam: 1.00,
  single: 1.00,
  spread3: 1.65,
  spread5: 1.85,
  shotgun: 1.90,
  homing: 1.08,
  pierce: 1.25,
  burst: 1.56,
  explosive: 1.35,
  wave: 1.35,
  charge: 1.80,
});
const WING_VALUE = Object.freeze({ homing: 1.05, straight: 1, swarm: 1.44, emp: 0.92 });
const DRONE_VALUE = Object.freeze({ sniper: 1.05, bomber: 1.25, swarm: 1.38, emp: 0.88, shield: 0, repair: 0 });

function averageSkillContribution(skill, atk) {
  if (!skill) return { offenseMultiplier: 1, burstDps: 0, utility: 0, defenseRatio: 0, healPerSecond: 0 };
  const cooldownSeconds = Math.max(1, finite(skill.cooldownTicks, 30) / 30);
  const durationSeconds = Math.max(0, finite(skill.durationTicks, 0) / 30);
  const uptime = clamp(durationSeconds / cooldownSeconds, 0, 0.5);
  const p = skill.params || {};
  let offenseMultiplier = 1;
  let burstDps = 0;
  let utility = 0;
  let defenseRatio = 0;
  let healPerSecond = 0;

  if (skill.kind === 'overdrive' || skill.kind === 'support') {
    const activeDpsFactor = finite(p.damageMultiplier, 1) / Math.max(0.5, finite(p.fireIntervalMultiplier, 1));
    offenseMultiplier += (activeDpsFactor - 1) * uptime;
  }
  if (skill.kind === 'mark') {
    // Mark is not guaranteed to stay on the intended target for the whole window.
    offenseMultiplier += finite(p.markedDamageBonus, 0) * uptime * 0.65;
    utility += finite(p.markedDamageBonus, 0) * 18;
  }
  if (skill.kind === 'pierce') burstDps += atk * finite(p.damageMultiplier, 1) / cooldownSeconds;
  if (skill.kind === 'burst') burstDps += atk * finite(p.shots, 1) * finite(p.shotDamageMultiplier, 1) / cooldownSeconds;
  if (skill.kind === 'area') {
    burstDps += atk * finite(p.damageMultiplier, 0) * 1.35 / cooldownSeconds;
    utility += finite(p.slowTicks, 0) / 30 * 1.5;
  }
  if (skill.kind === 'pull') utility += Math.min(8, finite(p.radius, 0) + finite(p.slowTicks, 0) / 30);
  if (skill.kind === 'barrier' || skill.kind === 'cloak') {
    defenseRatio += (finite(p.shieldRatio, 0) + finite(p.mitigation, 0) * durationSeconds) / cooldownSeconds;
  }
  if (skill.kind === 'heal' || skill.kind === 'support') {
    healPerSecond += finite(p.healRatio, 0) / cooldownSeconds;
    defenseRatio += finite(p.shieldRatio, 0) / cooldownSeconds;
  }
  return { offenseMultiplier, burstDps, utility, defenseRatio, healPerSecond };
}

function armorContribution(armorTrait, mode = 'pve') {
  if (!armorTrait) return { mitigation: 0, dodge: 0, shieldRatio: 0, regenRatioPerSecond: 0, reflectDpsRatio: 0, utility: 0 };
  const p = armorTrait.params || {};
  switch (armorTrait.id) {
    case 'armor_auto_evade': return {
      mitigation: 0,
      dodge: clamp(finite(mode === 'pvp' || mode === 'pvp_ranked'
        ? p.chancePermillePvp : p.chancePermillePve, 0) / 1000, 0, 0.15),
      shieldRatio: 0, regenRatioPerSecond: 0, reflectDpsRatio: 0, utility: 1,
    };
    case 'armor_stable_plating': return {
      mitigation: 1 - finite(p.incomingMultiplier, 1), dodge: 0, shieldRatio: 0,
      regenRatioPerSecond: 0, reflectDpsRatio: 0, utility: 0,
    };
    case 'armor_recharge_shield': return {
      mitigation: 0, dodge: 0, shieldRatio: finite(p.shieldRatio, 0),
      regenRatioPerSecond: finite(p.rechargeRatioPerSecond, 0) * 0.45,
      reflectDpsRatio: 0, utility: 1,
    };
    case 'armor_reactive_plating': return {
      mitigation: 0, dodge: 0, shieldRatio: 0, regenRatioPerSecond: 0,
      reflectDpsRatio: finite(p.reflectRatio, 0) * 0.45, utility: 1,
    };
    case 'armor_nano_repair': return {
      mitigation: 0, dodge: 0, shieldRatio: 0,
      regenRatioPerSecond: finite(p.healRatioPerSecond, 0) * 0.55,
      reflectDpsRatio: 0, utility: 1,
    };
    case 'armor_void_damping': return {
      mitigation: 1 - finite(p.genericIncomingMultiplier, 1), dodge: 0, shieldRatio: 0,
      regenRatioPerSecond: 0, reflectDpsRatio: 0, utility: 1,
    };
    case 'armor_crystal_prism': return {
      mitigation: (1 - finite(p.procIncomingMultiplier, 1)) / Math.max(1, finite(p.hitsPerProc, 1)),
      dodge: 0, shieldRatio: 0, regenRatioPerSecond: 0,
      reflectDpsRatio: finite(p.reflectRatio, 0) / Math.max(1, finite(p.hitsPerProc, 1)), utility: 1,
    };
    default: return { mitigation: 0, dodge: 0, shieldRatio: 0, regenRatioPerSecond: 0, reflectDpsRatio: 0, utility: 0 };
  }
}

export function calculateCombatRatingV2({
  stats,
  mainGun,
  wingman,
  drone,
  aircraft,
  shipSkill = null,
  armorTrait = null,
  referenceWindowSeconds = 20,
  mode = 'pve',
} = {}) {
  const s = stats || {};
  const mainInterval = Math.max(0.05, finite(s.fireRate, 400) / 1000);
  const wingInterval = Math.max(0.05, finite(s.wingFireRate, 800) / 1000);
  const droneInterval = Math.max(0.05, finite(s.droneFireRate, 1000) / 1000);
  const mainPattern = MAIN_PATTERN_VALUE[mainGun?.firePattern] ?? 1;
  const wingPattern = wingman ? (WING_VALUE[wingman.behavior] ?? 1) * 2 : 0;
  const dronePattern = drone ? (DRONE_VALUE[drone.behavior] ?? 1) : 0;
  const critFactor = 1 + 0.15 * clamp(finite(s.critDamageBoost, 0), 0, 2);
  const echoDps = finite(s.echoIntervalMs, 0) > 0
    ? finite(s.atk, 0) * Math.max(1, finite(s.echoCount, 1)) / (s.echoIntervalMs / 1000)
    : 0;
  const baseDps = (
    finite(s.atk, 0) * mainPattern / mainInterval
    + finite(s.wingAtk, 0) * wingPattern / wingInterval
    + finite(s.droneAtk, 0) * dronePattern / droneInterval
    + echoDps
  ) * critFactor;

  const skill = averageSkillContribution(shipSkill, finite(s.atk, 0));
  const armor = armorContribution(armorTrait, mode);
  const offenseDps = Math.max(1, baseDps * skill.offenseMultiplier + skill.burstDps)
    * (1 + armor.reflectDpsRatio);

  const defense = resolveIncomingDamageV2({
    rawDamage: 1,
    armor: finite(s.armor, 0),
    damageReduction: finite(s.dmgReduce, 0),
    incomingMultipliers: [1 - clamp(armor.mitigation, 0, 0.75)],
    mode,
  });
  const armorReduction = defense.armorMitigation;
  const damageReduction = defense.damageReduction;
  const pilotDodge = clamp(finite(s.dodgeRate, 0), 0,
    mode === 'pvp' || mode === 'pvp_ranked' ? .01 : .10);
  const dodge = clamp(1 - (1 - pilotDodge) * (1 - armor.dodge), 0,
    mode === 'pvp' || mode === 'pvp_ranked' ? .06 : .20);
  const incomingFactor = Math.max(0.08, defense.incomingMultiplier * (1 - dodge));
  const shieldHp = finite(s.passiveShieldMax, 0) + finite(s.maxHp, 0) * armor.shieldRatio;
  const regenHp = finite(s.maxHp, 0)
    * clamp(finite(s.hpRegenRate, 0) + armor.regenRatioPerSecond + skill.healPerSecond, 0, 0.08)
    * clamp(finite(referenceWindowSeconds, 20), 5, 60);
  const skillDefenseHp = finite(s.maxHp, 0) * skill.defenseRatio;
  const effectiveHp = Math.max(1, (finite(s.maxHp, 1) + shieldHp + regenHp + skillDefenseHp) / incomingFactor);

  const speed = finite(s.speed, 6);
  const hitbox = clamp(finite(aircraft?.hitboxScale, 0.9), 0.5, 1.6);
  const mobilityFactor = clamp(1 + (speed - 6) * 0.018 + (0.9 - hitbox) * 0.10, 0.88, 1.12);
  const utilityScore = clamp(skill.utility + armor.utility, 0, 12);

  // Geometric mean prevents a single extreme stat from dominating the total.
  const core = Math.sqrt(offenseDps * effectiveHp);
  const total = Math.max(1, Math.round(core * 1.85 * mobilityFactor + utilityScore * 22));
  return Object.freeze({
    version: COMBAT_RATING_VERSION,
    total,
    breakdown: Object.freeze({
      offenseDps: Math.round(offenseDps * 10) / 10,
      effectiveHp: Math.round(effectiveHp),
      mobilityFactor: Math.round(mobilityFactor * 1000) / 1000,
      utilityScore: Math.round(utilityScore * 10) / 10,
      armorReduction: Math.round(armorReduction * 1000) / 1000,
      damageReduction: Math.round(damageReduction * 1000) / 1000,
      dodge: Math.round(dodge * 1000) / 1000,
      shieldHp: Math.round(shieldHp),
      regenHpInWindow: Math.round(regenHp),
    }),
  });
}
