import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachBattleEntityVisual } from '../src/game/rendering/BattleEntityVisual.js';
import { createBattleDeathVisualQueue, BATTLE_DEATH_MAX_VISUALS } from '../src/game/rendering/BattleDeathVisualQueue.js';
import { createBattleVisualAnimator } from '../src/game/assets/EnemyBossAnimationCatalog.js';
import { resolveAssetVisual, assetDeliveryPaths } from '../src/game/assets/AssetRegistry.js';

function mockRuntime() {
  const textures = [], planes = [];
  const observers = new Set();
  const disposeListeners = new Set();
  let deltaMs = 50;
  const scene = {
    gone: false,
    isDisposed() { return this.gone; },
    getEngine() { return { getDeltaTime: () => deltaMs }; },
    onBeforeRenderObservable: {
      add(fn) { observers.add(fn); return fn; },
      remove(fn) { observers.delete(fn); },
    },
    onDisposeObservable: {
      addOnce(fn) { disposeListeners.add(fn); },
    },
    frame(ms = 50) { deltaMs = ms; for (const obs of [...observers]) obs(); },
    dispose() {
      if (this.gone) return;
      this.gone = true;
      for (const fn of [...disposeListeners]) fn();
      disposeListeners.clear();
      observers.clear();
    },
    get observerCount() { return observers.size; },
  };
  class Color3 { constructor(r, g, b) { Object.assign(this, { r, g, b }); } }
  class StandardMaterial { constructor(name) { this.name = name; } }
  class Texture {
    static BILINEAR_SAMPLINGMODE = 2;
    constructor(url, unused, a, b, c, onReady, onError) {
      textures.push({ url, onReady, onError });
      // Deliberately async to exercise pending image behavior.
    }
  }
  const BABYLON = {
    Color3, StandardMaterial, Texture, VertexBuffer: { UVKind: 'uv' },
    MeshBuilder: {
      CreatePlane(name) {
        const obj = {
          name, parent: null, position: { y: .18 }, rotation: { x: 0, z: 0 },
          visibility: 1, isVisible: true, isPickable: true, checkCollisions: true,
          gone: false, disposeCount: 0, uvFrames: [],
          setParent(parent) { this.parent = parent; this.wasDetached = parent === null; },
          isDisposed() { return this.gone; },
          dispose() { if (this.gone) return; this.gone = true; this.disposeCount++; },
          updateVerticesData(kind, uv) { this.uvFrames.push([...uv]); },
        };
        planes.push(obj);
        return obj;
      },
    },
  };
  const root = () => {
    const listeners = [];
    return {
      gone: false, isPickable: true, checkCollisions: true, visibility: 1,
      position: { x: 2, y: .2, z: -5 },
      getChildMeshes() { return []; },
      onDisposeObservable: { addOnce(fn) { listeners.push(fn); } },
      isDisposed() { return this.gone; },
      dispose() {
        if (this.gone) return;
        this.gone = true;
        for (const fn of listeners) fn();
        for (const p of planes) if (p.parent === this) p.dispose();
      },
    };
  };
  const profile = (kind = 'enemy', id = 'p1_small', delivered = true) => {
    const paths = assetDeliveryPaths(kind, id);
    return resolveAssetVisual(kind, id, delivered ? new Set([paths.atlas]) : new Set());
  };
  const add = (profileOverride = profile()) => {
    const mesh = root();
    const visual = attachBattleEntityVisual(scene, BABYLON, mesh, profileOverride.kind, profileOverride.id, { profile: profileOverride });
    return { mesh, visual };
  };
  const loadAll = () => {
    for (const tex of textures) tex.onReady();
  };
  return { BABYLON, scene, profile, root, add, loadAll, textures, planes };
}

test('death: a loaded atlas detaches from collider, stays visual-only, then frees in 250ms', () => {
  const m = mockRuntime();
  const queue = createBattleDeathVisualQueue(m.scene);
  const { mesh, visual } = m.add();
  m.loadAll();
  assert.equal(visual.mode, 'atlas');
  assert.equal(m.planes[0].parent, mesh);
  assert.equal(queue.capture(visual), true);
  mesh.dispose(); // gameplay removes collider synchronously
  assert.equal(mesh.isDisposed(), true);
  assert.equal(m.planes[0].isDisposed(), false);
  assert.equal(m.planes[0].parent, null);
  assert.equal(m.planes[0].isPickable, false);
  assert.equal(m.planes[0].checkCollisions, false);
  assert.equal(visual.state, 'death');
  assert.equal(visual.setState('attack'), false);
  assert.equal(m.textures.length, 1, 'no duplicate network texture request');
  m.scene.frame(100);
  m.scene.frame(100);
  assert.equal(queue.activeCount, 1);
  m.scene.frame(50);
  assert.equal(queue.activeCount, 0);
  assert.equal(m.planes[0].isDisposed(), true);
  assert.equal(m.planes[0].disposeCount, 1);
  assert.ok(m.planes[0].uvFrames.length >= 2, 'death atlas advances frames');
  queue.dispose();
});

