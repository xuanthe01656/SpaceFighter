import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runCloudTouchUxParityProbe as run, UX_PROBE_VERSION } from '../src/game/combat/CloudTouchUxParityProbeV8.js';
import journalApi from '../../server/lib/combatInputJournalV8.cjs';
const { validateChunk, PROTOCOL_VERSION } = journalApi;
import { worldDragDelta } from '../src/game/combat/ShipInputController.js';

const defaults = Object.freeze({
  arenaHalfWidth:15000, arenaHalfHeight:15000, hitRadius:700,
  movePerTick:600, startX:0, startZ:12500,
  canvasWidth:500, canvasHeight:500, halfHeight:15,
  aspect:1, speedMultiplier:1, legacyInset:1.8,
});
const down = tick => ({tick,type:'down'});
const drag = (tick,deltaX,deltaY=0) => ({tick,type:'drag',deltaX,deltaY});
const up = tick => ({tick,type:'up'});
const probe = (events, ticks=10, releasePolicy='clear', overrides={}) =>
  run({config:{...defaults,...overrides},events,ticks,releasePolicy});
const error = code => err => err?.code===code;
const read = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

// The results measure a mismatch; PASS must NEVER be interpreted as UX parity.
test('V8B-2B2: probe is isolated, explicitly offline, and has no authority', () => {
  const source = read('../src/game/combat/CloudTouchUxParityProbeV8.js');
  assert.equal(UX_PROBE_VERSION,'cloud-touch-ux-probe-v8b2b2');
  assert.doesNotMatch(source, /fetch\s*\(|axios|firebase-admin|battle\.finish|settleReward|verifyVictory/);
  for (const path of [
    '../src/game/combat/ShipInputController.js',
    '../src/components/Campaign/CampaignScene.js',
    '../src/components/Dungeon/DungeonScene.js',
    '../../server/lib/gameService.cjs',
  ]) assert.doesNotMatch(read(path), /CloudTouchUxParityProbeV8/);
  assert.match(read('../../server/lib/gameService.cjs'), /BATTLE_VERIFICATION_UNAVAILABLE/);
});

test('V8B-2B2: no-input trace is identical and immutable', () => {
  const result=probe([], 10);
  assert.equal(result.tickHz,30);
  assert.equal(result.metrics.peakGapWorld,0);
  assert.equal(result.metrics.meanGapWorld,0);
  assert.equal(result.metrics.movingTicks,0);
  assert.equal(result.metrics.postReleaseTravelWorld,0);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.metrics));
  assert.ok(Object.isFrozen(result.samples));
  assert.ok(Object.isFrozen(result.samples[0]));
  assert.ok(Object.isFrozen(result.samples[0].frame));
  assert.deepEqual(result.samples.at(-1).frame,{x:0,z:0});
});

test('V8B-2B2: instant drag vs 30Hz target causes measurable same-tick position gap', () => {
  const result=probe([down(0),drag(0,500)], 1, 'carry');
  assert.equal(result.samples[0].legacyX,-13.2);
  assert.equal(result.samples[0].previewX,-0.6);
  assert.equal(result.metrics.peakGapWorld,12.6);
  assert.equal(result.metrics.finalGapWorld,12.6);
  assert.deepEqual(result.samples[0].frame,{x:127,z:0});
});

test('V8B-2B2: same-tick fast flick is lost with clear-on-up candidate', () => {
  const r=probe([down(0),drag(0,500),up(0)],10,'clear');
  assert.equal(r.samples[0].legacyX,-13.2);
  assert.equal(r.samples[0].previewX,0);
  assert.equal(r.metrics.movingTicks,0);
  assert.equal(r.metrics.finalGapWorld,13.2);
  assert.equal(r.metrics.postReleaseTravelWorld,0);
});

test('V8B-2B2: same-tick fast flick can continue after release with carry candidate', () => {
  const r=probe([down(0),drag(0,500),up(0)],10,'carry');
  assert.equal(r.samples[0].legacyX,-13.2);
  assert.equal(r.samples[0].previewX,-0.6);
  assert.equal(r.metrics.postReleaseTravelWorld,6);
  assert.equal(r.metrics.movingTicks,10);
  assert.equal(r.metrics.finalGapWorld,7.2);
});

