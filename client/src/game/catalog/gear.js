/**
 * Product catalog: catalog/gear.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
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
      description: { vi: 'Tự tích tụ năng lượng và bắn đạn mạnh theo chu kỳ', en: 'Automatically charges and fires a stronger shot each cycle' }
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
      name: { vi: 'Pháo Bầy Đàn', en: 'Swarm Cannon' },
      baseAtk: 12,
      imgSrc: '/images/weapons/wing_dronelet.png',
      modelSrc: '/models/weapons/swarm_cannon.glb',
      modelBytes: 60708556, // Measured source size; do not auto-load in normal gameplay
      modelScale: 0.4,     // GLB size Z=0.978 * 0.4 ≈ 0.39 units – vừa đầu cánh
      modelRotation: { x: 0, y: 0, z: 0 },
      behavior: 'swarm',
      fireRate: 950,
      color: 0x00e5ff,
      description: { vi: 'Bắn loạt đạn nhỏ theo đàn từ 2 cánh', en: 'Fires swarm of small shots from both wings' }
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
