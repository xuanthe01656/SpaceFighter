import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTENT_AUTHORING_FOUNDATION_V430,
  assertContentAuthoringFoundationV430,
  auditContentAuthoringFoundationV430,
  getContentAuthoringSummaryV430,
} from '../src/game/content/ContentAuthoringFoundationV430.js';
import {
  CAMPAIGN_CONTENT_REGISTRY_V430,
  auditCampaignContentRegistryV430,
  buildCampaignContentRegistryV430,
} from '../src/game/content/CampaignContentRegistryV430.js';
import {
  DUNGEON_CONTENT_CATALOG_V430,
  DUNGEON_CONTENT_REGISTRY_V430,
  DUNGEON_LISTING_CONFIG_V430,
  auditDungeonContentRegistryV430,
  buildDungeonContentRegistryV430,
} from '../src/game/content/DungeonContentRegistryV430.js';
import {
  auditContentQaMatrixV430,
  buildContentQaMatrixV430,
} from '../src/game/content/ContentQaMatrixV430.js';
import { evaluateContentReleaseGateV430 } from '../src/game/content/ContentReleaseGateV430.js';
import {
  DUNGEON_RUNTIME_PROFILES_V38,
  auditDungeonEncounterCatalogV38,
} from '../src/game/dungeon/DungeonEncounterCatalogV38.js';
import { DUNGEON_QA_PROFILES_V391 } from '../src/game/dungeon/DungeonQaAccessV391.js';
import { PLANET_CONFIG, STAGE_CONFIG, DUNGEON_CONFIG } from '../src/constants.js';

const clone = value => structuredClone(value);

const localizedStages = stageIds => Object.fromEntries(stageIds.map(stageId => [stageId, {
  vi: `Ải thử ${stageId}`,
  en: `Test Stage ${stageId}`,
}]));

const campaignPack = {
  id: 'campaign-v430-test-pack',
  schemaVersion: 1,
  releaseState: 'qa',
  stages: {},
  planets: [{
    id: 4,
    config: {
      id: 4,
      name: { vi: 'Tinh Cầu Thử Nghiệm', en: 'Test Planet' },
      envDesc: { vi: 'QA', en: 'QA' },
      battle: { playerModifiers: [], enemyHpMultiplier: 2.2 },
      speedDebuff: 0,
      enemyHpBuff: 2.2,
      color: '#9b5cff',
      icon: '✦',
      imgSrc: '/images/planet_test.png',
    },
    stageNames: localizedStages(Object.keys(CAMPAIGN_CONTENT_REGISTRY_V430.stages).map(Number)),
    enemies: [
      { id: 'p4_small', tier: 1, baseHp: 100, speedMin: 50, speedMax: 150, score: 4, imgSrc: '' },
      { id: 'p4_medium', tier: 2, baseHp: 250, speedMin: 40, speedMax: 130, score: 8, imgSrc: '' },
      { id: 'p4_large', tier: 3, baseHp: 700, speedMin: 30, speedMax: 100, score: 16, imgSrc: '' },
      { id: 'p4_kami', tier: 4, baseHp: 180, speedMin: 280, speedMax: 480, score: 10, imgSrc: '' },
    ],
    bosses: {
      mech: { id: 'p4_boss_mech', baseHp: 90000, scale: 1.8, hitboxW: 100, score: 400, imgSrc: '' },
      alien: { id: 'p4_boss_alien', baseHp: 240000, scale: 2.3, hitboxW: 150, score: 550, imgSrc: '' },
    },
  }],
};

const makeDungeonPack = () => {
  const base = clone(DUNGEON_CONTENT_CATALOG_V430.dung_taurus);
  const dungeonId = 'dung_v430_test';
  base.id = dungeonId;
  base.status = 'production_candidate';
  base.enabledByDefault = false;
  base.qaReady = true;
  base.difficultyRank = 4;
  base.theme = 'test_sector';
  base.productionProfile = {
    ...base.productionProfile,
    operation: { vi: 'QA MỞ RỘNG', en: 'EXTENSION QA' },
    recommendedPower: 10000,
    defaultQaLoadoutPresetId: 'fortress_mk4',
  };
  base.visualSet = {
    enemyByRole: {
      raider: `${dungeonId}_scout`, gunner: `${dungeonId}_scout`, charger: `${dungeonId}_elite`,
      shieldbearer: `${dungeonId}_heavy`, support: `${dungeonId}_elite`, artillery: `${dungeonId}_heavy`,
    },
    enemyAssets: [
      { id: `${dungeonId}_scout`, role: 'scout', size: 2.3 },
      { id: `${dungeonId}_heavy`, role: 'heavy', size: 3.0 },
      { id: `${dungeonId}_elite`, role: 'elite', size: 2.6 },
    ],
    requiredEnemyAssetIds: [`${dungeonId}_scout`, `${dungeonId}_heavy`, `${dungeonId}_elite`],
    bossAssetId: `${dungeonId}_boss`,
    bossAsset: { id: `${dungeonId}_boss`, role: 'boss', size: 5.8 },
  };
  base.presentation = {
    palette: { accent: '#9b5cff' },
    backdrop: { style: 'test_sector' },
    boss: { fallbackStyle: 'test_core' },
  };
  base.rooms = base.rooms.map((room, index) => ({
    ...room,
    id: `v430_test_room_${index + 1}`,
    ...(room.boss ? {
      boss: {
        ...room.boss,
        id: 'v430_test_boss',
        dungeonId,
        visualAssetId: `${dungeonId}_boss`,
        displayName: { vi: 'LÕI THỬ NGHIỆM', en: 'TEST CORE' },
      },
    } : {}),
  }));
  base.runStructure = {
    ...base.runStructure,
    entryRoomId: base.rooms[0].id,
    bossRoomId: base.rooms.at(-1).id,
  };
  return {
    id: 'dungeon-v430-test-pack',
    schemaVersion: 1,
    releaseState: 'qa',
    content: base,
    listing: {
      id: dungeonId,
      battle: { playerModifiers: [] },
      type: 'qa',
      difficulty: 4,
      title: { vi: 'PHÓ BẢN THỬ NGHIỆM', en: 'TEST DUNGEON' },
      subtitle: { vi: 'Kiểm tra pack', en: 'Pack validation' },
      desc: { vi: 'Nội dung thử schema V4.3.', en: 'V4.3 schema test content.' },
      boss: { vi: 'Lõi Thử Nghiệm', en: 'Test Core' },
      bgImg: '/images/dungeon_test.jpg',
      themeColor: '#9b5cff',
      energyCost: 25,
      waves: 99,
      openDays: [0],
      rewards: [],
    },
  };
};

