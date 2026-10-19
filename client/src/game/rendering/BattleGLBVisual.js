/**
 * Graphics 2.1.8-B2.2: optional Enemy/Boss GLB presentation adapter.
 * Gameplay roots, collision, AI, projectiles, economy and Firestore are untouched.
 * A GLB is attempted only when the generated availability manifest lists it,
 * on desktop, and while a small per-scene concurrency/instance budget remains.
 * Sprite atlas remains visible during import and on every failure.
 */
export const BATTLE_GLB_MAX_PER_SCENE = 6;
export const BATTLE_GLB_TIMEOUT_MS = 8000;
const sceneBudgets = new WeakMap();
const gone = node => !node || (typeof node.isDisposed === 'function' ? node.isDisposed() : Boolean(node.isDisposed));
const finitePositive = x => Number.isFinite(x) && x > 0;

function budgetFor(scene) {
  let state = sceneBudgets.get(scene);
  if (state) return state;
  state = { reserved: 0 };
  sceneBudgets.set(scene, state);
  scene.onDisposeObservable?.addOnce?.(() => sceneBudgets.delete(scene));
  return state;
}

/** Desktop auto-loads only delivered GLBs; mobile always uses 2D atlas. */
export function shouldLoadBattleGLB(profile, options = {}) {
  if (!profile?.modelSrc || !profile?.visual?.model) return false;
  if (!['enemy', 'boss', 'dungeon_enemy', 'dungeon_boss'].includes(profile.kind)) return false;
  if (['sprite', 'atlas', 'procedural'].includes(options.quality)) return false;
  if (options.quality === 'off') return false;
  const mobile = options.mobile ?? (typeof navigator !== 'undefined'
    && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''));
  if (mobile) return false; // release-safe; B2.4 handles mobile GLB profiling later.
  return true;
}

/** Imported GLB resources belong to this actor, not the gameplay collider. */
export function disposeBattleGLBImport(result) {
  if (!result) return;
  for (const group of result.animationGroups || []) { try { group.stop?.(); group.dispose?.(); } catch (_) { /* disposed scene */ } }
  for (const ps of result.particleSystems || []) { try { ps.dispose?.(); } catch (_) { /* disposed scene */ } }
  for (const mesh of [...(result.meshes || [])].reverse()) {
    try { if (!gone(mesh)) mesh.dispose?.(false, true); } catch (_) { /* disposed scene */ }
  }
  for (const node of [...(result.transformNodes || [])].reverse()) {
    try { if (!gone(node)) node.dispose?.(false, true); } catch (_) { /* disposed scene */ }
  }
  for (const skeleton of result.skeletons || []) { try { skeleton.dispose?.(); } catch (_) { /* disposed scene */ } }
}

const normalizedClipName = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function findClip(groups, wanted) {
  const candidates = Array.isArray(wanted) ? wanted : [wanted];
  for (const name of candidates) {
    const key = normalizedClipName(name);
    const match = groups.find(group => normalizedClipName(group.name) === key);
    if (match) return match;
  }
  return null;
}

