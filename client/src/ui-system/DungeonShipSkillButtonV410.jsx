/** Dungeon adapter for the shared tactical ability cluster V4.1.1. */
import React from 'react';
import { localizeGuestFeedbackV2 } from '../game/combat/GuestAbilityFeedbackV2.js';
import TacticalAbilityClusterV411 from './TacticalAbilityClusterV411.jsx';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export default function DungeonShipSkillButtonV410({
  lang = 'vi',
  state = null,
  feedback = null,
  onActivate = null,
} = {}) {
  if (!state?.ship || typeof onActivate !== 'function') return null;
  const ship = state.ship;
  const gate = state.activationGate || { canActivate: true, lockReason: null };
  const presentation = state.presentation || {};
  const tickRate = Math.max(1, Number(state.tickRate) || 30);
  const remainingTicks = Math.max(0, Number(ship.remainingTicks) || 0);
  const cooldownTicks = Math.max(1, Number(ship.cooldownTicks) || 1);
  const remainingSeconds = Math.ceil(remainingTicks / tickRate);
  const ready = Boolean(ship.ready) && gate.canActivate;
  const cooldownProgress = ready
    ? 1
    : clamp(1 - (remainingTicks / cooldownTicks), 0, 1);
  const label = localizeGuestFeedbackV2(presentation.name || ship.name, lang)
    || (lang === 'vi' ? 'KỸ NĂNG TÀU' : 'SHIP SKILL');
  const visibleFeedback = feedback && Number(feedback.toastUntilTick) >= Number(state.tick);
  const passiveArmor = state.passiveArmor || null;

  return <TacticalAbilityClusterV411
    lang={lang}
    active={{
      label,
      icon: presentation.icon || 'S',
      color: presentation.color || '#5be5f3',
      secondary: presentation.secondary || '#72a7ff',
      ready,
      locked: !gate.canActivate,
      active: Boolean(ship.active),
      remainingSeconds,
      cooldownProgress,
    }}
    passive={passiveArmor ? {
      label: localizeGuestFeedbackV2(passiveArmor.label, lang) || String(passiveArmor.label || ''),
      icon: passiveArmor.icon,
      color: passiveArmor.color,
      progress: passiveArmor.progress,
      badge: passiveArmor.badge,
      active: passiveArmor.active,
      exhausted: passiveArmor.exhausted,
      pulse: passiveArmor.pulse,
      pulseKey: passiveArmor.pulseKey,
    } : null}
    feedback={visibleFeedback ? {
      visible: true,
      rejected: feedback?.status === 'rejected',
      name: localizeGuestFeedbackV2(feedback?.name, lang),
      detail: localizeGuestFeedbackV2(feedback?.detail, lang),
    } : null}
    onActivate={() => onActivate('ship_skill')}
  />;
}
