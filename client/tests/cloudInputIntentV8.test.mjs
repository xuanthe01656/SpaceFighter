import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  CLOUD_INTENT_VERSION, CLOUD_INTENT_TICK_HZ, CLOUD_INTENT_WORLD_SCALE,
  CLOUD_INTENT_INPUT_MAX, openCloudInputIntent, addCloudPointerDelta,
  sampleCloudInputTick, reconfigureCloudViewport, suspendCloudInputIntent,
  clearCloudPointerTarget,
} from '../src/game/combat/CloudInputIntentV8.js';
import { worldDragDelta } from '../src/game/combat/ShipInputController.js';
import core from '../../server/lib/combatCoreV8.cjs';
import journalApi from '../../server/lib/combatInputJournalV8.cjs';

const { openCombatCore,replayAcceptedChunk } = core;
const { openInputJournal,validateChunk,PROTOCOL_VERSION } = journalApi;
const battleId='c2d449fb-4e41-46e3-9f66-5f39a4f5a6d4';
const sessionId='37ac1b9c-9759-42b6-a56e-52f647e235eb';
const issuedAtMs=1792627200000;
const defaults={
  arenaHalfWidth:15000,arenaHalfHeight:15000,hitRadius:700,
  movePerTick:600,startX:0,startZ:12500,
  canvasWidth:500,canvasHeight:500,halfHeight:15,aspect:1,speedMultiplier:1,
};
const open=(override={})=>openCloudInputIntent({...defaults,...override});
const drag=(s,x,y)=>addCloudPointerDelta(s,{deltaX:x,deltaY:y});
const step=s=>sampleCloudInputTick(s);
const code=name=>err=>err?.code===name;
const read=p=>readFileSync(fileURLToPath(new URL(p,import.meta.url)),'utf8');

