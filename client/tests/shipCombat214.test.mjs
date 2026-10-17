import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GEAR_CATALOG } from '../src/constants.js';
import { worldDragDelta, keyboardVector, createShipInputController } from '../src/game/combat/ShipInputController.js';
import { describeMainSalvo, describeWingSalvo, describeDroneSalvo, pickWeaponTarget,
  advancePlayerProjectile, registerProjectileHit, projectileHitsPoint, shieldDamageFactor,
  enemySpeedFactor, repairAmount } from '../src/game/combat/PlayerWeapons.js';
import { createProjectileEmitter } from '../src/game/combat/ProjectileEmitter.js';

const weapon = id => GEAR_CATALOG.mainGun.find(w => w.id === id);
const enemy = (id,x,z) => ({ mesh: { uniqueId:id,position:{x,z},isDisposed:()=>false } });

test('same orthographic pointer mapping on wide desktop and narrow mobile CSS canvases',()=>{
  const desktop=worldDragDelta(100,30,1000,500,15,2,1);
  const mobile=worldDragDelta(50,15,500,250,15,2,1);
  assert.deepEqual(desktop,mobile);
  assert.equal(desktop.x,-6);
  assert.ok(Math.abs(desktop.z-1.8)<1e-10);
  assert.ok(desktop.x<0);assert.ok(desktop.z>0);
  assert.deepEqual(worldDragDelta(1,2,0,100,15,1),{x:0,z:0});
});

test('keyboard directions normalize diagonal and do not invert world axes',()=>{
  const d=keyboardVector(new Set(['ArrowUp','d']));
  assert.ok(Math.abs(Math.hypot(d.x,d.z)-1)<1e-10);
  assert.ok(d.x>0 && d.z<0);
  assert.deepEqual(keyboardVector(new Set(['a','ArrowRight'])),{x:0,z:0});
});

function fakeEventTarget(){
  const listeners=new Map();
  return {
    listeners,
    addEventListener(t,fn){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(fn);},
    removeEventListener(t,fn){listeners.get(t)?.delete(fn);},
    send(t,extra={}){const e={pointerId:7,pointerType:'mouse',button:0,clientX:200,clientY:200,
      cancelable:true,preventDefault(){this.prevented=true;},...extra};
      for(const fn of listeners.get(t)||[])fn(e);return e;},
  };
}

test('Campaign/Dungeon shared pointer controller tracks mouse, capture, keyboard, pause and cleanup',()=>{
  const browser=fakeEventTarget();
  const canvas=Object.assign(fakeEventTarget(),{
    ownerDocument:{defaultView:browser},style:{touchAction:'auto'},tabIndex:-1,
    getAttribute:()=>null,setAttribute(){},removeAttribute(){},
    capture:new Set(),setPointerCapture(id){this.capture.add(id);},
    hasPointerCapture(id){return this.capture.has(id);},
    releasePointerCapture(id){this.capture.delete(id);},
    getBoundingClientRect:()=>({width:1000,height:500}),focus(){this.focused=true;},
  });
  const observer=new Set(),disposeCallbacks=[];
  const scene={onBeforeRenderObservable:{add:fn=>{observer.add(fn);return fn;},remove:fn=>observer.delete(fn)},
    onDisposeObservable:{addOnce:fn=>disposeCallbacks.push(fn)}};
  const root={position:{x:0,y:0,z:0}};
  const tilt={rotation:{z:0}};
  let paused=false;
  const controller=createShipInputController({canvas,scene,engine:{getDeltaTime:()=>1000/60},
    playerRoot:root,tiltNode:tilt,halfHeight:15,aspect:()=>2,enabled:()=>!paused});
  assert.equal(canvas.style.touchAction,'none');
  assert.equal(controller.isDragging(),false);
  canvas.send('pointerdown');
  assert.equal(controller.isDragging(),true);
  assert.ok(canvas.hasPointerCapture(7));
  canvas.send('pointermove',{clientX:300,clientY:230});
  assert.ok(root.position.x<0 && root.position.z>0);
  const xAfterDrag=root.position.x;
  canvas.send('pointerup');
  assert.equal(controller.isDragging(),false);
  browser.send('keydown',{key:'ArrowLeft',target:{tagName:'BODY'}});
  for(const f of observer)f();
  assert.ok(root.position.x>xAfterDrag);
  const afterKeyboard=root.position.x;
  paused=true;
  for(const f of observer)f();
  assert.equal(root.position.x,afterKeyboard);
  browser.send('blur');
  disposeCallbacks.forEach(fn=>fn());
  assert.equal(canvas.style.touchAction,'auto');
  assert.equal(observer.size,0);
  assert.equal(canvas.listeners.get('pointermove').size,0);
  assert.equal(browser.listeners.get('keydown').size,0);
});

