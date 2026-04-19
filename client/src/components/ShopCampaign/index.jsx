import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, PILOTS, AIRCRAFTS } from '../../constants';
import styles from './ShopCampaign.module.css';
import toast from 'react-hot-toast';

// --- HỆ THỐNG SVG ICONS SCI-FI ---
const Icons = {
  Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
  Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
  Blueprint: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>),
  Sacrifice: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  Crate: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
};

// ── Định nghĩa giá bán ──
const AIRCRAFT_PRICE = { 1: { cost: 800, currency: 'coins' }, 2: { cost: 4000, currency: 'coins' }, 3: { cost: 12000, currency: 'coins' }, 4: { cost: 100, currency: 'diamonds' } };
const PILOT_PRICE    = { 1: { cost: 10, currency: 'diamonds' }, 2: { cost: 20, currency: 'diamonds' }, 3: { cost: 40, currency: 'diamonds' }, 4: { cost: 80, currency: 'diamonds' }, 5: { cost: 150, currency: 'diamonds' } };
const GEAR_PRICE     = { cost: 1000, currency: 'coins' };

const TIER_LABELS    = { 1: 'TIER I', 2: 'TIER II', 3: 'TIER III', 4: 'LEGENDARY' };
const RARITY_LABELS  = { 1: 'COMMON', 2: 'UNCOMMON', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY' };

// ── Drop rate configs cho từng loại hòm ──
const CRATE_CONFIGS = [
  { id: 'basic',       shopType: 'crate', rarity: 1, currency: 'coins',    icon: '📦', title: { vi: 'HÒM CƠ BẢN', en: 'STANDARD CRATE' }, desc: { vi: 'Trang bị tàn tích. Rớt đồ Trắng, Lục, Lam.', en: 'Salvaged parts.' }, cost: 100, dropRates: { 1: 50, 2: 35, 3: 12, 4: 3, 5: 0 } },
  { id: 'premium',     shopType: 'crate', rarity: 3, currency: 'coins',    icon: '🔮', title: { vi: 'HÒM CAO CẤP', en: 'PREMIUM CRATE' }, desc: { vi: 'Công nghệ quân sự. Đảm bảo Lục+. Có tỷ lệ Vàng!', en: 'Military tech.' }, cost: 500, dropRates: { 1: 0, 2: 40, 3: 40, 4: 15, 5: 5 } },
  { id: 'epic',        shopType: 'crate', rarity: 5, currency: 'diamonds', icon: '👑', title: { vi: 'HÒM HUYỀN THOẠI', en: 'EPIC CACHE' }, desc: { vi: 'Tinh hoa vũ trụ. Chỉ rớt Lam, Tím, Vàng.', en: 'Galactic apex.' }, cost: 50, dropRates: { 1: 0, 2: 0, 3: 50, 4: 35, 5: 15 } },
  { id: 'pilot_gacha', shopType: 'crate', rarity: 4, currency: 'diamonds', icon: '📡', title: { vi: 'VÉ TUYỂN MỘ', en: 'RECRUIT TICKET' }, desc: { vi: 'Phát tín hiệu triệu hồi phi công ngẫu nhiên.', en: 'Broadcast SOS.' }, cost: 30, dropRates: { 1: 30, 2: 28, 3: 22, 4: 14, 5: 6 } },
];

export default function ShopCampaign({ gsRef, setScreen, lang, saveUserProfile }) {
  const [activeTab, setActiveTab] = useState('crates');
  const [selectedId, setSelectedId] = useState(CRATE_CONFIGS[0].id);
  const [refreshTick, setRefreshTick] = useState(0);

  const campaignData = gsRef.current.campaignData;
  if (!campaignData) return null;

  if (!campaignData.materials) campaignData.materials = { parts: 0, blueprints: 0 };
  if (!campaignData.materials.crates) campaignData.materials.crates = { basic: 0, premium: 0, epic: 0, pilot_gacha: 0 };
  if (!campaignData.ownedAircrafts) campaignData.ownedAircrafts = { ship_xwing: true };

  const { ownedPilots, ownedAircrafts, materials } = campaignData;
  const currentCoins    = Number(gsRef.current.coins)    || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;
  const currentBlueprints = Number(materials.blueprints)   || 0;
  const currentGears      = Number(materials.gears)        || 0;

  const deduct = (currency, amount) => {
    if (currency === 'coins')    gsRef.current.coins    -= amount;
    if (currency === 'diamonds') gsRef.current.diamonds -= amount;
    saveUserProfile();
    setRefreshTick(t => t + 1);
  };
  const canAfford = (currency, cost) => currency === 'coins' ? currentCoins >= cost : currentDiamonds >= cost;

  const handleBuyCrate = (crate, amount) => {
    const totalCost = crate.cost * amount;
    if (!canAfford(crate.currency, totalCost)) return toast.error(lang === 'vi' ? 'Không đủ tài nguyên!' : 'Insufficient funds!');
    deduct(crate.currency, totalCost);
    campaignData.materials.crates[crate.id] = (campaignData.materials.crates[crate.id] || 0) + amount;
    toast.success(lang === 'vi' ? `Đã mua ${amount}x ${crate.title.vi}. Hãy mở trong Kho!` : `Bought ${amount}x ${crate.title.en}.`);
  };

  const handleBuyAircraft = (ac) => {
    const { cost, currency } = AIRCRAFT_PRICE[ac.tier];
    if (!canAfford(currency, cost)) return toast.error(lang === 'vi' ? 'Không đủ tài nguyên!' : 'Insufficient funds!');
    deduct(currency, cost);
    campaignData.ownedAircrafts[ac.id] = true;
    toast.success(lang === 'vi' ? `Đã mua: ${ac.name.vi}` : `Purchased: ${ac.name.en}`);
  };

  const handleBuyPilot = (pilot) => {
    const { cost, currency } = PILOT_PRICE[pilot.rarity];
    if (!canAfford(currency, cost)) return toast.error(lang === 'vi' ? 'Không đủ tài nguyên!' : 'Insufficient funds!');
    deduct(currency, cost);
    campaignData.ownedPilots[pilot.id] = { level: 1, stars: 1 };
    toast.success(lang === 'vi' ? `Đã chiêu mộ: ${pilot.name.vi}` : `Recruited: ${pilot.name.en}`);
  };

  const handleBuyGear = (gear, type) => {
    const { cost, currency } = GEAR_PRICE;
    if (!canAfford(currency, cost)) return toast.error(lang === 'vi' ? 'Không đủ Xu!' : 'Insufficient Credits!');
    deduct(currency, cost);
    const uuid = 'item_' + Date.now() + Math.floor(Math.random() * 1000);
    campaignData.items[uuid] = { baseId: gear.id, rarity: 1, level: 1, type: type };
    toast.success(lang === 'vi' ? `Đã mua thành công!` : `Purchase successful!`);
  };

  const sideTabs = [
    { id: 'crates',    icon: '📦', label: { vi: 'HÒM GACHA',  en: 'CRATES'   } },
    { id: 'aircrafts', icon: '🚀', label: { vi: 'PHI CƠ',     en: 'SHIPS'    } },
    { id: 'pilots',    icon: '👨‍🚀', label: { vi: 'PHI CÔNG',   en: 'PILOTS'   } },
    { id: 'mainGun',   icon: '🔫', label: { vi: 'SÚNG CHÍNH', en: 'MAIN GUN' } },
    { id: 'wingman',   icon: '🛸', label: { vi: 'SÚNG PHỤ',   en: 'WINGMAN'  } },
    { id: 'armor',     icon: '🛡️', label: { vi: 'PHỤ TRỢ',    en: 'ARMOR'    } },
    { id: 'drone',     icon: '🛰️', label: { vi: 'VỆ TINH',    en: 'DRONE'    } },
  ];

  let displayList = [];
  if (activeTab === 'crates') displayList = CRATE_CONFIGS;
  else if (activeTab === 'aircrafts') displayList = AIRCRAFTS.map(a => ({...a, shopType: 'aircraft', rarity: a.tier + 1}));
  else if (activeTab === 'pilots') displayList = PILOTS.map(p => ({...p, shopType: 'pilot'}));
  else displayList = GEAR_CATALOG[activeTab].map(g => ({...g, shopType: activeTab, rarity: 1}));

  React.useEffect(() => {
    if (displayList.length > 0) setSelectedId(displayList[0].id);
  }, [activeTab]);

  const selectedItem = displayList.find(i => i.id === selectedId) || null;

  const renderIcon = (item, size) => {
    if (item.imgTop || item.imgSrc) return <img src={item.imgTop || item.imgSrc} alt="icon" style={{ maxWidth: size, objectFit: 'contain' }} />;
    return <span style={{ fontSize: size }}>{item.icon || '🚀'}</span>;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${styles.container} scrollable-layer`}>
      <div className={styles.contentWrapper}>
        
        {/* HEADER */}
        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
            <span className={styles.backArrow}>‹</span>
            <span className={styles.backText}>{lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}</span>
          </motion.button>

          <div className={styles.headerTitle}>{lang === 'vi' ? 'CHỢ TIẾP TẾ' : 'SUPPLY DEPOT'}</div>

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

        {/* WORKSPACE */}
        <div className={styles.workspace}>
          <div className={styles.lowerWorkspace}>
            
            <div className={styles.inventoryBoard}>
              <div className={styles.verticalTabs}>
                {sideTabs.map(tab => (
                  <button key={tab.id} className={`${styles.sideTabBtn} ${activeTab === tab.id ? styles.active : ''}`} onClick={() => setActiveTab(tab.id)}>
                    <span className={styles.sideIcon}>{tab.icon}</span>
                    <span className={styles.sideLabel}>{tab.label[lang]}</span>
                  </button>
                ))}
              </div>

              <div className={styles.gridArea}>
                {displayList.map((item, i) => {
                   const isOwned = item.shopType === 'aircraft' ? ownedAircrafts[item.id] : item.shopType === 'pilot' ? ownedPilots[item.id] : false;
                   return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }}
                      className={`${styles.itemSlot} ${styles['r' + item.rarity]} ${selectedId === item.id ? styles.selected : ''} ${isOwned ? styles.ownedSlot : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className={styles.itemGlow} />
                      {isOwned && <div className={styles.equippedBadge}><span>✓</span></div>}
                      {item.shopType === 'crate' && <div className={styles.crateStockBadge}>{campaignData.materials.crates[item.id] || 0}</div>}
                      <div className={styles.itemIconWrap}>{renderIcon(item, '40px')}</div>
                      <div className={styles.itemFooter}>
                         <span className={styles.itemLevel}>{item.shopType === 'crate' ? 'GACHA' : (item.tier ? TIER_LABELS[item.tier] : RARITY_LABELS[item.rarity])}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* DETAIL PANEL ĐỂ THANH TOÁN */}
            <div id="detail-panel" className={styles.detailPanel}>
              <AnimatePresence mode="wait">
                {selectedItem ? (
                  <motion.div key={selectedId} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className={styles.detailInner}>
                    
                    <div className={`${styles.previewBox} ${styles['r' + selectedItem.rarity]}`}>
                      <div className={styles.previewGlow} />
                      <div className={styles.previewIcon}>{renderIcon(selectedItem, '80px')}</div>
                    </div>

                    <div className={styles.itemIdentity}>
                      <h3 className={styles.itemName}>{selectedItem.shopType === 'crate' ? selectedItem.title[lang] : selectedItem.name[lang]}</h3>
                      <div className={styles.itemMeta}>
                        <span className={styles.rarityLabel} data-rarity={selectedItem.rarity}>{selectedItem.shopType === 'crate' ? 'SUPPLY CRATE' : RARITY_LABELS[selectedItem.rarity]}</span>
                      </div>
                    </div>

                    <div className={styles.statsBlock}>
                      <p className={styles.loreText}>{selectedItem.shopType === 'crate' ? selectedItem.desc[lang] : (selectedItem.description?.[lang] || selectedItem.skillDesc?.[lang] || 'Standard Military Gear.')}</p>
                      
                      {selectedItem.shopType === 'crate' && (
                        <div className={styles.dropRateSection}>
                           <div className={styles.dropTitle}>{lang === 'vi' ? 'TỶ LỆ RỚT (DROP RATE)' : 'DROP RATES'}</div>
                           {[5,4,3,2,1].map(r => selectedItem.dropRates[r] > 0 && (
                             <div key={r} className={styles.dropRow}>
                               <span className={styles['r'+r]}>{RARITY_LABELS[r]}</span>
                               <span className={styles.dropPct}>{selectedItem.dropRates[r]}%</span>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>

                    {/* KHU VỰC THANH TOÁN */}
                    <div className={styles.actionGroup}>
                      {(() => {
                        let cost = 0, currency = 'coins', isOwned = false, handleBuy = null;

                        if (selectedItem.shopType === 'crate') {
                          cost = selectedItem.cost; currency = selectedItem.currency;
                          return (
                            <div className={styles.gachaBtnRow}>
                              <button onClick={() => handleBuyCrate(selectedItem, 1)} disabled={!canAfford(currency, cost)} className={`${styles.actionBtn} ${currency === 'coins' ? styles.btnCoin : styles.btnGem}`}>
                                <span>{lang === 'vi' ? 'MUA x1' : 'BUY x1'}</span>
                                <div className={styles.costSpan}>
                                  <div className={styles.btnCurrencyIcon}>{currency === 'coins' ? <Icons.Coin/> : <Icons.Gem/>}</div>
                                  <span>{cost.toLocaleString()}</span>
                                </div>
                              </button>
                              <button onClick={() => handleBuyCrate(selectedItem, 10)} disabled={!canAfford(currency, cost * 10)} className={`${styles.actionBtn} ${currency === 'coins' ? styles.btnCoin : styles.btnGem}`}>
                                <span>{lang === 'vi' ? 'MUA x10' : 'BUY x10'}</span>
                                <div className={styles.costSpan}>
                                  <div className={styles.btnCurrencyIcon}>{currency === 'coins' ? <Icons.Coin/> : <Icons.Gem/>}</div>
                                  <span>{(cost * 10).toLocaleString()}</span>
                                </div>
                              </button>
                            </div>
                          );
                        } 
                        
                        if (selectedItem.shopType === 'aircraft') {
                          cost = AIRCRAFT_PRICE[selectedItem.tier].cost; currency = AIRCRAFT_PRICE[selectedItem.tier].currency;
                          isOwned = ownedAircrafts[selectedItem.id]; handleBuy = () => handleBuyAircraft(selectedItem);
                        } else if (selectedItem.shopType === 'pilot') {
                          cost = PILOT_PRICE[selectedItem.rarity].cost; currency = PILOT_PRICE[selectedItem.rarity].currency;
                          isOwned = ownedPilots[selectedItem.id]; handleBuy = () => handleBuyPilot(selectedItem);
                        } else {
                          cost = GEAR_PRICE.cost; currency = GEAR_PRICE.currency; handleBuy = () => handleBuyGear(selectedItem, activeTab);
                        }

                        return (
                          <button onClick={handleBuy} disabled={isOwned || !canAfford(currency, cost)} className={`${styles.actionBtn} ${isOwned ? styles.btnOwned : (currency === 'coins' ? styles.btnCoin : styles.btnGem)}`}>
                            {isOwned ? (
                              <span>{lang === 'vi' ? '✓ ĐÃ SỞ HỮU' : '✓ OWNED'}</span>
                            ) : (
                              <>
                                <span>{lang === 'vi' ? 'MUA VẬT PHẨM' : 'PURCHASE'}</span>
                                <div className={styles.costSpan}>
                                  <div className={styles.btnCurrencyIcon}>{currency === 'coins' ? <Icons.Coin/> : <Icons.Gem/>}</div>
                                  <span>{cost.toLocaleString()}</span>
                                </div>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>

                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}