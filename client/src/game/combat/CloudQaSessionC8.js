/**
 * C8: opt-in, NON-ECONOMIC Cloud Alpha 1 QA transport controller.
 * Only quantized {x,z} intent leaves this client. Never send a local win,
 * HP, kills, wallet, score, timestamp, seed or client-supplied checkpoint.
 * The server's projected visual is informational, not a production proof.
 */
import {openCloudInputIntent,addCloudPointerDelta,sampleCloudInputTick,
  clearCloudPointerTarget} from './CloudInputIntentV8.js';

export const C8_QA_CLIENT_VERSION='sf-c8-cloud-alpha1-qa-client-v1';
const VIEW_VERSION='sf-c8-alpha1-server-render-qa-v1';
const PROTOCOL='pve-input-v1';
const BATCH=15;
const MAX_PENDING=60;
const VALID_PHASES=new Set(['active','lab-clear','lab-defeat']);
export class CloudQaC8Error extends Error {
  constructor(code,message){super(message);this.name='CloudQaC8Error';this.code=code;}
}
const fail=(code,message)=>{throw new CloudQaC8Error(code,message);};
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const deepOwn=(r,k)=>Object.prototype.hasOwnProperty.call(r,k);
export function requireQaC8Reply(reply,{battleId=null,expectedTick=null}={}){
  if(!plain(reply)||reply.ok!==true||reply.qaOnly!==true
    ||reply.safeForCloudBattle!==false||reply.settlementEnabled!==false
    ||!UUID.test(reply.battleId||'')
    ||(battleId!==null&&reply.battleId!==battleId)
    ||reply.protocol!==PROTOCOL||!int(reply.nextTick,0,4500)
    ||(expectedTick!==null&&reply.nextTick!==expectedTick)
    ||!VALID_PHASES.has(reply.phase)||!int(reply.expiresAtMs,1,Number.MAX_SAFE_INTEGER)
    ||!plain(reply.visual)||reply.visual.version!==VIEW_VERSION
    ||reply.visual.qaOnly!==true||reply.visual.settlementEnabled!==false
    ||reply.visual.locationId!=='alpha_stage_1'
    ||reply.visual.tick!==reply.nextTick||reply.visual.phase!==reply.phase
    ||!plain(reply.visual.config)||!plain(reply.visual.pilot)
    ||!Array.isArray(reply.visual.enemies)||!Array.isArray(reply.visual.shots)
    ||!Array.isArray(reply.visual.enemyShots)
    ||deepOwn(reply,'victory')||deepOwn(reply,'rewards')){
    fail('C8_QA_SERVER_REPLY_INVALID','Untrusted or inconsistent Cloud QA response');
  }
  return reply;
}
/** Headless controller: caller owns timer, canvas, auth and the transport. */
export function createCloudQaSessionC8({api,viewport,clock,randomId,onUpdate=()=>{}}={}){
  if(!plain(api)||['open','input','status','receipt','audit','abandon'].some(k=>typeof api[k]!=='function')
    ||typeof clock!=='function'||typeof randomId!=='function'||typeof onUpdate!=='function'
    ||!plain(viewport))throw new TypeError('Cloud QA dependencies required');
  let battleId=null,sampler=null,current=null,pending=[],ackTick=0,lastMs=null;
  let busy=null,closed=false,terminal=false,error=null,finalProof=null;
  const notify=()=>onUpdate({reply:current,ackTick,queued:pending.length,
    terminal,error,proof:finalProof});
  const guard=()=>{if(closed)fail('C8_QA_CLOSED','QA session stopped');
    if(error)throw error;};
  function accept(reply,expectedTick){
    requireQaC8Reply(reply,{battleId,expectedTick});
    if(reply.nextTick<ackTick)fail('C8_QA_REPLY_REWOUND','Server tick moved backwards');
    ackTick=reply.nextTick;current=reply;terminal=reply.phase!=='active';
    notify();return reply;
  }
  async function start(){
    guard();if(battleId)fail('C8_QA_ALREADY_STARTED','QA session already opened');
    const body={mode:'campaign',locationId:'alpha_stage_1',requestId:randomId()};
    let reply;
    try{reply=await api.open(body);}catch(e){
      if(e?.code!=='QA_BATTLE_ALREADY_ACTIVE')throw e;
      // A previous crash must not block QA for 10 minutes. Abandon only the
      // current authenticated user's QA ticket; never a legacy Cloud ticket.
      const prior=await api.status();
      requireQaC8Reply(prior);
      await api.abandon({battleId:prior.battleId});
      reply=await api.open({...body,requestId:randomId()});
    }
    if(closed)fail('C8_QA_CLOSED','QA session stopped');
    requireQaC8Reply(reply,{expectedTick:0});
    battleId=reply.battleId;
    // Snapshot-derived parameters are owned by the server, while viewport
    // dimensions are local display geometry only.
    sampler=openCloudInputIntent({...reply.visual.config,...viewport});
    return accept(reply,0);
  }
  function drag(dx,dy){
    guard();if(!sampler||terminal)return false;
    sampler=addCloudPointerDelta(sampler,{deltaX:dx,deltaY:dy});return true;
  }
  function release(){
    guard();if(!sampler||terminal)return false;
    // C8 selects *only for this opt-in diagnostic* the provisional clear
    // policy; this is NOT a native UX sign-off or a Cloud reward contract.
    sampler=clearCloudPointerTarget(sampler);return true;
  }
  function sample(nowMs=clock()){
    guard();if(!sampler||terminal)return null;
    if(typeof nowMs!=='number'||!Number.isFinite(nowMs)
      ||(lastMs!==null&&nowMs-lastMs>250)){
      error=new CloudQaC8Error('C8_QA_CLOCK_GAP','App paused; start a new QA ticket');
      notify();throw error;
    }
    // A double-firing timer must not manufacture faster-than-real inputs.
    if(lastMs!==null&&nowMs-lastMs<25)return null;
    if(pending.length>=MAX_PENDING){
      error=new CloudQaC8Error('C8_QA_NETWORK_BACKPRESSURE','Network backlog exceeded; restart QA');
      notify();throw error;
    }
    lastMs=nowMs;
    const next=sampleCloudInputTick(sampler);
    sampler=next.state;pending.push(next.frame);
    if(pending.length>=BATCH)void flush();
    return {x:sampler.positionX,z:sampler.positionZ,tick:sampler.tick};
  }
  async function sendFrames(frames,start){
    const chunk={protocol:PROTOCOL,battleId,startTick:start,frames};
    const reply=await api.input({chunk});
    if(closed)return false;
    accept(reply,start+frames.length);
    return true;
  }
  async function pump(){
    while(!closed&&!terminal&&pending.length>=BATCH){
      const first=pending.slice(0,BATCH),start=ackTick;
      try{
        if(!await sendFrames(first,start))return;
        pending.splice(0,BATCH);
      }catch(e){
        if(e?.code!=='SLICE_TERMINAL_FRAME_TAIL')throw e;
        // QA kernel intentionally rejects any extra frame after terminal.
        // Replay the unchanged original inputs one at a time only for this
        // final batch; never ask the server to accept a forged win.
        for(const frame of first){
          if(closed||terminal)break;
          if(!await sendFrames([frame],ackTick))return;
          pending.shift();
        }
      }
    }
  }
  function flush(){
    if(busy||closed||terminal||pending.length<BATCH)return busy||Promise.resolve();
    busy=pump().catch(e=>{
      if(!closed){error=e instanceof Error?e:new Error(String(e));notify();}
    }).finally(()=>{busy=null;});
    return busy;
  }
  async function finish(){
    guard();if(busy)await busy;
    guard();if(!terminal||!battleId)
      fail('C8_QA_NOT_TERMINAL','Server has not confirmed a completed QA match');
    const receipt=await api.receipt({battleId});
    if(receipt.ok!==true||receipt.qaOnly!==true||receipt.settlementEnabled!==false
      ||receipt.battleId!==battleId||receipt.phase!==current.phase)
      fail('C8_QA_RECEIPT_INVALID','Server QA receipt invalid');
    const proof=await api.audit({battleId});
    if(proof.ok!==true||proof.qaOnly!==true||proof.nonEconomic!==true
      ||proof.settlementEnabled!==false||proof.replayMatched!==true
      ||proof.battleId!==battleId||proof.phase!==current.phase)
      fail('C8_QA_AUDIT_INVALID','Server genesis audit invalid');
    finalProof={phase:proof.phase,verifiedTicks:proof.verifiedTicks,
      verifiedChunks:proof.verifiedChunks,qaOnly:true,settlementEnabled:false};
    notify();return finalProof;
  }
  async function abandon(){
    if(closed)return;
    closed=true;pending=[];
    if(battleId){try{await api.abandon({battleId});}catch(_){/* expiry still bounds old QA ticket */}}
  }
  function stopLocal(){closed=true;pending=[];}
  return Object.freeze({start,drag,release,sample,flush,finish,abandon,stopLocal,
    get state(){return {battleId,current,terminal,ackTick,pending:pending.length,
      busy:Boolean(busy),error,proof:finalProof,
      player:sampler?{x:sampler.positionX,z:sampler.positionZ}:null};}});
}
