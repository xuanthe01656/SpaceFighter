/**
 * Space Fighter Background Catalog v1.3.0 (Graphics 2.1.7-BG.4 candidate preview).
 *
 * PRESENTATION ONLY. Stable location IDs and saved player data are never mutated.
 * Scene bindings select artwork; environment/combat modifiers remain in worlds.js.
 *
 * Production policy:
 * - Use a fixed artwork ID and increment `revision` when replacing its files.
 * - Every repeated image must have matching upper/lower borders (pixel QA).
 * - Artwork must be licensed/approved before switching status to production.
 * - Author several short parallax layers rather than thousands of decorative meshes.
 * - `scrollCssPixelsPerSecond` is CSS-pixel speed, independent of DPR/render scale.
 */
export const BACKGROUND_CATALOG_VERSION = '1.3.0';
export { BACKGROUND_ART_BIOMES, BACKGROUND_ART_ROADMAP, BACKGROUND_COMBAT_READABILITY, BACKGROUND_ART_DIRECTION_VERSION } from './BackgroundArtDirection.js';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

export const BACKGROUND_SCROLL_DIRECTIONS = Object.freeze({
  TOWARD_PLAYER: 'toward-player', // ground passes downward while ship flies forward
  AWAY_FROM_PLAYER: 'away-from-player',
  STATIC: 'static',
});

export const BATTLE_BACKGROUND_CATALOG = deepFreeze({
  alpha_coast_demo: {
    id: 'alpha_coast_demo', revision: 2, status: 'demo',
    biome: 'coastal_megacity',
    artDirectionId: 'coastal_megacity', artPipelineStatus: 'prototype_qa',
    name: { vi: 'Thành phố ven biển Alpha (demo)', en: 'Alpha Coastal City (demo)' },
    licenseStatus: 'prototype_only',
    fallbackColor: '#081b2b',
    scrollDirection: BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER,
    layerLimit: { desktop: 3, mobile: 2, mobileLow: 1 },
    loadTimeoutMs: 15000,
    layers: [
      {
        id: 'coast_base', role: 'base',
        // Lower-resolution original art variant (never upscaled in desktop).
        qualityVariants: { mobileLow: { src: '/images/backgrounds/demo/alpha_coast_low.webp', imageWidth: 512, imageHeight: 1024 } },
        src: '/images/backgrounds/demo/alpha_coast.webp',
        imageWidth: 1024, imageHeight: 2048,
        scrollCssPixelsPerSecond: 12,
        // Legacy speed still accepted by the renderer for old third-party catalogs.
        scrollCyclesPerSecond: 0.012,
        opacity: 1, tiling: 'repeat-y', fit: 'cover', priority: 0,
        seamlessY: true, // RGB edge check in BG.2 test report; repetitive artwork is still demo-only.
      },
    ],
  },
  nereus_ocean_demo: {
    id: 'nereus_ocean_demo', revision: 2, status: 'demo',
    biome: 'ocean_floating_base',
    artDirectionId: 'ocean_floating_base', artPipelineStatus: 'prototype_qa',
    name: { vi: 'Đại dương và căn cứ nổi Nereus (demo)', en: 'Nereus Ocean Platform (demo)' },
    licenseStatus: 'prototype_only',
    fallbackColor: '#082b44',
    scrollDirection: BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER,
    layerLimit: { desktop: 3, mobile: 2, mobileLow: 1 },
    loadTimeoutMs: 15000,
    layers: [
      {
        id: 'ocean_base', role: 'base',
        qualityVariants: { mobileLow: { src: '/images/backgrounds/demo/nereus_ocean_low.webp', imageWidth: 512, imageHeight: 1024 } },
        src: '/images/backgrounds/demo/nereus_ocean.webp',
        imageWidth: 1024, imageHeight: 2048,
        scrollCssPixelsPerSecond: 14,
        scrollCyclesPerSecond: 0.014,
        opacity: 1, tiling: 'repeat-y', fit: 'cover', priority: 0,
        seamlessY: true,
      },
    ],
  },

  // BG.4 first-pass candidates: still pixel-upscaled from 640x1147 Meshy edits.
  // QA-only by URL (?bg=bg4). NOT auto-bound or approved for commercial release.
  alpha_coast_v1_candidate: {
    id: 'alpha_coast_v1_candidate', revision: 1, status: 'candidate',
    biome: 'coastal_megacity', artDirectionId: 'coastal_megacity',
    artPipelineStatus: 'review', licenseStatus: 'prototype_only',
    provenance: 'MESHY_640x1147_TECHNICAL_SEAM_REPAIR_UPSCALED',
    name: { vi: 'Alpha Coastal City (BG4 thử nghiệm)', en: 'Alpha Coastal City (BG4 candidate)' },
    fallbackColor: '#081b2b', scrollDirection: BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER,
    layerLimit: { desktop: 3, mobile: 2, mobileLow: 1 }, loadTimeoutMs: 15000,
    layers: [{
      id: 'alpha_candidate_base', role: 'base', priority: 0,
      src: '/images/backgrounds/candidates/alpha_coast_v1_candidate.webp',
      imageWidth: 1024, imageHeight: 2048,
      qualityVariants: { mobileLow: {
        src: '/images/backgrounds/candidates/alpha_coast_v1_candidate_low.webp',
        imageWidth: 512, imageHeight: 1024,
      } },
      scrollCssPixelsPerSecond: 12, scrollCyclesPerSecond: 0.012,
      opacity: 1, tiling: 'repeat-y', fit: 'cover', seamlessY: true,
    }],
  },
  nereus_ocean_v1_candidate: {
    id: 'nereus_ocean_v1_candidate', revision: 1, status: 'candidate',
    biome: 'ocean_floating_base', artDirectionId: 'ocean_floating_base',
    artPipelineStatus: 'review', licenseStatus: 'prototype_only',
    provenance: 'MESHY_640x1147_TECHNICAL_SEAM_REPAIR_UPSCALED',
    name: { vi: 'Nereus Ocean Base (BG4 thử nghiệm)', en: 'Nereus Ocean Base (BG4 candidate)' },
    fallbackColor: '#082b44', scrollDirection: BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER,
    layerLimit: { desktop: 3, mobile: 2, mobileLow: 1 }, loadTimeoutMs: 15000,
    layers: [{
      id: 'nereus_candidate_base', role: 'base', priority: 0,
      src: '/images/backgrounds/candidates/nereus_ocean_v1_candidate.webp',
      imageWidth: 1024, imageHeight: 2048,
      qualityVariants: { mobileLow: {
        src: '/images/backgrounds/candidates/nereus_ocean_v1_candidate_low.webp',
        imageWidth: 512, imageHeight: 1024,
      } },
      scrollCssPixelsPerSecond: 14, scrollCyclesPerSecond: 0.014,
      opacity: 1, tiling: 'repeat-y', fit: 'cover', seamlessY: true,
    }],
  },
});