test('controller rejects secondary mouse and second touch pointer',()=>{
  const browser=fakeEventTarget();const canvas=Object.assign(fakeEventTarget(),{ownerDocument:{defaultView:browser},
    style:{touchAction:'auto'},tabIndex:0,getAttribute:()=>null,removeAttribute(){},setAttribute(){},
    getBoundingClientRect:()=>({width:100,height:100}),setPointerCapture(){},focus(){}});
  const callbacks=[];
  const scene={onBeforeRenderObservable:{add:()=>null,remove(){}},onDisposeObservable:{addOnce:f=>callbacks.push(f)}};
  const root={position:{x:0,z:0}};
  const ctrl=createShipInputController({canvas,scene,playerRoot:root,halfHeight:15,aspect:()=>1});
  canvas.send('pointerdown',{button:2});assert.equal(ctrl.isDragging(),false);
  canvas.send('pointerdown',{pointerType:'touch',pointerId:4});assert.equal(ctrl.isDragging(),true);
  canvas.send('pointerdown',{pointerType:'touch',pointerId:5});
  canvas.send('pointermove',{pointerType:'touch',pointerId:5,clientX:400});assert.equal(root.position.x,0);
  canvas.send('pointerup',{pointerId:4});assert.equal(ctrl.isDragging(),false);
  callbacks.forEach(f=>f());
});

test('all catalog main guns produce known explicit projectile paths',()=>{
  const center={x:0,z:10};const t=enemy('t',1,-4);
  const expected={beam:1,single:1,spread3:3,pierce:1,burst:3,explosive:1,spread5:5,wave:2,homing:1,shotgun:7,charge:1};
  for(const gun of GEAR_CATALOG.mainGun){
    assert.ok(Object.hasOwn(expected,gun.firePattern),`unknown pattern ${gun.firePattern}`);
    const shots=describeMainSalvo(gun,center,50,t);
    assert.equal(shots.length,expected[gun.firePattern],gun.id);
    for(const s of shots){assert.ok(s.vz<0);assert.ok(s.atk>0);assert.equal(s.color,gun.color);}
  }
  assert.equal(describeMainSalvo(weapon('gun_rail'),center,50)[0].penetration,3);
  assert.equal(describeMainSalvo(weapon('gun_ion'),center,50)[0].slowMs,1500);
  assert.equal(describeMainSalvo(weapon('gun_neutron'),center,50)[0].splashRadius,2.6);
  assert.deepEqual(describeMainSalvo(weapon('gun_pulse'),center,50).map(s=>s.delayMs),[0,90,180]);
  assert.ok(describeMainSalvo(weapon('gun_wave'),center,50).some(s=>s.waveAmplitude!==0));
});

