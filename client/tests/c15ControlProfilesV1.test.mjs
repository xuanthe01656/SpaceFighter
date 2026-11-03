import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {C15_CONTROL_PROFILES,C15_CURRENT_CONTROL_PROFILE_ID,C15_LEGACY_ARCADE_CONTROL_PROFILE_ID,
  C15_ARCADE_CONTROL_PROFILE_ID,C15_DEFAULT_CONTROL_PROFILE_ID,resolveC15ControlProfile,
  resolveC15ControlProfileForPolicy} from '../src/game/c15/C15ControlProfilesV1.js';
const require=createRequire(import.meta.url);
const server=require('../../server/lib/c15ControlProfilesV1.cjs');

const ids=[C15_CURRENT_CONTROL_PROFILE_ID,C15_LEGACY_ARCADE_CONTROL_PROFILE_ID,C15_ARCADE_CONTROL_PROFILE_ID];
test('C15 control profile registry is byte-equivalent across client and server',()=>{
  for(const id of ids){assert.deepEqual(C15_CONTROL_PROFILES[id],server.C15_CONTROL_PROFILES[id]);
    assert.equal(resolveC15ControlProfile(id).profileDigest,server.resolveC15ControlProfile(id).profileDigest);}
  assert.equal(C15_DEFAULT_CONTROL_PROFILE_ID,C15_LEGACY_ARCADE_CONTROL_PROFILE_ID);
  assert.equal(server.DEFAULT_PROFILE_ID,server.LEGACY_ARCADE_PROFILE_ID);
});

test('C15 profile lookup preserves V1 and binds RC5 V2 deterministic mechanics',()=>{
  const current=server.createC15MovementPolicy(C15_CURRENT_CONTROL_PROFILE_ID);
  const legacy=server.createC15MovementPolicy(C15_LEGACY_ARCADE_CONTROL_PROFILE_ID);
  const rc5=server.createC15MovementPolicy(C15_ARCADE_CONTROL_PROFILE_ID);
  assert.equal(resolveC15ControlProfileForPolicy(current).id,C15_CURRENT_CONTROL_PROFILE_ID);
  assert.equal(resolveC15ControlProfileForPolicy(legacy).id,C15_LEGACY_ARCADE_CONTROL_PROFILE_ID);
  assert.equal(resolveC15ControlProfileForPolicy(rc5).id,C15_ARCADE_CONTROL_PROFILE_ID);
  assert.equal(rc5.keyboardUnitsPer60HzFrame,1.5);assert.ok(rc5.keyboardUnitsPer60HzFrame>legacy.keyboardUnitsPer60HzFrame);
  assert.equal(resolveC15ControlProfile(C15_ARCADE_CONTROL_PROFILE_ID).coordinateContract,'arena-relative-v2');
  assert.throws(()=>resolveC15ControlProfile('teleport-v1'),/unsupported/);
  assert.throws(()=>resolveC15ControlProfileForPolicy({...rc5,keyboardUnitsPer60HzFrame:9}),/not registered/);
});
