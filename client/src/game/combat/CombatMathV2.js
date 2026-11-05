/**
 * Versioned defensive combat math for Shared Combat Rules V2 candidates.
 *
 * Legacy combat uses linear armor/100 with a hard cap. V2 uses diminishing
 * returns and a mode-level total mitigation ceiling so adding new ships,
 * pilots and armor cannot drift toward practical invulnerability.
 */
export const COMBAT_MATH_VERSION = 'combat-math-v2.0.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const DEFENSE_POLICY_V2 = Object.freeze({
  pve: Object.freeze({
    id: 'pve', armorConstant: 180, armorMitigationCap: 0.60,
    damageReductionCap: 0.35, totalMitigationCap: 0.80,
  }),
  pvp: Object.freeze({
    id: 'pvp', armorConstant: 200, armorMitigationCap: 0.50,
    damageReductionCap: 0.20, totalMitigationCap: 0.65,
  }),
});

export function defensePolicyV2(mode = 'pve') {
  return mode === 'pvp' || mode === 'pvp_ranked'
    ? DEFENSE_POLICY_V2.pvp
    : DEFENSE_POLICY_V2.pve;
}

export function armorMitigationV2(armor, { mode = 'pve' } = {}) {
  const policy = defensePolicyV2(mode);
  const value = Math.max(0, finite(armor, 0));
  const curved = value / Math.max(1, value + policy.armorConstant);
  return clamp(curved, 0, policy.armorMitigationCap);
}

/**
 * Order: raw -> base armor/damage reduction -> temporary/passive multipliers.
 * Shields/barriers consume the returned damage afterwards. This keeps shields
 * as effective HP and avoids draining them before a dodge or base defense.
 */
export function resolveIncomingDamageV2({
  rawDamage,
  armor = 0,
  damageReduction = 0,
  incomingMultipliers = [],
  mode = 'pve',
} = {}) {
  const raw = Math.max(0, finite(rawDamage, 0));
  if (raw <= 0) return Object.freeze({
    raw: 0, damage: 0, armorMitigation: 0, damageReduction: 0,
    incomingMultiplier: 0, totalMitigation: 0,
  });
  const policy = defensePolicyV2(mode);
  const armorMitigation = armorMitigationV2(armor, { mode });
  const reduction = clamp(finite(damageReduction, 0), 0, policy.damageReductionCap);
  let multiplier = (1 - armorMitigation) * (1 - reduction);
  for (const value of incomingMultipliers) multiplier *= clamp(finite(value, 1), 0.25, 1.25);
  const minimumMultiplier = 1 - policy.totalMitigationCap;
  multiplier = clamp(multiplier, minimumMultiplier, 1.25);
  return Object.freeze({
    raw,
    damage: Math.max(1, raw * multiplier),
    armorMitigation: Math.round(armorMitigation * 10000) / 10000,
    damageReduction: Math.round(reduction * 10000) / 10000,
    incomingMultiplier: Math.round(multiplier * 10000) / 10000,
    totalMitigation: Math.round((1 - multiplier) * 10000) / 10000,
  });
}
