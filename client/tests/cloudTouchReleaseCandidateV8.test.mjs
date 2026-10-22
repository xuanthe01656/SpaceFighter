import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compareTouchReleaseCandidates as compare,
  TOUCH_RELEASE_CANDIDATE_VERSION, TOUCH_RELEASE_DECISION } from '../src/game/combat/CloudTouchReleaseCandidateV8.js';
import journal from '../../server/lib/combatInputJournalV8.cjs';
const {validateChunk, PROTOCOL_VERSION} = journal;
const read = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const config = Object.freeze({
  arenaHalfWidth:15000,arenaHalfHeight:15000,hitRadius:700,movePerTick:600,
  startX:0,startZ:12500,canvasWidth:500,canvasHeight:500,halfHeight:15,
  aspect:1,speedMultiplier:1,legacyInset:1.8,
});
const down = tick => ({tick,type:'down'});
const drag = (tick,deltaX,deltaY=0) => ({tick,type:'drag',deltaX,deltaY});
const up = tick => ({tick,type:'up'});
const run = (events=[],ticks=10,overrides={}) => compare({config:{...config,...overrides},events,ticks});
const error = code => e => e?.code===code;
const b = r => r.policies.boundedFlush;

test('V8B-2B3: candidate is offline, has no network, timers, reward or victory authority', () => {
  const src=read('../src/game/combat/CloudTouchReleaseCandidateV8.js');
  assert.doesNotMatch(src,/fetch\s*\(|axios|firebase|localStorage|setInterval|setTimeout|requestAnimationFrame|battle\.finish|settleReward|verifyVictory/);
  assert.equal(TOUCH_RELEASE_CANDIDATE_VERSION,'touch-release-candidate-v8b2b3');
  for (const path of [
    '../src/game/combat/ShipInputController.js',
    '../src/components/Campaign/CampaignScene.js',
    '../src/components/Dungeon/DungeonScene.js',
    '../../server/lib/gameService.cjs',
  ]) assert.doesNotMatch(read(path),/CloudTouchReleaseCandidateV8/);
  assert.match(read('../../server/lib/gameService.cjs'),/BATTLE_VERIFICATION_UNAVAILABLE/);
});

test('V8B-2B3: report refuses to choose a shipping policy or assert parity', () => {
  const r=run([]);
  assert.equal(r.decision,TOUCH_RELEASE_DECISION);
  assert.equal(r.evidence,'SYNTHETIC_TICK_TRACE_ONLY');
  assert.equal(r.parityVerified,false);
  assert.equal(r.deviceCaptureVerified,false);
  assert.equal(r.rewardAuthority,false);
  assert.deepEqual(Object.keys(r.policies).sort(),['boundedFlush','carry','clear']);
});

test('V8B-2B3: all three candidates identical at rest', () => {
  const r=run([],12);
  for (const key of ['clear','carry','boundedFlush']) {
    assert.equal(r.policies[key].metrics.finalGapWorld,0);
    assert.equal(r.policies[key].metrics.postReleaseTravelWorld,0);
  }
  assert.ok(b(r).samples.every(s=>s.frame.x===0&&s.frame.z===0));
});

test('V8B-2B3: fast flick lost by clear but retained exactly one tick by boundedFlush', () => {
  const r=run([down(0),drag(0,500),up(0)],10);
  assert.equal(r.policies.clear.metrics.postReleaseTravelWorld,0);
  assert.equal(r.policies.clear.metrics.movingTicks,0);
  assert.equal(b(r).samples[0].predictedX,-0.6);
  assert.equal(b(r).samples[0].frame.x,127);
  assert.equal(b(r).metrics.postReleaseTravelWorld,0.6);
  assert.equal(b(r).metrics.movingTicks,1);
  assert.deepEqual(b(r).samples.slice(1).map(s=>s.frame),Array(9).fill(null).map(()=>({x:0,z:0})));
});

test('V8B-2B3: long tail on carry is absent from boundedFlush', () => {
  const r=run([down(0),drag(0,500),up(0)],10);
  assert.equal(r.policies.carry.metrics.postReleaseTravelWorld,6);
  assert.equal(b(r).metrics.postReleaseTravelWorld,0.6);
  assert.ok(r.policies.clear.metrics.finalGapWorld > b(r).metrics.finalGapWorld);
  assert.ok(b(r).metrics.finalGapWorld > r.policies.carry.metrics.finalGapWorld);
});

test('V8B-2B3: pointer release after sampling permits at most one extra tick', () => {
  const r=run([down(0),drag(0,60),up(1)],8,{startZ:0});
  assert.equal(b(r).metrics.postReleaseTravelWorld,0.6);
  assert.equal(b(r).metrics.movingTicks,2);
  assert.equal(b(r).samples[1].predictedX,-1.2);
  assert.deepEqual(b(r).samples[2].frame,{x:0,z:0});
});

test('V8B-2B3: a tap with no drag cannot mint movement', () => {
  const r=run([down(0),up(0)],5);
  assert.equal(b(r).metrics.postReleaseTravelWorld,0);
  assert.equal(b(r).metrics.releaseCount,1);
  assert.equal(b(r).metrics.movingTicks,0);
});

test('V8B-2B3: no release means bounded candidate follows carry preview', () => {
  const r=run([down(0),drag(0,80,-20)],15,{startZ:0});
  assert.equal(b(r).metrics.postReleaseTravelWorld,0);
  assert.equal(b(r).metrics.finalGapWorld,r.policies.carry.metrics.finalGapWorld);
});

test('V8B-2B3: sequential gestures are independent and preserve immediate stopping', () => {
  const r=run([down(0),drag(0,500),up(0),down(3),drag(3,-500),up(3)],12,{startZ:0});
  assert.equal(b(r).metrics.releaseCount,2);
  assert.ok(b(r).metrics.postReleaseTravelWorld<=1.2+1e-6);
  assert.deepEqual(b(r).samples[1].frame,{x:0,z:0});
  assert.deepEqual(b(r).samples[4].frame,{x:0,z:0});
  assert.equal(b(r).samples[3].frame.x,-127);
});

test('V8B-2B3: same-tick multiple touch cycles are marked ambiguous, not silently replayed', () => {
  assert.throws(()=>run([down(0),drag(0,3),up(0),down(0),drag(0,5),up(0)],4),error('TOUCH_RELEASE_AMBIGUOUS'));
});

test('V8B-2B3: keyboard axes are untouched, drag right is world negative X', () => {
  const r=run([down(0),drag(0,15,10),up(0)],6,{startZ:0});
  assert.ok(b(r).samples[0].predictedX<0);
  assert.ok(b(r).samples[0].predictedZ>0);
  assert.ok(b(r).samples[0].frame.x>0);
  assert.ok(b(r).samples[0].frame.z>0);
});

test('V8B-2B3: world speed cap bounds release travel (including diagonal)', () => {
  for (const [dx,dy] of [[20000,0],[0,20000],[20000,20000],[-20000,-20000]]) {
    const r=run([down(0),drag(0,dx,dy),up(0)],10,{startZ:0});
    assert.ok(b(r).metrics.postReleaseTravelWorld <= 0.61);
    assert.ok(b(r).metrics.movingTicks <= 1);
  }
});

test('V8B-2B3: release cap scales with trusted fixture movePerTick only', () => {
  for (const movePerTick of [100,250,600,1000,3000]) {
    const r=run([down(0),drag(0,500),up(0)],8,{startZ:0,movePerTick});
    assert.ok(b(r).metrics.postReleaseTravelWorld <= movePerTick/1000 + 0.02);
    assert.ok(b(r).metrics.postReleaseTravelWorld >= 0);
  }
});

test('V8B-2B3: changing viewport does not grant speed authority', () => {
  const slow=run([down(0),drag(0,500),up(0)],6,{startZ:0,speedMultiplier:1});
  const fast=run([down(0),drag(0,500),up(0)],6,{startZ:0,speedMultiplier:3});
  assert.equal(b(slow).metrics.postReleaseTravelWorld,b(fast).metrics.postReleaseTravelWorld);
});

test('V8B-2B3: reject unexpected reward fields and inherited request properties', () => {
  assert.throws(()=>compare({config,events:[],ticks:3,victory:true}),error('TOUCH_RELEASE_CONTRACT_INVALID'));
  assert.throws(()=>compare(Object.create({config,events:[],ticks:3})),error('TOUCH_RELEASE_CONTRACT_INVALID'));
  assert.throws(()=>compare(null),error('TOUCH_RELEASE_CONTRACT_INVALID'));
});

test('V8B-2B3: getters and prototype-modified event arrays are rejected before reuse', () => {
  const request={config,events:[],ticks:3};
  Object.defineProperty(request,'ticks',{get(){return 3;},enumerable:true});
  assert.throws(()=>compare(request),error('TOUCH_RELEASE_CONTRACT_INVALID'));
  const events=[down(0),up(0)];
  Object.setPrototypeOf(events,[]);
  assert.throws(()=>compare({config,events,ticks:3}),error('TOUCH_RELEASE_CONTRACT_INVALID'));
  const event={tick:0,type:'down'};
  Object.defineProperty(event,'type',{get(){return 'down';},enumerable:true});
  assert.throws(()=>compare({config,events:[event],ticks:3}),error('TOUCH_RELEASE_CONTRACT_INVALID'));
});

test('V8B-2B3: input objects remain untouched and all three policies use the same trace', () => {
  const events=[down(0),drag(0,15,5),up(0)];
  const input={config:{...config},events,ticks:7};
  const original=JSON.stringify(input);
  const r=compare(input);
  assert.equal(JSON.stringify(input),original);
  assert.equal(r.eventCount,3);
  assert.equal(b(r).samples.length,7);
});

test('V8B-2B3: underlying validated trace rejects wrong events and oversize', () => {
  assert.throws(()=>run([drag(0,30)],10),e=>e?.code==='UX_PROBE_POINTER_SEQUENCE');
  assert.throws(()=>run([down(0),up(11)],10),e=>e?.code==='UX_PROBE_EVENT_INVALID');
  assert.throws(()=>run([],601),e=>e?.code==='UX_PROBE_CONTRACT_INVALID');
  assert.throws(()=>run([down(0),drag(0,Infinity)],5),e=>e?.code==='UX_PROBE_POINTER_SEQUENCE');
});

test('V8B-2B3: candidate output and journal frame shape are immutable', () => {
  const r=run([down(0),drag(0,500),up(0)],10);
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.policies));
  assert.ok(Object.isFrozen(b(r)));
  assert.ok(Object.isFrozen(b(r).metrics));
  assert.ok(Object.isFrozen(b(r).samples));
  assert.ok(Object.isFrozen(b(r).samples[0]));
  assert.ok(Object.isFrozen(b(r).samples[0].frame));
  assert.deepEqual(Object.keys(b(r).samples[0].frame).sort(),['x','z']);
});

