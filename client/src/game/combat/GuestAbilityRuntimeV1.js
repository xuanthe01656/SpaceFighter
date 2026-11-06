/**
 * Small tick-driven Guest QA ability runtime (30 Hz).
 * No network, Date.now, Math.random, Babylon, Firebase or persistent state.
 * Combat scene applies returned *intent events*; effects are never trusted
 * server outcomes. Shared primitives can be ported into a NEW C15 ruleset.
 */
import { ARMOR_ABILITY_TRAITS, GUEST_ABILITY_RULES_VERSION, SHIP_ACTIVE_SKILLS } from './GuestAbilityCatalogV1.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function createGuestAbilityRuntime({aircraftId, armorId = null, maxHp = 1000} = {}) {
  const ship = SHIP_ACTIVE_SKILLS[aircraftId];
  if (!ship) throw new Error(`Unknown guest aircraft ability: ${aircraftId}`);
  const armorTrait = armorId ? ARMOR_ABILITY_TRAITS[armorId] : null;
  const armor = armorTrait?.trigger === 'manual' ? armorTrait.ability : null;
  if (armorId && !armorTrait) throw new Error(`Unknown guest armor trait: ${armorId}`);
  const definitions = Object.freeze({ ship_skill: ship, armor_active: armor });
  const readyAt = { ship_skill: 0, armor_active: 0 };
  const activeUntil = { ship_skill: 0, armor_active: 0 };
  const activeKinds = { ship_skill: '', armor_active: '' };
  let tick = 0, barrierHp = 0, barrierUntil = 0;

  const snapshotSlot = slot => {
    const ability = definitions[slot];
    if (!ability) return null;
    return { id: ability.id, name: ability.name, kind: ability.kind,
      cooldownTicks: ability.cooldownTicks, remainingTicks: Math.max(0, readyAt[slot] - tick),
      activeTicks: Math.max(0, activeUntil[slot] - tick), ready: tick >= readyAt[slot] };
  };
  const active = slot => tick < activeUntil[slot];
  const modifiers = () => {
    const shipActive = active('ship_skill') ? definitions.ship_skill : null;
    const armorActive = active('armor_active') ? definitions.armor_active : null;
    const sources = [shipActive, armorActive].filter(Boolean);
    return {
      damageMultiplier: sources.reduce((n, a) => n * (a.params.damageMultiplier || 1), 1),
      fireIntervalMultiplier: sources.reduce((n,a) => n * (a.params.fireIntervalMultiplier || 1), 1),
      incomingMultiplier: sources.reduce((n,a) => n * (1 - (a.params.mitigation || 0)), 1),
      evade: sources.reduce((n,a) => Math.max(n,a.params.evade || 0), 0),
      cloaked: sources.some(a => a.kind === 'cloak'),
    };
  };
  const activate = slot => {
    const ability = definitions[slot];
    if (!ability) return {ok:false,reason:'NO_EQUIPPED_ABILITY'};
    if (tick < readyAt[slot]) return {ok:false,reason:'COOLDOWN',remainingTicks:readyAt[slot]-tick};
    readyAt[slot] = tick + ability.cooldownTicks;
    activeUntil[slot] = tick + ability.durationTicks;
    activeKinds[slot] = ability.kind;
    const p = ability.params;
    const events = [];
    if (ability.kind === 'dash') events.push({type:'dash',distance:p.distance,evade:p.evade});
    if (ability.kind === 'mark') events.push({type:'mark',range:p.range,bonus:p.markedDamageBonus,durationTicks:ability.durationTicks});
    if (ability.kind === 'barrier') { barrierHp = clamp(barrierHp+Math.round(maxHp*(p.shieldRatio||0)),0,Math.round(maxHp*.35)); barrierUntil = Math.max(barrierUntil, activeUntil[slot]); }
    if (ability.kind === 'pierce') events.push({type:'pierce',damageMultiplier:p.damageMultiplier,penetration:p.penetration});
    if (ability.kind === 'area') events.push({type:'area',radius:p.radius,damageMultiplier:p.damageMultiplier,slowTicks:p.slowTicks});
    if (ability.kind === 'pull') events.push({type:'pull',radius:p.radius,distance:p.pullDistance,slowTicks:p.slowTicks});
    if (ability.kind === 'heal' || ability.kind === 'support') {
      if (p.healRatio) events.push({type:'heal',amount:Math.round(maxHp*p.healRatio)});
      if (p.shieldRatio) { barrierHp = clamp(barrierHp+Math.round(maxHp*p.shieldRatio),0,Math.round(maxHp*.35)); barrierUntil = Math.max(barrierUntil, activeUntil[slot]); }
    }
    return {ok:true,slot,abilityId:ability.id,tick,events};
  };
  const advanceTicks = count => {
    if (!Number.isInteger(count) || count < 0 || count > 3000) throw new RangeError('Invalid ability tick count');
    tick += count;
    if (barrierHp > 0 && tick >= barrierUntil) barrierHp = 0;
    return snapshot();
  };
  const absorb = rawDamage => {
    const value = Math.max(0,Number(rawDamage)||0);
    const absorbed = Math.min(barrierHp,value);
    barrierHp -= absorbed;
    return {remaining:value-absorbed,absorbed};
  };
  const snapshot = () => ({ version:GUEST_ABILITY_RULES_VERSION, tick,
    ship:snapshotSlot('ship_skill'),armor:snapshotSlot('armor_active'),
    armorTrigger:armorTrait?.trigger||null,barrierHp,modifiers:modifiers() });
  return { activate, advanceTicks, snapshot, modifiers, absorb, get tick(){return tick;} };
}
