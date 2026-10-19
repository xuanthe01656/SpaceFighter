import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_VISUAL_PROFILES, assetDeliveryPaths, resolveAssetVisual } from '../src/game/assets/AssetRegistry.js';
import {
  ANIMATED_BATTLE_KINDS, BATTLE_ANIMATION_STATES, BATTLE_ANIMATION_CLIPS,
  BATTLE_ANIMATION_GRID, validateBattleAtlasContract, battleAtlasUV, createBattleVisualAnimator,
} from '../src/game/assets/EnemyBossAnimationCatalog.js';
import { attachBattleEntityVisual } from '../src/game/rendering/BattleEntityVisual.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mockBabylon() {
  const textures = new Map(), meshes = [];
  class Color3 { constructor(r,g,b){ Object.assign(this,{r,g,b}); } }
  class StandardMaterial { constructor(name){ this.name=name; } }
  class Texture {
    static BILINEAR_SAMPLINGMODE = 2;
    constructor(url, scene, noMips, invertY, sampling, onReady, onError) {
      textures.set(url, { onReady, onError });
    }
  }
  const BABYLON = {
    Color3, StandardMaterial, Texture, VertexBuffer: { UVKind: 'uv' },
    MeshBuilder: {
      CreatePlane(name, options) {
        const mesh={ name, options, position:{y:0}, rotation:{x:0,z:0}, visibility:1,
          isDisposed(){return !!this.gone;}, dispose(){this.gone=true;},
          updateVerticesData(kind, data) { this.lastUVKind=kind;this.lastUV=[...data];this.updates=(this.updates||0)+1; },
        };
        meshes.push(mesh); return mesh;
      },
    },
  };
  const scene={ disposed:false, isDisposed(){return this.disposed;},onDisposeObservable:{addOnce(fn){scene.onDispose=fn;}} };
  const rootMesh={ position:{x:10,y:0.3,z:4}, visibility:1, children:[{visibility:0.9}], gone:false,
    isDisposed(){return this.gone;}, getChildMeshes(){return this.children;},
    onDisposeObservable:{addOnce(fn){rootMesh.onDispose=fn;}},
  };
  return { BABYLON, scene, rootMesh, meshes, textures };
}

const art = (id='p1_small') => {
  const paths=assetDeliveryPaths('enemy',id);
  return resolveAssetVisual('enemy',id,new Set([paths.top,paths.atlas]));
};

test('the contract covers every existing enemy and boss without changing stable IDs',()=>{
  const combat=ALL_VISUAL_PROFILES.filter(p=>ANIMATED_BATTLE_KINDS.includes(p.kind));
  assert.equal(combat.length,30);
  assert.deepEqual(Object.fromEntries(ANIMATED_BATTLE_KINDS.map(kind=>[kind,combat.filter(p=>p.kind===kind).length])),{
    enemy:12,boss:6,dungeon_enemy:9,dungeon_boss:3,
  });
  for(const p of combat){
    assert.equal(p.assetId,`${p.kind}:${p.id}`);
    assert.ok(p.paths.atlas.endsWith(`/${p.id}_sheet.webp`));
    assert.equal(p.visual.orientation,'nose-negative-z');
    assert.ok(p.visual.sockets.some(s=>s.id.startsWith('gun:')));
    assert.deepEqual(Object.keys(p.visual.animations),BATTLE_ANIMATION_STATES);
  }
});

test('a missing atlas or static sprite sends no HTTP request and keeps the procedural mesh',()=>{
  const m=mockBabylon();
  // Force missing art for this scenario even when 30 optional atlases are installed.
  const a=attachBattleEntityVisual(m.scene,m.BABYLON,m.rootMesh,'enemy','p1_small',{
    profile:resolveAssetVisual('enemy','p1_small',new Set()),
  });
  assert.equal(a.mode,'procedural');
  assert.equal(m.textures.size,0);
  assert.equal(m.rootMesh.visibility,1);
  a.setState('move');a.tick(16.67);a.dispose();
  assert.equal(m.rootMesh.visibility,1);
});

