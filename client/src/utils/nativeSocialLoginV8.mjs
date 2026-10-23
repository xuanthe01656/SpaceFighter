// LIB-1B: native-only Social Login protocol; Firebase remains the identity authority.
// Public OAuth client identifiers (not Firebase Admin keys / app secrets).
export const GOOGLE_WEB_CLIENT_ID = '528039759292-052m13c4bffv1t5vskvdvmjdl9n23gb8.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = '528039759292-pag6tj2v0h9omdlkdh3lfne82ahpvpep.apps.googleusercontent.com';

export async function createAppleNonce(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.getRandomValues !== 'function' || !cryptoApi?.subtle?.digest) {
    throw new Error('APPLE_SECURE_RANDOM_UNAVAILABLE');
  }
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  const rawNonce = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const hashBuffer = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer), byte => byte.toString(16).padStart(2, '0')).join('');
  return { rawNonce, hashedNonce };
}

export function createNativeSocialLoginBridge({ plugin, getPlatform, cryptoApi = globalThis.crypto }) {
  if (!plugin || typeof getPlatform !== 'function') throw new Error('SOCIAL_LOGIN_CONFIGURATION_INVALID');
  let initPromise = null;
  const platform = () => getPlatform();
  const requireNative = (provider) => {
    const current = platform();
    if (current !== 'ios' && current !== 'android') throw new Error('NATIVE_LOGIN_ONLY');
    if (provider === 'apple' && current !== 'ios') throw new Error('APPLE_NATIVE_IOS_ONLY');
    return current;
  };
  const initialize = () => {
    const current = requireNative('google');
    if (!initPromise) {
      initPromise = Promise.resolve().then(() => plugin.initialize({
        google: {
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iOSClientId: GOOGLE_IOS_CLIENT_ID,
          iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
          mode: 'online', // Firebase needs an ID token, not a server auth code.
        },
        ...(current === 'ios' ? { apple: {} } : {}),
      })).catch(error => { initPromise = null; throw error; });
    }
    return initPromise;
  };
  return {
    async googleIdToken() {
      requireNative('google');
      await initialize();
      const response = await plugin.login({ provider: 'google', options: { scopes: ['profile', 'email'] } });
      const result = response?.result;
      if (result?.responseType === 'offline' || typeof result?.idToken !== 'string' || !result.idToken.trim()) {
        throw new Error('GOOGLE_ID_TOKEN_MISSING');
      }
      return result.idToken;
    },
    async appleCredentialData() {
      requireNative('apple');
      await initialize();
      const { rawNonce, hashedNonce } = await createAppleNonce(cryptoApi);
      const response = await plugin.login({
        provider: 'apple',
        options: { scopes: ['email', 'name'], nonce: hashedNonce },
      });
      const result = response?.result;
      if (typeof result?.idToken !== 'string' || !result.idToken.trim()) {
        throw new Error('APPLE_ID_TOKEN_MISSING');
      }
      return {
        idToken: result.idToken,
        rawNonce, // Only send this to Firebase OAuthProvider. Never persist it.
        givenName: result.profile?.givenName || '',
        familyName: result.profile?.familyName || '',
      };
    },
    async logoutAll() {
      const current = platform();
      if (current !== 'ios' && current !== 'android') return;
      // Firebase sign-out is authoritative. Failed native plugin logout must not
      // prevent UI/session cleanup or deletion acknowledgment processing.
      const requests = [{ provider: 'google' }];
      if (current === 'ios') requests.push({ provider: 'apple', clearCachedUserInfo: true });
      await Promise.allSettled(requests.map(options => Promise.resolve().then(() => plugin.logout(options))));
    },
  };
}
