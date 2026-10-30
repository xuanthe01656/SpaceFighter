/**
 * Generic local deterministic runner shell. The reducer is a reviewed local
 * combat kernel; this shell records only input and never emits a trusted result.
 */
import {parseC15CommercialGenesis} from './C15CommercialGenesis.js';
import {openC15LocalJournal,appendC15LocalFrame} from './C15LocalJournal.js';
const states=new WeakSet();
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const seal=x=>{const out=freeze(x);states.add(out);return out;};
const check=x=>{if(!record(x)||!states.has(x))throw new TypeError('C15 local battle state invalid');};
export function openC15LocalBattleFoundation({genesis,initialState,reducer}){
  const view=parseC15CommercialGenesis(genesis);
  if(typeof reducer!=='function'||!record(initialState))throw new TypeError('C15 local reducer/initial state required');
  const journal=openC15LocalJournal({battleId:view.battleId,rulesVersion:view.rulesVersion,
    loadoutHash:genesis.loadoutHash,issuedAtMs:genesis.issuedAtMs});
  return seal({version:'c15-local-battle-foundation-v1',view,journal,localState:freeze(structuredClone(initialState)),
    reducer,terminal:false,provisionalPhase:'active'});
}
export function advanceC15LocalBattleFoundation(state,input){check(state);if(state.terminal)throw new TypeError('C15 local battle already terminal');
  const next=state.reducer({state:state.localState,input,tick:state.journal.nextTick+1,genesis:state.view});
  if(!record(next)||!record(next.state)||typeof next.terminal!=='boolean'
    ||!['active','local-clear','local-defeat'].includes(next.phase))throw new TypeError('C15 local reducer result invalid');
  const journal=appendC15LocalFrame(state.journal,input);
  return seal({...state,journal,localState:freeze(structuredClone(next.state)),terminal:next.terminal,
    provisionalPhase:next.phase});
}
export function c15LocalBattleView(state){check(state);return freeze({version:state.version,battleId:state.view.battleId,
  tick:state.journal.nextTick,localState:state.localState,terminal:state.terminal,
  provisionalPhase:state.provisionalPhase,serverReplayRequired:true,eligibleForSettlement:false});}
