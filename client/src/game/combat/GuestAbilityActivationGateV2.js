/**
 * Presentation-safe activation policy for the DEV Guest Combat V2 HUD.
 *
 * The Babylon scene remains authoritative for battle phase. React receives a
 * derived immutable gate so the compact skill icon never appears tappable while
 * the scene would reject activation (wave transition, clear, or game over).
 */
export const GUEST_ABILITY_ACTIVATION_GATE_VERSION = 'guest-ability-activation-gate-v2.0.0';

export const GUEST_ABILITY_ACTIVE_PHASES_V2 = Object.freeze([
  'PLAYING',
  'BOSS_FIGHT',
]);

const ACTIVE_PHASE_SET = new Set(GUEST_ABILITY_ACTIVE_PHASES_V2);

export function deriveGuestAbilityActivationGateV2({ gameState = 'TRANSITION', gameOver = false } = {}) {
  const normalized = String(gameState || 'TRANSITION').trim().toUpperCase() || 'TRANSITION';
  const battlePhase = gameOver ? 'GAMEOVER' : normalized;
  const canActivate = !gameOver && ACTIVE_PHASE_SET.has(battlePhase);

  let lockReason = null;
  if (!canActivate) {
    if (battlePhase === 'TRANSITION') lockReason = 'TRANSITION';
    else if (battlePhase === 'BOSS_INTRO') lockReason = 'BOSS_INTRO';
    else if (battlePhase === 'CLEAR') lockReason = 'CLEAR';
    else if (battlePhase === 'GAMEOVER') lockReason = 'GAMEOVER';
    else lockReason = 'UNAVAILABLE';
  }

  return Object.freeze({
    version: GUEST_ABILITY_ACTIVATION_GATE_VERSION,
    battlePhase,
    canActivate,
    lockReason,
  });
}
