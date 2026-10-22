'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { openInputJournal } = require('../lib/combatInputJournalV8.cjs');
const { CORE_VERSION } = require('../lib/combatCoreV8.cjs');
const { SNAPSHOT_VERSION, createServerBattleSnapshot } = require('../lib/battleSnapshotV8.cjs');

const identity = Object.freeze({
  uid:'player_01',
  sessionId:'d2b2f0a0-1992-4a90-8d53-d0be4bff0324',
  battleId:'d9a0ed13-ff8f-4478-9ed2-e8fed65e94a2',
  issuedAtMs:1782000000000,
  expiresAtMs:1782000000000 + 600000,
});
const rules = Object.freeze({mode:'campaign',locationId:'planet_1_stage_1',
  rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'});
const arena = Object.freeze({halfWidthUnits:13200,halfHeightUnits:15000,
  spawnXUnits:0,spawnZUnits:12500});
const profile = () => ({campaignData:{
  loadout:{pilot:'pilot_alpha',aircraft:'ship_xwing',mainGun:'item_start_gun',wingman:'',armor:'',drone:''},
  ownedPilots:{pilot_alpha:{level:1,stars:1}},
  ownedAircrafts:{ship_xwing:{level:1,stars:1}},
  items:{item_start_gun:{baseId:'gun_laser',rarity:1,level:1,type:'mainGun'}},
}});
// Node loads the exact ESM public catalog that GameService also imports; no
// alternative test-only catalog values are silently substituted.
let catalog;
test.before(async () => {
  catalog = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/constants.js')).href);
});
const input = (overrides={}) => ({identity, persistedProfile:profile(), approvedCatalog:catalog,
  rules, arena, seed:123456789, ...overrides});
const create = (overrides={}) => createServerBattleSnapshot(input(overrides));
const rejects = (fn, code) => assert.throws(fn, e => e?.code === code);

test('V8B-2C1: real catalog starter profile yields immutable versioned preview',()=>{
  const result=create();
  assert.equal(result.snapshotVersion,SNAPSHOT_VERSION);
  assert.equal(result.context.protocolVersion,'pve-input-v1');
  assert.equal(result.context.coreVersion,CORE_VERSION);
  assert.equal(result.context.rulesVersion,'combat-v1.0.0');
  assert.equal(result.equipment.pilot.id,'pilot_alpha');
  assert.equal(result.equipment.aircraft.id,'ship_xwing');
  assert.equal(result.equipment.mainGun.baseId,'gun_laser');
  assert.equal(result.equipment.mainGun.fireRateUnit,'seconds');
  assert.equal(result.equipment.mainGun.fireRate,.35);
  assert.equal(result.equipment.armor,null);
  assert.match(result.loadoutHash,/^[a-f0-9]{64}$/);
  assert.match(result.selectedCatalogHash,/^[a-f0-9]{64}$/);
  assert.match(result.snapshotHash,/^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.equipment));
  assert.ok(Object.isFrozen(result.equipment.pilot));
  assert.ok(Object.isFrozen(result.context));
  assert.throws(()=>{ result.equipment.pilot.level=1000; },TypeError);
  assert.ok(!('victory' in result) && !('rewards' in result));
});

test('V8B-2C1: same trusted inputs create exactly the same hashes and frozen data',()=>{
  const first=create();
  const second=create();
  assert.deepEqual(first,second);
  assert.notStrictEqual(first,second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)),first);
});

test('V8B-2C1: profile unrelated or client-result-like fields cannot affect snapshot',()=>{
  const first=create();
  const mutated=profile();
  mutated.campaignData.coins=999999999;
  mutated.campaignData.victory=true;
  mutated.campaignData.hp=999999999;
  mutated.campaignData.loadout.kills=10000;
  mutated.someClientPayload={seed:42,stars:3};
  const second=create({persistedProfile:mutated});
  assert.deepEqual(first,second);
});

test('V8B-2C1: hashes rotate when equipped levels or approved combat stats change',()=>{
  const original=create();
  const newLevel=profile();newLevel.campaignData.ownedAircrafts.ship_xwing.level=2;
  const raised=create({persistedProfile:newLevel});
  assert.notEqual(raised.loadoutHash,original.loadoutHash);
  assert.equal(raised.selectedCatalogHash,original.selectedCatalogHash);
  const changed={...catalog,AIRCRAFTS:catalog.AIRCRAFTS.map(x=>x.id==='ship_xwing'?{...x,baseHp:x.baseHp+1}:x)};
  const changedCatalog=create({approvedCatalog:changed});
  assert.notEqual(changedCatalog.selectedCatalogHash,original.selectedCatalogHash);
  assert.notEqual(changedCatalog.loadoutHash,original.loadoutHash);
  assert.notEqual(changedCatalog.snapshotHash,original.snapshotHash);
});

