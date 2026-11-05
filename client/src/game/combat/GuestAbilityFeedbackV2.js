/**
 * Presentation-only feedback contract for Guest Combat Foundation V2.
 *
 * This module never mutates combat state. It converts stable ability/armor IDs
 * into localized HUD copy, tone and lightweight VFX hints. React and Babylon
 * consume the same immutable event so visible feedback cannot drift from the
 * deterministic runtime result.
 */
import {
  ARMOR_TRAITS_V2,
  COMBAT_TICK_RATE,
  SHIP_ACTIVE_SKILLS_V2,
} from './GuestAbilityCatalogV2.js';

export const GUEST_ABILITY_FEEDBACK_VERSION = 'guest-ability-feedback-v2.1.0';

const text = (vi, en) => Object.freeze({ vi, en });
const freeze = value => Object.freeze(value);
const percent = ratio => Math.round(Number(ratio || 0) * 100);
const seconds = ticks => Math.round((Number(ticks || 0) / COMBAT_TICK_RATE) * 10) / 10;
const signedPercent = ratio => `${ratio >= 0 ? '+' : ''}${percent(ratio)}%`;
const localize = (value, lang = 'vi') => value?.[lang === 'vi' ? 'vi' : 'en'] || value?.vi || value?.en || '';

const KIND_PROFILES = freeze({
  overdrive: freeze({ tone: 'assault', color: '#ffb24c', secondary: '#5be5f3', icon: '✦', fx: 'aura', pulseScale: 1.55 }),
  mark: freeze({ tone: 'precision', color: '#ffd166', secondary: '#ff8f3f', icon: '◎', fx: 'target', pulseScale: 1.25 }),
  barrier: freeze({ tone: 'defense', color: '#55e6ff', secondary: '#72a7ff', icon: '⬡', fx: 'shield', pulseScale: 1.45 }),
  cloak: freeze({ tone: 'stealth', color: '#a28cff', secondary: '#5be5f3', icon: '◇', fx: 'cloak', pulseScale: 1.35 }),
  pierce: freeze({ tone: 'precision', color: '#ff63d4', secondary: '#79efff', icon: '➤', fx: 'weapon', pulseScale: 1.35 }),
  support: freeze({ tone: 'support', color: '#64efae', secondary: '#62dcff', icon: '+', fx: 'support', pulseScale: 1.45 }),
  burst: freeze({ tone: 'assault', color: '#ff914d', secondary: '#ffe074', icon: '≡', fx: 'weapon', pulseScale: 1.35 }),
  area: freeze({ tone: 'power', color: '#72f4ff', secondary: '#8aa7ff', icon: '◉', fx: 'wave', pulseScale: 1.85 }),
  pull: freeze({ tone: 'control', color: '#a779ff', secondary: '#61e9ff', icon: '⊙', fx: 'wave', pulseScale: 1.9 }),
  heal: freeze({ tone: 'support', color: '#69f0a9', secondary: '#b2ffda', icon: '+', fx: 'support', pulseScale: 1.45 }),
});

const ARMOR_PROFILES = freeze({
  evade: freeze({ tone: 'success', color: '#67ef9f', icon: '◇', title: text('NÉ ĐẠN TỰ ĐỘNG', 'AUTO PROJECTILE EVADE'), detail: text('Đạn hợp lệ bị vô hiệu hóa · không mất khiên', 'Eligible projectile negated · shield preserved') }),
  pilot_evade: freeze({ tone: 'success', color: '#67ef9f', icon: '◇', title: text('PHI CÔNG NÉ ĐẠN', 'PILOT PROJECTILE EVADE'), detail: text('Đạn hợp lệ bị vô hiệu hóa', 'Eligible projectile negated') }),
  reactive_reflect: freeze({ tone: 'defense', color: '#ffb24c', icon: '↺', title: text('GIÁP PHẢN ỨNG', 'REACTIVE ARMOR'), detail: text('Đã phản lại sát thương', 'Damage reflected') }),
  crystal_prism: freeze({ tone: 'defense', color: '#8ee9ff', icon: '◇', title: text('LĂNG KÍNH KÍCH HOẠT', 'CRYSTAL PRISM'), detail: text('Đòn thứ năm được giảm và phản lại', 'Fifth hit reduced and reflected') }),
  nano_repair: freeze({ tone: 'support', color: '#69f0a9', icon: '+', title: text('NANO TỰ SỬA', 'NANO REPAIR'), detail: text('Đang phục hồi giáp thân', 'Hull recovery active') }),
});

