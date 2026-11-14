/**
 * Dungeon shared ship-skill adapter V4.1.1 (V4.1.0 compatibility path).
 *
 * The one manual SHIP skill delegates to the exact Campaign/Guest Combat V2
 * runtime. Dungeon legacy armor/pilot/dodge remain authoritative; this adapter
 * only projects their current passive state into the shared tactical HUD.
 */
import { COMBAT_TICK_RATE } from '../combat/GuestAbilityCatalogV2.js';
import { createGuestAbilityRuntimeV2 } from '../combat/GuestAbilityRuntimeV2.js';
import { deriveGuestAbilityActivationGateV2 } from '../combat/GuestAbilityActivationGateV2.js';
import {
  createGuestAbilityActivationFeedbackV2,
  createGuestAbilityRejectedFeedbackV2,
  getGuestAbilityFeedbackProfileV2,
  getGuestAbilitySkillV2,
  getGuestArmorFeedbackProfileV2,
} from '../combat/GuestAbilityFeedbackV2.js';
import { DUNGEON_COMBAT_UX_VERSION_V410 } from './DungeonRoleEngagementV410.js';

export const DUNGEON_SHIP_SKILL_ADAPTER_VERSION_V410 = 'dungeon-ship-skill-adapter-v4.1.1';
export const DUNGEON_SHIP_SKILL_TICK_RATE_V410 = COMBAT_TICK_RATE;

const freeze = value => Object.freeze(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));

const buildPassiveArmorSnapshot = ({
  armorId,
  armorName,
  getPassiveState,
  pulse,
} = {}) => {
  if (!armorId) return null;
  const profile = getGuestArmorFeedbackProfileV2(armorId) || {};
  const state = typeof getPassiveState === 'function' ? (getPassiveState() || {}) : {};
  const passive = String(state.armorPassive || 'none');
  const hp = Math.max(0, finite(state.hp));
  const maxHp = Math.max(1, finite(state.maxHp, 1));
  const shieldMax = Math.max(0, finite(state.passiveShieldMax));
  const shieldHp = clamp(finite(state.passiveShieldHp), 0, shieldMax || 0);
  let progress = 1;
  let badge = '';
  let active = false;
  let exhausted = false;

  if (passive === 'shield' && shieldMax > 0) {
    progress = clamp(shieldHp / shieldMax, 0, 1);
    badge = `${Math.round(progress * 100)}%`;
    active = shieldHp > 0;
    exhausted = shieldHp <= 0;
  } else if (passive === 'regen') {
    active = hp < maxHp && finite(state.hpRegenRate) > 0;
    badge = active ? '+' : '';
  } else if (passive === 'reactive' || passive === 'crystal') {
    active = true;
    badge = pulse?.kind === 'reflect' ? 'PROC' : '';
  } else if (passive === 'void') {
    active = true;
    badge = 'ON';
  } else if (passive === 'none') {
    // Stable plating / light armor still appears as equipped armor, without
    // claiming a passive mechanic that Dungeon does not currently own.
    active = false;
  } else {
    active = true;
  }

  return freeze({
    catalogId: armorId,
    armorId: profile.armorId || armorId,
    label: armorName || profile.name || armorId,
    color: profile.color || '#79b8ff',
    icon: profile.icon || '⬢',
    progress,
    badge,
    active,
    exhausted,
    pulse: pulse?.sequence || 0,
    pulseKey: pulse?.sequence ? `${pulse.kind}:${pulse.sequence}` : '',
    authority: 'legacy-dungeon-passives',
  });
};

