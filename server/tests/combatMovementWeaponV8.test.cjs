'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServerBattleSnapshot } = require('../lib/battleSnapshotV8.cjs');
const { openInputJournal } = require('../lib/combatInputJournalV8.cjs');
const { openCombatCore, replayAcceptedChunk } = require('../lib/combatCoreV8.cjs');
const api = require('../lib/combatMovementWeaponV8.cjs');
const {
  POLICY_VERSION, previewFromTrustedSnapshot, advancePreviewMovement,
  previewMainProjectile, openFireClock, advanceFireClock,
} = api;

let catalog, clientStats, clientRules, clientWeapons;
test.before(async () => {
  const pathTo = rel => pathToFileURL(path.resolve(__dirname, '../../client/src', rel)).href;
  catalog = await import(pathTo('constants.js'));
  clientStats = await import(pathTo('utils/combatStats.js'));
  clientRules = await import(pathTo('game/config/BattleRules.js'));
  clientWeapons = await import(pathTo('game/combat/PlayerWeapons.js'));
});
const policy = Object.freeze({version:POLICY_VERSION, keyboardUnitsPer60HzFrame:.30,
  pilotHitRadiusUnits:700, projectileHitRadiusUnits:200});
const identity = Object.freeze({uid:'preview_qa',sessionId:'e46b066c-ccbf-42c0-bdc2-2f8ffb86c18b',
  battleId:'7b78a47c-63a8-42c2-816b-28af81ed9737',issuedAtMs:1782000000000,
  expiresAtMs:1782000600000});
const makeArena = mode => mode === 'portrait'
  ? {halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500}
  : {halfWidthUnits:18000,halfHeightUnits:12000,spawnXUnits:0,spawnZUnits:10000};
const loadouts = Object.freeze([
  {aircraft:'ship_xwing',pilot:'pilot_alpha',gun:'gun_laser',shipLevel:1,gunLevel:1},
  {aircraft:'ship_scout',pilot:'pilot_viper',gun:'gun_plasma',shipLevel:2,gunLevel:2},
  {aircraft:'ship_tank',pilot:'pilot_titan',gun:'gun_laser',shipLevel:3,gunLevel:3},
]);
function profile(gear) {
  return {campaignData:{
    loadout:{pilot:gear.pilot,aircraft:gear.aircraft,mainGun:'qa_gun',wingman:'',armor:'',drone:''},
    ownedPilots:{[gear.pilot]:{level:1,stars:1}},
    ownedAircrafts:{[gear.aircraft]:{level:gear.shipLevel,stars:1}},
    items:{qa_gun:{baseId:gear.gun,level:gear.gunLevel,rarity:1,type:'mainGun'}},
  }};
}
function makeCase(gear=loadouts[0],shape='portrait') {
  const p = profile(gear), area = makeArena(shape);
  const snapshot = createServerBattleSnapshot({identity,persistedProfile:p,approvedCatalog:catalog,
    rules:{mode:shape==='portrait'?'campaign':'dungeon',locationId:'qa_arena',
      rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},arena:area,seed:123456789});
  return {p,gear,snapshot,preview:previewFromTrustedSnapshot(snapshot,policy)};
}
const isCode = code => e => e && e.code === code;

// Cross-check values against actual ESM game calculation rather than copied fixtures.
test('V8B-2C2A: 3 approved loadouts x 2 arenas preserve client baseline fire/attack/speed/armor', () => {
  for (const loadout of loadouts) for (const arena of ['portrait','landscape']) {
    const {p,preview,snapshot} = makeCase(loadout,arena);
    const {stats} = clientStats.deriveCombatLoadout(p.campaignData,catalog);
    assert.equal(preview.armor,stats.armor);
    assert.equal(preview.mainGun.projectileAtk,stats.atk);
    assert.equal(preview.mainGun.periodUs,Math.round(stats.fireRate*1000));
    assert.equal(preview.speedMultiplier,clientRules.battleSpeedMultiplier(stats));
    assert.equal(preview.movePerTickUnits,Math.round(600*clientRules.battleSpeedMultiplier(stats)));
    assert.deepEqual(preview.startPosition,{xUnits:snapshot.arena.spawnXUnits,zUnits:snapshot.arena.spawnZUnits});
    assert.equal(preview.previewOnly,true);
    assert.equal(preview.safeForCloudBattle,false);
    assert.equal(Object.isFrozen(preview.mainGun),true);
  }
});

