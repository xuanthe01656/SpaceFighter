/**
 * Compact production-style Guest V2 combat HUD.
 *
 * Player-facing combat presentation is icon-only: the ship icon shows active /
 * cooldown time and the armor icon shows automatic proc state. Full effect
 * copy lives in the ship/equipment detail surface; a DEV-only query override
 * (`sfAbilityDebug=1`) is retained for deterministic QA without cluttering the
 * normal battle viewport.
 */
import React from 'react';
import {
  getGuestAbilityFeedbackProfileV2,
  getGuestArmorFeedbackProfileV2,
  getGuestArmorTraitV2,
  localizeGuestFeedbackV2,
} from '../game/combat/GuestAbilityFeedbackV2.js';
import {
  GUEST_COMBAT_QA_ARMOR_IDS,
  GUEST_COMBAT_QA_SHIP_IDS,
  resolveGuestCombatQaLoadoutV2,
} from '../game/combat/GuestCombatQaLoadoutV2.js';
import styles from './GuestAbilityControls.module.css';

const TICK_RATE = 30;
const localized = (value, lang) => value?.[lang === 'vi' ? 'vi' : 'en'] || value?.vi || value?.en || 'SKILL';
const seconds = ticks => Math.max(0, Number(ticks || 0) / TICK_RATE);
const compactSeconds = ticks => {
  const value = seconds(ticks);
  return value < 10 ? value.toFixed(1) : String(Math.ceil(value));
};
const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const cx = (...values) => values.filter(Boolean).join(' ');
const lockCopy = (reason, lang) => {
  const vi = lang === 'vi';
  if (reason === 'TRANSITION') return vi ? 'đang chuyển đợt' : 'wave transition';
  if (reason === 'BOSS_INTRO') return vi ? 'trùm đang xuất hiện' : 'boss entering';
  if (reason === 'CLEAR') return vi ? 'trận đã hoàn thành' : 'battle cleared';
  if (reason === 'GAMEOVER') return vi ? 'trận đã kết thúc' : 'battle ended';
  return vi ? 'chưa thể kích hoạt' : 'unavailable';
};

function ShipAction({ slot, activationGate, lang, onActivate, feedback, currentTick }) {
  if (!slot) return null;
  const active = slot.activeTicks > 0;
  const cooling = !slot.ready && !active;
  const terminalPhase = ['CLEAR', 'GAMEOVER'].includes(activationGate?.lockReason);
  const phaseLocked = activationGate?.canActivate === false && (slot.ready || terminalPhase);
  const phaseLockText = phaseLocked ? lockCopy(activationGate?.lockReason, lang) : '';
  const currentTicks = active ? slot.activeTicks : slot.remainingTicks;
  const totalTicks = active ? Math.max(1, slot.durationTicks) : Math.max(1, slot.cooldownTicks);
  const progress = slot.ready ? 1 : clamp01(currentTicks / totalTicks);
  const profile = getGuestAbilityFeedbackProfileV2(slot.id);
  const toneColor = profile?.color || '#5be5f3';
  const timeText = active || cooling ? compactSeconds(currentTicks) : null;
  const rejected = feedback?.scope === 'ship'
    && feedback?.abilityId === slot.id
    && feedback?.status === 'rejected'
    && currentTick <= Number(feedback.toastUntilTick || -1);
  const stateText = phaseLocked
    ? phaseLockText
    : active
      ? (lang === 'vi' ? 'đang hoạt động' : 'active')
      : slot.ready
        ? (lang === 'vi' ? 'sẵn sàng' : 'ready')
        : (lang === 'vi' ? 'đang hồi' : 'cooldown');

  return <button
    className={cx(
      styles.action,
      active && styles.actionActive,
      cooling && styles.actionCooling,
      rejected && styles.actionRejected,
      phaseLocked && styles.actionLocked,
    )}
    type="button"
    data-ability-slot="ship_skill"
    data-ability-state={phaseLocked ? 'locked' : active ? 'active' : slot.ready ? 'ready' : 'cooldown'}
    data-ability-lock-reason={phaseLocked ? activationGate?.lockReason : undefined}
    aria-label={`${localized(slot.name, lang)} · ${stateText}${timeText ? ` ${timeText}s` : ''}`}
    title={phaseLocked ? `${localized(slot.name, lang)} · ${phaseLockText}` : localized(slot.name, lang)}
    disabled={!slot.ready || phaseLocked}
    onPointerDown={event => event.stopPropagation()}
    onPointerUp={event => event.stopPropagation()}
    onPointerCancel={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); if (!phaseLocked) onActivate?.('ship_skill'); }}
    style={{
      '--ability-color': toneColor,
      '--ability-angle': `${Math.round(progress * 360)}deg`,
    }}
  >
    <span className={styles.radialRing} aria-hidden="true" />
    <span className={styles.actionCore} aria-hidden="true" />
    <span className={styles.icon} aria-hidden="true">{profile?.icon || '✦'}</span>
    {timeText && <strong className={styles.timer}>{timeText}</strong>}
    {rejected && <span className={styles.rejectedBadge} aria-hidden="true">!</span>}
    {phaseLocked && <span className={styles.lockBadge} aria-hidden="true" />}
    {active && <span className={styles.activePulse} aria-hidden="true" />}
  </button>;
}