const SKILL_HUD_ICONS = freeze({
  skill_focus_fire: '✦',
  skill_recon_lock: '⌖',
  skill_bulwark_guard: '⬡',
  skill_shadow_cloak: '◈',
  skill_void_lance: '➤',
  skill_support_field: '+',
  skill_assault_overdrive: 'ϟ',
  skill_phase_salvo: '≡',
  skill_ion_pulse: '◉',
  skill_fortress_guard: '▣',
  skill_gravity_pulse: '⊙',
  skill_nova_burst: '✹',
  skill_repair_protocol: '⟲',
  skill_hunter_mark: '◎',
  skill_titan_shockwave: '◆',
  skill_rally_beacon: '✧',
});

const ARMOR_HUD_PROFILES = freeze({
  armor_auto_evade: freeze({ color: '#67ef9f', icon: '◇' }),
  armor_stable_plating: freeze({ color: '#79b8ff', icon: '⬢' }),
  armor_recharge_shield: freeze({ color: '#55e6ff', icon: '⬡' }),
  armor_reactive_plating: freeze({ color: '#ffb24c', icon: '↺' }),
  armor_nano_repair: freeze({ color: '#69f0a9', icon: '+' }),
  armor_void_damping: freeze({ color: '#a28cff', icon: '◈' }),
  armor_crystal_prism: freeze({ color: '#8ee9ff', icon: '◆' }),
});

const SKILLS_BY_ID = new Map(Object.values(SHIP_ACTIVE_SKILLS_V2).map(skill => [skill.id, skill]));
const ARMOR_ENTRIES = Object.entries(ARMOR_TRAITS_V2);
const ARMORS_BY_CATALOG_ID = new Map(ARMOR_ENTRIES);
const ARMORS_BY_RUNTIME_ID = new Map(ARMOR_ENTRIES.map(([catalogId, armor]) => [armor.id, Object.freeze({ ...armor, catalogId })]));

export function localizeGuestFeedbackV2(value, lang = 'vi') {
  return localize(value, lang);
}

export function getGuestAbilitySkillV2(abilityId) {
  return SKILLS_BY_ID.get(String(abilityId || '')) || null;
}

export function getGuestArmorTraitV2(armorId) {
  const key = String(armorId || '');
  const byRuntime = ARMORS_BY_RUNTIME_ID.get(key);
  if (byRuntime) return byRuntime;
  const byCatalog = ARMORS_BY_CATALOG_ID.get(key);
  return byCatalog ? Object.freeze({ ...byCatalog, catalogId: key }) : null;
}

export function getGuestArmorFeedbackProfileV2(armorId) {
  const armor = getGuestArmorTraitV2(armorId);
  if (!armor) return null;
  const style = ARMOR_HUD_PROFILES[armor.id] || ARMOR_HUD_PROFILES.armor_stable_plating;
  return freeze({
    version: GUEST_ABILITY_FEEDBACK_VERSION,
    armorId: armor.id,
    catalogId: armor.catalogId || null,
    name: armor.name,
    trigger: armor.trigger,
    detail: describeGuestArmorV2(armor),
    ...style,
  });
}

