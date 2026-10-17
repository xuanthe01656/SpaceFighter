/**
 * Visual-only player VFX rules. These are deliberately independent from
 * damage, fire cadence, hit detection, wallet and server-side battle state.
 * Both Campaign and Dungeon must use these same values.
 */
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function projectileFxProfile(shot = {}) {
  const type = shot.projectileType || 'laser';
  const isOrb = ['plasma', 'neutron', 'bomb', 'charge', 'emp'].includes(type);
  const scale = clamp(Number.isFinite(Number(shot.visualScale)) ? Number(shot.visualScale) : 1, 0.45, 2.8);
  const profiles = {
    laser: [0.44, 0.88], rail: [0.38, 1.20], pulse: [0.50, 0.86], ion: [0.48, 0.91],
    photon: [0.48, 0.85], rocket: [0.46, 1.03], swarm: [0.43, 0.75],
    plasma: [0.68, 0.68], neutron: [0.78, 0.78], bomb: [0.78, 0.78],
    charge: [0.82, 0.82], emp: [0.74, 0.74],
  };
  const [width, length] = profiles[type] || profiles.laser;
  // The starter 'beam' salvo uses visualScale=1.7. Cap *visual* length only:
  // previous 2.635 world-unit cylinder occupied ~86px on a 980px mobile screen.
  const visualMultiplier = isOrb ? scale : Math.min(1.3, scale);
  const color = Number.isFinite(shot.color) ? (shot.color & 0xffffff) : 0x00e5ff;
  return Object.freeze({
    type, style: isOrb ? 'orb' : 'bolt', color,
    width: width * visualMultiplier, length: length * visualMultiplier,
    textureKey: `${isOrb ? 'orb' : 'bolt'}:${color.toString(16)}`,
    hasContrastBorder: true,
  });
}

// Upper bound on Babylon particle emitters per ship. Multiple nozzles share
// the SAME particle/texture budget so low-end devices do not scale costs with N.
export const MAX_ENGINE_MOUNTS = 6;

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const engineOffset = (raw) => Object.freeze({
  x: clamp(finite(raw?.x), -8, 8),
  y: clamp(finite(raw?.y), -8, 8),
  z: clamp(finite(raw?.z, 1.1), -8, 8),
});

export function thrusterFxProfile(aircraft = {}, quality = {}) {
  const fallbackOffset = engineOffset(aircraft.engineOffset || { x: 0, y: 0, z: 1.1 });
  const scale = clamp(finite(aircraft.engineFlameScale, 1) || 1, 0.35, 3);
  const tint = Number.isInteger(aircraft.engineFlameTint) ? aircraft.engineFlameTint & 0xffffff : 0x38bdf8;
  const particleFraction = clamp(finite(quality.particleFraction, 1) || 1, .2, 1);
  const sourceMounts = Array.isArray(aircraft.engineMounts) ? aircraft.engineMounts : [];
  // Invalid optional mounts are ignored, then the legacy offset is used.
  const ids = new Set();
  const mounts = sourceMounts.filter(m => {
    if (!m || typeof m.id !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(m.id) ||
        !m.offset || !['x','y','z'].every(k => Number.isFinite(m.offset[k])) || ids.has(m.id)) return false;
    ids.add(m.id);
    return true;
  }).slice(0, MAX_ENGINE_MOUNTS)
    .map(m => Object.freeze({
      id: m.id,
      offset: engineOffset(m.offset),
      scale: clamp(finite(m.scale, 1), .35, 2.5),
      tint: Number.isInteger(m.tint) ? m.tint & 0xffffff : tint,
    }));
  const normalizedMounts = Object.freeze(mounts.length ? mounts : [Object.freeze({
    id: 'main', offset: fallbackOffset, scale: 1, tint,
  })]);
  return Object.freeze({
    // Keep `offset` for callers/tests relying on the single-engine API.
    offset: normalizedMounts[0].offset,
    mounts: normalizedMounts,
    scale, tint, particleFraction,
    // These are TOTAL ship budgets, not per-nozzle budgets.
    coreCapacity: Math.max(24, Math.round(110 * particleFraction)),
    coreEmitRate: Math.round(100 * particleFraction),
    rimCapacity: Math.max(16, Math.round(65 * particleFraction)),
    rimEmitRate: Math.round(42 * particleFraction),
    directionZ: 1, // +Z is always the rear of the ship in top-down battles.
  });
}
