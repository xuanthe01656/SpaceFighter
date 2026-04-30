import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, AIRCRAFTS, PILOTS } from '../../constants';
import styles from './Inventory.module.css';
import toast from 'react-hot-toast';
import ItemModal from '../ItemModal/ItemModal';

 const Icons = {
    Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
    Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
    Blueprint: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>),
    Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
    Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
  };

const getItemLimits = (item) => {
  if (!item) return { maxLevel: 10, maxStar: 1 };
  if (item.type === 'aircraft') {
    const tier = AIRCRAFTS.find(a => a.id === item.id)?.tier || 1;
    const tierCaps = { 1: 30, 2: 50, 3: 70, 4: 100 };
    return { maxLevel: tierCaps[tier] || 30, maxStar: 5 }; 
  }
  const rarity = item.rarity || 1;
  switch (rarity) {
    case 1: return { maxLevel: 20, maxStar: 2 };
    case 2: return { maxLevel: 40, maxStar: 3 };
    case 3: return { maxLevel: 60, maxStar: 4 };
    case 4: return { maxLevel: 80, maxStar: 5 };
    case 5: return { maxLevel: 100, maxStar: 6 };
    default: return { maxLevel: 20, maxStar: 2 };
  }
};

const getTabLabel = (type, lang) => {
  const labels = {
    mainGun: { vi: 'Súng chính', en: 'MAIN GUNS' },
    wingman: { vi: 'Súng phụ', en: 'WINGMEN' },
    armor: { vi: 'Phụ trợ', en: 'ARMOR' },
    drone: { vi: 'Vệ tinh', en: 'DRONES' }
  };
  return labels[type]?.[lang] || type;
};