test('V8B-2B3: emitted 30Hz frames conform to V8B-1 journal', () => {
  const r=run([down(0),drag(0,500),up(0),down(9),drag(9,-100),up(10)],20,{startZ:0});
  const chunk=validateChunk({protocol:PROTOCOL_VERSION,
    battleId:'18331e2b-fd17-44f4-a2c1-f9452892d28e',startTick:0,
    frames:b(r).samples.map(s=>s.frame)});
  assert.equal(chunk.frames.length,20);
});

test('V8B-2B3: deterministic release results repeat exactly', () => {
  const input=[down(0),drag(0,120,70),up(2),down(6),drag(6,-80,-35),up(9)];
  const a=run(input,18,{startZ:0});
  const c=run(input,18,{startZ:0});
  assert.deepEqual(a,c);
  assert.equal(createHash('sha256').update(JSON.stringify(b(a).samples)).digest('hex'),
    createHash('sha256').update(JSON.stringify(b(c).samples)).digest('hex'));
  assert.equal(createHash('sha256').update(JSON.stringify(b(run([down(0),drag(0,500),up(0)],10)).samples)).digest('hex'),
    'c8e86a16c1ef98647f61a0e1b11a184006990c0ad819b61e495736bbb7ca1d18');
});

test('V8B-2B3: numerical evidence must not claim real mobile parity', () => {
  const r=run([down(0),drag(0,500),up(0)],10);
  assert.equal(r.deviceCaptureVerified,false);
  assert.equal(r.parityVerified,false);
  assert.equal(r.rewardAuthority,false);
  assert.ok(b(r).metrics.finalGapWorld>0);
  assert.ok(b(r).metrics.postReleaseTravelWorld>0);
});
