'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { executeCommand, GameError } = require('../lib/economy.cjs');
const { classifyGameApiError } = require('../lib/httpError.cjs');

let schema, config;
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
before(async () => {
  schema = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/utils/profileSchema.js')).href);
  config = await import(pathToFileURL(path.resolve(__dirname, '../../client/src/constants.js')).href);
});

function freshDocument() {
  const state = {
    coins: 0, diamonds: 0, energy: 50, vipPoints: 0, myName: 'Security QA',
    campaignData: schema.createDefaultCampaignData(),
  };
  const document = schema.createProfileDocument(state, { displayName: 'Security QA' }, NOW);
  return document;
}
function apply(doc, command, payload) {
  // Every request reloads the stored Firestore document via gameService.hydrate().
  const hydrated = structuredClone(doc);
  hydrated.campaignData = schema.restoreProfileDocument(doc).campaignData;
  return executeCommand(hydrated, command, payload, {
    now: NOW, config, rng: () => 0,
    uuid: () => '11111111-1111-4111-8111-111111111111',
  });
}
function mustReject(fn, code = 'ITEM_NOT_OWNED') {
  assert.throws(fn, error => error instanceof GameError && error.code === code,
    `Should reject with ${code}`);
}

test('inventory.lock rejects prototype-inherited gear IDs without changing Object.prototype', () => {
  for (const itemId of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    mustReject(() => apply(freshDocument(), 'inventory.lock', { kind: 'gear', itemId }));
  }
  assert.equal(Object.hasOwn(Object.prototype, 'isLocked'), false);
});

test('inventory.salvage cannot mint coins from prototype-inherited inventory IDs', () => {
  for (const kind of ['gear', 'pilot', 'aircraft']) {
    for (const itemId of ['__proto__', 'constructor', 'toString']) {
      mustReject(() => apply(freshDocument(), 'inventory.salvage', { items: [{ kind, itemId }] }));
    }
  }
});

test('profile.preferences rejects inherited pilots, aircraft and gear IDs', () => {
  mustReject(() => apply(freshDocument(), 'profile.preferences', { loadout: { pilot: 'constructor' } }));
  mustReject(() => apply(freshDocument(), 'profile.preferences', { loadout: { aircraft: '__proto__' } }));
  mustReject(() => apply(freshDocument(), 'profile.preferences', { loadout: { mainGun: 'toString' } }));
});

test('inventory.upgrade and pilot.starup reject nonexistent inherited entries', () => {
  mustReject(() => apply(freshDocument(), 'inventory.upgrade', { kind: 'aircraft', itemId: 'constructor' }));
  mustReject(() => apply(freshDocument(), 'pilot.starup', { pilotId: '__proto__' }));
});

test('legit player inventory can still equip, lock, unlock and salvage an owned gear', () => {
  const doc = freshDocument();
  const itemId = 'item_security_qa';
  doc.inventory.items[itemId] = { baseId: 'gun_laser', rarity: 3, level: 1, type: 'mainGun' };
  const equipped = apply(doc, 'profile.preferences', { loadout: { mainGun: itemId } });
  assert.equal(equipped.document.loadout.mainGun, itemId);
  const locked = apply(doc, 'inventory.lock', { kind: 'gear', itemId });
  assert.equal(locked.extra.isLocked, true);
  const unlocked = apply(locked.document, 'inventory.lock', { kind: 'gear', itemId });
  assert.equal(unlocked.extra.isLocked, false);
  const unequipped = apply(doc, 'profile.preferences', { loadout: { mainGun: 'item_start_gun' } });
  const salvaged = apply(unequipped.document, 'inventory.salvage', { items: [{ kind: 'gear', itemId }] });
  assert.equal(salvaged.extra.earnedCoins, 6);
  assert.equal(salvaged.document.wallet.coins, 6);
  assert.equal(Object.hasOwn(salvaged.document.inventory.items, itemId), false);
});

test('legit starter pilot and aircraft loadout remains compatible', () => {
  const result = apply(freshDocument(), 'profile.preferences', {
    loadout: { pilot: 'pilot_alpha', aircraft: 'ship_xwing', mainGun: 'item_start_gun' },
  });
  assert.equal(result.document.loadout.pilot, 'pilot_alpha');
  assert.equal(result.document.loadout.aircraft, 'ship_xwing');
  assert.equal(result.document.loadout.mainGun, 'item_start_gun');
});

test('expired, revoked, invalid and deleted-user ID tokens map to 401', () => {
  for (const code of [
    'auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token',
    'auth/argument-error', 'auth/user-not-found',
  ]) {
    const response = classifyGameApiError({ code, message: 'SDK private details' });
    assert.equal(response.status, 401);
    assert.equal(response.code, 'UNAUTHORIZED');
    assert.doesNotMatch(response.message, /SDK private details/);
  }
});

test('disabled Firebase user maps to 403, not 500', () => {
  assert.deepEqual(classifyGameApiError({ code: 'auth/user-disabled' }), {
    status: 403, code: 'ACCOUNT_DISABLED', message: 'Firebase account is disabled',
  });
});

test('Firebase IAM errors, unexpected failures remain server errors', () => {
  for (const error of [{ code: 'auth/invalid-credential' }, { code: 'permission-denied' }, new Error('failure')]) {
    assert.deepEqual(classifyGameApiError(error), {
      status: 500, code: 'INTERNAL_ERROR', message: 'Server error',
    });
  }
});

test('existing GameError statuses and codes remain unchanged', () => {
  const error = new GameError('RATE_LIMIT', 'Rate limited', 429);
  assert.deepEqual(classifyGameApiError(error), {
    status: 429, code: 'RATE_LIMIT', message: 'Rate limited',
  });
  const unavailable = new GameError('GAME_API_UNAVAILABLE', 'No service', 503);
  assert.deepEqual(classifyGameApiError(unavailable), {
    status: 503, code: 'GAME_API_UNAVAILABLE', message: 'Server error',
  });
});
