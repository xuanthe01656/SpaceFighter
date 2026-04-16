import React from 'react';
import { motion } from 'framer-motion';
import styles from './StageSelect.module.css';

export default function StageSelect({ gsRef, setScreen, lang }) {
  const progress = gsRef.current?.campaignData?.progress;
  if (!progress) return null;

  // Cấp độ cao nhất mà người chơi đã mở khóa
  const unlockedStage = progress.currentStage || 1;

  const stages = [
    { id: 1, name: { vi: 'Trạm Tiền Tiêu', en: 'Outpost Alpha' }, icon: '🪐' },
    { id: 2, name: { vi: 'Vành Đai Đá', en: 'Asteroid Belt' }, icon: '☄️' },
    { id: 3, name: { vi: 'Căn Cứ Bỏ Hoang', en: 'Abandoned Base' }, icon: '🛰️' },
    { id: 4, name: { vi: 'Hạm Đội Địch', en: 'Enemy Fleet' }, icon: '🛸' },
    { id: 5, name: { vi: 'Sào Huyệt Trùm', en: 'Boss Lair' }, isBoss: true, icon: '💀' },
  ];

  const handleSelectStage = (stageId) => {
    if (stageId <= unlockedStage) {
      // Lưu Ải được chọn để Tổng Hành Dinh đọc
      progress.selectedStage = stageId; 
      // Chuyển tới Tổng Hành Dinh (HQ)
      setScreen('hq'); 
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
  };

  const itemVariants = {
    hidden: { x: -50, opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } }
  };

  return (
    <motion.div 
      className={`${styles.container} scrollable-layer`}
      initial="hidden" animate="visible" variants={containerVariants}
    >
      <div className={styles.contentWrapper}>
        
        {/* HEADER & NÚT TRỞ VỀ HOME */}
        <motion.div variants={itemVariants} className={styles.header}>
          <button className={styles.backBtn} onClick={() => setScreen('campaign_portal')}>
            ◀ {lang === 'vi' ? 'SẢNH' : 'PORTAL'}
          </button>
          <h1 className={styles.title}>
            {lang === 'vi' ? 'BẢN ĐỒ KHU VỰC' : 'SECTOR MAP'}
          </h1>
        </motion.div>

        {/* DANH SÁCH ẢI (DẠNG ĐƯỜNG RAY TIMELINE) */}
        <div className={styles.mapContainer}>
          {/* Sợi dây năng lượng kết nối các hành tinh */}
          <div className={styles.pathLine}></div>

          {stages.map((stage) => {
            const isUnlocked = stage.id <= unlockedStage;
            const isBoss = stage.isBoss;
            
            // Phân loại CSS class dựa trên trạng thái của Ải
            let cardClass = styles.stageLocked;
            let iconClass = '';
            
            if (isUnlocked) {
              if (isBoss) {
                cardClass = `${styles.stageUnlocked} ${styles.stageBoss}`;
                iconClass = styles.bossIcon;
              } else {
                cardClass = styles.stageUnlocked;
                iconClass = styles.unlockedIcon;
              }
            }

            return (
              <motion.div 
                key={stage.id} variants={itemVariants}
                className={`${styles.stageCard} ${cardClass}`}
                onClick={() => handleSelectStage(stage.id)}
                whileTap={isUnlocked ? { scale: 0.95 } : {}}
              >
                {/* Biểu tượng Hành tinh / Boss */}
                <div className={`${styles.planetIcon} ${iconClass}`}>
                  {stage.icon}
                </div>

                {/* Thông tin Ải */}
                <div className={styles.stageInfo}>
                  <h2 className={`${styles.stageName} ${isBoss && isUnlocked ? styles.bossName : ''}`}>
                    {lang === 'vi' ? `ẢI ${stage.id}: ` : `STAGE ${stage.id}: `} {stage.name[lang]}
                  </h2>
                  
                  {isUnlocked ? (
                    <p className={`${styles.stageStatus} ${styles.statusReady}`}>
                      ▶ {lang === 'vi' ? 'Đã mở - Nhấn để cập bến' : 'Unlocked - Tap to dock'}
                    </p>
                  ) : (
                    <p className={styles.stageStatus}>
                      🔒 {lang === 'vi' ? 'Đang bị phong tỏa' : 'Sector Locked'}
                    </p>
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