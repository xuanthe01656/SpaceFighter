/**
 * SpaceFighter — Tactical HUD: notch clearance refined (F12 candidate).
 * One presentation-only HUD for Guest and C15. The top-centre opening reserves
 * space for a camera notch / Dynamic Island; the OS owns the actual cutout.
 * No combat, rewards or network state is produced here.
 */
import React, { useEffect, useState } from 'react';
import { normalizeBattleNotice } from './BattleNoticeModel.js';
import './GameUiTokens.css';
import styles from './BattleHud.module.css';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.max(0, Math.round(finite(value, fallback)));

/** Purely decorative. The middle of the upper rail is OPEN, not a black mask. */
function CommandFrame() {
  return <svg className={styles.frameArt} viewBox="0 0 400 142" preserveAspectRatio="none"
    aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="sf-hud-edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8afaff"/><stop offset=".45" stopColor="#08c9e8"/><stop offset="1" stopColor="#116c91"/>
      </linearGradient>
      <linearGradient id="sf-hud-amber" x1="0" y1="0" x2="1" y2="0">
        <stop stopColor="#ffcf65"/><stop offset=".6" stopColor="#ff9319"/><stop offset="1" stopColor="#c45b05"/>
      </linearGradient>
    </defs>
    <g fill="none" strokeLinejoin="miter" strokeLinecap="square">
      {/* Two independent top shoulders leave a physical void for notch / island. */}
      <path d="M5 53 V24 L20 7 H118 L146 40" stroke="#164c62" strokeWidth="6"/>
      <path d="M395 53 V24 L380 7 H282 L254 40" stroke="#164c62" strokeWidth="6"/>
      <path d="M5 53 V24 L20 7 H118 L146 40" stroke="url(#sf-hud-edge)" strokeWidth="1.8"/>
      <path d="M395 53 V24 L380 7 H282 L254 40" stroke="url(#sf-hud-edge)" strokeWidth="1.8"/>
      <path d="M17 31 L29 15 H115 L130 29" stroke="url(#sf-hud-amber)" strokeWidth="2.9"/>
      <path d="M383 31 L371 15 H285 L270 29" stroke="url(#sf-hud-amber)" strokeWidth="2.9"/>
      <path d="M23 39 H64 M336 39 H377" stroke="#1aa4b8" strokeWidth="1"/>
      {/* Side instruments frame the centre without crossing the upper safe gap. */}
      <path d="M5 52 H83 L104 70 L87 102 H7 L3 92 V65 Z" stroke="url(#sf-hud-edge)" strokeWidth="1.9"/>
      <path d="M395 52 H317 L296 70 L313 102 H393 L397 92 V65 Z" stroke="url(#sf-hud-edge)" strokeWidth="1.9"/>
      <path d="M10 57 H80 L97 72 M390 57 H320 L303 72" stroke="url(#sf-hud-amber)" strokeWidth="2.2"/>
      {/* The centre shield module begins BELOW the notch void (~y 42). */}
      <path d="M107 52 H293 L309 72 V103 L286 132 H114 L91 103 V72 Z" stroke="#0a4c65" strokeWidth="7"/>
      <path d="M107 52 H293 L309 72 V103 L286 132 H114 L91 103 V72 Z" stroke="url(#sf-hud-edge)" strokeWidth="1.8"/>
      <path d="M122 58 H278 M115 115 H285" stroke="#63eefa" strokeWidth=".75" strokeOpacity=".48"/>
      <path d="M117 128 H153 L159 134 H241 L247 128 H283" stroke="#169ab4" strokeWidth="1.3"/>
      <path d="M187 138 L200 141 L213 138" stroke="url(#sf-hud-amber)" strokeWidth="2.7"/>
      <path d="M17 105 H43 M357 105 H383" stroke="#ffa32a" strokeWidth="1.4"/>
    </g>
  </svg>;
}

