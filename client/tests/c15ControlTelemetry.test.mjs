import test from 'node:test';
import assert from 'node:assert/strict';
import {createC15ControlTelemetry} from '../src/game/c15/C15ControlTelemetry.js';

test('RC5 control telemetry reports aggregate presentation/frame metrics without identity or raw input',()=>{
  let now=0;const telemetry=createC15ControlTelemetry({profileId:'arcade-responsive-v2',clock:()=>now});
  const view=(x,gap)=>({position:{xUnits:x,zUnits:0},targetGapUnits:gap});
  telemetry.observeTick(view(0,0));telemetry.observePresentation({pilotPosition:{xUnits:0,zUnits:0},frameMs:8.4,fps:120});
  telemetry.markTarget(view(0,6000));now=9;telemetry.observePresentation({pilotPosition:{xUnits:200,zUnits:0},frameMs:8.2,fps:120});
  now=34;telemetry.observeTick(view(2400,3600));now=120;telemetry.observeTick(view(5800,200));
  telemetry.observeFramePacing({frameMs:8.3,droppedMs:0});telemetry.recordPointerEvent('pointer-cancel');
  const report=telemetry.report();assert.equal(report.version,'c15-control-feel-v2');
  assert.equal(report.inputToVisibleP95Ms,9);assert.equal(report.inputToAuthorityP95Ms,34);assert.equal(report.catchUpP95Ms,120);
  assert.equal(report.pointerEvents['pointer-cancel'],1);assert.equal(report.containsIdentity,false);assert.equal(report.containsRawInput,false);
  assert.equal(JSON.stringify(report).includes('uid'),false);assert.equal(JSON.stringify(report).includes('deltaX'),false);
});
