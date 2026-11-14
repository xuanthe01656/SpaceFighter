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
  describeGuestCombatQaEquipmentPresetV2,
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
    onPointerDown={event => {
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!phaseLocked) onActivate?.('ship_skill');
    }}
    onPointerUp={event => event.stopPropagation()}
    onPointerCancel={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      // Pointer input activates on pointerdown so a second finger still works
      // while the movement pointer remains captured by the canvas. Keep click
      // only for keyboard/accessibility activation (detail === 0).
      if (event.detail === 0 && !phaseLocked) onActivate?.('ship_skill');
    }}
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

function MobileQaLoadoutSwitcher({ activationGate, qaSelection, onQaCycle, onQaNavigate, lang }) {
  const enabled = import.meta.env.VITE_SF_GUEST_COMBAT_V2_QA === 'true'
    && typeof window !== 'undefined'
    && (typeof onQaCycle === 'function' || typeof onQaNavigate === 'function');
  if (!enabled) return null;
  const current = resolveGuestCombatQaLoadoutV2(window.location.search);
  const shipIndex = GUEST_COMBAT_QA_SHIP_IDS.indexOf(current.shipId) + 1;
  const armorIndex = GUEST_COMBAT_QA_ARMOR_IDS.indexOf(current.armorId) + 1;
  const activate = (event, callback, value) => {
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    callback?.(value);
  };
  const accessible = (event, callback, value) => {
    event.stopPropagation();
    if (event.detail === 0) callback?.(value);
  };
  const button = (key, label, title, callback, value) => <button key={key} type="button"
    onPointerDown={event => activate(event, callback, value)}
    onPointerUp={event => event.stopPropagation()}
    onPointerCancel={event => event.stopPropagation()}
    onClick={event => accessible(event, callback, value)}
    title={title}>{label}</button>;
  return <div
    className={styles.qaSwitcher}
    aria-label={lang === 'vi' ? 'Điều hướng và loadout QA' : 'QA navigation and loadout'}
    data-qa-battle-phase={activationGate?.battlePhase || 'UNKNOWN'}
    data-qa-navigation-version="v2.6a"
  >
    {qaSelection && button('planet', `P ${qaSelection.planetIndex}/${qaSelection.planetTotal}`,
      lang === 'vi' ? 'Đổi tinh cầu QA' : 'Change QA planet', onQaNavigate, 'planet')}
    {qaSelection && button('stage', `T ${qaSelection.stageIndex}/${qaSelection.stageTotal}`,
      lang === 'vi' ? 'Đổi ải QA' : 'Change QA stage', onQaNavigate, 'stage')}
    {qaSelection && button('boss', 'B',
      lang === 'vi' ? 'Nhảy tới ải Boss kế tiếp' : 'Jump to next boss stage', onQaNavigate, 'boss')}
    {button('equipment', `E ${current.equipmentPresetIndex}/${current.equipmentPresetTotal}`,
      describeGuestCombatQaEquipmentPresetV2(current.equipmentPreset, lang), onQaCycle, 'equipment')}
    {button('ship', `S ${shipIndex}/${GUEST_COMBAT_QA_SHIP_IDS.length}`, current.shipId, onQaCycle, 'ship')}
    {button('armor', `A ${armorIndex}/${GUEST_COMBAT_QA_ARMOR_IDS.length}`, current.armorId, onQaCycle, 'armor')}
  </div>;
}

