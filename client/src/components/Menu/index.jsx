import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'framer-motion';
// Lùi 2 cấp vì đang ở src/components/Menu/
import { t } from '../../utils/translations';
import styles from './Menu.module.css';

export default function Menu({ 
  currentUser, uiUpdates, topRecords, startGame, setScreen, 
  loginWithGoogle, loginWithApple, logout, deleteAccount, 
  openShop, openLeaderboard, lang, toggleLanguage
}) {
  const text = t[lang];
  const platform = Capacitor.getPlatform();
  const [showHelp, setShowHelp] = useState(false);

  // Hiệu ứng Animation chung
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring' } }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className={`${styles.container} scrollable-layer`}>
      
      {/* GÓC TRÊN TRÁI: BACK & HELP */}
      <motion.div variants={itemVariants} className={styles.topNav}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setScreen('portal')} className={styles.backBtn}>
          ◀ {lang === 'vi' ? 'SẢNH' : 'PORTAL'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowHelp(true)} className={styles.helpBtn}>
          ?
        </motion.button>
      </motion.div>

      {/* GÓC TRÊN PHẢI: USER, TÀI NGUYÊN & NGÔN NGỮ */}
      <motion.div variants={itemVariants} className={styles.rightNav}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={toggleLanguage} className={styles.langBtn}>
          {lang === 'vi' ? '🇻🇳 VN' : '🇬🇧 EN'}
        </motion.button>

        {currentUser ? (
          <>
            <div className={styles.userBox}>
              <img src={currentUser.photoURL} alt="avatar" className={styles.avatar} referrerPolicy="no-referrer" />
              <span className={styles.userName} title={currentUser.displayName}>{currentUser.displayName}</span>
              <button onClick={logout} className={styles.logoutBtn}>{text.logout}</button>
            </div>
            {/* THÊM KIM CƯƠNG VÀ ĐỒNG HỒ ĐẾM NGƯỢC VÀO ĐÂY */}
            <div style={{ display: 'flex', gap: '5px', width: '100%', justifyContent: 'flex-end' }}>
              <div className={`${styles.hudBox} ${styles.hudCoin}`}>
                💎 {uiUpdates.diamonds || 0}
              </div>
              <div className={`${styles.hudBox} ${styles.hudCoin}`}>
                🪙 {uiUpdates.coins || 0}
              </div>
              
              <div className={`${styles.hudBox} ${styles.hudLife}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0, padding: '2px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  ❤️ {uiUpdates.isVIP ? '∞' : `${uiUpdates.lives || 0}/10`}
                </div>
                {!uiUpdates.isVIP && uiUpdates.nextLifeTime && (
                  <span style={{ fontSize: '13px', color: '#ffb8b8', fontWeight: 'normal', marginTop: '-2px' }}>
                    {uiUpdates.nextLifeTime}
                  </span>
                )}
              </div>
            </div>
            <button onClick={deleteAccount} className={styles.deleteBtn}>
              {lang === 'vi' ? 'Xóa tài khoản' : 'Delete Account'}
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {platform !== 'ios' && (
              <button onClick={loginWithGoogle} style={{ padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', fontFamily: "inherit" }}>
                <img src="/images/google.png" alt="G" style={{ width: '15px', marginRight: '5px' }} /> {text.login}
              </button>
            )}
            {platform === 'ios' && (
              <button onClick={loginWithApple} style={{ background: '#000', color: '#fff', padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', fontFamily: "inherit" }}>
                🍎 Đăng nhập Apple
              </button>
            )}
          </div>
        )}
      </motion.div>

      {/* TIÊU ĐỀ */}
      <motion.div variants={itemVariants} style={{ textAlign: 'center', marginTop: 'auto' }}>
        <h1 className={styles.title}>ASTRO CAT 2.0</h1>
        <h2 className={styles.subtitle}>{lang === 'vi' ? 'Chế Độ Vô Cực' : 'Endless Mode'}</h2>
      </motion.div>

      {/* CÁC NÚT MENU CHÍNH (ĐÃ KHÔI PHỤC CLASS CŨ CỦA BẠN) */}
      <motion.div variants={itemVariants} className="menu-grid" style={{ marginBottom: '10px' }}>
        <motion.button whileTap={{ scale: 0.95 }} className="btn btn-red" onClick={() => startGame('single')}>
          {text.playSingle}
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} className="btn btn-purple" onClick={() => {
          if (!currentUser) return toast.error(text.loginReqPvP, { duration: 4000 });
          setScreen('lobby');
        }}>
          {text.playOnline}
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} className="btn btn-blue" onClick={openShop}>
          {text.shop}
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} className="btn btn-green" onClick={() => openLeaderboard('single')}>
          {text.leaderboard}
        </motion.button>
        
        {!Capacitor.isNativePlatform() && (
          <motion.button 
            whileTap={{ scale: 0.95 }} 
            className="btn" 
            onClick={() => window.open("https://play.google.com/store/apps/details?id=com.ban.astrocat", "_blank")}
            style={{ 
              marginTop: 'clamp(5px, 2vh, 15px)', background: 'linear-gradient(45deg, #2ed573, #7bed9f)', 
              color: '#000', border: '2px solid #fff', boxShadow: '0 0 15px rgba(46, 213, 115, 0.5)'
            }}
          >
            {text.downloadApp}
          </motion.button>
        )}
      </motion.div>

      {/* BẢNG KỶ LỤC CÁ NHÂN */}
      <motion.div variants={itemVariants} className={styles.recordBoard} style={{ marginBottom: 'auto' }}>
        <div style={{ color: '#fff', marginBottom: '5px' }}>
          {text.topSingle} <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{topRecords.single}</span>
        </div>
        <div style={{ color: '#fff' }}>
          {text.topPvP} <span style={{ color: '#00FFFF', fontWeight: 'bold' }}>{topRecords.pvp}</span>
        </div>
      </motion.div>

      {/* POPUP HƯỚNG DẪN */}
      <AnimatePresence>
        {showHelp && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.helpOverlay}>
             <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} className={styles.helpModal}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #1f2833', paddingBottom: '10px', marginBottom: '15px' }}>
                  <h2 style={{ color: '#0abde3', margin: 0 }}>{lang === 'vi' ? 'HƯỚNG DẪN TÂN THỦ' : 'HOW TO PLAY'}</h2>
                  <button onClick={() => setShowHelp(false)} style={{ background: '#ff4757', color: '#fff', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer' }}>✕</button>
                </div>
                <div className="scrollable-layer" style={{ overflowY: 'auto', paddingRight: '10px' }}>
                  <p>🎮 <b>{lang === 'vi' ? 'Cách Chơi:' : 'Controls:'}</b> {lang === 'vi' ? 'Chạm vào màn hình để bay.' : 'Tap screen to fly.'}</p>
                  <p>🪙 <b>{lang === 'vi' ? 'Đồng Xu:' : 'Coins:'}</b> {lang === 'vi' ? 'Dùng để mua Skin, hồi sinh.' : 'Used to buy Skins, revive.'}</p>
                  <p>🛡️ <b>{lang === 'vi' ? 'Khiên:' : 'Shield:'}</b> {lang === 'vi' ? 'Bất tử đâm xuyên cột.' : 'Invincibility.'}</p>
                  <p>⭐ <b>{lang === 'vi' ? 'Sao:' : 'Star:'}</b> {lang === 'vi' ? 'Cộng 5 điểm.' : 'Adds 5 points.'}</p>
                  <p>❤️ <b>{lang === 'vi' ? 'Mạng:' : 'Lives:'}</b> {lang === 'vi' ? 'Hồi 1 mạng / 2 tiếng.' : '1 life / 2 hours.'}</p>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}