/**
 * Space Fighter V4.4.4 Portal / Headquarters navigation contract.
 *
 * It separates management HQ from pre-battle HQ and normalizes old profiles so
 * returning from Campaign can never land on an empty Stage Select screen.
 */
export const PORTAL_HANGAR_VERSION_V444 = 'portal-hangar-v4.4.4';
export const HQ_MODE_MANAGE_V444 = 'manage';
export const HQ_MODE_PREBATTLE_V444 = 'prebattle';

const SAFE_RETURN_SCREENS_V444 = new Set([
  'campaign_portal',
  'stage_select',
  'dungeon_select',
  'galaxy_map',
]);

const safeScreen = (value, fallback) => (
  SAFE_RETURN_SCREENS_V444.has(String(value || '')) ? String(value) : fallback
);

export function normalizeCampaignProgressV444(progress) {
  const target = progress && typeof progress === 'object' ? progress : {};
  const currentPlanet = Math.max(1, Math.trunc(Number(target.currentPlanet) || 1));
  const selectedStage = Math.max(
    1,
    Math.trunc(Number(target.selectedStage) || Number(target.currentStage) || 1),
  );
  const currentStage = Math.max(1, Math.trunc(Number(target.currentStage) || selectedStage));
  const highestStage = Math.max(currentStage, Math.trunc(Number(target.highestStage) || currentStage));
  target.currentPlanet = currentPlanet;
  target.selectedStage = selectedStage;
  target.currentStage = currentStage;
  target.highestStage = highestStage;
  return target;
}

export function createManagementHqContextV444({
  source = 'campaign_portal',
  returnScreen = 'campaign_portal',
} = {}) {
  return Object.freeze({
    version: PORTAL_HANGAR_VERSION_V444,
    mode: HQ_MODE_MANAGE_V444,
    source: String(source || 'campaign_portal'),
    returnScreen: safeScreen(returnScreen, 'campaign_portal'),
    battleMode: null,
  });
}

export function createPrebattleHqContextV444({
  source,
  returnScreen,
  battleMode = 'campaign',
} = {}) {
  const normalizedBattleMode = battleMode === 'dungeon' ? 'dungeon' : 'campaign';
  return Object.freeze({
    version: PORTAL_HANGAR_VERSION_V444,
    mode: HQ_MODE_PREBATTLE_V444,
    source: String(source || (normalizedBattleMode === 'dungeon' ? 'dungeon_select' : 'stage_select')),
    returnScreen: safeScreen(
      returnScreen,
      normalizedBattleMode === 'dungeon' ? 'dungeon_select' : 'stage_select',
    ),
    battleMode: normalizedBattleMode,
  });
}

export function resolveHqContextV444({ gsRef, gameMode } = {}) {
  const root = gsRef?.current && typeof gsRef.current === 'object' ? gsRef.current : {};
  const explicit = root.hqContext;
  if (explicit?.version === PORTAL_HANGAR_VERSION_V444) {
    return explicit.mode === HQ_MODE_PREBATTLE_V444
      ? createPrebattleHqContextV444(explicit)
      : createManagementHqContextV444(explicit);
  }
  // Accept the V4.4.3 shape during migration without forcing another screen hop.
  if (explicit?.mode === 'prebattle') return createPrebattleHqContextV444(explicit);
  if (explicit?.mode === 'manage') return createManagementHqContextV444(explicit);

  if (root.hqReturnScreen === 'campaign_portal') return createManagementHqContextV444();

  const mode = gameMode === 'dungeon' ? 'dungeon' : 'campaign';
  if (mode === 'dungeon' && root.selectedDungeonId) {
    return createPrebattleHqContextV444({
      source: 'dungeon_select',
      returnScreen: 'dungeon_select',
      battleMode: 'dungeon',
    });
  }

  const progress = root.campaignData?.progress;
  if (progress && (progress.currentPlanet || progress.selectedStage || progress.currentStage)) {
    normalizeCampaignProgressV444(progress);
    return createPrebattleHqContextV444({
      source: 'stage_select',
      returnScreen: 'stage_select',
      battleMode: 'campaign',
    });
  }

  return createManagementHqContextV444();
}

export function clearHqContextV444(root) {
  if (!root || typeof root !== 'object') return;
  root.hqContext = null;
  root.hqReturnScreen = null;
}

export function openManagementHqV444(gsRef) {
  if (!gsRef?.current) return null;
  const context = createManagementHqContextV444();
  gsRef.current.hqContext = context;
  gsRef.current.hqReturnScreen = context.returnScreen;
  return context;
}

export function openCampaignPrebattleHqV444(gsRef) {
  if (!gsRef?.current) return null;
  const campaignData = gsRef.current.campaignData || (gsRef.current.campaignData = {});
  const progress = normalizeCampaignProgressV444(campaignData.progress || (campaignData.progress = {}));
  campaignData.progress = progress;
  const context = createPrebattleHqContextV444({
    source: 'stage_select',
    returnScreen: 'stage_select',
    battleMode: 'campaign',
  });
  gsRef.current.hqContext = context;
  gsRef.current.hqReturnScreen = context.returnScreen;
  gsRef.current.gameMode = 'campaign';
  return context;
}

export function openDungeonPrebattleHqV444(gsRef) {
  if (!gsRef?.current) return null;
  const context = createPrebattleHqContextV444({
    source: 'dungeon_select',
    returnScreen: 'dungeon_select',
    battleMode: 'dungeon',
  });
  gsRef.current.hqContext = context;
  gsRef.current.hqReturnScreen = context.returnScreen;
  gsRef.current.gameMode = 'dungeon';
  return context;
}

export function auditHangarNavigationV444() {
  const issues = [];
  const progress = normalizeCampaignProgressV444({});
  if (progress.currentPlanet !== 1 || progress.selectedStage !== 1) issues.push('DEFAULT_PROGRESS');
  const management = createManagementHqContextV444();
  if (management.mode !== HQ_MODE_MANAGE_V444 || management.returnScreen !== 'campaign_portal') issues.push('MANAGE_CONTEXT');
  const prebattle = createPrebattleHqContextV444({ battleMode: 'dungeon' });
  if (prebattle.mode !== HQ_MODE_PREBATTLE_V444 || prebattle.returnScreen !== 'dungeon_select') issues.push('PREBATTLE_CONTEXT');
  return Object.freeze(issues);
}