/** The callback onLoaded MUST only change presentation, never the combat root. */
export function createBattleGLBVisual(scene, BABYLON, gameplayRoot, profile, options = {}) {
  if (!shouldLoadBattleGLB(profile, options) || gone(scene) || gone(gameplayRoot)) return null;
  const budget = budgetFor(scene);
  if (budget.reserved >= BATTLE_GLB_MAX_PER_SCENE) return null;
  budget.reserved++;
  let reserved = true;
  let disposed = false;
  let timedOut = false;
  let detached = false;
  let modelNode = null;
  let imported = null;
  let activeClip = null;
  let currentState = 'spawn';
  let readyState = false;
  let timeoutId = null;
  let settle;
  const ready = new Promise(resolve => { settle = resolve; });
  const done = status => { if (settle) { const callback = settle; settle = null; callback(status); } };
  const release = () => { if (reserved) { budget.reserved = Math.max(0, budget.reserved - 1); reserved = false; } };
  const alive = () => !disposed && !timedOut && !gone(scene) && !gone(gameplayRoot);
  const modelConfig = profile.visual.model;
  const animationGroups = () => imported?.animationGroups || [];

  function setState(name) {
    currentState = name;
    if (!readyState) return;
    const wanted = modelConfig.clips?.[name] || [name];
    const clip = findClip(animationGroups(), wanted);
    if (clip === activeClip) return;
    try { activeClip?.stop?.(); } catch (_) { /* scene disposal */ }
    activeClip = clip;
    if (!clip) return; // missing skeletal clip: hold the GLB, never change gameplay state.
    try {
      const loop = name === 'idle' || name === 'move';
      clip.start?.(loop, 1);
    } catch (_) { activeClip = null; } // safely display a static model
  }

  function fade(alpha) {
    if (!readyState) return;
    const opacity = Math.max(0, Math.min(1, Number(alpha) || 0));
    for (const mesh of imported?.meshes || []) {
      if (!gone(mesh) && typeof mesh.visibility === 'number') mesh.visibility = opacity;
    }
  }

  function detachForDeath() {
    if (!readyState || disposed || detached || !modelNode || gone(modelNode)) return false;
    if (typeof modelNode.setParent === 'function') modelNode.setParent(null); // preserve world transform
    else modelNode.parent = null;
    detached = true;
    setState('death');
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
    readyState = false;
    if (imported) { disposeBattleGLBImport(imported); imported = null; }
    if (modelNode && !gone(modelNode)) { try { modelNode.dispose?.(false, true); } catch (_) { /* scene gone */ } }
    modelNode = null;
    release();
    done({ mode: 'disposed', assetId: profile.assetId });
  }
  scene.onDisposeObservable?.addOnce?.(dispose);

  timeoutId = setTimeout(() => {
    if (disposed || readyState) return;
    timedOut = true;
    release();
    try { options.onError?.('timeout'); } catch (_) { /* logging must never affect gameplay */ }
    done({ mode: 'fallback', reason: 'timeout', assetId: profile.assetId });
  }, Math.max(500, Math.min(15000, Number(options.timeoutMs) || BATTLE_GLB_TIMEOUT_MS)));

  const fetchModel = async () => {
    if (!alive()) return null;
    if (typeof options.importModel === 'function') return options.importModel(profile.modelSrc, scene);
    await import('@babylonjs/loaders/glTF/index.js'); // load glTF decoder only for delivered GLBs
    if (!alive()) return null;
    return BABYLON.SceneLoader.ImportMeshAsync('', profile.modelSrc, '', scene);
  };
  Promise.resolve().then(fetchModel).then(result => {
    if (!result) return;
    if (!alive()) { disposeBattleGLBImport(result); return; }
    const meshes = result.meshes || [];
    if (!meshes.some(mesh => typeof mesh.getBoundingInfo === 'function' || mesh.getClassName?.() === 'Mesh')) {
      disposeBattleGLBImport(result);
      throw new Error('GLB has no renderable meshes');
    }
    // Own the import before making any Babylon scene mutations, so errors
    // during parenting/animation setup still release its animation groups.
    imported = result;
    // Parent only top-level imported nodes; keep glTF's internal hierarchy, bones and __root__.
    const allNodes = [...meshes, ...(result.transformNodes || [])];
    const importedSet = new Set(allNodes);
    const roots = allNodes.filter(node => !node.parent || !importedSet.has(node.parent));
    modelNode = new BABYLON.TransformNode(`glb:${profile.assetId}`, scene);
    modelNode.parent = gameplayRoot;
    for (const node of roots) node.parent = modelNode;
    const position = modelConfig.position || { x: 0, y: 0.18, z: 0 };
    modelNode.position?.set?.(position.x || 0, position.y || 0, position.z || 0);
    const rotation = modelConfig.rotation || { x: 0, y: 0, z: 0 };
    modelNode.rotation?.set?.(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    const target = finitePositive(modelConfig.targetSize) ? modelConfig.targetSize : profile.visual.size;
    let scale = finitePositive(modelConfig.scale) ? modelConfig.scale : 1;
    if (modelConfig.fitToSize !== false) {
      const bounds = modelNode.getHierarchyBoundingVectors?.(true);
      if (bounds?.min && bounds?.max) {
        const spanX = Math.abs(bounds.max.x - bounds.min.x);
        const spanZ = Math.abs(bounds.max.z - bounds.min.z);
        const size = Math.max(spanX, spanZ);
        if (finitePositive(size)) scale *= Math.max(0.0001, Math.min(100, target / size));
      }
    }
    modelNode.scaling?.setAll?.(scale);
    for (const mesh of meshes) {
      if (gone(mesh)) continue;
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.metadata = { ...(mesh.metadata || {}), visualOnly: true, assetId: profile.assetId };
    }
    readyState = true;
    for (const group of animationGroups()) group.stop?.();
    setState(currentState);
    // Callback may decline if the actor died while the import was being processed.
    if (options.onLoaded?.() === false || !alive()) { dispose(); return; }
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
    done({ mode: 'model', assetId: profile.assetId });
  }).catch(error => {
    if (disposed || timedOut) return;
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
    try { options.onError?.(error?.message || String(error)); } catch (_) { /* logging must never kill gameplay */ }
    if (imported) { disposeBattleGLBImport(imported); imported = null; }
    if (modelNode && !gone(modelNode)) modelNode.dispose?.(false, true);
    modelNode = null;
    readyState = false;
    disposed = true;
    release();
    done({ mode: 'fallback', assetId: profile.assetId });
  });

  return Object.freeze({
    ready, setState, fade, detachForDeath, dispose,
    get isReady() { return readyState; },
    get hasDeathClip() { return Boolean(findClip(animationGroups(), modelConfig.clips?.death || ['death'])); },
    getDebugInfo: () => ({ ready: readyState, disposed, detached, budgetUsed: budget.reserved, assetId: profile.assetId }),
  });
}
