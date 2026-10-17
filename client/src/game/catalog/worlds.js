/**
 * Product catalog: catalog/worlds.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
// ==========================================
// --- CẤU HÌNH THIÊN HÀ (GALAXY MAP) ---
// ==========================================
// Thay đổi trong constants.js
export const PLANET_CONFIG = {
  1: { 
    id: 1, name: { vi: 'Trạm Tiền Tiêu Alpha', en: 'Outpost Alpha' }, 
    envDesc: { vi: 'Bình thường', en: 'Normal' },
    // Versioned combat behavior. Legacy speedDebuff/enemyHpBuff remain for old UI / snapshots.
    battle: {
      playerModifiers: [],
      enemyHpMultiplier: 1.0,
    },
    speedDebuff: 0, enemyHpBuff: 1.0, color: '#2ecc71', icon: '🪐',
    imgSrc: '/images/planet_base.png' // <--- Thêm đường dẫn ảnh
  },
  2: { 
    id: 2, name: { vi: 'Tinh Vân Băng Giá', en: 'Cryo-7 Nebula' }, 
    envDesc: { vi: 'Tốc độ tàu giảm 20%', en: 'Ship speed -20%' },
    // Versioned combat behavior. Legacy speedDebuff/enemyHpBuff remain for old UI / snapshots.
    battle: {
      playerModifiers: [{ id: 'cryo_slow_20', stat: 'speed', op: 'multiply', value: 0.8 }],
      enemyHpMultiplier: 1.5,
    },
    speedDebuff: 0.2, enemyHpBuff: 1.5, color: '#38bdf8', icon: '☄️',
    imgSrc: '/images/planet_ice.png' // <--- Thêm đường dẫn ảnh
  },
  3: { 
    id: 3, name: { vi: 'Hỏa Ngục Prime', en: 'Inferno Prime' }, 
    envDesc: { vi: 'Quái trâu gấp đôi', en: 'Enemy HP x2' },
    // Versioned combat behavior. Legacy speedDebuff/enemyHpBuff remain for old UI / snapshots.
    battle: {
      playerModifiers: [],
      enemyHpMultiplier: 2.0,
    },
    speedDebuff: 0, enemyHpBuff: 2.0, color: '#ff4757', icon: '🔥',
    imgSrc: '/images/planet_fire.png' // <--- Thêm đường dẫn ảnh
  }
};

/// Cấu trúc chuẩn cho 10 ải của MỌI tinh cầu
export const STAGE_CONFIG = {
  1: { waves: 5, baseEnemies: 5, timeLimit: 90, expReward: 100 },      
  2: { waves: 5, baseEnemies: 8, timeLimit: 100, expReward: 150 },     
  3: { waves: 7, baseEnemies: 10, timeLimit: 120, expReward: 250 },
  4: { waves: 7, baseEnemies: 15, timeLimit: 140, expReward: 400 },
  5: { waves: 10, baseEnemies: 20, hasBoss: true, bossType: 'mech', timeLimit: 180, expReward: 800 },
  6: { waves: 8, baseEnemies: 22, timeLimit: 150, expReward: 500 },
  7: { waves: 8, baseEnemies: 25, timeLimit: 160, expReward: 650 },
  8: { waves: 10, baseEnemies: 28, timeLimit: 180, expReward: 900 },
  9: { waves: 12, baseEnemies: 35, timeLimit: 210, expReward: 1200 },
  10: { waves: 15, baseEnemies: 40, hasBoss: true, bossType: 'alien', timeLimit: 240, expReward: 2500 } 
};

// ==========================================
// --- TÊN GỌI RIÊNG CHO TỪNG ẢI (LORE) ---
// ==========================================
export const PLANET_STAGE_NAMES = {
  1: { // Trạm Tiền Tiêu Alpha
    1: { vi: 'Vành Đai Phế Liệu', en: 'Debris Belt' },
    2: { vi: 'Trạm Thu Phát Rìa', en: 'Outer Relay Station' },
    3: { vi: 'Khu Mỏ Cũ', en: 'Abandoned Mines' },
    4: { vi: 'Hành Lang Giao Tranh', en: 'Conflict Corridor' },
    5: { vi: 'Cổng Phòng Thủ Chóp', en: 'Vanguard Gate' },
    6: { vi: 'Vùng Phân Tán', en: 'Scattering Zone' },
    7: { vi: 'Căn Cứ Tiền Phương', en: 'Forward Base' },
    8: { vi: 'Lò Phản Ứng Phụ', en: 'Sub-Reactor' },
    9: { vi: 'Hành Lang Lõi', en: 'Core Pathway' },
    10: { vi: 'Trạm Chỉ Huy Alpha', en: 'Alpha Command Center' }
  },
  2: { // Tinh Vân Băng Giá
    1: { vi: 'Biển Băng Trôi', en: 'Drifting Ice Sea' },
    2: { vi: 'Bão Tuyết Ion', en: 'Ion Blizzard' },
    3: { vi: 'Núi Băng Lục Giác', en: 'Hex-Glacier' },
    4: { vi: 'Khe Nứt Lạnh Lẽo', en: 'Freezing Rift' },
    5: { vi: 'Cổng Băng Vĩnh Cửu', en: 'Permafrost Gate' },
    6: { vi: 'Nghĩa Địa Phi Thuyền', en: 'Frozen Shipyard' },
    7: { vi: 'Trạm Nghiên Cứu Băng', en: 'Cryo-Lab' },
    8: { vi: 'Mỏ Pha Lê Sâu', en: 'Deep Crystal Mines' },
    9: { vi: 'Tâm Bão Tinh Vân', en: 'Eye of the Nebula' },
    10: { vi: 'Lõi Băng Cực Đại', en: 'Absolute Zero Core' }
  },
  3: { // Hỏa Ngục Prime
    1: { vi: 'Sông Dung Nham', en: 'Magma River' },
    2: { vi: 'Biển Lửa Plasma', en: 'Plasma Fire Sea' },
    3: { vi: 'Đầm Lầy Lưu Huỳnh', en: 'Sulfur Swamps' },
    4: { vi: 'Vách Đá Cháy', en: 'Burning Cliffs' },
    5: { vi: 'Cổng Hỏa Ngục', en: 'Inferno Gate' },
    6: { vi: 'Cột Tro Bụi', en: 'Ash Pillars' },
    7: { vi: 'Lò Rèn Hắc Ám', en: 'Dark Forge' },
    8: { vi: 'Hành Lang Nhiệt Cháy', en: 'Thermal Corridor' },
    9: { vi: 'Tâm Trái Đất Đỏ', en: 'Red Core Center' },
    10: { vi: 'Lò Phản Ứng Hủy Diệt', en: 'Doomsday Reactor' }
  }
};

// ==========================================
// --- CẤU HÌNH QUÁI VẬT & TRÙM THEO TINH CẦU ---
// ==========================================
export const PLANET_ENEMIES = {
  // Quái của Tinh cầu 1 (Trạm Tiền Tiêu Alpha)
  1: [
    { id: 'p1_small', tier: 1, baseHp: 30, speedMin: 50, speedMax: 150, score: 1, imgSrc: '' }, 
    { id: 'p1_medium', tier: 2, baseHp: 90, speedMin: 40, speedMax: 120, score: 3, imgSrc: '' },
    { id: 'p1_large', tier: 3, baseHp: 240, speedMin: 30, speedMax: 90, score: 6, imgSrc: '' },
    { id: 'p1_kami', tier: 4, baseHp: 60, speedMin: 250, speedMax: 400, score: 4, imgSrc: '' }
  ],
  // Quái của Tinh cầu 2 (Tinh Vân Băng Giá)
  2: [
    { id: 'p2_small', tier: 1, baseHp: 50, speedMin: 40, speedMax: 100, score: 2, imgSrc: '' },
    { id: 'p2_medium', tier: 2, baseHp: 150, speedMin: 30, speedMax: 90, score: 4, imgSrc: '' },
    { id: 'p2_large', tier: 3, baseHp: 400, speedMin: 20, speedMax: 70, score: 8, imgSrc: '' },
    { id: 'p2_kami', tier: 4, baseHp: 100, speedMin: 200, speedMax: 300, score: 5, imgSrc: '' }
  ],
  // Quái của Tinh cầu 3 (Hỏa Ngục Prime)
  3: [
    { id: 'p3_small', tier: 1, baseHp: 80, speedMin: 60, speedMax: 160, score: 3, imgSrc: '' },
    { id: 'p3_medium', tier: 2, baseHp: 220, speedMin: 50, speedMax: 130, score: 6, imgSrc: '' },
    { id: 'p3_large', tier: 3, baseHp: 600, speedMin: 40, speedMax: 100, score: 12, imgSrc: '' },
    { id: 'p3_kami', tier: 4, baseHp: 150, speedMin: 300, speedMax: 500, score: 8, imgSrc: '' }
  ]
};

export const PLANET_BOSSES = {
  1: {
    mech: { id: 'p1_boss_mech', baseHp: 25000, scale: 1.5, hitboxW: 80, score: 100, imgSrc: '' },
    alien: { id: 'p1_boss_alien', baseHp: 80000, scale: 1.8, hitboxW: 100, score: 100, imgSrc: '' }
  },
  2: {
    mech: { id: 'p2_boss_ice', baseHp: 45000, scale: 1.6, hitboxW: 90, score: 200, imgSrc: '' },
    alien: { id: 'p2_boss_dragon', baseHp: 120000, scale: 2.0, hitboxW: 120, score: 250, imgSrc: '' }
  },
  3: {
    mech: { id: 'p3_boss_fire', baseHp: 75000, scale: 1.7, hitboxW: 95, score: 300, imgSrc: '' },
    alien: { id: 'p3_boss_demon', baseHp: 200000, scale: 2.2, hitboxW: 140, score: 400, imgSrc: '' }
  }
};

// ==========================================
// --- HỆ THỐNG PHÓ BẢN (DUNGEONS) ---
// ==========================================
export const DUNGEON_CONFIG = [
  {
    id: 'dung_taurus',
    battle: { playerModifiers: [] }, // enemy difficulty is independent of player stats
    type: 'resource',
    difficulty: 1,
    title: { vi: 'VÀNH ĐAI TAURUS', en: 'TAURUS BELT' },
    subtitle: { vi: 'Khai thác Tài Nguyên', en: 'Resource Extraction' },
    desc: { vi: 'Tiêu diệt hải tặc vũ trụ để đoạt lại khoáng sản. Địch đông, giáp mỏng.', en: 'Destroy space pirates to reclaim minerals. High enemy count, low armor.' },
    boss: { vi: 'Mũi Khoan Gỉ Sét', en: 'The Rusty Driller' },
    bgImg: '/images/dungeon_taurus.jpg',
    themeColor: '#4ade80',
    energyCost: 10,
    waves: 5, 
    openDays: [1, 3, 5, 0], 
    rewards: [
      { type: 'coins', amountStr: '10K - 50K' }
    ]
  },
  {
    id: 'dung_nereus',
    battle: { playerModifiers: [] }, // enemy difficulty is independent of player stats
    type: 'gear',
    difficulty: 2,
    title: { vi: 'LÕI TRẠM NEREUS', en: 'NEREUS CORE' },
    subtitle: { vi: 'Đột kích Công nghệ', en: 'Tech Raid' },
    desc: { vi: 'Vượt qua hệ thống phòng vệ A.I dày đặc khiên năng lượng để lấy bản thiết kế.', en: 'Breach A.I defenses with energy shields to secure blueprints.' },
    boss: { vi: 'Mắt Thần Oracle', en: 'The Oracle Core' },
    bgImg: '/images/dungeon_nereus.jpg',
    themeColor: '#38bdf8', 
    energyCost: 15,
    waves: 7,
    openDays: [2, 4, 6, 0], 
    rewards: [
      { type: 'blueprints', amountStr: '1 - 5' },
      { type: 'gears', amountStr: '20 - 50' }
    ]
  },
  {
    id: 'dung_abaddon',
    battle: { playerModifiers: [] }, // enemy difficulty is independent of player stats
    type: 'survival',
    difficulty: 3,
    title: { vi: 'HỐ ĐEN ABADDON', en: 'ABADDON ANOMALY' },
    subtitle: { vi: 'Thử thách Sinh tồn', en: 'Survival Challenge' },
    desc: { vi: 'Sống sót giữa khe nứt không-thời gian và sinh vật lai tạp. Độ khó cực độ.', en: 'Survive the space-time rift and biomech swarms. Extreme difficulty.' },
    boss: { vi: 'Sinh Vật Lai Leviathan', en: 'Biomech Leviathan' },
    bgImg: '/images/dungeon_abaddon.jpg',
    themeColor: '#ff4757', // Đỏ
    energyCost: 20,
    waves: 10,
    openDays: [0, 6],
    rewards: [
      { type: 'diamonds', amountStr: '50 - 200' },
      { type: 'gears', amountStr: '100 - 300' }
    ]
  }
];
