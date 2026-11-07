import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AIRCRAFTS} from '../src/game/catalog/aircraft.js';
import {GEAR_CATALOG} from '../src/game/catalog/gear.js';
import {ARMOR_ABILITY_TRAITS,GUEST_ABILITY_RULES_VERSION,GUN_DAMAGE_TYPES,SHIP_ACTIVE_SKILLS,
  guestCounterMultiplier,validateGuestAbilityCatalog} from '../src/game/combat/GuestAbilityCatalogV1.js';
import {createGuestAbilityRuntime} from '../src/game/combat/GuestAbilityRuntimeV1.js';

test('16 owned ship catalog IDs each map to exactly one manual skill',()=>{
 assert.equal(validateGuestAbilityCatalog(AIRCRAFTS,GEAR_CATALOG.armor),true);
 assert.equal(Object.keys(SHIP_ACTIVE_SKILLS).length,16);
 assert.equal(new Set(Object.values(SHIP_ACTIVE_SKILLS).map(s=>s.id)).size,16);
 assert.equal(Object.values(SHIP_ACTIVE_SKILLS).every(s=>s.cooldownTicks>0),true);
});

test('all seven armors declared with manual or existing passive trigger',()=>{
 assert.equal(Object.keys(ARMOR_ABILITY_TRAITS).length,7);
 assert.equal(Object.values(ARMOR_ABILITY_TRAITS).filter(x=>x.trigger==='manual').length,3);
 for(const [id,trait] of Object.entries(ARMOR_ABILITY_TRAITS)){
  const runtime=createGuestAbilityRuntime({aircraftId:'ship_xwing',armorId:id,maxHp:1000});
  assert.equal(runtime.snapshot().armor!==null,trait.trigger==='manual');
 }
});

test('every ship can activate once and is blocked until exact 30Hz cooldown',()=>{
 for(const id of Object.keys(SHIP_ACTIVE_SKILLS)){
  const runtime=createGuestAbilityRuntime({aircraftId:id,maxHp:1800});
  assert.equal(runtime.snapshot().version,GUEST_ABILITY_RULES_VERSION);
  assert.equal(runtime.activate('ship_skill').ok,true,id);
  assert.equal(runtime.activate('ship_skill').reason,'COOLDOWN',id);
  const cooldown=SHIP_ACTIVE_SKILLS[id].cooldownTicks;
  runtime.advanceTicks(cooldown-1);
  assert.equal(runtime.snapshot().ship.ready,false,id);
  runtime.advanceTicks(1);
  assert.equal(runtime.snapshot().ship.ready,true,id);
  assert.equal(runtime.activate('ship_skill').ok,true,id);
 }
});

test('guest active barrier is capped, absorbs non-negative incoming damage, expires',()=>{
 const r=createGuestAbilityRuntime({aircraftId:'ship_tank',armorId:'armor_shield',maxHp:1000});
 r.activate('ship_skill');r.activate('armor_active');
 assert.ok(r.snapshot().barrierHp>0);
 assert.ok(r.snapshot().barrierHp<=350);
 const hit=r.absorb(70); assert.equal(hit.remaining,0); assert.equal(hit.absorbed,70);
 assert.equal(r.absorb(-100).remaining,0);
 r.advanceTicks(151);
 assert.equal(r.snapshot().barrierHp,0);
});

test('ability modifiers expire without touching persistent catalog or stats',()=>{
 const r=createGuestAbilityRuntime({aircraftId:'ship_raptor',maxHp:1000});
 assert.equal(r.modifiers().fireIntervalMultiplier,1);
 r.activate('ship_skill');
 assert.ok(r.modifiers().fireIntervalMultiplier<1);
 r.advanceTicks(SHIP_ACTIVE_SKILLS.ship_raptor.durationTicks);
 assert.equal(r.modifiers().fireIntervalMultiplier,1);
 assert.equal(SHIP_ACTIVE_SKILLS.ship_raptor.params.fireIntervalMultiplier,.65);
});

test('two runtimes given identical activation trace have identical state',()=>{
 const a=createGuestAbilityRuntime({aircraftId:'ship_nova',armorId:'armor_light',maxHp:1800});
 const b=createGuestAbilityRuntime({aircraftId:'ship_nova',armorId:'armor_light',maxHp:1800});
 for(const r of [a,b]){
  r.activate('ship_skill');r.advanceTicks(17);r.activate('armor_active');
  r.advanceTicks(45);r.absorb(120);r.advanceTicks(400);r.activate('ship_skill');
 }
 assert.deepEqual(a.snapshot(),b.snapshot());
});

test('soft counters bounded, main guns mapped without changing original catalogs',()=>{
 assert.equal(Object.keys(GUN_DAMAGE_TYPES).length,12);
 for(const damageType of ['kinetic','energy','ion','explosive','void'])for(let tier=1;tier<=4;tier++){
  const result=guestCounterMultiplier({damageType,targetTier:tier,marked:true});
  assert.ok(result>=.85&&result<=1.15);
 }
 assert.ok(guestCounterMultiplier({damageType:'kinetic',targetTier:4})>1);
 assert.ok(guestCounterMultiplier({damageType:'energy',targetTier:3})<1);
});

test('QA source wiring uses the explicit Guest-only browser/mobile build gate without C15 mutation',async()=>{
 const fs=await import('node:fs');
 const engine=fs.readFileSync(new URL('../src/components/Campaign/CampaignEngine.jsx',import.meta.url),'utf8');
 const scene=fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js',import.meta.url),'utf8');
 const gate=fs.readFileSync(new URL('../src/game/combat/GuestCombatQaBuildGateV2.js',import.meta.url),'utf8');
 assert.match(engine,/resolveGuestCombatQaRuntimeFromViteEnv\(import\.meta\.env/);
 assert.match(scene,/resolveGuestCombatQaRuntimeFromViteEnv\(import\.meta\.env/);
 assert.match(gate,/VITE_SF_GUEST_ABILITIES_QA/);
 assert.match(gate,/VITE_SF_GUEST_COMBAT_V2_QA/);
 assert.match(gate,/staging-qa/);
 assert.match(gate,/authenticated \|\| cloudBattle/);
 assert.doesNotMatch(scene,/GAME_C15_RC1B_HMAC_KEY_B64/);
 assert.match(scene,/createGuestBattleQaResultV26A/);
 assert.match(scene,/if \(guestAbilityQa\) \{[\s\S]*?publishGuestBattleQaResult\('defeat'\)/);
 assert.match(scene,/if\(guestAbilityQa\)\{[\s\S]{0,400}?publishGuestBattleQaResult\('victory'\)[\s\S]{0,120}?return;/);
 assert.doesNotMatch(scene,/if\(guestAbilityQa\)\{onDefeat\(\);return;\}/);
 assert.doesNotMatch(scene,/scheduleBattleTimer\(\(\)=>onVictory\(\),2600\)/);
 assert.match(scene,/__sf_guest_lab_armor__/);
});
