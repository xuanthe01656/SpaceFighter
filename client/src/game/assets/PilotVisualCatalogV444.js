/**
 * Space Fighter V4.4.4 pilot visual fallback contract.
 *
 * Runtime policy:
 * - Respect the catalog-authored image first.
 * - Try bundled project locations next.
 * - Always end with a V4.4.4 app-local WebP so a missing legacy PNG never
 *   exposes the browser's broken-image icon in Portal or Headquarters.
 * - Visual fallback never changes pilot identity, passive or progression.
 */

export const PILOT_VISUAL_VERSION_V444 = 'pilot-visual-fallback-v4.4.4';

export const PILOT_VISUAL_IDS_V444 = Object.freeze([
  'pilot_alpha',
  'pilot_bear',
  'pilot_fox',
  'pilot_ghost',
  'pilot_nova',
  'pilot_viper',
  'pilot_titan',
  'pilot_echo',
]);

const PILOT_ACCENTS_V444 = Object.freeze({
  pilot_alpha: '#48d8ff',
  pilot_bear: '#ff9f43',
  pilot_fox: '#b779ff',
  pilot_ghost: '#ff5db1',
  pilot_nova: '#ffd35a',
  pilot_viper: '#50e39b',
  pilot_titan: '#9bb6d2',
  pilot_echo: '#65a7ff',
});

const safePilotId = value => (
  typeof value === 'string' && /^pilot_[a-z0-9_]+$/.test(value)
    ? value
    : 'pilot_alpha'
);

const uniqueStrings = values => Object.freeze([
  ...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())),
]);

export function resolvePilotPortraitCandidatesV444(pilot) {
  const id = safePilotId(pilot?.id);
  const shortId = id.replace(/^pilot_/, '');
  return uniqueStrings([
    pilot?.imgSrc,
    `/images/pilots/${id}.webp`,
    `/images/pilots/${id}.png`,
    `/images/pilots/${shortId}.webp`,
    `/images/pilots/${shortId}.png`,
    `/images/hangar/pilots/${id}.webp`,
  ]);
}

export function resolvePilotFallbackPortraitV444(pilotId) {
  const id = safePilotId(pilotId);
  return `/images/hangar/pilots/${id}.webp`;
}

export function resolvePilotAccentV444(pilotId) {
  const id = safePilotId(pilotId);
  return PILOT_ACCENTS_V444[id] || PILOT_ACCENTS_V444.pilot_alpha;
}

export function resolvePilotInitialsV444(pilot, lang = 'vi') {
  const label = pilot?.name?.[lang] || pilot?.name?.vi || pilot?.name?.en || pilot?.id || 'Pilot';
  const words = String(label).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'P';
  return words.slice(0, 2).map(word => word[0]?.toUpperCase() || '').join('') || 'P';
}

export function auditPilotVisualCatalogV444() {
  const issues = [];
  if (new Set(PILOT_VISUAL_IDS_V444).size !== 8) issues.push('PILOT_ID_COUNT');
  for (const id of PILOT_VISUAL_IDS_V444) {
    if (!PILOT_ACCENTS_V444[id]) issues.push(`ACCENT:${id}`);
    if (!resolvePilotFallbackPortraitV444(id).endsWith(`${id}.webp`)) issues.push(`FALLBACK:${id}`);
  }
  return Object.freeze(issues);
}
