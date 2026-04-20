import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, AIRCRAFTS, PILOTS } from '../../constants';
import styles from './Inventory.module.css';
import toast from 'react-hot-toast';
import ItemModal from '../ItemModal/ItemModal';
// --- HỆ THỐNG SVG ICONS SCI-FI ---
const Icons = {
  Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
  Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
  Blueprint: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>),
  Sacrifice: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
};

const RARITY_LABELS = { 1: 'COMMON', 2: 'UNCOMMON', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY' };

// ── DATA HÒM GACHA ──
const CRATE_CONFIGS = [
  { id: 'basic',       shopType: 'crate', rarity: 1, icon: '📦', title: { vi: 'HÒM CƠ BẢN', en: 'STANDARD CRATE' }, desc: { vi: 'Trang bị tàn tích. Rớt đồ Trắng, Lục, Lam.', en: 'Salvaged parts.' }, dropRates: { 1: 50, 2: 35, 3: 12, 4: 3, 5: 0 } },
  { id: 'premium',     shopType: 'crate', rarity: 3, icon: '🔮', title: { vi: 'HÒM CAO CẤP', en: 'PREMIUM CRATE' }, desc: { vi: 'Công nghệ quân sự. Đảm bảo Lục+. Có tỷ lệ Vàng!', en: 'Military tech.' }, dropRates: { 1: 0, 2: 40, 3: 40, 4: 15, 5: 5 } },
  { id: 'epic',        shopType: 'crate', rarity: 5, icon: '👑', title: { vi: 'HÒM HUYỀN THOẠI', en: 'EPIC CACHE' }, desc: { vi: 'Tinh hoa vũ trụ. Chỉ rớt Lam, Tím, Vàng.', en: 'Galactic apex.' }, dropRates: { 1: 0, 2: 0, 3: 50, 4: 35, 5: 15 } },
  { id: 'pilot_gacha', shopType: 'crate', rarity: 4, icon: '📡', title: { vi: 'VÉ TUYỂN MỘ', en: 'RECRUIT TICKET' }, desc: { vi: 'Phát tín hiệu triệu hồi phi công ngẫu nhiên.', en: 'Broadcast SOS.' }, dropRates: { 1: 30, 2: 28, 3: 22, 4: 14, 5: 6 } },
];

export default function Inventory({ gsRef, setScreen, lang, saveUserProfile }) {
  const [mainTab,     setMainTab]     = useState('bag');
  const [bagFilter,   setBagFilter]   = useState('all');
  const [forgeTab,    setForgeTab]    = useState('upgrade');
  const [selectedId,  setSelectedId]  = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const campaignData = gsRef.current.campaignData;
  if (!campaignData) return null;

  // Đảm bảo cấu trúc data an toàn
  if (!campaignData.materials) campaignData.materials = { parts: 150, blueprints: 10 };
  if (campaignData.materials.blueprints === undefined) campaignData.materials.blueprints = 0;
  if (!campaignData.materials.crates) campaignData.materials.crates = { basic: 0, premium: 0, epic: 0, pilot_gacha: 0 };

  const { items, loadout, ownedPilots, materials, ownedAircrafts } = campaignData;
  const currentCoins      = Number(gsRef.current.coins)    || 0;
  const currentDiamonds   = Number(gsRef.current.diamonds) || 0;
  const currentBlueprints = Number(materials.blueprints)   || 0;
  const currentGears      = Number(materials.gears)        || 0;

  const isForge = mainTab === 'forge';

  // --- CHUYỂN GACHA THÀNH TAB DỌC ---
  const sideTabs = [
    { id: 'all',     icon: '◈', label: { vi: 'Tất cả',    en: 'ALL'   } },
    { id: 'crates',  icon: '🎰', label: { vi: 'Hòm Gacha', en: 'CRATES'} }, // Tab Gacha mới nằm ngay sau Tất cả
    { id: 'mainGun', icon: '⊕', label: { vi: 'Súng chính', en: 'GUN'  } },
    { id: 'wingman', icon: '◎', label: { vi: 'Súng phụ',   en: 'WING' } },
    { id: 'armor',   icon: '◇', label: { vi: 'Phụ trợ',    en: 'ARMOR'} },
    { id: 'drone',   icon: '⊛', label: { vi: 'Vệ tinh',    en: 'DRONE'} },
    { id: 'pilot',   icon: '◉', label: { vi: 'Phi công',   en: 'PILOT'} },
  ].filter(tab => isForge ? (tab.id !== 'pilot' && tab.id !== 'crates') : true); // Xưởng rèn ẩn Phi công và Hòm

  // Đảm bảo không bị kẹt ở tab không hợp lệ khi chuyển sang Xưởng Rèn
  if (isForge && (bagFilter === 'pilot' || bagFilter === 'crates')) {
    setBagFilter('all');
    setSelectedId(null);
  }

  const inventoryList = Object.keys(items).map(uuid => ({ uuid, id: uuid, ...items[uuid] }));

  let displayList = [];
  if (bagFilter === 'crates') {
    displayList = CRATE_CONFIGS.map(c => ({...c, uuid: c.id}));
  } else if (bagFilter === 'pilot' && !isForge) {
    displayList = Object.keys(ownedPilots).map(pId => ({
      uuid: pId, id: pId, type: 'pilot', ...ownedPilots[pId],
      rarity: PILOTS.find(p => p.id === pId)?.rarity || 1,
    }));
  } else {
    displayList = inventoryList
      .filter(item => bagFilter === 'all' || item.type === bagFilter)
      .sort((a, b) => b.rarity - a.rarity);
  }

 const selectedItem = displayList.find(i => i.uuid === selectedId) || 
                     (ownedAircrafts?.[selectedId] ? { id: selectedId, uuid: selectedId, type: 'aircraft', ...ownedAircrafts[selectedId] } : null);
  const isCrate = selectedItem?.shopType === 'crate';
  
  const itemBaseInfo = selectedItem
  ? (isCrate 
      ? selectedItem 
      : (selectedItem.type === 'pilot'
         ? PILOTS.find(p => p.id === selectedItem.id)
         : (selectedItem.type === 'aircraft' 
            ? AIRCRAFTS.find(a => a.id === selectedItem.id) // Thêm check cho Phi cơ
            : GEAR_CATALOG[selectedItem.type]?.find(g => g.id === selectedItem.baseId))))
  : null;

  // --- LOGIC NÂNG CẤP & ĐỘT PHÁ ---
  const upgradeCoinCost = (!isCrate && selectedItem) ? selectedItem.level * 150 : 0;
  const upgradeBpCost   = (!isCrate && selectedItem) ? Math.ceil(selectedItem.level * 1.5) : 0;
  const canUpgrade = currentCoins >= upgradeCoinCost && currentBlueprints >= upgradeBpCost;

  const starUpGemCost = (!isCrate && selectedItem) ? selectedItem.rarity * 100 : 0;
  // --- TÌM PHÔI ĐỘT PHÁ (Không phân biệt Level/Độ hiếm) ---
  const duplicateItems = (!isCrate && selectedItem) ? inventoryList.filter(item => {
    return (
      item.baseId === selectedItem?.baseId && // Chỉ cần cùng loại (VD: cùng là súng laser)
      item.type === selectedItem?.type &&     // Cùng category
      item.uuid !== selectedItem?.uuid &&     // Không lấy chính nó
      loadout[item.type] !== item.uuid        // Không lấy đồ đang mặc
    );
  }).sort((a, b) => {
    const rarityA = a.rarity || 1;
    const rarityB = b.rarity || 1;
    if (rarityA !== rarityB) return rarityA - rarityB; // Rarity thấp xếp trước
    return (a.level || 1) - (b.level || 1);            // Level thấp xếp trước
  }) : [];
  const reqDuplicateAmount = 1;
  const canStarUp = currentDiamonds >= starUpGemCost && duplicateItems.length >= reqDuplicateAmount;

  // --- HÀM MỞ GACHA (RNG Tỷ lệ rớt đồ thực tế) ---
  const handleOpenCrate = (crate, amount) => {
    const currentCount = materials.crates[crate.id] || 0;
    if (currentCount < amount) return toast.error(lang === 'vi' ? 'Không đủ hòm trong kho!' : 'Not enough crates!');

    // Trừ hòm
    campaignData.materials.crates[crate.id] -= amount;

    // Chạy Random
    for (let i = 0; i < amount; i++) {
       let roll = Math.random() * 100;
       let cumulative = 0;
       let rolledRarity = 1;

       // Lọc Rarity dựa trên Roll và Rate
       for (let r of [5, 4, 3, 2, 1]) {
           if (crate.dropRates[r] > 0) {
               cumulative += crate.dropRates[r];
               if (roll <= cumulative) {
                   rolledRarity = r;
                   break;
               }
           }
       }

       if (crate.id === 'pilot_gacha') {
           const validPilots = PILOTS.filter(p => p.rarity === rolledRarity);
           if (validPilots.length > 0) {
               const p = validPilots[Math.floor(Math.random() * validPilots.length)];
               campaignData.ownedPilots[p.id] = campaignData.ownedPilots[p.id] || { level: 1, stars: 1 };
           }
       } else {
           // Bốc random 1 món đồ theo Rarity đã quay trúng
           const gearTypes = ['mainGun', 'wingman', 'armor', 'drone'];
           const rType = gearTypes[Math.floor(Math.random() * gearTypes.length)];
           const list = GEAR_CATALOG[rType];
           const g = list[Math.floor(Math.random() * list.length)];

           const uuid = 'item_' + Date.now() + Math.floor(Math.random() * 1000) + i;
           campaignData.items[uuid] = { baseId: g.id, rarity: rolledRarity, level: 1, type: rType };
       }
    }

    saveUserProfile();
    setRefreshTick(p => p + 1);
    toast.success(lang === 'vi' ? `Đã mở ${amount} hòm! Đồ mới đã vào Túi.` : `Opened ${amount} crates! Check your loadout.`);
  };

  const renderIcon = (item, size) => {
    if (item.shopType === 'crate') return <span style={{ fontSize: size }}>{item.icon}</span>;
    const baseInfo = item.type === 'pilot' ? PILOTS.find(p => p.id === item.id) : GEAR_CATALOG[item.type]?.find(g => g.id === item.baseId);
    if (baseInfo?.imgSrc) return <img src={baseInfo.imgSrc} alt="icon" style={{ maxWidth: size, objectFit: 'contain' }} />;
    const emoji = { mainGun: '🔫', armor: '🛡️', drone: '🛰️', pilot: '👨‍🚀', wingman: '🚀' }[item.type] || '🚀';
    return <span style={{ fontSize: size }}>{emoji}</span>;
  };

  const handleSelectItem = (uuid) => {
    setSelectedId(uuid);
    if (window.innerWidth <= 768) {
      setTimeout(() => {
        const el = document.getElementById('detail-panel');
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 20;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }, 50);
    }
  };

  const toggleEquip = () => {
    if (!selectedItem) return;
    if (selectedItem.type === 'pilot') {
      const eq = loadout.pilot === selectedItem.id;
      gsRef.current.campaignData.loadout.pilot = eq ? PILOTS[0].id : selectedItem.id;
      toast.success(lang === 'vi' ? (eq ? 'Đã tháo Phi công!' : 'Đã điều động Phi công!') : 'Pilot Updated!');
    } else {
      const eq = loadout[selectedItem.type] === selectedItem.uuid;
      gsRef.current.campaignData.loadout[selectedItem.type] = eq ? '' : selectedItem.uuid;
      toast.success(lang === 'vi' ? (eq ? 'Đã tháo trang bị!' : 'Đã gắn trang bị!') : 'Gear Updated!');
    }
    saveUserProfile();
    setRefreshTick(p => p + 1);
  };

  const handleUpgrade = () => {
    if (!selectedItem || selectedItem.type === 'pilot') return;
    gsRef.current.coins -= upgradeCoinCost;
    gsRef.current.campaignData.materials.blueprints -= upgradeBpCost;
    gsRef.current.campaignData.items[selectedItem.uuid].level += 1;
    saveUserProfile(); setRefreshTick(p => p + 1);
    toast.success(lang === 'vi' ? 'Nâng cấp thành công!' : 'Upgrade Success!');
  };

  const handleStarUp = (sacrificeId) => {
    // Thêm điều kiện: Phải có sacrificeId truyền lên từ Modal mới chạy
    if (!selectedItem || selectedItem.type === 'pilot' || !sacrificeId) return;
    
    // Tìm đúng cái phôi mà người chơi vừa click chọn trên màn hình
    const sacrificeItem = duplicateItems.find(i => i.uuid === sacrificeId); 
    if (!sacrificeItem) return;

    // --- LOGIC CẢNH BÁO (POPUP) ---
    const isHigherRarity = (sacrificeItem.rarity || 1) >= (selectedItem.rarity || 1);
    const isUpgraded = (sacrificeItem.level || 1) > 1;

    // Cảnh báo nếu phôi cấp cao hoặc sao cao
    if (isHigherRarity || isUpgraded) {
      const confirmMsg = lang === 'vi'
        ? `⚠️ CẢNH BÁO: Phôi này đang ở Cấp độ ${sacrificeItem.level} và có ${sacrificeItem.rarity}★. Bạn có CHẮC CHẮN muốn hiến tế nó để đột phá không?`
        : `⚠️ WARNING: This sacrifice is Level ${sacrificeItem.level} and ${sacrificeItem.rarity}★. Are you SURE you want to consume it?`;

      if (!window.confirm(confirmMsg)) {
        return; 
      }
    }
    // --- TIẾN HÀNH ĐỘT PHÁ ---
    gsRef.current.diamonds -= starUpGemCost;
    
    delete gsRef.current.campaignData.items[sacrificeItem.uuid];
    
    if (gsRef.current.campaignData.loadout[sacrificeItem.type] === sacrificeItem.uuid) {
        gsRef.current.campaignData.loadout[sacrificeItem.type] = '';
    }
    
    gsRef.current.campaignData.items[selectedItem.uuid].rarity += 1;
    
    saveUserProfile(); 
    setRefreshTick(p => p + 1);
    toast.success(lang === 'vi' ? 'Đột phá thành công!' : 'Star Up Success!');
    setSelectedId(null); // Tự động đóng Modal sau khi đập thành công
  };

  const handleEquipAircraft = (id) => {
    gsRef.current.campaignData.loadout.aircraft = id;
    saveUserProfile();
    setRefreshTick(t => t + 1);
    toast.success(lang === 'vi' ? 'Đã đổi Phi cơ!' : 'Aircraft Equipped!');
  };

  const renderGrid = () => (
    <div className={styles.inventoryBoard}>
      <div className={styles.verticalTabs}>
        {sideTabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.sideTabBtn} ${bagFilter === tab.id ? styles.active : ''}`}
            onClick={() => { setBagFilter(tab.id); setSelectedId(null); }}
          >
            <span className={styles.sideIcon}>{tab.icon}</span>
            <span className={styles.sideLabel}>{tab.label[lang]}</span>
            {bagFilter === tab.id && <motion.div className={styles.sideActivePip} layoutId="sidePip" />}
          </button>
        ))}
      </div>

      <div className={styles.gridArea}>
        {displayList.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>⊡</span>
            <span>{lang === 'vi' ? 'KHOANG CHỨA RỖNG' : 'STORAGE EMPTY'}</span>
          </div>
        ) : (
          displayList.map((item, i) => (
            <motion.div
              key={item.uuid}
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.012, duration: 0.2 }}
              className={`${styles.itemSlot} ${styles['r' + item.rarity]} ${selectedId === item.uuid ? styles.selected : ''}`}
              onClick={() => handleSelectItem(item.uuid)}
              whileTap={{ scale: 0.92 }}
            >
              <div className={styles.itemGlow} />
              {(!isCrate && (loadout[item.type] === item.uuid || loadout.pilot === item.id)) && (
                <div className={styles.equippedBadge}><span>✓</span></div>
              )}
              <div className={styles.itemIconWrap}>{renderIcon(item, isForge ? '36px' : '40px')}</div>
              <div className={styles.itemFooter}>
                 <span className={styles.itemLevel}>
                    {item.shopType === 'crate' ? `SL: ${materials.crates[item.id] || 0}` : `LV ${item.level}`}
                 </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
  const isEquipped = (!isCrate && selectedItem) && (loadout[selectedItem.type] === selectedItem.uuid || loadout.pilot === selectedItem.id);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      className={`${styles.container} ${isForge ? styles.forgeMode : ''} scrollable-layer`}
    >
      <div className={styles.contentWrapper}>

        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
            <span className={styles.backArrow}>‹</span>
            <span className={styles.backText}>{lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}</span>
          </motion.button>
          <div className={styles.headerTitle}>
            {isForge ? (lang === 'vi' ? 'XƯỞNG RÈN' : 'FORGE CORE') : (lang === 'vi' ? 'KHO VŨ KHÍ' : 'ARMORY')}
          </div>
          <div className={styles.currencyBar}>
            <div className={`${styles.currencyChip} ${styles.chipCoin}`}>
              <div className={styles.currencyIcon}><Icons.Coin /></div>
              <span className={styles.currencyAmt}>{currentCoins.toLocaleString()}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipGem}`}>
              <div className={styles.currencyIcon}><Icons.Gem /></div>
              <span className={styles.currencyAmt}>{currentDiamonds.toLocaleString()}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipBlueprint}`}>
              <div className={styles.currencyIcon}><Icons.Blueprint /></div>
              <span className={styles.currencyAmt}>{currentBlueprints.toLocaleString()}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipGear}`}>
              <div className={styles.currencyIcon}><Icons.Gear /></div>
              <span className={styles.currencyAmt}>{currentGears.toLocaleString()}</span>
            </div>
          </div>
        </header>

        {/* --- CHỈ CÒN 2 TAB CHÍNH TRÊN CÙNG --- */}
        <nav className={styles.mainTabs}>
          {[
            { id: 'bag',   icon: '⊞', label: { vi: 'TÚI TRANG BỊ', en: 'LOADOUT BAY' } },
            { id: 'forge', icon: '⊗', label: { vi: 'XƯỞNG RÈN',    en: 'FORGE CORE'  } },
          ].map(tab => (
            <button
              key={tab.id} data-tab={tab.id}
              className={`${styles.mainTabBtn} ${mainTab === tab.id ? styles.active : ''}`}
              onClick={() => { setMainTab(tab.id); setSelectedId(null); setBagFilter('all'); }}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              {tab.label[lang]}
              {mainTab === tab.id && <motion.div className={styles.tabUnderline} layoutId="mainUnderline" />}
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div 
            key={mainTab} 
            initial={{ opacity: 0, y: 12 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -8 }} 
            transition={{ duration: 0.25 }} 
            className={styles.workspace}
          >
            {/* PHẦN PHI CƠ: Luôn hiện ở trên đầu của cả 2 tab */}
            <div className={styles.aircraftSection}>
              <div className={styles.sectionHeader}>
                {lang === 'vi' ? 'HẠM ĐỘI PHI CƠ' : 'AIRCRAFT FLEET'}
              </div>
              <div className={styles.aircraftGrid}>
                {AIRCRAFTS.filter(ac => !!ownedAircrafts?.[ac.id]).map(ac => (
                  <motion.div 
                    key={ac.id} 
                    className={`${styles.aircraftCard} ${loadout.aircraft === ac.id ? styles.aircraftEquipped : ''} ${selectedId === ac.id ? styles.selected : ''}`} 
                    onClick={() => setSelectedId(ac.id)}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className={styles.acImageWrap}>
                      <img src={ac.imgHq || ac.imgTop || '/images/ship_xwing_hq.jpg'} alt="Ship" className={styles.acImage} />
                    </div>
                    <div className={styles.acInfo}>
                      <div className={styles.acName}>{ac.name[lang]}</div>
                      <div className={styles.acStats}>
                        <span>ATK: {ac.baseAtk}</span>
                        <span>SHIELD: {ac.baseHp}</span>
                      </div>
                    </div>
                    {loadout.aircraft === ac.id && <div className={styles.acBadge}>ACTIVE</div>}
                    <div className={styles.cardGlow} />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* PHẦN LƯỚI TRANG BỊ: Tự động thay đổi theo Tab */}
            <div className={styles.lowerWorkspace}>
              {renderGrid()}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <ItemModal 
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        item={selectedItem}
        baseInfo={itemBaseInfo}
        contextType={isCrate ? 'crate' : (mainTab === 'forge' ? 'forge' : 'bag')}
        isEquipped={isEquipped}
        lang={lang}
        resources={{
          coins: currentCoins,
          diamonds: currentDiamonds,
          blueprints: currentBlueprints,
          duplicateItems: duplicateItems,
          duplicatesCount: duplicateItems.length,
          crates: isCrate ? (materials.crates[selectedItem?.id] || 0) : 0
        }}
        actions={{
          // Cập nhật logic Equip để nhận diện cả Phi cơ
          onEquip: selectedItem?.type === 'aircraft' 
                  ? () => handleEquipAircraft(selectedItem.id) 
                  : toggleEquip,
          onUpgrade: handleUpgrade,
          onStarUp: handleStarUp,
          onOpen: (amount) => handleOpenCrate(selectedItem, amount),
          onGoToForge: () => { setMainTab('forge'); }
        }}
      />
    </motion.div>
    
  );
}