export function describeGuestAbilityV2(skillOrId) {
  const skill = typeof skillOrId === 'string' ? getGuestAbilitySkillV2(skillOrId) : skillOrId;
  if (!skill) return text('KỸ NĂNG KHÔNG XÁC ĐỊNH', 'UNKNOWN ABILITY');
  const p = skill.params || {};
  const duration = seconds(skill.durationTicks);
  switch (skill.kind) {
    case 'overdrive': {
      const fireRateGain = Math.round((1 / Math.max(.01, Number(p.fireIntervalMultiplier || 1)) - 1) * 100);
      const damageGain = percent(Number(p.damageMultiplier || 1) - 1);
      return text(`SÁT THƯƠNG +${damageGain}% · NHỊP BẮN +${fireRateGain}% · ${duration.toFixed(1)} GIÂY`,
        `DAMAGE +${damageGain}% · FIRE RATE +${fireRateGain}% · ${duration.toFixed(1)}s`);
    }
    case 'mark':
      return text(`MỤC TIÊU NHẬN ${signedPercent(p.markedDamageBonus)} SÁT THƯƠNG · ${duration.toFixed(1)} GIÂY`,
        `TARGET TAKES ${signedPercent(p.markedDamageBonus)} DAMAGE · ${duration.toFixed(1)}s`);
    case 'barrier':
      return text(`KHIÊN +${percent(p.shieldRatio)}% HP · GIẢM SÁT THƯƠNG ${percent(p.mitigation)}% · ${duration.toFixed(1)} GIÂY`,
        `SHIELD +${percent(p.shieldRatio)}% HP · DAMAGE REDUCTION ${percent(p.mitigation)}% · ${duration.toFixed(1)}s`);
    case 'cloak':
      return text(`GIẢM BỊ NHẮM · GIẢM SÁT THƯƠNG ${percent(p.mitigation)}% · ${duration.toFixed(1)} GIÂY`,
        `TARGETING SUPPRESSED · DAMAGE REDUCTION ${percent(p.mitigation)}% · ${duration.toFixed(1)}s`);
    case 'pierce':
      return text(`PHÁT XUYÊN ×${Number(p.damageMultiplier || 1).toFixed(2)} · XUYÊN ${Math.max(1, Number(p.penetration || 1))} MỤC TIÊU`,
        `PIERCING SHOT ×${Number(p.damageMultiplier || 1).toFixed(2)} · ${Math.max(1, Number(p.penetration || 1))} TARGETS`);
    case 'support': {
      const piecesVi = [];
      const piecesEn = [];
      if (p.damageMultiplier) {
        piecesVi.push(`SÁT THƯƠNG +${percent(p.damageMultiplier - 1)}%`);
        piecesEn.push(`DAMAGE +${percent(p.damageMultiplier - 1)}%`);
      }
      if (p.healRatio) {
        piecesVi.push(`HỒI ${percent(p.healRatio)}% HP`);
        piecesEn.push(`HEAL ${percent(p.healRatio)}% HP`);
      }
      piecesVi.push(`${duration.toFixed(1)} GIÂY`);
      piecesEn.push(`${duration.toFixed(1)}s`);
      return text(piecesVi.join(' · '), piecesEn.join(' · '));
    }
    case 'burst':
      return text(`${Number(p.shots || 1)} PHÁT · MỖI PHÁT ${percent(p.shotDamageMultiplier)}% SÁT THƯƠNG`,
        `${Number(p.shots || 1)} SHOTS · ${percent(p.shotDamageMultiplier)}% DAMAGE EACH`);
    case 'area': {
      const slow = Number(p.slowTicks || 0) > 0 ? seconds(p.slowTicks) : 0;
      return text(`SÓNG XUNG KÍCH ${percent(p.damageMultiplier)}% · BÁN KÍNH ${Number(p.radius || 0).toFixed(1)}${slow ? ` · CHẬM ${slow.toFixed(1)} GIÂY` : ''}`,
        `SHOCKWAVE ${percent(p.damageMultiplier)}% · RADIUS ${Number(p.radius || 0).toFixed(1)}${slow ? ` · SLOW ${slow.toFixed(1)}s` : ''}`);
    }
    case 'pull':
      return text(`GOM QUÁI ${Number(p.pullDistance || 0).toFixed(1)} · BÁN KÍNH ${Number(p.radius || 0).toFixed(1)} · CHẬM ${seconds(p.slowTicks).toFixed(1)} GIÂY`,
        `PULL ${Number(p.pullDistance || 0).toFixed(1)} · RADIUS ${Number(p.radius || 0).toFixed(1)} · SLOW ${seconds(p.slowTicks).toFixed(1)}s`);
    case 'heal':
      return text(`HỒI ${percent(p.healRatio)}% HP${p.shieldRatio ? ` · KHIÊN +${percent(p.shieldRatio)}% HP` : ''}`,
        `HEAL ${percent(p.healRatio)}% HP${p.shieldRatio ? ` · SHIELD +${percent(p.shieldRatio)}% HP` : ''}`);
    default:
      return text('KÍCH HOẠT THÀNH CÔNG', 'ACTIVATED');
  }
}