test('V8B-2C1: catalog reorder and noncombat presentation changes do not change hash',()=>{
  const reordered={...catalog,PILOTS:[...catalog.PILOTS].reverse(),
    AIRCRAFTS:catalog.AIRCRAFTS.map(x=>({...x,name:{vi:'title changed',en:'visual only'}})).reverse(),
    GEAR_CATALOG:{...catalog.GEAR_CATALOG,
      mainGun:[...catalog.GEAR_CATALOG.mainGun].reverse()}};
  assert.deepEqual(create({approvedCatalog:reordered}),create());
});

test('V8B-2C1: rejects unknown loadout/ownership and inherited item keys',()=>{
  const cases=['pilot','aircraft','mainGun'];
  for (const slot of cases) {
    const bad=profile();bad.campaignData.loadout[slot]=`nonexistent_${slot}`;
    rejects(()=>create({persistedProfile:bad}),'SNAPSHOT_NOT_OWNED');
  }
  const inherited=profile();
  inherited.campaignData.items=Object.create({item_start_gun:{type:'mainGun',baseId:'gun_laser',level:1,rarity:1}});
  rejects(()=>create({persistedProfile:inherited}),'SNAPSHOT_NOT_OWNED');
  const invalid=profile(); invalid.campaignData.items.item_start_gun.type='armor';
  rejects(()=>create({persistedProfile:invalid}),'SNAPSHOT_NOT_OWNED');
});

test('V8B-2C1: rejects forged baseId, item UUID mismatch, rarity and negative levels',()=>{
  const bad=profile();bad.campaignData.items.item_start_gun.baseId='unknown_weapon';
  rejects(()=>create({persistedProfile:bad}),'SNAPSHOT_CATALOG_INVALID');
  const wrong=profile();wrong.campaignData.items.item_start_gun.uuid='item_other';
  rejects(()=>create({persistedProfile:wrong}),'SNAPSHOT_NOT_OWNED');
  const level=profile();level.campaignData.ownedPilots.pilot_alpha.level=-1;
  rejects(()=>create({persistedProfile:level}),'SNAPSHOT_NOT_OWNED');
  const rarity=profile();rarity.campaignData.items.item_start_gun.rarity=100;
  rejects(()=>create({persistedProfile:rarity}),'SNAPSHOT_NOT_OWNED');
});

test('V8B-2C1: optional gear resolves only from owned matching slot and approved catalog',()=>{
  const p=profile();
  p.campaignData.items.item_armor={type:'armor',baseId:'armor_shield',level:3,rarity:4};
  p.campaignData.items.item_wing={type:'wingman',baseId:'wing_missile',level:2,rarity:2};
  p.campaignData.items.item_drone={type:'drone',baseId:'drone_sniper',level:1,rarity:3};
  p.campaignData.loadout.armor='item_armor';
  p.campaignData.loadout.wingman='item_wing';
  p.campaignData.loadout.drone='item_drone';
  const snap=create({persistedProfile:p});
  assert.equal(snap.equipment.armor.passive,'shield');
  assert.equal(snap.equipment.armor.baseHp,800);
  assert.equal(snap.equipment.wingman.fireRateUnit,'milliseconds');
  assert.equal(snap.equipment.drone.behavior,'sniper');
  const corrupted=structuredClone(p);corrupted.campaignData.items.item_wing.type='mainGun';
  rejects(()=>create({persistedProfile:corrupted}),'SNAPSHOT_NOT_OWNED');
});

test('V8B-2C1: all approved aircraft in the real catalog can be snapshotted',()=>{
  for (const ship of catalog.AIRCRAFTS) {
    const p=profile();p.campaignData.ownedAircrafts[ship.id]={level:1,stars:1};
    p.campaignData.loadout.aircraft=ship.id;
    const result=create({persistedProfile:p});
    assert.equal(result.equipment.aircraft.id,ship.id);
  }
});

