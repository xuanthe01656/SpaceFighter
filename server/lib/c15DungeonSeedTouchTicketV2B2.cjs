'use strict';
/**
 * Dungeon V2B.2: READ-ONLY Firebase Emulator QA admission-backed scene ticket.
 * No HTTP route, Firestore writes, production activation, combat attestation,
 * or reward settlement. The ticket binds a server-read profile and existing
 * V1 energy-charged admission to the exact DungeonScene seed/spawn plan.
 */
const {createHmac, createHash, timingSafeEqual, randomBytes} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {GameError} = require('./economy.cjs');
const {assertAccountActive} = require('./accountDeletion.cjs');
const {VERSION: ADMISSION_VERSION, createDungeonContractV1} = require('./c15DungeonFoundationV1.cjs');
const {parseC15DungeonSeedTouchV2B1Config} = require('./c15DungeonSeedTouchProbeV2B1.cjs');

const VERSION = 'c15-dungeon-seed-touch-ticket-v2b2';
const TRACE_VERSION = 'dungeon-device-touch-v2b2';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const HEX = /^[a-f0-9]{64}$/;
const MAX_AGE_MS = 120000;
const MAX_TRACE_EVENTS = 256;
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const exact = (v, keys) => record(v) && Object.keys(v).length === keys.length &&
  keys.every(k => Object.hasOwn(v, k));
const safeInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : record(value) ?
  Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
const hash = (tag, value) => createHash('sha256')
  .update(JSON.stringify([tag, canonical(value)])).digest('hex');
const deny = (code, text, http=423) => { throw new GameError(code,text,http); };
const TICKET_KEYS = ['version','battleId','sessionId','requestId','dungeonId','roomId',
  'profileId','sceneSeed','spawnPlanDigest','contractDigest','issuedAtMs',
  'expiresAtMs','qaOnly','emulatorOnly','safeForSettlement',
  'rewardSettlementEnabled','cloudRewards','mac'];
const ADMISSION_KEYS = ['version','uid','sessionId','battleId','dungeonId','requestId',
  'requestDigest','contractDigest','energyCharged','admittedAtMs','expiresAtMs',
  'status','qaOnly','source','independentReplayVerified','rewardSettlementEnabled','cloudRewards'];

function parseC15DungeonSeedTouchTicketV2B2Config(env={}) {
  if (!env || typeof env !== 'object' || Array.isArray(env))
    throw new TypeError('V2B.2 QA environment required');
  if (env.GAME_C15_DUNGEON_V2B2_ENABLED !== 'true') return null;
  if (env.GAME_C15_DUNGEON_V2B2_QA_APPROVED !== 'true')
    throw new TypeError('V2B.2 requires explicit QA approval');
  const previous = parseC15DungeonSeedTouchV2B1Config(env);
  if (!previous || previous.emulatorOnly !== true)
    throw new TypeError('V2B.2 requires approved V1/V2A/V2B.1 demo Emulator');
  return freeze({version:VERSION, projectId:previous.projectId,
    allowUids:[...previous.allowedUids], emulatorOnly:true});
}
function disabled() {
  const off=()=>deny('C15_DUNGEON_V2B2_DISABLED','V2B.2 QA ticket disabled');
  const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED','Independent combat replay unavailable');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    rewardSettlementEnabled:false,issueTicket:off,verifyTicket:off,
    inspectDeviceTrace:off,finalize:locked,claim:locked});
}

