import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GEAR_CATALOG, AIRCRAFTS, PILOTS } from '../../constants';
import styles from './Inventory.module.css';
import toast from 'react-hot-toast';

const RARITY_LABELS = { 1: 'COMMON', 2: 'UNCOMMON', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY' };

export default function Inventory({ gsRef, setScreen, lang, saveUserProfile }) {
  const [mainTab, setMainTab] = useState('bag');
  const [bagFilter, setBagFilter] = useState('all');
  const [forgeTab, setForgeTab] = useState('upgrade');
  const [selectedId, setSelectedId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const campaignData = gsRef.current.campaignData;
  if (!campaignData) return null;

  if (!campaignData.materials) {
    campaignData.materials = { parts: 150 }; 
  }

  const { items, loadout, ownedPilots, materials } = campaignData;
  const currentCoins = Number(gsRef.current.coins) || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;
  const currentParts = Number(materials.parts) || 0;

  const isForge = mainTab === 'forge';

  const sideTabs = [
    { id: 'all',     icon: '◈', label: { vi: 'Tất cả',   en: 'ALL'     } },
    { id: 'mainGun', icon: '⊕', label: { vi: 'Súng chính', en: 'GUN'   } },
    { id: 'wingman', icon: '◎', label: { vi: 'Súng phụ',  en: 'WING'   } },
    { id: 'armor',   icon: '◇', label: { vi: 'Phụ trợ',   en: 'ARMOR'  } },
    { id: 'drone',   icon: '⊛', label: { vi: 'Vệ tinh',   en: 'DRONE'  } },
    { id: 'pilot',   icon: '◉', label: { vi: 'Phi công',  en: 'PILOT'  } },
  ].filter(tab => isForge ? tab.id !== 'pilot' : true);

  if (isForge && bagFilter === 'pilot') {
    setBagFilter('all');
    setSelectedId(null);
  }

  const inventoryList = Object.keys(items).map(uuid => ({ uuid, id: uuid, ...items[uuid] }));

  let displayList = [];
  if (bagFilter === 'pilot' && !isForge) {
    displayList = Object.keys(ownedPilots).map(pId => ({
      uuid: pId, id: pId, type: 'pilot', ...ownedPilots[pId],
      rarity: PILOTS.find(p => p.id === pId)?.rarity || 1
    }));
  } else {
    displayList = inventoryList
      .filter(item => bagFilter === 'all' || item.type === bagFilter)
      .sort((a, b) => b.rarity - a.rarity);
  }

  const selectedItem = displayList.find(i => i.uuid === selectedId) || null;
  const itemBaseInfo = selectedItem
    ? (selectedItem.type === 'pilot'
      ? PILOTS.find(p => p.id === selectedItem.id)
      : GEAR_CATALOG[selectedItem.type]?.find(g => g.id === selectedItem.baseId))
    : null;

  const upgradeCoinCost = selectedItem ? selectedItem.level * 100 : 0;
  const upgradePartCost = selectedItem ? selectedItem.level * 5 : 0;
  const canUpgrade = currentCoins >= upgradeCoinCost && currentParts >= upgradePartCost;

  const renderIcon = (item, size) => {
    let baseInfo = null;
    if (item.type === 'pilot') baseInfo = PILOTS.find(p => p.id === item.id);
    else baseInfo = GEAR_CATALOG[item.type]?.find(g => g.id === item.baseId);
    if (baseInfo?.imgSrc) {
      return <img src={baseInfo.imgSrc} alt="icon" style={{ height: size, maxWidth: size, objectFit: 'contain' }} />;
    }
    const emoji = item.type === 'mainGun' ? '🔫' : item.type === 'armor' ? '🛡️' : item.type === 'drone' ? '🛰️' : item.type === 'pilot' ? '👨‍🚀' : '🚀';
    return <span style={{ fontSize: size }}>{emoji}</span>;
  };

  const handleEquipAircraft = (id) => {
    gsRef.current.campaignData.loadout.aircraft = id;
    saveUserProfile();
    setRefreshTick(t => t + 1);
    toast.success(lang === 'vi' ? 'Đã đổi Phi cơ!' : 'Aircraft Equipped!');
  };

  // 👇 CHÌA KHÓA UX: Tự động trượt màn hình xuống Bảng Chi Tiết trên Mobile
  const handleSelectItem = (uuid) => {
    setSelectedId(uuid);
    
    if (window.innerWidth <= 768) {
       setTimeout(() => {
         const detailEl = document.getElementById('detail-panel');
         if (detailEl) {
           const y = detailEl.getBoundingClientRect().top + window.scrollY - 20;
           window.scrollTo({ top: y, behavior: 'smooth' });
         }
       }, 50);
    }
  };

  const toggleEquip = () => {
    if (!selectedItem) return;
    if (selectedItem.type === 'pilot') {
      const isEquipped = loadout.pilot === selectedItem.id;
      gsRef.current.campaignData.loadout.pilot = isEquipped ? PILOTS[0].id : selectedItem.id;
      toast.success(lang === 'vi' ? (isEquipped ? 'Đã tháo Phi công!' : 'Đã điều động Phi công!') : 'Pilot Updated!');
    } else {
      const isEquipped = loadout[selectedItem.type] === selectedItem.uuid;
      gsRef.current.campaignData.loadout[selectedItem.type] = isEquipped ? '' : selectedItem.uuid;
      toast.success(lang === 'vi' ? (isEquipped ? 'Đã tháo trang bị!' : 'Đã gắn trang bị!') : 'Gear Updated!');
    }
    saveUserProfile();
    setRefreshTick(prev => prev + 1);
  };

  const handleUpgrade = () => {
    if (!selectedItem || selectedItem.type === 'pilot') return;
    if (!canUpgrade) return toast.error(lang === 'vi' ? 'Thiếu tài nguyên!' : 'Insufficient materials!');
    
    gsRef.current.coins -= upgradeCoinCost;
    gsRef.current.campaignData.materials.parts -= upgradePartCost;
    gsRef.current.campaignData.items[selectedItem.uuid].level += 1;
    
    saveUserProfile();
    setRefreshTick(prev => prev + 1);
    toast.success(lang === 'vi' ? 'Rèn thành công!' : 'Upgrade Success!');
  };

  const isEquipped = selectedItem
    ? (selectedItem.type === 'pilot'
      ? loadout.pilot === selectedItem.id
      : loadout[selectedItem.type] === selectedItem.uuid)
    : false;

  return (
    // 👇 CHÚ Ý: ĐÃ PHỤC HỒI scrollable-layer ĐỂ TRÁNH LỖI KHÓA CHẠM
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className={`${styles.container} ${isForge ? styles.forgeMode : ''} scrollable-layer`}>
      <div className={styles.contentWrapper}>
        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
            <span className={styles.backArrow}>‹</span> {lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}
          </motion.button>

          <div className={styles.headerTitle}>{lang === 'vi' ? 'KHO VŨ KHÍ' : 'ARMORY'}</div>

          <div className={styles.currencyBar}>
            <div className={styles.currencyChip} data-type="coin">
              <span className={styles.currencyIcon}>◈</span>
              <span className={styles.currencyAmt}>{currentCoins.toLocaleString()}</span>
            </div>
            <div className={styles.currencyChip} data-type="gem">
              <span className={styles.currencyIcon}>◆</span>
              <span className={styles.currencyAmt}>{currentDiamonds.toLocaleString()}</span>
            </div>
          </div>
        </header>

        <nav className={styles.mainTabs}>
          {[
            { id: 'bag',   icon: '⊞', label: { vi: 'TÚI TRANG BỊ', en: 'LOADOUT BAY' } },
            { id: 'forge', icon: '⊗', label: { vi: 'XƯỞNG RÈN',    en: 'FORGE CORE'  } },
          ].map(tab => (
            <button
              key={tab.id}
              className={`${styles.mainTabBtn} ${mainTab === tab.id ? styles.active : ''}`}
              onClick={() => { setMainTab(tab.id); setSelectedId(null); }}
            >
              <span className={styles.tabIcon}>{tab.icon}</span> {tab.label[lang]}
              {mainTab === tab.id && <motion.div className={styles.tabUnderline} layoutId="mainUnderline" />}
            </button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          {mainTab === 'bag' && (
            <motion.div key="bag" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className={styles.workspace}>
              
              <div className={styles.aircraftSection}>
                <div className={styles.sectionHeader}>{lang === 'vi' ? 'HẠM ĐỘI PHI CƠ' : 'AIRCRAFT FLEET'}</div>
                <div className={styles.aircraftSlider}>
                  {AIRCRAFTS.map(ac => {
                    const isEq = loadout.aircraft === ac.id;
                    return (
                      <motion.div
                        key={ac.id}
                        className={`${styles.aircraftCard} ${isEq ? styles.aircraftEquipped : ''}`}
                        onClick={() => handleEquipAircraft(ac.id)}
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
                        {isEq && <div className={styles.acBadge}>ACTIVE</div>}
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.lowerWorkspace}>
                <div className={styles.inventoryBoard}>
                  <div className={styles.verticalTabs}>
                    {sideTabs.map(tab => (
                      <button key={tab.id} className={`${styles.sideTabBtn} ${bagFilter === tab.id ? styles.active : ''}`} onClick={() => { setBagFilter(tab.id); setSelectedId(null); }}>
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
                          key={item.uuid} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.012, duration: 0.2 }}
                          className={`${styles.itemSlot} ${styles['r' + item.rarity]} ${selectedId === item.uuid ? styles.selected : ''}`}
                          onClick={() => handleSelectItem(item.uuid)} whileTap={{ scale: 0.92 }}
                        >
                          <div className={styles.itemGlow} />
                          {(loadout[item.type] === item.uuid || loadout.pilot === item.id) && (
                            <div className={styles.equippedBadge}><span>✓</span></div>
                          )}
                          <div className={styles.itemIconWrap}>{renderIcon(item, '40px')}</div>
                          <div className={styles.itemFooter}><span className={styles.itemLevel}>LV {item.level}</span></div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>

                <div id="detail-panel" className={styles.detailPanel}>
                  <AnimatePresence mode="wait">
                    {selectedItem ? (
                      <motion.div key={selectedId} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }} className={styles.detailInner}>
                        
                        <div className={`${styles.previewBox} ${styles['r' + selectedItem.rarity]}`}>
                          <div className={styles.previewGlow} />
                          <div className={styles.previewIcon}>{renderIcon(selectedItem, '80px')}</div>
                          <div className={styles.rarityBadge} data-rarity={selectedItem.rarity}>
                            {'★'.repeat(selectedItem.rarity)}{'☆'.repeat(5 - selectedItem.rarity)}
                          </div>
                        </div>

                        <div className={styles.itemIdentity}>
                          <h3 className={styles.itemName}>{itemBaseInfo?.name[lang] || '???'}</h3>
                          <div className={styles.itemMeta}>
                            <span className={styles.levelBadge}>LV {selectedItem.level}</span>
                          </div>
                        </div>

                        <div className={styles.statsBlock}>
                          {selectedItem.type === 'pilot' ? (
                            <p className={styles.pilotSkill}><span className={styles.pilotSkillIcon}>◈</span>{itemBaseInfo?.skillDesc[lang]}</p>
                          ) : (
                            <>
                              {itemBaseInfo?.baseAtk && (
                                 <div className={styles.statRow}><span className={styles.statLabel}>{lang === 'vi' ? 'SÁT THƯƠNG' : 'DAMAGE'}</span><span className={styles.statValue}>{itemBaseInfo.baseAtk + (selectedItem.level * 3) * selectedItem.rarity}</span></div>
                              )}
                              {itemBaseInfo?.baseHp && (
                                 <div className={styles.statRow}><span className={styles.statLabel}>{lang === 'vi' ? 'MÁU BẢO VỆ' : 'SHIELD HP'}</span><span className={styles.statValue}>{itemBaseInfo.baseHp + (selectedItem.level * 15) * selectedItem.rarity}</span></div>
                              )}
                            </>
                          )}
                        </div>

                        <div className={styles.actionGroup}>
                          <motion.button whileTap={{ scale: 0.96 }} className={`${styles.actionBtn} ${isEquipped ? styles.unequipBtn : styles.equipBtn}`} onClick={toggleEquip}>
                            {isEquipped ? (lang === 'vi' ? 'THÁO TRANG BỊ' : 'UNEQUIP') : (lang === 'vi' ? 'GẮN VÀO TÀU' : 'EQUIP')}
                          </motion.button>
                          {selectedItem.type !== 'pilot' && (
                            <motion.button whileTap={{ scale: 0.96 }} className={`${styles.actionBtn} ${styles.gotoForgeBtn}`} onClick={() => { setMainTab('forge'); setForgeTab('upgrade'); }}>
                              <span>⟿</span> {lang === 'vi' ? 'ĐẾN LÒ RÈN' : 'GO TO FORGE'}
                            </motion.button>
                          )}
                        </div>

                      </motion.div>
                    ) : (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.detailEmpty}>
                        <div className={styles.detailEmptyIcon}>◈</div>
                        <p>{lang === 'vi' ? 'CHỌN VẬT PHẨM ĐỂ QUÉT' : 'SELECT ITEM TO SCAN'}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {/* =======================================
              GIAO DIỆN LÒ RÈN
              ======================================= */}
          {mainTab === 'forge' && (
            <motion.div key="forge" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className={styles.workspace}>
              
              <div className={styles.lowerWorkspace}>
                <div className={styles.inventoryBoard}>
                  <div className={styles.verticalTabs}>
                    {sideTabs.map(tab => (
                      <button key={tab.id} className={`${styles.sideTabBtn} ${bagFilter === tab.id ? styles.active : ''}`} onClick={() => { setBagFilter(tab.id); setSelectedId(null); }}>
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
                        <span>{lang === 'vi' ? 'KHÔNG TÌM THẤY VẬT PHẨM' : 'NO ITEMS FOUND'}</span>
                      </div>
                    ) : (
                      displayList.map((item, i) => (
                        <motion.div
                          key={item.uuid} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.012, duration: 0.2 }}
                          className={`${styles.itemSlot} ${styles['r' + item.rarity]} ${selectedId === item.uuid ? styles.selected : ''}`}
                          onClick={() => handleSelectItem(item.uuid)} whileTap={{ scale: 0.92 }}
                        >
                          <div className={styles.itemGlow} />
                          {(loadout[item.type] === item.uuid || loadout.pilot === item.id) && (
                            <div className={styles.equippedBadge}><span>✓</span></div>
                          )}
                          <div className={styles.itemIconWrap}>{renderIcon(item, '36px')}</div>
                          <div className={styles.itemFooter}><span className={styles.itemLevel}>LV {item.level}</span></div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>

                <div id="detail-panel" className={styles.detailPanel}>
                  <AnimatePresence mode="wait">
                    {selectedItem ? (
                      <motion.div key={selectedId} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }} className={styles.detailInner}>
                        
                        <div className={styles.forgeTopTabs}>
                          <button className={`${styles.forgeTopBtn} ${forgeTab === 'upgrade' ? styles.active : ''}`} onClick={() => setForgeTab('upgrade')}>{lang === 'vi' ? 'NÂNG CẤP' : 'UPGRADE'}</button>
                          <button className={`${styles.forgeTopBtn} ${forgeTab === 'starUp' ? styles.active : ''}`} onClick={() => setForgeTab('starUp')}>{lang === 'vi' ? 'ĐỘT PHÁ' : 'STAR UP'}</button>
                        </div>

                        <div className={`${styles.previewBox} ${styles['r' + selectedItem.rarity]}`}>
                          <div className={styles.previewGlow} />
                          <div className={styles.previewIcon}>{renderIcon(selectedItem, '80px')}</div>
                          <div className={styles.rarityBadge} data-rarity={selectedItem.rarity}>
                            {'★'.repeat(selectedItem.rarity)}{'☆'.repeat(5 - selectedItem.rarity)}
                          </div>
                        </div>

                        <div className={styles.itemIdentity}>
                          <h3 className={styles.itemName}>{itemBaseInfo?.name[lang] || '???'}</h3>
                          <div className={styles.itemMeta}>
                            <span className={styles.levelBadge}>LV {selectedItem.level}</span>
                          </div>
                        </div>

                        <div className={styles.statsBlock}>
                          {itemBaseInfo?.baseAtk && (
                             <div className={styles.statRow}>
                               <span className={styles.statLabel}>{lang === 'vi' ? 'SÁT THƯƠNG' : 'DAMAGE'}</span>
                               <span className={styles.statValue}>
                                 {itemBaseInfo.baseAtk + (selectedItem.level * 3) * selectedItem.rarity}
                                 {forgeTab === 'upgrade' && <><span className={styles.statArrow}>➞</span><span className={`${styles.statValue} ${styles.up}`}>{itemBaseInfo.baseAtk + ((selectedItem.level + 1) * 3) * selectedItem.rarity}</span></>}
                               </span>
                             </div>
                          )}
                          {itemBaseInfo?.baseHp && (
                             <div className={styles.statRow}>
                               <span className={styles.statLabel}>{lang === 'vi' ? 'MÁU BẢO VỆ' : 'SHIELD HP'}</span>
                               <span className={styles.statValue}>
                                 {itemBaseInfo.baseHp + (selectedItem.level * 15) * selectedItem.rarity}
                                 {forgeTab === 'upgrade' && <><span className={styles.statArrow}>➞</span><span className={`${styles.statValue} ${styles.up}`}>{itemBaseInfo.baseHp + ((selectedItem.level + 1) * 15) * selectedItem.rarity}</span></>}
                               </span>
                             </div>
                          )}
                        </div>

                        {forgeTab === 'upgrade' && (
                           <div className={styles.materialReqs}>
                              <div className={`${styles.matItem} ${currentCoins < upgradeCoinCost ? styles.insufficient : ''}`}>
                                 <span className={styles.matIcon} style={{color: '#fb923c'}}>◈</span> {currentCoins.toLocaleString()} / {upgradeCoinCost}
                              </div>
                              <div className={`${styles.matItem} ${currentParts < upgradePartCost ? styles.insufficient : ''}`}>
                                 <span className={styles.matIcon} style={{color: '#38bdf8'}}>⚙</span> {currentParts} / {upgradePartCost}
                              </div>
                           </div>
                        )}

                        <div className={styles.actionGroup}>
                          <motion.button whileTap={{ scale: 0.96 }} onClick={handleUpgrade} disabled={!canUpgrade} className={`${styles.actionBtn} ${styles.execUpgradeBtn}`}>
                            <span>⬆</span> {lang === 'vi' ? 'TIẾN HÀNH RÈN' : 'EXECUTE UPGRADE'}
                          </motion.button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.detailEmpty}>
                        <div className={styles.detailEmptyIcon}>⚙</div>
                        <p>{lang === 'vi' ? 'CHỌN VŨ KHÍ CẦN RÈN' : 'SELECT WEAPON TO FORGE'}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}