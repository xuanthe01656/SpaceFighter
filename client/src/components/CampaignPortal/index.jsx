import React from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import styles from './CampaignPortal.module.css';

// --- HỆ THỐNG SVG ICONS CHUẨN SCI-FI ---
const Icons = {
  Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  Coin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>,
  Gem: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>,
  Blueprint: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>,
  Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  Map: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>,
  Armory: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
  Barracks: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Supply: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  Event: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Back: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  // --- ICONS MỚI ---
  Gift: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,
  Swords: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 6.5L17.5 3h3v3l-3.5 3.5"/><path d="M5 19l6-6"/><path d="M8 16l-4 4"/><path d="M5 21l-2-2"/></svg>,
  Mission: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
};

export default function CampaignPortal({ gsRef, setScreen, lang }) {
  const campaignData = gsRef.current.campaignData;
  const materials = campaignData?.materials || {}; 
  const energy = gsRef.current?.energy ?? 50;
  const coins = gsRef.current?.coins ?? 0;
  const diamonds = gsRef.current?.diamonds ?? 0;
  const gear = Number(materials.gears) || 0;
  const blueprints = Number(materials.blueprints) || 0;

  const handleNav = (screenName) => {
    setScreen(screenName);
  };

  const handleNotImplemented = () => {
    toast(lang === 'vi' ? 'HỆ THỐNG ĐANG BẢO TRÌ!' : 'SYSTEM OFFLINE!', {
      style: { background: 'rgba(255, 60, 0, 0.9)', color: '#fff', borderRadius: '4px', border: '1px solid #ff3c00' },
      icon: '⚠️'
    });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1, duration: 0.4 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } }
  };

  const slideLeft = {
    hidden: { x: -50, opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 200 } }
  };

  return (
    <motion.div className={styles.container} variants={containerVariants} initial="hidden" animate="visible">
      
      {/* ==========================================
          1. TOP NAVIGATION & CURRENCY BAR
      ========================================== */}
      <div className={styles.topNav}>
        <motion.button variants={itemVariants} className={styles.backBtn} onClick={() => handleNav('portal')}>
          <div className={styles.currencyIcon}><Icons.Back /></div>
          <span className={styles.backText}>{lang === 'vi' ? 'HỆ ĐIỀU HÀNH' : 'OS KERNEL'}</span>
        </motion.button>

        <motion.div variants={itemVariants} className={styles.currencyBar}>
          <div className={`${styles.currencyChip} ${styles.chipEnergy}`}>
             <div className={styles.currencyIcon}><Icons.Energy /></div>
             <span className={styles.currencyAmt}>{energy}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipCoin}`}>
             <div className={styles.currencyIcon}><Icons.Coin /></div>
             <span className={styles.currencyAmt}>{coins.toLocaleString()}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipGem}`}>
             <div className={styles.currencyIcon}><Icons.Gem /></div>
             <span className={styles.currencyAmt}>{diamonds.toLocaleString()}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipBlueprint}`}>
              <div className={styles.currencyIcon}><Icons.Blueprint /></div>
              <span className={styles.currencyAmt}>{blueprints.toLocaleString()}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipGear}`}>
            <div className={styles.currencyIcon}><Icons.Gear /></div>
            <span className={styles.currencyAmt}>{gear.toLocaleString()}</span>
          </div>
        </motion.div>
      </div>

      {/* ==========================================
          2. LEFT SIDEBAR (Missions, Events, Topup)
      ========================================== */}
      <div className={styles.leftSidebar}>
        <motion.button variants={slideLeft} className={`${styles.sideBtn} ${styles.topupBtn}`} onClick={handleNotImplemented}>
          <div className={styles.sideIcon}><Icons.Gift /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'NẠP ĐẦU' : 'FIRST TOP-UP'}</span>
        </motion.button>

        <motion.button variants={slideLeft} className={`${styles.sideBtn} ${styles.eventBtn}`} onClick={handleNotImplemented}>
          <div className={styles.sideIcon}><Icons.Event /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'SỰ KIỆN' : 'EVENTS'}</span>
        </motion.button>

        <motion.button variants={slideLeft} className={styles.sideBtn} onClick={handleNotImplemented}>
          <div className={styles.sideIcon}><Icons.Mission /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'NHIỆM VỤ' : 'MISSIONS'}</span>
        </motion.button>
      </div>

      {/* ==========================================
          3. BOTTOM NAVIGATION (Management)
      ========================================== */}
      <motion.div variants={itemVariants} className={styles.bottomNav}>
        <button className={styles.navBtn} onClick={() => handleNav('inventory')}>
          <div className={styles.navIcon}><Icons.Armory /></div> 
          <span>{lang === 'vi' ? 'KHO KHÍ TÀI' : 'ARMORY'}</span>
        </button>
        
        <button className={styles.navBtn} onClick={() => handleNav('pilots')}>
          <div className={styles.navIcon}><Icons.Barracks /></div> 
          <span>{lang === 'vi' ? 'DOANH TRẠI' : 'BARRACKS'}</span>
        </button>
        
        <button className={styles.navBtn} onClick={() => handleNav('shop_campaign')}>
            <div className={styles.navIcon}><Icons.Supply /></div> 
            <span>{lang === 'vi' ? 'CỬA HÀNG' : 'SHOP'}</span>
        </button>
      </motion.div>

      {/* ==========================================
          4. BOTTOM RIGHT ACTION AREA (Combat/Map)
      ========================================== */}
      <motion.div variants={itemVariants} className={styles.actionArea}>
        
        {/* Nút Phó Bản (Dungeons) */}
        <button className={styles.subModeBtn} onClick={handleNotImplemented}>
          <div className={styles.subModeIcon}><Icons.Swords /></div>
          <span>{lang === 'vi' ? 'PHÓ BẢN' : 'DUNGEON'}</span>
        </button>

        {/* Nút Cốt Truyện Chính (Main Story) - Khổng lồ, nổi bật nhất */}
        <button className={styles.mainLaunchBtn} onClick={() => handleNav('galaxy_map')}>
          <div className={styles.launchIconBg}>
            <Icons.Map />
          </div>
          <div className={styles.launchContent}>
            <span className={styles.launchTitle}>{lang === 'vi' ? 'CHIẾN DỊCH' : 'CAMPAIGN'}</span>
            <span className={styles.launchSub}>{lang === 'vi' ? 'VÀO BẢN ĐỒ' : 'ENTER MAP'}</span>
          </div>
        </button>

      </motion.div>

    </motion.div>
  );
}