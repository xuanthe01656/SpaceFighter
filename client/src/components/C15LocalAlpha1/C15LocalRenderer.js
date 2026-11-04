/**
 * C15 deterministic Campaign presentation adapter.
 * Guest and C15 now share the ship factory, engine FX and scrolling background.
 * Every transform is driven by C15's verified world view, never by artwork.
 */
import * as BABYLON from '@babylonjs/core';
import {AIRCRAFTS} from '../../game/catalog/aircraft.js';
import {createPlayerShipVisual} from '../../game/rendering/ShipVisualFactory.js';
import {createShipEngineFx} from '../../game/rendering/ShipEngineFx.js';
import {createScrollingBattleBackground} from '../../game/rendering/ScrollingBackgroundRenderer.js';
import {resolveBattleBackground} from '../../game/catalog/BackgroundCatalog.js';
import {createC15VisualViewportV1} from '../../game/c15/C15VisualViewportV1.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function material(scene,name,color,alpha=1){const mat=new BABYLON.StandardMaterial(name,scene);
  mat.emissiveColor=BABYLON.Color3.FromHexString(color);mat.diffuseColor=mat.emissiveColor;
  mat.disableLighting=true;mat.specularColor=BABYLON.Color3.Black();mat.alpha=alpha;return mat;}
function follow(mesh,target,dt,responseMs){const alpha=responseMs<=0?1:1-Math.exp(-Math.max(0,dt)/responseMs);
  BABYLON.Vector3.LerpToRef(mesh.position,target,alpha,mesh.position);}

