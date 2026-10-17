import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AIRCRAFTS, GEAR_CATALOG } from '../src/constants.js';
import { projectileFxProfile, thrusterFxProfile } from '../src/game/rendering/PlayerFxProfiles.js';
import { createProjectileEmitter } from '../src/game/combat/ProjectileEmitter.js';
import { describeMainSalvo } from '../src/game/combat/PlayerWeapons.js';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const cm = read('../src/components/Campaign/CampaignScene.js');
const dm = read('../src/components/Dungeon/DungeonScene.js');

// Defensive scene integration regression: neither mode is allowed to silently
// fork player-shot shape or the thruster offset/density again.
test('Campaign and Dungeon both use the same engine exhaust and projectile emitters', () => {
  for (const source of [cm, dm]) {
    assert.match(source, /createShipEngineFx\(\{ scene, BABYLON, playerRoot, aircraft: aircraftBase, quality \}\)/);
    assert.match(source, /createProjectileEmitter\(\{ scene, BABYLON, bullets: playerBullets, scheduleBattleTimer \}\)/);
    assert.doesNotMatch(source, /new BABYLON\.ParticleSystem\(['"](?:eFx|engineFx)['"]/);
  }
});

test('X-Wing exhaust uses its aircraft mount, not a Dungeon hard-coded mount', () => {
  const aircraft = AIRCRAFTS.find(s => s.id === 'ship_xwing');
  const desktop = thrusterFxProfile(aircraft, { particleFraction: 1 });
  const mobile = thrusterFxProfile(aircraft, { particleFraction: .65 });
  assert.deepEqual(desktop.offset, aircraft.engineOffset);
  assert.deepEqual(mobile.offset, desktop.offset);
  assert.equal(mobile.scale, desktop.scale);
  assert.equal(desktop.tint, mobile.tint);
  assert.equal(desktop.directionZ, 1);
  assert.ok(mobile.coreEmitRate < desktop.coreEmitRate);
  assert.ok(mobile.rimEmitRate < desktop.rimEmitRate);
});

test('laser bolt is compact on narrow mobile displays without changing shot damage', () => {
  const weapon = GEAR_CATALOG.mainGun.find(g => g.id === 'gun_laser');
  const salvo = describeMainSalvo(weapon, { x: 2, z: 10 }, 80);
  assert.equal(salvo.length, 1);
  const spec = projectileFxProfile(salvo[0]);
  assert.equal(spec.style, 'bolt');
  assert.ok(spec.hasContrastBorder);
  assert.ok(spec.length < 1.2, 'beam should no longer be an ~86px rectangle');
  assert.equal(salvo[0].atk, 80, 'pure visual update must preserve damage');
  assert.equal(salvo[0].vz, -1.15, 'pure visual update must preserve projectile speed');
});

test('all 12 weapons have bounded render dimensions and contrast on bright/dark worlds', () => {
  for (const gun of GEAR_CATALOG.mainGun) {
    for (const shot of describeMainSalvo(gun, {x:0,z:8}, 60)) {
      const a = projectileFxProfile(shot);
      assert.ok(a.width > 0 && a.width <= 2.4, gun.id);
      assert.ok(a.length > 0 && a.length <= 2.4, gun.id);
      assert.ok(a.hasContrastBorder, gun.id);
      assert.equal(a.color, gun.color);
    }
  }
});

test('cached dynamic sprite materials are reused across salvos and disposed safely', () => {
  const mats = [], tex = [], meshes = [], cleanup = [];
  const ctx = new Proxy({}, {get: (_obj,k)=>k === 'createLinearGradient' ? (()=>({addColorStop(){}})) :
    ['clearRect','beginPath','arc','fill','stroke','moveTo','lineTo','ellipse'].includes(k) ? (()=>{}) : undefined,
    set:()=>true});
  class DynamicTexture {
    constructor(name){this.name=name;tex.push(this);}
    getContext(){return ctx;}
    update(){this.updated=true;}
    dispose(){this.disposed=true;}
  }
  class StandardMaterial {
    constructor(name){this.name=name;mats.push(this);}
    dispose(){this.disposed=true;}
  }
  function mesh(){const m={position:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{}};meshes.push(m);return m;}
  const B={DynamicTexture,StandardMaterial,Material:{MATERIAL_ALPHABLEND:2},Color3:{FromHexString:x=>x},
    MeshBuilder:{CreatePlane:mesh,CreateSphere:mesh,CreateCylinder:mesh}};
  const scene={isDisposed:()=>false,onDisposeObservable:{addOnce:fn=>cleanup.push(fn)}};
  const bullets=[];const emitter=createProjectileEmitter({scene,BABYLON:B,bullets,scheduleBattleTimer:()=>{}});
  const s=describeMainSalvo(GEAR_CATALOG.mainGun[0],{x:0,z:8},80);
  emitter.fire(s);emitter.fire(s);
  assert.equal(bullets.length,2);
  assert.equal(tex.length,1);
  assert.equal(mats.length,1);
  assert.equal(bullets[0].material,bullets[1].material);
  assert.equal(bullets[0].metadata.playerProjectileFx,'bolt');
  assert.equal(bullets[0].rotation.x,-Math.PI/2);
  cleanup.forEach(fn=>fn());
  assert.ok(tex[0].disposed && mats[0].disposed);
  emitter.fire(s);
  assert.equal(bullets.length,2);
});

test('engine flare is a bundled asset and FX source has no remote dependencies',()=>{
  const asset = new URL('../public/images/effects/thruster_glow.png',import.meta.url);
  assert.ok(fs.statSync(asset).size > 500);
  const fx = read('../src/game/rendering/ShipEngineFx.js');
  assert.match(fx,/images\/effects\/thruster_glow\.png/);
  assert.doesNotMatch(fx,/https?:\/\//);
});

test('shared thruster adapter starts/stops two layers, honors X-Wing offset, cleans up', async () => {
  const { createShipEngineFx } = await import('../src/game/rendering/ShipEngineFx.js');
  const systems = [], textures = [], mounts = [], cleanup = [];
  class TransformNode {
    constructor(name){this.name=name;this.position={set(x,y,z){this.x=x;this.y=y;this.z=z;}};mounts.push(this);}
    dispose(){this.disposed=true;}
  }
  class Texture {
    static BILINEAR_SAMPLINGMODE=2;
    constructor(url){this.url=url;textures.push(this);}
    dispose(){this.disposed=true;}
  }
  class ParticleSystem {
    static BLENDMODE_STANDARD = 0;
    static BLENDMODE_ONEONE = 1;
    constructor(name, capacity){this.name=name;this.capacity=capacity;systems.push(this);}
    start(){this.started=true;}
    stop(){this.stopped=true;}
    dispose(){this.disposed=true;}
  }
  class Vector3 {constructor(x,y,z){Object.assign(this,{x,y,z});}}
  class Color4 {constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}
  const BABYLON={TransformNode,Texture,ParticleSystem,Vector3,Color4};
  const root={};const scene={onDisposeObservable:{addOnce:fn=>cleanup.push(fn)}};
  const aircraft = AIRCRAFTS[0];
  const fx=createShipEngineFx({scene,BABYLON,playerRoot:root,aircraft,quality:{particleFraction:.65}});
  assert.deepEqual({x:mounts[0].position.x,y:mounts[0].position.y,z:mounts[0].position.z},aircraft.engineOffset);
  assert.equal(mounts[0].parent,root);
  assert.deepEqual(systems.map(x=>x.name),['player:engineContrastRim','player:engineCore']);
  assert.ok(systems.every(x=>x.started));
  assert.equal(systems[1].emitter,mounts[0]);
  assert.equal(systems[0].emitter,mounts[0]);
  assert.ok(textures[0].url.includes('/images/effects/thruster_glow.png'));
  fx.stop();assert.ok(systems.every(x=>x.stopped));
  cleanup.forEach(fn=>fn());
  assert.ok(systems.every(x=>x.disposed));
  assert.ok(textures[0].disposed && mounts[0].disposed);
  fx.dispose();
});
