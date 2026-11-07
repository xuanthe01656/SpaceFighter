import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetDeliveryPaths, resolveAssetVisual } from '../src/game/assets/AssetRegistry.js';
import { BATTLE_GLB_MAX_PER_SCENE, shouldLoadBattleGLB } from '../src/game/rendering/BattleGLBVisual.js';
import { attachBattleEntityVisual } from '../src/game/rendering/BattleEntityVisual.js';
import { createBattleDeathVisualQueue } from '../src/game/rendering/BattleDeathVisualQueue.js';
import { inspectBattleGLB } from '../scripts/check-enemy-boss-models.mjs';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = (delivered = ['atlas', 'model']) => {
  const p = assetDeliveryPaths('enemy', 'p1_small');
  return resolveAssetVisual('enemy', 'p1_small', new Set(delivered.map(s => p[s])));
};
function mock() {
  const textures = [], modelNodes = [], models = [], allDispose = [], roots = [];
  let disposed = false;
  const onFrame = new Set();
  const scene = {
    isDisposed() { return disposed; },
    onDisposeObservable: { addOnce(fn) { allDispose.push(fn); } },
    onBeforeRenderObservable: { add(fn) { onFrame.add(fn); return fn; }, remove(fn) { onFrame.delete(fn); } },
    getEngine() { return { getDeltaTime: () => 50 }; },
    tick() { for (const fn of [...onFrame]) fn(); },
    dispose() { disposed = true; for (const cb of [...allDispose]) cb(); },
  };
  class Color3 { constructor(r, g, b) { Object.assign(this, {r, g, b}); } }
  class StandardMaterial { constructor(name) { this.name = name; } }
  class Texture {
    static BILINEAR_SAMPLINGMODE = 2;
    constructor(src, scene, mip, invert, sampling, onReady, onFail) {
      textures.push({ src, onReady, onFail });
    }
  }
  class TransformNode {
    constructor(name) {
      this.name = name; this.parent = null; this.gone = false;
      this.position = {set(x,y,z) { Object.assign(this, {x,y,z}); }};
      this.rotation = {set(x,y,z) { Object.assign(this, {x,y,z}); }};
      this.scaling = {setAll(s) { this.value = s; }};
      modelNodes.push(this);
    }
    isDisposed() { return this.gone; }
    getHierarchyBoundingVectors() { return { min:{x:-1,z:-1}, max:{x:1,z:1} }; }
    setParent(parent) { this.parent = parent; this.detached = parent === null; }
    dispose() { this.gone = true; }
  }
  const planes = [];
  const BABYLON = { Color3, StandardMaterial, Texture, TransformNode, VertexBuffer: { UVKind:'uv' },
    MeshBuilder: { CreatePlane(name) {
      const plane = { name, isVisible: false, visibility: 1, position:{y:0}, rotation:{x:0,z:0},
        isDisposed() { return !!this.disposed; }, dispose() { this.disposed = true; },
        updateVerticesData() {}, setParent(parent) { this.parent = parent; } };
      planes.push(plane); return plane;
    }},
  };
  const createRoot = () => {
    const callbacks = [];
    const root = { visibility: 1, position:{x:2,y:0.2,z:-4},
      isDisposed() { return !!this.gone; }, getChildMeshes() { return []; },
      onDisposeObservable: { addOnce(fn) { callbacks.push(fn); } },
      dispose() { this.gone = true; for (const cb of callbacks) cb();
        for (const plane of planes) if (plane.parent === root) plane.dispose();
        for (const model of modelNodes) if (model.parent === root) model.dispose();
      },
    };
    roots.push(root); return root;
  };
  const makeResult = (names = ['spawn', 'idle', 'move', 'attack', 'hit', 'enrage', 'death']) => {
    const mesh = {parent:null, visibility:1, isPickable:true, checkCollisions:true,
      getBoundingInfo(){return {};}, isDisposed(){return !!this.gone;},
      dispose(){this.gone=true;this.disposes=(this.disposes||0)+1;}};
    const groups = names.map(name => ({ name, starts:[],
      start(loop) {this.starts.push(loop);}, stop() {this.stops=(this.stops||0)+1;},
      dispose() {this.disposed=true;},
    }));
    const result = { meshes:[mesh], transformNodes:[], skeletons:[], animationGroups:groups };
    models.push(result);
    return result;
  };
  const add = (importModel, opts={}) => attachBattleEntityVisual(scene, BABYLON,
    opts.root || createRoot(), 'enemy', 'p1_small', {
      profile: profile(), mobile:false, importModel,
      ...opts,
    });
  return { scene, BABYLON, createRoot, makeResult, add, textures, modelNodes, models, planes, roots };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('GLB contract resolves exactly the per-ID file; no world or combat schema change', () => {
  const p = profile();
  assert.equal(p.modelSrc, '/models/visuals/enemy/p1_small.glb');
  assert.equal(p.visual.model.noseAxis, '-Z');
  assert.equal(p.visual.model.rotation.y, Math.PI,
    'source -Z GLB must use the same +Z-forward gameplay-root conversion as atlas art');
  assert.equal(p.visual.model.targetSize, p.visual.size);
  assert.equal(Object.keys(p.visual.model.clips).length, 7);
  assert.equal(shouldLoadBattleGLB(p, {mobile:false}), true);
  assert.equal(shouldLoadBattleGLB(p, {mobile:true}), false);
  assert.equal(shouldLoadBattleGLB(p, {mobile:false,quality:'atlas'}), false);
  assert.equal(shouldLoadBattleGLB(profile(['atlas']), {mobile:false}), false);
});

test('successful GLB import hides only placeholder/atlas and preserves gameplay root', async () => {
  const m = mock(); const result = m.makeResult();
  const root = m.createRoot();
  const visual = m.add(async () => result, { root });
  assert.equal(visual.mode,'procedural');
  m.textures[0].onReady();
  assert.equal(visual.mode,'atlas');
  const loaded = await visual.modelReady;
  assert.equal(loaded.mode,'model');
  assert.equal(visual.mode,'model');
  assert.equal(root.visibility,0);
  assert.equal(m.planes[0].isVisible,false);
  assert.equal(result.meshes[0].isPickable,false);
  assert.equal(result.meshes[0].checkCollisions,false);
  assert.equal(root.position.z,-4);
  assert.equal(m.modelNodes[0].parent,root);
  visual.dispose();
  assert.equal(result.meshes[0].gone,true);
  assert.equal(m.modelNodes[0].gone,true);
  assert.equal(root.gone,undefined);
});

test('GLB clip mapping is per entity; missing clip is a static safe fallback', async () => {
  const m=mock(); const result=m.makeResult(['spawn','idle','death']);
  const v=m.add(async()=>result); m.textures[0].onReady();
  await v.modelReady;
  assert.equal(result.animationGroups[0].starts.length,1);
  v.tick(300);v.setState('move');v.tick(16);
  assert.equal(result.animationGroups[1].starts.length,0,'missing move clip cannot start a non-existent animation');
  v.setState('death');v.tick(16);
  assert.equal(result.animationGroups[2].starts.length,1);
  v.dispose();
});

test('bad GLB import leaves atlas visible and does not change collision', async () => {
  const m=mock(); const root=m.createRoot();
  const v=m.add(async()=>{throw Error('bad glTF');},{root});
  m.textures[0].onReady();
  assert.equal((await v.modelReady).mode,'fallback');
  assert.equal(v.mode,'atlas');
  assert.equal(root.visibility,0);
  assert.equal(root.gone,undefined);
  v.dispose();
});

test('mobile policy never issues GLB import and keeps the existing atlas', () => {
  const m=mock(); let requests=0;
  const v=m.add(async()=>{requests++;return m.makeResult();},{ mobile:true });
  m.textures[0].onReady();
  assert.equal(v.mode,'atlas');
  assert.equal(requests,0);
  v.dispose();
});

test('late GLB after gameplay root dies is disposed without a resurrection', async () => {
  const m=mock(); let resolve;
  const result=m.makeResult();
  const root=m.createRoot();
  const v=m.add(()=>new Promise(fn=>resolve=fn), {root});
  await flush();
  root.dispose();
  assert.equal((await v.modelReady).mode,'disposed');
  resolve(result);await flush();
  assert.equal(result.meshes[0].gone,true);
  assert.equal(v.mode,'procedural');
});

test('late GLB after scene disposal releases every imported mesh/animation', async () => {
  const m=mock(); let resolve;
  const result=m.makeResult();
  const v=m.add(()=>new Promise(fn=>resolve=fn));
  await flush();
  m.scene.dispose();
  resolve(result);await flush();
  assert.equal(result.meshes[0].gone,true);
  assert.ok(result.animationGroups.every(g=>g.disposed));
  assert.equal((await v.modelReady).mode,'disposed');
});

test('loaded GLB continues death visuals with no collider and is bounded by existing queue', async () => {
  const m=mock(); const result=m.makeResult();const root=m.createRoot();
  const queue=createBattleDeathVisualQueue(m.scene);
  const v=m.add(async()=>result,{root}); m.textures[0].onReady();
  await v.modelReady;
  assert.equal(queue.capture(v),true);
  root.dispose();
  assert.equal(m.modelNodes[0].parent,null);
  assert.equal(m.modelNodes[0].gone,false);
  assert.equal(result.meshes[0].gone,undefined);
  for(let i=0;i<5;i++)m.scene.tick();
  assert.equal(queue.activeCount,0);
  assert.equal(result.meshes[0].gone,true);
  queue.dispose();
});

test('model GLB cap is enforced per scene and released on actor disposal', async () => {
  const m=mock();let started=0;
  const actors=[];
  for(let i=0;i<BATTLE_GLB_MAX_PER_SCENE+1;i++) {
    actors.push(m.add(()=>{started++;return new Promise(()=>{});}));
  }
  await flush();
  assert.equal(started,BATTLE_GLB_MAX_PER_SCENE);
  actors[0].dispose();
  const extra=m.add(()=>{started++;return new Promise(()=>{});});
  await flush();
  assert.equal(started,BATTLE_GLB_MAX_PER_SCENE+1);
  for(const actor of [...actors,...[extra]])actor.dispose();
});

test('GLB validator rejects malformed or external-art models', () => {
  assert.ok(inspectBattleGLB(Buffer.from('not a glb')).length);
  const bad=Buffer.alloc(28);
  bad.write('glTF');bad.writeUInt32LE(2,4);bad.writeUInt32LE(28,8);
  assert.ok(inspectBattleGLB(bad).some(x=>x.includes('JSON')));
});

test('new GLB visual adapter is render-only and does not modify scene AI or economy',()=>{
  const visual=fs.readFileSync(path.join(dir,'src/game/rendering/BattleGLBVisual.js'),'utf8');
  assert.doesNotMatch(visual,/firebase\/|setDoc\(|battle\.finish|wallet|reward|enemy\.hp\s*[-+]?=/i);
  assert.match(visual,/disposeBattleGLBImport/);
  for(const scene of ['Campaign','Dungeon']) {
    const source=fs.readFileSync(path.join(dir,`src/components/${scene}/${scene}Scene.js`),'utf8');
    assert.match(source,/attachBattleEntityVisual/);
    assert.match(source,/deathVisuals\.capture/);
  }
});

test('GLB timeout keeps atlas visible; late model is disposed without resurrection', async () => {
  const m=mock();let resolve;const result=m.makeResult();
  const v=m.add(()=>new Promise(fn=>resolve=fn),{modelTimeoutMs:500});
  m.textures[0].onReady();
  assert.equal(v.mode,'atlas');
  const status=await v.modelReady;
  assert.equal(status.mode,'fallback');
  assert.equal(v.mode,'atlas');
  resolve(result);await flush();
  assert.equal(result.meshes[0].gone,true);
  assert.equal(v.mode,'atlas');
  v.dispose();
});

test('GLB can recover from failed atlas without modifying combat collider', async()=>{
  const m=mock();const root=m.createRoot();const result=m.makeResult();
  const v=m.add(async()=>result,{root});
  m.textures[0].onFail('atlas failed');
  assert.equal(v.mode,'procedural');
  await v.modelReady;
  assert.equal(v.mode,'model');
  assert.equal(root.position.x,2);
  v.dispose();
});
