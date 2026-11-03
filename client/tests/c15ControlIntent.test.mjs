import test from 'node:test';
import assert from 'node:assert/strict';
import {openC15ControlIntent,addC15PointerDelta,sampleC15ControlTick,releaseC15ControlTarget,
  cancelC15ControlTarget,predictC15ControlRenderPosition,c15ControlIntentView} from '../src/game/c15/C15ControlIntent.js';
const config=(movePerTick,{width=360,height=800,startX=0,startZ=0,speedMultiplier=1}={})=>({arenaHalfHeight:15000,arenaHalfWidth:13200,
  aspect:width/height,canvasHeight:height,canvasWidth:width,halfHeight:15,hitRadius:700,movePerTick,
  speedMultiplier,startX,startZ});
function drag(profileId,movePerTick,delta={deltaX:170,deltaY:-40},extra={}){let state=openC15ControlIntent(config(movePerTick,extra),{profileId});
  return addC15PointerDelta(state,delta);}

test('RC5 portrait mapping reaches full playable horizontal and vertical bounds',()=>{
  const right=c15ControlIntentView(drag('arcade-responsive-v2',3000,{deltaX:180,deltaY:0}));
  assert.equal(right.target.xUnits,-12500);
  const top=c15ControlIntentView(drag('arcade-responsive-v2',3000,{deltaX:0,deltaY:-400}));
  assert.equal(top.target.zUnits,-14300);
  const tablet=c15ControlIntentView(drag('arcade-responsive-v2',3000,{deltaX:384,deltaY:0},{width:768,height:1024}));
  assert.equal(tablet.target.xUnits,-12500);
  for(const speedMultiplier of [.5,1,2]){
    const speedIndependent=c15ControlIntentView(drag('arcade-responsive-v2',3000,{deltaX:180,deltaY:0},{speedMultiplier}));
    assert.equal(speedIndependent.target.xUnits,-12500);
  }
});

test('RC5 reacts on the next 30Hz tick without teleporting beyond its server-pinned step',()=>{
  let state=drag('arcade-responsive-v2',3000);const before=c15ControlIntentView(state);assert.ok(before.targetGapUnits>10000);
  const sampled=sampleC15ControlTick(state),after=c15ControlIntentView(sampled.state);
  const distance=Math.hypot(after.position.xUnits-before.position.xUnits,after.position.zUnits-before.position.zUnits);
  assert.ok(distance<=3005);assert.ok(after.targetGapUnits<before.targetGapUnits);assert.deepEqual(Object.keys(sampled.frame).sort(),['x','z']);
});

test('normal release retains arcade target while cancel and lost capture stop at the ship',()=>{
  let arcade=drag('arcade-responsive-v2',3000);arcade=releaseC15ControlTarget(arcade);
  assert.ok(c15ControlIntentView(arcade).targetGapUnits>0);
  arcade=cancelC15ControlTarget(arcade);assert.equal(c15ControlIntentView(arcade).targetGapUnits,0);
  let balanced=drag('current-balanced-v1',600);balanced=releaseC15ControlTarget(balanced);
  assert.equal(c15ControlIntentView(balanced).targetGapUnits,0);
});

test('RC5 bounded visual prediction never mutates deterministic state or exceeds one next step',()=>{
  const state=drag('arcade-responsive-v2',3000);const before=c15ControlIntentView(state);
  const predicted=predictC15ControlRenderPosition(state,.5);const after=c15ControlIntentView(state);
  assert.deepEqual(after,before);assert.equal(predicted.predictionAlpha,1);
  assert.ok(Math.hypot(predicted.xUnits-before.position.xUnits,predicted.zUnits-before.position.zUnits)<=3005);
});

test('legacy arcade mapping remains available for historical replay and differs on portrait screens',()=>{
  const legacy=c15ControlIntentView(drag('arcade-responsive-v1',900,{deltaX:180,deltaY:0}));
  const rc5=c15ControlIntentView(drag('arcade-responsive-v2',3000,{deltaX:180,deltaY:0}));
  assert.ok(Math.abs(legacy.target.xUnits)<9000);assert.equal(rc5.target.xUnits,-12500);
});

test('same RC5 target trace is deterministic and independent of render callback count',()=>{
  const run=renderCallbacks=>{let state=drag('arcade-responsive-v2',3000);const frames=[];
    for(let tick=0;tick<20;tick++){for(let i=0;i<renderCallbacks;i++)predictC15ControlRenderPosition(state,i/renderCallbacks);
      const sampled=sampleC15ControlTick(state);state=sampled.state;frames.push(sampled.frame);}
    return {frames,view:c15ControlIntentView(state)};};
  assert.deepEqual(run(1),run(4));
});
