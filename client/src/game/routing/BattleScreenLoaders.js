/**
 * Battle screens are intentionally loaded on demand: Babylon should not be
 * part of Portal's initial JavaScript bundle. HQ awaits preloadBattleScreen
 * BEFORE opening a Cloud battle ticket or spending Guest dungeon energy.
 * Native ESM import caches successful loads, so React.lazy reuses the module.
 */
export const loadCampaignEngine = () => import('../../components/Campaign/CampaignEngine');
export const loadDungeonEngine = () => import('../../components/Dungeon/DungeonEngine');
export const preloadBattleScreen = mode => mode === 'dungeon'
  ? loadDungeonEngine()
  : loadCampaignEngine();
