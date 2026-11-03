import { mondayKeyUTC, weekdayMondayUTC, utcDayKey, lastNaturalClaimUTC } from '../../utils/attendanceWeek';
import { ensureGuestMissions } from '../../utils/guestProgress';
import { missionGoal, viewCloudMissions } from '../../utils/missionGoals';
import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import styles from './CampaignPortal.module.css';
import { calculatePlayerLevel, calculateVIPLevel, MISSIONS_CONFIG, getActiveEvents} from '../../constants';
import { secureStorage } from '../../utils/storageHelper';
import FirstTopupModal from './FirstTopupModal';
import AttendanceModal from './AttendanceModal';

// --- HỆ THỐNG SVG ICONS CHUẨN SCI-FI ---
const Icons = {
  Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  Coin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>,
  Gem: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>,
  Blueprint: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>,
   Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  Map: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>,
  Armory: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
  Barracks: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Supply: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  Event: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Gift: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,
  Swords: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 6.5L17.5 3h3v3l-3.5 3.5"/><path d="M5 19l6-6"/><path d="M8 16l-4 4"/><path d="M5 21l-2-2"/></svg>,
  Download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>,
  Mission: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  User: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Copy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  LogOut: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Crown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
};

const formatCompactNumber = (number) => {
  if (number < 1000) return number.toString();
  const suffixes = ["", "K", "M", "B", "T"];
  const suffixNum = Math.floor(("" + number).length / 3);
  let shortValue = parseFloat((suffixNum !== 0 ? (number / Math.pow(1000, suffixNum)) : number).toPrecision(3));
  if (shortValue % 1 !== 0) shortValue = shortValue.toFixed(1);
  return shortValue + suffixes[suffixNum];
};

