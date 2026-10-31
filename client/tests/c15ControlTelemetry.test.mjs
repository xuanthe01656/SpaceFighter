import test from 'node:test';
import assert from 'node:assert/strict';
import {createC15ControlTelemetry} from '../src/game/c15/C15ControlTelemetry.js';

test('control telemetry reports aggregate local metrics without identity or raw input',()=>{
  let now=0;const telemetry=createC15ControlTelemetry({profileId:'arcade-responsive-v1',clock:()=>now});
  const view=(x,gap)=>({position:{xUnits:x,zUnits:0},targetGapUnits:gap});
  telemetry.observeTick(view(0,0));telemetry.markTarget(view(0,6000));
  now=34;telemetry.observeTick(view(900,5100));now=360;telemetry.observeTick(view(5400,600));
  telemetry.observeRender({frameMs:8.4,fps:119});telemetry.observeRender({frameMs:9.1,fps:118});
  const report=telemetry.report();assert.equal(report.version,'c15-control-feel-v1');
  assert.equal(report.inputToMotionP95Ms,34);assert.equal(report.catchUpP95Ms,360);assert.equal(report.renderFps,118);
  assert.equal(report.containsIdentity,false);assert.equal(report.containsRawInput,false);
  assert.equal(JSON.stringify(report).includes('uid'),false);assert.equal(JSON.stringify(report).includes('deltaX'),false);
});
