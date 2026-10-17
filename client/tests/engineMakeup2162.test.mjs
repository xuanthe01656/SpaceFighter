import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AIRCRAFTS } from '../src/game/catalog/aircraft.js';
import { MAX_ENGINE_MOUNTS, thrusterFxProfile } from '../src/game/rendering/PlayerFxProfiles.js';
import { createShipEngineFx } from '../src/game/rendering/ShipEngineFx.js';
import { eligibleMakeupDaysUTC, mondayKeyUTC, ensureAttendanceWeek } from '../src/utils/attendanceWeek.js';

const date = v => Date.parse(v);

function mockBabylon() {
  const systems = [], textures = [], mounts = [], disposers = [];
  class TransformNode {
    constructor(name) { this.name = name; this.position = { set(x,y,z) {Object.assign(this,{x,y,z});} }; mounts.push(this); }
    dispose() { this.disposed = (this.disposed || 0) + 1; }
  }
  class Texture {
    static BILINEAR_SAMPLINGMODE = 2;
    constructor(url) { this.url = url; textures.push(this); }
    dispose() { this.disposed = (this.disposed || 0) + 1; }
  }
  class ParticleSystem {
    static BLENDMODE_STANDARD = 0;
    static BLENDMODE_ONEONE = 1;
    constructor(name, capacity) { this.name = name; this.capacity = capacity; systems.push(this); }
    start() { this.started = true; }
    stop() { this.stopped = true; }
    dispose() { this.disposed = (this.disposed || 0) + 1; }
  }
  class Vector3 { constructor(x,y,z) { Object.assign(this,{x,y,z}); } }
  class Color4 { constructor(r,g,b,a) { Object.assign(this,{r,g,b,a}); } }
  return { systems, textures, mounts, disposers,
    BABYLON: {TransformNode,Texture,ParticleSystem,Vector3,Color4},
    scene: {onDisposeObservable:{addOnce:fn=>disposers.push(fn)}} };
}

test('X-Wing exhaust centerline is x=0 in shared Campaign/Dungeon player-root space', () => {
  const aircraft = AIRCRAFTS.find(a=>a.id==='ship_xwing');
  const spec = thrusterFxProfile(aircraft,{particleFraction:.65});
  assert.equal(spec.mounts.length, 1);
  assert.equal(spec.offset.x, 0);
  assert.equal(aircraft.engineOffset.x, 0);
  assert.equal(spec.mounts[0].offset.x, 0);
  const src = ['Campaign/CampaignScene.js','Dungeon/DungeonScene.js'].map(path =>
    fs.readFileSync(new URL(`../src/components/${path}`,import.meta.url),'utf8'));
  for(const code of src) assert.match(code,/createShipEngineFx\(\{ scene, BABYLON, playerRoot, aircraft: aircraftBase, quality \}\)/);
});

test('Two symmetric thrusters share one texture and a bounded total particle budget', () => {
  const aircraft = { engineOffset:{x:0,y:0,z:1}, engineFlameTint:0x11ccff,
    engineMounts:[
      {id:'left', offset:{x:-.35,y:0,z:1.1},scale:.8},
      {id:'right', offset:{x:.35,y:0,z:1.1},scale:.8},
    ]};
  const quality={particleFraction:.4};
  const settings=thrusterFxProfile(aircraft,quality);
  assert.equal(settings.mounts.length,2);
  assert.equal(settings.mounts[0].offset.x,-settings.mounts[1].offset.x);
  const mock=mockBabylon();
  const root={};
  const fx=createShipEngineFx({scene:mock.scene,BABYLON:mock.BABYLON,playerRoot:root,aircraft,quality});
  assert.equal(mock.mounts.length,2);
  assert.deepEqual(mock.mounts.map(x=>x.position.x),[-.35,.35]);
  assert.ok(mock.mounts.every(x=>x.parent===root));
  assert.equal(mock.systems.length,4);
  assert.deepEqual(mock.systems.map(x=>x.name),[
    'player:engineContrastRim:left','player:engineCore:left',
    'player:engineContrastRim:right','player:engineCore:right']);
  assert.equal(new Set(mock.systems.map(x=>x.name)).size,4);
  assert.equal(mock.textures.length,1);
  assert.ok(mock.systems.every(x=>x.particleTexture===mock.textures[0]));
  assert.ok(mock.systems.reduce((n,s)=>n+s.emitRate,0)<=settings.coreEmitRate+settings.rimEmitRate);
  assert.ok(mock.systems.filter(x=>x.name.includes('engineCore')).reduce((n,s)=>n+s.capacity,0)<=settings.coreCapacity+2);
  fx.stop();assert.ok(mock.systems.every(x=>x.stopped));
  mock.disposers.forEach(fn=>fn());fx.dispose();
  assert.ok(mock.systems.every(x=>x.disposed===1));
  assert.ok(mock.mounts.every(x=>x.disposed===1));
  assert.equal(mock.textures[0].disposed,1);
  assert.equal(fx.getDebugInfo().mounts.length,2);
});

