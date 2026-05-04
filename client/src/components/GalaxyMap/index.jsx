import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Phaser from 'phaser';
import GalaxyMapScene from './GalaxyMapScene';
import { PLANET_CONFIG } from '../../constants';

// ─── Fallback data ────────────────────────────────────────────────────────────
const SAFE_PLANETS = (PLANET_CONFIG && Object.keys(PLANET_CONFIG).length > 0)
  ? PLANET_CONFIG
  : {
      1: { id: 1, name: { vi: 'Trạm Tiền Tiêu Alpha', en: 'Outpost Alpha'   }, envDesc: { vi: 'Môi trường bình thường', en: 'Standard environment' }, color: '#2ecc71', icon: '🪐' },
      2: { id: 2, name: { vi: 'Tinh Vân Băng Giá',    en: 'Cryo-7 Nebula'  }, envDesc: { vi: 'Tốc độ giảm 20%',        en: 'Speed −20%'           }, color: '#38bdf8', icon: '☄️' },
      3: { id: 3, name: { vi: 'Hỏa Ngục Prime',       en: 'Inferno Prime'  }, envDesc: { vi: 'HP quái x2',             en: 'Enemy HP ×2'          }, color: '#ff4757', icon: '🔥' },
    };

// ─── Palette helpers ──────────────────────────────────────────────────────────
const hexToRgb = (hex = '#4488ff') => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Scanline + CRT vignette overlay */
const CRTOverlay = () => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6,
    background: `
      radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%),
      linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.12) 50%)
    `,
    backgroundSize: '100% 100%, 100% 3px',
  }}/>
);

/** Animated corner bracket decoration */
const CornerBracket = ({ pos = 'tl', color = '#00e5ff' }) => {
  const styles = {
    tl: { top: 0,    left: 0,    borderTop: `2px solid ${color}`, borderLeft:  `2px solid ${color}` },
    tr: { top: 0,    right: 0,   borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` },
    bl: { bottom: 0, left: 0,    borderBottom: `2px solid ${color}`, borderLeft:  `2px solid ${color}` },
    br: { bottom: 0, right: 0,   borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` },
  };
  return (
    <div style={{
      position: 'absolute', width: 16, height: 16, ...styles[pos], opacity: 0.7,
    }}/>
  );
};

/** Tiny blinking status dot */
const StatusDot = ({ active = true }) => (
  <motion.span
    animate={{ opacity: [1, 0.2, 1] }}
    transition={{ duration: 1.4, repeat: Infinity }}
    style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: active ? '#22d3ee' : '#ef4444',
      boxShadow: active ? '0 0 6px #22d3ee' : '0 0 6px #ef4444',
      marginRight: 7, flexShrink: 0,
    }}
  />
);

