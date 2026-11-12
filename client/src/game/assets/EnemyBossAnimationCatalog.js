/**
 * 2.1.8-B1. Data-only animation contract for all Campaign/Dungeon enemies and bosses.
 * A production animated sprite atlas is a 4x4 transparent WebP: 16 equal-size cells,
 * ordered left-to-right, top-to-bottom. A static *_top.webp remains supported.
 * These frames change presentation ONLY. Damage, AI, timers and collisions remain
 * authoritative in the pre-existing battle meshes / scene logic.
 */
export const ENEMY_BOSS_ANIMATION_VERSION = '1.0.0';
export const ANIMATED_BATTLE_KINDS = Object.freeze(['enemy', 'boss', 'dungeon_enemy', 'dungeon_boss']);
export const BATTLE_ANIMATION_GRID = Object.freeze({ columns: 4, rows: 4 });
const clip = (frames, fps, options = {}) => Object.freeze({
  frames: Object.freeze([...frames]),
  fps,
  loop: Boolean(options.loop),
  durationMs: options.durationMs ?? 0,
});
export const BATTLE_ANIMATION_CLIPS = Object.freeze({
  spawn: clip([0, 1, 2], 10, { durationMs: 300 }),
  idle: clip([3, 4, 5, 6], 7, { loop: true }),
  move: clip([7, 8, 9, 10], 9, { loop: true }),
  attack: clip([11, 12], 12, { durationMs: 180 }),
  hit: clip([13], 10, { durationMs: 120 }),
  enrage: clip([14, 15], 8, { durationMs: 500 }),
  death: clip([15, 14, 13], 12, { durationMs: 250 }),
});

/**
 * Delivered Dungeon atlases reserve cells 0-2 as transparent lead-in cells.
 * The generic spawn clip therefore made a live collider/HP bar visible while
 * the aircraft art was fully transparent. Dungeon actors start on visible cells
 * 3-5 and retain the same idle/move/attack state vocabulary.
 */
export const DUNGEON_ATLAS_RESERVED_TRANSPARENT_FRAMES_V393 = Object.freeze([0, 1, 2]);
export const DUNGEON_BATTLE_ANIMATION_CLIPS_V393 = Object.freeze({
  spawn: clip([3, 4, 5], 10, { durationMs: 300 }),
  idle: clip([3, 4, 5, 6], 7, { loop: true }),
  move: clip([7, 8, 9, 10], 9, { loop: true }),
  attack: clip([11, 12], 12, { durationMs: 180 }),
  hit: clip([13], 10, { durationMs: 120 }),
  enrage: clip([14, 15], 8, { durationMs: 500 }),
  death: clip([15, 14, 13], 12, { durationMs: 250 }),
});
export const BATTLE_ANIMATION_STATES = Object.freeze(Object.keys(BATTLE_ANIMATION_CLIPS));
export const BATTLE_TRANSIENT_STATES = Object.freeze(['spawn', 'attack', 'hit', 'enrage']);
export const isAnimatedBattleKind = kind => ANIMATED_BATTLE_KINDS.includes(kind);

export function validateBattleAtlasContract(grid = BATTLE_ANIMATION_GRID, clips = BATTLE_ANIMATION_CLIPS) {
  if (!Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) || grid.columns < 1 || grid.rows < 1) return false;
  return Object.entries(clips).every(([name, c]) => BATTLE_ANIMATION_STATES.includes(name)
    && c.frames.length > 0 && c.fps > 0 && c.frames.every(f => Number.isInteger(f) && f >= 0 && f < grid.columns * grid.rows));
}

/** Independent sprite instance UVs; NEVER mutate shared texture.uOffset/vOffset. */
export function battleAtlasUV(frame, grid = BATTLE_ANIMATION_GRID) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= grid.columns * grid.rows) throw new RangeError('Invalid atlas frame');
  const col = frame % grid.columns;
  const row = Math.floor(frame / grid.columns);
  const u0 = col / grid.columns, u1 = (col + 1) / grid.columns;
  const v0 = 1 - (row + 1) / grid.rows, v1 = 1 - row / grid.rows;
  return [u0, v0, u1, v0, u1, v1, u0, v1];
}

/** Pure, time-based animation state machine. No DOM, Babylon or Firebase access. */
export function createBattleVisualAnimator(clips = BATTLE_ANIMATION_CLIPS) {
  let state = 'spawn', elapsedMs = 0, lastFrame = -1, disposed = false;
  let restingState = 'idle';
  const hold = s => (clips[s]?.durationMs ?? 0) > 0;
  const priority = s => ({ death: 5, hit: 4, enrage: 3, attack: 2, spawn: 1, idle: 0, move: 0 })[s] ?? -1;
  const selectFrame = () => {
    const c = clips[state];
    if (!c) return -1;
    const raw = Math.floor(elapsedMs * c.fps / 1000);
    return c.frames[c.loop ? raw % c.frames.length : Math.min(raw, c.frames.length - 1)];
  };
  const setState = next => {
    if (disposed || !clips[next] || state === 'death') return false;
    if (next === 'move' || next === 'idle') {
      restingState = next;
      if (hold(state)) return false;
    } else if (hold(state) && priority(next) < priority(state)) return false;
    if (state === next && hold(state)) return false;
    if (state === next) return true;
    state = next;
    elapsedMs = 0;
    lastFrame = -1;
    return true;
  };
  const tick = deltaMs => {
    if (disposed) return null;
    // Bound recovered frames after a background tab was paused.
    const dt = Math.max(0, Math.min(100, Number.isFinite(deltaMs) ? deltaMs : 0));
    elapsedMs += dt;
    const duration = clips[state]?.durationMs || 0;
    if (duration && elapsedMs >= duration && state !== 'death') {
      state = restingState;
      elapsedMs = 0;
      lastFrame = -1;
    }
    const frame = selectFrame();
    if (frame === lastFrame) return null;
    lastFrame = frame;
    return frame;
  };
  return Object.freeze({
    setState, tick,
    get state() { return state; },
    get frame() { return lastFrame; },
    dispose() { disposed = true; },
  });
}
