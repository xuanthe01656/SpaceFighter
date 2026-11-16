import { CAMPAIGN_CONTENT_REGISTRY_V430 } from './CampaignContentRegistryV430.js';
import { DUNGEON_CONTENT_REGISTRY_V430 } from './DungeonContentRegistryV430.js';
import { freezeDeepV430 } from './ContentRegistryCoreV430.js';

export const CONTENT_QA_MATRIX_VERSION_V430 = 'content-qa-matrix-v4.3.0';

const sortedNumericIds = record => Object.keys(record || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);

export function buildContentQaMatrixV430({
  campaignRegistry = CAMPAIGN_CONTENT_REGISTRY_V430,
  dungeonRegistry = DUNGEON_CONTENT_REGISTRY_V430,
} = {}) {
  const campaign = [];
  const planetIds = sortedNumericIds(campaignRegistry.planets)
    .filter(id => campaignRegistry.meta[id]?.releaseState !== 'disabled');
  const stageIds = sortedNumericIds(campaignRegistry.stages);
  for (const planetId of planetIds) {
    for (const stageId of stageIds) {
      const stage = campaignRegistry.stages[stageId];
      campaign.push({
        id: `campaign:p${planetId}:s${stageId}`,
        kind: 'campaign_stage',
        planetId,
        stageId,
        boss: Boolean(stage?.hasBoss),
        releaseState: campaignRegistry.meta[planetId]?.releaseState || 'disabled',
        query: `?sfQaPlanet=${planetId}&sfQaStage=${stageId}`,
      });
    }
  }

  const dungeons = [];
  for (const profile of Object.values(dungeonRegistry.content || {})) {
    if (!profile?.qaReady || dungeonRegistry.meta[profile.id]?.releaseState === 'disabled') continue;
    const dungeonId = profile.id;
    const releaseState = dungeonRegistry.meta[dungeonId]?.releaseState || 'disabled';
    dungeons.push({
      id: `dungeon:${dungeonId}:full`,
      kind: 'dungeon_full_run',
      dungeonId,
      roomId: null,
      releaseState,
      query: `?sfDungeonQa=1&sfDungeon=${encodeURIComponent(dungeonId)}`,
    });
    for (const room of profile.rooms || []) {
      dungeons.push({
        id: `dungeon:${dungeonId}:${room.id}`,
        kind: 'dungeon_direct_room',
        dungeonId,
        roomId: room.id,
        roomKind: room.templateId,
        releaseState,
        query: `?sfDungeonQa=1&sfDungeon=${encodeURIComponent(dungeonId)}&sfDungeonRoom=${encodeURIComponent(room.id)}`,
      });
    }
  }
  return freezeDeepV430({ version: CONTENT_QA_MATRIX_VERSION_V430, campaign, dungeons });
}

export const CONTENT_QA_MATRIX_V430 = buildContentQaMatrixV430();

export function auditContentQaMatrixV430(matrix = CONTENT_QA_MATRIX_V430, {
  dungeonRegistry = DUNGEON_CONTENT_REGISTRY_V430,
} = {}) {
  const issues = [];
  const all = [...matrix.campaign, ...matrix.dungeons];
  const ids = new Set();
  for (const row of all) {
    if (ids.has(row.id)) issues.push(`QA_DUPLICATE:${row.id}`);
    ids.add(row.id);
    if (!row.query?.startsWith('?')) issues.push(`QA_QUERY:${row.id}`);
    if (!['production', 'qa', 'disabled'].includes(row.releaseState)) issues.push(`QA_RELEASE:${row.id}`);
  }
  for (const profile of Object.values(dungeonRegistry.content || {})) {
    if (!profile?.qaReady || dungeonRegistry.meta[profile.id]?.releaseState === 'disabled') continue;
    const expected = 1 + (profile.rooms?.length || 0);
    const actual = matrix.dungeons.filter(row => row.dungeonId === profile.id).length;
    if (actual !== expected) issues.push(`QA_DUNGEON_COVERAGE:${profile.id}:${actual}/${expected}`);
  }
  return Object.freeze(issues);
}
