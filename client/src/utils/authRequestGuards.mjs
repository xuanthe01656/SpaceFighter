// Bind pending game commands to the Firebase account and auth generation that
// initiated them. Never apply old account responses to a new account's gsRef.
import { isCurrentAuthAttempt } from './authSessionGuards.mjs';

export class AuthStateChangedError extends Error {
  constructor() {
    super('The signed-in account changed. Please try again.');
    this.name = 'AuthStateChangedError';
    this.code = 'AUTH_STATE_CHANGED';
  }
}

export function assertSameAuthUser(expectedUid, actualUid) {
  if (!expectedUid || expectedUid !== actualUid) throw new AuthStateChangedError();
}

export async function runAuthBoundOperation({
  expectedUid, expectedAttempt, getCurrentUid, getCurrentAttempt, request, apply
}) {
  const ensureCurrent = () => {
    if (!isCurrentAuthAttempt(expectedAttempt, getCurrentAttempt(), expectedUid, getCurrentUid())) {
      throw new AuthStateChangedError();
    }
  };
  ensureCurrent();
  const result = await request();
  ensureCurrent();
  return apply ? apply(result) : result;
}

export async function retrySameAuthUser({ expectedUid, getCurrentUid, request, shouldRetry }) {
  try {
    return await request();
  } catch (error) {
    if (!shouldRetry(error)) throw error;
    assertSameAuthUser(expectedUid, getCurrentUid());
    return request();
  }
}
