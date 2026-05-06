/**
 * DungeonEngine.jsx  –  Babylon.js canvas + React HUD overlay
 * HUD thiết kế giống Campaign (hex bar, HP phân đoạn, điểm/sóng)
 *
 * FIX:
 *   - onHpChange(hp, maxHp?) đồng bộ maxHp từ Babylon sang React
 *   - TopHexBar dùng SVG thay clip-path+env() để tránh bug trình duyệt
 *   - DungeonScene.js cần gọi: cb(onHpChange, stats.hp, stats.maxHp) khi init
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { createDungeonScene } from './DungeonScene';

// ─── STRINGS ──────────────────────────────────────────────────────────────────
const STRINGS = {
  vi: {
    retreat:     '◀ RÚT LUI',
    score:       'ĐIỂM',
    wave:        'SÓNG',
    waveOf:      '/',
    armorSystem: 'HỆ THỐNG GIÁP',
    bossLabel:   'TRÙM',
    bossWarning: 'CẢNH BÁO:\nTRÙM CUỐI XUẤT HIỆN!',
    victory:     '✦ CHIẾN THẮNG ✦',
    victoryDesc: 'PHÓ BẢN HOÀN THÀNH',
    defeat:      '✦ THẤT BẠI ✦',
    defeatDesc:  'PHI THUYỀN BỊ PHÁ HỦY',
    finalScore:  'ĐIỂM SỐ CUỐI',
    retry:       '↺ THỬ LẠI',
    exit:        '⌂ THOÁT',
  },
  en: {
    retreat:     '◀ RETREAT',
    score:       'SCORE',
    wave:        'WAVE',
    waveOf:      '/',
    armorSystem: 'ARMOR SYSTEM',
    bossLabel:   'BOSS',
    bossWarning: 'WARNING:\nBOSS APPROACHING!',
    victory:     '✦ VICTORY ✦',
    victoryDesc: 'DUNGEON CLEARED',
    defeat:      '✦ DEFEATED ✦',
    defeatDesc:  'SHIP DESTROYED',
    finalScore:  'FINAL SCORE',
    retry:       '↺ RETRY',
    exit:        '⌂ EXIT',
  },
};

const T = {
  cyan:  '#00e5ff',
  red:   '#ff4757',
  gold:  '#f1c40f',
  dark:  'rgba(0,0,0,0.88)',
  panel: 'rgba(5,11,20,0.85)',
  font:  "'VT323', monospace",
};

// ─── SEGMENTED HP BAR (10 ô như Campaign) ────────────────────────────────────
function SegmentedHpBar({ hp, maxHp }) {
  const SEGS = 10;
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const filled = Math.round(ratio * SEGS);
  const color = ratio <= 0.25 ? T.red : ratio <= 0.5 ? T.gold : T.cyan;
  return (
    <div style={{ display: 'flex', gap: '2px', width: '100%', height: '100%' }}>
      {Array.from({ length: SEGS }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: '100%', borderRadius: 2,
          background: i < filled ? color : 'rgba(0,0,0,0.6)',
          boxShadow: i < filled ? `0 0 4px ${color}99` : 'none',
          transition: 'background 0.25s',
        }} />
      ))}
    </div>
  );
}

// ─── TOP HEX BAR – SVG clip đúng tọa độ, không dùng env() trong clipPath ─────
// Khớp với Campaign: hai bên cao 35px, lõm giữa 65px, notch rộng ~180px
function TopHexBar({ children, safeTopPx }) {
  const st    = safeTopPx || 0;
  const sideH = 35;   // chiều cao 2 bên
  const midH  = 65;   // chiều cao phần lõm giữa
  const totalH = midH + st;

  // Tọa độ SVG theo viewport 1000 đơn vị ngang
  const pts = [
    `0,0`,
    `1000,0`,
    `1000,${sideH + st}`,
    `590,${sideH + st}`,
    `570,${midH + st}`,
    `430,${midH + st}`,
    `410,${sideH + st}`,
    `0,${sideH + st}`,
  ].join(' ');

  const borderPts = [
    `0,${sideH + st}`,
    `410,${sideH + st}`,
    `430,${midH + st}`,
    `570,${midH + st}`,
    `590,${sideH + st}`,
    `1000,${sideH + st}`,
  ].join(' ');

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: totalH, zIndex: 110, pointerEvents: 'none' }}>
      {/* SVG nền + viền */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        viewBox={`0 0 1000 ${totalH}`}
        preserveAspectRatio="none"
      >
        <defs>
          <clipPath id="dungeonHexClip">
            <polygon points={pts} />
          </clipPath>
        </defs>
        <rect width="1000" height={totalH} fill="rgba(5,11,20,0.87)" clipPath="url(#dungeonHexClip)" />
        <polyline points={borderPts} fill="none" stroke="rgba(0,229,255,0.65)" strokeWidth="2.5" />
      </svg>
      {/* Children nội dung */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
        {children}
      </div>
    </div>
  );
}

