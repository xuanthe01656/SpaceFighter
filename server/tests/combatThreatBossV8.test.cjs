'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {POLICY_VERSION}=require('../lib/combatMovementWeaponV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const VE='pve-server-encounter-qa-v2';
const VS='pve-lab-vertical-slice-v2';
const SESSION='f9a30fd5-4a76-4d86-b7fe-6be57b50a9e4';
const BATTLE='a9194b4e-4640-4525-bc7f-eb879b003df2';
const T0=1782000000000;
const policy={version:POLICY_VERSION,keyboardUnitsPer60HzFrame:0.3,
  pilotHitRadiusUnits:700,projectileHitRadiusUnits:200};
let catalog;
test.before(async()=>{catalog=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);});
function enemy(id,options={}) {
  return {id,kind:'grunt',behavior:'static',xUnits:0,zUnits:9000,
    hp:80,hitRadiusUnits:450,moveUnitsPerTick:0,contactDamage:0,
    shootEveryTicks:0,shotSpeedUnitsPerTick:0,shotDamage:0,shotPattern:'none',...options};
}
function boss(id='boss_1',options={}) {
  return enemy(id,{kind:'boss',behavior:'patrol',moveUnitsPerTick:1,
    hp:200,hitRadiusUnits:1500,shootEveryTicks:1800,
    shotSpeedUnitsPerTick:200,shotDamage:100,shotPattern:'fan5',...options});
}
function setup(options={}) {
  const mode=options.mode||'campaign';
  const identity={uid:'qa_c4',sessionId:SESSION,battleId:BATTLE,
    issuedAtMs:T0,expiresAtMs:T0+600000};
  const profile={campaignData:{loadout:{pilot:'pilot_alpha',aircraft:'ship_xwing',
    mainGun:'c4_gun',wingman:'',armor:'',drone:''},
    ownedPilots:{pilot_alpha:{level:1,stars:1}},
    ownedAircrafts:{ship_xwing:{level:1,stars:1}},
    items:{c4_gun:{baseId:options.gear||'gun_laser',level:1,rarity:1,type:'mainGun'}}}};
  const snapshot=createServerBattleSnapshot({identity,persistedProfile:profile,
    approvedCatalog:catalog,rules:{mode,locationId:'qa_alpha',rulesVersion:'combat-v1.0.0',
      catalogVersion:'product-v1.0.0'},
    arena:{halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500},
    seed:1987654321});
  const journal=openInputJournal({uid:identity.uid,sessionId:identity.sessionId,
    battleId:identity.battleId,rulesVersion:snapshot.context.rulesVersion,
    loadoutHash:snapshot.loadoutHash,issuedAtMs:T0});
  const encounter={version:VE,qaOnly:true,snapshotHash:snapshot.snapshotHash,
    mode,locationId:'qa_alpha',waves:options.waves||[{atTick:1,enemies:[enemy('shield', {xUnits:-4000,hp:300})]}],
    damageCooldownTicks:options.cooldown??45,enemyProjectileRadiusUnits:options.radius??200};
  return {snapshot,journal,encounter,
    open:()=>openCombatVerticalSlice({snapshot,policy,journal,encounter})};
}
const input=(start,n,fn=()=>({x:0,z:0}))=>({protocol:'pve-input-v1',battleId:BATTLE,
  startTick:start,frames:Array.from({length:n},(_,i)=>fn(i))});
function step(run,n,offsetMs,start=run.state.tick,fn) {
  return replayCombatSliceChunk({run,chunk:input(start,n,fn),receivedAtMs:T0+offsetMs});
}
const blocked=code=>e=>e?.code===code;

test('FAST-C4: v2 binds trusted encounter and returns frozen non-cloud checkpoint',()=>{
  const run=setup().open();
  assert.equal(run.state.version,VS);
  assert.equal(run.encounter.version,VE);
  assert.equal(run.state.safeForCloudBattle,false);
  assert.equal(run.state.qaOnly,true);
  assert.equal(run.state.enemyProjectiles.length,0);
  assert.equal(run.state.bossKills,0);
  assert.equal(run.encounter.damageCooldownTicks,45);
  assert.equal(Object.isFrozen(run.encounter.waves[0].enemies[0]),true);
  for(const key of ['victory','stars','rewards','coins','settlement','verifiedOutcome'])
    assert.equal(Object.hasOwn(run.state,key),false);
});

test('FAST-C4: aimed hostile projectile sweeps into player and reduces mitigated HP',()=>{
  const a=setup({waves:[{atTick:1,enemies:[enemy('sniper',{xUnits:1000,zUnits:9000,
    hp:10000,shootEveryTicks:1,shotSpeedUnitsPerTick:2000,shotDamage:100,shotPattern:'aimed'})]}]});
  const r=step(a.open(),4,200);
  assert.equal(r.run.state.maxHp,1050);
  assert.equal(r.run.state.hp,970);
  assert.equal(r.run.state.enemyProjectileHits>=1,true);
  assert.equal(r.events.some(e=>e.type==='enemy-fire'),true);
  assert.equal(r.events.some(e=>e.type==='enemy-hit'&&e.damage===80),true);
});

