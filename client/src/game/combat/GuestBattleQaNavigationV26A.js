import { PLANET_CONFIG, STAGE_CONFIG } from '../catalog/worlds.js';

export const GUEST_BATTLE_QA_NAV_VERSION = 'guest-battle-qa-v2.6a';
export const GUEST_BATTLE_QA_PLANET_IDS = Object.freeze(
  Object.keys(PLANET_CONFIG).map(Number).filter(Number.isFinite).sort((a, b) => a - b),
);
export const GUEST_BATTLE_QA_STAGE_IDS = Object.freeze(
  Object.keys(STAGE_CONFIG).map(Number).filter(Number.isFinite).sort((a, b) => a - b),
);
export const GUEST_BATTLE_QA_BOSS_STAGE_IDS = Object.freeze(
  GUEST_BATTLE_QA_STAGE_IDS.filter(stageId => Boolean(STAGE_CONFIG[stageId]?.hasBoss)),
);

const parseSearch = search => new URLSearchParams(String(search || '').replace(/^\?/, ''));
const toKnownId = (value, allowed, fallback) => {
  const numeric = Number(value);
  if (allowed.includes(numeric)) return numeric;
  const fallbackNumeric = Number(fallback);
  return allowed.includes(fallbackNumeric) ? fallbackNumeric : allowed[0];
};
const nextIn = (value, allowed) => {
  const index = Math.max(0, allowed.indexOf(value));
  return allowed[(index + 1) % allowed.length];
};
const writeSelection = (params, planetId, stageId) => {
  params.set('sfQaPlanet', String(planetId));
  params.set('sfQaStage', String(stageId));
  return `?${params.toString()}`;
};

export function resolveGuestBattleQaSelectionV26A(search = '', {
  fallbackPlanetId = GUEST_BATTLE_QA_PLANET_IDS[0],
  fallbackStageId = GUEST_BATTLE_QA_STAGE_IDS[0],
} = {}) {
  const params = parseSearch(search);
  const planetId = toKnownId(params.get('sfQaPlanet'), GUEST_BATTLE_QA_PLANET_IDS, fallbackPlanetId);
  const stageId = toKnownId(params.get('sfQaStage'), GUEST_BATTLE_QA_STAGE_IDS, fallbackStageId);
  return Object.freeze({
    version: GUEST_BATTLE_QA_NAV_VERSION,
    planetId,
    stageId,
    planetIndex: GUEST_BATTLE_QA_PLANET_IDS.indexOf(planetId) + 1,
    planetTotal: GUEST_BATTLE_QA_PLANET_IDS.length,
    stageIndex: GUEST_BATTLE_QA_STAGE_IDS.indexOf(stageId) + 1,
    stageTotal: GUEST_BATTLE_QA_STAGE_IDS.length,
    isBoss: Boolean(STAGE_CONFIG[stageId]?.hasBoss),
  });
}

export function cycleGuestBattleQaSelectionV26A(search = '', action = 'stage', fallback = {}) {
  const params = parseSearch(search);
  const current = resolveGuestBattleQaSelectionV26A(search, fallback);
  let planetId = current.planetId;
  let stageId = current.stageId;

  if (action === 'planet') {
    planetId = nextIn(planetId, GUEST_BATTLE_QA_PLANET_IDS);
  } else if (action === 'stage') {
    stageId = nextIn(stageId, GUEST_BATTLE_QA_STAGE_IDS);
  } else if (action === 'boss') {
    const laterBoss = GUEST_BATTLE_QA_BOSS_STAGE_IDS.find(id => id > stageId);
    stageId = laterBoss ?? GUEST_BATTLE_QA_BOSS_STAGE_IDS[0] ?? stageId;
  } else if (action === 'next') {
    const stageIndex = GUEST_BATTLE_QA_STAGE_IDS.indexOf(stageId);
    if (stageIndex >= 0 && stageIndex < GUEST_BATTLE_QA_STAGE_IDS.length - 1) {
      stageId = GUEST_BATTLE_QA_STAGE_IDS[stageIndex + 1];
    } else {
      planetId = nextIn(planetId, GUEST_BATTLE_QA_PLANET_IDS);
      stageId = GUEST_BATTLE_QA_STAGE_IDS[0];
    }
  } else if (action !== 'replay') {
    throw new Error(`Unsupported Guest Battle QA action: ${action}`);
  }

  const nextSearch = writeSelection(params, planetId, stageId);
  return Object.freeze({
    action,
    search: nextSearch,
    selection: resolveGuestBattleQaSelectionV26A(nextSearch, fallback),
  });
}

export function createGuestBattleQaResultV26A({
  outcome = 'victory',
  planetId,
  stageId,
  isBoss = false,
  kills = 0,
  score = 0,
  hp = 0,
  maxHp = 1,
  durationMs = 0,
} = {}) {
  const normalizedOutcome = outcome === 'defeat' ? 'defeat' : 'victory';
  return Object.freeze({
    version: GUEST_BATTLE_QA_NAV_VERSION,
    outcome: normalizedOutcome,
    planetId: toKnownId(planetId, GUEST_BATTLE_QA_PLANET_IDS, GUEST_BATTLE_QA_PLANET_IDS[0]),
    stageId: toKnownId(stageId, GUEST_BATTLE_QA_STAGE_IDS, GUEST_BATTLE_QA_STAGE_IDS[0]),
    isBoss: Boolean(isBoss),
    kills: Math.max(0, Math.trunc(Number(kills) || 0)),
    score: Math.max(0, Math.trunc(Number(score) || 0)),
    hp: Math.max(0, Math.round(Number(hp) || 0)),
    maxHp: Math.max(1, Math.round(Number(maxHp) || 1)),
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    rewardsWritten: false,
    profileWritten: false,
    trustedOutcome: false,
  });
}

export function resolveGuestBattleQaResultActionV26A(search = '', result, action) {
  if (!result || result.version !== GUEST_BATTLE_QA_NAV_VERSION) {
    throw new Error('Guest Battle QA result is missing or incompatible.');
  }
  if (action === 'exit') return Object.freeze({ action, exit: true, search: String(search || '') });
  if (action === 'next' && result.outcome !== 'victory') {
    return cycleGuestBattleQaSelectionV26A(search, 'replay', {
      fallbackPlanetId: result.planetId,
      fallbackStageId: result.stageId,
    });
  }
  return cycleGuestBattleQaSelectionV26A(search, action, {
    fallbackPlanetId: result.planetId,
    fallbackStageId: result.stageId,
  });
}
