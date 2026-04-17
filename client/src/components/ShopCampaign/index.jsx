import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, PILOTS, AIRCRAFTS } from '../../constants';
import styles from './ShopCampaign.module.css';
import toast from 'react-hot-toast';
// ── Định nghĩa giá bán ──────────────────────────────────────────
const AIRCRAFT_PRICE = { 1: { cost: 800,   currency: 'coins'    },
                          2: { cost: 4000,  currency: 'coins'    },
                          3: { cost: 12000, currency: 'coins'    },
                          4: { cost: 100,   currency: 'diamonds' } };
const PILOT_PRICE    = { 1: { cost: 10,  currency: 'diamonds' },
                          2: { cost: 20,  currency: 'diamonds' },
                          3: { cost: 40,  currency: 'diamonds' },
                          4: { cost: 80,  currency: 'diamonds' },
                          5: { cost: 150, currency: 'diamonds' } };
// Giá chung cho tất cả các trang bị mua lẻ trong Shop (Mua ra đồ Trắng Lv1)
const GEAR_PRICE     = { cost: 1000, currency: 'coins' };
const TIER_LABELS    = { 1: 'TIER I', 2: 'TIER II', 3: 'TIER III', 4: 'LEGENDARY' };
const RARITY_LABELS  = { 1: 'COMMON', 2: 'UNCOMMON', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY' };
// Drop rate configs cho từng loại hòm
const CRATE_CONFIGS = [
  {
    id: 'basic', type: 'basic', currency: 'coins',
    icon: '📦',
    title:    { vi: 'HÒM CƠ BẢN',     en: 'STANDARD CRATE' },
    desc:     { vi: 'Trang bị tàn tích. Rớt đồ Trắng, Lục, Lam.',
                 en: 'Salvaged parts. Drops Common to Rare gears.' },
    cost: 100,
    dropRates: { 1: 50, 2: 35, 3: 12, 4: 3, 5: 0 },
    btnClass: 'coin',
  },
  {
    id: 'premium', type: 'premium', currency: 'coins',
    icon: '🔮',
    title:    { vi: 'HÒM CAO CẤP',     en: 'PREMIUM CRATE' },
    desc:     { vi: 'Công nghệ quân sự. Đảm bảo Lục+. Có tỷ lệ ra Vàng!',
                 en: 'Military tech. Guaranteed Uncommon+. Chance for Legendary!' },
    cost: 500,
    dropRates: { 1: 0, 2: 40, 3: 40, 4: 15, 5: 5 },
    btnClass: 'epic',
  },
  {
    id: 'epic', type: 'epic', currency: 'diamonds',
    icon: '👑',
    title:    { vi: 'HÒM HUYỀN THOẠI', en: 'EPIC CACHE' },
    desc:     { vi: 'Tinh hoa vũ trụ. Chỉ rớt Lam, Tím, Vàng.',
                 en: 'Galactic apex. Drops Rare, Epic, and Legendary exclusively.' },
    cost: 50,
    dropRates: { 1: 0, 2: 0, 3: 50, 4: 35, 5: 15 },
    btnClass: 'gold',
  },
  {
    id: 'pilot_gacha', type: 'pilot', currency: 'diamonds',
    icon: '📡',
    title:    { vi: 'TUYỂN MỘ NGẪU NHIÊN', en: 'RANDOM RECRUIT' },
    desc:     { vi: 'Phát tín hiệu triệu hồi ngẫu nhiên. Trùng lặp tự chuyển thành 1000 Xu.',
                 en: 'Broadcast SOS signal. Duplicates convert to 1000 Credits.' },
    cost: 30,
    dropRates: { 1: 30, 2: 28, 3: 22, 4: 14, 5: 6 },
    btnClass: 'green',
  },
];
// Màu theo rarity / tier (dùng trong cards)
const rarityColor = { 1:'#94a3b8', 2:'#4ade80', 3:'#60a5fa', 4:'#c084fc', 5:'#fbbf24' };
const tierColor   = { 1:'#38bdf8', 2:'#4ade80', 3:'#c084fc', 4:'#fbbf24' };
// Emoji đại diện phi cơ theo role
const SHIP_EMOJI  = { fighter:'🛸', scout:'🚀', tank:'🛡️', stealth:'👻', destroyer:'💥',
                       cruiser:'🛩️', assault:'⚡', interceptor:'🎯', special:'🌀',
                       dreadnought:'🏰', legendary:'👑' };
// ── COMPONENT ─────────────────────────────────────────────────────
export default function ShopCampaign({ gsRef, setScreen, lang, saveUserProfile }) {
  const [activeTab,   setActiveTab]   = useState('crates');
  const [refreshTick, setRefreshTick] = useState(0);
  const currentCoins    = Number(gsRef.current.coins)    || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;
  const campaignData = gsRef.current.campaignData;
  if (!campaignData.ownedAircrafts) campaignData.ownedAircrafts = { ship_xwing: true };
  const { ownedPilots, ownedAircrafts, loadout } = campaignData;
  // ── HÀM MUA HÀNG ────────────────────────────────────────────────
  const deduct = (currency, amount) => {
    if (currency === 'coins')    gsRef.current.coins    -= amount;
    if (currency === 'diamonds') gsRef.current.diamonds -= amount;
    saveUserProfile();
    setRefreshTick(t => t + 1);
  };
  const canAfford = (currency, cost) =>
    currency === 'coins' ? currentCoins >= cost : currentDiamonds >= cost;
  const toastStyle = (color) => ({
    icon: '✅', duration: 3500,
    style: { border: `1px solid ${color}`, background: '#060c1a', color: '#fff',
             fontFamily: "'Share Tech Mono', monospace" }
  });
  // Gacha hòm / tuyển mộ
  const handleGacha = (crateType) => {
    const cfg = CRATE_CONFIGS.find(c => c.id === crateType);
    if (!cfg) return;
    if (!canAfford(cfg.currency, cfg.cost))
      return toast.error(lang === 'vi' ? 'Không đủ tài nguyên!' : 'Insufficient resources!');
    if (crateType === 'pilot_gacha') {
      deduct(cfg.currency, cfg.cost);
      const pilot   = PILOTS[Math.floor(Math.random() * PILOTS.length)];
      const isDupe  = !!ownedPilots[pilot.id];
      if (isDupe) gsRef.current.coins = currentCoins + 1000;
      else        campaignData.ownedPilots[pilot.id] = { level: 1, stars: 1 };
      saveUserProfile(); setRefreshTick(t => t + 1);
      toast.success(
        (lang === 'vi' ? `Nhận: ${pilot.name.vi}` : `Acquired: ${pilot.name.en}`) +
        (isDupe ? (lang === 'vi' ? ' (Trùng → +1000◈)' : ' (Dupe → +1000◈)') : ' ✦ NEW'),
        toastStyle(rarityColor[pilot.rarity])
      );
      return;
    }
    const { dropRates, currency, cost } = cfg;
    deduct(currency, cost);
    const types        = ['mainGun', 'wingman', 'armor', 'drone'];
    const randomType   = types[Math.floor(Math.random() * types.length)];
    const catalog      = GEAR_CATALOG[randomType];
    const baseItem     = catalog[Math.floor(Math.random() * catalog.length)];
    let   rarity = 1, cumulative = 0;
    const roll = Math.random() * 100;
    for (let r = 1; r <= 5; r++) { cumulative += dropRates[r]; if (roll <= cumulative) { rarity = r; break; } }
    const uuid = 'item_' + Date.now() + Math.floor(Math.random() * 1000);
    campaignData.items[uuid] = { baseId: baseItem.id, rarity, level: 1, type: randomType };
    saveUserProfile(); setRefreshTick(t => t + 1);
    toast.success(lang === 'vi' ? `Nhận: ${baseItem.name.vi}` : `Acquired: ${baseItem.name.en}`,
      toastStyle(rarityColor[rarity]));
  };
  // Mua phi cơ
  const handleBuyAircraft = (ac) => {
    const { cost, currency } = AIRCRAFT_PRICE[ac.tier];
    if (!canAfford(currency, cost))
      return toast.error(lang === 'vi' ? 'Không đủ tài nguyên!' : 'Insufficient resources!');
    deduct(currency, cost);
    campaignData.ownedAircrafts[ac.id] = true;
    toast.success(
      (lang === 'vi' ? `Đã mua: ${ac.name.vi}` : `Purchased: ${ac.name.en}`),
      toastStyle(tierColor[ac.tier])
    );
  };
  // Mua phi công trực tiếp
  const handleBuyPilot = (pilot) => {
    const { cost, currency } = PILOT_PRICE[pilot.rarity];
    if (!canAfford(currency, cost))
      return toast.error(lang === 'vi' ? 'Không đủ Kim Cương!' : 'Not enough Diamonds!');
    if (ownedPilots[pilot.id]) {
      gsRef.current.coins = currentCoins + 500;
      deduct(currency, cost);
      toast(lang === 'vi' ? `Đã sở hữu → +500◈ bồi hoàn` : `Already owned → +500◈ refund`,
        { icon: '🔄', style: { background:'#060c1a', color:'#fff', border:'1px solid #60a5fa' } });
      return;
    }
    deduct(currency, cost);
    campaignData.ownedPilots[pilot.id] = { level: 1, stars: 1 };
    toast.success(
      lang === 'vi' ? `Điều động: ${pilot.name.vi}` : `Recruited: ${pilot.name.en}`,
      toastStyle(rarityColor[pilot.rarity])
    );
  };
  // Mua vũ khí lẻ (Trắng, Lv1)
  const handleBuyGear = (gear, type) => {
    const { cost, currency } = GEAR_PRICE;
    if (!canAfford(currency, cost))
      return toast.error(lang === 'vi' ? 'Không đủ Xu!' : 'Insufficient Credits!');
    deduct(currency, cost);
    const uuid = 'item_' + Date.now() + Math.floor(Math.random() * 1000);
    campaignData.items[uuid] = { baseId: gear.id, rarity: 1, level: 1, type: type };
    saveUserProfile(); setRefreshTick(t => t + 1);
    toast.success(
      lang === 'vi' ? `Đã mua: ${gear.name.vi}` : `Purchased: ${gear.name.en}`,
      toastStyle(rarityColor[1]) // Trắng
    );
  };
  // ── TABS CONFIG ──────────────────────────────────────────────────
  const sideTabs = [
    { id: 'crates',    icon: '📦', label: { vi: 'HÒM',        en: 'CRATES'   }, count: CRATE_CONFIGS.length },
    { id: 'aircrafts', icon: '🚀', label: { vi: 'PHI CƠ',     en: 'SHIPS'    }, count: AIRCRAFTS.length },
    { id: 'pilots',    icon: '👨‍🚀', label: { vi: 'PHI CÔNG',   en: 'PILOTS'   }, count: PILOTS.length },
    { id: 'mainGun',   icon: '🔫', label: { vi: 'SÚNG CHÍNH', en: 'MAIN GUN' }, count: GEAR_CATALOG.mainGun.length },
    { id: 'wingman',   icon: '🛸', label: { vi: 'SÚNG PHỤ',   en: 'WINGMAN'  }, count: GEAR_CATALOG.wingman.length },
    { id: 'armor',     icon: '🛡️', label: { vi: 'PHỤ TRỢ',    en: 'ARMOR'    }, count: GEAR_CATALOG.armor.length },
    { id: 'drone',     icon: '🛰️', label: { vi: 'VỆ TINH',    en: 'DRONE'    }, count: GEAR_CATALOG.drone.length },
  ];
  const tabMeta = {
    crates:    { label: { vi: 'HỆ THỐNG HÒM ĐỒ',    en: 'CRATE SYSTEM'   }, sub: { vi: 'Gacha • Trang Bị • Phi Công', en: 'Gacha • Gear • Pilots' } },
    aircrafts: { label: { vi: 'CỬA HÀNG PHI CƠ',     en: 'AIRCRAFT STORE' }, sub: { vi: '4 Tier · ' + AIRCRAFTS.length + ' Phi cơ', en: '4 Tiers · ' + AIRCRAFTS.length + ' Ships' } },
    pilots:    { label: { vi: 'TUYỂN MỘ PHI CÔNG',   en: 'PILOT RECRUIT'}, sub: { vi: PILOTS.length + ' Phi công · Rarity 1–5', en: PILOTS.length + ' Pilots · Rarity 1–5' } },
    mainGun:   { label: { vi: 'CỬA HÀNG SÚNG CHÍNH', en: 'MAIN GUN STORE' }, sub: { vi: GEAR_CATALOG.mainGun.length + ' Vũ khí', en: GEAR_CATALOG.mainGun.length + ' Weapons' } },
    wingman:   { label: { vi: 'CỬA HÀNG SÚNG PHỤ',   en: 'WINGMAN STORE'  }, sub: { vi: GEAR_CATALOG.wingman.length + ' Vũ khí', en: GEAR_CATALOG.wingman.length + ' Weapons' } },
    armor:     { label: { vi: 'CỬA HÀNG PHỤ TRỢ',    en: 'ARMOR STORE'    }, sub: { vi: GEAR_CATALOG.armor.length + ' Trang bị', en: GEAR_CATALOG.armor.length + ' Armors' } },
    drone:     { label: { vi: 'CỬA HÀNG VỆ TINH',    en: 'DRONE STORE'    }, sub: { vi: GEAR_CATALOG.drone.length + ' Vệ tinh', en: GEAR_CATALOG.drone.length + ' Drones' } },
  };
  // ── DROP RATE BAR ────────────────────────────────────────────────
  const DropRateBar = ({ rates }) => (
    <div className={styles.dropRates}>
      {[1,2,3,4,5].map(r => (
        <div key={r} className={`${styles.dropRateBar} ${rates[r] === 0 ? styles.zero : ''}`}
             data-r={r} title={`R${r}: ${rates[r]}%`}>
          <div className={styles.fill} style={{ width: `${rates[r]}%` }} />
        </div>
      ))}
    </div>
  );
  // ── BUY BUTTON ───────────────────────────────────────────────────
  const BuyBtn = ({ label, cost, currency, btnClass, isOwned, onBuy, disabled }) => {
    const affordable = currency === 'coins' ? currentCoins >= cost : currentDiamonds >= cost;
    const currencyIcon = currency === 'coins' ? '◈' : '◆';
    return (
      <button
        className={`${styles.buyBtnFull} ${isOwned ? styles.owned : (affordable ? styles[btnClass] : '')}`}
        onClick={!isOwned ? onBuy : undefined}
        disabled={!isOwned && (!affordable || disabled)}
      >
        {isOwned
          ? (lang === 'vi' ? '✓ ĐÃ SỞ HỮU' : '✓ OWNED')
          : (<>{label} <span className={styles.btnCost}>{currencyIcon} {cost.toLocaleString()}</span></>)
        }
      </button>
    );
  };
  // ── RENDER TABS ──────────────────────────────────────────────────
  // 1. HÒM
  const renderCrates = () => (
    <div className={styles.crateGrid}>
      {CRATE_CONFIGS.map(cfg => (
        <div key={cfg.id} className={`${styles.crateCard} ${styles['type' + cfg.id.charAt(0).toUpperCase() + cfg.id.slice(1).replace('_gacha','').replace('_','')]}`}>
          <div className={styles.crateIcon}>{cfg.icon}</div>
          <h3 className={styles.crateTitle} style={{ color: cfg.btnClass === 'gold' ? 'var(--gold)' : cfg.btnClass === 'green' ? 'var(--green)' : cfg.btnClass === 'epic' ? 'var(--accent-epic)' : 'var(--accent)' }}>
            {cfg.title[lang]}
          </h3>
          <p className={styles.crateDesc}>{cfg.desc[lang]}</p>
          <DropRateBar rates={cfg.dropRates} />
          <div className={styles.gachaBtnRow}>
            <button
              className={`${styles.buyBtnFull} ${styles[cfg.btnClass]}`}
              disabled={!canAfford(cfg.currency, cfg.cost)}
              onClick={() => handleGacha(cfg.id)}
            >
              {lang === 'vi' ? 'MỞ x1' : 'OPEN x1'}
              <span className={styles.btnCost}>{cfg.currency === 'coins' ? '◈' : '◆'} {cfg.cost}</span>
            </button>
            <button
              className={`${styles.buyBtnFull} ${styles[cfg.btnClass]}`}
              disabled={!canAfford(cfg.currency, cfg.cost * 10)}
              onClick={() => { for (let i = 0; i < 10; i++) handleGacha(cfg.id); }}
            >
              {lang === 'vi' ? 'x10' : 'x10'}
              <span className={styles.btnCost}>{cfg.currency === 'coins' ? '◈' : '◆'} {(cfg.cost * 10).toLocaleString()}</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
  // 2. PHI CƠ
  const renderAircrafts = () => {
    const tiers = [1, 2, 3, 4];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {tiers.map(tier => {
          const ships = AIRCRAFTS.filter(ac => ac.tier === tier);
          if (!ships.length) return null;
          return (
            <div key={tier}>
              <div className={styles.sectionLabel} style={{ color: tierColor[tier] }}>
                {lang === 'vi' ? `TIER ${tier} — ${tier === 4 ? 'HUYỀN THOẠI' : tier === 3 ? 'ELITE' : tier === 2 ? 'NÂNG CAO' : 'CƠ BẢN'}` : `TIER ${tier} — ${tier === 4 ? 'LEGENDARY' : tier === 3 ? 'ELITE' : tier === 2 ? 'ADVANCED' : 'BASIC'}`}
              </div>
              <div className={styles.itemGrid}>
                {ships.map(ac => {
                  const isOwned    = !!ownedAircrafts[ac.id] || (tier === 1 && ac.id === 'ship_xwing');
                  const isEquipped = loadout?.aircraft === ac.id;
                  const { cost, currency } = AIRCRAFT_PRICE[ac.tier];
                  return (
                    <motion.div key={ac.id}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      className={`${styles.shipCard} t${tier} ${isOwned ? styles.owned : ''}`}
                    >
                      <div className={styles.shipCardGlow} />
                      {isEquipped && <div className={styles.equippedBadge}>{lang === 'vi' ? '✓ ĐANG DÙNG' : '✓ ACTIVE'}</div>}
                      {isOwned && !isEquipped && <div className={styles.ownedBadge}>{lang === 'vi' ? 'SỞ HỮU' : 'OWNED'}</div>}
                      <div className={styles.shipEmojiWrap}>
                        {ac.imgTop ? <img src={ac.imgTop} alt={ac.id} style={{ height: 50, objectFit: 'contain' }} /> : SHIP_EMOJI[ac.role] || '🛸'}
                      </div>
                      <div className={styles.shipName}>{ac.name[lang]}</div>
                      <span className={`${styles.tierBadge} t${tier}`}>{TIER_LABELS[tier]}</span>
                      <p className={styles.shipDesc}>{ac.description[lang]}</p>
                      <div className={styles.shipStats}>
                        <div className={styles.shipStat}>ATK <span className={styles.val}>{ac.baseAtk}</span></div>
                        <div className={styles.shipStat}>HP <span className={styles.val}>{ac.baseHp}</span></div>
                        <div className={styles.shipStat}>SPD <span className={styles.val}>{ac.speed}</span></div>
                        <div className={styles.shipStat}>ARM <span className={styles.val}>{ac.baseArmor}</span></div>
                      </div>
                      <BuyBtn
                        label={lang === 'vi' ? 'MUA' : 'BUY'}
                        cost={cost} currency={currency}
                        btnClass={tier === 4 ? 'gold' : tier === 3 ? 'epic' : tier === 2 ? 'green' : 'coin'}
                        isOwned={isOwned}
                        onBuy={() => handleBuyAircraft(ac)}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  // 3. PHI CÔNG
  const renderPilots = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className={styles.sectionLabel}>
        {lang === 'vi' ? 'TUYỂN MỘ NGẪU NHIÊN (◆ 30)' : 'RANDOM RECRUIT (◆ 30)'}
      </div>
      <div className={styles.crateGrid} style={{ marginBottom: 8 }}>
        <div className={`${styles.crateCard} ${styles.typePilot}`} style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div className={styles.crateIcon}>📡</div>
          <h3 className={styles.crateTitle} style={{ color: 'var(--green)' }}>
            {lang === 'vi' ? 'TRIỆU HỒI NGẪU NHIÊN' : 'RANDOM BROADCAST'}
          </h3>
          <p className={styles.crateDesc}>
            {lang === 'vi' ? 'Triệu hồi phi công bất kỳ. Trùng → +1000◈ bồi hoàn.' : 'Random pilot. Duplicate → +1000◈ refund.'}
          </p>
          <DropRateBar rates={{ 1: 30, 2: 28, 3: 22, 4: 14, 5: 6 }} />
          <div className={styles.gachaBtnRow}>
            <button className={`${styles.buyBtnFull} ${styles.green}`} disabled={!canAfford('diamonds', 30)} onClick={() => handleGacha('pilot_gacha')}>
              x1 <span className={styles.btnCost}>◆ 30</span>
            </button>
            <button className={`${styles.buyBtnFull} ${styles.green}`} disabled={!canAfford('diamonds', 300)} onClick={() => { for (let i = 0; i < 10; i++) handleGacha('pilot_gacha'); }}>
              x10 <span className={styles.btnCost}>◆ 300</span>
            </button>
          </div>
        </div>
      </div>
      <div className={styles.sectionLabel}>
        {lang === 'vi' ? 'TUYỂN MỘ TRỰC TIẾP' : 'DIRECT RECRUIT'}
      </div>
      <div className={styles.pilotGrid}>
        {PILOTS.map(pilot => {
          const isOwned    = !!ownedPilots[pilot.id];
          const isEquipped = loadout?.pilot === pilot.id;
          const { cost, currency } = PILOT_PRICE[pilot.rarity];
          return (
            <motion.div key={pilot.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className={`${styles.pilotCard} r${pilot.rarity}`}
            >
              {isEquipped && <div className={styles.equippedBadge}>{lang === 'vi' ? '✓ ĐANG DÙNG' : '✓ ACTIVE'}</div>}
              {isOwned && !isEquipped && <div className={styles.ownedBadge}>{lang === 'vi' ? 'SỞ HỮU' : 'OWNED'}</div>}
              <div className={styles.pilotFace}>
                {pilot.imgSrc ? <img src={pilot.imgSrc} alt={pilot.id} style={{ height: 50, objectFit: 'contain' }} /> : '👨‍🚀'}
              </div>
              <div className={`${styles.rarityStars} ${styles['r' + pilot.rarity]}`}>
                {'★'.repeat(pilot.rarity)}{'☆'.repeat(5 - pilot.rarity)}
              </div>
              <div className={styles.pilotName}>{pilot.name[lang]}</div>
              <span className={`${styles.rarityBadge} r${pilot.rarity}`}>{RARITY_LABELS[pilot.rarity]}</span>
              <p className={styles.pilotSkill}>"{pilot.skillDesc[lang]}"</p>
              <BuyBtn
                label={lang === 'vi' ? 'TRIỆU HỒI' : 'RECRUIT'}
                cost={cost} currency={currency}
                btnClass={pilot.rarity === 5 ? 'gold' : pilot.rarity === 4 ? 'epic' : pilot.rarity >= 2 ? 'gem' : 'coin'}
                isOwned={isOwned}
                onBuy={() => handleBuyPilot(pilot)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
  // 4. GEARS (VŨ KHÍ LẺ)
  const renderGear = (type) => {
    const catalog = GEAR_CATALOG[type];
    return (
      <div className={styles.itemGrid}>
        {catalog.map(gear => {
          const { cost, currency } = GEAR_PRICE;
          return (
            <motion.div key={gear.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className={`${styles.shipCard} t1`} // Dùng chung form CSS của tàu bay
            >
              <div className={styles.shipCardGlow} />
              <div className={styles.shipEmojiWrap}>
                {gear.imgSrc ? <img src={gear.imgSrc} alt={gear.id} style={{ height: 50, objectFit: 'contain' }} /> : '📦'}
              </div>
              <div className={styles.shipName}>{gear.name[lang]}</div>
              <span className={`${styles.tierBadge} t1`}>{lang === 'vi' ? 'TIÊU CHUẨN' : 'STANDARD'}</span>
              <p className={styles.shipDesc}>{gear.description[lang]}</p>
              <div className={styles.shipStats}>
                {gear.baseAtk && <div className={styles.shipStat}>ATK <span className={styles.val}>{gear.baseAtk}</span></div>}
                {gear.baseHp && <div className={styles.shipStat}>HP <span className={styles.val}>{gear.baseHp}</span></div>}
                {gear.fireRate && <div className={styles.shipStat}>SPD <span className={styles.val}>{gear.fireRate}</span></div>}
              </div>
              <BuyBtn
                label={lang === 'vi' ? 'MUA' : 'BUY'}
                cost={cost} currency={currency}
                btnClass={'coin'}
                isOwned={false} // Cho phép mua nhiều lần làm nguyên liệu ép đồ
                onBuy={() => handleBuyGear(gear, type)}
              />
            </motion.div>
          );
        })}
      </div>
    );
  };
  const renderMap = { 
    crates: renderCrates, 
    aircrafts: renderAircrafts, 
    pilots: renderPilots, 
    mainGun: () => renderGear('mainGun'),
    wingman: () => renderGear('wingman'),
    armor: () => renderGear('armor'),
    drone: () => renderGear('drone')
  };
  // ── JSX ─────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
      className={`${styles.container} scrollable-layer`}>
      <div className={styles.contentWrapper}>
        {/* HEADER */}
        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn}
            onClick={() => setScreen('campaign_portal')}>
            <span className={styles.backArrow}>‹</span>
            {lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}
          </motion.button>
          <div className={styles.headerTitle}>
            {lang === 'vi' ? 'CHỢ TIẾP TẾ' : 'SUPPLY DEPOT'}
          </div>
          <div className={styles.currencyBar}>
            <div className={styles.currencyChip}>
              <span className={styles.coinIcon}>◈</span>
              <span className={styles.currencyAmt}>{currentCoins.toLocaleString()}</span>
            </div>
            <div className={styles.currencyChip}>
              <span className={styles.gemIcon}>◆</span>
              <span className={styles.currencyAmt}>{currentDiamonds.toLocaleString()}</span>
            </div>
          </div>
        </header>
        {/* SHOP LAYOUT */}
        <div className={styles.shopLayout}>
          {/* VERTICAL TABS */}
          <div className={styles.verticalTabs}>
            <div className={styles.tabsHeader}>{lang === 'vi' ? 'DANH MỤC' : 'CATEGORY'}</div>
            {sideTabs.map(tab => (
              <button key={tab.id}
                className={`${styles.sideTabBtn} ${activeTab === tab.id ? styles.active : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles.tabSideIcon}>{tab.icon}</span>
                <span className={styles.tabSideLabel}>{tab.label[lang]}</span>
                <span className={styles.tabSideBadge}>{tab.count}</span>
              </button>
            ))}
          </div>
          {/* CONTENT PANEL */}
          <div className={styles.contentArea}>
            <div className={styles.contentTopBar}>
              <span className={styles.contentTopLabel}>{tabMeta[activeTab]?.label[lang]}</span>
              <span className={styles.contentTopSub}>{tabMeta[activeTab]?.sub[lang]}</span>
            </div>
            <div className={styles.contentScroll}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                >
                  {renderMap[activeTab]?.()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}