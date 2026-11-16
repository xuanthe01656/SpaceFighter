export const CAMPAIGN_PLANET_4_PACK_V430 = Object.freeze({
  id: 'campaign-planet-4',
  schemaVersion: 1,
  releaseState: 'qa',
  stages: {}, // chỉ thêm stage ID mới; không ghi đè stage hiện hữu
  planets: [{
    id: 4,
    config: {
      id: 4,
      name: { vi: 'TÊN TINH CẦU', en: 'PLANET NAME' },
      envDesc: { vi: 'Mô tả', en: 'Description' },
      battle: { playerModifiers: [], enemyHpMultiplier: 2.2 },
      speedDebuff: 0,
      enemyHpBuff: 2.2,
      color: '#9b5cff',
      icon: '✦',
      imgSrc: '/images/planet_4.png',
    },
    stageNames: {
      1: { vi: 'Ải 1', en: 'Stage 1' },
      // khai báo đủ mọi stage ID trong registry
    },
    enemies: [
      { id: 'p4_small', tier: 1, baseHp: 100, speedMin: 50, speedMax: 150, score: 4, imgSrc: '' },
    ],
    bosses: {
      mech: { id: 'p4_boss_mech', baseHp: 90000, scale: 1.8, hitboxW: 100, score: 400, imgSrc: '' },
      alien: { id: 'p4_boss_alien', baseHp: 240000, scale: 2.3, hitboxW: 150, score: 550, imgSrc: '' },
    },
  }],
});
