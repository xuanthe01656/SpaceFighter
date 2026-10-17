/**
 * Campaign/Dungeon Babylon GUI is measured in CSS pixels, independently of
 * WebGL framebuffer resolution. This preserves the original compact mobile
 * HUD while adaptive render quality changes hardwareScalingLevel.
 *
 * ADT.idealWidth rescales all pixel-based GUI controls automatically when its
 * render texture changes size. Do not additionally multiply UI measurements
 * by window.devicePixelRatio (that would double-scale the HUD).
 */
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;

export function measureBattleHud(engine, canvas, ui) {
  const rect = canvas?.getBoundingClientRect?.();
  const cssW = positive(rect?.width)
    || positive(canvas?.clientWidth)
    || positive(typeof window !== 'undefined' ? window.innerWidth : 0)
    || positive(engine?.getRenderWidth?.()) || 1;
  const cssH = positive(rect?.height)
    || positive(canvas?.clientHeight)
    || positive(typeof window !== 'undefined' ? window.innerHeight : 0)
    || positive(engine?.getRenderHeight?.()) || 1;
  const w = positive(engine?.getRenderWidth?.()) || cssW;
  const scale = w / cssW;
  // The ADT uses this CSS width as its ideal logical resolution. Its internal
  // idealRatio will follow the WebGL resolution automatically, including FPS
  // driven dynamic quality changes and device rotation / browser resizing.
  if (ui && ui.idealWidth !== cssW) ui.idealWidth = cssW;
  return {
    cssW,
    cssH,
    w,
    cx: w / 2,
    h1: 35 * scale,
    h2: 65 * scale,
    dx1: 90 * scale,
    dx2: 70 * scale,
    stroke: 2.5 * scale,
    scale,
  };
}
