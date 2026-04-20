import React from 'react';
import { motion } from 'framer-motion'; 
import { PILOTS, AIRCRAFTS, GEAR_CATALOG } from '../../constants'; 
import styles from './HQ.module.css';

export default function HQ({ gsRef, setScreen, lang }) {
  const campaignData = gsRef.current?.campaignData;

  if (!campaignData) {
    return (
      <div className={`${styles.container} scrollable-layer`} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#66fcf1', textShadow: '0 0 10px #66fcf1' }}>ĐANG TẢI HỆ THỐNG...</h2>
      </div>
    );
  }

  // Khai báo Icon SVG
  const Icons = {
    Heart: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.03L12 21.35Z" /></svg>),
    Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
    Diamond: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>)
  };

  // Nạp tài nguyên
  const energy = gsRef.current?.energy ?? 50;
  const lives = gsRef.current?.lives ?? 10;
  const coins = gsRef.current?.coins ?? 0;
  const diamonds = gsRef.current?.diamonds ?? 0;
  const isVIP = gsRef.current?.isVIP ?? false;

  const { progress, loadout, items } = campaignData;
  const targetStage = progress.selectedStage || progress.currentStage || 1; 
  const currentPilot = PILOTS.find(p => p.id === loadout.pilot) || PILOTS[0];
  const currentAircraft = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
  
  // Nạp 4 ô trang bị
  const mainGunItem = items[loadout.mainGun];
  const currentMainGun = mainGunItem ? GEAR_CATALOG.mainGun.find(g => g.id === mainGunItem.baseId) : null;

  const wingmanItem = items[loadout.wingman];
  const currentWingman = wingmanItem ? GEAR_CATALOG.wingman.find(g => g.id === wingmanItem.baseId) : null;

  const armorItem = items[loadout.armor];
  const currentArmor = armorItem ? GEAR_CATALOG.armor.find(g => g.id === armorItem.baseId) : null;
  
  const droneItem = items[loadout.drone];
  const currentDrone = droneItem && GEAR_CATALOG.drone ? GEAR_CATALOG.drone.find(g => g.id === droneItem.baseId) : null;
  
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
            <motion.button whileTap={{ scale: 0.9 }} className={styles.backBtn} onClick={() => setScreen('stage_select')}>
              ◀ {lang === 'vi' ? 'BẢN ĐỒ' : 'MAP'}
            </motion.button>
            <h1 className={styles.title}>{lang === 'vi' ? 'TỔNG HÀNH DINH' : 'HQ CENTER'}</h1>
          </div>
          
          <div className={styles.headerRight}>
            <div className={styles.currencyBar}>
              
              <div className={`${styles.currencyChip} ${styles.chipEnergy}`} title={lang === 'vi' ? 'Năng lượng' : 'Energy'}>
                 <div className={styles.currencyIcon}><Icons.Energy /></div>
                 <span className={styles.currencyAmt}>{energy}</span>
              </div>
              
              <div className={`${styles.currencyChip} ${styles.chipLife}`} title={lang === 'vi' ? 'Mạng' : 'Lives'}>
                 <div className={styles.currencyIcon}><Icons.Heart /></div>
                 <span className={styles.currencyAmt}>{isVIP ? '∞' : lives}</span>
              </div>
              
              <div className={`${styles.currencyChip} ${styles.chipCoin}`} title={lang === 'vi' ? 'Xu' : 'Coins'}>
                 <div className={styles.currencyIcon}><Icons.Coin /></div>
                 <span className={styles.currencyAmt}>{coins.toLocaleString()}</span>
              </div>
              
              <div className={`${styles.currencyChip} ${styles.chipGem}`} title={lang === 'vi' ? 'Kim Cương' : 'Diamonds'}>
                 <div className={styles.currencyIcon}><Icons.Diamond /></div>
                 <span className={styles.currencyAmt}>{diamonds.toLocaleString()}</span>
              </div>

            </div>
          </div>
        </motion.div>

        {/* LỰC CHIẾN */}
        <motion.div variants={itemVariants} className={styles.cpSection}>
          <p className={styles.cpTitle}>{lang === 'vi' ? 'Hệ thống đánh giá CP' : 'CP Evaluation System'}</p>
          <h2 className={styles.cpValue}>{progress.combatPower.toLocaleString()}</h2>
        </motion.div>

        {/* KHU VỰC TRƯNG BÀY (HANGAR) */}
        <motion.div variants={itemVariants} className={`${styles.glassPanel} ${styles.hangar}`}>
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
            <img src={currentAircraft.imgHq || '/images/ship_xwing_hq.jpg'} alt={currentAircraft.name[lang]} className={styles.shipImage} />
          </motion.div>
          <h3 className={styles.shipName}>{currentAircraft.name[lang]}</h3>
          
          <div className={styles.shipStats}>
             <span style={{ color: '#2ed573' }}>HP: {currentAircraft.baseHp}</span>
             <span style={{ color: '#ff4757' }}>ATK: {currentAircraft.baseAtk}</span>
          </div>
          
          <div className={styles.pilotBox}>
            <p className={styles.pilotRole}>{lang === 'vi' ? 'Chỉ huy chiến dịch' : 'Mission Commander'}</p>
            <p className={styles.pilotName}>{currentPilot.name[lang]}</p>
            <p className={styles.pilotSkill}>{currentPilot.skillDesc[lang]}</p>
          </div>
        </motion.div>

        {/* TRANG BỊ ĐANG MẶC (LƯỚI GRID) */}
        <motion.div variants={itemVariants} className={styles.loadoutSection}>
          
          {/* SLOT 1: SÚNG CHÍNH */}
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact`} onClick={() => setScreen('inventory')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'SÚNG CHÍNH' : 'PRIMARY GUN'}</p>
             {currentMainGun ? (
               <>
                 {currentMainGun.imgSrc ? <img src={currentMainGun.imgSrc} alt="Gun" className={styles.slotImage} /> : <div className={styles.slotEmoji}>🔫</div>}
                 <div className={styles.slotName}>{currentMainGun.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorGun}`}>Lv.{mainGunItem.level} (ATK: {currentMainGun.baseAtk})</div>
               </>
             ) : (
               <div className={styles.slotEmpty}>[ TRỐNG ]</div>
             )}
          </motion.div>

          {/* SLOT 2: SÚNG PHỤ */}
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact`} onClick={() => setScreen('inventory')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'SÚNG PHỤ' : 'WINGMAN'}</p>
             {currentWingman ? (
               <>
                 {currentWingman.imgSrc ? <img src={currentWingman.imgSrc} alt="Wingman" className={styles.slotImage} /> : <div className={styles.slotEmoji}>🛸</div>}
                 <div className={styles.slotName}>{currentWingman.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorWing}`}>Lv.{wingmanItem.level} (ATK: {currentWingman.baseAtk})</div>
               </>
             ) : (
               <div className={styles.slotEmpty}>[ TRỐNG ]</div>
             )}
          </motion.div>

          {/* SLOT 3: GIÁP BẢO VỆ */}
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact`} onClick={() => setScreen('inventory')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'GIÁP BẢO VỆ' : 'ARMOR'}</p>
             {currentArmor ? (
               <>
                 {currentArmor.imgSrc ? <img src={currentArmor.imgSrc} alt="Armor" className={styles.slotImage} /> : <div className={styles.slotEmoji}>🛡️</div>}
                 <div className={styles.slotName}>{currentArmor.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorArmor}`}>Lv.{armorItem.level} (HP: {currentArmor.baseHp})</div>
               </>
             ) : (
               <div className={styles.slotEmpty}>[ TRỐNG ]</div>
             )}
          </motion.div>

          {/* SLOT 4: VỆ TINH */}
          <motion.div whileTap={{ scale: 0.95 }} className={`${styles.loadoutSlot} hq-interact`} onClick={() => setScreen('inventory')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'VỆ TINH' : 'DRONE'}</p>
             {currentDrone ? (
               <>
                 {currentDrone.imgSrc ? <img src={currentDrone.imgSrc} alt="Drone" className={styles.slotImage} /> : <div className={styles.slotEmoji}>🛰️</div>}
                 <div className={styles.slotName}>{currentDrone.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorDrone}`}>Lv.{droneItem.level} (ATK: {currentDrone.baseAtk})</div>
               </>
             ) : (
               <div className={styles.slotEmpty}>[ TRỐNG ]</div>
             )}
          </motion.div>

        </motion.div>

        {/* NÚT TÍNH NĂNG & XUẤT KÍCH */}
        <motion.div variants={itemVariants} className={styles.actionBtns}>
          <motion.button whileTap={{ scale: 0.95 }} className={`${styles.btnBase} hq-interact`} onClick={() => setScreen('inventory')}>
            📦 {lang === 'vi' ? 'KHO ĐỒ' : 'INVENTORY'}
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} className={`${styles.btnBase} hq-interact`} onClick={() => setScreen('pilots')}>
            👨‍🚀 {lang === 'vi' ? 'NHÂN SỰ' : 'CREW'}
          </motion.button>
        </motion.div>
        
        <motion.div variants={itemVariants} style={{ display: 'flex', justifyContent: 'center' }}>
          <motion.button whileTap={{ scale: 0.95 }} className={`${styles.launchBtn} hq-interact`} onClick={() => setScreen('campaign')}>
            {lang === 'vi' ? `XUẤT KÍCH (ẢI ${targetStage})` : `LAUNCH STAGE ${targetStage}`}
          </motion.button>
        </motion.div>
        
      </div>
    </motion.div>
  );
}