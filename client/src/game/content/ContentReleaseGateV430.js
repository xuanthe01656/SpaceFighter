import { CAMPAIGN_CONTENT_REGISTRY_V430 } from './CampaignContentRegistryV430.js';
import { DUNGEON_CONTENT_REGISTRY_V430 } from './DungeonContentRegistryV430.js';
import { freezeDeepV430 } from './ContentRegistryCoreV430.js';

export const CONTENT_RELEASE_GATE_VERSION_V430 = 'content-release-gate-v4.3.0';

const requiredEvidence = Object.freeze([
  'catalogValidated',
  'assetsValidated',
  'localizationValidated',
  'webQaPassed',
  'mobileQaPassed',
  'balanceEvidencePassed',
  'regressionPassed',
]);

export function evaluateContentReleaseGateV430({
  kind,
  id,
  evidence = {},
} = {}) {
  const normalizedKind = kind === 'campaign' ? 'campaign' : kind === 'dungeon' ? 'dungeon' : null;
  const metadata = normalizedKind === 'campaign'
    ? CAMPAIGN_CONTENT_REGISTRY_V430.meta[id]
    : normalizedKind === 'dungeon'
      ? DUNGEON_CONTENT_REGISTRY_V430.meta[id]
      : null;
  const reasons = [];
  if (!normalizedKind) reasons.push('UNKNOWN_CONTENT_KIND');
  if (!metadata) reasons.push('UNKNOWN_CONTENT_ID');
  if (metadata?.releaseState !== 'production') reasons.push('NOT_PRODUCTION_RELEASE_STATE');
  for (const key of requiredEvidence) {
    if (evidence[key] !== true) reasons.push(`EVIDENCE_REQUIRED:${key}`);
  }
  return freezeDeepV430({
    version: CONTENT_RELEASE_GATE_VERSION_V430,
    kind: normalizedKind,
    id: id || null,
    releaseState: metadata?.releaseState || 'unknown',
    approved: reasons.length === 0,
    reasons,
  });
}

export function auditContentReleaseGateV430() {
  const issues = [];
  const denied = evaluateContentReleaseGateV430({ kind: 'dungeon', id: 'dung_nereus', evidence: {} });
  if (denied.approved || !denied.reasons.includes('NOT_PRODUCTION_RELEASE_STATE')) issues.push('QA_CANDIDATE_AUTO_APPROVED');
  const production = Object.entries(CAMPAIGN_CONTENT_REGISTRY_V430.meta)
    .find(([, meta]) => meta.releaseState === 'production');
  if (production) {
    const approved = evaluateContentReleaseGateV430({
      kind: 'campaign',
      id: Number(production[0]),
      evidence: Object.fromEntries(requiredEvidence.map(key => [key, true])),
    });
    if (!approved.approved) issues.push('PRODUCTION_EVIDENCE_GATE_UNREACHABLE');
  }
  return Object.freeze(issues);
}
