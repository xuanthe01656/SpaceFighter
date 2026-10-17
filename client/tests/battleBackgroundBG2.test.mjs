import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BACKGROUND_CATALOG_VERSION, BATTLE_BACKGROUND_CATALOG,
  BACKGROUND_SCROLL_DIRECTIONS, resolveBattleBackground, resolveStageBackgroundId,
} from '../src/game/catalog/BackgroundCatalog.js';
import {
  advanceBackgroundScroll, createScrollingBattleBackground,
} from '../src/game/rendering/ScrollingBackgroundRenderer.js';
import {
  backgroundPerfRequested, frameP95,
  summarizeBackgroundFrames, attachBattleBackgroundProfiler,
} from '../src/game/rendering/BattleBackgroundProfiler.js';

function observable() {
  const listeners = new Set();
  return {add: fn => {listeners.add(fn);return fn;}, remove: fn => listeners.delete(fn),
    fire:()=>[...listeners].forEach(fn=>fn()), size:()=>listeners.size};
}
function mock({renderHeight=980,renderWidth=430,cssHeight=980,cssWidth=430}={}) {
  const textures=[],meshes=[],materials=[];
  class Texture {
    static BILINEAR_SAMPLINGMODE=2;
    static WRAP_ADDRESSMODE=1;
    static CLAMP_ADDRESSMODE=0;
    constructor(url, scene, mips, invert, sampling, onLoad, onError) {
      Object.assign(this,{url,onLoad,onError,disposed:0}); textures.push(this);
    }
    dispose(){this.disposed++;}
  }
  class StandardMaterial {constructor(){materials.push(this);}dispose(){this.disposed=(this.disposed||0)+1;}}
  class Color3 {constructor(r,g,b){Object.assign(this,{r,g,b});}}
  const BABYLON={Texture,StandardMaterial,Color3,MeshBuilder:{CreateGround(name){
    const mesh={name,position:{},scaling:{},setEnabled(v){this.enabled=v;},dispose(){this.disposed=true;}};
    meshes.push(mesh);return mesh;
  }}};
  const before=observable(),after=observable(),onDispose=observable(),resize=observable();
  const scene={onBeforeRenderObservable:before,onAfterRenderObservable:after,onDisposeObservable:onDispose,
    meshes, textures, particleSystems:[],getActiveMeshes:()=>meshes.filter(m=>m.enabled)};
  let screen={renderHeight,renderWidth,cssHeight,cssWidth};
  const engine={getRenderWidth:()=>screen.renderWidth,getRenderHeight:()=>screen.renderHeight,
    getRenderingCanvas:()=>({getBoundingClientRect:()=>({width:screen.cssWidth,height:screen.cssHeight})}),
    getDeltaTime:()=>1000/60,getFps:()=>60,onResizeObservable:resize};
  return {BABYLON,scene,engine,before,after,onDispose,resize,textures,meshes,materials,screen};
}

const small=(a,b)=>Math.abs(a-b)<1e-8;

test('BG.2 catalog declares forward-ground scroll, reviewed repeat edges and remains immutable',()=>{
  assert.equal(BACKGROUND_CATALOG_VERSION,'1.1.0');
  for(const [id,config] of Object.entries(BATTLE_BACKGROUND_CATALOG)) {
    assert.equal(config.scrollDirection,BACKGROUND_SCROLL_DIRECTIONS.TOWARD_PLAYER);
    assert.ok(config.layers.every(l=>l.seamlessY===true&&l.scrollCssPixelsPerSecond>0));
    assert.equal(config.licenseStatus,'prototype_only');
    assert.equal(Object.isFrozen(config),true);
    assert.equal(resolveBattleBackground({variantId:id}),config);
  }
  assert.equal(resolveBattleBackground({mode:'campaign',planetId:1,stage:15})?.id,'alpha_coast_demo');
  assert.equal(resolveBattleBackground({mode:'dungeon',dungeonId:'dung_nereus'})?.id,'nereus_ocean_demo');
});

test('exact-stage art overrides stage ranges and defaults for scalable campaign maps',()=>{
  const binding={defaultId:'alpha_coast_demo',stages:{3:'stage_3'},stageRanges:[
    {from:1,to:5,id:'region_1'}, {from:6,to:10,id:'region_2'},
  ]};
  assert.equal(resolveStageBackgroundId(binding,1),'region_1');
  assert.equal(resolveStageBackgroundId(binding,3),'stage_3');
  assert.equal(resolveStageBackgroundId(binding,8),'region_2');
  assert.equal(resolveStageBackgroundId(binding,11),'alpha_coast_demo');
  assert.equal(resolveStageBackgroundId(binding,null),'alpha_coast_demo');
});

test('toward-player scroll direction is opposite previous BG.1 and maintains modulo continuity',()=>{
  const args=[0,100,12,1000,1];
  assert.ok(small(advanceBackgroundScroll(...args,'toward-player'),.9988));
  assert.ok(small(advanceBackgroundScroll(...args,'away-from-player'),.0012));
  assert.ok(small(advanceBackgroundScroll(.3,100,30,1000,1,'static'),.3));
  let a=0,b=0,c=0;
  for(let i=0;i<60;i++)a=advanceBackgroundScroll(a,1000/60,12,980,1,'toward-player');
  for(let i=0;i<120;i++)b=advanceBackgroundScroll(b,1000/120,12,980,1,'toward-player');
  for(let i=0;i<30;i++)c=advanceBackgroundScroll(c,1000/30,12,980,1,'toward-player');
  assert.ok(small(a,b)&&small(b,c));
  assert.ok(small(a,1-12/980));
  for(const p of [.000001,.999999,.5]){
    const out=advanceBackgroundScroll(p,100,300,300,.5,'toward-player');
    assert.ok(out>=0&&out<1);
  }
});

