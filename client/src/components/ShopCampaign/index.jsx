import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, PILOTS } from '../../constants';
import styles from './ShopCampaign.module.css';
import toast from 'react-hot-toast';

// --- ICONS ---
const Icons = {
  Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
  Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>)
};

// --- DATA CẤU HÌNH ---
const RARITY_COLOR = { 1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#fbbf24' };
const RARITY_LABELS = { 1: 'COMMON', 2: 'UNCOMMON', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY' };

// Cấu hình Hòm Gacha (Gắn kèm Hình ảnh Đóng/Mở)
const CRATE_CONFIGS = [
  { id: 'basic', rarity: 1, currency: 'coins', title: { vi: 'HÒM CƠ BẢN', en: 'STANDARD CRATE' }, desc: { vi: 'Trang bị tàn tích. Rớt đồ Trắng, Lục, Lam.', en: 'Salvaged parts.' }, cost: 100, dropRates: { 1: 50, 2: 35, 3: 12, 4: 3, 5: 0 }, imgClosed: '/images/common.png', imgOpen: '/images/common_op.png' },
  { id: 'premium', rarity: 3, currency: 'coins', title: { vi: 'HÒM CAO CẤP', en: 'PREMIUM CRATE' }, desc: { vi: 'Công nghệ quân sự. Có tỷ lệ Vàng!', en: 'Military tech.' }, cost: 500, dropRates: { 1: 0, 2: 40, 3: 40, 4: 15, 5: 5 }, imgClosed: '/images/rare.png', imgOpen: '/images/rare_op.png' },
  { id: 'pilot_gacha', rarity: 4, currency: 'diamonds', title: { vi: 'VÉ TUYỂN MỘ', en: 'RECRUIT TICKET' }, desc: { vi: 'Phát tín hiệu triệu hồi phi công ngẫu nhiên.', en: 'Broadcast SOS.' }, cost: 30, dropRates: { 1: 30, 2: 28, 3: 22, 4: 14, 5: 6 }, imgClosed: '/images/epic.png', imgOpen: '/images/epic_op.png' },
  { id: 'epic', rarity: 5, currency: 'diamonds', title: { vi: 'HÒM HUYỀN THOẠI', en: 'EPIC CACHE' }, desc: { vi: 'Tinh hoa vũ trụ. Chỉ rớt Lam, Tím, Vàng.', en: 'Galactic apex.' }, cost: 50, dropRates: { 1: 0, 2: 0, 3: 50, 4: 35, 5: 15 }, imgClosed: '/images/legendary.png', imgOpen: '/images/legendary_op.png' },
];

const TOPUP_PACKAGES = [
  { id: 'pack1', gems: 100, price: '22,000đ', bonus: 0 },
  { id: 'pack2', gems: 500, price: '109,000đ', bonus: 50 },
  { id: 'pack3', gems: 1200, price: '219,000đ', bonus: 200 },
  { id: 'pack4', gems: 3000, price: '499,000đ', bonus: 800 },
];

export default function ShopCampaign({ gsRef, setScreen, lang, saveUserProfile }) {
  const [activeTab, setActiveTab] = useState('crates'); // 'crates' | 'topup'
  const [selectedCrateId, setSelectedCrateId] = useState(CRATE_CONFIGS[0].id);
  const [refreshTick, setRefreshTick] = useState(0);

  // --- GACHA ANIMATION STATE ---
  const [gachaState, setGachaState] = useState('idle'); // 'idle' | 'opening' | 'opened'
  const [gachaResults, setGachaResults] = useState([]);

  const campaignData = gsRef.current.campaignData;
  if (!campaignData) return null;

  if (!campaignData.materials) campaignData.materials = { parts: 0, blueprints: 0 };
  if (!campaignData.materials.crates) campaignData.materials.crates = { basic: 0, premium: 0, epic: 0, pilot_gacha: 0 };
  
  const currentCoins = Number(gsRef.current.coins) || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;
  const currentCrates = campaignData.materials.crates;

  const activeCrate = CRATE_CONFIGS.find(c => c.id === selectedCrateId);

  // --- LOGIC MUA KIM CƯƠNG ---
  const handleTopup = (pack) => {
    const totalGems = pack.gems + pack.bonus;
    gsRef.current.diamonds = currentDiamonds + totalGems;
    saveUserProfile();
    setRefreshTick(t => t + 1);
    toast.success(lang === 'vi' ? `Nạp thành công ${totalGems} Kim cương!` : `Successfully topped up ${totalGems} Diamonds!`);
  };

  // --- LOGIC QUAY GACHA ---
  const handleOpenGacha = (amount) => {
    const inventoryStock = currentCrates[activeCrate.id] || 0;
    const cost = activeCrate.cost * amount;

    // 1. Kiểm tra tài nguyên (Ưu tiên dùng hòm có sẵn trong kho, nếu thiếu mới trừ tiền)
    if (inventoryStock >= amount) {
        campaignData.materials.crates[activeCrate.id] -= amount;
    } else {
        const isCoin = activeCrate.currency === 'coins';
        if (isCoin && currentCoins < cost) return toast.error(lang === 'vi' ? 'Không đủ Xu!' : 'Not enough Coins!');
        if (!isCoin && currentDiamonds < cost) return toast.error(lang === 'vi' ? 'Không đủ Kim cương!' : 'Not enough Diamonds!');
        
        if (isCoin) gsRef.current.coins -= cost;
        else gsRef.current.diamonds -= cost;
    }

    // 2. Thực hiện random rớt đồ
    const pullResults = [];
    for (let i = 0; i < amount; i++) {
        let roll = Math.random() * 100;
        let cumulative = 0;
        let rolledRarity = 1;

        for (let r of [5, 4, 3, 2, 1]) {
            if (activeCrate.dropRates[r] > 0) {
                cumulative += activeCrate.dropRates[r];
                if (roll <= cumulative) { rolledRarity = parseInt(r); break; }
            }
        }

        let pulledItem = null;
        if (activeCrate.id === 'pilot_gacha') {
            const validPilots = PILOTS.filter(p => p.rarity === rolledRarity);
            if (validPilots.length > 0) {
                const p = validPilots[Math.floor(Math.random() * validPilots.length)];
                gsRef.current.campaignData.ownedPilots[p.id] = gsRef.current.campaignData.ownedPilots[p.id] || { level: 1, stars: 1 };
                pulledItem = { baseId: p.id, rarity: rolledRarity, type: 'pilot' };
            }
        } else {
            const gearTypes = ['mainGun', 'wingman', 'armor', 'drone'];
            const rType = gearTypes[Math.floor(Math.random() * gearTypes.length)];
            const list = GEAR_CATALOG[rType];
            const g = list[Math.floor(Math.random() * list.length)];
            const uuid = 'item_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '_' + i;
            pulledItem = { uuid: uuid, baseId: g.id, rarity: rolledRarity, level: 1, type: rType };
            gsRef.current.campaignData.items[uuid] = pulledItem;
        }
        if (pulledItem) pullResults.push(pulledItem);
    }

    setGachaResults(pullResults);
    saveUserProfile();
    setRefreshTick(t => t + 1);

    // 3. Kích hoạt Animation Rung Rương (1.5s) rồi nổ tung thành Kết quả
    setGachaState('opening');
    setTimeout(() => {
        setGachaState('opened');
    }, 1500);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.container}>
      <div className={styles.contentWrapper}>
        
        {/* HEADER */}
        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
            <span className={styles.backArrow}>‹</span>
            <span className={styles.backText}>{lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}</span>
          </motion.button>
          <div className={styles.headerTitle}>{lang === 'vi' ? 'CHỢ TIẾP TẾ' : 'SUPPLY DEPOT'}</div>
          <div className={styles.currencyBar}>
            <div className={`${styles.currencyChip} ${styles.chipCoin}`}><div className={styles.currencyIcon}><Icons.Coin /></div><span className={styles.currencyAmt}>{currentCoins.toLocaleString()}</span></div>
            <div className={`${styles.currencyChip} ${styles.chipGem}`}><div className={styles.currencyIcon}><Icons.Gem /></div><span className={styles.currencyAmt}>{currentDiamonds.toLocaleString()}</span></div>
          </div>
        </header>

        {/* TABS: MỞ HÒM vs NẠP KIM CƯƠNG */}
        <div className={styles.mainTabs}>
          <button className={`${styles.mainTabBtn} ${activeTab === 'crates' ? styles.active : ''}`} onClick={() => setActiveTab('crates')}>
             🎁 {lang === 'vi' ? 'MỞ GACHA' : 'OPEN CRATES'}
             {activeTab === 'crates' && <motion.div className={styles.tabUnderline} layoutId="shopTab" />}
          </button>
          <button data-tab="topup" className={`${styles.mainTabBtn} ${activeTab === 'topup' ? styles.active : ''}`} onClick={() => setActiveTab('topup')}>
             💎 {lang === 'vi' ? 'NẠP KIM CƯƠNG' : 'TOP-UP GEMS'}
             {activeTab === 'topup' && <motion.div className={styles.tabUnderline} layoutId="shopTab" />}
          </button>
        </div>

        {/* WORKSPACE */}
        <div className={styles.workspace}>
          
          {/* KHU VỰC NẠP KIM CƯƠNG */}
          {activeTab === 'topup' && (
            <div className={styles.topupGrid}>
              {TOPUP_PACKAGES.map(pack => (
                 <div key={pack.id} className={styles.topupCard} onClick={() => handleTopup(pack)}>
                    {pack.bonus > 0 && <div className={styles.bonusTag}>+ {pack.bonus}</div>}
                    <div className={styles.topupIcon}>💎</div>
                    <div className={styles.topupTitle}>{pack.gems} GEMS</div>
                    <div className={styles.topupAmount}>{pack.price}</div>
                    <button className={styles.topupBtn}>{lang === 'vi' ? 'MUA NGAY' : 'PURCHASE'}</button>
                 </div>
              ))}
            </div>
          )}

          {/* KHU VỰC GACHA */}
          {activeTab === 'crates' && activeCrate && (
            <div className={styles.gachaContainer}>
              
              {/* Cột chọn hòm */}
              <div className={styles.gachaSidebar}>
                {CRATE_CONFIGS.map(crate => (
                  <div key={crate.id} className={`${styles.crateSelector} ${selectedCrateId === crate.id ? styles.selected : ''}`} onClick={() => setSelectedCrateId(crate.id)}>
                    <img src={crate.imgClosed} alt="crate" className={styles.selectorImg} />
                    <div className={styles.selectorInfo}>
                      <span className={styles.selectorTitle}>{crate.title[lang]}</span>
                      <span className={styles.selectorStock}>{lang === 'vi' ? 'Trong túi:' : 'Owned:'} {currentCrates[crate.id] || 0}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sân khấu mở hòm */}
              <div className={styles.gachaShowcase}>
                <div className={styles.showcaseGlow} />
                
                <div className={styles.showcaseInfo}>
                  <div className={styles.showcaseTitle}>{activeCrate.title[lang]}</div>
                  <div className={styles.showcaseDesc}>{activeCrate.desc[lang]}</div>
                  <div className={styles.dropRates}>
                    {[5,4,3,2,1].map(r => activeCrate.dropRates[r] > 0 && (
                      <span key={r} className={styles.dropPill} style={{ color: RARITY_COLOR[r], borderColor: RARITY_COLOR[r] }}>
                        {RARITY_LABELS[r]} {activeCrate.dropRates[r]}%
                      </span>
                    ))}
                  </div>
                </div>

                <img src={activeCrate.imgClosed} alt="crate-big" className={styles.showcaseImg} />

                <div className={styles.actionRow}>
                  {/* Nút X1 */}
                  <button 
                    className={`${styles.pullBtn} ${(currentCrates[activeCrate.id] || 0) >= 1 ? styles.useStock : (activeCrate.currency === 'coins' ? styles.useCoin : styles.useGem)}`}
                    onClick={() => handleOpenGacha(1)}
                  >
                    <span>{lang === 'vi' ? 'MỞ x1' : 'PULL x1'}</span>
                    <span className={styles.pullCost}>
                       {(currentCrates[activeCrate.id] || 0) >= 1 ? (
                         `(${lang === 'vi' ? 'Dùng Hòm' : 'Use Crate'})`
                       ) : (
                         <>{activeCrate.currency === 'coins' ? <Icons.Coin /> : <Icons.Gem />} {activeCrate.cost}</>
                       )}
                    </span>
                  </button>

                  {/* Nút X10 */}
                  <button 
                    className={`${styles.pullBtn} ${(currentCrates[activeCrate.id] || 0) >= 10 ? styles.useStock : (activeCrate.currency === 'coins' ? styles.useCoin : styles.useGem)}`}
                    onClick={() => handleOpenGacha(10)}
                  >
                    <span>{lang === 'vi' ? 'MỞ x10' : 'PULL x10'}</span>
                    <span className={styles.pullCost}>
                       {(currentCrates[activeCrate.id] || 0) >= 10 ? (
                         `(${lang === 'vi' ? 'Dùng 10 Hòm' : 'Use 10 Crates'})`
                       ) : (
                         <>{activeCrate.currency === 'coins' ? <Icons.Coin /> : <Icons.Gem />} {activeCrate.cost * 10}</>
                       )}
                    </span>
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* FULLSCREEN GACHA OVERLAY (ANIMATION) */}
      <AnimatePresence>
        {gachaState !== 'idle' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.gachaOverlay}>
            
            {/* Giai đoạn 1: Rương đang rung lắc */}
            {gachaState === 'opening' && (
              <img src={activeCrate.imgClosed} className={styles.shakingCrate} alt="shaking" />
            )}

            {/* Giai đoạn 2: Flash sáng trắng rồi hiện Rương Mở + Item */}
            {gachaState === 'opened' && (
              <>
                <div className={styles.whiteFlash} />
                <div className={styles.openedShowcase}>
                  <img src={activeCrate.imgOpen} className={styles.openedCrateImg} alt="opened" />
                  
                  <div className={styles.resultsGrid}>
                    {gachaResults.map((item, idx) => {
                      const baseInfo = item.type === 'pilot' ? PILOTS.find(p => p.id === item.baseId) : GEAR_CATALOG[item.type]?.find(g => g.id === item.baseId);
                      const rc = RARITY_COLOR[item.rarity];
                      return (
                        <motion.div 
                          key={idx} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 + idx * 0.1, type: 'spring' }}
                          className={styles.resultCard} style={{ borderColor: rc, boxShadow: `0 0 15px ${rc}40` }}
                        >
                          <img src={baseInfo?.imgSrc} alt="item" className={styles.resultImg} />
                          <span className={styles.resultRarity} style={{ color: rc }}>{'★'.repeat(item.rarity || 1)}</span>
                        </motion.div>
                      )
                    })}
                  </div>

                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className={styles.gachaCloseBtn} onClick={() => setGachaState('idle')}>
                    {lang === 'vi' ? 'XÁC NHẬN' : 'CONFIRM'}
                  </motion.button>
                </div>
              </>
            )}

          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}