/**
 * C9 non-economic Babylon visualization of server-authored Cloud Alpha 1 QA.
 * NO local enemy AI, fire cadence, collisions, death/clear decisions or payout.
 * Geometry is procedural diagnostic art; this does not replace Campaign assets.
 * Imported dynamically only for manually enabled C9 Cloud QA APKs.
 */
import * as BABYLON from '@babylonjs/core';
import {toC9ServerEntityWorld,chooseC9PilotDisplay,c9VisualSmoothingAlpha}
  from '../../game/combat/C9VisualProjection.js';
const MAX_ENEMIES=32,MAX_SHOTS=128;
const bound=(n,min,max)=>Math.max(min,Math.min(max,n));
const loc=o=>{const p=toC9ServerEntityWorld(o);return new BABYLON.Vector3(p.x,p.y,p.z);};
const material=(scene,name,hex)=>{
  const m=new BABYLON.StandardMaterial(name,scene);
  m.diffuseColor=BABYLON.Color3.FromHexString(hex);
  m.emissiveColor=BABYLON.Color3.FromHexString(hex).scale(.65);
  m.specularColor=new BABYLON.Color3(0,0,0);
  m.disableLighting=true;
  return m;
};
export function createBabylonServerRendererC9({canvas,onFault=()=>{}}={}){
  if(!canvas||typeof onFault!=='function')throw new TypeError('C9 canvas required');
  let engine=null,scene=null,disposed=false,lost=false;
  const events=[];
  const disposeMesh=m=>{if(m){m.material=null;m.dispose();}};
  try{
    engine=new BABYLON.Engine(canvas,true,{stencil:false,preserveDrawingBuffer:false,
      antialias:true,doNotHandleContextLost:false},false);
    engine.setHardwareScalingLevel(Math.max(1,Math.min(2,globalThis.devicePixelRatio||1)));
    scene=new BABYLON.Scene(engine);
    scene.clearColor=new BABYLON.Color4(.008,.018,.055,1);
    const camera=new BABYLON.FreeCamera('c9-qa-camera',new BABYLON.Vector3(0,50,0),scene);
    camera.upVector=new BABYLON.Vector3(0,0,-1);
    camera.setTarget(new BABYLON.Vector3(0,0,0));
    camera.mode=BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    scene.activeCamera=camera;
    const matPilot=material(scene,'c9-pilot','#64edff');
    const matGhost=material(scene,'c9-server-reference','#377c89');
    matGhost.alpha=.5;
    const matEnemy=material(scene,'c9-enemy','#ff657b');
    const matShot=material(scene,'c9-shot','#65ffe0');
    const matEnemyShot=material(scene,'c9-enemy-shot','#ffb85c');
    const matGrid=material(scene,'c9-grid','#1d3b59');
    const pilot=BABYLON.MeshBuilder.CreateCylinder('c9-displayed-predicted-pilot',{
      diameterTop:0,diameterBottom:1.35,height:2.3,tessellation:3},scene);
    pilot.rotation.x=Math.PI/2;pilot.material=matPilot;
    const ghost=pilot.clone('c9-authoritative-server-reference');ghost.material=matGhost;
    ghost.isVisible=false;
    const enemies=new Map(),shots=[],enemyShots=[],lines=[];
    const createSphere=(name,mat,r)=>{
      const mesh=BABYLON.MeshBuilder.CreateSphere(name,{diameter:r*2,segments:6},scene);
      mesh.material=mat;mesh.position.y=.14;return mesh;
    };
    const cameraFit=config=>{
      camera.orthoLeft=-config.arenaHalfWidth/1000;
      camera.orthoRight=config.arenaHalfWidth/1000;
      camera.orthoTop=config.arenaHalfHeight/1000;
      camera.orthoBottom=-config.arenaHalfHeight/1000;
    };
    const makeGrid=config=>{
      for(const l of lines)disposeMesh(l);lines.length=0;
      const w=config.arenaHalfWidth/1000,h=config.arenaHalfHeight/1000;
      for(let k=-4;k<=4;k++){
        const x=k*w/4,z=k*h/4;
        const row=BABYLON.MeshBuilder.CreateLines(`c9-gridrow-${k}`,
          {points:[new BABYLON.Vector3(-w,-.12,z),new BABYLON.Vector3(w,-.12,z)]},scene);
        const col=BABYLON.MeshBuilder.CreateLines(`c9-gridcol-${k}`,
          {points:[new BABYLON.Vector3(x,-.12,-h),new BABYLON.Vector3(x,-.12,h)]},scene);
        row.color=matGrid.diffuseColor;col.color=matGrid.diffuseColor;
        lines.push(row,col);
      }
    };
    let configHash=null,displayedTarget=null;
    function update(frame){
      if(disposed||!frame)return;
      if(frame.version!=='c9-server-checkpoint-babylon-qa-v1'
        ||frame.qaOnly!==true||frame.settlementEnabled!==false
        ||frame.productionOutcomeIssued!==false)throw new TypeError('C9 unsafe scene frame');
      const key=`${frame.config.arenaHalfWidth}:${frame.config.arenaHalfHeight}`;
      if(key!==configHash){cameraFit(frame.config);makeGrid(frame.config);configHash=key;}
      // Show local, bounded 30Hz prediction as the responsive bright ship.
      // The server-authoritative pilot remains a dim reference, never an input.
      const display=chooseC9PilotDisplay(frame);
      const nextTarget=loc(display.primary);
      if(displayedTarget===null)pilot.position.copyFrom(nextTarget);
      displayedTarget=nextTarget;
      ghost.isVisible=Boolean(display.serverReference);
      if(ghost.isVisible)ghost.position=loc(display.serverReference);
      const current=new Set();
      for(const e of frame.enemies.slice(0,MAX_ENEMIES)){
        current.add(e.id);
        let m=enemies.get(e.id);
        if(!m){m=createSphere(`c9-server-enemy-${e.id}`,matEnemy,.75);enemies.set(e.id,m);}
        m.position=loc(e);
        m.scaling.setAll(bound(.35+.65*e.hp/Math.max(1,e.maxHp),.2,1));
      }
      for(const [id,m] of enemies){if(!current.has(id)){disposeMesh(m);enemies.delete(id);}}
      const batch=(list,source,mat,prefix,rad)=>{
        const capped=source.slice(0,MAX_SHOTS);
        while(list.length<capped.length)list.push(createSphere(`${prefix}-${list.length}`,mat,rad));
        for(let i=0;i<list.length;i++){
          const m=list[i];m.isVisible=i<capped.length;
          if(m.isVisible)m.position=loc(capped[i]);
        }
      };
      batch(shots,frame.shots,matShot,'c9-shot',.23);
      batch(enemyShots,frame.enemyShots,matEnemyShot,'c9-enemy-shot',.3);
    }
    const lostHandler=e=>{e.preventDefault();if(!disposed){lost=true;onFault('C9_WEBGL_CONTEXT_LOST');}};
    canvas.addEventListener('webglcontextlost',lostHandler,false);
    events.push(()=>canvas.removeEventListener('webglcontextlost',lostHandler));
    engine.runRenderLoop(()=>{
      if(disposed||lost)return;
      if(displayedTarget){
        // A 22ms visual-only lag smooths 30Hz samples across render frames.
        const elapsed=Math.max(0,engine.getDeltaTime());
        const alpha=c9VisualSmoothingAlpha(elapsed);
        BABYLON.Vector3.LerpToRef(pilot.position,displayedTarget,alpha,pilot.position);
      }
      scene.render();
    });
    return Object.freeze({update,resize:()=>{if(!disposed)engine.resize();},dispose:()=>{
      if(disposed)return;disposed=true;events.forEach(fn=>fn());
      engine?.stopRenderLoop();scene?.dispose();engine?.dispose();
    }});
  }catch(error){
    if(!disposed){disposed=true;events.forEach(fn=>fn());
      try{scene?.dispose();engine?.dispose();}catch(_){}
    }
    throw error;
  }
}
