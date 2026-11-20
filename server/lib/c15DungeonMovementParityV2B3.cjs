'use strict';
/**
 * Dungeon C15 V2B.3: emulator-only, NON-ECONOMIC cumulative touch-path replay.
 *
 * Uses the V2B.2 server-verified admission/seed ticket and the already recorded
 * accepted-pointer telemetry. It does NOT independently authenticate a device,
 * attest to human input, reproduce 30 Hz C15 combat input, simulate hits/AI,
 * prove room clear, or authorize rewards. There are no HTTP routes or writes.
 *
 * V2B.2's client recorder emits cumulative snapshots after each pointerup. This
 * QA reducer verifies that prior events have not changed, that newly appended
 * gestures begin at the last replayed pose, and that Babylon controller drag
 * projections agree with the server-replayed path. State is instance-issued.
 */
const {createHash} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {GameError} = require('./economy.cjs');
const {parseC15DungeonSeedTouchTicketV2B2Config,
  VERSION: V2B2_VERSION, TRACE_VERSION} = require('./c15DungeonSeedTouchTicketV2B2.cjs');

const VERSION = 'c15-dungeon-movement-parity-v2b3';
const MAX_EVENTS = 256;
const START_X = 0;
const START_Z = 12.5; // DungeonScene: playerRoot.position.set(0,0,ZOOM - 2.5), ZOOM=15.
const EPS = 1e-6;
const HEX = /^[a-f0-9]{64}$/;
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const safeInt = (x, lo, hi) => Number.isSafeInteger(x) && x >= lo && x <= hi;
const canonical = x => Array.isArray(x) ? x.map(canonical) : record(x) ?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x;
const digest = (tag,value) => createHash('sha256')
  .update(JSON.stringify([tag,canonical(value)])).digest('hex');
const close = (a,b) => typeof a === 'number' && Number.isFinite(a) &&
  Math.abs(a-b) <= EPS;
const deny = (code,text,status=423) => {throw new GameError(code,text,status);};
const freeze = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const child of Object.values(x)) freeze(child);
    Object.freeze(x);
  }
  return x;
};
const locked = () => deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Independent combat verification and Dungeon reward settlement remain unavailable');

function parseC15DungeonMovementParityV2B3Config(env={}) {
  if (!env || typeof env !== 'object' || Array.isArray(env))
    throw new TypeError('V2B.3 QA environment object required');
  if (env.GAME_C15_DUNGEON_V2B3_ENABLED !== 'true') return null;
  if (env.GAME_C15_DUNGEON_V2B3_QA_APPROVED !== 'true')
    throw new TypeError('V2B.3 explicit local QA approval required');
  const parent = parseC15DungeonSeedTouchTicketV2B2Config(env);
  if (!parent || parent.emulatorOnly !== true || !parent.projectId.startsWith('demo-'))
    throw new TypeError('V2B.3 requires approved V2B.2 demo Firestore Emulator');
  return freeze({version:VERSION, projectId:parent.projectId,
    allowedUids:[...parent.allowUids],emulatorOnly:true});
}

function disabled() {
  const off=()=>deny('C15_DUNGEON_V2B3_DISABLED','Dungeon V2B.3 local QA is OFF');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    rewardSettlementEnabled:false,open:off,ingestSnapshot:off,inspect:off,
    finalize:locked,claim:locked});
}

