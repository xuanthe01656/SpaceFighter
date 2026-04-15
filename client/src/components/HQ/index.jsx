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

  const energy = gsRef.current?.energy ?? 50;
  const lives = gsRef.current?.lives ?? 10;
  const coins = gsRef.current?.coins ?? 0;
  const diamonds = gsRef.current?.diamonds ?? 0;
  const isVIP = gsRef.current?.isVIP ?? false;

  const { progress, loadout, items } = campaignData;
  const currentPilot = PILOTS.find(p => p.id === loadout.pilot) || PILOTS[0];
  const currentAircraft = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
  
  // 1. ĐỌC SÚNG CHÍNH
  const mainGunItem = items[loadout.mainGun];
  const currentMainGun = mainGunItem ? GEAR_CATALOG.mainGun.find(g => g.id === mainGunItem.baseId) : null;

  // 2. ĐỌC SÚNG PHỤ (WINGMAN)
  const wingmanItem = items[loadout.wingman];
  const currentWingman = wingmanItem ? GEAR_CATALOG.wingman.find(g => g.id === wingmanItem.baseId) : null;

  // 3. ĐỌC GIÁP (ARMOR)
  const armorItem = items[loadout.armor];
  const currentArmor = armorItem ? GEAR_CATALOG.armor.find(g => g.id === armorItem.baseId) : null;

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      className={`${styles.container} scrollable-layer`}
      initial="hidden" animate="visible" transition={{ staggerChildren: 0.1 }} 
    >
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

        {/* KHU VỰC TRƯNG BÀY */}
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

        {/* TRANG BỊ ĐANG MẶC (ĐÃ CẬP NHẬT ĐẦY ĐỦ 3 SLOT) */}
        <motion.div variants={itemVariants} className={styles.loadoutSection} style={{ flexWrap: 'wrap' }}>
          
          {/* SLOT 1: SÚNG CHÍNH */}
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact ${styles.glassPanel}`}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'SÚNG CHÍNH' : 'PRIMARY GUN'}</p>
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

          {/* SLOT 2: SÚNG PHỤ (WINGMAN) */}
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact ${styles.glassPanel}`}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'SÚNG PHỤ' : 'WINGMAN'}</p>
             {currentWingman ? (
               <>
                 <div style={{ fontSize: 'clamp(28px, 6vw, 35px)', marginBottom: '10px' }}>🛸</div>
                 <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>{currentWingman.name[lang]}</div>
                 <div style={{ color: '#b388ff', fontSize: '14px', marginTop: '5px' }}>Lv.{wingmanItem.level} (ATK: {currentWingman.baseAtk})</div>
               </>
             ) : (
               <div style={{ color: '#555', fontSize: '16px', marginTop: '20px' }}>[ TRỐNG ]</div>
             )}
          </motion.div>

          {/* SLOT 3: GIÁP (ARMOR) */}
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact ${styles.glassPanel}`}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'GIÁP BẢO VỆ' : 'ARMOR'}</p>
             {currentArmor ? (
               <>
                 <div style={{ fontSize: 'clamp(28px, 6vw, 35px)', marginBottom: '10px' }}>🛡️</div>
                 <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>{currentArmor.name[lang]}</div>
                 <div style={{ color: '#2ed573', fontSize: '14px', marginTop: '5px' }}>Lv.{armorItem.level} (HP: {currentArmor.baseHp})</div>
               </>
             ) : (
               <div style={{ color: '#555', fontSize: '16px', marginTop: '20px' }}>[ TRỐNG ]</div>
             )}
          </motion.div>

        </motion.div>

        {/* DANH SÁCH TÍNH NĂNG */}
        <motion.div variants={itemVariants} className={styles.actionBtns}>
          <motion.button whileTap={{ scale: 0.95 }} className={`${styles.btnBase} hq-interact`} onClick={() => setScreen('inventory')}>
            📦 {lang === 'vi' ? 'KHO ĐỒ' : 'INVENTORY'}
          </motion.button>
          <motion.button 
            whileTap={{ scale: 0.95 }} className={`${styles.btnBase} hq-interact`}
            onClick={() => setScreen('pilots')} // 👇 Đổi từ hq sang pilots
          >
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