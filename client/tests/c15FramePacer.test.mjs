import test from 'node:test';
import assert from 'node:assert/strict';
import {createC15FramePacer} from '../src/game/c15/C15FramePacer.js';

const run=hz=>{const pacer=createC15FramePacer(),steps=[];let total=0;for(let i=0;i<=hz;i++){
  const result=pacer.advance(i*1000/hz);total+=result.steps;steps.push(result.steps);}return {total,state:pacer.getState(),steps};};
test('60/90/120Hz render schedules produce the same fixed 30Hz authoritative tick count',()=>{
  for(const hz of [60,90,120]){const result=run(hz);assert.equal(result.total,30);assert.ok(result.state.accumulatorMs<result.state.stepMs);}
});
test('frame pacer bounds catch-up and drops background backlog rather than bursting gameplay',()=>{
  const pacer=createC15FramePacer({maxCatchUpSteps:3,maxFrameDeltaMs:100});pacer.advance(0);const result=pacer.advance(5000);
  assert.equal(result.steps,3);assert.ok(result.droppedMs>4800);assert.ok(result.alpha<1);
  const reset=pacer.reset(6000);assert.equal(reset.steps,0);assert.equal(pacer.getState().accumulatorMs,0);
});