async function createC15DungeonSeedTouchTicketV2B2({env={},db,now=Date.now,
  signingKey, listingModule, contentModule, encounterModule, sceneSeedModule}={}) {
  const config=parseC15DungeonSeedTouchTicketV2B2Config(env);
  if (!config) return disabled();
  if (!db || typeof db.collection !== 'function' || typeof now !== 'function' ||
      (db.app?.options?.projectId && db.app.options.projectId !== config.projectId))
    throw new TypeError('V2B.2 requires matching server-side demo Emulator DB');
  const secret=signingKey === undefined ? randomBytes(32) : Buffer.from(signingKey);
  if (secret.length < 32 || secret.length > 128) throw new TypeError('V2B.2 ephemeral HMAC key required');
  const [listing,content,encounter,shared]=await Promise.all([
    listingModule || import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href),
    contentModule || import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonContentCatalogV393.js')).href),
    encounterModule || import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonEncounterDirectorV38.js')).href),
    sceneSeedModule || import(pathToFileURL(path.resolve(__dirname,
      '../../client/src/game/dungeon/DungeonSeedTouchContractV2B1.js')).href),
  ]);
  const contract=createDungeonContractV1('dung_taurus',{
    listings:listing.DUNGEON_CONFIG,content:content.DUNGEON_CONTENT_CATALOG_V393,
    hazards:content.DUNGEON_HAZARD_PROFILES_V393,
    objectives:content.DUNGEON_OBJECTIVE_PROFILES_V393,
  });
  if (contract.rooms[0]?.id !== 'taurus_entry' ||
      typeof encounter.buildDungeonRoomSpawnPlanV38 !== 'function' ||
      typeof shared.dungeonSceneStableSeedV2B1 !== 'function')
    throw new TypeError('V2B.2 catalog or shared scene seed contract changed');
  const allow=new Set(config.allowUids);
  const time=()=>{
    const at=now();
    if (!safeInt(at,1,Number.MAX_SAFE_INTEGER-MAX_AGE_MS))
      throw new TypeError('V2B.2 trusted clock invalid');
    return at;
  };
  const mac = body => createHmac('sha256',secret)
    .update(JSON.stringify([VERSION,canonical(body)])).digest('hex');
  const signed = ticket => {
    const {mac:signature,...body}=ticket;
    const expected=mac(body);
    return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex'));
  };
  async function readTrusted(uid, sessionId, requestId, expectedBattleId) {
    if (!allow.has(uid) || !UUID.test(sessionId || '') ||
        !REQUEST.test(requestId || '') ||
        (expectedBattleId !== undefined && !UUID.test(expectedBattleId || '')))
      deny('C15_DUNGEON_V2B2_ACTOR_INVALID','Valid allowlisted actor required',401);
    const uref=db.collection('users').doc(uid);
    const [profileSnap,jobSnap,admissionSnap,activeSnap]=await Promise.all([
      uref.get(),db.collection('accountDeletionJobs').doc(uid).get(),
      uref.collection('c15DungeonV1Admissions').doc(requestId).get(),
      uref.collection('c15DungeonV1Sessions').doc('current').get(),
    ]);
    if (!profileSnap.exists || jobSnap.exists || !admissionSnap.exists || !activeSnap.exists)
      deny('C15_DUNGEON_V2B2_NO_ADMISSION','Live server-owned admission required',403);
    const profile=profileSnap.data();
    assertAccountActive(profile);
    const admission=admissionSnap.data();
    const active=activeSnap.data();
    const at=time();
    if (profile.sessionId !== sessionId || !exact(admission,ADMISSION_KEYS) ||
        admission.version !== ADMISSION_VERSION || admission.uid !== uid ||
        admission.sessionId !== sessionId || admission.requestId !== requestId ||
        !UUID.test(admission.battleId || '') ||
        (expectedBattleId !== undefined && admission.battleId !== expectedBattleId) ||
        admission.dungeonId !== contract.dungeonId ||
        admission.contractDigest !== contract.contractDigest ||
        admission.energyCharged !== contract.energyCost ||
        !HEX.test(admission.requestDigest || '') ||
        admission.status !== 'admitted-emulator' || admission.qaOnly !== true ||
        admission.source !== 'firestore-emulator' ||
        admission.independentReplayVerified !== false ||
        admission.rewardSettlementEnabled !== false || admission.cloudRewards !== false ||
        !safeInt(admission.admittedAtMs,1,at) ||
        !safeInt(admission.expiresAtMs,at+1,at+20*60*1000) ||
        !record(active) || active.uid !== uid || active.sessionId !== sessionId ||
        active.battleId !== admission.battleId || active.requestId !== requestId ||
        active.status !== 'admitted-emulator' || active.qaOnly !== true ||
        active.rewardSettlementEnabled !== false || active.expiresAtMs !== admission.expiresAtMs)
      deny('C15_DUNGEON_V2B2_ADMISSION_INVALID','Stored QA admission context rejected',409);
    const profileId=profile.campaignData?.profileId || 'guest';
    if (typeof profileId !== 'string' || !/^[\w.-]{1,128}$/.test(profileId))
      deny('C15_DUNGEON_V2B2_PROFILE_INVALID','Server profile ID invalid',409);
    const sceneSeed=shared.dungeonSceneStableSeedV2B1(
      contract.dungeonId,profileId,admission.battleId);
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:contract.dungeonId,roomIndex:0,seed:sceneSeed});
    if (plan?.room?.id !== 'taurus_entry' || !Array.isArray(plan.entries) ||
        plan.entries.length < 1 || plan.entries.length > 40)
      throw new TypeError('V2B.2 server seed spawn plan requires review');
    const spawnPlanDigest=hash('sf-c15-dungeon-v2b2-spawns',plan.entries.map(e=>({
      id:e.id,roleId:e.roleId,laneNorm:e.laneNorm,
      spawnAtMs:e.spawnAtMs,threatCost:e.threatCost,
    })));
    return {admission,profileId,sceneSeed,spawnPlanDigest,at};
  }
  async function issueTicket({uid,sessionId,requestId}={}) {
    const {admission,profileId,sceneSeed,spawnPlanDigest,at}=
      await readTrusted(uid,sessionId,requestId);
    const body={version:VERSION,battleId:admission.battleId,
      sessionId,requestId,dungeonId:admission.dungeonId,roomId:'taurus_entry',
      profileId,sceneSeed,spawnPlanDigest,contractDigest:admission.contractDigest,
      issuedAtMs:at,expiresAtMs:Math.min(admission.expiresAtMs,at+MAX_AGE_MS),
      qaOnly:true,emulatorOnly:true,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false};
    return freeze({...body,mac:mac(body)});
  }
  async function verifyTicket(ticket,{uid,sessionId,requestId}={}) {
    if (!exact(ticket,TICKET_KEYS) || ticket.version!==VERSION ||
        !UUID.test(ticket.battleId || '') || !UUID.test(ticket.sessionId || '') ||
        !REQUEST.test(ticket.requestId || '') ||
        !safeInt(ticket.sceneSeed,1,0xffffffff) ||
        !HEX.test(ticket.spawnPlanDigest || '') || !HEX.test(ticket.contractDigest || '') ||
        !HEX.test(ticket.mac || '') || !safeInt(ticket.issuedAtMs,1,Number.MAX_SAFE_INTEGER) ||
        !safeInt(ticket.expiresAtMs,ticket.issuedAtMs+1,Number.MAX_SAFE_INTEGER) ||
        ticket.qaOnly!==true || ticket.emulatorOnly!==true ||
        ticket.safeForSettlement!==false || ticket.rewardSettlementEnabled!==false ||
        ticket.cloudRewards!==false || ticket.dungeonId!=='dung_taurus' ||
        ticket.roomId!=='taurus_entry' || ticket.sessionId!==sessionId ||
        ticket.requestId!==requestId || typeof ticket.profileId!=='string' ||
        !signed(ticket))
      deny('C15_DUNGEON_V2B2_TICKET_INVALID','Invalid or modified QA ticket',403);
    const checked=await readTrusted(uid,sessionId,requestId,ticket.battleId);
    if (ticket.issuedAtMs > checked.at || ticket.expiresAtMs<=checked.at ||
        ticket.expiresAtMs>Math.min(checked.admission.expiresAtMs,ticket.issuedAtMs+MAX_AGE_MS) ||
        ticket.profileId!==checked.profileId || ticket.sceneSeed!==checked.sceneSeed ||
        ticket.spawnPlanDigest!==checked.spawnPlanDigest ||
        ticket.contractDigest!==checked.admission.contractDigest)
      deny('C15_DUNGEON_V2B2_TICKET_STALE','QA ticket no longer matches server state',403);
    return freeze({version:VERSION,battleId:ticket.battleId,
      sceneSeed:checked.sceneSeed,spawnPlanDigest:checked.spawnPlanDigest,
      serverAdmissionVerified:true,serverSceneSeedBound:true,
      combatParityVerified:false,independentReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  }
  async function inspectDeviceTrace({ticket,trace,uid,sessionId,requestId}={}) {
    const trusted=await verifyTicket(ticket,{uid,sessionId,requestId});
    if (!exact(trace,['version','battleId','events','truncated','qaOnly','safeForSettlement']) ||
        trace.version!==TRACE_VERSION || trace.battleId!==trusted.battleId ||
        trace.truncated!==false || trace.qaOnly!==true || trace.safeForSettlement!==false ||
        !Array.isArray(trace.events) || trace.events.length<2 ||
        trace.events.length>MAX_TRACE_EVENTS)
      deny('C15_DUNGEON_V2B2_TRACE_INVALID','QA pointer trace schema invalid',400);
    let priorAt=-1, activePointer=null, position=null, priorClientX=null, priorClientY=null;
    let moves=0;
    for (const e of trace.events) {
      if (!record(e) || !safeInt(e.pointerId,0,2147483647) ||
          !finite(e.atMs) || e.atMs<0 || e.atMs>Number.MAX_SAFE_INTEGER || e.atMs<priorAt ||
          !record(e.position) || !exact(e.position,['x','z']) ||
          !finite(e.position.x) || !finite(e.position.z))
        deny('C15_DUNGEON_V2B2_TRACE_INVALID','Pointer event values invalid',400);
      priorAt=e.atMs;
      if (e.kind==='down') {
        if (!exact(e,['kind','pointerId','atMs','clientX','clientY','position']) ||
            activePointer!==null || !finite(e.clientX) || !finite(e.clientY))
          deny('C15_DUNGEON_V2B2_TRACE_SEQUENCE','Pointer down sequence invalid',409);
        activePointer=e.pointerId;priorClientX=e.clientX;priorClientY=e.clientY;
        position=e.position;
      } else if (e.kind==='move') {
        if (!exact(e,['kind','pointerId','atMs','clientX','clientY','position','viewport','delta']) ||
            activePointer!==e.pointerId || !finite(e.clientX) || !finite(e.clientY) ||
            !exact(e.delta,['deltaX','deltaY']) ||
            !finite(e.delta.deltaX) || !finite(e.delta.deltaY) ||
            Math.abs(e.delta.deltaX)>20000 || Math.abs(e.delta.deltaY)>20000 ||
            Math.abs(e.delta.deltaX-(e.clientX-priorClientX))>1e-6 ||
            Math.abs(e.delta.deltaY-(e.clientY-priorClientY))>1e-6)
          deny('C15_DUNGEON_V2B2_TRACE_SEQUENCE','Pointer move sequence invalid',409);
        let expected;
        try {expected=shared.projectDungeonDirectTouchV2B1({position,viewport:e.viewport,delta:e.delta});}
        catch (_) { deny('C15_DUNGEON_V2B2_TRACE_INVALID','Pointer viewport or projection invalid',400); }
        if (Math.abs(expected.x-e.position.x)>1e-6 || Math.abs(expected.z-e.position.z)>1e-6)
          deny('C15_DUNGEON_V2B2_TRACE_PARITY','Pointer projection does not match reported ship position',409);
        position=e.position;priorClientX=e.clientX;priorClientY=e.clientY;moves++;
      } else if (e.kind==='up') {
        if (!exact(e,['kind','pointerId','atMs','position']) ||
            activePointer!==e.pointerId ||
            Math.abs(e.position.x-position.x)>1e-6 ||
            Math.abs(e.position.z-position.z)>1e-6)
          deny('C15_DUNGEON_V2B2_TRACE_SEQUENCE','Pointer up invalid',409);
        activePointer=null;
      } else {
        deny('C15_DUNGEON_V2B2_TRACE_INVALID','Unknown pointer event',400);
      }
    }
    if (moves<1 || activePointer!==null)
      deny('C15_DUNGEON_V2B2_TRACE_INCOMPLETE','Closed pointer trace with movement required',409);
    return freeze({version:VERSION,battleId:trusted.battleId,eventsChecked:trace.events.length,
      acceptedPointerMoves:moves,serverSceneSeedBound:true,
      reportedPointerFormulaConsistent:true,deviceAuthenticityVerified:false,
      c15JournalEquivalenceVerified:false,independentReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  }
  const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED','Dungeon trusted outcome unavailable');
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    rewardSettlementEnabled:false,issueTicket,verifyTicket,inspectDeviceTrace,
    finalize:locked,claim:locked});
}
module.exports=freeze({VERSION,TRACE_VERSION,MAX_TRACE_EVENTS,
  parseC15DungeonSeedTouchTicketV2B2Config,
  createC15DungeonSeedTouchTicketV2B2});
