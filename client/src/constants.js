// src/constants.js
export const SKINS = [
  { id: 'classic', name: { vi: 'Mèo Sầu Bi', en: 'Sad Cat' }, color: '#FFD700', imgAlive: '/images/cat_alive.png', imgDead: '/images/cat_dead.png', price: 0 },
  { id: 'dog', name: { vi: 'Cún Tinh Nghịch', en: 'Playful Dog' }, color: '#FFD700', imgAlive: '/images/dog_alive.png', imgDead: '/images/dog_dead.png', price: 0 },
  { id: 'evilFly', name: { vi: 'Ruồi Vui Vẻ', en: 'Happy Fly' }, color: '#FFD700', imgAlive: '/images/evil_fly_alive.png', imgDead: '/images/evil_fly_dead.png', price: 300 },
  { id: 'ufo', name: { vi: 'Phi Thuyền UFO', en: 'UFO Spaceship' }, color: '#FFD700', imgAlive: '/images/ufo_alive.png', imgDead: '/images/ufo_dead.png', price: 500 },
  { id: 'plane', name: { vi: 'Phi Công Trẻ', en: 'Young Pilot' }, color: '#FFD700', imgAlive: '/images/pilot_alive.png', imgDead: '/images/pilot_dead.png', price: 700 },
  { id: 'astro_plane', name: { vi: 'Tàu Vũ Trụ', en: 'Space Plane' }, color: '#FFD700', imgAlive: '/images/astro_plane_alive.png', imgDead: '/images/astro_plane_dead.png', price: 2000 },
];
  
 export const BACKGROUNDS = [
  { id: 'deep', name: { vi: 'Không Gian Sâu', en: 'Deep Space' }, top: '#0d0e15', bottom: '#0d0e15', type: 'stars', price: 0 },
  { id: 'forest', name: { vi: 'Đêm Tĩnh Lặng', en: 'Midnight' }, top: '#020024', bottom: '#101030', type: 'aurora', price: 150 },
  { id: 'meteor', name: { vi: 'Vành Đai Đá', en: 'Meteor Belt' }, top: '#100a1c', bottom: '#000000', type: 'meteors', price: 350 },
  { id: 'ocean', name: { vi: 'Đại Dương Xanh', en: 'Ocean' }, top: '#1a2a6c', bottom: '#b21f1f', type: 'bubbles', price: 550 },
  { id: 'hyperspace', name: { vi: 'Siêu Không Gian', en: 'Hyperspace' }, top: '#050510', bottom: '#1a1a2e', type: 'hyperspace', price: 700 },
  { id: 'sunset', name: { vi: 'Hoàng Hôn', en: 'Sunset' }, top: '#2c3e50', bottom: '#fd746c', type: 'fireflies', price: 1200 },
];
// ==========================================
// --- TỪ ĐIỂN DỮ LIỆU: CHẾ ĐỘ CHIẾN DỊCH ---
// ==========================================

export const PILOTS = [
  { id: 'pilot_alpha', name: { vi: 'Astro Alpha', en: 'Astro Alpha' }, rarity: 1, skillDesc: { vi: 'Tăng 10% sát thương súng chính.', en: 'Increases main gun damage by 10%.' } },
  { id: 'pilot_bear', name: { vi: 'Gấu Cuồng Nộ', en: 'Furious Bear' }, rarity: 3, skillDesc: { vi: 'Hồi 1% máu mỗi giây.', en: 'Regenerates 1% HP per second.' } },
  { id: 'pilot_fox', name: { vi: 'Cáo Không Gian', en: 'Space Fox' }, rarity: 4, skillDesc: { vi: 'Tăng 20% tốc độ bắn súng phụ.', en: 'Increases wingman fire rate by 20%.' } }
];

export const AIRCRAFTS = [
  { id: 'ship_xwing', name: { vi: 'Tiêm Kích X-Wing', en: 'X-Wing Fighter' }, baseHp: 1000, baseAtk: 50, speed: 5 },
  { id: 'ship_tank', name: { vi: 'Pháo Đài Bay', en: 'Flying Fortress' }, baseHp: 2500, baseAtk: 30, speed: 3 },
  { id: 'ship_phantom', name: { vi: 'Bóng Ma', en: 'Phantom' }, baseHp: 800, baseAtk: 80, speed: 7 }
];

export const GEAR_CATALOG = {
  mainGun: [
    { id: 'gun_laser', name: { vi: 'Súng Laser Cơ Bản', en: 'Basic Laser' }, baseAtk: 15, fireRate: 0.5 },
    { id: 'gun_plasma', name: { vi: 'Pháo Plasma', en: 'Plasma Cannon' }, baseAtk: 30, fireRate: 1.2 },
    { id: 'gun_spread', name: { vi: 'Súng Bắn Tỏa', en: 'Spread Gun' }, baseAtk: 20, fireRate: 0.8 }
  ],
  wingman: [
    { id: 'wing_missile', name: { vi: 'Tên Lửa Tự Đoán', en: 'Homing Missile' }, baseAtk: 10 },
    { id: 'wing_drone', name: { vi: 'Vệ Tinh Bắn Tỉa', en: 'Sniper Drone' }, baseAtk: 25 }
  ],
  armor: [
    { id: 'armor_light', name: { vi: 'Giáp Nhẹ', en: 'Light Armor' }, baseHp: 500 },
    { id: 'armor_heavy', name: { vi: 'Giáp Hợp Kim', en: 'Heavy Alloy Armor' }, baseHp: 1500 },
    { id: 'armor_shield', name: { vi: 'Khiên Năng Lượng', en: 'Energy Shield' }, baseHp: 800 }
  ]
};
  
  export const PIPE_DIST_DESKTOP = 250;
  export const PIPE_DIST_MOBILE = 200;
  export const MAX_Y_DIFF = 180;