test('V8B-2B2: release after sampling stops movement under clear candidate', () => {
  const r=probe([down(0),drag(0,60),up(1)],8,'clear');
  assert.equal(r.samples[0].previewX,-0.6);
  assert.equal(r.samples[1].previewX,-0.6);
  assert.equal(r.metrics.postReleaseTravelWorld,0);
  assert.equal(r.metrics.movingTicks,1);
});

test('V8B-2B2: release after sampling retains travel under carry candidate', () => {
  const r=probe([down(0),drag(0,60),up(1)],8,'carry');
  assert.ok(r.samples[1].previewX < r.samples[0].previewX);
  assert.ok(r.metrics.postReleaseTravelWorld>0);
});

test('V8B-2B2: small mouse drag can converge without instant teleport', () => {
  const r=probe([down(0),drag(0,5)],20,'carry',{startZ:0});
  assert.equal(r.samples.at(-1).legacyX,-0.3);
  assert.ok(Math.abs(r.samples.at(-1).previewX+0.3)<0.02);
  assert.ok(r.metrics.finalGapWorld<0.02);
});

test('V8B-2B2: diagonal and screen-axis directions follow existing projection', () => {
  const r=probe([down(0),drag(0,3,3)],20,'carry',{startZ:0});
  assert.ok(r.samples.at(-1).legacyX<0);
  assert.ok(r.samples.at(-1).legacyZ>0);
  assert.ok(r.samples[0].frame.x>0);
  assert.ok(r.samples[0].frame.z>0);
  assert.deepEqual(worldDragDelta(3,3,500,500,15,1,1),{x:-0.18,z:0.18});
});

test('V8B-2B2: different speed multiplier changes legacy instant position, not preview tick cap', () => {
  const events=[down(0),drag(0,20)];
  const slow=probe(events,1,'carry',{startZ:0,speedMultiplier:1});
  const fast=probe(events,1,'carry',{startZ:0,speedMultiplier:3});
  assert.ok(Math.abs(fast.samples[0].legacyX)>Math.abs(slow.samples[0].legacyX));
  assert.equal(slow.samples[0].previewX,-0.6);
  assert.equal(fast.samples[0].previewX,-0.6);
});

test('V8B-2B2: viewport ratio changes legacy bound and projected delta', () => {
  const wide=probe([down(0),drag(0,200)],1,'carry',{startZ:0,aspect:2,canvasWidth:1000});
  const tall=probe([down(0),drag(0,200)],1,'carry',{startZ:0,aspect:0.6,canvasWidth:500});
  assert.equal(wide.samples[0].legacyX,-12);
  assert.equal(tall.samples[0].legacyX,-7.2);
  assert.equal(wide.samples[0].previewX,-0.6);
  assert.equal(tall.samples[0].previewX,-0.6);
});

test('V8B-2B2: arena collision radius and legacy inset can leave terminal discrepancy', () => {
  const r=probe([down(0),drag(0,1000)],100,'carry',{startZ:0});
  assert.equal(r.samples.at(-1).legacyX,-13.2);
  assert.equal(r.samples.at(-1).previewX,-14.3);
  assert.equal(r.metrics.finalGapWorld,1.1);
});

test('V8B-2B2: split pointer moves within same tick produce identical positions and frames', () => {
  const one=probe([down(0),drag(0,100,20)],25,'carry',{startZ:0});
  const many=probe([down(0),drag(0,40,10),drag(0,60,10)],25,'carry',{startZ:0});
  assert.deepEqual(one.samples,many.samples);
  assert.deepEqual(one.metrics,many.metrics);
});

test('V8B-2B2: input frames produced by probe remain valid journal pve-input-v1', () => {
  const r=probe([down(0),drag(0,320,-80),up(10)],25,'carry');
  const frames=r.samples.map(s=>s.frame);
  const chunk=validateChunk({
    protocol:PROTOCOL_VERSION,
    battleId:'18331e2b-fd17-44f4-a2c1-f9452892d28e',
    startTick:0,frames,
  });
  assert.equal(chunk.frames.length,25);
  assert.ok(frames.every(f=>Object.keys(f).sort().join(',')==='x,z'));
});

test('V8B-2B2: multiple touches may be simulated sequentially without carrying after clear', () => {
  const events=[down(0),drag(0,100),up(1),down(3),drag(3,-60),up(4)];
  const r=probe(events,10,'clear',{startZ:0});
  assert.equal(r.metrics.postReleaseTravelWorld,0);
  assert.equal(r.metrics.activeTicks,2);
  assert.equal(r.samples[3].active,true);
  assert.equal(r.samples[4].active,false);
});

