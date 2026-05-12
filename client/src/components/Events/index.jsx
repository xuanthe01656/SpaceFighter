// src/components/Events/index.jsx
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EVENT_CONFIG, getActiveEvents } from '../../constants';
import styles from './Events.module.css';
import toast from 'react-hot-toast';

// ─── SVG ICONS (tái sử dụng từ Missions/index.jsx) ───────────────────────────
const Icons = {
  Coin: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  ),
  Gem: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 22 2 9 6 2 18 2 22 9 12 22" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" />
      <line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" />
    </svg>
  ),
  Energy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  Blueprint: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="7" r="1.5" />
      <path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" />
    </svg>
  ),
  Gear: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  // Icon cho aircraft (phi cơ)
  Aircraft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
    </svg>
  ),
  // Icon cho event banners
  Sword: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>
      <line x1="13" y1="19" x2="19" y2="13"/>
      <line x1="16" y1="16" x2="20" y2="20"/>
      <line x1="19" y1="21" x2="21" y2="19"/>
    </svg>
  ),
  CoinStack: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  Dungeon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Gift: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  ),
  Skull: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
      <path d="M8 20v2h8v-2"/><path d="M12.5 17-.5-1v-2M11.5 17l.5-1v-2"/>
      <path d="M12 2C6.5 2 2 6.5 2 12c0 3.6 2 6.7 4.9 8.3V22h10v-1.7C19.9 18.7 22 15.6 22 12c0-5.5-4.5-10-10-10z"/>
    </svg>
  ),
  Rocket: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  ),
};

// ─── MAP REWARD TYPE → SVG ICON + COLOR ──────────────────────────────────────
const REWARD_MAP = {
  coins:      { Icon: Icons.Coin,      color: '#fb923c' },
  gems:       { Icon: Icons.Gem,       color: '#c084fc' },
  diamonds:   { Icon: Icons.Gem,       color: '#c084fc' },
  energy:     { Icon: Icons.Energy,    color: '#4ade80' },
  blueprints: { Icon: Icons.Blueprint, color: '#60a5fa' },
  gears:      { Icon: Icons.Gear,      color: '#facc15' },
  aircraft:   { Icon: Icons.Aircraft,  color: '#f1c40f' },
};

// ─── MAP EVENT TYPE → SVG BANNER ICON ────────────────────────────────────────
const BANNER_MAP = {
  kill_rush:    Icons.Sword,
  coin_fever:   Icons.CoinStack,
  dungeon_rush: Icons.Dungeon,
  gear_hunt:    Icons.Gift,
  boss_blitz:   Icons.Skull,
  login_bonus:  Icons.Rocket,
};

// ─── REWARD ICON COMPONENT ────────────────────────────────────────────────────
const RewardIcon = ({ type, size = 20 }) => {
  const entry = REWARD_MAP[type] || { Icon: Icons.Gift, color: '#fff' };
  const { Icon, color } = entry;
  return (
    <span className={styles.rewardSvgWrap} style={{ color, width: size, height: size }}>
      <Icon />
    </span>
  );
};

