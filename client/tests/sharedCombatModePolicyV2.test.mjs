import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyModeBalanceV2,modePolicyV2,rankedMatchEligibilityV2} from '../src/game/combat/SharedCombatModePolicyV2.js';

test('ranked PvP caps control, healing, shielding, dodge and counter advantage',()=>{
 const pve=applyModeBalanceV2({mode:'pve',controlTicks:100,heal:100,shield:100,dodge:.2,counterMultiplier:1.1});
 const ranked=applyModeBalanceV2({mode:'pvp_ranked',controlTicks:100,heal:100,shield:100,dodge:.2,counterMultiplier:1.1});
 assert.deepEqual(pve,{controlTicks:100,heal:100,shield:100,dodge:.15,counterMultiplier:1.1});
 assert.deepEqual(ranked,{controlTicks:60,heal:65,shield:80,dodge:.06,counterMultiplier:1.06});
 assert.equal(modePolicyV2('pvp_ranked').normalizedLoadout,true);
});
test('ranked matching uses MMR first and Combat Rating only as a fairness gate',()=>{
 assert.equal(rankedMatchEligibilityV2({a:{mmr:1200,combatRating:5000},b:{mmr:1280,combatRating:5500}}).eligible,true);
 assert.equal(rankedMatchEligibilityV2({a:{mmr:1200,combatRating:5000},b:{mmr:1600,combatRating:5100}}).reason,'MMR_GAP');
 assert.equal(rankedMatchEligibilityV2({a:{mmr:1200,combatRating:5000},b:{mmr:1250,combatRating:7000}}).reason,'LOADOUT_GAP');
});
test('search may widen MMR modestly with wait time but never ignores loadout fairness',()=>{
 const widened=rankedMatchEligibilityV2({a:{mmr:1000,combatRating:5000},b:{mmr:1200,combatRating:5200},waitSeconds:90});
 assert.equal(widened.eligible,true);assert.equal(widened.allowedMmrGap,225);
 const unfair=rankedMatchEligibilityV2({a:{mmr:1000,combatRating:5000},b:{mmr:1100,combatRating:6000},waitSeconds:180});
 assert.equal(unfair.reason,'LOADOUT_GAP');
});
