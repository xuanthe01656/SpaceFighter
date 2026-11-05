/**
 * Cross-mode balance policy candidate for Shared Combat Rules V2.
 * Combat Rating gates equipment fairness; server-owned MMR ranks player skill.
 */
export const COMBAT_MODE_POLICY_VERSION = 'combat-mode-policy-v2.0.0';
export const COMBAT_MODE_POLICIES_V2 = Object.freeze({
  pve: Object.freeze({
    id: 'pve', controlDurationMultiplier: 1, healMultiplier: 1, shieldMultiplier: 1,
    dodgeCap: .15, counterDeltaCap: .10, progressionAdvantageCap: 1,
    normalizedLoadout: false,
  }),
  pvp_casual: Object.freeze({
    id: 'pvp_casual', controlDurationMultiplier: .75, healMultiplier: .80, shieldMultiplier: .90,
    dodgeCap: .08, counterDeltaCap: .08, progressionAdvantageCap: .25,
    normalizedLoadout: false,
  }),
  pvp_ranked: Object.freeze({
    id: 'pvp_ranked', controlDurationMultiplier: .60, healMultiplier: .65, shieldMultiplier: .80,
    dodgeCap: .06, counterDeltaCap: .06, progressionAdvantageCap: .15,
    normalizedLoadout: true,
  }),
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export function modePolicyV2(mode='pve') {
  return COMBAT_MODE_POLICIES_V2[mode] || COMBAT_MODE_POLICIES_V2.pve;
}

export function applyModeBalanceV2({
  mode='pve',controlTicks=0,heal=0,shield=0,dodge=0,counterMultiplier=1,
}={}) {
  const policy=modePolicyV2(mode);
  const delta=clamp(finite(counterMultiplier,1)-1,-policy.counterDeltaCap,policy.counterDeltaCap);
  return Object.freeze({
    controlTicks:Math.max(0,Math.round(finite(controlTicks,0)*policy.controlDurationMultiplier)),
    heal:Math.max(0,Math.round(finite(heal,0)*policy.healMultiplier)),
    shield:Math.max(0,Math.round(finite(shield,0)*policy.shieldMultiplier)),
    dodge:clamp(finite(dodge,0),0,policy.dodgeCap),
    counterMultiplier:Math.round((1+delta)*1000)/1000,
  });
}

/**
 * MMR is the primary search axis. Combat Rating is only a fairness gate and
 * never becomes the leaderboard score.
 */
export function rankedMatchEligibilityV2({
  a,b,waitSeconds=0,maxMmrGap=150,maxCombatRatingRatio=1.15,
}={}) {
  if(!a||!b)return Object.freeze({eligible:false,reason:'MISSING_PLAYER'});
  const wait=clamp(finite(waitSeconds,0),0,180);
  const allowedMmrGap=clamp(maxMmrGap+Math.floor(wait/30)*25,maxMmrGap,maxMmrGap+150);
  const mmrGap=Math.abs(finite(a.mmr,0)-finite(b.mmr,0));
  const low=Math.max(1,Math.min(finite(a.combatRating,1),finite(b.combatRating,1)));
  const high=Math.max(low,finite(a.combatRating,1),finite(b.combatRating,1));
  const combatRatingRatio=high/low;
  if(mmrGap>allowedMmrGap)return Object.freeze({eligible:false,reason:'MMR_GAP',mmrGap,allowedMmrGap,combatRatingRatio});
  if(combatRatingRatio>maxCombatRatingRatio)return Object.freeze({eligible:false,reason:'LOADOUT_GAP',mmrGap,allowedMmrGap,combatRatingRatio});
  return Object.freeze({eligible:true,reason:'OK',mmrGap,allowedMmrGap,combatRatingRatio});
}