test('FAST-C4: invulnerability keeps repeated hostile hits from stacking HP damage',()=>{
  const a=setup({waves:[{atTick:1,enemies:[enemy('rapid',{xUnits:1200,zUnits:12000,
    hp:10000,shootEveryTicks:1,shotSpeedUnitsPerTick:2000,shotDamage:100,shotPattern:'aimed'})]}]});
  const r=step(a.open(),14,500);
  assert.equal(r.run.state.hp,970);
  assert.ok(r.run.state.enemyProjectileHits>=2);
  assert.ok(r.events.some(e=>e.type==='enemy-hit'&&e.damage===0));
  assert.ok(r.run.state.invulnerableUntilTick>r.run.state.tick);
});

test('FAST-C4: boss is restricted to solitary final wave and never appears in earlier wave',()=>{
  const invalid=[
    [{atTick:1,enemies:[boss()]},{atTick:8,enemies:[enemy('next')]}],
    [{atTick:1,enemies:[boss(),enemy('sidekick')]}],
    [{atTick:1,enemies:[boss(),boss('boss_2')]}],
  ];
  for(const waves of invalid) assert.throws(()=>setup({waves}).open(),blocked('SLICE_BOSS_SCHEDULE_INVALID'));
});

test('FAST-C4: boss takes main-gun damage, enrages at 30%, then dies without client victory',()=>{
  const r=step(setup({waves:[{atTick:1,enemies:[boss('chief')]}]}).open(),28,1000);
  assert.equal(r.run.state.bossKills,1);
  assert.equal(r.run.state.kills,1);
  assert.equal(r.run.state.phase,'lab-clear');
  assert.equal(r.run.state.safeForCloudBattle,false);
  assert.equal(r.events.filter(e=>e.type==='boss-enrage').length,1);
  assert.equal(r.events.filter(e=>e.type==='boss-kill').length,1);
});

test('FAST-C4: fan5 boss emits 5 deterministic hostile projectiles per volley',()=>{
  const b=boss('sentinel',{hp:100000,shootEveryTicks:1,shotSpeedUnitsPerTick:10});
  const r=step(setup({waves:[{atTick:1,enemies:[b]}]}).open(),2,100);
  assert.equal(r.run.state.nextEnemyProjectileId,5);
  assert.equal(r.run.state.enemyProjectiles.length,5);
  assert.deepEqual(r.events.filter(e=>e.type==='enemy-fire').map(e=>e.bullets),[5]);
});

test('FAST-C4: persistent boss contact obeys invulnerability; does not flood contacts',()=>{
  const b=boss('overlap',{hp:1000000,zUnits:12500,contactDamage:100,
    shootEveryTicks:1800,moveUnitsPerTick:1});
  const r=step(setup({waves:[{atTick:1,enemies:[b]}]}).open(),50,1800);
  assert.equal(r.run.state.phase,'active');
  assert.equal(r.run.state.contacts,2);
  assert.equal(r.events.filter(e=>e.type==='contact').length,2);
  assert.equal(r.run.state.hp,890); // 2 accepted hits of 80 damage
  assert.equal(r.run.state.kills,0);
});

test('FAST-C4: boss patrol stays inside server arena and deterministic direction flips at edge',()=>{
  const b=boss('patrol',{hp:100000,xUnits:11800,moveUnitsPerTick:1000,shootEveryTicks:1800});
  const r=step(setup({waves:[{atTick:1,enemies:[b]}]}).open(),3,140);
  const e=r.run.state.enemies[0];
  assert.ok(e.xUnits<=13200-e.hitRadiusUnits);
  assert.ok(e.xUnits>=-(13200-e.hitRadiusUnits));
  assert.equal(e.direction,-1);
});

test('FAST-C4: one full replay and split chunks yield identical v2 world and threat trace',()=>{
  const b=boss('tank',{hp:100000,shootEveryTicks:3,shotSpeedUnitsPerTick:50});
  const a=setup({waves:[{atTick:1,enemies:[b]}]});
  const full=step(a.open(),18,650);
  let partial=step(a.open(),9,320).run;
  partial=step(partial,9,650).run;
  assert.deepEqual(partial.state,full.run.state);
  assert.equal(partial.state.traceDigest,full.run.state.traceDigest);
});

test('FAST-C4: duplicate network chunk causes no extra hostiles, kills, HP damage or events',()=>{
  const a=setup({waves:[{atTick:1,enemies:[enemy('rapid',{xUnits:1000,
    shootEveryTicks:1,shotSpeedUnitsPerTick:500,shotDamage:70,shotPattern:'aimed'})]}]});
  const first=step(a.open(),10,400);
  const again=step(first.run,10,450,0);
  assert.equal(again.duplicate,true);
  assert.equal(again.run,first.run);
  assert.deepEqual(again.events,[]);
});

