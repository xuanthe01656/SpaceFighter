import React from 'react';
import { motion } from 'framer-motion';
// Nhớ thêm PLANET_STAGE_NAMES vào hàm import
import { PLANET_CONFIG, STAGE_CONFIG, PLANET_BOSSES, PLANET_STAGE_NAMES } from '../../constants';
import styles from './StageSelect.module.css';

export default function StageSelect({ gsRef, setScreen, lang }) {
  const progress = gsRef.current?.campaignData?.progress;
  if (!progress || !progress.currentPlanet) return null;

  const planetId = progress.currentPlanet;
  const planetData = PLANET_CONFIG[planetId];
  const pProgress = progress.planets[planetId] || { highestStage: 1, stars: {} };
  
  const unlockedStage = pProgress.highestStage || 1;
  const currentPlanetBosses = PLANET_BOSSES[planetId] || PLANET_BOSSES[1];

  const getStageBackground = (stageId, isBoss) => {
    if (!isBoss) {
      return `/images/stages/stage_default_p${planetId}.jpg`; 
    }
    return `/images/stages/boss_p${planetId}_stage${stageId}.jpg`; 
  };

  const stages = Array.from({ length: 10 }, (_, i) => {
    const sId = i + 1;
    const sConfig = STAGE_CONFIG[sId];
    const isBoss = sConfig.hasBoss;
    
    let thumbImg = '/images/icon_stage_normal.png'; 
    let bossName = '';
    
    // Lấy tên ải xịn xò từ điển (nếu không có thì trả về mặc định)
    const customNameObj = PLANET_STAGE_NAMES[planetId]?.[sId] || { vi: `Khu Vực ${sId}`, en: `Sector ${sId}` };
    const stageCustomName = customNameObj[lang];

    if (isBoss) {
       const bData = currentPlanetBosses[sConfig.bossType];
       thumbImg = bData?.imgSrc || '/images/icon_stage_boss.png';
       bossName = bData?.name?.[lang] || (lang === 'vi' ? 'TRÙM KHU VỰC' : 'SECTOR BOSS');
    }

    return {
      id: sId,
      isBoss: isBoss,
      thumbnail: thumbImg,
      stageCustomName: stageCustomName,
      bossName: bossName,
      bgImage: getStageBackground(sId, isBoss)
    };
  });

  const handleSelectStage = (stage) => {
    if (stage.id <= unlockedStage) {
      progress.selectedStage = stage.id; 
      gsRef.current.campaignData.currentStageBg = stage.bgImage;
      gsRef.current.gameMode = 'campaign'; 
      setScreen('hq'); 
    }
  };

  return (
    <motion.div className={`${styles.container} scrollable-layer`} initial={{opacity:0}} animate={{opacity:1}}>
      <div className={styles.contentWrapper}>
        
        {/* THANH ĐIỀU HƯỚNG BÂY GIỜ ĐÃ CỐ ĐỊNH TRÊN CÙNG */}
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => setScreen('galaxy_map')}>
            ◀ {lang === 'vi' ? 'THIÊN HÀ' : 'GALAXY'}
          </button>
          <h1 className={styles.title}>{planetData.name[lang]}</h1>
        </div>

        <div className={styles.mapContainer}>
          <div className={styles.pathLine}></div>

          {stages.map((stage) => {
            const isUnlocked = stage.id <= unlockedStage;
            const stars = pProgress.stars[stage.id] || 0;
            
            let cardClass = isUnlocked ? (stage.isBoss ? `${styles.stageUnlocked} ${styles.stageBoss}` : styles.stageUnlocked) : styles.stageLocked;

            return (
              <motion.div 
                key={stage.id} 
                className={`${styles.stageCard} ${cardClass}`} 
                onClick={() => handleSelectStage(stage)} 
                whileTap={isUnlocked ? { scale: 0.95 } : {}}
              >
                <div className={`${styles.thumbnailWrap} ${stage.isBoss ? styles.bossThumb : ''}`}>
                   {stage.thumbnail ? (
                     <img src={stage.thumbnail} alt="stage" className={styles.thumbImage} onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
                   ) : null}
                   <span className={styles.fallbackIcon} style={{ display: stage.thumbnail ? 'none' : 'block' }}>
                     {stage.isBoss ? '💀' : '🛰️'}
                   </span>
                </div>

                <div className={styles.stageInfo}>
                  <h2 className={`${styles.stageName} ${stage.isBoss && isUnlocked ? styles.bossNameText : ''}`}>
                    {/* Kết hợp ID Ải và Tên xịn xò */}
                    {lang === 'vi' ? `ẢI ${stage.id}: ${stage.stageCustomName}` : `STAGE ${stage.id}: ${stage.stageCustomName}`}
                  </h2>
                  
                  {stage.isBoss && isUnlocked && (
                    <div className={styles.bossTitleLabel}>⚠ {stage.bossName}</div>
                  )}

                  {isUnlocked ? (
                    <div className={styles.starRow}>
                      {stars >= 1 ? '★' : '☆'}{stars >= 2 ? '★' : '☆'}{stars >= 3 ? '★' : '☆'}
                    </div>
                  ) : (
                    <p className={styles.stageStatus}>🔒 {lang === 'vi' ? 'Chưa mở khóa' : 'Locked'}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}