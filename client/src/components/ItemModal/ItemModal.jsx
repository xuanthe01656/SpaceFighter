import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ItemModal.module.css';
import { GEAR_CATALOG, AIRCRAFTS, PILOTS } from '../../constants';
import ShipImage from '../ShipImage/ShipImage';

// ── Radar max values ──────────────────────────────────────────────
const MAX_VALS = { atk: 1500, hp: 4000, armor: 400, speed: 12, fireRate: 0.1 };

// ── Rarity system ─────────────────────────────────────────────────
const RARITY_COLOR = {
  1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#fbbf24',
};
const RARITY_LABEL = {
  1: 'COMMON', 2: 'UNCOMMON', 3: 'RARE', 4: 'EPIC', 5: 'LEGENDARY',
};

// ── Inline SVG Icons ──────────────────────────────────────────────
const Icons = {
  Coin: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  ),
  Blueprint: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="7" r="1.5" />
      <path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" />
    </svg>
  ),
};

// ── Level / star caps per rarity ──────────────────────────────────
const getItemLimits = (item, baseInfo) => {
  if (!item) return { maxLevel: 10, maxStar: 1 };
  if (item.type === 'aircraft') {
    const tier = baseInfo?.tier || 1;
    return { maxLevel: { 1: 30, 2: 50, 3: 70, 4: 100 }[tier] || 30, maxStar: 5 };
  }
  return { 1: { maxLevel: 20, maxStar: 2 }, 2: { maxLevel: 40, maxStar: 3 },
           3: { maxLevel: 60, maxStar: 4 }, 4: { maxLevel: 80, maxStar: 5 },
           5: { maxLevel: 100, maxStar: 6 } }[item.rarity || 1] || { maxLevel: 20, maxStar: 2 };
};

