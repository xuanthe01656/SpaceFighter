/**
 * C7-C2BC opt-in, local-only Android/iOS touch evidence recorder.
 * No Firebase/HTTP/auth, no rewards, no controller writes and no victory proofs.
 * Capture current Guest pointer motion on a 30Hz diagnostic clock, then compare
 * three PROVISIONAL Cloud release policies against measured ship positions.
 * The release policy remains UNDECIDED and device traces are NOT attestation.
 */
import { compareTouchReleaseCandidates } from './CloudTouchReleaseCandidateV8.js';
import { runCloudTouchUxParityProbe } from './CloudTouchUxParityProbeV8.js';

export const TOUCH_EVIDENCE_VERSION = 'sf-c7c2bc-native-touch-evidence-v1';
export const TOUCH_EVIDENCE_MAX_TICKS = 600;
export const TOUCH_EVIDENCE_MAX_EVENTS = 2048;
const TICK_INTERVAL_MS = 1000 / 30;
const round = value => Number(value.toFixed(5));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const allowedReasons = new Set(['manual', 'limit', 'hidden', 'blur', 'resize',
  'pointercancel', 'clock-gap', 'invalid-event', 'disposed']);
const reject = message => { throw new Error(`TouchEvidence: ${message}`); };

export function createNativeTouchEvidenceRecorder(config) {
  // Validate before any device event is accepted using the existing QA oracle.
  compareTouchReleaseCandidates({config, events:[], ticks:1});
  const safeConfig = Object.freeze({...config});
  const events = [];
  const samples = [];
  let pressed = false;
  let finished = null;
  let lastSampleTime = null;
  let cancelled = false;
  let lastEventTick = -1;
  function record(event) {
    if(finished) return false;
    if(!event || typeof event !== 'object' || !['down','drag','up'].includes(event.type)) {
      reject('invalid event');
    }
    if(events.length >= TOUCH_EVIDENCE_MAX_EVENTS) {
      finished = 'invalid-event'; return false;
    }
    const tick = samples.length;
    if(tick >= TOUCH_EVIDENCE_MAX_TICKS) return false;
    if(event.type === 'down') {
      if(pressed) { finished = 'invalid-event'; return false; }
      // Policy oracle cannot infer a second down after an up in one tick.
      if(lastEventTick === tick && events.at(-1)?.type === 'up') {
        finished = 'invalid-event'; return false;
      }
      pressed = true;
      events.push(Object.freeze({tick,type:'down'}));
    }else if(event.type === 'up') {
      if(!pressed) { finished = 'invalid-event'; return false; }
      pressed = false;
      events.push(Object.freeze({tick,type:'up'}));
    }else{
      if(!pressed || !finite(event.deltaX) || !finite(event.deltaY)
        || Math.abs(event.deltaX) > 20000 || Math.abs(event.deltaY) > 20000){
        finished = 'invalid-event'; return false;
      }
      events.push(Object.freeze({tick,type:'drag',deltaX:round(event.deltaX),
        deltaY:round(event.deltaY)}));
    }
    lastEventTick = tick;
    return true;
  }
  function sample({nowMs,guestX,guestZ}) {
    if(finished) return false;
    if(!finite(nowMs) || !finite(guestX) || !finite(guestZ)
      || Math.abs(guestX)>100 || Math.abs(guestZ)>100) {
      finished = 'invalid-event'; return false;
    }
    // No backfilling after time jumps (pause, background or severe timer stalls).
    if(lastSampleTime !== null && (nowMs <= lastSampleTime || nowMs-lastSampleTime > 125)){
      finished = 'clock-gap'; return false;
    }
    const dtMs=lastSampleTime===null?0:nowMs-lastSampleTime;
    lastSampleTime=nowMs;
    samples.push(Object.freeze({tick:samples.length,guestX:round(guestX),
      guestZ:round(guestZ),deltaMs:round(dtMs),pointerActive:pressed}));
    if(samples.length >= TOUCH_EVIDENCE_MAX_TICKS) finished='limit';
    return true;
  }
  function stop(reason='manual') {
    if(!allowedReasons.has(reason))reject('invalid stop reason');
    if(!finished)finished=reason;
    cancelled = cancelled || reason==='hidden' || reason==='blur' ||
      reason==='resize' || reason==='pointercancel' || reason==='clock-gap';
    return report();
  }
  function report() {
    const reason=finished||'in-progress';
    const intervals=samples.slice(1).map(x=>x.deltaMs);
    const maxIntervalMs=intervals.length?Math.max(...intervals):0;
    const meanIntervalMs=intervals.length
      ?intervals.reduce((a,b)=>a+b,0)/intervals.length:0;
    const evidence={
      version:TOUCH_EVIDENCE_VERSION,mode:'campaign-alpha-stage1-guest-diagnostic',
      tickHz:30,ticks:samples.length,eventCount:events.length,
      status:reason,interrupted:cancelled || ['clock-gap','invalid-event'].includes(reason),
      timing:Object.freeze({meanIntervalMs:round(meanIntervalMs),
        maxIntervalMs:round(maxIntervalMs),over50ms:intervals.filter(n=>n>50).length}),
      config:safeConfig,events:Object.freeze([...events]),
      samples:Object.freeze([...samples]),
      qaOnly:true,localOnly:true,networkUpload:false,containsIdentity:false,
      nativeDeviceAttested:false,releasePolicySelected:false,
      parityVerified:false,settlementEnabled:false,cloudRewards:false,
    };
    if(!samples.length || evidence.interrupted) {
      return Object.freeze({...evidence,policies:null,
        review:'INCOMPLETE_DEVICE_TRACE_MANUAL_REVIEW_REQUIRED'});
    }
    const run={config:safeConfig,events,ticks:samples.length};
    try{
      const comparisons=compareTouchReleaseCandidates(run);
      const clear=runCloudTouchUxParityProbe({...run,releasePolicy:'clear'});
      const carry=runCloudTouchUxParityProbe({...run,releasePolicy:'carry'});
      const predicted={
        clear:clear.samples.map(x=>({x:x.previewX,z:x.previewZ})),
        carry:carry.samples.map(x=>({x:x.previewX,z:x.previewZ})),
        boundedFlush:comparisons.policies.boundedFlush.samples.map(x=>({
          x:x.predictedX,z:x.predictedZ})),
      };
      const actual={};
      for(const name of ['clear','carry','boundedFlush']) {
        const gaps=samples.map((s,i)=>Math.hypot(s.guestX-predicted[name][i].x,
          s.guestZ-predicted[name][i].z));
        actual[name]=Object.freeze({meanGapWorld:round(gaps.reduce((a,b)=>a+b,0)/gaps.length),
          peakGapWorld:round(Math.max(...gaps)),finalGapWorld:round(gaps.at(-1)),
          synthetic:comparisons.policies[name].metrics});
      }
      return Object.freeze({...evidence,policies:Object.freeze(actual),
        review:'REAL_GUEST_TRACE_WITH_PROVISIONAL_30HZ_PREVIEW_NOT_APPROVED'});
    }catch(error){
      // An ambiguous release trace is evidence of a gap, not a reason to
      // silently select another release policy.
      return Object.freeze({...evidence,policies:null,
        review:'POLICY_COMPARISON_INCOMPLETE',comparisonError:String(error?.code||'INVALID_TRACE')});
    }
  }
  return Object.freeze({record,sample,stop,report,
    get status(){return finished||'recording';},
    get ticks(){return samples.length;}});
}

