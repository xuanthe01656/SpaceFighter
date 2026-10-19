import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PILOTS } from '../../constants';
import styles from './Pilots.module.css';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';
import AssetImage from '../AssetImage/AssetImage';

// --- ICONS ---
const Icons = {
  Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
  Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>)
};

const formatCompactNumber = (number) => {
  if (number < 1000) return number.toString();
  const suffixes = ["", "K", "M", "B", "T"];
  const suffixNum = Math.floor(("" + number).length / 3);
  let shortValue = parseFloat((suffixNum !== 0 ? (number / Math.pow(1000, suffixNum)) : number).toPrecision(3));
  if (shortValue % 1 !== 0) shortValue = shortValue.toFixed(1);
  return shortValue + suffixes[suffixNum];
};

export default function Pilots({ gsRef, setScreen, lang, saveUserProfile, gameAction }) {
  const [refreshTick, setRefreshTick] = useState(0); 
  const campaignData = gsRef.current?.campaignData;
  if (!campaignData) return null;

  const { ownedPilots, loadout } = campaignData;
  const [selectedId, setSelectedId] = useState(loadout.pilot);
  
  const currentCoins = Number(gsRef.current.coins) || 0;
  const currentDiamonds = Number(gsRef.current.diamonds) || 0;

  const pilotList = PILOTS.map(p => ({
    ...p,
    owned: !!ownedPilots[p.id],
    level: ownedPilots[p.id]?.level || 0,
    stars: ownedPilots[p.id]?.stars || p.rarity || 1 
  }));

  const selectedPilot = pilotList.find(p => p.id === selectedId) || pilotList[0];

  const getStarUpInfo = (currentStars) => {
    switch(currentStars) {
      case 1: return { cost: 500, rate: 90 };
      case 2: return { cost: 1000, rate: 70 };
      case 3: return { cost: 2000, rate: 50 };
      case 4: return { cost: 5000, rate: 30 };
      default: return { cost: 0, rate: 0 }; 
    }
  };

  const starInfo = getStarUpInfo(selectedPilot.stars);

  const handleDeploy = async () => {
    if (auth.currentUser) {
      try {await gameAction('inventory.equip',{slot:'pilot',itemId:selectedPilot.id});setRefreshTick(x=>x+1);toast.success('Pilot deployed');}
      catch(error){toast.error(error.message);}
      return;
    }
    if (!selectedPilot.owned) return toast.error(lang === 'vi' ? 'Bạn chưa mở khóa Phi công này!' : 'Pilot locked!');
    gsRef.current.campaignData.loadout.pilot = selectedPilot.id;
    saveUserProfile();
    toast.success(lang === 'vi' ? `Đã bổ nhiệm ${selectedPilot.name.vi}!` : `Deployed ${selectedPilot.name.en}!`, { icon: '👨‍🚀' });
    setRefreshTick(prev => prev + 1);
  };

  const handleStarUp = async () => {
    if (auth.currentUser) {
      try {
        const r=await gameAction('pilot.starup',{pilotId:selectedPilot.id});
        toast[r.extra.success?'success':'error'](r.extra.success?'Star up success':'Star up failed');
        setRefreshTick(x=>x+1);
      }catch(error){toast.error(error.message);}
      return;
    }
    if (!selectedPilot.owned) return;
    if (selectedPilot.stars >= 5) return;

    if (currentCoins < starInfo.cost) {
      return toast.error(lang === 'vi' ? 'Không đủ Xu để nâng cấp!' : 'Not enough coins!');
    }

    gsRef.current.coins -= starInfo.cost;
    const roll = Math.random() * 100;
    
    if (roll <= starInfo.rate) {
      gsRef.current.campaignData.ownedPilots[selectedPilot.id].stars += 1;
      toast.success(
        lang === 'vi' ? 'NÂNG SAO THÀNH CÔNG!' : 'STAR UP SUCCESS!', 
        { icon: '🌟', duration: 4000, style: { border: '2px solid #2ed573', background: '#000', color: '#fff' } }
      );
    } else {
      toast.error(
        lang === 'vi' ? 'NÂNG SAO THẤT BẠI! Chúc may mắn lần sau.' : 'STAR UP FAILED! Better luck next time.', 
        { icon: '💥', duration: 4000, style: { border: '2px solid #ff4757', background: '#000', color: '#fff' } }
      );
    }

    saveUserProfile();
    setRefreshTick(prev => prev + 1);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${styles.container} scrollable-layer`}>
      <div className={styles.contentWrapper}>
        
        {/* HEADER */}
        <header className={styles.header}>
          <motion.button 
            whileTap={{ scale: 0.95 }} 
            className={styles.backBtn} 
            onClick={() => {
              if (gsRef.current?.cameFromHQ) {
                gsRef.current.cameFromHQ = false; 
                setScreen('hq'); 
              } else {
                setScreen('campaign_portal');
              }
            }}
          >
            <span className={styles.backArrow}>‹</span>
            <span className={styles.backText}>
               {gsRef.current?.cameFromHQ ? (lang === 'vi' ? 'HÀNH DINH' : 'HQ') : (lang === 'vi' ? 'CHỈ HUY' : 'COMMAND')}
            </span>
          </motion.button>

          <div className={styles.headerTitle}>{lang === 'vi' ? 'DOANH TRẠI PHI CÔNG' : 'BARRACKS'}</div>
          
          <div className={styles.currencyBar}>
            <div className={`${styles.currencyChip} ${styles.chipCoin}`}>
              <div className={styles.currencyIcon}><Icons.Coin /></div>
              <span className={styles.currencyAmt}>{formatCompactNumber(currentCoins)}</span>
            </div>
            <div className={`${styles.currencyChip} ${styles.chipGem}`}>
              <div className={styles.currencyIcon}><Icons.Gem /></div>
              <span className={styles.currencyAmt}>{formatCompactNumber(currentDiamonds)}</span>
            </div>
          </div>
        </header>

        {/* WORKSPACE CHÍNH */}
        <div className={styles.lowerWorkspace}>
          
          {/* LƯỚI BÊN TRÁI */}
          <div className={styles.inventoryBoard} style={{ flex: 3 }}>
            <div className={styles.gridArea}>
              {pilotList.map((pilot, idx) => {
                const isEq = loadout.pilot === pilot.id;
                return (
                  <motion.div 
                    key={pilot.id}
                    initial={{ opacity: 0, scale: 0.85 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                    className={`${styles.itemSlot} ${styles['r' + Math.min(5, pilot.rarity)]} ${selectedId === pilot.id ? styles.selected : ''} ${!pilot.owned ? styles.lockedItem : ''}`} 
                    onClick={() => setSelectedId(pilot.id)}
                  >
                    <div className={styles.itemGlow} />
                    {isEq && <div className={styles.equippedBadge}><span>✓</span></div>}
                    {!pilot.owned && <div className={styles.lockIconBadge}>🔒</div>}

                    <div className={styles.itemIconWrap} style={{width:54,height:54}}><AssetImage kind="pilot" assetId={pilot.id} style={{width:"100%", height:"100%"}} /></div>
                    <div className={styles.pilotNameSlot}>{pilot.name[lang]}</div>

                    <div className={styles.itemFooter}>
                        {pilot.owned ? '★'.repeat(pilot.stars) : '---'}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* BẢNG CHI TIẾT BÊN PHẢI */}
          <div className={styles.detailPanel}>
            <AnimatePresence mode="wait">
              <motion.div key={selectedId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
                
                <div className={styles.detailHeader}>
                  <div className={styles.detailAvatar} style={{width:76,height:76,flexShrink:0}}><AssetImage kind="pilot" assetId={selectedPilot.id} style={{width:"100%", height:"100%"}} /></div>
                  <div>
                    <h3 className={styles.detailName}>{selectedPilot.name[lang]}</h3>
                    <div className={styles.detailStars}>
                      {selectedPilot.owned ? '★'.repeat(selectedPilot.stars) : '🔒 Locked'}
                    </div>
                    {selectedPilot.owned && (
                      <div className={styles.detailLevel}>LEVEL {selectedPilot.level}</div>
                    )}
                  </div>
                </div>

                <div className={styles.skillBox} style={{ marginTop: '15px' }}>
                  <div className={styles.skillTitle}>{lang === 'vi' ? 'KỸ NĂNG NỘI TẠI' : 'PASSIVE SKILL'}</div>
                  <div className={styles.skillDesc}>{selectedPilot.skillDesc[lang]}</div>
                </div>

                {selectedPilot.owned && (
                  <div className={styles.upgradeBox} style={{ marginTop: '15px' }}>
                    {selectedPilot.stars < 5 ? (
                      <>
                        <div className={styles.upgradeTitle}>
                          {lang === 'vi' ? 'TIẾN HÓA SAO' : 'STAR EVOLUTION'}: <span style={{color: '#fbbf24'}}>{selectedPilot.stars}★ ➔ {selectedPilot.stars + 1}★</span>
                        </div>
                        <div className={styles.upgradeStats}>
                          <span style={{ color: '#4ade80' }}>{lang === 'vi' ? 'Tỉ lệ:' : 'Rate:'} {starInfo.rate}%</span>
                          <span style={{ color: '#fb923c' }}>{lang === 'vi' ? 'Phí:' : 'Cost:'} {starInfo.cost} Xu</span>
                        </div>
                      </>
                    ) : (
                      <div className={styles.maxStarText}>
                        {lang === 'vi' ? '✨ ĐÃ ĐẠT TỐI ĐA 5 SAO ✨' : '✨ MAX 5 STARS REACHED ✨'}
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.actionGroup}>
                  <button 
                    className={`${styles.actionBtn} ${styles.btnDeploy} ${loadout.pilot === selectedId ? styles.active : ''}`}
                    disabled={loadout.pilot === selectedId || !selectedPilot.owned}
                    onClick={handleDeploy}
                  >
                    {loadout.pilot === selectedId ? (lang === 'vi' ? 'ĐANG CHỈ HUY' : 'COMMANDING') : (lang === 'vi' ? 'BỔ NHIỆM' : 'DEPLOY')}
                  </button>

                  {selectedPilot.owned && selectedPilot.stars < 5 && (
                    <button 
                      className={`${styles.actionBtn} ${styles.btnStarUp}`}
                      disabled={currentCoins < starInfo.cost}
                      onClick={handleStarUp}
                    >
                      ⬆ {lang === 'vi' ? 'NÂNG SAO' : 'STAR UP'}
                    </button>
                  )}
                </div>

              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>
    </motion.div>
  );
}