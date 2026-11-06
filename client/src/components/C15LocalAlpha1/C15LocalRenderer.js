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
import {attachBattleEntityVisual} from '../../game/rendering/BattleEntityVisual.js';
import {BATTLE_ANIMATION_CLIPS,BATTLE_ANIMATION_GRID} from '../../game/assets/EnemyBossAnimationCatalog.js';
import {projectileFxProfile} from '../../game/rendering/PlayerFxProfiles.js';
import {drawProjectileTexture} from '../../game/combat/ProjectileEmitter.js';
import {c15Alpha1ProjectileAppearance,c15ProjectileVisualYaw,c15NewHostileVolleySources}
  from '../../game/rendering/C15BattleVisualParity.js';
import {choosePerformancePreset,attachAdaptiveRenderQuality} from '../../game/config/PerformanceProfiles.js';

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
  const scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.006,.015,.04,1);
  // Use the SAME adaptive GPU resolution controller as Guest. This affects only
  // presentation pixels, never C15 input ticks or replayable combat state.
  const nav=globalThis.navigator||{};
  const quality=choosePerformancePreset({userAgent:nav.userAgent||'',deviceMemory:nav.deviceMemory,
    hardwareConcurrency:nav.hardwareConcurrency});
  const adaptiveQuality=attachAdaptiveRenderQuality(engine,scene,quality,globalThis.devicePixelRatio||1);
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
  const boltMaterials=new Map();
  const enemies=new Map(),shots=new Map(),enemyShots=new Map();
  // Presentation-only cues from the server-authored hostile projectile list.
  let visibleHostileIds=new Set();
  const enemyAttackUntilTick=new Map();
  let latest=null,disposed=false,lastMetricAt=performance.now(),frames=0;
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

  // The identical 4x4 animation contract and rendering adapter used by Guest.
  // The atlas URL is only the resource that C15 has already SHA-verified.
  const enemyProfile=enemyAtlasUrl?Object.freeze({
    kind:'enemy',id:'p1_small',assetId:'enemy:p1_small',atlasSrc:enemyAtlasUrl,
    topSrc:null,modelSrc:null,visual:{size:2.2,atlasGrid:BATTLE_ANIMATION_GRID,
      animations:BATTLE_ANIMATION_CLIPS,sockets:[]},
  }):null;
  function createEnemy(id,value,size){
    const boss=value.kind==='boss';
    const root=BABYLON.MeshBuilder.CreateSphere(`c15-enemy-${id}`,{diameter:boss?2.1:size,segments:boss?12:8},scene);
    root.material=boss?bossMat:enemyMat;
    root.metadata={baseSize:size,remoteAsset:Boolean(enemyProfile&&!boss)};
    if(boss){
      // Explicit procedural fallback until a boss-specific *verified* pack exists.
      // Visual-only children have no collision or damage authority.
      const ring=BABYLON.MeshBuilder.CreateTorus(`c15-boss-ring-${id}`,{diameter:3.0,thickness:.16,tessellation:16},scene);
      ring.parent=root;ring.position.y=.12;ring.material=bossMat;
      ring.isPickable=false;ring.metadata={visualOnly:true};
    }else if(enemyProfile){
      root.metadata.battleVisual=attachBattleEntityVisual(scene,BABYLON,root,'enemy','p1_small',{
        profile:enemyProfile,quality:'atlas',mobile:true});
    }
    return root;
  }
  const appearance=hostile=>{
    const key=hostile?'hostile':'friendly';
    let record=boltMaterials.get(key);
    if(record)return record;
    // Display one Guest-style red orb for hostile fire; the stage-1 signed
    // railgun uses Guest's white piercing-rail projectile appearance.
    const spec=projectileFxProfile(c15Alpha1ProjectileAppearance(hostile));
    const color=spec.color;
    let mat=null,texture=null,sprite=false;
    try{
      if(BABYLON.DynamicTexture&&BABYLON.MeshBuilder.CreatePlane){
        texture=new BABYLON.DynamicTexture(`c15-projectile:${key}`,{width:64,height:128},scene,false);
        const ctx=texture.getContext();
        if(!ctx||typeof ctx.createLinearGradient!=='function')throw new Error('No canvas texture');
        drawProjectileTexture(ctx,spec);
        texture.hasAlpha=true;texture.update(false);
        mat=new BABYLON.StandardMaterial(`c15-bolt-mat:${key}`,scene);
        mat.diffuseTexture=texture;mat.emissiveTexture=texture;
        mat.emissiveColor=BABYLON.Color3.White();mat.disableLighting=true;
        mat.useAlphaFromDiffuseTexture=true;mat.backFaceCulling=false;mat.disableDepthWrite=true;
        if(BABYLON.Material?.MATERIAL_ALPHABLEND!==undefined)
          mat.transparencyMode=BABYLON.Material.MATERIAL_ALPHABLEND;
        sprite=true;
      }
    }catch(_){mat?.dispose();texture?.dispose();mat=null;texture=null;}
    if(!mat)mat=material(scene,`c15-bolt-fallback:${key}`,`#${color.toString(16).padStart(6,'0')}`);
    record={mat,texture,spec,sprite};boltMaterials.set(key,record);return record;
  };
  function createBolt(name,size,enemy=false){
    const record=appearance(enemy);
    const mesh=record.sprite
      ?BABYLON.MeshBuilder.CreatePlane(name,{width:record.spec.width,height:record.spec.length},scene)
      :record.spec.style==='orb'
        ?BABYLON.MeshBuilder.CreateSphere(name,{diameter:record.spec.width,segments:8},scene)
        :BABYLON.MeshBuilder.CreateCylinder(name,{height:record.spec.length,diameter:record.spec.width*.42,tessellation:8},scene);
    mesh.material=record.mat;
    mesh.rotation.x=record.sprite?-Math.PI/2:record.spec.style==='orb'?0:Math.PI/2;
    mesh.rotation.y=enemy?Math.PI:0;
    mesh.metadata={baseSize:size,remoteAsset:false,sharedProjectileFx:true};
    return mesh;
  }
  function syncMap(map,values,{prefix,size,enemy=false,hostile=false}={}){
    const alive=new Set();
    for(const value of values){const id=String(value.id);alive.add(id);let visual=map.get(id);
      if(!visual){visual=enemy?createEnemy(id,value,size):createBolt(`${prefix}-${id}`,size,hostile);
        visual.position.copyFrom(world(value));map.set(id,visual);}
      target(visual,value);
      if(!enemy) visual.rotation.y=c15ProjectileVisualYaw(value,hostile);
    }
    for(const [id,visual] of map)if(!alive.has(id)){visual.metadata?.battleVisual?.dispose?.();
      visual.dispose();map.delete(id);if(enemy)enemyAttackUntilTick.delete(id);}
  }
  function update(view){
    if(disposed||!view||view.version!=='c15-local-world-view-v1')return;latest=view;
    pilot.metadata.authoritativeTarget=world(view.pilot);
    const volleyArrival=c15NewHostileVolleySources(visibleHostileIds,view.enemyProjectiles||[]);
    visibleHostileIds=volleyArrival.ids;
    for(const sourceId of volleyArrival.sources)enemyAttackUntilTick.set(sourceId,view.tick+6);
    syncMap(enemies,view.enemies,{prefix:'c15-enemy',size:1.25,enemy:true});
    syncMap(shots,view.projectiles,{prefix:'c15-shot',size:.34});
    syncMap(enemyShots,view.enemyProjectiles,{prefix:'c15-enemy-shot',size:.42,hostile:true});
    if(view.terminal)engineFx.stop();
  }
  function previewPilot(position){if(disposed||!position||!Number.isFinite(position.xUnits)||!Number.isFinite(position.zUnits))return;
    pilot.metadata.previewWorld=position;pilot.metadata.previewTarget=world(position);}
  function clearPilotPreview(){if(!disposed){pilot.metadata.previewWorld=null;pilot.metadata.previewTarget=null;}}
  engine.runRenderLoop(()=>{if(disposed)return;const dt=engine.getDeltaTime();
    const pilotTarget=pilot.metadata?.previewTarget||pilot.metadata?.authoritativeTarget||pilot.position;
    follow(pilot,pilotTarget,dt,pilotResponseMs);
    for(const map of [enemies,shots,enemyShots])for(const [id,visual] of map){
      follow(visual,visual.metadata?.target||visual.position,dt,24);
      if(map===enemies){
        const attackUntil=enemyAttackUntilTick.get(id)||-1;
        visual.metadata?.battleVisual?.setState(attackUntil>=(latest?.tick||0)?'attack':'move');
        visual.metadata?.battleVisual?.tick(dt);
      }
    }
    scene.render();frames++;try{onFrame({frameMs:dt,tick:latest?.tick||0,pilotPosition:units(pilot.position)});}catch(_){}
    const now=performance.now();if(now-lastMetricAt>=1000){try{onMetrics({fps:Math.round(frames*1000/(now-lastMetricAt)),
      frameMs:dt,renderWidth:engine.getRenderWidth(),renderHeight:engine.getRenderHeight(),tick:latest?.tick||0,
      enemies:enemies.size,shots:shots.size,enemyShots:enemyShots.size,pilotResponseMs,pilotPosition:units(pilot.position),
      remotePilot:Boolean(pilotTextureUrl),remoteEnemyAtlas:Boolean(enemyAtlasUrl),sharedEnemyVisual:true,
      sharedProjectileFx:true,sharedShipVisual:true,
      sharedBackground:Boolean(backgroundUrl),sharedThruster:true});}catch(_){}
      frames=0;lastMetricAt=now;}});
  return Object.freeze({update,previewPilot,clearPilotPreview,resize:()=>engine.resize(),dispose:()=>{if(disposed)return;disposed=true;
    engine.stopRenderLoop();adaptiveQuality.dispose();engineFx.dispose();shipVisual.dispose();
    for(const record of boltMaterials.values()){record.mat.dispose();record.texture?.dispose();}
    boltMaterials.clear();scene.dispose();engine.dispose();}});
}
