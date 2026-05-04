import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; 
import toast from 'react-hot-toast';
import { PILOTS, AIRCRAFTS, GEAR_CATALOG } from '../../constants'; 
import styles from './HQ.module.css';

// Hàm tiện ích: Định dạng số liệu ngắn gọn (1K, 1.5M, 2B) đồng bộ toàn App
const formatCompactNumber = (number) => {
  if (number < 1000) return number.toString();
  const suffixes = ["", "K", "M", "B", "T"];
  const suffixNum = Math.floor(("" + number).length / 3);
  let shortValue = parseFloat((suffixNum !== 0 ? (number / Math.pow(1000, suffixNum)) : number).toPrecision(3));
  if (shortValue % 1 !== 0) shortValue = shortValue.toFixed(1);
  return shortValue + suffixes[suffixNum];
};

export default function HQ({ gsRef, setScreen, lang, saveUserProfile }) {
  const campaignData = gsRef.current?.campaignData;
  const [refreshTick, setRefreshTick] = useState(0);
  
  const [selectingSlot, setSelectingSlot] = useState(null); 

  if (!campaignData) {
    return (
      <div className={`${styles.container} scrollable-layer`} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#66fcf1', textShadow: '0 0 10px #66fcf1' }}>ĐANG TẢI HỆ THỐNG...</h2>
      </div>
    );
  }

  // --- ĐỒNG BỘ HỆ THỐNG SVG ICONS CHUẨN SCI-FI ---
  const Icons = {
    Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
    Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
    Blueprint: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>),
    Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
    
    // Icons cho Trang Bị
    Gun: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>,
    Wingman: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 22 12 17 22 22 12 2"/></svg>,
    Shield: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    Drone: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3"/></svg>,
    
    // Icons Hành động
    Bag: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2" ry="2"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
    Pilot: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  };
 
  const { progress, loadout, items, materials } = campaignData;
  const targetStage = progress.selectedStage || progress.currentStage || 1; 
  const currentPilot = PILOTS.find(p => p.id === loadout.pilot) || PILOTS[0];
  const currentAircraft = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
  const aircraftInfo = campaignData.ownedAircrafts?.[loadout.aircraft] || { level: 1, stars: 1 };

  const energy = gsRef.current?.energy ?? 50;
  const coins = gsRef.current?.coins ?? 0;
  const diamonds = gsRef.current?.diamonds ?? 0;
  const gear = Number(materials?.gears) || 0; 
  const blueprints = Number(materials?.blueprints) || 0;

  const mainGunItem = items[loadout.mainGun];
  const currentMainGun = mainGunItem ? GEAR_CATALOG.mainGun.find(g => g.id === mainGunItem.baseId) : null;
  const wingmanItem = items[loadout.wingman];
  const currentWingman = wingmanItem ? GEAR_CATALOG.wingman.find(g => g.id === wingmanItem.baseId) : null;
  const armorItem = items[loadout.armor];
  const currentArmor = armorItem ? GEAR_CATALOG.armor.find(g => g.id === armorItem.baseId) : null;
  const droneItem = items[loadout.drone];
  const currentDrone = droneItem && GEAR_CATALOG.drone ? GEAR_CATALOG.drone.find(g => g.id === droneItem.baseId) : null;
  
  const getDynamicStat = (baseStat, level, rarity, isHp = false) => {
    if (!baseStat) return 0;
    const perLevel = Math.max(isHp ? 5 : 1, Math.round(baseStat * 0.1 + (rarity || 1) * (isHp ? 10 : 2)));
    return baseStat + (perLevel * ((level || 1) - 1));
  };

  let totalAtk = 0; let totalHp = 0;
  const acLevel = aircraftInfo.level || 1;
  totalAtk += Math.floor((currentAircraft.baseAtk || 0) * (1 + (acLevel - 1) * 0.05));
  totalHp += Math.floor((currentAircraft.baseHp || 0) * (1 + (acLevel - 1) * 0.05));
  const totalArmor = Math.floor((currentAircraft.baseArmor || 0) * (1 + (acLevel - 1) * 0.05));

  if (currentMainGun) totalAtk += getDynamicStat(currentMainGun.baseAtk, mainGunItem?.level, mainGunItem?.rarity);
  if (currentWingman) totalAtk += getDynamicStat(currentWingman.baseAtk, wingmanItem?.level, wingmanItem?.rarity);
  if (currentDrone) totalAtk += getDynamicStat(currentDrone.baseAtk, droneItem?.level, droneItem?.rarity);
  if (currentArmor) totalHp += getDynamicStat(currentArmor.baseHp, armorItem?.level, armorItem?.rarity, true);

  // ==========================================
  // THUẬT TOÁN TÍNH CP THEO PASSIVE MỚI
  // ==========================================
  let atkMultiplier = 1.0;
  let hpMultiplier = 1.0;
  let extraCP = 0;

  if (currentPilot.passive) {
    const val = currentPilot.value;
    if (currentPilot.passive === 'main_damage_boost') atkMultiplier = 1 + val;
    if (currentPilot.passive === 'damage_reduction') hpMultiplier = 1 / (1 - val); // Giảm sát thương tương đương tăng máu hiệu dụng
    
    // Các chỉ số phụ khác (Né, Chí mạng, Hồi máu) cộng điểm CP cố định hoặc theo độ hiếm
    if (['dodge_and_crit', 'hp_regen', 'nova_shield', 'bullet_duplicate'].includes(currentPilot.passive)) {
        extraCP = (currentPilot.rarity || 1) * 500;
    }
  }

  const finalAtk = Math.floor(totalAtk * atkMultiplier);
  const finalHp = Math.floor(totalHp * hpMultiplier);

  const calculatedCP = Math.floor((finalAtk * 3) + (finalHp * 0.5) + (totalArmor * 10)) + extraCP;

  const getAvailableItemsForPopup = () => {
    if (selectingSlot === 'aircraft') {
      return Object.keys(campaignData.ownedAircrafts || {}).map(id => {
        const base = AIRCRAFTS.find(a => a.id === id);
        const acData = campaignData.ownedAircrafts[id];
        const lvl = typeof acData === 'object' ? (acData.level || 1) : 1;
        return {
          uuid: id, id: id, type: 'aircraft', level: lvl, rarity: base?.tier || 1,
          name: base?.name, imgSrc: base?.imgHq || base?.imgTop, 
          stats: `ATK: ${Math.floor(base.baseAtk * (1 + (lvl-1)*0.05))} | HP: ${Math.floor(base.baseHp * (1 + (lvl-1)*0.05))}`
        };
      });
    }

    return Object.keys(items).filter(uuid => items[uuid].type === selectingSlot).map(uuid => {
       const item = items[uuid];
       const base = GEAR_CATALOG[item.type]?.find(g => g.id === item.baseId);
       const isHp = item.type === 'armor';
       const statVal = getDynamicStat(isHp ? base?.baseHp : base?.baseAtk, item.level, item.rarity, isHp);
       return {
          uuid, ...item,
          name: base?.name, imgSrc: base?.imgSrc,
          stats: `${isHp ? 'HP' : 'ATK'}: ${statVal}`
       };
    }).sort((a, b) => (b.rarity || 1) - (a.rarity || 1));
  };

  const handleEquipFromPopup = (uuid) => {
    if (selectingSlot === 'aircraft') {
        gsRef.current.campaignData.loadout.aircraft = uuid;
    } else {
        gsRef.current.campaignData.loadout[selectingSlot] = uuid;
    }
    if (saveUserProfile) saveUserProfile();
    setRefreshTick(r => r + 1);
    setSelectingSlot(null);
    toast.success(lang === 'vi' ? 'Đã đổi trang bị!' : 'Equipped successfully!');
  };

  const handleUnequipFromPopup = () => {
    if (selectingSlot === 'aircraft') return; 
    gsRef.current.campaignData.loadout[selectingSlot] = '';
    if (saveUserProfile) saveUserProfile();
    setRefreshTick(r => r + 1);
    setSelectingSlot(null);
    toast.success(lang === 'vi' ? 'Đã tháo trang bị!' : 'Unequipped!');
  };

  const slotTitles = {
    aircraft: { vi: 'CHỌN PHI CƠ', en: 'SELECT AIRCRAFT' },
    mainGun: { vi: 'CHỌN SÚNG CHÍNH', en: 'SELECT PRIMARY GUN' },
    wingman: { vi: 'CHỌN SÚNG PHỤ', en: 'SELECT WINGMAN' },
    armor: { vi: 'CHỌN GIÁP BẢO VỆ', en: 'SELECT ARMOR' },
    drone: { vi: 'CHỌN VỆ TINH', en: 'SELECT DRONE' }
  };

  const popupItemsList = selectingSlot ? getAvailableItemsForPopup() : [];
  const currentlyEquippedId = selectingSlot ? loadout[selectingSlot] : null;

  return (
    <motion.div className={`${styles.container} scrollable-layer`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} >
      <div className={styles.contentWrapper}>
        
        <div className={styles.topSection}>
          <div className={styles.headerLeft}>
            <motion.button whileTap={{ scale: 0.9 }} className={styles.backBtn} onClick={() => setScreen('stage_select')}>
              ◀ {lang === 'vi' ? 'ẢI' : 'STAGES'}
            </motion.button>
            <h1 className={styles.title}>{lang === 'vi' ? 'TỔNG HÀNH DINH' : 'HQ CENTER'}</h1>
          </div>
          
          <div className={styles.headerRight}>
            <div className={styles.currencyBar}>
              <div className={`${styles.currencyChip} ${styles.chipEnergy}`}><div className={styles.currencyIcon}><Icons.Energy /></div><span className={styles.currencyAmt}>{formatCompactNumber(energy)}</span></div>
              <div className={`${styles.currencyChip} ${styles.chipCoin}`}><div className={styles.currencyIcon}><Icons.Coin /></div><span className={styles.currencyAmt}>{formatCompactNumber(coins)}</span></div>
              <div className={`${styles.currencyChip} ${styles.chipGem}`}><div className={styles.currencyIcon}><Icons.Gem /></div><span className={styles.currencyAmt}>{formatCompactNumber(diamonds)}</span></div>
              <div className={`${styles.currencyChip} ${styles.chipBlueprint}`}><div className={styles.currencyIcon}><Icons.Blueprint /></div><span className={styles.currencyAmt}>{formatCompactNumber(blueprints)}</span></div>
              <div className={`${styles.currencyChip} ${styles.chipGear}`}><div className={styles.currencyIcon}><Icons.Gear /></div><span className={styles.currencyAmt}>{formatCompactNumber(gear)}</span></div>
            </div>
          </div>
        </div>

        <div className={styles.cpSection}>
          <p className={styles.cpTitle}>{lang === 'vi' ? 'Hệ thống đánh giá Lực Chiến (CP)' : 'Combat Power (CP) Evaluation'}</p>
          <h2 className={styles.cpValue}>{calculatedCP.toLocaleString()}</h2>
        </div>

        <motion.div className={`${styles.glassPanel} ${styles.hangar}`} onClick={() => setSelectingSlot('aircraft')} whileTap={{ scale: 0.98 }}>
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
            <img src={currentAircraft.imgHq || '/images/ship_xwing_hq.jpg'} alt={currentAircraft.name[lang]} className={styles.shipImage} />
          </motion.div>
          <h3 className={styles.shipName}>{currentAircraft.name[lang]} (Lv.{aircraftInfo.level})</h3>
          
          <div className={styles.shipStats}>
             <span style={{ color: '#2ed573' }}>HP: {Math.floor((currentAircraft.baseHp || 0) * (1 + (acLevel - 1) * 0.05))}</span>
             <span style={{ color: '#ff4757' }}>ATK: {Math.floor((currentAircraft.baseAtk || 0) * (1 + (acLevel - 1) * 0.05))}</span>
          </div>
          
          <div className={styles.pilotBox}>
            <p className={styles.pilotRole}>{lang === 'vi' ? 'Chỉ huy chiến dịch' : 'Mission Commander'}</p>
            <p className={styles.pilotName}>{currentPilot.name[lang]}</p>
            <p className={styles.pilotSkill}>{currentPilot.skillDesc[lang]}</p>
          </div>
        </motion.div>

        <div className={styles.loadoutSection}>
          <motion.div whileTap={{ scale: 0.95 }} className={styles.loadoutSlot} onClick={() => setSelectingSlot('mainGun')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'SÚNG CHÍNH' : 'PRIMARY GUN'}</p>
             {currentMainGun ? (
               <>
                 {currentMainGun.imgSrc ? <img src={currentMainGun.imgSrc} alt="Gun" className={styles.slotImage} /> : <div className={styles.slotEmoji} style={{width:'40px', height:'40px'}}><Icons.Gun /></div>}
                 <div className={styles.slotName}>{currentMainGun.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorGun}`}>Lv.{mainGunItem?.level || 1} (ATK: {getDynamicStat(currentMainGun.baseAtk, mainGunItem?.level, mainGunItem?.rarity)})</div>
               </>
             ) : <div className={styles.slotEmpty}>[ TRỐNG ]</div>}
          </motion.div>

          <motion.div whileTap={{ scale: 0.95 }} className={styles.loadoutSlot} onClick={() => setSelectingSlot('wingman')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'SÚNG PHỤ' : 'WINGMAN'}</p>
             {currentWingman ? (
               <>
                 {currentWingman.imgSrc ? <img src={currentWingman.imgSrc} alt="Wingman" className={styles.slotImage} /> : <div className={styles.slotEmoji} style={{width:'40px', height:'40px'}}><Icons.Wingman /></div>}
                 <div className={styles.slotName}>{currentWingman.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorWing}`}>Lv.{wingmanItem?.level || 1} (ATK: {getDynamicStat(currentWingman.baseAtk, wingmanItem?.level, wingmanItem?.rarity)})</div>
               </>
             ) : <div className={styles.slotEmpty}>[ TRỐNG ]</div>}
          </motion.div>

          <motion.div whileTap={{ scale: 0.95 }} className={styles.loadoutSlot} onClick={() => setSelectingSlot('armor')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'GIÁP BẢO VỆ' : 'ARMOR'}</p>
             {currentArmor ? (
               <>
                 {currentArmor.imgSrc ? <img src={currentArmor.imgSrc} alt="Armor" className={styles.slotImage} /> : <div className={styles.slotEmoji} style={{width:'40px', height:'40px'}}><Icons.Shield /></div>}
                 <div className={styles.slotName}>{currentArmor.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorArmor}`}>Lv.{armorItem?.level || 1} (HP: {getDynamicStat(currentArmor.baseHp, armorItem?.level, armorItem?.rarity, true)})</div>
               </>
             ) : <div className={styles.slotEmpty}>[ TRỐNG ]</div>}
          </motion.div>

          <motion.div whileTap={{ scale: 0.95 }} className={styles.loadoutSlot} onClick={() => setSelectingSlot('drone')}>
             <p className={styles.loadoutLabel}>{lang === 'vi' ? 'VỆ TINH' : 'DRONE'}</p>
             {currentDrone ? (
               <>
                 {currentDrone.imgSrc ? <img src={currentDrone.imgSrc} alt="Drone" className={styles.slotImage} /> : <div className={styles.slotEmoji} style={{width:'40px', height:'40px'}}><Icons.Drone /></div>}
                 <div className={styles.slotName}>{currentDrone.name[lang]}</div>
                 <div className={`${styles.slotLevel} ${styles.colorDrone}`}>Lv.{droneItem?.level || 1} (ATK: {getDynamicStat(currentDrone.baseAtk, droneItem?.level, droneItem?.rarity)})</div>
               </>
             ) : <div className={styles.slotEmpty}>[ TRỐNG ]</div>}
          </motion.div>
        </div>

        <div className={styles.actionBtns}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.btnBase} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}} onClick={() => {gsRef.current.cameFromHQ = true; setScreen('inventory');}}>
            <div style={{width:'22px', height:'22px'}}><Icons.Bag /></div> {lang === 'vi' ? 'KHO TRANG BỊ' : 'INVENTORY'}
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.btnBase} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}} onClick={() => {gsRef.current.cameFromHQ = true; setScreen('pilots')}}>
            <div style={{width:'22px', height:'22px'}}><Icons.Pilot /></div> {lang === 'vi' ? 'NHÂN SỰ' : 'CREW'}
          </motion.button>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.launchBtn} onClick={() => setScreen('campaign')}>
            {lang === 'vi' ? `XUẤT KÍCH (ẢI ${targetStage})` : `LAUNCH STAGE ${targetStage}`}
          </motion.button>
        </div>
        
      </div>

      <AnimatePresence>
        {selectingSlot && (
          <motion.div className={styles.popupOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className={styles.popupModal} initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
              
              <div className={styles.popupHeader}>
                <h3 className={styles.popupTitle}>{slotTitles[selectingSlot][lang]}</h3>
                <button className={styles.popupClose} onClick={() => setSelectingSlot(null)}>✕</button>
              </div>

              <div className={styles.popupBody}>
                {currentlyEquippedId && selectingSlot !== 'aircraft' && (
                   <button className={styles.unequipBtn} onClick={handleUnequipFromPopup}>
                      {lang === 'vi' ? 'THÁO TRANG BỊ HIỆN TẠI' : 'UNEQUIP CURRENT ITEM'}
                   </button>
                )}

                {popupItemsList.length === 0 ? (
                   <div style={{ textAlign: 'center', color: '#64748b', fontSize: '20px', padding: '20px' }}>
                     {lang === 'vi' ? 'KHÔNG CÓ TRANG BỊ NÀO' : 'STORAGE EMPTY'}
                   </div>
                ) : (
                   popupItemsList.map((itm) => {
                     const isEquipped = currentlyEquippedId === itm.uuid;
                     const rColor = itm.rarity === 5 ? '#facc15' : itm.rarity === 4 ? '#c084fc' : itm.rarity === 3 ? '#60a5fa' : itm.rarity === 2 ? '#4ade80' : '#94a3b8';
                     
                     // Chọn SVG tuỳ vào loại trang bị nếu mất ảnh
                     const FallbackIcon = itm.type === 'mainGun' ? Icons.Gun : (itm.type === 'wingman' ? Icons.Wingman : (itm.type === 'armor' ? Icons.Shield : Icons.Drone));

                     return (
                       <div key={itm.uuid} className={`${styles.popupItem} ${isEquipped ? styles.popupItemActive : ''}`} onClick={() => handleEquipFromPopup(itm.uuid)}>
                          
                          <div className={styles.popupItemImgWrap} style={{ border: `1px solid ${rColor}`, boxShadow: `inset 0 0 15px ${rColor}40` }}>
                             {itm.imgSrc ? <img src={itm.imgSrc} alt="item" className={styles.popupItemImg}/> : <div className={styles.popupItemEmoji} style={{width:'30px', height:'30px', color: rColor}}><FallbackIcon /></div>}
                             <span className={styles.popupItemLvl} style={{ color: rColor }}>Lv.{itm.level}</span>
                          </div>
                          
                          <div className={styles.popupItemInfo}>
                             <h4 className={styles.popupItemName}>
                               {itm.name[lang]} 
                             </h4>
                             <p className={styles.popupItemStats}>{itm.stats}</p>
                          </div>
                          
                          {isEquipped && <div className={styles.equippedTag}>{lang === 'vi' ? 'ĐANG DÙNG' : 'ACTIVE'}</div>}
                       </div>
                     );
                   })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}