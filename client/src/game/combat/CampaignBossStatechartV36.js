import { createActor, createMachine } from 'xstate';
import { bossPhaseForHp } from './EnemyCombatCatalogV2.js';
import { resolveCampaignCombatSafeBandV29 } from './CampaignCombatChoreographyV29.js';
import { resolveCampaignBossProfileV33 } from './CampaignBossArsenalV33.js';
import {
  createCampaignBossAttackPlanV29,
  createCampaignBossCombatStateV29,
  resolveCampaignBossAnchorV29,
  resolveCampaignBossPhaseCombatV31,
  selectCampaignBossPatternForStateV33,
  stepCampaignBossHoldV29,
  stepCampaignBossSteeringV29,
  stopCampaignBossMotionV29,
} from './CampaignBossCombatV29.js';

/**
 * XState V5 orchestration pilot for final Campaign bosses.
 *
 * Contract:
 * - XState owns only lifecycle/phase transitions;
 * - deterministic runtime ticks decide when events are sent;
 * - existing movement math, attack plans, projectile/damage and rendering stay
 *   outside the actor;
 * - Alpha Mech Sentinel is the first authoritative pilot; all other profiles
 *   remain legacy-authoritative until the same parity gate is approved.
 */
export const CAMPAIGN_BOSS_XSTATE_VERSION = 'campaign-boss-xstate-v3.6.0';
export const CAMPAIGN_BOSS_XSTATE_PACKAGE_VERSION = '5.33.4';
export const CAMPAIGN_BOSS_XSTATE_ALPHA_PILOT_PROFILE = 'alpha_mech_sentinel';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const hypot = (x, z) => Math.hypot(x, z);

const resetTransition = Object.freeze({ target: 'reposition', reenter: true });
const commonInterrupts = Object.freeze({
  ENTER_FRENZY: 'enrage',
  SUSPEND: 'suspended',
  RESET: resetTransition,
});

export const CAMPAIGN_FINAL_BOSS_MACHINE_V36 = createMachine({
  id: 'campaign-final-boss-v36',
  initial: 'reposition',
  states: {
    reposition: {
      on: {
        ...commonInterrupts,
        ANCHOR_REACHED: 'aim',
      },
    },
    aim: {
      on: {
        ...commonInterrupts,
        ATTACK_PLAN_CREATED: 'telegraph',
      },
    },
    telegraph: {
      on: {
        ...commonInterrupts,
        TELEGRAPH_COMPLETE: 'recover',
      },
    },
    recover: {
      on: {
        ...commonInterrupts,
        RECOVERY_COMPLETE: 'reposition',
      },
    },
    enrage: {
      on: {
        SUSPEND: 'suspended',
        RESET: resetTransition,
        ENRAGE_COMPLETE: 'reposition',
      },
    },
    suspended: {
      on: {
        RESET: resetTransition,
        RESUME: 'reposition',
        ENTER_FRENZY: 'enrage',
      },
    },
  },
});

const snapshotPhase = controller => String(controller?.actor?.getSnapshot?.().value || 'reposition');

const sendTransition = (controller, eventType, nowMs) => {
  const before = snapshotPhase(controller);
  controller.actor.send({ type: eventType });
  const after = snapshotPhase(controller);
  if (after !== before || eventType === 'RESET') controller.runtime.phaseStartedAt = nowMs;
  controller.runtime.phase = after;
  return after;
};

export function isCampaignBossXStatePilotV36({
  planetId = 1,
  bossType = 'mech',
  profileId = null,
} = {}) {
  const profile = resolveCampaignBossProfileV33({ planetId, bossType, profileId });
  return profile.id === CAMPAIGN_BOSS_XSTATE_ALPHA_PILOT_PROFILE;
}

export function createCampaignBossStatechartControllerV36({
  seed = 1,
  nowMs = 0,
  planetId = 1,
  bossType = 'mech',
  profileId = null,
  mode = null,
} = {}) {
  const runtime = createCampaignBossCombatStateV29({
    seed, nowMs, planetId, bossType, profileId,
  });
  const resolvedMode = mode || (isCampaignBossXStatePilotV36(runtime) ? 'pilot' : 'shadow');
  const actor = createActor(CAMPAIGN_FINAL_BOSS_MACHINE_V36, {
    id: `campaign-boss-${runtime.profileId}-${runtime.seed}`,
  });
  actor.start();
  runtime.phase = snapshotPhase({ actor });
  return {
    version: CAMPAIGN_BOSS_XSTATE_VERSION,
    packageVersion: CAMPAIGN_BOSS_XSTATE_PACKAGE_VERSION,
    mode: resolvedMode,
    actor,
    runtime,
    parityChecks: 0,
    parityMismatches: 0,
    lastParity: null,
    pilotBlocked: false,
    pilotBlockedReason: null,
  };
}

