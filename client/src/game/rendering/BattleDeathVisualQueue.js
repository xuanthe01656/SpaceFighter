/**
 * Graphics 2.1.8-B2.1 - bounded, presentation-only death visual queue.
 *
 * A dying Enemy/Boss is removed from gameplay immediately by its battle scene.
 * Only its already loaded sprite mesh is detached, kept non-interactive for the
 * atlas death clip, then disposed. No setTimeout, no replacement collision root,
 * no extra texture download, and no changes to combat/reward authority.
 */
export const BATTLE_DEATH_MAX_VISUALS = 32;
export const BATTLE_DEATH_MAX_DURATION_MS = 600;

const sceneDisposed = scene => typeof scene?.isDisposed === 'function'
  ? scene.isDisposed() : Boolean(scene?.isDisposed);

export function createBattleDeathVisualQueue(scene, { maxActive = BATTLE_DEATH_MAX_VISUALS } = {}) {
  const capacity = Number.isInteger(maxActive)
    ? Math.min(BATTLE_DEATH_MAX_VISUALS, Math.max(1, maxActive))
    : BATTLE_DEATH_MAX_VISUALS;
  const active = [];
  let disposed = false;
  let observer = null;

  const update = () => {
    if (disposed || sceneDisposed(scene)) return;
    const engine = scene?.getEngine?.();
    const rawDelta = engine?.getDeltaTime?.();
    // Sprite animator clamps to 100ms, so the lifetime clock uses that cap too.
    const deltaMs = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, 100)) : 16.67;
    for (let i = active.length - 1; i >= 0; --i) {
      const entry = active[i];
      entry.visual.tick(deltaMs);
      entry.elapsedMs += deltaMs;
      if (entry.elapsedMs < entry.durationMs && !entry.visual.isDisposed) continue;
      entry.visual.dispose();
      active.splice(i, 1);
    }
  };
  observer = scene?.onBeforeRenderObservable?.add?.(update) ?? null;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (observer) scene?.onBeforeRenderObservable?.remove?.(observer);
    for (const entry of active) entry.visual.dispose();
    active.length = 0;
  };
  scene?.onDisposeObservable?.addOnce?.(dispose);

  /** Capture art BEFORE the battle scene disposes its original collision mesh. */
  const capture = visual => {
    if (disposed || sceneDisposed(scene)) { visual?.dispose?.(); return false; }
    const detached = visual?.detachForDeath?.();
    if (!detached) { visual?.dispose?.(); return false; }
    if (active.length >= capacity) active.shift().visual.dispose();
    const requested = Number(detached.durationMs);
    const durationMs = Number.isFinite(requested)
      ? Math.max(1, Math.min(BATTLE_DEATH_MAX_DURATION_MS, requested)) : 250;
    active.push({ visual: detached, elapsedMs: 0, durationMs });
    return true;
  };
  return Object.freeze({ capture, dispose, get activeCount() { return active.length; }, get isDisposed() { return disposed; } });
}
