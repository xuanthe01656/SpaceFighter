import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openCloudInputIntent,addCloudPointerDelta,sampleCloudInputTick}
  from '../src/game/combat/CloudInputIntentV8.js';
import {toC9BabylonWorld,chooseC9PilotDisplay,c9VisualSmoothingAlpha}
  from '../src/game/combat/C9VisualProjection.js';

const config=Object.freeze({arenaHalfWidth:13200,arenaHalfHeight:15000,
  hitRadius:700,movePerTick:400,startX:0,startZ:12500,speedMultiplier:1,
  aspect:390/840,canvasWidth:390,canvasHeight:840,halfHeight:15});
// The fixed C9 camera (eye +Y, forward -Y, up -Z) looks along -Y in LH space.
// Its view/screen X basis is -world-X; screen Y down is +world-Z.
const cameraScreen=p=>({x:-p.x,y:p.z});
const move=(dx,dy)=>{
  const initial=openCloudInputIntent(config);
  const targeted=addCloudPointerDelta(initial,{deltaX:dx,deltaY:dy});
  return sampleCloudInputTick(targeted).state;
};

test('C9 screen direction equals touch drag on all four axes, including Android left swipe',()=>{
  const variants=[[-90,0,'left'],[90,0,'right'],[0,-90,'up'],[0,90,'down']];
  const zero=cameraScreen(toC9BabylonWorld({x:0,z:12500}));
  for(const [dx,dy,label] of variants){
    const next=move(dx,dy);
    const image=cameraScreen(toC9BabylonWorld({x:next.positionX,z:next.positionZ}));
    assert.equal(Math.sign(image.x-zero.x),Math.sign(dx),`${label}: horizontal`);
    assert.equal(Math.sign(image.y-zero.y),Math.sign(dy),`${label}: vertical`);
  }
});

test('C9 Babylon preserves signed server X, matching 2D fallback orientation',()=>{
  const server={x:2700,z:8000};
  const babylon=toC9BabylonWorld(server);
  const screen=cameraScreen(babylon);
  assert.equal(babylon.x,2.7);
  assert.equal(screen.x,-2.7);
  assert.equal(babylon.z,8);
  assert.ok(screen.x<0,'positive server X appears LEFT, just as 2D fallback');
});

test('C9 bright pilot uses bounded local prediction, while server remains secondary reference',()=>{
  const frame={pilot:{x:1500,z:10000},predictedGhost:{x:2700,z:9000}};
  const presentation=chooseC9PilotDisplay(frame);
  assert.deepEqual(presentation.primary,frame.predictedGhost);
  assert.deepEqual(presentation.serverReference,frame.pilot);
  assert.deepEqual(chooseC9PilotDisplay({pilot:frame.pilot,predictedGhost:null}),
    {primary:frame.pilot,serverReference:null});
  assert.equal(frame.pilot.x,1500,'original server checkpoint is never mutated');
});

test('C9 visual projection refuses malformed coordinates and unsafe player prediction',()=>{
  for(const p of [{x:NaN,z:0},{x:1.5,z:0},{x:999999,z:0},
    Object.create({x:10,z:20}),{x:0,z:0,move:1}]){
    assert.throws(()=>toC9BabylonWorld(p),TypeError);
  }
  assert.throws(()=>chooseC9PilotDisplay({pilot:{x:0,z:0},
    predictedGhost:{x:Number.NaN,z:0}}),TypeError);
});

test('C9 render smoothing is visual only, time-bounded and monotone',()=>{
  const a=c9VisualSmoothingAlpha(16.667),b=c9VisualSmoothingAlpha(33.333);
  assert.ok(a>0&&a<1&&b>a&&b<1);
  assert.equal(c9VisualSmoothingAlpha(1000),c9VisualSmoothingAlpha(64));
  assert.throws(()=>c9VisualSmoothingAlpha(-1));
});

test('C9 renderer uses parity adapter; no direct negation or economy path',()=>{
  const renderer=readFileSync(fileURLToPath(new URL('../src/components/CloudQaAlpha1/BabylonServerRendererC9.js',import.meta.url)),'utf8');
  assert.match(renderer,/toC9BabylonWorld\(o\)/);
  assert.match(renderer,/chooseC9PilotDisplay\(frame\)/);
  assert.match(renderer,/LerpToRef\(pilot\.position,displayedTarget,alpha,pilot\.position\)/);
  assert.doesNotMatch(renderer,/new BABYLON\.Vector3\(-o\.x\/1000/);
  assert.match(renderer,/frame\.qaOnly!==true/);
  assert.match(renderer,/frame\.settlementEnabled!==false/);
  assert.doesNotMatch(renderer,/grantReward|settleBattle|wallet\.|battle\.finish/);
});
