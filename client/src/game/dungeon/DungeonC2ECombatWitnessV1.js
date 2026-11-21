/**
 * C15 C2E: bounded, untrusted causal witness from the REAL Babylon Dungeon.
 * It does not drive gameplay. The input grid is a Babylon-time observer, not a
 * deterministic combat clock. FNV protects accidental corruption, not forgery.
 */
export const C2E_WITNESS_VERSION='c15-dungeon-c2e-combat-witness-v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KINDS=new Set(['room_start','enemy_spawn','enemy_fire','enemy_hit',
  'enemy_death','enemy_despawn','projectile_contact']);
const NUMBER=x=>typeof x==='number'&&Number.isFinite(x);
const ID=x=>typeof x==='string'&&x.length>0&&x.length<=128&&/^[A-Za-z0-9_:./@-]+$/.test(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const round=x=>Math.round(x*10000)/10000;
function fnv(text){let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
export function createDungeonC2ECombatWitnessV1({sceneSeed,seedSource,battleId=null,getGrid}={}){
  if(!Number.isSafeInteger(sceneSeed)||sceneSeed<1||sceneSeed>0xffffffff||
    !['local-client-seed','server-ticket-local-unverified'].includes(seedSource)||
    (seedSource==='local-client-seed'?battleId!==null:!UUID.test(battleId||''))||
    typeof getGrid!=='function')throw new TypeError('C2E_START_INVALID');
  const events=[];
  let finished=false,overflow=false,captureError=null;
  function capture(entry){
    if(finished||overflow||captureError)return false;
    if(!entry||!KINDS.has(entry.kind)){
      captureError='C2E_EVENT_KIND_INVALID';return false;
    }
    const tick=getGrid()?.ticks?.length+1;
    if(!Number.isSafeInteger(tick)||tick<1||tick>361){
      overflow=true;return false;
    }
    if(events.length>=256){overflow=true;return false;}
    const fields=['enemyId','roleId','bulletId'];
    if(fields.some(key=>entry[key]!=null&&!ID(entry[key]))||
      (entry.amount!=null&&(!NUMBER(entry.amount)||entry.amount<0||entry.amount>1e9))||
      (entry.hp!=null&&(!NUMBER(entry.hp)||entry.hp<0||entry.hp>1e9))||
      (entry.origin!=null&&(!NUMBER(entry.origin.x)||!NUMBER(entry.origin.z)||
        Math.abs(entry.origin.x)>100||Math.abs(entry.origin.z)>100))||
      (entry.velocity!=null&&(!NUMBER(entry.velocity.x)||!NUMBER(entry.velocity.z)||
        Math.abs(entry.velocity.x)>100||Math.abs(entry.velocity.z)>100))){
      captureError='C2E_EVENT_INVALID';return false;
    }
    const event={seq:events.length+1,tick,kind:entry.kind,
      enemyId:entry.enemyId??null,roleId:entry.roleId??null,
      bulletId:entry.bulletId??null,amount:entry.amount==null?null:round(entry.amount),
      hp:entry.hp==null?null:round(entry.hp),
      origin:entry.origin?{x:round(entry.origin.x),z:round(entry.origin.z)}:null,
      velocity:entry.velocity?{x:round(entry.velocity.x),z:round(entry.velocity.z)}:null};
    events.push(Object.freeze(event));return true;
  }
  function snapshot(){
    const grid=getGrid();
    if(!grid||grid.version!=='c15-dungeon-c2c-input-grid-v1'||
      grid.sceneSeed!==sceneSeed||grid.battleId!==battleId||grid.seedSource!==seedSource)
      throw new TypeError('C2E_INPUT_GRID_UNPAIRED');
    // Export the same contiguous prefix as the already-saved C2C checkpoint.
    // No fabricated observation tick; later live events are not part of this proof.
    const prefix=events.filter(x=>x.tick<=grid.ticks.length).map(clone);
    const body={version:C2E_WITNESS_VERSION,
      source:'real-babylon-causal-events-untrusted',dungeonId:'dung_taurus',
      roomId:'taurus_entry',battleId,sceneSeed,seedSource,
      tickHz:30,tickBasis:'accumulated-babylon-delta-not-fixed-combat-simulation',
      grid:clone(grid),events:prefix,finished,overflow,captureError,
      qaOnly:true,fixedTickSimulationVerified:false,fullCombatReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
      checksumAlgorithm:'fnv1a32-accidental-corruption-only'};
    return Object.freeze({...body,checksum:fnv(JSON.stringify(body))});
  }
  return Object.freeze({capture,snapshot,finish:()=>{finished=true;return snapshot();},
    get eventCount(){return events.length;}});
}
export function prepareDungeonC2ECombatWitnessJsonV1(record,date=new Date()){
  if(!record||record.version!==C2E_WITNESS_VERSION||record.qaOnly!==true||
    record.safeForSettlement!==false||record.rewardSettlementEnabled!==false||
    record.cloudRewards!==false||record.fixedTickSimulationVerified!==false||
    record.fullCombatReplayVerified!==false||!Array.isArray(record.events)||
    record.grid?.version!=='c15-dungeon-c2c-input-grid-v1'||
    !(date instanceof Date)||!Number.isFinite(date.getTime()))
    throw new TypeError('C2E_EXPORT_UNSAFE');
  const json=JSON.stringify(record,null,2)+'\n';
  if(new TextEncoder().encode(json).length>256*1024)throw new TypeError('C2E_EXPORT_SIZE_LIMIT');
  const stamp=date.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
  return Object.freeze({fileName:`dungeon_taurus_c2e_${stamp}.json`,json,
    gridTicks:record.grid.ticks.length,combatEvents:record.events.length,
    diagnosticOnly:true,evidenceStatus:'CLIENT_CAUSAL_EVENTS_UNTRUSTED'});
}
