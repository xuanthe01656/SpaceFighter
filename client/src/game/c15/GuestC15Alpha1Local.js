/**
 * Experimental G1/G2 guest-vs-cloud gameplay parity lane for Alpha Stage 1.
 *
 * This creates a LOCAL-ONLY deterministic encounter using the *same generated*
 * C15 simulation code as authenticated staging. It never forges a signed
 * genesis, never contacts a server, never creates a reward, and cannot upload
 * a journal. The default game's guest mode does not opt into this lane.
 *
 * The level-1 Alpha/X-Wing/Rail loadout is pinned to mirror the existing C15
 * RC1B contract. This QA lane is intentionally not a general equipment engine.
 */
import {PILOTS,AIRCRAFTS,GEAR_CATALOG} from '../../constants.js';
import {sha256Hex} from '../../generated/c15-kernel/C15KernelHash.js';
import {openInputJournal} from '../../generated/c15-kernel/CombatInputJournalV8.js';
import {openCombatVerticalSlice,replayCombatSliceChunk} from '../../generated/c15-kernel/CombatVerticalSliceV8.js';
import {resolveCampaignAlphaStage1C6E} from '../../generated/c15-kernel/CombatCampaignAlphaC6CV8.js';
import {C15_ARCADE_CONTROL_PROFILE_ID,resolveC15ControlProfile} from './C15ControlProfilesV1.js';