test('FAST-C4: enemy projectile cap rejects overloaded volley before publishing any world state',()=>{
  const b=boss('flood',{hp:100000,shootEveryTicks:1,shotSpeedUnitsPerTick:1});
  const a=setup({waves:[{atTick:1,enemies:[b]}]});
  const original=a.open();
  assert.throws(()=>step(original,30,1200),blocked('SLICE_ENEMY_PROJECTILE_CAP'));
  assert.equal(original.state.tick,0);
  assert.equal(original.state.enemyProjectiles.length,0);
});

test('FAST-C4: v2 manifests reject untrusted AI patterns and unsupported status/fake rewards',()=>{
  const invalid=[
    enemy('x',{shotPattern:'homing',shootEveryTicks:3,shotSpeedUnitsPerTick:10,shotDamage:1}),
    enemy('x',{shotPattern:'none',shootEveryTicks:3}),
    enemy('x',{shotPattern:'fan5',shootEveryTicks:3,shotSpeedUnitsPerTick:10,shotDamage:5}),
    enemy('x',{hp:-1}),
    enemy('x',{rewards:100}),
    boss('x',{behavior:'chase'}),
  ];
  for(const e of invalid) assert.throws(()=>setup({waves:[{atTick:1,enemies:[e]}]}).open(),
    err=>String(err?.code||'').startsWith('SLICE_'));
});

test('FAST-C4: v2 strict shape rejects invalid cooldown, injected fields and fake boss kills',()=>{
  const a=setup();
  for(const x of [{...a.encounter,damageCooldownTicks:0},
    {...a.encounter,enemyProjectileRadiusUnits:5000},
    {...a.encounter,victory:true},
    {...a.encounter,qaOnly:false}]) {
    assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,policy,journal:a.journal,encounter:x}),
      blocked('SLICE_ENCOUNTER_INVALID'));
  }
  const run=a.open();
  const forged=Object.freeze({...run,state:Object.freeze({...run.state,bossKills:1})});
  assert.throws(()=>step(forged,1,100),blocked('SLICE_STATE_INVALID'));
});

test('FAST-C4: no player victory, HP, damage or economy fields accepted in input chunks',()=>{
  const run=setup().open(),good=input(0,1);
  for(const chunk of [{...good,victory:true},
    {...good,rewards:{coins:999}},
    {...good,frames:[{x:0,z:0,damage:999999}]},
    {...good,frames:[{x:0,z:0,hp:999999}]},
    {...good,startTick:12}])
    assert.throws(()=>replayCombatSliceChunk({run,chunk,receivedAtMs:T0+100}));
});

test('FAST-C4: hostile defeat sets lab-defeat, not a server settlement receipt',()=>{
  const a=setup({waves:[{atTick:1,enemies:[enemy('lethal',{xUnits:1200,zUnits:12000,
    hp:5000,shootEveryTicks:1,shotSpeedUnitsPerTick:2000,shotDamage:9000,shotPattern:'aimed'})]}]});
  const r=step(a.open(),10,400);
  assert.equal(r.run.state.hp,0);
  assert.equal(r.run.state.phase,'lab-defeat');
  assert.equal(r.run.state.safeForCloudBattle,false);
  assert.throws(()=>step(r.run,1,500),blocked('SLICE_TERMINAL'));
});

test('FAST-C4: mode binding refuses cross-mode replay and malicious wave population',()=>{
  const a=setup({mode:'dungeon'});
  const r=step(a.open(),1,100);
  assert.equal(r.run.encounter.mode,'dungeon');
  assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,policy,journal:a.journal,
    encounter:{...a.encounter,mode:'campaign'}}),blocked('SLICE_ENCOUNTER_INVALID'));
  const many=Array.from({length:5},(_,i)=>({atTick:1+i,enemies:
    Array.from({length:30},(_,j)=>enemy('x'+i+'_'+j))}));
  assert.throws(()=>setup({waves:many}).open(),blocked('SLICE_ENCOUNTER_CAP'));
});

test('FAST-C4: identical quantized inputs at 30, 60, 120 render fps produce same digest',()=>{
  const wave=[{atTick:1,enemies:[boss('pin',{hp:100000,shootEveryTicks:5,shotSpeedUnitsPerTick:50})]}];
  const seq=Array.from({length:20},(_,i)=>i%2?{x:127,z:0}:{x:-127,z:0});
  const digests=[];
  for(const fps of [30,60,120]) {
    const frames=[]; for(let i=0;i<seq.length*(fps/30);i++) if(i%(fps/30)===0) frames.push(seq[i/(fps/30)]);
    const r=replayCombatSliceChunk({run:setup({waves:wave}).open(),
      chunk:{protocol:'pve-input-v1',battleId:BATTLE,startTick:0,frames},receivedAtMs:T0+800});
    digests.push(r.run.state.traceDigest);
  }
  assert.equal(new Set(digests).size,1);
});

test('FAST-C4: no integration with economy/API/Cloud; existing P0 service gate remains',()=>{
  const source=fs.readFileSync(require.resolve('../lib/combatVerticalSliceV8.cjs'),'utf8');
  const service=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  assert.doesNotMatch(source,/require\([^\n]*(?:economy|gameService|firebase|server\.js)/);
  assert.doesNotMatch(service,/combatVerticalSliceV8/);
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
});