test('V8B-2B2: rejects untrusted extra result fields and bad prototype/shape', () => {
  assert.throws(()=>run({config:defaults,events:[],ticks:10,releasePolicy:'carry',victory:true}),error('UX_PROBE_CONTRACT_INVALID'));
  assert.throws(()=>run({config:{...defaults,coins:1},events:[],ticks:10,releasePolicy:'carry'}),error('UX_PROBE_CONTRACT_INVALID'));
  assert.throws(()=>run(Object.create({config:defaults,events:[],ticks:10,releasePolicy:'carry'})),error('UX_PROBE_CONTRACT_INVALID'));
  assert.throws(()=>probe([],0),error('UX_PROBE_CONTRACT_INVALID'));
  assert.throws(()=>probe([],601),error('UX_PROBE_CONTRACT_INVALID'));
  assert.throws(()=>probe([],10,'auto'),error('UX_PROBE_CONTRACT_INVALID'));
  assert.throws(()=>probe([],10,'clear',{legacyInset:Infinity}),error('UX_PROBE_INSET_INVALID'));
  assert.throws(()=>probe([],10,'clear',{startZ:14000}),error('UX_PROBE_LEGACY_START_INVALID'));
});

test('V8B-2B2: invalid/out-of-order pointer events cannot silently change a trace', () => {
  assert.throws(()=>probe([drag(0,2)],5),error('UX_PROBE_POINTER_SEQUENCE'));
  assert.throws(()=>probe([up(0)],5),error('UX_PROBE_POINTER_SEQUENCE'));
  assert.throws(()=>probe([down(0),down(1)],5),error('UX_PROBE_POINTER_SEQUENCE'));
  assert.throws(()=>probe([down(0),drag(1,NaN)],5),error('UX_PROBE_POINTER_SEQUENCE'));
  assert.throws(()=>probe([down(0),drag(1,Infinity)],5),error('UX_PROBE_POINTER_SEQUENCE'));
  assert.throws(()=>probe([down(0),drag(0,20001)],5),error('UX_PROBE_POINTER_SEQUENCE'));
  assert.throws(()=>probe([down(2),drag(1,3)],5),error('UX_PROBE_EVENT_INVALID'));
  assert.throws(()=>probe([down(0),up(6)],5),error('UX_PROBE_EVENT_INVALID'));
  assert.throws(()=>probe([down(0),{tick:1,type:'teleport'}],5),error('UX_PROBE_EVENT_INVALID'));
  assert.throws(()=>probe([down(0),{...drag(1,2),stars:5}],5),error('UX_PROBE_POINTER_SEQUENCE'));
});

test('V8B-2B2: synthetic traces are stable across repeated executions', () => {
  const events=[down(0),drag(0,100,80),drag(3,-20,-40),up(7)];
  const first=probe(events,30,'carry',{startZ:0});
  const second=probe(events,30,'carry',{startZ:0});
  assert.deepEqual(first,second);
  const hash=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
  assert.equal(hash(first.samples),hash(second.samples));
  assert.equal(hash(first.samples),'655b7170497be114511928dbcbd54a41912068bd03a11cf0aab11f5bc2ef33ea');
});

test('V8B-2B2: render FPS is not an accepted trace input or a gameplay claim', () => {
  const events=[down(0),drag(0,100,80),drag(6,-20,-40),up(12)];
  const candidate={config:{...defaults,startZ:0},events,ticks:30,releasePolicy:'clear'};
  const base=run(candidate);
  for (const fps of [30,60,120]) {
    assert.throws(()=>run({...candidate,renderFps:fps}),error('UX_PROBE_CONTRACT_INVALID'));
    assert.deepEqual(run(candidate).samples,base.samples);
  }
  const source=read('../src/game/combat/CloudTouchUxParityProbeV8.js');
  assert.doesNotMatch(source,/requestAnimationFrame|setInterval|performance\.now|engine\.getDeltaTime/);
});

test('V8B-2B2: report declares no parity guarantee or real mobile measurements', () => {
  const r=probe([down(0),drag(0,500),up(0)],10,'clear');
  assert.equal(Object.hasOwn(r,'victory'),false);
  assert.equal(Object.hasOwn(r,'settlement'),false);
  assert.ok(r.metrics.finalGapWorld>0);
  assert.equal(r.version,UX_PROBE_VERSION);
  assert.equal(r.eventCount,3);
});
