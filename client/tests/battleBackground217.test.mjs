import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BATTLE_BACKGROUND_CATALOG, BATTLE_BACKGROUND_CATALOG as CATALOG,
  BACKGROUND_SCROLL_DIRECTIONS, resolveBattleBackground, resolveBackgroundAssetUrl, selectBackgroundLayers, legacyBattleBackgroundRequested } from '../src/game/catalog/BackgroundCatalog.js';
import { backgroundCoverUV, advanceBackgroundUV, advanceBackgroundScroll, createScrollingBattleBackground } from '../src/game/rendering/ScrollingBackgroundRenderer.js';

function observable() {
  const set = new Set();
  return {
    add: fn => {set.add(fn);return fn;}, remove: fn => set.delete(fn),
    fire: () => [...set].forEach(fn => fn()), size:()=>set.size,
  };
}
function mock() {
  const meshes=[],textures=[],materials=[];
  class Texture {
    static BILINEAR_SAMPLINGMODE=2;
    static WRAP_ADDRESSMODE=1;
    static CLAMP_ADDRESSMODE=0;
    constructor(url, scene, a,b,sampling,onLoad,onError) {
      Object.assign(this,{url,onLoad,onError,disposed:0}); textures.push(this);
    }
    dispose(){this.disposed++;}
  }
  class StandardMaterial {
    constructor(){this.disposed=0;materials.push(this);}
    dispose(){this.disposed++;}
  }
  class Color3 { constructor(r,g,b){Object.assign(this,{r,g,b});} }
  const BABYLON={Texture,StandardMaterial,Color3,MeshBuilder:{
    CreateGround(name,options){const mesh={name,options,position:{},scaling:{},setEnabled(enabled){this.enabled=enabled;},dispose(){this.disposed=(this.disposed||0)+1;}};meshes.push(mesh);return mesh;},
  }};
  const before=observable(),onDispose=observable(),resize=observable();
  const scene={onBeforeRenderObservable:before,onDisposeObservable:onDispose};
  const engine={
    getRenderWidth:()=>420,getRenderHeight:()=>960,getDeltaTime:()=>16.66667,
    getRenderingCanvas:()=>({getBoundingClientRect:()=>({width:420,height:960})}),
    onResizeObservable:resize,
  };
  return {BABYLON,scene,engine,before,onDispose,resize,meshes,textures,materials};
}

test('catalog selects Alpha and Nereus separately; unsupported worlds retain exact legacy starfield',()=>{
  assert.equal(resolveBattleBackground({mode:'campaign',planetId:1,stage:1}).id,'alpha_coast_demo');
  assert.equal(resolveBattleBackground({mode:'campaign',planetId:1,stage:10}).id,'alpha_coast_demo');
  assert.equal(resolveBattleBackground({mode:'dungeon',dungeonId:'dung_nereus'}).id,'nereus_ocean_demo');
  for(const id of [2,3,5]) assert.equal(resolveBattleBackground({mode:'campaign',planetId:id,stage:1}),null);
  for(const id of ['dung_taurus','dung_abaddon']) assert.equal(resolveBattleBackground({mode:'dungeon',dungeonId:id}),null);
  assert.equal(resolveBattleBackground({mode:'dungeon',dungeonId:'unknown'}),null);
});

test('catalog is immutable, ID stable, demo assets declare no license approval and have bounded mobile budgets',()=>{
  assert.equal(Object.keys(CATALOG).length,2);
  for(const item of Object.values(CATALOG)) {
    assert.ok(Object.isFrozen(item));
    assert.equal(item.status,'demo');
    assert.equal(item.licenseStatus,'prototype_only');
    assert.ok(item.layers.every(l=>Object.isFrozen(l)));
    assert.equal(selectBackgroundLayers(item,'mobileLow').length,1);
    assert.ok(selectBackgroundLayers(item,'desktop').length<=3);
  }
});

test('safe public URLs work with Vite subpaths; illegal paths fail closed',()=>{
  assert.equal(resolveBackgroundAssetUrl('/images/backgrounds/demo/alpha_coast.webp','/'),'/images/backgrounds/demo/alpha_coast.webp');
  assert.equal(resolveBackgroundAssetUrl('/images/backgrounds/demo/alpha_coast.webp','/spacefighter/'),'/spacefighter/images/backgrounds/demo/alpha_coast.webp');
  assert.equal(resolveBackgroundAssetUrl('/../../secrets.json','/'),null);
});

test('cover UV preserves aspect on responsive phone and desktop, without stretching textures',()=>{
  const mobile=backgroundCoverUV(1024,2048,430,980);
  assert.ok(mobile.uScale>0&&mobile.uScale<=1);
  assert.equal(mobile.vScale,1);
  const desktop=backgroundCoverUV(1024,2048,1920,1080);
  assert.equal(desktop.uScale,1);
  assert.ok(desktop.vScale<1);
  for (const uv of [mobile,desktop]) {
    assert.ok(uv.uOffset>=0&&uv.vOffset>=0);
    assert.ok(uv.uOffset+uv.uScale<=1.000001);
    assert.ok(uv.vOffset+uv.vScale<=1.000001);
  }
});

test('background scroll is bounded and FPS normalized, independent of gameplay delta',()=>{
  let a=0,b=0;
  for(let i=0;i<60;i++) a=advanceBackgroundUV(a,1000/60,.012);
  for(let i=0;i<120;i++) b=advanceBackgroundUV(b,1000/120,.012);
  assert.ok(Math.abs(a-b)<1e-8);
  assert.ok(Math.abs(a-.012)<1e-8);
  assert.equal(advanceBackgroundUV(.999,500,.25)<1,true);
});

