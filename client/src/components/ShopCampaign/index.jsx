import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GEAR_CATALOG, PILOTS } from '../../constants';
import styles from './ShopCampaign.module.css';
import toast from 'react-hot-toast';

export default function ShopCampaign({ gsRef, setScreen, lang, saveUserProfile }) {
  const [refreshTick, setRefreshTick] = useState(0); // Để ép React render lại khi xu/gem thay đổi
  
  const currentCoins = Number(gsRef.current.coins) || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;

  // HÀM XỬ LÝ GACHA VÀ MUA SẮM
  const handleGacha = (crateType) => {
    // 1. Logic Tuyển Mộ Phi Công
    if (crateType === 'pilot') {
      const cost = 30; 
      if (currentDiamonds < cost) return toast.error(lang === 'vi' ? 'Thiếu Kim Cương!' : 'Not enough Diamonds!');
      
      gsRef.current.diamonds = currentDiamonds - cost;
      
      const randomPilot = PILOTS[Math.floor(Math.random() * PILOTS.length)];
      const currentPilotData = gsRef.current.campaignData.ownedPilots[randomPilot.id];
      
      let isDuplicate = false;
      if (currentPilotData) {
        gsRef.current.coins = currentCoins + 1000;
        isDuplicate = true;
      } else {
        gsRef.current.campaignData.ownedPilots[randomPilot.id] = { level: 1, stars: 1 };
      }

      saveUserProfile(); setRefreshTick(prev => prev + 1);

      toast.success(lang === 'vi' 
        ? `Nhận: ${randomPilot.name.vi} ${isDuplicate ? '(Trùng lặp: +1000 ◈)' : '(Mới)'}` 
        : `Acquired: ${randomPilot.name.en} ${isDuplicate ? '(Dupe: +1000 ◈)' : '(New)'}`, 
      { icon: '👨‍🚀', duration: 4000, style: { border: `1px solid #22c55e`, background: '#060c1a', color: '#fff', fontFamily: "'Share Tech Mono', monospace" } });
      return;
    }

    // 2. Logic Mở Hòm Trang Bị
    let cost = 0; let currency = 'coins'; let dropRates = {};

    if (crateType === 'basic') { cost = 100; currency = 'coins'; dropRates = {1: 50, 2: 35, 3: 12, 4: 3, 5: 0}; } 
    else if (crateType === 'premium') { cost = 500; currency = 'coins'; dropRates = {1: 0, 2: 40, 3: 40, 4: 15, 5: 5}; } 
    else if (crateType === 'epic') { cost = 50; currency = 'diamonds'; dropRates = {1: 0, 2: 0, 3: 50, 4: 35, 5: 15}; }

    if (currency === 'coins' && currentCoins < cost) return toast.error(lang === 'vi' ? 'Mức Tín Chỉ (Xu) quá thấp!' : 'Insufficient Credits!');
    if (currency === 'diamonds' && currentDiamonds < cost) return toast.error(lang === 'vi' ? 'Thiếu Kim Cương!' : 'Insufficient Diamonds!');

    if (currency === 'coins') gsRef.current.coins -= cost;
    if (currency === 'diamonds') gsRef.current.diamonds -= cost;
    
    // Random Loại Trang Bị (Súng, Súng phụ, Giáp, Drone)
    const types = ['mainGun', 'wingman', 'armor', 'drone'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    const catalog = GEAR_CATALOG[randomType];
    const randomBaseItem = catalog[Math.floor(Math.random() * catalog.length)];

    // Đổ xúc xắc độ hiếm
    const randRoll = Math.random() * 100;
    let rarity = 1; let cumulative = 0;
    for (let r = 1; r <= 5; r++) { cumulative += dropRates[r]; if (randRoll <= cumulative) { rarity = r; break; } }

    // Tạo Item mới lưu vào kho
    const newUuid = 'item_' + Date.now() + Math.floor(Math.random() * 1000);
    gsRef.current.campaignData.items[newUuid] = { baseId: randomBaseItem.id, rarity: rarity, level: 1, type: randomType };

    saveUserProfile(); setRefreshTick(prev => prev + 1);

    const rarityIcons = ['⚪', '🟢', '🔵', '🟣', '🟡'];
    const rarityColors = ['#94a3b8', '#4ade80', '#60a5fa', '#c084fc', '#fbbf24'];
    toast(lang === 'vi' ? `Nhận: ${randomBaseItem.name.vi}` : `Acquired: ${randomBaseItem.name.en}`, {
      icon: rarityIcons[rarity - 1], duration: 4000,
      style: { border: `1px solid ${rarityColors[rarity-1]}`, background: '#060c1a', color: '#fff', fontFamily: "'Share Tech Mono', monospace" }
    });
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { type: 'spring' } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className={`${styles.container} scrollable-layer`}>
      <div className={styles.contentWrapper}>
        
        {/* ── HEADER ── */}
        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
            <span className={styles.backArrow}>‹</span>
            {lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}
          </motion.button>

          <div className={styles.headerTitle}>
            {lang === 'vi' ? 'CHỢ TIẾP TẾ' : 'SUPPLY DEPOT'}
          </div>

          <div className={styles.currencyBar}>
            <div className={styles.currencyChip} data-type="coin">
              <span className={`${styles.currencyIcon} ${styles.coinIcon}`}>◈</span>
              <span className={styles.currencyAmt}>{currentCoins.toLocaleString()}</span>
            </div>
            <div className={styles.currencyChip} data-type="gem">
              <span className={`${styles.currencyIcon} ${styles.gemIcon}`}>◆</span>
              <span className={styles.currencyAmt}>{currentDiamonds.toLocaleString()}</span>
            </div>
          </div>
        </header>

        {/* ── SHOP GRID ── */}
        <div className={styles.shopGrid}>
          
          {/* HÒM CƠ BẢN */}
          <motion.div variants={itemVariants} className={`${styles.crateCard} ${styles.crateBasic}`}>
            <div className={styles.crateIcon}>📦</div>
            <div className={styles.crateInfo}>
              <h3 className={styles.crateTitle} style={{ color: 'var(--accent)' }}>
                {lang === 'vi' ? 'HÒM CƠ BẢN' : 'STANDARD CRATE'}
              </h3>
              <p className={styles.crateDesc}>
                {lang === 'vi' ? 'Trang bị tàn tích. Rớt đồ Trắng, Lục, Lam.' : 'Salvaged parts. Drops Common to Rare gears.'}
              </p>
              <motion.button whileTap={{ scale: 0.95 }} className={`${styles.buyBtn} ${styles.buyBtnCoin}`} onClick={() => handleGacha('basic')}>
                {lang === 'vi' ? 'MỞ KHÓA' : 'UNLOCK'} <span className={styles.costVal}>◈ 100</span>
              </motion.button>
            </div>
          </motion.div>

          {/* HÒM CAO CẤP */}
          <motion.div variants={itemVariants} className={`${styles.crateCard} ${styles.cratePremium}`}>
            <div className={styles.crateIcon}>🔮</div>
            <div className={styles.crateInfo}>
              <h3 className={styles.crateTitle} style={{ color: 'var(--accent-epic)' }}>
                {lang === 'vi' ? 'HÒM CAO CẤP' : 'PREMIUM CRATE'}
              </h3>
              <p className={styles.crateDesc}>
                {lang === 'vi' ? 'Công nghệ quân sự. Đảm bảo Lục trở lên. Có tỷ lệ ra Vàng!' : 'Military tech. Guaranteed Uncommon+. Chance for Legendary!'}
              </p>
              <motion.button whileTap={{ scale: 0.95 }} className={`${styles.buyBtn} ${styles.buyBtnCoin}`} onClick={() => handleGacha('premium')}>
                {lang === 'vi' ? 'MỞ KHÓA' : 'UNLOCK'} <span className={styles.costVal}>◈ 500</span>
              </motion.button>
            </div>
          </motion.div>

          {/* HÒM HUYỀN THOẠI */}
          <motion.div variants={itemVariants} className={`${styles.crateCard} ${styles.crateEpic}`}>
            <div className={styles.crateIcon}>👑</div>
            <div className={styles.crateInfo}>
              <h3 className={styles.crateTitle} style={{ color: 'var(--accent-warm)' }}>
                {lang === 'vi' ? 'HÒM HUYỀN THOẠI' : 'EPIC CACHE'}
              </h3>
              <p className={styles.crateDesc}>
                {lang === 'vi' ? 'Tinh hoa vũ trụ. Chỉ rớt Lam, Tím, Vàng cực phẩm.' : 'Galactic apex. Drops Rare, Epic, and Legendary exclusively.'}
              </p>
              <motion.button whileTap={{ scale: 0.95 }} className={`${styles.buyBtn} ${styles.buyBtnGem}`} onClick={() => handleGacha('epic')}>
                {lang === 'vi' ? 'MỞ KHÓA' : 'UNLOCK'} <span className={styles.costVal}>◆ 50</span>
              </motion.button>
            </div>
          </motion.div>

          {/* TUYỂN MỘ PHI CÔNG */}
          <motion.div variants={itemVariants} className={`${styles.crateCard} ${styles.cratePilot}`}>
            <div className={styles.crateIcon}>👨‍🚀</div>
            <div className={styles.crateInfo}>
              <h3 className={styles.crateTitle} style={{ color: '#4ade80' }}>
                {lang === 'vi' ? 'TUYỂN MỘ PHI CÔNG' : 'RECRUIT PILOT'}
              </h3>
              <p className={styles.crateDesc}>
                {lang === 'vi' ? 'Phát tín hiệu triệu hồi. Trùng lặp tự động quy đổi thành 1000 Xu.' : 'Broadcast SOS signal. Duplicates convert to 1000 Credits.'}
              </p>
              <motion.button whileTap={{ scale: 0.95 }} className={`${styles.buyBtn} ${styles.buyBtnGem}`} style={{ color: '#4ade80', borderColor: '#4ade80', background: 'rgba(74, 222, 128, 0.15)' }} onClick={() => handleGacha('pilot')}>
                {lang === 'vi' ? 'TRIỆU HỒI' : 'RECRUIT'} <span className={styles.costVal}>◆ 30</span>
              </motion.button>
            </div>
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}