test('V8B-2C2A: starter beam fires 350 ms, 10.5 ticks on average, without fixed-tick drift', () => {
  const {preview}=makeCase();
  assert.equal(preview.mainGun.pattern,'beam');
  assert.equal(preview.mainGun.periodUs,350000);
  const output=advanceFireClock(openFireClock(preview.mainGun.periodUs),50);
  assert.deepEqual(output.shotTicks.slice(0,5),[1,12,22,33,43]);
  assert.equal(output.clock.processedThroughTick,50);
  assert.equal(Object.isFrozen(output.shotTicks),true);
});

test('V8B-2C2A: serialised fire clock replay independent of validated chunk splitting', () => {
  const {preview}=makeCase();
  const all=advanceFireClock(advanceFireClock(openFireClock(preview.mainGun.periodUs),60).clock,120);
  const first=advanceFireClock(openFireClock(preview.mainGun.periodUs),60);
  const grouped=[...first.shotTicks,...all.shotTicks];
  let clock=openFireClock(preview.mainGun.periodUs), singles=[];
  for(let at=1;at<=120;at++) { const r=advanceFireClock(clock,at); clock=r.clock; singles.push(...r.shotTicks); }
  assert.deepEqual(singles,grouped);
  assert.equal(clock.nextShotIndex,all.clock.nextShotIndex);
  assert.deepEqual(advanceFireClock(clock,120).shotTicks,[]);
});

test('V8B-2C2A: schedule handles 50ms min and upgraded floating-point intervals', () => {
  const fast=advanceFireClock(openFireClock(50000),60);
  assert.equal(fast.shotTicks.length,40);
  const {preview}=makeCase(loadouts[2]);
  assert.equal(preview.mainGun.periodUs,Math.round(clientStats.fireIntervalMs(.35,3,400,'seconds')*1000));
  let timer=openFireClock(preview.mainGun.periodUs), count=0;
  for(let t=60;t<=600;t+=60) {let r=advanceFireClock(timer,t);timer=r.clock;count+=r.shotTicks.length;}
  assert.ok(count>50 && count<75);
});

test('V8B-2C2A: player move sign and core integer rounding agree for a legal journal frame', () => {
  const {preview}=makeCase();
  const initial=preview.startPosition;
  const moved=advancePreviewMovement(preview,initial,{x:127,z:0});
  assert.equal(moved.xUnits,-600);
  assert.equal(moved.zUnits,initial.zUnits);
  assert.deepEqual(advancePreviewMovement(preview,moved,{x:0,z:-127}),
    {xUnits:-600,zUnits:initial.zUnits-600});
});

test('V8B-2C2A: arena clamp, 2 orientations and display 30/60/120 Hz do not alter 30Hz input ticks', () => {
  const frames = Array.from({length:90},(_,i)=>i%3===0?{x:127,z:0}:i%3===1?{x:0,z:127}:{x:-90,z:-90});
  for(const mode of ['portrait','landscape']) {
    const {preview}=makeCase(loadouts[1],mode);
    const paths=[];
    for(const displayFps of [30,60,120]) {
      let pos=preview.startPosition, ticks=0;
      const framesPerTick=displayFps/30;
      for(let displayFrame=0;displayFrame<90*framesPerTick;displayFrame++) {
        if(displayFrame % framesPerTick !== 0) continue;
        pos=advancePreviewMovement(preview,pos,frames[ticks++]);
      }
      assert.equal(ticks,90);
      paths.push(pos);
      assert.ok(Math.abs(pos.xUnits)<=preview.arena.halfWidthUnits-preview.pilotHitRadiusUnits,
        `x bounds at ${displayFps}fps`);
      assert.ok(Math.abs(pos.zUnits)<=preview.arena.halfHeightUnits-preview.pilotHitRadiusUnits,
        `z bounds at ${displayFps}fps`);
    }
    assert.deepEqual(paths[0],paths[1]);
    assert.deepEqual(paths[1],paths[2]);
  }
});

