import React from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import styles from './CampaignPortal.module.css';

export default function CampaignPortal({ gsRef, setScreen, lang }) {
  const energy = gsRef.current?.energy ?? 50;
  const coins = gsRef.current?.coins ?? 0;
  const diamonds = gsRef.current?.diamonds ?? 0;

  const handleNotImplemented = () => {
    toast(lang === 'vi' ? 'Tính năng đang được phát triển!' : 'Feature in development!', { icon: '🚧' });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring' } }
  };

  return (
    <motion.div className={styles.container} variants={containerVariants} initial="hidden" animate="visible">
      
      {/* 1. TOP BAR (ĐỒNG BỘ VỚI INVENTORY/SHOP) */}
      <div className={styles.topNav}>
        <motion.button variants={itemVariants} className={styles.backBtn} onClick={() => setScreen('portal')}>
          <span className={styles.backArrow}>‹</span>
          {lang === 'vi' ? 'SẢNH CHÍNH' : 'MAIN PORTAL'}
        </motion.button>

        <motion.div variants={itemVariants} className={styles.currencyBar}>
          <div className={styles.currencyChip} data-type="energy" title={lang === 'vi' ? 'Năng lượng' : 'Energy'}>
             <span className={styles.currencyIcon}>⚡</span>
             <span className={styles.currencyAmt}>{energy}</span>
          </div>
          <div className={styles.currencyChip} data-type="coin" title={lang === 'vi' ? 'Xu' : 'Coins'}>
             <span className={styles.currencyIcon}>◈</span>
             <span className={styles.currencyAmt}>{coins.toLocaleString()}</span>
          </div>
          <div className={styles.currencyChip} data-type="gem" title={lang === 'vi' ? 'Kim Cương' : 'Diamonds'}>
             <span className={styles.currencyIcon}>◆</span>
             <span className={styles.currencyAmt}>{diamonds.toLocaleString()}</span>
          </div>
        </motion.div>
      </div>

      {/* 2. TRUNG TÂM LÒ PHẢN ỨNG (GIỮ NGUYÊN ĐẸP NHƯ CŨ) */}
      <div className={styles.centerDisplay}>
        <div className={styles.hologramRing}></div>
        <div className={styles.hologramRingInner}></div>
        
        <motion.button 
          variants={itemVariants} className={styles.launchBtn}
          onClick={() => setScreen('stage_select')}
          whileTap={{ scale: 0.9 }}
        >
          <span className={styles.launchIcon}>🗺️</span>
          <span className={styles.launchText}>{lang === 'vi' ? 'BẢN ĐỒ CHIẾN DỊCH' : 'SECTOR MAP'}</span>
        </motion.button>
      </div>

      {/* 3. DOCK ĐIỀU HƯỚNG BÊN DƯỚI (CHUẨN AAA) */}
      <motion.div variants={itemVariants} className={styles.bottomDock}>
        <button className={styles.navBtn} onClick={() => setScreen('inventory')}>
          <span className={styles.navIcon}>📦</span> 
          <span>{lang === 'vi' ? 'KHO VŨ KHÍ' : 'ARMORY'}</span>
        </button>
        
        <button className={styles.navBtn} onClick={() => setScreen('pilots')}>
          <span className={styles.navIcon}>👨‍🚀</span> 
          <span>{lang === 'vi' ? 'DOANH TRẠI' : 'BARRACKS'}</span>
        </button>
        
        <button className={styles.navBtn} onClick={() => setScreen('shop_campaign')}>
            <span className={styles.navIcon}>🛒</span> 
            <span>{lang === 'vi' ? 'CHỢ TIẾP TẾ' : 'SUPPLY'}</span>
        </button>

        <button className={`${styles.navBtn} ${styles.eventBtn}`} onClick={handleNotImplemented}>
          <span className={styles.navIcon}>✨</span> 
          <span>{lang === 'vi' ? 'SỰ KIỆN' : 'EVENTS'}</span>
        </button>
      </motion.div>

    </motion.div>
  );
}