/** Progress bar with neon glow */
const NeonBar = ({ value = 0, max = 30, color = '#facc15', height = 8 }) => {
  const pct = Math.min(value / max, 1) * 100;
  return (
    <div style={{ width: '100%', height, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{
          height: '100%',
          background: `linear-gradient(90deg, ${color}aa, ${color})`,
          boxShadow: `0 0 14px ${color}88`,
          borderRadius: 4,
          position: 'relative',
        }}
      />
    </div>
  );
};

/** Data row inside info panel */
const DataRow = ({ label, value, color = '#94a3b8', mono = true }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
    <span style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    <span style={{ color, fontSize: 14, fontFamily: mono ? '"Share Tech Mono", monospace' : 'inherit', fontWeight: 600 }}>{value}</span>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GalaxyMap({ gsRef, setScreen, lang }) {
  const containerRef   = useRef(null);
  const gameRef        = useRef(null);
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [isMobile, setIsMobile]             = useState(window.innerWidth <= 768);
  const [hudTime, setHudTime]               = useState(new Date());
  const [camZoom, setCamZoom]               = useState(null);

  // ── Responsive ──
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── HUD clock ──
  useEffect(() => {
    const id = setInterval(() => setHudTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Campaign progress normalization ──
  const progress = gsRef.current?.campaignData?.progress || {};
  if (!progress.planets) {
    progress.planets = {};
    const oldHighest    = progress.highestStage || progress.currentStage || 1;
    const targetPlanet  = Math.floor((oldHighest - 1) / 10) + 1;
    progress.highestPlanet = targetPlanet;
    for (let p = 1; p <= targetPlanet; p++) {
      if (p === targetPlanet) {
        progress.planets[p] = { highestStage: oldHighest - ((p - 1) * 10), stars: {} };
      } else {
        progress.planets[p] = { highestStage: 10, stars: {} };
        for (let s = 1; s <= 10; s++) progress.planets[p].stars[s] = 3;
      }
    }
  }

  const calcStars = useCallback((id) => {
    const d = progress.planets?.[id];
    if (!d?.stars) return 0;
    return Object.values(d.stars).reduce((s, v) => s + v, 0);
  }, []);

  // ── Phaser Game Init ──
  useEffect(() => {
    if (!containerRef.current) return;

    const config = {
      type: Phaser.WEBGL,
      width:  window.innerWidth,
      height: window.innerHeight,
      parent: containerRef.current,
      backgroundColor: '#01020a',
      transparent: false,
      scene: [GalaxyMapScene],
      scale: {
        mode:       Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        antialias:        true,
        antialiasGL:      true,
        pixelArt:         false,
        roundPixels:      false,
        powerPreference:  'high-performance',
      },
    };

    const game = new Phaser.Game(config);
    game.registry.set('gsRef',         gsRef);
    game.registry.set('planetsData',   Object.values(SAFE_PLANETS));
    game.registry.set('lang',          lang);
    game.registry.set('onPlanetSelect', (planet) => setSelectedPlanet(planet));
    gameRef.current = game;

    // Expose zoom for HUD (read from Phaser after first frame)
    const zoomPoll = setInterval(() => {
      const scene = game.scene.getScene('GalaxyMapScene');
      if (scene?.cameras?.main) {
        setCamZoom(Math.round(scene.cameras.main.zoom * 100));
        clearInterval(zoomPoll);
      }
    }, 200);

    return () => {
      clearInterval(zoomPoll);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const handleEnterPlanet = () => {
    if (!selectedPlanet) return;
    progress.currentPlanet = selectedPlanet.id;
    setScreen('stage_select');
  };

  const stars    = selectedPlanet ? calcStars(selectedPlanet.id) : 0;
  const starsPct = selectedPlanet ? Math.round((stars / 30) * 100) : 0;
  const [pR, pG, pB] = selectedPlanet ? hexToRgb(selectedPlanet.color) : [56, 189, 248];

  // ── Panel spring config ──
  const panelVariants = {
    hidden: isMobile
      ? { opacity: 0, y: '100%' }
      : { opacity: 0, x: 420 },
    visible: isMobile
      ? { opacity: 1, y: 0 }
      : { opacity: 1, x: 0 },
    exit: isMobile
      ? { opacity: 0, y: '100%' }
      : { opacity: 0, x: 420 },
  };

  // ── Computed styles ──
  const MS = isMobile; // alias
  const font = '"Barlow Condensed", "Share Tech Mono", sans-serif';

  const topPad = MS ? 'max(12px, env(safe-area-inset-top))' : '20px';
  const botPad = MS ? 'max(20px, env(safe-area-inset-bottom))' : '20px';

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', fontFamily: font, userSelect: 'none' }}>

      {/* ── Phaser canvas ── */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ── CRT / Scanline FX ── */}
      <CRTOverlay />

      {/* ══════════════════════════════════════════════
          TOP HUD BAR
      ══════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15,
        padding: `${topPad} ${MS ? '12px' : '24px'} 0`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        pointerEvents: 'none',
      }}>

        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          onClick={() => setScreen('campaign_portal')}
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            background: 'rgba(6, 12, 24, 0.85)',
            color: '#00e5ff',
            border: 'none',
            borderLeft: '3px solid #00e5ff',
            padding: MS ? '9px 14px' : '11px 26px',
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: MS ? 14 : 17,
            fontWeight: 700,
            cursor: 'pointer',
            backdropFilter: 'blur(14px)',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            boxShadow: '0 0 20px rgba(0,229,255,0.18), inset 0 0 15px rgba(0,229,255,0.04)',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,255,0.12)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(0,229,255,0.35), inset 0 0 20px rgba(0,229,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(6,12,24,0.85)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,229,255,0.18), inset 0 0 15px rgba(0,229,255,0.04)'; }}
        >
          <CornerBracket pos="tl" color="#00e5ff" />
          <CornerBracket pos="br" color="#00e5ff" />
          ◀ {lang === 'vi' ? 'HỆ ĐIỀU HÀNH' : 'SYSTEM'}
        </motion.button>

        {/* Center title (desktop only) */}
        {!MS && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            style={{
              textAlign: 'center',
              background: 'rgba(6,12,24,0.75)',
              border: '1px solid rgba(56,189,248,0.15)',
              borderBottom: '2px solid rgba(56,189,248,0.4)',
              padding: '8px 32px 10px',
              backdropFilter: 'blur(12px)',
              color: '#38bdf8',
              fontFamily: '"Share Tech Mono", monospace',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.35em', color: '#4b6880', marginBottom: 2 }}>
              STELLAR COMMAND — NAVIGATION MATRIX
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.25em', textShadow: '0 0 16px #38bdf888' }}>
              GALAXY MAP
            </div>
          </motion.div>
        )}

        {/* Right info panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
          style={{
            background: 'rgba(6,12,24,0.82)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: MS ? '8px 12px' : '10px 16px',
            backdropFilter: 'blur(14px)',
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: MS ? 10 : 12,
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.9,
            textAlign: 'right',
            minWidth: MS ? 130 : 160,
            position: 'relative',
          }}
        >
          <CornerBracket pos="tr" color="#38bdf8" />
          <CornerBracket pos="bl" color="#38bdf8" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 2 }}>
            <StatusDot active />
            <span style={{ color: '#22d3ee', letterSpacing: '0.1em' }}>ONLINE</span>
          </div>
          <div>
            <span style={{ color: '#facc15' }}>{MS ? 'DRAG' : 'DRAG'}</span>{' '}
            {lang === 'vi' ? 'lướt map' : 'to pan'}
          </div>
          <div>
            <span style={{ color: '#facc15' }}>TAP</span>{' '}
            {lang === 'vi' ? 'chọn hành tinh' : 'to select'}
          </div>
          <div>
            <span style={{ color: '#facc15' }}>{MS ? 'PINCH' : 'SCROLL'}</span>{' '}
            ZOOM
          </div>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════
          BOTTOM HUD STRIP (Desktop)
      ══════════════════════════════════════════════ */}
      {!MS && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 12,
            padding: '0 24px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            pointerEvents: 'none',
          }}
        >
          {/* Coordinate / zoom readout */}
          <div style={{
            background: 'rgba(6,12,24,0.72)', border: '1px solid rgba(56,189,248,0.12)',
            padding: '6px 14px', backdropFilter: 'blur(10px)',
            fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: '#4b6880',
            display: 'flex', gap: 20,
          }}>
            <span><span style={{ color: '#22d3ee' }}>ZOOM</span>{' '}{camZoom ?? '--'}%</span>
            <span style={{ color: 'rgba(255,255,255,0.08)' }}>|</span>
            <span><span style={{ color: '#22d3ee' }}>SECTORS</span>{' '}{Object.keys(SAFE_PLANETS).length}</span>
            <span style={{ color: 'rgba(255,255,255,0.08)' }}>|</span>
            <span style={{ color: '#facc15' }}>
              {hudTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Compass indicator */}
          <div style={{
            background: 'rgba(6,12,24,0.72)', border: '1px solid rgba(56,189,248,0.12)',
            padding: '6px 14px', backdropFilter: 'blur(10px)',
            fontFamily: '"Share Tech Mono", monospace', fontSize: 11, color: '#4b6880',
          }}>
            <span style={{ color: '#22d3ee' }}>⬡ ISO</span>{' '}PROJECTION ·{' '}
            <span style={{ color: '#22d3ee' }}>2.5D</span>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════
          PLANET INFO PANEL
      ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedPlanet && (
          <motion.div
            key={selectedPlanet.id}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', damping: 26, stiffness: 280, mass: 0.8 }}
            style={{
              position: 'absolute',
              zIndex: 25,
              boxSizing: 'border-box',
              pointerEvents: 'auto',
              backdropFilter: 'blur(22px)',
              background: `
                linear-gradient(135deg,
                  rgba(6,12,24,0.97) 0%,
                  rgba(${pR},${pG},${pB},0.06) 100%
                )
              `,
              boxShadow: `
                0 0 60px rgba(0,0,0,0.9),
                0 0 80px rgba(${pR},${pG},${pB},0.10),
                inset 0 0 60px rgba(${pR},${pG},${pB},0.04)
              `,
              /* --- BẢN VÁ RESPONSIVE --- */
              overflowY: 'auto',
              display: 'flex', 
              flexDirection: 'column', 
              /* Tự động ép khoảng cách nhỏ lại nếu màn hình bị lùn */
              gap: 'clamp(10px, 2vh, 16px)', 
              ...(MS ? {
                bottom: 0, left: 0, width: '100%',
                maxHeight: '85dvh',
                borderRadius: '20px 20px 0 0',
                borderTop: `2px solid rgba(${pR},${pG},${pB},0.7)`,
                padding: `18px 18px ${botPad}`,
              } : {
                // Xóa transform. Dùng bound margin để căn giữa an toàn tuyệt đối.
                top: 'env(safe-area-inset-top, 24px)', 
                bottom: 'env(safe-area-inset-bottom, 24px)', 
                right: 'max(32px, env(safe-area-inset-right))',
                margin: 'auto 0',
                height: 'fit-content', // Ôm sát nội dung
                maxHeight: 'calc(100dvh - 48px)', // Chặn tối đa không cho lòi ra ngoài
                width: 380,
                borderRadius: 16,
                border: `1px solid rgba(255,255,255,0.07)`,
                borderRight: `3px solid rgba(${pR},${pG},${pB},0.8)`,
                padding: '24px',
              }),
            }}
          >
            {/* ── Drag handle (mobile) ── */}
            {MS && (
              <div
                onClick={() => setSelectedPlanet(null)}
                style={{
                  width: 44, height: 5, borderRadius: 4,
                  background: `rgba(${pR},${pG},${pB},0.45)`,
                  margin: '-4px auto 6px', cursor: 'pointer',
                  flexShrink: 0
                }}
              />
            )}

            {/* ── Close button (desktop) ── */}
            {!MS && (
              <button
                onClick={() => setSelectedPlanet(null)}
                style={{
                  position: 'absolute', top: 12, right: 16,
                  background: 'transparent', border: 'none',
                  color: 'rgba(255,255,255,0.4)', fontSize: 22,
                  cursor: 'pointer', lineHeight: 1,
                  transition: 'color 0.2s',
                  zIndex: 10,
                  padding: '4px'
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
              >
                ✕
              </button>
            )}

            {/* ── Planet Identity ── */}
            <div style={{ flexShrink: 0, paddingRight: !MS ? '24px' : 0 }}>
              <motion.p
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                style={{
                  margin: '0 0 4px',
                  color: selectedPlanet.color,
                  fontSize: MS ? 11 : 13,
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  fontFamily: '"Share Tech Mono", monospace',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <StatusDot active />
                {lang === 'vi'
                  ? `TINH CẦU KHU VỰC ${selectedPlanet.id}`
                  : `SECTOR PLANET ${String(selectedPlanet.id).padStart(2, '0')}`}
              </motion.p>

              <motion.h2
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                style={{
                  margin: 0,
                  color: '#f1f5f9',
                  /* Cỡ chữ tự động co giãn nếu thiếu chiều cao */
                  fontSize: 'clamp(24px, 4vh, 32px)',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  lineHeight: 1.1,
                  textShadow: `0 0 24px rgba(${pR},${pG},${pB},0.55)`,
                }}
              >
                {selectedPlanet.icon && <span style={{ marginRight: 10 }}>{selectedPlanet.icon}</span>}
                {selectedPlanet.name[lang]}
              </motion.h2>
            </div>

            {/* ── Stats grid ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 }}
              style={{
                flexShrink: 0,
                background: 'rgba(0,0,0,0.40)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
                padding: 'clamp(10px, 2vh, 16px) 16px',
              }}
            >
              <DataRow
                label={lang === 'vi' ? 'Tiến độ' : 'Purge Progress'}
                value={`${stars} / 30 ★`}
                color='#facc15'
              />
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <NeonBar value={stars} max={30} color='#facc15' height={7} />
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b', fontFamily: '"Share Tech Mono", monospace', marginTop: 4 }}>
                {starsPct}% CLEARED
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 0' }}/>

              <DataRow
                label={lang === 'vi' ? 'Giai đoạn' : 'Stages'}
                value={`${progress.planets?.[selectedPlanet.id]?.highestStage ?? 0} / 10`}
                color='#22d3ee'
              />
              <DataRow
                label={lang === 'vi' ? 'Trạng thái' : 'Status'}
                value={selectedPlanet.id <= (progress.highestPlanet || 1)
                  ? (selectedPlanet.id === (progress.highestPlanet || 1)
                      ? (lang === 'vi' ? '● ĐANG CHIẾN' : '● ACTIVE')
                      : (lang === 'vi' ? '✓ HOÀN THÀNH' : '✓ CLEARED'))
                  : (lang === 'vi' ? '🔒 KHÓA' : '🔒 LOCKED')}
                color={selectedPlanet.id <= (progress.highestPlanet || 1)
                  ? selectedPlanet.id === (progress.highestPlanet || 1) ? '#22d3ee' : '#4ade80'
                  : '#475569'}
              />
            </motion.div>

            {/* ── Anomaly warning ── */}
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.16 }}
              style={{
                flexShrink: 0,
                background: 'rgba(239,68,68,0.07)',
                borderLeft: '3px solid rgba(239,68,68,0.75)',
                borderRadius: '0 8px 8px 0',
                padding: 'clamp(8px, 1.5vh, 12px) 14px',
              }}
            >
              <p style={{ margin: '0 0 3px', color: '#ef4444', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                ⚠ {lang === 'vi' ? 'CẢNH BÁO DỊ THƯỜNG' : 'ANOMALY DETECTED'}
              </p>
              <p style={{ margin: 0, color: '#e2e8f0', fontSize: MS ? 14 : 'clamp(13px, 2vh, 15px)', fontStyle: 'italic', lineHeight: 1.45 }}>
                {selectedPlanet.envDesc[lang]}
              </p>
            </motion.div>

            {/* ── Deploy button ── */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.20 }}
              whileTap={{ scale: 0.96 }}
              whileHover={{ brightness: 1.1 }}
              onClick={handleEnterPlanet}
              style={{
                flexShrink: 0,
                position: 'relative',
                background: `linear-gradient(135deg, rgba(${pR},${pG},${pB},0.90) 0%, rgba(${Math.min(pR+30,255)},${Math.min(pG+60,255)},${Math.min(pB+90,255)},0.70) 100%)`,
                color: `rgba(0,0,0,0.88)`,
                border: 'none',
                borderTop: `1px solid rgba(${pR},${pG},${pB},0.5)`,
                padding: MS ? '15px 20px' : 'clamp(12px, 2.5vh, 17px) 20px',
                borderRadius: 10,
                fontSize: MS ? 18 : 'clamp(16px, 3vh, 20px)',
                fontWeight: 900,
                cursor: 'pointer',
                fontFamily: font,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                boxShadow: `
                  0 0 28px rgba(${pR},${pG},${pB},0.45),
                  0 4px 20px rgba(0,0,0,0.5)
                `,
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
                overflow: 'hidden',
                transition: 'filter 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.12)'; e.currentTarget.style.boxShadow = `0 0 40px rgba(${pR},${pG},${pB},0.65), 0 4px 24px rgba(0,0,0,0.5)`; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.boxShadow = `0 0 28px rgba(${pR},${pG},${pB},0.45), 0 4px 20px rgba(0,0,0,0.5)`; }}
            >
              {/* Shimmer effect */}
              <motion.div
                animate={{ x: ['-120%', '220%'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', repeatDelay: 1.4 }}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '45%', height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
                  pointerEvents: 'none',
                }}
              />
               {lang === 'vi' ? 'ĐÁP XUỐNG CHIẾN ĐẤU' : 'INITIATE COMBAT'}
            </motion.button>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}