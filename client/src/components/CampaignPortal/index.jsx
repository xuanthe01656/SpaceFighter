import { mondayKeyUTC, weekdayMondayUTC, utcDayKey, lastNaturalClaimUTC } from '../../utils/attendanceWeek';
import { ensureGuestMissions } from '../../utils/guestProgress';
import { missionGoal, viewCloudMissions } from '../../utils/missionGoals';
import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import GameIcon from '../../ui-system/GameIconRegistry.jsx';
import GamePanel from '../../ui-system/GamePanel.jsx';
import StatusBadge from '../../ui-system/StatusBadge.jsx';
import { PRODUCT_PORTAL_MIGRATION_VERSION_V441 } from '../../ui-system/ProductPortalMigrationV441.js';
import styles from './CampaignPortal.module.css';
import { calculatePlayerLevel, calculateVIPLevel, MISSIONS_CONFIG, getActiveEvents} from '../../constants';
import { secureStorage } from '../../utils/storageHelper';
import FirstTopupModal from './FirstTopupModal';
import AttendanceModal from './AttendanceModal';

import { openManagementHqV443 } from '../../game/navigation/HangarNavigationV443.js';
import { openManagementHqV444 } from '../../game/navigation/HangarNavigationV444.js';
const productIcon = name => function ProductPortalIcon(props) {
  return <GameIcon name={name} {...props} />;
};
const Icons = Object.freeze({
  Energy: productIcon('energy'),
  Coin: productIcon('coin'),
  Gem: productIcon('gem'),
  Blueprint: productIcon('blueprint'),
  Gear: productIcon('gear'),
  Map: productIcon('map'),
  Armory: productIcon('armory'),
  Barracks: productIcon('barracks'),
  Supply: productIcon('shop'),
  Event: productIcon('event'),
  Gift: productIcon('gift'),
  Swords: productIcon('swords'),
  Download: productIcon('download'),
  Mission: productIcon('mission'),
  User: productIcon('user'),
  Copy: productIcon('copy'),
  Close: productIcon('close'),
  LogOut: productIcon('logout'),
  Crown: productIcon('crown'),
});
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
    <motion.div
      className={styles.container}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      data-sf-product-ui={PRODUCT_PORTAL_MIGRATION_VERSION_V441}
      data-sf-home-mode={currentUser ? 'cloud' : 'guest'}

      data-sf-portal-layout-v446="flight-hub" data-sf-visual-v447="aurora-tactical">

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
          <motion.button data-sf-icon-v448="topup" variants={slideLeft} className={`${styles.sideBtn} ${styles.topupBtn}`} onClick={() => setShowFirstTopup(true)}>
            <div className={styles.sideIcon}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_topup_reward.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Gift /></div>
            <span className={styles.sideText}>{lang === 'vi' ? 'NẠP ĐẦU' : 'FIRST TOP-UP'}</span>
          </motion.button>
        )}
        <motion.button data-sf-icon-v448="attendance" variants={slideLeft} className={`${styles.sideBtn} ${styles.badgedButton}`} onClick={() => setShowAttendance(true)}>
          <div className={styles.sideIcon}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_attendance_calendar.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Event /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'ĐIỂM DANH' : 'ATTENDANCE'}</span>
          {canClaimAttendance && <span className={styles.notiBadge}>!</span>}
        </motion.button>
        <motion.button data-sf-icon-v448="events" variants={slideLeft} className={`${styles.sideBtn} ${styles.eventBtn}`} onClick={() => setScreen('events')}>
          <div className={styles.sideIcon}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_event.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Event /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'SỰ KIỆN' : 'EVENTS'}</span>
          {activeEventCount > 0 && <span className={styles.notiBadge}>{activeEventCount}</span>}
        </motion.button>
        <motion.button data-sf-icon-v448="missions" variants={slideLeft} className={`${styles.sideBtn} ${styles.badgedButton}`} onClick={() => setScreen('missions')}>
          <div className={styles.sideIcon}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_missions.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Mission /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'NHIỆM VỤ' : 'MISSIONS'}</span>
          {missionBadgeCount > 0 && <span className={styles.notiBadge}>{missionBadgeCount}</span>}
        </motion.button>
        <motion.button variants={slideLeft} className={styles.sideBtn} onClick={() => setScreen('resource_manager')}>
          <div className={styles.sideIcon}><Icons.Download /></div>
          <span className={styles.sideText}>{lang === 'vi' ? 'TẢI DỮ LIỆU' : 'DOWNLOADS'}</span>
        </motion.button>
      </div>

      {/* BOTTOM NAVIGATION */}
      <motion.div variants={itemVariants} className={styles.bottomNav}>
        <button data-sf-icon-v448="headquarters" type="button"
          className={`${styles.navBtn} ${styles.managementNavBtn}`}
          data-sf-hq-entry-v446="fleet-hub-v4.4.6"
          onClick={() => { openManagementHqV444(gsRef); gsRef.current.hqReturnScreen = 'campaign_portal'; handleNav('hq'); }}
          aria-label={lang === 'vi' ? 'Tổng hành dinh' : 'Headquarters'}>
          <span className={styles.navIcon} aria-hidden="true"><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_headquarters.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 20V9l9-6 9 6v11M3 9h18M7 20v-6h10v6M9 14l3-3 3 3" />
            </svg>
          </span>
          <span>{lang === 'vi' ? 'TỔNG HÀNH DINH' : 'HEADQUARTERS'}</span>
        </button>
        <button data-sf-icon-v448="inventory" className={styles.navBtn} onClick={() => handleNav('inventory')}>
          <div className={styles.navIcon}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_inventory.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Armory /></div><span>{lang === 'vi' ? 'KHO TRANG BỊ' : 'INVENTORY'}</span>
        </button>
        <button data-sf-icon-v448="pilots" className={styles.navBtn} onClick={() => handleNav('pilots')}>
          <div className={styles.navIcon}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_pilots.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Barracks /></div><span>{lang === 'vi' ? 'PHI CÔNG' : 'PILOTS'}</span>
        </button>
        <button className={styles.navBtn} onClick={() => handleNav('shop_campaign')}>
          <div className={styles.navIcon}><Icons.Supply /></div><span>{lang === 'vi' ? 'CỬA HÀNG' : 'SHOP'}</span>
        </button>
      </motion.div>

      {/* BOTTOM RIGHT ACTION AREA */}

