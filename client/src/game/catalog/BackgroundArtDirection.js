/**
 * Space Fighter production background ART DIRECTION (BG.3).
 * This file contains creative/planning metadata only. It never changes combat,
 * environment debuffs, rewards, saved IDs or scene logic. Planned art cannot
 * be selected for battles until registered in BackgroundCatalog after review.
 */
export const BACKGROUND_ART_DIRECTION_VERSION = '1.0.0';

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Coordinates normalized to 0..1 within the visible, cropped screen image. */
export const BACKGROUND_COMBAT_READABILITY = deepFreeze({
  centerLane: { xMin: 0.26, xMax: 0.74, yMin: 0.15, yMax: 0.84 },
  topHud: { yMin: 0, yMax: 0.10 },
  bottomPlayer: { yMin: 0.80, yMax: 1 },
  maxOpaqueOverlayFraction: 0.35,
  camera: 'top_down_orthographic',
  scrollAxis: 'vertical',
  repeatAxis: 'y',
  shipForwardOnScreen: 'up',
  sceneryMotionOnScreen: 'down',
});

/**
 * Fictional original Space Fighter visual language: high-altitude tactical
 * surveys, architectural silhouettes on side margins, clean projectile lane.
 * Palettes and brief names are hints for artists, not gameplay buffs/debuffs.
 */
export const BACKGROUND_ART_BIOMES = deepFreeze({
  coastal_megacity: {
    id: 'coastal_megacity', labelVi: 'Đô thị ven biển Alpha',
    theme: 'Tactical orbital photography: azure harbors, ivory arcologies, industrial docks.',
    palette: ['#063c59', '#107c9a', '#d9e7d8', '#4e7981'],
    keepCenterOpen: true, hazardsAreVisualOnly: true,
    preferredLandmarks: ['coastal highway', 'arched docks', 'high-rise district'],
  },
  ocean_floating_base: {
    id: 'ocean_floating_base', labelVi: 'Đại dương Nereus',
    theme: 'Deep cobalt water, drifting algae current, isolated ocean research platforms.',
    palette: ['#07283a', '#104d6a', '#2690aa', '#bfd5d5'],
    keepCenterOpen: true, hazardsAreVisualOnly: true,
    preferredLandmarks: ['offshore base', 'islands', 'submerged facilities'],
  },
  cryo_glacier: {
    id: 'cryo_glacier', labelVi: 'Băng nguyên Cryo',
    theme: 'Snowbound research ruins, fractured glacier plates, polar dusk lighting.',
    palette: ['#113a59', '#5686a5', '#b4d6e0', '#edf3ef'],
    keepCenterOpen: true, hazardsAreVisualOnly: true,
    preferredLandmarks: ['glacier fault', 'research dome', 'ice canyon'],
  },
  inferno_forge: {
    id: 'inferno_forge', labelVi: 'Lò luyện Inferno',
    theme: 'Basalt manufacturing trenches and distant lava flows, not an eye-searing red overlay.',
    palette: ['#1d1e25', '#61392a', '#bb5a27', '#e4a261'],
    keepCenterOpen: true, hazardsAreVisualOnly: true,
    preferredLandmarks: ['geothermal refinery', 'lava fissure', 'slag field'],
  },
  taurus_dunes: {
    id: 'taurus_dunes', labelVi: 'Hẻm núi Taurus',
    theme: 'Rust deserts, rail canyons and erosion-carved outposts viewed from altitude.',
    palette: ['#442f31', '#a36b4b', '#c8aa7e', '#ecd5a5'],
    keepCenterOpen: true, hazardsAreVisualOnly: true,
    preferredLandmarks: ['canyon ridge', 'ruined transit', 'desert outpost'],
  },
  abaddon_orbit: {
    id: 'abaddon_orbit', labelVi: 'Quỹ đạo Abaddon',
    theme: 'Cold outer-planet orbit, derelict mega-structures, quiet blue nebula.',
    palette: ['#090f28', '#1b3761', '#4280a0', '#8fa6c0'],
    keepCenterOpen: true, hazardsAreVisualOnly: true,
    preferredLandmarks: ['abandoned carrier', 'asteroid gate', 'orbital facility'],
  },
});

/**
 * Non-runtime art backlog. A planned name is deliberately NOT a catalog ID:
 * do not bind a level to a nonexistent texture or assert it is production art.
 */
export const BACKGROUND_ART_ROADMAP = deepFreeze([
  { world: 'alpha', mode: 'campaign', stageFrom: 1, stageTo: 5, artBriefId: 'alpha_coast_v1', biomeId: 'coastal_megacity', status: 'planned' },
  { world: 'alpha', mode: 'campaign', stageFrom: 6, stageTo: 10, artBriefId: 'alpha_dockyard_v1', biomeId: 'coastal_megacity', status: 'planned' },
  { world: 'alpha', mode: 'campaign', stageFrom: 11, stageTo: 15, artBriefId: 'alpha_citadel_v1', biomeId: 'coastal_megacity', status: 'planned' },
  { world: 'alpha', mode: 'campaign', stageFrom: 16, stageTo: 20, artBriefId: 'alpha_orbit_v1', biomeId: 'abaddon_orbit', status: 'planned' },
  { world: 'nereus', mode: 'dungeon', stageFrom: 1, stageTo: 7, artBriefId: 'nereus_ocean_v1', biomeId: 'ocean_floating_base', status: 'planned' },
  { world: 'cryo', mode: 'campaign', stageFrom: 1, stageTo: 20, artBriefId: 'cryo_ice_v1', biomeId: 'cryo_glacier', status: 'planned' },
  { world: 'inferno', mode: 'campaign', stageFrom: 1, stageTo: 20, artBriefId: 'inferno_forge_v1', biomeId: 'inferno_forge', status: 'planned' },
  { world: 'taurus', mode: 'dungeon', stageFrom: 1, stageTo: 5, artBriefId: 'taurus_dunes_v1', biomeId: 'taurus_dunes', status: 'planned' },
  { world: 'abaddon', mode: 'dungeon', stageFrom: 1, stageTo: 10, artBriefId: 'abaddon_orbit_v1', biomeId: 'abaddon_orbit', status: 'planned' },
]);
