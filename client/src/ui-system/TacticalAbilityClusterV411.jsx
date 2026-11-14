/** Shared Campaign/Dungeon tactical ability cluster V4.1.1. */
import React from 'react';
import styles from './TacticalAbilityClusterV411.module.css';

export const TACTICAL_ABILITY_CLUSTER_VERSION_V411 = 'tactical-ability-cluster-v4.1.1';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export default function TacticalAbilityClusterV411({
  active = null,
  passive = null,
  feedback = null,
  onActivate = null,
  lang = 'vi',
} = {}) {
  if (!active || typeof onActivate !== 'function') return null;
  const ready = Boolean(active.ready) && !active.locked;
  const assetSkinEnabled = import.meta.env?.VITE_SF_HUD_ASSETS_V2 !== 'false';
  const assetRoot = `${import.meta.env?.BASE_URL || '/'}assets/hud/v423/`;
  const cooling = !ready && !active.active;
  const activeProgress = clamp(active.cooldownProgress, 0, 1);
  const activeAngle = `${Math.round(activeProgress * 360)}deg`;
  const passiveProgress = clamp(passive?.progress ?? 1, 0, 1);
  const passiveAngle = `${Math.round(passiveProgress * 360)}deg`;
  const blocked = Boolean(active.locked || cooling || active.active);
  const activatePointer = event => {
    event?.stopPropagation?.();
    if (event?.cancelable) event.preventDefault();
    if (event?.pointerType === 'mouse' && event?.button !== 0) return;
    if (!blocked) onActivate();
  };
  const activateKeyboard = event => {
    event?.stopPropagation?.();
    if (event?.detail === 0 && !blocked) onActivate();
  };
  const stop = event => event?.stopPropagation?.();

  return <aside className={styles.root}
    data-cluster-version={TACTICAL_ABILITY_CLUSTER_VERSION_V411}
    data-asset-skin={assetSkinEnabled ? 'v423' : 'fallback'}
    style={{
      '--sf-ability-color': active.color || '#5be5f3',
      '--sf-ability-secondary': active.secondary || '#72a7ff',
      '--sf-ability-angle': activeAngle,
      '--sf-passive-color': passive?.color || '#67ef9f',
      '--sf-passive-angle': passiveAngle,
      '--sf-hud-active-frame': `url("${assetRoot}sf_cyan_hex_05.webp")`,
      '--sf-hud-passive-frame': `url("${assetRoot}sf_cyan_hex_06.webp")`,
    }} aria-label={lang === 'vi' ? 'Kỹ năng và giáp nội tại' : 'Skill and passive armor'}>

    {feedback?.visible && <div className={`${styles.feedback} ${feedback.rejected ? styles.feedbackRejected : ''}`}
      role="status" aria-live="polite">
      {feedback.name && <strong>{feedback.name}</strong>}
      {feedback.detail && <span>{feedback.detail}</span>}
    </div>}

    <button type="button"
      className={`${styles.action} ${ready ? styles.actionReady : ''} ${cooling ? styles.actionCooling : ''} ${active.active ? styles.actionActive : ''} ${active.locked ? styles.actionLocked : ''}`}
      onPointerDown={activatePointer} onPointerUp={stop} onPointerCancel={stop} onClick={activateKeyboard}
      onContextMenu={event => event.preventDefault()}
      disabled={blocked}
      aria-label={`${active.label || (lang === 'vi' ? 'Kỹ năng tàu' : 'Ship skill')}${active.remainingSeconds > 0 ? ` · ${active.remainingSeconds}s` : ''}`}
      title={active.label || ''} data-multitouch-contract="pointerdown-primary">
      <span className={styles.actionRing} aria-hidden="true" />
      <span className={styles.actionCore} aria-hidden="true" />
      <span className={styles.artFrameActive} aria-hidden="true" />
      <span className={styles.actionIcon} aria-hidden="true">{active.icon || 'S'}</span>
      {cooling && <span className={styles.actionTimer}>{active.remainingSeconds}</span>}
      {active.active && <span className={styles.activePulse} aria-hidden="true" />}
      {active.locked && <span className={styles.lockBadge} aria-hidden="true" />}
    </button>

    {passive && <div className={`${styles.passive} ${passive.active ? styles.passiveActive : ''} ${passive.exhausted ? styles.passiveExhausted : ''} ${passive.pulse ? styles.passiveProc : ''}`}
      title={passive.label || ''} aria-label={passive.label || (lang === 'vi' ? 'Giáp nội tại' : 'Passive armor')}>
      <span className={styles.passiveRing} aria-hidden="true" />
      <span className={styles.passiveCore} aria-hidden="true" />
      <span className={styles.artFramePassive} aria-hidden="true" />
      <span className={styles.passiveIcon} aria-hidden="true">{passive.icon || '⬡'}</span>
      {passive.badge && <span className={styles.passiveBadge}>{passive.badge}</span>}
      {passive.pulse && <span key={passive.pulseKey || passive.pulse} className={styles.passivePulse} aria-hidden="true" />}
    </div>}
  </aside>;
}
