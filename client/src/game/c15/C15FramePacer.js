/** Fixed 30Hz simulation pacing over a variable refresh-rate render clock. */
export const C15_SIMULATION_HZ=30;
export const C15_SIMULATION_STEP_MS=1000/C15_SIMULATION_HZ;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function createC15FramePacer({simulationHz=C15_SIMULATION_HZ,maxCatchUpSteps=3,maxFrameDeltaMs=100}={}){
  if(!finite(simulationHz)||simulationHz<1||simulationHz>240
    ||!Number.isSafeInteger(maxCatchUpSteps)||maxCatchUpSteps<1||maxCatchUpSteps>10
    ||!finite(maxFrameDeltaMs)||maxFrameDeltaMs<1||maxFrameDeltaMs>1000)
    throw new TypeError('C15 frame pacer config invalid');
  const stepMs=1000/simulationHz;let lastNow=null,accumulatorMs=0,totalDroppedMs=0;
  function reset(now=null){if(now!==null&&!finite(now))throw new TypeError('C15 frame pacer reset time invalid');
    lastNow=now;accumulatorMs=0;return Object.freeze({simulationHz,stepMs,alpha:0,steps:0,frameMs:0,droppedMs:0,totalDroppedMs});}
  function advance(now){if(!finite(now))throw new TypeError('C15 frame pacer time invalid');
    if(lastNow===null){lastNow=now;return Object.freeze({simulationHz,stepMs,alpha:0,steps:0,frameMs:0,droppedMs:0,totalDroppedMs});}
    const raw=Math.max(0,now-lastNow);lastNow=now;const frameMs=clamp(raw,0,maxFrameDeltaMs);let droppedMs=Math.max(0,raw-frameMs);
    accumulatorMs+=frameMs;let steps=0;
    while(accumulatorMs+1e-7>=stepMs&&steps<maxCatchUpSteps){accumulatorMs-=stepMs;steps++;}
    if(accumulatorMs+1e-7>=stepMs){const retained=accumulatorMs%stepMs;droppedMs+=accumulatorMs-retained;accumulatorMs=retained;}
    totalDroppedMs+=droppedMs;
    return Object.freeze({simulationHz,stepMs,alpha:clamp(accumulatorMs/stepMs,0,1),steps,frameMs,droppedMs,totalDroppedMs});
  }
  return Object.freeze({advance,reset,getState:()=>Object.freeze({simulationHz,stepMs,accumulatorMs,totalDroppedMs})});
}
