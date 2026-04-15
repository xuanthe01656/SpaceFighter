import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PILOTS } from '../../constants';
import styles from './Pilots.module.css';
import toast from 'react-hot-toast';

export default function Pilots({ gsRef, setScreen, lang, saveUserProfile }) {
  const [refreshTick, setRefreshTick] = useState(0); 
  const campaignData = gsRef.current?.campaignData;
  if (!campaignData) return null;

  const { ownedPilots, loadout } = campaignData;
  const [selectedId, setSelectedId] = useState(loadout.pilot);
  const currentCoins = gsRef.current.coins || 0;

  const pilotList = PILOTS.map(p => ({
    ...p,
    owned: !!ownedPilots[p.id],
    level: ownedPilots[p.id]?.level || 0,
    stars: ownedPilots[p.id]?.stars || 1 // Mặc định 1 sao nếu chưa có để hiển thị
  }));

  const selectedPilot = pilotList.find(p => p.id === selectedId) || pilotList[0];

  // ==========================================
  // THÔNG SỐ NÂNG SAO (CHI PHÍ & TỶ LỆ)
  // ==========================================
  const getStarUpInfo = (currentStars) => {
    switch(currentStars) {
      case 1: return { cost: 500, rate: 90 };
      case 2: return { cost: 1000, rate: 70 };
      case 3: return { cost: 2000, rate: 50 };
      case 4: return { cost: 5000, rate: 30 };
      default: return { cost: 0, rate: 0 }; // Đã Max 5 Sao
    }
  };

  const starInfo = getStarUpInfo(selectedPilot.stars);

  // ==========================================
  // HÀM MẶC PHI CÔNG
  // ==========================================
  const handleDeploy = () => {
    if (!selectedPilot.owned) return toast.error(lang === 'vi' ? 'Bạn chưa mở khóa Phi công này!' : 'Pilot locked!');
    gsRef.current.campaignData.loadout.pilot = selectedPilot.id;
    saveUserProfile();
    toast.success(lang === 'vi' ? `Đã bổ nhiệm ${selectedPilot.name.vi}!` : `Deployed ${selectedPilot.name.en}!`, { icon: '👨‍🚀' });
    setRefreshTick(prev => prev + 1);
  };

  // ==========================================
  // HÀM NÂNG SAO (RNG GACHA LOGIC)
  // ==========================================
  const handleStarUp = () => {
    if (!selectedPilot.owned) return;
    if (selectedPilot.stars >= 5) return;

    if (currentCoins < starInfo.cost) {
      return toast.error(lang === 'vi' ? 'Không đủ Xu để nâng cấp!' : 'Not enough coins!');
    }

    // Trừ tiền ngay lập tức
    gsRef.current.coins -= starInfo.cost;

    // Vòng quay nhân phẩm (Từ 0 đến 100)
    const roll = Math.random() * 100;
    
    if (roll <= starInfo.rate) {
      // THÀNH CÔNG
      gsRef.current.campaignData.ownedPilots[selectedPilot.id].stars += 1;
      toast.success(
        lang === 'vi' ? 'NÂNG SAO THÀNH CÔNG!' : 'STAR UP SUCCESS!', 
        { icon: '🌟', duration: 4000, style: { border: '2px solid #2ed573', background: '#000', color: '#fff' } }
      );
    } else {
      // THẤT BẠI
      toast.error(
        lang === 'vi' ? 'NÂNG SAO THẤT BẠI! Chúc may mắn lần sau.' : 'STAR UP FAILED! Better luck next time.', 
        { icon: '💥', duration: 4000, style: { border: '2px solid #ff4757', background: '#000', color: '#fff' } }
      );
    }

    saveUserProfile({ coins: gsRef.current.coins, campaignData: gsRef.current.campaignData });
    setRefreshTick(prev => prev + 1);
  };

  const fadeVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${styles.container} scrollable-layer`}>
      <div className={styles.contentWrapper}>
        
        {/* HEADER & VÍ TIỀN */}
        <div className={styles.header}>
          <motion.button whileTap={{ scale: 0.9 }} className={styles.backBtn} onClick={() => setScreen('hq')}>
            ◀ {lang === 'vi' ? 'HQ' : 'HQ'}
          </motion.button>
          <div className={styles.wallet}>
            <span style={{ color: '#FFD700', textShadow: '0 0 10px rgba(255,215,0,0.5)' }}>🪙 {currentCoins}</span>
          </div>
        </div>

        <div className={styles.mainLayout}>
          
          {/* LƯỚI PHI CÔNG */}
          <div className={styles.gridSection}>
            {pilotList.map((pilot, index) => (
              <motion.div 
                key={pilot.id}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.05 }}
                whileTap={{ scale: 0.9 }}
                className={`${styles.pilotCard} ${styles['rarity' + pilot.rarity]} ${selectedId === pilot.id ? styles.selected : ''} ${!pilot.owned ? styles.locked : ''}`}
                onClick={() => setSelectedId(pilot.id)}
              >
                {loadout.pilot === pilot.id && <span className={styles.equippedBadge}>ACTIVE</span>}
                <div className={styles.avatarCircle}>👨‍🚀</div>
                <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#fff' }}>{pilot.name[lang]}</div>
                
                {pilot.owned ? (
                  <div style={{ color: '#ffd700', fontSize: '14px', marginTop: '4px' }}>{'⭐'.repeat(pilot.stars)}</div>
                ) : (
                  <div style={{ fontSize: '16px', marginTop: '4px' }}>🔒</div>
                )}
              </motion.div>
            ))}
          </div>

          {/* BẢNG CHI TIẾT */}
          <AnimatePresence mode="wait">
            <motion.div key={selectedId} variants={fadeVariants} initial="hidden" animate="visible" exit="hidden" className={styles.detailSection}>
              
              <div className={styles.pilotInfoTop}>
                <div className={styles.detailAvatar}>👨‍🚀</div>
                <div>
                  <h3 className={styles.pilotName}>{selectedPilot.name[lang]}</h3>
                  <div style={{ color: '#ffd700', fontSize: '20px', letterSpacing: '2px' }}>
                    {selectedPilot.owned ? '⭐'.repeat(selectedPilot.stars) : '🔒 Locked'}
                  </div>
                  {selectedPilot.owned && (
                    <div style={{ color: '#2ed573', fontSize: '16px', marginTop: '2px' }}>Lv.{selectedPilot.level}</div>
                  )}
                </div>
              </div>

              <div className={styles.skillBox}>
                <p style={{ color: '#00e5ff', margin: '0 0 5px 0', textTransform: 'uppercase', fontSize: '14px', letterSpacing: '1px' }}>
                  {lang === 'vi' ? 'Kỹ năng nội tại' : 'Passive Skill'}
                </p>
                <p className={styles.skillDesc}>💎 {selectedPilot.skillDesc[lang]}</p>
              </div>
              
              {/* --- BẢNG NÂNG SAO (RNG) --- */}
              {selectedPilot.owned && (
                <div className={styles.upgradeBox}>
                  {selectedPilot.stars < 5 ? (
                    <>
                      <div style={{ color: '#fff', marginBottom: '8px', fontSize: '18px' }}>
                        {lang === 'vi' ? 'TIẾN HÓA SAO' : 'STAR EVOLUTION'}: <span style={{color: '#ffd700'}}>{selectedPilot.stars}⭐ ➔ {selectedPilot.stars + 1}⭐</span>
                      </div>
                      <div className={styles.upgradeStats}>
                        <span className={styles.rateText}>{lang === 'vi' ? 'Tỷ lệ:' : 'Rate:'} {starInfo.rate}%</span>
                        <span className={styles.costText}>{lang === 'vi' ? 'Chi phí:' : 'Cost:'} {starInfo.cost} 🪙</span>
                      </div>
                    </>
                  ) : (
                    <div className={styles.maxStarText}>
                      {lang === 'vi' ? '🎉 ĐÃ ĐẠT TỐI ĐA 5 SAO 🎉' : '🎉 MAX 5 STARS REACHED 🎉'}
                    </div>
                  )}
                </div>
              )}
              
              {/* NHÓM NÚT HÀNH ĐỘNG */}
              <div className={styles.actionGroup}>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  className={`${styles.btnAction} ${loadout.pilot === selectedId ? styles.activeBtn : styles.deployBtn}`}
                  disabled={loadout.pilot === selectedId || !selectedPilot.owned}
                  onClick={handleDeploy}
                >
                  {loadout.pilot === selectedId ? (lang === 'vi' ? 'ĐANG CHỈ HUY' : 'COMMANDING') : (lang === 'vi' ? 'BỔ NHIỆM' : 'DEPLOY')}
                </motion.button>

                {selectedPilot.owned && selectedPilot.stars < 5 && (
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    className={`${styles.btnAction} ${styles.starUpBtn}`}
                    disabled={currentCoins < starInfo.cost}
                    onClick={handleStarUp}
                  >
                    ⬆ {lang === 'vi' ? 'NÂNG SAO' : 'STAR UP'}
                  </motion.button>
                )}
              </div>

            </motion.div>
          </AnimatePresence>

        </div>
      </div>
    </motion.div>
  );
}