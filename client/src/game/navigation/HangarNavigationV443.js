/**
 * Space Fighter V4.4.3 Portal/Hangar navigation contract.
 * Presentation/navigation only. It does not own battle, reward, energy,
 * progression settlement, inventory mutation, or server authority.
 */

export const PORTAL_HANGAR_VERSION_V443 = 'portal-hangar-v4.4.3';
export const HQ_MODE_MANAGE_V443 = 'manage';
export const HQ_MODE_PREBATTLE_V443 = 'prebattle';

const SAFE_RETURN_SCREENS_V443 = new Set([
  'campaign_portal',
  'stage_select',
  'dungeon_select',
  'galaxy_map',
]);

const safeScreen = (value, fallback) => (
  SAFE_RETURN_SCREENS_V443.has(String(value || '')) ? String(value) : fallback
);

export function createManagementHqContextV443({
  source = 'campaign_portal',
  returnScreen = 'campaign_portal',
} = {}) {
  return Object.freeze({
    version: PORTAL_HANGAR_VERSION_V443,
    mode: HQ_MODE_MANAGE_V443,
    source: String(source || 'campaign_portal'),
    returnScreen: safeScreen(returnScreen, 'campaign_portal'),
    battleMode: null,
  });
}

export function createPrebattleHqContextV443({
  source,
  returnScreen,
  battleMode = 'campaign',
} = {}) {
  const normalizedBattleMode = battleMode === 'dungeon' ? 'dungeon' : 'campaign';
  return Object.freeze({
    version: PORTAL_HANGAR_VERSION_V443,
    mode: HQ_MODE_PREBATTLE_V443,
    source: String(source || (normalizedBattleMode === 'dungeon' ? 'dungeon_select' : 'stage_select')),
    returnScreen: safeScreen(
      returnScreen,
      normalizedBattleMode === 'dungeon' ? 'dungeon_select' : 'stage_select',
    ),
    battleMode: normalizedBattleMode,
  });
}

export function normalizeCampaignProgressV443(progress) {
  const target = progress && typeof progress === 'object' ? progress : {};
  const currentPlanet = Math.max(1, Math.trunc(Number(target.currentPlanet) || 1));
  const selectedStage = Math.max(
    1,
    Math.trunc(Number(target.selectedStage) || Number(target.currentStage) || 1),
  );
  if (target.currentPlanet !== currentPlanet) target.currentPlanet = currentPlanet;
  if (target.selectedStage !== selectedStage) target.selectedStage = selectedStage;
  if (!Number.isFinite(Number(target.currentStage))) target.currentStage = selectedStage;
  if (!Number.isFinite(Number(target.highestStage))) target.highestStage = selectedStage;
  return target;
}

export function resolveHqContextV443({ gsRef, gameMode } = {}) {
  const root = gsRef?.current && typeof gsRef.current === 'object' ? gsRef.current : {};
  const explicit = root.hqContext;
  if (explicit?.version === PORTAL_HANGAR_VERSION_V443) {
    return explicit.mode === HQ_MODE_PREBATTLE_V443
      ? createPrebattleHqContextV443(explicit)
      : createManagementHqContextV443(explicit);
  }

  if (root.hqReturnScreen === 'campaign_portal') {
    return createManagementHqContextV443();
  }

  const mode = gameMode === 'dungeon' ? 'dungeon' : 'campaign';
  if (mode === 'dungeon' && root.selectedDungeonId) {
    return createPrebattleHqContextV443({
      source: 'dungeon_select',
      returnScreen: 'dungeon_select',
      battleMode: 'dungeon',
    });
  }

  const progress = root.campaignData?.progress;
  if (progress && (progress.currentPlanet || progress.selectedStage)) {
    normalizeCampaignProgressV443(progress);
    return createPrebattleHqContextV443({
      source: 'stage_select',
      returnScreen: 'stage_select',
      battleMode: 'campaign',
    });
  }

  return createManagementHqContextV443();
}

export function clearHqContextV443(root) {
  if (!root || typeof root !== 'object') return;
  root.hqContext = null;
  root.hqReturnScreen = null;
}

export function openManagementHqV443(gsRef) {
  if (!gsRef?.current) return null;
  const context = createManagementHqContextV443();
  gsRef.current.hqContext = context;
  gsRef.current.hqReturnScreen = context.returnScreen;
  return context;
}

export function openCampaignPrebattleHqV443(gsRef) {
  if (!gsRef?.current) return null;
  const progress = normalizeCampaignProgressV443(gsRef.current.campaignData?.progress || {});
  if (gsRef.current.campaignData && !gsRef.current.campaignData.progress) {
    gsRef.current.campaignData.progress = progress;
  }
  const context = createPrebattleHqContextV443({
    source: 'stage_select',
    returnScreen: 'stage_select',
    battleMode: 'campaign',
  });
  gsRef.current.hqContext = context;
  gsRef.current.hqReturnScreen = context.returnScreen;
  gsRef.current.gameMode = 'campaign';
  return context;
}

export function openDungeonPrebattleHqV443(gsRef) {
  if (!gsRef?.current) return null;
  const context = createPrebattleHqContextV443({
    source: 'dungeon_select',
    returnScreen: 'dungeon_select',
    battleMode: 'dungeon',
  });
  gsRef.current.hqContext = context;
  gsRef.current.hqReturnScreen = context.returnScreen;
  gsRef.current.gameMode = 'dungeon';
  return context;
}
