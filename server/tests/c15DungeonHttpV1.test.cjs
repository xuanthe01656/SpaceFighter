'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
let createApp;
try { ({createApp} = require('../server.js')); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const UID = 'dungeon-http-qa';
const SID = 'b8b9eedc-805b-48ed-944e-376b425bd601';
const HEADERS = {authorization: `Bearer ${'x'.repeat(50)}`, 'x-game-session': SID};
const auth = {verifyIdToken: async () => ({uid: UID})};
const service = {getProfile: async () => ({}), openSession: async () => ({}), apply: async () => ({})};
async function request(app, url, {method = 'GET', headers = {}, body} = {}) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: {...headers, ...(body ? {'content-type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    return {status: response.status, body: await response.json()};
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('Dungeon routes OFF by default and settlement always blocked', {skip: !createApp}, async () => {
  const app = createApp('/no-client', {auth, service});
  for (const url of ['/api/v1/c15/dungeon/contract?dungeonId=dung_taurus',
    '/api/v1/c15/dungeon/admission']) {
    const {status, body} = await request(app, url, {
      method: url.includes('admission') ? 'POST' : 'GET', headers: HEADERS,
      ...(url.includes('admission') ? {body: {dungeonId: 'dung_taurus', requestId:'valid_request_id_001'}} : {}),
    });
    assert.equal(status, 503);
    assert.equal(body.code, 'C15_DUNGEON_V1_DISABLED');
  }
  for (const url of ['/api/v1/c15/dungeon/battle/chunk',
    '/api/v1/c15/dungeon/battle/finalize',
    '/api/v1/c15/dungeon/settlement/claim']) {
    const res = await request(app, url, {method: 'POST', headers: HEADERS,
      body: {victory: true, score: 9999999, rewards: [{type:'diamonds', amount:9999}]}});
    assert.equal(res.status, 423);
    assert.equal(res.body.code, 'C15_DUNGEON_SERVER_REPLAY_REQUIRED');
  }
});

test('Emulator-only API binds server-authenticated UID, session and passes strict body',
  {skip: !createApp}, async () => {
    const calls = [];
    const dungeon = {enabled:true, emulatorOnly:true,
      preview:async(...args)=>{calls.push(['preview',...args]);return {emulatorOnly:true,rewardSettlementEnabled:false};},
      admitEmulator:async(...args)=>{calls.push(['entry',...args]);return {duplicate:false, rewardSettlementEnabled:false};}};
    const app = createApp('/no-client', {auth, service,
      c15DungeonV1Enabled:true, c15DungeonV1Service:dungeon});
    const preview = await request(app, '/api/v1/c15/dungeon/contract?dungeonId=dung_taurus',
      {headers: HEADERS});
    assert.equal(preview.status,200);
    assert.equal(preview.body.rewardSettlementEnabled,false);
    assert.deepEqual(calls[0],['preview',UID,SID,'dung_taurus']);
    const body = {dungeonId:'dung_taurus',requestId:'dungeon_api_request_0001',uid:'spoof'};
    const admitted = await request(app, '/api/v1/c15/dungeon/admission',
      {method:'POST',headers:HEADERS,body});
    assert.equal(admitted.status,200);
    assert.deepEqual(calls[1], ['entry', UID, SID, body]);
    const blocked = await request(app,'/api/v1/c15/dungeon/settlement/claim',
      {method:'POST',headers:HEADERS,body:{victory:true}});
    assert.equal(blocked.status,423);
  });

test('HTTP flag true without enabled emulator service cannot expose admission',
  {skip: !createApp}, async () => {
    const app=createApp('/no-client',{auth,service,c15DungeonV1Enabled:true,
      c15DungeonV1Service:{enabled:true,emulatorOnly:false}});
    const result=await request(app,'/api/v1/c15/dungeon/admission',{method:'POST',headers:HEADERS,
      body:{dungeonId:'dung_taurus',requestId:'dungeon_api_req_no_emu_001'}});
    assert.equal(result.status,503);
  });
