/**
 * DungeonResult — Màn hình tổng kết sau khi hoàn thành / thua phó bản
 *
 * Nhận dữ liệu từ gsRef.current.dungeonResult (được DungeonEngine ghi trước khi setScreen):
 *  {
 *    isVictory    : boolean,
 *    dungeon      : DungeonConfig,
 *    score        : number,
 *    totalKills   : number,
 *    wavesCleared : number,
 *    maxWaves     : number,
 *    earnedRewards: [{ type, amount }],
 *  }
 *
 * Khi nhấn "NHẬN THƯỞNG":
 *  1. Cộng phần thưởng vào gsRef (coins / diamonds / gears / blueprints)
 *  2. Gọi saveUserProfile() → ghi lên Firestore
 *  3. setScreen('dungeon_select')
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// ── Icon helpers ──────────────────────────────────────────────────────────────
const RewardIcon = ({ type, size = 28 }) => {
  const icons = {
    coins      : '🪙',
    gems       : '💎',
    diamonds   : '💎',
    gears      : '⚙️',
    blueprints : '📘',
    energy     : '⚡',
  };
  return (
    <span style={{ fontSize: size, lineHeight: 1 }}>
      {icons[type] || '🎁'}
    </span>
  );
};

const rewardColor = (type) => ({
  coins      : '#fb923c',
  gems       : '#c084fc',
  diamonds   : '#c084fc',
  gears      : '#facc15',
  blueprints : '#60a5fa',
  energy     : '#4ade80',
})[type] || '#e2e8f0';

const rewardLabel = (type, lang) => {
  const labels = {
    vi: { coins: 'Xu', gems: 'Kim Cương', diamonds: 'Kim Cương', gears: 'Phụ Tùng', blueprints: 'Bản Vẽ', energy: 'Năng Lượng' },
    en: { coins: 'Coins', gems: 'Gems', diamonds: 'Diamonds', gears: 'Gears', blueprints: 'Blueprints', energy: 'Energy' },
  };
  return (labels[lang] || labels.en)[type] || type;
};

const formatAmount = (type, amount) => {
  if (type === 'coins' && amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return String(amount);
};

// ── Main component ────────────────────────────────────────────────────────────
export default function DungeonResult({ gsRef, setScreen, lang, saveUserProfile }) {
  const result = gsRef.current?.dungeonResult;
  const claimed = useRef(false);
  const [saving, setSaving] = useState(false);
  const [showRewards, setShowRewards] = useState(false);

  // Fallback an toàn nếu không có data
  if (!result) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#010a18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => setScreen('dungeon_select')} style={{ color: '#00e5ff', background: 'transparent', border: '1px solid #00e5ff', padding: '12px 28px', cursor: 'pointer', fontSize: 16 }}>
          {lang === 'vi' ? 'QUAY LẠI' : 'BACK'}
        </button>
      </div>
    );
  }

  const { isVictory, dungeon, score, totalKills, wavesCleared, maxWaves, earnedRewards } = result;
  const themeColor = dungeon?.themeColor || (isVictory ? '#4ade80' : '#ef4444');

  // Animate rewards in after 0.8s
  useEffect(() => {
    const t = setTimeout(() => setShowRewards(true), 800);
    return () => clearTimeout(t);
  }, []);

  // ── Apply rewards to gsRef & save to Firestore ────────────────────────────
  const handleClaim = async () => {
    if (claimed.current || saving) return;
    claimed.current = true;
    setSaving(true);

    try {
      earnedRewards.forEach(({ type, amount }) => {
        switch (type) {
          case 'coins':
            gsRef.current.coins = (gsRef.current.coins || 0) + amount;
            break;
          case 'gems':
          case 'diamonds':
            gsRef.current.diamonds = (gsRef.current.diamonds || 0) + amount;
            break;
          case 'gears':
            if (!gsRef.current.campaignData.materials) gsRef.current.campaignData.materials = {};
            gsRef.current.campaignData.materials.gears =
              (gsRef.current.campaignData.materials.gears || 0) + amount;
            break;
          case 'blueprints':
            if (!gsRef.current.campaignData.materials) gsRef.current.campaignData.materials = {};
            gsRef.current.campaignData.materials.blueprints =
              (gsRef.current.campaignData.materials.blueprints || 0) + amount;
            break;
          case 'energy':
            gsRef.current.energy = Math.min(
              (gsRef.current.energy || 0) + amount, 999
            );
            break;
          default:
            break;
        }
      });

      // Ghi lịch sử dungeon (tuỳ chọn — lưu lần chơi cuối)
      if (!gsRef.current.campaignData.dungeonHistory) {
        gsRef.current.campaignData.dungeonHistory = {};
      }
      gsRef.current.campaignData.dungeonHistory[dungeon.id] = {
        lastScore      : score,
        lastKills      : totalKills,
        lastWaves      : wavesCleared,
        lastResult     : isVictory ? 'victory' : 'defeat',
        lastPlayedAt   : Date.now(),
      };

      // Lưu lên Firestore
      if (saveUserProfile) {
        await saveUserProfile();
      }

      toast.success(lang === 'vi' ? '✅ Đã nhận thưởng và lưu!' : '✅ Rewards claimed & saved!');
    } catch (err) {
      console.error('DungeonResult save error:', err);
      toast.error(lang === 'vi' ? '❌ Lỗi lưu dữ liệu!' : '❌ Save failed!');
      claimed.current = false;
    } finally {
      setSaving(false);
      gsRef.current.dungeonResult = null; // Clear after claim
      setScreen('dungeon_select');
    }
  };

  // ── "Back without claim" (defeat or skip) ────────────────────────────────
  const handleSkip = () => {
    gsRef.current.dungeonResult = null;
    setScreen('dungeon_select');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const font = '"Share Tech Mono", "Barlow Condensed", monospace, sans-serif';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: font,
        background: `
          radial-gradient(ellipse at 50% 0%,
            ${themeColor}18 0%,
            #010a18 55%
          )
        `,
        padding: 'max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}
    >
      {/* Scan-line overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: -1,
        background: 'linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.08) 50%)',
        backgroundSize: '100% 4px',
      }} />

      {/* ── TITLE ── */}
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', damping: 18 }}
        style={{ textAlign: 'center', marginBottom: 20 }}
      >
        {/* Dungeon name */}
        <p style={{ color: themeColor, fontSize: 13, letterSpacing: '0.35em', margin: '0 0 4px', opacity: 0.8 }}>
          {dungeon?.title?.[lang] || dungeon?.title?.vi || 'DUNGEON'}
        </p>

        {/* Victory / Defeat */}
        <h1 style={{
          margin: 0,
          fontSize: 'clamp(36px, 8vw, 56px)',
          fontWeight: 900,
          letterSpacing: '0.12em',
          color: isVictory ? '#4ade80' : '#ef4444',
          textShadow: `0 0 40px ${isVictory ? '#4ade80' : '#ef4444'}88`,
        }}>
          {isVictory
            ? (lang === 'vi' ? '✦ HOÀN THÀNH ✦' : '✦ VICTORY ✦')
            : (lang === 'vi' ? '✕ THẤT BẠI ✕' : '✕ DEFEATED ✕')}
        </h1>
      </motion.div>

      {/* ── STAT CARDS ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          width: '100%', maxWidth: 480,
          marginBottom: 24,
        }}
      >
        {[
          { label: lang === 'vi' ? 'ĐIỂM SỐ' : 'SCORE',  value: score.toLocaleString(), color: '#facc15' },
          { label: lang === 'vi' ? 'TIÊU DIỆT' : 'KILLS', value: totalKills,             color: '#f87171' },
          { label: lang === 'vi' ? 'ĐỢT HOÀN' : 'WAVES', value: `${wavesCleared}/${maxWaves}`, color: '#60a5fa' },
        ].map((stat, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid rgba(255,255,255,0.08)`,
            borderTop: `2px solid ${stat.color}55`,
            borderRadius: 10,
            padding: '14px 8px',
            textAlign: 'center',
          }}>
            <div style={{ color: '#64748b', fontSize: 10, letterSpacing: '0.18em', marginBottom: 6 }}>
              {stat.label}
            </div>
            <div style={{ color: stat.color, fontSize: 22, fontWeight: 800 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── REWARD SECTION ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        style={{ width: '100%', maxWidth: 480, marginBottom: 28 }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ color: '#94a3b8', fontSize: 11, letterSpacing: '0.22em' }}>
            {isVictory
              ? (lang === 'vi' ? 'PHẦN THƯỞNG NHẬN ĐƯỢC' : 'REWARDS EARNED')
              : (lang === 'vi' ? 'KHÔNG CÓ PHẦN THƯỞNG' : 'NO REWARDS')}
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {isVictory && earnedRewards.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AnimatePresence>
              {showRewards && earnedRewards.map((rw, i) => (
                <motion.div
                  key={`${rw.type}_${i}`}
                  initial={{ opacity: 0, x: -24, scale: 0.92 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ delay: i * 0.18, type: 'spring', damping: 16 }}
                  style={{
                    display: 'flex', alignItems: 'center',
                    background: `rgba(255,255,255,0.045)`,
                    border: `1px solid ${rewardColor(rw.type)}30`,
                    borderLeft: `4px solid ${rewardColor(rw.type)}`,
                    borderRadius: '0 10px 10px 0',
                    padding: '14px 18px',
                    gap: 16,
                  }}
                >
                  {/* Shimmer glow */}
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.4 }}
                    style={{
                      position: 'absolute', width: 90, height: '100%',
                      background: `linear-gradient(90deg, transparent, ${rewardColor(rw.type)}10, transparent)`,
                      pointerEvents: 'none',
                    }}
                  />
                  <RewardIcon type={rw.type} size={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#94a3b8', fontSize: 11, letterSpacing: '0.15em', marginBottom: 2 }}>
                      {rewardLabel(rw.type, lang).toUpperCase()}
                    </div>
                    <div style={{ color: rewardColor(rw.type), fontSize: 24, fontWeight: 900 }}>
                      + {formatAmount(rw.type, rw.amount)}
                    </div>
                  </div>

                  {/* Animated check */}
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.18 + 0.3, type: 'spring', damping: 10 }}
                    style={{ fontSize: 22 }}
                  >
                    ✦
                  </motion.span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : !isVictory ? (
          <div style={{
            padding: '18px 20px',
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.18)',
            borderRadius: 10,
            color: '#94a3b8',
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            {lang === 'vi'
              ? 'Chiến dịch thất bại. Không nhận được phần thưởng.\nHãy thử lại và chiến thắng!'
              : 'Mission failed. No rewards granted.\nTry again and claim victory!'}
          </div>
        ) : null}
      </motion.div>

      {/* ── BUTTONS ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 480 }}
      >
        {isVictory && earnedRewards.length > 0 ? (
          // Victory: primary CLAIM button
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleClaim}
            disabled={saving}
            style={{
              position: 'relative',
              overflow: 'hidden',
              padding: '18px 28px',
              border: 'none',
              borderRadius: 12,
              background: saving
                ? 'rgba(74,222,128,0.3)'
                : `linear-gradient(135deg, ${themeColor}dd, ${themeColor}88)`,
              color: '#000',
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: '0.15em',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: font,
              boxShadow: `0 0 30px ${themeColor}55`,
              transition: 'all 0.2s',
            }}
          >
            {/* Shimmer */}
            {!saving && (
              <motion.div
                animate={{ x: ['-120%', '220%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 0.8 }}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '40%', height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
                  pointerEvents: 'none',
                }}
              />
            )}
            {saving
              ? (lang === 'vi' ? '⏳ ĐANG LƯU...' : '⏳ SAVING...')
              : (lang === 'vi' ? '🏆 NHẬN THƯỞNG & LƯU' : '🏆 CLAIM & SAVE')}
          </motion.button>
        ) : (
          // Defeat: skip button (no rewards to claim)
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSkip}
            style={{
              padding: '18px 28px',
              border: '2px solid rgba(239,68,68,0.55)',
              borderRadius: 12,
              background: 'rgba(239,68,68,0.08)',
              color: '#ef4444',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.15em',
              cursor: 'pointer',
              fontFamily: font,
            }}
          >
            {lang === 'vi' ? '↺ THỬ LẠI' : '↺ TRY AGAIN'}
          </motion.button>
        )}

        {/* Secondary: back button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSkip}
          style={{
            padding: '13px 20px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            background: 'transparent',
            color: '#64748b',
            fontSize: 14,
            letterSpacing: '0.12em',
            cursor: 'pointer',
            fontFamily: font,
          }}
        >
          {isVictory
            ? (lang === 'vi' ? '✕ BỎ QUA (KHÔNG LƯU)' : '✕ SKIP (DON\'T SAVE)')
            : (lang === 'vi' ? '◀ VỀ DANH SÁCH PHÓ BẢN' : '◀ BACK TO DUNGEONS')}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}