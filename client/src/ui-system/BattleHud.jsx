/** Common screen-space battle HUD for Guest Campaign and verified C15 PvE.
 * Props are presentation snapshots only. This component never modifies combat
 * simulation, progress, Firestore or reward authority. */
import React from 'react';
import './GameUiTokens.css';
import styles from './BattleHud.module.css';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export default function BattleHud({lang='vi',stage=1,wave=1,wavesTotal=5,hp=0,maxHp=1,
  kills=0,score=null,bossHp=null,bossMaxHp=null,qa=null}){
  const vi=lang==='vi';
  const ratio=clamp(number(hp)/Math.max(1,number(maxHp,1)),0,1);
  const bossActive=bossHp!==null&&number(bossMaxHp)>0;
  const bossRatio=bossActive?clamp(number(bossHp)/number(bossMaxHp),0,1):0;
  return <header className={styles.hud} aria-label={vi?'Thông tin trận chiến':'Battle status'}>
    <div className={styles.hudTop}>
      <div className={styles.mode}>
        <span className={styles.modeLabel}>{vi?'Chiến dịch Alpha':'Alpha Campaign'}</span>
        <span className={styles.modeSub}>{vi?`MÀN ${String(stage).padStart(2,'0')} · CHIẾN DỊCH`:
          `STAGE ${String(stage).padStart(2,'0')} · CAMPAIGN`}</span>
      </div>
      <div className={styles.wave}><small>{vi?'Đợt':'Wave'}</small>
        <strong>{Math.max(1,number(wave,1))}/{Math.max(1,number(wavesTotal,5))}</strong></div>
    </div>
    <div className={styles.hp}>
      <span className={styles.hpTitle}>{vi?'GIÁP':'ARMOR'}</span>
      <div className={styles.hpBlocks} role="meter" aria-label={vi?'Giáp còn lại':'Remaining armor'}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio*100)}>
        {Array.from({length:10},(_,i)=><div key={i} aria-hidden="true"
          className={`${styles.hpSegment} ${ratio*10>i?styles.hpSegmentOn:''}`}/>)}
      </div>
      <span className={styles.hpValue}>{Math.max(0,Math.round(number(hp)))}/{Math.max(1,Math.round(number(maxHp,1)))}</span>
    </div>
    <div className={styles.hudStats}>
      <span className={styles.stat}>{vi?'HẠ GỤC':'KILLS'} <strong>{Math.max(0,Math.round(number(kills)))}</strong></span>
      {score!==null&&<span className={styles.stat}>{vi?'ĐIỂM':'SCORE'} <strong>{Math.max(0,Math.round(number(score)))}</strong></span>}
      {qa&&<span className={styles.stat}>{qa}</span>}
    </div>
    {bossActive&&<div className={styles.boss}>
      <span className={styles.bossLabel}>BOSS</span>
      <div className={styles.bossRail} role="meter" aria-label="Boss HP" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(bossRatio*100)}><div className={styles.bossFill} style={{width:`${bossRatio*100}%`}}/></div>
    </div>}
  </header>;
}
