/**
 * Space Fighter Graphics 2.1.8-B1: shared Enemy/Boss presentation adapter.
 * Roots owned by Campaign/Dungeon still control movement, collision, AI and HP.
 * Art loading, animation frames and sockets never change root transforms.
 *
 * Assets: GLB (desktop/budgeted) -> *_sheet.webp (4x4 atlas) -> *_top.webp -> procedural.
 * Every network path must first be present in AssetAvailability.generated.js.
 */
import { resolveAssetVisual } from '../assets/AssetRegistry.js';
import { battleAtlasUV, createBattleVisualAnimator } from '../assets/EnemyBossAnimationCatalog.js';
import { createBattleGLBVisual } from './BattleGLBVisual.js';
import { ENEMY_SOURCE_TO_ROOT_YAW_V26A4 } from '../assets/EnemyVisualHeadingV26A4.js';

const sceneCaches = new WeakMap();
const sceneDisposed = scene => typeof scene.isDisposed === 'function'
  ? scene.isDisposed() : Boolean(scene.isDisposed);

function materialFor(scene, BABYLON, src) {
  let cache = sceneCaches.get(scene);
  if (!cache) {
    cache = new Map();
    sceneCaches.set(scene, cache);
    scene.onDisposeObservable?.addOnce?.(() => { cache.clear(); sceneCaches.delete(scene); });
  }
  if (cache.has(src)) return cache.get(src);
  const record = { material: null, loaded: false, failed: false, listeners: new Set() };
  const mat = new BABYLON.StandardMaterial(`art:${src}`, scene);
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
  mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  const notify = () => {
    for (const fn of record.listeners) fn(record.loaded);
    record.listeners.clear();
  };
  const texture = new BABYLON.Texture(src, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    () => { record.loaded = true; notify(); },
    () => { record.failed = true; notify(); });
  texture.hasAlpha = true;
  mat.diffuseTexture = texture;
  mat.emissiveTexture = texture;
  mat.useAlphaFromDiffuseTexture = true;
  record.material = mat;
  cache.set(src, record);
  return record;
}


const waitForMaterialRecord = record => new Promise(resolve => {
  if (!record) { resolve(false); return; }
  if (record.loaded) { resolve(true); return; }
  if (record.failed) { resolve(false); return; }
  const listener = ok => resolve(Boolean(ok));
  record.listeners.add(listener);
});

/**
 * Preload atlas/static battle art through the same scene cache used by
 * attachBattleEntityVisual.  Spawners may wait for this promise (with their own
 * timeout) so the first actor of each kind does not briefly expose procedural
 * geometry while its local atlas is still decoding.
 */
export async function preloadBattleEntityVisualProfiles(scene, BABYLON, profiles = []) {
  const unique = new Map();
  for (const profile of profiles || []) {
    if (!profile?.assetId) continue;
    unique.set(profile.assetId, profile);
  }
  const results = await Promise.all([...unique.values()].map(async profile => {
    const sources = [...new Set([profile.atlasSrc, profile.topSrc].filter(Boolean))];
    for (const src of sources) {
      const record = materialFor(scene, BABYLON, src);
      if (await waitForMaterialRecord(record)) {
        return Object.freeze({ assetId: profile.assetId, loaded: true, src });
      }
    }
    return Object.freeze({ assetId: profile.assetId, loaded: false, src: null });
  }));
  return Object.freeze(results);
}

/**
 * Attach a pure visual child without replacing the collision root.
 * No model or texture requests are sent for missing art.
 * One material/texture record is shared across instances of the same artwork.
 * Per-entity atlas UVs live on the mesh, NEVER on the shared texture.
 */
