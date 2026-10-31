/** Aggregate, identity-free control feel telemetry for manual RC1C device QA. */
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);
  return Math.round(sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))]*10)/10;};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const cap=(list,value,max=600)=>{if(finite(value)){list.push(value);if(list.length>max)list.shift();}};
export function createC15ControlTelemetry({profileId,clock=()=>performance.now()}={}){
  if(typeof profileId!=='string'||!profileId||typeof clock!=='function')throw new TypeError('C15 control telemetry config invalid');
  const inputToMotion=[],targetGaps=[],catchUps=[],renderFrames=[];let pending=null,lastPosition=null,lastRenderFps=null,targets=0;
  function markTarget(view){const now=clock();targets++;
    if(!pending)pending={startedAt:now,initialGap:view.targetGapUnits,motionAt:null};
    else pending.initialGap=Math.max(pending.initialGap,view.targetGapUnits);
    lastPosition=view.position;}
  function observeTick(view){const now=clock();cap(targetGaps,view.targetGapUnits);if(pending){const moved=lastPosition
      &&(view.position.xUnits!==lastPosition.xUnits||view.position.zUnits!==lastPosition.zUnits);
    if(moved&&pending.motionAt===null){pending.motionAt=now;cap(inputToMotion,now-pending.startedAt);}
    const threshold=Math.max(150,pending.initialGap*.15);if(pending.motionAt!==null&&view.targetGapUnits<=threshold){cap(catchUps,now-pending.startedAt);pending=null;}}
    lastPosition=view.position;}
  function observeRender(metrics){if(!metrics||typeof metrics!=='object')return;if(finite(metrics.frameMs))cap(renderFrames,metrics.frameMs,1200);
    if(finite(metrics.fps))lastRenderFps=metrics.fps;}
  function report(){return Object.freeze({version:'c15-control-feel-v1',localOnly:true,networkUpload:false,
    containsIdentity:false,containsRawInput:false,profileId,inputToMotionP95Ms:percentile(inputToMotion,.95),
    targetGapP50Units:percentile(targetGaps,.5),targetGapP95Units:percentile(targetGaps,.95),
    catchUpP95Ms:percentile(catchUps,.95),renderP95Ms:percentile(renderFrames,.95),renderFps:lastRenderFps,
    simulationHz:30,targetEvents:targets,sampledTicks:targetGaps.length,sampledFrames:renderFrames.length});}
  return Object.freeze({markTarget,observeTick,observeRender,report});
}
