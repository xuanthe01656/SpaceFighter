import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, PILOTS, CRATE_CONFIGS, TOPUP_PACKAGES, FIRST_TOPUP_REWARD, AIRCRAFTS } from '../../constants'; 
import styles from './ShopCampaign.module.css';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';
import { recordGuestGacha, recordGuestCoinSpend } from '../../utils/guestProgress';

// --- ĐỒNG BỘ HỆ THỐNG SVG ICONS CHUẨN SCI-FI ---
const Icons = {
  Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
  Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
  Gift: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>)
};

const formatCompactNumber = (number) => {
  if (number < 1000) return number.toString();
  const suffixes = ["", "K", "M", "B", "T"];
  const suffixNum = Math.floor(("" + number).length / 3);
  let shortValue = parseFloat((suffixNum !== 0 ? (number / Math.pow(1000, suffixNum)) : number).toPrecision(3));
  if (shortValue % 1 !== 0) shortValue = shortValue.toFixed(1);
  return shortValue + suffixes[suffixNum];
};

const RARITY_COLOR = { 1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#fbbf24' };
const RARITY_LABELS = { 1: 'COMMON', 2: 'UNCOMMON', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY' };

export default function ShopCampaign({ gsRef, setScreen, lang, saveUserProfile, gameAction, getRealTime }) {
  const [activeTab, setActiveTab] = useState(gsRef.current?.shopInitialTab || 'crates');
  
  useEffect(() => {
     if(gsRef.current?.shopInitialTab) gsRef.current.shopInitialTab = null;
  }, []);
  
  // Phase 0: IAP must remain disabled until backend verification and idempotent
  // fulfillment are deployed. Never grant currency from client purchase callbacks.
  const rcOfferings = null;
  
  const gachaCrates = CRATE_CONFIGS.map(c => {
    if(c.id === 'basic') return {...c, imgClosed: '/images/common.png', imgOpen: '/images/common_op.png'};
    if(c.id === 'premium') return {...c, imgClosed: '/images/rare.png', imgOpen: '/images/rare_op.png'};
    if(c.id === 'pilot_gacha') return {...c, imgClosed: '/images/epic.png', imgOpen: '/images/epic_op.png'};
    if(c.id === 'epic') return {...c, imgClosed: '/images/legendary.png', imgOpen: '/images/legendary_op.png'};
    return {...c, imgClosed: '/images/common.png', imgOpen: '/images/common_op.png'};
  });

  const [selectedCrateId, setSelectedCrateId] = useState(gachaCrates[0].id);
  const [refreshTick, setRefreshTick] = useState(0);

  const [gachaState, setGachaState] = useState('idle'); 
  const [gachaResults, setGachaResults] = useState([]);

  const campaignData = gsRef.current.campaignData;
  if (!campaignData) return null;

  if (!campaignData.materials) campaignData.materials = { parts: 0, blueprints: 0 };
  if (!campaignData.materials.crates) campaignData.materials.crates = { basic: 0, premium: 0, epic: 0, pilot_gacha: 0 };
  
  const currentCoins = Number(gsRef.current.coins) || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;
  const currentCrates = campaignData.materials.crates;

  const activeCrate = gachaCrates.find(c => c.id === selectedCrateId);

  // Phase 0 fail-closed: preview shop prices, but do not start a real purchase
  // or award gems until Phase 1 server-side receipt verification exists.
  const handleTopup = () => {
    toast.error(lang === 'vi'
      ? 'Nạp tiền đang tạm khóa để nâng cấp bảo mật. Chưa có giao dịch nào được thực hiện.'
      : 'Purchases are disabled until secure server verification is ready. No payment was taken.');
  };

  const handleOpenGacha = async (amount) => {
    if (auth.currentUser) {
      try {
        setGachaState('opening');
        const result = await gameAction('gacha.open',{crateId:activeCrate.id,amount});
        setGachaResults(result.extra.pulls || []);
        setRefreshTick(t=>t+1);
        setGachaState('opened');
      }catch(error){
        setGachaState('idle');toast.error(error.message);
      }
      return;
    }
    const inventoryStock = currentCrates[activeCrate.id] || 0;
    const cost = activeCrate.cost * amount;

    if (inventoryStock >= amount) {
        campaignData.materials.crates[activeCrate.id] -= amount;
    } else {
        const isCoin = activeCrate.currency === 'coins';
        if (isCoin && currentCoins < cost) return toast.error(lang === 'vi' ? 'Không đủ Xu!' : 'Not enough Coins!');
        if (!isCoin && currentDiamonds < cost) return toast.error(lang === 'vi' ? 'Không đủ Kim cương!' : 'Not enough Diamonds!');
        
        if (isCoin) { gsRef.current.coins -= cost; recordGuestCoinSpend(campaignData,cost,getRealTime()); }
        else gsRef.current.diamonds -= cost;
    }

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

    recordGuestGacha(campaignData,amount,getRealTime());
    setGachaResults(pullResults);
    saveUserProfile();
    setRefreshTick(t => t + 1);

    setGachaState('opening');
    setTimeout(() => setGachaState('opened'), 1500);
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
            <div className={`${styles.currencyChip} ${styles.chipCoin}`}><div className={styles.currencyIcon}><Icons.Coin /></div><span className={styles.currencyAmt}>{formatCompactNumber(currentCoins)}</span></div>
            <div className={`${styles.currencyChip} ${styles.chipGem}`}><div className={styles.currencyIcon}><Icons.Gem /></div><span className={styles.currencyAmt}>{formatCompactNumber(currentDiamonds)}</span></div>
          </div>
        </header>

        {/* TABS CÙNG SVG ICONS */}
        <div className={styles.mainTabs}>
          <button className={`${styles.mainTabBtn} ${activeTab === 'crates' ? styles.active : ''}`} onClick={() => setActiveTab('crates')}>
             <div style={{ width: '22px', height: '22px' }}><Icons.Gift /></div>
             {lang === 'vi' ? 'MỞ GACHA' : 'OPEN CRATES'}
             {activeTab === 'crates' && <motion.div className={styles.tabUnderline} layoutId="shopTab" />}
          </button>
          <button data-tab="topup" className={`${styles.mainTabBtn} ${activeTab === 'topup' ? styles.active : ''}`} onClick={() => setActiveTab('topup')}>
             <div style={{ width: '22px', height: '22px' }}><Icons.Gem /></div>
             {lang === 'vi' ? 'NẠP KIM CƯƠNG' : 'TOP-UP GEMS'}
             {activeTab === 'topup' && <motion.div className={styles.tabUnderline} layoutId="shopTab" />}
          </button>
        </div>

        {/* WORKSPACE */}
        <div className={styles.workspace}>
          
          {/* KHU VỰC NẠP KIM CƯƠNG */}
          {activeTab === 'topup' && (
            <div className={styles.topupGrid}>
              <p style={{ gridColumn: '1 / -1', padding: 12, color: '#ffd166', border: '1px solid #ffd166', borderRadius: 8, textAlign: 'center' }}>
                {lang === 'vi' ? 'THANH TOÁN TẠM KHÓA — HỆ THỐNG ĐANG NÂNG CẤP BẢO MẬT, KHÔNG TRỪ TIỀN' : 'PURCHASES DISABLED — SECURITY UPGRADE IN PROGRESS, NO CHARGES'}
              </p>
              
              {/* BANNER NẠP LẦN ĐẦU */}
              {!campaignData.hasClaimedFirstTopup && (
                 <div className={styles.firstTopupBanner}>
                   <h3>{lang === 'vi' ? 'QUÀ TẶNG NẠP LẦN ĐẦU' : 'FIRST TOP-UP BONUS'}</h3>
                   <p>{lang === 'vi' ? 'Mua bất kỳ gói Kim Cương nào dưới đây để kích hoạt nhận ngay bộ quà tặng Huyền thoại!' : 'Top up ANY package below to claim all these Legendary rewards immediately!'}</p>
                   
                   <div className={styles.ftbRewards}>
                      <div className={styles.ftbItem}>
                         <div className={styles.ftbItemImg}>
                            <img 
                               src={AIRCRAFTS.find(a=>a.id === FIRST_TOPUP_REWARD.aircraftId)?.imgSrc || '/images/ships/nova_hq.png'} 
                               alt="Nova" 
                               onError={(e) => { e.target.onerror = null; e.target.src = '/images/no_image.png'; }}
                            />
                         </div>
                         <span style={{ color: '#facc15' }}>{AIRCRAFTS.find(a=>a.id === FIRST_TOPUP_REWARD.aircraftId)?.name[lang] || 'NOVA'}</span>
                      </div>
                      <div className={styles.ftbItem}>
                         <div className={styles.ftbItemImg} style={{ color: '#c084fc' }}><Icons.Gem /></div>
                         <span style={{ color: '#c084fc' }}>+{formatCompactNumber(FIRST_TOPUP_REWARD.gems)} GEMS</span>
                      </div>
                      <div className={styles.ftbItem}>
                         <div className={styles.ftbItemImg} style={{ color: '#fb923c' }}><Icons.Coin /></div>
                         <span style={{ color: '#fb923c' }}>+{formatCompactNumber(FIRST_TOPUP_REWARD.coins)} COINS</span>
                      </div>
                   </div>
                 </div>
              )}

              {/* RENDER CÁC GÓI NẠP - SỬ DỤNG LỆNH FILTER ĐỂ ẨN GÓI 0 GEM */}
              {TOPUP_PACKAGES.filter(pack => pack.gems > 0 && !pack.isFirstTopup).map(pack => {
                 const storePack = rcOfferings?.availablePackages?.find(p => p.identifier === pack.id);
                 const displayPrice = storePack ? storePack.product.priceString : pack.price[lang];
                 
                 return (
                 <div key={pack.id} className={styles.topupCard} role="button" aria-disabled="true" title={lang === 'vi' ? 'Tạm ngừng thanh toán' : 'Purchases unavailable'} style={{opacity: 0.6, cursor: 'not-allowed'}} onClick={handleTopup}>
                    {pack.bonus > 0 && <div className={styles.bonusTag}>+ {pack.bonus}</div>}
                    
                    <div className={styles.topupIcon} style={{ width: '48px', height: '48px', margin: '0 auto 10px auto', color: 'var(--gem-color)' }}>
                      <Icons.Gem />
                    </div>
                    
                    <div className={styles.topupTitle}>{pack.gems} GEMS</div>
                    <div className={styles.topupAmount}>{displayPrice}</div>
                    <button className={styles.topupBtn}>{lang === 'vi' ? 'MUA NGAY' : 'PURCHASE'}</button>
                 </div>
              )})}
            </div>
          )}

          {/* KHU VỰC GACHA (Giữ nguyên) */}
          {activeTab === 'crates' && activeCrate && (
            <div className={styles.gachaContainer}>
              <div className={styles.gachaSidebar}>
                {gachaCrates.map(crate => (
                  <div key={crate.id} className={`${styles.crateSelector} ${selectedCrateId === crate.id ? styles.selected : ''}`} onClick={() => setSelectedCrateId(crate.id)}>
                    <img src={crate.imgClosed} alt="crate" className={styles.selectorImg} />
                    <div className={styles.selectorInfo}>
                      <span className={styles.selectorTitle}>{crate.title[lang]}</span>
                      <span className={styles.selectorStock}>{lang === 'vi' ? 'Trong túi:' : 'Owned:'} {currentCrates[crate.id] || 0}</span>
                    </div>
                  </div>
                ))}
              </div>

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
                  <button 
                    className={`${styles.pullBtn} ${(currentCrates[activeCrate.id] || 0) >= 1 ? styles.useStock : (activeCrate.currency === 'coins' ? styles.useCoin : styles.useGem)}`}
                    onClick={() => handleOpenGacha(1)}
                  >
                    <span>{lang === 'vi' ? 'MỞ x1' : 'PULL x1'}</span>
                    <span className={styles.pullCost}>
                       {(currentCrates[activeCrate.id] || 0) >= 1 ? (
                         `(${lang === 'vi' ? 'Dùng Hòm' : 'Use Crate'})`
                       ) : (
                         <><div style={{ width: '16px', height: '16px' }}>{activeCrate.currency === 'coins' ? <Icons.Coin /> : <Icons.Gem />}</div>{activeCrate.cost}</>
                       )}
                    </span>
                  </button>

                  <button 
                    className={`${styles.pullBtn} ${(currentCrates[activeCrate.id] || 0) >= 10 ? styles.useStock : (activeCrate.currency === 'coins' ? styles.useCoin : styles.useGem)}`}
                    onClick={() => handleOpenGacha(10)}
                  >
                    <span>{lang === 'vi' ? 'MỞ x10' : 'PULL x10'}</span>
                    <span className={styles.pullCost}>
                       {(currentCrates[activeCrate.id] || 0) >= 10 ? (
                         `(${lang === 'vi' ? 'Dùng 10 Hòm' : 'Use 10 Crates'})`
                       ) : (
                         <><div style={{ width: '16px', height: '16px' }}>{activeCrate.currency === 'coins' ? <Icons.Coin /> : <Icons.Gem />}</div>{activeCrate.cost * 10}</>
                       )}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {gachaState !== 'idle' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.gachaOverlay}>
            {gachaState === 'opening' && (
              <img src={activeCrate.imgClosed} className={styles.shakingCrate} alt="shaking" />
            )}

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
                         <img 
                            src={baseInfo?.imgSrc || '/images/no_image.png'} 
                            alt="item" 
                            className={styles.resultImg} 
                            onError={(e) => { e.target.onerror = null; e.target.src = '/images/no_image.png'; }}
                          />
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