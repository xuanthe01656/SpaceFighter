/**
 * Dungeon V2B.2 QA-only capture of ACCEPTED ShipInputController PointerEvents.
 * Data remains in memory and is emitted only to an explicit QA callback.
 * The client cannot validate the server MAC or prove human input; the server
 * must independently validate the ticket, schema and projection, and must not
 * treat even a matching trace as trusted combat or a reward entitlement.
 */
export const DUNGEON_DEVICE_TOUCH_TRACE_V2B2_VERSION='dungeon-device-touch-v2b2';
const MAX_EVENTS=256;
const numeric=x=>typeof x==='number'&&Number.isFinite(x);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&
  keys.every(key=>Object.hasOwn(x,key));
const freeze=x=>{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const v of Object.values(x))freeze(v);
    Object.freeze(x);
  }
  return x;
};
export function isDungeonV2B2LocalQaEnabledV2B2({env,qaRun,ticket,profileId,
  activeBattleId,dungeonId}={}) {
  // Compile-time Vite DEV AND explicit QA switch: cannot be activated in a
  // production build by supplying an untrusted ticket to the client.
  return env?.DEV===true&&env?.VITE_SF_DUNGEON_V2B2_QA==='true'&&
    Boolean(qaRun)&&record(ticket)&&
    ticket.version==='c15-dungeon-seed-touch-ticket-v2b2'&&
    ticket.qaOnly===true&&ticket.emulatorOnly===true&&
    ticket.safeForSettlement===false&&ticket.rewardSettlementEnabled===false&&
    ticket.cloudRewards===false&&ticket.dungeonId==='dung_taurus'&&
    ticket.roomId==='taurus_entry'&&ticket.dungeonId===dungeonId&&
    ticket.profileId===(profileId||'guest')&&
    ticket.battleId===activeBattleId&&
    Number.isSafeInteger(ticket.sceneSeed)&&ticket.sceneSeed>0&&
    ticket.sceneSeed<=0xffffffff&&
    typeof ticket.mac==='string'&&/^[a-f0-9]{64}$/.test(ticket.mac);
}
export function createDungeonDeviceTouchTraceV2B2({ticket}={}) {
  if (!record(ticket)||ticket.version!=='c15-dungeon-seed-touch-ticket-v2b2'||
      typeof ticket.battleId!=='string'||
      typeof ticket.mac!=='string'||!/^[a-f0-9]{64}$/.test(ticket.mac))
    throw new TypeError('V2B.2 local ticket shape required');
  const events=[];
  let lastAt=-1,activePointer=null,truncated=false;
  function capture(event) {
    if(truncated)return false;
    if (!record(event)|| !Number.isSafeInteger(event.pointerId) ||
        event.pointerId<0 ||event.pointerId>2147483647||
        !numeric(event.atMs)||event.atMs<0||event.atMs<lastAt||
        !exact(event.position,['x','z'])||
        !numeric(event.position.x)||!numeric(event.position.z))
      throw new TypeError('Accepted pointer QA event invalid');
    if (events.length>=MAX_EVENTS){truncated=true;return false;}
    const e=structuredClone(event);
    if (e.kind==='down') {
      if (!exact(e,['kind','pointerId','atMs','clientX','clientY','position'])||
          activePointer!==null||!numeric(e.clientX)||!numeric(e.clientY))
        throw new TypeError('Pointer down order invalid');
      activePointer=e.pointerId;
    } else if (e.kind==='move') {
      if (!exact(e,['kind','pointerId','atMs','clientX','clientY','position','viewport','delta'])||
          activePointer!==e.pointerId||!numeric(e.clientX)||!numeric(e.clientY)||
          !exact(e.delta,['deltaX','deltaY'])||
          !numeric(e.delta.deltaX)||!numeric(e.delta.deltaY)||
          !exact(e.viewport,['canvasWidth','canvasHeight','aspect','halfHeight','inset','pointerSpeedMultiplier']))
        throw new TypeError('Pointer move order invalid');
    } else if (e.kind==='up') {
      if (!exact(e,['kind','pointerId','atMs','position'])||
          activePointer!==e.pointerId)
        throw new TypeError('Pointer up order invalid');
      activePointer=null;
    } else throw new TypeError('Unexpected QA pointer event');
    lastAt=e.atMs;
    events.push(freeze(e));
    return true;
  }
  function snapshot() {
    return freeze({version:DUNGEON_DEVICE_TOUCH_TRACE_V2B2_VERSION,
      battleId:ticket.battleId,events:events.map(e=>structuredClone(e)),
      truncated,qaOnly:true,safeForSettlement:false});
  }
  return Object.freeze({capture,snapshot,
    get eventCount(){return events.length;},
    get truncated(){return truncated;}});
}
