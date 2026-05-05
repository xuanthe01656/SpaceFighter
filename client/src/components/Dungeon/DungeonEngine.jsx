/**
 * DungeonEngine.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Màn hình chiến đấu chính: Babylon.js canvas + React HUD overlay
 *
 * PROPS:
 *   gsRef           – useRef({ selectedDungeonId, campaignData })
 *   setScreen       – fn(screenName: string)
 *   lang            – 'vi' | 'en'
 *   saveUserProfile – fn(data)
 *
 * MỞ RỘNG SAU NÀY:
 *   - Thêm state vào GAME_STATE (skill, buff, v.v.)
 *   - Thêm HUD section mới vào <HudOverlay>
 *   - Swap placeholder icon bằng <img src={...}> khi có asset
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useEffect, useRef, useState, useCallback,
} from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { createDungeonScene } from './DungeonScene';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  cyan:       '#64ffda',
  cyanDim:    'rgba(100,255,218,0.15)',
  cyanGlow:   'rgba(100,255,218,0.25)',
  red:        '#ff4444',
  redDim:     'rgba(255,68,68,0.12)',
  gold:       '#ffd700',
  goldDim:    'rgba(255,215,0,0.10)',
  orange:     '#ff9900',
  orangeDim:  'rgba(255,153,0,0.12)',
  purple:     '#cc44ff',
  muted:      '#8899bb',
  faint:      '#4a6080',
  dark:       'rgba(0,0,0,0.88)',
  panel:      'rgba(2,10,24,0.80)',
  panelBorder:'rgba(100,255,218,0.12)',
  font:       "'Share Tech Mono', monospace",
  fontHero:   "'Orbitron', monospace",
};

// ─── LANGUAGE STRINGS ─────────────────────────────────────────────────────────
const STRINGS = {
  vi: {
    retreat:      '◀ RÚT LUI',
    score:        'ĐIỂM',
    wave:         'SÓNG',
    waveOf:       '/',
    hp:           'HP',
    atk:          'ATK',
    fireRate:     'BẮN',
    armor:        'GIÁP',
    bossWarning:  '⚠ BOSS',
    victory:      '✦ CHIẾN THẮNG ✦',
    victoryDesc:  'PHÓ BẢN HOÀN THÀNH',
    defeat:       '✦ THẤT BẠI ✦',
    defeatDesc:   'PHI THUYỀN BỊ PHÁ HỦY',
    finalScore:   'ĐIỂM SỐ CUỐI',
    retry:        '↺ THỬ LẠI',
    exit:         '⌂ THOÁT',
  },
  en: {
    retreat:      '◀ RETREAT',
    score:        'SCORE',
    wave:         'WAVE',
    waveOf:       '/',
    hp:           'HP',
    atk:          'ATK',
    fireRate:     'RATE',
    armor:        'ARMOR',
    bossWarning:  '⚠ BOSS',
    victory:      '✦ VICTORY ✦',
    victoryDesc:  'DUNGEON CLEARED',
    defeat:       '✦ DEFEATED ✦',
    defeatDesc:   'SHIP DESTROYED',
    finalScore:   'FINAL SCORE',
    retry:        '↺ RETRY',
    exit:         '⌂ EXIT',
  },
};

// ─── INLINE STYLES ────────────────────────────────────────────────────────────
const css = {
  // Root wrapper – fills whatever container mounts it
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: '100dvh',
    backgroundColor: '#000',
    overflow: 'hidden',
    fontFamily: T.font,
  },

  // Babylon canvas
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    touchAction: 'none',
    outline: 'none',
  },

  // HUD overlay sits above canvas
  hud: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',   // all children default to no interaction
    zIndex: 100,
  },

  // ── TOP-LEFT: Retreat button ──────────────────────────────────────────────
  retreat: {
    position: 'absolute',
    top: 'max(16px, env(safe-area-inset-top))',
    left: 'max(16px, env(safe-area-inset-left))',
    pointerEvents: 'auto',
    padding: 'clamp(6px,1.2vw,9px) clamp(12px,2vw,18px)',
    background: T.panel,
    color: T.cyan,
    border: `1px solid ${T.cyan}`,
    borderRadius: 6,
    fontFamily: T.font,
    fontSize: 'clamp(0.65rem,1.4vw,0.78rem)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    minWidth: 'clamp(90px,12vw,120px)',
    backdropFilter: 'blur(6px)',
    transition: 'background 0.2s, box-shadow 0.2s',
  },

  // ── TOP-CENTER: Wave counter ──────────────────────────────────────────────
  waveBlock: {
    position: 'absolute',
    top: 'max(16px, env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  waveText: {
    color: T.gold,
    fontFamily: T.font,
    fontSize: 'clamp(0.72rem,1.6vw,0.95rem)',
    letterSpacing: '0.14em',
    whiteSpace: 'nowrap',
  },
  wavePipsRow: {
    display: 'flex',
    gap: 3,
  },

  // ── TOP-CENTER: Boss bar (below wave, hidden until boss) ──────────────────
  bossBlock: {
    position: 'absolute',
    top: 'calc(max(16px, env(safe-area-inset-top)) + clamp(32px,5vw,52px))',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    width: 'clamp(220px,40vw,340px)',
    transition: 'opacity 0.4s',
  },
  bossLabel: {
    color: T.red,
    fontFamily: T.font,
    fontSize: 'clamp(0.65rem,1.4vw,0.8rem)',
    letterSpacing: '0.14em',
    textShadow: `0 0 12px ${T.red}`,
  },
  bossBarBg: {
    width: '100%',
    height: 'clamp(10px,1.4vw,16px)',
    background: '#2a0808',
    border: `1px solid ${T.red}44`,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },

  // ── TOP-RIGHT: Score ──────────────────────────────────────────────────────
  scoreBlock: {
    position: 'absolute',
    top: 'max(16px, env(safe-area-inset-top))',
    right: 'max(16px, env(safe-area-inset-right))',
    textAlign: 'right',
  },
  scoreText: {
    color: '#ffffff',
    fontFamily: T.font,
    fontSize: 'clamp(0.82rem,1.8vw,1.05rem)',
    letterSpacing: '0.06em',
  },
  scoreDelta: {
    color: T.gold,
    fontFamily: T.font,
    fontSize: 'clamp(0.6rem,1.2vw,0.72rem)',
    letterSpacing: '0.08em',
    height: 16,
    textAlign: 'right',
    transition: 'opacity 0.3s',
  },

  // ── BOTTOM-LEFT: HP bar ───────────────────────────────────────────────────
  hpBlock: {
    position: 'absolute',
    bottom: 'max(20px, env(safe-area-inset-bottom))',
    left: 'max(16px, env(safe-area-inset-left))',
    width: 'clamp(160px,28vw,240px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  hpLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  hpLabel: {
    color: T.cyan,
    fontSize: 'clamp(0.6rem,1.2vw,0.72rem)',
    letterSpacing: '0.15em',
  },
  hpValue: {
    color: T.muted,
    fontSize: 'clamp(0.55rem,1vw,0.65rem)',
  },
  hpBarBg: {
    width: '100%',
    height: 'clamp(10px,1.4vw,14px)',
    background: '#0a1020',
    border: `1px solid ${T.cyan}33`,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  hpMeta: {
    color: T.faint,
    fontSize: 'clamp(0.52rem,0.9vw,0.62rem)',
    letterSpacing: '0.1em',
    textAlign: 'right',
  },

  // ── BOTTOM-RIGHT: Ship stats ──────────────────────────────────────────────
  statsBlock: {
    position: 'absolute',
    bottom: 'max(20px, env(safe-area-inset-bottom))',
    right: 'max(16px, env(safe-area-inset-right))',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'flex-end',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    color: T.faint,
    fontSize: 'clamp(0.52rem,0.9vw,0.62rem)',
    letterSpacing: '0.14em',
  },
  statVal: {
    color: T.cyan,
    fontFamily: T.fontHero,
    fontSize: 'clamp(0.7rem,1.4vw,0.82rem)',
    fontWeight: 700,
  },

  // ── CENTER: Announcement text (mirrors Babylon GUI fontSize:52) ───────────
  announcement: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    fontFamily: T.fontHero,
    fontWeight: 900,
    fontSize: 'clamp(1.5rem,5vw,3rem)',
    letterSpacing: '0.2em',
    pointerEvents: 'none',
    userSelect: 'none',
  },

  // ── RESULT OVERLAY (DungeonEngine.jsx original) ───────────────────────────
  overlay: {
    position: 'absolute',
    inset: 0,
    background: T.dark,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    fontFamily: T.font,
    padding: '20px clamp(16px,4vw,40px)',
    animation: 'fadeIn 0.6s ease',
  },
  overlayTitle: {
    fontFamily: T.fontHero,
    fontWeight: 900,
    fontSize: 'clamp(1.8rem,6vw,3.5rem)',
    letterSpacing: '0.2em',
    marginBottom: '0.4rem',
    textAlign: 'center',
  },
  overlaySub: {
    color: '#666',
    fontSize: 'clamp(0.7rem,1.6vw,0.85rem)',
    letterSpacing: '0.22em',
    marginBottom: 'clamp(1.2rem,3vw,2rem)',
    textAlign: 'center',
  },
  scoreBox: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: 'clamp(0.8rem,2vw,1.2rem) clamp(1.5rem,4vw,3rem)',
    marginBottom: 'clamp(1.5rem,3vw,2.5rem)',
    textAlign: 'center',
  },
  scoreBoxLabel: {
    color: '#555',
    fontSize: 'clamp(0.62rem,1.2vw,0.75rem)',
    letterSpacing: '0.3em',
    marginBottom: '0.4rem',
  },
  scoreBoxNum: {
    color: T.gold,
    fontFamily: T.fontHero,
    fontWeight: 700,
    fontSize: 'clamp(1.6rem,5vw,2.4rem)',
    letterSpacing: '0.05em',
  },
  btnRow: {
    display: 'flex',
    gap: 'clamp(0.6rem,1.5vw,1rem)',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
};

// ─── WAVE PIPS ────────────────────────────────────────────────────────────────
function WavePip({ state }) {
  // state: 'done' | 'current' | 'pending'
  const base = {
    width: 'clamp(18px,3vw,26px)',
    height: 4,
    borderRadius: 2,
    transition: 'all 0.4s',
  };
  if (state === 'done')    return <div style={{ ...base, background: T.gold, opacity: 0.6 }} />;
  if (state === 'current') return <div style={{ ...base, background: T.gold, boxShadow: `0 0 6px ${T.gold}` }} />;
  return <div style={{ ...base, background: 'rgba(255,215,0,0.15)' }} />;
}

// ─── HP BAR ───────────────────────────────────────────────────────────────────
function HpBarFill({ pct }) {
  let bg, glow;
  if (pct > 0.6)      { bg = T.cyan;   glow = T.cyan; }
  else if (pct > 0.3) { bg = '#ffaa00'; glow = '#ffaa00'; }
  else                { bg = T.red;    glow = T.red; }

  return (
    <div
      style={{
        height: '100%',
        width: `${(pct * 100).toFixed(1)}%`,
        background: bg,
        borderRadius: 4,
        transition: 'width 0.25s, background 0.35s',
        boxShadow: pct <= 0.3 ? `0 0 8px ${glow}88` : 'none',
        animation: pct <= 0.3 ? 'hpPulse 0.5s ease-in-out infinite alternate' : 'none',
      }}
    />
  );
}

// ─── BOSS BAR FILL ────────────────────────────────────────────────────────────
function BossBarFill({ pct }) {
  return (
    <div
      style={{
        height: '100%',
        width: `${(pct * 100).toFixed(1)}%`,
        background: `linear-gradient(90deg, ${T.red}, #ff6644)`,
        borderRadius: 4,
        transition: 'width 0.3s',
      }}
    />
  );
}

// ─── OVERLAY BUTTON ───────────────────────────────────────────────────────────
function OverlayBtn({ color, onClick, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: 'clamp(9px,1.8vw,12px) clamp(20px,4vw,32px)',
        background: hov ? `${color}22` : 'rgba(0,0,0,0.7)',
        color,
        border: `2px solid ${color}`,
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: T.font,
        fontSize: 'clamp(0.78rem,1.6vw,1rem)',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        boxShadow: hov ? `0 0 18px ${color}44` : `0 0 10px ${color}22`,
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ─── ANNOUNCEMENT ─────────────────────────────────────────────────────────────
function Announcement({ text, color }) {
  // text=null → hidden
  if (!text) return null;
  return (
    <div style={{
      ...css.announcement,
      color,
      textShadow: `0 0 40px ${color}`,
      animation: 'annPop 0.45s cubic-bezier(0.2,1,0.3,1) forwards',
    }}>
      {text}
    </div>
  );
}

// ─── HUD OVERLAY ──────────────────────────────────────────────────────────────
/**
 * Pure-React HUD sits above the Babylon canvas.
 * All values come from gameState so this component is
 * easy to extend: just add fields to gameState.
 */
