import React from 'react';
// Lùi 2 cấp vì đang ở src/components/HQ/
import { PILOTS, AIRCRAFTS, GEAR_CATALOG } from '../../constants'; 
import styles from './HQ.module.css';

export default function HQ({ gsRef, setScreen, lang }) {
  const campaignData = gsRef.current?.campaignData;

  if (!campaignData) {
    return (
      <div className={`${styles.container} scrollable-layer`} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#66fcf1' }}>ĐANG TẢI DỮ LIỆU HQ...</h2>
      </div>
    );
  }

  const { progress, loadout, items } = campaignData;
  const currentPilot = PILOTS.find(p => p.id === loadout.pilot) || PILOTS[0];
  const currentAircraft = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];
  const mainGunItem = items[loadout.mainGun];
  const currentMainGun = mainGunItem ? GEAR_CATALOG.mainGun.find(g => g.id === mainGunItem.baseId) : null;

  return (
    // THÊM 'scrollable-layer' ĐỂ KHÔNG BỊ APP.JSX CHẶN VUỐT CUỘN
    <div className={`${styles.container} scrollable-layer`}>
      
      {/* HEADER */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => setScreen('portal')}>
          ◀ {lang === 'vi' ? 'TRỞ VỀ' : 'BACK'}
        </button>
        <h1 className={styles.title}>{lang === 'vi' ? 'TỔNG HÀNH DINH' : 'HEADQUARTERS'}</h1>
      </div>

      {/* LỰC CHIẾN */}
      <div className={styles.cpSection}>
        <p className={styles.cpTitle}>{lang === 'vi' ? 'LỰC CHIẾN TỔNG' : 'TOTAL COMBAT POWER'}</p>
        <h2 className={styles.cpValue}>⚔️ {progress.combatPower.toLocaleString()}</h2>
        <p className={styles.cpSub}>{lang === 'vi' ? `Ải cao nhất: ${progress.highestStage}` : `Highest Stage: ${progress.highestStage}`}</p>
      </div>

      {/* KHU VỰC TRƯNG BÀY */}
      <div className={styles.hangar}>
        <div className={styles.shipIcon}>🚀</div>
        <h3 className={styles.shipName}>{currentAircraft.name[lang]}</h3>
        <div className={styles.shipStats}>
           <span>❤️ HP: {currentAircraft.baseHp}</span>
           <span>🗡️ ATK: {currentAircraft.baseAtk}</span>
        </div>
        <div className={styles.pilotBox}>
          <p style={{ color: '#66fcf1', margin: '0 0 5px 0', fontSize: '18px' }}>👨‍🚀 {lang === 'vi' ? 'Phi công chỉ huy' : 'Commanding Pilot'}</p>
          <p style={{ color: '#fff', margin: 0, fontSize: '22px', fontWeight: 'bold' }}>{currentPilot.name[lang]}</p>
          <p style={{ color: '#FFD700', margin: '2px 0 0 0', fontSize: '14px' }}>{currentPilot.skillDesc[lang]}</p>
        </div>
      </div>

      {/* TRANG BỊ - Thêm class 'hq-interact' để xíu cấp phép bấm */}
      <div className={styles.loadoutSection}>
        <div className={`${styles.loadoutSlot} hq-interact`}>
           <p style={{ margin: '0 0 5px 0', color: '#c5c6c7', fontSize: '14px' }}>{lang === 'vi' ? 'SÚNG CHÍNH' : 'MAIN GUN'}</p>
           {currentMainGun ? (
             <>
               <div style={{ fontSize: '24px' }}>🔫</div>
               <div style={{ color: '#fff', fontSize: '14px' }}>{currentMainGun.name[lang]}</div>
               <div style={{ color: '#2ed573', fontSize: '12px' }}>Lv.{mainGunItem.level} (Atk: {currentMainGun.baseAtk})</div>
             </>
           ) : (
             <div style={{ color: '#555' }}>Trống</div>
           )}
        </div>
        <div className={`${styles.loadoutSlot} hq-interact`}>
           <p style={{ margin: '0 0 5px 0', color: '#c5c6c7', fontSize: '14px' }}>{lang === 'vi' ? 'SÚNG PHỤ' : 'WINGMAN'}</p>
           <div style={{ color: '#555', marginTop: '10px' }}>{lang === 'vi' ? 'Chưa trang bị' : 'Empty'}</div>
        </div>
      </div>

      {/* DANH SÁCH TÍNH NĂNG */}
      <div className={styles.actionBtns}>
        <button className={styles.btnBase} onClick={() => setScreen('inventory')}>
        📦 {lang === 'vi' ? 'KHO ĐỒ' : 'INVENTORY'}
        </button>
        <button className={styles.btnBase}>👨‍🚀 {lang === 'vi' ? 'PHI CÔNG' : 'PILOTS'}</button>
      </div>

      <button className={styles.launchBtn}>
        {lang === 'vi' ? '🔥 XUẤT KÍCH (Ải 1) 🔥' : '🔥 LAUNCH (Stage 1) 🔥'}
      </button>

    </div>
  );
}