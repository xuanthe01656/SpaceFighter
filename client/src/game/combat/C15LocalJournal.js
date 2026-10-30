/**
 * C15-RC1 append-only local input journal. Gameplay never waits on upload.
 * The server still replays every frame and ignores all client outcome claims.
 */
export const C15_LOCAL_JOURNAL_VERSION='c15-local-journal-v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const states=new WeakSet();
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const int=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const seal=x=>{const out=freeze(x);states.add(out);return out;};
const MAX_TICKS=4500,MAX_CHUNKS=256,FIRST=15,STEADY=30;
function check(state){if(!record(state)||!states.has(state))throw new TypeError('C15 journal state invalid');}
function frame(value){if(!exact(value,['x','z'])||!int(value.x,-127,127)||!int(value.z,-127,127)
  ||value.x*value.x+value.z*value.z>128*128)throw new TypeError('C15 input frame invalid');return freeze({x:value.x,z:value.z});}
export function openC15LocalJournal({battleId,rulesVersion,loadoutHash,issuedAtMs}){
  if(!UUID.test(battleId||'')||typeof rulesVersion!=='string'||rulesVersion.length<3
    ||!/^[a-f0-9]{64}$/.test(loadoutHash||'')||!int(issuedAtMs,1,Number.MAX_SAFE_INTEGER))throw new TypeError('C15 journal open invalid');
  return seal({version:C15_LOCAL_JOURNAL_VERSION,battleId,rulesVersion,loadoutHash,issuedAtMs,
    nextTick:0,uploadedThroughTick:0,chunkCount:0,pending:[],inflight:null,closed:false});
}
export function appendC15LocalFrame(state,input){check(state);if(state.closed)throw new TypeError('C15 journal closed');if(state.nextTick>=MAX_TICKS)throw new TypeError('C15 journal tick limit');
  return seal({...state,nextTick:state.nextTick+1,pending:[...state.pending,frame(input)]});
}
export function takeC15UploadChunk(state,{flush=false}={}){check(state);if(state.inflight)throw new TypeError('C15 upload already in flight');
  const target=state.chunkCount===0?FIRST:STEADY;
  if(state.pending.length===0||(!flush&&state.pending.length<target))return freeze({state,chunk:null});
  const count=flush?Math.min(target,state.pending.length):target;
  if(state.chunkCount>=MAX_CHUNKS)throw new TypeError('C15 journal chunk limit');
  const frames=state.pending.slice(0,count);const startTick=state.uploadedThroughTick;
  const chunk=freeze({protocol:'pve-input-v1',battleId:state.battleId,startTick,frames});
  return freeze({chunk,state:seal({...state,pending:state.pending.slice(count),inflight:chunk})});
}
export function acknowledgeC15UploadChunk(state,{startTick,endTick}){check(state);const c=state.inflight;
  if(!c||!int(startTick,0,MAX_TICKS)||!int(endTick,startTick+1,MAX_TICKS)
    ||startTick!==c.startTick||endTick!==c.startTick+c.frames.length)throw new TypeError('C15 upload acknowledgement invalid');
  return seal({...state,uploadedThroughTick:endTick,chunkCount:state.chunkCount+1,inflight:null});
}
export function closeC15LocalJournal(state){check(state);if(state.inflight||state.pending.length||state.uploadedThroughTick!==state.nextTick)throw new TypeError('C15 journal still has unuploaded frames');
  return seal({...state,closed:true});
}
export function c15JournalSummary(state){check(state);return freeze({version:'c15-journal-summary-v1',battleId:state.battleId,
  ticks:state.nextTick,chunks:state.chunkCount,uploadedThroughTick:state.uploadedThroughTick,
  closed:state.closed,containsOutcome:false,settlementEnabled:false});}

