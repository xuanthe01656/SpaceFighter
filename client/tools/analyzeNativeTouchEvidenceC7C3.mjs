/**
 * C7-C3A: local-only touch QA evidence validator, never a release oracle.
 * Input: three JSON exports captured by CloudNativeTouchQaC7C2 on a real QA device.
 * Output: aggregate metrics ONLY; raw positions/gestures are never copied to output.
 * No network access, no Firebase, no production user identifiers.
 */
import {readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compareTouchReleaseCandidates} from '../src/game/combat/CloudTouchReleaseCandidateV8.js';
import {runCloudTouchUxParityProbe} from '../src/game/combat/CloudTouchUxParityProbeV8.js';
import {TOUCH_EVIDENCE_VERSION,TOUCH_EVIDENCE_MAX_TICKS,TOUCH_EVIDENCE_MAX_EVENTS}
  from '../src/game/combat/CloudNativeTouchQaC7C2.js';

export const C7C3_EVIDENCE_REVIEW_VERSION='spacefighter-c7c3a-offline-device-review-v1';
const CASES=Object.freeze(['flick','hold-release','two-axis']);
const POLICIES=Object.freeze(['clear','carry','boundedFlush']);
const MAX_FILE_BYTES=1024*1024;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const round=n=>Number(n.toFixed(5));
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)
  &&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const fields=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length
  &&keys.every(k=>Object.hasOwn(o,k));
const sampleKeys=['tick','guestX','guestZ','deltaMs','pointerActive'];
const eventKeys={down:['tick','type'],up:['tick','type'],drag:['tick','type','deltaX','deltaY']};
const rootFields=['version','mode','tickHz','ticks','eventCount','status','interrupted',
  'timing','config','events','samples','qaOnly','localOnly','networkUpload',
  'containsIdentity','nativeDeviceAttested','releasePolicySelected','parityVerified',
  'settlementEnabled','cloudRewards','policies','review'];
const metricFields=['meanGapWorld','peakGapWorld','finalGapWorld'];
const statFields=['meanIntervalMs','maxIntervalMs','over50ms'];
const fail=message=>{throw new Error(message);};

export function examineNativeTouchTrace(value,caseName){
  const findings=[];
  const bad=(code)=>findings.push(code);
  if(!CASES.includes(caseName))fail('Unsupported QA gesture label');
  if(!plain(value)||!rootFields.every(k=>Object.hasOwn(value,k))) {
    return Object.freeze({caseName,acceptableForReview:false,findings:['EVIDENCE_SHAPE_INVALID']});
  }
  if(value.version!==TOUCH_EVIDENCE_VERSION||value.mode!=='campaign-alpha-stage1-guest-diagnostic'
    ||value.tickHz!==30||value.qaOnly!==true||value.localOnly!==true
    ||value.networkUpload!==false||value.containsIdentity!==false
    ||value.nativeDeviceAttested!==false||value.releasePolicySelected!==false
    ||value.parityVerified!==false||value.settlementEnabled!==false
    ||value.cloudRewards!==false){bad('QA_FLAGS_OR_VERSION_INVALID');}
  if(value.status!=='manual'&&value.status!=='limit')bad('TRACE_NOT_COMPLETED');
  if(value.interrupted!==false)bad('DEVICE_TRACE_INTERRUPTED');
  if(!Number.isInteger(value.ticks)||value.ticks<30||value.ticks>TOUCH_EVIDENCE_MAX_TICKS
    ||!Array.isArray(value.samples)||value.samples.length!==value.ticks
    ||!Array.isArray(value.events)||value.events.length>TOUCH_EVIDENCE_MAX_EVENTS
    ||value.events.length!==value.eventCount||value.events.length<3){
    bad('TRACE_BOUNDS_INVALID');
  }
  const sampleArray=Array.isArray(value.samples)?value.samples:[];
  const eventsArray=Array.isArray(value.events)?value.events:[];
  const samplesOk=sampleArray.every((s,i)=>fields(s,sampleKeys)
    &&s.tick===i&&finite(s.guestX)&&finite(s.guestZ)&&finite(s.deltaMs)
    &&s.deltaMs>=0&&s.deltaMs<=125&&typeof s.pointerActive==='boolean');
  if(!samplesOk)bad('SAMPLES_INVALID');
  const eventsOk=eventsArray.every(e=>plain(e)
    &&fields(e,eventKeys[e.type]||[])
    &&Number.isSafeInteger(e.tick)&&e.tick>=0&&e.tick<value.ticks
    &&(e.type!=='drag'||finite(e.deltaX)&&finite(e.deltaY)))
    &&eventsArray.every((e,i)=>!i||e.tick>=eventsArray[i-1].tick);
  if(!eventsOk)bad('EVENTS_INVALID');
  if(!plain(value.timing)||!statFields.every(k=>Object.hasOwn(value.timing,k))
    ||!statFields.slice(0,2).every(k=>finite(value.timing[k]))
    ||!Number.isInteger(value.timing.over50ms))bad('TIMING_INVALID');
  let measure=null;
  if(samplesOk&&sampleArray.length>=2){
    const dts=sampleArray.slice(1).map(s=>s.deltaMs);
    const observed={maxIntervalMs:round(Math.max(...dts)),
      meanIntervalMs:round(dts.reduce((a,b)=>a+b,0)/dts.length),
      over50ms:dts.filter(n=>n>50).length};
    measure=observed;
    if(!plain(value.timing)||statFields.some(k=>!finite(value.timing[k])
      ||Math.abs(observed[k]-value.timing[k])>0.001))bad('TIMING_CLAIM_MISMATCH');
    if(observed.maxIntervalMs>90||observed.meanIntervalMs>45
      ||observed.over50ms>Math.ceil(dts.length*0.1))bad('TICK_JITTER_REVIEW_REQUIRED');
  }
  let compared=null;
  if(samplesOk&&eventsOk&&value.ticks>=1&&value.ticks<=TOUCH_EVIDENCE_MAX_TICKS
    &&sampleArray.length===value.ticks&&eventsArray.length<=TOUCH_EVIDENCE_MAX_EVENTS){
    try{
      const input={config:value.config,events:eventsArray,ticks:value.ticks};
      const oracle=compareTouchReleaseCandidates(input);
      const clear=runCloudTouchUxParityProbe({...input,releasePolicy:'clear'});
      const carry=runCloudTouchUxParityProbe({...input,releasePolicy:'carry'});
      const paths={clear:clear.samples.map(s=>({x:s.previewX,z:s.previewZ})),
        carry:carry.samples.map(s=>({x:s.previewX,z:s.previewZ})),
        boundedFlush:oracle.policies.boundedFlush.samples.map(s=>({x:s.predictedX,z:s.predictedZ}))};
      const calculated={};
      for(const policy of POLICIES){
        const predictions=paths[policy];
        if(predictions.length!==value.ticks)fail('Prediction tick count inconsistent');
        const gaps=sampleArray.map((s,i)=>Math.hypot(s.guestX-predictions[i].x,
          s.guestZ-predictions[i].z));
        calculated[policy]={meanGapWorld:round(gaps.reduce((a,b)=>a+b,0)/gaps.length),
          peakGapWorld:round(Math.max(...gaps)),finalGapWorld:round(gaps.at(-1))};
      }
      if(!plain(value.policies)||POLICIES.some(name=>!plain(value.policies[name])
        ||metricFields.some(key=>!finite(value.policies[name][key])
          ||Math.abs(value.policies[name][key]-calculated[name][key])>0.001))){
        bad('POLICY_METRICS_NOT_REPRODUCIBLE');
      }else{
        compared=Object.freeze(calculated);
      }
    }catch(_error){bad('REPLAY_ORACLE_REJECTED_TRACE');}
  }
  if(!compared)bad('POLICY_EVIDENCE_INCOMPLETE');
  // Not an attestation of device identity, nor an automatic recommendation.
  return Object.freeze({caseName,acceptableForReview:findings.length===0,
    findings:Object.freeze([...new Set(findings)]),ticks:value.ticks,eventCount:value.eventCount,
    timing:measure,policyGaps:compared,
    deviceOrigin:'UNATTESTED_REQUIRES_MANUAL_ANDROID_QA',
    nativeTouchParityApproved:false,releasePolicySelected:false,
    economicAuthority:false});
}

