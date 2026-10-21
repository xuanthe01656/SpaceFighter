import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentAuthAttempt, canProcessSessionSnapshot, guestEnergyFromStorage } from '../src/utils/authSessionGuards.mjs';

test('Guest stored energy 0 stays 0, including numeric string', () => {
  assert.equal(guestEnergyFromStorage(0), 0);
  assert.equal(guestEnergyFromStorage('0'), 0);
  assert.equal(guestEnergyFromStorage(12), 12);
  assert.equal(guestEnergyFromStorage('42'), 42);
});

test('Guest energy invalid or missing values safely use default', () => {
  for (const value of [null, undefined, '', 'not-number', -1, 1.5, Infinity]) {
    assert.equal(guestEnergyFromStorage(value), 50);
  }
});

test('Outdated session response cannot be applied after sign-out or account change', () => {
  assert.equal(isCurrentAuthAttempt(1, 2, 'uid-a', 'uid-a'), false);
  assert.equal(isCurrentAuthAttempt(1, 1, 'uid-a', null), false);
  assert.equal(isCurrentAuthAttempt(1, 1, 'uid-a', 'uid-b'), false);
  assert.equal(isCurrentAuthAttempt(2, 2, 'uid-b', 'uid-b'), true);
});

test('Only an authoritative, current same-user Firestore snapshot can replace a session', () => {
  const snap = (cache, exists=true) => ({ metadata:{fromCache:cache},exists:()=>exists });
  assert.equal(canProcessSessionSnapshot(snap(true), 3, 3, 'uid-a', 'uid-a'), false);
  assert.equal(canProcessSessionSnapshot(snap(false), 2, 3, 'uid-a', 'uid-a'), false);
  assert.equal(canProcessSessionSnapshot(snap(false), 3, 3, 'uid-a', 'uid-b'), false);
  assert.equal(canProcessSessionSnapshot(snap(false,false), 3, 3, 'uid-a', 'uid-a'), false);
  assert.equal(canProcessSessionSnapshot(snap(false), 3, 3, 'uid-a', 'uid-a'), true);
});