export default function BattleHud({lang='vi', stage=1, wave=1, wavesTotal=5, hp=0, maxHp=1,
  kills=0, bossHp=null, bossMaxHp=null, qa=null, announcement=null,
  onRetreat=null, retreating=false}) {
  const [visibleNotice, setVisibleNotice] = useState(null);
  useEffect(() => {
    const next = normalizeBattleNotice(announcement);
    if (!next) { setVisibleNotice(null); return undefined; }
    setVisibleNotice(next);
    const timeout = setTimeout(() => setVisibleNotice(null), next.durationMs + 600);
    return () => clearTimeout(timeout);
  }, [announcement?.id]);

  const vi = lang === 'vi';
  const hpNow = integer(hp);
  const hpTotal = Math.max(1, integer(maxHp, 1));
  const ratio = clamp(hpNow / hpTotal, 0, 1);
  const lowShield = ratio <= .28;
  const bossActive = bossHp !== null && finite(bossMaxHp) > 0;
  const bossRatio = bossActive ? clamp(finite(bossHp) / finite(bossMaxHp), 0, 1) : 0;
  const waveNow = Math.max(1, integer(wave, 1));
  const waveTotal = Math.max(1, integer(wavesTotal, 5));
  // Both lanes display genuine kill counts. Guest score remains in gameplay data,
  // not reinterpreted as a server-trusted score by the shared presentation.
  const metricValue = integer(kills).toLocaleString('en-US').padStart(2, '0');

  return <>
    <header className={`${styles.hud} ${lowShield ? styles.lowShield : ''}`}
      aria-label={vi ? 'Thông tin trận chiến' : 'Battle information'}>
      <CommandFrame />
      <div className={styles.cockpit}>
        {typeof onRetreat === 'function' && <button type="button" className={styles.retreatAction}
          onClick={onRetreat} disabled={retreating}
          title={vi ? 'Rút lui khỏi trận' : 'Retreat from battle'}
          aria-label={vi ? 'Rút lui khỏi trận' : 'Retreat from battle'}>
          <svg viewBox="0 0 44 44" fill="none" aria-hidden="true" focusable="false">
            <path d="M25 10 L13 22 L25 34 M34 10 L22 22 L34 34" stroke="currentColor"
              strokeWidth="3.8" strokeLinecap="square" strokeLinejoin="miter"/>
          </svg>
        </button>}
        <div className={styles.cutoutClearance} aria-hidden="true" />
      </div>
      <div className={styles.leftPod} aria-label={`${vi ? 'Hạ gục' : 'Kills'} ${integer(kills)}`}>
        <span className={styles.podLabel}>{vi ? 'HẠ GỤC' : 'KILLS'}</span>
        <strong className={styles.podValue}>{metricValue}</strong>
      </div>
      <div className={styles.rightPod} aria-label={`${vi ? 'Đợt' : 'Wave'} ${waveNow}/${waveTotal}`}>
        <span className={styles.podLabel}>{vi ? 'ĐỢT' : 'WAVE'}</span>
        <strong className={styles.podValue}>{waveNow}<span className={styles.fraction}>/</span>{waveTotal}</strong>
      </div>
      <section className={styles.shieldCenter} aria-label={vi ? 'Hệ thống giáp' : 'Shield system'}>
        <strong className={styles.shieldHeading}>{vi ? 'HỆ THỐNG GIÁP' : 'SHIELD SYSTEM'}</strong>
        <div className={styles.shieldSegments} role="meter" aria-label={vi ? 'Giáp còn lại' : 'Remaining shield'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
          {Array.from({length:10}, (_,i) => <span key={i} className={styles.shieldSegment}
            aria-hidden="true" style={{'--sf-fill':`${Math.round(clamp(ratio * 10 - i,0,1)*100)}%`}} />)}
        </div>
        <span className={styles.shieldValue}>{hpNow} <span>/</span> {hpTotal}</span>
        <span className={styles.missionSubtitle}>{vi ? 'ALPHA · MÀN' : 'ALPHA · STAGE'} {String(integer(stage,1)||1).padStart(2,'0')}</span>
      </section>

      {qa && <div className={styles.telemetry}><span className={styles.qaTag}>{qa}</span></div>}
      {bossActive && <div className={styles.boss}>
        <span className={styles.bossLabel}>{vi ? 'CẢNH BÁO TRÙM' : 'BOSS WARNING'}</span>
        <div className={styles.bossRail} role="meter" aria-label="Boss HP" aria-valuemin={0}
          aria-valuemax={100} aria-valuenow={Math.round(bossRatio*100)}>
          <div className={styles.bossFill} style={{width:`${bossRatio*100}%`}} />
        </div>
        <strong className={styles.bossPercent}>{Math.round(bossRatio*100)}%</strong>
      </div>}
    </header>
    {visibleNotice && <div role="status" aria-live="polite"
      className={[styles.notice, styles[`notice_${visibleNotice.tone}`]].join(' ')}>
      <span className={styles.noticeLine} aria-hidden="true" />
      {visibleNotice.text}
      <span className={styles.noticeLine} aria-hidden="true" />
    </div>}
  </>;
}