function cloneFrame(value){return {x:value.x,z:value.z};}
function validateSerializedChunk(value,battleId){
  if(value===null)return null;
  if(!exact(value,['protocol','battleId','startTick','frames'])||value.protocol!=='pve-input-v1'
    ||value.battleId!==battleId||!int(value.startTick,0,MAX_TICKS)||!Array.isArray(value.frames)
    ||value.frames.length<1||value.frames.length>STEADY)throw new TypeError('C15 serialized chunk invalid');
  return freeze({protocol:value.protocol,battleId:value.battleId,startTick:value.startTick,
    frames:value.frames.map(frame)});
}
export function serializeC15LocalJournal(state){
  check(state);
  return freeze({version:C15_LOCAL_JOURNAL_VERSION,battleId:state.battleId,rulesVersion:state.rulesVersion,
    loadoutHash:state.loadoutHash,issuedAtMs:state.issuedAtMs,nextTick:state.nextTick,
    uploadedThroughTick:state.uploadedThroughTick,chunkCount:state.chunkCount,
    pending:state.pending.map(cloneFrame),inflight:state.inflight?{
      protocol:state.inflight.protocol,battleId:state.inflight.battleId,startTick:state.inflight.startTick,
      frames:state.inflight.frames.map(cloneFrame)}:null,closed:state.closed});
}
export function restoreC15LocalJournal(raw){
  const keys=['version','battleId','rulesVersion','loadoutHash','issuedAtMs','nextTick','uploadedThroughTick',
    'chunkCount','pending','inflight','closed'];
  if(!exact(raw,keys)||raw.version!==C15_LOCAL_JOURNAL_VERSION||!UUID.test(raw.battleId||'')
    ||typeof raw.rulesVersion!=='string'||raw.rulesVersion.length<3||!/^[a-f0-9]{64}$/.test(raw.loadoutHash||'')
    ||!int(raw.issuedAtMs,1,Number.MAX_SAFE_INTEGER)||!int(raw.nextTick,0,MAX_TICKS)
    ||!int(raw.uploadedThroughTick,0,raw.nextTick)||!int(raw.chunkCount,0,MAX_CHUNKS)
    ||!Array.isArray(raw.pending)||raw.pending.length>MAX_TICKS||typeof raw.closed!=='boolean')
    throw new TypeError('C15 serialized journal invalid');
  const pending=raw.pending.map(frame);
  const inflight=validateSerializedChunk(raw.inflight,raw.battleId);
  const inFlightCount=inflight?.frames.length||0;
  if(raw.uploadedThroughTick+inFlightCount+pending.length!==raw.nextTick
    ||(inflight&&inflight.startTick!==raw.uploadedThroughTick)
    ||(raw.closed&&(pending.length||inflight||raw.uploadedThroughTick!==raw.nextTick)))
    throw new TypeError('C15 serialized journal continuity invalid');
  return seal({version:C15_LOCAL_JOURNAL_VERSION,battleId:raw.battleId,rulesVersion:raw.rulesVersion,
    loadoutHash:raw.loadoutHash,issuedAtMs:raw.issuedAtMs,nextTick:raw.nextTick,
    uploadedThroughTick:raw.uploadedThroughTick,chunkCount:raw.chunkCount,pending,inflight,closed:raw.closed});
}
export function peekC15InflightChunk(state){check(state);return state.inflight;}
export function reconcileC15UploadProgress(state,{uploadedThroughTick,chunkCount}){
  check(state);
  if(!int(uploadedThroughTick,0,state.nextTick)||!int(chunkCount,0,MAX_CHUNKS))
    throw new TypeError('C15 upload progress invalid');
  if(uploadedThroughTick===state.uploadedThroughTick&&chunkCount===state.chunkCount)return state;
  const inflight=state.inflight;
  if(inflight&&uploadedThroughTick===inflight.startTick+inflight.frames.length
    &&chunkCount===state.chunkCount+1){
    return acknowledgeC15UploadChunk(state,{startTick:inflight.startTick,endTick:uploadedThroughTick});
  }
  throw new TypeError('C15 server upload progress cannot be reconciled');
}

export const C15_LOCAL_JOURNAL_LIMITS=freeze({maxTicks:MAX_TICKS,maxChunks:MAX_CHUNKS,firstFrames:FIRST,steadyFrames:STEADY});