export function describeGuestArmorV2(armorOrId) {
  const armor = typeof armorOrId === 'string' ? getGuestArmorTraitV2(armorOrId) : armorOrId;
  if (!armor) return text('NỘI TẠI GIÁP KHÔNG XÁC ĐỊNH', 'UNKNOWN ARMOR PASSIVE');
  const p = armor.params || {};
  switch (armor.id) {
    case 'armor_auto_evade':
      return text(
        `TỰ ĐỘNG · ${Number(p.chancePermillePve || 0) / 10}% CƠ HỘI VÔ HIỆU HÓA ĐẠN HỢP LỆ TRONG PvE · ${Number(p.chancePermillePvp || 0) / 10}% TRONG PvP · HỒI NỘI BỘ ${seconds(p.internalCooldownTicks).toFixed(1)} GIÂY · KHÔNG NÉ VA CHẠM`,
        `AUTOMATIC · ${Number(p.chancePermillePve || 0) / 10}% CHANCE TO NEGATE AN ELIGIBLE PROJECTILE IN PvE · ${Number(p.chancePermillePvp || 0) / 10}% IN PvP · ${seconds(p.internalCooldownTicks).toFixed(1)}s INTERNAL COOLDOWN · DOES NOT EVADE CONTACT`,
      );
    case 'armor_stable_plating':
      return text(
        `LUÔN BẬT · GIẢM ${percent(1 - Number(p.incomingMultiplier || 1))}% SÁT THƯƠNG NHẬN VÀO`,
        `ALWAYS ON · REDUCES INCOMING DAMAGE BY ${percent(1 - Number(p.incomingMultiplier || 1))}%`,
      );
    case 'armor_recharge_shield':
      return text(
        `LUÔN BẬT · KHIÊN BẰNG ${percent(p.shieldRatio)}% HP · SAU ${seconds(p.rechargeDelayTicks).toFixed(1)} GIÂY KHÔNG TRÚNG ĐÒN, NẠP ${percent(p.rechargeRatioPerSecond)}% HP MỖI GIÂY`,
        `ALWAYS ON · SHIELD EQUAL TO ${percent(p.shieldRatio)}% HP · AFTER ${seconds(p.rechargeDelayTicks).toFixed(1)}s WITHOUT DAMAGE, RECHARGES ${percent(p.rechargeRatioPerSecond)}% HP PER SECOND`,
      );
    case 'armor_reactive_plating':
      return text(
        `TỰ ĐỘNG · PHẢN ${percent(p.reflectRatio)}% SÁT THƯƠNG ĐẠN · HỒI NỘI BỘ ${seconds(p.internalCooldownTicks).toFixed(1)} GIÂY`,
        `AUTOMATIC · REFLECTS ${percent(p.reflectRatio)}% PROJECTILE DAMAGE · ${seconds(p.internalCooldownTicks).toFixed(1)}s INTERNAL COOLDOWN`,
      );
    case 'armor_nano_repair':
      return text(
        `TỰ ĐỘNG · SAU ${seconds(p.delayTicks).toFixed(1)} GIÂY KHÔNG TRÚNG ĐÒN, HỒI ${percent(p.healRatioPerSecond)}% HP MỖI GIÂY · TỐI ĐA ${percent(p.battleHealCapRatio)}% HP MỖI TRẬN`,
        `AUTOMATIC · AFTER ${seconds(p.delayTicks).toFixed(1)}s WITHOUT DAMAGE, RESTORES ${percent(p.healRatioPerSecond)}% HP PER SECOND · CAPPED AT ${percent(p.battleHealCapRatio)}% HP PER BATTLE`,
      );
    case 'armor_void_damping':
      return text(
        `LUÔN BẬT · GIẢM ${percent(1 - Number(p.typedIncomingMultiplier || 1))}% SÁT THƯƠNG ENERGY/ION/VOID VÀ ${percent(1 - Number(p.genericIncomingMultiplier || 1))}% CÁC LOẠI KHÁC`,
        `ALWAYS ON · REDUCES ENERGY/ION/VOID DAMAGE BY ${percent(1 - Number(p.typedIncomingMultiplier || 1))}% AND OTHER DAMAGE BY ${percent(1 - Number(p.genericIncomingMultiplier || 1))}%`,
      );
    case 'armor_crystal_prism':
      return text(
        `TỰ ĐỘNG · MỖI ĐÒN ĐẠN THỨ ${Number(p.hitsPerProc || 1)} GIẢM ${percent(1 - Number(p.procIncomingMultiplier || 1))}% SÁT THƯƠNG VÀ PHẢN ${percent(p.reflectRatio)}%`,
        `AUTOMATIC · EVERY ${Number(p.hitsPerProc || 1)}TH PROJECTILE HIT REDUCES DAMAGE BY ${percent(1 - Number(p.procIncomingMultiplier || 1))}% AND REFLECTS ${percent(p.reflectRatio)}%`,
      );
    default:
      return text('NỘI TẠI TỰ ĐỘNG', 'AUTOMATIC PASSIVE');
  }
}

