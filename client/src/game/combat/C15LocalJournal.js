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
export const C15_LOCAL_JOURNAL_LIMITS=freeze({maxTicks:MAX_TICKS,maxChunks:MAX_CHUNKS,firstFrames:FIRST,steadyFrames:STEADY});
