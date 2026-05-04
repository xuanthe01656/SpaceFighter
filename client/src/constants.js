// src/constants.js
// ==========================================
// --- TỪ ĐIỂN DỮ LIỆU: CHẾ ĐỘ CHIẾN DỊCH ---
// ==========================================
export const PILOTS = [
  { 
    id: 'pilot_alpha', 
    name: { vi: 'Astro Alpha', en: 'Astro Alpha' }, 
    rarity: 1, 
    skillDesc: { vi: 'Tăng 10% sát thương súng chính.', en: 'Increases main gun damage by 10%.' },
    imgSrc: '/images/pilots/pilot_alpha.png',
    passive: 'main_damage_boost',
    value: 0.10,
    description: { vi: 'Tăng sát thương súng chính', en: 'Main gun damage boost' }
  },
  { 
    id: 'pilot_bear', 
    name: { vi: 'Gấu Cuồng Nộ', en: 'Furious Bear' }, 
    rarity: 3, 
    skillDesc: { vi: 'Hồi 1% máu mỗi giây.', en: 'Regenerates 1% HP per second.' },
    imgSrc: '/images/pilots/pilot_bear.png',
    passive: 'hp_regen',
    value: 0.01,                    // 1% mỗi giây
    description: { vi: 'Hồi phục HP theo thời gian', en: 'Passive HP regeneration' }
  },
  { 
    id: 'pilot_fox', 
    name: { vi: 'Cáo Không Gian', en: 'Space Fox' }, 
    rarity: 4, 
    skillDesc: { vi: 'Tăng 20% tốc độ bắn súng phụ.', en: 'Increases wingman fire rate by 20%.' },
    imgSrc: '/images/pilots/pilot_fox.png',
    passive: 'wing_fire_rate',
    value: 0.20,
    description: { vi: 'Tăng tốc độ bắn wingman', en: 'Wingman fire rate boost' }
  },
  { 
    id: 'pilot_ghost', 
    name: { vi: 'Bóng Ma Sigma', en: 'Phantom Sigma' }, 
    rarity: 5, 
    skillDesc: { vi: 'Né đạn 15% và tăng 25% sát thương chí mạng.', en: '15% dodge + 25% crit damage.' },
    imgSrc: '/images/pilots/pilot_ghost.png',
    passive: 'dodge_and_crit',
    value: { dodge: 0.15, critDamage: 0.25 },
    description: { vi: 'Tăng né đạn và sát thương chí mạng', en: 'Dodge + Critical damage' }
  },
  { 
    id: 'pilot_nova', 
    name: { vi: 'Nova Burst', en: 'Nova Burst' }, 
    rarity: 4, 
    skillDesc: { vi: 'Khiên nổ gây 800 sát thương khu vực.', en: 'Explosive shield deals 800 AoE damage.' },
    imgSrc: '/images/pilots/pilot_nova.png',
    passive: 'nova_shield',
    value: 800,
    description: { vi: 'Khiên nổ gây sát thương diện rộng', en: 'Explosive shield on damage taken' }
  },
  { 
    id: 'pilot_viper', 
    name: { vi: 'Rắn Độc Viper', en: 'Viper Striker' }, 
    rarity: 2, 
    skillDesc: { vi: 'Tăng 30% tốc độ di chuyển.', en: 'Increases movement speed by 30%.' },
    imgSrc: '/images/pilots/pilot_viper.png',
    passive: 'movement_speed',
    value: 0.30,
    description: { vi: 'Tăng tốc độ di chuyển', en: 'Movement speed boost' }
  },
  { 
    id: 'pilot_titan', 
    name: { vi: 'Titan Thép', en: 'Steel Titan' }, 
    rarity: 3, 
    skillDesc: { vi: 'Giảm 25% sát thương nhận vào.', en: 'Reduces incoming damage by 25%.' },
    imgSrc: '/images/pilots/pilot_titan.png',
    passive: 'damage_reduction',
    value: 0.25,
    description: { vi: 'Giảm sát thương nhận vào', en: 'Damage reduction' }
  },
  { 
    id: 'pilot_echo', 
    name: { vi: 'Echo Phantom', en: 'Echo Phantom' }, 
    rarity: 5, 
    skillDesc: { vi: 'Nhân bản đạn 1 lần mỗi 8 giây.', en: 'Duplicates one bullet every 8 seconds.' },
    imgSrc: '/images/pilots/pilot_echo.png',
    passive: 'bullet_duplicate',
    value: { interval: 8000, count: 1 },
    description: { vi: 'Nhân bản đạn định kỳ', en: 'Periodic bullet duplication' }
  },
];
export const AIRCRAFTS = [
  // ==================== TIER 1 - CƠ BẢN ====================
  {
    id: 'ship_xwing',
    name: { vi: 'Tiêm Kích X-Wing', en: 'X-Wing Fighter' },
    tier: 1,
    role: 'fighter',
    baseHp: 1050,
    baseArmor: 20,
    baseAtk: 55,
    speed: 6.0,
    imgHq: '/images/ships/ship_xwing_hq.png',
    imgTop: '/images/ships/ship_xwing_top.png',
    imgSrc: '/images/ships/ship_xwing_hq.png',
    hitboxScale: 0.78,
    engineFlameScale: 1.0,
    engineFlameTint: 0x38bdf8,
    trailEnabled: true,
    passive: null,
    description: { vi: 'Phi cơ cân bằng, phù hợp người mới', en: 'Balanced starter fighter' }
  },
  {
    id: 'ship_scout',
    name: { vi: 'Scout Recon', en: 'Scout Recon' },
    tier: 1,
    role: 'scout',
    baseHp: 780,
    baseArmor: 12,
    baseAtk: 48,
    speed: 7.5,
    imgHq: '/images/ships/scout_hq.png',
    imgTop: '/images/ships/scout_top.png',
    imgSrc: '/images/ships/scout_hq.png',
    hitboxScale: 0.65,
    engineFlameScale: 0.9,
    engineFlameTint: 0x00ffcc,
    trailEnabled: true,
    passive: 'scout_speed',
    passiveValue: 0.15,
    description: { vi: 'Phi cơ trinh sát nhanh nhẹ', en: 'Fast reconnaissance scout' }
  },
  {
    id: 'ship_tank',
    name: { vi: 'Pháo Đài Bay', en: 'Flying Fortress' },
    tier: 1,
    role: 'tank',
    baseHp: 2600,
    baseArmor: 55,
    baseAtk: 35,
    speed: 3.3,
    imgHq: '/images/ships/tank_hq.png',
    imgTop: '/images/ships/tank_top.png',
    imgSrc: '/images/ships/tank_hq.png',
    hitboxScale: 1.18,
    engineFlameScale: 1.45,
    engineFlameTint: 0xff9500,
    trailEnabled: false,
    passive: 'damage_reduction',
    passiveValue: 0.20,
    description: { vi: 'Phi cơ bọc thép siêu bền', en: 'Heavy armored fortress' }
  },
  // ==================== TIER 2 - NÂNG CAO ====================
  {
    id: 'ship_phantom',
    name: { vi: 'Bóng Ma', en: 'Phantom Stealth' },
    tier: 2,
    role: 'stealth',
    baseHp: 950,
    baseArmor: 18,
    baseAtk: 88,
    speed: 8.0,
    imgHq: '/images/ships/phantom_hq.png',
    imgTop: '/images/ships/phantom_top.png',
    imgSrc: '/images/ships/phantom_hq.png',
    hitboxScale: 0.68,
    engineFlameScale: 0.85,
    engineFlameTint: 0x9b59b6,
    trailEnabled: true,
    passive: 'stealth',
    passiveValue: 0.16,
    description: { vi: 'Phi cơ tàng hình tốc độ cao', en: 'Stealth high-speed interceptor' }
  },
  {
    id: 'ship_void',
    name: { vi: 'Hư Không Destroyer', en: 'Void Destroyer' },
    tier: 2,
    role: 'destroyer',
    baseHp: 1950,
    baseArmor: 30,
    baseAtk: 75,
    speed: 5.0,
    imgHq: '/images/ships/void_hq.png',
    imgTop: '/images/ships/void_top.png',
    imgSrc: '/images/ships/void_hq.png',
    hitboxScale: 0.95,
    engineFlameScale: 1.25,
    engineFlameTint: 0x8e44ad,
    trailEnabled: true,
    passive: 'void_energy',
    passiveValue: 0.20,
    description: { vi: 'Phi cơ sử dụng năng lượng hư không', en: 'Void energy destroyer' }
  },
  {
    id: 'ship_nebula',
    name: { vi: 'Tinh Vân Cruiser', en: 'Nebula Cruiser' },
    tier: 2,
    role: 'cruiser',
    baseHp: 2350,
    baseArmor: 35,
    baseAtk: 58,
    speed: 5.4,
    imgHq: '/images/ships/nebula_hq.png',
    imgTop: '/images/ships/nebula_top.png',
    imgSrc: '/images/ships/nebula_hq.png',
    hitboxScale: 1.05,
    engineFlameScale: 1.12,
    engineFlameTint: 0x00e5ff,
    trailEnabled: true,
    passive: 'long_range',
    passiveValue: 1.30,
    description: { vi: 'Phi cơ hỗ trợ tầm xa', en: 'Long-range support cruiser' }
  },
  {
    id: 'ship_raptor',
    name: { vi: 'Raptor Assault', en: 'Raptor Assault' },
    tier: 2,
    role: 'assault',
    baseHp: 1150,
    baseArmor: 22,
    baseAtk: 108,
    speed: 8.7,
    imgHq: '/images/ships/raptor_hq.png',
    imgTop: '/images/ships/raptor_top.png',
    imgSrc: '/images/ships/raptor_hq.png',
    hitboxScale: 0.72,
    engineFlameScale: 0.98,
    engineFlameTint: 0xf1c40f,
    trailEnabled: true,
    passive: 'assault_boost',
    passiveValue: 0.25,
    description: { vi: 'Phi cơ tấn công nhanh và mạnh', en: 'High-speed assault fighter' }
  },
  // ==================== TIER 3 - ELITE ====================
  {
    id: 'ship_spectre',
    name: { vi: 'Spectre Interceptor', en: 'Spectre Interceptor' },
    tier: 3,
    role: 'interceptor',
    baseHp: 1300,
    baseArmor: 25,
    baseAtk: 125,
    speed: 10.0,
    imgHq: '/images/ships/spectre_hq.png',
    imgTop: '/images/ships/spectre_top.png',
    imgSrc: '/images/ships/spectre_hq.png',
    hitboxScale: 0.62,
    engineFlameScale: 0.85,
    engineFlameTint: 0x00ffcc,
    trailEnabled: true,
    passive: 'evasion',
    passiveValue: 0.22,
    description: { vi: 'Phi cơ đánh chặn siêu tốc', en: 'Ultra-fast evasion interceptor' }
  },
  {
    id: 'ship_storm',
    name: { vi: 'Storm Bringer', en: 'Storm Bringer' },
    tier: 3,
    role: 'destroyer',
    baseHp: 1700,
    baseArmor: 32,
    baseAtk: 92,
    speed: 6.8,
    imgHq: '/images/ships/storm_hq.png',
    imgTop: '/images/ships/storm_top.png',
    imgSrc: '/images/ships/storm_hq.png',
    hitboxScale: 0.88,
    engineFlameScale: 1.35,
    engineFlameTint: 0x74b9ff,
    trailEnabled: true,
    passive: 'area_damage',
    passiveValue: 0.28,
    description: { vi: 'Phi cơ gây sát thương diện rộng', en: 'Area damage storm ship' }
  },
  {
    id: 'ship_leviathan',
    name: { vi: 'Leviathan Dreadnought', en: 'Leviathan Dreadnought' },
    tier: 3,
    role: 'dreadnought',
    baseHp: 3550,
    baseArmor: 65,
    baseAtk: 52,
    speed: 3.0,
    imgHq: '/images/ships/leviathan_hq.png',
    imgTop: '/images/ships/leviathan_top.png',
    imgSrc: '/images/ships/leviathan_hq.png',
    hitboxScale: 1.30,
    engineFlameScale: 1.70,
    engineFlameTint: 0xff4757,
    trailEnabled: false,
    passive: 'heavy_armor',
    passiveValue: 0.35,
    description: { vi: 'Siêu phi cơ hạng nặng', en: 'Massive heavy dreadnought' }
  },
  {
    id: 'ship_vortex',
    name: { vi: 'Vortex Pulser', en: 'Vortex Pulser' },
    tier: 3,
    role: 'special',
    baseHp: 1480,
    baseArmor: 28,
    baseAtk: 98,
    speed: 7.2,
    imgHq: '/images/ships/vortex_hq.png',
    imgTop: '/images/ships/vortex_top.png',
    imgSrc: '/images/ships/vortex_hq.png',
    hitboxScale: 0.78,
    engineFlameScale: 1.18,
    engineFlameTint: 0xfd79a8,
    trailEnabled: true,
    passive: 'pull_enemies',
    passiveValue: 140,
    description: { vi: 'Phi cơ tạo lực hút kẻ địch', en: 'Enemy-pulling vortex ship' }
  },
  // ==================== TIER 4 - LEGENDARY ====================
  {
    id: 'ship_nova',
    name: { vi: 'Nova Sovereign', en: 'Nova Sovereign' },
    tier: 4,
    role: 'legendary',
    baseHp: 2250,
    baseArmor: 40,
    baseAtk: 140,
    speed: 9.0,
    imgHq: '/images/ships/nova_hq.png',
    imgTop: '/images/ships/nova_top.png',
    imgSrc: '/images/ships/nova_hq.png',
    hitboxScale: 0.82,
    engineFlameScale: 1.45,
    engineFlameTint: 0xffff00,
    trailEnabled: true,
    passive: 'nova_burst',
    passiveValue: 1400,
    description: { vi: 'Phi cơ huyền thoại gây nổ lớn', en: 'Legendary nova burst ship' }
  },
  {
    id: 'ship_eternal',
    name: { vi: 'Eternal Guardian', en: 'Eternal Guardian' },
    tier: 4,
    role: 'tank',
    baseHp: 4100,
    baseArmor: 80,
    baseAtk: 70,
    speed: 3.8,
    imgHq: '/images/ships/eternal_hq.png',
    imgTop: '/images/ships/eternal_top.png',
    imgSrc: '/images/ships/eternal_hq.png',
    hitboxScale: 1.38,
    engineFlameScale: 1.85,
    engineFlameTint: 0x2ecc71,
    trailEnabled: false,
    passive: 'regeneration',
    passiveValue: 0.028,
    description: { vi: 'Phi cơ bất diệt hồi phục mạnh', en: 'Immortal regenerating guardian' }
  },
  {
    id: 'ship_abyss',
    name: { vi: 'Abyss Reaper', en: 'Abyss Reaper' },
    tier: 4,
    role: 'assault',
    baseHp: 1750,
    baseArmor: 35,
    baseAtk: 165,
    speed: 10.8,
    imgHq: '/images/ships/abyss_hq.png',
    imgTop: '/images/ships/abyss_top.png',
    imgSrc: '/images/ships/abyss_hq.png',
    hitboxScale: 0.60,
    engineFlameScale: 0.78,
    engineFlameTint: 0x6c5ce7,
    trailEnabled: true,
    passive: 'crit_master',
    passiveValue: 0.42,
    description: { vi: 'Phi cơ tối thượng sát thương chí mạng', en: 'Ultimate critical damage reaper' }
  },
  {
    id: 'ship_titanforge',
    name: { vi: 'Titan Forge', en: 'Titan Forge' },
    tier: 4,
    role: 'dreadnought',
    baseHp: 4800,
    baseArmor: 95,
    baseAtk: 85,
    speed: 2.7,
    imgHq: '/images/ships/titanforge_hq.png',
    imgTop: '/images/ships/titanforge_top.png',
    imgSrc: '/images/ships/titanforge_hq.png',
    hitboxScale: 1.48,
    engineFlameScale: 2.1,
    engineFlameTint: 0xe17055,
    trailEnabled: false,
    passive: 'armor_master',
    passiveValue: 0.48,
    description: { vi: 'Phi cơ bất khả xâm phạm', en: 'Unbreakable titan-class ship' }
  },
  {
    id: 'ship_celestial',
    name: { vi: 'Celestial Dominion', en: 'Celestial Dominion' },
    tier: 4,
    role: 'legendary',
    baseHp: 2950,
    baseArmor: 50,
    baseAtk: 118,
    speed: 7.2,
    imgHq: '/images/ships/celestial_hq.png',
    imgTop: '/images/ships/celestial_top.png',
    imgSrc: '/images/ships/celestial_hq.png',
    hitboxScale: 0.95,
    engineFlameScale: 1.40,
    engineFlameTint: 0xfff200,
    trailEnabled: true,
    passive: 'divine_aura',
    passiveValue: 0.35,
    description: { vi: 'Phi cơ thiên thể tối thượng', en: 'Divine celestial flagship' }
  }
];
export const GEAR_CATALOG = {
  mainGun: [
    { 
      id: 'gun_laser',
      name: { vi: 'Súng Laser Liên Tục', en: 'Continuous Laser Beam' },
      baseAtk: 18,
      fireRate: 0.35,
      imgSrc: '/images/weapons/gun_laser.png',
      firePattern: 'beam',
      projectileType: 'laser',
      color: 0x38bdf8,
      description: { vi: 'Tia laser liên tục dễ kiểm soát', en: 'Steady continuous energy beam' }
    },
    { 
      id: 'gun_plasma',
      name: { vi: 'Pháo Plasma', en: 'Plasma Cannon' },
      baseAtk: 35,
      fireRate: 1.1,
      imgSrc: '/images/weapons/gun_plasma.png',
      firePattern: 'single',
      projectileType: 'plasma',
      color: 0x9b59b6,
      description: { vi: 'Đạn plasma gây sát thương cao nhưng bắn chậm', en: 'Powerful slow plasma projectile' }
    },
    { 
      id: 'gun_spread',
      name: { vi: 'Súng Bắn Tỏa', en: 'Spread Gun' },
      baseAtk: 22,
      fireRate: 0.7,
      imgSrc: '/images/weapons/gun_spread.png',
      firePattern: 'spread3',
      projectileType: 'laser',
      color: 0x00e5ff,
      description: { vi: 'Bắn chùm 3 đạn tỏa rộng', en: '3-way spread shot' }
    },
    { 
      id: 'gun_rail',
      name: { vi: 'Railgun Xuyên Thấu', en: 'Piercing Railgun' },
      baseAtk: 48,
      fireRate: 0.25,
      imgSrc: '/images/weapons/gun_rail.png',
      firePattern: 'pierce',
      projectileType: 'rail',
      color: 0xffffff,
      description: { vi: 'Đạn xuyên nhiều mục tiêu tốc độ cực cao', en: 'High-penetration piercing shot' }
    },
    { 
      id: 'gun_pulse',
      name: { vi: 'Súng Xung Pulse', en: 'Pulse Blaster' },
      baseAtk: 26,
      fireRate: 1.6,
      imgSrc: '/images/weapons/gun_pulse.png',
      firePattern: 'burst',
      projectileType: 'pulse',
      color: 0x74b9ff,
      description: { vi: 'Bắn nhanh nhiều xung năng lượng', en: 'Rapid energy pulse shots' }
    },
    { 
      id: 'gun_ion',
      name: { vi: 'Pháo Ion', en: 'Ion Cannon' },
      baseAtk: 30,
      fireRate: 0.85,
      imgSrc: '/images/weapons/gun_ion.png',
      firePattern: 'single',
      projectileType: 'ion',
      color: 0x74b9ff,
      description: { vi: 'Gây hiệu ứng làm chậm kẻ địch', en: 'Slows down enemies on hit' }
    },
    { 
      id: 'gun_neutron',
      name: { vi: 'Neutron Blaster', en: 'Neutron Blaster' },
      baseAtk: 55,
      fireRate: 0.6,
      imgSrc: '/images/weapons/gun_neutron.png',
      firePattern: 'explosive',
      projectileType: 'neutron',
      color: 0xfd79a8,
      description: { vi: 'Sát thương cao kèm hiệu ứng nổ nhỏ', en: 'High damage with area explosion' }
    },
    { 
      id: 'gun_photon',
      name: { vi: 'Photon Shredder', en: 'Photon Shredder' },
      baseAtk: 42,
      fireRate: 1.1,
      imgSrc: '/images/weapons/gun_photon.png',
      firePattern: 'spread5',
      projectileType: 'photon',
      color: 0xf1c40f,
      description: { vi: 'Bắn 5 tia photon nhỏ nhanh', en: '5-way fast photon shards' }
    },
    // ==================== FIRE PATTERN MỚI ====================
    { 
      id: 'gun_wave',
      name: { vi: 'Súng Sóng Sine', en: 'Wave Oscillator' },
      baseAtk: 24,
      fireRate: 0.8,
      imgSrc: '/images/weapons/gun_wave.png',
      firePattern: 'wave',
      projectileType: 'laser',
      color: 0x00ffcc,
      description: { vi: 'Đạn bay theo hình sóng sin', en: 'Sinusoidal wave projectiles' }
    },
    { 
      id: 'gun_homing',
      name: { vi: 'Laser Tự Hướng', en: 'Homing Laser' },
      baseAtk: 28,
      fireRate: 0.9,
      imgSrc: '/images/weapons/gun_homing.png',
      firePattern: 'homing',
      projectileType: 'laser',
      color: 0xff66ff,
      description: { vi: 'Laser tự dẫn hướng vào kẻ địch', en: 'Homing laser beam' }
    },
    { 
      id: 'gun_shotgun',
      name: { vi: 'Súng Shotgun Plasma', en: 'Plasma Shotgun' },
      baseAtk: 20,
      fireRate: 1.3,
      imgSrc: '/images/weapons/gun_shotgun.png',
      firePattern: 'shotgun',
      projectileType: 'plasma',
      color: 0xffaa00,
      description: { vi: 'Bắn chùm đạn phân tán rộng', en: 'Wide shotgun-style blast' }
    },
    { 
      id: 'gun_charge',
      name: { vi: 'Pháo Tích Tụ', en: 'Charge Cannon' },
      baseAtk: 60,
      fireRate: 2.2,                    // fireRate lớn vì cần giữ nút bắn
      imgSrc: '/images/weapons/gun_charge.png',
      firePattern: 'charge',
      projectileType: 'charge',
      color: 0xffff00,
      description: { vi: 'Càng giữ càng mạnh (tích tụ)', en: 'Hold to charge - more damage' }
    }
  ],
  wingman: [
    { 
      id: 'wing_missile',
      name: { vi: 'Tên Lửa Cổ Điển', en: 'Classic Missile' },
      baseAtk: 10,
      imgSrc: '/images/weapons/rocket_1.png',
      behavior: 'homing',
      fireRate: 900,
      color: 0xffffff,
      description: { vi: 'Tên lửa dẫn đường cơ bản', en: 'Basic homing missile' }
    },
    { 
      id: 'wing_laser',
      name: { vi: 'Tên Lửa Hắc Ám', en: 'Dark Missile' },
      baseAtk: 15,
      imgSrc: '/images/weapons/rocket_2.png',
      behavior: 'homing',
      fireRate: 850,
      color: 0x8e44ad,
      description: { vi: 'Tên lửa dẫn đường sát thương cao', en: 'High damage homing missile' }
    },
    { 
      id: 'wing_homing',
      name: { vi: 'Tên Lửa Tự Hướng', en: 'Homing Swarm' },
      baseAtk: 22,
      imgSrc: '/images/weapons/wing_homing.png',
      behavior: 'homing',
      fireRate: 750,
      color: 0xffa502,
      description: { vi: 'Tên lửa dẫn đường theo đàn', en: 'Swarm homing missiles' }
    },
    { 
      id: 'wing_torpedo',
      name: { vi: 'Ngư Lôi Không Gian', en: 'Void Torpedo' },
      baseAtk: 18,
      imgSrc: '/images/weapons/wing_torpedo.png',
      behavior: 'straight',
      fireRate: 1100,
      color: 0x2ecc71,
      description: { vi: 'Ngư lôi bay thẳng sát thương lớn', en: 'Powerful straight torpedo' }
    },
    { 
      id: 'wing_dronelet',
      name: { vi: 'Mini Drone Wingman', en: 'Drone Escort' },
      baseAtk: 12,
      imgSrc: '/images/weapons/wing_dronelet.png',
      behavior: 'swarm',
      fireRate: 950,
      color: 0x00e5ff,
      description: { vi: 'Triệu hồi mini drone hỗ trợ', en: 'Summons mini escort drones' }
    },
    { 
      id: 'wing_emp',
      name: { vi: 'EMP Rocket', en: 'EMP Rocket' },
      baseAtk: 8,
      imgSrc: '/images/weapons/wing_emp.png',
      behavior: 'emp',
      fireRate: 1400,
      color: 0x9b59b6,
      description: { vi: 'Tên lửa gây hiệu ứng EMP', en: 'EMP disruption rocket' }
    },
  ],
  armor: [
    { 
      id: 'armor_light',
      name: { vi: 'Giáp Nhẹ', en: 'Light Armor' },
      baseHp: 500,
      imgSrc: '/images/armor/armor_light.png',
      passive: 'none',
      description: { vi: 'Giáp nhẹ, tăng HP cơ bản', en: 'Basic armor - increases HP' }
    },
    { 
      id: 'armor_heavy',
      name: { vi: 'Giáp Hợp Kim', en: 'Heavy Alloy Armor' },
      baseHp: 1500,
      imgSrc: '/images/armor/armor_heavy.png',
      passive: 'none',
      description: { vi: 'Giáp nặng, tăng HP lớn', en: 'Heavy armor - high HP' }
    },
    { 
      id: 'armor_shield',
      name: { vi: 'Khiên Năng Lượng', en: 'Energy Shield' },
      baseHp: 800,
      imgSrc: '/images/armor/armor_shield.png',
      passive: 'shield',
      description: { vi: 'Tạo khiên năng lượng bảo vệ', en: 'Generates protective energy shield' }
    },
    { 
      id: 'armor_reactive',
      name: { vi: 'Giáp Phản Ứng', en: 'Reactive Plating' },
      baseHp: 1200,
      imgSrc: '/images/armor/armor_reactive.png',
      passive: 'reactive',
      description: { vi: 'Phản đạn khi bị bắn trúng', en: 'Reacts when hit by projectiles' }
    },
    { 
      id: 'armor_nano',
      name: { vi: 'Giáp Nano Tự Hồi', en: 'Nano-Regen Armor' },
      baseHp: 900,
      imgSrc: '/images/armor/armor_nano.png',
      passive: 'regen',
      description: { vi: 'Tự động hồi phục giáp theo thời gian', en: 'Slowly regenerates armor' }
    },
    { 
      id: 'armor_void',
      name: { vi: 'Giáp Hư Không', en: 'Void Barrier' },
      baseHp: 2000,
      imgSrc: '/images/armor/armor_void.png',
      passive: 'void',
      description: { vi: 'Khiên hư không giảm sát thương mạnh', en: 'Strong void barrier' }
    },
    { 
      id: 'armor_crystal',
      name: { vi: 'Giáp Tinh Thể', en: 'Crystal Plating' },
      baseHp: 1100,
      imgSrc: '/images/armor/armor_crystal.png',
      passive: 'crystal',
      description: { vi: 'Giáp tinh thể phản chiếu một phần sát thương', en: 'Reflects some damage' }
    },
  ],
  drone: [
    { 
      id: 'drone_sniper',
      name: { vi: 'Vệ Tinh Bắn Tỉa', en: 'Sniper Drone' },
      baseAtk: 25,
      imgSrc: '/images/drone/drone_sniper.png',
      behavior: 'sniper',
      fireRate: 1200,
      projectileType: 'laser',
      color: 0x2ecc71,
      description: { vi: 'Bắn đạn tỉa chính xác vào kẻ địch', en: 'Precise sniper shots' }
    },
    { 
      id: 'drone_shield',
      name: { vi: 'Vệ Tinh Hộ Thể', en: 'Guardian Drone' },
      baseAtk: 10,
      imgSrc: '/images/drone/drone_shield.png',
      behavior: 'shield',
      fireRate: 0,
      color: 0x00e5ff,
      description: { vi: 'Tạo khiên bảo vệ', en: 'Generates protective shield' }
    },
    { 
      id: 'drone_bomber',
      name: { vi: 'Vệ Tinh Thả Bom', en: 'Bomber Drone' },
      baseAtk: 35,
      imgSrc: '/images/drone/drone_bomber.png',
      behavior: 'bomber',
      fireRate: 1800,
      projectileType: 'bomb',
      color: 0xe74c3c,
      description: { vi: 'Thả bom gây sát thương diện rộng', en: 'Drops area damage bombs' }
    },
    { 
      id: 'drone_repair',
      name: { vi: 'Vệ Tinh Sửa Chữa', en: 'Repair Drone' },
      baseAtk: 5,
      imgSrc: '/images/drone/drone_repair.png',
      behavior: 'repair',
      fireRate: 3000,
      color: 0x2ecc71,
      description: { vi: 'Hồi phục HP cho phi cơ', en: 'Repairs player HP' }
    },
    { 
      id: 'drone_emp',
      name: { vi: 'Vệ Tinh EMP', en: 'EMP Disruptor' },
      baseAtk: 15,
      imgSrc: '/images/drone/drone_emp.png',
      behavior: 'emp',
      fireRate: 2500,
      projectileType: 'emp',
      color: 0x9b59b6,
      description: { vi: 'Gây hiệu ứng EMP làm chậm kẻ địch', en: 'EMP stun/slow enemies' }
    },
    { 
      id: 'drone_laser',
      name: { vi: 'Vệ Tinh Laser', en: 'Laser Drone' },
      baseAtk: 28,
      imgSrc: '/images/drone/drone_laser.png',
      behavior: 'laser',
      fireRate: 450,
      projectileType: 'laser',
      color: 0x00e5ff,
      description: { vi: 'Bắn tia laser liên tục', en: 'Continuous laser beam' }
    },
    { 
      id: 'drone_swarm',
      name: { vi: 'Đàn Drone Mini', en: 'Swarm Drones' },
      baseAtk: 18,
      imgSrc: '/images/drone/drone_swarm.png',
      behavior: 'swarm',
      fireRate: 800,
      projectileType: 'swarm',
      color: 0xf1c40f,
      description: { vi: 'Bắn nhiều đạn nhỏ nhanh', en: 'Rapid small projectiles' }
    },
  ]
};
// ==========================================
// --- CẤU HÌNH KINH TẾ & GACHA (SHOP & KHO) ---
// ==========================================

