// src/components/DungeonSelect/index.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DUNGEON_CONFIG } from '../../constants';
import styles from './DungeonSelect.module.css';
import toast from 'react-hot-toast';
import { dungeonDayUTC, isDungeonOpenUTC } from '../../utils/dungeonSchedule';
import {
  createDungeonQaRunV391,
  getDungeonQaStatusLabelV391,
  resolveDungeonQaRuntimeAccessV391,
  resolveDungeonQaProfileV391,
} from '../../game/dungeon/DungeonQaAccessV391.js';
import {
  listDungeonQaLoadoutPresetsV397,
  resolveDungeonQaLoadoutPresetV397,
} from '../../game/dungeon/DungeonQaLoadoutV397.js';

// --- HỆ THỐNG SVG ICONS CHUẨN SCI-FI ---
const Icons = {
  Coin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>,
  Gem: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>,
  Energy: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  Blueprint: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>,
  Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  Box: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
};

const getRewardIcon = (type) => {
  switch(type) {
    case 'coins': return <Icons.Coin />;
    case 'gems': case 'diamonds': return <Icons.Gem />;
    case 'energy': return <Icons.Energy />;
    case 'blueprints': return <Icons.Blueprint />;
    case 'gears': return <Icons.Gear />;
    default: return <Icons.Box />;
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

export default function DungeonSelect({ gsRef, setScreen, lang, getRealTime }) {
  // Server Phase 1 uses UTC weekdays; local getDay() may disagree in UTC+7.
  const currentDay = dungeonDayUTC(getRealTime());
  const dungeonQaAccess = resolveDungeonQaRuntimeAccessV391();
  const qaLoadoutPresets = listDungeonQaLoadoutPresetsV397();
  const [qaRoomSelections, setQaRoomSelections] = useState(() => Object.fromEntries(
    DUNGEON_CONFIG.map(dungeon => [
      dungeon.id,
      dungeonQaAccess.requestedDungeonId === dungeon.id
        ? dungeonQaAccess.requestedRoomId || ''
        : '',
    ]),
  ));
  const [qaLoadoutSelections, setQaLoadoutSelections] = useState(() => Object.fromEntries(
    DUNGEON_CONFIG.map(dungeon => {
      const profile = resolveDungeonQaProfileV391(dungeon.id);
      const queryPreset = dungeonQaAccess.requestedDungeonId === dungeon.id
        ? dungeonQaAccess.requestedLoadoutPresetId
        : null;
      return [dungeon.id, queryPreset || profile?.defaultLoadoutPresetId || 'assault_mk3'];
    }),
  ));

  const handleEnter = (dungeon) => {
    let dungeonQaRun = null;
    if (dungeonQaAccess.enabled) {
      dungeonQaRun = createDungeonQaRunV391({
        access: dungeonQaAccess,
        dungeonId: dungeon.id,
        roomId: qaRoomSelections[dungeon.id] || null,
        loadoutPresetId: qaLoadoutSelections[dungeon.id] || null,
      });
      if (!dungeonQaRun) {
        toast.error(lang === 'vi' ? 'Dungeon này chưa có hồ sơ QA hợp lệ.' : 'No valid QA profile for this dungeon.');
        return;
      }
    } else {
      if (!isDungeonOpenUTC(dungeon,getRealTime())) {
        toast.error(lang==='vi'?'Phó bản hiện chưa mở (lịch UTC).':'Dungeon is closed (UTC schedule).');
        return;
      }
      if (gsRef.current.energy < dungeon.energyCost) {
        toast.error(lang === 'vi' ? 'Không đủ Năng lượng!' : 'Not enough Energy!', { icon: '⚡' });
        return;
      }
    }
    gsRef.current.dungeonQa = dungeonQaRun;
    gsRef.current.selectedDungeonId = dungeon.id;
    gsRef.current.pendingEnergyCost = dungeonQaRun ? 0 : dungeon.energyCost;
    gsRef.current.gameMode = 'dungeon';
    setScreen('hq');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.container}>
      
      <header className={styles.header}>
        <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
          <span>‹</span> {lang === 'vi' ? 'TRỞ VỀ' : 'BACK'}
        </motion.button>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>{lang === 'vi' ? 'CHIẾN DỊCH VỰC SÂU' : 'ABYSSAL CAMPAIGN'}</h1>
          <p className={styles.subtitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            {lang === 'vi' ? 'Năng lượng hiện tại: ' : 'Current Energy: '}
            <span style={{ width: '14px', height: '14px', display: 'inline-block' }}><Icons.Energy /></span>
            {gsRef.current.energy}
          </p>
        </div>
      </header>

      {dungeonQaAccess.enabled && (
        <div className={styles.qaBanner} role="status">
          <strong>DUNGEON QA V3.9.7</strong>
          <span>{lang === 'vi'
            ? '3 Dungeon đủ 5 phòng · chọn trang bị QA · 0 năng lượng · không thưởng · không ghi tiến trình'
            : 'Three complete five-room QA dungeons · selectable QA loadouts · zero energy · no rewards · no progression writes'}</span>
        </div>
      )}

      <div className={styles.dungeonGrid}>
        {DUNGEON_CONFIG.map((dungeon, idx) => {
          const scheduleOpen = dungeon.openDays.includes(currentDay);
          const qaProfile = resolveDungeonQaProfileV391(dungeon.id);
          const isOpen = dungeonQaAccess.enabled ? Boolean(qaProfile?.visible) : scheduleOpen;
          const qaStatus = dungeonQaAccess.enabled ? getDungeonQaStatusLabelV391(qaProfile, lang) : null;
          const selectedQaLoadout = resolveDungeonQaLoadoutPresetV397(qaLoadoutSelections[dungeon.id]);

          return (
            <motion.div 
              key={dungeon.id} 
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.15 }}
              className={`${styles.card} ${isOpen ? styles.open : styles.closed}`}
              style={{ color: dungeon.themeColor }}
            >
              {/* Ảnh nền AAA */}
              <div className={styles.cardBg}>
                <img src={dungeon.bgImg} alt="bg" className={styles.bgImage} onError={(e) => { e.target.style.display = 'none'; }}/>
                <div className={styles.bgGradient}></div>
              </div>

              <div className={styles.cardContent}>
                <div className={styles.cardHeader}>
                  <div className={`${styles.statusBadge} ${isOpen ? styles.open : styles.closed}`}>
                    {dungeonQaAccess.enabled
                      ? qaStatus
                      : (isOpen ? (lang === 'vi' ? 'ĐANG MỞ (UTC)' : 'OPEN (UTC)') : (lang === 'vi' ? 'ĐÓNG CỬA (UTC)' : 'CLOSED (UTC)'))}
                  </div>
                  <div className={styles.difficulty}>
                    {[1, 2, 3].map(star => (
                      <span key={star} className={`${styles.star} ${star <= dungeon.difficulty ? styles.active : ''}`}>★</span>
                    ))}
                  </div>
                </div>

                <div className={styles.cardInfo}>
                  <h3 className={styles.cardSub} style={{ color: dungeon.themeColor }}>{dungeon.subtitle[lang]}</h3>
                  <h2 className={styles.cardTitle}>{dungeon.title[lang]}</h2>
                  <p className={styles.cardDesc}>{dungeon.desc[lang]}</p>
                  
                  <div className={styles.bossInfo}>
                    <span className={styles.bossLabel}>TARGET:</span>
                    <span className={styles.bossName}>{dungeon.boss[lang]}</span>
                  </div>

                  <div className={styles.rewardBox}>
                    {dungeonQaAccess.enabled ? (
                      <div className={styles.qaNoReward}>
                        {lang === 'vi' ? 'QA CỤC BỘ · KHÔNG THƯỞNG / KHÔNG GHI DỮ LIỆU' : 'LOCAL QA · NO REWARDS / NO WRITES'}
                      </div>
                    ) : dungeon.rewards.map((rw, i) => (
                      <div key={i} className={styles.rewardItem} style={{ color: getRewardColor(rw.type) }}>
                         <span style={{ width: '18px', height: '18px', display: 'flex' }}>
                           {getRewardIcon(rw.type)}
                         </span>
                         <span>{rw.amountStr}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.actionArea}>
                  {dungeonQaAccess.enabled && qaProfile && (
                    <>
                      <div className={styles.qaControlGrid}>
                        {qaProfile.allowDirectRoom && (
                          <label className={styles.qaRoomPicker}>
                            <span>{lang === 'vi' ? 'ĐIỂM BẮT ĐẦU QA' : 'QA START POINT'}</span>
                            <select
                              value={qaRoomSelections[dungeon.id] || ''}
                              onChange={(event) => setQaRoomSelections(current => ({
                                ...current,
                                [dungeon.id]: event.target.value,
                              }))}
                            >
                              <option value="">{lang === 'vi'
                                ? `FULL RUN — ${qaProfile.roomBriefs.length} PHÒNG`
                                : `FULL RUN — ${qaProfile.roomBriefs.length} ROOMS`}</option>
                              {qaProfile.roomBriefs.map(room => (
                                <option key={room.id} value={room.id}>
                                  {`ROOM ${room.index + 1} — ${room.title?.[lang] || room.title?.vi || room.id}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className={styles.qaLoadoutPicker}>
                          <span>{lang === 'vi' ? 'CẤU HÌNH TRANG BỊ QA' : 'QA LOADOUT PRESET'}</span>
                          <select
                            value={qaLoadoutSelections[dungeon.id] || qaProfile.defaultLoadoutPresetId}
                            onChange={(event) => setQaLoadoutSelections(current => ({
                              ...current,
                              [dungeon.id]: event.target.value,
                            }))}
                          >
                            {qaLoadoutPresets.map(preset => (
                              <option key={preset.id} value={preset.id}>
                                {preset.label?.[lang] || preset.label?.vi || preset.id}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className={styles.qaLoadoutSummary}>
                        <strong>{selectedQaLoadout.label?.[lang] || selectedQaLoadout.label?.vi}</strong>
                        <span>{selectedQaLoadout.summary?.[lang] || selectedQaLoadout.summary?.vi}</span>
                      </div>
                      <div className={styles.qaProductionNote}>
                        {lang === 'vi'
                          ? 'FULL QA 5 PHÒNG · production vẫn khóa lịch/mở khóa · loadout chỉ tồn tại trong trận.'
                          : 'FULL FIVE-ROOM QA · production schedule/unlock stays locked · loadout exists only in this run.'}
                      </div>
                    </>
                  )}
                  <button
                    className={`${styles.playBtn} ${isOpen ? styles.open : ''}`}
                    onClick={() => isOpen && handleEnter(dungeon)}
                    style={{ '--btn-color': dungeon.themeColor }}
                  >
                    {dungeonQaAccess.enabled ? (
                      <>{lang === 'vi' ? 'QA XUẤT KÍCH · 0 NĂNG LƯỢNG' : 'QA DEPLOY · ZERO ENERGY'}</>
                    ) : (
                      <>
                        <span style={{ width: '22px', height: '22px', display: 'flex' }}><Icons.Energy /></span>
                        {dungeon.energyCost} {lang === 'vi' ? 'XUẤT KÍCH' : 'DEPLOY'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

    </motion.div>
  );
}