export function attachBattleEntityVisual(scene, BABYLON, root, kind, id, options = {}) {
  const profile = options.profile || resolveAssetVisual(kind, id);
  const animation = createBattleVisualAnimator(profile?.visual?.animations);
  let stateDisposed = false;
  let deathDetached = false;
  let mode = 'procedural';
  let plane = null;
  let model = null;
  let record = null;
  let activeListener = null;
  let atlasActive = false;
  let uvFrame = -1;
  const originalVisibility = [];
  const placeholderParts = root && !root.isDisposed?.()
    ? [root, ...(root.getChildMeshes?.(false) || [])]
    : [];
  placeholderParts.forEach(mesh => originalVisibility.push(mesh.visibility));

  const safeRoot = () => !stateDisposed && root && !root.isDisposed?.() && !sceneDisposed(scene);
  const setArtworkVisible = show => {
    placeholderParts.forEach((mesh, i) => {
      if (!mesh.isDisposed?.()) mesh.visibility = show ? 0 : originalVisibility[i];
    });
    if (plane && !plane.isDisposed?.()) plane.isVisible = show && mode !== 'model';
  };
  function updateAtlasFrame(frame) {
    if (!atlasActive || !plane || !profile?.visual?.atlasGrid || frame == null || frame < 0 || frame === uvFrame) return;
    uvFrame = frame;
    const uv = battleAtlasUV(frame, profile.visual.atlasGrid);
    if (typeof plane.updateVerticesData === 'function') {
      plane.updateVerticesData(BABYLON.VertexBuffer?.UVKind || 'uv', uv);
    }
  }
  const removeListener = () => {
    if (record && activeListener) record.listeners.delete(activeListener);
    activeListener = null;
  };
  const useTexture = (src, isAtlas, fallback = null) => {
    if (!src || !safeRoot()) return;
    removeListener();
    record = materialFor(scene, BABYLON, src);
    const whenLoaded = ok => {
      if (!safeRoot() || mode === 'model') return;
      if (!ok) {
        if (fallback) useTexture(fallback, false);
        return;
      }
      atlasActive = isAtlas;
      uvFrame = -1;
      plane.material = record.material;
      setArtworkVisible(true);
      mode = isAtlas ? 'atlas' : 'sprite';
      if (isAtlas) updateAtlasFrame(animation.tick(0) ?? animation.frame);
    };
    if (record.loaded) whenLoaded(true);
    else if (record.failed) whenLoaded(false);
    else {
      activeListener = whenLoaded;
      record.listeners.add(whenLoaded);
    }
  };
  if (profile && (profile.atlasSrc || profile.topSrc) && root && !root.isDisposed?.() && !sceneDisposed(scene)) {
    plane = BABYLON.MeshBuilder.CreatePlane(`art:${profile.assetId}`, {
      width: profile.visual.size, height: profile.visual.size, updatable: Boolean(profile.atlasSrc),
    }, scene);
    plane.parent = root;
    plane.position.y = 0.18;
    plane.rotation.x = Math.PI / 2;
    plane.rotation.z = ENEMY_SOURCE_TO_ROOT_YAW_V26A4;
    plane.isVisible = false;
    plane.isPickable = false;
    plane.metadata = { visualOnly: true, assetId: profile.assetId };
    useTexture(profile.atlasSrc || profile.topSrc, Boolean(profile.atlasSrc), profile.atlasSrc ? profile.topSrc : null);
  }
  // A delivered GLB may replace ONLY presentation. During async import the
  // atlas stays visible; a rejected model leaves the original fallback intact.
  model = createBattleGLBVisual(scene, BABYLON, root, profile, {
    quality: options.quality, mobile: options.mobile, timeoutMs: options.modelTimeoutMs,
    importModel: options.importModel,
    onLoaded: () => {
      if (!safeRoot() || deathDetached) return false;
      mode = 'model';
      setArtworkVisible(true);
      return true;
    },
    onError: error => options.onModelError?.(error),
  });
  const setState = value => {
    const accepted = animation.setState(value);
    if (accepted) model?.setState(animation.state);
    return accepted;
  };
  const tick = deltaMs => {
    if (stateDisposed) return;
    const frame = animation.tick(deltaMs);
    if (frame !== null) updateAtlasFrame(frame);
    model?.setState(animation.state);
    // Hit feedback is per-mesh; never recolor a cached/shared material.
    if (plane && mode === 'sprite' && !plane.isDisposed?.()) {
      plane.visibility = animation.state === 'hit' ? 0.72 : 1;
    }
  };
  const getSocketWorld = socketId => {
    const socket = profile?.visual?.sockets?.find(s => s.id === socketId);
    if (!socket || !safeRoot()) return null;
    const local = socket.offset;
    if (root.getWorldMatrix && BABYLON?.Vector3?.TransformCoordinates) {
      return BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(local.x, local.y, local.z), root.getWorldMatrix());
    }
    return { x: (root.position?.x || 0) + local.x, y: (root.position?.y || 0) + local.y, z: (root.position?.z || 0) + local.z };
  };
  const dispose = () => {
    if (stateDisposed) return;
    stateDisposed = true;
    animation.dispose();
    removeListener();
    model?.dispose();
    if (plane && !plane.isDisposed?.()) plane.dispose();
    placeholderParts.forEach((mesh, i) => {
      if (!mesh.isDisposed?.()) mesh.visibility = originalVisibility[i];
    });
  };
  /**
   * Hand the already loaded visual to the scene-owned death queue.
   * Babylon setParent(null) preserves its world transform while detaching it
   * from the collider. The collider can now be disposed synchronously.
   * Pending/failed texture loads are NOT carried over: no late resurrection.
   */
  const detachForDeath = () => {
    if (stateDisposed || deathDetached || !safeRoot()) return null;
    const isModel = mode === 'model' && model?.isReady;
    if (!isModel && (!plane || plane.isDisposed?.() || !plane.isVisible
      || (mode !== 'atlas' && mode !== 'sprite') || typeof plane.setParent !== 'function')) return null;
    if (!animation.setState('death')) return null;
    if (isModel) {
      if (!model.detachForDeath()) return null;
    } else {
      plane.setParent(null); // preserve the world position when the collider is removed
      plane.isPickable = false;
      plane.checkCollisions = false;
    }
    deathDetached = true;
    tick(0); // show death frame immediately; no extra texture request
    const durationMs = Math.max(1, Math.min(600,
      Number(profile?.visual?.animations?.death?.durationMs) || 250));
    let deathElapsedMs = 0;
    const tickDeath = deltaMs => {
      tick(deltaMs);
      deathElapsedMs += Math.max(0, Math.min(100, Number.isFinite(deltaMs) ? deltaMs : 0));
      // Without an atlas, fade the static sprite itself, not its shared material.
      if (mode === 'sprite' && plane && !plane.isDisposed?.()) {
        plane.visibility = Math.max(0, 1 - deathElapsedMs / durationMs);
      } else if (mode === 'model' && model && !model.hasDeathClip) {
        model.fade(Math.max(0, 1 - deathElapsedMs / durationMs));
      }
    };
    return Object.freeze({
      tick: tickDeath, dispose, durationMs,
      get isDisposed() { return stateDisposed; },
    });
  };
  // Do not dispose a detached death sprite when its old gameplay root dies.
  // It is owned by the scene death queue until the clip finishes or scene ends.
  root?.onDisposeObservable?.addOnce?.(() => { if (!deathDetached) dispose(); });
  return {
    get mode() { return mode; },
    get state() { return animation.state; },
    setState, tick, getSocketWorld, detachForDeath, dispose,
    get modelReady() { return model?.ready || Promise.resolve({ mode }); },
    getDebugInfo: () => ({ assetId: profile?.assetId || `${kind}:${id}`, mode, state: animation.state, atlas: atlasActive,
      frame: animation.frame, model: model?.getDebugInfo() || null }),
  };
}
