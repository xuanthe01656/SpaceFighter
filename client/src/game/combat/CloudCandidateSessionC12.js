/**
 * C12: diagnostic C11 candidate transport. Uses only quantized 30Hz input;
 * all state/HP/results come from server checkpoints. Never requests settlement.
 * The returned candidate audit cannot be used as a C10 production receipt.
 */
import {openCloudInputIntent,addCloudPointerDelta,sampleCloudInputTick,
  clearCloudPointerTarget} from './CloudInputIntentV8.js';
import {createCandidateMovementEvidenceC13} from './CandidateMovementEvidenceC13.js';
export const C12_CLIENT_VERSION='v8-c12-mobile-candidate-non-economic-v1';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PHASES=new Set(['active','lab-clear','lab-defeat']);
const V='sf-c8-alpha1-server-render-qa-v1';
// C12-PERF-B: keep first checkpoint responsive, then amortize the verified
// HTTP/Auth/Firestore round trips over 30 frames. QA only. No queue growth,
// no parallel transactions, no skipping input, and no C10 authority.
const WARMUP_FRAMES=15,STEADY_FRAMES=30,MAX_PENDING_FRAMES=60;
const error=(code)=>{const x=new Error(code);x.code=code;throw x;};
const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const safeTick=n=>Number.isSafeInteger(n)&&n>=0&&n<=4500;
export function requireCandidateReplyC12(reply,{battleId=null,expectedTick=null}={}){
  if(!record(reply)||reply.ok!==true||reply.candidateOnly!==true
    ||reply.nonEconomic!==true||reply.eligibleForSettlement!==false
    ||reply.safeForCloudBattle!==false||reply.settlementEnabled!==false
    ||reply.qaSourceModel!==true||reply.qaOnly!==true
    ||reply.protocol!=='pve-input-v1'||!UUID.test(reply.battleId||'')
    ||(battleId!==null&&reply.battleId!==battleId)
    ||!safeTick(reply.nextTick)||(expectedTick!==null&&reply.nextTick!==expectedTick)
    ||!PHASES.has(reply.phase)||!Number.isSafeInteger(reply.expiresAtMs)
    ||!record(reply.visual)||reply.visual.version!==V
    ||reply.visual.tick!==reply.nextTick||reply.visual.phase!==reply.phase
    ||reply.visual.qaOnly!==true||reply.visual.settlementEnabled!==false
    ||reply.visual.locationId!=='alpha_stage_1'
    ||!record(reply.visual.config)||!record(reply.visual.pilot)
    ||!Array.isArray(reply.visual.enemies)||!Array.isArray(reply.visual.shots)
    ||!Array.isArray(reply.visual.enemyShots)
    ||Object.hasOwn(reply,'victory')||Object.hasOwn(reply,'rewards')
    ||Object.hasOwn(reply,'grant')||Object.hasOwn(reply,'settlement'))
    error('C12_UNTRUSTED_CANDIDATE_REPLY');
  return reply;
}
export function createCloudCandidateSessionC12({api,viewport,clock,randomId,
  onUpdate=()=>{}}={}){
  if(!record(api)||['open','input','status','audit','abandon'].some(k=>typeof api[k]!=='function')
    ||!record(viewport)||typeof clock!=='function'||typeof randomId!=='function'
    ||typeof onUpdate!=='function')throw new TypeError('C12 dependencies required');
  let battleId=null,sampler=null,current=null,ackTick=0,pending=[],lastMs=null;
  let busy=null,closed=false,terminal=false,fault=null,proof=null;
  let recoveringTerminalTail=false;
  const evidence=createCandidateMovementEvidenceC13();
  const diagnostics=()=>evidence.report({terminal,auditComplete:Boolean(proof),error:fault});
  const update=()=>onUpdate({reply:current,ackTick,queued:pending.length,
    terminal,error:fault,proof,diagnostics:diagnostics()});
  const assertLive=()=>{if(closed)error('C12_CLOSED');if(fault)throw fault;};
  const batchSize=()=>ackTick===0?WARMUP_FRAMES:STEADY_FRAMES;
  function accept(reply,tick,rttMs=null){
    requireCandidateReplyC12(reply,{battleId,expectedTick:tick});
    if(reply.nextTick<ackTick)error('C12_TICK_REWIND');
    evidence.acknowledge({tick:reply.nextTick,pilot:reply.visual.pilot,rttMs});
    ackTick=reply.nextTick;current=reply;terminal=reply.phase!=='active';update();
    return reply;
  }
  async function start(){
    assertLive();if(battleId)error('C12_ALREADY_OPEN');
    let body={mode:'campaign',locationId:'alpha_stage_1',requestId:randomId()};
    let opened;
    try{opened=await api.open(body);}catch(e){
      if(e?.code!=='C11_TICKET_ACTIVE')throw e;
      const prior=requireCandidateReplyC12(await api.status());
      const stop=await api.abandon({battleId:prior.battleId});
      if(stop.ok!==true||stop.candidateOnly!==true||stop.nonEconomic!==true
        ||stop.eligibleForSettlement!==false||stop.abandoned!==true)
        error('C12_ABANDON_UNVERIFIED');
      body={...body,requestId:randomId()};opened=await api.open(body);
    }
    if(closed)error('C12_CLOSED');
    requireCandidateReplyC12(opened,{expectedTick:0});
    battleId=opened.battleId;
    sampler=openCloudInputIntent({...opened.visual.config,...viewport});
    evidence.open({x:sampler.positionX,z:sampler.positionZ});
    return accept(opened,0);
  }
  function drag(dx,dy){assertLive();if(!sampler||terminal)return false;
    sampler=addCloudPointerDelta(sampler,{deltaX:dx,deltaY:dy});return true;}
  function release(){assertLive();if(!sampler||terminal)return false;
    sampler=clearCloudPointerTarget(sampler);return true;}
  function sample(nowMs=clock()){
    assertLive();if(!sampler||terminal||recoveringTerminalTail)return null;
    if(!Number.isFinite(nowMs)||(lastMs!==null&&nowMs-lastMs>250)){
      fault=new Error('C12_CLOCK_GAP_RESTART');update();throw fault;
    }
    if(lastMs!==null&&nowMs-lastMs<25)return null;
    if(pending.length>=MAX_PENDING_FRAMES){fault=new Error('C12_NETWORK_BACKPRESSURE');update();throw fault;}
    lastMs=nowMs;
    const next=sampleCloudInputTick(sampler);sampler=next.state;
    evidence.sample({tick:sampler.tick,x:sampler.positionX,z:sampler.positionZ,
      queued:pending.length+1});
    pending.push(next.frame);if(pending.length>=batchSize())void flush();
    return {x:sampler.positionX,z:sampler.positionZ,tick:sampler.tick};
  }
  async function sendFrames(frames,start){
    const sentAt=clock();
    const reply=await api.input({chunk:{protocol:'pve-input-v1',battleId,
      startTick:start,frames}});
    if(closed)return false;
    accept(reply,start+frames.length,clock()-sentAt);return true;
  }
  // C6-E rejects any whole chunk that contains post-terminal input, without
  // committing that chunk. Keep the authoritative guard and retry a sequence
  // of shorter, contiguous ORIGINAL prefixes (never manufacture new frames).
  // While recovering, stop sampling rather than filling the 60-frame queue
  // with future inputs that cannot belong to a closed server battle.
  async function recoverTerminalTail(frames){
    recoveringTerminalTail=true;
    let accepted=0,count=Math.ceil(frames.length/2);
    try{
      while(!closed&&!terminal&&accepted<frames.length){
        const size=Math.min(count,frames.length-accepted);
        try{
          if(!await sendFrames(frames.slice(accepted,accepted+size),ackTick))return;
          pending.splice(0,size);accepted+=size;
          count=Math.max(1,Math.ceil((frames.length-accepted)/2));
        }catch(e){
          if(e?.code!=='SLICE_TERMINAL_FRAME_TAIL'||size===1)throw e;
          count=Math.ceil(size/2);
        }
      }
      if(!closed&&!terminal)error('C12_TERMINAL_RECOVERY_INVALID');
      if(terminal)pending=[]; // unsent post-terminal samples have no authority
    }finally{recoveringTerminalTail=false;}
  }
  async function pump(){
    while(!closed&&!terminal&&pending.length>=batchSize()){
      const count=batchSize(),first=pending.slice(0,count);
      try{if(!await sendFrames(first,ackTick))return;pending.splice(0,count);}catch(e){
        if(e?.code!=='SLICE_TERMINAL_FRAME_TAIL')throw e;
        await recoverTerminalTail(first);
      }
    }
  }
  function flush(){
    if(busy||closed||terminal||pending.length<batchSize())return busy||Promise.resolve();
    busy=pump().catch(e=>{if(!closed){fault=e;update();}}).finally(()=>{busy=null;});
    return busy;
  }
  async function finish(){
    assertLive();if(busy)await busy;
    assertLive();if(!terminal||!battleId)error('C12_NOT_TERMINAL');
    const answer=await api.audit({battleId});
    if(!record(answer)||answer.ok!==true||answer.battleId!==battleId
      ||answer.candidateOnly!==true||answer.nonEconomic!==true
      ||answer.eligibleForSettlement!==false||answer.safeForCloudBattle!==false
      ||answer.productionReplayApproved!==false
      ||!['candidate-clear','candidate-defeat','candidate-nonpayable-clear'].includes(answer.phase)
      ||!safeTick(answer.verifiedTicks)||!Number.isSafeInteger(answer.verifiedChunks)
      ||Object.hasOwn(answer,'grant')||Object.hasOwn(answer,'rewards'))
      error('C12_AUDIT_NOT_NON_ECONOMIC');
    proof={phase:answer.phase,verifiedTicks:answer.verifiedTicks,
      verifiedChunks:answer.verifiedChunks,candidateOnly:true,
      eligibleForSettlement:false};update();return proof;
  }
  async function abandon(){
    if(closed)return;closed=true;pending=[];
    if(battleId){try{await api.abandon({battleId});}catch(_){/* ticket expires; no payout */}}
  }
  function stopLocal(){closed=true;pending=[];}
  return Object.freeze({start,drag,release,sample,flush,finish,abandon,stopLocal,
    getDiagnostics:diagnostics,
    get state(){return {battleId,current,terminal,ackTick,pending:pending.length,
      busy:Boolean(busy),error:fault,proof,diagnostics:diagnostics(),
      player:sampler?{x:sampler.positionX,z:sampler.positionZ}:null};}});
}