function HudOverlay({ gameState, lang, onRetreat }) {
  const S = STRINGS[lang] || STRINGS.vi;
  const {
    score, wave, maxWave,
    hp, maxHp, atk, armor, fireRateMs,
    bossVisible, bossName, bossHp, bossMaxHp,
    announcement,
    shipName,
  } = gameState;

  const hpPct   = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
  const bossPct  = bossMaxHp > 0 ? Math.max(0, bossHp / bossMaxHp) : 0;

  return (
    <div style={css.hud}>
      {/* ── Retreat (top-left) ──────────────────────── */}
      <button
        style={css.retreat}
        onClick={onRetreat}
        onMouseEnter={e => e.currentTarget.style.background = T.cyanDim}
        onMouseLeave={e => e.currentTarget.style.background = T.panel}
      >
        {S.retreat}
      </button>

      {/* ── Wave counter (top-center) ───────────────── */}
      <div style={css.waveBlock}>
        <div style={css.waveText}>
          {S.wave}&nbsp;{wave}{S.waveOf}{maxWave}
        </div>
        <div style={css.wavePipsRow}>
          {Array.from({ length: maxWave }, (_, i) => {
            const state = i < wave - 1 ? 'done' : i === wave - 1 ? 'current' : 'pending';
            return <WavePip key={i} state={state} />;
          })}
        </div>
      </div>

      {/* ── Boss bar (top-center, below wave) ───────── */}
      <div style={{ ...css.bossBlock, opacity: bossVisible ? 1 : 0, pointerEvents: 'none' }}>
        <div style={css.bossLabel}>
          {S.bossWarning} {bossName ? `· ${bossName}` : ''}
        </div>
        <div style={css.bossBarBg}>
          <BossBarFill pct={bossPct} />
        </div>
        <div style={{ color: '#ff8888', fontSize: 'clamp(0.55rem,1vw,0.65rem)', letterSpacing: '0.08em', marginTop: 2 }}>
          {Math.max(0, bossHp).toLocaleString()} / {bossMaxHp.toLocaleString()}
        </div>
      </div>

      {/* ── Score (top-right) ───────────────────────── */}
      <div style={css.scoreBlock}>
        <div style={css.scoreText}>
          {S.score}: {score.toLocaleString()}
        </div>
      </div>

      {/* ── HP bar (bottom-left) ────────────────────── */}
      <div style={css.hpBlock}>
        <div style={css.hpLabelRow}>
          <span style={css.hpLabel}>{S.hp}</span>
          <span style={css.hpValue}>{Math.max(0, hp)} / {maxHp}</span>
        </div>
        <div style={css.hpBarBg}>
          <HpBarFill pct={hpPct} />
        </div>
        <div style={css.hpMeta}>
          {S.armor}: {armor} · {S.fireRate}: {fireRateMs}ms
        </div>
      </div>

      {/* ── Ship stats (bottom-right) ───────────────── */}
      <div style={css.statsBlock}>
        {shipName && (
          <div style={{ color: T.faint, fontSize: 'clamp(0.52rem,0.9vw,0.62rem)', letterSpacing: '0.12em' }}>
            {shipName}
          </div>
        )}
        <div style={css.statRow}>
          <span style={css.statLabel}>{S.atk}</span>
          <span style={css.statVal}>{atk}</span>
        </div>
      </div>

      {/* ── Center announcement ─────────────────────── */}
      {announcement && (
        <Announcement text={announcement.text} color={announcement.color} />
      )}
    </div>
  );
}

