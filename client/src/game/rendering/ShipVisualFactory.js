/**
 * Graphics 2.1 - shared, presentation-only Babylon player-ship factory.
 * Used by BOTH Campaign and Dungeon. Combat stats/loot/Firestore are untouched.
 * Never treats an absent asset as a different aircraft. Until GLB finishes,
 * show the selected ship's top sprite; if that fails, show its unique silhouette.
 */
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { resolveShipVisual, chooseShipRenderQuality } from './ShipVisualCatalog.js';

const gone = (scene) => typeof scene.isDisposed === 'function'
  ? scene.isDisposed() : Boolean(scene.isDisposed);

function createProceduralMesh(scene, parent, visual) {
  const mesh = new BABYLON.Mesh(`ship:${visual.id}:silhouette`, scene);
  mesh.parent = parent;
  const positions = [0, 0.08, 0];
  for (const [x, z] of visual.silhouette) positions.push(x * 1.17, 0.08, z * 1.17);
  const indices = [];
  const count = visual.silhouette.length;
  for (let i = 1; i <= count; i++) indices.push(0, i, i === count ? 1 : i + 1);
  const normals = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  const geometry = new BABYLON.VertexData();
  geometry.positions = positions;
  geometry.indices = indices;
  geometry.normals = normals;
  geometry.applyToMesh(mesh);
  const material = new BABYLON.StandardMaterial(`ship:${visual.id}:fallbackMat`, scene);
  material.emissiveColor = BABYLON.Color3.FromHexString(visual.color);
  material.diffuseColor = BABYLON.Color3.FromHexString('#132b45');
  material.disableLighting = true;
  material.backFaceCulling = false;
  mesh.material = material;

  // Same nose/tail axis used in the SVG thumbnail, without a billboard/texture.
  const cockpit = BABYLON.MeshBuilder.CreateBox(`ship:${visual.id}:cockpit`, {
    width: 0.2, height: 0.09, depth: 0.59,
  }, scene);
  cockpit.parent = parent;
  cockpit.position.set(0, 0.16, -0.18);
  const glass = new BABYLON.StandardMaterial(`ship:${visual.id}:glass`, scene);
  glass.emissiveColor = BABYLON.Color3.FromHexString('#d9faff');
  glass.disableLighting = true;
  cockpit.material = glass;
  return [mesh, cockpit];
}

/**
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.TransformNode} playerRoot root that movement/fire mounts already use
 * @param {Object} options {aircraftId, aircraftCatalog, glowLayer?, quality?}
 * @returns {{tiltNode, collider, ready, setVisibility, dispose, getDebugInfo}}
 */
