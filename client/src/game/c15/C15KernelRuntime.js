/**
 * Browser adapter around the generated deterministic server kernel. This is
 * local presentation/provisional gameplay only; server finalize independently
 * replays the append-only journal before returning a verified RC1B result.
 */
import {parseC15CommercialGenesis} from '../combat/C15CommercialGenesis.js';
import {openInputJournal,openCombatVerticalSlice,replayCombatSliceChunk} from '../../generated/c15-kernel/index.js';

const states=new WeakSet();
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const frame=x=>exact(x,['x','z'])&&Number.isSafeInteger(x.x)&&Number.isSafeInteger(x.z)
  &&x.x>=-127&&x.x<=127&&x.z>=-127&&x.z<=127&&x.x*x.x+x.z*x.z<=128*128;
const freeze=x=>{if(x&&typeof x==='object'){for(const value of Object.values(x))freeze(value);Object.freeze(x);}return x;};
const seal=x=>{const out=freeze(x);states.add(out);return out;};
const check=x=>{if(!record(x)||!states.has(x))throw new TypeError('C15 kernel runtime state invalid');};
const phase=value=>value==='lab-clear'?'local-clear':value==='lab-defeat'?'local-defeat':'active';
function cloneTransport(value,path='root'){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw Object.assign(new TypeError(`C15 transport number invalid at ${path}`),{code:'C15_TRANSPORT_CLONE_INVALID'});
    return value;
  }
  if(Array.isArray(value))return value.map((item,index)=>cloneTransport(item,`${path}[${index}]`));
  if(record(value)){
    const out={};for(const [key,item] of Object.entries(value))out[key]=cloneTransport(item,`${path}.${key}`);return out;
  }
  throw Object.assign(new TypeError(`C15 transport value invalid at ${path}`),{code:'C15_TRANSPORT_CLONE_INVALID'});
}

export function openC15KernelRuntime({genesis,runtime}={}){
  const view=parseC15CommercialGenesis(genesis);
  if(!exact(runtime,['snapshot','encounter','policy'])||!record(runtime.snapshot)||!record(runtime.encounter)||!record(runtime.policy))
    throw new TypeError('C15 local runtime envelope invalid');
  // JSON transport and IndexedDB remove Object.freeze markers. Rehydrate the
  // HMAC-bound contracts before passing them into the deterministic kernel.
  const snapshot=freeze(cloneTransport(runtime.snapshot,'runtime.snapshot'));
  const encounter=freeze(cloneTransport(runtime.encounter,'runtime.encounter'));
  const policy=freeze(cloneTransport(runtime.policy,'runtime.policy'));
  if(snapshot.snapshotHash!==genesis.snapshotHash||snapshot.loadoutHash!==genesis.loadoutHash
    ||snapshot.context?.battleId!==genesis.battleId||snapshot.context?.uid!==genesis.uid
    ||snapshot.context?.sessionId!==genesis.sessionId||encounter.snapshotHash!==genesis.snapshotHash)
    throw new TypeError('C15 local runtime is not bound to signed genesis');
  const journal=openInputJournal({uid:genesis.uid,sessionId:genesis.sessionId,battleId:genesis.battleId,
    rulesVersion:snapshot.context.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs:genesis.issuedAtMs});
  const run=openCombatVerticalSlice({snapshot,journal,policy,encounter});
  return seal({version:'c15-browser-kernel-runtime-v1',genesis:view,rawGenesis:freeze(cloneTransport(genesis,'genesis')),
    run,tick:0,terminal:false,provisionalPhase:'active'});
}
export function advanceC15KernelRuntime(state,input){
  check(state);if(state.terminal)throw new TypeError('C15 local runtime already terminal');
  if(!frame(input))throw new TypeError('C15 local input frame invalid');
  const chunk=freeze({protocol:'pve-input-v1',battleId:state.rawGenesis.battleId,startTick:state.run.state.tick,
    frames:[freeze({x:input.x,z:input.z})]});
  const receivedAtMs=state.rawGenesis.issuedAtMs+Math.ceil((state.run.state.tick+1)*1000/30)+10;
  const next=replayCombatSliceChunk({run:state.run,chunk,receivedAtMs});
  const provisionalPhase=phase(next.run.state.phase);
  return freeze({state:seal({...state,run:next.run,tick:next.run.state.tick,
    terminal:provisionalPhase!=='active',provisionalPhase}),events:next.events});
}
export function replayC15KernelRuntime({genesis,runtime,frames}={}){
  if(!Array.isArray(frames)||frames.length>4500)throw new TypeError('C15 local replay frames invalid');
  let state=openC15KernelRuntime({genesis,runtime});
  for(const input of frames){if(state.terminal)throw new TypeError('C15 persisted frames continue after terminal');state=advanceC15KernelRuntime(state,input).state;}
  return state;
}
export function c15KernelRuntimeView(state){
  check(state);const run=state.run,s=run.state,p=run.foundation.checkpoint.position;
  return freeze({version:'c15-local-world-view-v1',battleId:s.battleId,tick:s.tick,phase:s.phase,
    provisionalPhase:state.provisionalPhase,terminal:state.terminal,hp:s.hp,maxHp:s.maxHp,
    wave:s.spawnedWaves,wavesTotal:run.encounter.waves.length,kills:s.kills,contacts:s.contacts,escaped:s.escaped||0,
    pilot:freeze({xUnits:p.xUnits,zUnits:p.zUnits}),
    enemies:s.enemies.map(enemy=>freeze({id:enemy.id,kind:enemy.kind,xUnits:enemy.xUnits,zUnits:enemy.zUnits,
      hp:enemy.hp,maxHp:enemy.maxHp,hitRadiusUnits:enemy.hitRadiusUnits})),
    projectiles:s.projectiles.map(projectile=>freeze({...projectile})),
    enemyProjectiles:(s.enemyProjectiles||[]).map(projectile=>freeze({...projectile})),
    stateDigest:s.stateDigest,traceDigest:s.traceDigest,serverReplayRequired:true,
    nonEconomic:true,safeForSettlement:false,cloudRewards:false});
}
export function c15KernelInputConfig(state,{canvasWidth,canvasHeight,halfHeight=15}={}){
  check(state);const preview=state.run.foundation.preview;
  if(!(canvasWidth>0&&canvasHeight>0))throw new TypeError('C15 viewport invalid');
  return freeze({arenaHalfWidth:preview.arena.halfWidthUnits,arenaHalfHeight:preview.arena.halfHeightUnits,
    hitRadius:preview.pilotHitRadiusUnits,movePerTick:preview.movePerTickUnits,
    startX:state.run.foundation.checkpoint.position.xUnits,startZ:state.run.foundation.checkpoint.position.zUnits,
    aspect:canvasWidth/canvasHeight,canvasWidth,canvasHeight,halfHeight,speedMultiplier:preview.speedMultiplier});
}