export function getGuestAbilityFeedbackProfileV2(skillOrId) {
  const skill = typeof skillOrId === 'string' ? getGuestAbilitySkillV2(skillOrId) : skillOrId;
  if (!skill) return null;
  const style = KIND_PROFILES[skill.kind] || KIND_PROFILES.overdrive;
  return freeze({
    version: GUEST_ABILITY_FEEDBACK_VERSION,
    abilityId: skill.id,
    name: skill.name,
    kind: skill.kind,
    detail: describeGuestAbilityV2(skill),
    durationTicks: skill.durationTicks,
    cooldownTicks: skill.cooldownTicks,
    ...style,
    iconKey: skill.id,
    icon: SKILL_HUD_ICONS[skill.id] || style.icon,
  });
}

export function createGuestAbilityActivationFeedbackV2({ abilityId, tick = 0, sequence = 0 } = {}) {
  const profile = getGuestAbilityFeedbackProfileV2(abilityId);
  if (!profile) return null;
  const startedTick = Math.max(0, Math.trunc(Number(tick) || 0));
  return freeze({
    ...profile,
    id: `ship:${profile.abilityId}:${startedTick}:${Math.max(0, Math.trunc(Number(sequence) || 0))}`,
    scope: 'ship',
    status: 'activated',
    startedTick,
    toastUntilTick: startedTick + Math.round(COMBAT_TICK_RATE * .95),
    activeUntilTick: startedTick + profile.durationTicks,
    cooldownUntilTick: startedTick + profile.cooldownTicks,
  });
}

export function createGuestAbilityRejectedFeedbackV2({ abilityId, reason = 'UNAVAILABLE', tick = 0, sequence = 0 } = {}) {
  const profile = getGuestAbilityFeedbackProfileV2(abilityId);
  if (!profile) return null;
  const startedTick = Math.max(0, Math.trunc(Number(tick) || 0));
  const reasonText = reason === 'NO_TARGET'
    ? text('KHÔNG CÓ MỤC TIÊU HỢP LỆ', 'NO VALID TARGET')
    : reason === 'COOLDOWN'
      ? text('KỸ NĂNG ĐANG HỒI', 'ABILITY ON COOLDOWN')
      : text('CHƯA THỂ KÍCH HOẠT', 'ABILITY UNAVAILABLE');
  return freeze({
    ...profile,
    id: `ship-reject:${profile.abilityId}:${startedTick}:${Math.max(0, Math.trunc(Number(sequence) || 0))}`,
    scope: 'ship',
    status: 'rejected',
    tone: 'warning',
    color: '#ffbd5a',
    detail: reasonText,
    startedTick,
    toastUntilTick: startedTick + Math.round(COMBAT_TICK_RATE * .8),
    activeUntilTick: startedTick,
    cooldownUntilTick: startedTick,
    reason,
  });
}

