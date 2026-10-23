'use strict';
/** FASTLANE C6-B: QA-only piercing ledger and delayed burst tick adapter from client ESM. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {POLICY_VERSION}=require('../lib/combatMovementWeaponV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const fs=require('node:fs');
const T0=1782000000000;
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const V4='pve-server-encounter-qa-v4';
const V5='pve-server-encounter-qa-v5';
const POLICY_C6='v8c6a-ballistic-preview-v2';
const POLICY_C6B='v8c6b-pierce-burst-preview-v3';
let catalog,clientWeapons,clientStats;
test.before(async()=>{
  const url=rel=>pathToFileURL(path.resolve(__dirname,'../../client/src',rel)).href;
  [catalog,clientWeapons,clientStats]=await Promise.all([
    import(url('constants.js')),import(url('game/combat/PlayerWeapons.js')),
    import(url('utils/combatStats.js'))]);
});
const isCode=c=>e=>e?.code===c;
const enemy=(id='remote',extra={})=>({
  id,kind:'grunt',behavior:'static',xUnits:-7000,zUnits:-8000,
  hp:10000,hitRadiusUnits:200,moveUnitsPerTick:0,contactDamage:0,
  shootEveryTicks:0,shotSpeedUnitsPerTick:0,shotDamage:0,shotPattern:'none',...extra,
});
function setup(gear='gun_rail',opts={}) {
  const identity={uid:'c6_ballistic_qa',sessionId:SID,battleId:BID,
    issuedAtMs:T0,expiresAtMs:T0+600000};
  const pilot=opts.pilot||'pilot_alpha';
  const profile={campaignData:{
    loadout:{pilot,aircraft:'ship_xwing',mainGun:'c6_gun',wingman:'',armor:'',drone:''},
    ownedPilots:{[pilot]:{level:1,stars:1}},
    ownedAircrafts:{ship_xwing:{level:1,stars:1}},
    items:{c6_gun:{baseId:gear,level:1,rarity:1,type:'mainGun'}},
  }};
  if (opts.aux) {
    const {slot,baseId}=opts.aux;
    profile.campaignData.loadout[slot]='c6_extra';
    profile.campaignData.items.c6_extra={baseId,level:1,rarity:1,type:slot};
  }
  const mode=opts.mode||'campaign',locationId=opts.locationId||'qa_alpha';
  const snapshot=createServerBattleSnapshot({
    identity,persistedProfile:profile,approvedCatalog:opts.catalog||catalog,
    rules:{mode,locationId,rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},
    arena:opts.arena||{halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500},
    seed:11335577,
  });
  const policy={version:opts.policy||POLICY_C6B,keyboardUnitsPer60HzFrame:.3,
    pilotHitRadiusUnits:700,projectileHitRadiusUnits:200};
  const journal=openInputJournal({uid:identity.uid,sessionId:SID,battleId:BID,
    rulesVersion:snapshot.context.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs:T0});
  const encounter={version:opts.version||V5,qaOnly:true,snapshotHash:snapshot.snapshotHash,
    mode,locationId,waves:opts.waves||[{atTick:1,enemies:[enemy()]}],
    damageCooldownTicks:45,enemyProjectileRadiusUnits:200};
  return {identity,profile,snapshot,journal,encounter,policy,
    open:()=>openCombatVerticalSlice({snapshot,journal,encounter,policy})};
}
const chunk=(start,n,fn=()=>({x:0,z:0}))=>({protocol:'pve-input-v1',battleId:BID,
  startTick:start,frames:Array.from({length:n},(_,i)=>fn(i))});
const step=(run,n,ms,fn=()=>({x:0,z:0}),start=run.state.tick)=>replayCombatSliceChunk({
  run,chunk:chunk(start,n,fn),receivedAtMs:T0+ms,
});

const gun = gear => catalog.GEAR_CATALOG.mainGun.find(g => g.id===gear);
const golden = a => {
  const selected=gun(a.profile.campaignData.items.c6_gun.baseId);
  const stats=clientStats.deriveCombatLoadout(a.profile.campaignData,catalog).stats;
  return clientWeapons.describeMainSalvo(selected,{x:0,z:12.5},stats.atk);
};
const far=()=>enemy('far',{xUnits:-6500,zUnits:-11000,hp:10000});

test('C6-B: pierce descriptor matches actual client rail attack, speed and penetration',()=>{
  const a=setup('gun_rail'),g=golden(a)[0];
  assert.equal(g.penetration,3);
  assert.equal(g.delayMs,0);
  assert.equal(g.vz,-1.35);
  const run=step(a.open(),1,100).run;
  const b=run.state.projectiles[0];
  assert.equal(run.state.version,'pve-lab-vertical-slice-v5');
  assert.equal(run.state.safeForCloudBattle,false);
  assert.equal(run.state.nextProjectileId,1);
  assert.equal(b.xUnits,Math.round((g.x+g.vx*2)*1000));
  assert.equal(b.zUnits,Math.round((g.z+g.vz*2)*1000));
  assert.equal(b.velocityZUnitsPerTick,Math.round(g.vz*2000));
  assert.equal(b.damageMilli,Math.round(g.atk*1000));
  assert.deepEqual(b.hitKeys,[]);
  assert.equal(b.remainingPenetration,g.penetration);
  assert.equal(Object.isFrozen(b.hitKeys),true);
});

test('C6-B: one swept rail tick hits 3 distinct targets in nearest-entry order and stops before fourth',()=>{
  const waves=[{atTick:1,enemies:[
    enemy('a',{xUnits:0,zUnits:10900,hp:999,hitRadiusUnits:100}),
    enemy('b',{xUnits:0,zUnits:10000,hp:999,hitRadiusUnits:100}),
    enemy('c',{xUnits:0,zUnits:9000,hp:999,hitRadiusUnits:100}),
    enemy('d',{xUnits:0,zUnits:8600,hp:999,hitRadiusUnits:100}),
  ]}];
  const a=setup('gun_rail',{waves});
  const result=step(a.open(),1,100);
  const hits=result.events.filter(e=>e.type==='hit');
  assert.deepEqual(hits.map(e=>e.id),['a','b','c']);
  assert.equal(hits.length,3);
  const damage=golden(a)[0].atk;
  assert.ok(hits.every(e=>e.damage===damage));
  assert.equal(result.run.state.enemies.find(e=>e.id==='d').hp,999);
  assert.equal(result.run.state.projectiles.length,0);
  assert.equal(result.run.state.nextProjectileId,1);
});

test('C6-B: rail remembers an already-hit living target across ticks and retries',()=>{
  const a=setup('gun_rail',{waves:[{atTick:1,enemies:[enemy('tank',{
    xUnits:0,zUnits:8500,hp:5000,hitRadiusUnits:1500,
  })]}]});
  const first=step(a.open(),1,100);
  assert.equal(first.events.filter(e=>e.type==='hit').length,1);
  assert.deepEqual(first.run.state.projectiles[0].hitKeys,['tank']);
  assert.equal(first.run.state.projectiles[0].remainingPenetration,2);
  const retry=step(first.run,1,120,()=>({x:0,z:0}),0);
  assert.equal(retry.duplicate,true);
  assert.equal(retry.run,first.run);
  const second=step(first.run,2,180);
  assert.equal(second.events.filter(e=>e.type==='hit').length,0);
  assert.equal(second.run.state.enemies[0].hp,5000-golden(a)[0].atk);
});

test('C6-B: rail damages new targets in later chunks, no repeat hit on overlapping first ID',()=>{
  const a=setup('gun_rail',{waves:[{atTick:1,enemies:[
    enemy('first',{xUnits:0,zUnits:10600,hp:10000,hitRadiusUnits:1000}),
    enemy('later',{xUnits:0,zUnits:5750,hp:10000,hitRadiusUnits:100}),
  ]}]});
  const first=step(a.open(),1,100),second=step(first.run,1,180);
  assert.deepEqual(first.events.filter(e=>e.type==='hit').map(e=>e.id),['first']);
  assert.deepEqual(second.events.filter(e=>e.type==='hit').map(e=>e.id),['later']);
  assert.deepEqual(second.run.state.projectiles[0].hitKeys,['first','later']);
  assert.equal(second.run.state.projectiles[0].remainingPenetration,1);
});

test('C6-B: equal-time rail contacts resolve deterministically by enemy ID',()=>{
  const a=setup('gun_rail',{waves:[{atTick:1,enemies:[
    enemy('zz',{xUnits:0,zUnits:10000,hp:9000,hitRadiusUnits:100}),
    enemy('bb',{xUnits:0,zUnits:10000,hp:9000,hitRadiusUnits:100}),
    enemy('aa',{xUnits:0,zUnits:10000,hp:9000,hitRadiusUnits:100}),
    enemy('cc',{xUnits:0,zUnits:10000,hp:9000,hitRadiusUnits:100}),
  ]}]});
  const r=step(a.open(),1,100);
  assert.deepEqual(r.events.filter(e=>e.type==='hit').map(e=>e.id),['aa','bb','cc']);
});

test('C6-B: burst describes 0/90/180ms from actual client and queues on 30Hz ticks',()=>{
  const a=setup('gun_pulse'),g=golden(a);
  assert.deepEqual(g.map(s=>s.delayMs),[0,90,180]);
  const init=a.open();
  const first=step(init,1,100);
  assert.equal(first.run.state.nextProjectileId,1);
  assert.equal(first.run.state.projectiles.length,1);
  assert.deepEqual(first.run.state.pendingBursts.map(s=>s.dueTick),[4,7]);
  for(const q of first.run.state.pendingBursts) {
    assert.equal(q.xUnits,Math.round(g[0].x*1000));
    assert.equal(q.zUnits,Math.round(g[0].z*1000));
    assert.equal(q.damageMilli,Math.round(g[0].atk*1000));
  }
  const moved=step(first.run,2,180);
  assert.equal(moved.run.state.nextProjectileId,1);
  const second=step(moved.run,1,210);
  assert.equal(second.run.state.nextProjectileId,2);
  assert.deepEqual(second.run.state.pendingBursts.map(s=>s.dueTick),[7]);
  assert.equal(second.run.state.projectiles.at(-1).zUnits,Math.round((g[1].z+g[1].vz*2)*1000));
  const third=step(second.run,3,350);
  assert.equal(third.run.state.nextProjectileId,3);
  assert.deepEqual(third.run.state.pendingBursts,[]);
  assert.equal(third.run.state.projectiles.at(-1).zUnits,Math.round((g[2].z+g[2].vz*2)*1000));
  assert.equal(third.run.state.safeForCloudBattle,false);
});

test('C6-B: delayed burst origin belongs to initial salvo, not later moving ship position',()=>{
  const a=setup('gun_pulse');
  const first=step(a.open(),1,100);
  const moving=step(first.run,6,400,()=>({x:127,z:0}));
  const expectedX=golden(a)[0].x*1000;
  assert.notEqual(moving.run.foundation.checkpoint.position.xUnits,expectedX);
  assert.equal(moving.run.state.nextProjectileId,3);
  assert.ok(moving.run.state.projectiles.every(b=>b.xUnits===expectedX));
});

test('C6-B: pending queue survives split-chunk and legitimate duplicate resends unchanged',()=>{
  for(const gear of ['gun_rail','gun_pulse']) {
    const a=setup(gear);
    const full=step(a.open(),20,900);
    const p1=step(a.open(),2,250);
    const dupe=step(p1.run,2,280,()=>({x:0,z:0}),0);
    assert.equal(dupe.duplicate,true);
    assert.equal(dupe.run,p1.run);
    const p2=step(p1.run,18,900);
    assert.deepEqual(p2.run.state,full.run.state,gear);
    assert.deepEqual(p2.run.foundation.checkpoint.position,full.run.foundation.checkpoint.position);
    assert.deepEqual(p2.run.foundation.checkpoint.fireClock,full.run.foundation.checkpoint.fireClock);
    assert.equal(p2.run.foundation.checkpoint.eventDigest,full.run.foundation.checkpoint.eventDigest);
    assert.equal(p2.run.state.safeForCloudBattle,false);
  }
});

test('C6-B: 30/60/120Hz presentation with identical 30Hz journal reproduces same state',()=>{
  for(const gear of ['gun_rail','gun_pulse']) {
    const inputs=Array.from({length:24},(_,i)=>i%2===0?{x:127,z:0}:{x:0,z:-127});
    const outputs=[];
    for(const fps of [30,60,120]) {
      let run=setup(gear).open(),tick=0;
      for(let display=0;display<inputs.length*fps/30;display++) {
        if(display%(fps/30)!==0) continue;
        run=step(run,1,Math.ceil((tick+1)*1000/30)+100,()=>inputs[tick]).run;
        tick++;
      }
      assert.equal(tick,inputs.length);
      outputs.push(run.state);
    }
    assert.deepEqual(outputs[0],outputs[1]);
    assert.deepEqual(outputs[1],outputs[2]);
  }
});

test('C6-B: v5 rejects C6-A and legacy policies; v4 refuses v5 permission',()=>{
  for (const gear of ['gun_rail','gun_pulse']) {
    assert.throws(()=>setup(gear,{policy:POLICY_VERSION}).open(),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'));
    assert.throws(()=>setup(gear,{policy:POLICY_C6}).open(),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'));
    assert.throws(()=>setup(gear,{version:V4}).open(),isCode('SLICE_POLICY_VERSION_MISMATCH'));
  }
  assert.throws(()=>setup('gun_spread').open(),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'));
});

test('C6-B: unknown secondary equipment and unmodeled crit/dodge pilot remain fail-closed',()=>{
  for(const aux of [{slot:'wingman',baseId:'wing_missile'},
    {slot:'drone',baseId:'drone_sniper'},
    {slot:'armor',baseId:'armor_light'}]) {
    assert.throws(()=>setup('gun_rail',{aux}).open(),isCode('SLICE_LOADOUT_UNMODELED'));
  }
  assert.throws(()=>setup('gun_pulse',{pilot:'pilot_ghost'}).open(),isCode('SLICE_LOADOUT_UNMODELED'));
});

test('C6-B: forged outcome in encounter/journal is rejected and no Cloud reward is granted',()=>{
  const a=setup('gun_pulse'),opened=a.open();
  for (const field of ['victory','stars','rewards','receipt','verified']) {
    assert.equal(Object.hasOwn(opened.state,field),false);
    assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,policy:a.policy,journal:a.journal,
      encounter:{...a.encounter,[field]:true}}),isCode('SLICE_ENCOUNTER_INVALID'));
  }
  assert.throws(()=>replayCombatSliceChunk({run:opened,chunk:{...chunk(0,1),victory:true},receivedAtMs:T0+100}),isCode('INPUT_CHUNK_INVALID'));
  assert.equal(opened.state.safeForCloudBattle,false);
});

test('C6-B: immutable checksum rejects forged pending timer or bullet hit ledger',()=>{
  const a=setup('gun_pulse');
  const r=step(a.open(),1,100).run;
  assert.ok(Object.isFrozen(r.state.pendingBursts));
  assert.ok(Object.isFrozen(r.state.pendingBursts[0]));
  const bad=Object.freeze({...r,state:Object.freeze({...r.state,
    pendingBursts:Object.freeze([{...r.state.pendingBursts[0],dueTick:2},r.state.pendingBursts[1]])})});
  assert.throws(()=>step(bad,1,150),isCode('SLICE_STATE_INVALID'));
  const pierced=step(setup('gun_rail').open(),1,100).run;
  assert.ok(Object.isFrozen(pierced.state.projectiles[0].hitKeys));
  const changed=Object.freeze({...pierced,state:Object.freeze({...pierced.state,
    projectiles:Object.freeze([{...pierced.state.projectiles[0],hitKeys:['forged'] }])})});
  assert.throws(()=>step(changed,1,150),isCode('SLICE_STATE_INVALID'));
});

test('C6-B: invalid journal speed/extra fields and stale chunk fail closed',()=>{
  const a=setup('gun_rail'),opened=a.open();
  assert.throws(()=>replayCombatSliceChunk({run:opened,chunk:{...chunk(0,1),rewards:99},receivedAtMs:T0+100}),isCode('INPUT_CHUNK_INVALID'));
  assert.throws(()=>replayCombatSliceChunk({run:opened,chunk:chunk(0,1,()=>({x:500,z:0})),receivedAtMs:T0+100}),isCode('INPUT_FRAME_INVALID'));
  assert.throws(()=>replayCombatSliceChunk({run:opened,chunk:chunk(0,1),receivedAtMs:T0+700000}),e=>e?.code && /INPUT_/.test(e.code));
});

test('C6-B: QA v5 is isolated from economy/API and legacy GameService P0 gate',()=>{
  const root=path.resolve(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'lib/combatVerticalSliceV8.cjs'),'utf8');
  const srv=fs.readFileSync(path.join(root,'lib/gameService.cjs'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:firebase-admin|express|\.\/gameService|\.\/economy)/);
  assert.match(srv,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.match(srv,/Cloud battles are temporarily unavailable pending server-side combat verification/);
});