test('V4.2.7 is closed and V4.3 foundation is audit-clean', () => {
  assert.equal(CONTENT_AUTHORING_FOUNDATION_V430.version, 'content-authoring-foundation-v4.3.0');
  assert.equal(CONTENT_AUTHORING_FOUNDATION_V430.status, 'production_foundation');
  assert.deepEqual(auditContentAuthoringFoundationV430(), []);
  assert.equal(assertContentAuthoringFoundationV430(), CONTENT_AUTHORING_FOUNDATION_V430);
  assert.deepEqual(getContentAuthoringSummaryV430(), {
    version: 'content-authoring-foundation-v4.3.0',
    campaignPlanets: 3,
    campaignStages: 10,
    dungeons: 3,
    campaignQaCases: 30,
    dungeonQaCases: 18,
  });
});

test('compatibility facades consume V4.3 registries without changing stable IDs', () => {
  assert.equal(PLANET_CONFIG, CAMPAIGN_CONTENT_REGISTRY_V430.planets);
  assert.equal(STAGE_CONFIG, CAMPAIGN_CONTENT_REGISTRY_V430.stages);
  assert.equal(DUNGEON_CONFIG, DUNGEON_LISTING_CONFIG_V430);
  assert.deepEqual(Object.keys(DUNGEON_RUNTIME_PROFILES_V38), Object.keys(DUNGEON_CONTENT_CATALOG_V430));
  assert.deepEqual(auditDungeonEncounterCatalogV38(), []);
  assert.deepEqual(Object.keys(DUNGEON_QA_PROFILES_V391), Object.keys(DUNGEON_CONTENT_CATALOG_V430));
  assert.deepEqual(DUNGEON_LISTING_CONFIG_V430.map(row => row.waves), [5, 5, 5]);
});

test('a new Campaign planet using existing mechanics is data-only and auto-generates QA coverage', () => {
  const registry = buildCampaignContentRegistryV430({ packs: [campaignPack] });
  assert.deepEqual(auditCampaignContentRegistryV430(registry), []);
  assert.equal(registry.planets[4].releaseState, 'qa');
  const matrix = buildContentQaMatrixV430({ campaignRegistry: registry });
  assert.equal(matrix.campaign.filter(row => row.planetId === 4).length, 10);
  assert.equal(matrix.campaign.find(row => row.id === 'campaign:p4:s10')?.boss, true);
});

test('a new Dungeon using existing room mechanics is one pack and auto-generates full/direct-room QA', () => {
  const registry = buildDungeonContentRegistryV430({ packs: [makeDungeonPack()] });
  assert.deepEqual(auditDungeonContentRegistryV430(registry), []);
  const added = registry.content.dung_v430_test;
  assert.equal(added.enabledByDefault, false);
  assert.equal(added.qaReady, true);
  assert.equal(registry.listingById.dung_v430_test.waves, 5);
  const matrix = buildContentQaMatrixV430({ dungeonRegistry: registry });
  assert.deepEqual(auditContentQaMatrixV430(matrix, { dungeonRegistry: registry }), []);
  assert.equal(matrix.dungeons.filter(row => row.dungeonId === 'dung_v430_test').length, 6);
});

test('duplicate IDs and incomplete extension presentation fail closed', () => {
  const duplicateCampaign = buildCampaignContentRegistryV430({
    packs: [{ ...campaignPack, id: 'duplicate', planets: [{ ...campaignPack.planets[0], id: 1 }] }],
  });
  assert.ok(auditCampaignContentRegistryV430(duplicateCampaign).some(issue => issue.startsWith('CAMPAIGN_PLANET_DUPLICATE')));

  const brokenPack = makeDungeonPack();
  delete brokenPack.content.presentation;
  const brokenDungeon = buildDungeonContentRegistryV430({ packs: [brokenPack] });
  assert.ok(auditDungeonContentRegistryV430(brokenDungeon).includes('DUNGEON_EXTENSION_PRESENTATION:dung_v430_test'));
});

test('release gate cannot auto-promote QA content and requires all production evidence', () => {
  const qaDenied = evaluateContentReleaseGateV430({ kind: 'dungeon', id: 'dung_nereus', evidence: {} });
  assert.equal(qaDenied.approved, false);
  assert.ok(qaDenied.reasons.includes('NOT_PRODUCTION_RELEASE_STATE'));

  const evidence = {
    catalogValidated: true,
    assetsValidated: true,
    localizationValidated: true,
    webQaPassed: true,
    mobileQaPassed: true,
    balanceEvidencePassed: true,
    regressionPassed: true,
  };
  const productionApproved = evaluateContentReleaseGateV430({ kind: 'campaign', id: 1, evidence });
  assert.equal(productionApproved.approved, true);
});
