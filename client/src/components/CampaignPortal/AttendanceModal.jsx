// src/components/CampaignPortal/AttendanceModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import styles from './AttendanceModal.module.css';
import { CRATE_CONFIGS, GEAR_CATALOG, PILOTS, AIRCRAFTS } from '../../constants';

const Icons = {
  Coin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>
};

const RARITY_COLOR = { 1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#fbbf24' };

export default function AttendanceModal({ isOpen, onClose, gsRef, saveUserProfile, lang, getRealTime }) {
  const [gachaState, setGachaState] = useState('idle');
  const [gachaResults, setGachaResults] = useState([]);

  // --- THÊM STATE ĐỂ REACT RE-RENDER ---
  const [currentStreak, setCurrentStreak] = useState(0);
  const [hasClaimedToday, setHasClaimedToday] = useState(true);

  // Khởi tạo Data và đồng bộ State khi Modal mở
  useEffect(() => {
    if (isOpen) {
      if (!gsRef.current.campaignData.attendance) {
        gsRef.current.campaignData.attendance = { streak: 0, lastDate: '' };
      }
      const attData = gsRef.current.campaignData.attendance;
      const todayStr = new Date(getRealTime()).toDateString();
      
      setCurrentStreak(attData.streak);
      setHasClaimedToday(attData.lastDate === todayStr);
    }
  }, [isOpen, gsRef]);

  if (!isOpen) return null;

  const handleClaim = () => {
    if (hasClaimedToday) return;

    let newStreak = currentStreak >= 7 ? 1 : currentStreak + 1;
    const todayStr = new Date(getRealTime()).toDateString();

    // 1. Cập nhật State để UI đổi ngay lập tức
    setCurrentStreak(newStreak);
    setHasClaimedToday(true);

    // 2. Cập nhật Dữ liệu gốc
    gsRef.current.campaignData.attendance.streak = newStreak;
    gsRef.current.campaignData.attendance.lastDate = todayStr;

    // 3. ĐỒNG BỘ TIẾN TRÌNH NHIỆM VỤ TỔNG HỢP
    if (!gsRef.current.campaignData.missionData) {
        gsRef.current.campaignData.missionData = { claimed: [], progress: {} };
    }
    
    // - Nhiệm vụ Ngày
    gsRef.current.campaignData.missionData.progress['d_login'] = 1;
    
    // - Nhiệm vụ Tuần (Tích lũy tối đa 5 ngày)
    const currentWeeklyLogin = gsRef.current.campaignData.missionData.progress['w_login_5'] || 0;
    gsRef.current.campaignData.missionData.progress['w_login_5'] = Math.min(5, currentWeeklyLogin + 1);

    // - Nhiệm vụ Tháng (Tích lũy tối đa 30 ngày)
    const currentMonthlyLogin = gsRef.current.campaignData.missionData.progress['m_login_30'] || 0;
    gsRef.current.campaignData.missionData.progress['m_login_30'] = Math.min(30, currentMonthlyLogin + 1);


    if (newStreak === 7) {
      const basicCrate = CRATE_CONFIGS.find(c => c.id === 'basic');
      const pullResults = [];
      
      for (let i = 0; i < 5; i++) {
        let roll = Math.random() * 100;
        let cumulative = 0;
        let rolledRarity = 1;

        for (let r of [5, 4, 3, 2, 1]) {
            if (basicCrate.dropRates[r] > 0) {
                cumulative += basicCrate.dropRates[r];
                if (roll <= cumulative) { rolledRarity = parseInt(r); break; }
            }
        }

        const gearTypes = ['mainGun', 'wingman', 'armor', 'drone'];
        const rType = gearTypes[Math.floor(Math.random() * gearTypes.length)];
        const list = GEAR_CATALOG[rType];
        const g = list[Math.floor(Math.random() * list.length)];
        const uuid = 'item_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '_' + i;
        
        const pulledItem = { uuid, baseId: g.id, rarity: rolledRarity, level: 1, type: rType };
        gsRef.current.campaignData.items[uuid] = pulledItem;
        pullResults.push(pulledItem);
      }

      setGachaResults(pullResults);
      setGachaState('opening');
      setTimeout(() => setGachaState('opened'), 1500);

    } else {
      gsRef.current.coins += 10;
      toast.success(lang === 'vi' ? 'Điểm danh thành công! +10 Xu' : 'Attendance Claimed! +10 Coins', { icon: '🪙' });
    }

    // 4. Đóng gói lưu lên mây
    saveUserProfile();
  };

  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className={styles.popupOverlay} onClick={gachaState === 'idle' ? onClose : null}>
      <motion.div 
        className={styles.modal} 
        initial={{ scale: 0.9, y: 30, opacity: 0 }} 
        animate={{ scale: 1, y: 0, opacity: 1 }} 
        onClick={e => e.stopPropagation()}
      >
        <button className={styles.closeBtn} onClick={onClose} style={{ display: gachaState === 'idle' ? 'block' : 'none' }}>✕</button>
        
        <div className={styles.header}>
          <h2 className={styles.title}>{lang === 'vi' ? 'ĐIỂM DANH LIÊN QUÂN' : 'ALLIANCE ROLL CALL'}</h2>
          <p className={styles.subtitle}>{lang === 'vi' ? 'Báo cáo có mặt để nhận trợ cấp' : 'Report for duty to claim supplies'}</p>
        </div>

        <div className={styles.content}>
          <div className={styles.daysGrid}>
             {days.map(day => {
               const isClaimed = day <= currentStreak;
               const isToday = !hasClaimedToday && day === currentStreak + 1;
               const isDay7 = day === 7;

               return (
                 <div key={day} className={`${styles.daySlot} ${isClaimed ? styles.claimed : ''} ${isToday ? styles.today : ''} ${isDay7 ? styles.day7 : ''}`}>
                    <span className={styles.dayLabel}>{lang === 'vi' ? `NGÀY ${day}` : `DAY ${day}`}</span>
                    <div className={styles.rewardIcon}>
                       {isDay7 ? '📦' : <Icons.Coin />}
                    </div>
                    <span className={styles.rewardAmt}>{isDay7 ? 'x5 GACHA' : '10'}</span>
                    
                    {isClaimed && <div className={styles.checkMark}>✓</div>}
                 </div>
               );
             })}
          </div>

          <button 
             className={`${styles.claimBtn} ${!hasClaimedToday ? styles.ready : styles.disabled}`}
             disabled={hasClaimedToday}
             onClick={handleClaim}
          >
             {!hasClaimedToday ? (lang === 'vi' ? 'BÁO CÁO CÓ MẶT' : 'REPORT IN') : (lang === 'vi' ? 'ĐÃ NHẬN HÔM NAY' : 'CLAIMED TODAY')}
          </button>
        </div>

        {/* --- GACHA ANIMATION OVERLAY --- */}
        <AnimatePresence>
          {gachaState !== 'idle' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.gachaOverlay}>
              {gachaState === 'opening' && (
                <img src="/images/common.png" className={styles.shakingCrate} alt="shaking" />
              )}
              {gachaState === 'opened' && (
                <>
                  <div className={styles.whiteFlash} />
                  <div className={styles.openedShowcase}>
                    <img src="/images/common_op.png" className={styles.openedCrateImg} alt="opened" />
                    
                    <div className={styles.resultsGrid}>
                      {gachaResults.map((item, idx) => {
                        const baseInfo = GEAR_CATALOG[item.type]?.find(g => g.id === item.baseId);
                        const rc = RARITY_COLOR[item.rarity];
                        return (
                          <motion.div 
                            key={idx} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 + idx * 0.1, type: 'spring' }}
                            className={styles.resultCard} style={{ borderColor: rc, boxShadow: `0 0 10px ${rc}40` }}
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

                    <button className={styles.gachaCloseBtn} onClick={() => { setGachaState('idle'); onClose(); }}>
                      {lang === 'vi' ? 'TUYỆT VỜI' : 'AWESOME'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}