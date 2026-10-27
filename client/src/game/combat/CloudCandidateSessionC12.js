/**
 * C12: diagnostic C11 candidate transport. Uses only quantized 30Hz input;
 * all state/HP/results come from server checkpoints. Never requests settlement.
 * The returned candidate audit cannot be used as a C10 production receipt.
 */
import {openCloudInputIntent,addCloudPointerDelta,sampleCloudInputTick,
  clearCloudPointerTarget} from './CloudInputIntentV8.js';
export const C12_CLIENT_VERSION='v8-c12-mobile-candidate-non-economic-v1';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PHASES=new Set(['active','lab-clear','lab-defeat']);
const V='sf-c8-alpha1-server-render-qa-v1';
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
  const update=()=>onUpdate({reply:current,ackTick,queued:pending.length,
    terminal,error:fault,proof});
  const assertLive=()=>{if(closed)error('C12_CLOSED');if(fault)throw fault;};
  function accept(reply,tick){
    requireCandidateReplyC12(reply,{battleId,expectedTick:tick});
    if(reply.nextTick<ackTick)error('C12_TICK_REWIND');
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
    return accept(opened,0);
  }
  function drag(dx,dy){assertLive();if(!sampler||terminal)return false;
    sampler=addCloudPointerDelta(sampler,{deltaX:dx,deltaY:dy});return true;}
  function release(){assertLive();if(!sampler||terminal)return false;
    sampler=clearCloudPointerTarget(sampler);return true;}
  function sample(nowMs=clock()){
    assertLive();if(!sampler||terminal)return null;
    if(!Number.isFinite(nowMs)||(lastMs!==null&&nowMs-lastMs>250)){
      fault=new Error('C12_CLOCK_GAP_RESTART');update();throw fault;
    }
    if(lastMs!==null&&nowMs-lastMs<25)return null;
    if(pending.length>=60){fault=new Error('C12_NETWORK_BACKPRESSURE');update();throw fault;}
    lastMs=nowMs;
    const next=sampleCloudInputTick(sampler);sampler=next.state;
    pending.push(next.frame);if(pending.length>=15)void flush();
    return {x:sampler.positionX,z:sampler.positionZ,tick:sampler.tick};
  }
  async function sendFrames(frames,start){
    const reply=await api.input({chunk:{protocol:'pve-input-v1',battleId,
      startTick:start,frames}});
    if(closed)return false;
    accept(reply,start+frames.length);return true;
  }
  async function pump(){
    while(!closed&&!terminal&&pending.length>=15){
      const first=pending.slice(0,15);
      try{if(!await sendFrames(first,ackTick))return;pending.splice(0,15);}catch(e){
        if(e?.code!=='SLICE_TERMINAL_FRAME_TAIL')throw e;
        for(const frame of first){
          if(closed||terminal)break;
          if(!await sendFrames([frame],ackTick))return;
          pending.shift();
        }
      }
    }
  }
  function flush(){
    if(busy||closed||terminal||pending.length<15)return busy||Promise.resolve();
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
    get state(){return {battleId,current,terminal,ackTick,pending:pending.length,
      busy:Boolean(busy),error:fault,proof,
      player:sampler?{x:sampler.positionX,z:sampler.positionZ}:null};}});
}