export function stopCampaignBossStatechartControllerV36(controller) {
  controller?.actor?.stop?.();
}

export function resetCampaignBossStatechartControllerV36(controller, { nowMs = 0 } = {}) {
  if (!controller) return null;
  const runtime = controller.runtime;
  runtime.attackPlan = null;
  runtime.targetX = null;
  runtime.targetZ = null;
  runtime.velocityX = 0;
  runtime.velocityZ = 0;
  runtime.enrageUntilMs = 0;
  sendTransition(controller, 'RESET', Math.max(0, finite(nowMs, 0)));
  return controller;
}

export function getCampaignBossStatechartSnapshotV36(controller) {
  if (!controller) return null;
  return Object.freeze({
    version: controller.version,
    packageVersion: controller.packageVersion,
    mode: controller.mode,
    phase: snapshotPhase(controller),
    profileId: controller.runtime.profileId,
    currentPhaseId: controller.runtime.currentPhaseId,
    cycle: controller.runtime.cycle,
    attackPlan: controller.runtime.attackPlan,
    targetX: controller.runtime.targetX,
    targetZ: controller.runtime.targetZ,
    parityChecks: controller.parityChecks,
    parityMismatches: controller.parityMismatches,
    pilotBlocked: Boolean(controller.pilotBlocked),
    pilotBlockedReason: controller.pilotBlockedReason || null,
    actorStatus: controller.actor.getSnapshot().status,
  });
}