test('all atlas frame coordinates remain inside their own 4x4 cell',()=>{
  assert.equal(validateBattleAtlasContract(),true);
  assert.equal(BATTLE_ANIMATION_GRID.columns,4);
  assert.deepEqual(battleAtlasUV(0),[0,.75,.25,.75,.25,1,0,1]);
  assert.deepEqual(battleAtlasUV(15),[.75,0,1,0,1,.25,.75,.25]);
  assert.throws(()=>battleAtlasUV(16), RangeError);
  for(const c of Object.values(BATTLE_ANIMATION_CLIPS)) for(const f of c.frames) assert.ok(f>=0 && f<16);
  assert.equal(validateBattleAtlasContract({ columns: 1, rows: 1 }),false);
});

test('animation timing, attack, hit, enrage and death are independent of gameplay root',()=>{
  const s=createBattleVisualAnimator();
  assert.equal(s.state,'spawn');
  s.setState('move');
  for(let i=0;i<3;i++)s.tick(100);
  assert.equal(s.state,'move');
  assert.ok(s.frame>=7 && s.frame<=10);
  assert.equal(s.setState('attack'),true);
  assert.equal(s.setState('move'),false);
  assert.equal(s.setState('hit'),true);
  assert.equal(s.setState('attack'),false);
  s.tick(100);s.tick(100);
  assert.equal(s.state,'move');
  assert.equal(s.setState('enrage'),true);
  assert.equal(s.setState('death'),true);
  assert.equal(s.setState('move'),false);
  for(let i=0;i<10;i++)s.tick(100);
  assert.equal(s.state,'death');
  s.dispose();assert.equal(s.tick(16),null);
});

test('atlas sprite replaces visuals only and changes UVs per actor, never shared texture offsets',()=>{
  const m=mockBabylon();
  const profile=art();
  const ctrl=attachBattleEntityVisual(m.scene,m.BABYLON,m.rootMesh,'enemy','p1_small',{profile});
  assert.equal(m.textures.size,1);
  assert.ok(m.textures.has(profile.atlasSrc));
  assert.equal(m.meshes[0].options.updatable,true);
  assert.equal(m.rootMesh.visibility,1);
  m.textures.get(profile.atlasSrc).onReady();
  assert.equal(ctrl.mode,'atlas');
  assert.equal(m.rootMesh.visibility,0);
  assert.equal(m.meshes[0].isPickable,false);
  assert.equal(m.meshes[0].lastUVKind,'uv');
  assert.deepEqual(m.meshes[0].lastUV,battleAtlasUV(0));
  const beforeUV=[...m.meshes[0].lastUV];
  ctrl.setState('attack');ctrl.tick(100);
  assert.notDeepEqual(m.meshes[0].lastUV,beforeUV);
  assert.equal(m.rootMesh.position.x,10);
  assert.equal(m.rootMesh.children[0].visibility,0);
  assert.equal(ctrl.getSocketWorld('gun:main').x,10);
  assert.equal(ctrl.getSocketWorld('missing'),null);
  ctrl.dispose();
  assert.equal(m.rootMesh.visibility,1);
  assert.equal(m.rootMesh.children[0].visibility,0.9);
  assert.equal(m.meshes[0].gone,true);
});

test('sprites in the same scene share one atlas texture but have independent UV buffers',()=>{
  const m=mockBabylon();const profile=art();
  const a=attachBattleEntityVisual(m.scene,m.BABYLON,m.rootMesh,'enemy','p1_small',{profile});
  const other={position:{x:0,y:0,z:2},visibility:1,isDisposed(){return false;},getChildMeshes(){return[];}};
  const b=attachBattleEntityVisual(m.scene,m.BABYLON,other,'enemy','p1_small',{profile});
  assert.equal(m.textures.size,1);
  m.textures.get(profile.atlasSrc).onReady();
  a.setState('attack');a.tick(100);b.tick(100);
  assert.notDeepEqual(m.meshes[0].lastUV,m.meshes[1].lastUV);
  assert.equal(m.meshes[0].material,m.meshes[1].material);
  a.dispose();b.dispose();
});

