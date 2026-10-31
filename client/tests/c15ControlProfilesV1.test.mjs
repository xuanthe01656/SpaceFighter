import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {C15_CONTROL_PROFILES,C15_CURRENT_CONTROL_PROFILE_ID,C15_ARCADE_CONTROL_PROFILE_ID,
  resolveC15ControlProfile,resolveC15ControlProfileForPolicy} from '../src/game/c15/C15ControlProfilesV1.js';
const require=createRequire(import.meta.url);
const server=require('../../server/lib/c15ControlProfilesV1.cjs');

test('C15 control profile registry is byte-equivalent across client and server',()=>{
  for(const id of [C15_CURRENT_CONTROL_PROFILE_ID,C15_ARCADE_CONTROL_PROFILE_ID]){
    assert.deepEqual(C15_CONTROL_PROFILES[id],server.C15_CONTROL_PROFILES[id]);
    assert.equal(resolveC15ControlProfile(id).profileDigest,server.resolveC15ControlProfile(id).profileDigest);
  }
});

test('C15 profile lookup binds exact movement policy and rejects unknown mechanics',()=>{
  const current=server.createC15MovementPolicy(C15_CURRENT_CONTROL_PROFILE_ID);
  const arcade=server.createC15MovementPolicy(C15_ARCADE_CONTROL_PROFILE_ID);
  assert.equal(resolveC15ControlProfileForPolicy(current).id,C15_CURRENT_CONTROL_PROFILE_ID);
  assert.equal(resolveC15ControlProfileForPolicy(arcade).id,C15_ARCADE_CONTROL_PROFILE_ID);
  assert.ok(arcade.keyboardUnitsPer60HzFrame>current.keyboardUnitsPer60HzFrame);
  assert.throws(()=>resolveC15ControlProfile('teleport-v1'),/unsupported/);
  assert.throws(()=>resolveC15ControlProfileForPolicy({...arcade,keyboardUnitsPer60HzFrame:.5}),/not registered/);
});
