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
  resources, actions, isEquipped, lang, starUpInfo 
}) {
  const [forgeTab, setForgeTab] = useState('upgrade'); 
  const [selectedSacrifices, setSelectedSacrifices] = useState([]); // ĐÃ SỬA THÀNH MẢNG ĐỂ CHỌN NHIỀU PHÔI
  const [upgradingState, setUpgradingState] = useState(0); 

  // Reset tab và phôi khi mở Modal
  useEffect(() => { 
    if (isOpen) {
      setForgeTab('upgrade');
      setSelectedSacrifices([]);
    }
  }, [isOpen]);

  // Tự động chọn sẵn phôi rác
  useEffect(() => {
    if (forgeTab === 'starUp' && resources.duplicateItems?.length > 0 && starUpInfo?.reqDupes > 0) {
      const autoSelect = resources.duplicateItems.slice(0, starUpInfo.reqDupes).map(i => i.uuid);
      setSelectedSacrifices(autoSelect);
    } else {
      setSelectedSacrifices([]);
    }
  }, [forgeTab, resources.duplicateItems, starUpInfo]);

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

  // Khai báo đủ các biến chỉ số Nâng Cấp
  const upAtkPlus = 5;
  const upHpPlus = 25;
  const upSpdPlus = 0; 
  const upCrtPlus = 0;
  const upRngPlus = 0;

  // Khai báo đủ các biến chỉ số Đột Phá
  const starAtkPlus = Math.round(currentAtk * 0.15);
  const starHpPlus = Math.round(currentHp * 0.15);
  const starSpdPlus = Math.round(curSpd * 0.15);
  const starCrtPlus = Math.round(curCrt * 0.15);
  const starRngPlus = Math.round(curRng * 0.15);

  // Xác định số hiển thị "Next" dựa vào Tab đang mở
  const isUpTab = contextType === 'forge' && forgeTab === 'upgrade';
  const isStarTab = contextType === 'forge' && forgeTab === 'starUp';

  const nextAtk = isUpTab ? currentAtk + upAtkPlus : (isStarTab ? currentAtk + starAtkPlus : null);
  const nextHp = isStarTab ? currentHp + starHpPlus : (isUpTab ? currentHp + upHpPlus : null);
  const nextSpd = isStarTab ? curSpd + starSpdPlus : (isUpTab ? curSpd + upSpdPlus : null);
  const nextCrt = isStarTab ? curCrt + starCrtPlus : (isUpTab ? curCrt + upCrtPlus : null);
  const nextRng = isStarTab ? curRng + starRngPlus : (isUpTab ? curRng + upRngPlus : null);
  
  const radarStats = isCrate ? [50, 50, 50, 50, 50] : [
    Math.min(100, (currentAtk / 500) * 100), 
    Math.min(100, (currentHp / 2000) * 100), 
    nextSpd || curSpd, nextCrt || curCrt * 2, nextRng || curRng
  ];

  // TÍNH TOÁN CHI PHÍ
  const upCoinCost = !isCrate ? item.level * 150 : 0;
  const upGemCost = !isCrate ? Math.ceil(upCoinCost / 100) : 0;
  const upBpCost = !isCrate ? Math.ceil(item.level * 1.5) : 0;

  // LOGIC OR (HOẶC XU HOẶC KIM CƯƠNG) CHO NÂNG CẤP
  const hasEnoughCoinForUp = resources.coins >= upCoinCost;
  const hasEnoughGemForUp = resources.diamonds >= upGemCost;
  const hasEnoughCurrencyForUp = hasEnoughCoinForUp || hasEnoughGemForUp; 
  const canUpgrade = hasEnoughCurrencyForUp && resources.blueprints >= upBpCost;

  // LOGIC OR (HOẶC XU HOẶC KIM CƯƠNG) CHO ĐỘT PHÁ
  const hasEnoughCoinForStar = resources.coins >= (starUpInfo?.coinCost || 0);
  const hasEnoughGemForStar = resources.diamonds >= (starUpInfo?.gemCost || 0);
  const hasEnoughCurrencyForStar = hasEnoughCoinForStar || hasEnoughGemForStar; 
  const canStarUp = hasEnoughCurrencyForStar && selectedSacrifices.length === (starUpInfo?.reqDupes || 1);

  // HÀM CHỌN PHÔI (Cho phép chọn nhiều)
  const toggleSacrifice = (uuid) => {
    setSelectedSacrifices(prev => {
      if (prev.includes(uuid)) return prev.filter(id => id !== uuid);
      if (prev.length < (starUpInfo?.reqDupes || 1)) return [...prev, uuid];
      return prev;
    });
  };

  // HÀM CHẠY ĐỘT PHÁ (FO4 Style)
  const executeStarUp = () => {
    let hasWarning = false;
    for (const id of selectedSacrifices) {
      const sac = resources.duplicateItems.find(i => i.uuid === id);
      if (sac && ((sac.rarity || 1) >= (item.rarity || 1) || (sac.level || 1) > 1)) {
        hasWarning = true; break;
      }
    }

    if (hasWarning) {
      const msg = lang === 'vi' ? `⚠️ CẢNH BÁO: Trong danh sách có phôi cấp cao hoặc độ hiếm cao. Chắc chắn hủy?` : `⚠️ WARNING: High tier items selected. Consume?`;
      if (!window.confirm(msg)) return;
    }

    setUpgradingState(1);
    setTimeout(() => {
      const success = actions.onStarUp(selectedSacrifices); // Truyền MẢNG vào hàm xử lý
      setUpgradingState(success ? 2 : 3);
      setTimeout(() => {
        setUpgradingState(0);
        if (success) onClose();
        else setSelectedSacrifices([]);
      }, 2500);
    }, 3000); 
  };

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
          
          {upgradingState > 0 && (
            <div className={styles.fo4Overlay}>
              <div className={styles.fo4Content}>
                <div className={`${styles.fo4Icon} ${upgradingState === 1 ? styles.fo4Pulsing : ''} ${upgradingState === 2 ? styles.fo4SuccessAnim : ''} ${upgradingState === 3 ? styles.fo4FailAnim : ''}`}>
                  <img src={baseInfo?.imgSrc} alt="upgrade" />
                </div>
                {upgradingState === 1 && (
                  <>
                    <div className={styles.fo4Text}>{lang === 'vi' ? 'ĐANG DUNG HỢP VẬT CHẤT...' : 'FUSING MATTER...'}</div>
                    <div className={styles.fo4BarWrap}><div className={styles.fo4BarFill} /></div>
                  </>
                )}
                {upgradingState === 2 && <div className={styles.fo4ResultSuccess}>{lang === 'vi' ? 'ĐỘT PHÁ THÀNH CÔNG!' : 'UPGRADE SUCCESS!'}</div>}
                {upgradingState === 3 && <div className={styles.fo4ResultFail}>{lang === 'vi' ? 'THẤT BẠI - PHÔI BỊ PHÁ HỦY' : 'FAILED - SACRIFICE LOST'}</div>}
              </div>
            </div>
          )}

          <div className={styles.header}>
            <div className={styles.titleArea}>
              <h2 className={styles.title}>{itemName}</h2>
              {!isCrate && (
                <div className={styles.itemBadges}>
                  <span className={styles.lvlBadge}>LV.{item.level}</span>
                  <span className={styles.rarityBadge}>{'★'.repeat(item.rarity || 1)}</span>
                </div>
              )}
            </div>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>

          <div className={styles.content}>
            <div className={styles.leftCol}>
              <div className={styles.previewWrap}>
                <span className={styles.previewIcon}>{isCrate ? item.icon : (baseInfo?.imgSrc ? <img src={baseInfo.imgSrc} width="100%" /> : '🚀')}</span>
              </div>
              <div className={styles.radarContainer}><RadarChart stats={radarStats} /></div>
            </div>

            <div className={styles.rightCol}>
              
              {contextType === 'forge' && !isCrate && (
                <div className={styles.forgeTabs}>
                  <button className={`${styles.fTab} ${forgeTab === 'upgrade' ? styles.active : ''}`} onClick={() => setForgeTab('upgrade')}>⬆ NÂNG CẤP</button>
                  <button className={`${styles.fTab} ${forgeTab === 'starUp' ? styles.active : ''}`} onClick={() => setForgeTab('starUp')}>★ ĐỘT PHÁ</button>
                </div>
              )}

              {isStarTab && (
                <div className={styles.starPreviewHeader}>
                   <span className={styles.oldStars}>{(item.rarity || 1)}★</span>
                   <span className={styles.starArrow}>➞</span>
                   <span className={styles.newStars}>{(item.rarity || 1) + 1}★</span>
                </div>
              )}

              <div className={styles.statsBox}>
                <div className={styles.statsGrid}>
                  {renderRangeBar(lang === 'vi' ? 'HỎA LỰC' : 'ATTACK', currentAtk, nextAtk, 1000)}
                  {renderRangeBar(lang === 'vi' ? 'GIÁP TRỤ' : 'SHIELD', currentHp, nextHp, 3000)}
                  {renderRangeBar(lang === 'vi' ? 'TỐC ĐỘ' : 'SPEED', curSpd, null, 100)}
                  {renderRangeBar(lang === 'vi' ? 'CHÍ MẠNG' : 'CRIT %', curCrt, null, 50)}
                  {renderRangeBar(lang === 'vi' ? 'TẦM BẮN' : 'RANGE', curRng, null, 100)}
                </div>
              </div>

              {/* YÊU CẦU NÂNG CẤP */}
              {contextType === 'forge' && forgeTab === 'upgrade' && (
                <div className={styles.requirements}>
                  <div className={`${styles.reqItem} ${!hasEnoughCurrencyForUp ? styles.insufficient : ''}`}>
                    <span>{lang === 'vi' ? 'Chi phí:' : 'Cost:'}</span>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '5px', alignItems: 'center' }}>
                      {/* Đã sửa hiển thị Dạng Hiện tại / Yêu cầu (VD: 5000 / 150) */}
                      <span style={{ color: hasEnoughCoinForUp ? '#fb923c' : '#ff4757' }}>
                        <span className={styles.reqIcon}><Icons.Coin/></span> {resources.coins.toLocaleString()} / {upCoinCost.toLocaleString()} 
                      </span>
                      <span style={{ color: '#888', fontSize: '11px' }}> HOẶC </span>
                      <span style={{ color: (!hasEnoughCoinForUp && hasEnoughGemForUp) ? '#38bdf8' : '#888' }}>
                        <span className={styles.reqIcon}><Icons.Gem/></span> {resources.diamonds.toLocaleString()} / {upGemCost.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className={`${styles.reqItem} ${resources.blueprints < upBpCost ? styles.insufficient : ''}`}>
                    <span className={styles.reqIcon} style={{color:'#00ff88'}}><Icons.Blueprint/></span> Bản vẽ: {resources.blueprints.toLocaleString()} / {upBpCost.toLocaleString()}
                  </div>
                </div>
              )}

              {/* YÊU CẦU ĐỘT PHÁ */}
              {contextType === 'forge' && forgeTab === 'starUp' && (
                <div className={styles.requirements}>
                  <div className={styles.reqItem}>
                    <span className={styles.reqIcon} style={{color:'#2ed573'}}>⚝</span> 
                    {lang === 'vi' ? 'Tỷ lệ thành công:' : 'Success Rate:'} 
                    <span className={styles.rateText} style={{marginLeft: '8px', color: starUpInfo?.rate === 100 ? '#2ed573' : (starUpInfo?.rate >= 50 ? '#facc15' : '#ff4757')}}>
                      {starUpInfo?.rate}%
                    </span>
                  </div>
                  
                  <div className={`${styles.reqItem} ${!hasEnoughCurrencyForStar ? styles.insufficient : ''}`}>
                    <span>{lang === 'vi' ? 'Chi phí:' : 'Cost:'}</span>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '5px', alignItems: 'center' }}>
                      {/* Đã sửa hiển thị Dạng Hiện tại / Yêu cầu */}
                      <span style={{ color: hasEnoughCoinForStar ? '#fb923c' : '#ff4757' }}>
                        <span className={styles.reqIcon}><Icons.Coin/></span> {resources.coins.toLocaleString()} / {(starUpInfo?.coinCost || 0).toLocaleString()} 
                      </span>
                      <span style={{ color: '#888', fontSize: '11px' }}> HOẶC </span>
                      <span style={{ color: (!hasEnoughCoinForStar && hasEnoughGemForStar) ? '#38bdf8' : '#888' }}>
                        <span className={styles.reqIcon}><Icons.Gem/></span> {resources.diamonds.toLocaleString()} / {(starUpInfo?.gemCost || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className={styles.reqItem} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '5px' }}>
                      <span className={styles.reqIcon} style={{color:'#facc15'}}><Icons.Sacrifice/></span> 
                      {lang === 'vi' ? `Chọn phôi (${selectedSacrifices.length}/${starUpInfo?.reqDupes}):` : `Sacrifices (${selectedSacrifices.length}/${starUpInfo?.reqDupes}):`}
                    </div>
                    
                    {resources.duplicateItems?.length > 0 ? (
                      <div className={styles.sacGrid}>
                        {resources.duplicateItems.map(dup => {
                          const isSelected = selectedSacrifices.includes(dup.uuid);
                          return (
                            <div 
                              key={dup.uuid} 
                              className={`${styles.sacCard} ${isSelected ? styles.sacActive : ''}`}
                              onClick={() => toggleSacrifice(dup.uuid)}
                            >
                              <div className={styles.sacImageWrap}>
                                {baseInfo?.imgSrc ? <img src={baseInfo.imgSrc} alt="sacrifice" className={styles.sacImage} /> : <span>🚀</span>}
                              </div>
                              <span className={styles.sacLv}>LV {dup.level}</span>
                              <span className={styles.sacRarity}>{'★'.repeat(dup.rarity || 1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className={styles.insufficient} style={{ fontSize: '13px', marginLeft: '30px' }}>
                        {lang === 'vi' ? '(Không tìm thấy vật phẩm cùng loại trong kho)' : '(No duplicate items found)'}
                      </span>
                    )}
                  </div>
                </div>
              )}

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
                       <button className={`${styles.mainBtn} ${styles.btnStarUp}`} disabled={!canStarUp || item.rarity >= 5} onClick={executeStarUp}>
                         ★ {item.rarity >= 5 ? 'MAX SAO' : 'ĐỘT PHÁ'}
                       </button>
                    )}
                    <button style={{flex: 1}} className={`${styles.mainBtn} ${styles.btnBuy}`} onClick={() => { if(actions.onGoToShop) actions.onGoToShop(); onClose(); }}>
                        🛒 {lang === 'vi' ? 'MUA VẬT PHẨM' : 'BUY ITEMS'}
                    </button>
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