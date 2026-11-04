import test from 'node:test';
import assert from 'node:assert/strict';
import {createC15VisualViewportV1} from '../src/game/c15/C15VisualViewportV1.js';
import {openC15ControlIntent,addC15PointerDelta,c15ControlIntentView,sampleC15ControlTick}
  from '../src/game/c15/C15ControlIntent.js';

const devices=[[360,640],[360,780],[360,800],[412,915],[768,1024],[1024,768],[945,2048]];
const range=[-12500,12500], vertical=[-14300,14300];

test('P0: all C15 legal pilot corners stay visible with ship art margin and HUD/footer safe area',()=>{
  for(const [width,height] of devices){
    const view=createC15VisualViewportV1({width,height});
    for(const xUnits of range)for(const zUnits of vertical){
      const screen=view.screenPixel({xUnits,zUnits});
      const shipPx=view.visualHalfSize*height/(2*view.worldHalfHeight);
      assert.ok(screen.x-shipPx>=-1e-7,`ship left clipped at ${width}x${height}`);
      assert.ok(screen.x+shipPx<=width+1e-7,`ship right clipped at ${width}x${height}`);
      assert.ok(screen.y>=view.topPaddingPx-1e-7,`ship reaches HUD at ${width}x${height}`);
      assert.ok(screen.y<=height-view.bottomPaddingPx+1e-7,`ship reaches footer at ${width}x${height}`);
      const roundtrip=view.unproject(view.project({xUnits,zUnits}));
      assert.ok(Math.abs(roundtrip.xUnits-xUnits)<=1&&Math.abs(roundtrip.zUnits-zUnits)<=1);
    }
  }
});

test('P0: on 945x2048 screen +/-12.5 arena units no longer project outside camera +/-6.92',()=>{
  const view=createC15VisualViewportV1({width:945,height:2048});
  const right=view.project({xUnits:12500,zUnits:0});
  assert.ok(right.x<view.halfWidth&&right.x>0);
  assert.ok(view.halfWidth<7.0);
  const pixel=view.screenPixel({xUnits:12500,zUnits:0});
  assert.ok(pixel.x<945&&pixel.x>945/2);
});

test('P0: RC5 arena-relative input remains deterministic and targets both visual edges',()=>{
  for(const [width,height] of devices.filter(([w,h])=>h>=w)){
    const config={arenaHalfHeight:15000,arenaHalfWidth:13200,aspect:width/height,
      canvasWidth:width,canvasHeight:height,halfHeight:15,hitRadius:700,
      movePerTick:3000,speedMultiplier:1,startX:0,startZ:0};
    let left=openC15ControlIntent(config,{profileId:'arcade-responsive-v2'});
    let right=openC15ControlIntent(config,{profileId:'arcade-responsive-v2'});
    left=addC15PointerDelta(left,{deltaX:width/2,deltaY:0});
    right=addC15PointerDelta(right,{deltaX:-width/2,deltaY:0});
    assert.equal(c15ControlIntentView(left).target.xUnits,-12500);
    assert.equal(c15ControlIntentView(right).target.xUnits,12500);
    const viewport=createC15VisualViewportV1({width,height});
    for(const state of [left,right]){
      const initial=c15ControlIntentView(state).position;
      const sampled=sampleC15ControlTick(state);
      assert.deepEqual(Object.keys(sampled.frame).sort(),['x','z']);
      assert.ok(Math.abs(c15ControlIntentView(sampled.state).position.xUnits-initial.xUnits)<=3005);
      const pixel=viewport.screenPixel(c15ControlIntentView(state).target);
      assert.ok(pixel.x>=0&&pixel.x<=width);
    }
  }
});

test('P0: invalid geometry fails closed',()=>{
  for(const args of [{width:0,height:800},{width:200,height:5000},{width:360,height:800,hitRadius:16000}])
    assert.throws(()=>createC15VisualViewportV1(args));
});
