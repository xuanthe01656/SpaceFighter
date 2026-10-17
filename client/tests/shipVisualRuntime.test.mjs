/** Babylon NullEngine smoke tests: no GPU, Firebase or asset network required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as BABYLON from '@babylonjs/core';
import { AIRCRAFTS } from '../src/constants.js';
import { createPlayerShipVisual } from '../src/game/rendering/ShipVisualFactory.js';

function fixture() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.FreeCamera('testCam', new BABYLON.Vector3(0, 10, 0), scene);
  camera.setTarget(BABYLON.Vector3.Zero());
  scene.activeCamera = camera;
  const playerRoot = new BABYLON.TransformNode('testPlayer', scene);
  return { engine, scene, playerRoot, close: () => { scene.dispose(); engine.dispose(); } };
}

test('NullEngine: missing art draws selected ship procedural geometry, no X-Wing substitution', () => {
  const f = fixture();
  try {
    const ship = createPlayerShipVisual(f.scene, f.playerRoot, {
      aircraftId: 'ship_titanforge', aircraftCatalog: AIRCRAFTS, quality: 'procedural',
    });
    f.scene.render();
    assert.equal(ship.getDebugInfo().aircraftId, 'ship_titanforge');
    assert.equal(ship.getDebugInfo().mode, 'procedural');
    assert.ok(f.scene.meshes.some(mesh => mesh.name === 'ship:ship_titanforge:silhouette'));
    assert.ok(!f.scene.meshes.some(mesh => mesh.name.includes('ship_xwing')));
    ship.dispose();
    assert.ok(ship.collider.isDisposed());
  } finally { f.close(); }
});

test('NullEngine: hiding/tilting ship visuals does NOT remove the collision mesh', () => {
  const f = fixture();
  try {
    const ship = createPlayerShipVisual(f.scene, f.playerRoot, {
      aircraftId: 'ship_spectre', aircraftCatalog: AIRCRAFTS, quality: 'procedural',
    });
    const enemy = BABYLON.MeshBuilder.CreateSphere('enemy', { diameter: 1 }, f.scene);
    f.scene.render();
    assert.equal(enemy.intersectsMesh(ship.collider, false), true);
    ship.tiltNode.rotation.z = 0.35;
    ship.setVisibility(0);
    f.scene.render();
    assert.equal(enemy.intersectsMesh(ship.collider, false), true);
    assert.equal(ship.collider.visibility, 0);
    assert.equal(ship.collider.metadata.aircraftId, 'ship_spectre');
    ship.dispose();
  } finally { f.close(); }
});

test('NullEngine: after successful GLB import, model replaces placeholder without changing hitbox', async () => {
  const f = fixture();
  const previous = BABYLON.SceneLoader.ImportMeshAsync;
  BABYLON.SceneLoader.ImportMeshAsync = async () => {
    const mesh = BABYLON.MeshBuilder.CreateBox('fakeGLBShip', { size: 1 }, f.scene);
    return { meshes: [mesh], transformNodes: [] };
  };
  try {
    const ship = createPlayerShipVisual(f.scene, f.playerRoot, {
      aircraftId: 'ship_xwing', aircraftCatalog: AIRCRAFTS, quality: 'auto',
    });
    const result = await ship.ready;
    f.scene.render();
    assert.equal(result.mode, 'model');
    assert.equal(ship.getDebugInfo().mode, 'model');
    assert.equal(ship.collider.metadata.aircraftId, 'ship_xwing');
    ship.setVisibility(0.4);
    const model = f.scene.getMeshByName('fakeGLBShip');
    assert.ok(model);
    assert.equal(model.visibility, 0.4);
    ship.dispose();
  } finally { BABYLON.SceneLoader.ImportMeshAsync = previous; f.close(); }
});

test('NullEngine: resolving a late model import after scene disposal cannot recreate meshes', async () => {
  const f = fixture();
  const previous = BABYLON.SceneLoader.ImportMeshAsync;
  let finish;
  BABYLON.SceneLoader.ImportMeshAsync = () => new Promise(resolve => { finish = resolve; });
  try {
    const ship = createPlayerShipVisual(f.scene, f.playerRoot, {
      aircraftId: 'ship_xwing', aircraftCatalog: AIRCRAFTS, quality: 'auto',
    });
    f.scene.dispose();
    finish({ meshes: [], transformNodes: [] });
    assert.equal((await ship.ready).mode, 'disposed');
  } finally { BABYLON.SceneLoader.ImportMeshAsync = previous; f.close(); }
});
