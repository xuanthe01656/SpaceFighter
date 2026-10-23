'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {POLICY_VERSION}=require('../lib/combatMovementWeaponV8.cjs');
const api=require('../lib/combatVerticalSliceV8.cjs');
const {ENCOUNTER_VERSION,SLICE_VERSION,openCombatVerticalSlice,replayCombatSliceChunk}=api;
let catalog;
test.before(async()=>{catalog=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);});
const sessionId='e46b066c-ccbf-42c0-bdc2-2f8ffb86c18b';
const battleId='7b78a47c-63a8-42c2-816b-28af81ed9737';
const issuedAtMs=1782000000000;
const basePolicy={version:POLICY_VERSION,keyboardUnitsPer60HzFrame:.30,pilotHitRadiusUnits:700,projectileHitRadiusUnits:200};
const unit=(id,z,hp=70,extra={})=>({id,kind:'grunt',behavior:'static',xUnits:0,zUnits:z,
  hp,hitRadiusUnits:450,moveUnitsPerTick:0,contactDamage:0,...extra});
const waves=()=>[
  {atTick:1,enemies:[unit('wave1',9000)]},
  {atTick:30,enemies:[unit('wave2',6000)]},
];
function setup(options={}) {
  const gear=options.gear||'gun_laser';
  const ship=options.ship||'ship_xwing';
  const pilot=options.pilot||'pilot_alpha';
  const ident={uid:options.uid||'qa_v8b_fastlane',sessionId,battleId,issuedAtMs,expiresAtMs:issuedAtMs+600000};
  const profile={campaignData:{
    loadout:{pilot,aircraft:ship,mainGun:'qa_gun',wingman:options.wingman||'',armor:'',drone:''},
    ownedPilots:{[pilot]:{level:1,stars:1}},ownedAircrafts:{[ship]:{level:1,stars:1}},
    items:{qa_gun:{baseId:gear,level:1,rarity:1,type:'mainGun'}},
  }};
  const mode=options.mode||'campaign';
  const snapshot=createServerBattleSnapshot({identity:ident,persistedProfile:profile,approvedCatalog:catalog,
    rules:{mode,locationId:'qa_alpha',rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},
    arena:{halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500},seed:123456789});
  const journal=openInputJournal({uid:ident.uid,sessionId,battleId,rulesVersion:snapshot.context.rulesVersion,
    loadoutHash:snapshot.loadoutHash,issuedAtMs});
  const encounter={version:ENCOUNTER_VERSION,qaOnly:true,snapshotHash:snapshot.snapshotHash,
    mode,locationId:'qa_alpha',waves:options.waves||waves()};
  return {snapshot,journal,encounter,policy:basePolicy,
    open:()=>openCombatVerticalSlice({snapshot,policy:basePolicy,journal,encounter})};
}
const frames=(n,fn=()=>({x:0,z:0}))=>Array.from({length:n},(_,i)=>fn(i));
const input=(start,frames)=>({protocol:'pve-input-v1',battleId,startTick:start,frames});
const step=(run,n,ms,fn,start=run.state.tick)=>replayCombatSliceChunk({run,
  chunk:input(start,frames(n,fn)),receivedAtMs:issuedAtMs+ms});
const isCode=code=>err=>err?.code===code;

test('FAST-C3: open binds immutable snapshot + journal and is explicitly not Cloud-safe',()=>{
  const a=setup(),run=a.open();
  assert.equal(run.state.version,SLICE_VERSION);
  assert.equal(run.state.safeForCloudBattle,false);
  assert.equal(run.state.qaOnly,true);
  assert.equal(run.state.phase,'active');
  assert.equal(run.state.maxHp,1050);
  assert.equal(run.foundation.checkpoint.tick,0);
  assert.equal(run.encounter.snapshotHash,a.snapshot.snapshotHash);
  assert.equal(Object.isFrozen(run),true);
  assert.equal(Object.isFrozen(run.encounter.waves[0].enemies[0]),true);
  for(const key of ['victory','stars','rewards','coins','settlement','verifiedOutcome']) {
    assert.equal(Object.hasOwn(run.state,key),false);
  }
});

test('FAST-C3: beam shot sweeps across static enemy and changes HP without rewards',()=>{
  const run=setup({waves:[{atTick:1,enemies:[unit('shielded',9000,150)]}]}).open();
  const r=step(run,1,100);
  assert.equal(r.run.state.tick,1);
  assert.equal(r.run.state.kills,0);
  assert.equal(r.run.state.enemies[0].hp,70); // starter 80 damage
  assert.equal(r.run.state.projectiles.length,0);
  assert.equal(r.events.some(e=>e.type==='hit'&&e.damage===80),true);
  assert.equal(r.run.state.phase,'active');
});

