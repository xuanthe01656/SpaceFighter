import React from 'react';
import { motion } from 'framer-motion';
import { PLANET_CONFIG } from '../../constants';
import styles from './StageSelect.module.css';

export default function StageSelect({ gsRef, setScreen, lang }) {
  const progress = gsRef.current?.campaignData?.progress;
  if (!progress || !progress.currentPlanet) return null;

  const planetId = progress.currentPlanet;
  const planetData = PLANET_CONFIG[planetId];
  const pProgress = progress.planets[planetId] || { highestStage: 1, stars: {} };
  
  // Ải cao nhất mở được trong TINH CẦU NÀY
  const unlockedStage = pProgress.highestStage || 1;

  // Tạo mảng 10 ải ảo
  const stages = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    isBoss: i + 1 === 5 || i + 1 === 10
  }));

  const handleSelectStage = (stageId) => {
    if (stageId <= unlockedStage) {
      progress.selectedStage = stageId; 
      setScreen('hq'); 
    }
  };

  return (
    <motion.div className={`${styles.container} scrollable-layer`} initial={{opacity:0}} animate={{opacity:1}}>
      <div className={styles.contentWrapper}>
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
            let iconClass = isUnlocked ? (stage.isBoss ? styles.bossIcon : styles.unlockedIcon) : '';

            return (
              <motion.div key={stage.id} className={`${styles.stageCard} ${cardClass}`} onClick={() => handleSelectStage(stage.id)} whileTap={isUnlocked ? { scale: 0.95 } : {}}>
                <div className={`${styles.planetIcon} ${iconClass}`}>{stage.isBoss ? '💀' : '🛰️'}</div>
                <div className={styles.stageInfo}>
                  <h2 className={`${styles.stageName} ${stage.isBoss && isUnlocked ? styles.bossName : ''}`}>
                    {lang === 'vi' ? `ẢI ${stage.id}` : `STAGE ${stage.id}`}
                  </h2>
                  {isUnlocked ? (
                    <div style={{ color: '#facc15', fontSize: '20px', marginTop: '5px' }}>
                      {stars >= 1 ? '★' : '☆'}{stars >= 2 ? '★' : '☆'}{stars >= 3 ? '★' : '☆'}
                    </div>
                  ) : (
                    <p className={styles.stageStatus}>🔒 {lang === 'vi' ? 'Phong tỏa' : 'Locked'}</p>
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