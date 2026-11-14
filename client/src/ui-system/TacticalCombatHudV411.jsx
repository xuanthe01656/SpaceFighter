/**
 * SpaceFighter Unified Tactical HUD V4.1.1.
 *
 * Presentation-only shared shell intended for both Campaign and Dungeon.
 * Mode adapters provide real state; this component owns no combat, reward,
 * progression or network authority.
 */
import React, { useEffect, useState } from 'react';
import { normalizeBattleNotice } from './BattleNoticeModel.js';
import './GameUiTokens.css';
import styles from './TacticalCombatHudV411.module.css';

export const TACTICAL_COMBAT_HUD_VERSION_V411 = 'unified-tactical-hud-v4.1.1';

const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.max(0, Math.round(finite(value, fallback)));

function TacticalFrameArt({ bossActive = false }) {
  return <svg className={styles.frameArt} viewBox="0 0 430 104" preserveAspectRatio="none"
    aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="sf-v411-cyan" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--sf-hud-cyan-dim)" />
        <stop offset=".42" stopColor="var(--sf-hud-cyan)" />
        <stop offset="1" stopColor="var(--sf-hud-cyan-dim)" />
      </linearGradient>
      <linearGradient id="sf-v411-amber" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="transparent" />
        <stop offset=".45" stopColor="var(--sf-hud-amber)" />
        <stop offset="1" stopColor="transparent" />
      </linearGradient>
    </defs>
    <g fill="none" strokeLinecap="square" strokeLinejoin="miter">
      {/* Independent shoulders preserve a real notch / Dynamic Island gap. */}
      <path d="M4 34 V17 L18 5 H137 L158 25" stroke="#0c4055" strokeWidth="5" />
      <path d="M426 34 V17 L412 5 H293 L272 25" stroke="#0c4055" strokeWidth="5" />
      <path d="M4 34 V17 L18 5 H137 L158 25" stroke="url(#sf-v411-cyan)" strokeWidth="1.4" />
      <path d="M426 34 V17 L412 5 H293 L272 25" stroke="url(#sf-v411-cyan)" strokeWidth="1.4" />
      <path d="M22 11 H132 L146 24 M408 11 H298 L284 24" stroke="url(#sf-v411-amber)" strokeWidth="2.1" />

      {/* Left and right mechanical pods. */}
      <path d="M4 35 H178 L187 45 V67 L177 77 H15 L4 66 Z" stroke="url(#sf-v411-cyan)" strokeWidth="1.35" />
      <path d="M426 35 H252 L243 45 V67 L253 77 H415 L426 66 Z" stroke="url(#sf-v411-cyan)" strokeWidth="1.35" />
      <path d="M13 40 H173 M417 40 H257" stroke="var(--sf-hud-amber)" strokeOpacity=".62" strokeWidth="1.3" />

      {/* Small central mode badge begins below the physical cutout. */}
      <path d="M159 35 H271 L282 46 V69 L272 80 H158 L148 69 V46 Z" stroke="#0a4b63" strokeWidth="4.4" />
      <path d="M159 35 H271 L282 46 V69 L272 80 H158 L148 69 V46 Z" stroke="url(#sf-v411-cyan)" strokeWidth="1.25" />
      <path d="M171 40 H259 M169 75 H261" stroke="var(--sf-hud-cyan)" strokeOpacity=".36" strokeWidth=".8" />
      <path d="M199 82 H231" stroke="var(--sf-hud-amber)" strokeWidth="2" />

      {bossActive && <>
        <path d="M62 88 H368" stroke="#4f1720" strokeWidth="7" strokeOpacity=".76" />
        <path d="M62 88 H368" stroke="url(#sf-v411-amber)" strokeWidth="1.2" />
        <path d="M50 88 H62 M368 88 H380" stroke="var(--sf-hud-danger)" strokeWidth="2" />
      </>}
    </g>
  </svg>;
}

