/**
 * Space Fighter V4.4.2 Command Hangar asset contract.
 *
 * Production policy:
 * - UI chrome and 2D previews are bundled locally for deterministic/offline startup.
 * - Heavy GLB assets are optional CDN payloads and are never required to open HQ.
 * - A downloaded model must be verified and activated by the resource-delivery layer
 *   before a local file URI is handed to Babylon.
 * - Runtime gameplay authority, hitboxes and stats never derive from presentation assets.
 */
export const COMMAND_HANGAR_VERSION_V442 = 'command-hangar-v4.4.2';

export const COMMAND_HANGAR_LOCAL_ROOT_V442 = Object.freeze({
  shipPreview: '/images/hangar/ships',
  weaponPreview: '/images/hangar/weapons',
  hud: '/assets/ui/spacefighter-hud-v3',
});

export const COMMAND_HANGAR_SHIP_IDS_V442 = Object.freeze([
  'ship_xwing', 'ship_scout', 'ship_tank', 'ship_phantom',
  'ship_void', 'ship_nebula', 'ship_raptor', 'ship_spectre',
  'ship_storm', 'ship_leviathan', 'ship_vortex', 'ship_nova',
  'ship_eternal', 'ship_abyss', 'ship_titanforge', 'ship_celestial',
]);

export const COMMAND_HANGAR_WEAPON_IDS_V442 = Object.freeze([
  'gun_charge', 'gun_homing', 'gun_ion', 'gun_laser', 'gun_neutron',
  'gun_photon', 'gun_plasma', 'gun_pulse', 'gun_rail', 'gun_shotgun',
  'gun_spread', 'gun_wave', 'wing_dronelet', 'wing_emp', 'wing_homing',
  'wing_laser', 'wing_missile', 'wing_torpedo',
]);

const shipIdSet = new Set(COMMAND_HANGAR_SHIP_IDS_V442);
const weaponIdSet = new Set(COMMAND_HANGAR_WEAPON_IDS_V442);

const safeId = value => typeof value === 'string' && /^[a-z0-9_]+$/.test(value) ? value : null;

export function resolveCommandHangarShipPreviewV442(shipId, fallback = '') {
  const id = safeId(shipId);
  return id && shipIdSet.has(id)
    ? `${COMMAND_HANGAR_LOCAL_ROOT_V442.shipPreview}/${id}.webp`
    : fallback;
}

export function resolveCommandHangarWeaponPreviewV442(assetId, fallback = '') {
  const id = safeId(assetId);
  return id && weaponIdSet.has(id)
    ? `${COMMAND_HANGAR_LOCAL_ROOT_V442.weaponPreview}/${id}.webp`
    : fallback;
}

export function resolveCommandHangarPanelV442(kind = 'main') {
  const id = kind === 'side' ? 'sf_neo_panel_side__campaign'
    : kind === 'notice' ? 'sf_neo_notice_01__campaign'
      : 'sf_neo_panel_main__campaign';
  return `${COMMAND_HANGAR_LOCAL_ROOT_V442.hud}/neo_panels/${id}.webp`;
}

export function resolveCommandHangarButtonV442(type = 1, state = 'normal') {
  const safeType = [1, 2, 3].includes(Number(type)) ? Number(type) : 1;
  const safeState = ['normal', 'focused', 'pressed', 'disabled'].includes(state)
    ? state
    : 'normal';
  return `${COMMAND_HANGAR_LOCAL_ROOT_V442.hud}/neo_buttons/sf_neo_button_0${safeType}__campaign_${safeState}.webp`;
}

export function resolveCommandHangarRankFrameV442(rarity = 1, state = 'normal') {
  const safeRarity = Math.max(1, Math.min(6, Math.trunc(Number(rarity) || 1)));
  const safeState = ['normal', 'selected', 'locked'].includes(state) ? state : 'normal';
  return `${COMMAND_HANGAR_LOCAL_ROOT_V442.hud}/rank_badges/sf_rank_frame_0${safeRarity}__${safeState}.webp`;
}

export const COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442 = Object.freeze({
  enabledByDefault: false,
  mode: 'cdn_optional_verified_local_cache',
  shipPackMode: 'one_model_per_pack',
  weaponPackMode: 'one_model_per_pack',
  localFallback: 'bundled_webp',
  activateOnlyAfterSha256: true,
  atomicActivation: true,
  keepLastKnownGood: true,
  loadDuringCombat: false,
  wifiOnlyDefault: true,
});

export function resolveCommandHangarCdnDescriptorV442(kind, id, {
  releaseId = 'hangar-models-v2',
  baseUrl = '',
} = {}) {
  const normalized = safeId(id);
  const isShip = kind === 'ship' && normalized && shipIdSet.has(normalized);
  const isWeapon = kind === 'weapon' && normalized && weaponIdSet.has(normalized);
  if (!isShip && !isWeapon) return null;
  const relativePath = isShip
    ? `models/ships/v2/${normalized}.glb`
    : `models/weapons/v2/mobile/${normalized}.glb`;
  return Object.freeze({
    kind,
    id: normalized,
    releaseId,
    relativePath,
    remoteUrl: baseUrl ? `${String(baseUrl).replace(/\/$/, '')}/${relativePath}` : null,
    required: false,
    fallback: isShip
      ? resolveCommandHangarShipPreviewV442(normalized)
      : resolveCommandHangarWeaponPreviewV442(normalized),
  });
}

export function auditCommandHangarAssetPolicyV442() {
  const issues = [];
  if (new Set(COMMAND_HANGAR_SHIP_IDS_V442).size !== 16) issues.push('SHIP_ID_COUNT');
  if (new Set(COMMAND_HANGAR_WEAPON_IDS_V442).size !== 18) issues.push('WEAPON_ID_COUNT');
  if (COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.enabledByDefault !== false) issues.push('MODEL_DEFAULT');
  if (COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.localFallback !== 'bundled_webp') issues.push('FALLBACK');
  if (!COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.activateOnlyAfterSha256) issues.push('SHA256');
  if (!COMMAND_HANGAR_MODEL_DELIVERY_POLICY_V442.atomicActivation) issues.push('ATOMIC');
  return Object.freeze(issues);
}