test('failed atlas loads static sprite without affecting the collider or emitting a third request',()=>{
  const m=mockBabylon();const profile=art();
  const ctrl=attachBattleEntityVisual(m.scene,m.BABYLON,m.rootMesh,'enemy','p1_small',{profile});
  m.textures.get(profile.atlasSrc).onError('bad atlas');
  assert.equal(m.textures.size,2);
  assert.ok(m.textures.has(profile.topSrc));
  m.textures.get(profile.topSrc).onReady();
  assert.equal(ctrl.mode,'sprite');
  assert.equal(m.rootMesh.position.z,4);
  assert.equal(m.rootMesh.visibility,0);
  ctrl.setState('hit');ctrl.tick(16);
  assert.equal(m.meshes[0].visibility,0.72);
  ctrl.dispose();
});

test('when both textures fail, art remains a safe noninteractive procedural fallback',()=>{
  const m=mockBabylon();const profile=art();
  const ctrl=attachBattleEntityVisual(m.scene,m.BABYLON,m.rootMesh,'enemy','p1_small',{profile});
  m.textures.get(profile.atlasSrc).onError('bad atlas');
  m.textures.get(profile.topSrc).onError('bad static');
  assert.equal(ctrl.mode,'procedural');
  assert.equal(m.rootMesh.visibility,1);
  assert.equal(m.meshes[0].isVisible,false);
  ctrl.dispose();
});

test('root disposed before image arrives cannot be recreated by a late callback',()=>{
  const m=mockBabylon();const profile=art();
  const ctrl=attachBattleEntityVisual(m.scene,m.BABYLON,m.rootMesh,'enemy','p1_small',{profile});
  m.rootMesh.gone=true;m.rootMesh.onDispose();
  m.textures.get(profile.atlasSrc).onReady();
  assert.equal(ctrl.mode,'procedural');
  assert.equal(m.meshes[0].gone,true);
});

test('scene disposal before image arrives cannot reactivate visuals',()=>{
  const m=mockBabylon();const profile=art();
  const ctrl=attachBattleEntityVisual(m.scene,m.BABYLON,m.rootMesh,'enemy','p1_small',{profile});
  m.scene.disposed=true;m.scene.onDispose();
  m.textures.get(profile.atlasSrc).onReady();
  assert.equal(ctrl.mode,'procedural');
  assert.equal(m.rootMesh.visibility,1);
  ctrl.dispose();
});

test('Campaign and Dungeon forward combat states and hand off death art to bounded visual queue',()=>{
  for(const name of ['Campaign','Dungeon']) {
    const source=fs.readFileSync(path.join(root,`src/components/${name}/${name}Scene.js`),'utf8');
    assert.match(source,/const visual = attachBattleEntityVisual\(scene, BABYLON/);
    assert.match(source,/visual, hp/);
    assert.match(source,/visual\?\.setState\('attack'\)/);
    assert.match(source,/visual\?\.setState\('hit'\)/);
    assert.match(source,/deathVisuals\.capture\(e\.visual\)/);
    assert.match(source,/visual\?\.tick\(frameFactor \* \(1000 \/ 60\)\)/);
    assert.match(source,/bossVisual\?\.setState\('attack'\)/);
    assert.match(source,/bossVisual\?\.setState\('hit'\)/);
    assert.match(source,/deathVisuals\.capture\(bossVisual\)/);
    assert.doesNotMatch(source,/artworkChangedStats\(/);
  }
});

test('visual adapter code has no server authority or economy mutations',()=>{
  const content=fs.readFileSync(path.join(root,'src/game/rendering/BattleEntityVisual.js'),'utf8');
  assert.doesNotMatch(content,/saveUserProfile|gameAction|battle\.finish|setDoc|firebase\/|wallet|reward/i);
  assert.match(content,/profile\.atlasSrc/);
  assert.match(content,/root\?\.onDisposeObservable/);
});
