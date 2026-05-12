// src/components/Missions/index.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MISSIONS_CONFIG } from '../../constants';
import styles from './Missions.module.css';
import toast from 'react-hot-toast';

const Icons = {
  Coin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>,
  Gem: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>,
  Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  Blueprint: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>,
  Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
};

const getRewardIcon = (type) => {
  switch(type) {
    case 'coins': return <Icons.Coin />;
    case 'gems': case 'diamonds': return <Icons.Gem />;
    case 'energy': return <Icons.Energy />;
    case 'blueprints': return <Icons.Blueprint />;
    case 'gears': return <Icons.Gear />;
    default: return <Icons.Coin />;
  }
};

const getRewardColor = (type) => {
  switch(type) {
    case 'coins': return '#fb923c';
    case 'gems': case 'diamonds': return '#c084fc';
    case 'energy': return '#4ade80';
    case 'blueprints': return '#60a5fa';
    case 'gears': return '#facc15';
    default: return '#fff';
  }
};

export default function Missions({ gsRef, setScreen, lang, saveUserProfile, getRealTime }) {
  const [activeTab, setActiveTab] = useState('daily');
  
  if (!gsRef.current.campaignData.missionData) {
    gsRef.current.campaignData.missionData = {
      claimed: [], 
      progress: { 'd_login': 1, 'w_login_5': 2, 'd_kill_50': 15 },
      lastDailyReset: 0,
      lastWeeklyReset: 0,
      lastMonthlyReset: 0
    };
  }

  const missionTrack = gsRef.current.campaignData.missionData;
  const [claimedMissions, setClaimedMissions] = useState(missionTrack.claimed || []);

  useEffect(() => {
    const now = new Date(getRealTime());
    const todayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayStr = now.toDateString();
    
    // Tính ngày đầu tuần (Giả sử Thứ 2 là đầu tuần)
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const thisWeekTimestamp = new Date(now.getFullYear(), now.getMonth(), diffToMonday).getTime();
    
    // Tính ngày đầu tháng
    const thisMonthTimestamp = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let shouldSave = false;

    // --- 1. BACK-SYNC TỪ ĐIỂM DANH (ATTENDANCE) SANG MISSIONS ---
    const attData = gsRef.current.campaignData.attendance || { streak: 0, lastDate: '' };
    
    // Bù Nhiệm vụ Ngày
    if (attData.lastDate === todayStr && missionTrack.progress['d_login'] !== 1) {
        missionTrack.progress['d_login'] = 1;
        shouldSave = true;
    }
    
    // Bù Nhiệm vụ Tuần (Lấy số ngày streak tối đa là 5 để đắp vào)
    if (attData.lastDate === todayStr) {
      const lastWeeklyLogin = missionTrack.lastWeeklyLoginDate || '';
      if (lastWeeklyLogin !== todayStr) {
          missionTrack.lastWeeklyLoginDate = todayStr;
          missionTrack.progress['w_login_5'] = Math.min(5, (missionTrack.progress['w_login_5'] || 0) + 1);
          shouldSave = true;
      }
    }

    // --- BỔ SUNG: Bù Nhiệm vụ Tháng ---
    if (attData.streak > 0 && (missionTrack.progress['m_login_30'] || 0) < attData.streak) {
        missionTrack.progress['m_login_30'] = Math.min(30, attData.streak);
        shouldSave = true;
    }


    // --- 2. RESET QUÀ THEO THỜI GIAN ---
    // Reset Daily
    if (!missionTrack.lastDailyReset || missionTrack.lastDailyReset < todayTimestamp) {
       missionTrack.lastDailyReset = todayTimestamp;
       MISSIONS_CONFIG.daily.forEach(m => {
          missionTrack.progress[m.id] = 0;
          missionTrack.claimed = missionTrack.claimed.filter(id => id !== m.id);
       });
       if (attData.lastDate === todayStr) {
           missionTrack.progress['d_login'] = 1;
       }
       shouldSave = true;
    }

    // Reset Weekly
    if (!missionTrack.lastWeeklyReset || missionTrack.lastWeeklyReset < thisWeekTimestamp) {
      missionTrack.lastWeeklyReset = thisWeekTimestamp;
      missionTrack.lastWeeklyLoginDate = '';   // ← reset để tuần mới tính lại
      MISSIONS_CONFIG.weekly.forEach(m => {
         missionTrack.progress[m.id] = 0;
         missionTrack.claimed = missionTrack.claimed.filter(id => id !== m.id);
      });
      // Nếu hôm nay là ngày đầu tuần mới VÀ đã đăng nhập hôm nay → tính ngay 1 ngày
      if (attData.lastDate === todayStr) {
          missionTrack.progress['w_login_5'] = 1;
          missionTrack.lastWeeklyLoginDate = todayStr;
      }
      shouldSave = true;
    }

    // Reset Monthly
    if (!missionTrack.lastMonthlyReset || missionTrack.lastMonthlyReset < thisMonthTimestamp) {
       missionTrack.lastMonthlyReset = thisMonthTimestamp;
       MISSIONS_CONFIG.monthly.forEach(m => {
          missionTrack.progress[m.id] = 0;
          missionTrack.claimed = missionTrack.claimed.filter(id => id !== m.id);
       });
       // Khi qua tháng mới, reset luôn cả nhiệm vụ tháng
       missionTrack.progress['m_login_30'] = 0;
       shouldSave = true;
    }

    if (shouldSave) {
       setClaimedMissions([...missionTrack.claimed]);
       saveUserProfile();
    }
  }, []);

  const handleClaim = (mission) => {
    if (claimedMissions.includes(mission.id)) return;

    const r = mission.reward;
    if (r.type === 'coins') gsRef.current.coins += r.amount;
    else if (r.type === 'gems' || r.type === 'diamonds') gsRef.current.diamonds += r.amount;
    else if (r.type === 'energy') gsRef.current.energy += r.amount;
    else if (r.type === 'blueprints') gsRef.current.campaignData.materials.blueprints += r.amount;
    else if (r.type === 'gears') gsRef.current.campaignData.materials.gears += r.amount;

    const newClaimedList = [...claimedMissions, mission.id];
    setClaimedMissions(newClaimedList);

    missionTrack.claimed = newClaimedList;
    saveUserProfile();

    toast.success(
      lang === 'vi' ? `Đã nhận Chỉ thị! +${r.amount}` : `Directive Claimed! +${r.amount}`, 
      { style: { background: 'rgba(8,14,28,0.9)', color: getRewardColor(r.type), border: `1px solid ${getRewardColor(r.type)}` } }
    );
  };

  // Nút Thực Hiện - Chuyển hướng
  const handleProceed = (targetScreen) => {
    if (targetScreen === 'attendance') {
        // Đặt cờ vào gsRef để Portal biết tự bật Modal
        gsRef.current.openAttendance = true;
        setScreen('campaign_portal');
    } else {
        setScreen(targetScreen);
    }
  };

  const tabs = [
    { id: 'daily', title: lang === 'vi' ? 'CHỈ THỊ NGÀY' : 'DAILY DIRECTIVES' },
    { id: 'weekly', title: lang === 'vi' ? 'CHIẾN DỊCH TUẦN' : 'WEEKLY CAMPAIGNS' },
    { id: 'monthly', title: lang === 'vi' ? 'SỨ MỆNH THÁNG' : 'MONTHLY OPS' }
  ];

  const currentList = MISSIONS_CONFIG[activeTab];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.container}>
      <div className={styles.contentWrapper}>
        
        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
            <span className={styles.backArrow}>‹</span>
            <span className={styles.backText}>{lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}</span>
          </motion.button>
          <div className={styles.headerTitle}>{lang === 'vi' ? 'BỘ TƯ LỆNH' : 'GALCOM HUB'}</div>
          
          <div className={styles.loreBox}>
             <span className={styles.loreIcon}>🛰️</span>
             <span className={styles.loreText}>
               {lang === 'vi' ? 'Hoàn thành các chỉ thị dưới đây để nhận vật tư quân sự.' : 'Complete the directives below to receive military supplies.'}
             </span>
          </div>
        </header>

        <nav className={styles.mainTabs}>
          {tabs.map(tab => {
            // Đếm realtime số nhiệm vụ hoàn thành ở tab hiện tại
            let badgeCount = 0;
            const nowForGoal = new Date(getRealTime());
            const currentMonthDays = new Date(nowForGoal.getFullYear(), nowForGoal.getMonth() + 1, 0).getDate();

            MISSIONS_CONFIG[tab.id].forEach(m => {
              const prog = missionTrack.progress[m.id] || 0;
              const isClaimed = claimedMissions.includes(m.id);
              
              let actualGoal = m.goal;
              if (m.id === 'm_login_30') actualGoal = currentMonthDays;

              if (prog >= actualGoal && !isClaimed) badgeCount++;
            });

            return (
              <button key={tab.id} className={`${styles.mainTabBtn} ${activeTab === tab.id ? styles.active : ''}`} onClick={() => setActiveTab(tab.id)}>
                {tab.title}
                {badgeCount > 0 && <span className={styles.tabBadge}>{badgeCount}</span>}
                {activeTab === tab.id && <motion.div className={styles.tabUnderline} layoutId="missionTab" />}
              </button>
            )
          })}
        </nav>

        <div className={styles.missionList}>
           {currentList.map((mission, idx) => {
             const currentProg = missionTrack.progress[mission.id] || 0;
             const isClaimed = claimedMissions.includes(mission.id);
             
             // --- TỰ ĐỘNG TÍNH NGÀY CHO THÁNG 2 (HOẶC CÁC THÁNG 31 NGÀY) ---
             let actualGoal = mission.goal;
             if (mission.id === 'm_login_30') {
                 const now = new Date(getRealTime());;
                 // Lấy chính xác tổng số ngày của tháng hiện tại
                 actualGoal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); 
             }

             const isCompleted = currentProg >= actualGoal;
             const percent = Math.min(100, (currentProg / actualGoal) * 100);
             const rColor = getRewardColor(mission.reward.type);

             return (
               <motion.div 
                 key={mission.id} 
                 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                 className={`${styles.missionCard} ${isClaimed ? styles.claimed : ''}`}
               >
                 <div className={styles.mInfo}>
                    <h3 className={styles.mTitle}>{mission.title[lang]}</h3>
                    <p className={styles.mDesc}>{mission.desc[lang]}</p>
                    
                    <div className={styles.mProgressWrap}>
                      {/* Đổi mission.goal thành actualGoal ở đây */}
                      <div className={styles.mProgressText}>{currentProg} / {actualGoal}</div>
                      <div className={styles.mProgressBarBg}>
                        <div className={styles.mProgressBarFill} style={{ width: `${percent}%`, background: isCompleted ? '#4ade80' : '#38bdf8' }}></div>
                      </div>
                    </div>
                 </div>

                 <div className={styles.mAction}>
                    <div className={styles.mReward} style={{ color: rColor }}>
                       <div className={styles.mRewardIcon}>{getRewardIcon(mission.reward.type)}</div>
                       <span>x{mission.reward.amount}</span>
                    </div>

                    {isClaimed ? (
                      <button className={styles.mBtnClaimed} disabled>
                        {lang === 'vi' ? 'ĐÃ NHẬN' : 'CLAIMED'}
                      </button>
                    ) : isCompleted ? (
                      <button 
                         className={`${styles.mBtn} ${styles.mBtnReady}`} 
                         onClick={() => handleClaim(mission)}
                      >
                        {lang === 'vi' ? 'NHẬN THƯỞNG' : 'CLAIM'}
                      </button>
                    ) : (
                      <button 
                         className={`${styles.mBtn} ${styles.mBtnProceed}`} 
                         onClick={() => handleProceed(mission.targetScreen)}
                      >
                        {lang === 'vi' ? 'THỰC HIỆN' : 'PROCEED'}
                      </button>
                    )}
                 </div>
               </motion.div>
             )
           })}
        </div>

      </div>
    </motion.div>
  );
}