test('1 image layer uses 1 noninteractive ground; no star mesh is spawned; quality does not alter combat',()=>{
  const m=mock();const cat=CATALOG.alpha_coast_demo;
  const bg=createScrollingBattleBackground({...m,config:cat,qualityId:'mobileLow',worldHalfHeight:15});
  assert.equal(m.meshes.length,1);
  assert.equal(m.textures.length,1);
  assert.ok(m.meshes[0].name.includes('battleBg'));
  assert.equal(m.meshes[0].isPickable,false);
  assert.ok(m.meshes[0].position.y<0);
  // Regression: white emissiveColor + emissiveTexture ADD together and wash out the art.
  // Check the actual StandardMaterial state, not just URL/path declarations.
  assert.deepEqual([m.materials[0].emissiveColor.r, m.materials[0].emissiveColor.g, m.materials[0].emissiveColor.b], [0,0,0]);
  assert.equal(m.materials[0].emissiveTexture, m.textures[0]);
  assert.equal(m.meshes[0].enabled, false, 'asset quad must stay hidden until WebP finishes decoding');
  assert.equal(m.textures[0].wrapV,m.BABYLON.Texture.WRAP_ADDRESSMODE);
  assert.equal(m.textures[0].wrapU,m.BABYLON.Texture.CLAMP_ADDRESSMODE);
  assert.equal(m.textures[0].url,'/images/backgrounds/demo/alpha_coast.webp');
  const before=m.textures[0].vOffset;
  m.before.fire();assert.equal(m.textures[0].vOffset,before,'do not scroll an unready texture');
  m.resize.fire();assert.ok(m.meshes[0].scaling.x>0);
  m.textures[0].onLoad();assert.equal(bg.getStats().loaded,1);assert.equal(m.meshes[0].enabled,true);
  m.before.fire();assert.notEqual(m.textures[0].vOffset,before);
  m.onDispose.fire();bg.dispose();
  assert.equal(m.meshes[0].disposed,1);
  assert.equal(m.materials[0].disposed,1);
  assert.equal(m.textures[0].disposed,1);
  assert.equal(m.before.size(),0);
  assert.equal(m.resize.size(),0);
});

test('failed texture fallback invokes legacy once; late callbacks cannot resurrect scene',()=>{
  const m=mock();let calls=0;
  const bg=createScrollingBattleBackground({...m,config:CATALOG.nereus_ocean_demo,worldHalfHeight:15,onFallback:()=>{calls++;}});
  assert.equal(m.meshes[0].enabled, false, 'image not ready cannot display a white quad');
  m.textures[0].onError('404');m.textures[0].onError('404');
  m.textures[0].onLoad(); // a late/competing success must not re-enable a failed background
  assert.equal(calls,1);
  assert.equal(bg.getStats().fallback,true);
  assert.equal(m.meshes[0].enabled,false);
  m.onDispose.fire();
  m.textures[0].onLoad();m.textures[0].onError();
  assert.equal(calls,1);
  assert.equal(bg.getStats().disposed,true);
});

test('Campaign and Dungeon keep legacy fallback and use the same renderer without new cloud writes',()=>{
  const campaign=fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js',import.meta.url),'utf8');
  const dungeon=fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js',import.meta.url),'utf8');
  for(const s of [campaign,dungeon]) {
    assert.match(s,/resolveBattleBackground\(/);
    assert.match(s,/createScrollingBattleBackground\(/);
    assert.match(s,/onFallback: createLegacyStarfield/);
    assert.match(s,/const createLegacyStarfield = \(\) =>/);
  }
  const renderer=fs.readFileSync(new URL('../src/game/rendering/ScrollingBackgroundRenderer.js',import.meta.url),'utf8');
  assert.doesNotMatch(renderer,/gameAction\(|saveUserProfile\(|battle\.finish|firestore|firebase/i);
});

test('A/B switch remains purely visual: ?bg=legacy disables demo in either scene',()=>{
  assert.equal(legacyBattleBackgroundRequested('?bg=legacy'),true);
  assert.equal(legacyBattleBackgroundRequested('?bg=catalog'),false);
  assert.equal(legacyBattleBackgroundRequested(''),false);
  for(const mode of ['Campaign','Dungeon']) {
    const scene=fs.readFileSync(new URL(`../src/components/${mode}/${mode}Scene.js`,import.meta.url),'utf8');
    assert.match(scene,/legacyBattleBackgroundRequested\(globalThis.location\?\.search\)/);
  }
});


test('both demo biomes use an emissive map without additive white; cannot render until loaded', () => {
  for (const config of [CATALOG.alpha_coast_demo, CATALOG.nereus_ocean_demo]) {
    const m = mock();
    const bg = createScrollingBattleBackground({...m, config, qualityId:'mobile', worldHalfHeight:15});
    assert.deepEqual(Object.values(m.materials[0].emissiveColor), [0,0,0]);
    assert.equal(m.materials[0].emissiveTexture, m.textures[0]);
    assert.equal(m.meshes[0].enabled, false);
    assert.equal(bg.getStats().loaded, 0);
    m.textures[0].onLoad();
    assert.equal(m.meshes[0].enabled, true);
    assert.equal(bg.getStats().loaded, 1);
    m.onDispose.fire();
  }
});