// ─────────────────────────────────────────────────────────────────
export default function ItemModal({
  isOpen, onClose, item, baseInfo, contextType, isEquipped,
  lang, starUpInfo, resources, actions
}) {
  // ── All hooks first ───────────────────────────────────────────
  const [forgeTab,            setForgeTab]            = useState('upgrade');
  const [selectedSacrifices,  setSelectedSacrifices]  = useState([]);

  useEffect(() => {
    if (isOpen) { setForgeTab('upgrade'); setSelectedSacrifices([]); }
  }, [isOpen, item]);

  // Stat calculation helpers
  const getCoreStat = (base, lvl, star) => {
    if (!base) return 0;
    return base + ((lvl - 1) * Math.max(1, Math.round(base * 0.05)))
                + ((star - 1) * Math.max(1, Math.round(base * 0.20)));
  };
  const getSpeedStat = (base, star) => {
    if (!base) return 0;
    return parseFloat((base + (star - 1) * Math.max(0.1, base * 0.10)).toFixed(1));
  };
  const getFireRateStat = (base, star) => {
    if (!base) return 0;
    const b = base > 20 ? base / 1000 : base;
    return parseFloat(Math.max(0.05, b - (star - 1) * Math.max(0.01, b * 0.05)).toFixed(2));
  };

  const currentLvl  = item?.level  || 1;
  const currentStar = item?.stars  || item?.rarity || 1;

  const stats = useMemo(() => {
    const isUp = forgeTab === 'upgrade';
    const cur = {
      atk: getCoreStat(baseInfo?.baseAtk,   currentLvl, currentStar),
      hp:  getCoreStat(baseInfo?.baseHp,     currentLvl, currentStar),
      arm: getCoreStat(baseInfo?.baseArmor,  currentLvl, currentStar),
      spd: getSpeedStat(baseInfo?.speed,     currentStar),
      fr:  getFireRateStat(baseInfo?.fireRate, currentStar),
    };
    const next = {
      atk: isUp ? getCoreStat(baseInfo?.baseAtk,  currentLvl + 1, currentStar)
                : getCoreStat(baseInfo?.baseAtk,  currentLvl, currentStar + 1),
      hp:  isUp ? getCoreStat(baseInfo?.baseHp,   currentLvl + 1, currentStar)
                : getCoreStat(baseInfo?.baseHp,   currentLvl, currentStar + 1),
      arm: isUp ? getCoreStat(baseInfo?.baseArmor, currentLvl + 1, currentStar)
                : getCoreStat(baseInfo?.baseArmor, currentLvl, currentStar + 1),
      spd: isUp ? cur.spd : getSpeedStat(baseInfo?.speed, currentStar + 1),
      fr:  isUp ? cur.fr  : getFireRateStat(baseInfo?.fireRate, currentStar + 1),
    };
    return { cur, next };
  }, [baseInfo, currentLvl, currentStar, forgeTab]);

  // ── Early return after all hooks ──────────────────────────────
  if (!isOpen || !item) return null;

  const isCrate   = item.shopType === 'crate';
  const limits    = getItemLimits(item, baseInfo);
  const isMaxLevel = currentLvl  >= limits.maxLevel;
  const isMaxStar  = currentStar >= limits.maxStar;

  const calculateCP = s => Math.floor((s.atk * 5) + (s.hp * 0.5) + (s.arm * 10) + (s.spd * 20));
  const currentCP   = calculateCP(stats.cur);
  const nextCP      = calculateCP(stats.next);
  const showPreview = contextType === 'forge' &&
    ((forgeTab === 'upgrade' && !isMaxLevel) || (forgeTab === 'starup' && !isMaxStar));

  const upCoinCost = currentLvl * 150;
  const upBpCost   = Math.ceil(currentLvl * 1.5);
  const canUpgrade = !isMaxLevel &&
    (resources?.coins || 0) >= upCoinCost &&
    (resources?.blueprints || 0) >= upBpCost;

  const hasStarUpFunds = (resources?.coins || 0) >= (starUpInfo?.coinCost || 0);
  const canStarUp = !isMaxStar && hasStarUpFunds &&
    selectedSacrifices.length === (starUpInfo?.reqDupes || 0);

  const rarityColor = RARITY_COLOR[item.rarity] || '#94a3b8';

  // CSS custom property for rarity accent
  const modalStyle = {
    '--modal-rc': isCrate ? '#38bdf8' : rarityColor,
  };

  // ── Radar ─────────────────────────────────────────────────────
  const getRadarRadius = (val, type) => {
    if (!val) return 0;
    if (type === 'fireRate') return Math.min(1, 0.1 / val);
    return Math.min(1, val / MAX_VALS[type]);
  };

  const renderRadar = () => {
    const r = 55, cx = 65;
    const pts = s => [
      [cx,     cx - r * getRadarRadius(s.atk, 'atk')],
      [cx + r * getRadarRadius(s.hp,  'hp'),  cx],
      [cx + r * getRadarRadius(s.arm, 'armor') * 0.7, cx + r * 0.7],
      [cx - r * getRadarRadius(s.spd, 'speed') * 0.7, cx + r * 0.7],
      [cx - r * getRadarRadius(s.fr,  'fireRate'),     cx - r * 0.2],
    ].map(([x, y]) => `${x},${y}`).join(' ');

    return (
      <svg width="130" height="130" className={styles.radarSvg} overflow="visible">
        {/* Grid circles */}
        <circle cx={cx} cy={cx} r={r}     fill="none" stroke="rgba(56,189,248,0.12)" strokeWidth="1" />
        <circle cx={cx} cy={cx} r={r*0.6} fill="none" stroke="rgba(56,189,248,0.08)" strokeWidth="1" strokeDasharray="3,3" />
        <circle cx={cx} cy={cx} r={r*0.3} fill="none" stroke="rgba(56,189,248,0.06)" strokeWidth="1" />
        {/* Current stats */}
        <polygon points={pts(stats.cur)}
          fill={`${rarityColor}28`} stroke={rarityColor} strokeWidth="1.5" />
        {/* Preview (upgrade/starup) */}
        {showPreview && (
          <polygon points={pts(stats.next)}
            fill="none" stroke="#fbbf24" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.75" />
        )}
        {/* Center dot */}
        <circle cx={cx} cy={cx} r="2.5" fill={rarityColor} />
      </svg>
    );
  };

  // ── Stat bars ─────────────────────────────────────────────────
  const renderStatBar = (label, cur, next, max, unit = "", isReverse = false) => {
    if (!cur) return null;
    const improved = isReverse ? (next < cur) : (next > cur);
    const diff = Math.abs(next - cur);
    return (
      <div className={styles.statBarRow} key={label}>
        <div className={styles.statInfo}>
          <span>{label}</span>
          <span>
            {cur}{unit}
            {showPreview && improved && (
              <span className={styles.statUp}>
                {isReverse ? ' −' : ' +'}{diff.toFixed(unit ? 2 : 0)}{unit}
              </span>
            )}
          </span>
        </div>
        <div className={styles.statBarBg}>
          <div className={styles.statBarFill}
               style={{ width: `${Math.min(100, (cur / max) * 100)}%` }} />
          {showPreview && !isReverse && improved && (
            <div className={styles.statBarGhost}
                 style={{ width: `${Math.min(100, (next / max) * 100)}%` }} />
          )}
        </div>
      </div>
    );
  };

  // ── Sacrifice toggle ──────────────────────────────────────────
  const toggleSacrifice = (uuid) => {
    if (selectedSacrifices.includes(uuid)) {
      setSelectedSacrifices(p => p.filter(id => id !== uuid));
    } else if (selectedSacrifices.length < (starUpInfo?.reqDupes || 0)) {
      setSelectedSacrifices(p => [...p, uuid]);
    }
  };

  const handleStarUpClick = () => {
    const sacItems = (resources?.duplicateItems || []).filter(d => selectedSacrifices.includes(d.uuid));
    const warn = sacItems.some(d => (d.level > currentLvl) || ((d.rarity || 1) > currentStar));
    if (warn) {
      const msg = lang === 'vi'
        ? 'CẢNH BÁO: Phôi bạn chọn có Cấp/Phẩm chất CAO HƠN vật phẩm chính!\n\nXác nhận hy sinh?'
        : 'WARNING: Selected materials have HIGHER Level/Rarity!\n\nConfirm sacrifice?';
      if (!window.confirm(msg)) return;
    }
    actions.onStarUp(selectedSacrifices);
    setSelectedSacrifices([]);
  };

  const handleBackdropClick = (e) => { if (e.target === e.currentTarget) onClose(); };

  // ─────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={handleBackdropClick}
      >
        <motion.div
          className={styles.modal}
          style={modalStyle}
          initial={{ scale: 0.92, y: 24, opacity: 0 }}
          animate={{ scale: 1,    y: 0,  opacity: 1 }}
          exit={{ scale: 0.92, y: 16, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        >
          {/* ── Close ── */}
          <button className={styles.closeBtn} onClick={onClose}>✕</button>

          <div className={styles.modalContent}>

            {/* ══ LEFT: IMAGE PANEL ══════════════════════════════ */}
            <div
              className={styles.imageSection}
              style={{
                borderRightColor: `${rarityColor}25`,
                boxShadow: `inset 0 0 60px ${rarityColor}14`,
              }}
            >
              {/* Ambient glow */}
              <div
                className={styles.glowBg}
                style={{
                  background: `radial-gradient(circle at center, ${rarityColor}35 0%, transparent 70%)`,
                }}
              />

              {/* Image or crate icon - Thêm logic onError */}
              {isCrate
                ? <div className={styles.crateIconWrap}>{item.icon}</div>
                : item.type === 'aircraft' ? <ShipImage aircraftId={item.id}
                    className={styles.itemImage}
                    alt={baseInfo?.name?.[lang] || 'aircraft'}
                    style={{ filter: `drop-shadow(0 0 18px ${rarityColor}60)` }}
                  /> : <img
                    src={baseInfo?.imgSrc || baseInfo?.imgHq || baseInfo?.imgTop || '/images/no_image.png'}
                    alt="item"
                    className={styles.itemImage}
                    style={{ filter: `drop-shadow(0 0 18px ${rarityColor}60)` }}
                    onError={(e) => { e.target.onerror = null; e.target.src = '/images/no_image.png'; }}
                  />
              }

              {isEquipped && (
                <div className={styles.equippedTag}>
                  ✓ {lang === 'vi' ? 'ĐANG DÙNG' : 'EQUIPPED'}
                </div>
              )}
            </div>

            {/* ══ RIGHT: INFO PANEL ══════════════════════════════ */}
            <div className={styles.infoSection}>

              {/* Combat Power */}
              {!isCrate && item.type !== 'pilot' && (
                <div className={styles.cpBox}>
                  <span className={styles.cpLabel}>COMBAT POWER</span>
                  <span className={styles.cpValue}>{currentCP.toLocaleString()}</span>
                  {showPreview && nextCP > currentCP && (
                    <span className={styles.cpUp}>▲ +{(nextCP - currentCP).toLocaleString()}</span>
                  )}
                </div>
              )}

              {/* Title area */}
              <div className={styles.titleArea}>
                <div className={styles.itemBadges}>
                  {!isCrate && (
                    <span className={styles.lvlBadge}>
                      LV {currentLvl}/{limits.maxLevel}
                    </span>
                  )}
                  <span
                    className={styles.rarityBadge}
                    style={{ color: rarityColor, textShadow: `0 0 10px ${rarityColor}` }}
                  >
                    {isCrate
                      ? (lang === 'vi' ? 'HÒM TIẾP TẾ' : 'SUPPLY CRATE')
                      : '★'.repeat(currentStar)}
                  </span>
                  {!isCrate && item.rarity && (
                    <span style={{
                      fontFamily: 'var(--font-data)', fontSize: 10,
                      color: rarityColor, border: `1px solid ${rarityColor}`,
                      borderRadius: 4, padding: '2px 7px', background: `${rarityColor}15`,
                      letterSpacing: '1px',
                    }}>
                      {RARITY_LABEL[item.rarity]}
                    </span>
                  )}
                </div>

                <h2
                  className={styles.itemName}
                  style={{ color: isCrate ? 'var(--m-accent)' : '#fff' }}
                >
                  {isCrate
                    ? item.title[lang]
                    : baseInfo?.name?.[lang] || 'UNKNOWN ITEM'}
                </h2>

                <div className={styles.itemDescriptionBox}>
                  {baseInfo?.description?.[lang] ||
                   baseInfo?.skillDesc?.[lang]   ||
                   item?.desc?.[lang]             || '…'}
                </div>
              </div>

              {/* Radar + stat bars */}
              {!isCrate && item.type !== 'pilot' && (
                <div className={styles.visualSection}>
                  <div className={styles.radarContainer}>{renderRadar()}</div>
                  <div className={styles.statsDisplay}>
                    {renderStatBar('ATK',       stats.cur.atk, stats.next.atk, MAX_VALS.atk)}
                    {renderStatBar('HP',         stats.cur.hp,  stats.next.hp,  MAX_VALS.hp)}
                    {renderStatBar('ARMOR',      stats.cur.arm, stats.next.arm, MAX_VALS.armor)}
                    {renderStatBar('SPEED',      stats.cur.spd, stats.next.spd, MAX_VALS.speed)}
                    {renderStatBar('FIRE RATE',  stats.cur.fr,  stats.next.fr,  MAX_VALS.fireRate, 's', true)}
                  </div>
                </div>
              )}

              {/* ── ACTION AREA ─────────────────────────────── */}
              <div className={styles.actionArea}>

                {/* BAG context */}
                {contextType === 'bag' && (
                  <div className={styles.btnGroupRow}>
                    {item.type !== 'aircraft' && (
                      <button
                        className={`${styles.mainBtn} ${isEquipped ? styles.btnRemove : styles.btnEquip}`}
                        onClick={() => { actions.onEquip(); onClose(); }}
                      >
                        {isEquipped
                          ? (lang === 'vi' ? 'THÁO RA' : 'UNEQUIP')
                          : (lang === 'vi' ? 'TRANG BỊ' : 'EQUIP')}
                      </button>
                    )}
                    {item.type === 'aircraft' && !isEquipped && (
                      <button
                        className={`${styles.mainBtn} ${styles.btnEquip}`}
                        onClick={() => { actions.onEquip(); onClose(); }}
                      >
                        {lang === 'vi' ? 'ĐIỀU ĐỘNG' : 'DEPLOY'}
                      </button>
                    )}
                    {item.type !== 'pilot' && (
                      <button
                        className={`${styles.mainBtn} ${styles.btnForge}`}
                        onClick={() => { actions.onGoToForge(); onClose(); }}
                      >
                        ⚒ {lang === 'vi' ? 'XƯỞNG RÈN' : 'FORGE'}
                      </button>
                    )}
                    <button className={styles.mainBtn} onClick={actions.onToggleLock}>
                      {item.isLocked ? (lang === 'vi' ? 'MỞ KHÓA' : 'UNLOCK') : (lang === 'vi' ? 'KHÓA VẬT PHẨM' : 'LOCK ITEM')}
                    </button>
                  </div>
                )}

                {/* FORGE context */}
                {contextType === 'forge' && item.type !== 'pilot' && (
                  <div className={styles.forgeWrapper}>
                    {/* Sub-tabs */}
                    <div className={styles.forgeTabs}>
                      <button
                        className={forgeTab === 'upgrade' ? styles.activeTab : ''}
                        onClick={() => setForgeTab('upgrade')}
                      >
                        ⬆ {lang === 'vi' ? 'NÂNG CẤP' : 'UPGRADE'}
                      </button>
                      <button
                        className={forgeTab === 'starup' ? styles.activeTab : ''}
                        onClick={() => setForgeTab('starup')}
                      >
                        ★ {lang === 'vi' ? 'ĐỘT PHÁ' : 'STAR UP'}
                      </button>
                    </div>

                    <div className={styles.forgeDetails}>
                      {/* UPGRADE tab */}
                      {forgeTab === 'upgrade' && (
                        <>
                          {isMaxLevel
                            ? <div className={styles.maxReached}>
                                {lang === 'vi' ? '✦ ĐÃ ĐẠT CẤP TỐI ĐA ✦' : '✦ MAX LEVEL REACHED ✦'}
                              </div>
                            : <div className={styles.costGrid}>
                                <div className={styles.costItem}>
                                  <span className={styles.costLabel}>
                                    {lang === 'vi' ? 'Chi phí' : 'Cost'}
                                  </span>
                                  <span className={(resources?.coins || 0) >= upCoinCost ? styles.hasRes : styles.noRes}>
                                    <Icons.Coin /> {upCoinCost.toLocaleString()}
                                  </span>
                                </div>
                                <div className={styles.costItem}>
                                  <span className={styles.costLabel}>
                                    {lang === 'vi' ? 'Bản vẽ' : 'Blueprints'}
                                  </span>
                                  <span className={(resources?.blueprints || 0) >= upBpCost ? styles.hasRes : styles.noRes}>
                                    <Icons.Blueprint /> {upBpCost} / {resources?.blueprints || 0}
                                  </span>
                                </div>
                              </div>
                          }
                          <button
                            className={`${styles.mainBtn} ${styles.btnUpgrade}`}
                            disabled={!canUpgrade || isMaxLevel}
                            onClick={actions.onUpgrade}
                          >
                            {lang === 'vi' ? 'TIẾN HÀNH RÈN' : 'EXECUTE UPGRADE'}
                          </button>
                        </>
                      )}

                      {/* STAR UP tab */}
                      {forgeTab === 'starup' && (
                        <>
                          {isMaxStar
                            ? <div className={styles.maxReached}>
                                {lang === 'vi' ? '✦ ĐÃ ĐẠT SAO TỐI ĐA ✦' : '✦ MAX STAR REACHED ✦'}
                              </div>
                            : <div className={styles.costGrid}>
                                <div className={styles.costItem}>
                                  <span className={styles.costLabel}>
                                    {lang === 'vi' ? 'Tỷ lệ' : 'Success Rate'}
                                  </span>
                                  <span className={styles.hasRes} style={{ color: '#4ade80' }}>
                                    {starUpInfo?.rate}%
                                  </span>
                                </div>
                                <div className={styles.costItem}>
                                  <span className={styles.costLabel}>
                                    {lang === 'vi' ? 'Chi phí' : 'Cost'}
                                  </span>
                                  <span className={(resources?.coins || 0) >= (starUpInfo?.coinCost || 0) ? styles.hasRes : styles.noRes}>
                                    <Icons.Coin /> {starUpInfo?.coinCost}
                                  </span>
                                </div>
                                <div className={styles.costItem}>
                                  <span className={styles.costLabel}>
                                    {lang === 'vi' ? 'Phôi cùng loại' : 'Materials'}
                                  </span>
                                  <span className={selectedSacrifices.length === (starUpInfo?.reqDupes || 0) ? styles.hasRes : styles.noRes}>
                                    {selectedSacrifices.length} / {starUpInfo?.reqDupes}
                                  </span>
                                </div>

                                {/* Sacrifice grid - Thêm logic onError cho phôi */}
                                <div className={styles.sacrificeGrid}>
                                  {(resources?.duplicateItems || []).map(dup => {
                                    const isSel = selectedSacrifices.includes(dup.uuid);
                                    const rc = RARITY_COLOR[dup.rarity] || '#94a3b8';
                                    let src = '';
                                    if (dup.type === 'aircraft')   src = AIRCRAFTS?.find(a => a.id === dup.id)?.imgSrc;
                                    else if (dup.type === 'pilot') src = PILOTS?.find(p => p.id === dup.id)?.imgSrc;
                                    else src = GEAR_CATALOG?.[dup.type]?.find(g => g.id === dup.baseId)?.imgSrc;
                                    return (
                                      <div
                                        key={dup.uuid}
                                        className={`${styles.sacrificeItem} ${isSel ? styles.selectedSac : ''}`}
                                        style={{ borderColor: isSel ? '#fbbf24' : rc, color: rc }}
                                        onClick={() => toggleSacrifice(dup.uuid)}
                                      >
                                        {src
                                          ? <img 
                                              src={src} 
                                              alt="mat" 
                                              style={{ width: '68%', height: '68%', objectFit: 'contain', filter: `drop-shadow(0 0 5px ${rc}80)` }} 
                                              onError={(e) => { e.target.onerror = null; e.target.src = '/images/no_image.png'; }}
                                            />
                                          : <img 
                                              src="/images/no_image.png" 
                                              alt="no-image" 
                                              style={{ width: '68%', height: '68%', objectFit: 'contain', opacity: 0.5 }} 
                                            />
                                        }
                                        <span className={styles.sacLvl} style={{ borderColor: rc }}>
                                          Lv.{dup.level || 1}
                                        </span>
                                        {isSel && <div className={styles.sacCheck}>✓</div>}
                                      </div>
                                    );
                                  })}
                                  {(resources?.duplicateItems || []).length === 0 && (
                                    <div className={styles.noSacrifice}>
                                      {lang === 'vi' ? 'Không có vật liệu phù hợp' : 'No available materials'}
                                    </div>
                                  )}
                                </div>
                              </div>
                          }
                          <button
                            className={`${styles.mainBtn} ${styles.btnStarUp}`}
                            disabled={!canStarUp || isMaxStar}
                            onClick={handleStarUpClick}
                          >
                            ★ {lang === 'vi' ? 'ĐỘT PHÁ' : 'STAR UP'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* CRATE context */}
                {contextType === 'crate' && (
                  <div className={styles.btnGroupRow}>
                    <button
                      className={`${styles.mainBtn} ${styles.btnUpgrade}`}
                      disabled={(resources?.crates || 0) < 1}
                      onClick={() => actions.onOpen(1)}
                    >
                      {lang === 'vi' ? 'MỞ x1' : 'OPEN x1'}
                    </button>
                    <button
                      className={`${styles.mainBtn} ${styles.btnStarUp}`}
                      disabled={(resources?.crates || 0) < 10}
                      onClick={() => actions.onOpen(10)}
                    >
                      {lang === 'vi' ? 'MỞ x10' : 'OPEN x10'}
                    </button>
                  </div>
                )}

              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}