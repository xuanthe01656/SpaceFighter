import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANET_CONFIG, STAGE_CONFIG, PLANET_BOSSES, PLANET_STAGE_NAMES } from '../../constants';
import styles from './StageSelect.module.css';

export default function StageSelect({ gsRef, setScreen, lang }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const progress = gsRef.current?.campaignData?.progress;
  if (!progress || !progress.currentPlanet) return null;

  const planetId       = progress.currentPlanet;
  const planetData     = PLANET_CONFIG[planetId];
  const pProgress      = progress.planets?.[planetId] || { highestStage: 1, stars: {} };
  const unlockedStage  = pProgress.highestStage || 1;
  const bosses         = PLANET_BOSSES[planetId] || PLANET_BOSSES[1];

  // Màu chủ đề theo planet
  const themeColor = planetData?.color || '#00e5ff';

  const stages = Array.from({ length: 10 }, (_, i) => {
    const sId    = i + 1;
    const sCfg   = STAGE_CONFIG[sId];
    const isBoss = sCfg?.hasBoss || false;
    const nameObj = PLANET_STAGE_NAMES[planetId]?.[sId] || { vi: `Khu Vực ${sId}`, en: `Sector ${sId}` };
    const bData  = isBoss ? bosses[sCfg?.bossType] : null;

    return {
      id: sId, isBoss,
      name: nameObj[lang],
      bossName: bData?.name?.[lang] || '',
      bossImg:  bData?.imgSrc || '',
      stars:    pProgress.stars?.[sId] || 0,
      timeLimit: sCfg?.timeLimit || 150,
      waves:     sCfg?.waves || 5,
    };
  });

  const handleSelect = (stage) => {
    if (stage.id > unlockedStage) return;
    setSelectedId(stage.id);
    setTimeout(() => {
      progress.selectedStage = stage.id;
      gsRef.current.gameMode = 'campaign';
      setScreen('hq');
    }, 320);
  };

  // Tính góc isometric cho hexagon grid
  // 5 hàng × 2 cột, sắp xếp zigzag
  const getGridPos = (idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    return { col, row };
  };

  return (
    <div className={`${styles.root} scrollable-layer`}>

      {/* Lớp nền animated */}
      <div className={styles.bgLayer}>
        <div className={styles.bgGrid} />
        <div className={styles.bgGlow} style={{ '--theme': themeColor }} />
        {/* Các "tinh tú" nền */}
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className={styles.star}
            style={{ left: `${(i * 37 + 11) % 100}%`, top: `${(i * 53 + 7) % 100}%`, animationDelay: `${(i * 0.4) % 3}s` }}
          />
        ))}
      </div>

      {/* Header sticky */}
      <div className={styles.header}>
        <motion.button whileTap={{ scale: 0.92 }} className={styles.backBtn}
          onClick={() => setScreen('galaxy_map')}>
          <span className={styles.backArrow}>◀</span>
          <span>{lang === 'vi' ? 'THIÊN HÀ' : 'GALAXY'}</span>
        </motion.button>

        <div className={styles.headerCenter}>
          <div className={styles.planetLabel}>{lang === 'vi' ? 'TINH CẦU' : 'PLANET'}</div>
          <h1 className={styles.planetName} style={{ '--theme': themeColor }}>
            {planetData?.name?.[lang] || ''}
          </h1>
        </div>

        <div className={styles.progressBadge}>
          <span className={styles.progressNum}>{unlockedStage - 1}</span>
          <span className={styles.progressSep}>/</span>
          <span className={styles.progressTotal}>10</span>
          <span className={styles.progressLabel}>{lang === 'vi' ? 'ẢI' : 'STG'}</span>
        </div>
      </div>

      {/* Main content: grid 2.5D */}
      <div className={styles.sceneWrapper}>

        {/* Đường path nối các ải – SVG dọc */}
        <svg className={styles.pathSvg} viewBox="0 0 320 870" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pathGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeColor} stopOpacity="0.8" />
              <stop offset="100%" stopColor={themeColor} stopOpacity="0.1" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {/* Path zigzag nối các node */}
          {stages.map((s, i) => {
            if (i === stages.length - 1) return null;
            const { col: c0, row: r0 } = getGridPos(i);
            const { col: c1, row: r1 } = getGridPos(i + 1);
            const x0 = 80 + c0 * 160, y0 = 55 + r0 * 160 + (c0 === 1 ? 70 : 0);
            const x1 = 80 + c1 * 160, y1 = 55 + r1 * 160 + (c1 === 1 ? 70 : 0);
            const unlocked = s.id < unlockedStage;
            return (
              <line key={i} x1={x0} y1={y0} x2={x1} y2={y1}
                stroke={unlocked ? `url(#pathGrad)` : '#1a2a3a'}
                strokeWidth="3" strokeDasharray={unlocked ? 'none' : '8 6'}
                filter={unlocked ? 'url(#glow)' : 'none'}
              />
            );
          })}
        </svg>

        {/* Các stage node */}
        <div className={styles.stageGrid}>
          {stages.map((stage, idx) => {
            const { col, row } = getGridPos(idx);
            const isUnlocked = stage.id <= unlockedStage;
            const isHovered  = hoveredId === stage.id;
            const isSelected = selectedId === stage.id;
            const isCurrent  = stage.id === unlockedStage;

            return (
              <motion.div
                key={stage.id}
                className={`${styles.nodeWrapper} ${stage.isBoss ? styles.bossNode : ''}`}
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                  '--theme': themeColor,
                  // Offset zigzag
                  marginTop: col === 1 ? '70px' : '0',
                }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, type: 'spring', stiffness: 200, damping: 20 }}
                onHoverStart={() => isUnlocked && setHoveredId(stage.id)}
                onHoverEnd={() => setHoveredId(null)}
                onTapStart={() => isUnlocked && setHoveredId(stage.id)}
                onClick={() => handleSelect(stage)}
              >
                {/* Bóng đổ 3D phía dưới node */}
                <div className={styles.nodeShadow}
                  style={{ opacity: isUnlocked ? (isHovered ? 0.7 : 0.35) : 0.1 }} />

                {/* Thân node chính – hình lục giác cắt góc */}
                <motion.div
                  className={`${styles.nodeHex} ${!isUnlocked ? styles.nodeLocked : stage.isBoss ? styles.nodeBoss : styles.nodeNormal}`}
                  animate={{
                    scale: isSelected ? 0.9 : isHovered ? 1.08 : 1,
                    y: isHovered ? -6 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {/* Số thứ tự ải */}
                  <div className={styles.nodeNum}>{stage.id}</div>

                  {/* Icon / Boss image */}
                  <div className={styles.nodeIcon}>
                    {stage.isBoss && stage.bossImg ? (
                      <img src={stage.bossImg} alt="" className={styles.bossImg}
                        onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className={styles.nodeEmoji}>
                        {!isUnlocked ? '🔒' : stage.isBoss ? '☠' : '🛰'}
                      </span>
                    )}
                  </div>

                  {/* Sao – chỉ hiện khi đã chơi qua */}
                  {isUnlocked && stage.id < unlockedStage && (
                    <div className={styles.nodeStars}>
                      {[1,2,3].map(n => (
                        <span key={n} className={n <= stage.stars ? styles.starOn : styles.starOff}>★</span>
                      ))}
                    </div>
                  )}

                  {/* Pulse ring nếu là ải hiện tại có thể chơi */}
                  {isCurrent && (
                    <div className={styles.pulseRing} style={{ '--theme': themeColor }} />
                  )}

                  {/* Khóa overlay */}
                  {!isUnlocked && <div className={styles.lockOverlay} />}
                </motion.div>

                {/* Label bên dưới node */}
                <div className={`${styles.nodeLabel} ${stage.isBoss ? styles.nodeLabelBoss : ''}`}
                  style={{ color: isUnlocked ? (stage.isBoss ? '#ff4757' : themeColor) : '#334155' }}>
                  <div className={styles.nodeLabelName}>{stage.name}</div>
                  {stage.isBoss && isUnlocked && (
                    <div className={styles.nodeLabelBossName}>⚠ {stage.bossName}</div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Tooltip khi hover – hiện chi tiết ải */}
        <AnimatePresence>
          {hoveredId && (() => {
            const s = stages.find(x => x.id === hoveredId);
            if (!s) return null;
            const { col, row } = getGridPos(hoveredId - 1);
            return (
              <motion.div
                key={hoveredId}
                className={styles.tooltip}
                style={{
                  '--theme': s.isBoss ? '#ff4757' : themeColor,
                  // Đặt tooltip bên phải nếu col=0, bên trái nếu col=1
                  left: col === 0 ? 'calc(50% + 10px)' : 'auto',
                  right: col === 1 ? 'calc(50% + 10px)' : 'auto',
                  top: `${90 + row * 170 + (col === 1 ? 80 : 0)}px`,
                }}
                initial={{ opacity: 0, scale: 0.85, x: col === 0 ? -10 : 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18 }}
              >
                <div className={styles.tooltipTitle}>
                  {lang === 'vi' ? `ẢI ${s.id}` : `STAGE ${s.id}`}
                </div>
                <div className={styles.tooltipName}>{s.name}</div>
                <div className={styles.tooltipRow}>
                  <span>{lang === 'vi' ? 'Đợt' : 'Waves'}</span>
                  <span>{s.waves}</span>
                </div>
                <div className={styles.tooltipRow}>
                  <span>{lang === 'vi' ? 'Giới hạn' : 'Time'}</span>
                  <span>{Math.floor(s.timeLimit / 60)}:{String(s.timeLimit % 60).padStart(2,'0')}</span>
                </div>
                {s.isBoss && (
                  <div className={styles.tooltipBoss}>⚠ {s.bossName}</div>
                )}
                <div className={styles.tooltipStars}>
                  {[1,2,3].map(n => (
                    <span key={n} style={{ color: n <= s.stars ? '#facc15' : '#1e293b', fontSize: 18 }}>★</span>
                  ))}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

      </div>
    </div>
  );
}