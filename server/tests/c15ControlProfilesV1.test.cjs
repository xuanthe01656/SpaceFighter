'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const server=require('../lib/c15ControlProfilesV1.cjs');
const fixture=require('../tools/c15Rc1Fixture.cjs');
const ids=[server.CURRENT_PROFILE_ID,server.LEGACY_ARCADE_PROFILE_ID,server.ARCADE_PROFILE_ID];

test('C15 control profiles are mirrored by the browser and bind exact deterministic policies',async()=>{
  const client=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/c15/C15ControlProfilesV1.js')).href);
  for(const id of ids)assert.deepEqual(client.C15_CONTROL_PROFILES[id],server.C15_CONTROL_PROFILES[id]);
  assert.equal(server.DEFAULT_PROFILE_ID,server.LEGACY_ARCADE_PROFILE_ID);
  assert.equal(server.createC15MovementPolicy(server.ARCADE_PROFILE_ID).keyboardUnitsPer60HzFrame,1.5);
  assert.ok(server.createC15MovementPolicy(server.ARCADE_PROFILE_ID).keyboardUnitsPer60HzFrame
    >server.createC15MovementPolicy(server.LEGACY_ARCADE_PROFILE_ID).keyboardUnitsPer60HzFrame);
});

test('all registered control profiles independently replay full victory and defeat',async()=>{
  let n=6;for(const id of ids){const suffix=(n++).toString(16);const win=await fixture.createC15Rc1Fixture({profileId:id,
      battleId:`82e2ee38-1cd8-4c5f-869b-56e31f6300a${suffix}`});
    const victory=fixture.generateC15VictoryFrames(win);assert.equal(victory.run.state.phase,'lab-clear');assert.equal(victory.run.state.kills,70);
    const lossSuffix=(n++).toString(16);const loss=await fixture.createC15Rc1Fixture({profileId:id,
      battleId:`82e2ee38-1cd8-4c5f-869b-56e31f6300a${lossSuffix}`,seed:11335578});
    assert.equal(fixture.generateC15DefeatFrames(loss).run.state.phase,'lab-defeat');}
});