export default function CampaignPortal({ gsRef, setScreen, lang, setLang, currentUser, logout, deleteAccount, loginWithGoogle, loginWithApple, saveUserProfile, getRealTime, gameAction }) {
  const platform = Capacitor.getPlatform();
  const [showProfile, setShowProfile] = useState(false);
  
  // STATE cho việc Bật/Tắt Modal Nạp Lần Đầu
  const [showFirstTopup, setShowFirstTopup] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);

  const campaignData = gsRef.current.campaignData;
  const hasClaimedFirstTopup = campaignData?.hasClaimedFirstTopup || false;
  const materials = campaignData?.materials || {};
  const energy = gsRef.current?.energy ?? 50;
  const coins = gsRef.current?.coins ?? 0;
  const diamonds = gsRef.current?.diamonds ?? 0;
  const gear = Number(materials.gears) || 0;
  const blueprints = Number(materials.blueprints) || 0;

  const playerName = gsRef.current.myName || 'Pilot';
  const playerAvatar = currentUser?.photoURL || null;
  const uid = currentUser?.uid || gsRef.current.deviceId || "GUEST-ID";
  const activeEventCount = getActiveEvents(getRealTime).length;
  const totalExp = campaignData?.progress?.exp || 0;
  const expData = calculatePlayerLevel(totalExp);
  
  const totalVipPoints = gsRef.current.vipPoints || 0;
  const vipData = calculateVIPLevel(totalVipPoints);
  const [, setMissionRefresh] = useState(0);
  useEffect(() => {
    if (currentUser) return;
    const campaign = gsRef.current.campaignData;
    const before = JSON.stringify(campaign.missionData);
    ensureGuestMissions(campaign, getRealTime());
    if (before !== JSON.stringify(campaign.missionData)) {
      saveUserProfile();
      setMissionRefresh(tick => tick + 1);
    }
  }, [currentUser]);
  const nowMs = getRealTime();
  const sourceMissions = gsRef.current.campaignData?.missionData || { claimed: [], progress: {} };
  const missionData = currentUser ? viewCloudMissions(sourceMissions, nowMs) : sourceMissions;
  let missionBadgeCount = 0;
  ['daily', 'weekly', 'monthly'].forEach(type => {
    MISSIONS_CONFIG[type]?.forEach(m => {
      const prog = missionData.progress?.[m.id] || 0;
      const isClaimed = missionData.claimed?.includes(m.id);
      if (prog >= missionGoal(m, nowMs) && !isClaimed) missionBadgeCount++;
    });
  });

  const attData = gsRef.current.campaignData?.attendance || { lastDate: '' };
  const currentWeek = mondayKeyUTC(nowMs);
  const utcDayIndex = weekdayMondayUTC(nowMs);
  const canClaimAttendance = lastNaturalClaimUTC(attData) !== utcDayKey(nowMs) &&
    (attData.weekKey !== currentWeek || !attData.claimedDays?.includes(utcDayIndex));
  const handleNav = (screenName) => setScreen(screenName);

  const handleNotImplemented = () => {
    toast(lang === 'vi' ? 'HỆ THỐNG ĐANG BẢO TRÌ!' : 'SYSTEM OFFLINE!', {
      style: { background: 'rgba(255, 60, 0, 0.9)', color: '#fff', borderRadius: '4px', border: '1px solid #ff3c00' },
      icon: '⚠️'
    });
  };

  const copyUID = () => {
    navigator.clipboard.writeText(uid);
    toast.success(lang === 'vi' ? 'Đã sao chép ID!' : 'UID Copied!');
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1, duration: 0.4 } } };
  const itemVariants = { hidden: { opacity: 0, scale: 0.9 }, visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } } };
  const slideLeft = { hidden: { x: -50, opacity: 0 }, visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 200 } } };
  const modalVariants = { hidden: { opacity: 0, y: 50, scale: 0.9 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 25 } }, exit: { opacity: 0, scale: 0.9, y: 20 } };
  // Fix lỗi useEffect: Sử dụng setTimeout để tránh "update during transition"
  useEffect(() => {
    let timeoutId;
    if (gsRef.current?.openAttendance) {
      timeoutId = setTimeout(() => {
        setShowAttendance(true);
        gsRef.current.openAttendance = false; 
      }, 0);
    }
    return () => clearTimeout(timeoutId); 
  }, [gsRef]);
  return (
    <motion.div className={styles.container} variants={containerVariants} initial="hidden" animate="visible">
      
      {/* TOP NAVIGATION & CURRENCY BAR */}
      <div className={styles.topNav}>
        <motion.button variants={itemVariants} className={styles.profileBtn} onClick={() => setShowProfile(true)}>
          <div className={styles.profileAvatarWrap}>
             {playerAvatar ? (
               <img src={playerAvatar} alt="avatar" className={styles.profileAvatar} referrerPolicy="no-referrer" />
             ) : (
               <div className={styles.avatarPlaceholder}><Icons.User /></div>
             )}
          </div>
          <div className={styles.profileInfo}>
             <span className={styles.profileName}>{playerName}</span>
             <div className={styles.levelRow}>
                <span className={styles.profileLevel}>Lv.{expData.level}</span>
                <div className={styles.miniExpBarBg}>
                  <div className={styles.miniExpBarFill} style={{ width: `${expData.percent}%` }}></div>
                </div>
             </div>
          </div>
        </motion.button>

        <motion.div variants={itemVariants} className={styles.currencyBar}>
          <div className={`${styles.currencyChip} ${styles.chipEnergy}`}>
             <div className={styles.currencyIcon}><Icons.Energy /></div><span className={styles.currencyAmt}>{formatCompactNumber(energy)}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipCoin}`}>
             <div className={styles.currencyIcon}><Icons.Coin /></div><span className={styles.currencyAmt}>{formatCompactNumber(coins)}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipGem}`}>
             <div className={styles.currencyIcon}><Icons.Gem /></div><span className={styles.currencyAmt}>{formatCompactNumber(diamonds)}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipBlueprint}`}>
              <div className={styles.currencyIcon}><Icons.Blueprint /></div><span className={styles.currencyAmt}>{formatCompactNumber(blueprints)}</span>
          </div>
          <div className={`${styles.currencyChip} ${styles.chipGear}`}>
            <div className={styles.currencyIcon}><Icons.Gear /></div><span className={styles.currencyAmt}>{formatCompactNumber(gear)}</span>
          </div>
        </motion.div>
      </div>

      {/* LEFT SIDEBAR */}
      <div className={styles.leftSidebar}>
        {/* THAY ĐỔI Ở ĐÂY: Gắn sự kiện mở Popup Nạp đầu */}
        {!hasClaimedFirstTopup && (
          <motion.button variants={slideLeft} className={`${styles.sideBtn} ${styles.topupBtn}`} onClick={() => setShowFirstTopup(true)}>
            <div className={styles.sideIcon}><Icons.Gift /></div>
            <span className={styles.sideText}>{lang === 'vi' ? 'NẠP ĐẦU' : 'FIRST TOP-UP'}</span>
          </motion.button>
        )}
        <motion.button variants={slideLeft} className={styles.sideBtn} style={{ position: 'relative' }} onClick={() => setShowAttendance(true)}>
          <div className={styles.sideIcon}><Icons.Event /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'ĐIỂM DANH' : 'ATTENDANCE'}</span>
          {canClaimAttendance && <span className={styles.notiBadge}>!</span>}
        </motion.button>
        <motion.button variants={slideLeft} className={`${styles.sideBtn} ${styles.eventBtn}`} onClick={() => setScreen('events')}>
          <div className={styles.sideIcon}><Icons.Event /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'SỰ KIỆN' : 'EVENTS'}</span>
          {activeEventCount > 0 && <span className={styles.notiBadge}>{activeEventCount}</span>}
        </motion.button>
        <motion.button variants={slideLeft} className={styles.sideBtn} style={{ position: 'relative' }} onClick={() => setScreen('missions')}>
          <div className={styles.sideIcon}><Icons.Mission /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'NHIỆM VỤ' : 'MISSIONS'}</span>
          {missionBadgeCount > 0 && <span className={styles.notiBadge}>{missionBadgeCount}</span>}
        </motion.button>
        <motion.button variants={slideLeft} className={styles.sideBtn} onClick={() => setScreen('resource_manager')}>
          <div className={styles.sideIcon}><Icons.Download /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'TÀI NGUYÊN' : 'RESOURCES'}</span>
        </motion.button>
      </div>

      {/* BOTTOM NAVIGATION */}
      <motion.div variants={itemVariants} className={styles.bottomNav}>
        <button className={styles.navBtn} onClick={() => handleNav('inventory')}>
          <div className={styles.navIcon}><Icons.Armory /></div><span>{lang === 'vi' ? 'KHO KHÍ TÀI' : 'ARMORY'}</span>
        </button>
        <button className={styles.navBtn} onClick={() => handleNav('pilots')}>
          <div className={styles.navIcon}><Icons.Barracks /></div><span>{lang === 'vi' ? 'DOANH TRẠI' : 'BARRACKS'}</span>
        </button>
        <button className={styles.navBtn} onClick={() => handleNav('shop_campaign')}>
          <div className={styles.navIcon}><Icons.Supply /></div><span>{lang === 'vi' ? 'CỬA HÀNG' : 'SHOP'}</span>
        </button>
      </motion.div>

      {/* BOTTOM RIGHT ACTION AREA */}
      <motion.div variants={itemVariants} className={styles.actionArea}>
        <button className={styles.subModeBtn} onClick={() => handleNav('dungeon_select')}>
          <div className={styles.subModeIcon}><Icons.Swords /></div><span>{lang === 'vi' ? 'PHÓ BẢN' : 'DUNGEON'}</span>
        </button>
        <button className={styles.mainLaunchBtn} onClick={() => handleNav('galaxy_map')}>
          <div className={styles.launchIconBg}><Icons.Map /></div>
          <div className={styles.launchContent}>
            <span className={styles.launchTitle}>{lang === 'vi' ? 'CHIẾN DỊCH' : 'CAMPAIGN'}</span>
            <span className={styles.launchSub}>{lang === 'vi' ? 'VÀO BẢN ĐỒ' : 'ENTER MAP'}</span>
          </div>
        </button>
      </motion.div>

      {/* POPUP NẠP LẦN ĐẦU TÁCH RỜI */}
      <FirstTopupModal 
        isOpen={showFirstTopup} 
        onClose={() => setShowFirstTopup(false)} 
        lang={lang} 
        onGoToShop={() => {
          setShowFirstTopup(false);
          gsRef.current.shopInitialTab = 'topup'; 
          setScreen('shop_campaign'); 
        }} 
      />
      <AttendanceModal gameAction={gameAction} 
        isOpen={showAttendance}
        onClose={() => setShowAttendance(false)}
        gsRef={gsRef}
        saveUserProfile={saveUserProfile}
        lang={lang}
        getRealTime={getRealTime}
        onProgressChange={() => setMissionRefresh(tick => tick + 1)}
      />
      {/* POPUP THÔNG TIN HỒ SƠ (MODAL) */}
      <AnimatePresence>
        {showProfile && (
          <div className={styles.popupOverlay} onClick={() => setShowProfile(false)}>
            <motion.div 
              className={styles.profileModal} 
              variants={modalVariants} initial="hidden" animate="visible" exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              <button className={styles.closeModalBtn} onClick={() => setShowProfile(false)}><Icons.Close /></button>
              
              <div className={styles.modalHeader}>
                <div className={styles.modalAvatarWrap}>
                  {playerAvatar ? (
                    <img src={playerAvatar} alt="avatar" className={styles.modalAvatar} referrerPolicy="no-referrer" />
                  ) : (
                    <div className={styles.modalAvatarPlaceholder}><Icons.User /></div>
                  )}
                </div>
                <h2 className={styles.modalName}>{playerName}</h2>
                
                <div className={styles.modalExpContainer}>
                  <div className={styles.modalExpLabel}>
                    <span>{lang === 'vi' ? 'Cấp độ' : 'Level'} {expData.level}</span>
                    <span className={styles.modalExpNum}>{formatCompactNumber(expData.currentExp)} / {formatCompactNumber(expData.maxExpForNextLevel)}</span>
                  </div>
                  <div className={styles.modalExpBg}>
                    <div className={styles.modalExpFill} style={{ width: `${expData.percent}%` }}></div>
                  </div>
                </div>
              </div>

              <div className={styles.vipCard}>
                <div className={styles.vipHeader}>
                  <span className={styles.vipTitle}><Icons.Crown /> VIP {vipData.level}</span>
                  <span className={styles.vipNext}>👉 VIP {vipData.level + 1}</span>
                </div>
                <div className={styles.vipBarBg}>
                  <div className={styles.vipBarFill} style={{ width: `${vipData.percent}%` }}></div>
                </div>
                <div className={styles.vipPointsText}>{formatCompactNumber(vipData.currentPoints)} / {formatCompactNumber(vipData.maxPointsForNext)} pts</div>
              </div>

              <div className={styles.langToggleContainer}>
                <span className={styles.langLabel}>{lang === 'vi' ? 'NGÔN NGỮ / LANG:' : 'LANGUAGE / NGÔN NGỮ:'}</span>
                <div className={styles.langButtons}>
                  <button 
                    className={`${styles.langBtn} ${lang === 'vi' ? styles.langActive : ''}`}
                    onClick={() => { if(setLang) { setLang('vi'); secureStorage.setItem('astro_lang', 'vi'); } }}
                  >🇻🇳 VI</button>
                  <button
                    className={`${styles.langBtn} ${lang === 'en' ? styles.langActive : ''}`}
                    onClick={() => { if(setLang) { setLang('en'); secureStorage.setItem('astro_lang', 'en'); } }}
                  >🇬🇧 EN</button>
                </div>
              </div>

              <div className={styles.uidContainer}>
                <div className={styles.uidLabel}>UID:</div>
                <div className={styles.uidBox}>
                  <span className={styles.uidText}>{uid}</span>
                  <button className={styles.copyBtn} onClick={copyUID} title="Copy UID"><Icons.Copy /></button>
                </div>
              </div>

              <div className={styles.modalActions}>
                {!currentUser ? (
                  <>
                    <div style={{ textAlign: 'center', fontSize: '14px', color: '#facc15', marginBottom: '5px', fontFamily: '"VT323", monospace' }}>
                      {lang === 'vi' ? 'ĐĂNG NHẬP ĐỂ LƯU ĐỒNG BỘ ĐÁM MÂY' : 'LOGIN TO CLOUD SYNC'}
                    </div>
                    {platform !== 'ios' && (
                      <button className={styles.logoutBtn} style={{ borderColor: '#00e5ff', color: '#00e5ff', backgroundColor: 'rgba(0, 229, 255, 0.1)' }} onClick={() => { setShowProfile(false); if(loginWithGoogle) loginWithGoogle(); }}>
                        {lang === 'vi' ? 'ĐĂNG NHẬP GOOGLE' : 'GOOGLE LOGIN'}
                      </button>
                    )}
                    {platform === 'ios' && (
                      <button className={styles.logoutBtn} style={{ borderColor: '#fff', color: '#fff', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} onClick={() => { setShowProfile(false); if(loginWithApple) loginWithApple(); }}>
                        🍎 {lang === 'vi' ? 'ĐĂNG NHẬP APPLE' : 'APPLE LOGIN'}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className={styles.logoutBtn} onClick={() => { setShowProfile(false); if(logout) logout(); }}>
                      <span className={styles.actionIcon}><Icons.LogOut /></span>
                      {lang === 'vi' ? 'ĐĂNG XUẤT' : 'LOGOUT'}
                    </button>
                    <button className={styles.deleteBtn} onClick={() => { setShowProfile(false); if(deleteAccount) deleteAccount(); }}>
                      {lang === 'vi' ? 'Xóa tài khoản vĩnh viễn' : 'Delete Account Permanently'}
                    </button>
                  </>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}