export const AIRCRAFT_PRICE = { 
  1: { cost: 800,   currency: 'coins' }, 
  2: { cost: 4000,  currency: 'coins' }, 
  3: { cost: 12000, currency: 'coins' }, 
  4: { cost: 100,   currency: 'diamonds' } 
};

export const PILOT_PRICE = { 
  1: { cost: 10,  currency: 'diamonds' }, 
  2: { cost: 20,  currency: 'diamonds' }, 
  3: { cost: 40,  currency: 'diamonds' }, 
  4: { cost: 80,  currency: 'diamonds' }, 
  5: { cost: 150, currency: 'diamonds' } 
};

export const GEAR_PRICE = { cost: 1000, currency: 'coins' };

export const CRATE_CONFIGS = [
  { id: 'basic',       shopType: 'crate', rarity: 1, icon: '📦', title: { vi: 'HÒM CƠ BẢN', en: 'STANDARD CRATE' }, desc: { vi: 'Trang bị tàn tích. Rớt đồ Trắng, Lục, Lam.', en: 'Salvaged parts.' }, cost: 100, currency: 'coins', dropRates: { 1: 50, 2: 35, 3: 12, 4: 3, 5: 0 } },
  { id: 'premium',     shopType: 'crate', rarity: 3, icon: '🔮', title: { vi: 'HÒM CAO CẤP', en: 'PREMIUM CRATE' }, desc: { vi: 'Công nghệ quân sự. Đảm bảo Lục+. Có tỷ lệ Vàng!', en: 'Military tech.' }, cost: 500, currency: 'coins', dropRates: { 1: 0, 2: 40, 3: 40, 4: 15, 5: 5 } },
  { id: 'epic',        shopType: 'crate', rarity: 5, icon: '👑', title: { vi: 'HÒM HUYỀN THOẠI', en: 'EPIC CACHE' }, desc: { vi: 'Tinh hoa vũ trụ. Chỉ rớt Lam, Tím, Vàng.', en: 'Galactic apex.' }, cost: 50, currency: 'diamonds', dropRates: { 1: 0, 2: 0, 3: 50, 4: 35, 5: 15 } },
  { id: 'pilot_gacha', shopType: 'crate', rarity: 4, icon: '📡', title: { vi: 'VÉ TUYỂN MỘ', en: 'RECRUIT TICKET' }, desc: { vi: 'Phát tín hiệu triệu hồi phi công ngẫu nhiên.', en: 'Broadcast SOS.' }, cost: 30, currency: 'diamonds', dropRates: { 1: 30, 2: 28, 3: 22, 4: 14, 5: 6 } },
];
// ==========================================
// --- CẤU HÌNH THIÊN HÀ (GALAXY MAP) ---
// ==========================================
// Thay đổi trong constants.js
export const PLANET_CONFIG = {
  1: { 
    id: 1, name: { vi: 'Trạm Tiền Tiêu Alpha', en: 'Outpost Alpha' }, 
    envDesc: { vi: 'Bình thường', en: 'Normal' },
    speedDebuff: 0, enemyHpBuff: 1.0, color: '#2ecc71', icon: '🪐',
    imgSrc: '/images/planet_base.png' // <--- Thêm đường dẫn ảnh
  },
  2: { 
    id: 2, name: { vi: 'Tinh Vân Băng Giá', en: 'Cryo-7 Nebula' }, 
    envDesc: { vi: 'Tốc độ tàu giảm 20%', en: 'Ship speed -20%' },
    speedDebuff: 0.2, enemyHpBuff: 1.5, color: '#38bdf8', icon: '☄️',
    imgSrc: '/images/planet_ice.png' // <--- Thêm đường dẫn ảnh
  },
  3: { 
    id: 3, name: { vi: 'Hỏa Ngục Prime', en: 'Inferno Prime' }, 
    envDesc: { vi: 'Quái trâu gấp đôi', en: 'Enemy HP x2' },
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
// --- DỮ LIỆU TÂN THỦ MẶC ĐỊNH (NEW PLAYER TEMPLATE) ---
// ==========================================
export const DEFAULT_CAMPAIGN_DATA = {
  progress: { currentStage: 1, highestStage: 1, combatPower: 1200,exp: 0 },
  loadout: { pilot: "pilot_alpha", aircraft: "ship_xwing", mainGun: "item_start_gun", wingman: "", armor: "", drone: "" },
  ownedPilots: { "pilot_alpha": { level: 1, stars: 1 } },
  ownedAircrafts: { "ship_xwing": { level: 1, stars: 1 } },
  items: { "item_start_gun": { baseId: "gun_laser", rarity: 1, level: 1, type: "mainGun" } },
  materials: { gears: 0, blueprints: 0 },
  hasClaimedFirstTopup: false,
};
export const FIRST_TOPUP_REWARD = {
  aircraftId: 'ship_nova',
  gems: 888,
  coins: 38383
};
// ==========================================
// --- ĐƯỜNG CONG KINH NGHIỆM VÀ VIP (CURVES) ---
// ==========================================

// Hàm lấy mốc tính toán dựa trên mảng
const calculateLevelData = (totalPoints, reqArray) => {
  let level = 1;
  let accumulated = 0;
  for (let i = 0; i < reqArray.length; i++) {
    if (totalPoints >= accumulated + reqArray[i]) {
      accumulated += reqArray[i];
      level++;
    } else { break; }
  }
  const isMaxLevel = level > reqArray.length;
  const currentPointsInLevel = isMaxLevel ? reqArray[reqArray.length - 1] : totalPoints - accumulated;
  const pointsNeeded = isMaxLevel ? reqArray[reqArray.length - 1] : reqArray[level - 1];
  const percent = isMaxLevel ? 100 : Math.min((currentPointsInLevel / pointsNeeded) * 100, 100);

  return { level, currentPoints: currentPointsInLevel, maxPointsForNext: pointsNeeded, percent, isMaxLevel };
};

export const calculatePlayerLevel = (exp = 0) => {
  // Điểm cần thiết để LÊN CẤP TIẾP THEO (Càng lên cao càng dốc)
  // Vd: Lv1 lên Lv2 cần 500. Lv2 lên Lv3 cần 1000...
  const EXP_REQUIREMENTS = [500, 1000, 1800, 3000, 5000, 8500, 14000, 22000, 35000, 50000];
  const data = calculateLevelData(exp, EXP_REQUIREMENTS);
  return { level: data.level, currentExp: data.currentPoints, maxExpForNextLevel: data.maxPointsForNext, percent: data.percent, isMax: data.isMaxLevel };
};

export const calculateVIPLevel = (vipPoints = 0) => {
  // Điểm nạp cần thiết để lên VIP tiếp theo
  // Vd: Vip0 lên Vip1 cần 500. Vip1 lên Vip2 cần 1500 (tổng nạp 2000)...
  const VIP_REQUIREMENTS = [500, 1500, 3000, 5000, 10000, 20000, 50000];
  const data = calculateLevelData(vipPoints, VIP_REQUIREMENTS);
  return { level: data.level - 1, currentPoints: data.currentPoints, maxPointsForNext: data.maxPointsForNext, percent: data.percent, isMax: data.isMaxLevel }; // VIP bắt đầu từ 0
};
// ==========================================
// --- CẤU HÌNH GÓI NẠP KIM CƯƠNG (TOP-UP) ---
// ==========================================
export const TOPUP_PACKAGES = [
  {
    id: 'pack_first_topup',
    gems: 0, 
    price: { vi: '19,000đ', en: '$0.99' },
    bonus: 0,
    isFirstTopup: true
  },
  { 
    id: 'pack_100_gems', 
    gems: 100, 
    price: { vi: '22,000đ', en: '$0.99' }, 
    bonus: 0 
  },
  { 
    id: 'pack_500_gems', 
    gems: 500, 
    price: { vi: '109,000đ', en: '$4.99' }, 
    bonus: 50 
  },
  { 
    id: 'pack_1200_gems', 
    gems: 1200, 
    price: { vi: '219,000đ', en: '$9.99' }, 
    bonus: 200 
  },
  { 
    id: 'pack_3000_gems', 
    gems: 3000, 
    price: { vi: '499,000đ', en: '$19.99' }, 
    bonus: 800 
  },
];
// ==========================================
// --- HỆ THỐNG CHỈ THỊ (MISSIONS) ---
// ==========================================
export const MISSIONS_CONFIG = {
  daily: [
    { id: 'd_login', title: { vi: 'Điểm Danh Hàng Ngày', en: 'Daily Check-in' }, desc: { vi: 'Đăng nhập vào trạm không gian', en: 'Log into the space station' }, goal: 1, reward: { type: 'energy', amount: 20 }, targetScreen: 'attendance' }, // attendance sẽ làm sau
    { id: 'd_play_3', title: { vi: 'Tuần Tra Khu Vực', en: 'Sector Patrol' }, desc: { vi: 'Tham gia 3 trận chiến dịch', en: 'Play 3 campaign battles' }, goal: 3, reward: { type: 'coins', amount: 5000 }, targetScreen: 'galaxy_map' },
    { id: 'd_kill_50', title: { vi: 'Càn Quét Tàn Dư', en: 'Sweep the Remnants' }, desc: { vi: 'Tiêu diệt 50 kẻ địch', en: 'Destroy 50 enemies' }, goal: 50, reward: { type: 'gems', amount: 10 }, targetScreen: 'galaxy_map' }
  ],
  weekly: [
    { id: 'w_login_5', title: { vi: 'Sĩ Quan Cần Mẫn', en: 'Diligent Officer' }, desc: { vi: 'Đăng nhập 5 ngày trong tuần', en: 'Log in 5 days a week' }, goal: 5, reward: { type: 'diamonds', amount: 50 }, targetScreen: 'attendance' },
    { id: 'w_boss_3', title: { vi: 'Săn Tiền Thưởng', en: 'Bounty Hunter' }, desc: { vi: 'Tiêu diệt 3 Boss Tinh cầu', en: 'Defeat 3 Planetary Bosses' }, goal: 3, reward: { type: 'gears', amount: 100 }, targetScreen: 'galaxy_map' },
    { id: 'w_spend_coins', title: { vi: 'Kích Cầu Kinh Tế', en: 'Economic Stimulus' }, desc: { vi: 'Tiêu hao 50.000 Xu', en: 'Spend 50,000 Coins' }, goal: 50000, reward: { type: 'blueprints', amount: 5 }, targetScreen: 'shop_campaign' }
  ],
  monthly: [
    { id: 'm_clear_planet', title: { vi: 'Chinh Phục Tinh Cầu', en: 'Planet Conqueror' }, desc: { vi: 'Vượt qua 30 ải chiến dịch', en: 'Clear 30 campaign stages' }, goal: 30, reward: { type: 'diamonds', amount: 300 }, targetScreen: 'galaxy_map' },
    { id: 'm_pull_gacha', title: { vi: 'Đầu Tư Công Nghệ', en: 'Tech Investor' }, desc: { vi: 'Mở hòm tiếp tế 50 lần', en: 'Open 50 supply crates' }, goal: 50, reward: { type: 'gears', amount: 1000 }, targetScreen: 'shop_campaign' }
  ]
};
  export const PIPE_DIST_DESKTOP = 250;
  export const PIPE_DIST_MOBILE = 200;
  export const MAX_Y_DIFF = 180;