import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, AIRCRAFTS, PILOTS } from '../../constants';
import styles from './Inventory.module.css';
import toast from 'react-hot-toast';

export default function Inventory({ gsRef, setScreen, lang, saveUserProfile }) {
  const [activeTab, setActiveTab] = useState('inventory'); 
  const [selectedId, setSelectedId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0); 

  const campaignData = gsRef.current.campaignData;
  if (!campaignData) return null;

  const { items, loadout, ownedPilots } = campaignData;
  
  // 🛑 BƯỚC SỬA LỖI QUAN TRỌNG: ÉP KIỂU VỀ NUMBER ĐỂ CHỐNG NaN
  const currentCoins = Number(gsRef.current.coins) || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;

  const inventoryList = Object.keys(items).map(uuid => ({
    uuid, ...items[uuid]
  })).sort((a, b) => b.rarity - a.rarity); 

  const selectedItem = selectedId ? { uuid: selectedId, ...items[selectedId] } : null;
  const itemBaseInfo = selectedItem ? GEAR_CATALOG[selectedItem.type]?.find(g => g.id === selectedItem.baseId) : null;

  const upgradeCost = selectedItem ? selectedItem.level * 100 : 0;

  const calculateNewCP = (newLoadout) => {
    const aircraft = AIRCRAFTS.find(a => a.id === newLoadout.aircraft) || AIRCRAFTS[0];
    const pilot = PILOTS.find(p => p.id === newLoadout.pilot) || PILOTS[0];
    let totalAtk = aircraft.baseAtk;
    let totalHp = aircraft.baseHp;

    ['mainGun', 'wingman', 'armor'].forEach(slot => {
      const itemUuid = newLoadout[slot];
      if (itemUuid && items[itemUuid]) {
        const item = items[itemUuid];
        const base = GEAR_CATALOG[slot]?.find(g => g.id === item.baseId);
        if (base) { 
          if (base.baseAtk) totalAtk += base.baseAtk + (item.level * 3) * item.rarity;
          if (base.baseHp) totalHp += base.baseHp + (item.level * 15) * item.rarity;
        }
      }
    });
    return (totalAtk * 10) + totalHp;
  };

  const toggleEquip = () => {
    if (!selectedItem) return;
    const isEquipped = loadout[selectedItem.type] === selectedItem.uuid;
    
    const newLoadout = { 
      ...loadout,
      [selectedItem.type]: isEquipped ? "" : selectedItem.uuid 
    };
    
    gsRef.current.campaignData.loadout = newLoadout;
    try { gsRef.current.campaignData.progress.combatPower = calculateNewCP(newLoadout); } catch(e) {}
    
    saveUserProfile();
    setRefreshTick(prev => prev + 1); 
    toast.success(lang === 'vi' ? (isEquipped ? 'Đã tháo!' : 'Đã trang bị!') : (isEquipped ? 'Unequipped!' : 'Equipped!'));
  };

  const handleUpgrade = () => {
    if (!selectedItem) return;
    if (currentCoins < upgradeCost) return toast.error(lang === 'vi' ? 'Không đủ Xu!' : 'Not enough coins!');

    // Tính toán bằng biến an toàn
    gsRef.current.coins = currentCoins - upgradeCost;
    gsRef.current.campaignData.items[selectedItem.uuid].level += 1;
    
    if (loadout[selectedItem.type] === selectedItem.uuid) {
      gsRef.current.campaignData.progress.combatPower = calculateNewCP(loadout);
    }

    saveUserProfile({ coins: gsRef.current.coins, campaignData: gsRef.current.campaignData });
    setRefreshTick(prev => prev + 1);
    toast.success(lang === 'vi' ? `Lên Cấp ${selectedItem.level + 1}!` : `Level Up!`, { icon: '⬆️' });
  };

  const handleGacha = (crateType) => {
    // 1. HÒM PHI CÔNG ĐÃ ĐƯỢC BỌC THÉP
    if (crateType === 'pilot') {
      const pilotCost = 30; 
      // Kiểm tra bằng currentDiamonds (Chắc chắn là một số >= 0)
      if (currentDiamonds < pilotCost) return toast.error(lang === 'vi' ? 'Thiếu Kim Cương!' : 'Not enough Diamonds!');
      
      gsRef.current.diamonds = currentDiamonds - pilotCost;
      
      const randomPilot = PILOTS[Math.floor(Math.random() * PILOTS.length)];
      const currentPilotData = gsRef.current.campaignData.ownedPilots[randomPilot.id];
      
      let isDuplicate = false;
      if (currentPilotData) {
        gsRef.current.coins = currentCoins + 1000;
        isDuplicate = true;
      } else {
        gsRef.current.campaignData.ownedPilots[randomPilot.id] = { level: 1, stars: 1 };
      }

      saveUserProfile({ diamonds: gsRef.current.diamonds, coins: gsRef.current.coins, campaignData: gsRef.current.campaignData });
      setRefreshTick(prev => prev + 1);

      toast.success(lang === 'vi' 
        ? `Nhận: ${randomPilot.name.vi} ${isDuplicate ? '(Trùng: +1000 🪙)' : '(Mới)'}` 
        : `Got: ${randomPilot.name.en} ${isDuplicate ? '(Dupe: +1000 🪙)' : '(New)'}`, 
      {
        icon: '👨‍🚀', duration: 4000,
        style: { border: `2px solid #00e5ff`, background: '#12161c', color: '#fff' }
      });
      return;
    }

    // 2. CÁC HÒM VŨ KHÍ CŨNG ĐƯỢC BỌC THÉP
    let cost = 0; let currency = 'coins'; let dropRates = {};

    if (crateType === 'basic') {
      cost = 100; currency = 'coins'; dropRates = {1: 50, 2: 35, 3: 12, 4: 3, 5: 0}; 
    } else if (crateType === 'premium') {
      cost = 500; currency = 'coins'; dropRates = {1: 0, 2: 40, 3: 40, 4: 15, 5: 5}; 
    } else if (crateType === 'epic') {
      cost = 50; currency = 'diamonds'; dropRates = {1: 0, 2: 0, 3: 50, 4: 35, 5: 15}; 
    }

    if (currency === 'coins' && currentCoins < cost) return toast.error(lang === 'vi' ? 'Thiếu Xu!' : 'Not enough Coins!');
    if (currency === 'diamonds' && currentDiamonds < cost) return toast.error(lang === 'vi' ? 'Thiếu Kim Cương!' : 'Not enough Diamonds!');

    if (currency === 'coins') gsRef.current.coins = currentCoins - cost;
    if (currency === 'diamonds') gsRef.current.diamonds = currentDiamonds - cost;
    
    const types = ['mainGun', 'wingman', 'armor'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    const catalog = GEAR_CATALOG[randomType];
    const randomBaseItem = catalog[Math.floor(Math.random() * catalog.length)];

    const randRoll = Math.random() * 100;
    let rarity = 1;
    let cumulative = 0;
    for (let r = 1; r <= 5; r++) {
      cumulative += dropRates[r];
      if (randRoll <= cumulative) { rarity = r; break; }
    }

    const newUuid = 'item_' + Date.now() + Math.floor(Math.random() * 1000);
    gsRef.current.campaignData.items[newUuid] = { baseId: randomBaseItem.id, rarity: rarity, level: 1, type: randomType };

    saveUserProfile({ coins: gsRef.current.coins, diamonds: gsRef.current.diamonds, campaignData: gsRef.current.campaignData });
    setRefreshTick(prev => prev + 1);

    const rarityIcons = ['⚪', '🟢', '🔵', '🟣', '🟡'];
    toast(lang === 'vi' ? `Nhận: ${randomBaseItem.name.vi}` : `Got: ${randomBaseItem.name.en}`, {
      icon: rarityIcons[rarity - 1], duration: 4000,
      style: { border: `2px solid ${rarity === 5 ? '#f1c40f' : rarity === 4 ? '#9b59b6' : '#3498db'}`, background: '#12161c', color: '#fff' }
    });
  };

  const fadeVariants = { hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${styles.container} scrollable-layer`}>
      
      <div className={styles.contentWrapper}>
        <div className={styles.header}>
          <motion.button whileTap={{ scale: 0.9 }} className={styles.backBtn} onClick={() => setScreen('hq')}>
            ◀ {lang === 'vi' ? 'HQ' : 'HQ'}
          </motion.button>
          <div style={{ display: 'flex', gap: '15px', fontSize: '20px', fontWeight: 'bold' }}>
            <span style={{ color: '#FFD700', textShadow: '0 0 10px rgba(255,215,0,0.5)' }}>🪙 {currentCoins}</span>
            <span style={{ color: '#00d2d3', textShadow: '0 0 10px rgba(0,210,211,0.5)' }}>💎 {currentDiamonds}</span>
          </div>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tabBtn} ${activeTab === 'inventory' ? styles.active : ''}`} onClick={() => setActiveTab('inventory')}>
            📦 {lang === 'vi' ? 'KHO ĐỒ' : 'INVENTORY'}
          </button>
          <button className={`${styles.tabBtn} ${activeTab === 'store' ? styles.active : ''}`} onClick={() => setActiveTab('store')}>
            🚀 {lang === 'vi' ? 'TIẾP TẾ' : 'SUPPLY'}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'inventory' && (
            <motion.div key="inv" variants={fadeVariants} initial="hidden" animate="visible" exit="hidden" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className={styles.grid}>
                {inventoryList.map((item, i) => (
                  <motion.div 
                    key={item.uuid} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className={`${styles.itemSlot} ${styles['rarity' + item.rarity]} ${selectedId === item.uuid ? styles.selected : ''}`}
                    onClick={() => setSelectedId(item.uuid)} whileTap={{ scale: 0.9 }}
                  >
                    {loadout[item.type] === item.uuid && <span className={styles.equippedBadge}>E</span>}
                    <span style={{ fontSize: '30px' }}>{item.type === 'mainGun' ? '🔫' : item.type === 'armor' ? '🛡️' : '🛸'}</span>
                    <span style={{ fontSize: '12px', color: '#ccc', marginTop: '5px' }}>Lv.{item.level}</span>
                  </motion.div>
                ))}
              </div>

              <div className={styles.detailPanel}>
                {selectedItem ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 5px 0', color: '#66fcf1', fontSize: 'clamp(20px, 5vw, 26px)', textTransform: 'uppercase' }}>
                        {itemBaseInfo ? itemBaseInfo.name[lang] : "Trang bị ẩn"}
                      </h3>
                      <p style={{ margin: '0 0 10px 0', color: '#ffd700' }}>Lv.{selectedItem.level} {'⭐'.repeat(selectedItem.rarity)}</p>
                      
                      <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px' }}>
                        {itemBaseInfo?.baseAtk && <p style={{ margin: '0 0 5px 0', color: '#ff4757', fontWeight: 'bold' }}>ATK: {itemBaseInfo.baseAtk + (selectedItem.level * 3) * selectedItem.rarity}</p>}
                        {itemBaseInfo?.baseHp && <p style={{ margin: '0', color: '#2ed573', fontWeight: 'bold' }}>HP: {itemBaseInfo.baseHp + (selectedItem.level * 15) * selectedItem.rarity}</p>}
                      </div>
                    </div>
                    
                    <div className={styles.actionGroup}>
                      {(() => {
                        const isEquipped = loadout[selectedItem.type] === selectedItem.uuid;
                        return (
                          <motion.button whileTap={{ scale: 0.95 }} onClick={toggleEquip}
                            className={`${styles.btnAction} ${isEquipped ? styles.unequipBtn : styles.equipBtn}`} 
                          >
                            {isEquipped ? (lang === 'vi' ? 'THÁO' : 'UNEQUIP') : (lang === 'vi' ? 'MẶC' : 'EQUIP')}
                          </motion.button>
                        );
                      })()}
                      
                      <motion.button whileTap={{ scale: 0.95 }} onClick={handleUpgrade}
                        className={`${styles.btnAction} ${styles.upgradeBtn}`} 
                        disabled={currentCoins < upgradeCost}
                      >
                        {lang === 'vi' ? 'RÈN' : 'UPGRADE'} <span style={{fontSize: '14px', display:'block'}}>(🪙 {upgradeCost})</span>
                      </motion.button>
                    </div>
                  </>
                ) : (
                  <p style={{ textAlign: 'center', color: '#888', margin: 'auto', fontSize: '18px' }}>
                    {lang === 'vi' ? 'CHỌN TRANG BỊ' : 'SELECT AN ITEM'}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'store' && (
            <motion.div key="store" variants={fadeVariants} initial="hidden" animate="visible" exit="hidden" className={styles.storeContainer}>
              
              <div className={`${styles.crateCard} ${styles.cratePilot}`}>
                 <div className={styles.gachaIcon} style={{ filter: 'drop-shadow(0 0 20px #00e5ff)' }}>👨‍🚀</div>
                 <h3 style={{ color: '#00e5ff', margin: '0 0 10px 0' }}>{lang === 'vi' ? 'TUYỂN MỘ PHI CÔNG' : 'PILOT RECRUIT'}</h3>
                 <p style={{ color: '#ccc', fontSize: '14px' }}>
                   {lang === 'vi' ? 'Triệu hồi ngẫu nhiên 1 Phi công. Nếu trùng lặp sẽ quy đổi thành 1000 Xu.' : 'Summon 1 random Pilot. Duplicates convert to 1000 Coins.'}
                 </p>
                 <motion.button whileTap={{ scale: 0.9 }} className={styles.gachaBtn} style={{ background: '#00e5ff' }} onClick={() => handleGacha('pilot')}>
                   MỞ: 30 💎
                 </motion.button>
              </div>

              <div className={`${styles.crateCard} ${styles.cratePremium}`}>
                 <div className={styles.gachaIcon}>💎</div>
                 <h3 style={{ color: '#9b59b6', margin: '0 0 10px 0' }}>{lang === 'vi' ? 'HÒM VŨ KHÍ CAO CẤP' : 'PREMIUM GEAR'}</h3>
                 <p style={{ color: '#ccc', fontSize: '14px' }}>{lang === 'vi' ? 'Đảm bảo Lục trở lên. Có tỷ lệ ra Vàng!' : 'Guaranteed Green+. Chance for Gold!'}</p>
                 <motion.button whileTap={{ scale: 0.9 }} className={styles.gachaBtn} style={{ background: '#9b59b6', color: '#fff' }} onClick={() => handleGacha('premium')}>
                   MỞ: 500 🪙
                 </motion.button>
              </div>

              <div className={`${styles.crateCard} ${styles.crateEpic}`}>
                 <div className={styles.gachaIcon} style={{ filter: 'drop-shadow(0 0 20px #f1c40f)' }}>👑</div>
                 <h3 style={{ color: '#f1c40f', margin: '0 0 10px 0' }}>{lang === 'vi' ? 'HÒM VŨ KHÍ HUYỀN THOẠI' : 'EPIC GEAR'}</h3>
                 <p style={{ color: '#ccc', fontSize: '14px' }}>{lang === 'vi' ? 'Chỉ rớt Lam, Tím, Vàng cực phẩm.' : 'Only drops Blue, Purple, Gold epics.'}</p>
                 <motion.button whileTap={{ scale: 0.9 }} className={styles.gachaBtn} style={{ background: '#f1c40f' }} onClick={() => handleGacha('epic')}>
                   MỞ: 50 💎
                 </motion.button>
              </div>

              <div className={`${styles.crateCard} ${styles.crateBasic}`}>
                 <div className={styles.gachaIcon}>📦</div>
                 <h3 style={{ color: '#3498db', margin: '0 0 10px 0' }}>{lang === 'vi' ? 'HÒM CƠ BẢN' : 'BASIC CRATE'}</h3>
                 <p style={{ color: '#ccc', fontSize: '14px' }}>{lang === 'vi' ? 'Rớt đồ Trắng, Lục, Lam.' : 'Drops White, Green, Blue gear.'}</p>
                 <motion.button whileTap={{ scale: 0.9 }} className={styles.gachaBtn} style={{ background: '#3498db', color: '#fff' }} onClick={() => handleGacha('basic')}>
                   MỞ: 100 🪙
                 </motion.button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}