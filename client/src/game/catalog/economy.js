/**
 * Product catalog: catalog/economy.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
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

export const FIRST_TOPUP_REWARD = {
  aircraftId: 'ship_nova',
  gems: 888,
  coins: 38383
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
