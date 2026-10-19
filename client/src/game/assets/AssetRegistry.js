/**
 * Space Fighter 2.1.8-A: stable asset contract, independent of player data.
 * Artwork may be absent; runtime and gameplay IDs are NEVER substituted.
 * Asset deliveries replace files at the canonical paths below (no scene edit).
 */
import { AIRCRAFTS } from '../catalog/aircraft.js';
import { PILOTS } from '../catalog/pilots.js';
import { GEAR_CATALOG } from '../catalog/gear.js';
import { PLANET_ENEMIES, PLANET_BOSSES, DUNGEON_CONFIG } from '../catalog/worlds.js';
import { AVAILABLE_ASSET_PATHS } from './AssetAvailability.generated.js';
import { BATTLE_ANIMATION_CLIPS, BATTLE_ANIMATION_GRID, isAnimatedBattleKind } from './EnemyBossAnimationCatalog.js';
import { createEnemyBossModelContract } from './EnemyBossModelCatalog.js';

export const VISUAL_CONTRACT_VERSION = '1.2.0';
const available = new Set(AVAILABLE_ASSET_PATHS);
const isId = value => typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value);
const tintFor = (id, kind) => {
  let hash = 2166136261;
  for (const letter of `${kind}:${id}`) { hash ^= letter.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const r = 75 + (hash & 127);
  const g = 75 + ((hash >>> 8) & 127);
  const b = 75 + ((hash >>> 16) & 127);
  return `#${[r,g,b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
};
const fixedSockets = list => Object.freeze(list.map(s => Object.freeze({
  ...s, offset: Object.freeze({x:s.offset.x,y:s.offset.y,z:s.offset.z}),
})));
const shipSockets = ship => {
  const engines = ship.engineMounts?.length ? ship.engineMounts : [{id:'main',offset:ship.engineOffset || {x:0,y:0,z:1.0}}];
  const wing = ship.wingmanOffset || {x:1.15,y:0,z:0};
  const drone = ship.droneOffset || {x:0,y:0,z:0.8};
  return [
    {id:'gun:main',offset:{x:0,y:0,z:-0.85}},
    {id:'wingman:left',offset:{x:-Math.abs(wing.x),y:wing.y,z:wing.z}},
    {id:'wingman:right',offset:{x:Math.abs(wing.x),y:wing.y,z:wing.z}},
    {id:'drone:rear',offset:{x:drone.x,y:drone.y,z:drone.z}},
    ...engines.map(e=>({id:`engine:${e.id}`,offset:e.offset})),
  ];
};
const definition = (kind, id, opts = {}) => Object.freeze({
  kind, id,
  assetId: `${kind}:${id}`,
  paths: Object.freeze({
    icon: `/images/visuals/${kind}/${id}.webp`,
    top: `/images/visuals/${kind}/${id}_top.webp`,
    model: `/models/visuals/${kind}/${id}.glb`,
    ...(isAnimatedBattleKind(kind) ? { atlas: `/images/visuals/${kind}/${id}_sheet.webp` } : {}),
  }),
  legacyIcon: opts.legacyIcon || null,
  role: opts.role || 'standard',
  tint: opts.tint || tintFor(id, kind),
  // Visual-only data: gameplay collision dimensions must never derive from art.
  visual: Object.freeze({ size: opts.size ?? 2.0, orientation: 'nose-negative-z',
    sockets: fixedSockets(opts.sockets || []),
    ...(isAnimatedBattleKind(kind) ? { atlasGrid: BATTLE_ANIMATION_GRID, animations: BATTLE_ANIMATION_CLIPS,
      model: createEnemyBossModelContract(kind, id, opts.size ?? 2.0) } : {}),
  }),
});

const entries = [];
for (const ship of AIRCRAFTS) entries.push(definition('ship', ship.id,
  { legacyIcon: ship.imgHq || ship.imgTop, role: ship.role || 'fighter', size: 2.4, sockets: shipSockets(ship) }));
for (const pilot of PILOTS) entries.push(definition('pilot', pilot.id,
  { legacyIcon: pilot.imgSrc, role: pilot.passive || 'standard', size: 1 }));
for (const [slot, gearList] of Object.entries(GEAR_CATALOG)) {
  for (const gear of gearList) entries.push(definition('equipment', gear.id,
    { legacyIcon: gear.imgSrc, role: slot, size: 1 }));
}
for (const configList of Object.values(PLANET_ENEMIES)) {
  for (const enemy of configList) entries.push(definition('enemy', enemy.id,
    { legacyIcon: enemy.imgSrc, role: `tier${enemy.tier}`, size: enemy.tier >= 3 ? 2.6 : 2.2, sockets: [{id:'gun:main',offset:{x:0,y:0,z:0.8}}] }));
}
for (const configGroup of Object.values(PLANET_BOSSES)) {
  for (const boss of Object.values(configGroup)) entries.push(definition('boss', boss.id,
    { legacyIcon: boss.imgSrc, role: 'boss', size: 5.2, sockets: [{id:'gun:left',offset:{x:-1.1,y:0,z:0.75}},{id:'gun:right',offset:{x:1.1,y:0,z:0.75}}] }));
}
for (const dungeon of DUNGEON_CONFIG) {
  for (const enemyType of ['scout', 'elite', 'heavy']) {
    entries.push(definition('dungeon_enemy', `${dungeon.id}_${enemyType}`, { role: enemyType, size: enemyType === 'heavy' ? 3.0 : 2.3, sockets: [{id:'gun:main',offset:{x:0,y:0,z:0.75}}] }));
  }
  entries.push(definition('dungeon_boss', `${dungeon.id}_boss`, { role: 'boss', size: 5.8, sockets: [{id:'gun:left',offset:{x:-1.4,y:0,z:1}},{id:'gun:right',offset:{x:1.4,y:0,z:1}}] }));
}
for (const projectile of ['laser', 'plasma', 'ion', 'rail', 'pulse', 'neutron', 'photon', 'charge', 'missile']) {
  entries.push(definition('projectile', `projectile_${projectile}`, { role: projectile, size: 0.5 }));
}
for (const effect of ['explosion_small', 'explosion_large', 'muzzle_flash', 'engine_flame', 'impact', 'shield_hit']) {
  entries.push(definition('effect', effect, { role: 'vfx', size: 1 }));
}

export const ALL_VISUAL_PROFILES = Object.freeze(entries);
const byKey = new Map(entries.map(profile => [profile.assetId, profile]));
export const allVisualProfiles = () => ALL_VISUAL_PROFILES;

/** No URL is returned unless it is present in the generated public-file manifest. */
export function resolveAssetVisual(kind, id, presentPaths = available) {
  if (!isId(id) || !isId(kind)) return null;
  const def = byKey.get(`${kind}:${id}`);
  if (!def) return null;
  const iconSrc = presentPaths.has(def.paths.icon) ? def.paths.icon
    : (def.legacyIcon && presentPaths.has(def.legacyIcon) ? def.legacyIcon : null);
  const topSrc = presentPaths.has(def.paths.top) ? def.paths.top : iconSrc;
  const modelSrc = presentPaths.has(def.paths.model) ? def.paths.model : null;
  const atlasSrc = def.paths.atlas && presentPaths.has(def.paths.atlas) ? def.paths.atlas : null;
  return Object.freeze({ ...def, iconSrc, topSrc, modelSrc, atlasSrc,
    state: topSrc || atlasSrc || modelSrc ? 'asset-present' : 'placeholder',
  });
}
export const isKnownAsset = (kind, id) => byKey.has(`${kind}:${id}`);
export const assetDeliveryPaths = (kind, id) => byKey.get(`${kind}:${id}`)?.paths || null;
