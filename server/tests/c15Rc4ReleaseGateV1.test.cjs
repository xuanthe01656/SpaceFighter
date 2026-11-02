'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseC15Rc4ReleaseGateConfig,createC15Rc4ReleaseGate,compareVersions,hashId}=require('../lib/c15Rc4ReleaseGateV1.cjs');
const UID='o9vfpijisnSbrvohmH5wNFRYgsn2';
const base={GAME_C15_RC4_RELEASE_GATE_ENABLED:'true',GAME_C15_RC4_DEPLOYMENT_MODE:'staging',GAME_C15_RC4_GLOBAL_KILL_SWITCH:'false',
  GAME_C15_RC4_CANARY_UIDS:UID,GAME_C15_RC4_MIN_APP_VERSION:'1.2.1',GAME_C15_RC4_ALLOWED_BUILD_CHANNELS:'release-candidate'};

test('RC4 release gate defaults OFF and explicit kill switch blocks before settlement',()=>{
  assert.equal(parseC15Rc4ReleaseGateConfig({}),null);
  const config=parseC15Rc4ReleaseGateConfig({...base,GAME_C15_RC4_GLOBAL_KILL_SWITCH:'true'}),gate=createC15Rc4ReleaseGate(config);
  assert.throws(()=>gate.authorize({uid:UID,appVersion:'1.2.1',buildChannel:'release-candidate'}),error=>error?.code==='C15_RC4_KILL_SWITCH'&&error?.status===423);
});

test('RC4 canary admission requires exact UID, build channel and minimum version',()=>{
  const gate=createC15Rc4ReleaseGate(parseC15Rc4ReleaseGateConfig(base));
  const ok=gate.authorize({uid:UID,appVersion:'1.2.1',buildChannel:'release-candidate'});assert.equal(ok.mode,'staging');assert.notEqual(ok.uidHash,UID);
  assert.throws(()=>gate.authorize({uid:'other_uid',appVersion:'1.2.1',buildChannel:'release-candidate'}),e=>e?.code==='C15_RC4_NOT_ALLOWED');
  assert.throws(()=>gate.authorize({uid:UID,appVersion:'1.2.0',buildChannel:'release-candidate'}),e=>e?.code==='C15_RC4_APP_UPDATE_REQUIRED');
  assert.throws(()=>gate.authorize({uid:UID,appVersion:'1.2.1',buildChannel:'staging-qa'}),e=>e?.code==='C15_RC4_BUILD_CHANNEL_REJECTED');
  assert.equal(compareVersions('1.2.1','1.2.1'),0);assert.equal(compareVersions('1.3.0','1.2.9'),1);
});

test('production config accepts production channel only and structured event contains no raw identity',()=>{
  assert.throws(()=>parseC15Rc4ReleaseGateConfig({...base,GAME_C15_RC4_DEPLOYMENT_MODE:'production'}),/production/i);
  const config=parseC15Rc4ReleaseGateConfig({...base,GAME_C15_RC4_DEPLOYMENT_MODE:'production',GAME_C15_RC4_ALLOWED_BUILD_CHANNELS:'production'});
  const gate=createC15Rc4ReleaseGate(config),event=gate.event({uid:UID,battleId:'battle_12345678901234567890',outcomeDigest:'a'.repeat(64),statusCode:200,outcome:'ok',duplicate:true,latencyMs:12.3456});
  const serialized=JSON.stringify(event);assert.equal(event.mode,'production');assert.equal(event.duplicate,true);assert.equal(event.latencyMs,12.346);
  assert.doesNotMatch(serialized,new RegExp(UID));assert.equal(event.uidHash,hashId(UID));assert.equal(event.outcomePrefix,'a'.repeat(12));
});


test('enabled RC4 release gate configuration cannot silently fail open at startup',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
  assert.match(source,/C15 RC4 release gate configuration invalid; startup aborted/);
  assert.match(source,/catch\(_error\)\{[\s\S]{0,180}throw _error;/);
  assert.doesNotMatch(source,/release gate disabled: invalid deployment configuration/);
});
