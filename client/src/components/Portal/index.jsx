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

  // Lấy chỉ số từ Game State
  const energy = gsRef?.current?.energy ?? 50;
  const lives = gsRef?.current?.lives ?? 10;
  const coins = gsRef?.current?.coins ?? 0;
  const diamonds = gsRef?.current?.diamonds ?? 0;

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
          <div className={styles.resourceHud}>
            <div className={styles.resItem} title={lang === 'vi' ? 'Năng lượng' : 'Energy'}>
               <span className={styles.resEnergy} style={{color: '#FFD700', textShadow: '0 0 10px rgba(255,215,0,0.6)'}}>⚡ {energy}</span>
            </div>
            <div className={styles.resItem} title={lang === 'vi' ? 'Xu' : 'Coins'}>
               <span className={styles.resCoin}>🪙 {coins}</span>
            </div>
            <div className={styles.resItem} title={lang === 'vi' ? 'Mạng' : 'Lives'}>
               <span className={styles.resEnergy}>❤️ {lives}</span>
            </div>
            <div className={styles.resItem} title={lang === 'vi' ? 'Kim Cương' : 'Diamonds'}>
               <span className={styles.resDiamond}>💎 {diamonds}</span>
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
        
        <motion.div 
          whileTap={{ scale: 0.95 }}
          className={`portal-card ${styles.card} ${styles.cardEndless}`} 
          onClick={() => setScreen('menu')}
        >
          {/* KHUNG ẢNH THAY THẾ CHO ICON CŨ */}
          <div className={`${styles.cardBanner} ${styles.bannerEndless}`}>
             ♾️
          </div>
          <h2 className={styles.cardTitle} style={{ color: '#00e5ff' }}>{lang === 'vi' ? 'VÔ CỰC' : 'ENDLESS MODE'}</h2>
          <p className={styles.desc}>{lang === 'vi' ? 'Bay lượn, nhặt xu, thi đấu PvP trực tuyến.' : 'Fly, collect coins, play online PvP.'}</p>
        </motion.div>

        <motion.div 
          whileTap={{ scale: 0.95 }}
          className={`portal-card ${styles.card} ${styles.cardCampaign}`} 
          onClick={() => setScreen('hq')}
        >
          <div className={`${styles.cardBanner} ${styles.bannerCampaign}`}>
             🚀
          </div>
          <h2 className={styles.cardTitle} style={{ color: '#b388ff' }}>{lang === 'vi' ? 'CHIẾN DỊCH' : 'CAMPAIGN'}</h2>
          <p className={styles.desc}>{lang === 'vi' ? 'Quản lý Phi cơ, nâng cấp vũ khí, đánh Boss.' : 'Manage Aircrafts, upgrade gear, defeat Bosses.'}</p>
        </motion.div>

      </motion.div>

      {/* NÚT ĐĂNG NHẬP Ở DƯỚI CÙNG (Dành cho tài khoản Khách) */}
      {!currentUser && (
        <motion.div variants={itemVariants} className={styles.bottomAction}>
          {platform !== 'ios' && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={loginWithGoogle} className={styles.actionBtn}>
              <img src="/images/google.png" alt="G" style={{ width: '20px' }} />
              {lang === 'vi' ? 'GOOGLE LOGIN' : 'GOOGLE LOGIN'}
            </motion.button>
          )}
          {platform === 'ios' && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={loginWithApple} className={`${styles.actionBtn} ${styles.actionBtnApple}`}>
              🍎 {lang === 'vi' ? 'APPLE LOGIN' : 'APPLE LOGIN'}
            </motion.button>
          )}
        </motion.div>
      )}

    </motion.div>
  );
}