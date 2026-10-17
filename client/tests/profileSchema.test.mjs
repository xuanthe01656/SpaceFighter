import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCampaignData, createProfileDocument, restoreProfileDocument, profileMergeFields, parseGuestCampaign } from '../src/utils/profileSchema.js';

const user = { displayName: 'Pilot A', photoURL: '' };
const game = () => ({ myName:'Pilot A', coins:100, diamonds:20, energy:32, vipPoints:9, campaignData:createDefaultCampaignData() });

test('new profile serializes all previously missing persistent fields', () => {
  const state = game();
  state.campaignData.materials = { gears:2, blueprints:3, crates:{ basic:4, epic:1 } };
  state.campaignData.eventData = { galaxy_event:{ kills:8, claimedMilestones:[0] } };
  state.campaignData.dungeonHistory = { dung_taurus: { wins:2 } };
  const doc = createProfileDocument(state, user, 123);
  assert.deepEqual(doc.materials.crates, { basic:4, epic:1 });
  assert.equal(doc.wallet.gears, 2);
  assert.equal(doc.eventData.galaxy_event.kills, 8);
  assert.equal(doc.dungeonHistory.dung_taurus.wins, 2);
  assert.ok(doc.schemaVersion >= 2);
  state.campaignData.items.item_start_gun.level = 99;
  assert.notEqual(doc.inventory.items.item_start_gun.level, 99, 'serialized snapshot must not change after queueing');
});

test('round-trip retains crates, events, dungeon history, loadout and wallet', () => {
  const state = game();
  state.campaignData.materials.crates = { basic:3 };
  state.campaignData.eventData.a = { claimedMilestones:[1] };
  state.campaignData.dungeonHistory = { dung_nereus:{ wins:4 } };
  state.campaignData.items.extra = { rarity:5 };
  const roundtrip = restoreProfileDocument(createProfileDocument(state,user));
  assert.deepEqual(roundtrip.campaignData.materials.crates,{basic:3});
  assert.deepEqual(roundtrip.campaignData.eventData.a,{claimedMilestones:[1]});
  assert.deepEqual(roundtrip.campaignData.dungeonHistory.dung_nereus,{wins:4});
  assert.deepEqual(roundtrip.campaignData.items.extra,{rarity:5});
  assert.equal(roundtrip.energy,32);
});

test('legacy flattened and nested documents retain unknown campaign fields', () => {
  const legacy = {coins:4,campaignData:{materials:{gears:2,crates:{epic:8}},eventData:{event:{kills:3}}, extraCampaignFlag:'KEEP', items:{abc:{rarity:1}}, progress:{highestStage:6}}};
  const result = restoreProfileDocument(legacy);
  assert.equal(result.coins,4);
  assert.equal(result.campaignData.progress.highestStage,6);
  assert.equal(result.campaignData.extraCampaignFlag,'KEEP');
  assert.equal(result.campaignData.materials.crates.epic,8);
  assert.equal(result.campaignData.eventData.event.kills,3);
  assert.equal(result.campaignData.items.abc.rarity,1);
});

test('mergeFields replaces owned top-level maps but preserves unknown document fields', () => {
  const doc = createProfileDocument(game(), user);
  assert.ok(profileMergeFields(doc).includes('inventory'));
  assert.ok(profileMergeFields(doc).includes('wallet.coins'));
  assert.ok(profileMergeFields(doc).includes('profile.displayName'));
  assert.ok(!profileMergeFields(doc).includes('profile')); 
  assert.ok(!profileMergeFields(doc).includes('sessionId'));
  assert.ok(!profileMergeFields(doc).includes('campaignData'));
});

test('guest campaign supports legacy JSON string and new object without crashing', () => {
  assert.deepEqual(parseGuestCampaign('{"foo":1}'),{foo:1});
  assert.deepEqual(parseGuestCampaign({foo:2}),{foo:2});
  assert.equal(parseGuestCampaign('{broken'),null);
  assert.equal(parseGuestCampaign(null),null);
});
