/**
 * One catalog-driven projectile policy for Campaign and Dungeon.
 * Numerical paths are pure and covered by Node tests; Babylon graphics is
 * only an adapter. Rewards/mission progress remain server-authoritative.
 * Speeds are Babylon world units per 60Hz frame.
 */
import { scaledLerpFactor } from '../../utils/frameTime.js';

const max = Math.max;
const normalize = (vx, vz, speed = 0.85) => {
  const magnitude = Math.hypot(vx, vz);
  return magnitude < .0001 ? { vx: 0, vz: -speed } : { vx: vx / magnitude * speed, vz: vz / magnitude * speed };
};
const colorNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : 0x00e5ff;

/** Closest live target; works with both scene enemy formats and optional bosses. */
export function pickWeaponTarget(enemies, origin) {
  let best = null;
  let bestDistance = Infinity;
  for (const e of enemies) {
    const mesh = e?.mesh;
    if (!mesh || e._dead || mesh.isDisposed?.() || !mesh.position) continue;
    const dx = mesh.position.x - origin.x, dz = mesh.position.z - origin.z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) { best = e; bestDistance = distance; }
  }
  return best;
}

function makeShot(x, z, vx, vz, atk, opts = {}) {
  return {
    x, z, vx, vz, atk: max(0, Number(atk) || 0),
    color: colorNumber(opts.color),
    projectileType: opts.projectileType || 'laser',
    homing: Boolean(opts.homing), target: opts.target || null,
    penetration: opts.penetration || 1,
    splashRadius: opts.splashRadius || 0,
    slowMs: opts.slowMs || 0,
    waveAmplitude: opts.waveAmplitude || 0,
    visualScale: opts.visualScale || 1,
    delayMs: opts.delayMs || 0,
    kind: opts.kind || 'main',
  };
}

/** Build the same salvo regardless of battle mode. No mutations. */
export function describeMainSalvo(weapon, origin, atk, target = null) {
  const pattern = weapon?.firePattern || 'single';
  const x = origin.x;
  const z = origin.z - 1.2;
  const color = colorNumber(weapon?.color);
  const projectileType = weapon?.projectileType || 'laser';
  const base = { color, projectileType, kind: 'main' };
  const shot = (dx = 0, dz = 0, vx = 0, vz = -0.85, factor = 1, options = {}) =>
    makeShot(x + dx, z + dz, vx, vz, atk * factor, { ...base, ...options });
  switch (pattern) {
    case 'beam':
      // Repeated elongated laser pulses at catalog cadence; no separate aim key.
      return [shot(0, 0, 0, -1.15, 1, { visualScale: 1.7 })];
    case 'spread3':
      return [shot(0, 0, 0, -.85), shot(-.35, .15, -.22, -.82, .88), shot(.35, .15, .22, -.82, .88)];
    case 'spread5':
      return [-2, -1, 0, 1, 2].map(i => shot(i * .18, .12, i * .16, -.85, .68, { visualScale: .85 }));
    case 'shotgun':
      return [-3, -2, -1, 0, 1, 2, 3].map(i => shot(i * .12, .08, i * .18, -.86, .43, { visualScale: 1.12 }));
    case 'homing':
      return [shot(0, 0, 0, -.78, 1, { homing: true, target })];
    case 'pierce':
      return [shot(0, 0, 0, -1.35, 1, { penetration: 3, visualScale: 1.8 })];
    case 'burst':
      return [0, 90, 180].map(delayMs => shot(0, 0, 0, -.95, .52, { delayMs, visualScale: .82 }));
    case 'explosive':
      return [shot(0, 0, 0, -.66, 1, { splashRadius: 2.6, visualScale: 1.5 })];
    case 'wave':
      return [shot(-.15, 0, 0, -.85, .76, { waveAmplitude: .46 }),
        shot(.15, 0, 0, -.85, .76, { waveAmplitude: -.46 })];
    case 'charge':
      // Both existing modes are auto-fire: fire one larger charged shot each cooldown.
      return [shot(0, 0, 0, -.72, 1.8, { visualScale: 2.4, penetration: 2 })];
    case 'single':
    default:
      return [shot(0, 0, 0, weapon?.projectileType === 'plasma' ? -.63 : -.85, 1,
        projectileType === 'ion' ? { slowMs: 1500, visualScale: 1.3 } : {})];
  }
}

