/**
 * Product catalog: catalog/missions.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
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
    { id: 'm_pull_gacha', title: { vi: 'Đầu Tư Công Nghệ', en: 'Tech Investor' }, desc: { vi: 'Mở hòm tiếp tế 50 lần', en: 'Open 50 supply crates' }, goal: 50, reward: { type: 'gears', amount: 1000 }, targetScreen: 'shop_campaign' },
    { id: 'm_login_30', title: { vi: 'Gương Mẫu Toàn Diện', en: 'Exemplary Service' }, desc: { vi: 'Điểm danh tháng', en: 'Check-in this month' }, goal: 30, reward: { type: 'diamonds', amount: 500 }, targetScreen: 'attendance' }
  ]
};
