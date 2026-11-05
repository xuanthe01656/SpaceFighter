/**
 * Deterministic 30 Hz Guest Combat Foundation V2 runtime.
 *
 * No wall clock, Math.random, DOM, React, Babylon, Firebase or persistence.
 * It returns battle-local intent/results only. A future authoritative server
 * ruleset can port the same state machine with an explicit seed and input log.
 */
import {
  ARMOR_TRAITS_V2,
  COMBAT_TICK_RATE,
  GUEST_COMBAT_RULES_VERSION,
  SHIP_ACTIVE_SKILLS_V2,
} from './GuestAbilityCatalogV2.js';
import { resolveIncomingDamageV2 } from './CombatMathV2.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.trunc(finite(value, fallback));

function createXorShift32(seedValue) {
  let state = (integer(seedValue, 1) >>> 0) || 0x9e3779b9;
  return {
    nextUint() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state;
    },
    snapshot() { return state >>> 0; },
  };
}

export function createGuestAbilityRuntimeV2({
  aircraftId,
  armorId = null,
  maxHp = 1000,
  seed = 1,
  mode = 'pve',
  baseArmor = 0,
  baseDamageReduction = 0,
  pilotDodgePermille = 0,
  pilotNovaDamage = 0,
  qaForceNextProjectileEvade = false,
} = {}) {
  const ship = SHIP_ACTIVE_SKILLS_V2[aircraftId];
  if (!ship) throw new Error(`Unknown Guest V2 aircraft ability: ${aircraftId}`);
  const armor = armorId ? ARMOR_TRAITS_V2[armorId] : null;
  if (armorId && !armor) throw new Error(`Unknown Guest V2 armor trait: ${armorId}`);
  // Development-only, one-shot QA override. It is inert unless Light Armor is
  // equipped and never changes the normal evade probability or production path.
  const qaForceProjectileEvadeEnabled = qaForceNextProjectileEvade === true
    && armor?.id === 'armor_auto_evade';
  let qaForceProjectileEvadePending = qaForceProjectileEvadeEnabled;

  const safeMaxHp = Math.max(1, Math.round(finite(maxHp, 1000)));
  const battleMode = mode === 'pvp' || mode === 'pvp_ranked' ? 'pvp' : 'pve';
  const safeBaseArmor = Math.max(0, finite(baseArmor, 0));
  const safeBaseDamageReduction = clamp(finite(baseDamageReduction, 0), 0, 0.9);
  // Ghost pilot's legacy 15% dodge is intentionally normalized in V2 so it
  // cannot stack with Light Armor into an excessive competitive avoidance rate.
  const safePilotDodgePermille = clamp(integer(pilotDodgePermille, 0), 0,
    battleMode === 'pvp' ? 10 : 100);
  const safePilotNovaDamage = Math.max(0, finite(pilotNovaDamage, 0));
  const rng = createXorShift32(seed);

  let tick = 0;
  let shipReadyAt = 0;
  let shipActiveUntil = 0;
  let temporaryBarrierHp = 0;
  let temporaryBarrierUntil = 0;
  let armorBarrierHp = armor?.id === 'armor_recharge_shield'
    ? Math.round(safeMaxHp * armor.params.shieldRatio)
    : 0;
  const armorBarrierMax = armor?.id === 'armor_recharge_shield'
    ? Math.round(safeMaxHp * armor.params.shieldRatio)
    : 0;
  let lastDamagedAt = -1_000_000_000;
  let armorProcReadyAt = 0;
  let armorProcCount = 0;
  let crystalHitCount = 0;
  let nanoHealTotal = 0;
  let nanoHealRemainder = 0;
  let lastArmorProc = null;
  let pilotNovaReadyAt = 0;
  const pendingEvents = [];

  const activeShip = () => tick < shipActiveUntil;
  const totalBarrierHp = () => Math.max(0, temporaryBarrierHp) + Math.max(0, armorBarrierHp);

  function shipModifiers() {
    if (!activeShip()) return {
      damageMultiplier: 1,
      fireIntervalMultiplier: 1,
      incomingMultiplier: 1,
      cloaked: false,
    };
    const p = ship.params;
    return {
      damageMultiplier: finite(p.damageMultiplier, 1),
      fireIntervalMultiplier: finite(p.fireIntervalMultiplier, 1),
      incomingMultiplier: 1 - clamp(finite(p.mitigation, 0), 0, 0.8),
      cloaked: ship.kind === 'cloak',
    };
  }

  function modifiers() {
    return Object.freeze(shipModifiers());
  }

  function snapshotShip() {
    const activeTicks = Math.max(0, shipActiveUntil - tick);
    return Object.freeze({
      id: ship.id,
      name: ship.name,
      kind: ship.kind,
      cooldownTicks: ship.cooldownTicks,
      durationTicks: ship.durationTicks,
      remainingTicks: Math.max(0, shipReadyAt - tick),
      activeTicks,
      active: activeTicks > 0,
      ready: tick >= shipReadyAt,
    });
  }

  function snapshotArmor() {
    if (!armor) return null;
    const remaining = Math.max(0, armorProcReadyAt - tick);
    const chargeMax = armor.id === 'armor_crystal_prism' ? armor.params.hitsPerProc : null;
    const rechargeDelayRemainingTicks = armor.id === 'armor_recharge_shield' && armorBarrierHp < armorBarrierMax
      ? Math.max(0, lastDamagedAt + armor.params.rechargeDelayTicks - tick)
      : 0;
    const nanoRepairCap = armor.id === 'armor_nano_repair'
      ? Math.round(safeMaxHp * armor.params.battleHealCapRatio)
      : 0;
    const nanoDelayRemainingTicks = armor.id === 'armor_nano_repair'
      ? Math.max(0, lastDamagedAt + armor.params.delayTicks - tick)
      : 0;
    return Object.freeze({
      id: armor.id,
      name: armor.name,
      trigger: armor.trigger,
      automatic: true,
      procRemainingTicks: remaining,
      ready: remaining === 0,
      procCount: armorProcCount,
      charge: chargeMax ? crystalHitCount : null,
      chargeMax,
      barrierHp: armor.id === 'armor_recharge_shield' ? Math.round(armorBarrierHp) : null,
      barrierMax: armor.id === 'armor_recharge_shield' ? Math.round(armorBarrierMax) : null,
      rechargeDelayRemainingTicks,
      nanoDelayRemainingTicks,
      nanoHealTotal: armor.id === 'armor_nano_repair' ? Math.round(nanoHealTotal) : null,
      nanoHealCap: armor.id === 'armor_nano_repair' ? nanoRepairCap : null,
      lastProcTick: lastArmorProc?.tick ?? null,
      lastProcType: lastArmorProc?.type ?? null,
    });
  }

  function snapshot() {
    return Object.freeze({
      version: GUEST_COMBAT_RULES_VERSION,
      mode: battleMode,
      tick,
      ship: snapshotShip(),
      armor: snapshotArmor(),
      barrierHp: Math.round(totalBarrierHp()),
      armorBarrierHp: Math.round(armorBarrierHp),
      temporaryBarrierHp: Math.round(temporaryBarrierHp),
      modifiers: modifiers(),
      rngState: rng.snapshot(),
      ...(qaForceProjectileEvadeEnabled ? {
        qa: Object.freeze({
          forceNextProjectileEvadeEnabled: true,
          forceNextProjectileEvadePending: qaForceProjectileEvadePending,
        }),
      } : {}),
    });
  }

  function pushArmorProc(type, extra = {}) {
    armorProcCount += 1;
    lastArmorProc = Object.freeze({ type, tick, ...extra });
    pendingEvents.push(Object.freeze({ type: 'armor_proc', proc: type, tick, ...extra }));
  }

  function addTemporaryBarrier(ratio, untilTick) {
    const amount = Math.round(safeMaxHp * clamp(finite(ratio, 0), 0, 0.3));
    const cap = Math.round(safeMaxHp * 0.30);
    temporaryBarrierHp = clamp(temporaryBarrierHp + amount, 0, cap);
    temporaryBarrierUntil = Math.max(temporaryBarrierUntil, untilTick || tick + 1);
    return amount;
  }

  function activate(slot = 'ship_skill') {
    if (slot !== 'ship_skill') return { ok: false, reason: 'NO_MANUAL_ARMOR' };
    if (tick < shipReadyAt) return {
      ok: false,
      reason: 'COOLDOWN',
      remainingTicks: shipReadyAt - tick,
    };
    shipReadyAt = tick + ship.cooldownTicks;
    shipActiveUntil = tick + ship.durationTicks;
    const p = ship.params;
    const events = [];

    if (ship.kind === 'mark') events.push(Object.freeze({
      type: 'mark',
      range: p.range,
      bonus: p.markedDamageBonus,
      durationTicks: ship.durationTicks,
    }));
    if (ship.kind === 'barrier') addTemporaryBarrier(p.shieldRatio, shipActiveUntil);
    if (ship.kind === 'pierce') events.push(Object.freeze({
      type: 'pierce',
      damageMultiplier: p.damageMultiplier,
      penetration: p.penetration,
    }));
    if (ship.kind === 'burst') events.push(Object.freeze({
      type: 'burst',
      shots: p.shots,
      damageMultiplier: p.shotDamageMultiplier,
      spread: p.spread,
    }));
    if (ship.kind === 'area') events.push(Object.freeze({
      type: 'area',
      radius: p.radius,
      damageMultiplier: p.damageMultiplier,
      slowTicks: p.slowTicks,
    }));
    if (ship.kind === 'pull') events.push(Object.freeze({
      type: 'pull',
      radius: p.radius,
      distance: p.pullDistance,
      slowTicks: p.slowTicks,
    }));
    if (ship.kind === 'heal' || ship.kind === 'support') {
      if (p.healRatio) events.push(Object.freeze({
        type: 'heal', amount: Math.round(safeMaxHp * p.healRatio),
      }));
      if (p.shieldRatio) addTemporaryBarrier(p.shieldRatio, Math.max(shipActiveUntil, tick + 1));
    }

    return Object.freeze({
      ok: true,
      slot: 'ship_skill',
      abilityId: ship.id,
      tick,
      events: Object.freeze(events),
    });
  }

  function consumeBarrier(damage) {
    let remaining = Math.max(0, finite(damage, 0));
    let absorbed = 0;
    if (remaining > 0 && temporaryBarrierHp > 0) {
      const take = Math.min(temporaryBarrierHp, remaining);
      temporaryBarrierHp -= take;
      remaining -= take;
      absorbed += take;
    }
    if (remaining > 0 && armorBarrierHp > 0) {
      const take = Math.min(armorBarrierHp, remaining);
      armorBarrierHp -= take;
      remaining -= take;
      absorbed += take;
    }
    return { remaining, absorbed };
  }

  function chancePermille(value) {
    const threshold = clamp(integer(value, 0), 0, 1000);
    return (rng.nextUint() % 1000) < threshold;
  }

  /**
   * Resolves the complete V2 defensive order for Guest: automatic evasion,
   * base armor/pilot reduction, ship/armor modifiers, then barriers. The scene
   * must not send `remaining` through the legacy hit resolver a second time.
   */
  function resolveIncomingHit({
    damage,
    source = 'contact',
    damageType = 'kinetic',
    unavoidable = false,
  } = {}) {
    const raw = Math.max(0, finite(damage, 0));
    if (raw <= 0) return Object.freeze({
      dodged: false, remaining: 0, absorbed: 0, reflected: 0, events: Object.freeze([]),
    });

    const events = [];
    if (armor?.id === 'armor_auto_evade'
      && !unavoidable
      && tick >= armorProcReadyAt
      && armor.params.eligibleSources.includes(source)) {
      const chance = battleMode === 'pvp'
        ? armor.params.chancePermillePvp
        : armor.params.chancePermillePve;
      const forcedQa = qaForceProjectileEvadePending;
      if (forcedQa || chancePermille(chance)) {
        if (forcedQa) qaForceProjectileEvadePending = false;
        armorProcReadyAt = tick + armor.params.internalCooldownTicks;
        pushArmorProc('evade', { source, forcedQa });
        events.push(Object.freeze({ type: 'evade', source, forcedQa }));
        return Object.freeze({
          dodged: true,
          dodgeSource: 'armor',
          forcedQa,
          remaining: 0,
          absorbed: 0,
          reflected: 0,
          events: Object.freeze(events),
        });
      }
    }

    if (!unavoidable && source === 'projectile' && safePilotDodgePermille > 0
      && chancePermille(safePilotDodgePermille)) {
      events.push(Object.freeze({ type: 'pilot_evade', source }));
      return Object.freeze({
        dodged: true,
        dodgeSource: 'pilot',
        remaining: 0,
        absorbed: 0,
        reflected: 0,
        novaDamage: 0,
        events: Object.freeze(events),
      });
    }

    const incomingMultipliers = [shipModifiers().incomingMultiplier];
    if (armor?.id === 'armor_stable_plating')
      incomingMultipliers.push(armor.params.incomingMultiplier);
    if (armor?.id === 'armor_void_damping') {
      incomingMultipliers.push(armor.params.resistedDamageTypes.includes(damageType)
        ? armor.params.typedIncomingMultiplier
        : armor.params.genericIncomingMultiplier);
    }

    let crystalProc = false;
    if (armor?.id === 'armor_crystal_prism' && source === 'projectile') {
      crystalHitCount += 1;
      if (crystalHitCount >= armor.params.hitsPerProc) {
        crystalHitCount = 0;
        crystalProc = true;
        incomingMultipliers.push(armor.params.procIncomingMultiplier);
        pushArmorProc('crystal_prism', { source });
        events.push(Object.freeze({ type: 'crystal_prism', source }));
      }
    }

    const defense = resolveIncomingDamageV2({
      rawDamage: raw,
      armor: safeBaseArmor,
      damageReduction: safeBaseDamageReduction,
      incomingMultipliers,
      mode: battleMode,
    });
    const mitigated = defense.damage;
    const barrier = consumeBarrier(mitigated);
    let reflected = 0;
    if (armor?.id === 'armor_reactive_plating'
      && source === 'projectile'
      && tick >= armorProcReadyAt) {
      reflected = Math.round(mitigated * armor.params.reflectRatio);
      armorProcReadyAt = tick + armor.params.internalCooldownTicks;
      pushArmorProc('reactive_reflect', { reflected });
      events.push(Object.freeze({ type: 'reflect', amount: reflected }));
    } else if (crystalProc) {
      reflected = Math.round(mitigated * armor.params.reflectRatio);
      events.push(Object.freeze({ type: 'reflect', amount: reflected }));
    }

    let novaDamage = 0;
    if (safePilotNovaDamage > 0 && tick >= pilotNovaReadyAt) {
      novaDamage = Math.round(safePilotNovaDamage);
      pilotNovaReadyAt = tick + 15 * COMBAT_TICK_RATE;
      events.push(Object.freeze({ type: 'pilot_nova', amount: novaDamage }));
    }

    if (barrier.absorbed > 0 || barrier.remaining > 0) lastDamagedAt = tick;
    return Object.freeze({
      dodged: false,
      remaining: barrier.remaining,
      absorbed: barrier.absorbed,
      reflected,
      novaDamage,
      defense,
      events: Object.freeze(events),
    });
  }

  function advanceTicks(count) {
    const steps = integer(count, -1);
    if (steps < 0 || steps > 3000) throw new RangeError('Invalid Guest V2 tick count');
    for (let i = 0; i < steps; i += 1) {
      tick += 1;
      if (temporaryBarrierHp > 0 && tick >= temporaryBarrierUntil) temporaryBarrierHp = 0;

      if (armor?.id === 'armor_recharge_shield'
        && armorBarrierHp < armorBarrierMax
        && tick - lastDamagedAt >= armor.params.rechargeDelayTicks) {
        armorBarrierHp = Math.min(
          armorBarrierMax,
          armorBarrierHp + safeMaxHp * armor.params.rechargeRatioPerSecond / COMBAT_TICK_RATE,
        );
      }

      if (armor?.id === 'armor_nano_repair'
        && tick - lastDamagedAt >= armor.params.delayTicks
        && nanoHealTotal < safeMaxHp * armor.params.battleHealCapRatio) {
        nanoHealRemainder += safeMaxHp * armor.params.healRatioPerSecond / COMBAT_TICK_RATE;
        const amount = Math.min(
          Math.floor(nanoHealRemainder),
          Math.max(0, Math.floor(safeMaxHp * armor.params.battleHealCapRatio - nanoHealTotal)),
        );
        if (amount > 0) {
          nanoHealRemainder -= amount;
          nanoHealTotal += amount;
          pendingEvents.push(Object.freeze({ type: 'heal', source: 'armor_nano', amount, tick }));
        }
      }
    }
    return snapshot();
  }

  function drainEvents() {
    if (!pendingEvents.length) return Object.freeze([]);
    const result = Object.freeze(pendingEvents.splice(0, pendingEvents.length));
    return result;
  }

  return Object.freeze({
    activate,
    advanceTicks,
    drainEvents,
    modifiers,
    resolveIncomingHit,
    snapshot,
    get tick() { return tick; },
  });
}
