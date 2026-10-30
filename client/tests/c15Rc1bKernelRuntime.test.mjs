import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {openC15KernelRuntime,advanceC15KernelRuntime,replayC15KernelRuntime,c15KernelRuntimeView,c15KernelInputConfig}
  from '../src/game/c15/C15KernelRuntime.js';
const require=createRequire(import.meta.url);
const {createC15Rc1Fixture,generateC15VictoryFrames}=require('../../server/tools/c15Rc1Fixture.cjs');

test('C15 browser runtime replays a five-wave local victory with server-identical digest',async()=>{
  const fixture=await createC15Rc1Fixture(),golden=generateC15VictoryFrames(fixture);
  let local=openC15KernelRuntime({genesis:fixture.origin.genesis,runtime:{snapshot:fixture.snapshot,encounter:fixture.encounter,policy:fixture.policy}});
  for(const input of golden.frames)local=advanceC15KernelRuntime(local,input).state;
  const view=c15KernelRuntimeView(local);assert.equal(view.provisionalPhase,'local-clear');assert.equal(view.wave,5);assert.equal(view.kills,70);
  assert.equal(view.stateDigest,golden.run.state.stateDigest);assert.equal(view.traceDigest,golden.run.state.traceDigest);
  const resumed=replayC15KernelRuntime({genesis:fixture.origin.genesis,runtime:{snapshot:fixture.snapshot,encounter:fixture.encounter,policy:fixture.policy},frames:golden.frames});
  assert.equal(c15KernelRuntimeView(resumed).stateDigest,view.stateDigest);
});

test('C15 kernel exposes only server-pinned input bounds and non-economic local state',async()=>{
  const fixture=await createC15Rc1Fixture(),state=openC15KernelRuntime({genesis:fixture.origin.genesis,
    runtime:{snapshot:fixture.snapshot,encounter:fixture.encounter,policy:fixture.policy}});
  const config=c15KernelInputConfig(state,{canvasWidth:360,canvasHeight:800});assert.equal(config.movePerTick,600);assert.equal(config.startZ,12500);
  const view=c15KernelRuntimeView(state);assert.equal(view.nonEconomic,true);assert.equal(view.safeForSettlement,false);assert.equal(view.cloudRewards,false);
  assert.throws(()=>advanceC15KernelRuntime(state,{x:127,z:127}),/invalid/);
});