<motion.div variants={itemVariants} className={styles.actionArea}>        <button data-sf-icon-v448="dungeon" className={styles.subModeBtn} onClick={() => handleNav('dungeon_select')}>
          <div className={styles.subModeIcon}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_dungeon.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Swords /></div><span>{lang === 'vi' ? 'PHÓ BẢN' : 'DUNGEON'}</span>
        </button>
        <button data-sf-icon-v448="campaign" className={styles.mainLaunchBtn} onClick={() => handleNav('galaxy_map')}>
          <div className={styles.launchIconBg}><img className={styles.assetIconV448} src={import.meta.env.BASE_URL + 'assets/ui/spacefighter-portal-icons-v448/portal_campaign.webp'} alt="" aria-hidden="true" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.parentElement.dataset.sfIconFallback = 'true'; }} /><Icons.Map /></div>
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
            <GamePanel
              as={motion.div}
              variant="modal"
              tone="accent"
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
                <StatusBadge tone={currentUser ? 'success' : 'warning'} className={styles.profileStatus}>
                  {currentUser
                    ? (lang === 'vi' ? 'ĐỒNG BỘ ĐÁM MÂY' : 'CLOUD SYNC')
                    : (lang === 'vi' ? 'HỒ SƠ GUEST CỤC BỘ' : 'LOCAL GUEST PROFILE')}
                </StatusBadge>

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
                    <div className={styles.cloudSyncNotice}>
                      {lang === 'vi' ? 'ĐĂNG NHẬP ĐỂ LƯU ĐỒNG BỘ ĐÁM MÂY' : 'LOGIN TO CLOUD SYNC'}
                    </div>
                    {platform !== 'ios' && (
                      <button className={`${styles.logoutBtn} ${styles.cloudLoginBtn}`} onClick={() => { setShowProfile(false); if(loginWithGoogle) loginWithGoogle(); }}>
                        {lang === 'vi' ? 'ĐĂNG NHẬP GOOGLE' : 'GOOGLE LOGIN'}
                      </button>
                    )}
                    {platform === 'ios' && (
                      <button className={`${styles.logoutBtn} ${styles.appleLoginBtn}`} onClick={() => { setShowProfile(false); if(loginWithApple) loginWithApple(); }}>
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

            </GamePanel>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}