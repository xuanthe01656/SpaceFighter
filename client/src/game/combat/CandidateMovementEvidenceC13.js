/**
 * C13: non-economic, LOCAL-ONLY diagnostics of the C12 input predictor against
 * the server checkpoint at the SAME acknowledged 30Hz tick.
 *
 * This measures only C12 movement/transport alignment. It does NOT compare the
 * original Guest Babylon combat engine, authenticate a physical device, or
 * authorize a production outcome. Never collect UID, battle ID, raw pointer
 * events, frames, credentials, rewards or location. Never upload evidence.
 */
export const C13_EVIDENCE_VERSION='sf-c13-candidate-movement-evidence-v1';
const MAX_HISTORY=90,MAX_TICKS=4500,MAX_RTT=600000;
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const rnd=x=>Math.round(x*1000)/1000;
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const safeReason=e=>{
  const code=typeof e?.code==='string'?e.code:
    typeof e?.message==='string'?e.message:'';
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code)?code:'C13_UNCLASSIFIED_INTERRUPTION';
};

export function createCandidateMovementEvidenceC13(){
  let initial=false,started=0,latest=0,ack=0;
  let matches=0,mismatches=0,missing=0,sampleCount=0,batches=0;
  let sumDistance=0,maxDistance=0,maxDx=0,maxDz=0;
  let rttTotal=0,rttMax=0,rttSamples=0,maxQueue=0;
  const predicted=new Map();
  function open(position){
    if(initial||!int(position?.x,-50000,50000)||!int(position?.z,-50000,50000))
      fail('C13_OPEN_INVALID');
    initial=true;
    predicted.set(0,{x:position.x,z:position.z});
  }
  function sample(value){
    if(!initial||!int(value?.tick,latest+1,MAX_TICKS)||value.tick!==latest+1
      ||!int(value.x,-50000,50000)||!int(value.z,-50000,50000)
      ||!int(value.queued,0,60)||predicted.size>=MAX_HISTORY)
      fail('C13_SAMPLE_SEQUENCE_INVALID');
    latest=value.tick;sampleCount++;maxQueue=Math.max(maxQueue,value.queued);
    predicted.set(latest,{x:value.x,z:value.z});
  }
  function acknowledge({tick,pilot,rttMs=null}={}){
    if(!initial||!int(tick,ack,MAX_TICKS)||tick>latest
      ||!int(pilot?.x,-50000,50000)||!int(pilot?.z,-50000,50000)
      ||(rttMs!==null&&(!finite(rttMs)||rttMs<0||rttMs>MAX_RTT)))
      fail('C13_CHECKPOINT_INVALID');
    if(tick===ack&&batches!==0)return; // same accepted tick is a no-op
    const own=predicted.get(tick);
    if(!own){missing++;}
    else{
      const dx=Math.abs(own.x-pilot.x),dz=Math.abs(own.z-pilot.z);
      const dist=Math.hypot(dx,dz);
      maxDx=Math.max(maxDx,dx);maxDz=Math.max(maxDz,dz);
      maxDistance=Math.max(maxDistance,dist);sumDistance+=dist;
      if(dx===0&&dz===0)matches++;else mismatches++;
    }
    ack=tick;
    if(tick>0){
      batches++;
      if(rttMs!==null){rttSamples++;rttTotal+=rttMs;rttMax=Math.max(rttMax,rttMs);}
    }
    for(const k of predicted.keys())if(k<=ack)predicted.delete(k);
  }
  function report({terminal=false,auditComplete=false,error=null}={}){
    const completed=terminal===true&&auditComplete===true&&ack>0&&batches>0;
    const status=missing||mismatches?'DRIFT_REVIEW_REQUIRED':completed
      ?'MOVEMENT_CHECKPOINTS_MATCHED':'INCOMPLETE';
    // These flags are deliberately not user-configurable or inferred from QA.
    return Object.freeze({version:C13_EVIDENCE_VERSION,
      scope:'c12-candidate-client-prediction-vs-c11-server-pilot-checkpoint',
      tickHz:30,status,
      sampledTicks:sampleCount,latestSampledTick:latest,acknowledgedTick:ack,
      acknowledgementCount:batches,matchedCheckpoints:matches,
      mismatchedCheckpoints:mismatches,missingPredictions:missing,
      maxAbsDxUnits:maxDx,maxAbsDzUnits:maxDz,
      maxDistanceUnits:rnd(maxDistance),meanDistanceUnits:rnd(sumDistance/Math.max(1,matches+mismatches)),
      maxPendingFrames:maxQueue,maxRttMs:rnd(rttMax),
      meanRttMs:rnd(rttTotal/Math.max(1,rttSamples)),
      terminal:terminal===true,auditComplete:auditComplete===true,
      interrupted:error!==null,interruptionCode:error===null?null:safeReason(error),
      candidateOnly:true,nonEconomic:true,localOnly:true,networkUpload:false,
      containsIdentity:false,containsRawInput:false,nativeGuestParityApproved:false,
      deviceAttested:false,productionReplayApproved:false,
      eligibleForSettlement:false,settlementEnabled:false,cloudRewards:false});
  }
  return Object.freeze({open,sample,acknowledge,report});
}
