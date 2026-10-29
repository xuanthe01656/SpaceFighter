/** Local, non-identifying QA render telemetry. Never sent over the network. */
export const C9_PERF_VERSION='c9-local-render-perf-v1';
const MAX_FRAMES=180,MAX_ACKS=16;
const avg=a=>a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length*10)/10:0;
const p95=a=>a.length?[...a].sort((x,y)=>x-y)[Math.ceil(.95*a.length)-1]:0;
const safe=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function createC9PerformanceTelemetry({clock=()=>performance.now()}={}){
  if(typeof clock!=='function')throw new TypeError('C9 perf clock');
  const frames=[],renderCpu=[],ackGaps=[];
  let lastAck=null,lastTick=null,lastPublished=null;
  let enemies=0,shots=0,enemyShots=0;
  function checkpoint(tick,counts,at=clock()){
    if(!safe(at)||!Number.isSafeInteger(tick)||tick<0||tick>4500
      ||!counts||!Number.isSafeInteger(counts.enemies)||counts.enemies<0||counts.enemies>32
      ||!Number.isSafeInteger(counts.shots)||counts.shots<0||counts.shots>128
      ||!Number.isSafeInteger(counts.enemyShots)||counts.enemyShots<0||counts.enemyShots>128)
      throw new TypeError('C9 perf checkpoint invalid');
    if(lastAck!==null&&(at<lastAck||tick<lastTick))
      throw new TypeError('C9 perf clock or tick rewind');
    if(tick===lastTick)return false;
    if(lastAck!==null){ackGaps.push(at-lastAck);if(ackGaps.length>MAX_ACKS)ackGaps.shift();}
    lastAck=at;lastTick=tick;
    enemies=counts.enemies;shots=counts.shots;enemyShots=counts.enemyShots;
    return true;
  }
  function render(frameMs,cpuMs,at=clock()){
    if(!safe(frameMs)||!safe(cpuMs)||!safe(at))return false;
    frames.push(Math.min(500,frameMs));renderCpu.push(Math.min(500,cpuMs));
    if(frames.length>MAX_FRAMES)frames.shift();
    if(renderCpu.length>MAX_FRAMES)renderCpu.shift();
    return true;
  }
  function snapshot(at=clock()){
    if(!safe(at))throw new TypeError('C9 perf clock invalid');
    const frameAvg=avg(frames);
    return Object.freeze({version:C9_PERF_VERSION,localOnly:true,networkUpload:false,
      fps:frameAvg>0?Math.round(1000/frameAvg):0,
      meanFrameMs:frameAvg,p95FrameMs:Math.round(p95(frames)*10)/10,
      meanRenderCpuMs:avg(renderCpu),
      meanAckGapMs:avg(ackGaps),
      checkpointAgeMs:lastAck===null?null:Math.max(0,Math.round(at-lastAck)),
      lastAckTick:lastTick,enemies,shots,enemyShots,sampledFrames:frames.length});
  }
  function shouldPublish(at=clock()){
    if(!safe(at))return false;
    if(lastPublished!==null&&at-lastPublished<2000)return false;
    if(!frames.length)return false;
    lastPublished=at;return true;
  }
  return Object.freeze({checkpoint,render,snapshot,shouldPublish});
}