export function createGuestArmorProcFeedbackV2({ armorId, proc, tick = 0, sequence = 0, amount = 0 } = {}) {
  const profile = ARMOR_PROFILES[proc];
  if (!profile) return null;
  const armor = getGuestArmorTraitV2(armorId);
  const startedTick = Math.max(0, Math.trunc(Number(tick) || 0));
  const detail = amount > 0 && proc === 'reactive_reflect'
    ? text(`PHẢN ${Math.round(amount)} SÁT THƯƠNG`, `REFLECTED ${Math.round(amount)} DAMAGE`)
    : amount > 0 && proc === 'nano_repair'
      ? text(`HỒI ${Math.round(amount)} HP`, `RESTORED ${Math.round(amount)} HP`)
      : profile.detail;
  return freeze({
    version: GUEST_ABILITY_FEEDBACK_VERSION,
    id: `armor:${armorId || 'pilot'}:${proc}:${startedTick}:${Math.max(0, Math.trunc(Number(sequence) || 0))}`,
    scope: proc === 'pilot_evade' ? 'pilot' : 'armor',
    status: 'proc',
    armorId: armor?.id || armorId || null,
    proc,
    name: profile.title,
    detail,
    tone: profile.tone,
    color: profile.color,
    secondary: profile.color,
    icon: profile.icon,
    fx: proc.includes('evade') ? 'evade' : 'defense',
    pulseScale: proc.includes('evade') ? 1.65 : 1.35,
    startedTick,
    toastUntilTick: startedTick + Math.round(COMBAT_TICK_RATE * .75),
    activeUntilTick: startedTick,
    cooldownUntilTick: startedTick,
  });
}

export function auditGuestAbilityFeedbackV2() {
  const issues = [];
  for (const skill of Object.values(SHIP_ACTIVE_SKILLS_V2)) {
    const profile = getGuestAbilityFeedbackProfileV2(skill);
    if (!profile) { issues.push(`MISSING_PROFILE:${skill.id}`); continue; }
    if (!localize(profile.name, 'vi') || !localize(profile.name, 'en')) issues.push(`MISSING_NAME:${skill.id}`);
    if (!localize(profile.detail, 'vi') || !localize(profile.detail, 'en')) issues.push(`MISSING_DETAIL:${skill.id}`);
    if (!/^#[0-9a-f]{6}$/i.test(profile.color)) issues.push(`INVALID_COLOR:${skill.id}`);
    if (!profile.fx || !profile.tone) issues.push(`INCOMPLETE_PROFILE:${skill.id}`);
  }
  for (const key of ['evade', 'pilot_evade', 'reactive_reflect', 'crystal_prism', 'nano_repair']) {
    if (!ARMOR_PROFILES[key]) issues.push(`MISSING_ARMOR_PROC:${key}`);
  }
  for (const [catalogId, armor] of ARMOR_ENTRIES) {
    const profile = getGuestArmorFeedbackProfileV2(catalogId);
    if (!profile) { issues.push(`MISSING_ARMOR_HUD:${catalogId}`); continue; }
    if (profile.armorId !== armor.id) issues.push(`ARMOR_ID_DRIFT:${catalogId}`);
    if (!localize(profile.name, 'vi') || !localize(profile.name, 'en')) issues.push(`MISSING_ARMOR_NAME:${catalogId}`);
    if (!localize(profile.detail, 'vi') || !localize(profile.detail, 'en')) issues.push(`MISSING_ARMOR_DETAIL:${catalogId}`);
    if (!/^#[0-9a-f]{6}$/i.test(profile.color) || !profile.icon) issues.push(`INVALID_ARMOR_HUD:${catalogId}`);
  }
  return freeze(issues);
}
