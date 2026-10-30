import test from 'node:test';
import assert from 'node:assert/strict';
import {C15_RULES_DOCUMENT,C15_RULES_VERSION,C15_CATALOG_VERSION,
  normalizeC15CombatDescriptor,assertC15RulesDocument} from '../src/game/config/C15RulesV2.js';
function equipment(overrides={}){
  return {pilot:{id:'pilot_alpha',level:1,stars:1,rarity:1,passive:'main_damage_boost',value:.1},
    aircraft:{id:'ship_xwing',level:1,stars:1,baseHp:1050,baseAtk:55,baseArmor:20,speed:6,
      hitboxScale:.78,passive:null,passiveValue:null},
    mainGun:{instanceId:'qa_rail',baseId:'gun_rail',slot:'mainGun',level:1,rarity:1,baseAtk:48,
      baseHp:null,fireRate:.25,fireRateUnit:'seconds',firePattern:'pierce',behavior:null,
      projectileType:'rail',passive:null},wingman:null,armor:null,drone:null,...overrides};
}
test('C15 rules document is immutable, bounded and versioned',()=>{
  assert.equal(assertC15RulesDocument(),true);
  assert.equal(C15_RULES_DOCUMENT.version,C15_RULES_VERSION);
  assert.equal(C15_RULES_DOCUMENT.catalogVersion,C15_CATALOG_VERSION);
  assert.equal(C15_RULES_DOCUMENT.maxBattleTicks,4500);
  assert.equal(C15_RULES_DOCUMENT.maxJournalChunks,256);
  assert.equal(Object.isFrozen(C15_RULES_DOCUMENT.weaponPatternRegistry['pierce:rail']),true);
});
test('C15 normalizes pinned Alpha/X-Wing/Rail through generic registries',()=>{
  const d=normalizeC15CombatDescriptor(equipment());
  assert.equal(d.loadoutId,'alpha-xwing-rail-l1');
  assert.equal(d.stats.maxHp,1050);
  assert.equal(d.stats.attack,113);
  assert.equal(d.stats.movePerTickUnits,600);
  assert.equal(d.stats.fireIntervalMs,250);
  assert.equal(d.mainGun.pattern.handler,'pierce');
  assert.equal(d.mainGun.pattern.penetration,3);
});
test('C15 unknown or unverified mechanics fail closed',()=>{
  assert.throws(()=>normalizeC15CombatDescriptor(equipment({pilot:{...equipment().pilot,passive:'chain_lightning'}})),/unsupported/);
  assert.throws(()=>normalizeC15CombatDescriptor(equipment({mainGun:{...equipment().mainGun,firePattern:'homing',projectileType:'laser'}})),/unsupported/);
  assert.throws(()=>normalizeC15CombatDescriptor(equipment({pilot:{...equipment().pilot,id:'pilot_viper',passive:'movement_speed',value:.3}})),/pinned|not RC1/);
});
