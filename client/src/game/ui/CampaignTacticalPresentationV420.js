/**
 * Campaign projection for the shared Campaign/Dungeon tactical HUD V4.2.0.
 * Pure presentation only: no combat, cooldown, reward or progression authority.
 */
import { COMBAT_TICK_RATE } from '../combat/GuestAbilityCatalogV2.js';
import {
  getGuestAbilityFeedbackProfileV2,
  getGuestArmorFeedbackProfileV2,
  getGuestArmorTraitV2,
  localizeGuestFeedbackV2,
} from '../combat/GuestAbilityFeedbackV2.js';

export const CAMPAIGN_TACTICAL_PRESENTATION_VERSION_V420 = 'campaign-tactical-presentation-v4.2.0';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.max(0, Math.round(finite(value, fallback)));
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value)));
const localized = (value, lang = 'vi') => localizeGuestFeedbackV2(value, lang) || '';
const secondsText = ticks => {
  const seconds = Math.max(0, finite(ticks) / Math.max(1, COMBAT_TICK_RATE));
  return seconds < 10 ? seconds.toFixed(1) : String(Math.ceil(seconds));
};

export function projectCampaignTacticalHudV420({
  state = {},
  planetId = 1,
  lang = 'vi',
  qa = false,
} = {}) {
  const vi = lang === 'vi';
  const stage = Math.max(1, integer(state.stage, 1));
  const wave = Math.max(1, integer(state.wave, 1));
  const wavesTotal = Math.max(1, integer(state.wavesTotal, 5));
  const bossMaxHp = Math.max(0, finite(state.bossMaxHp));
  const bossHp = Math.max(0, finite(state.bossHp));
  const bossActive = state.bossHp !== null && state.bossHp !== undefined && bossMaxHp > 0;

  return Object.freeze({
    modeCode: `P${Math.max(1, integer(planetId, 1))}`,
    phaseLabel: `${vi ? 'ẢI' : 'STAGE'} ${stage}`,
    objectiveCounter: bossActive
      ? (vi ? 'TRÙM' : 'BOSS')
      : `${vi ? 'ĐỢT' : 'WAVE'} ${wave}/${wavesTotal}`,
    hp: integer(state.hp),
    maxHp: Math.max(1, integer(state.maxHp, 1)),
    score: integer(state.score),
    kills: integer(state.kills),
    qa: Boolean(qa),
    armorIcon: '⬡',
    boss: bossActive ? Object.freeze({
      active: true,
      name: vi ? `TRÙM TINH CẦU ${Math.max(1, integer(planetId, 1))}` : `PLANET ${Math.max(1, integer(planetId, 1))} BOSS`,
      hp: bossHp,
      maxHp: bossMaxHp,
    }) : null,
    palette: Object.freeze({
      accent: '#5be5f3',
      accentDim: '#17647c',
      objective: '#ffc45d',
      danger: '#ff5164',
      text: '#eaffff',
      muted: '#8eb3c0',
    }),
  });
}