function getArmorHudState(armor) {
  const trait = getGuestArmorTraitV2(armor?.id);
  const params = trait?.params || {};
  let remainingTicks = 0;
  let totalTicks = 1;
  let progress = 1;
  let badge = null;
  let exhausted = false;

  switch (armor?.id) {
    case 'armor_auto_evade':
    case 'armor_reactive_plating':
      remainingTicks = Math.max(0, Number(armor.procRemainingTicks || 0));
      totalTicks = Math.max(1, Number(params.internalCooldownTicks || 1));
      progress = remainingTicks > 0 ? clamp01(remainingTicks / totalTicks) : 1;
      break;
    case 'armor_recharge_shield': {
      remainingTicks = Math.max(0, Number(armor.rechargeDelayRemainingTicks || 0));
      totalTicks = Math.max(1, Number(params.rechargeDelayTicks || 1));
      const barrierMax = Math.max(0, Number(armor.barrierMax || 0));
      const barrierHp = Math.max(0, Number(armor.barrierHp || 0));
      progress = remainingTicks > 0
        ? clamp01(remainingTicks / totalTicks)
        : barrierMax > 0 ? clamp01(barrierHp / barrierMax) : 0;
      break;
    }
    case 'armor_nano_repair': {
      remainingTicks = Math.max(0, Number(armor.nanoDelayRemainingTicks || 0));
      totalTicks = Math.max(1, Number(params.delayTicks || 1));
      const cap = Math.max(0, Number(armor.nanoHealCap || 0));
      const used = Math.max(0, Number(armor.nanoHealTotal || 0));
      exhausted = cap > 0 && used >= cap;
      progress = exhausted ? 0 : remainingTicks > 0 ? clamp01(remainingTicks / totalTicks) : 1;
      break;
    }
    case 'armor_crystal_prism': {
      const charge = Math.max(0, Number(armor.charge || 0));
      const chargeMax = Math.max(1, Number(armor.chargeMax || params.hitsPerProc || 1));
      progress = clamp01(charge / chargeMax);
      badge = `${charge}/${chargeMax}`;
      break;
    }
    default:
      progress = 1;
      break;
  }

  return Object.freeze({
    remainingTicks,
    progress,
    badge,
    exhausted,
    timeText: remainingTicks > 0 ? compactSeconds(remainingTicks) : null,
  });
}

function ArmorPassive({ armor, lang, currentTick }) {
  if (!armor) return null;
  const profile = getGuestArmorFeedbackProfileV2(armor.id);
  const hud = getArmorHudState(armor);
  const recentProc = armor.lastProcTick != null && currentTick - armor.lastProcTick <= Math.round(TICK_RATE * .8);
  const stateText = hud.exhausted
    ? (lang === 'vi' ? 'đã dùng hết giới hạn trận' : 'battle cap reached')
    : hud.timeText
      ? `${lang === 'vi' ? 'đang hồi' : 'cooldown'} ${hud.timeText}s`
      : (lang === 'vi' ? 'tự động sẵn sàng' : 'automatic ready');

  return <div
    className={cx(styles.passive, recentProc && styles.passiveProc, hud.exhausted && styles.passiveExhausted)}
    aria-label={`${localized(armor.name, lang)} · ${stateText}`}
    title={localized(armor.name, lang)}
    data-armor-state={hud.exhausted ? 'exhausted' : hud.timeText ? 'cooldown' : 'ready'}
    style={{
      '--armor-color': profile?.color || '#67ef9f',
      '--armor-angle': `${Math.round(hud.progress * 360)}deg`,
    }}
  >
    <span className={styles.armorRing} aria-hidden="true" />
    <span className={styles.armorCore} aria-hidden="true" />
    <span className={styles.armorIcon} aria-hidden="true">{profile?.icon || '◇'}</span>
    {hud.timeText && <strong className={styles.armorTimer}>{hud.timeText}</strong>}
    {hud.badge && !hud.timeText && <strong className={styles.armorBadge}>{hud.badge}</strong>}
    {recentProc && <span className={styles.passivePulse} aria-hidden="true" />}
  </div>;
}