/**
 * Explicitly QA-only UI attached beside the canvas. NEVER writes the Babylon
 * ship position, observes the existing Guest drag controller without changes.
 * The user must press Start; no telemetry ever leaves the device automatically.
 */
export function attachNativeTouchQaOverlay({canvas,scene,playerRoot,halfHeight,
  aspect,speedMultiplier=1,documentRef=globalThis.document,
  clock=()=>globalThis.performance.now()}={}) {
  if(!canvas||!scene||!playerRoot||!documentRef||typeof aspect!=='function'
    ||!finite(halfHeight)||halfHeight<=0||!finite(speedMultiplier))reject('invalid UI setup');
  const doc=documentRef;
  const view=doc.defaultView||globalThis.window;
  const panel=doc.createElement('div');
  panel.setAttribute('data-sf-touch-qa','local-only');
  panel.style.cssText='position:absolute;right:8px;bottom:10px;z-index:150;'+
    'background:#101a28ec;color:#fff;font:12px system-ui;'+
    'border:1px solid #4cc;padding:8px;border-radius:6px;max-width:230px';
  const status=doc.createElement('div');
  status.textContent='TOUCH QA / OFFLINE / NOT APPROVED';
  const start=doc.createElement('button');start.type='button';start.textContent='Start 20s';
  const stop=doc.createElement('button');stop.type='button';stop.textContent='Stop';
  const save=doc.createElement('button');save.type='button';save.textContent='Save JSON';
  stop.disabled=true;save.disabled=true;
  for(const b of [start,stop,save]) b.style.cssText='margin:4px 3px 0 0;padding:4px';
  panel.append(status,start,stop,save);
  canvas.parentElement?.appendChild(panel);
  let active=null,finalReport=null,timer=null,disposed=false,pointerId=null;
  let lastX=0,lastY=0;
  const rect=()=>canvas.getBoundingClientRect();
  function finish(reason) {
    if(!active)return;
    if(timer!==null){view.clearInterval(timer);timer=null;}
    finalReport=active.stop(reason);
    active=null;pointerId=null;
    status.textContent=`TOUCH QA ${finalReport.status} / ${finalReport.ticks} ticks`;
    start.disabled=false;stop.disabled=true;save.disabled=false;
  }
  function onDown(e){
    if(!active||pointerId!==null||!['touch','pen','mouse'].includes(e.pointerType))return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    pointerId=e.pointerId;lastX=e.clientX;lastY=e.clientY;
    if(!active.record({type:'down'}))finish('invalid-event');
  }
  function onMove(e){
    if(!active||e.pointerId!==pointerId)return;
    const deltaX=e.clientX-lastX,deltaY=e.clientY-lastY;
    lastX=e.clientX;lastY=e.clientY;
    if(!active.record({type:'drag',deltaX,deltaY}))finish('invalid-event');
  }
  function onUp(e){
    if(!active||e.pointerId!==pointerId)return;
    pointerId=null;
    if(!active.record({type:'up'}))finish('invalid-event');
  }
  function onCancel(e){if(active&&e.pointerId===pointerId)finish('pointercancel');}
  const hidden=()=>{if(active&&doc.hidden)finish('hidden');};
  const blur=()=>{if(active)finish('blur');};
  const resize=()=>{if(active)finish('resize');};
  function begin(){
    if(disposed||active)return;
    try{
      const box=rect(),ar=aspect();
      const maxW=Math.round(halfHeight*ar*1000);
      const config={arenaHalfHeight:Math.round(halfHeight*1000),
        arenaHalfWidth:maxW,aspect:ar,canvasHeight:box.height,
        canvasWidth:box.width,halfHeight,hitRadius:1800,
        legacyInset:1.8,movePerTick:Math.max(1,Math.min(3000,
          Math.round(300*speedMultiplier))),speedMultiplier,
        startX:Math.round(playerRoot.position.x*1000),
        startZ:Math.round(playerRoot.position.z*1000)};
      active=createNativeTouchEvidenceRecorder(config);
      finalReport=null;pointerId=null;
      start.disabled=true;stop.disabled=false;save.disabled=true;
      status.textContent='TOUCH QA recording 30Hz / local only';
      timer=view.setInterval(()=>{
        if(!active)return;
        const ok=active.sample({nowMs:clock(),guestX:playerRoot.position.x,
          guestZ:playerRoot.position.z});
        if(!ok){finish('clock-gap');return;}
        status.textContent=`TOUCH QA ${active.ticks}/600 ticks / no upload`;
        if(active.ticks>=TOUCH_EVIDENCE_MAX_TICKS)finish('limit');
      },TICK_INTERVAL_MS);
    }catch(_error){
      active=null;status.textContent='TOUCH QA config invalid / cannot capture';
      start.disabled=false;stop.disabled=true;
    }
  }
  async function download(){
    if(!finalReport||disposed)return;
    const json=JSON.stringify(finalReport,null,2);
    const filename='spacefighter-c7c2bc-touch-qa.json';
    const blob=new Blob([json],{type:'application/json'});
    const nav=view.navigator;
    // Native WebViews may not support <a download>. Prefer a user-initiated
    // share sheet or clipboard; neither runs until Export is clicked.
    try{
      if(typeof view.File==='function'&&typeof nav?.share==='function'
        &&typeof nav?.canShare==='function'){
        const file=new view.File([blob],filename,{type:'application/json'});
        if(nav.canShare({files:[file]})){
          await nav.share({files:[file],title:'SpaceFighter Touch QA'});
          status.textContent='TOUCH QA file shared by user';return;
        }
      }
    }catch(_error){/* user cancelled share or platform declined */}
    try{
      if(typeof nav?.clipboard?.writeText==='function'){
        await nav.clipboard.writeText(json);
        status.textContent='TOUCH QA JSON copied locally';return;
      }
    }catch(_error){/* clipboard permission denied: attempt local download */}
    const url=view.URL.createObjectURL(blob);
    const link=doc.createElement('a');
    link.href=url;link.download=filename;
    doc.body.appendChild(link);link.click();link.remove();
    view.setTimeout(()=>view.URL.revokeObjectURL(url),0);
    status.textContent='TOUCH QA local JSON download requested';
  }
  start.addEventListener('click',begin);
  stop.addEventListener('click',()=>finish('manual'));
  save.addEventListener('click',download);
  canvas.addEventListener('pointerdown',onDown);
  canvas.addEventListener('pointermove',onMove);
  canvas.addEventListener('pointerup',onUp);
  canvas.addEventListener('pointercancel',onCancel);
  canvas.addEventListener('lostpointercapture',onCancel);
  doc.addEventListener('visibilitychange',hidden);
  view.addEventListener('blur',blur);
  view.addEventListener('resize',resize);
  function dispose(){
    if(disposed)return;
    if(active)finish('disposed');
    disposed=true;
    start.removeEventListener('click',begin);
    canvas.removeEventListener('pointerdown',onDown);
    canvas.removeEventListener('pointermove',onMove);
    canvas.removeEventListener('pointerup',onUp);
    canvas.removeEventListener('pointercancel',onCancel);
    canvas.removeEventListener('lostpointercapture',onCancel);
    doc.removeEventListener('visibilitychange',hidden);
    view.removeEventListener('blur',blur);
    view.removeEventListener('resize',resize);
    panel.remove();
  }
  scene.onDisposeObservable.addOnce(dispose);
  return Object.freeze({dispose,finish,getReport:()=>finalReport});
}