export function createDungeonShipSkillAdapterV410({
  aircraftId,
  armorId = null,
  armorName = null,
  getPassiveState = null,
  maxHp = 1000,
  seed = 1,
} = {}) {
  // armorId intentionally remains null in the shared runtime: Dungeon's
  // BattlePassives owns the equipped armor mechanics until the later production
  // migration. The ID is used only for presentation parity.
  const runtime = createGuestAbilityRuntimeV2({
    aircraftId,
    armorId: null,
    maxHp,
    seed,
    mode: 'pve',
    baseArmor: 0,
    baseDamageReduction: 0,
    pilotDodgePermille: 0,
    pilotNovaDamage: 0,
  });
  let feedbackSequence = 0;
  let battlePhase = 'TRANSITION';
  let gameOver = false;
  let passivePulse = null;

  const gate = () => deriveGuestAbilityActivationGateV2({ gameState: battlePhase, gameOver });
  const snapshot = () => {
    const state = runtime.snapshot();
    return freeze({
      ...state,
      version: DUNGEON_SHIP_SKILL_ADAPTER_VERSION_V410,
      combatUxVersion: DUNGEON_COMBAT_UX_VERSION_V410,
      activationGate: gate(),
      presentation: getGuestAbilityFeedbackProfileV2(state.ship?.id),
      passiveArmor: buildPassiveArmorSnapshot({
        armorId,
        armorName,
        getPassiveState,
        pulse: passivePulse,
      }),
      tickRate: DUNGEON_SHIP_SKILL_TICK_RATE_V410,
      passiveAuthority: 'legacy-dungeon-passives',
    });
  };

  const setBattlePhase = ({ phase = 'TRANSITION', ended = false } = {}) => {
    battlePhase = String(phase || 'TRANSITION').trim().toUpperCase() || 'TRANSITION';
    gameOver = ended === true;
    return snapshot();
  };

  const notifyPassiveProc = (kind = 'proc') => {
    passivePulse = freeze({
      kind: String(kind || 'proc'),
      sequence: (passivePulse?.sequence || 0) + 1,
    });
    return snapshot();
  };

  const rejected = (abilityId, reason) => freeze({
    ok: false,
    reason,
    feedback: createGuestAbilityRejectedFeedbackV2({
      abilityId,
      reason,
      tick: runtime.tick,
      sequence: ++feedbackSequence,
    }),
    snapshot: snapshot(),
  });

  const activate = ({ slot = 'ship_skill', hasValidTarget = true } = {}) => {
    const before = runtime.snapshot();
    const activationGate = gate();
    if (!activationGate.canActivate) {
      return rejected(before.ship?.id, activationGate.lockReason || 'UNAVAILABLE');
    }
    const definition = getGuestAbilitySkillV2(before.ship?.id);
    if (before.ship?.kind === 'mark' && hasValidTarget !== true) {
      return rejected(before.ship?.id, 'NO_TARGET');
    }
    const result = runtime.activate(slot);
    if (!result.ok) return rejected(before.ship?.id, result.reason || 'UNAVAILABLE');
    return freeze({
      ok: true,
      result,
      definition,
      feedback: createGuestAbilityActivationFeedbackV2({
        abilityId: result.abilityId,
        tick: result.tick,
        sequence: ++feedbackSequence,
      }),
      snapshot: snapshot(),
    });
  };

  return freeze({
    activate,
    advanceTicks: count => runtime.advanceTicks(count),
    drainEvents: () => runtime.drainEvents(),
    modifiers: () => runtime.modifiers(),
    notifyPassiveProc,
    resolveIncomingHit: hit => runtime.resolveIncomingHit(hit),
    setBattlePhase,
    snapshot,
    get tick() { return runtime.tick; },
    get tickRate() { return DUNGEON_SHIP_SKILL_TICK_RATE_V410; },
    get aircraftId() { return aircraftId; },
  });
}

export function auditDungeonShipSkillAdapterV410() {
  const passiveState = {
    armorPassive: 'shield', passiveShieldHp: 120, passiveShieldMax: 200,
    hp: 800, maxHp: 1000,
  };
  const adapter = createDungeonShipSkillAdapterV410({
    aircraftId: 'ship_raptor',
    armorId: 'armor_shield',
    armorName: 'Energy Shield',
    getPassiveState: () => passiveState,
    maxHp: 1000,
    seed: 410,
  });
  if (adapter.snapshot().activationGate.canActivate) return Object.freeze(['TRANSITION_FAIL_OPEN']);
  const issues = [];
  if (adapter.snapshot().passiveArmor?.badge !== '60%') issues.push('PASSIVE_HUD_MISSING');
  adapter.setBattlePhase({ phase: 'PLAYING' });
  const activated = adapter.activate();
  if (!activated.ok || activated.result?.abilityId !== 'skill_assault_overdrive') {
    issues.push('SHARED_SKILL_NOT_ACTIVATED');
  }
  const modifiers = adapter.modifiers();
  if (!(modifiers.damageMultiplier > 1 && modifiers.fireIntervalMultiplier < 1)) {
    issues.push('SHARED_MODIFIERS_MISSING');
  }
  const cooldown = adapter.activate();
  if (cooldown.ok || cooldown.reason !== 'COOLDOWN') issues.push('COOLDOWN_FAIL_OPEN');
  const defense = createDungeonShipSkillAdapterV410({
    aircraftId: 'ship_tank', maxHp: 1000, seed: 411,
  });
  defense.setBattlePhase({ phase: 'PLAYING' });
  defense.activate();
  const hit = defense.resolveIncomingHit({ damage: 200, source: 'projectile', damageType: 'energy' });
  if (!(hit.absorbed > 0 || hit.remaining < 200)) issues.push('ACTIVE_DEFENSE_MISSING');
  if (adapter.snapshot().passiveAuthority !== 'legacy-dungeon-passives') {
    issues.push('PASSIVE_AUTHORITY_DRIFT');
  }
  const beforePulse = adapter.snapshot().passiveArmor?.pulse || 0;
  const afterPulse = adapter.notifyPassiveProc('shield').passiveArmor?.pulse || 0;
  if (!(afterPulse > beforePulse)) issues.push('PASSIVE_PROC_PULSE_MISSING');
  return Object.freeze(issues);
}
