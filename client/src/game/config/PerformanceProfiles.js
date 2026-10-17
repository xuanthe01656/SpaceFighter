/** Graphics quality only; never modify combat stats, outcomes or rewards. */
export const PERFORMANCE_PRESETS = Object.freeze({
  desktop: Object.freeze({ id: 'desktop', targetFps: 60, maxPixelRatio: 1.5,
    maxScaleLevel: 2.0, starFraction: 1, particleFraction: 1, glow: true,
    maxModelBytes: 8 * 1024 * 1024 }),
  mobile: Object.freeze({ id: 'mobile', targetFps: 60, maxPixelRatio: 1.25,
    maxScaleLevel: 2.0, starFraction: 0.65, particleFraction: 0.65, glow: true,
    maxModelBytes: 3 * 1024 * 1024 }),
  mobileLow: Object.freeze({ id: 'mobileLow', targetFps: 30, maxPixelRatio: 1,
    maxScaleLevel: 2.2, starFraction: 0.4, particleFraction: 0.4, glow: false,
    maxModelBytes: 1 * 1024 * 1024 }),
});
const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i;
export function choosePerformancePreset({ userAgent = '', deviceMemory = null, hardwareConcurrency = null } = {}) {
  if (!mobileUA.test(userAgent)) return PERFORMANCE_PRESETS.desktop;
  if ((Number(deviceMemory) > 0 && Number(deviceMemory) <= 4)
    || (Number(hardwareConcurrency) > 0 && Number(hardwareConcurrency) <= 4)) return PERFORMANCE_PRESETS.mobileLow;
  return PERFORMANCE_PRESETS.mobile;
}
export function canAutoLoadModel(modelBytes, profile) {
  return Number.isFinite(modelBytes) && modelBytes > 0 && modelBytes <= (profile?.maxModelBytes ?? 0);
}
/**
 * Render-quality controller; observes FPS over 2+ second windows. Hysteresis
 * avoids oscillation. Paused/background frames are ignored. No gameplay tick
 * or input timings are changed. Caller must dispose when battle unmounts.
 */
export function attachAdaptiveRenderQuality(engine, scene, profile, devicePixelRatio = 1) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const baseScale = 1 / Math.min(ratio, profile.maxPixelRatio);
  let scale = baseScale, frames = 0, totalMs = 0, weakWindows = 0, goodWindows = 0;
  engine.setHardwareScalingLevel?.(scale);
  engine.resize?.();
  const observer = scene.onAfterRenderObservable.add(() => {
    const delta = Number(engine.getDeltaTime?.() || 16.67);
    if (delta < 4 || delta > 150) return;
    totalMs += delta; frames++;
    if (totalMs < 2500) return;
    const fps = frames / (totalMs / 1000);
    frames = 0; totalMs = 0;
    weakWindows = fps < profile.targetFps * .78 ? weakWindows + 1 : 0;
    goodWindows = fps > profile.targetFps * .95 ? goodWindows + 1 : 0;
    if (weakWindows >= 2) {
      scale = Math.min(profile.maxScaleLevel, Math.round(scale * 1.15 * 1000) / 1000);
      weakWindows = 0;
    } else if (goodWindows >= 4 && scale > baseScale) {
      scale = Math.max(baseScale, Math.round(scale / 1.08 * 1000) / 1000);
      goodWindows = 0;
    } else return;
    engine.setHardwareScalingLevel?.(scale);
    engine.resize?.();
  });
  return { profile, dispose: () => scene.onAfterRenderObservable.remove(observer), getScale: () => scale };
}
