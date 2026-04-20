import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ItemModal.module.css';

const Icons = {
  Coin: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>),
  Gem: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 22 2 9 6 2 18 2 22 9 12 22" /><line x1="2" y1="9" x2="22" y2="9" /><line x1="12" y1="22" x2="8" y2="9" /><line x1="12" y1="22" x2="16" y2="9" /><line x1="8" y1="9" x2="6" y2="2" /><line x1="16" y1="9" x2="18" y2="2" /></svg>),
  Blueprint: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="7" r="1.5" /><path d="M12 8.5L8.5 17" /><path d="M12 8.5L15.5 17" /><path d="M10 14h4" /></svg>),
  Sacrifice: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  Gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
};

const RadarChart = ({ stats }) => {
  const size = 200, center = size / 2, radius = 80;
  const angles = [0, 72, 144, 216, 288].map(deg => (deg - 90) * (Math.PI / 180));
  
  const drawPolygon = (r) => {
    const points = angles.map(a => `${center + r * Math.cos(a)},${center + r * Math.sin(a)}`).join(' ');
    return <polygon points={points} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
  };

  const dataPoints = stats.map((val, i) => {
    const r = (val / 100) * radius;
    return `${center + r * Math.cos(angles[i])},${center + r * Math.sin(angles[i])}`;
  }).join(' ');

  const labels = ['ATK', 'HP', 'SPD', 'CRT', 'RNG'];

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
      {[0.3, 0.6, 1].map(scale => drawPolygon(radius * scale))}
      {angles.map((a, i) => <line key={i} x1={center} y1={center} x2={center + radius * Math.cos(a)} y2={center + radius * Math.sin(a)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />)}
      <polygon points={dataPoints} fill="rgba(56, 189, 248, 0.4)" stroke="#38bdf8" strokeWidth="2" />
      {angles.map((a, i) => (
        <text key={`l-${i}`} x={center + (radius + 15) * Math.cos(a)} y={center + (radius + 15) * Math.sin(a)} fill="#888" fontSize="10" textAnchor="middle" alignmentBaseline="middle">{labels[i]}</text>
      ))}
    </svg>
  );
};

