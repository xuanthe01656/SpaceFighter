import test from 'node:test';
import assert from 'node:assert/strict';
import { PILOTS, AIRCRAFTS, GEAR_CATALOG, PLANET_CONFIG, DUNGEON_CONFIG, DEFAULT_CAMPAIGN_DATA } from '../src/constants.js';
import { deriveCombatLoadout, deriveBattleLoadout, fireIntervalMs } from '../src/utils/combatStats.js';
import { BALANCE_VERSION, getBattleEnvironment, applyBattleModifiers, battleSpeedMultiplier } from '../src/game/config/BattleRules.js';
import { resolveDungeonDifficulty } from '../src/game/config/DungeonDifficulty.js';
import { createBattlePassiveState, receiveBattleHit, shouldEchoShot } from '../src/game/combat/BattlePassives.js';
import { choosePerformancePreset, canAutoLoadModel, PERFORMANCE_PRESETS } from '../src/game/config/PerformanceProfiles.js';
const catalogs={PILOTS,AIRCRAFTS,GEAR_CATALOG};
const profile=()=>structuredClone(DEFAULT_CAMPAIGN_DATA);
const eq=(slot,id)=>{const s=profile();s.items.custom={baseId:id,level:1,rarity:1,type:slot};s.loadout[slot]='custom';return s;};
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-8,`${x} != ${y}`);
test('legacy exported identifiers remain stable in v1 catalogs',()=>{
  assert.equal(typeof BALANCE_VERSION,'string');
  assert.equal(AIRCRAFTS.length,16);
  assert.equal(DEFAULT_CAMPAIGN_DATA.loadout.aircraft,'ship_xwing');
  assert.equal(DEFAULT_CAMPAIGN_DATA.loadout.mainGun,'item_start_gun');
  assert.equal(DUNGEON_CONFIG.length,3);
  assert.equal(GEAR_CATALOG.mainGun.length,12);
});
test('no planetary player debuffs except Cryo movement -20%',()=>{
  const state=profile(),baseline=deriveCombatLoadout(state,catalogs);
  for(const planet of Object.values(PLANET_CONFIG)){
    const b=deriveBattleLoadout(state,catalogs,{mode:'campaign',location:planet});
    near(b.stats.speed,baseline.stats.speed*(planet.id===2?.8:1));
    for(const stat of ['atk','armor','fireRate','wingFireRate','droneFireRate','maxHp']) assert.equal(b.stats[stat],baseline.stats[stat]);
    assert.equal(b.environment.enemyHpMultiplier,planet.enemyHpBuff);
    assert.equal(b.cp,baseline.cp);
  }
});
test('dungeon difficulty affects enemies, never silently player stats',()=>{
 const base=deriveCombatLoadout(profile(),catalogs).stats;
 for(const dungeon of DUNGEON_CONFIG){
   const b=deriveBattleLoadout(profile(),catalogs,{mode:'dungeon',location:dungeon});
   assert.deepEqual(b.stats,base);
   assert.equal(getBattleEnvironment('dungeon',dungeon).playerModifiers.length,0);
   assert.ok(resolveDungeonDifficulty(dungeon).spawnBase>0);
 }
});
test('ship base speed is distinguishable; reference ship stays unchanged',()=>{
 const a=deriveCombatLoadout(profile(),catalogs).stats;
 const xwing=AIRCRAFTS.find(x=>x.id==='ship_xwing');
 const scout=AIRCRAFTS.find(x=>x.id==='ship_scout');
 assert.equal(battleSpeedMultiplier(a),1);
 assert.ok(scout,'Scout base ship must remain supported');
 const state=profile();state.loadout.aircraft=scout.id;
 const b=deriveCombatLoadout(state,catalogs).stats;
 near(battleSpeedMultiplier(b)/battleSpeedMultiplier(a),scout.speed/xwing.speed);
});
test('modifier order: flat before multiply, clamps, timer, stack cap, no base mutation',()=>{
 const original={maxHp:100,hp:50,speed:8,atk:100,fireRate:350};
 const modifiers=[
 {id:'flat',stat:'atk',op:'add',value:30}, {id:'factor',stat:'atk',op:'multiply',value:1.2},
 {id:'fire',stat:'fireRate',op:'multiply',value:.01},
 {id:'hp',stat:'maxHp',op:'multiply',value:2},
 {id:'timed',stat:'speed',op:'multiply',value:.5,appliedAtMs:100,durationMs:500},
 {id:'stacked1',stat:'speed',op:'add',value:1,stackGroup:'speed_buff',maxStacks:1},
 {id:'stacked2',stat:'speed',op:'add',value:5,stackGroup:'speed_buff',maxStacks:1},
 ];
 const r=applyBattleModifiers(original,modifiers,200);
 assert.equal(r.atk,156);assert.equal(r.fireRate,50);assert.equal(r.maxHp,200);assert.equal(r.hp,100);
 assert.equal(r.speed,4.5);
 assert.equal(applyBattleModifiers(original,modifiers,700).speed,9);
 assert.deepEqual(original,{maxHp:100,hp:50,speed:8,atk:100,fireRate:350});
 assert.throws(()=>applyBattleModifiers(original,[{id:'bad',stat:'playerLevel',op:'add',value:1}]));
});
test('explicit weapon fire units avoid silent milliseconds vs seconds collisions',()=>{
 assert.equal(fireIntervalMs(0.35,1,400,'seconds'),350);
 assert.equal(fireIntervalMs(5,1,400,'milliseconds'),50);
 assert.equal(fireIntervalMs(1200,1,400,'milliseconds'),1200);
});
test('armor shield absorbs, reactive only projectile reflects, nano heals, void reduces',()=>{
 const shield=deriveCombatLoadout(eq('armor','armor_shield'),catalogs).stats;
 const state=createBattlePassiveState(shield,0); const before=shield.hp;
 const impact=receiveBattleHit(shield,state,100,{nowMs:100,source:'projectile',rng:()=>1});
 assert.ok(impact.absorbed>0); assert.equal(impact.damage,0);assert.equal(shield.hp,before);
 const reactive=deriveCombatLoadout(eq('armor','armor_reactive'),catalogs).stats;
 assert.equal(receiveBattleHit(reactive,createBattlePassiveState(reactive),100,{nowMs:100,rng:()=>1}).reflected,0);
 assert.ok(receiveBattleHit(reactive,createBattlePassiveState(reactive),100,{nowMs:100,source:'projectile',rng:()=>1}).reflected>0);
 assert.ok(deriveCombatLoadout(eq('armor','armor_nano'),catalogs).stats.hpRegenRate>0);
 assert.equal(deriveCombatLoadout(eq('armor','armor_void'),catalogs).stats.dmgReduce,.15);
 assert.equal(deriveCombatLoadout(eq('armor','armor_crystal'),catalogs).stats.reflectRate,.2);
});
test('nova and echo passives have bounded cooldowns, no catalog mutation',()=>{
 const s=profile();s.loadout.pilot='pilot_nova';
 const n=deriveCombatLoadout(s,catalogs).stats;
 const runtime=createBattlePassiveState(n);
 assert.equal(receiveBattleHit(n,runtime,100,{nowMs:100,source:'projectile',rng:()=>1}).novaDamage,800);
 assert.equal(receiveBattleHit(n,runtime,100,{nowMs:200,source:'projectile',rng:()=>1}).novaDamage,0);
 assert.equal(receiveBattleHit(n,runtime,100,{nowMs:15100,source:'projectile',rng:()=>1}).novaDamage,800);
 s.loadout.pilot='pilot_echo';const e=deriveCombatLoadout(s,catalogs).stats;
 const r=createBattlePassiveState(e,1000);
 assert.equal(shouldEchoShot(e,r,8000),false);
 assert.equal(shouldEchoShot(e,r,9000),true);
 assert.equal(shouldEchoShot(e,r,9001),false);
});
test('GPU device quality affects graphics only, high-poly GLBs never auto-load',()=>{
 const mobile=choosePerformancePreset({userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 10)'});
 const low=choosePerformancePreset({userAgent:'iPhone Mobile',deviceMemory:4});
 const desktop=choosePerformancePreset({userAgent:'Mozilla/5.0 (Windows NT 10.0)'});
 assert.equal(mobile.id,'mobile');assert.equal(low.id,'mobileLow');assert.equal(desktop.id,'desktop');
 assert.equal(canAutoLoadModel(57_759_760,mobile),false);
 assert.equal(canAutoLoadModel(60_200_000,desktop),false);
 assert.equal(canAutoLoadModel(120_000,PERFORMANCE_PRESETS.desktop),true);
});
test('battle power buffs expire without drift, with three-stack upper bound',async()=>{
 const {createActiveEffects}=await import('../src/game/combat/ActiveEffects.js');
 const stats={atk:80};const effects=createActiveEffects(stats);
 for(let i=0;i<4;i++) effects.add({id:'power',stat:'atk',op:'add',value:50,
    durationMs:5000,stackGroup:'power',maxStacks:3},1000);
 assert.equal(stats.atk,230);assert.equal(effects.activeCount(),4);
 effects.update(5999);assert.equal(stats.atk,230);
 effects.update(6000);assert.equal(stats.atk,80);assert.equal(effects.activeCount(),0);
 effects.update(99999);assert.equal(stats.atk,80);
});
