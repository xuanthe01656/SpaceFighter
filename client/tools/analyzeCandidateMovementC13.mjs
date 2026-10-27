/**
 * Read-only, OFFLINE C13 movement evidence review. Accepts only an aggregate
 * C13 export (not raw touch data). Never uploads, connects Firebase or grants
 * release approval. Example:
 * node client/tools/analyzeCandidateMovementC13.mjs --input=report.json --out=review.json
 */
import {readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {C13_EVIDENCE_VERSION} from '../src/game/combat/CandidateMovementEvidenceC13.js';
export const C13_REVIEW_VERSION='spacefighter-c13-candidate-movement-review-v1';
const MAX_FILE_SIZE=16*1024;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.getPrototypeOf(v)===Object.prototype
  &&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const keys=['version','scope','tickHz','status','sampledTicks','latestSampledTick',
  'acknowledgedTick','acknowledgementCount','matchedCheckpoints',
  'mismatchedCheckpoints','missingPredictions','maxAbsDxUnits','maxAbsDzUnits',
  'maxDistanceUnits','meanDistanceUnits','maxPendingFrames','maxRttMs',
  'meanRttMs','terminal','auditComplete','interrupted','interruptionCode',
  'candidateOnly','nonEconomic','localOnly','networkUpload','containsIdentity',
  'containsRawInput','nativeGuestParityApproved','deviceAttested',
  'productionReplayApproved','eligibleForSettlement','settlementEnabled','cloudRewards'];
const integer=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const number=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
const fail=message=>{throw new Error(`C13_EVIDENCE_REJECTED: ${message}`);};
export function reviewCandidateMovementC13(value){
  if(!exact(value,keys))fail('Unexpected or missing fields (possible identity/data leak)');
  if(value.version!==C13_EVIDENCE_VERSION
    ||value.scope!=='c12-candidate-client-prediction-vs-c11-server-pilot-checkpoint'
    ||value.tickHz!==30||!['INCOMPLETE','DRIFT_REVIEW_REQUIRED','MOVEMENT_CHECKPOINTS_MATCHED'].includes(value.status)
    ||value.candidateOnly!==true||value.nonEconomic!==true
    ||value.localOnly!==true||value.networkUpload!==false
    ||value.containsIdentity!==false||value.containsRawInput!==false
    ||value.nativeGuestParityApproved!==false||value.deviceAttested!==false
    ||value.productionReplayApproved!==false||value.eligibleForSettlement!==false
    ||value.settlementEnabled!==false||value.cloudRewards!==false)
    fail('Not a non-economic local diagnostic');
  if(!integer(value.sampledTicks,0,4500)
    ||!integer(value.latestSampledTick,0,4500)
    ||value.sampledTicks!==value.latestSampledTick
    ||!integer(value.acknowledgedTick,0,value.latestSampledTick)
    ||!integer(value.acknowledgementCount,0,128)
    ||!integer(value.matchedCheckpoints,0,129)
    ||!integer(value.mismatchedCheckpoints,0,129)
    ||!integer(value.missingPredictions,0,129)
    ||value.matchedCheckpoints+value.mismatchedCheckpoints+value.missingPredictions
        >value.acknowledgementCount+1
    ||!integer(value.maxAbsDxUnits,0,100000)||!integer(value.maxAbsDzUnits,0,100000)
    ||!number(value.maxDistanceUnits,0,150000)
    ||!number(value.meanDistanceUnits,0,value.maxDistanceUnits)
    ||!integer(value.maxPendingFrames,0,60)
    ||!number(value.maxRttMs,0,600000)||!number(value.meanRttMs,0,value.maxRttMs)
    ||typeof value.terminal!=='boolean'||typeof value.auditComplete!=='boolean'
    ||typeof value.interrupted!=='boolean'
    ||(value.interrupted&&!/^[A-Z][A-Z0-9_]{2,63}$/.test(value.interruptionCode||''))
    ||(!value.interrupted&&value.interruptionCode!==null))
    fail('Invalid or contradictory numeric data');
  const completed=value.terminal&&value.auditComplete&&value.acknowledgedTick>0
    &&value.acknowledgementCount>0;
  const drift=value.mismatchedCheckpoints>0||value.missingPredictions>0;
  const expected=drift?'DRIFT_REVIEW_REQUIRED':completed
    ?'MOVEMENT_CHECKPOINTS_MATCHED':'INCOMPLETE';
  if(value.status!==expected)fail('Status inconsistent with recorded metrics');
  const findings=[];
  if(!completed)findings.push('NON_TERMINAL_OR_NO_INDEPENDENT_AUDIT');
  if(value.interrupted)findings.push('SESSION_INTERRUPTED');
  if(drift)findings.push('CLIENT_SERVER_MOVEMENT_DRIFT');
  if(value.acknowledgedTick<30||value.acknowledgementCount<2)
    findings.push('INSUFFICIENT_30HZ_ACK_SAMPLE');
  if(value.maxRttMs>1500||value.maxPendingFrames>45)
    findings.push('TRANSPORT_LATENCY_OR_BACKPRESSURE_REVIEW');
  return Object.freeze({version:C13_REVIEW_VERSION,
    scope:'c12-candidate-input-vs-server-checkpoint-only',
    checkpointMatchDiagnostic:findings.length===0?'MATCHED_FOR_MANUAL_REVIEW':'NOT_READY',
    findings,acknowledgedTick:value.acknowledgedTick,
    acknowledgedBatches:value.acknowledgementCount,
    maxMovementDriftUnits:value.maxDistanceUnits,
    maxRttMs:value.maxRttMs,maxQueuedFrames:value.maxPendingFrames,
    status:'REQUIRES_MANUAL_ANDROID_AND_SECURITY_REVIEW',
    nativeGuestCombatParityApproved:false,productionReplayApproved:false,
    deviceAttested:false,firestoreRulesIamApproved:false,
    productionOutcomeEnabled:false,settlementEnabled:false,
    cloudBattleP0Locked:true});
}
function main(argv){
  const args={};
  for(const part of argv){
    const m=/^--(input|out)=(.+)$/.exec(part);
    if(!m||Object.hasOwn(args,m[1]))fail('Use --input=file and --out=file exactly once');
    args[m[1]]=resolve(m[2]);
  }
  if(Object.keys(args).length!==2||args.input===args.out)fail('Input/output paths required and distinct');
  if(statSync(args.input).size>MAX_FILE_SIZE)fail('Evidence file exceeds 16 KiB');
  const evidence=JSON.parse(readFileSync(args.input,'utf8'));
  const review=reviewCandidateMovementC13(evidence);
  writeFileSync(args.out,JSON.stringify(review,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log('C13_REPORT='+args.out);
  console.log('C13_MOVEMENT_DIAGNOSTIC='+review.checkpointMatchDiagnostic);
  console.log('C13_PRODUCTION_APPROVAL=NO C13_REWARDS=NO');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{main(process.argv.slice(2));}catch(e){console.error('C13_OFFLINE_REVIEW_FAILED: '+e.message);process.exitCode=1;}
}
