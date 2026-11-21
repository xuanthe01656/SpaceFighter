/**
 * C15 C2J/K - one deterministic 30Hz *hostile straight-line projectile* kernel
 * shared BY REFERENCE by DungeonScene and the Node server replay.
 * This is deliberately a narrow live-combat component, not an AI, armor,
 * player-weapon, boss, or complete battle simulator.
 * All coordinates are quantized at the shared boundary to 1e-4 world unit.
 */
export const C2JK_CORE_VERSION = 'c15-c2jk-shared-hostile-ballistic-fixed30-v1';
export const C2JK_HZ = 30;
export const C2JK_SUBSTEPS = 2; // original projectile velocity: world units / 60Hz frame
export const C2JK_MAX_TICKS = 270;
const STEP_MS = 1000 / C2JK_HZ;
const round = x => Math.round(x * 10000) / 10000;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const point = value => value && finite(value.x) && finite(value.z) &&
  Math.abs(value.x) <= 100 && Math.abs(value.z) <= 100;
const bad = code => { throw new TypeError(code); };
const allowedId = value => typeof value === 'string' &&
  /^[A-Za-z0-9_:./@-]{1,128}$/.test(value);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rounded = p => ({ x: round(p.x), z: round(p.z) });
const freeze = value => Object.freeze(value);

export function c2jkHash(value) {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function createC2JKFixedClock() {
  let tick = 0;
  let accumulatedMs = 0;
  return freeze({
    get tick() { return tick; },
    advance(deltaMs) {
      if (!finite(deltaMs) || deltaMs < 0 || deltaMs > 100)
        bad('C2JK_FRAME_DELTA_UNSUPPORTED');
      accumulatedMs += deltaMs;
      const ticks = [];
      while (accumulatedMs + 1e-9 >= STEP_MS) {
        if (ticks.length >= 3) bad('C2JK_FRAME_STEP_CAP');
        accumulatedMs -= STEP_MS;
        ticks.push(++tick);
      }
      return freeze(ticks);
    },
  });
}

export function createC2JKShot({ id, sourceId, spawnTick, origin, velocity,
  hitRadius, ttlTicks = 132 } = {}) {
  if (!allowedId(id) || !allowedId(sourceId) || !Number.isSafeInteger(spawnTick) ||
    spawnTick < 0 || spawnTick > 1000000 || !point(origin) || !point(velocity) ||
    !finite(hitRadius) || hitRadius < .1 || hitRadius > 4 ||
    !Number.isSafeInteger(ttlTicks) || ttlTicks < 1 || ttlTicks > 300)
    bad('C2JK_INVALID_SHOT');
  const speed = Math.hypot(velocity.x, velocity.z);
  if (!(speed > .01 && speed <= 1.5)) bad('C2JK_INVALID_SPEED');
  return freeze({ id, sourceId, spawnTick, x: round(origin.x), z: round(origin.z),
    vx: round(velocity.x), vz: round(velocity.z),
    hitRadius: round(hitRadius), ttlTicks, ageTicks: 0 });
}

function segmentCircle(a, b, c, r) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const denom = dx * dx + dz * dz;
  const t = denom > 1e-12 ? clamp(((c.x-a.x)*dx + (c.z-a.z)*dz)/denom, 0, 1) : 0;
  const missX = a.x + dx*t - c.x, missZ = a.z + dz*t - c.z;
  return missX*missX + missZ*missZ <= r*r + 1e-8;
}

/** Advance exactly ONE 30Hz tick with TWO 60Hz movement segments. */
export function stepC2JKShot(shot, player) {
  if (!shot || !allowedId(shot.id) || !point(player)) bad('C2JK_STEP_INVALID');
  if (shot.ageTicks >= shot.ttlTicks) bad('C2JK_STEP_AFTER_EXPIRY');
  let x = shot.x, z = shot.z, contact = false;
  for (let i = 0; i < C2JK_SUBSTEPS; i += 1) {
    const next = {x: round(x + shot.vx), z: round(z + shot.vz)};
    if (segmentCircle({x,z}, next, player, shot.hitRadius)) {
      x=next.x; z=next.z; contact=true; break;
    }
    x=next.x;z=next.z;
  }
  const next = freeze({...shot, x, z, ageTicks:shot.ageTicks+1});
  return freeze({next, contact,
    expired:!contact && next.ageTicks >= shot.ttlTicks});
}

/** Deterministic batch ordering is by shot ID; original Babylon shot ID retained. */
export function stepC2JKShots(shots, player) {
  if (!Array.isArray(shots) || shots.length > 128 || !point(player))
    bad('C2JK_BATCH_INVALID');
  const active = [], contacts = [], expired = [];
  const ids = new Set();
  for (const shot of [...shots].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (ids.has(shot.id)) bad('C2JK_DUPLICATE_SHOT');
    ids.add(shot.id);
    const step = stepC2JKShot(shot, player);
    if (step.contact) contacts.push(shot.id);
    else if (step.expired) expired.push(shot.id);
    else active.push(step.next);
  }
  const digest = c2jkHash(active.map(s=>[s.id,s.x,s.z,s.ageTicks]));
  return freeze({ active:freeze(active), contacts:freeze(contacts),
    expired:freeze(expired), stateDigest:digest });
}

export function isC2JKSupportedStraightShot(plan) {
  return !!plan && (plan.aimMode==='snapshot' || plan.aimMode==='predictive') &&
    (plan.guidanceMs || 0) === 0 &&
    finite(plan.speed) && plan.speed > 0;
}
