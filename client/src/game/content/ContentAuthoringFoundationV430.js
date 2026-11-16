import {
  CAMPAIGN_CONTENT_REGISTRY_VERSION_V430,
  CAMPAIGN_CONTENT_REGISTRY_V430,
  auditCampaignContentRegistryV430,
} from './CampaignContentRegistryV430.js';
import {
  DUNGEON_CONTENT_REGISTRY_VERSION_V430,
  DUNGEON_CONTENT_REGISTRY_V430,
  auditDungeonContentRegistryV430,
} from './DungeonContentRegistryV430.js';
import {
  CONTENT_QA_MATRIX_VERSION_V430,
  CONTENT_QA_MATRIX_V430,
  auditContentQaMatrixV430,
} from './ContentQaMatrixV430.js';
import { CONTENT_AUTHORING_FOUNDATION_VERSION_V430, freezeDeepV430 } from './ContentRegistryCoreV430.js';
import { CONTENT_RELEASE_GATE_VERSION_V430, auditContentReleaseGateV430 } from './ContentReleaseGateV430.js';
import {
  DUNGEON_ATTACK_RELIABILITY_LOCK_VERSION_V427,
  auditDungeonAttackReliabilityLockV427,
} from '../dungeon/DungeonAttackReliabilityLockV427.js';

export const CONTENT_AUTHORING_FOUNDATION_V430 = freezeDeepV430({
  version: CONTENT_AUTHORING_FOUNDATION_VERSION_V430,
  status: 'production_foundation',
  campaignRegistry: CAMPAIGN_CONTENT_REGISTRY_VERSION_V430,
  dungeonRegistry: DUNGEON_CONTENT_REGISTRY_VERSION_V430,
  qaMatrix: CONTENT_QA_MATRIX_VERSION_V430,
  releaseGate: CONTENT_RELEASE_GATE_VERSION_V430,
  dungeonAttackReliability: DUNGEON_ATTACK_RELIABILITY_LOCK_VERSION_V427,
  policy: {
    staticPacksOnly: true,
    runtimeMutationAllowed: false,
    oldIdsStable: true,
    productionRequiresQaEvidence: true,
    newMechanicsRequireRuntimeCode: true,
  },
});

export function getContentAuthoringSummaryV430() {
  return freezeDeepV430({
    version: CONTENT_AUTHORING_FOUNDATION_V430.version,
    campaignPlanets: Object.keys(CAMPAIGN_CONTENT_REGISTRY_V430.planets).length,
    campaignStages: Object.keys(CAMPAIGN_CONTENT_REGISTRY_V430.stages).length,
    dungeons: Object.keys(DUNGEON_CONTENT_REGISTRY_V430.content).length,
    campaignQaCases: CONTENT_QA_MATRIX_V430.campaign.length,
    dungeonQaCases: CONTENT_QA_MATRIX_V430.dungeons.length,
  });
}

export function auditContentAuthoringFoundationV430() {
  return Object.freeze([
    ...auditDungeonAttackReliabilityLockV427().map(issue => `V427:${issue}`),
    ...auditCampaignContentRegistryV430().map(issue => `CAMPAIGN:${issue}`),
    ...auditDungeonContentRegistryV430().map(issue => `DUNGEON:${issue}`),
    ...auditContentQaMatrixV430().map(issue => `QA:${issue}`),
    ...auditContentReleaseGateV430().map(issue => `RELEASE:${issue}`),
  ]);
}

export function assertContentAuthoringFoundationV430() {
  const issues = auditContentAuthoringFoundationV430();
  if (issues.length) throw new Error(`Content Authoring Foundation V4.3 failed: ${issues.join(', ')}`);
  return CONTENT_AUTHORING_FOUNDATION_V430;
}