async function createC15DungeonMovementParityV2B3({env={},ticketService,
  encounterModule, projectionModule}={}) {
  const config = parseC15DungeonMovementParityV2B3Config(env);
  if (!config) return disabled();
  if (!ticketService || ticketService.enabled !== true ||
    ticketService.emulatorOnly !== true || ticketService.productionEnabled !== false ||
    ticketService.rewardSettlementEnabled !== false ||
    typeof ticketService.verifyTicket !== 'function' ||
    typeof ticketService.inspectDeviceTrace !== 'function')
    throw new TypeError('V2B.3 requires the actual approved V2B.2 QA ticket service');
  const [encounter,shared]=await Promise.all([
    encounterModule || import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonEncounterDirectorV38.js')).href),
    projectionModule || import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonSeedTouchContractV2B1.js')).href),
  ]);
  if (typeof encounter.buildDungeonRoomSpawnPlanV38 !== 'function' ||
    typeof shared.projectDungeonDirectTouchV2B1 !== 'function' ||
    shared.DUNGEON_LIVE_CAMERA_HALF_HEIGHT_V2B1 !== 15)
    throw new TypeError('Reviewed Dungeon spawn/movement math no longer available');
  const issued = new WeakSet();
  const makeState = fields => { const state=freeze(fields);issued.add(state);return state; };
  function requireIssued(state) {
    if (!record(state) || !issued.has(state))
      deny('C15_DUNGEON_V2B3_STATE_UNTRUSTED','Replay state must be instance-issued',403);
  }
  async function verified(ticket, actor) {
    if (!record(actor) || !config.allowedUids.includes(actor.uid) ||
      !record(ticket) || ticket.version !== V2B2_VERSION ||
      ticket.dungeonId !== 'dung_taurus' || ticket.roomId !== 'taurus_entry' ||
      !HEX.test(ticket.mac || '') || ticket.qaOnly !== true ||
      ticket.safeForSettlement !== false || ticket.cloudRewards !== false)
      deny('C15_DUNGEON_V2B3_ACTOR_INVALID','Local QA ticket and allowlisted actor required',403);
    const trusted = await ticketService.verifyTicket(ticket, actor);
    if (!record(trusted) || trusted.battleId !== ticket.battleId ||
      trusted.sceneSeed !== ticket.sceneSeed ||
      trusted.spawnPlanDigest !== ticket.spawnPlanDigest ||
      trusted.serverAdmissionVerified !== true ||
      trusted.serverSceneSeedBound !== true ||
      trusted.independentReplayVerified !== false ||
      trusted.safeForSettlement !== false ||
      trusted.rewardSettlementEnabled !== false || trusted.cloudRewards !== false)
      deny('C15_DUNGEON_V2B3_TICKET_UNTRUSTED','V2B.2 server ticket verification required',403);
    return trusted;
  }
  function spawnDigest(sceneSeed) {
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:'dung_taurus',roomIndex:0,seed:sceneSeed});
    if (plan?.dungeonId !== 'dung_taurus' || plan?.room?.id !== 'taurus_entry' ||
      !Array.isArray(plan.entries) || plan.entries.length<1 || plan.entries.length>40)
      throw new TypeError('Dungeon encounter director catalog changed');
    return digest('sf-c15-dungeon-v2b2-spawns',plan.entries.map(e=>({
      id:e.id,roleId:e.roleId,laneNorm:e.laneNorm,
      spawnAtMs:e.spawnAtMs,threatCost:e.threatCost,
    })));
  }
  function report(state) {
    requireIssued(state);
    return freeze({version:VERSION,battleId:state.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',
      sceneSeed:state.sceneSeed,spawnPlanDigest:state.spawnPlanDigest,
      cumulativeEventsVerified:state.eventCount,acceptedPointerMoves:state.moves,
      snapshotsAccepted:state.snapshotsAccepted,
      replayedPosition:{...state.position},traceDigest:state.traceDigest,
      ticketBoundToServerAdmission:true,spawnPlanDigestBound:true,
      clientReportedTouchFormulaConsistent:state.eventCount>0,
      clientReportedPathContinuityChecked:state.eventCount>0,
      actualDeviceProvenanceVerified:false,fullDeviceMovementVerified:false,
      keyboardInputCovered:false,c15InputJournalEquivalent:false,
      combatHitsVerified:false,enemyDeathsVerified:false,roomClearVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  }
  async function open({ticket,uid,sessionId,requestId}={}) {
    const actor={uid,sessionId,requestId};
    const trusted=await verified(ticket,actor);
    if (spawnDigest(trusted.sceneSeed)!==trusted.spawnPlanDigest)
      deny('C15_DUNGEON_V2B3_SPAWN_MISMATCH','Server scene plan does not match ticket',409);
    const seedProof=digest('sf-c15-dungeon-v2b3-origin',{
      battleId:trusted.battleId,sceneSeed:trusted.sceneSeed,
      spawnPlanDigest:trusted.spawnPlanDigest,ticketMac:ticket.mac});
    return makeState({version:VERSION,battleId:trusted.battleId,
      ticketMac:ticket.mac,sceneSeed:trusted.sceneSeed,
      spawnPlanDigest:trusted.spawnPlanDigest,
      eventCount:0,moves:0,snapshotsAccepted:0,
      position:{x:START_X,z:START_Z},lastAtMs:-1,
      prefixDigest:digest('sf-c15-dungeon-v2b3-prefix',[]),
      traceDigest:seedProof});
  }
  function inspect(state) {return report(state);}
  async function ingestSnapshot({state,ticket,trace,uid,sessionId,requestId}={}) {
    requireIssued(state);
    const actor={uid,sessionId,requestId};
    const trusted=await verified(ticket,actor);
    if (trusted.battleId!==state.battleId || ticket.mac!==state.ticketMac ||
      trusted.sceneSeed!==state.sceneSeed ||
      trusted.spawnPlanDigest!==state.spawnPlanDigest)
      deny('C15_DUNGEON_V2B3_SESSION_MISMATCH','Different or stale ticket for replay',409);
    const inspected=await ticketService.inspectDeviceTrace({ticket,trace,...actor});
    if (!record(inspected) || inspected.battleId!==state.battleId ||
      inspected.serverSceneSeedBound!==true ||
      inspected.reportedPointerFormulaConsistent!==true ||
      inspected.safeForSettlement!==false || inspected.cloudRewards!==false ||
      inspected.independentReplayVerified!==false)
      deny('C15_DUNGEON_V2B3_TRACE_UNTRUSTED','V2B.2 trace inspector rejected',403);
    if (!record(trace) || trace.version!==TRACE_VERSION ||
      trace.battleId!==state.battleId || trace.truncated!==false ||
      trace.qaOnly!==true || trace.safeForSettlement!==false ||
      !Array.isArray(trace.events) || trace.events.length<2 ||
      trace.events.length>MAX_EVENTS ||
      trace.events.length<state.eventCount)
      deny('C15_DUNGEON_V2B3_SNAPSHOT_INVALID','Cumulative accepted pointer snapshot required',400);
    const prefix=digest('sf-c15-dungeon-v2b3-prefix',
      trace.events.slice(0,state.eventCount));
    if (prefix!==state.prefixDigest)
      deny('C15_DUNGEON_V2B3_HISTORY_CHANGED','Prior accepted pointer events changed',409);
    if (trace.events.length===state.eventCount)
      return freeze({duplicate:true,state,report:report(state)});
    let position={...state.position};
    let lastAt=state.lastAtMs;
    let active=null, priorX=null,priorY=null, moves=0;
    let traceDigest=state.traceDigest;
    // Each appended gesture begins at a closed previous snapshot. V2B.2 snapshots
    // are emitted only after pointerup, never mid-gesture.
    for(let i=state.eventCount;i<trace.events.length;i++){
      const e=trace.events[i];
      if (!record(e) || typeof e.atMs!=='number' || !Number.isFinite(e.atMs) ||
        e.atMs<lastAt || !record(e.position) ||
        !Number.isFinite(e.position.x) || !Number.isFinite(e.position.z))
        deny('C15_DUNGEON_V2B3_SEQUENCE','Invalid pointer timestamp or pose',409);
      if (e.kind==='down'){
        if (active!==null || !close(e.position.x,position.x) ||
          !close(e.position.z,position.z))
          deny('C15_DUNGEON_V2B3_POSITION_JUMP',
            'Pointer down must begin at the previously replayed ship pose',409);
        active=e.pointerId;priorX=e.clientX;priorY=e.clientY;
      }else if(e.kind==='move'){
        if (active!==e.pointerId || !Number.isFinite(priorX) ||
          !Number.isFinite(priorY))
          deny('C15_DUNGEON_V2B3_SEQUENCE','Pointer move without accepted down',409);
        let next;
        try {
          next=shared.projectDungeonDirectTouchV2B1({position,viewport:e.viewport,
            delta:{deltaX:e.clientX-priorX,deltaY:e.clientY-priorY}});
        } catch(_) {
          deny('C15_DUNGEON_V2B3_PROJECTION','Pointer projection invalid',400);
        }
        if (!close(e.position.x,next.x) || !close(e.position.z,next.z))
          deny('C15_DUNGEON_V2B3_POSITION_JUMP','Client-reported pose diverged from replay',409);
        position={x:next.x,z:next.z};priorX=e.clientX;priorY=e.clientY;moves++;
      }else if(e.kind==='up'){
        if (active!==e.pointerId || !close(e.position.x,position.x) ||
          !close(e.position.z,position.z))
          deny('C15_DUNGEON_V2B3_SEQUENCE','Pointer up pose or identity changed',409);
        active=null;priorX=null;priorY=null;
      }else{
        deny('C15_DUNGEON_V2B3_SEQUENCE','Unknown pointer event',400);
      }
      lastAt=e.atMs;
      traceDigest=digest('sf-c15-dungeon-v2b3-step',{
        traceDigest,index:i,event:e});
    }
    if (active!==null || moves<1)
      deny('C15_DUNGEON_V2B3_INCOMPLETE','QA gesture not closed',409);
    const next=makeState({...state,eventCount:trace.events.length,
      moves:state.moves+moves,snapshotsAccepted:state.snapshotsAccepted+1,
      position,lastAtMs:lastAt,traceDigest,
      prefixDigest:digest('sf-c15-dungeon-v2b3-prefix',trace.events)});
    return freeze({duplicate:false,state:next,report:report(next)});
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,rewardSettlementEnabled:false,
    open,ingestSnapshot,inspect,finalize:locked,claim:locked});
}
module.exports=freeze({VERSION,parseC15DungeonMovementParityV2B3Config,
  createC15DungeonMovementParityV2B3});