test('FAST-C3: two server-authored waves simulate kills, with no premature clear',()=>{
  const first=step(setup().open(),20,700);
  assert.equal(first.run.state.kills,1);
  assert.equal(first.run.state.spawnedWaves,1);
  assert.equal(first.run.state.phase,'active');
  const second=step(first.run,20,1400);
  assert.equal(second.run.state.spawnedWaves,2);
  assert.equal(second.run.state.kills,2);
  assert.equal(second.run.state.phase,'lab-clear');
  assert.equal(second.run.state.safeForCloudBattle,false);
});

test('FAST-C3: full chunk versus split chunks has exactly the same world trace',()=>{
  const full=step(setup().open(),40,1400);
  let run=setup().open();
  run=step(run,20,700).run;
  run=step(run,20,1400).run;
  assert.deepEqual(full.run.state,run.state);
  assert.equal(full.run.state.traceDigest,run.state.traceDigest);
  assert.notEqual(full.run.foundation.journal.digest,run.foundation.journal.digest);
});

test('FAST-C3: previous identical network retry does not fire, kill or settle twice',()=>{
  const original=setup().open(), first=step(original,20,700);
  const duplicate=step(first.run,20,710,undefined,0);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.run,first.run);
  assert.deepEqual(duplicate.events,[]);
  assert.equal(duplicate.run.state.kills,1);
  assert.throws(()=>step(first.run,20,720,i=>i?{x:0,z:0}:{x:1,z:0},0),isCode('INPUT_SEQUENCE_INVALID'));
});

test('FAST-C3: a contacted enemy deals mitigated player HP loss; contact is not kill',()=>{
  const contact={atTick:1,enemies:[unit('touch',12500,150,{contactDamage:100,hitRadiusUnits:450})]};
  const r=step(setup({waves:[contact,{atTick:40,enemies:[unit('later',8000)]}]}).open(),1,100);
  assert.equal(r.run.state.hp,970); // 100 damage reduced by 20 armor
  assert.equal(r.run.state.contacts,1);
  assert.equal(r.run.state.kills,0);
  assert.equal(r.run.state.phase,'active');
});

test('FAST-C3: lethal contact records a lab defeat without player-supplied game result',()=>{
  const danger={atTick:1,enemies:[unit('lethal',12500,150,{contactDamage:2000})]};
  const r=step(setup({waves:[danger]}).open(),1,100);
  assert.equal(r.run.state.hp,0);
  assert.equal(r.run.state.phase,'lab-defeat');
  assert.equal(r.run.state.kills,0);
  assert.throws(()=>step(r.run,1,200),isCode('SLICE_TERMINAL'));
});

test('FAST-C3: dungeon manifests are mode-bound and cannot be replayed as campaign',()=>{
  const dungeon=setup({mode:'dungeon'});
  const r=step(dungeon.open(),1,100);
  assert.equal(r.run.encounter.mode,'dungeon');
  const forged=setup();
  assert.throws(()=>openCombatVerticalSlice({snapshot:forged.snapshot,policy:forged.policy,
    journal:forged.journal,encounter:{...forged.encounter,mode:'dungeon'}}),isCode('SLICE_ENCOUNTER_INVALID'));
});

test('FAST-C3: encounter fails closed on unsupported bosses, invalid schedule and duplicate enemy IDs',()=>{
  for(const malformed of [
    [{atTick:1,enemies:[unit('boss',9000,1000,{kind:'boss'})]}],
    [{atTick:0,enemies:[unit('early',8000)]}],
    [{atTick:1,enemies:[unit('dup',8000),unit('dup',8500)]}],
    [{atTick:1,enemies:[unit('wide',99999)]}],
    [{atTick:1,enemies:[unit('bad',9000,100,{contactDamage:-1})]}],
  ]) {
    const a=setup({waves:malformed});
    assert.throws(()=>a.open(),err=>/^SLICE_/.test(err?.code||''));
  }
});

test('FAST-C3: unapproved user mode, injected entitlement and unsupported equipment fail closed',()=>{
  const a=setup();
  assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,policy:a.policy,journal:a.journal,
    encounter:{...a.encounter,qaOnly:false}}),isCode('SLICE_ENCOUNTER_INVALID'));
  assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,policy:a.policy,journal:a.journal,
    encounter:{...a.encounter,rewards:{coins:9999}}}),isCode('SLICE_ENCOUNTER_INVALID'));
  assert.throws(()=>setup({ship:'ship_scout'}).open(),isCode('SLICE_LOADOUT_UNMODELED'));
  assert.throws(()=>setup({pilot:'pilot_ghost'}).open(),isCode('SLICE_LOADOUT_UNMODELED'));
  assert.throws(()=>setup({gear:'gun_spread'}).open(),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'));
});

test('FAST-C3: input cannot submit victory, damage, HP, rewards or reordered frame',()=>{
  const run=setup().open();
  const base=input(0,frames(1));
  for(const bad of [
    {...base,victory:true},
    {...base,rewards:{coins:100000}},
    {...base,frames:[{x:0,z:0,hp:99999}]},
    {...base,startTick:99},
  ]) assert.throws(()=>replayCombatSliceChunk({run,chunk:bad,receivedAtMs:issuedAtMs+100}));
});