// ─── ANNOUNCEMENT (dải ngang full-width, giống Campaign showAnnounce) ─────────
function Announcement({ text, color }) {
  if (!text) return null;
  return (
    <div style={{
      position: 'absolute', top: '33%', left: 0, right: 0,
      textAlign: 'center', pointerEvents: 'none', zIndex: 200,
      animation: 'annFade 0.3s ease',
    }}>
      <div style={{
        position: 'absolute',
        top: '-20px', left: 0, right: 0, bottom: '-20px',
        background: 'rgba(5,11,20,0.92)',
        borderTop: `2px solid ${color}88`,
        borderBottom: `2px solid ${color}88`,
      }} />
      <div style={{
        position: 'relative',
        fontFamily: T.font, fontWeight: 'bold',
        fontSize: 'clamp(22px, 6vw, 38px)',
        color, textShadow: `0 0 20px ${color}`,
        letterSpacing: '0.08em', whiteSpace: 'pre-line', lineHeight: 1.2,
      }}>
        {text}
      </div>
    </div>
  );
}

// ─── HUD OVERLAY ──────────────────────────────────────────────────────────────
function HudOverlay({ gameState, lang, onRetreat, safeTopPx }) {
  const S  = STRINGS[lang] || STRINGS.vi;
  const st = safeTopPx || 0;
  const { score, wave, maxWave, hp, maxHp, bossVisible, bossName, bossHp, bossMaxHp, announcement } = gameState;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100 }}>

      {/* ─── Thanh Hex phía trên ─── */}
      <TopHexBar safeTopPx={st}>

        {/* ĐIỂM – trái */}
        <div style={{
          position: 'absolute', top: st + 8, left: 15,
          fontFamily: T.font, fontSize: 'clamp(20px,4.5vw,26px)',
          color: T.cyan, lineHeight: 1,
        }}>
          {S.score}: {score}
        </div>

        {/* HỆ THỐNG GIÁP + HP bar – giữa (trong vùng lõm) */}
        <div style={{
          position: 'absolute',
          top: st + 38,
          left: '50%', transform: 'translateX(-50%)',
          width: 120,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        }}>
          <div style={{ fontFamily: T.font, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', lineHeight: 1 }}>
            {S.armorSystem}
          </div>
          <div style={{
            width: '100%', height: 12,
            background: 'rgba(0,0,0,0.8)',
            border: '1px solid rgba(0,229,255,0.35)',
            borderRadius: 3, padding: '2px', boxSizing: 'border-box',
          }}>
            <SegmentedHpBar hp={hp} maxHp={maxHp} />
          </div>
        </div>

        {/* SÓNG – phải */}
        <div style={{
          position: 'absolute', top: st + 8, right: 15,
          fontFamily: T.font, fontSize: 'clamp(20px,4.5vw,26px)',
          color: T.gold, lineHeight: 1, textAlign: 'right',
        }}>
          {S.wave} {wave}{S.waveOf}{maxWave}
        </div>

      </TopHexBar>

      {/* ─── Nút RÚT LUI – bên trái dưới thanh hex ─── */}
      <button
        style={{
          position: 'absolute', top: st + 44, left: 15,
          pointerEvents: 'auto',
          padding: '6px 14px',
          background: 'rgba(2,10,24,0.7)',
          color: T.cyan, border: `1px solid ${T.cyan}`,
          borderRadius: 5, fontFamily: T.font,
          fontSize: 'clamp(16px,3.5vw,22px)', cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        onClick={onRetreat}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.18)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(2,10,24,0.7)'}
      >
        {S.retreat}
      </button>

      {/* ─── Boss bar ─── */}
      {bossVisible && (
        <div style={{
          position: 'absolute', top: st + 78, left: '50%', transform: 'translateX(-50%)',
          width: 'clamp(200px,42vw,340px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          animation: 'fadeIn 0.4s ease',
        }}>
          <div style={{
            fontFamily: T.font, fontSize: 'clamp(18px,4vw,24px)',
            color: T.red, letterSpacing: '0.06em',
            textShadow: `0 0 10px ${T.red}`, whiteSpace: 'nowrap',
          }}>
            ⚠ {bossName || S.bossLabel}
          </div>
          <div style={{
            width: '100%', height: 8,
            background: 'rgba(30,0,0,0.8)',
            border: `2px solid ${T.red}`, borderRadius: 3,
            overflow: 'hidden', boxShadow: '0 0 12px rgba(255,71,87,0.4)',
          }}>
            <div style={{
              height: '100%',
              width: `${bossMaxHp > 0 ? Math.max(0, (bossHp / bossMaxHp) * 100).toFixed(1) : 0}%`,
              background: `linear-gradient(90deg,${T.red},#ff6644)`,
              borderRadius: 2, transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: '#ff8888' }}>
            {Math.max(0, bossHp).toLocaleString()} / {bossMaxHp.toLocaleString()}
          </div>
        </div>
      )}

      {/* ─── Announcement ─── */}
      {announcement && <Announcement text={announcement.text} color={announcement.color} />}
    </div>
  );
}

// ─── RESULT OVERLAY ───────────────────────────────────────────────────────────
function OverlayBtn({ color, onClick, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: '10px 28px', background: hov ? `${color}22` : 'rgba(0,0,0,0.7)',
        color, border: `2px solid ${color}`, borderRadius: 6, cursor: 'pointer',
        fontFamily: T.font, fontSize: 'clamp(18px,3vw,22px)', textTransform: 'uppercase',
        letterSpacing: '0.12em', boxShadow: hov ? `0 0 18px ${color}44` : `0 0 10px ${color}22`,
        transition: 'all 0.2s', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  );
}

function ResultOverlay({ result, score, lang, onRetry, onExit }) {
  const S = STRINGS[lang] || STRINGS.vi;
  const isVictory = result === 'victory';
  const color = isVictory ? T.cyan : T.red;
  return (
    <div style={{
      position: 'absolute', inset: 0, background: T.dark,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, fontFamily: T.font, padding: '20px clamp(16px,4vw,40px)',
      animation: 'fadeIn 0.6s ease',
    }}>
      <div style={{ fontFamily: T.font, fontWeight: 'bold', fontSize: 'clamp(28px,7vw,48px)', letterSpacing: '0.2em', marginBottom: '0.4rem', textAlign: 'center', color, textShadow: `0 0 30px ${color}` }}>
        {isVictory ? S.victory : S.defeat}
      </div>
      <div style={{ color: '#666', fontSize: 'clamp(14px,2.5vw,18px)', letterSpacing: '0.22em', marginBottom: '2rem', textAlign: 'center' }}>
        {isVictory ? S.victoryDesc : S.defeatDesc}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a2a', borderRadius: 8, padding: '1rem 3rem', marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ color: '#555', fontSize: 'clamp(12px,2vw,15px)', letterSpacing: '0.3em', marginBottom: '0.4rem' }}>{S.finalScore}</div>
        <div style={{ color: T.gold, fontFamily: "'Share Tech Mono',monospace", fontWeight: 700, fontSize: 'clamp(28px,6vw,42px)' }}>{score.toLocaleString()}</div>
      </div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <OverlayBtn color={T.cyan}   onClick={onRetry}>{S.retry}</OverlayBtn>
        <OverlayBtn color="#ff9900" onClick={onExit}>{S.exit}</OverlayBtn>
      </div>
    </div>
  );
}

// ─── INITIAL STATE ────────────────────────────────────────────────────────────
const makeInitialState = () => ({
  score: 0, wave: 1, maxWave: 5,
  hp: 1000, maxHp: 1000,   // DungeonScene sẽ overwrite ngay khi init
  bossVisible: false, bossName: '', bossHp: 0, bossMaxHp: 0,
  announcement: null,
});

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function DungeonEngine({ gsRef, setScreen, lang, saveUserProfile }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef  = useRef(null);

  const [gameResult, setGameResult] = useState(null);
  const [finalScore, setFinalScore] = useState(0);
  const [gameState, setGameState]   = useState(makeInitialState);
  const [safeTopPx, setSafeTopPx]   = useState(0);

  // Đọc safe-area-inset-top 1 lần khi mount
  useEffect(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(el);
    const v = parseFloat(getComputedStyle(el).top) || 0;
    setSafeTopPx(v);
    document.body.removeChild(el);
  }, []);

  const annTimerRef = useRef(null);
  const showAnn = useCallback((text, color = T.gold) => {
    clearTimeout(annTimerRef.current);
    setGameState(s => ({ ...s, announcement: { text, color } }));
    annTimerRef.current = setTimeout(() => setGameState(s => ({ ...s, announcement: null })), 2200);
  }, []);

  // FIX BUG HP: nhận cả maxHp từ DungeonScene
  const onHpChange     = useCallback((hp, maxHp) => setGameState(s => ({ ...s, hp: Math.max(0, hp), ...(maxHp !== undefined ? { maxHp } : {}) })), []);
  const onScoreUpdate  = useCallback((score) => setGameState(s => ({ ...s, score })), []);
  const onWaveStart    = useCallback((wave, maxWave) => {
    const S = STRINGS[lang] || STRINGS.vi;
    setGameState(s => ({ ...s, wave, maxWave }));
    const isLast = wave === maxWave;
    showAnn(isLast ? (lang === 'vi' ? 'SÓNG CUỐI CÙNG' : 'FINAL WAVE') : `${S.wave} ${wave}`, isLast ? T.red : T.gold);
  }, [lang, showAnn]);
  const onBossSpawn    = useCallback((name, bossMaxHp) => {
    const S = STRINGS[lang] || STRINGS.vi;
    setGameState(s => ({ ...s, bossVisible: true, bossName: name, bossHp: bossMaxHp, bossMaxHp }));
    showAnn(S.bossWarning, T.red);
  }, [lang, showAnn]);
  const onBossHpChange = useCallback((bossHp) => setGameState(s => ({ ...s, bossHp: Math.max(0, bossHp) })), []);
  const onBossDead     = useCallback(() => setGameState(s => ({ ...s, bossVisible: false, bossHp: 0 })), []);
  const onBossDefeated = useCallback(() => showAnn(lang === 'vi' ? '✦ BOSS ĐÃ TIÊU DIỆT ✦' : '✦ BOSS DEFEATED ✦', '#ff9900'), [lang, showAnn]);
  const onGameOver     = useCallback((score) => { setFinalScore(score); setGameResult('defeat'); }, []);
  const onVictory      = useCallback((score) => { setFinalScore(score); setGameResult('victory'); if (saveUserProfile) saveUserProfile({ lastScore: score }); }, [saveUserProfile]);

  const getCallbacks = useCallback(() => ({
    gsRef, setScreen, lang, saveUserProfile,
    onGameOver, onVictory, onScoreUpdate, onWaveStart, onHpChange,
    onBossSpawn, onBossHpChange, onBossDead, onBossDefeated,
  }), [gsRef, setScreen, lang, saveUserProfile, onGameOver, onVictory, onScoreUpdate, onWaveStart, onHpChange, onBossSpawn, onBossHpChange, onBossDead, onBossDefeated]);

  const startBabylon = useCallback(() => {
    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
    engineRef.current = engine;
    const scene = new Scene(engine);
    sceneRef.current = scene;
    createDungeonScene(scene, canvasRef.current, engine, getCallbacks());
    engine.runRenderLoop(() => { if (scene?.activeCamera) scene.render(); });
    return engine;
  }, [getCallbacks]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = startBabylon();
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(annTimerRef.current);
      window.removeEventListener('resize', onResize);
      sceneRef.current?.dispose();
      engine.dispose();
    };
  }, []); // eslint-disable-line

  const handleRetry = useCallback(() => {
    setGameResult(null); setFinalScore(0); setGameState(makeInitialState());
    sceneRef.current?.dispose(); engineRef.current?.dispose();
    startBabylon();
  }, [startBabylon]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '100dvh', backgroundColor: '#000', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap');
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes annFade { from{opacity:0;transform:scaleY(0.85)} to{opacity:1;transform:scaleY(1)} }
      `}</style>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' }} />
      {!gameResult && <HudOverlay gameState={gameState} lang={lang} onRetreat={() => setScreen('dungeon_select')} safeTopPx={safeTopPx} />}
      {gameResult && <ResultOverlay result={gameResult} score={finalScore} lang={lang} onRetry={handleRetry} onExit={() => setScreen('dungeon_select')} />}
    </div>
  );
}