// ─── RESULT OVERLAY ───────────────────────────────────────────────────────────
function ResultOverlay({ result, score, lang, onRetry, onExit }) {
  const S = STRINGS[lang] || STRINGS.vi;
  const isVictory = result === 'victory';
  const color = isVictory ? T.cyan : T.red;
  const title = isVictory ? S.victory : S.defeat;
  const desc  = isVictory ? S.victoryDesc : S.defeatDesc;

  return (
    <div style={css.overlay}>
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes annPop  { from { transform: translate(-50%,-50%) scale(0.6); opacity: 0 }
                             to   { transform: translate(-50%,-50%) scale(1);   opacity: 1 } }
        @keyframes hpPulse { from { opacity: 0.65 } to { opacity: 1 } }
      `}</style>

      <div style={{ ...css.overlayTitle, color, textShadow: `0 0 30px ${color}` }}>
        {title}
      </div>
      <div style={css.overlaySub}>{desc}</div>

      <div style={css.scoreBox}>
        <div style={css.scoreBoxLabel}>{S.finalScore}</div>
        <div style={css.scoreBoxNum}>{score.toLocaleString()}</div>
      </div>

      <div style={css.btnRow}>
        <OverlayBtn color={T.cyan}   onClick={onRetry}>{S.retry}</OverlayBtn>
        <OverlayBtn color={T.orange} onClick={onExit}>{S.exit}</OverlayBtn>
      </div>
    </div>
  );
}

// ─── INITIAL GAME STATE ───────────────────────────────────────────────────────
/**
 * Tất cả dữ liệu HUD được gom vào một object.
 * DungeonScene.js cập nhật state này qua callbacks.
 * Để thêm HUD mới: thêm field vào đây + cập nhật HudOverlay.
 */
const makeInitialState = (aircraftBase, pilotBase, mainGunBase, armorBase) => {
  const baseHp  = aircraftBase?.baseHp  ?? 1000;
  const baseAtk = aircraftBase?.baseAtk ?? 10;
  const extraHp = armorBase   ? (armorBase.baseHp ?? 0) : 0;
  const gunAtk  = mainGunBase ? (mainGunBase.baseAtk ?? 0) : 0;
  const atkMult = pilotBase?.passive === 'main_damage_boost'
    ? 1 + (pilotBase.value ?? 0) : 1;

  return {
    // Score
    score: 0,
    // Wave
    wave: 1,
    maxWave: 5,
    // HP
    hp:    Math.floor(baseHp + extraHp),
    maxHp: Math.floor(baseHp + extraHp),
    // Combat stats
    atk:        Math.floor((baseAtk + gunAtk) * atkMult),
    armor:      aircraftBase?.baseArmor ?? 0,
    fireRateMs: mainGunBase?.fireRate ? Math.round(mainGunBase.fireRate * 1000) : 400,
    // Boss
    bossVisible: false,
    bossName:    '',
    bossHp:      0,
    bossMaxHp:   0,
    // Ship display name
    shipName: aircraftBase?.name?.vi ?? aircraftBase?.name?.en ?? '',
    // Announcement (set transiently, cleared by timer)
    announcement: null,
  };
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function DungeonEngine({ gsRef, setScreen, lang, saveUserProfile }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef  = useRef(null);

  // ── Result state (managed by React, triggered from Babylon) ─────────────
  const [gameResult, setGameResult] = useState(null);   // null | 'victory' | 'defeat'
  const [finalScore, setFinalScore] = useState(0);

  // ── HUD state (reactive mirror of BabylonScene internals) ───────────────
  const [gameState, setGameState] = useState(() => {
    try {
      const { items, loadout } = gsRef.current.campaignData;
      // Dynamic import not possible here; resolve synchronously from gsRef
      // Replace these with your actual AIRCRAFTS / PILOTS / GEAR_CATALOG lookups
      const aircraftBase = gsRef.current._aircraftBase ?? null;
      const pilotBase    = gsRef.current._pilotBase    ?? null;
      const mainGunBase  = gsRef.current._mainGunBase  ?? null;
      const armorBase    = gsRef.current._armorBase    ?? null;
      return makeInitialState(aircraftBase, pilotBase, mainGunBase, armorBase);
    } catch {
      return makeInitialState(null, null, null, null);
    }
  });

  // ── Announcement helper (auto-clear after 2 s) ──────────────────────────
  const annTimerRef = useRef(null);
  const showAnnouncement = useCallback((text, color = T.gold) => {
    clearTimeout(annTimerRef.current);
    setGameState(s => ({ ...s, announcement: { text, color } }));
    annTimerRef.current = setTimeout(
      () => setGameState(s => ({ ...s, announcement: null })),
      2000,
    );
  }, []);

  // ── Callbacks for DungeonScene.js ───────────────────────────────────────
  const onScoreUpdate = useCallback((score) => {
    setGameState(s => ({ ...s, score }));
  }, []);

  const onWaveStart = useCallback((wave, maxWave, L) => {
    const isLast = wave === maxWave;
    setGameState(s => ({ ...s, wave, maxWave }));
    showAnnouncement(
      isLast
        ? (lang === 'vi' ? '⚠ SÓNG CUỐI CÙNG ⚠' : '⚠ FINAL WAVE ⚠')
        : `${lang === 'vi' ? 'SÓNG' : 'WAVE'} ${wave}`,
      isLast ? T.red : T.gold,
    );
  }, [lang, showAnnouncement]);

  const onHpChange = useCallback((hp) => {
    setGameState(s => ({ ...s, hp: Math.max(0, hp) }));
  }, []);

  const onBossSpawn = useCallback((name, bossMaxHp) => {
    setGameState(s => ({
      ...s,
      bossVisible: true,
      bossName: name,
      bossHp: bossMaxHp,
      bossMaxHp,
    }));
    showAnnouncement('⚠ BOSS ⚠', T.red);
  }, [showAnnouncement]);

  const onBossHpChange = useCallback((bossHp) => {
    setGameState(s => ({ ...s, bossHp: Math.max(0, bossHp) }));
  }, []);

  const onBossDead = useCallback(() => {
    setGameState(s => ({ ...s, bossVisible: false, bossHp: 0 }));
  }, []);

  const onBossDefeated = useCallback(() => {
    showAnnouncement(
      lang === 'vi' ? '✦ BOSS ĐÃ BỊ TIÊU DIỆT ✦' : '✦ BOSS DEFEATED ✦',
      '#ff9900',
    );
  }, [lang, showAnnouncement]);

  const onGameOver = useCallback((score) => {
    setFinalScore(score);
    setGameResult('defeat');
  }, []);

  const onVictory = useCallback((score) => {
    setFinalScore(score);
    setGameResult('victory');
    if (saveUserProfile) saveUserProfile({ lastScore: score });
  }, [saveUserProfile]);

  // ── Babylon bootstrap ───────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    // clearColor được set trong DungeonScene theo dungeonConfig.themeColor
    sceneRef.current = scene;

    createDungeonScene(scene, canvasRef.current, engine, {
      gsRef,
      setScreen,
      lang,
      saveUserProfile,
      onGameOver,
      onVictory,
      onScoreUpdate,
      onWaveStart,
      onHpChange,
      onBossSpawn,
      onBossHpChange,
      onBossDead,
      onBossDefeated,
    });

    engine.runRenderLoop(() => {
      if (scene?.activeCamera) scene.render();
    });

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(annTimerRef.current);
      window.removeEventListener('resize', onResize);
      scene.dispose();
      engine.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Retry: reload scene without full page reload ────────────────────────
  const handleRetry = useCallback(() => {
    setGameResult(null);
    setFinalScore(0);
    // Re-dispose & re-init Babylon
    sceneRef.current?.dispose();
    engineRef.current?.dispose();

    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;
    const scene = new Scene(engine);
    // clearColor được set trong DungeonScene theo dungeonConfig.themeColor
    sceneRef.current = scene;

    createDungeonScene(scene, canvasRef.current, engine, {
      gsRef, setScreen, lang, saveUserProfile,
      onGameOver, onVictory,
      onScoreUpdate, onWaveStart, onHpChange,
      onBossSpawn, onBossHpChange, onBossDead, onBossDefeated,
    });
    engine.runRenderLoop(() => {
      if (scene?.activeCamera) scene.render();
    });
  }, [
    gsRef, setScreen, lang, saveUserProfile,
    onGameOver, onVictory, onScoreUpdate, onWaveStart,
    onHpChange, onBossSpawn, onBossHpChange, onBossDead, onBossDefeated,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={css.root}>
      {/* Global keyframe injection (once) */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap');
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes annPop  {
          from { transform: translate(-50%,-50%) scale(0.6); opacity: 0 }
          to   { transform: translate(-50%,-50%) scale(1);   opacity: 1 }
        }
        @keyframes hpPulse { from { opacity: 0.65 } to { opacity: 1 } }
      `}</style>

      {/* ── Babylon canvas ── */}
      <canvas ref={canvasRef} style={css.canvas} />

      {/* ── React HUD overlay (always mounted, no layout cost) ── */}
      {!gameResult && (
        <HudOverlay
          gameState={gameState}
          lang={lang}
          onRetreat={() => setScreen('dungeon_select')}
        />
      )}

      {/* ── Game result overlay ── */}
      {gameResult && (
        <ResultOverlay
          result={gameResult}
          score={finalScore}
          lang={lang}
          onRetry={handleRetry}
          onExit={() => setScreen('dungeon_select')}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO WIRE onWaveStart / onHpChange / onBossSpawn into DungeonScene.js
// ─────────────────────────────────────────────────────────────────────────────
//
// In createDungeonScene, destructure the new callbacks from `data`:
//   const { onGameOver, onVictory,
//           onScoreUpdate, onWaveStart, onHpChange,
//           onBossSpawn, onBossHpChange, onBossDead } = data;
//
// Then call them at the right moments:
//
//   updateScore(delta) → onScoreUpdate?.(score)
//   startWave(n)       → onWaveStart?.(n, MAX_WAVES, lang)
//   damagePlayer(dmg)  → onHpChange?.(stats.hp)
//   spawnBoss()        → onBossSpawn?.(bossName, bossMaxHp)
//   boss hit           → onBossHpChange?.(bossHp)
//   boss dead          → onBossDead?.()
// ─────────────────────────────────────────────────────────────────────────────