export function reviewTouchEvidencePack(pack){
  if(!plain(pack)||Object.keys(pack).length!==CASES.length||CASES.some(k=>!Object.hasOwn(pack,k)))
    fail('Exactly flick, hold-release and two-axis traces are required');
  const traces=CASES.map(k=>examineNativeTouchTrace(pack[k],k));
  const allReviewable=traces.every(x=>x.acceptableForReview);
  const policyMeans=Object.fromEntries(POLICIES.map(k=>[k,
    allReviewable?round(traces.reduce((a,t)=>a+t.policyGaps[k].meanGapWorld,0)/traces.length):null]));
  return Object.freeze({version:C7C3_EVIDENCE_REVIEW_VERSION,
    baseline:'306de59e61e412fb50b8ec35425d418b3bc73727',
    scope:'offline-guest-alpha-stage1-touch-evidence',traces,
    allTracesReviewable:allReviewable,policyMeanGaps:policyMeans,
    verdict:'MANUAL_NATIVE_QA_AND_SECURITY_SIGNOFF_REQUIRED',
    releasePolicySelected:false,nativeDeviceAttested:false,
    productionVerifierApproved:false,settlementEnabled:false,
    cloudBattleP0Locked:true});
}

function parseArgs(argv){
  const o={};
  for(const part of argv){
    const m=/^--(flick|hold-release|two-axis|out)=(.+)$/.exec(part);
    if(!m||Object.hasOwn(o,m[1]))fail('Expected unique --flick= --hold-release= --two-axis= --out= paths');
    o[m[1]]=resolve(m[2]);
  }
  if(Object.keys(o).length!==4)fail('Three evidence paths and --out are required');
  if(new Set(Object.values(o)).size!==4)fail('Input and output paths must be distinct');
  return o;
}
function main(argv){
  const args=parseArgs(argv);
  const files={};
  for(const name of CASES){
    if(statSync(args[name]).size>MAX_FILE_BYTES)fail(`${name}: touch export exceeds 1 MiB`);
    files[name]=JSON.parse(readFileSync(args[name],'utf8'));
  }
  const result=reviewTouchEvidencePack(files);
  writeFileSync(args.out,JSON.stringify(result,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log(`C7C3_TOUCH_QA_REPORT=${args.out}`);
  console.log(`TRACES_REVIEWABLE=${result.traces.filter(t=>t.acceptableForReview).length}/3`);
  console.log('DEVICE_ATTESTED=NO RELEASE_POLICY_SELECTED=NO CLOUD_REWARDS=NO');
  if(!result.allTracesReviewable)process.exitCode=2;
}
const direct=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(direct){
  try{main(process.argv.slice(2));}
  catch(e){console.error('C7C3_TOUCH_QA_REVIEW_FAILED:',e.message);process.exitCode=2;}
}
