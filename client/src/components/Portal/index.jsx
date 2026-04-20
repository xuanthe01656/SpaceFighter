import React from 'react';
import { Capacitor } from '@capacitor/core';
import { motion } from 'framer-motion';
import { t } from '../../utils/translations'; 
import styles from './Portal.module.css';

export default function Portal({ 
  gsRef, setScreen, currentUser, loginWithGoogle, loginWithApple, 
  logout, deleteAccount, lang, toggleLanguage 
}) {
  const platform = Capacitor.getPlatform();
  const campaignData = gsRef.current?.campaignData;
  const materials = campaignData?.materials || {};
  //const {materials} = campaignData;
  // Lấy chỉ số từ Game State
  const energy = gsRef?.current?.energy ?? 50;
  const lives = gsRef?.current?.lives ?? 10;
  const coins = gsRef?.current?.coins ?? 0;
  const diamonds = gsRef?.current?.diamonds ?? 0;
  const gear =Number(materials.gears) || 0;
  const blueprints = Number(materials.blueprints) || 0;

  const Icons = {
    Heart: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.03L12 21.35Z" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
    Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
    Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
    Blueprint: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>),
    Sacrifice: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
  };
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
  };
  const itemVariants = {
    hidden: { y: -20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring' } }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className={styles.container}>
      {/* THANH HUD TRÊN CÙNG */}
      <div className={styles.backgroundLayer} />
      <div className={styles.topNav}>
        {/* GÓC TRÁI: HỒ SƠ NGƯỜI CHƠI HOẶC TRỐNG */}
        <motion.div variants={itemVariants} className={styles.authSection}>
          {currentUser && (
            <>
              <div className={styles.userPill}>
                <img src={currentUser.photoURL} alt="avatar" className={styles.avatar} referrerPolicy="no-referrer" />
                <span className={styles.userName} title={currentUser.displayName}>
                  {currentUser.displayName}
                </span>
                <button onClick={logout} className={styles.logoutBtn}>
                  {lang === 'vi' ? 'THOÁT' : 'LOGOUT'}
                </button>
              </div>
              <button onClick={deleteAccount} className={styles.deleteBtn}>
                {lang === 'vi' ? 'Xóa tài khoản' : 'Delete Account'}
              </button>
            </>
          )}
        </motion.div>
        {/* GÓC PHẢI: TÀI NGUYÊN (Khung viền Vàng) */}
        <motion.div variants={itemVariants} className={styles.rightSection}>
          <div className={styles.currencyBar}>
            <div className={`${styles.currencyChip} ${styles.chipEnergy}`} title={lang === 'vi' ? 'Năng lượng' : 'Energy'}>
               <div className={styles.currencyIcon}><Icons.Energy /></div>
               <span className={styles.currencyAmt}>{energy}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipCoin}`} title={lang === 'vi' ? 'Xu' : 'Coins'}>
               <div className={styles.currencyIcon}><Icons.Coin /></div>
               <span className={styles.currencyAmt}>{coins.toLocaleString()}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipHeart}`} title={lang === 'vi' ? 'Mạng' : 'Lives'}>
               <div className={styles.currencyIcon}><Icons.Heart /></div>
               <span className={styles.currencyAmt}>{lives}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipGem}`} title={lang === 'vi' ? 'Kim Cương' : 'Diamonds'}>
               <div className={styles.currencyIcon}><Icons.Gem /></div>
               <span className={styles.currencyAmt}>{diamonds.toLocaleString()}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipGear}`} title={lang === 'vi' ? 'Kim Cương' : 'Diamonds'}>
               <div className={styles.currencyIcon}><Icons.Gear /></div>
               <span className={styles.currencyAmt}>{gear.toLocaleString()}</span>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleLanguage} className={styles.langBtn}>
            {lang === 'vi' ? '🇻🇳 TIẾNG VIỆT' : '🇬🇧 ENGLISH'}
          </motion.button>
        </motion.div>
      </div>

      {/* TÊN GAME (Neon tỏa sáng) */}
      <motion.h1 variants={itemVariants} className={styles.title}>
        ASTRO CAT 2.0
      </motion.h1>

      {/* 2 CÁNH CỬA (Lưới 2 cột song song) */}
      <motion.div variants={itemVariants} className={styles.cardsWrapper}>
        {/* CỬA 1: VÔ CỰC */}
        <div 
          className={`portal-card ${styles.card} ${styles.cardEndless}`} 
          onClick={() => setScreen('menu')}
        >
          <div className={`${styles.cardBanner} ${styles.bannerEndless}`}>♾️</div>
          <h2 className={styles.cardTitle} style={{ color: '#00e5ff' }}>VÔ CỰC</h2>
          <p className={styles.desc}>Bay lượn, nhặt xu, thi đấu PvP trực tuyến.</p>
        </div>
        {/* CỬA 2: CHIẾN DỊCH */}
        <div 
          className={`portal-card ${styles.card} ${styles.cardCampaign}`} 
          onClick={() => setScreen('campaign_portal')}
        >
          <div className={`${styles.cardBanner} ${styles.bannerCampaign}`}>🚀</div>
          <h2 className={styles.cardTitle} style={{ color: '#b388ff' }}>CHIẾN DỊCH</h2>
          <p className={styles.desc}>Quản lý Phi cơ, nâng cấp vũ khí, đánh Boss.</p>
        </div>
      </motion.div>
      {/* NÚT ĐĂNG NHẬP Ở DƯỚI CÙNG (Dành cho tài khoản Khách) */}
      {!currentUser && (
        <motion.div variants={itemVariants} className={styles.bottomAction}>
          {platform !== 'ios' && (
            <button onClick={loginWithGoogle} className={styles.actionBtn}>
              <img src="/images/google.png" alt="G" style={{ width: '18px' }} /> GOOGLE LOGIN
            </button>
          )}
          {platform === 'ios' && (
            <button onClick={loginWithApple} className={`${styles.actionBtn} ${styles.actionBtnApple}`}>
              🍎 APPLE LOGIN
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}