export function createPlayerShipVisual(scene, playerRoot, options) {
  const visual = resolveShipVisual(options.aircraftId, options.aircraftCatalog);
  // A C15 pack is verified by its manifest + per-file SHA before this URL is passed.
  // Never override catalog identity, collision geometry, or gameplay attributes.
  const verifiedPresentationTopSrc = typeof options.presentationTopSrc === 'string'
    && options.presentationTopSrc.trim() ? options.presentationTopSrc : null;
  const presentationTopSrc = verifiedPresentationTopSrc || visual.topSrc;
  const quality = options.quality || chooseShipRenderQuality(visual); // 'auto' | 'sprite' | 'procedural'
  const tiltNode = new BABYLON.TransformNode(`ship:${visual.id}:tilt`, scene);
  tiltNode.parent = playerRoot;

  // Fixed-size hitbox: MUST NOT depend on sprite/GLB geometry or visual LOD.
  // Plane dimensions and orientation match the previous Dungeon collision mesh.
  const collider = BABYLON.MeshBuilder.CreatePlane(`ship:${visual.id}:hitbox`, {
    width: 2.4, height: 2.4,
  }, scene);
  collider.parent = playerRoot;
  collider.rotation.x = -Math.PI / 2;
  collider.visibility = 0;
  collider.isPickable = false;
  collider.metadata = { shipHitbox: true, aircraftId: visual.id };

  const procedural = createProceduralMesh(scene, tiltNode, visual);
  let sprite = null;
  let spriteMaterial = null;
  let modelRoot = null;
  let modelMeshes = [];
  let disposed = false;
  let alpha = 1;
  let active = 'procedural';

  const warn = (kind, error) => {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[ShipVisualFactory] ${kind} for ${visual.id}; using its own fallback`, error?.message || error || '');
    }
  };
  function syncVisibility() {
    for (const m of procedural) {
      if (!m.isDisposed()) { m.isVisible = active === 'procedural'; m.visibility = alpha; }
    }
    if (sprite && !sprite.isDisposed()) {
      sprite.isVisible = active === 'sprite'; sprite.visibility = alpha;
    }
    for (const mesh of modelMeshes) {
      if (!mesh.isDisposed()) { mesh.isVisible = active === 'model'; mesh.visibility = alpha; }
    }
  }
  function activate(mode) {
    if (disposed) return;
    active = mode;
    syncVisibility();
  }
  const setVisibility = (value) => {
    alpha = Math.max(0, Math.min(1, Number(value) || 0));
    syncVisibility();
  };

  // Avoid any missing-asset HTTP requests: manifest is generated from public/.
  if (quality !== 'procedural' && presentationTopSrc) {
    sprite = BABYLON.MeshBuilder.CreatePlane(`ship:${visual.id}:sprite`, {
      width: 2.4, height: 2.4,
    }, scene);
    sprite.parent = tiltNode;
    sprite.rotation.x = -Math.PI / 2;
    sprite.isVisible = false;
    spriteMaterial = new BABYLON.StandardMaterial(`ship:${visual.id}:spriteMat`, scene);
    const texture = new BABYLON.Texture(
      presentationTopSrc, scene, false, visual.spriteInvertY, BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      () => { if (!disposed && active !== 'model') activate('sprite'); },
      (msg) => { if (!disposed) warn('TOP_TEXTURE_FAILED', msg); },
    );
    texture.hasAlpha = true;
    spriteMaterial.diffuseTexture = texture;
    spriteMaterial.emissiveTexture = texture;
    spriteMaterial.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    spriteMaterial.disableLighting = true;
    spriteMaterial.useAlphaFromDiffuseTexture = true;
    spriteMaterial.backFaceCulling = false;
    sprite.material = spriteMaterial;
  }

  let ready = Promise.resolve({ mode: active, id: visual.id });
  if (quality === 'auto' && visual.modelSrc) {
    ready = BABYLON.SceneLoader.ImportMeshAsync('', visual.modelSrc, '', scene).then(result => {
      if (disposed || gone(scene)) {
        for (const m of result.meshes || []) { try { m.dispose(); } catch (_) { /* scene already gone */ } }
        return { mode: 'disposed', id: visual.id };
      }
      const roots = [
        ...(result.meshes || []).filter(m => !m.parent),
        ...(result.transformNodes || []).filter(n => !n.parent),
      ];
      if (roots.length === 0 || !(result.meshes || []).length) {
        for (const m of result.meshes || []) m.dispose();
        throw new Error('GLB had no drawable meshes or root');
      }
      modelRoot = new BABYLON.TransformNode(`ship:${visual.id}:model`, scene);
      modelRoot.parent = tiltNode;
      const rot = visual.aircraft.modelRotation || { x: 0, y: Math.PI, z: 0 };
      modelRoot.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
      modelRoot.scaling.setAll(visual.aircraft.modelScale || 2.8);
      for (const root of roots) root.parent = modelRoot;
      modelMeshes = (result.meshes || []).filter(m => typeof m.isDisposed === 'function');
      if (options.glowLayer) {
        for (const mesh of modelMeshes) options.glowLayer.addExcludedMesh(mesh);
      }
      activate('model');
      return { mode: active, id: visual.id };
    }).catch(err => {
      if (!disposed && !gone(scene)) warn('MODEL_LOAD_FAILED', err);
      return { mode: disposed ? 'disposed' : active, id: visual.id };
    });
  }

  scene.onDisposeObservable.addOnce(() => { disposed = true; });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (modelRoot) modelRoot.dispose(false, true);
    for (const m of procedural) m.dispose(false, true);
    if (sprite) sprite.dispose(false, true);
    if (spriteMaterial) spriteMaterial.dispose(false, true);
    tiltNode.dispose();
    collider.dispose();
  };
  return {
    tiltNode, collider, ready, setVisibility, dispose,
    getDebugInfo: () => ({ aircraftId: visual.id, known: visual.known, mode: active, quality, spriteInvertY: visual.spriteInvertY, missing: visual.missing }),
  };
}