function projectArmorPassive(armor, tick = 0, lang = 'vi') {
  if (!armor?.id) return null;
  const trait = getGuestArmorTraitV2(armor.id);
  const profile = getGuestArmorFeedbackProfileV2(armor.id);
  const params = trait?.params || {};
  let remainingTicks = 0;
  let progress = 1;
  let badge = null;
  let exhausted = false;
  let active = false;

  switch (armor.id) {
    case 'armor_auto_evade':
    case 'armor_reactive_plating': {
      remainingTicks = Math.max(0, integer(armor.procRemainingTicks));
      const total = Math.max(1, integer(params.internalCooldownTicks, 1));
      progress = remainingTicks > 0 ? clamp(1 - remainingTicks / total) : 1;
      break;
    }
    case 'armor_recharge_shield': {
      remainingTicks = Math.max(0, integer(armor.rechargeDelayRemainingTicks));
      const total = Math.max(1, integer(params.rechargeDelayTicks, 1));
      const barrierMax = Math.max(0, finite(armor.barrierMax));
      const barrierHp = Math.max(0, finite(armor.barrierHp));
      progress = remainingTicks > 0
        ? clamp(1 - remainingTicks / total)
        : barrierMax > 0 ? clamp(barrierHp / barrierMax) : 0;
      badge = barrierMax > 0 ? `${Math.round(progress * 100)}%` : null;
      active = barrierHp > 0;
      break;
    }
    case 'armor_nano_repair': {
      remainingTicks = Math.max(0, integer(armor.nanoDelayRemainingTicks));
      const total = Math.max(1, integer(params.delayTicks, 1));
      const cap = Math.max(0, finite(armor.nanoHealCap));
      const used = Math.max(0, finite(armor.nanoHealTotal));
      exhausted = cap > 0 && used >= cap;
      progress = exhausted ? 0 : remainingTicks > 0 ? clamp(1 - remainingTicks / total) : 1;
      active = Boolean(armor.nanoActive || armor.repairActive);
      break;
    }
    case 'armor_crystal_prism': {
      const charge = Math.max(0, integer(armor.charge));
      const chargeMax = Math.max(1, integer(armor.chargeMax, params.hitsPerProc || 1));
      progress = clamp(charge / chargeMax);
      badge = `${charge}/${chargeMax}`;
      break;
    }
    case 'armor_void_damping':
    case 'armor_stable_plating':
      active = true;
      progress = 1;
      break;
    default:
      progress = 1;
      break;
  }

  const currentTick = Math.max(0, integer(tick));
  const lastProcTick = armor.lastProcTick == null ? null : integer(armor.lastProcTick);
  const pulse = lastProcTick !== null && currentTick - lastProcTick <= Math.round(COMBAT_TICK_RATE * .8);

  return Object.freeze({
    label: localized(profile?.name || armor.name, lang) || (lang === 'vi' ? 'GIÁP NỘI TẠI' : 'PASSIVE ARMOR'),
    icon: profile?.icon || '⬡',
    color: profile?.color || '#67ef9f',
    progress,
    badge: remainingTicks > 0 ? secondsText(remainingTicks) : badge,
    active,
    exhausted,
    pulse,
    pulseKey: pulse ? `${armor.id}:${lastProcTick}` : null,
  });
}

export function projectCampaignTacticalAbilityV420({
  state = null,
  feedback = null,
  lang = 'vi',
} = {}) {
  if (!state?.ship) return null;
  const ship = state.ship;
  const gate = state.activationGate || { canActivate: true, lockReason: null };
  const profile = getGuestAbilityFeedbackProfileV2(ship.id);
  const remainingTicks = Math.max(0, integer(ship.remainingTicks));
  const cooldownTicks = Math.max(1, integer(ship.cooldownTicks, profile?.cooldownTicks || 1));
  const activeTicks = Math.max(0, integer(ship.activeTicks));
  const active = activeTicks > 0;
  const ready = Boolean(ship.ready) && gate.canActivate !== false;
  const cooldownProgress = ready ? 1 : clamp(1 - remainingTicks / cooldownTicks);
  const currentTick = Math.max(0, integer(state.tick));
  const visibleFeedback = feedback && currentTick <= integer(feedback.toastUntilTick, -1);

  return Object.freeze({
    active: Object.freeze({
      label: localized(profile?.name || ship.name, lang) || (lang === 'vi' ? 'KỸ NĂNG TÀU' : 'SHIP SKILL'),
      icon: profile?.icon || 'S',
      color: profile?.color || '#5be5f3',
      secondary: profile?.secondary || '#72a7ff',
      ready,
      locked: gate.canActivate === false,
      active,
      remainingSeconds: active ? secondsText(activeTicks) : remainingTicks > 0 ? secondsText(remainingTicks) : 0,
      cooldownProgress,
      lockReason: gate.lockReason || null,
    }),
    passive: projectArmorPassive(state.armor, currentTick, lang),
    feedback: visibleFeedback ? Object.freeze({
      visible: true,
      rejected: feedback?.status === 'rejected',
      name: localized(feedback?.name, lang),
      detail: localized(feedback?.detail, lang),
    }) : null,
  });
}

export function auditCampaignTacticalPresentationV420() {
  const issues = [];
  const hud = projectCampaignTacticalHudV420({ state: { stage: 3, wave: 2, wavesTotal: 5, hp: 80, maxHp: 100, kills: 4, score: 1200 }, planetId: 2 });
  if (hud.modeCode !== 'P2' || hud.phaseLabel !== 'ẢI 3' || hud.objectiveCounter !== 'ĐỢT 2/5') issues.push('HUD_PROJECTION');
  const boss = projectCampaignTacticalHudV420({ state: { bossHp: 50, bossMaxHp: 100 }, planetId: 4 });
  if (!boss.boss?.active || boss.objectiveCounter !== 'TRÙM') issues.push('BOSS_PROJECTION');
  return Object.freeze(issues);
}
