'use strict';
/** FASTLANE C5: v3 QA-only defensive/relative-sweep parity; v1/v2 unchanged. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {POLICY_VERSION}=require('../lib/combatMovementWeaponV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const {createHash}=require('node:crypto');
const UUID_SESSION='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const UUID_BATTLE='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const T0=1782000000000;
const C5='pve-server-encounter-qa-v3';
const C4='pve-server-encounter-qa-v2';
const POLICY=(radius=700)=>({version:POLICY_VERSION,keyboardUnitsPer60HzFrame:.3,
  pilotHitRadiusUnits:radius,projectileHitRadiusUnits:200});
const enemy=(id,extra={})=>({id,kind:'grunt',behavior:'static',xUnits:0,zUnits:9000,
  hp:10000,hitRadiusUnits:450,moveUnitsPerTick:0,contactDamage:0,
  shootEveryTicks:0,shotSpeedUnitsPerTick:0,shotDamage:0,shotPattern:'none',...extra});
const boss=(id,extra={})=>enemy(id,{kind:'boss',behavior:'patrol',xUnits:-500,zUnits:10150,
  hitRadiusUnits:100,moveUnitsPerTick:1000,shootEveryTicks:1800,shotSpeedUnitsPerTick:200,
  shotDamage:10,shotPattern:'fan5',...extra});
let catalog,clientMath;
test.before(async()=>{
  const url=p=>pathToFileURL(path.resolve(__dirname,'../../client/src',p)).href;
  [catalog,clientMath]=await Promise.all([import(url('constants.js')),import(url('utils/combatStats.js'))]);
});
function setup(opts={}) {
  const mode=opts.mode||'campaign';
  const pilot=opts.pilot||'pilot_alpha';
  const identity={uid:'qa_fast_c5',sessionId:UUID_SESSION,battleId:UUID_BATTLE,
    issuedAtMs:T0,expiresAtMs:T0+600000};
  const profile={campaignData:{loadout:{pilot,aircraft:'ship_xwing',mainGun:'c5_gun',
    wingman:'',armor:'',drone:''},ownedPilots:{[pilot]:{level:1,stars:1}},
    ownedAircrafts:{ship_xwing:{level:1,stars:1}},
    items:{c5_gun:{baseId:opts.gear||'gun_laser',level:1,rarity:1,type:'mainGun'}}}};
  const snapshot=createServerBattleSnapshot({identity,persistedProfile:profile,
    approvedCatalog:opts.catalog||catalog,
    rules:{mode,locationId:'qa_alpha',rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},
    arena:{halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500},
    seed:11335577});
  const journal=openInputJournal({uid:identity.uid,sessionId:identity.sessionId,
    battleId:identity.battleId,rulesVersion:snapshot.context.rulesVersion,
    loadoutHash:snapshot.loadoutHash,issuedAtMs:T0});
  const encounter={version:opts.version||C5,qaOnly:true,snapshotHash:snapshot.snapshotHash,
    mode,locationId:'qa_alpha',waves:opts.waves||[{atTick:1,enemies:[enemy('shield',{xUnits:-4000})]}],
    damageCooldownTicks:opts.cooldown||45,enemyProjectileRadiusUnits:200};
  const policy=POLICY(opts.radius||700);
  return {snapshot,encounter,journal,policy,
    open:()=>openCombatVerticalSlice({snapshot,encounter,journal,policy})};
}
const chunk=(start,n,frames=()=>({x:0,z:0}))=>({protocol:'pve-input-v1',
  battleId:UUID_BATTLE,startTick:start,frames:Array.from({length:n},(_,i)=>frames(i))});
const step=(run,n,ms,frames=()=>({x:0,z:0}),start=run.state.tick)=>
  replayCombatSliceChunk({run,chunk:chunk(start,n,frames),receivedAtMs:T0+ms});
const code=x=>e=>e?.code===x;

test('FAST-C5: v3 immutable QA state carries micro-HP and mitigation, remains Cloud-unsafe',()=>{
  const r=setup({pilot:'pilot_bear'}).open();
  assert.equal(r.state.version,'pve-lab-vertical-slice-v3');
  assert.equal(r.encounter.version,C5);
  assert.equal(r.state.maxHp,1050);
  assert.equal(r.state.regenPerTickMicro,350000);
  assert.equal(r.state.regenRemainderMicro,0);
  assert.equal(r.state.damageReductionBps,0);
  assert.equal(r.state.safeForCloudBattle,false);
  assert.equal(Object.isFrozen(r.state),true);
  for(const k of ['victory','reward','verifiedOutcome','settlement','coins'])
    assert.equal(Object.hasOwn(r.state,k),false);
});

test('FAST-C5: client-derived titan 25% reduction stacks after aircraft armor',()=>{
  const a=setup({pilot:'pilot_titan',waves:[{atTick:1,enemies:[enemy('sniper',{
    xUnits:1000,zUnits:9000,shootEveryTicks:1,shotSpeedUnitsPerTick:2000,
    shotDamage:100,shotPattern:'aimed'})]}]});
  const r=step(a.open(),4,200);
  assert.equal(r.run.state.damageReductionBps,2500);
  const expected=clientMath.calculateHitDamage(100,{armor:20,dmgReduce:.25},()=>1);
  assert.equal(expected.damage,60);
  assert.equal(r.run.state.hp,1050-expected.damage);
  assert.ok(r.events.some(e=>e.type==='enemy-hit' && e.damage===60));
});

test('FAST-C5: defense also applies to body contact without fake kill/clear',()=>{
  const a=setup({pilot:'pilot_titan',waves:[{atTick:1,enemies:[enemy('collide',{
    zUnits:12500,contactDamage:100})]}]});
  const r=step(a.open(),1,100);
  assert.equal(r.run.state.hp,990);
  assert.equal(r.run.state.kills,0);
  assert.equal(r.run.state.phase,'active');
  assert.equal(r.events.find(e=>e.type==='contact').damage,60);
});

test('FAST-C5: Bear regen accrues 30Hz fixed micro-HP only after taking damage',()=>{
  const a=setup({pilot:'pilot_bear',waves:[{atTick:1,enemies:[enemy('collide',{
    zUnits:12500,contactDamage:100})]}]});
  const hit=step(a.open(),1,100);
  assert.equal(hit.run.state.hp,970);
  const healed=step(hit.run,30,1400);
  assert.equal(healed.run.state.hp,980);
  assert.equal(healed.run.state.regenRemainderMicro,500000);
  assert.equal(healed.run.state.safeForCloudBattle,false);
});

test('FAST-C5: no regen-credit accumulation at full health',()=>{
  const a=setup({pilot:'pilot_bear',waves:[{atTick:30,enemies:[enemy('late',{
    zUnits:12500,contactDamage:100})]}]});
  const r=step(a.open(),31,1400);
  assert.equal(r.run.state.hp,970);
  assert.equal(r.run.state.regenRemainderMicro,350000);
});

test('FAST-C5: full vs split chunks produce same HP, shots and trace including regen remainder',()=>{
  const a=setup({pilot:'pilot_bear',waves:[{atTick:1,enemies:[enemy('collide',{
    zUnits:12500,contactDamage:100})]}]});
  const full=step(a.open(),31,1400).run;
  let partial=step(a.open(),10,500).run;
  partial=step(partial,21,1400).run;
  assert.deepEqual(partial.state,full.state);
  // Journal digests intentionally depend on chunk boundaries; world and
  // generated shot sequence must not.
  assert.equal(partial.foundation.checkpoint.eventDigest,full.foundation.checkpoint.eventDigest);
  assert.deepEqual(partial.foundation.checkpoint.position,full.foundation.checkpoint.position);
  assert.deepEqual(partial.foundation.checkpoint.fireClock,full.foundation.checkpoint.fireClock);
});

test('FAST-C5: duplicate chunk does not grant regeneration or hit damage twice',()=>{
  const a=setup({pilot:'pilot_bear',waves:[{atTick:1,enemies:[enemy('collide',{
    zUnits:12500,contactDamage:100})]}]});
  const first=step(a.open(),15,620);
  const dupe=step(first.run,15,660,()=>({x:0,z:0}),0);
  assert.equal(dupe.duplicate,true);
  assert.equal(dupe.run,first.run);
  assert.deepEqual(dupe.events,[]);
});

test('FAST-C5: moving boss hitbox swept past beam gets hit even when endpoint misses',()=>{
  const b=boss('swept',{hp:30000});
  const config={waves:[{atTick:1,enemies:[b]}]};
  const v2=step(setup({...config,version:C4}).open(),1,100);
  const v3=step(setup(config).open(),1,100);
  assert.equal(v2.run.state.enemies[0].hp,30000);
  assert.ok(v3.run.state.enemies[0].hp<30000);
  assert.ok(v3.events.some(e=>e.type==='hit'&&e.id==='swept'));
});

test('FAST-C5: moving boss body swept into pilot applies damage between two endpoints',()=>{
  const b=boss('body',{zUnits:12500,contactDamage:100,hp:30000});
  const config={waves:[{atTick:1,enemies:[b]}],radius:100};
  const before=step(setup({...config,version:C4}).open(),1,100);
  const after=step(setup(config).open(),1,100);
  assert.equal(before.run.state.hp,1050);
  assert.equal(after.run.state.hp,970);
  assert.equal(after.run.state.contacts,1);
  assert.equal(after.run.state.kills,0);
});

test('FAST-C5: same deterministic v3 results for Campaign and Dungeon given same QA rules',()=>{
  const out=['campaign','dungeon'].map(mode=>{
    const a=setup({mode,pilot:'pilot_titan',waves:[{atTick:1,enemies:[boss('chief',{
      hp:20000,shootEveryTicks:5,shotSpeedUnitsPerTick:300})]}]});
    return step(a.open(),30,1200).run.state;
  });
  assert.equal(out[0].hp,out[1].hp);
  assert.equal(out[0].enemyProjectileHits,out[1].enemyProjectileHits);
  assert.equal(out[0].kills,out[1].kills);
  // Different snapshot identity/mode intentionally produces different hashes.
  assert.notEqual(out[0].traceDigest,out[1].traceDigest);
});

test('FAST-C5: unsupported Ghost dodge/crit and wingman/drone still fail closed',()=>{
  const invalid=['pilot_ghost','pilot_nova','pilot_echo','pilot_fox'];
  for(const pilot of invalid) assert.throws(()=>setup({pilot}).open(),e=>
    ['SLICE_LOADOUT_UNMODELED','FOUNDATION_PASSIVE_INVALID'].includes(e?.code));
});

test('FAST-C5: v3 reject inflated passive values in approved QA catalog',()=>{
  const pilots=catalog.PILOTS.map(x=>x.id==='pilot_bear'?{...x,value:.99}:x);
  const modified={...catalog,PILOTS:pilots};
  assert.throws(()=>setup({pilot:'pilot_bear',catalog:modified}).open(),code('SLICE_PASSIVE_INVALID'));
});

test('FAST-C5: v3 strict encounter version/fields, no client-set results',()=>{
  const a=setup();
  for(const encounter of [{...a.encounter,victory:true},
    {...a.encounter,qaOnly:false},{...a.encounter,damageCooldownTicks:0},
    {...a.encounter,enemyProjectileRadiusUnits:9999}])
    assert.throws(()=>openCombatVerticalSlice({encounter,snapshot:a.snapshot,
      journal:a.journal,policy:a.policy}),code('SLICE_ENCOUNTER_INVALID'));
  const run=a.open();
  const bad=Object.freeze({...run,state:Object.freeze({...run.state,damageReductionBps:9000})});
  assert.throws(()=>step(bad,1,100),code('SLICE_STATE_INVALID'));
  assert.throws(()=>replayCombatSliceChunk({run,chunk:{...chunk(0,1),victory:true},
    receivedAtMs:T0+100}));
});

test('FAST-C5: v3 QA-only code does not reach GameService or economy, P0 stays locked',()=>{
  const source=fs.readFileSync(require.resolve('../lib/combatVerticalSliceV8.cjs'),'utf8');
  const service=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  assert.doesNotMatch(source,/require\([^\n]*(?:economy|gameService|firebase|server\.js)/);
  assert.doesNotMatch(service,/combatVerticalSliceV8/);
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
});

test('FAST-C5: deterministic 30/60/120 render FPS sampling produces identical QA v3 trace',()=>{
  const digests=[];
  for(const fps of [30,60,120]) {
    const qa=setup({pilot:'pilot_titan',waves:[{atTick:1,enemies:[boss('pin',{
      hp:50000,shootEveryTicks:5,shotSpeedUnitsPerTick:50})]}]});
    const samples=Array.from({length:30*(fps/30)},(_,i)=>i%(fps/30)===0
      ? (Math.floor(i/(fps/30))%2 ? {x:-127,z:0}:{x:127,z:0}):null).filter(Boolean);
    const r=replayCombatSliceChunk({run:qa.open(),chunk:{protocol:'pve-input-v1',
      battleId:UUID_BATTLE,startTick:0,frames:samples},receivedAtMs:T0+1300});
    digests.push(r.run.state.traceDigest);
  }
  assert.equal(new Set(digests).size,1);
});

test('FAST-C5: Titan mitigation and invulnerability block repeated hostile damage',()=>{
  const a=setup({pilot:'pilot_titan',waves:[{atTick:1,enemies:[enemy('rapid',{
    xUnits:1200,zUnits:12000,hp:10000,shootEveryTicks:1,
    shotSpeedUnitsPerTick:2000,shotDamage:100,shotPattern:'aimed'})]}]});
  const r=step(a.open(),14,600);
  assert.equal(r.run.state.hp,990);
  assert.ok(r.run.state.enemyProjectileHits>=2);
  assert.ok(r.events.some(x=>x.type==='enemy-hit'&&x.damage===0));
});

test('FAST-C5: one invalid progress field aborts v3 without changing server-owned run',()=>{
  const a=setup({pilot:'pilot_bear'}),start=a.open();
  for(const payload of [{...chunk(0,1),stars:3},
    {...chunk(0,1),result:{winner:true}},
    {...chunk(0,1),frames:[{x:0,z:0,hp:999999}]}]) {
    assert.throws(()=>replayCombatSliceChunk({run:start,chunk:payload,receivedAtMs:T0+100}));
  }
  assert.equal(start.state.tick,0);
  assert.equal(start.state.hp,start.state.maxHp);
});

test('FAST-C5: no client-controlled encounter HP or enemy status can bypass v3 schema',()=>{
  const a=setup({waves:[{atTick:1,enemies:[enemy('normal')]}]});
  for(const altered of [enemy('evil',{killed:true}),enemy('evil',{victory:true}),
    enemy('evil',{hp:0}),enemy('evil',{reflectDamage:999})]) {
    const encounter={...a.encounter,waves:[{atTick:1,enemies:[altered]}]};
    assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,
      encounter,policy:a.policy,journal:a.journal}),code('SLICE_ENEMY_INVALID'));
  }
});