// ─── BANNER ICON COMPONENT ───────────────────────────────────────────────────
const BannerIcon = ({ type, color }) => {
  const Icon = BANNER_MAP[type] || Icons.Gift;
  return (
    <span className={styles.bannerSvgWrap} style={{ color }}>
      <Icon />
    </span>
  );
};

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────
function Countdown({ endTime, getRealTime }) {
  const now   = getRealTime();
  const diff  = Math.max(0, endTime - now);
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  return (
    <span className={styles.countdown}>
      {days > 0 && `${days}n `}{String(hours).padStart(2,'0')}:{String(mins).padStart(2,'0')}
    </span>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={styles.progressBg}>
      <div className={styles.progressFill} style={{ width: `${pct}%`, background: color }} />
      <span className={styles.progressText}>{value} / {max}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PANELS
// ═════════════════════════════════════════════════════════════════════════════

function KillRushPanel({ event, eventData, lang, onClaim }) {
  const kills   = eventData?.kills || 0;
  const claimed = eventData?.claimedMilestones || [];
  return (
    <div className={styles.detailBody}>
      <div className={styles.bigStat}>
        <span className={styles.bigNum}>{kills.toLocaleString()}</span>
        <span className={styles.bigLabel}>{lang === 'vi' ? 'KẺ ĐỊCH ĐÃ TIÊU DIỆT' : 'ENEMIES DESTROYED'}</span>
      </div>
      <div className={styles.milestoneList}>
        {event.milestones.map((ms, i) => {
          const done      = kills >= ms.kills;
          const isClaimed = claimed.includes(i);
          const rColor    = REWARD_MAP[ms.reward.type]?.color || '#fff';
          return (
            <div key={i} className={`${styles.milestoneRow} ${done ? styles.milestoneReady : ''} ${isClaimed ? styles.milestoneDone : ''}`}>
              <div className={styles.milestoneLeft}>
                {/* SVG Sword icon thay ☄ */}
                <div className={styles.milestoneKillsRow}>
                  <span className={styles.milestoneSvg} style={{ color: event.themeColor }}>
                    <Icons.Sword />
                  </span>
                  <span className={styles.milestoneKills}>{ms.kills.toLocaleString()}</span>
                </div>
                <ProgressBar value={Math.min(kills, ms.kills)} max={ms.kills} color={event.themeColor} />
              </div>
              <div className={styles.milestoneReward} style={{ color: rColor }}>
                <RewardIcon type={ms.reward.type} size={22} />
                <span>×{ms.reward.amount}</span>
              </div>
              <button
                className={`${styles.claimBtn} ${isClaimed ? styles.claimedBtn : done ? styles.readyBtn : styles.lockedBtn}`}
                disabled={!done || isClaimed}
                onClick={() => onClaim(event, i, ms.reward)}
              >
                {isClaimed
                  ? <span className={styles.btnSvg} style={{ color: '#4ade80' }}><Icons.Gear /></span>
                  : done
                  ? (lang === 'vi' ? 'NHẬN' : 'CLAIM')
                  : <span className={styles.btnSvg} style={{ color: '#475569' }}><Icons.Blueprint /></span>
                }
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoginBonusPanel({ event, eventData, lang, onCollectDay, getRealTime }) {
  const collected  = eventData?.daysCollected || [];
  const lastDate   = eventData?.lastCollectDate || '';
  const todayStr   = new Date(getRealTime()).toDateString();
  const canCollect = lastDate !== todayStr;
  const nextDay    = collected.length;

  return (
    <div className={styles.detailBody}>
      <div className={styles.loginGrid}>
        {event.dailyRewards.map((rw, i) => {
          const done   = collected.includes(i);
          const isNext = i === nextDay && canCollect;
          const rColor = REWARD_MAP[rw.type]?.color || '#fff';
          return (
            <div key={i} className={`${styles.loginDay} ${done ? styles.loginDone : ''} ${isNext ? styles.loginNext : ''}`}
              style={{ '--ec': event.themeColor }}>
              <div className={styles.loginDayNum}>{lang === 'vi' ? `Ngày ${i+1}` : `Day ${i+1}`}</div>
              {/* SVG icon thay emoji */}
              <div className={styles.loginIconWrap} style={{ color: rColor }}>
                <RewardIcon type={rw.type} size={26} />
              </div>
              <div className={styles.loginRewardLabel} style={{ color: rColor }}>
                {rw.id ? rw.id.replace('ship_','') : `×${rw.amount}`}
              </div>
              {done && (
                <div className={styles.loginCheck} style={{ color: '#4ade80' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        className={`${styles.collectBtn} ${!canCollect || nextDay >= 7 ? styles.lockedBtn : styles.readyBtn}`}
        style={{ '--ec': event.themeColor }}
        disabled={!canCollect || nextDay >= 7}
        onClick={() => onCollectDay(event, nextDay)}
      >
        {nextDay >= 7
          ? (lang === 'vi' ? 'ĐÃ HOÀN THÀNH' : 'COMPLETED')
          : !canCollect
          ? (lang === 'vi' ? 'ĐÃ NHẬN HÔM NAY' : 'COLLECTED TODAY')
          : (lang === 'vi' ? `NHẬN NGÀY ${nextDay+1}` : `COLLECT DAY ${nextDay+1}`)}
      </button>
    </div>
  );
}

function PassivePanel({ event, lang }) {
  return (
    <div className={styles.detailBody}>
      <div className={styles.passiveBadge} style={{ '--ec': event.themeColor }}>
        {/* SVG thay emoji banner */}
        <div className={styles.passiveSvgIcon} style={{ color: event.themeColor }}>
          <BannerIcon type={event.type} color={event.themeColor} />
        </div>
        <span className={styles.passiveActive}>{lang === 'vi' ? 'HIỆU ỨNG ĐANG HOẠT ĐỘNG' : 'EFFECT ACTIVE'}</span>
      </div>
      {event.multiplier && (
        <div className={styles.multiplierTag} style={{ color: event.themeColor }}>
          <span className={styles.multiplierSvg}><Icons.CoinStack /></span>
          ×{event.multiplier} {lang === 'vi' ? 'XU' : 'COINS'}
        </div>
      )}
      {event.rewardMultiplier && (
        <div className={styles.multiplierTag} style={{ color: event.themeColor }}>
          <span className={styles.multiplierSvg}><Icons.Gift /></span>
          ×{event.rewardMultiplier} {lang === 'vi' ? 'PHẦN THƯỞNG PHÓ BẢN' : 'DUNGEON REWARDS'}
        </div>
      )}
      {event.openAllDays && (
        <div className={styles.multiplierTag} style={{ color: event.themeColor }}>
          <span className={styles.multiplierSvg}><Icons.Dungeon /></span>
          {lang === 'vi' ? 'TẤT CẢ PHÓ BẢN MỞ CỬA' : 'ALL DUNGEONS OPEN'}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function Events({ gsRef, setScreen, lang, saveUserProfile, getRealTime }) {
  const [selectedId, setSelectedId] = useState(null);

  if (!gsRef.current.campaignData.eventData) {
    gsRef.current.campaignData.eventData = {};
  }
  const eventData = gsRef.current.campaignData.eventData;

  const activeEvents = useMemo(() => {
    if (typeof getRealTime !== 'function') return EVENT_CONFIG;
    return getActiveEvents(getRealTime);
  }, [getRealTime]);

  const handleClaim = (event, milestoneIdx, reward) => {
    const ed      = eventData[event.id] || {};
    const claimed = ed.claimedMilestones || [];
    if (claimed.includes(milestoneIdx)) return;

    if (reward.type === 'coins')           gsRef.current.coins += reward.amount;
    else if (reward.type === 'gems')       gsRef.current.diamonds += reward.amount;
    else if (reward.type === 'energy')     gsRef.current.energy += reward.amount;
    else if (reward.type === 'blueprints') gsRef.current.campaignData.materials.blueprints += reward.amount;
    else if (reward.type === 'gears')      gsRef.current.campaignData.materials.gears += reward.amount;

    eventData[event.id] = { ...ed, claimedMilestones: [...claimed, milestoneIdx] };
    saveUserProfile();
    toast.success(lang === 'vi' ? `Nhận thưởng! +${reward.amount}` : `Claimed! +${reward.amount}`);
  };

  const handleCollectDay = (event, dayIdx) => {
    const ed        = eventData[event.id] || {};
    const collected = ed.daysCollected || [];
    const todayStr  = new Date(getRealTime()).toDateString();
    const reward    = event.dailyRewards[dayIdx];
    if (!reward || collected.includes(dayIdx)) return;

    if (reward.type === 'coins')       gsRef.current.coins += reward.amount;
    else if (reward.type === 'gems')   gsRef.current.diamonds += reward.amount;
    else if (reward.type === 'energy') gsRef.current.energy += reward.amount;
    else if (reward.type === 'aircraft') {
      gsRef.current.campaignData.ownedAircrafts[reward.id] = { level: 1, stars: 1 };
      toast.success(lang === 'vi' ? `Nhận phi cơ ${reward.id}!` : `Got aircraft ${reward.id}!`, { duration: 5000 });
    }

    eventData[event.id] = { ...ed, daysCollected: [...collected, dayIdx], lastCollectDate: todayStr };
    saveUserProfile();
    if (reward.type !== 'aircraft')
      toast.success(lang === 'vi' ? `Nhận ngày ${dayIdx+1}! +${reward.amount}` : `Day ${dayIdx+1} collected!`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${styles.container} scrollable-layer`}>
      <div className={styles.contentWrapper}>

        <header className={styles.header}>
          <motion.button whileTap={{ scale: 0.95 }} className={styles.backBtn}
            onClick={() => setScreen('campaign_portal')}>
            <span>‹</span>
            <span>{lang === 'vi' ? 'CHỈ HUY' : 'COMMAND'}</span>
          </motion.button>
          <div className={styles.headerTitle}>{lang === 'vi' ? 'SỰ KIỆN' : 'EVENTS'}</div>
          <div className={styles.headerSpacer} />
        </header>

        {activeEvents.length === 0 && (
          <div className={styles.emptyState}>
            {/* SVG thay emoji 🛸 */}
            <div className={styles.emptyIcon} style={{ color: '#334155' }}>
              <Icons.Rocket />
            </div>
            <div className={styles.emptyText}>
              {lang === 'vi' ? 'Chưa có sự kiện nào đang diễn ra.' : 'No active events right now.'}
            </div>
            <div className={styles.emptyHint}>
              {lang === 'vi' ? 'Hãy quay lại sau!' : 'Check back later!'}
            </div>
          </div>
        )}

        <div className={styles.eventList}>
          {activeEvents.map((event, idx) => (
            <motion.div
              key={event.id}
              className={`${styles.eventCard} ${selectedId === event.id ? styles.expanded : ''}`}
              style={{ '--ec': event.themeColor }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
            >
              <div className={styles.cardTop} onClick={() => setSelectedId(selectedId === event.id ? null : event.id)}>
                {/* SVG banner icon thay emoji */}
                <div className={styles.cardIcon} style={{ color: event.themeColor }}>
                  <BannerIcon type={event.type} color={event.themeColor} />
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.cardTitle}>{event.title[lang]}</div>
                  <div className={styles.cardDesc}>{event.desc[lang]}</div>
                  <div className={styles.cardFooter}>
                    <span className={styles.timeLabel}>{lang === 'vi' ? 'Còn lại: ' : 'Ends in: '}</span>
                    <Countdown endTime={event.endTime} getRealTime={getRealTime} />
                  </div>
                </div>
                <div className={`${styles.chevron} ${selectedId === event.id ? styles.chevronOpen : ''}`}>›</div>
              </div>

              <AnimatePresence>
                {selectedId === event.id && (
                  <motion.div key="detail"
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className={styles.divider} style={{ background: event.themeColor }} />

                    {event.type === 'kill_rush' && (
                      <KillRushPanel event={event} eventData={eventData[event.id]} lang={lang} onClaim={handleClaim} />
                    )}
                    {event.type === 'login_bonus' && (
                      <LoginBonusPanel event={event} eventData={eventData[event.id]} lang={lang}
                        onCollectDay={handleCollectDay} getRealTime={getRealTime} />
                    )}
                    {['coin_fever','gear_hunt','dungeon_rush','boss_blitz'].includes(event.type) && (
                      <PassivePanel event={event} lang={lang} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}