export default function ItemModal({ 
  isOpen, onClose, item, baseInfo, contextType, 
  resources, // { coins, diamonds, blueprints, duplicateItems, crates }
  actions,   
  isEquipped, lang 
}) {
  const [forgeTab, setForgeTab] = useState('upgrade'); 
  const [selectedSacrificeId, setSelectedSacrificeId] = useState(null); // State lưu phôi được chọn

  // Tự động chọn phôi "cùi" nhất (đứng đầu danh sách) khi mở tab Đột Phá
  useEffect(() => { 
    if (isOpen) setForgeTab('upgrade'); 
  }, [isOpen]);

  useEffect(() => {
    if (forgeTab === 'starUp' && resources.duplicateItems?.length > 0) {
      setSelectedSacrificeId(resources.duplicateItems[0].uuid);
    }
  }, [forgeTab, resources.duplicateItems]);

  if (!isOpen || !item) return null;

  const isCrate = item.shopType === 'crate';
  const itemName = isCrate ? item.title[lang] : baseInfo?.name?.[lang] || '???';
  
  // LOGIC TÍNH TOÁN 5 CHỈ SỐ THỰC TẾ
  const isAircraft = item?.type === 'aircraft';
  const baseAtk = baseInfo?.baseAtk || 0;
  const baseHp  = baseInfo?.baseHp || 0;
  const curSpd = baseInfo?.spd || (isAircraft ? 70 : 40);
  const curCrt = baseInfo?.crt || (isAircraft ? 20 : 5);
  const curRng = baseInfo?.rng || (isAircraft ? 80 : 50);

  const currentAtk = baseAtk + (item.level * 3);
  const currentHp  = baseHp + (item.level * 15);

  const radarStats = isCrate ? [50, 50, 50, 50, 50] : [
    Math.min(100, (currentAtk / 500) * 100), 
    Math.min(100, (currentHp / 2000) * 100), 
    curSpd, curCrt * 2, curRng
  ];

  const upCoinCost = !isCrate ? item.level * 150 : 0;
  const upBpCost = !isCrate ? Math.ceil(item.level * 1.5) : 0;
  const starGemCost = !isCrate ? (item.rarity || 1) * 100 : 0;
  
  const canUpgrade = resources.coins >= upCoinCost && resources.blueprints >= upBpCost;
  // Cho phép đập sao khi đủ kim cương VÀ người chơi đã chọn 1 phôi
  const canStarUp = resources.diamonds >= starGemCost && !!selectedSacrificeId;

  const renderRangeBar = (label, currentVal, nextVal, maxVal) => {
    const curPct = Math.min(100, (currentVal / maxVal) * 100);
    const nextPct = nextVal ? Math.min(100, ((nextVal - currentVal) / maxVal) * 100) : 0;
    
    return (
      <div className={styles.statRow}>
        <div className={styles.statHeader}>
          <span>{label}</span>
          <span className={styles.statValue}>
            {currentVal} {nextVal && contextType === 'forge' && forgeTab === 'upgrade' && <span className={styles.up}>➞ {nextVal}</span>}
          </span>
        </div>
        <div className={styles.rangeTrack}>
          <div className={styles.rangeFill} style={{ width: `${curPct}%` }} />
          {nextVal && contextType === 'forge' && forgeTab === 'upgrade' && (
            <div className={styles.rangeBonus} style={{ width: `${nextPct}%` }} />
          )}
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.overlay}>
        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className={styles.modal}>
          
          <div className={styles.header}>
            <h2 className={styles.title}>{itemName}</h2>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>

          <div className={styles.content}>
            {/* CỘT TRÁI */}
            <div className={styles.leftCol}>
              <div className={styles.previewWrap}>
                <span className={styles.previewIcon}>{isCrate ? item.icon : (baseInfo?.imgSrc ? <img src={baseInfo.imgSrc} width="100%" /> : '🚀')}</span>
              </div>
              <div className={styles.radarContainer}><RadarChart stats={radarStats} /></div>
            </div>

            {/* CỘT PHẢI */}
            <div className={styles.rightCol}>
              
              {contextType === 'forge' && !isCrate && (
                <div className={styles.forgeTabs}>
                  <button className={`${styles.fTab} ${forgeTab === 'upgrade' ? styles.active : ''}`} onClick={() => setForgeTab('upgrade')}>⬆ NÂNG CẤP</button>
                  <button className={`${styles.fTab} ${forgeTab === 'starUp' ? styles.active : ''}`} onClick={() => setForgeTab('starUp')}>★ ĐỘT PHÁ</button>
                </div>
              )}

              <div className={styles.statsBox}>
                {isCrate ? (
                    <p style={{ color: '#aaa', margin: 0 }}>{item.desc[lang]}</p>
                ) : (
                    <div className={styles.statsGrid}>
                    {renderRangeBar(lang === 'vi' ? 'HỎA LỰC' : 'ATTACK', currentAtk, contextType === 'forge' && forgeTab === 'upgrade' ? currentAtk + 5 : null, 800)}
                    {renderRangeBar(lang === 'vi' ? 'GIÁP TRỤ' : 'SHIELD', currentHp, contextType === 'forge' && forgeTab === 'upgrade' ? currentHp + 25 : null, 3000)}
                    {renderRangeBar(lang === 'vi' ? 'TỐC ĐỘ' : 'SPEED', curSpd, null, 100)}
                    {renderRangeBar(lang === 'vi' ? 'CHÍ MẠNG' : 'CRIT %', curCrt, null, 50)}
                    {renderRangeBar(lang === 'vi' ? 'TẦM BẮN' : 'RANGE', curRng, null, 100)}
                    </div>
                )}
              </div>

              {contextType === 'forge' && forgeTab === 'upgrade' && (
                <div className={styles.requirements}>
                  <div className={`${styles.reqItem} ${resources.coins < upCoinCost ? styles.insufficient : ''}`}><span className={styles.reqIcon} style={{color:'#fb923c'}}><Icons.Coin/></span> Xu: {resources.coins.toLocaleString()} / {upCoinCost}</div>
                  <div className={`${styles.reqItem} ${resources.blueprints < upBpCost ? styles.insufficient : ''}`}><span className={styles.reqIcon} style={{color:'#00ff88'}}><Icons.Blueprint/></span> Bản vẽ: {resources.blueprints.toLocaleString()} / {upBpCost}</div>
                </div>
              )}

              {/* GIAO DIỆN CHỌN PHÔI ĐỘT PHÁ */}
              {contextType === 'forge' && forgeTab === 'starUp' && (
                <div className={styles.requirements}>
                  <div className={`${styles.reqItem} ${resources.diamonds < starGemCost ? styles.insufficient : ''}`}>
                    <span className={styles.reqIcon} style={{color:'#38bdf8'}}><Icons.Gem/></span> 
                    Kim Cương: {resources.diamonds.toLocaleString()} / {starGemCost}
                  </div>
                  
                  <div className={styles.reqItem} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '5px' }}>
                      <span className={styles.reqIcon} style={{color:'#facc15'}}><Icons.Sacrifice/></span> 
                      {lang === 'vi' ? 'Chọn 1 vật phẩm cùng loại để hiến tế:' : 'Select 1 duplicate to sacrifice:'}
                    </div>
                    
                    {resources.duplicateItems?.length > 0 ? (
                      <div className={styles.sacGrid}>
                      {resources.duplicateItems.map(dup => (
                        <div 
                          key={dup.uuid} 
                          className={`${styles.sacCard} ${selectedSacrificeId === dup.uuid ? styles.sacActive : ''}`}
                          onClick={() => setSelectedSacrificeId(dup.uuid)}
                        >
                          {/* THÊM KHUNG HÌNH ẢNH VÀO ĐÂY */}
                          <div className={styles.sacImageWrap}>
                            {baseInfo?.imgSrc ? (
                              <img src={baseInfo.imgSrc} alt="sacrifice" className={styles.sacImage} />
                            ) : (
                              <span>🚀</span>
                            )}
                          </div>
                          
                          <span className={styles.sacLv}>LV {dup.level}</span>
                          <span className={styles.sacRarity}>{'★'.repeat(dup.rarity || 1)}</span>
                        </div>
                      ))}
                    </div>
                    ) : (
                      <span className={styles.insufficient} style={{ fontSize: '13px', marginLeft: '30px' }}>
                        {lang === 'vi' ? '(Không tìm thấy vật phẩm cùng loại trong kho)' : '(No duplicate items found)'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* CÁC NÚT BẤM (Gửi ID phôi lên khi bấm Đột phá) */}
              <div className={styles.actionZone}>
                {contextType === 'bag' && (
                  <>
                    <button className={`${styles.mainBtn} ${isEquipped ? styles.btnUnequip : styles.btnEquip}`} onClick={() => { actions.onEquip(); onClose(); }}>
                      {isEquipped ? (lang === 'vi' ? 'THÁO TRANG BỊ' : 'UNEQUIP') : (lang === 'vi' ? 'MẶC TRANG BỊ' : 'EQUIP')}
                    </button>
                    <button className={`${styles.mainBtn} ${styles.btnForge}`} onClick={() => { actions.onGoToForge(); onClose(); }}>
                      ⟿ {lang === 'vi' ? 'ĐẾN XƯỞNG RÈN' : 'GO TO FORGE'}
                    </button>
                  </>
                )}

                {contextType === 'forge' && (
                  <>
                    {forgeTab === 'upgrade' ? (
                       <button className={`${styles.mainBtn} ${styles.btnUpgrade}`} disabled={!canUpgrade} onClick={actions.onUpgrade}>⬆ {lang === 'vi' ? 'TIẾN HÀNH RÈN' : 'UPGRADE'}</button>
                    ) : (
                       <button className={`${styles.mainBtn} ${styles.btnStarUp}`} disabled={!canStarUp || item.rarity >= 5} onClick={() => actions.onStarUp(selectedSacrificeId)}>
                         ★ {item.rarity >= 5 ? 'MAX SAO' : 'ĐỘT PHÁ'}
                       </button>
                    )}
                  </>
                )}

                {contextType === 'crate' && (
                  <>
                    <button className={`${styles.mainBtn} ${styles.btnUpgrade}`} disabled={resources.crates < 1} onClick={() => actions.onOpen(1)}>MỞ x1</button>
                    <button className={`${styles.mainBtn} ${styles.btnStarUp}`} disabled={resources.crates < 10} onClick={() => actions.onOpen(10)}>MỞ x10</button>
                  </>
                )}
                {contextType === 'shop' && (
                    <button className={`${styles.mainBtn} ${styles.btnBuy}`} disabled={!actions.canBuy} onClick={() => { actions.onBuy(); onClose(); }}>🛒 MUA NGAY</button>
                )}
              </div>

            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}