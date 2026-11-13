/**
 * SpaceFighter Dungeon HUD V3.9.6.
 *
 * React owns all fixed-screen Dungeon presentation. Babylon retains world-space
 * health bars, hit text and combat visuals. This component never mutates combat,
 * rewards, profile or server-authoritative state.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { normalizeBattleNotice } from './BattleNoticeModel.js';
import { resolveDungeonHudProfileV396 } from '../game/dungeon/DungeonHudCatalogV396.js';
import './GameUiTokens.css';
import styles from './DungeonHudV396.module.css';

const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.max(0, Math.round(finite(value, fallback)));

export const EMPTY_DUNGEON_HUD_STATE_V396 = Object.freeze({
  dungeonId: 'dung_taurus',
  score: 0,
  kills: 0,
  hp: 1,
  maxHp: 1,
  roomIndex: 0,
  roomNumber: 1,
  roomTotal: 5,
  roomId: null,
  roomTitle: '',
  roomKind: 'entry',
  roomKindLabel: '',
  roomTone: 'standard',
  roomMarkers: Object.freeze([]),
  objectiveTitle: '',
  objectiveBody: '',
  objectiveMode: 'hostiles',
  objectiveLabel: '',
  objectiveValue: '0/0',
  objectiveSecondary: '',
  objectiveRatio: 0,
  bossName: '',
  bossHp: null,
  bossMaxHp: null,
  roomComplete: false,
  qaLabel: null,
});

function DungeonFrame() {
  return <svg className={styles.frameArt} viewBox="0 0 420 160" preserveAspectRatio="none"
    aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="sf-dungeon-edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--sf-dh-accent-soft)" />
        <stop offset=".48" stopColor="var(--sf-dh-accent)" />
        <stop offset="1" stopColor="#16566c" />
      </linearGradient>
      <linearGradient id="sf-dungeon-objective" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--sf-dh-objective)" stopOpacity=".18" />
        <stop offset=".5" stopColor="var(--sf-dh-objective)" />
        <stop offset="1" stopColor="var(--sf-dh-objective)" stopOpacity=".18" />
      </linearGradient>
    </defs>
    <g fill="none" strokeLinejoin="miter" strokeLinecap="square">
      <path d="M6 52 V25 L24 7 H126 L153 38" stroke="#11394b" strokeWidth="7" />
      <path d="M414 52 V25 L396 7 H294 L267 38" stroke="#11394b" strokeWidth="7" />
      <path d="M6 52 V25 L24 7 H126 L153 38" stroke="url(#sf-dungeon-edge)" strokeWidth="1.8" />
      <path d="M414 52 V25 L396 7 H294 L267 38" stroke="url(#sf-dungeon-edge)" strokeWidth="1.8" />
      <path d="M13 55 H88 L106 72 L91 106 H10 L5 94 V66 Z" stroke="url(#sf-dungeon-edge)" strokeWidth="1.8" />
      <path d="M407 55 H332 L314 72 L329 106 H410 L415 94 V66 Z" stroke="url(#sf-dungeon-edge)" strokeWidth="1.8" />
      <path d="M111 52 H309 L323 71 V106 L298 137 H122 L97 106 V71 Z" stroke="#0a4357" strokeWidth="7" />
      <path d="M111 52 H309 L323 71 V106 L298 137 H122 L97 106 V71 Z" stroke="url(#sf-dungeon-edge)" strokeWidth="1.7" />
      <path d="M119 143 H301" stroke="url(#sf-dungeon-objective)" strokeWidth="2.4" />
      <path d="M26 17 H121 M299 17 H394" stroke="var(--sf-dh-objective)" strokeWidth="2" strokeOpacity=".7" />
    </g>
  </svg>;
}

function RoomRail({ markers = [] }) {
  return <ol className={styles.roomRail} aria-label="Dungeon room progress">
    {markers.map(marker => <React.Fragment key={marker.roomId || marker.index}>
      {marker.gapBefore && <li className={styles.roomGap} aria-hidden="true">•••</li>}
      <li className={`${styles.roomMarker} ${styles[`room_${marker.status}`]} ${styles[`tone_${marker.tone}`] || ''}`}
        title={marker.title} aria-current={marker.status === 'active' ? 'step' : undefined}>
        <span className={styles.markerCore}>{marker.number}</span>
      </li>
    </React.Fragment>)}
  </ol>;
}

export default function DungeonHudV396({
  lang = 'vi',
  state = EMPTY_DUNGEON_HUD_STATE_V396,
  announcement = null,
  onRetreat = null,
  retreating = false,
}) {
  const [visibleNotice, setVisibleNotice] = useState(null);
  useEffect(() => {
    const next = normalizeBattleNotice(announcement);
    if (!next) { setVisibleNotice(null); return undefined; }
    setVisibleNotice(next);
    const timeout = setTimeout(() => setVisibleNotice(null), next.durationMs + 600);
    return () => clearTimeout(timeout);
  }, [announcement?.id]);

  const vi = lang === 'vi';
  const profile = useMemo(() => resolveDungeonHudProfileV396(state.dungeonId), [state.dungeonId]);
  const hpNow = integer(state.hp);
  const hpTotal = Math.max(1, integer(state.maxHp, 1));
  const hpRatio = clamp(hpNow / hpTotal, 0, 1);
  const lowArmor = hpRatio <= .28;
  const objectiveRatio = clamp(state.objectiveRatio, 0, 1);
  const bossActive = state.objectiveMode === 'boss'
    && state.bossHp !== null
    && finite(state.bossMaxHp) > 0;
  const scoreValue = integer(state.score).toLocaleString('en-US').padStart(4, '0');
  const roomNumber = Math.max(1, integer(state.roomNumber, integer(state.roomIndex) + 1));
  const roomTotal = Math.max(1, integer(state.roomTotal, 1));
  const style = {
    '--sf-dh-accent': profile.colors.accent,
    '--sf-dh-accent-soft': profile.colors.accentSoft,
    '--sf-dh-objective': profile.colors.objective,
    '--sf-dh-warning': profile.colors.warning,
    '--sf-dh-danger': profile.colors.danger,
    '--sf-dh-panel': profile.colors.panel,
    '--sf-dh-text': profile.colors.text,
    '--sf-dh-muted': profile.colors.muted,
  };

  return <>
    <header className={`${styles.hud} ${lowArmor ? styles.lowArmor : ''}`} style={style}
      aria-label={vi ? 'Thông tin phó bản' : 'Dungeon battle information'}>
      <DungeonFrame />
      <div className={styles.shell}>
        {typeof onRetreat === 'function' && <button type="button" className={styles.retreatAction}
          onClick={onRetreat} disabled={retreating}
          title={vi ? 'Rút lui khỏi phó bản' : 'Retreat from dungeon'}
          aria-label={vi ? 'Rút lui khỏi phó bản' : 'Retreat from dungeon'}>
          <svg viewBox="0 0 44 44" fill="none" aria-hidden="true" focusable="false">
            <path d="M25 10 L13 22 L25 34 M34 10 L22 22 L34 34" stroke="currentColor"
              strokeWidth="3.8" strokeLinecap="square" strokeLinejoin="miter" />
          </svg>
        </button>}
        <div className={styles.cutoutClearance} aria-hidden="true" />
      </div>

      <div className={styles.identityLeft}>
        <strong>{profile.shortCode}</strong>
        <span>{profile.missionLabel?.[lang] || profile.missionLabel?.vi}</span>
      </div>
      <div className={styles.identityRight}>
        <strong>{state.roomKindLabel || (vi ? 'PHÓ BẢN' : 'DUNGEON')}</strong>
        <span>{state.roomTitle || profile.displayName?.[lang] || profile.displayName?.vi}</span>
      </div>

      <div className={styles.leftPod} aria-label={`${vi ? 'Điểm' : 'Score'} ${integer(state.score)}`}>
        <span className={styles.podLabel}>{vi ? 'ĐIỂM' : 'SCORE'}</span>
        <strong className={styles.podValue}>{scoreValue}</strong>
        <small>{vi ? 'HẠ' : 'KILLS'} {integer(state.kills)}</small>
      </div>
      <div className={styles.rightPod} aria-label={`${vi ? 'Phòng' : 'Room'} ${roomNumber}/${roomTotal}`}>
        <span className={styles.podLabel}>{vi ? 'PHÒNG' : 'ROOM'}</span>
        <strong className={styles.podValue}>{roomNumber}<span className={styles.fraction}>/</span>{roomTotal}</strong>
        <small>{state.roomKindLabel || profile.shortCode}</small>
      </div>

      <section className={styles.armorCenter} aria-label={vi ? 'Hệ thống giáp' : 'Armor system'}>
        <strong className={styles.armorHeading}>{vi ? 'HỆ THỐNG GIÁP' : 'ARMOR SYSTEM'}</strong>
        <div className={styles.armorSegments} role="meter" aria-label={vi ? 'Giáp còn lại' : 'Remaining armor'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hpRatio * 100)}>
          {Array.from({ length: 10 }, (_, index) => <span key={index} className={styles.armorSegment}
            aria-hidden="true" style={{ '--sf-fill': `${Math.round(clamp(hpRatio * 10 - index, 0, 1) * 100)}%` }} />)}
        </div>
        <span className={styles.armorValue}>{hpNow} <span>/</span> {hpTotal}</span>
        <RoomRail markers={state.roomMarkers || []} />
      </section>

      {state.qaLabel && <div className={styles.qaBadge}>{state.qaLabel} · NO REWARDS</div>}

      <section className={`${styles.objectiveCard} ${styles[`objective_${state.roomTone || 'standard'}`] || ''}`}
        aria-label={vi ? 'Mục tiêu hiện tại' : 'Current objective'}>
        <div className={styles.objectiveIcon} aria-hidden="true">{String(roomNumber).padStart(2, '0')}</div>
        <div className={styles.objectiveCopy}>
          <div className={styles.objectiveHeading}>
            <span>{state.objectiveTitle || (vi ? 'MỤC TIÊU' : 'OBJECTIVE')}</span>
            <strong>{state.objectiveLabel} {state.objectiveValue}</strong>
          </div>
          <p>{state.objectiveBody || (vi ? 'Hoàn thành mục tiêu trong khu vực.' : 'Complete the sector objective.')}</p>
          {state.objectiveSecondary && <small>{state.objectiveSecondary}</small>}
        </div>
        <div className={`${styles.objectiveRail} ${bossActive ? styles.bossRail : ''}`}
          role="meter" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(objectiveRatio * 100)}
          aria-label={bossActive ? (state.bossName || 'Boss HP') : state.objectiveLabel}>
          <span style={{ width: `${objectiveRatio * 100}%` }} />
        </div>
        {bossActive && <div className={styles.bossName}>
          <span>{vi ? 'TRÙM KHU VỰC' : 'SECTOR BOSS'}</span>
          <strong>{state.bossName || (vi ? 'TRÙM' : 'BOSS')}</strong>
        </div>}
      </section>
    </header>

    {visibleNotice && <div role="status" aria-live="polite"
      className={[styles.notice, styles[`notice_${visibleNotice.tone}`]].join(' ')} style={style}>
      <span className={styles.noticeLine} aria-hidden="true" />
      {visibleNotice.text}
      <span className={styles.noticeLine} aria-hidden="true" />
    </div>}
  </>;
}