function MobileQaLoadoutSwitcher({ activationGate, onQaCycle, lang }) {
  const enabled = import.meta.env.VITE_SF_GUEST_COMBAT_V2_QA === 'true'
    && typeof window !== 'undefined'
    && typeof onQaCycle === 'function';
  if (!enabled || activationGate?.canActivate !== false) return null;
  const current = resolveGuestCombatQaLoadoutV2(window.location.search);
  const shipIndex = GUEST_COMBAT_QA_SHIP_IDS.indexOf(current.shipId) + 1;
  const armorIndex = GUEST_COMBAT_QA_ARMOR_IDS.indexOf(current.armorId) + 1;
  return <div className={styles.qaSwitcher} aria-label={lang === 'vi' ? 'Đổi loadout QA' : 'Change QA loadout'}>
    <button type="button" onClick={() => onQaCycle('ship')}
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      title={current.shipId}>{`S ${shipIndex}/${GUEST_COMBAT_QA_SHIP_IDS.length}`}</button>
    <button type="button" onClick={() => onQaCycle('armor')}
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      title={current.armorId}>{`A ${armorIndex}/${GUEST_COMBAT_QA_ARMOR_IDS.length}`}</button>
  </div>;
}

function DebugReadout({ state, feedback, lang }) {
  const enabled = import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('sfAbilityDebug') === '1';
  if (!enabled) return null;
  const profile = getGuestAbilityFeedbackProfileV2(state.ship.id);
  const armorProfile = getGuestArmorFeedbackProfileV2(state.armor?.id);
  const feedbackText = feedback
    ? `${feedback.status}:${localizeGuestFeedbackV2(feedback.name, lang)}`
    : 'idle';
  const gateText = state.activationGate
    ? state.activationGate.canActivate
      ? `${lang === 'vi' ? 'PHASE CHO PHÉP' : 'PHASE ALLOWED'}: ${state.activationGate.battlePhase}`
      : `${lang === 'vi' ? 'PHASE KHÓA' : 'PHASE LOCKED'}: ${state.activationGate.battlePhase} · ${state.activationGate.lockReason}`
    : null;
  const qaForceText = state.qa?.forceNextProjectileEvadeEnabled
    ? state.qa.forceNextProjectileEvadePending
      ? (lang === 'vi' ? 'QA NÉ ĐẠN: ĐÃ NẠP' : 'QA PROJECTILE EVADE: ARMED')
      : (lang === 'vi' ? 'QA NÉ ĐẠN: ĐÃ KÍCH HOẠT' : 'QA PROJECTILE EVADE: CONSUMED')
    : null;
  return <output className={styles.debugReadout} aria-live="polite">
    <b>{localizeGuestFeedbackV2(profile?.name, lang)}</b>
    <span>{localizeGuestFeedbackV2(profile?.detail, lang)}</span>
    <span>{localizeGuestFeedbackV2(armorProfile?.name, lang)} · {feedbackText}</span>
    {gateText && <span>{gateText}</span>}
    {qaForceText && <span>{qaForceText}</span>}
  </output>;
}

export default function GuestAbilityControls({ state, feedback = null, onActivate, onQaCycle = null, lang = 'vi' }) {
  if (!state?.ship) return null;
  return <aside
    className={styles.controls}
    aria-label={lang === 'vi' ? 'Kỹ năng trận Guest' : 'Guest battle skill'}
    data-feedback-version="guest-ability-feedback-v2.2.0"
    data-battle-phase={state.activationGate?.battlePhase || 'UNKNOWN'}
  >
    <DebugReadout state={state} feedback={feedback} lang={lang} />
    <ShipAction
      slot={state.ship}
      activationGate={state.activationGate}
      lang={lang}
      onActivate={onActivate}
      feedback={feedback}
      currentTick={state.tick}
    />
    <ArmorPassive armor={state.armor} lang={lang} currentTick={state.tick} />
    <MobileQaLoadoutSwitcher activationGate={state.activationGate} onQaCycle={onQaCycle} lang={lang} />
  </aside>;
}