const formatQaTime = milliseconds => {
  const totalSeconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

function GuestBattleQaResult({ result, lang, onAction }) {
  if (!result) return null;
  const vi = lang === 'vi';
  const won = result.outcome === 'victory';
  const invoke = (event, action) => {
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    onAction?.(action);
  };
  const accessible = (event, action) => {
    event.stopPropagation();
    if (event.detail === 0) onAction?.(action);
  };
  const actionButton = (action, label, primary = false) => <button type="button"
    className={primary ? styles.qaResultPrimary : undefined}
    onPointerDown={event => invoke(event, action)}
    onPointerUp={event => event.stopPropagation()}
    onPointerCancel={event => event.stopPropagation()}
    onClick={event => accessible(event, action)}>{label}</button>;
  return <section className={styles.qaResultBackdrop} role="dialog" aria-modal="true"
    aria-label={vi ? 'Kết quả kiểm thử trận' : 'Battle QA result'}>
    <div className={styles.qaResultPanel} data-qa-outcome={result.outcome}>
      <small>{vi ? 'GUEST COMBAT QA · KHÔNG LƯU DỮ LIỆU' : 'GUEST COMBAT QA · NO DATA WRITTEN'}</small>
      <h2>{won ? (vi ? 'HOÀN THÀNH KIỂM THỬ' : 'QA BATTLE CLEARED')
        : (vi ? 'KẾT THÚC KIỂM THỬ' : 'QA BATTLE ENDED')}</h2>
      <strong>{`${vi ? 'TINH CẦU' : 'PLANET'} ${result.planetId} · ${vi ? 'ẢI' : 'STAGE'} ${result.stageId}${result.isBoss ? ' · BOSS' : ''}`}</strong>
      <div className={styles.qaResultStats}>
        <span>{vi ? 'Hạ gục' : 'Kills'} <b>{result.kills}</b></span>
        <span>{vi ? 'Điểm' : 'Score'} <b>{result.score}</b></span>
        <span>HP <b>{result.hp}/{result.maxHp}</b></span>
        <span>{vi ? 'Thời gian' : 'Time'} <b>{formatQaTime(result.durationMs)}</b></span>
      </div>
      <p>{vi ? 'Không cộng Xu/EXP/sao, không mở ải thật và không gửi trusted outcome.'
        : 'No coins/EXP/stars, no real unlock and no trusted outcome.'}</p>
      <div className={styles.qaResultActions}>
        {actionButton('replay', vi ? 'CHƠI LẠI' : 'REPLAY', true)}
        {won && actionButton('next', vi ? 'ẢI TIẾP' : 'NEXT STAGE')}
        {actionButton('boss', vi ? 'BOSS TEST' : 'BOSS TEST')}
        {actionButton('exit', vi ? 'THOÁT' : 'EXIT')}
      </div>
    </div>
  </section>;
}

function DebugReadout({ state, feedback, qaSelection, lang }) {
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
  const qaEquipmentText = state.qaEquipment
    ? `QA E${state.qaEquipment.presetIndex}/${state.qaEquipment.presetTotal}: `
      + `${describeGuestCombatQaEquipmentPresetV2(state.qaEquipment.presetId, lang)}`
      + ` · CR ${Number(state.qaEquipment.combatRating || 0).toLocaleString('en-US')}`
    : null;
  return <output className={styles.debugReadout} aria-live="polite">
    <b>{localizeGuestFeedbackV2(profile?.name, lang)}</b>
    <span>{localizeGuestFeedbackV2(profile?.detail, lang)}</span>
    <span>{localizeGuestFeedbackV2(armorProfile?.name, lang)} · {feedbackText}</span>
    {gateText && <span>{gateText}</span>}
    {qaForceText && <span>{qaForceText}</span>}
    {qaEquipmentText && <span>{qaEquipmentText}</span>}
    {qaSelection && <span>{`QA P${qaSelection.planetId} · T${qaSelection.stageId}${qaSelection.isBoss ? ' · BOSS' : ''}`}</span>}
  </output>;
}

export default function GuestAbilityControls({
  state,
  feedback = null,
  onActivate,
  onQaCycle = null,
  qaSelection = null,
  onQaNavigate = null,
  qaResult = null,
  onQaResultAction = null,
  lang = 'vi',
  hideCombatControls = false,
}) {
  if (!state?.ship && !qaResult) return null;
  return <>
    {state?.ship && <aside
      className={`${styles.controls} ${hideCombatControls ? styles.qaOnlyControls : ''}`}
      aria-label={lang === 'vi' ? 'Kỹ năng trận Guest' : 'Guest battle skill'}
      data-feedback-version="guest-ability-feedback-v2.6a"
      data-battle-phase={state.activationGate?.battlePhase || 'UNKNOWN'}
    >
      <DebugReadout state={state} feedback={feedback} qaSelection={qaSelection} lang={lang} />
      {!hideCombatControls && <ShipAction
        slot={state.ship}
        activationGate={state.activationGate}
        lang={lang}
        onActivate={onActivate}
        feedback={feedback}
        currentTick={state.tick}
      />}
      {!hideCombatControls && <ArmorPassive armor={state.armor} lang={lang} currentTick={state.tick} />}
      <MobileQaLoadoutSwitcher activationGate={state.activationGate} qaSelection={qaSelection}
        onQaCycle={onQaCycle} onQaNavigate={onQaNavigate} lang={lang} />
    </aside>}
    <GuestBattleQaResult result={qaResult} lang={lang} onAction={onQaResultAction} />
  </>;
}