test('V8B-2C2A: legal keyboard journal frames match original V8B-2A core movement', () => {
  const {snapshot,preview}=makeCase();
  const journal=openInputJournal({uid:snapshot.context.uid,sessionId:snapshot.context.sessionId,
    battleId:snapshot.context.battleId,rulesVersion:snapshot.context.rulesVersion,
    loadoutHash:snapshot.loadoutHash,issuedAtMs:snapshot.context.issuedAtMs});
  const core=openCombatCore({journal,seed:snapshot.seed,
    arena:{halfWidth:preview.arena.halfWidthUnits,halfHeight:preview.arena.halfHeightUnits},
    pilot:{x:preview.startPosition.xUnits,z:preview.startPosition.zUnits,hp:1200,maxHp:1200,
      armor:preview.armor,atk:0,movePerTick:preview.movePerTickUnits,fireEveryTicks:12,
      shotSpeed:1700,hitRadius:preview.pilotHitRadiusUnits,bulletRadius:200,
      critChancePermille:0,critBonusPermille:0,dodgeChancePermille:0},enemies:[]});
  const frames=[{x:127,z:0},{x:0,z:-127},{x:-90,z:-90},{x:0,z:127}];
  const result=replayAcceptedChunk({state:core,journal,chunk:{protocol:'pve-input-v1',
    battleId:snapshot.context.battleId,startTick:0,frames},
    receivedAtMs:snapshot.context.issuedAtMs+1000});
  let pos=preview.startPosition;
  for(const input of frames) pos=advancePreviewMovement(preview,pos,input);
  assert.equal(result.state.pilot.x,pos.xUnits);
  assert.equal(result.state.pilot.z,pos.zUnits);
  assert.equal(result.state.tick,4);
});

test('V8B-2C2A: shot baseline x/z/velocity/damage matches client beam and plasma descriptors', () => {
  for(const gear of [loadouts[0],loadouts[1]]) {
    const {p,preview}=makeCase(gear);
    const {stats}=clientStats.deriveCombatLoadout(p.campaignData,catalog);
    const gunBase=catalog.GEAR_CATALOG.mainGun.find(g=>g.id===gear.gun);
    const clientShot=clientWeapons.describeMainSalvo(gunBase,{x:0,z:12.5},stats.atk)[0];
    const serverShot=previewMainProjectile(preview,{xUnits:0,zUnits:12500});
    assert.equal(serverShot.xUnits/1000,clientShot.x);
    assert.equal(serverShot.zUnits/1000,clientShot.z);
    assert.equal(serverShot.velocityZUnitsPerTick/2000,clientShot.vz);
    assert.equal(serverShot.atk,clientShot.atk);
    assert.equal(serverShot.pattern,gunBase.firePattern);
  }
});

test('V8B-2C2A: rejects advanced weapon patterns instead of claiming a single pellet verifies them', () => {
  const gear={...loadouts[0],gun:'gun_spread'};
  const p=profile(gear);
  const s=createServerBattleSnapshot({identity,persistedProfile:p,approvedCatalog:catalog,
    rules:{mode:'campaign',locationId:'qa_arena',rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},
    arena:makeArena('portrait'),seed:123456789});
  assert.throws(()=>previewFromTrustedSnapshot(s,policy),isCode('FOUNDATION_WEAPON_PATTERN_UNMODELED'));
});