export default function Inventory({ gsRef, setScreen, lang, saveUserProfile }) {
  const [mainTab,     setMainTab]     = useState('bag');
  const [bagFilter,   setBagFilter]   = useState('all');
  const [selectedId,  setSelectedId]  = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [sellSelection, setSellSelection] = useState([]);
  const pressTimer = useRef(null);

  const campaignData = gsRef.current.campaignData;
  if (!campaignData) return null;

  if (!campaignData.materials) campaignData.materials = { parts: 150, blueprints: 10, gears: 5};
  if (campaignData.materials.blueprints === undefined) campaignData.materials.blueprints = 0;
  if (campaignData.materials.gears === undefined) campaignData.materials.gears = 0;
  if (campaignData.materials.crate === undefined) campaignData.materials.crate = 0;

  if (!campaignData.ownedAircrafts) {
      campaignData.ownedAircrafts = { 'ship_xwing': { level: 1, stars: 1 } }; 
  }

  const { items, loadout, ownedPilots, materials, ownedAircrafts } = campaignData;
  const currentCoins      = Number(gsRef.current.coins)    || 0;
  const currentDiamonds   = Number(gsRef.current.diamonds) || 0;
  const currentBlueprints = Number(materials?.blueprints)   || 0;
  const currentGears      = Number(materials?.gears)        || 0;
  const currentCrates     = Number(materials?.crates)       || 0;
  const currentEnergy     = Number(gsRef.current.energy)   || 50;

  const isForge = mainTab === 'forge';

  const sideTabs = [
    { id: 'all',     icon: '◈', label: { vi: 'Tất cả',    en: 'ALL'   } },
    { id: 'mainGun', icon: '⊕', label: { vi: 'Súng chính', en: 'GUN'  } },
    { id: 'wingman', icon: '◎', label: { vi: 'Súng phụ',   en: 'WING' } },
    { id: 'armor',   icon: '◇', label: { vi: 'Phụ trợ',    en: 'ARMOR'} },
    { id: 'drone',   icon: '⊛', label: { vi: 'Vệ tinh',    en: 'DRONE'} },
    { id: 'pilot',   icon: '◉', label: { vi: 'Phi công',   en: 'PILOT'} },
  ].filter(tab => isForge ? (tab.id !== 'pilot') : true); 

  if (isForge && bagFilter === 'pilot') {
    setBagFilter('all');
    setSelectedId(null);
  }

  const inventoryList = Object.keys(items).map(uuid => ({ uuid, id: uuid, isOwned: true, ...items[uuid] }));
  
  const bagAircrafts = AIRCRAFTS.filter(ac => ownedAircrafts[ac.id]).map(ac => {
    const acData = ownedAircrafts[ac.id];
    const baseRarity = ac.tier || ac.rarity || 1;
    return { ...acData, id: ac.id, uuid: ac.id, type: 'aircraft', isOwned: true, rarity: acData.stars || baseRarity };
  });

  let gridItems = [];
  if (bagFilter === 'pilot') {
      gridItems = PILOTS.filter(p => ownedPilots[p.id]).map(p => {
          const pData = ownedPilots[p.id];
          return { ...pData, id: p.id, uuid: p.id, type: 'pilot', isOwned: true, rarity: p.rarity || 1 };
      });
  } else {
      gridItems = inventoryList.filter(item => bagFilter === 'all' || item.type === bagFilter);
      gridItems.sort((a,b) => (b.rarity||1) - (a.rarity||1));
  }

  const collectionData = [
    {
      id: 'aircraft', title: lang === 'vi' ? 'HẠM ĐỘI PHI CƠ' : 'AIRCRAFTS',
      items: AIRCRAFTS.map(ac => {
        const isOwned = !!ownedAircrafts[ac.id];
        const acData = ownedAircrafts[ac.id] || {};
        const baseRarity = ac.tier || ac.rarity || 1;
        return { ...acData, id: ac.id, uuid: ac.id, type: 'aircraft', isOwned, rarity: isOwned ? (acData.stars || baseRarity) : baseRarity, level: acData.level || 1 };
      })
    },
    {
      id: 'pilot', title: lang === 'vi' ? 'PHI CÔNG CHIẾN THUẬT' : 'PILOTS',
      items: PILOTS.map(p => {
        const isOwned = !!ownedPilots[p.id];
        const pData = ownedPilots[p.id] || {};
        return { ...pData, id: p.id, uuid: p.id, type: 'pilot', isOwned, rarity: p.rarity || 1, level: pData.level || 1 };
      })
    },
    ...['mainGun', 'wingman', 'armor', 'drone'].map(type => ({
      id: type, title: getTabLabel(type, lang),
      items: (GEAR_CATALOG[type] || []).map(baseGear => {
        const ownedVersions = inventoryList.filter(i => i.baseId === baseGear.id);
        const isOwned = ownedVersions.length > 0;
        const bestVersion = isOwned ? ownedVersions.reduce((prev, curr) => (prev.rarity > curr.rarity) ? prev : curr) : {};
        return {
           uuid: isOwned ? bestVersion.uuid : 'unowned_' + baseGear.id,
           baseId: baseGear.id, type: type, isOwned,
           rarity: isOwned ? bestVersion.rarity : (baseGear.rarity || baseGear.tier || 1),
           level: isOwned ? bestVersion.level : 1, id: isOwned ? bestVersion.id : undefined,
           isLocked: isOwned ? bestVersion.isLocked : false
        };
      }).sort((a,b) => (b.rarity||1) - (a.rarity||1))
    }))
  ];

  let selectedItem = null;
  if (selectedId) {
      const ac = AIRCRAFTS.find(a => a.id === selectedId);
      if (ac) {
          const acData = ownedAircrafts?.[selectedId];
          const baseRarity = ac.tier || ac.rarity || 1;
          selectedItem = { id: selectedId, uuid: selectedId, type: 'aircraft', isOwned: !!acData, rarity: acData ? (acData.stars || baseRarity) : baseRarity, ...(acData || { level: 1, stars: baseRarity }) };
      }
      if (!selectedItem) {
          const p = PILOTS.find(x => x.id === selectedId);
          if (p) {
             const pData = ownedPilots?.[selectedId];
             selectedItem = { id: p.id, uuid: p.id, type: 'pilot', isOwned: !!pData, level: pData?.level || 1, stars: pData?.stars || p.rarity || 1, rarity: p.rarity || 1, ...pData };
          }
      }
      if (!selectedItem) {
          selectedItem = inventoryList.find(i => i.uuid === selectedId);
          if (selectedItem) selectedItem.isOwned = true;
      }
      if (!selectedItem) {
          ['mainGun', 'wingman', 'armor', 'drone'].forEach(type => {
             if (selectedItem) return;
             const g = GEAR_CATALOG[type]?.find(x => 'unowned_' + x.id === selectedId);
             if (g) selectedItem = { uuid: 'unowned_' + g.id, baseId: g.id, type: type, isOwned: false, rarity: g.rarity || g.tier || 1, level: 1 };
          });
      }
  }

  const itemBaseInfo = selectedItem ? (selectedItem.type === 'pilot' ? PILOTS.find(p => p.id === selectedItem.id) : (selectedItem.type === 'aircraft' ? AIRCRAFTS.find(a => a.id === selectedItem.id) : GEAR_CATALOG[selectedItem.type]?.find(g => g.id === selectedItem.baseId))) : null;

  const getStarUpInfo = (stars) => {
    switch(stars) {
      case 1: return { coinCost: 1000,  gemCost: 10,  reqDupes: 1, rate: 100 };
      case 2: return { coinCost: 3000,  gemCost: 30,  reqDupes: 2, rate: 70 };
      case 3: return { coinCost: 8000,  gemCost: 80,  reqDupes: 3, rate: 50 };
      case 4: return { coinCost: 20000, gemCost: 200, reqDupes: 4, rate: 30 };
      default: return { coinCost: 0, gemCost: 0, reqDupes: 0, rate: 0 };
    }
  };
  
  const currentStarLevel = selectedItem?.stars || selectedItem?.rarity || 1;
  const starUpInfo = getStarUpInfo(currentStarLevel);

  const duplicateItems = (selectedItem && selectedItem.type !== 'pilot') ? inventoryList.filter(item => {
    return (item.type === selectedItem?.type && item.uuid !== selectedItem?.uuid && loadout[item.type] !== item.uuid);
  }).sort((a, b) => {
    if ((a.rarity || 1) !== (b.rarity || 1)) return (a.rarity || 1) - (b.rarity || 1); 
    return (a.level || 1) - (b.level || 1);            
  }) : [];

  // ====================================================================
  // LOGIC ẤN GIỮ ĐỂ BÁN/XÓA HÀNG LOẠT (SELECTION MODE)
  // ====================================================================

  const handlePressStart = (item) => {
    if (mainTab === 'collection' || !item.isOwned) return;
    const isEq = loadout[item.type] === item.uuid || loadout.pilot === item.id || loadout.aircraft === item.id;
    if (isEq) return; 

    pressTimer.current = setTimeout(() => {
        setIsSelectMode(true);
        if (!item.isLocked) {
            setSellSelection([item.uuid]);
        }
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500); 
  };

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleItemClick = (item) => {
    if (isSelectMode) {
      if (!item.isOwned) return;
      const isEq = loadout[item.type] === item.uuid || loadout.pilot === item.id || loadout.aircraft === item.id;
      if (isEq) {
        toast.error(lang === 'vi' ? 'Không thể chọn đồ đang dùng!' : 'Cannot select equipped item!');
        return;
      }
      if (item.isLocked) {
        toast.error(lang === 'vi' ? 'Vật phẩm đã bị khóa!' : 'Item is locked!');
        return;
      }
      setSellSelection(prev => prev.includes(item.uuid) ? prev.filter(id => id !== item.uuid) : [...prev, item.uuid]);
      return;
    }
    
    setSelectedId(item.uuid);
    if (window.innerWidth <= 768) {
      setTimeout(() => { const el = document.getElementById('detail-panel'); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' }); }, 50);
    }
  };

  const handleSelectAll = () => {
    const selectableIds = gridItems.filter(item => {
        const isEq = loadout[item.type] === item.uuid || loadout.pilot === item.id || loadout.aircraft === item.id;
        return item.isOwned && !isEq && !item.isLocked;
    }).map(i => i.uuid);
    
    if (mainTab === 'bag' && bagFilter === 'all') {
      bagAircrafts.forEach(ac => {
        if (loadout.aircraft !== ac.id && !ac.isLocked) selectableIds.push(ac.uuid);
      });
    }
    setSellSelection(selectableIds);
  };

  // --- HÀM BÁN ĐỒ LẤY XU ---
  const executeSell = () => {
    if (sellSelection.length === 0) return;

    const itemsToProcess = [];
    sellSelection.forEach(uuid => {
       let found = inventoryList.find(i => i.uuid === uuid);
       if (found) itemsToProcess.push(found);
       else {
         const p = PILOTS.find(x => x.id === uuid && ownedPilots[x.id]);
         if (p) itemsToProcess.push({ ...ownedPilots[p.id], id: p.id, uuid: p.id, type: 'pilot', rarity: p.rarity });
         else {
           const ac = AIRCRAFTS.find(x => x.id === uuid && ownedAircrafts[x.id]);
           if (ac) itemsToProcess.push({ ...ownedAircrafts[ac.id], id: ac.id, uuid: ac.id, type: 'aircraft', rarity: ownedAircrafts[ac.id].stars || ac.tier || 1 });
         }
       }
    });

    const hasHighValue = itemsToProcess.some(i => (i.rarity || 1) >= 3 || (i.level || 1) > 1);
    if (hasHighValue) {
        const confirmMsg = lang === 'vi' 
          ? 'CẢNH BÁO: Trong danh sách bán có chứa vật phẩm Cấp cao hoặc Độ hiếm cao! Bạn chắc chắn muốn phân rã?' 
          : 'WARNING: Contains High Value items! Are you sure?';
        if (!window.confirm(confirmMsg)) return;
    }

    let earnedCoins = 0;
    itemsToProcess.forEach(item => {
        const r = item.rarity || 1;
        earnedCoins += Math.min(10, r * 2); // Rarity * 2 (max 10 xu)

        if (item.type === 'pilot') delete gsRef.current.campaignData.ownedPilots[item.id];
        else if (item.type === 'aircraft') delete gsRef.current.campaignData.ownedAircrafts[item.id];
        else delete gsRef.current.campaignData.items[item.uuid];
    });

    gsRef.current.coins = currentCoins + earnedCoins;
    
    // GỌI FIREBASE SYNC
    saveUserProfile();
    setRefreshTick(p => p + 1);
    setIsSelectMode(false);
    setSellSelection([]);
    toast.success(lang === 'vi' ? `Đã phân rã! Thu được ${earnedCoins} Xu.` : `Salvaged! Earned ${earnedCoins} Coins.`);
  };

  // --- HÀM XÓA VĨNH VIỄN (KHÔNG NHẬN LẠI GÌ) ---
  const executeDelete = () => {
    if (sellSelection.length === 0) return;

    const itemsToProcess = [];
    sellSelection.forEach(uuid => {
       let found = inventoryList.find(i => i.uuid === uuid);
       if (found) itemsToProcess.push(found);
       else {
         const p = PILOTS.find(x => x.id === uuid && ownedPilots[x.id]);
         if (p) itemsToProcess.push({ ...ownedPilots[p.id], id: p.id, uuid: p.id, type: 'pilot', rarity: p.rarity });
         else {
           const ac = AIRCRAFTS.find(x => x.id === uuid && ownedAircrafts[x.id]);
           if (ac) itemsToProcess.push({ ...ownedAircrafts[ac.id], id: ac.id, uuid: ac.id, type: 'aircraft', rarity: ownedAircrafts[ac.id].stars || ac.tier || 1 });
         }
       }
    });

    const hasHighValue = itemsToProcess.some(i => (i.rarity || 1) >= 3 || (i.level || 1) > 1);
    const confirmMsg = hasHighValue
      ? (lang === 'vi' ? 'CẢNH BÁO NGUY HIỂM: Trong danh sách XÓA có chứa vật phẩm Cấp cao/Độ hiếm cao! BẠN SẼ KHÔNG NHẬN ĐƯỢC XU NÀO. Bạn chắc chắn muốn xóa vĩnh viễn?' : 'WARNING: Contains High Value items! Permanently DELETE with NO return?')
      : (lang === 'vi' ? 'Bạn chắc chắn muốn xóa vĩnh viễn các vật phẩm này? (Không nhận lại Xu)' : 'Are you sure you want to permanently delete these items?');

    if (!window.confirm(confirmMsg)) return;

    itemsToProcess.forEach(item => {
        if (item.type === 'pilot') delete gsRef.current.campaignData.ownedPilots[item.id];
        else if (item.type === 'aircraft') delete gsRef.current.campaignData.ownedAircrafts[item.id];
        else delete gsRef.current.campaignData.items[item.uuid];
    });

    // GỌI FIREBASE SYNC
    saveUserProfile();
    setRefreshTick(p => p + 1);
    setIsSelectMode(false);
    setSellSelection([]);
    toast.success(lang === 'vi' ? `Đã xóa vĩnh viễn ${itemsToProcess.length} vật phẩm.` : `Deleted ${itemsToProcess.length} items.`);
  };

  const toggleLock = () => {
    if (!selectedItem || !selectedItem.isOwned) return;
    const isCurrentlyLocked = !!selectedItem.isLocked;
    
    if (selectedItem.type === 'pilot') {
        gsRef.current.campaignData.ownedPilots[selectedItem.id].isLocked = !isCurrentlyLocked;
    } else if (selectedItem.type === 'aircraft') {
        gsRef.current.campaignData.ownedAircrafts[selectedItem.id].isLocked = !isCurrentlyLocked;
    } else {
        gsRef.current.campaignData.items[selectedItem.uuid].isLocked = !isCurrentlyLocked;
    }
    
    saveUserProfile(); // GỌI FIREBASE SYNC KHI KHÓA
    setRefreshTick(p => p + 1);
    toast.success(lang === 'vi' ? (isCurrentlyLocked ? 'Đã mở khóa vật phẩm!' : 'Đã khóa an toàn!') : (isCurrentlyLocked ? 'Item Unlocked!' : 'Item Locked!'));
  };

  const handleUpgrade = () => {
    if (!selectedItem || selectedItem.type === 'pilot') return;
    if (selectedItem.isOwned === false) return toast.error(lang === 'vi' ? 'Bạn chưa sở hữu vật phẩm này!' : 'Item not owned!');
    const currentLvl = selectedItem.level || 1;
    const limits = getItemLimits(selectedItem);
    if (currentLvl >= limits.maxLevel) return toast.error(lang === 'vi' ? 'Đã đạt cấp tối đa!' : 'Max Level Reached!');

    const upCoinCost = currentLvl * 150;
    const upGemCost = Math.ceil(upCoinCost / 100); 
    const upBpCost = Math.ceil(currentLvl * 1.5);

    const hasCoin = currentCoins >= upCoinCost;
    const hasGem = currentDiamonds >= upGemCost;
    if ((!hasCoin && !hasGem) || currentBlueprints < upBpCost) return;

    if (hasCoin) gsRef.current.coins -= upCoinCost; else gsRef.current.diamonds -= upGemCost;
    gsRef.current.campaignData.materials.blueprints -= upBpCost;

    if (selectedItem.type === 'aircraft') gsRef.current.campaignData.ownedAircrafts[selectedItem.id].level = currentLvl + 1;
    else gsRef.current.campaignData.items[selectedItem.uuid].level = currentLvl + 1;
    
    saveUserProfile(); setRefreshTick(p => p + 1); toast.success(lang === 'vi' ? 'Nâng cấp thành công!' : 'Upgrade Success!');
  };

  const handleStarUp = (sacrificeIds) => {
    if (!selectedItem || selectedItem.type === 'pilot' || !sacrificeIds) return false;
    if (selectedItem.isOwned === false) { toast.error(lang === 'vi' ? 'Bạn chưa sở hữu vật phẩm này!' : 'Item not owned!'); return false; }
    if (sacrificeIds.length !== (starUpInfo?.reqDupes || 0)) { toast.error(lang === 'vi' ? 'Vui lòng chọn đủ phôi!' : 'Select enough materials!'); return false; }

    const limits = getItemLimits(selectedItem);
    if (currentStarLevel >= limits.maxStar) { toast.error(lang === 'vi' ? 'Trang bị đã đạt Sao tối đa!' : 'Max Star Reached!'); return false; }

    const hasCoin = currentCoins >= starUpInfo.coinCost;
    const hasGem = currentDiamonds >= starUpInfo.gemCost;
    if (!hasCoin && !hasGem) return false;

    if (hasCoin) gsRef.current.coins -= starUpInfo.coinCost; else gsRef.current.diamonds -= starUpInfo.gemCost;

    sacrificeIds.forEach(sacId => {
      const sacrificeItem = duplicateItems.find(i => i.uuid === sacId);
      if (sacrificeItem) {
        delete gsRef.current.campaignData.items[sacrificeItem.uuid];
        if (gsRef.current.campaignData.loadout[sacrificeItem.type] === sacrificeItem.uuid) gsRef.current.campaignData.loadout[sacrificeItem.type] = '';
      }
    });
    
    const isSuccess = (Math.random() * 100) <= starUpInfo.rate;
    if (isSuccess) {
      if (selectedItem.type === 'aircraft') gsRef.current.campaignData.ownedAircrafts[selectedItem.id].stars = currentStarLevel + 1;
      else gsRef.current.campaignData.items[selectedItem.uuid].rarity = currentStarLevel + 1;
      toast.success(lang === 'vi' ? 'Đột phá thành công!' : 'Star Up Success!');
    } else toast.error(lang === 'vi' ? 'Đột phá thất bại! Phôi đã mất.' : 'Failed! Sacrifices lost.');
    
    saveUserProfile(); setRefreshTick(p => p + 1); return isSuccess; 
  };

  const renderIcon = (item, size) => {
    const baseInfo = item.type === 'pilot' ? PILOTS.find(p => p.id === item.id) : GEAR_CATALOG[item.type]?.find(g => g.id === item.baseId);
    if (baseInfo?.imgSrc) return <img src={baseInfo.imgSrc} alt="icon" style={{ maxWidth: size, objectFit: 'contain' }} />;
    const emoji = { mainGun: '🔫', armor: '🛡️', drone: '🛰️', pilot: '👨‍🚀', wingman: '🚀' }[item.type] || '🚀';
    return <span style={{ fontSize: size }}>{emoji}</span>;
  };

  const toggleEquip = () => {
    if (!selectedItem) return;
    if (selectedItem.isOwned === false) return toast.error(lang === 'vi' ? 'Bạn chưa sở hữu trang bị này!' : 'Item not owned!');
    if (selectedItem.type === 'pilot') {
      const eq = loadout.pilot === selectedItem.id;
      gsRef.current.campaignData.loadout.pilot = eq ? PILOTS[0].id : selectedItem.id;
      toast.success(lang === 'vi' ? (eq ? 'Đã tháo Phi công!' : 'Đã điều động Phi công!') : 'Pilot Updated!');
    } else {
      const eq = loadout[selectedItem.type] === selectedItem.uuid;
      gsRef.current.campaignData.loadout[selectedItem.type] = eq ? '' : selectedItem.uuid;
      toast.success(lang === 'vi' ? (eq ? 'Đã tháo trang bị!' : 'Đã gắn trang bị!') : 'Gear Updated!');
    }
    saveUserProfile(); setRefreshTick(p => p + 1);
  };

  const handleEquipAircraft = (id) => {
    if (!ownedAircrafts?.[id]) return toast.error(lang === 'vi' ? 'Bạn chưa sở hữu Phi cơ này!' : 'Aircraft not owned!');
    gsRef.current.campaignData.loadout.aircraft = id;
    saveUserProfile(); setRefreshTick(t => t + 1); toast.success(lang === 'vi' ? 'Đã đổi Phi cơ!' : 'Aircraft Equipped!');
  };

  const isEquipped = (selectedItem && selectedItem.isOwned !== false) && (loadout[selectedItem.type] === selectedItem.uuid || loadout.pilot === selectedItem.id);

  // HELPER RENDER TỪNG Ô VẬT PHẨM (Có Checkbox & Lock Icon)
  const renderItemSlot = (item, idx, isForgeMode = false) => {
    const isEq = item.isOwned && (loadout[item.type] === item.uuid || loadout.pilot === item.id || loadout.aircraft === item.id);
    const isChecked = sellSelection.includes(item.uuid);
    
    return (
      <motion.div 
        key={item.uuid} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(idx * 0.012, 0.2), duration: 0.2 }}
        className={`${styles.itemSlot} ${styles['r' + Math.min(5, item.rarity)]} ${selectedId === item.uuid ? styles.selected : ''} ${!item.isOwned ? styles.lockedItem : ''}`} 
        onClick={() => handleItemClick(item)} 
        onPointerDown={() => handlePressStart(item)}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        whileTap={(!isSelectMode && item.isOwned) ? { scale: 0.92 } : {}}
      >
        <div className={styles.itemGlow} />
        {isEq && <div className={styles.equippedBadge}><span>✓</span></div>}
        
        {/* HIỂN THỊ ICON Ổ KHÓA */}
        {item.isLocked && <div className={styles.lockIconBadge}>🔒</div>}

        {/* HIỂN THỊ CHECKBOX */}
        {isSelectMode && item.isOwned && !isEq && !item.isLocked && mainTab !== 'collection' && (
           <div className={`${styles.checkboxOverlay} ${isChecked ? styles.checked : ''}`} />
        )}

        <div className={styles.itemIconWrap}>
           {item.type === 'aircraft' ? (
              <img src={AIRCRAFTS.find(a=>a.id===item.id)?.imgHq || '/images/ship_xwing_hq.png'} alt="aircraft" style={{ maxWidth: isForgeMode ? '36px' : '40px', objectFit: 'contain' }} />
           ) : renderIcon(item, isForgeMode ? '36px' : '40px')}
        </div>
        <div className={styles.itemFooter}><span className={styles.itemLevel}>{item.isOwned ? `LV ${item.level || 1}` : '🔒'}</span></div>
      </motion.div>
    );
  };
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className={`${styles.container} ${isForge ? styles.forgeMode : ''} scrollable-layer`}>
      <div className={styles.contentWrapper}>
        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => { gsRef.current?.cameFromHQ ? setScreen('hq') : setScreen('campaign_portal'); gsRef.current.cameFromHQ = false; }}>
            <span className={styles.backArrow}>‹</span><span className={styles.backText}>{gsRef.current?.cameFromHQ ? (lang === 'vi' ? 'HÀNH DINH' : 'HQ') : (lang === 'vi' ? 'CHỈ HUY' : 'COMMAND')}</span>
          </motion.button>
          <div className={styles.headerTitle}>{mainTab === 'collection' ? (lang === 'vi' ? 'BỘ SƯU TẬP' : 'COLLECTION') : (isForge ? (lang === 'vi' ? 'XƯỞNG RÈN' : 'FORGE CORE') : (lang === 'vi' ? 'KHO VŨ KHÍ' : 'ARMORY'))}</div>
          <div className={styles.currencyBar}>
            <div className={`${styles.currencyChip} ${styles.chipEnergy}`}><div className={styles.currencyIcon}><Icons.Energy /></div><span className={styles.currencyAmt}>{currentEnergy.toLocaleString()}</span></div>
            <div className={`${styles.currencyChip} ${styles.chipCoin}`}><div className={styles.currencyIcon}><Icons.Coin /></div><span className={styles.currencyAmt}>{currentCoins.toLocaleString()}</span></div>
            <div className={`${styles.currencyChip} ${styles.chipGem}`}><div className={styles.currencyIcon}><Icons.Gem /></div><span className={styles.currencyAmt}>{currentDiamonds.toLocaleString()}</span></div>
            <div className={`${styles.currencyChip} ${styles.chipBlueprint}`}><div className={styles.currencyIcon}><Icons.Blueprint /></div><span className={styles.currencyAmt}>{currentBlueprints.toLocaleString()}</span></div>
            <div className={`${styles.currencyChip} ${styles.chipGear}`}><div className={styles.currencyIcon}><Icons.Gear /></div><span className={styles.currencyAmt}>{currentGears.toLocaleString()}</span></div>
          </div>
        </header>

        <nav className={styles.mainTabs}>
          {[
            { id: 'bag', icon: '⊞', label: { vi: 'TÚI TRANG BỊ', en: 'LOADOUT' } }, 
            { id: 'collection', icon: '📖', label: { vi: 'BỘ SƯU TẬP', en: 'COLLECTION' } },
            { id: 'forge', icon: '⊗', label: { vi: 'XƯỞNG RÈN', en: 'FORGE CORE' } }
          ].map(tab => (
            <button key={tab.id} data-tab={tab.id} className={`${styles.mainTabBtn} ${mainTab === tab.id ? styles.active : ''}`} onClick={() => { setMainTab(tab.id); setSelectedId(null); setBagFilter('all'); setIsSelectMode(false); }}>
              <span className={styles.tabIcon}>{tab.icon}</span>{tab.label[lang]}{mainTab === tab.id && <motion.div className={styles.tabUnderline} layoutId="mainUnderline" />}
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div key={mainTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className={styles.workspace}>
            
            {mainTab === 'collection' && (
              <div className={styles.collectionBoard}>
                {collectionData.map(section => (
                  <div key={section.id} className={styles.collectionSection}>
                    <div className={styles.collectionHeader}>{section.title}</div>
                    <div className={styles.collectionGrid}>
                      {section.items.map((item, idx) => renderItemSlot(item, idx, false))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mainTab !== 'collection' && (
              <>
                <div className={styles.aircraftSection}>
                  <div className={styles.sectionHeader}>
                    {lang === 'vi' ? 'HẠM ĐỘI PHI CƠ' : 'AIRCRAFT FLEET'}
                    {mainTab === 'bag' && <span className={styles.capacityText}> {bagAircrafts.length}/100</span>}
                  </div>
                  <div className={styles.aircraftGrid}>
                    {bagAircrafts.map((ac, idx) => renderItemSlot(ac, idx, isForge))}
                  </div>
                </div>

                <div className={styles.lowerWorkspace}>
                  <div className={styles.inventoryBoard}>
                    <div className={styles.verticalTabs}>
                      {sideTabs.map(tab => (
                        <button key={tab.id} className={`${styles.sideTabBtn} ${bagFilter === tab.id ? styles.active : ''}`} onClick={() => { setBagFilter(tab.id); setSelectedId(null); setIsSelectMode(false); }}>
                          <span className={styles.sideIcon}>{tab.icon}</span><span className={styles.sideLabel}>{tab.label[lang]}</span>
                          {bagFilter === tab.id && <motion.div className={styles.sideActivePip} layoutId="sidePip" />}
                        </button>
                      ))}
                    </div>
                    <div className={styles.gridArea}>
                      {mainTab === 'bag' && bagFilter === 'all' && (
                          <div style={{ gridColumn: '1 / -1', fontFamily: 'Share Tech Mono, monospace', color: '#fb923c', padding: '0 5px 10px', fontSize: '15px' }}>
                             {lang === 'vi' ? `SỨC CHỨA: ${inventoryList.length}/100` : `CAPACITY: ${inventoryList.length}/100`}
                          </div>
                      )}
                      {gridItems.length === 0 ? (
                        <div className={styles.emptyState}><span className={styles.emptyIcon}>⊡</span><span>{lang === 'vi' ? 'KHOANG CHỨA RỖNG' : 'STORAGE EMPTY'}</span></div>
                      ) : (
                        gridItems.map((item, idx) => renderItemSlot(item, idx, isForge))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* THANH CÔNG CỤ BÁN/XÓA VẬT PHẨM NỔI LÊN KHI ẤN GIỮ */}
      <AnimatePresence>
        {isSelectMode && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            exit={{ y: 100, opacity: 0 }}
            className={styles.sellActionBar}
          >
            <button className={styles.sellActionSubBtn} onClick={() => { setIsSelectMode(false); setSellSelection([]); }}>
               {lang === 'vi' ? 'HỦY' : 'CANCEL'}
            </button>
            <button className={styles.sellActionSubBtn} onClick={handleSelectAll}>
               {lang === 'vi' ? 'CHỌN TẤT CẢ' : 'SELECT ALL'}
            </button>
            <button className={styles.deleteBtn} disabled={sellSelection.length === 0} onClick={executeDelete}>
               <Icons.Trash /> {lang === 'vi' ? `XÓA (${sellSelection.length})` : `DEL (${sellSelection.length})`}
            </button>
            <button className={styles.sellBtn} disabled={sellSelection.length === 0} onClick={executeSell}>
               <Icons.Coin /> {lang === 'vi' ? `BÁN (${sellSelection.length})` : `SELL (${sellSelection.length})`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {!isSelectMode && (
        <ItemModal 
          isOpen={!!selectedId} onClose={() => setSelectedId(null)} item={selectedItem} baseInfo={itemBaseInfo}
          contextType={mainTab === 'forge' ? 'forge' : 'bag'} isEquipped={isEquipped} lang={lang} starUpInfo={starUpInfo}
          resources={{ coins: currentCoins, diamonds: currentDiamonds, blueprints: currentBlueprints, duplicateItems: duplicateItems, duplicatesCount: duplicateItems.length }}
          actions={{ 
            onEquip: selectedItem?.type === 'aircraft' ? () => handleEquipAircraft(selectedItem.id) : toggleEquip, 
            onUpgrade: handleUpgrade, 
            onStarUp: handleStarUp, 
            onToggleLock: toggleLock, // Gửi hàm khóa qua Modal
            onGoToForge: () => { setMainTab('forge'); setSelectedId(null); }, 
            onGoToShop: () => { setScreen('shop_campaign'); } 
          }}
        />
      )}
    </motion.div>
  );
}