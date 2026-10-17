/**
 * Product catalog: catalog/events.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
export const EVENT_CONFIG = [
  // ─── SỰ KIỆN 1: CUỘC CHIẾN THANH TRỪNG ───────────────────────────────────
  {
    id: 'event_kill_rush_01',
    type: 'kill_rush',
    title: { vi: '⚔ THANH TRỪNG CỰC ĐIỂM', en: '⚔ TOTAL ANNIHILATION' },
    desc: {
      vi: 'Tiêu diệt kẻ địch để tích điểm. Đạt mốc thưởng để nhận phần thưởng hạng nặng!',
      en: 'Destroy enemies to score points. Hit reward milestones for massive loot!',
    },
    themeColor: '#ff4757',
    bannerIcon: '☄',
    // Thời gian sự kiện (UTC timestamp – đổi khi deploy)
    startTime: 1778544000000,   // 12/05/2026 00:00 UTC
    endTime:   1779148800000,   // 19/05/2026 00:00 UTC
    // Mốc phần thưởng – đạt kills tích lũy → nhận thưởng
    milestones: [
      { kills: 100,  reward: { type: 'coins',    amount: 10000 }, claimed: false },
      { kills: 300,  reward: { type: 'gems',     amount: 50    }, claimed: false },
      { kills: 600,  reward: { type: 'blueprints',amount: 20   }, claimed: false },
      { kills: 1000, reward: { type: 'gems',     amount: 200   }, claimed: false },
    ],
    trackKey: 'event_kills',   // key trong gsRef.current.campaignData.eventData
  },
 
  // ─── SỰ KIỆN 2: SỐT XU ───────────────────────────────────────────────────
  {
    id: 'event_coin_fever_01',
    type: 'coin_fever',
    title: { vi: '💰 CƠN SỐT XU VŨNG TRỤ', en: '💰 COSMIC COIN FEVER' },
    desc: {
      vi: 'Tất cả xu nhận được từ chiến dịch và phó bản được nhân ×2 trong suốt sự kiện!',
      en: 'All coins earned from campaign and dungeon are ×2 for the duration of the event!',
    },
    themeColor: '#f1c40f',
    bannerIcon: '✦',
    startTime: 1779148800000,   // 19/05/2026
    endTime:   1779494400000,   // 23/05/2026
    multiplier: 2,             // nhân hệ số này vào collectedCoins
    trackKey: null,            // không cần track, tự động áp dụng
  },
 
  // ─── SỰ KIỆN 3: TUẦN PHÓ BẢN ─────────────────────────────────────────────
  {
    id: 'event_dungeon_rush_01',
    type: 'dungeon_rush',
    title: { vi: '🌀 TUẦN PHÓ BẢN', en: '🌀 DUNGEON BLITZ WEEK' },
    desc: {
      vi: 'Tất cả phó bản mở cửa mỗi ngày. Phần thưởng hoàn thành được nhân ×1.5!',
      en: 'All dungeons open every day. Completion rewards ×1.5!',
    },
    themeColor: '#a78bfa',
    bannerIcon: '🌀',
    startTime: 1779494400000,   // 23/05/2026
    endTime:   1780099200000,   // 30/05/2026

    openAllDays: true,         // ghi đè openDays của DUNGEON_CONFIG
    rewardMultiplier: 1.5,
    trackKey: null,
  },
 
  // ─── SỰ KIỆN 4: SĂN ĐỒ ──────────────────────────────────────────────────
  {
    id: 'event_gear_hunt_01',
    type: 'gear_hunt',
    title: { vi: '🎁 TUẦN SĂN ĐỒ', en: '🎁 GEAR HUNT WEEK' },
    desc: {
      vi: 'Tỉ lệ nhận hòm Hiếm và Sử Thi từ Gacha tăng gấp đôi. Đừng bỏ lỡ!',
      en: 'Rare and Epic crate drop rates doubled in Gacha. Don\'t miss out!',
    },
    themeColor: '#34d399',
    bannerIcon: '🎁',
    startTime: 1780099200000,   // 30/05/2026
    endTime:   1780704000000,   // 06/06/2026
    dropBonus: {
      basic:   { r3: +10, r4: +5  },  // cộng thêm % vào dropRates
      premium: { r4: +10, r5: +5  },
    },
    trackKey: null,
  },
 
  // ─── SỰ KIỆN 5: BOSS HUYỀN THOẠI ─────────────────────────────────────────
  {
    id: 'event_boss_blitz_01',
    type: 'boss_blitz',
    title: { vi: '💀 BOSS HUYỀN THOẠI', en: '💀 LEGENDARY BOSS RAID' },
    desc: {
      vi: 'Kẻ thù huyền thoại xuất hiện! Chiến đấu càng nhiều lần càng nhận nhiều thưởng.',
      en: 'A legendary enemy appears! Fight more times to earn more rewards.',
    },
    themeColor: '#ff6b35',
    bannerIcon: '💀',
    startTime: 1780704000000,   // 06/06/2026
    endTime:   1781308800000,   // 13/06/2026
    bossConfig: {
      name: { vi: 'LEVIATHAN', en: 'LEVIATHAN' },
      hp: 50000,
      rewardPerAttempt: { type: 'gems', amount: 30 },
      maxAttempts: 5,         // tối đa 5 lần/ngày
    },
    trackKey: 'event_boss_attempts',
  },
 
  // ─── SỰ KIỆN 6: ĐĂNG NHẬP LIÊN TIẾP ─────────────────────────────────────
  {
    id: 'event_login_bonus_01',
    type: 'login_bonus',
    title: { vi: '🚀 PHẦN THƯỞNG VŨ TRỤ', en: '🚀 COSMIC LOGIN BONUS' },
    desc: {
      vi: 'Đăng nhập 7 ngày liên tiếp trong sự kiện để nhận phi cơ huyền thoại!',
      en: 'Log in 7 consecutive days during the event to earn a legendary aircraft!',
    },
    themeColor: '#60a5fa',
    bannerIcon: '🚀',
    startTime: 1781308800000,   // 13/06/2026
    endTime:   1782000000000,   // 21/06/2026
    // Quà mỗi ngày (index 0 = ngày 1)
    dailyRewards: [
      { type: 'coins',      amount: 5000   },
      { type: 'gems',       amount: 30     },
      { type: 'energy',     amount: 50     },
      { type: 'blueprints', amount: 10     },
      { type: 'gems',       amount: 80     },
      { type: 'coins',      amount: 20000  },
      { type: 'aircraft',   id: 'ship_eternal' },  // ngày 7 nhận phi cơ
    ],
    trackKey: 'event_login_days',
  },
];

// ── HELPER: lấy event đang active theo giờ thực ───────────────────────────
export const getActiveEvents = (getRealTime) => {
  const now = typeof getRealTime === 'function' ? getRealTime() : Date.now();
  return EVENT_CONFIG.filter(e => now >= e.startTime && now <= e.endTime);
};

// ── HELPER: lấy 1 event theo id ───────────────────────────────────────────
export const getEventById = (id) => EVENT_CONFIG.find(e => e.id === id);
