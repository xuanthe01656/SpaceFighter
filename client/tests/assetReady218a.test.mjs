import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_VISUAL_PROFILES, resolveAssetVisual, assetDeliveryPaths, isKnownAsset } from '../src/game/assets/AssetRegistry.js';
import { makeAssetPlaceholder } from '../src/game/assets/AssetPlaceholder.js';
import { attachBattleEntityVisual } from '../src/game/rendering/BattleEntityVisual.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('all gameplay entities have unique stable visual contracts', () => {
  assert.ok(ALL_VISUAL_PROFILES.length >= 101, 'baseline IDs must remain registered');
  const keys = ALL_VISUAL_PROFILES.map(p => p.assetId);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of ALL_VISUAL_PROFILES) {
    assert.equal(p.assetId, `${p.kind}:${p.id}`);
    assert.match(p.paths.icon, /^\/images\/visuals\/[a-z_]+\/[a-z0-9_]+\.webp$/);
    assert.equal(p.visual.orientation, 'nose-negative-z');
    assert.ok(p.visual.size > 0);
  }
  for (const kind of ['ship','pilot','equipment','enemy','boss','dungeon_enemy','dungeon_boss','projectile','effect']) {
    assert.ok(ALL_VISUAL_PROFILES.some(p=>p.kind===kind));
  }
});
test('missing art yields per-ID fallback; canonical art can be replaced without changing scene code', () => {
  const kind = 'enemy'; const id = 'p1_small';
  // Simulate absent delivery independently of installed optional atlas files.
  const original = resolveAssetVisual(kind,id,new Set());
  assert.equal(original.state, 'placeholder');
  const pathToDeliver = assetDeliveryPaths(kind,id).top;
  const official = resolveAssetVisual(kind,id,new Set([pathToDeliver]));
  assert.equal(official.topSrc,pathToDeliver);
  assert.equal(official.state,'asset-present');
  assert.equal(original.assetId, official.assetId);
  assert.equal(original.visual.size, official.visual.size);
  assert.equal(isKnownAsset(kind,id),true);
  assert.equal(resolveAssetVisual(kind,'some_unknown'),null);
  assert.equal(resolveAssetVisual('enemy','../../oops'),null);
});
test('every placeholder contains its unique ID and needs no HTTP request', () => {
  const a=makeAssetPlaceholder('equipment','gun_laser','#ff5566');
  const b=makeAssetPlaceholder('equipment','gun_plasma','#ff5566');
  assert.match(a,/^data:image\/svg\+xml/);
  assert.notEqual(a,b);
  assert.match(decodeURIComponent(a),/GUN_LASER/);
  assert.ok(a.startsWith('data:image/svg+xml')); // embedded xmlns is not a network request
});
test('runtime keeps existing enemy collision mesh when visual is unavailable',()=>{
  const rootMesh = { disposed:false, getChildMeshes:()=>[], isDisposed(){return this.disposed;}, visibility:1 };
  const out=attachBattleEntityVisual({}, {}, rootMesh,'enemy','p1_small',{
    profile:resolveAssetVisual('enemy','p1_small',new Set()),
  });
  assert.equal(out.mode,'procedural');
  assert.equal(rootMesh.visibility,1);
  out.dispose();
});
test('both battle scenes call visual attachment, without changing collision or authority', () => {
  for (const scene of ['Campaign','Dungeon']) {
    const src=fs.readFileSync(path.join(root,`src/components/${scene}/${scene}Scene.js`),'utf8');
    assert.match(src,/attachBattleEntityVisual\(scene, BABYLON/);
  }
  const factory=fs.readFileSync(path.join(root,'src/game/rendering/BattleEntityVisual.js'),'utf8');
  assert.doesNotMatch(factory,/battle\.finish|saveUserProfile|setDoc|gameAction|firebase/i);
});
test('manifest includes existing local art and no fabricated missing paths', () => {
  const { AVAILABLE_ASSET_PATHS } = awaitManifest();
  assert.ok(AVAILABLE_ASSET_PATHS.length > 0);
  for (const pathname of AVAILABLE_ASSET_PATHS) {
    assert.ok(fs.existsSync(path.join(root,'public',pathname.slice(1))), pathname);
  }
});
import { AVAILABLE_ASSET_PATHS } from '../src/game/assets/AssetAvailability.generated.js';
function awaitManifest(){ return { AVAILABLE_ASSET_PATHS }; }

test('successful sprite loading changes only presentation; failed loading leaves gameplay root intact', () => {
  let onTextureReady, onTextureError;
  const madeMeshes=[];
  class Color3 { constructor(r,g,b){this.r=r;this.g=g;this.b=b;} }
  class StandardMaterial { constructor(n){this.name=n;} }
  class Texture { static BILINEAR_SAMPLINGMODE=2; constructor(url,scene,noMips,invert,sampling,onReady,onError){ onTextureReady=onReady; onTextureError=onError; } }
  const BABYLON={ Color3, StandardMaterial, Texture, MeshBuilder:{CreatePlane(name){const mesh={name,position:{y:0},rotation:{x:0,z:0},isDisposed(){return false;},dispose(){this.gone=true;}};madeMeshes.push(mesh);return mesh;}}};
  const scene={isDisposed(){return false;},onDisposeObservable:{addOnce(){}}};
  const child={visibility:1,isDisposed(){return false;}};
  const gameRoot={visibility:1,getChildMeshes(){return [child];},isDisposed(){return false;},position:{x:10,z:4}};
  const profile={assetId:'enemy:p1_small',topSrc:'/images/visuals/enemy/p1_small_top.webp',visual:{size:2.2}};
  const inst=attachBattleEntityVisual(scene,BABYLON,gameRoot,'enemy','p1_small',{profile});
  assert.equal(gameRoot.visibility,1);
  assert.equal(inst.mode,'procedural');
  onTextureReady();
  assert.equal(inst.mode,'sprite');
  assert.equal(gameRoot.visibility,0);
  assert.equal(child.visibility,0);
  assert.equal(madeMeshes[0].parent,gameRoot);
  assert.equal(gameRoot.position.x,10);
  inst.dispose();
  assert.equal(gameRoot.visibility,1);
  assert.equal(child.visibility,1);
  assert.equal(madeMeshes[0].gone,true);
  const otherRoot={visibility:1,getChildMeshes(){return[];},isDisposed(){return false;}};
  const failing=attachBattleEntityVisual(scene,BABYLON,otherRoot,'enemy','p1_small',{profile});
  // The same texture has loaded already in this scene. New sprite reuses its material.
  assert.equal(failing.mode,'sprite');
  failing.dispose();
  const failedScene={isDisposed(){return false;},onDisposeObservable:{addOnce(){}}};
  const failedRoot={visibility:1,getChildMeshes(){return[];},isDisposed(){return false;}};
  const failed=attachBattleEntityVisual(failedScene,BABYLON,failedRoot,'enemy','p1_small',{profile});
  onTextureError('corrupt WebP');
  assert.equal(failed.mode,'procedural');
  assert.equal(failedRoot.visibility,1);
  failed.dispose();
});
