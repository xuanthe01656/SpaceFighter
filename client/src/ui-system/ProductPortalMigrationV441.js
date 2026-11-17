/**
 * Space Fighter V4.4B product Portal migration contract.
 *
 * Presentation metadata only. Authentication, account deletion, attendance,
 * missions, currencies, navigation, persistence and server authority remain in
 * the existing screen/controller layers.
 */
export const PRODUCT_PORTAL_MIGRATION_VERSION_V441 = 'product-portal-migration-v4.4b';

const contract = (role, offlineReady) => Object.freeze({
  role,
  offlineReady: Boolean(offlineReady),
  presentationOnly: true,
});

export const PRODUCT_PORTAL_SCREEN_CONTRACTS_V441 = Object.freeze({
  portal: contract('entry-auth', true),
  campaign_portal: contract('command-home', true),
});

const FALLBACK_PORTAL_CONTRACT_V441 = contract('product-screen', false);

export function resolveProductPortalContractV441(screen) {
  const key = String(screen || '').trim();
  return PRODUCT_PORTAL_SCREEN_CONTRACTS_V441[key] || FALLBACK_PORTAL_CONTRACT_V441;
}

export function auditProductPortalMigrationV441() {
  const issues = [];
  for (const screen of ['portal', 'campaign_portal']) {
    const entry = PRODUCT_PORTAL_SCREEN_CONTRACTS_V441[screen];
    if (!entry) {
      issues.push(`MISSING_PORTAL_CONTRACT:${screen}`);
      continue;
    }
    if (!entry.role) issues.push(`MISSING_PORTAL_ROLE:${screen}`);
    if (entry.presentationOnly !== true) issues.push(`NON_PRESENTATION_PORTAL_CONTRACT:${screen}`);
    if (!Object.isFrozen(entry)) issues.push(`MUTABLE_PORTAL_CONTRACT:${screen}`);
  }
  if (!Object.isFrozen(PRODUCT_PORTAL_SCREEN_CONTRACTS_V441)) {
    issues.push('MUTABLE_PORTAL_CONTRACT_REGISTRY');
  }
  if (resolveProductPortalContractV441('unknown').role !== 'product-screen') {
    issues.push('INVALID_PORTAL_FALLBACK');
  }
  return Object.freeze(issues);
}