test('V8B-2C2A: rejects armor above current core 90 instead of silently clamping', () => {
  const gear={...loadouts[2],shipLevel:20};
  const p=profile(gear);
  const s=createServerBattleSnapshot({identity,persistedProfile:p,approvedCatalog:catalog,
    rules:{mode:'campaign',locationId:'qa_arena',rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},
    arena:makeArena('portrait'),seed:123456789});
  assert.throws(()=>previewFromTrustedSnapshot(s,policy),isCode('FOUNDATION_ARMOR_CORE_GAP'));
});

test('V8B-2C2A: illegal server policy, forged frozen snapshot and attacker payload rejected', () => {
  const {snapshot}=makeCase();
  assert.throws(()=>previewFromTrustedSnapshot(snapshot,{...policy,clientVictory:true}),isCode('FOUNDATION_POLICY_INVALID'));
  assert.throws(()=>previewFromTrustedSnapshot({...snapshot,victory:true},policy),isCode('FOUNDATION_SNAPSHOT_INVALID'));
  const poison={...policy};
  Object.defineProperty(poison,'keyboardUnitsPer60HzFrame',{enumerable:true,get(){throw Error('attacker getter');}});
  assert.throws(()=>previewFromTrustedSnapshot(snapshot,poison),isCode('FOUNDATION_POLICY_INVALID'));
});

test('V8B-2C2A: invalid frame, position, and client victory extras are rejected', () => {
  const {preview}=makeCase();
  const pos=preview.startPosition;
  for(const frame of [{x:128,z:0},{x:127,z:127},{x:1.2,z:0},{x:0,z:0,victory:true}]) {
    assert.throws(()=>advancePreviewMovement(preview,pos,frame),isCode('FOUNDATION_INPUT_INVALID'));
  }
  assert.throws(()=>previewMainProjectile(preview,{...pos,rewards:{coins:999999}}),
    isCode('FOUNDATION_PROJECTILE_INVALID'));
});

test('V8B-2C2A: rejects clock fast-forward, invalid retry index and malicious state keys', () => {
  const clock=openFireClock(350000);
  assert.throws(()=>advanceFireClock(clock,61),isCode('FOUNDATION_CLOCK_INVALID'));
  assert.throws(()=>advanceFireClock({...clock,nextShotIndex:100},1),isCode('FOUNDATION_CLOCK_INVALID'));
  assert.throws(()=>advanceFireClock({...clock,victory:true},1),isCode('FOUNDATION_CLOCK_INVALID'));
  assert.throws(()=>openFireClock(NaN),isCode('FOUNDATION_CLOCK_INVALID'));
  assert.throws(()=>openFireClock(49_999),isCode('FOUNDATION_CLOCK_INVALID'));
});

test('V8B-2C2A: separate preview remains isolated from HTTP/economy and P0', () => {
  const moduleFile=fs.readFileSync(require.resolve('../lib/combatMovementWeaponV8.cjs'),'utf8');
  const serviceFile=fs.readFileSync(require.resolve('../lib/gameService.cjs'),'utf8');
  const httpFile=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.match(serviceFile,/BATTLE_VERIFICATION_UNAVAILABLE/);
  assert.doesNotMatch(serviceFile,/require\([^)]*combatMovementWeaponV8/);
  assert.doesNotMatch(httpFile,/combatMovementWeaponV8/);
  assert.doesNotMatch(moduleFile,/require\([^)]*(economy|gameService|firebase-admin|server\.js)/);
  for(const key of ['victory','winner','rewards','settlement','grant']) assert.equal(Object.hasOwn(api,key),false);
  assert.deepEqual(Object.keys(api).sort(),['FOUNDATION_VERSION','POLICY_VERSION','TIMER_VERSION',
    'MovementWeaponError','previewFromTrustedSnapshot','advancePreviewMovement',
    'previewMainProjectile','openFireClock','advanceFireClock'].sort());
});
