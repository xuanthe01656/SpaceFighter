/**
 * Explicit runtime gate for the Guest Combat V2 QA lab.
 *
 * Browser QA remains DEV-only. A production-mode Vite build may enable the
 * lab only for the manual, local-only Android staging QA channel. Cloud play,
 * authenticated users, release-candidate builds and Game API builds are
 * always rejected.
 */

const enabled = value => value === true || value === 'true' || value === '1';

export function isGuestCombatQaRuntimeEnabled({
  isDev = false,
  guestAbilitiesQa = false,
  mobileQaBuild = false,
  buildChannel = '',
  gameApiEnabled = false,
  authenticated = false,
  cloudBattle = false,
} = {}) {
  if (authenticated || cloudBattle || !enabled(guestAbilitiesQa)) return false;
  if (isDev === true) return true;
  return enabled(mobileQaBuild)
    && String(buildChannel || '') === 'staging-qa'
    && !enabled(gameApiEnabled);
}

export function resolveGuestCombatQaRuntimeFromViteEnv(env = {}, context = {}) {
  return isGuestCombatQaRuntimeEnabled({
    isDev: env.DEV === true,
    guestAbilitiesQa: env.VITE_SF_GUEST_ABILITIES_QA,
    mobileQaBuild: env.VITE_SF_GUEST_COMBAT_V2_QA,
    buildChannel: env.VITE_SF_BUILD_CHANNEL,
    gameApiEnabled: env.VITE_GAME_API_ENABLED,
    authenticated: Boolean(context.authenticated),
    cloudBattle: Boolean(context.cloudBattle),
  });
}