export function stepCampaignBossStatechartV36(controller, input = {}) {
  if (!controller) {
    return Object.freeze({ controller: null, state: null, events: Object.freeze([]), deltaX: 0, deltaZ: 0 });
  }
  const state = controller.runtime;
  const nowMs = Math.max(0, finite(input.nowMs, 0));
  const hpRatio = clamp(finite(input.hpRatio, 1), 0, 1);
  const events = [];
  const hpPhase = bossPhaseForHp(hpRatio);
  const profile = resolveCampaignBossProfileV33({
    planetId: state.planetId,
    bossType: state.bossType,
    profileId: state.profileId,
  });

  if (input.suspended) {
    if (state.attackPlan) events.push(Object.freeze({ type: 'telegraph_cancelled', planId: state.attackPlan.id }));
    state.attackPlan = null;
    state.targetX = null;
    state.targetZ = null;
    if (snapshotPhase(controller) !== 'suspended') sendTransition(controller, 'SUSPEND', nowMs);
    const motion = stepCampaignBossHoldV29(state, input);
    return Object.freeze({
      controller, state, events: Object.freeze(events), phase: snapshotPhase(controller),
      holdOrientation: true, visualState: 'enrage', ...motion,
    });
  }
  if (snapshotPhase(controller) === 'suspended') sendTransition(controller, 'RESUME', nowMs);

  if (hpPhase.id !== state.currentPhaseId) {
    const previousPhaseId = state.currentPhaseId;
    state.currentPhaseId = hpPhase.id;
    events.push(Object.freeze({ type: 'phase_changed', previousPhaseId, phaseId: hpPhase.id }));
    if (hpPhase.id === 'phase_3') {
      if (state.attackPlan) events.push(Object.freeze({ type: 'telegraph_cancelled', planId: state.attackPlan.id }));
      state.attackPlan = null;
      state.targetX = null;
      state.targetZ = null;
      state.enrageUntilMs = nowMs + resolveCampaignBossPhaseCombatV31(hpPhase.id).enrageHoldMs;
      sendTransition(controller, 'ENTER_FRENZY', nowMs);
      const motion = stopCampaignBossMotionV29(state);
      events.push(Object.freeze({
        type: 'enrage_started',
        phaseId: hpPhase.id,
        frenzyLevel: resolveCampaignBossPhaseCombatV31(hpPhase.id).frenzyLevel,
        holdMs: resolveCampaignBossPhaseCombatV31(hpPhase.id).enrageHoldMs,
      }));
      return Object.freeze({
        controller, state, events: Object.freeze(events), phase: snapshotPhase(controller),
        holdOrientation: true, visualState: 'enrage', frenzyLevel: 2, ...motion,
      });
    }
  }

  if (snapshotPhase(controller) === 'enrage') {
    const motion = stopCampaignBossMotionV29(state);
    if (nowMs >= state.enrageUntilMs) {
      sendTransition(controller, 'ENRAGE_COMPLETE', nowMs);
      state.targetX = null;
      state.targetZ = null;
      events.push(Object.freeze({ type: 'enrage_finished', phaseId: state.currentPhaseId }));
    }
    return Object.freeze({
      controller, state, events: Object.freeze(events), phase: snapshotPhase(controller),
      holdOrientation: true,
      visualState: nowMs < state.enrageUntilMs ? 'enrage' : 'move',
      frenzyLevel: resolveCampaignBossPhaseCombatV31(state.currentPhaseId).frenzyLevel,
      ...motion,
    });
  }

  const band = resolveCampaignCombatSafeBandV29({
    worldHalfHeight: input.worldHalfHeight,
    viewportHeight: input.viewportHeight,
    hudOcclusionLineZ: input.hudOcclusionLineZ,
    entityScale: input.entityScale ?? 1.7,
    hpBarOffsetPx: 0,
    hpBarHeightPx: 0,
    extraMarginPx: 22,
    playerZ: input.playerZ,
  });
  const phase = snapshotPhase(controller);

  if (phase === 'reposition') {
    if (state.targetX == null || state.targetZ == null) {
      const target = resolveCampaignBossAnchorV29(state, input, band);
      state.targetX = target.x;
      state.targetZ = target.z;
      state.phaseStartedAt = nowMs;
    }
    const distance = hypot(state.targetX - finite(input.enemyX, 0), state.targetZ - finite(input.enemyZ, 0));
    if (distance <= .42) {
      stopCampaignBossMotionV29(state);
      sendTransition(controller, 'ANCHOR_REACHED', nowMs);
      return Object.freeze({
        controller, state, events: Object.freeze(events), phase: snapshotPhase(controller),
        holdOrientation: false, facePlayer: true, visualState: 'idle',
        deltaX: 0, deltaZ: 0, velocityX: 0, velocityZ: 0,
      });
    }
    const phaseCombat = resolveCampaignBossPhaseCombatV31(hpPhase.id);
    const motion = stepCampaignBossSteeringV29(
      state,
      input,
      { x: state.targetX, z: state.targetZ },
      phaseCombat.movementMultiplier * profile.movementMultiplier,
    );
    return Object.freeze({
      controller, state, events: Object.freeze(events), phase,
      holdOrientation: false, visualState: 'move', ...motion,
    });
  }

  if (phase === 'aim') {
    const motion = stopCampaignBossMotionV29(state);
    if (nowMs - state.phaseStartedAt >= 320) {
      const pattern = selectCampaignBossPatternForStateV33(state, hpPhase, profile);
      state.attackPlan = createCampaignBossAttackPlanV29({
        pattern,
        origin: input.origin,
        playerX: input.playerX,
        playerZ: input.playerZ,
        playerVelocityX: input.playerVelocityX,
        playerVelocityZ: input.playerVelocityZ,
        arenaHalfWidth: input.arenaHalfWidth,
        worldHalfHeight: input.worldHalfHeight,
        createdAtMs: nowMs,
        cycle: state.cycle,
        phaseId: hpPhase.id,
        planetId: profile.planetId,
        bossType: profile.bossType,
        profileId: profile.id,
      });
      sendTransition(controller, 'ATTACK_PLAN_CREATED', nowMs);
      events.push(Object.freeze({ type: 'telegraph_started', plan: state.attackPlan }));
    }
    return Object.freeze({
      controller, state, events: Object.freeze(events), phase: snapshotPhase(controller),
      holdOrientation: snapshotPhase(controller) === 'telegraph',
      facePlayer: snapshotPhase(controller) === 'aim',
      visualState: snapshotPhase(controller) === 'telegraph' ? 'attack' : 'idle',
      ...motion,
    });
  }

  if (phase === 'telegraph') {
    const motion = stepCampaignBossHoldV29(state, input);
    if (state.attackPlan && nowMs >= state.attackPlan.telegraphEndsAtMs) {
      const plan = state.attackPlan;
      events.push(Object.freeze({ type: 'fire_pattern', plan }));
      events.push(Object.freeze({ type: 'telegraph_ended', planId: plan.id }));
      sendTransition(controller, 'TELEGRAPH_COMPLETE', nowMs);
    }
    return Object.freeze({
      controller, state, events: Object.freeze(events), phase: snapshotPhase(controller),
      holdOrientation: true, visualState: 'attack', ...motion,
    });
  }

  const motion = stepCampaignBossHoldV29(state, input);
  const recoveryMs = Math.max(360, finite(state.attackPlan?.recoveryMs, 1000));
  if (nowMs - state.phaseStartedAt >= recoveryMs) {
    state.cycle += 1;
    state.targetX = null;
    state.targetZ = null;
    state.attackPlan = null;
    sendTransition(controller, 'RECOVERY_COMPLETE', nowMs);
  }
  return Object.freeze({
    controller, state, events: Object.freeze(events), phase: snapshotPhase(controller),
    holdOrientation: true,
    visualState: snapshotPhase(controller) === 'recover' ? 'idle' : 'move',
    ...motion,
  });
}

