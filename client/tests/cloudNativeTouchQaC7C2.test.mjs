import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {
  TOUCH_EVIDENCE_VERSION,TOUCH_EVIDENCE_MAX_TICKS,TOUCH_EVIDENCE_MAX_EVENTS,
  createNativeTouchEvidenceRecorder,
} from '../src/game/combat/CloudNativeTouchQaC7C2.js';
const folder=dirname(fileURLToPath(import.meta.url));
const config=()=>({arenaHalfHeight:15000,arenaHalfWidth:22500,
  aspect:1.5,canvasHeight:1000,canvasWidth:1500,halfHeight:15,
  hitRadius:1800,legacyInset:1.8,movePerTick:300,speedMultiplier:1,
  startX:0,startZ:12500});
const tick=(r,time,x=0,z=12.5)=>r.sample({nowMs:time,guestX:x,guestZ:z});

test('C7-C2BC recorder validates a consistent bounded candidate snapshot',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  assert.equal(r.status,'recording');
  assert.equal(r.ticks,0);
  assert.throws(()=>createNativeTouchEvidenceRecorder({...config(),movePerTick:9000}));
});
test('C7-C2BC records real Guest trajectory and compares all release policies without selecting one',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  r.record({type:'down'});r.record({type:'drag',deltaX:30,deltaY:10});
  assert.equal(tick(r,1000,-0.6,12.8),true);
  r.record({type:'up'});tick(r,1033.333,-0.6,12.8);
  tick(r,1066.666,-0.6,12.8);
  const evidence=r.stop('manual');
  assert.equal(evidence.version,TOUCH_EVIDENCE_VERSION);
  assert.equal(evidence.ticks,3);assert.equal(evidence.eventCount,3);
  assert.equal(evidence.qaOnly,true);assert.equal(evidence.localOnly,true);
  assert.equal(evidence.networkUpload,false);assert.equal(evidence.cloudRewards,false);
  assert.equal(evidence.parityVerified,false);assert.equal(evidence.releasePolicySelected,false);
  assert.equal(evidence.nativeDeviceAttested,false);
  assert.deepEqual(Object.keys(evidence.policies),['clear','carry','boundedFlush']);
  assert.equal(evidence.policies.clear.meanGapWorld>=0,true);
  assert.equal(evidence.policies.boundedFlush.finalGapWorld>=0,true);
});
test('C7-C2BC correct direction in world: screen right maps negative X',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  r.record({type:'down'});r.record({type:'drag',deltaX:100,deltaY:100});
  tick(r,10,-2,15);const report=r.stop();
  assert.deepEqual(report.events[1],{tick:0,type:'drag',deltaX:100,deltaY:100});
  assert.ok(report.policies.clear.synthetic.movingTicks>0);
});
test('C7-C2BC invalid pointer trace cannot be called parity-approved',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  assert.equal(r.record({type:'up'}),false);
  tick(r,10);
  const report=r.stop('manual');
  assert.equal(report.interrupted,true);
  assert.equal(report.policies,null);
});
test('C7-C2BC down-up-down within same tick is ambiguous and stops capture',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  r.record({type:'down'});r.record({type:'up'});
  assert.equal(r.record({type:'down'}),false);
  assert.equal(r.status,'invalid-event');
});
test('C7-C2BC does not invent missed 30Hz ticks after background jump',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  tick(r,1000);assert.equal(tick(r,1250),false);
  const output=r.stop('clock-gap');
  assert.equal(output.ticks,1);
  assert.equal(output.interrupted,true);
  assert.equal(output.policies,null);
});
test('C7-C2BC short jitter records real 30Hz timing, never authorizes payout',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  tick(r,0);tick(r,31);tick(r,85);tick(r,120);
  const p=r.stop('manual');
  assert.equal(p.timing.over50ms,1);
  assert.equal(p.timing.maxIntervalMs,54);
  assert.equal(p.settlementEnabled,false);
});
test('C7-C2BC cannot capture new input after explicit device suspension',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  tick(r,100);r.stop('hidden');
  assert.equal(r.record({type:'down'}),false);
  assert.equal(tick(r,200),false);
  assert.equal(r.report().interrupted,true);
});
test('C7-C2BC limits evidence memory to 600 samples',()=>{
  const r=createNativeTouchEvidenceRecorder(config());
  for(let i=0;i<TOUCH_EVIDENCE_MAX_TICKS;i++)assert.equal(tick(r,i*33.333),true);
  assert.equal(r.status,'limit');
  assert.equal(r.sample({nowMs:20000,guestX:0,guestZ:12.5}),false);
  assert.equal(r.report().ticks,TOUCH_EVIDENCE_MAX_TICKS);
});
test('C7-C2BC rejects dangerous or forged pointer deltas',()=>{
  for(const delta of [NaN,Infinity,-Infinity,50000,undefined]){
    const r=createNativeTouchEvidenceRecorder(config());
    r.record({type:'down'});
    assert.equal(r.record({type:'drag',deltaX:delta,deltaY:0}),false);
    assert.equal(r.status,'invalid-event');
  }
});
test('C7-C2BC bounds pointer event count and exposes no user identifiers',()=>{
  const r=createNativeTouchEvidenceRecorder(config());r.record({type:'down'});
  for(let i=0;i<TOUCH_EVIDENCE_MAX_EVENTS-1;i++){
    assert.equal(r.record({type:'drag',deltaX:1,deltaY:0}),true);
  }
  assert.equal(r.record({type:'drag',deltaX:1,deltaY:0}),false);
  tick(r,10);const out=r.report();
  assert.equal(out.events.length,TOUCH_EVIDENCE_MAX_EVENTS);
  assert.equal(JSON.stringify(out).includes('firebase'),false);
});
test('C7-C2BC feature gate strictly requires build flag, URL flag, Guest and Alpha1',()=>{
  const scene=fs.readFileSync(resolve(folder,'../src/components/Campaign/CampaignScene.js'),'utf8');
  assert.match(scene,/VITE_SF_NATIVE_TOUCH_QA === '1'/);
  assert.match(scene,/!isCloud/);
  assert.match(scene,/currentPlanetId === 1 && currentStage === 1/);
  assert.match(scene,/get\('touchQa'\) === '1'/);
  assert.match(scene,/Capacitor\?\.isNativePlatform\?\.\(\) === true/);
  assert.doesNotMatch(scene,/battle\.start[^\n]*touchQa/);
});
