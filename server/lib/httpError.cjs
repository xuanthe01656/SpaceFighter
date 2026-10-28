'use strict';
const { GameError } = require('./economy.cjs');
const { CampaignAlphaC6CError } = require('./combatCampaignAlphaC6CV8.cjs');

// Only token/user-status failures are authentication errors. IAM errors,
// unexpected Firebase outages and misconfiguration remain HTTP 500, so they
// cannot be mistaken for an invalid player token.
const INVALID_ID_TOKEN_CODES = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/argument-error',
  'auth/user-not-found',
]);

function classifyGameApiError(error) {
  // A constrained, expected QA policy denial is NOT an internal server fault.
  // Do not generalize this mapping to other simulator errors.
  if(error instanceof CampaignAlphaC6CError
    && error.code==='ALPHA_C6C_LOADOUT_UNSUPPORTED') {
    return {status:409,code:'ALPHA_C6C_LOADOUT_UNSUPPORTED',
      message:'C12 QA requires Alpha/X-Wing/Rail at level 1 with no auxiliary equipment'};
  }
  if (error instanceof GameError) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status : 500;
    return { status, code: error.code || 'INTERNAL_ERROR', message: status >= 500 ? 'Server error' : error.message };
  }
  if (INVALID_ID_TOKEN_CODES.has(error?.code)) {
    return { status: 401, code: 'UNAUTHORIZED', message: 'Invalid, expired or revoked Firebase ID token' };
  }
  if (error?.code === 'auth/user-disabled') {
    return { status: 403, code: 'ACCOUNT_DISABLED', message: 'Firebase account is disabled' };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Server error' };
}
module.exports = { classifyGameApiError };