test('Legacy engineOffset remains valid; malformed mount lists cannot create unbounded emitters', () => {
  const old=thrusterFxProfile({engineOffset:{x:.2,y:0,z:1}});
  assert.equal(old.mounts.length,1);
  assert.equal(old.mounts[0].offset.x,.2);
  const mounts=Array.from({length:MAX_ENGINE_MOUNTS+10},(_,i)=>({id:`e${i}`,offset:{x:i,y:0,z:1}}));
  const capped=thrusterFxProfile({engineMounts:mounts});
  assert.equal(capped.mounts.length,MAX_ENGINE_MOUNTS);
  const dup=thrusterFxProfile({engineMounts:[mounts[0],mounts[0],mounts[1]]});
  assert.deepEqual(dup.mounts.map(m=>m.id),['e0','e1']);
  assert.ok(capped.mounts.every(m=>Math.abs(m.offset.x)<=8));
  const invalid=thrusterFxProfile({engineMounts:[{id:'bad',offset:{x:NaN,y:1,z:1}}],engineOffset:{x:0,y:0,z:1}});
  assert.equal(invalid.mounts.length,1);
  assert.equal(invalid.mounts[0].id,'main');
});

test('UTC Monday has no past slots; Tuesday only offers a missed Monday', () => {
  const monday=date('2026-10-12T05:00:00Z');
  assert.deepEqual(eligibleMakeupDaysUTC({weekKey:'2026-10-12',claimedDays:[]},monday),[]);
  const tue=date('2026-10-13T05:00:00Z');
  assert.deepEqual(eligibleMakeupDaysUTC({weekKey:'2026-10-12',claimedDays:[]},tue),[1]);
  assert.deepEqual(eligibleMakeupDaysUTC({weekKey:'2026-10-12',claimedDays:[1]},tue),[]);
});

test('Only past, unclaimed weekdays may appear; today and future never appear',()=>{
  const saturday=date('2026-10-17T12:00:00Z');
  const att={weekKey:'2026-10-12',claimedDays:[1,2,5,6],makeupCount:2};
  assert.deepEqual(eligibleMakeupDaysUTC(att,saturday),[3,4]);
  assert.deepEqual(eligibleMakeupDaysUTC({weekKey:'2026-10-12',claimedDays:[1,2,3,4,5]},saturday),[]);
  assert.deepEqual(eligibleMakeupDaysUTC({weekKey:'2026-10-12',claimedDays:[1,2,3,4,5,6,7]},saturday),[]);
});

test('Sunday UTC to Monday UTC resets prior claims and makeup allowance without losing natural streak',()=>{
  const a={weekKey:'2026-10-12',claimedDays:[1,2,5,6],makeupCount:2,weeklyStreak:4,streak:2};
  const sun=date('2026-10-18T23:59:59Z');
  assert.equal(mondayKeyUTC(sun),'2026-10-12');
  assert.deepEqual(eligibleMakeupDaysUTC(a,sun),[3,4]);
  const mon=date('2026-10-19T00:00:00Z');
  assert.deepEqual(eligibleMakeupDaysUTC(a,mon),[]);
  ensureAttendanceWeek(a,mon);
  assert.equal(a.makeupCount,0);assert.deepEqual(a.claimedDays,[]);assert.equal(a.streak,2);
});

test('Modal explains weekly allowance exhausted and empty eligibility, instead of blank controls',()=>{
  const jsx=fs.readFileSync(new URL('../src/components/CampaignPortal/AttendanceModal.jsx',import.meta.url),'utf8');
  assert.match(jsx,/makeupCount >= 2/);
  assert.match(jsx,/eligibleMakeupDays\.length === 0/);
  assert.match(jsx,/eligibleMakeupDays\.map\(day/);
  assert.match(jsx,/2 lượt điểm danh bù của tuần UTC này/);
});
