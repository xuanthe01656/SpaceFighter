import test from 'node:test';
import assert from 'node:assert/strict';
import {createC9PerformanceTelemetry,C9_PERF_VERSION}
  from '../src/game/combat/C9PerformanceTelemetry.js';

test('C9 perf: measures FPS, frame p95, age and ACK gap without identities',()=>{
  let now=1000;const p=createC9PerformanceTelemetry({clock:()=>now});
  p.checkpoint(0,{enemies:1,shots:2,enemyShots:3});
  for(let i=0;i<90;i++)p.render(16,2,now+i*16);
  now=2000;p.checkpoint(30,{enemies:2,shots:4,enemyShots:0});
  now=2200;const r=p.snapshot();
  assert.equal(r.version,C9_PERF_VERSION);
  assert.equal(r.localOnly,true);assert.equal(r.networkUpload,false);
  assert.equal(r.fps,63);assert.equal(r.p95FrameMs,16);
  assert.equal(r.meanAckGapMs,1000);assert.equal(r.checkpointAgeMs,200);
  assert.equal(r.lastAckTick,30);assert.equal(r.enemies,2);
  assert.equal(r.shots,4);assert.equal(r.enemyShots,0);
  for(const forbidden of ['uid','sessionId','battleId','rawInput','token'])
    assert.equal(Object.hasOwn(r,forbidden),false);
});

test('C9 perf: frame buffer is bounded, duplicate ACK idempotent, publish throttled',()=>{
  let now=10;const p=createC9PerformanceTelemetry({clock:()=>now});
  p.checkpoint(0,{enemies:0,shots:0,enemyShots:0});
  assert.equal(p.checkpoint(0,{enemies:0,shots:0,enemyShots:0}),false);
  for(let i=0;i<1000;i++)p.render(20,5,now);
  assert.equal(p.snapshot().sampledFrames,180);
  assert.equal(p.shouldPublish(10),true);
  assert.equal(p.shouldPublish(1000),false);
  assert.equal(p.shouldPublish(2050),true);
  assert.throws(()=>p.checkpoint(1,{enemies:33,shots:0,enemyShots:0}),TypeError);
  assert.throws(()=>p.checkpoint(-1,{enemies:0,shots:0,enemyShots:0}),TypeError);
  assert.equal(p.render(-10,2),false);
});
