'use strict';
/** Run ONLY inside Firebase Emulator on a demo project, without real credentials. */
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const admin = require('firebase-admin');
const {createC15DungeonFoundationV1} = require('../lib/c15DungeonFoundationV1.cjs');
const DEMO = 'demo-spacefighter-dungeon-c15qa';
const PORT = '127.0.0.1:38081';
const WEDNESDAY = Date.UTC(2026, 10, 18, 12);
function assertIsolation() {
  for (const key of ['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','FIREBASE_PROJECT_ID']) {
    assert.equal(process.env[key], DEMO, `${key} must match exact demo project`);
  }
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, PORT);
  assert.equal(process.env.GAME_C15_DUNGEON_V1_ENABLED, 'true');
  assert.equal(process.env.GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED, 'true');
  assert.ok(!process.env.FIREBASE_PRIVATE_KEY, 'Real service account key must not be provided');
  assert.ok(!process.env.FIREBASE_CLIENT_EMAIL, 'Real service account must not be provided');
}
async function main() {
  assertIsolation();
  const uid = 'dungeon-emulator-' + randomUUID().replaceAll('-', '');
  const sid = randomUUID();
  process.env.GAME_C15_DUNGEON_V1_ALLOW_UIDS = uid;
  admin.initializeApp({projectId: DEMO});
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);
  await ref.create({sessionId: sid, wallet: {coins: 1000, diamonds: 500, energy: 15},
    campaignData: {materials: {blueprints: 3}}});
  const svc = await createC15DungeonFoundationV1({db, env: process.env,
    now: () => WEDNESDAY});
  const request = {dungeonId: 'dung_taurus',requestId: 'c15_dungeon_emulator_entry_000001'};
  async function retryTransaction(body) {
    for (let attempt = 0; attempt < 8; attempt++) {
      try { return await svc.admitEmulator(uid, sid, body); }
      catch (error) {
        if (![10, 4, '10', '4', 'ABORTED', 'DEADLINE_EXCEEDED'].includes(error?.code) || attempt === 7)
          throw error;
        await new Promise(resolve => setTimeout(resolve, 70 * (attempt + 1)));
      }
    }
  }
  const results = await Promise.all(Array.from({length: 20}, () => retryTransaction(request)));
  assert.equal(results.filter(item => item.duplicate === false).length, 1);
  assert.equal(results.filter(item => item.duplicate === true).length, 19);
  const firstBattleId = results[0].admission.battleId;
  assert.equal(new Set(results.map(item => item.admission.battleId)).size, 1);
  assert.ok(firstBattleId);
  const after = (await ref.get()).data();
  assert.equal(after.wallet.energy, 5);
  assert.equal(after.wallet.coins, 1000);
  assert.equal(after.wallet.diamonds, 500);
  const operations = await ref.collection('operations').get();
  assert.equal(operations.size, 1);
  const admissions = await ref.collection('c15DungeonV1Admissions').get();
  assert.equal(admissions.size, 1);
  console.log('DUNGEON_EMULATOR_20_REPLAY_ONE_ENERGY_DEBIT=PASS');
  await assert.rejects(svc.admitEmulator(uid, sid,
    {dungeonId:'dung_taurus',requestId:'c15_dungeon_emulator_other_0002'}),
    error => error?.code === 'C15_DUNGEON_ACTIVE');
  assert.equal((await ref.get()).data().wallet.energy, 5);
  console.log('DUNGEON_EMULATOR_CONCURRENT_DISTINCT_BLOCKED=PASS');
  assert.throws(() => svc.claim(uid, sid, {battleId:firstBattleId,
    victory:true, rewards:[{type:'diamonds', amount:9999}]}),
  error => error?.code === 'C15_DUNGEON_SERVER_REPLAY_REQUIRED');
  assert.equal((await ref.get()).data().wallet.diamonds, 500);
  console.log('DUNGEON_EMULATOR_FORGED_REWARD_DENIED=PASS');
  console.log('DUNGEON_EMULATOR_REAL_TRANSACTION_QA=PASS');
}
main().catch(error => {
  console.error('DUNGEON_EMULATOR_REAL_TRANSACTION_QA=PENDING');
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}).finally(async () => {
  for (const app of admin.apps) try { await app.delete(); } catch (_) {}
});