export async function createC15LocalRenderer({canvas,backgroundUrl=null,pilotTextureUrl=null,enemyAtlasUrl=null,arenaVisualBounds=null,pilotResponseMs=24,
  onMetrics=()=>{},onFrame=()=>{}}={}){
  if(!canvas)throw new TypeError('C15 renderer canvas required');
  if(!(Number.isFinite(pilotResponseMs)&&pilotResponseMs>=0&&pilotResponseMs<=250))
    throw new TypeError('C15 renderer pilot response invalid');
  const engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true});
  engine.setHardwareScalingLevel(Math.max(1,Math.min(2,globalThis.devicePixelRatio||1)));
  const scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.006,.015,.04,1);
  const camera=new BABYLON.FreeCamera('c15-camera',new BABYLON.Vector3(0,50,0),scene);
  camera.upVector=new BABYLON.Vector3(0,0,-1);camera.setTarget(BABYLON.Vector3.Zero());
  camera.mode=BABYLON.Camera.ORTHOGRAPHIC_CAMERA;scene.activeCamera=camera;
  // Keep the legacy camera's natural 30-world-unit vertical projection.
  // Adapt only C15 *visual* world coordinates, not the deterministic arena.
  const createViewport=()=>createC15VisualViewportV1({
    ...arenaVisualBounds,
    width:Math.max(200,canvas.getBoundingClientRect().width||engine.getRenderWidth()),
    height:Math.max(300,canvas.getBoundingClientRect().height||engine.getRenderHeight()),
  });
  let viewport=createViewport();
  const syncCamera=()=>{
    viewport=createViewport();
    camera.orthoLeft=-viewport.halfWidth;camera.orthoRight=viewport.halfWidth;
    camera.orthoTop=viewport.worldHalfHeight;camera.orthoBottom=-viewport.worldHalfHeight;
  };
  syncCamera();
  const world=position=>{const p=viewport.project(position);return new BABYLON.Vector3(p.x,.12,p.z);};
  const units=position=>Object.freeze(viewport.unproject({x:position.x,z:position.z}));
  if(backgroundUrl){
    const config=resolveBattleBackground({mode:'campaign',planetId:1,stage:1});
    if(config)createScrollingBattleBackground({BABYLON,scene,engine,config,qualityId:'mobileLow',worldHalfHeight:15,
      // URL comes only from session.resolveResource() after SHA-256 verification.
      layerUrlResolver:()=>backgroundUrl});
  }
  const aircraft=AIRCRAFTS.find(a=>a.id==='ship_xwing');
  const pilot=new BABYLON.TransformNode('c15-pilot',scene);
  const shipVisual=createPlayerShipVisual(scene,pilot,{aircraftId:'ship_xwing',aircraftCatalog:AIRCRAFTS,
    quality:'sprite',presentationTopSrc:pilotTextureUrl});
  const engineFx=createShipEngineFx({scene,BABYLON,playerRoot:pilot,aircraft,
    quality:{particleFraction:.65}});
  pilot.metadata={authoritativeTarget:pilot.position.clone(),previewTarget:null,remoteAsset:Boolean(pilotTextureUrl)};
  const enemyMat=material(scene,'c15-enemy','#ff5f78'),bossMat=material(scene,'c15-boss','#ffbd4a');
  const shotMat=material(scene,'c15-shot','#72ffe1'),enemyShotMat=material(scene,'c15-enemy-shot','#ff925c');
  const enemySpriteManager=enemyAtlasUrl?new BABYLON.SpriteManager('c15-enemy-atlas',enemyAtlasUrl,96,
    {width:128,height:128},scene,.01,BABYLON.Texture.TRILINEAR_SAMPLINGMODE):null;
  const enemies=new Map(),shots=new Map(),enemyShots=new Map();let latest=null,disposed=false,lastMetricAt=performance.now(),frames=0;
  const target=(mesh,pos)=>{mesh.metadata={...(mesh.metadata||{}),worldPosition:pos,target:world(pos)};};
  const reproject=()=>{
    if(disposed)return;
    syncCamera();
    for(const map of [enemies,shots,enemyShots])for(const visual of map.values()){
      if(visual.metadata?.worldPosition){const next=world(visual.metadata.worldPosition);
        visual.metadata.target=next;visual.position.copyFrom(next);}
    }
    if(latest?.pilot){const next=world(latest.pilot);pilot.metadata.authoritativeTarget=next;
      pilot.position.copyFrom(next);}
    if(pilot.metadata.previewWorld)pilot.metadata.previewTarget=world(pilot.metadata.previewWorld);
  };
  engine.onResizeObservable.add(reproject);
  const createBolt=(name,mat,size)=>{const mesh=BABYLON.MeshBuilder.CreateBox(name,
    {width:size*.65,height:.08,depth:size*2.5},scene);mesh.material=mat;
    mesh.metadata={baseSize:size,remoteAsset:false};return mesh;};
  const createSphere=(name,mat,diameter)=>{const mesh=BABYLON.MeshBuilder.CreateSphere(name,{diameter,segments:8},scene);mesh.material=mat;
    mesh.metadata={baseSize:diameter,remoteAsset:false};return mesh;};
  const createEnemy=(id,value,size)=>{
    if(enemySpriteManager&&value.kind!=='boss'){
      const sprite=new BABYLON.Sprite(`c15-enemy-${id}`,enemySpriteManager);sprite.width=size;sprite.height=size;
      sprite.metadata={baseSize:size,remoteAsset:true};sprite.cellIndex=3;sprite.playAnimation(3,6,true,140);return sprite;
    }
    return createSphere(`c15-enemy-${id}`,value.kind==='boss'?bossMat:enemyMat,size);
  };
  function resizeVisual(visual,scale){const base=Number(visual.metadata?.baseSize||1);
    if(visual.scaling?.setAll)visual.scaling.setAll(scale);else{visual.width=base*scale;visual.height=base*scale;}}
  function syncMap(map,values,{prefix,mat,size,enemy=false,bolt=false}={}){
    const alive=new Set();
    for(const value of values){const id=String(value.id);alive.add(id);let visual=map.get(id);
      if(!visual){visual=enemy?createEnemy(id,value,size):bolt?createBolt(`${prefix}-${id}`,mat,size)
        :createSphere(`${prefix}-${id}`,mat,size);visual.position.copyFrom(world(value));map.set(id,visual);}
      target(visual,value);if(enemy&&Number.isFinite(value.hp)&&Number.isFinite(value.maxHp))
        resizeVisual(visual,clamp(.35+.65*value.hp/Math.max(1,value.maxHp),.25,1));
    }
    for(const [id,visual] of map){if(!alive.has(id)){visual.dispose();map.delete(id);}}
  }
  function update(view){
    if(disposed||!view||view.version!=='c15-local-world-view-v1')return;latest=view;
    pilot.metadata.authoritativeTarget=world(view.pilot);
    syncMap(enemies,view.enemies,{prefix:'c15-enemy',mat:enemyMat,size:1.25,enemy:true});
    syncMap(shots,view.projectiles,{prefix:'c15-shot',mat:shotMat,size:.34,bolt:true});
    syncMap(enemyShots,view.enemyProjectiles,{prefix:'c15-enemy-shot',mat:enemyShotMat,size:.42,bolt:true});
    if(view.terminal)engineFx.stop();
  }
  function previewPilot(position){if(disposed||!position||!Number.isFinite(position.xUnits)||!Number.isFinite(position.zUnits))return;
    pilot.metadata.previewWorld=position;pilot.metadata.previewTarget=world(position);}
  function clearPilotPreview(){if(!disposed){pilot.metadata.previewWorld=null;pilot.metadata.previewTarget=null;}}
  engine.runRenderLoop(()=>{if(disposed)return;const dt=engine.getDeltaTime();
    const pilotTarget=pilot.metadata?.previewTarget||pilot.metadata?.authoritativeTarget||pilot.position;
    follow(pilot,pilotTarget,dt,pilotResponseMs);
    for(const map of [enemies,shots,enemyShots])for(const visual of map.values())follow(visual,visual.metadata?.target||visual.position,dt,24);
    scene.render();frames++;try{onFrame({frameMs:dt,tick:latest?.tick||0,pilotPosition:units(pilot.position)});}catch(_){}
    const now=performance.now();if(now-lastMetricAt>=1000){try{onMetrics({fps:Math.round(frames*1000/(now-lastMetricAt)),
      frameMs:dt,renderWidth:engine.getRenderWidth(),renderHeight:engine.getRenderHeight(),tick:latest?.tick||0,
      enemies:enemies.size,shots:shots.size,enemyShots:enemyShots.size,pilotResponseMs,pilotPosition:units(pilot.position),
      remotePilot:Boolean(pilotTextureUrl),remoteEnemyAtlas:Boolean(enemyAtlasUrl),sharedShipVisual:true,
      sharedBackground:Boolean(backgroundUrl),sharedThruster:true});}catch(_){}
      frames=0;lastMetricAt=now;}});
  return Object.freeze({update,previewPilot,clearPilotPreview,resize:()=>engine.resize(),dispose:()=>{if(disposed)return;disposed=true;
    engine.stopRenderLoop();engineFx.dispose();shipVisual.dispose();scene.dispose();engine.dispose();}});
}
