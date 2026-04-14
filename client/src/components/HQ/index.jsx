import React from 'react';
import { motion } from 'framer-motion'; 
import { PILOTS, AIRCRAFTS, GEAR_CATALOG } from '../../constants'; 
import styles from './HQ.module.css';

export default function HQ({ gsRef, setScreen, lang }) {
  const campaignData = gsRef.current?.campaignData;

  if (!campaignData) {
    return (
      <div className={`${styles.container} scrollable-layer`} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#66fcf1' }}>ĐANG TẢI HỆ THỐNG...</h2>
      </div>
    );
  }

  // Phân tách dữ liệu Cửa Hàng / Tài sản
  const energy = gsRef.current?.energy ?? 50;
  const lives = gsRef.current?.lives ?? 10;
  const coins = gsRef.current?.coins ?? 0;
  const diamonds = gsRef.current?.diamonds ?? 0;
  const isVIP = gsRef.current?.isVIP ?? false;

  const { progress, loadout, items } = campaignData;
  const currentPilot = PILOTS.find(p => p.id === loadout.pilot) || PILOTS[0];
  const currentAircraft = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
  const mainGunItem = items[loadout.mainGun];
  const currentMainGun = mainGunItem ? GEAR_CATALOG.mainGun.find(g => g.id === mainGunItem.baseId) : null;

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      className={`${styles.container} scrollable-layer`}
      initial="hidden" animate="visible" transition={{ staggerChildren: 0.1 }} 
    >
      {/* KHUNG BỌC BẢO VỆ GIAO DIỆN (CHỐNG DỊ DẠNG TRÊN PC) */}
      <div className={styles.contentWrapper}>
        
        {/* HEADER & TÀI NGUYÊN */}
        <motion.div variants={itemVariants} className={styles.topSection}>
          <div className={styles.headerLeft}>
            <motion.button whileTap={{ scale: 0.9 }} className={styles.backBtn} onClick={() => setScreen('portal')}>
              ◀ {lang === 'vi' ? 'SẢNH' : 'PORTAL'}
            </motion.button>
            <h1 className={styles.title}>{lang === 'vi' ? 'TỔNG HÀNH DINH' : 'HQ CENTER'}</h1>
          </div>
          
          {/* BẢNG TÀI NGUYÊN (HUD) */}
          <div className={styles.headerRight}>
            <div className={styles.resourceHud}>
              <div className={styles.resItem} title={lang === 'vi' ? 'Năng lượng' : 'Energy'}>
                 <span className={styles.resEnergy}>⚡ {energy}</span>
              </div>
              <div className={styles.resItem} title={lang === 'vi' ? 'Mạng' : 'Lives'}>
                 <span className={styles.resLife}>❤️ {isVIP ? '∞' : lives}</span>
              </div>
              <div className={styles.resItem} title={lang === 'vi' ? 'Xu' : 'Coins'}>
                 <span className={styles.resCoin}>🪙 {coins}</span>
              </div>
              <div className={styles.resItem} title={lang === 'vi' ? 'Kim Cương' : 'Diamonds'}>
                 <span className={styles.resDiamond}>💎 {diamonds}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* LỰC CHIẾN */}
        <motion.div variants={itemVariants} className={styles.cpSection}>
          <p className={styles.cpTitle}>{lang === 'vi' ? 'Hệ thống đánh giá CP' : 'CP Evaluation System'}</p>
          <h2 className={styles.cpValue}>{progress.combatPower.toLocaleString()}</h2>
        </motion.div>

        {/* KHU VỰC TRƯNG BÀY (KÍNH HOLOGRAM) */}
        <motion.div variants={itemVariants} className={`${styles.glassPanel} ${styles.hangar}`}>
          <motion.div 
            animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            className={styles.shipIcon}
          >🚀</motion.div>
          <h3 className={styles.shipName}>{currentAircraft.name[lang]}</h3>
          <div className={styles.shipStats}>
             <span style={{ color: '#2ed573' }}>HP: {currentAircraft.baseHp}</span>
             <span style={{ color: '#ff4757' }}>ATK: {currentAircraft.baseAtk}</span>
          </div>
          <div className={styles.pilotBox}>
            <p className={styles.pilotRole}>{lang === 'vi' ? 'Chỉ huy chiến dịch' : 'Mission Commander'}</p>
            <p className={styles.pilotName}>{currentPilot.name[lang]}</p>
            <p style={{ color: '#FFD700', margin: '5px 0 0 0', fontSize: '15px' }}>{currentPilot.skillDesc[lang]}</p>
          </div>
        </motion.div>

        {/* TRANG BỊ */}
        <motion.div variants={itemVariants} className={styles.loadoutSection}>
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact ${styles.glassPanel}`}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'VŨ KHÍ CHÍNH' : 'PRIMARY WEAPON'}</p>
             {currentMainGun ? (
               <>
                 <div style={{ fontSize: 'clamp(28px, 6vw, 35px)', marginBottom: '10px' }}>🔫</div>
                 <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>{currentMainGun.name[lang]}</div>
                 <div style={{ color: '#0abde3', fontSize: '14px', marginTop: '5px' }}>Lv.{mainGunItem.level} (ATK: {currentMainGun.baseAtk})</div>
               </>
             ) : (
               <div style={{ color: '#555', fontSize: '16px', marginTop: '20px' }}>[ TRỐNG ]</div>
             )}
          </motion.div>
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact ${styles.glassPanel}`}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'VŨ KHÍ PHỤ' : 'SECONDARY WEAPON'}</p>
             <div style={{ color: '#555', fontSize: '16px', marginTop: '30px' }}>[ TRỐNG ]</div>
          </motion.div>
        </motion.div>

        {/* DANH SÁCH TÍNH NĂNG */}
        <motion.div variants={itemVariants} className={styles.actionBtns}>
          <motion.button whileTap={{ scale: 0.95 }} className={`${styles.btnBase} hq-interact`} onClick={() => setScreen('inventory')}>
            📦 {lang === 'vi' ? 'KHO ĐỒ' : 'INVENTORY'}
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} className={`${styles.btnBase} hq-interact`}>
            👨‍🚀 {lang === 'vi' ? 'NHÂN SỰ' : 'CREW'}
          </motion.button>
        </motion.div>

        {/* NÚT XUẤT KÍCH */}
        <motion.div variants={itemVariants} style={{ display: 'flex', justifyContent: 'center' }}>
          <motion.button whileTap={{ scale: 0.95 }} className={`${styles.launchBtn} hq-interact`}>
            {lang === 'vi' ? `KHỞI ĐỘNG (ẢI ${progress.currentStage})` : `INITIATE STAGE ${progress.currentStage}`}
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}