test('FAST-C3: run checkpoint tamper is detected before any further replay',()=>{
  const a=setup().open();
  const forged=Object.freeze({...a,state:Object.freeze({...a.state,hp:9999})});
  assert.throws(()=>step(forged,1,100),isCode('SLICE_STATE_INVALID'));
  const injected=Object.freeze({...a,state:Object.freeze({...a.state,coins:999999})});
  assert.throws(()=>step(injected,1,100),isCode('SLICE_STATE_INVALID'));
});

test('FAST-C3: network fast-forward and expired battle are still blocked by V8B1',()=>{
  const run=setup().open();
  assert.throws(()=>step(run,60,100),isCode('INPUT_FAST_FORWARD'));
  assert.throws(()=>step(run,1,1800001),isCode('INPUT_BATTLE_EXPIRED'));
});

test('FAST-C3: active-enemy budget enforced before any partial encounter state returns',()=>{
  const dense={atTick:1,enemies:Array.from({length:32},(_,i)=>unit(`g${i}`,9000,999999))};
  const extra={atTick:2,enemies:[unit('over',9000,99999)]};
  const run=setup({waves:[dense,extra]}).open();
  assert.throws(()=>step(run,2,100),isCode('SLICE_ACTIVE_CAP'));
  assert.equal(run.state.spawnedWaves,0);
});

test('FAST-C3: one close swept shot hits closest enemy and does not pass through it',()=>{
  const one={atTick:1,enemies:[unit('near',10100,80),unit('far',8600,80)]};
  const r=step(setup({waves:[one]}).open(),1,100);
  assert.equal(r.run.state.kills,1);
  assert.equal(r.run.state.enemies.length,1);
  assert.equal(r.run.state.enemies[0].id,'far');
});

test('FAST-C3: does not depend on renderer frames for identical 30Hz quantized input',()=>{
  const seq=frames(20,i=>i%2===0?{x:127,z:0}:{x:-127,z:0});
  const digests=[];
  for(const fps of [30,60,120]) {
    const sampled=[];
    const ratio=fps/30;
    for(let frame=0;frame<seq.length*ratio;frame++) if(frame%ratio===0) sampled.push(seq[frame/ratio]);
    const run=setup({waves:[{atTick:1,enemies:[unit('idle',-14000,999999)]}]}).open();
    const r=replayCombatSliceChunk({run,chunk:input(0,sampled),receivedAtMs:issuedAtMs+700});
    digests.push(r.run.state.traceDigest);
  }
  assert.equal(new Set(digests).size,1);
});


test('FAST-C3: plasma single shot follows its own slower ballistic rule',()=>{
  const group={atTick:1,enemies:[unit('plasma_target',9200,90)]};
  const r=step(setup({gear:'gun_plasma',waves:[group]}).open(),3,150);
  assert.equal(r.run.state.kills,1);
  assert.equal(r.run.state.phase,'lab-clear');
  assert.equal(r.events.some(e=>e.type==='hit' && e.damage===99),true);
});

test('FAST-C3: enemy contact cannot be misreported as a simulated clear',()=>{
  const group={atTick:1,enemies:[unit('contact_only',12500,100,{contactDamage:10})]};
  const r=step(setup({waves:[group]}).open(),1,100);
  assert.equal(r.run.state.contacts,1);
  assert.equal(r.run.state.kills,0);
  assert.equal(r.run.state.phase,'active');
});

test('FAST-C3: rejects manifest accessors, inherited fields and excessive populations',()=>{
  const a=setup();
  const invalid={...a.encounter,waves:[...a.encounter.waves]};
  Object.defineProperty(invalid,'qaOnly',{enumerable:true,get(){throw Error('getter executed');}});
  assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,policy:a.policy,journal:a.journal,
    encounter:invalid}),isCode('SLICE_ENCOUNTER_INVALID'));
  const excessive=Array.from({length:5},(_,i)=>({atTick:i+1,enemies:Array.from({length:30},(_,j)=>unit(`g${i}_${j}`,9000,999999))}));
  assert.throws(()=>setup({waves:excessive}).open(),isCode('SLICE_ENCOUNTER_CAP'));
});
test('FAST-C3: no API/reward integration, GameService P0 marker unchanged in baseline source',()=>{
  const source=fs.readFileSync(require.resolve('../lib/combatVerticalSliceV8.cjs'),'utf8');
  const service=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(source,/require\([^\n]*(?:economy|gameService|firebase|server\.js)/);
  assert.doesNotMatch(service,/combatVerticalSliceV8/);
  assert.deepEqual(Object.keys(api).sort(),['SLICE_VERSION','ENCOUNTER_VERSION',
    'CombatVerticalSliceError','openCombatVerticalSlice','replayCombatSliceChunk'].sort());
});