test('support behavior derives from actual wing/drone catalogs, including non-attacking shield and repair',()=>{
  const mounts=[{x:-2,z:11},{x:2,z:11}];const target=enemy('e',0,-3);
  const wings=GEAR_CATALOG.wingman;
  for(const gear of wings){
    const shots=describeWingSalvo(gear,mounts,20,target);
    assert.ok(shots.length>=2 && shots.every(s=>s.kind==='wing'),gear.id);
    if(gear.behavior==='straight')assert.ok(shots.every(s=>!s.homing));
    if(gear.behavior==='emp')assert.ok(shots.every(s=>s.slowMs>0));
  }
  for(const gear of GEAR_CATALOG.drone){
    const shots=describeDroneSalvo(gear,mounts,20,target);
    assert.equal(shots.length===0,['shield','repair'].includes(gear.behavior),gear.id);
  }
  assert.equal(shieldDamageFactor({behavior:'shield'}),.8);
  assert.ok(repairAmount({behavior:'repair'},1000)>0);
});

test('projectile homing, wave, pierce and slow are FPS-normalized and deterministic',()=>{
  const target=enemy('target',10,-10);
  const b={position:{x:0,z:0},_vx:0,_vz:-.8,isHoming:true,target,_remainingPenetration:3};
  advancePlayerProjectile(b,1);
  assert.ok(b.position.x>0&&b.position.z<0);
  assert.deepEqual(registerProjectileHit(b,1),{accepted:true,consumed:false});
  assert.deepEqual(registerProjectileHit(b,1),{accepted:false,consumed:false});
  assert.deepEqual(registerProjectileHit(b,2),{accepted:true,consumed:false});
  assert.deepEqual(registerProjectileHit(b,3),{accepted:true,consumed:true});
  assert.equal(projectileHitsPoint({position:{x:1,z:0}},{x:0,z:0},1),true);
  assert.equal(projectileHitsPoint({position:{x:1.01,z:0}},{x:0,z:0},1),false);
  assert.equal(enemySpeedFactor({_slowUntil:1001},1000),.65);
  assert.equal(enemySpeedFactor({_slowUntil:1000},1000),1);
  const wave={position:{x:0,z:0},_vx:0,_vz:-1,_waveAmplitude:.5};
  for(let i=0;i<10;i++)advancePlayerProjectile(wave,1);
  assert.ok(Math.abs(wave.position.x)>0);
});

test('Babylon adapter reuses materials, delays bursts and stops after disposal',()=>{
  const materials=[];const meshes=[],pending=[];const disposal=[];
  class StandardMaterial {constructor(name){this.name=name;materials.push(this);}dispose(){this.disposed=true;}}
  const BABYLON={StandardMaterial,Color3:{FromHexString:h=>h},MeshBuilder:{
    CreateSphere:()=>makeMesh(),CreateCylinder:()=>makeMesh(),
  }};
  function makeMesh(){const m={position:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{},
    isDisposed:()=>false};meshes.push(m);return m;}
  const scene={onDisposeObservable:{addOnce:fn=>disposal.push(fn)},isDisposed:()=>false};
  const bullets=[];
  const runtime=createProjectileEmitter({scene,BABYLON,bullets,scheduleBattleTimer:(fn,ms)=>pending.push({fn,ms})});
  runtime.fire(describeMainSalvo(weapon('gun_pulse'),{x:0,z:0},10));
  assert.equal(bullets.length,1);assert.equal(pending.length,2);
  pending[0].fn();pending[1].fn();assert.equal(bullets.length,3);
  assert.equal(materials.length,1);
  disposal.forEach(f=>f());assert.equal(materials[0].disposed,true);
});

test('both modes import and invoke shared controller and weapons, no DOM mouse-only/scene picking branches',()=>{
  const c=fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js',import.meta.url),'utf8');
  const d=fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url),'utf8');
  for(const s of [c,d]){
    assert.match(s,/createShipInputController\(/);
    assert.match(s,/createProjectileEmitter\(/);
    assert.match(s,/describeMainSalvo\(/);
    assert.match(s,/describeWingSalvo\(/);
    assert.match(s,/describeDroneSalvo\(/);
    assert.match(s,/shots\.advance\(/);
    assert.match(s,/shots\.registerHit\(/);
    assert.doesNotMatch(s,/addEventListener\('mousedown'/);
    assert.doesNotMatch(s,/scene\.onPointerObservable\.add/);
  }
});