/** Stage-specific bindings do not modify PLANET_CONFIG or saved campaign progress. */
export const BATTLE_BACKGROUND_BINDINGS = deepFreeze({
  campaign: {
    1: { defaultId: 'alpha_coast_demo', stages: {}, stageRanges: [] },
    // Cryo/Inferno deliberately use their original starfield until art is approved.
  },
  dungeon: {
    dung_nereus: 'nereus_ocean_demo',
    // Taurus/Abaddon deliberately use their original starfield.
  },
});

/** Resolve stage art in a large campaign without editing either battle scene. */
export function resolveStageBackgroundId(binding, stage) {
  if (!binding) return null;
  const stageNumber = Number(stage);
  if (Number.isInteger(stageNumber) && stageNumber > 0) {
    const exact = binding.stages?.[stageNumber];
    if (exact) return exact;
    const range = binding.stageRanges?.find(r => stageNumber >= r.from && stageNumber <= r.to);
    if (range) return range.id;
  }
  return binding.defaultId || null;
}

/**
 * Priority: explicit visual override > exact campaign stage > ranged campaign
 * stage > planet default > dungeon binding > legacy fallback.
 * Range entries are [{from: 1, to: 5, id: 'background_id'}]; first match wins.
 */
export function resolveBattleBackground({
  mode, planetId = null, stage = null, dungeonId = null, variantId = null,
} = {}) {
  let id = typeof variantId === 'string' && variantId.trim() ? variantId : null;
  if (!id && mode === 'campaign') {
    const binding = BATTLE_BACKGROUND_BINDINGS.campaign[Number(planetId)];
    if (binding) id = resolveStageBackgroundId(binding, stage);
  }
  if (!id && mode === 'dungeon') id = BATTLE_BACKGROUND_BINDINGS.dungeon[dungeonId];
  return (id && BATTLE_BACKGROUND_CATALOG[id]) || null;
}

export function selectBackgroundLayers(config, qualityId = 'desktop') {
  if (!config || !Array.isArray(config.layers)) return [];
  const profile = ['desktop', 'mobile', 'mobileLow'].includes(qualityId) ? qualityId : 'mobileLow';
  const hardLimit = profile === 'desktop' ? 3 : profile === 'mobile' ? 2 : 1;
  const rawLimit = Number(config.layerLimit?.[profile]);
  const limit = Math.min(hardLimit, Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : hardLimit);
  return config.layers.slice().sort((a, b) => a.priority - b.priority).slice(0, limit).map(layer => {
    // Quality changes presentation assets only, never gameplay or saved IDs.
    const variant = layer.qualityVariants?.[profile];
    return variant ? { ...layer, src: variant.src, imageWidth: variant.imageWidth, imageHeight: variant.imageHeight } : layer;
  });
}

/** Safe public asset URLs for root, Vite subdirectory deployments and Capacitor. */
export function resolveBackgroundAssetUrl(src, baseUrl = '/') {
  if (typeof src !== 'string' || src.includes('..') || !/^\/[a-z\d/_\-.]+\.(webp|png|jpg|jpeg)$/i.test(src)) return null;
  const base = typeof baseUrl === 'string' && baseUrl.startsWith('/') ? baseUrl : '/';
  return `${base.replace(/\/+$/, '')}/${src.replace(/^\/+/, '')}`;
}

/** The legacy starfield stays available for A/B testing and missing artwork. */
export function legacyBattleBackgroundRequested(queryString = '') {
  try { return new URLSearchParams(queryString).get('bg') === 'legacy'; }
  catch { return false; }
}

/** Opt-in-only QA backgrounds. Default battle stage mappings remain unchanged. */
export function previewBg4Variant({ mode, planetId = null, dungeonId = null, queryString = '' } = {}) {
  try {
    if (new URLSearchParams(queryString).get('bg') !== 'bg4') return null;
    if (mode === 'campaign' && Number(planetId) === 1) return 'alpha_coast_v1_candidate';
    if (mode === 'dungeon' && dungeonId === 'dung_nereus') return 'nereus_ocean_v1_candidate';
    return null;
  } catch { return null; }
}