test('V8B-2C1: all approved pilots and gear can be snapshotted with legal inventory',()=>{
  for (const pilot of catalog.PILOTS) {
    const p=profile();p.campaignData.ownedPilots[pilot.id]={level:1,stars:1};
    p.campaignData.loadout.pilot=pilot.id;
    assert.equal(create({persistedProfile:p}).equipment.pilot.id,pilot.id);
  }
  for (const slot of ['mainGun','wingman','armor','drone']) {
    for (const base of catalog.GEAR_CATALOG[slot]) {
      const p=profile();const key='item_preview';
      p.campaignData.items[key]={type:slot,baseId:base.id,level:1,rarity:1};
      p.campaignData.loadout[slot]=key;
      assert.equal(create({persistedProfile:p}).equipment[slot].baseId,base.id);
    }
  }
});

test('V8B-2C1: missing and duplicated catalog IDs fail closed',()=>{
  rejects(()=>create({approvedCatalog:{...catalog,PILOTS:catalog.PILOTS.filter(p=>p.id!=='pilot_alpha')}}),
    'SNAPSHOT_CATALOG_INVALID');
  rejects(()=>create({approvedCatalog:{...catalog,AIRCRAFTS:[...catalog.AIRCRAFTS,catalog.AIRCRAFTS[0]]}}),
    'SNAPSHOT_CATALOG_INVALID');
});

test('V8B-2C1: fail closed on invalid versions, trusted identity, seed or arena',()=>{
  rejects(()=>create({identity:{...identity,expiresAtMs:identity.issuedAtMs+1800001}}),
    'SNAPSHOT_IDENTITY_INVALID');
  rejects(()=>create({identity:{...identity,uid:'player/../someone'}}),
    'SNAPSHOT_IDENTITY_INVALID');
  rejects(()=>create({rules:{...rules,mode:'versus'}}),
    'SNAPSHOT_RULES_INVALID');
  rejects(()=>create({rules:{...rules,locationId:'../../other'}}),
    'SNAPSHOT_RULES_INVALID');
  rejects(()=>create({arena:{...arena,spawnZUnits:16000}}),
    'SNAPSHOT_ARENA_INVALID');
  rejects(()=>create({seed:0}),'SNAPSHOT_ARENA_INVALID');
  rejects(()=>create({...input(),victory:true}),'SNAPSHOT_INPUT_INVALID');
});

test('V8B-2C1: rejects accessor injection and prototype-pollution-like loadout',()=>{
  const payload=input();
  Object.defineProperty(payload,'seed',{enumerable:true,get(){throw Error('getter should not run');}});
  rejects(()=>createServerBattleSnapshot(payload),'SNAPSHOT_INPUT_INVALID');
  const inherited=profile();
  inherited.campaignData.loadout=Object.create({pilot:'pilot_alpha'});
  Object.assign(inherited.campaignData.loadout,{aircraft:'ship_xwing',mainGun:'item_start_gun',wingman:'',armor:'',drone:''});
  rejects(()=>create({persistedProfile:inherited}),'SNAPSHOT_PROFILE_INVALID');
});

test('V8B-2C1: compatible *only* with the journal identity contract, not a battle verifier',()=>{
  const s=create();
  const journal=openInputJournal({uid:s.context.uid,sessionId:s.context.sessionId,
    battleId:s.context.battleId,rulesVersion:s.context.rulesVersion,
    loadoutHash:s.loadoutHash,issuedAtMs:s.context.issuedAtMs});
  assert.equal(journal.loadoutHash,s.loadoutHash);
  assert.equal(journal.nextTick,0);
  assert.equal(Object.hasOwn(s,'verifiedVictory'),false);
  assert.equal(Object.hasOwn(s,'reward'),false);
});

test('V8B-2C1: no HTTP/economy integration and existing P0 gate remain unchanged',()=>{
  const lib=fs.readFileSync(require.resolve('../lib/battleSnapshotV8.cjs'),'utf8');
  const service=fs.readFileSync(require.resolve('../lib/gameService.cjs'),'utf8');
  const http=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.doesNotMatch(service,/require\([^)]*battleSnapshotV8/);
  assert.doesNotMatch(http,/battleSnapshotV8/);
  assert.doesNotMatch(lib,/require\([^)]*(economy|gameService|firebase-admin|server\.js)/);
  assert.match(service,/BATTLE_VERIFICATION_UNAVAILABLE/);
});
