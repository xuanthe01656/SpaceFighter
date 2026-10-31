import test from 'node:test';
import assert from 'node:assert/strict';
import {openC15ControlIntent,addC15PointerDelta,sampleC15ControlTick,releaseC15ControlTarget,
  c15ControlIntentView} from '../src/game/c15/C15ControlIntent.js';
const config=movePerTick=>({arenaHalfHeight:15000,arenaHalfWidth:13200,aspect:360/800,canvasHeight:800,
  canvasWidth:360,halfHeight:15,hitRadius:700,movePerTick,speedMultiplier:1,startX:0,startZ:12500});
function drag(profileId,movePerTick){let state=openC15ControlIntent(config(movePerTick),{profileId});
  state=addC15PointerDelta(state,{deltaX:170,deltaY:-40});return state;}

test('arcade control reacts on the next 30Hz tick and never teleports or exceeds server movement',()=>{
  let state=drag('arcade-responsive-v1',900);const before=c15ControlIntentView(state);assert.ok(before.targetGapUnits>5000);
  const sampled=sampleC15ControlTick(state);const after=c15ControlIntentView(sampled.state);
  assert.notDeepEqual(after.position,before.position);assert.ok(Math.hypot(after.position.xUnits-before.position.xUnits,
    after.position.zUnits-before.position.zUnits)<=905);assert.ok(after.targetGapUnits<before.targetGapUnits);
  assert.deepEqual(Object.keys(sampled.frame).sort(),['x','z']);
});

test('arcade retains the target after release while balanced profile stops at the ship',()=>{
  let arcade=drag('arcade-responsive-v1',900);arcade=releaseC15ControlTarget(arcade);
  assert.ok(c15ControlIntentView(arcade).targetGapUnits>0);
  let balanced=drag('current-balanced-v1',600);balanced=releaseC15ControlTarget(balanced);
  assert.equal(c15ControlIntentView(balanced).targetGapUnits,0);
});

test('arcade profile catches an identical screen target in fewer deterministic ticks',()=>{
  let current=drag('current-balanced-v1',600),arcade=drag('arcade-responsive-v1',900),currentTicks=0,arcadeTicks=0;
  while(c15ControlIntentView(current).targetGapUnits>150&&currentTicks<100){current=sampleC15ControlTick(current).state;currentTicks++;}
  while(c15ControlIntentView(arcade).targetGapUnits>150&&arcadeTicks<100){arcade=sampleC15ControlTick(arcade).state;arcadeTicks++;}
  assert.ok(arcadeTicks<currentTicks);assert.ok(arcadeTicks<=15);
});

test('same target trace is deterministic and independent of render callback count',()=>{
  const run=renderCallbacks=>{let state=drag('arcade-responsive-v1',900);const frames=[];
    for(let tick=0;tick<20;tick++){for(let i=0;i<renderCallbacks;i++)c15ControlIntentView(state);
      const sampled=sampleC15ControlTick(state);state=sampled.state;frames.push(sampled.frame);}
    return {frames,view:c15ControlIntentView(state)};};
  assert.deepEqual(run(1),run(4));
});