/** Wingman projectiles spawn at their visual mounts, not hard-coded scene offsets. */
export function describeWingSalvo(wing, positions, atk, target = null) {
  if (!wing || !Array.isArray(positions)) return [];
  const color = colorNumber(wing.color);
  const behavior = wing.behavior || 'homing';
  return positions.flatMap(({ x, z }) => {
    const originZ = z - .75;
    const base = { color, projectileType: 'rocket', kind: 'wing', homing: behavior === 'homing' || behavior === 'swarm', target,
      slowMs: behavior === 'emp' ? 1800 : 0, visualScale: behavior === 'straight' ? 1.4 : 1 };
    if (behavior === 'swarm') {
      return [-1, 0, 1].map(i => makeShot(x + i * .12, originZ, i * .13, -.75, atk * .48, { ...base, visualScale: .7 }));
    }
    return [makeShot(x, originZ, 0, behavior === 'straight' ? -1.0 : -.78, atk, base)];
  });
}

/** Shield and repair are handled by the shared passive helper, never fired. */
export function describeDroneSalvo(drone, positions, atk, target = null) {
  if (!drone || !Array.isArray(positions) || ['shield', 'repair'].includes(drone.behavior)) return [];
  const behavior = drone.behavior || 'sniper';
  const color = colorNumber(drone.color);
  const projectileType = drone.projectileType || 'laser';
  return positions.flatMap(({ x, z }) => {
    const base = { color, projectileType, kind: 'drone', target: null,
      slowMs: behavior === 'emp' ? 2200 : 0,
      splashRadius: behavior === 'bomber' ? 2.4 : 0 };
    const aim = target?.mesh?.position
      ? normalize(target.mesh.position.x - x, target.mesh.position.z - z, behavior === 'sniper' ? 1.15 : .85)
      : { vx: 0, vz: -.85 };
    if (behavior === 'swarm') return [-1, 0, 1].map(i => makeShot(x, z - .25, aim.vx + i * .15, aim.vz, atk * .46, { ...base, visualScale: .70 }));
    return [makeShot(x, z - .25, aim.vx, aim.vz, atk, {
      ...base, visualScale: behavior === 'bomber' ? 1.4 : 1.0,
    })];
  });
}

/** Move a projectile by the same ballistic rules in both scenes. */
export function advancePlayerProjectile(b, frameFactor = 1) {
  if (!Number.isFinite(frameFactor) || frameFactor <= 0) return;
  const t = b.target;
  if (b.isHoming && t?.mesh?.position && !t._dead && !t.mesh.isDisposed?.()) {
    const dx = t.mesh.position.x - b.position.x, dz = t.mesh.position.z - b.position.z;
    const speed = Math.hypot(b._vx, b._vz) || .78;
    const desired = normalize(dx, dz, speed);
    const alpha = scaledLerpFactor(.11, frameFactor);
    b._vx += (desired.vx - b._vx) * alpha;
    b._vz += (desired.vz - b._vz) * alpha;
  }
  b.position.x += b._vx * frameFactor;
  b.position.z += b._vz * frameFactor;
  if (b._waveAmplitude) {
    const previous = b._wavePhase || 0;
    const next = previous + .18 * frameFactor;
    b.position.x += b._waveAmplitude * (Math.sin(next) - Math.sin(previous));
    b._wavePhase = next;
  }
}

/** Allows one hit per enemy per bullet; piercing bullets survive up to N unique hits. */
export function registerProjectileHit(bullet, targetKey) {
  const key = String(targetKey);
  if (!bullet._hitKeys) bullet._hitKeys = new Set();
  if (bullet._hitKeys.has(key)) return { accepted: false, consumed: false };
  bullet._hitKeys.add(key);
  bullet._remainingPenetration = max(0, (bullet._remainingPenetration ?? 1) - 1);
  return { accepted: true, consumed: bullet._remainingPenetration === 0 };
}

export function projectileHitsPoint(b, point, radius = 1.5) {
  const dx = b.position.x - point.x, dz = b.position.z - point.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function enemySpeedFactor(enemy, timestamp) {
  return enemy?._slowUntil > timestamp ? .65 : 1;
}

export function shieldDamageFactor(drone) {
  return drone?.behavior === 'shield' ? .8 : 1;
}

export function repairAmount(drone, maxHp) {
  return drone?.behavior === 'repair' ? max(1, Math.round(maxHp * .025)) : 0;
}
