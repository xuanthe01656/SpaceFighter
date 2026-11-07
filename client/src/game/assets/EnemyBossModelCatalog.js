import { ENEMY_SOURCE_TO_ROOT_YAW_V26A4 } from './EnemyVisualHeadingV26A4.js';

/**
 * Graphics 2.1.8-B2.2 GLB delivery contract.
 * Official artists should align the nose to -Z and use glTF 2.0 GLB; the
 * gameplay hitbox never derives from an imported model. Per-ID corrections
 * may be placed in MODEL_VISUAL_OVERRIDES without changing either scene.
 */
export const ENEMY_BOSS_MODEL_VERSION = '1.0.0';
const freezeVec = v => Object.freeze({ x: v.x, y: v.y, z: v.z });
const aliases = Object.freeze({
  spawn: ['spawn', 'appear', 'entry'],
  idle: ['idle', 'hover', 'standby'],
  move: ['move', 'fly', 'travel'],
  attack: ['attack', 'fire', 'shoot'],
  hit: ['hit', 'damage', 'hurt'],
  enrage: ['enrage', 'rage', 'phase2'],
  death: ['death', 'die', 'destroy'],
});
export const BATTLE_GLB_CLIPS = Object.freeze(Object.fromEntries(
  Object.entries(aliases).map(([name, list]) => [name, Object.freeze([...list])])));

// Empty by design until actual artwork is reviewed. Changes here are
// per-asset calibration ONLY, not a modification to battle scene logic.
export const MODEL_VISUAL_OVERRIDES = Object.freeze({});

export function createEnemyBossModelContract(kind, id, size) {
  const overrides = MODEL_VISUAL_OVERRIDES[`${kind}:${id}`] || {};
  const position = overrides.position || { x: 0, y: 0.18, z: 0 };
  // Reviewed GLBs remain authored nose -Z. Convert them once into the shared
  // +Z-forward gameplay-root contract used by sprite/atlas presentation.
  const rotation = overrides.rotation || { x: 0, y: ENEMY_SOURCE_TO_ROOT_YAW_V26A4, z: 0 };
  const clips = Object.freeze(Object.fromEntries(Object.entries(BATTLE_GLB_CLIPS)
    .map(([state, names]) => [state, Object.freeze([...(overrides.clips?.[state] || names)])])));
  return Object.freeze({
    format: 'glb', version: 2, noseAxis: '-Z',
    targetSize: size, scale: overrides.scale || 1,
    fitToSize: overrides.fitToSize !== false,
    position: freezeVec(position), rotation: freezeVec(rotation), clips,
  });
}
