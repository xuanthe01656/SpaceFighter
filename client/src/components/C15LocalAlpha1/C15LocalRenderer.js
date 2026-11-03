/** Local-only Babylon renderer for C15 deterministic Campaign Alpha. */
import * as BABYLON from '@babylonjs/core';

const world=position=>new BABYLON.Vector3(position.xUnits/1000,.12,position.zUnits/1000);
const units=position=>Object.freeze({xUnits:Math.round(position.x*1000),zUnits:Math.round(position.z*1000)});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function material(scene,name,color,alpha=1){const mat=new BABYLON.StandardMaterial(name,scene);
  mat.emissiveColor=BABYLON.Color3.FromHexString(color);mat.diffuseColor=mat.emissiveColor;
  mat.disableLighting=true;mat.specularColor=BABYLON.Color3.Black();mat.alpha=alpha;return mat;}
function follow(mesh,target,dt,responseMs){const alpha=responseMs<=0?1:1-Math.exp(-Math.max(0,dt)/responseMs);
  BABYLON.Vector3.LerpToRef(mesh.position,target,alpha,mesh.position);}

export async function createC15LocalRenderer({canvas,backgroundUrl=null,pilotResponseMs=24,
  onMetrics=()=>{},onFrame=()=>{}}={}){
  if(!canvas)throw new TypeError('C15 renderer canvas required');
  if(!(Number.isFinite(pilotResponseMs)&&pilotResponseMs>=0&&pilotResponseMs<=250))
    throw new TypeError('C15 renderer pilot response invalid');
  const engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true});
  engine.setHardwareScalingLevel(Math.max(1,Math.min(2,globalThis.devicePixelRatio||1)));
  const scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.006,.015,.04,1);
  const camera=new BABYLON.FreeCamera('c15-camera',new BABYLON.Vector3(0,50,0),scene);
  camera.upVector=new BABYLON.Vector3(0,0,-1);camera.setTarget(BABYLON.Vector3.Zero());camera.mode=BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft=-13.2;camera.orthoRight=13.2;camera.orthoTop=15;camera.orthoBottom=-15;scene.activeCamera=camera;
  const pilotMat=material(scene,'c15-pilot','#56f2ff');const enemyMat=material(scene,'c15-enemy','#ff5f78');
  const bossMat=material(scene,'c15-boss','#ffbd4a');const shotMat=material(scene,'c15-shot','#72ffe1');
  const enemyShotMat=material(scene,'c15-enemy-shot','#ff925c');
  const pilot=BABYLON.MeshBuilder.CreateCylinder('c15-pilot',{diameterTop:0,diameterBottom:1.2,height:2.1,tessellation:3},scene);
  pilot.rotation.x=Math.PI/2;pilot.material=pilotMat;pilot.metadata={authoritativeTarget:pilot.position.clone(),previewTarget:null};
  if(backgroundUrl){
    const bgMat=new BABYLON.StandardMaterial('c15-background',scene);const texture=new BABYLON.Texture(backgroundUrl,scene,false,false);
    texture.wrapU=texture.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;bgMat.diffuseTexture=texture;bgMat.emissiveTexture=texture;
    bgMat.disableLighting=true;bgMat.specularColor=BABYLON.Color3.Black();
    const background=BABYLON.MeshBuilder.CreateGround('c15-background',{width:26.4,height:30},scene);
    background.position.y=-.35;background.material=bgMat;
  }
  const enemies=new Map(),shots=new Map(),enemyShots=new Map();let latest=null,disposed=false,lastMetricAt=performance.now(),frames=0;
  const target=(mesh,pos)=>{mesh.metadata={...(mesh.metadata||{}),target:world(pos)};};
  const createSphere=(name,mat,diameter)=>{const mesh=BABYLON.MeshBuilder.CreateSphere(name,{diameter,segments:6},scene);mesh.material=mat;return mesh;};
  function syncMap(map,values,{prefix,mat,size,enemy=false}={}){
    const alive=new Set();
    for(const value of values){const id=String(value.id);alive.add(id);let mesh=map.get(id);
      if(!mesh){mesh=createSphere(`${prefix}-${id}`,enemy&&value.kind==='boss'?bossMat:mat,size);mesh.position.copyFrom(world(value));map.set(id,mesh);}
      target(mesh,value);if(enemy&&Number.isFinite(value.hp)&&Number.isFinite(value.maxHp))mesh.scaling.setAll(clamp(.35+.65*value.hp/Math.max(1,value.maxHp),.25,1));
    }
    for(const [id,mesh] of map){if(!alive.has(id)){mesh.dispose();map.delete(id);}}
  }
  function update(view){
    if(disposed||!view||view.version!=='c15-local-world-view-v1')return;latest=view;
    pilot.metadata.authoritativeTarget=world(view.pilot);
    syncMap(enemies,view.enemies,{prefix:'c15-enemy',mat:enemyMat,size:1.25,enemy:true});
    syncMap(shots,view.projectiles,{prefix:'c15-shot',mat:shotMat,size:.34});
    syncMap(enemyShots,view.enemyProjectiles,{prefix:'c15-enemy-shot',mat:enemyShotMat,size:.42});
  }
  function previewPilot(position){if(disposed||!position||!Number.isFinite(position.xUnits)||!Number.isFinite(position.zUnits))return;
    pilot.metadata.previewTarget=world(position);}
  function clearPilotPreview(){if(!disposed)pilot.metadata.previewTarget=null;}
  engine.runRenderLoop(()=>{if(disposed)return;const dt=engine.getDeltaTime();
    const pilotTarget=pilot.metadata?.previewTarget||pilot.metadata?.authoritativeTarget||pilot.position;
    follow(pilot,pilotTarget,dt,pilotResponseMs);
    for(const map of [enemies,shots,enemyShots])for(const mesh of map.values())follow(mesh,mesh.metadata?.target||mesh.position,dt,24);
    scene.render();frames++;try{onFrame({frameMs:dt,tick:latest?.tick||0,pilotPosition:units(pilot.position)});}catch(_){}
    const now=performance.now();if(now-lastMetricAt>=1000){try{onMetrics({fps:Math.round(frames*1000/(now-lastMetricAt)),
      frameMs:dt,renderWidth:engine.getRenderWidth(),renderHeight:engine.getRenderHeight(),tick:latest?.tick||0,
      enemies:enemies.size,shots:shots.size,enemyShots:enemyShots.size,pilotResponseMs,pilotPosition:units(pilot.position)});}catch(_){}
      frames=0;lastMetricAt=now;}});
  return Object.freeze({update,previewPilot,clearPilotPreview,resize:()=>engine.resize(),dispose:()=>{if(disposed)return;disposed=true;
    engine.stopRenderLoop();scene.dispose();engine.dispose();}});
}