export default function TacticalCombatHudV411({
  lang = 'vi',
  modeCode = 'ALPHA',
  phaseLabel = '',
  objectiveCounter = '',
  hp = 0,
  maxHp = 1,
  score = 0,
  kills = 0,
  boss = null,
  qa = false,
  announcement = null,
  armorIcon = '⬡',
  onRetreat = null,
  retreating = false,
  palette = null,
  hudTheme = 'campaign',
} = {}) {
  const [visibleNotice, setVisibleNotice] = useState(null);
  useEffect(() => {
    const next = normalizeBattleNotice(announcement);
    if (!next) { setVisibleNotice(null); return undefined; }
    setVisibleNotice(next);
    const timeout = setTimeout(() => setVisibleNotice(null), next.durationMs + 500);
    return () => clearTimeout(timeout);
  }, [announcement?.id]);

  const vi = lang === 'vi';
  const assetSkinEnabled = import.meta.env?.VITE_SF_HUD_ASSETS_V2 !== 'false';
  const assetRoot = `${import.meta.env?.BASE_URL || '/'}assets/hud/v423/`;
  const skin = hudTheme === 'dungeon' ? 'dungeon' : 'campaign';
  const hpNow = integer(hp);
  const hpTotal = Math.max(1, integer(maxHp, 1));
  const hpRatio = clamp(hpNow / hpTotal, 0, 1);
  const lowArmor = hpRatio <= .28;
  const bossMax = Math.max(0, finite(boss?.maxHp));
  const bossCurrent = Math.max(0, finite(boss?.hp));
  const bossActive = Boolean(boss?.active && bossMax > 0);
  const bossRatio = bossActive ? clamp(bossCurrent / bossMax, 0, 1) : 0;
  const style = {
    '--sf-hud-cyan': palette?.accent || '#5be5f3',
    '--sf-hud-cyan-dim': palette?.accentDim || '#17647c',
    '--sf-hud-amber': palette?.objective || '#ffc45d',
    '--sf-hud-danger': palette?.danger || '#ff5164',
    '--sf-hud-text': palette?.text || '#eaffff',
    '--sf-hud-muted': palette?.muted || '#8eb3c0',
    '--sf-hud-compact-shell': `url("${assetRoot}sf_status_shell_compact__${skin}.webp")`,
    '--sf-hud-badge-frame': `url("${assetRoot}${skin === 'dungeon' ? 'sf_dungeon_lime_panel_09' : 'sf_alert_panel_h_01'}.webp")`,
    '--sf-hud-boss-frame': `url("${assetRoot}sf_status_shell_boss__boss.webp")`,
    '--sf-hud-ornament': `url("${assetRoot}sf_ornament_01__${skin === 'dungeon' ? 'lime' : 'cyan'}.webp")`,
  };

  return <>
    <header className={`${styles.hud} ${lowArmor ? styles.lowArmor : ''} ${bossActive ? styles.bossMode : ''}`}
      style={style} data-hud-version={TACTICAL_COMBAT_HUD_VERSION_V411}
      data-hud-theme={skin} data-asset-skin={assetSkinEnabled ? 'v423' : 'fallback'}
      aria-label={vi ? 'HUD chiến đấu' : 'Combat HUD'}>
      <TacticalFrameArt bossActive={bossActive} />

      <section className={styles.leftPod} aria-label={`${vi ? 'Giáp' : 'Armor'} ${hpNow}/${hpTotal}`}>
        {typeof onRetreat === 'function' && <button type="button" className={styles.retreatButton}
          onClick={onRetreat} disabled={retreating}
          title={vi ? 'Rút lui' : 'Retreat'} aria-label={vi ? 'Rút lui khỏi trận' : 'Retreat from battle'}>
          <svg viewBox="0 0 44 44" fill="none" aria-hidden="true" focusable="false">
            <path d="M25 10 L13 22 L25 34 M34 10 L22 22 L34 34" stroke="currentColor"
              strokeWidth="3.8" strokeLinecap="square" strokeLinejoin="miter" />
          </svg>
        </button>}
        <span className={styles.armorGlyph} aria-hidden="true">{armorIcon}</span>
        <div className={styles.armorReadout}>
          <div className={styles.armorNumbers}><strong>{hpNow}</strong><span>/ {hpTotal}</span></div>
          <div className={styles.armorRail} role="meter" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(hpRatio * 100)} aria-label={vi ? 'Giáp còn lại' : 'Remaining armor'}>
            <span style={{ width: `${hpRatio * 100}%` }} />
          </div>
        </div>
      </section>

      <section className={styles.modeBadge} aria-label={`${modeCode} ${phaseLabel}`}>
        <strong>{modeCode}</strong>
        <span>{phaseLabel}</span>
        {objectiveCounter && <small>{objectiveCounter}</small>}
      </section>

      <section className={styles.rightPod}>
        <div className={styles.metric} aria-label={`${vi ? 'Điểm' : 'Score'} ${integer(score)}`}>
          <span>{vi ? 'ĐIỂM' : 'SCORE'}</span>
          <strong>{integer(score).toLocaleString('en-US')}</strong>
        </div>
        <div className={styles.metric} aria-label={`${vi ? 'Hạ' : 'Kills'} ${integer(kills)}`}>
          <span>{vi ? 'HẠ' : 'KILLS'}</span>
          <strong>{integer(kills)}</strong>
        </div>
      </section>

      {qa && <span className={styles.qaBadge} aria-label="QA local only">QA</span>}

      {bossActive && <section className={styles.bossStrip}
        aria-label={`${boss?.name || (vi ? 'Trùm' : 'Boss')} ${Math.round(bossRatio * 100)}%`}>
        <div className={styles.bossHeading}>
          <strong>{boss?.name || (vi ? 'TRÙM KHU VỰC' : 'SECTOR BOSS')}</strong>
          <span>{Math.round(bossRatio * 100)}%</span>
        </div>
        <div className={styles.bossRail} role="meter" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(bossRatio * 100)}>
          <span style={{ width: `${bossRatio * 100}%` }} />
        </div>
      </section>}
    </header>

    {visibleNotice && <div role="status" aria-live="polite"
      className={`${styles.notice} ${styles[`notice_${visibleNotice.tone}`] || ''}`} style={style}>
      <span className={styles.noticeLine} aria-hidden="true" />
      <div>
        <small>{vi ? 'MỤC TIÊU CHIẾN THUẬT' : 'TACTICAL OBJECTIVE'}</small>
        <strong>{visibleNotice.text}</strong>
      </div>
      <span className={styles.noticeLine} aria-hidden="true" />
    </div>}
  </>;
}
