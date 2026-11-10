import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  c15Alpha1ProjectileAppearance,c15ProjectileVisualYaw,c15NewHostileVolleySources,
} from '../src/game/rendering/C15BattleVisualParity.js';
import {projectileFxProfile} from '../src/game/rendering/PlayerFxProfiles.js';
import {GEAR_CATALOG} from '../src/game/catalog/gear.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('C15 stage1 friendly visual matches current pinned Guest gun_rail, not a cyan generic laser',()=>{
  const rail=GEAR_CATALOG.mainGun.find(weapon=>weapon.id==='gun_rail');
  assert.equal(rail?.firePattern,'pierce');
  assert.equal(rail?.projectileType,'rail');
  assert.equal(rail?.color,0xffffff);
  const appearance=c15Alpha1ProjectileAppearance(false);
  assert.equal(appearance.projectileType,rail.projectileType);
  assert.equal(appearance.color,rail.color);
  assert.equal(appearance.visualScale,1.8);
  const spec=projectileFxProfile(appearance);
  assert.equal(spec.type,'rail');
  assert.equal(spec.style,'bolt');
  assert.equal(spec.color,0xffffff);
});
test('C15 hostile shot adopts the Guest directional red-bolt presentation without changing combat movement',()=>{
  const p=c15Alpha1ProjectileAppearance(true);
  assert.equal(p.color,0xff4757);
  const spec=projectileFxProfile(p);
  assert.equal(spec.style,'bolt');
  assert.ok(spec.length>spec.width);
  const guest=read('src/components/Campaign/CampaignScene.js');
  assert.match(guest,/createCampaignProjectileVisualFactoryV32/);
  assert.match(guest,/hostileProjectileVisuals\.create/);
  assert.doesNotMatch(guest,/MeshBuilder\.CreateBox\(hitId/);
  const hostileVisual=read('src/game/rendering/CampaignProjectileVisualV32.js');
  assert.match(hostileVisual,/drawCampaignProjectileTextureV32/);
  assert.match(hostileVisual,/enemy_energy_dart/);
  const renderer=read('src/components/C15LocalAlpha1/C15LocalRenderer.js');
  assert.match(renderer,/c15Alpha1ProjectileAppearance\(hostile\)/);
  assert.match(renderer,/drawProjectileTexture\(ctx,spec\)/);
  assert.doesNotMatch(renderer,/shots\.advance|movePerTick\s*=|damagePlayer\(/);
});
test('C15 visual heading follows the true server projectile velocity',()=>{
  const eq=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
  eq(c15ProjectileVisualYaw({velocityXUnitsPerTick:0,velocityZUnitsPerTick:-2700}),0);
  eq(c15ProjectileVisualYaw({velocityXUnitsPerTick:-1000,velocityZUnitsPerTick:0}),Math.PI/2);
  eq(c15ProjectileVisualYaw({vxUnits:0,vzUnits:480},true),-Math.PI);
  eq(c15ProjectileVisualYaw({vxUnits:480,vzUnits:0},true),-Math.PI/2);
  eq(c15ProjectileVisualYaw({},false),0);
  eq(c15ProjectileVisualYaw({},true),Math.PI);
});
test('Only newly observed authoritative enemy shots trigger attack animation cues',()=>{
  let r=c15NewHostileVolleySources(new Set(),[
    {id:12,sourceId:'alpha1_w1_e1'},{id:13,sourceId:'alpha1_w1_e1'},
    {id:14,sourceId:'alpha1_w1_e2'}]);
  assert.deepEqual(r.sources.sort(),['alpha1_w1_e1','alpha1_w1_e2']);
  assert.equal(r.ids.size,3);
  r=c15NewHostileVolleySources(r.ids,[{id:13,sourceId:'alpha1_w1_e1'},{id:14,sourceId:'alpha1_w1_e2'}]);
  assert.deepEqual(r.sources,[]);
  r=c15NewHostileVolleySources(r.ids,[{id:15,sourceId:'alpha1_w1_e2'}]);
  assert.deepEqual(r.sources,['alpha1_w1_e2']);
  const renderer=read('src/components/C15LocalAlpha1/C15LocalRenderer.js');
  assert.match(renderer,/enemyAttackUntilTick/);
  assert.match(renderer,/setState\(attackUntil>=/);
});
test('Visual patch does not modify C15 input/kernel or any server authority route',()=>{
  const visual=read('src/game/rendering/C15BattleVisualParity.js');
  assert.doesNotMatch(visual,/gameAction\(|fetch\(|Firestore\.|localStorage\.|claimVerifiedReward\(|setHp\(|Math\.random\(/);
  assert.match(visual,/never affect position, AI, damage or RNG/i);
});