test('death: missing or pending art preserves original procedural cleanup and cannot load after death', () => {
  const m = mockRuntime();
  const queue = createBattleDeathVisualQueue(m.scene);
  const missing = m.add(m.profile('enemy', 'p1_small', false));
  assert.equal(queue.capture(missing.visual), false);
  missing.mesh.dispose();
  assert.equal(queue.activeCount, 0);
  const pending = m.add();
  assert.equal(queue.capture(pending.visual), false);
  pending.mesh.dispose();
  m.loadAll();
  assert.equal(pending.visual.mode, 'procedural');
  assert.equal(m.planes.at(-1).isDisposed(), true);
  assert.equal(queue.activeCount, 0);
  queue.dispose();
});

test('death: scene disposal terminates all visual afterimages and removes observer', () => {
  const m = mockRuntime();
  const queue = createBattleDeathVisualQueue(m.scene);
  const e = m.add();
  m.loadAll();
  assert.equal(queue.capture(e.visual), true);
  e.mesh.dispose();
  assert.equal(m.scene.observerCount, 1);
  m.scene.dispose();
  assert.equal(queue.activeCount, 0);
  assert.equal(queue.isDisposed, true);
  assert.equal(m.scene.observerCount, 0);
  assert.equal(m.planes[0].isDisposed(), true);
  m.scene.frame(50);
  assert.equal(queue.capture(e.visual), false);
});

test('death: bounded pool evicts oldest even if many enemies die in one frame', () => {
  const m = mockRuntime();
  const queue = createBattleDeathVisualQueue(m.scene, { maxActive: 2 });
  const actors = [m.add(), m.add(), m.add()];
  m.loadAll();
  assert.equal(m.textures.length, 1, 'shared atlas cache');
  for (const a of actors) { assert.equal(queue.capture(a.visual), true); a.mesh.dispose(); }
  assert.equal(queue.activeCount, 2);
  assert.equal(m.planes[0].isDisposed(), true);
  assert.equal(m.planes[1].isDisposed(), false);
  assert.equal(m.planes[2].isDisposed(), false);
  m.scene.frame(350);
  assert.equal(queue.activeCount, 2, 'dt clamped to avoid teleporting animation');
  m.scene.frame(100);
  m.scene.frame(100);
  assert.equal(queue.activeCount, 0);
  queue.dispose();
});

test('death: pool has safe maximum even if caller requests unbounded capacity', () => {
  assert.equal(BATTLE_DEATH_MAX_VISUALS, 32);
  const m = mockRuntime();
  const queue = createBattleDeathVisualQueue(m.scene, { maxActive: Infinity });
  const a = m.add(); m.loadAll();
  assert.equal(queue.capture(a.visual), true);
  a.mesh.dispose();
  queue.dispose();
  assert.equal(queue.activeCount, 0);
});

test('death: animation terminal state cannot be overwritten by idle, move, hit or attack', () => {
  const actor = createBattleVisualAnimator();
  assert.equal(actor.setState('death'), true);
  for (const state of ['idle', 'move', 'hit', 'attack', 'enrage', 'spawn']) assert.equal(actor.setState(state), false);
  assert.equal(actor.state, 'death');
  actor.tick(100);
  actor.tick(100);
  assert.equal(actor.state, 'death');
  actor.dispose();
});

test('death: both battle scenes use one queue; kill path differs from cull and collision', () => {
  const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const rel of ['src/components/Campaign/CampaignScene.js', 'src/components/Dungeon/DungeonScene.js']) {
    const source = fs.readFileSync(path.join(base, rel), 'utf8');
    assert.match(source, /createBattleDeathVisualQueue\(scene\)/);
    assert.match(source, /cleanEnemy\(enemy, true\)/);
    assert.match(source, /deathVisuals\.capture\(bossVisual\)/);
    assert.match(source, /safeDis(?:pose)?\(bossMesh\)/);
    assert.match(source, /if \(killedByDamage\) deathVisuals\.capture\(e\.visual\)/);
    assert.doesNotMatch(source, /setState\('death'\);\s*(?:\n\s*)?[^\n]*\.dispose\(\)/);
  }
  const manager = fs.readFileSync(path.join(base, 'src/game/rendering/BattleDeathVisualQueue.js'), 'utf8');
  assert.doesNotMatch(manager, /fetch\(|setTimeout\(|firebase|Firestore|battle\.finish|coins\s*\+=/i);
});