const eventSignature = events => (events || []).map(event => {
  const plan = event.plan;
  return [event.type, event.planId || plan?.id || '', plan?.pattern || '', event.phaseId || ''].join(':');
});

export function applyCampaignBossParityGateV36(controller, parity) {
  if (!controller) return false;
  if (controller.mode !== 'pilot') return false;
  if (!parity?.ok) {
    controller.mode = 'shadow_failed';
    controller.pilotBlocked = true;
    controller.pilotBlockedReason = Object.freeze([...(parity?.issues || ['UNKNOWN_PARITY_FAILURE'])]);
    return false;
  }
  return !controller.pilotBlocked;
}

export function compareCampaignBossParityV36({ legacyStep, xstateStep, tolerance = 1e-9 } = {}) {
  const issues = [];
  if (!legacyStep || !xstateStep) issues.push('MISSING_STEP');
  else {
    if (legacyStep.phase !== xstateStep.phase) issues.push(`PHASE:${legacyStep.phase}:${xstateStep.phase}`);
    const legacyEvents = eventSignature(legacyStep.events);
    const xstateEvents = eventSignature(xstateStep.events);
    if (legacyEvents.join('|') !== xstateEvents.join('|')) {
      issues.push(`EVENTS:${legacyEvents.join(',')}:${xstateEvents.join(',')}`);
    }
    for (const key of ['deltaX', 'deltaZ', 'velocityX', 'velocityZ']) {
      if (Math.abs(finite(legacyStep[key], 0) - finite(xstateStep[key], 0)) > tolerance) {
        issues.push(`MOTION:${key}`);
      }
    }
    const legacyPlan = legacyStep.state?.attackPlan;
    const xstatePlan = xstateStep.state?.attackPlan;
    if ((legacyPlan?.id || null) !== (xstatePlan?.id || null)) issues.push('ATTACK_PLAN_ID');
    if ((legacyPlan?.pattern || null) !== (xstatePlan?.pattern || null)) issues.push('ATTACK_PATTERN');
    if ((legacyStep.state?.cycle ?? null) !== (xstateStep.state?.cycle ?? null)) issues.push('CYCLE');
    if ((legacyStep.state?.currentPhaseId || null) !== (xstateStep.state?.currentPhaseId || null)) {
      issues.push('HP_PHASE');
    }
  }
  const result = Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    legacyPhase: legacyStep?.phase || null,
    xstatePhase: xstateStep?.phase || null,
  });
  const controller = xstateStep?.controller;
  if (controller) {
    controller.parityChecks += 1;
    if (!result.ok) controller.parityMismatches += 1;
    controller.lastParity = result;
  }
  return result;
}

export function auditCampaignBossStatechartV36() {
  const issues = [];
  const controller = createCampaignBossStatechartControllerV36({
    seed: 17, nowMs: 0, planetId: 1, bossType: 'mech', mode: 'shadow',
  });
  const snapshot = controller.actor.getSnapshot();
  if (snapshot.value !== 'reposition') issues.push('INITIAL_STATE');
  if (controller.packageVersion !== CAMPAIGN_BOSS_XSTATE_PACKAGE_VERSION) issues.push('PACKAGE_VERSION');
  if (!isCampaignBossXStatePilotV36({ planetId: 1, bossType: 'mech' })) issues.push('ALPHA_PILOT');
  if (isCampaignBossXStatePilotV36({ planetId: 1, bossType: 'alien' })) issues.push('ALIEN_NOT_PILOT');
  stopCampaignBossStatechartControllerV36(controller);
  return Object.freeze(issues);
}
