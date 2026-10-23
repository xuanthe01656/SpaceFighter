'use strict';
/** FASTLANE C6-A: QA-only static multi-pellet golden parity from actual client ESM. */
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
const POLICY_C6='v8c6a-ballistic-preview-v2';
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
function setup(gear='gun_spread',opts={}) {
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
  const policy={version:opts.policy||POLICY_C6,keyboardUnitsPer60HzFrame:.3,
    pilotHitRadiusUnits:700,projectileHitRadiusUnits:200};
  const journal=openInputJournal({uid:identity.uid,sessionId:SID,battleId:BID,
    rulesVersion:snapshot.context.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs:T0});
  const encounter={version:opts.version||V4,qaOnly:true,snapshotHash:snapshot.snapshotHash,
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
const shapes=Object.freeze([
  {gear:'gun_spread',count:3},
  {gear:'gun_photon',count:5},
  {gear:'gun_shotgun',count:7},
]);

test('C6-A: source-derived descriptor golden matches ALL static pellets at first 30Hz tick',()=>{
  for(const shape of shapes){
    const a=setup(shape.gear);
    const clientGear=catalog.GEAR_CATALOG.mainGun.find(g=>g.id===shape.gear);
    const stats=clientStats.deriveCombatLoadout(a.profile.campaignData,catalog).stats;
    const golden=clientWeapons.describeMainSalvo(clientGear,{x:0,z:12.5},stats.atk);
    assert.equal(golden.length,shape.count);
    const initial=a.open();
    assert.equal(initial.state.safeForCloudBattle,false);
    assert.equal(initial.state.version,'pve-lab-vertical-slice-v4');
    const result=step(initial,1,100);
    assert.equal(result.run.state.nextProjectileId,shape.count);
    assert.equal(result.run.state.projectiles.length,shape.count);
    for(let i=0;i<shape.count;i++){
      const b=result.run.state.projectiles[i],g=golden[i];
      assert.equal(b.xUnits,Math.round(g.x*1000+g.vx*2000),shape.gear+' x pellet '+i);
      assert.equal(b.zUnits,Math.round(g.z*1000+g.vz*2000),shape.gear+' z pellet '+i);
      assert.equal(b.velocityXUnitsPerTick,Math.round(g.vx*2000));
      assert.equal(b.velocityZUnitsPerTick,Math.round(g.vz*2000));
      assert.equal(b.damageMilli,Math.round(g.atk*1000));
      assert.equal(Object.isFrozen(b),true);
    }
    assert.equal(result.run.state.safeForCloudBattle,false);
    assert.equal(Object.isFrozen(result.run.state),true);
  }
});

test('C6-A: 30Hz trajectory tracks 60Hz client ballistic helper for moving projectiles',()=>{
  for(const shape of shapes){
    const a=setup(shape.gear);
    const stats=clientStats.deriveCombatLoadout(a.profile.campaignData,catalog).stats;
    const gun=catalog.GEAR_CATALOG.mainGun.find(g=>g.id===shape.gear);
    const golden=clientWeapons.describeMainSalvo(gun,{x:0,z:12.5},stats.atk);
    const r=step(a.open(),4,200);
    assert.equal(r.run.state.projectiles.length,shape.count);
    for(let j=0;j<shape.count;j++){
      const b=r.run.state.projectiles[j],g=golden[j];
      assert.equal(b.xUnits,Math.round((g.x+g.vx*8)*1000));
      assert.equal(b.zUnits,Math.round((g.z+g.vz*8)*1000));
    }
  }
});

test('C6-A: side pellet applies client fractional hit damage without rounding away .88',()=>{
  const target=enemy('side',{xUnits:-790,zUnits:9810,hp:500,hitRadiusUnits:100});
  const a=setup('gun_spread',{waves:[{atTick:1,enemies:[target]}]});
  const goldenGun=catalog.GEAR_CATALOG.mainGun.find(g=>g.id==='gun_spread');
  const stats=clientStats.deriveCombatLoadout(a.profile.campaignData,catalog).stats;
  const shot=clientWeapons.describeMainSalvo(goldenGun,{x:0,z:12.5},stats.atk)[1];
  const r=step(a.open(),1,100);
  const hits=r.events.filter(e=>e.type==='hit');
  assert.equal(hits.length,1);
  assert.equal(hits[0].damage,Math.round(shot.atk*1000)/1000);
  assert.equal(r.run.state.enemies[0].hp,Math.round(500000-shot.atk*1000)/1000);
  assert.equal(r.run.state.kills,0);
  assert.equal(r.run.state.phase,'active');
});

test('C6-A: deterministic earliest-entry collision picks closer hitbox, not projection midpoint',()=>{
  const a=setup('gun_spread',{waves:[{atTick:1,enemies:[
    enemy('larger',{xUnits:0,zUnits:9700,hp:500,hitRadiusUnits:1500}),
    enemy('smaller',{xUnits:0,zUnits:10900,hp:500,hitRadiusUnits:100}),
  ]}]});
  const r=step(a.open(),1,100);
  const hits=r.events.filter(e=>e.type==='hit');
  assert.ok(hits.length>0);
  assert.ok(hits.every(e=>e.id==='larger'));
  assert.equal(r.run.state.enemies.find(e=>e.id==='smaller').hp,500);
});

test('C6-A: QA replay state/events invariant across chunk segmentation and retry',()=>{
  for(const shape of shapes){
    const a=setup(shape.gear);
    const full=step(a.open(),45,1600);
    const first=step(a.open(),15,600);
    const dupe=step(first.run,15,650,()=>({x:0,z:0}),0);
    assert.equal(dupe.duplicate,true);
    assert.equal(dupe.run,first.run);
    const split=step(first.run,30,1600);
    assert.deepEqual(split.run.state,full.run.state);
    assert.deepEqual(split.run.foundation.checkpoint.position,full.run.foundation.checkpoint.position);
    assert.deepEqual(split.run.foundation.checkpoint.fireClock,full.run.foundation.checkpoint.fireClock);
    assert.equal(split.run.foundation.checkpoint.eventDigest,full.run.foundation.checkpoint.eventDigest);
  }
});

test('C6-A: same 30Hz journal samples produce identical state at 30/60/120 presentation FPS',()=>{
  for(const shape of shapes){
    const input=Array.from({length:30},(_,i)=>i%3===0?{x:127,z:0}:i%3===1?{x:0,z:127}:{x:-90,z:-90});
    const states=[];
    for(const fps of [30,60,120]){
      const framesPerTick=fps/30;
      let run=setup(shape.gear).open(),tick=0;
      for(let displayFrame=0;displayFrame<input.length*framesPerTick;displayFrame++){
        if(displayFrame%framesPerTick!==0) continue;
        run=step(run,1,Math.ceil((tick+1)*1000/30)+100,()=>input[tick]).run;
        tick++;
      }
      assert.equal(tick,input.length);
      states.push(run.state);
    }
    assert.deepEqual(states[0],states[1]);
    assert.deepEqual(states[1],states[2]);
  }
});

test('C6-A: old foundation policy refuses advanced gun; C5 does not inherit C6-A capability',()=>{
  const a=setup('gun_spread',{policy:POLICY_VERSION});
  assert.throws(()=>a.open(),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'));
  const v3=setup('gun_spread',{version:'pve-server-encounter-qa-v3'});
  assert.throws(()=>v3.open(),isCode('SLICE_POLICY_VERSION_MISMATCH'));
  const legacy=setup('gun_laser');
  assert.throws(()=>legacy.open(),isCode('SLICE_LOADOUT_UNMODELED'));
});

test('C6-A: non-ballistic and unsupported main guns refuse to simulate as verified salvos',()=>{
  for(const gear of ['gun_rail','gun_pulse','gun_ion','gun_neutron',
    'gun_wave','gun_homing','gun_charge']) {
    assert.throws(()=>setup(gear).open(),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'),gear);
  }
});

test('C6-A: wingman, drone, armor and unmodelled pilot passives remain fail-closed',()=>{
  for(const aux of [{slot:'wingman',baseId:'wing_missile'},
    {slot:'drone',baseId:'drone_sniper'},
    {slot:'armor',baseId:'armor_light'}]) {
    assert.throws(()=>setup('gun_spread',{aux}).open(),isCode('SLICE_LOADOUT_UNMODELED'));
  }
  for(const pilot of ['pilot_ghost','pilot_nova','pilot_echo','pilot_fox']){
    assert.throws(()=>setup('gun_spread',{pilot}).open(),e=>
      ['SLICE_LOADOUT_UNMODELED','FOUNDATION_PASSIVE_INVALID'].includes(e?.code));
  }
});

test('C6-A: no client-result fields or user-supplied encounter policy are accepted',()=>{
  const a=setup('gun_spread'),root=a.open();
  for(const key of ['victory','stars','rewards','verifiedOutcome','coins','settlement']) {
    assert.equal(Object.hasOwn(root.state,key),false);
    const invalid={...a.encounter,[key]:true};
    assert.throws(()=>openCombatVerticalSlice({encounter:invalid,
      snapshot:a.snapshot,journal:a.journal,policy:a.policy}),isCode('SLICE_ENCOUNTER_INVALID'));
  }
  const bad={...chunk(0,1),victory:true};
  assert.throws(()=>replayCombatSliceChunk({run:root,chunk:bad,receivedAtMs:T0+100}),isCode('INPUT_CHUNK_INVALID'));
  assert.equal(root.state.safeForCloudBattle,false);
});

test('C6-A: v4 reuses C5 Titan damage reduction for side-by-side QA',()=>{
  const a=setup('gun_spread',{pilot:'pilot_titan',waves:[{atTick:1,enemies:[
    enemy('contact',{xUnits:0,zUnits:12500,contactDamage:100}),
  ]}]});
  const r=step(a.open(),1,100);
  assert.equal(r.run.state.damageReductionBps,2500);
  assert.equal(r.run.state.hp,1050-60);
  assert.equal(r.run.state.contacts,1);
  assert.equal(r.run.state.safeForCloudBattle,false);
});

test('C6-A: rejected close-to-50ms shotgun flood never exposes rewards',()=>{
  const guns=catalog.GEAR_CATALOG.mainGun.map(g=>g.id==='gun_shotgun'
    ? {...g,fireRate:.05}:g);
  const a=setup('gun_shotgun',{
    catalog:{...catalog,GEAR_CATALOG:{...catalog.GEAR_CATALOG,mainGun:guns}},
    arena:{halfWidthUnits:13200,halfHeightUnits:50000,spawnXUnits:0,spawnZUnits:49000},
  });
  assert.throws(()=>step(a.open(),60,2400),isCode('SLICE_PROJECTILE_CAP'));
});

test('C6-A: source isolation: no HTTP/economy, GameService P0 gate and legacy API untouched',()=>{
  const root=path.resolve(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'lib/combatVerticalSliceV8.cjs'),'utf8');
  const srv=fs.readFileSync(path.join(root,'lib/gameService.cjs'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:firebase-admin|express|\.\/gameService|\.\/economy)/);
  assert.match(srv,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.match(srv,/Cloud battles are temporarily unavailable pending server-side combat verification/);
});