export const GUEST_C15_ALPHA1_PARITY_VERSION='guest-c15-alpha1-parity-qa-v1';
const CORE_VERSION='pve-core-poc-v1';
const VERSION='pve-battle-snapshot-preview-v1';
const RULES_VERSION='combat-v1.0.0';
const CATALOG_VERSION='product-v1.0.0';
const PROTOCOL_VERSION='pve-input-v1';
const MAX_TICKS=4500;
const UUID_RE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
function canonical(x){
  if(Array.isArray(x))return x.map(canonical);
  if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(key=>[key,canonical(x[key])]));
  return x;
}
const digest=x=>sha256Hex(JSON.stringify(canonical(x)));
const byId=(items,id)=>{
  const entries=items.filter(item=>item?.id===id);
  if(entries.length!==1)throw new Error('C15 guest QA requires a pinned approved catalog entry: '+id);
  return entries[0];
};
/** Recreate the server snapshot's *data layout*, NOT server authentication. */
export function createGuestC15Alpha1QaSnapshot({uid='guest-local-qa',sessionId,battleId,seed,issuedAtMs}={}){
  if(typeof uid!=='string'||!/^guest-[a-z0-9_-]{1,48}$/.test(uid)
    ||!UUID_RE.test(sessionId||'')||!UUID_RE.test(battleId||'')
    ||!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff
    ||!Number.isSafeInteger(issuedAtMs)||issuedAtMs<1||issuedAtMs>Number.MAX_SAFE_INTEGER-600000)
    throw new TypeError('Invalid local-only C15 guest QA context');
  const p=byId(PILOTS,'pilot_alpha');
  const a=byId(AIRCRAFTS,'ship_xwing');
  const g=byId(GEAR_CATALOG.mainGun,'gun_rail');
  const equipment={
    pilot:{id:p.id,level:1,stars:1,rarity:p.rarity,passive:p.passive,value:p.value},
    aircraft:{id:a.id,level:1,stars:1,baseHp:a.baseHp,baseAtk:a.baseAtk,baseArmor:a.baseArmor,
      speed:a.speed,hitboxScale:a.hitboxScale,passive:a.passive??null,passiveValue:a.passiveValue??null},
    mainGun:{instanceId:'qa_rail',baseId:g.id,slot:'mainGun',level:1,rarity:1,baseAtk:g.baseAtk,
      baseHp:null,fireRate:g.fireRate,fireRateUnit:'seconds',firePattern:g.firePattern,
      behavior:g.behavior??null,projectileType:g.projectileType,passive:g.passive??null},
    wingman:null,armor:null,drone:null,
  };
  const catalogFields={
    pilot:{id:equipment.pilot.id,rarity:equipment.pilot.rarity,passive:equipment.pilot.passive,value:equipment.pilot.value},
    aircraft:Object.fromEntries(Object.entries(equipment.aircraft).filter(([key])=>!['level','stars'].includes(key))),
    gear:Object.fromEntries(['mainGun','wingman','armor','drone'].map(slot=>[slot,equipment[slot]===null?null:
      Object.fromEntries(Object.entries(equipment[slot]).filter(([key])=>!['instanceId','level','rarity'].includes(key)))])),
  };
  const context={uid,sessionId,battleId,issuedAtMs,expiresAtMs:issuedAtMs+600000,
    mode:'campaign',locationId:'alpha_stage_1',rulesVersion:RULES_VERSION,catalogVersion:CATALOG_VERSION,
    protocolVersion:PROTOCOL_VERSION,coreVersion:CORE_VERSION};
  const arena={halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500};
  const base={snapshotVersion:VERSION,context,seed,arena,equipment,
    selectedCatalogHash:digest(['sf-v8b2c1-selected-catalog',catalogFields]),
    loadoutHash:digest(['sf-v8b2c1-loadout',equipment])};
  return freeze({...base,snapshotHash:digest(['sf-v8b2c1-snapshot',base])});
}
export function createGuestC15Alpha1QaBattle({seed,issuedAtMs,uid='guest-local-qa',sessionId,battleId}={}){
  if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw new TypeError('Guest QA explicit seed required');
  const snapshot=createGuestC15Alpha1QaSnapshot({uid,sessionId,battleId,issuedAtMs,seed});
  const encounter=resolveCampaignAlphaStage1C6E({snapshot});
  const profile=resolveC15ControlProfile(C15_ARCADE_CONTROL_PROFILE_ID);
  const policy=freeze({version:profile.policyVersion,keyboardUnitsPer60HzFrame:profile.keyboardUnitsPer60HzFrame,
    pilotHitRadiusUnits:profile.pilotHitRadiusUnits,projectileHitRadiusUnits:profile.projectileHitRadiusUnits});
  const journal=openInputJournal({uid,sessionId,battleId,rulesVersion:RULES_VERSION,
    loadoutHash:snapshot.loadoutHash,issuedAtMs});
  const run=openCombatVerticalSlice({snapshot,encounter,policy,journal});
  return Object.freeze({version:GUEST_C15_ALPHA1_PARITY_VERSION,run,snapshot,encounter,policy,
    issuedAtMs,uid,sessionId,battleId,qaOnly:true,serverReplayRequired:false,
    nonEconomic:true,safeForSettlement:false});
}
export function advanceGuestC15Alpha1QaBattle(battle,input){
  if(battle?.version!==GUEST_C15_ALPHA1_PARITY_VERSION||battle.qaOnly!==true||battle.safeForSettlement!==false)
    throw new TypeError('Invalid guest-only C15 QA battle');
  if(battle.run.state.phase!=='active'||battle.run.state.tick>=MAX_TICKS)throw new TypeError('Guest QA battle terminal');
  if(!input||!Number.isSafeInteger(input.x)||!Number.isSafeInteger(input.z)||Math.abs(input.x)>127||Math.abs(input.z)>127
    ||input.x*input.x+input.z*input.z>128*128)throw new TypeError('Invalid guest QA input');
  const nextTick=battle.run.state.tick+1;
  const chunk={protocol:PROTOCOL_VERSION,battleId:battle.battleId,startTick:nextTick-1,frames:[{x:input.x,z:input.z}]};
  const {run}=replayCombatSliceChunk({run:battle.run,chunk,
    receivedAtMs:battle.issuedAtMs+Math.ceil(nextTick*1000/30)+10});
  return Object.freeze({...battle,run});
}
export function guestC15Alpha1QaView(battle){
  if(battle?.version!==GUEST_C15_ALPHA1_PARITY_VERSION)throw new TypeError('Invalid guest QA battle view');
  const s=battle.run.state,p=battle.run.foundation.checkpoint.position;
  return Object.freeze({version:'c15-local-world-view-v1',battleId:battle.battleId,tick:s.tick,
    phase:s.phase,terminal:s.phase!=='active',hp:s.hp,maxHp:s.maxHp,wave:s.spawnedWaves,
    wavesTotal:battle.encounter.waves.length,kills:s.kills,contacts:s.contacts,escaped:s.escaped||0,
    pilot:{xUnits:p.xUnits,zUnits:p.zUnits},enemies:s.enemies.map(e=>({id:e.id,kind:e.kind,xUnits:e.xUnits,
      zUnits:e.zUnits,hp:e.hp,maxHp:e.maxHp,hitRadiusUnits:e.hitRadiusUnits})),
    projectiles:s.projectiles.map(x=>({...x})),enemyProjectiles:(s.enemyProjectiles||[]).map(x=>({...x})),
    stateDigest:s.stateDigest,traceDigest:s.traceDigest,qaOnly:true,serverReplayRequired:false,
    nonEconomic:true,safeForSettlement:false,cloudRewards:false});
}
export function guestC15QaControlConfig(battle,{canvasWidth,canvasHeight}={}){
  if(battle?.version!==GUEST_C15_ALPHA1_PARITY_VERSION||!(canvasWidth>0&&canvasHeight>0))
    throw new TypeError('Guest QA control viewport invalid');
  const preview=battle.run.foundation.preview,p=battle.run.foundation.checkpoint.position;
  return Object.freeze({arenaHalfWidth:preview.arena.halfWidthUnits,
    arenaHalfHeight:preview.arena.halfHeightUnits,hitRadius:preview.pilotHitRadiusUnits,
    movePerTick:preview.movePerTickUnits,startX:p.xUnits,startZ:p.zUnits,
    canvasWidth,canvasHeight,aspect:canvasWidth/canvasHeight,halfHeight:15,speedMultiplier:preview.speedMultiplier});
}
/** The only non-deterministic inputs are generated BEFORE the local battle. */
export function createGuestC15QaNewBattle(){
  const cryptoApi=globalThis.crypto;
  if(!cryptoApi?.getRandomValues||!cryptoApi?.randomUUID)throw new TypeError('Secure local random source missing');
  const entropy=new Uint32Array(1);cryptoApi.getRandomValues(entropy);
  return createGuestC15Alpha1QaBattle({seed:clamp(entropy[0]||1,1,0xffffffff),issuedAtMs:Date.now(),
    sessionId:cryptoApi.randomUUID(),battleId:cryptoApi.randomUUID()});
}
