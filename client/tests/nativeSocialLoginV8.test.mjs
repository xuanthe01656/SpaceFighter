import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { createNativeSocialLoginBridge, createAppleNonce,
  GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../src/utils/nativeSocialLoginV8.mjs';

function makeFake({ platform = 'ios', loginResult = { result: { responseType: 'online', idToken: 'jwt-test' } } } = {}) {
  const calls = [];
  const plugin = {
    initialize: async options => { calls.push(['initialize', options]); },
    login: async options => { calls.push(['login', options]); return loginResult; },
    logout: async options => { calls.push(['logout', options]); },
  };
  return { calls, plugin, bridge: createNativeSocialLoginBridge({ plugin, getPlatform: () => platform, cryptoApi: webcrypto }) };
}

test('Google native flow initializes online mode once and extracts nested Firebase ID token', async () => {
  const f = makeFake();
  assert.equal(await f.bridge.googleIdToken(), 'jwt-test');
  assert.equal(await f.bridge.googleIdToken(), 'jwt-test');
  assert.equal(f.calls.filter(([name]) => name === 'initialize').length, 1);
  const opts = f.calls.find(([name]) => name === 'initialize')[1];
  assert.equal(opts.google.mode, 'online');
  assert.equal(opts.google.webClientId, GOOGLE_WEB_CLIENT_ID);
  assert.equal(opts.google.iOSClientId, GOOGLE_IOS_CLIENT_ID);
  assert.equal(opts.google.iOSServerClientId, GOOGLE_WEB_CLIENT_ID);
  assert.deepEqual(f.calls.find(([name]) => name === 'login')[1], {
    provider: 'google', options: { scopes: ['profile', 'email'] },
  });
});

test('Google missing and offline ID token fail closed', async () => {
  for (const result of [{ responseType: 'offline', serverAuthCode: 'code' }, { idToken: '' }, null]) {
    const f = makeFake({ loginResult: { result } });
    await assert.rejects(f.bridge.googleIdToken(), /GOOGLE_ID_TOKEN_MISSING/);
  }
});

test('Apple nonce is random 32-byte raw hex, matched to SHA256 digest', async () => {
  const a = await createAppleNonce(webcrypto);
  const b = await createAppleNonce(webcrypto);
  assert.match(a.rawNonce, /^[a-f0-9]{64}$/);
  assert.notEqual(a.rawNonce, b.rawNonce);
  assert.equal(a.hashedNonce, createHash('sha256').update(a.rawNonce).digest('hex'));
});

test('Apple native iOS returns token and ephemeral raw nonce for Firebase', async () => {
  const f = makeFake({ loginResult: { result: {
    idToken: 'apple-jwt', profile: { givenName: 'A', familyName: 'B' },
  } } });
  const data = await f.bridge.appleCredentialData();
  assert.equal(data.idToken, 'apple-jwt');
  assert.equal(data.givenName, 'A');
  assert.equal(data.familyName, 'B');
  const params = f.calls.find(([name]) => name === 'login')[1];
  assert.equal(params.provider, 'apple');
  assert.deepEqual(params.options.scopes, ['email', 'name']);
  assert.equal(params.options.nonce, createHash('sha256').update(data.rawNonce).digest('hex'));
  assert.deepEqual(f.calls.find(([name]) => name === 'initialize')[1].apple, {});
});

test('Apple missing token is rejected', async () => {
  const f = makeFake({ loginResult: { result: { idToken: null } } });
  await assert.rejects(f.bridge.appleCredentialData(), /APPLE_ID_TOKEN_MISSING/);
});

test('Android Apple login is blocked because OAuth Service ID and redirect are unconfigured', async () => {
  const f = makeFake({ platform: 'android' });
  await assert.rejects(f.bridge.appleCredentialData(), /APPLE_NATIVE_IOS_ONLY/);
  assert.equal(f.calls.length, 0);
});

test('Web login never initializes native plugin', async () => {
  const f = makeFake({ platform: 'web' });
  await assert.rejects(f.bridge.googleIdToken(), /NATIVE_LOGIN_ONLY/);
  await f.bridge.logoutAll();
  assert.equal(f.calls.length, 0);
});

test('Native logout clears both providers but never prevents Firebase cleanup', async () => {
  const f = makeFake();
  f.plugin.logout = async options => { f.calls.push(['logout', options]); if (options.provider === 'apple') throw Error('cancelled'); };
  await f.bridge.logoutAll();
  assert.deepEqual(f.calls.filter(([name]) => name === 'logout').map(x => x[1]), [
    { provider: 'google' }, { provider: 'apple', clearCachedUserInfo: true },
  ]);
});

test('Android logout only calls Google provider', async () => {
  const f = makeFake({ platform: 'android' });
  await f.bridge.logoutAll();
  assert.deepEqual(f.calls.filter(([name]) => name === 'logout').map(x => x[1]), [{ provider: 'google' }]);
});

test('Native initialization retries safely after one failure', async () => {
  const f = makeFake();
  let times = 0;
  f.plugin.initialize = async () => { times++; if (times === 1) throw Error('temporary'); };
  await assert.rejects(f.bridge.googleIdToken(), /temporary/);
  assert.equal(await f.bridge.googleIdToken(), 'jwt-test');
  assert.equal(times, 2);
});

test('Missing Web Crypto secure random fails closed', async () => {
  await assert.rejects(createAppleNonce(null), /APPLE_SECURE_RANDOM_UNAVAILABLE/);
});
