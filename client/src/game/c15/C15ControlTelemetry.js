/** Aggregate, identity-free RC5 control/frame-pacing telemetry for device QA. */
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);
  return Math.round(sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))]*10)/10;};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const cap=(list,value,max=1200)=>{if(finite(value)){list.push(value);if(list.length>max)list.shift();}};
const position=value=>value&&finite(value.xUnits)&&finite(value.zUnits)?value:null;
const moved=(left,right)=>left&&right&&(left.xUnits!==right.xUnits||left.zUnits!==right.zUnits);

export function createC15ControlTelemetry({profileId,clock=()=>performance.now()}={}){
  if(typeof profileId!=='string'||!profileId||typeof clock!=='function')throw new TypeError('C15 control telemetry config invalid');
  const inputToAuthority=[],inputToVisible=[],targetGaps=[],catchUps=[],renderFrames=[],simulationFrames=[],droppedFrames=[];
  const pointerMetrics=Object.create(null);let pending=null,lastAuthority=null,lastPresented=null,lastRenderFps=null,targets=0;
  function markTarget(view){const now=clock(),currentPosition=position(view?.position);targets++;
    if(!pending)pending={startedAt:now,initialGap:Number(view?.targetGapUnits)||0,initialAuthority:currentPosition,
      initialPresented:lastPresented,authorityAt:null,visibleAt:null};
    else pending.initialGap=Math.max(pending.initialGap,Number(view?.targetGapUnits)||0);
    lastAuthority=currentPosition||lastAuthority;
  }
  function observeTick(view){const now=clock(),currentPosition=position(view?.position);cap(targetGaps,Number(view?.targetGapUnits));
    if(pending&&currentPosition){if(pending.authorityAt===null&&moved(pending.initialAuthority,currentPosition)){
        pending.authorityAt=now;cap(inputToAuthority,now-pending.startedAt);}
      const threshold=Math.max(150,pending.initialGap*.08);if(pending.authorityAt!==null&&Number(view?.targetGapUnits)<=threshold){
        cap(catchUps,now-pending.startedAt);pending=null;}}
    lastAuthority=currentPosition||lastAuthority;
  }
  function observePresentation(metrics){if(!metrics||typeof metrics!=='object')return;
    if(finite(metrics.frameMs))cap(renderFrames,metrics.frameMs);
    if(finite(metrics.fps))lastRenderFps=metrics.fps;
    const shown=position(metrics.pilotPosition);if(pending&&shown&&pending.visibleAt===null
      &&moved(pending.initialPresented||pending.initialAuthority,shown)){
      pending.visibleAt=clock();cap(inputToVisible,pending.visibleAt-pending.startedAt);}
    lastPresented=shown||lastPresented;
  }
  function observeFramePacing(metrics){if(!metrics||typeof metrics!=='object')return;
    if(finite(metrics.frameMs))cap(simulationFrames,metrics.frameMs);
    if(finite(metrics.droppedMs)&&metrics.droppedMs>0)cap(droppedFrames,metrics.droppedMs);
  }
  function recordPointerEvent(name){if(typeof name!=='string'||!/^[a-z0-9-]{1,48}$/.test(name))return;
    pointerMetrics[name]=(pointerMetrics[name]||0)+1;}
  function observeRender(metrics){observePresentation(metrics);}
  function report(){return Object.freeze({version:'c15-control-feel-v2',localOnly:true,networkUpload:false,
    containsIdentity:false,containsRawInput:false,profileId,inputToVisibleP50Ms:percentile(inputToVisible,.5),
    inputToVisibleP95Ms:percentile(inputToVisible,.95),inputToAuthorityP95Ms:percentile(inputToAuthority,.95),
    targetGapP50Units:percentile(targetGaps,.5),targetGapP95Units:percentile(targetGaps,.95),
    catchUpP95Ms:percentile(catchUps,.95),renderP95Ms:percentile(renderFrames,.95),renderFps:lastRenderFps,
    simulationFrameP95Ms:percentile(simulationFrames,.95),droppedFrameP95Ms:percentile(droppedFrames,.95),
    pointerEvents:Object.freeze({...pointerMetrics}),simulationHz:30,targetEvents:targets,
    sampledTicks:targetGaps.length,sampledFrames:renderFrames.length});}
  return Object.freeze({markTarget,observeTick,observePresentation,observeFramePacing,observeRender,recordPointerEvent,report});
}
