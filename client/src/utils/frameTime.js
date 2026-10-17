/** Reference speed for source-authored movements is 60 FPS.
 * Clamp one frame to prevent a large physics jump after a background tab resumes.
 * This is a visual/gameplay normalization, NOT trusted proof of battle outcome.
 */
export function frameScale(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 1;
  return Math.min(2.5, deltaMs / (1000 / 60));
}

/** Make a per-frame interpolation stable across 30/60/120 FPS. */
export function scaledLerpFactor(alphaAt60Fps, frameFactor) {
  const alpha = Math.max(0, Math.min(1, alphaAt60Fps));
  return 1 - Math.pow(1 - alpha, frameFactor);
}
