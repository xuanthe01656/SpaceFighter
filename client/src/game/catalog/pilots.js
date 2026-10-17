/**
 * Product catalog: catalog/pilots.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
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
    value: 0.01,
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
