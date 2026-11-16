export const DUNGEON_EXAMPLE_PACK_V430 = Object.freeze({
  id: 'dungeon-example-pack',
  schemaVersion: 1,
  releaseState: 'qa',
  content: {
    schemaVersion: 1,
    contentVersion: 'authoring-v4.3.0',
    id: 'dung_example',
    status: 'production_candidate',
    enabledByDefault: false,
    qaReady: true,
    difficultyRank: 4,
    theme: 'example_theme',
    tags: ['example'],
    productionProfile: {
      operation: { vi: 'CHIẾN DỊCH MẪU', en: 'EXAMPLE OPERATION' },
      combatIdentity: { vi: 'Mô tả combat', en: 'Combat identity' },
      recommendedPower: 10000,
      defaultQaLoadoutPresetId: 'fortress_mk4',
      validationFocus: ['room_flow', 'boss_patterns'],
    },
    runStructure: {
      mode: 'linear', minimumRooms: 5, maximumRooms: 8, recommendedRooms: 5,
      entryRoomId: 'example_entry', bossRoomId: 'example_boss',
    },
    visualSet: {
      enemyByRole: {}, enemyAssets: [], requiredEnemyAssetIds: [],
      bossAssetId: 'dung_example_boss',
      bossAsset: { id: 'dung_example_boss', role: 'boss', size: 5.8 },
    },
    presentation: {
      palette: { accent: '#9b5cff' },
      backdrop: { style: 'example_theme' },
      boss: { fallbackStyle: 'example_core' },
    },
    enemyStats: {
      baseHp: 190, baseSpeed: .05, hpMultiplier: 1.35, damageMultiplier: 1.30,
      speedMultiplier: 1.08, projectileSpeedMultiplier: 1.16, fireCooldownMultiplier: .84,
    },
    rooms: [
      // room definitions using existing templateId + encounterPackId
    ],
  },
  listing: {
    id: 'dung_example',
    battle: { playerModifiers: [] },
    type: 'example',
    difficulty: 4,
    title: { vi: 'PHÓ BẢN MẪU', en: 'EXAMPLE DUNGEON' },
    subtitle: { vi: 'Mô tả ngắn', en: 'Short description' },
    desc: { vi: 'Mô tả đầy đủ.', en: 'Full description.' },
    boss: { vi: 'Trùm Mẫu', en: 'Example Boss' },
    bgImg: '/images/dungeon_example.jpg',
    themeColor: '#9b5cff',
    energyCost: 25,
    openDays: [0],
    rewards: [],
  },
});