test('V8B-2B1: pure 30Hz client preview exports no victory or settlement authority',()=>{
  assert.equal(CLOUD_INTENT_VERSION,'cloud-touch-intent-v8b2b1');
  assert.equal(CLOUD_INTENT_TICK_HZ,30);
  assert.equal(CLOUD_INTENT_WORLD_SCALE,core.UNITS_PER_WORLD);
  assert.equal(CLOUD_INTENT_INPUT_MAX,127);
  const a=read('../src/game/combat/CloudInputIntentV8.js');
  assert.doesNotMatch(a,/fetch\s*\(|firebase-admin|battle\.finish|settleReward|verifyVictory/);
  assert.equal(Object.hasOwn(core,'verifyVictory'),false);
});

test('V8B-2B1: rejects unexpected state/config/input and injected result properties',()=>{
  assert.throws(()=>open({victory:true}),code('CLOUD_INTENT_CONFIG_INVALID'));
  assert.throws(()=>open({movePerTick:3200}),code('CLOUD_INTENT_CONFIG_INVALID'));
  assert.throws(()=>open({startZ:15000}),code('CLOUD_INTENT_CONFIG_INVALID'));
  assert.throws(()=>open({canvasWidth:0}),code('CLOUD_INTENT_VIEWPORT_INVALID'));
  const s=open();
  assert.throws(()=>addCloudPointerDelta(s,{deltaX:10}),code('CLOUD_INTENT_DRAG_INVALID'));
  assert.throws(()=>addCloudPointerDelta(s,{deltaX:10,deltaY:0,victory:true}),code('CLOUD_INTENT_DRAG_INVALID'));
  assert.throws(()=>drag(s,Infinity,0),code('CLOUD_INTENT_DRAG_INVALID'));
  assert.throws(()=>step({...s}),code('CLOUD_INTENT_STATE_INVALID'));
  assert.throws(()=>drag(Object.create({tick:0}),1,1),code('CLOUD_INTENT_STATE_INVALID'));
});

test('V8B-2B1: huge screen drag changes only target, never teleports pilot',()=>{
  const initial=open();
  const target=drag(initial,500,0);
  assert.equal(initial.positionX,0);
  assert.equal(target.positionX,0);
  assert.equal(target.targetX,-14300); // server radius bounds, not legacy inset
  const r=step(target);
  assert.deepEqual(r.frame,{x:127,z:0});
  assert.equal(r.state.positionX,-600);
  assert.equal(r.state.tick,1);
  assert.equal(target.tick,0);
});

test('V8B-2B1: every output frame conforms exactly to journal pve-input-v1',()=>{
  let s=drag(open(),310,-120);
  const frames=[];
  for(let i=0;i<60;i++){
    const result=step(s);s=result.state;frames.push(result.frame);
  }
  const validated=validateChunk({protocol:PROTOCOL_VERSION,battleId,startTick:0,frames});
  assert.equal(validated.frames.length,60);
  assert.ok(frames.every(f=>Object.keys(f).sort().join(',')==='x,z'));
  assert.ok(frames.every(f=>f.x*f.x+f.z*f.z<=128*128));
  assert.equal(s.tick,60);
});

test('V8B-2B1: sampled movement exactly matches V8B-2A core with same trusted snapshot',()=>{
  const journal=openInputJournal({uid:'v8b2b1_player',sessionId,battleId,
    rulesVersion:'combat-v1.0.0',loadoutHash:'a'.repeat(64),issuedAtMs});
  const state=openCombatCore({journal,seed:39389,
    arena:{halfWidth:15000,halfHeight:15000},
    pilot:{x:0,z:12500,hp:1000,maxHp:1000,armor:0,atk:0,
      movePerTick:600,fireEveryTicks:12,shotSpeed:1560,
      hitRadius:700,bulletRadius:200,critChancePermille:0,
      critBonusPermille:250,dodgeChancePermille:0},enemies:[]});
  let sampler=drag(open(),280,-75);
  const frames=[];
  for(let i=0;i<40;i++){
    const next=step(sampler);sampler=next.state;frames.push(next.frame);
  }
  const result=replayAcceptedChunk({state,journal,receivedAtMs:issuedAtMs+2000,
    chunk:{protocol:PROTOCOL_VERSION,battleId,startTick:0,frames}});
  assert.equal(result.state.tick,40);
  assert.equal(result.state.pilot.x,sampler.positionX);
  assert.equal(result.state.pilot.z,sampler.positionZ);
  assert.equal(result.state.journalDigest,result.journal.digest);
});

test('V8B-2B1: screen right is world -X; screen down is world +Z',()=>{
  const moved=drag(open({startZ:0}),2,2);
  const r=step(moved);
  assert.ok(r.frame.x>0);
  assert.ok(r.frame.z>0);
  assert.ok(r.state.positionX<0);
  assert.ok(r.state.positionZ>0);
});

test('V8B-2B1: split pointermove events preserve accumulated target intent',()=>{
  let first=drag(open({startZ:0}),5,3);
  let split=open({startZ:0});
  split=drag(split,2,1);
  split=drag(split,3,2);
  assert.ok(Math.abs(first.targetX-split.targetX)<0.000001);
  assert.ok(Math.abs(first.targetZ-split.targetZ)<0.000001);
  assert.deepEqual(step(first).frame,step(split).frame);
});

test('V8B-2B1: drag target uses exact current CSS camera projection',()=>{
  const state=open({canvasWidth:750,canvasHeight:1250,halfHeight:15,aspect:0.6,startZ:0});
  const projected=worldDragDelta(21,-17,750,1250,15,0.6,1);
  const moved=drag(state,21,-17);
  assert.ok(Math.abs(moved.targetX-projected.x*1000)<1e-6);
  assert.ok(Math.abs(moved.targetZ-projected.z*1000)<1e-6);
});

test('V8B-2B1: diagonal inputs are normalized, never exceed journal speed bound',()=>{
  const moved=drag(open({startZ:0}),500,500);
  const r=step(moved);
  assert.ok(r.frame.x>0 && r.frame.z>0);
  assert.ok(r.frame.x*r.frame.x+r.frame.z*r.frame.z<=128*128);
  assert.ok(Math.hypot(r.state.positionX,r.state.positionZ)<=602);
});

test('V8B-2B1: speed multiplier changes desired distance, not per-tick authority',()=>{
  const slow=step(drag(open({startZ:0,speedMultiplier:1}),100,0));
  const fast=step(drag(open({startZ:0,speedMultiplier:3}),100,0));
  assert.equal(slow.state.positionX,-600);
  assert.equal(fast.state.positionX,-600);
  assert.ok(fast.state.targetX<slow.state.targetX);
});

test('V8B-2B1: target clamp follows server collision radius rather than Guest inset',()=>{
  let s=drag(open({startZ:0}),10000,10000);
  assert.equal(s.targetX,-14300);
  assert.equal(s.targetZ,14300);
  for(let i=0;i<120;i++) s=step(s).state;
  assert.ok(s.positionX>=-14300);
  assert.ok(s.positionZ<=14300);
});

test('V8B-2B1: sub-quantum pointer movements do not introduce jitter',()=>{
  let s=drag(open({startZ:0}),0.000001,0);
  const a=step(s);
  assert.deepEqual(a.frame,{x:0,z:0});
  assert.equal(a.state.positionX,0);
});

test('V8B-2B1: idle tick emits neutral input; render callbacks cannot change intent',()=>{
  let s=open();
  for(let i=0;i<10;i++){
    const r=step(s);s=r.state;
    assert.deepEqual(r.frame,{x:0,z:0});
  }
  assert.equal(s.tick,10);
  assert.equal(s.positionZ,12500);
});

test('V8B-2B1: viewport rotation resets stale pointer target without changing arena',()=>{
  const initial=drag(open({startZ:0}),200,200);
  const newState=reconfigureCloudViewport(initial,{
    canvasWidth:1200,canvasHeight:700,halfHeight:15,aspect:1200/700,speedMultiplier:1,
  });
  assert.equal(newState.targetX,newState.positionX);
  assert.equal(newState.targetZ,newState.positionZ);
  assert.equal(newState.arenaHalfWidth,15000);
  assert.deepEqual(step(newState).frame,{x:0,z:0});
  assert.throws(()=>reconfigureCloudViewport(newState,{canvasWidth:0}),code('CLOUD_INTENT_VIEWPORT_INVALID'));
});

test('V8B-2B1: pointer release can cancel queued target without moving or teleporting',()=>{
  const s=drag(open(),300,0);
  const cleared=clearCloudPointerTarget(s);
  assert.equal(cleared.positionX,s.positionX);
  assert.equal(cleared.targetX,cleared.positionX);
  assert.deepEqual(step(cleared).frame,{x:0,z:0});
  assert.ok(s.targetX<0); // original immutable target stays intact
});

test('V8B-2B1: 30/60/120 render callbacks yield identical input on the same 30Hz event trace',()=>{
  const build=fps=>{
    let s=open({startZ:0});const frames=[];
    for(let tick=0;tick<50;tick++){
      // Rendering can run multiple times per authoritative input tick.
      for(let render=0;render<fps/30;render++){
        assert.equal(s.tick,tick);
      }
      if(tick%5===0) s=drag(s,5,-2);
      const r=step(s);s=r.state;frames.push(r.frame);
    }
    return {frames,positionX:s.positionX,positionZ:s.positionZ};
  };
  assert.deepEqual(build(30),build(60));
  assert.deepEqual(build(60),build(120));
});

test('V8B-2B1: deterministic mixed-input frame stream cannot exceed core arena',()=>{
  let s=open({startZ:0});
  let raw=0x5b8a0123;
  for(let i=0;i<1000;i++){
    raw^=raw<<13;raw^=raw>>>17;raw^=raw<<5;raw>>>=0;
    if(i%4===0){
      const x=(raw%401)-200;
      const y=((raw>>>7)%401)-200;
      s=drag(s,x,y);
    }
    const r=step(s);s=r.state;
    validateChunk({protocol:PROTOCOL_VERSION,battleId,startTick:i,frames:[r.frame]});
    assert.ok(s.positionX>=-14300 && s.positionX<=14300);
    assert.ok(s.positionZ>=-14300 && s.positionZ<=14300);
    assert.ok(r.frame.x*r.frame.x+r.frame.z*r.frame.z<=128*128);
  }
  assert.equal(s.tick,1000);
});

test('V8B-2B1: golden 50-tick touch trajectory detects contract drift',()=>{
  let s=open();const frames=[];
  for(let i=0;i<50;i++){
    if(i===0) s=drag(s,320,-110);
    if(i===25) s=drag(s,-80,40);
    const r=step(s);frames.push(r.frame);s=r.state;
  }
  const digest=createHash('sha256').update(JSON.stringify([
    frames,s.positionX,s.positionZ,s.targetX,s.targetZ,
  ])).digest('hex');
  assert.equal(digest,'5db5ebb857f6fff04702936e651c5ab7e5ea47905fa33f0b9a0b95882e4f9504');
  assert.equal(s.positionX,-9502);
  assert.equal(s.positionZ,8298);
});

test('V8B-2B1: focus loss suspends input, no unsafe local resume',()=>{
  const state=suspendCloudInputIntent(drag(open(),2,2));
  assert.equal(state.suspended,true);
  assert.equal(state.targetX,state.positionX);
  assert.throws(()=>step(state),code('CLOUD_INTENT_SUSPENDED'));
  assert.throws(()=>drag(state,1,1),code('CLOUD_INTENT_SUSPENDED'));
  assert.throws(()=>reconfigureCloudViewport(state,{
    canvasWidth:500,canvasHeight:500,halfHeight:15,aspect:1,speedMultiplier:1,
  }),code('CLOUD_INTENT_SUSPENDED'));
});

test('V8B-2B1: no gameplay/Cloud API integration, Guest controls untouched and P0 closed',()=>{
  const campaign=read('../src/components/Campaign/CampaignScene.js');
  const dungeon=read('../src/components/Dungeon/DungeonScene.js');
  const input=read('../src/game/combat/ShipInputController.js');
  const service=read('../../server/lib/gameService.cjs');
  const economy=read('../../server/lib/economy.cjs');
  const adapterName=/CloudInputIntentV8|openCloudInputIntent/;
  assert.doesNotMatch(campaign,adapterName);
  assert.doesNotMatch(dungeon,adapterName);
  assert.doesNotMatch(input,adapterName);
  assert.doesNotMatch(service,adapterName);
  assert.doesNotMatch(economy,adapterName);
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
});