test('GPU DPR downscaling does not change CSS-pixel scroll speed; resize retains phase',()=>{
  const cfg=BATTLE_BACKGROUND_CATALOG.alpha_coast_demo;
  const one=mock();
  const two=mock({renderHeight:490,renderWidth:215});
  const a=createScrollingBattleBackground({...one,config:cfg,worldHalfHeight:15});
  const b=createScrollingBattleBackground({...two,config:cfg,worldHalfHeight:15});
  one.textures[0].onLoad();two.textures[0].onLoad();
  for(let i=0;i<60;i++) {one.before.fire();two.before.fire();}
  assert.ok(small(a.getStats().scrollOffsets[0].v,b.getStats().scrollOffsets[0].v));
  const previous=a.getStats().scrollOffsets[0].v;
  one.screen.renderWidth=600;one.screen.renderHeight=600;
  one.screen.cssWidth=600;one.screen.cssHeight=600;
  one.resize.fire();
  assert.ok(small(previous,a.getStats().scrollOffsets[0].v));
  one.onDispose.fire();two.onDispose.fire();
});

test('base load timeout returns to old starfield once; no white quad or late callbacks',()=>{
  const m=mock();let fallbacks=0;
  const bg=createScrollingBattleBackground({...m,config:BATTLE_BACKGROUND_CATALOG.alpha_coast_demo,
    worldHalfHeight:15,onFallback:()=>{fallbacks++;}});
  assert.equal(m.meshes[0].enabled,false);
  for(let i=0;i<950;i++)m.before.fire(); // 15.8 seconds
  assert.equal(fallbacks,1);
  assert.equal(bg.getStats().fallback,true);
  m.textures[0].onLoad();m.textures[0].onError('late failure');
  assert.equal(m.meshes[0].enabled,false);
  m.onDispose.fire();bg.dispose();assert.equal(m.textures[0].disposed,1);
});

test('missing optional overlay does not replace a working base with hundreds of legacy stars',()=>{
  const config={...BATTLE_BACKGROUND_CATALOG.nereus_ocean_demo,
    layerLimit:{desktop:2,mobile:2,mobileLow:1},
    layers:[...BATTLE_BACKGROUND_CATALOG.nereus_ocean_demo.layers,
      {id:'clouds',role:'overlay',src:'/images/backgrounds/demo/nereus_ocean.webp',imageWidth:1024,imageHeight:2048,
       scrollCssPixelsPerSecond:3,opacity:.25,priority:1}],
  };
  const m=mock();let legacyCalls=0;
  const bg=createScrollingBattleBackground({...m,config,qualityId:'desktop',worldHalfHeight:15,onFallback:()=>legacyCalls++});
  assert.equal(m.meshes.length,2);
  m.textures[0].onLoad();m.textures[1].onError('optional 404');
  assert.equal(m.meshes[0].enabled,true);
  assert.equal(m.meshes[1].enabled,false);
  assert.equal(legacyCalls,0);
  assert.deepEqual(bg.getStats().errors,['optional-layer-failed:clouds']);
  m.onDispose.fire();
  assert.ok(m.textures.every(x=>x.disposed===1));
});

test('debug profiler uses opt-in only, p95 and bounded history, no user data',()=>{
  assert.equal(backgroundPerfRequested('?bgPerf=1'),true);
  assert.equal(backgroundPerfRequested('?bg=legacy&bgPerf=1'),true);
  assert.equal(backgroundPerfRequested('?bgPerf=0'),false);
  assert.equal(frameP95([1,2,3,4,100]),100);
  const data=summarizeBackgroundFrames([{frameMs:16,fps:60,activeMeshes:10,drawCalls:3},{frameMs:20,fps:50,activeMeshes:14,drawCalls:5}]);
  assert.equal(data.frameMsP95,20);
  assert.equal(data.drawCallsAverage,4);
  const m=mock();const host={performance:{memory:{usedJSHeapSize:2*1048576}}};
  assert.equal(attachBattleBackgroundProfiler({...m,host,mode:'campaign',queryString:''}),null);
  const probe=attachBattleBackgroundProfiler({...m,host,mode:'campaign',backgroundId:'alpha_coast_demo',queryString:'?bgPerf=1'});
  assert.ok(probe);
  m.after.fire();m.after.fire();
  assert.equal(host.__SF_BG_PERF__.snapshot().samples,2);
  assert.equal(host.__SF_BG_PERF__.snapshot().fpsAverage,60);
  assert.equal(host.__SF_BG_PERF__.snapshot().jsHeapMiBLast,2);
  assert.equal(m.after.size(),1);
  m.onDispose.fire();
  assert.equal(m.after.size(),0);
  assert.equal(host.__SF_BG_PERF__.snapshot().samples,2);
  assert.ok(!JSON.stringify(host.__SF_BG_PERF__.snapshot()).includes('uid'));
});

test('profiler is loaded by Campaign and Dungeon without affecting combat authority',()=>{
  for(const scene of ['Campaign','Dungeon']){
    const data=fs.readFileSync(new URL(`../src/components/${scene}/${scene}Scene.js`,import.meta.url),'utf8');
    assert.match(data,/attachBattleBackgroundProfiler\(/);
    assert.match(data,/createScrollingBattleBackground\(/);
  }
  const profiler=fs.readFileSync(new URL('../src/game/rendering/BattleBackgroundProfiler.js',import.meta.url),'utf8');
  const executable = profiler.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
  assert.doesNotMatch(executable,/firestore|firebase|battle\.finish|localStorage|gameAction|sendBeacon/i);
});
