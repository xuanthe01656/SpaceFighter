// src/components/CampaignPortal/AttendanceModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import styles from './AttendanceModal.module.css';
import { CRATE_CONFIGS, GEAR_CATALOG } from '../../constants';
import { ensureAttendanceWeek, mondayKeyUTC, weekdayMondayUTC, utcDayKey, lastNaturalClaimUTC, eligibleMakeupDaysUTC } from '../../utils/attendanceWeek';
import { ensureGuestMissions, recordGuestAttendance } from '../../utils/guestProgress';
import { auth } from '../../firebase';

const Icons = {
  Coin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>,
  Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>)
};

const RARITY_COLOR = { 1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#fbbf24' };

export default function AttendanceModal({ isOpen, onClose, gsRef, saveUserProfile, lang, getRealTime, gameAction, onProgressChange }) {
  const [gachaState, setGachaState] = useState('idle');
  const [gachaResults, setGachaResults] = useState([]);

  // --- THÊM STATE ĐỂ REACT RE-RENDER ---
  const [currentStreak, setCurrentStreak] = useState(0);
  const [hasClaimedToday, setHasClaimedToday] = useState(true);
  const [weeklyCompletedDays, setWeeklyCompletedDays] = useState(0);
  const [makeupCount, setMakeupCount] = useState(0);

  // The calendar must match the server's UTC Monday/week, even for Guests.
  useEffect(() => {
    if (!isOpen) return;
    const campaign = gsRef.current.campaignData;
    const att = (campaign.attendance ||= { streak: 0, lastDate: '', claimedDays: [], makeupCount: 0 });
    const now = getRealTime();
    if (!auth.currentUser) {
      const before = JSON.stringify({ attendance: att, missions: campaign.missionData });
      ensureAttendanceWeek(att, now);
      ensureGuestMissions(campaign, now);
      if (before !== JSON.stringify({ attendance: att, missions: campaign.missionData })) saveUserProfile();
    }
    const claimed = att.weekKey === mondayKeyUTC(now) && Array.isArray(att.claimedDays) ? att.claimedDays : [];
    setWeeklyCompletedDays(claimed.length);
    setCurrentStreak(att.streak || 0);
    setMakeupCount(att.weekKey === mondayKeyUTC(now) ? (att.makeupCount || 0) : 0);
    setHasClaimedToday(claimed.includes(weekdayMondayUTC(now)) || lastNaturalClaimUTC(att) === utcDayKey(now));
  }, [isOpen, gsRef]);

  if (!isOpen) return null;
  const viewNow = getRealTime();
  const attendanceView = gsRef.current.campaignData.attendance || {};
  const visibleClaimedDays = attendanceView.weekKey === mondayKeyUTC(viewNow) && Array.isArray(attendanceView.claimedDays)
    ? attendanceView.claimedDays : [];
  const currentUTCWeekday = weekdayMondayUTC(viewNow);
  const eligibleMakeupDays = eligibleMakeupDaysUTC(attendanceView, viewNow);

  const showGuestWeeklyReward = () => {
    const basicCrate = CRATE_CONFIGS.find(c => c.id === 'basic');
    const pullResults = [];
    for (let i = 0; i < 5; i++) {
      const roll = Math.random() * 100;
      let cumulative = 0;
      let rarity = 1;
      for (const r of [5, 4, 3, 2, 1]) {
        cumulative += basicCrate.dropRates[r] || 0;
        if (roll <= cumulative) { rarity = r; break; }
      }
      const gearTypes = ['mainGun', 'wingman', 'armor', 'drone'];
      const type = gearTypes[Math.floor(Math.random() * gearTypes.length)];
      const gears = GEAR_CATALOG[type];
      const gear = gears[Math.floor(Math.random() * gears.length)];
      const uuid = `item_${Date.now()}_${Math.floor(Math.random() * 10000)}_${i}`;
      const pulled = { uuid, baseId: gear.id, rarity, level: 1, type };
      gsRef.current.campaignData.items[uuid] = pulled;
      pullResults.push(pulled);
    }
    setGachaResults(pullResults);
    setGachaState('opened');
  };

  const handleClaim = async () => {
    if (auth.currentUser) {
      try {
        const r=await gameAction('attendance.claim');
        const a=gsRef.current.campaignData.attendance || {};
        setCurrentStreak(a.streak||0);setWeeklyCompletedDays(a.weeklyCompletedDays ?? a.claimedDays?.length ?? a.weeklyStreak ?? 0);
        setHasClaimedToday(true);setMakeupCount(a.makeupCount||0);
        onProgressChange?.();
        if (r.extra.pulls?.length) {setGachaResults(r.extra.pulls);setGachaState('opened');}
        else toast.success(lang==='vi'?'Điểm danh thành công!':'Checked in!');
      }catch(error){toast.error(error.message);}
      return;
    }
    const result = recordGuestAttendance(gsRef.current.campaignData, {}, getRealTime());
    if (!result.ok) {
      toast.error(lang === 'vi' ? 'Hôm nay đã điểm danh!' : 'Already checked in today!');
      return;
    }
    const attData = gsRef.current.campaignData.attendance;
    setCurrentStreak(attData.streak);
    setWeeklyCompletedDays(attData.weeklyCompletedDays ?? attData.claimedDays?.length ?? attData.weeklyStreak ?? 0);
    setHasClaimedToday(true);
    setMakeupCount(attData.makeupCount || 0);

    if (result.weeklyComplete) {
      showGuestWeeklyReward();
    } else {
      gsRef.current.coins += 10;
      toast.success(lang === 'vi' ? 'Điểm danh thành công! +10 Xu' : 'Attendance Claimed! +10 Coins', { icon: '🪙' });
    }
    saveUserProfile();
    onProgressChange?.();
  };

  const handleMakeupClaim = async (targetDay) => {
    if (auth.currentUser) {
      try {
        const r=await gameAction('attendance.makeup',{day:targetDay});
        const a=gsRef.current.campaignData.attendance || {};
        setWeeklyCompletedDays(a.weeklyCompletedDays ?? a.claimedDays?.length ?? a.weeklyStreak ?? 0);setMakeupCount(a.makeupCount||0);
        onProgressChange?.();
        if (r.extra.pulls?.length) {setGachaResults(r.extra.pulls);setGachaState('opened');}
        else toast.success(lang==='vi'?'Điểm danh bù thành công!':'Makeup check-in successful!');
      }catch(error){toast.error(error.message);}
      return;
    }
    const attData = (gsRef.current.campaignData.attendance ||= { streak: 0, lastDate: '', claimedDays: [], makeupCount: 0 });
    const now = getRealTime();
    ensureAttendanceWeek(attData, now);
    const count = attData.makeupCount || 0;
    const cost = count === 0 ? 50 : 150;
    if (count >= 2) {
      toast.error(lang === 'vi' ? 'Đã dùng hết lượt điểm danh bù!' : 'Makeup claims exhausted!');
      return;
    }
    if (gsRef.current.diamonds < cost) {
      toast.error(lang === 'vi' ? 'Không đủ kim cương!' : 'Not enough diamonds!', { icon: <Icons.Gem /> });
      return;
    }
    const result = recordGuestAttendance(gsRef.current.campaignData, { makeupDay: targetDay }, now);
    if (!result.ok) {
      toast.error(lang === 'vi' ? 'Chỉ được bù ngày chưa điểm danh và đã qua trong tuần!' : 'Choose an unclaimed past weekday!');
      return;
    }
    // Diamonds are spent only after the validation succeeds; Ghosts do not
    // modify the natural streak or day/week/month mission counters.
    gsRef.current.diamonds -= cost;
    setWeeklyCompletedDays(attData.weeklyCompletedDays ?? attData.claimedDays?.length ?? attData.weeklyStreak ?? 0);
    setMakeupCount(attData.makeupCount);
    if (result.weeklyComplete) showGuestWeeklyReward();
    else {
      gsRef.current.coins += 10;
      toast.success(lang === 'vi' ? 'Điểm danh bù thành công! +10 Xu' : 'Makeup Claim Successful! +10 Coins', { icon: '🪙' });
    }
    saveUserProfile();
    onProgressChange?.();
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
          <div className={styles.streakInfo}>
            <div className={styles.streakText}>
              {lang === 'vi' ? `Ô điểm danh tuần: ${weeklyCompletedDays}/7 (gồm cả bù)` : `Weekly slots: ${weeklyCompletedDays}/7 (incl. makeups)`}
            </div>
            <div className={styles.makeupInfo}>
              {lang === 'vi' ? `Đã dùng lượt bù tuần (UTC): ${makeupCount}/2 · Còn ${Math.max(0, 2-makeupCount)}` : `UTC-week makeups used: ${makeupCount}/2 · ${Math.max(0,2-makeupCount)} left`}
            </div>
          </div>

          <div className={styles.daysGrid}>
             {days.map(day => {
               const isClaimed = visibleClaimedDays.includes(day) || false;
               const isToday = !isClaimed && day === currentUTCWeekday;
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

          <div className={styles.buttonContainer}>
            <button
               className={`${styles.claimBtn} ${!hasClaimedToday ? styles.ready : styles.disabled}`}
               disabled={hasClaimedToday}
               onClick={handleClaim}
            >
               {!hasClaimedToday ? (lang === 'vi' ? 'BÁO CÁO CÓ MẶT' : 'REPORT IN') : (lang === 'vi' ? 'ĐÃ NHẬN HÔM NAY' : 'CLAIMED TODAY')}
            </button>

            <div className={styles.makeupSection}>
              {makeupCount >= 2 ? (
                <div className={styles.makeupStatus} role="status">
                  {lang === 'vi'
                    ? 'Đã dùng hết 2 lượt điểm danh bù của tuần UTC này. Lượt mới bắt đầu từ thứ Hai tuần sau.'
                    : 'Both weekly UTC makeups used. Two new allowances begin next Monday.'}
                </div>
              ) : eligibleMakeupDays.length === 0 ? (
                <div className={styles.makeupStatus} role="status">
                  {lang === 'vi'
                    ? 'Chưa có ngày đã qua và bỏ lỡ trong tuần để điểm danh bù.'
                    : 'No missed earlier weekday is eligible for makeup this week.'}
                </div>
              ) : (
                <>
                  <div className={styles.makeupTitle}>
                    {lang === 'vi' ? 'Điểm danh bù (tối đa 2 lượt/tuần UTC):' : 'Makeup claims (max 2 / UTC week):'}
                  </div>
                  <div className={styles.makeupDays}>
                    {eligibleMakeupDays.map(day => (
                      <button
                        key={day}
                        className={styles.makeupDayBtn}
                        onClick={() => handleMakeupClaim(day)}
                      >
                        {lang === 'vi' ? `Ngày ${day}` : `Day ${day}`}
                        <Icons.Gem />
                        {makeupCount === 0 ? '50' : '150'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
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