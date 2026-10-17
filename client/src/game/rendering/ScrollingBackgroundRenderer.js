import {
  BACKGROUND_SCROLL_DIRECTIONS,
  resolveBackgroundAssetUrl,
  selectBackgroundLayers,
} from '../catalog/BackgroundCatalog.js';

/**
 * Orthographic 'cover': preserve pixel aspect and crop the surplus axis.
 * Texture dimensions are authoring metadata; display/resolution are independent.
 */
export function backgroundCoverUV(imageWidth, imageHeight, viewportWidth, viewportHeight) {
  const imageAspect = Math.max(1, imageWidth) / Math.max(1, imageHeight);
  const viewAspect = Math.max(1, viewportWidth) / Math.max(1, viewportHeight);
  const uScale = Math.min(1, viewAspect / imageAspect);
  const vScale = Math.min(1, imageAspect / viewAspect);
  return {
    uScale, vScale,
    uOffset: (1 - uScale) / 2,
    vOffset: (1 - vScale) / 2,
  };
}

/** Legacy v1.0 API: kept for any existing callers and tests. */
export function advanceBackgroundUV(previous, deltaMilliseconds, cyclesPerSecond) {
  const elapsed = Math.max(0, Math.min(100, Number(deltaMilliseconds) || 0));
  const speed = Math.max(0, Math.min(.25, Number(cyclesPerSecond) || 0));
  return ((Number(previous) || 0) + elapsed * .001 * speed) % 1;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapUnit = value => ((value % 1) + 1) % 1;

/**
 * Artwork parallax in CSS px/sec, not framebuffer pixels or gameplay time.
 * Based on the 2.1.7-BG.1 QA video, positive V UV offsets move scenery UP on
 * the top-down ground plane. Negative offsets move scenery DOWN toward player.
 * No difference at 30/60/120 FPS or when adaptive DPR changes GPU resolution.
 */
export function advanceBackgroundScroll(
  previous, deltaMilliseconds, speedCssPixelsPerSecond,
  viewportCssHeight, visibleTextureVScale, direction = BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER,
) {
  if (direction === BACKGROUND_SCROLL_DIRECTIONS.STATIC) return wrapUnit(Number(previous) || 0);
  const dir = direction === BACKGROUND_SCROLL_DIRECTIONS.AWAY_FROM_PLAYER ? 1 : -1;
  const dt = clamp(Number(deltaMilliseconds) || 0, 0, 100) / 1000;
  const speed = clamp(Number(speedCssPixelsPerSecond) || 0, 0, 300);
  const cssHeight = Math.max(1, Number(viewportCssHeight) || 1);
  const vScale = clamp(Number(visibleTextureVScale) || 1, 0.00001, 1);
  return wrapUnit((Number(previous) || 0) + dir * speed * dt * vScale / cssHeight);
}

function canvasSizeCss(engine) {
  const bounds = engine.getRenderingCanvas?.()?.getBoundingClientRect?.();
  // A CSS canvas keeps its size while the GPU framebuffer is adaptively scaled.
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (width > 0 && height > 0) return { width, height };
  return {
    width: Math.max(1, Number(engine.getRenderWidth?.()) || 1),
    height: Math.max(1, Number(engine.getRenderHeight?.()) || 1),
  };
}

/**
 * Minimal Babylon background, separate from enemy/hitbox/world modifiers.
 * - 1 non-pickable ground and texture per enabled layer (1 on current demos).
 * - Missing optional overlay only disables that overlay; missing BASE triggers
 *   exactly one legacy fallback.
 * - No white mesh while the image is loading; scene fallback colour stays.
 * - All mesh/material/texture/observer resources are disposed with the scene.
 * - Requires an image with matching top/bottom edges for visual seamlessness;
 *   `wrapV=REPEAT` alone cannot hide a non-seamless piece of artwork.
 */
export function createScrollingBattleBackground({
  BABYLON, scene, engine, config, qualityId = 'desktop',
  worldHalfHeight, baseUrl = '/', onFallback = null,
}) {
  if (!BABYLON || !scene || !engine || !config) throw new Error('INVALID_BATTLE_BACKGROUND_ARGS');
  const layers = selectBackgroundLayers(config, qualityId);
  const entries = [];
  const errors = [];
  let disposed = false;
  let failed = false;
  let loadingTimeMs = 0;
  let renderObserver = null;
  let resizeObserver = null;
  let disposeObserver = null;
  let cssHeight = 1;

  const doFallback = (reason = 'base-unavailable') => {
    if (disposed || failed) return;
    failed = true;
    errors.push(reason);
    for (const e of entries) e.mesh.setEnabled?.(false);
    if (typeof onFallback === 'function') onFallback();
  };

  for (const [i, layer] of layers.entries()) {
    const url = resolveBackgroundAssetUrl(layer.src, baseUrl);
    if (!url) { doFallback('invalid-asset-url'); break; }
    const mesh = BABYLON.MeshBuilder.CreateGround(`battleBg_${config.id}_${layer.id}`, {
      width: 1, height: 1, subdivisions: 1,
    }, scene);
    mesh.position.y = -3.5 + i * .002;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 0;
    const mat = new BABYLON.StandardMaterial(`battleBgMat_${config.id}_${layer.id}`, scene);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    // Babylon 9 adds the uniform emissiveColor to the emissive texture. White
    // here washes out all artwork; only the image should emit light.
    mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
    const opacity = Number(layer.opacity);
    mat.alpha = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1;
    mesh.material = mat;
    mesh.setEnabled(false); // hidden until actual WebP load completes
    const entry = {
      mesh, mat, texture: null, layer, url, offset: 0,
      visibleVScale: 1, cropVOffset: 0, ready: false, error: null,
    };
    entries.push(entry);
    const texture = new BABYLON.Texture(
      url, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      () => {
        if (disposed || failed || entry.error) return;
        entry.ready = true;
        entry.mesh.setEnabled(true);
      },
      message => {
        if (disposed || failed || entry.error) return;
        entry.error = message || 'decode/load error';
        console.warn('[ScrollingBackgroundRenderer] BACKGROUND_TEXTURE_FAILED', url, entry.error);
        if (layer.role === 'base') doFallback('base-image-failed');
        else {
          errors.push(`optional-layer-failed:${layer.id}`);
          entry.mesh.setEnabled(false);
        }
      },
    );
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    texture.hasAlpha = layer.role !== 'base';
    mat.emissiveTexture = texture;
    if (texture.hasAlpha) {
      mat.diffuseTexture = texture;
      mat.useAlphaFromDiffuseTexture = true;
    }
    entry.texture = texture;
  }
  if (!layers.length) doFallback('no-layers');

  const resize = () => {
    if (disposed || failed) return;
    const w = Math.max(1, Number(engine.getRenderWidth?.()) || 1);
    const h = Math.max(1, Number(engine.getRenderHeight?.()) || 1);
    cssHeight = canvasSizeCss(engine).height;
    for (const e of entries) {
      if (!e.texture) continue;
      const worldHeight = Math.max(.01, 2 * (Number(worldHalfHeight) || 15));
      const worldWidth = worldHeight * (w / h);
      e.mesh.scaling.x = worldWidth * 1.01;
      e.mesh.scaling.z = worldHeight * 1.01;
      const uv = backgroundCoverUV(e.layer.imageWidth, e.layer.imageHeight, w, h);
      e.texture.uScale = uv.uScale;
      e.texture.vScale = uv.vScale;
      e.texture.uOffset = uv.uOffset;
      e.visibleVScale = uv.vScale;
      e.cropVOffset = uv.vOffset;
      e.texture.vOffset = wrapUnit(e.cropVOffset + e.offset);
    }
  };
  resize();
  resizeObserver = engine.onResizeObservable?.add(resize);
  renderObserver = scene.onBeforeRenderObservable.add(() => {
    if (disposed || failed) return;
    const dt = Math.max(0, Math.min(100, Number(engine.getDeltaTime?.()) || 16.667));
    if (!entries[0]?.ready) {
      loadingTimeMs += dt;
      const timeout = clamp(Number(config.loadTimeoutMs) || 15000, 3000, 60000);
      if (loadingTimeMs >= timeout) doFallback('base-image-timeout');
      return;
    }
    for (const e of entries) {
      if (!e.ready || !e.texture || e.error) continue;
      const direction = e.layer.scrollDirection || config.scrollDirection || BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER;
      if (Number.isFinite(Number(e.layer.scrollCssPixelsPerSecond))) {
        e.offset = advanceBackgroundScroll(
          e.offset, dt, e.layer.scrollCssPixelsPerSecond, cssHeight, e.visibleVScale, direction,
        );
      } else {
        // Support catalogs authored before BG.2, with a signed scroll direction.
        const sign = direction === BACKGROUND_SCROLL_DIRECTIONS.STATIC ? 0
          : direction === BACKGROUND_SCROLL_DIRECTIONS.AWAY_FROM_PLAYER ? 1 : -1;
        e.offset = wrapUnit(e.offset + sign * clamp(Number(e.layer.scrollCyclesPerSecond) || 0, 0, .25) * dt / 1000);
      }
      e.texture.vOffset = wrapUnit(e.cropVOffset + e.offset);
    }
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (renderObserver) scene.onBeforeRenderObservable.remove(renderObserver);
    if (resizeObserver) engine.onResizeObservable?.remove(resizeObserver);
    if (disposeObserver) scene.onDisposeObservable.remove(disposeObserver);
    for (const e of entries) {
      e.mesh.dispose?.();
      e.mat.dispose?.(false, false);
      e.texture?.dispose?.();
    }
  };
  disposeObserver = scene.onDisposeObservable.add(dispose);
  return {
    dispose,
    getStats: () => ({
      id: config.id, layers: entries.length, loaded: entries.filter(e => e.ready).length,
      fallback: failed, disposed, errors: [...errors], cssHeight,
      direction: config.scrollDirection || BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER,
      scrollOffsets: entries.map(e => ({ id: e.layer.id, v: e.offset, ready: e.ready })),
    }),
  };
}
