'use strict';
/**
 * Dungeon/C15 foundation V1. Safe scope deliberately limited to the local
 * Firestore Emulator. The existing C15 replay kernel handles Campaign Alpha 1
 * only; this module NEVER declares a Dungeon victory or grants rewards.
 *
 * Shared C15 primitives: validateChunk (input schema) and journalRoot (trace
 * binding). Neither is a substitute for an independent Dungeon simulation.
 */
const {createHash, randomUUID} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {GameError} = require('./economy.cjs');
const {assertAccountActive} = require('./accountDeletion.cjs');
const {validateChunk} = require('./combatInputJournalV8.cjs');
const {journalRoot} = require('./c15TrustedOutcomeV1.cjs');

const VERSION = 'c15-dungeon-foundation-v1';
const CONTENT_VERSION = 'dungeon-content-catalog-v3.9.8';
const ALLOWED_DUNGEONS = Object.freeze(['dung_taurus', 'dung_nereus', 'dung_abaddon']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const DEMO_ID = /^demo-[a-z0-9][a-z0-9-]{2,64}$/;
const LOCAL_FIRESTORE = /^(127\.0\.0\.1|localhost):([1-9][0-9]{0,4})$/;
const MAX_ACTIVE_MS = 20 * 60 * 1000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const int = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : record(value) ?
  Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const digest = (tag, value) => createHash('sha256')
  .update(JSON.stringify([tag, canonical(value)])).digest('hex');
const deny = (code, message, status = 423) => { throw new GameError(code, message, status); };
const validUid = uid => typeof uid === 'string' && uid.length >= 1 && uid.length <= 128 &&
  !/[\u0000-\u001f\u007f/]/.test(uid);

function parseC15DungeonFoundationV1Config(env = {}) {
  // process.env is a special Node.js object, not necessarily a plain record.
  if (!env || typeof env !== 'object' || Array.isArray(env))
    throw new TypeError('Dungeon V1 environment required');
  if (env.GAME_C15_DUNGEON_V1_ENABLED !== 'true') return null;
  if (env.GAME_C15_DUNGEON_V1_EMULATOR_QA_APPROVED !== 'true')
    throw new TypeError('Dungeon V1 emulator QA approval required');
  const projectId = env.GOOGLE_CLOUD_PROJECT;
  if (!DEMO_ID.test(projectId || '') || env.GCLOUD_PROJECT !== projectId ||
      (env.FIREBASE_PROJECT_ID && env.FIREBASE_PROJECT_ID !== projectId))
    throw new TypeError('Dungeon V1 requires matching demo-only Firebase project IDs');
  const host = env.FIRESTORE_EMULATOR_HOST;
  const match = LOCAL_FIRESTORE.exec(host || '');
  if (!match || Number(match[2]) > 65535)
    throw new TypeError('Dungeon V1 requires a local Firestore Emulator');
  const text = env.GAME_C15_DUNGEON_V1_ALLOW_UIDS;
  if (typeof text !== 'string' || !text.length || text.length > 2048)
    throw new TypeError('Dungeon V1 closed UID allowlist required');
  const uids = text.split(',').map(uid => uid.trim());
  if (uids.length < 1 || uids.length > 10 || uids.some(uid => !validUid(uid)) ||
      new Set(uids).size !== uids.length)
    throw new TypeError('Dungeon V1 UID allowlist invalid');
  return freeze({projectId, emulatorHost: host, allowUids: uids});
}

function createDungeonContractV1(dungeonId, {listings, content, hazards, objectives} = {}) {
  if (!ALLOWED_DUNGEONS.includes(dungeonId))
    deny('C15_DUNGEON_UNKNOWN', 'Dungeon ID has no reviewed server policy', 400);
  const listing = listings?.find(row => row.id === dungeonId);
  const definition = content?.[dungeonId];
  if (!record(listing) || !record(definition) || definition.id !== dungeonId ||
      definition.contentVersion !== CONTENT_VERSION || definition.schemaVersion !== 1 ||
      !int(listing.energyCost, 1, 100) || !Array.isArray(listing.openDays) ||
      listing.openDays.length < 1 || listing.openDays.length > 7 ||
      listing.openDays.some(day => !int(day, 0, 6)) ||
      !Array.isArray(definition.rooms) || definition.rooms.length < 2 ||
      definition.rooms.length > 20 || !definition.runStructure)
    deny('C15_DUNGEON_CATALOG_INVALID', 'Dungeon catalog lacks a reviewed policy');
  const ids = new Set();
  let bossCount = 0;
  const rooms = definition.rooms.map(room => {
    if (!record(room) || typeof room.id !== 'string' || ids.has(room.id) ||
        !['clear', 'hazard_clear', 'destroy_nodes', 'elite_formation', 'boss'].includes(room.templateId))
      deny('C15_DUNGEON_CATALOG_INVALID', 'Dungeon room invalid');
    ids.add(room.id);
    if (room.templateId === 'boss') bossCount++;
    const hazard = room.hazardId ? hazards?.[room.hazardId] : null;
    if (room.hazardId && (!record(hazard) || hazard.id !== room.hazardId ||
        !int(hazard.damage, 0, 100000) || typeof hazard.type !== 'string'))
      deny('C15_DUNGEON_CATALOG_INVALID', 'Unknown Dungeon hazard');
    const objective = room.objectiveProfileId ? objectives?.[room.objectiveProfileId] : null;
    if (room.objectiveProfileId && (!record(objective) || objective.id !== room.objectiveProfileId ||
        !Array.isArray(objective.nodes) || !objective.nodes.length))
      deny('C15_DUNGEON_CATALOG_INVALID', 'Unknown Dungeon objective');
    const nodes = objective ? objective.nodes.map((node, index) => {
      if (!node || typeof node.id !== 'string' || node.sequenceIndex !== index ||
          !int(node.hp, 1, 1000000))
        deny('C15_DUNGEON_CATALOG_INVALID', 'Objective sequence invalid');
      return {id: node.id, sequenceIndex: index, hp: node.hp};
    }) : [];
    if (room.templateId === 'boss' && (!room.boss || typeof room.boss.id !== 'string' ||
        room.boss.dungeonId !== dungeonId || !int(room.boss.hp, 1, 100000000)))
      deny('C15_DUNGEON_CATALOG_INVALID', 'Dungeon Boss invalid');
    return {
      id: room.id, kind: room.templateId,
      hazard: hazard ? {id: hazard.id, type: hazard.type, damage: hazard.damage,
        destructible: hazard.destructible === true} : null,
      objective: objective ? {id: objective.id, type: objective.type, nodes} : null,
      boss: room.boss ? {id: room.boss.id, hp: room.boss.hp} : null,
    };
  });
  if (bossCount !== 1 || definition.runStructure.entryRoomId !== rooms[0].id ||
      definition.runStructure.bossRoomId !== rooms[rooms.length - 1].id ||
      rooms[rooms.length - 1].kind !== 'boss')
    deny('C15_DUNGEON_CATALOG_INVALID', 'Dungeon order or Boss gate invalid');
  const body = {version: VERSION, dungeonId, catalogVersion: CONTENT_VERSION,
    energyCost: listing.energyCost, openDaysUtc: [...listing.openDays].sort((a, b) => a - b),
    rooms, replayVerified: false, safeForSettlement: false, cloudRewards: false};
  return freeze({...body, contractDigest: digest('sf-c15-dungeon-v1-policy', body)});
}

/** Movement trace schema only. Client trace is NOT trusted victory evidence. */
function inspectDungeonJournalV1({battleId, chunks} = {}) {
  if (!UUID.test(battleId || '') || !Array.isArray(chunks) || chunks.length < 1 || chunks.length > 256)
    deny('C15_DUNGEON_JOURNAL_INVALID', 'Dungeon journal invalid', 400);
  let next = 0;
  const leaves = chunks.map(chunk => {
    const validated = validateChunk(chunk); // Existing C15 input contract.
    if (validated.battleId !== battleId || validated.startTick !== next || validated.endTick > 4500)
      deny('C15_DUNGEON_JOURNAL_SEQUENCE', 'Missing or out-of-order Dungeon input', 409);
    next = validated.endTick;
    return {startTick: validated.startTick, endTick: validated.endTick, chunkDigest: validated.chunkDigest};
  });
  return freeze({version: VERSION, battleId, ticks: next,
    journalRootDigest: journalRoot(leaves), inputSyntaxValid: true,
    independentReplayVerified: false, safeForSettlement: false});
}

/** Event identifiers are checked against server catalog, never made authoritative. */
function inspectUntrustedDungeonEventsV1(contract, events) {
  if (!record(contract) || !Array.isArray(contract.rooms) || !Array.isArray(events) ||
      events.length > 5000)
    deny('C15_DUNGEON_EVENTS_INVALID', 'Untrusted Dungeon events invalid', 400);
  let tick = -1, priorRoom = -1;
  for (const event of events) {
    if (!exact(event, ['kind', 'roomId', 'refId', 'tick']) ||
        !int(event.tick, 0, 4500) || event.tick < tick)
      deny('C15_DUNGEON_EVENTS_INVALID', 'Invalid Dungeon event', 400);
    const roomIndex = contract.rooms.findIndex(room => room.id === event.roomId);
    if (roomIndex < priorRoom || roomIndex < 0)
      deny('C15_DUNGEON_EVENTS_INVALID', 'Dungeon room order invalid', 400);
    const room = contract.rooms[roomIndex];
    let match = false;
    if (event.kind === 'hazard_contact') match = room.hazard?.id === event.refId;
    else if (event.kind === 'objective_destroyed') match = Boolean(room.objective?.nodes.some(n => n.id === event.refId));
    else if (event.kind === 'boss_defeated') match = room.kind === 'boss' && room.boss?.id === event.refId;
    // Crates are runtime objects not yet represented by an immutable server
    // spawn ledger. Never accept a client claim to collected crate rewards.
    else if (event.kind === 'crate_collected')
      deny('C15_DUNGEON_CRATE_PROVENANCE_REQUIRED', 'Crate source must be verified by server replay');
    if (!match) deny('C15_DUNGEON_EVENTS_INVALID', 'Event not found in server Dungeon contract', 400);
    tick = event.tick;
    priorRoom = roomIndex;
  }
  return freeze({version: VERSION, eventsChecked: events.length,
    catalogIdentifiersValid: true, independentReplayVerified: false,
    safeForSettlement: false, rewardEntitlement: false});
}

function lockedSettlement() {
  deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
    'Independent authoritative Dungeon replay and crate provenance are not implemented');
}
function disabledService() {
  const off = () => deny('C15_DUNGEON_V1_DISABLED', 'Dungeon V1 is disabled');
  return freeze({enabled: false, emulatorOnly: true, productionEnabled: false,
    rewardSettlementEnabled: false, preview: off, admitEmulator: off, claim: lockedSettlement});
}

async function createC15DungeonFoundationV1({db, env = {}, now = Date.now,
  newId = randomUUID, listingModule, contentModule} = {}) {
  const config = parseC15DungeonFoundationV1Config(env);
  if (!config) return disabledService();
  if (!db || typeof db.runTransaction !== 'function' || typeof now !== 'function' ||
      typeof newId !== 'function') throw new TypeError('Dungeon V1 Firestore dependencies required');
  if (db.app?.options?.projectId && db.app.options.projectId !== config.projectId)
    throw new TypeError('Dungeon V1 Firestore app project mismatch');
  const [listing, content] = await Promise.all([
    listingModule || import(pathToFileURL(path.resolve(__dirname, '../../client/src/constants.js')).href),
    contentModule || import(pathToFileURL(path.resolve(__dirname, '../../client/src/game/dungeon/DungeonContentCatalogV393.js')).href),
  ]);
  const sources = {listings: listing.DUNGEON_CONFIG,
    content: content.DUNGEON_CONTENT_CATALOG_V393,
    hazards: content.DUNGEON_HAZARD_PROFILES_V393,
    objectives: content.DUNGEON_OBJECTIVE_PROFILES_V393};
  const contracts = Object.fromEntries(ALLOWED_DUNGEONS.map(id =>
    [id, createDungeonContractV1(id, sources)]));
  const allow = new Set(config.allowUids);
  const userRef = uid => db.collection('users').doc(uid);
  const jobRef = uid => db.collection('accountDeletionJobs').doc(uid);
  const admissionsRef = (uid, requestId) => userRef(uid).collection('c15DungeonV1Admissions').doc(requestId);
  const operationRef = (uid, requestId) => userRef(uid).collection('operations').doc(requestId);
  const activeRef = uid => userRef(uid).collection('c15DungeonV1Sessions').doc('current');
  const clock = () => {
    const at = now();
    if (!int(at, 1, Number.MAX_SAFE_INTEGER - MAX_ACTIVE_MS)) throw new TypeError('Dungeon clock invalid');
    return at;
  };
  function actor(uid, sid) {
    if (!validUid(uid) || !UUID.test(sid || '')) deny('C15_DUNGEON_ACTOR_INVALID', 'Valid session required', 401);
    if (!allow.has(uid)) deny('C15_DUNGEON_NOT_ALLOWED', 'UID not allowlisted', 403);
  }
  async function preview(uid, sid, dungeonId) {
    actor(uid, sid);
    const contract = contracts[dungeonId];
    if (!contract) deny('C15_DUNGEON_UNKNOWN', 'Dungeon ID not approved', 400);
    const [user, job] = await Promise.all([userRef(uid).get(), jobRef(uid).get()]);
    if (!user.exists) deny('PROFILE_NOT_FOUND', 'Profile not initialized', 404);
    const data = user.data();
    assertAccountActive(data);
    if (job.exists) deny('ACCOUNT_DELETION_PENDING', 'Account deletion pending');
    if (data.sessionId !== sid) deny('SESSION_EXPIRED', 'Game session expired', 401);
    return freeze({version: VERSION, dungeon: contract, emulatorOnly: true,
      energyDebitAvailableOnlyForEmulatorQA: true, replayVerified: false,
      rewardSettlementEnabled: false});
  }
  async function admitEmulator(uid, sid, body) {
    actor(uid, sid);
    if (!exact(body, ['dungeonId', 'requestId']) || !REQUEST.test(body.requestId || ''))
      deny('C15_DUNGEON_INPUT_INVALID', 'Only dungeonId and requestId accepted', 400);
    const contract = contracts[body.dungeonId];
    if (!contract) deny('C15_DUNGEON_UNKNOWN', 'Dungeon not approved', 400);
    const at = clock();
    const requestDigest = digest('sf-c15-dungeon-v1-admission',
      {uid, sid, dungeonId: body.dungeonId, requestId: body.requestId, contractDigest: contract.contractDigest});
    const battleId = newId();
    if (!UUID.test(battleId || '')) throw new TypeError('Dungeon V1 server battle ID invalid');
    return db.runTransaction(async tx => {
      const uref = userRef(uid), dref = jobRef(uid), rref = admissionsRef(uid, body.requestId),
        oref = operationRef(uid, body.requestId), aref = activeRef(uid);
      const [user, job, admission, operation, active] = await Promise.all([
        tx.get(uref), tx.get(dref), tx.get(rref), tx.get(oref), tx.get(aref)]);
      if (!user.exists) deny('PROFILE_NOT_FOUND', 'Profile not initialized', 404);
      const data = user.data();
      assertAccountActive(data);
      if (job.exists) deny('ACCOUNT_DELETION_PENDING', 'Account deletion pending');
      if (data.sessionId !== sid) deny('SESSION_EXPIRED', 'Game session expired', 401);
      if (admission.exists) {
        const saved = admission.data();
        const op = operation.exists ? operation.data() : null;
        if (saved.requestDigest !== requestDigest || saved.uid !== uid || saved.sessionId !== sid ||
            saved.dungeonId !== body.dungeonId || saved.contractDigest !== contract.contractDigest ||
            saved.qaOnly !== true || saved.rewardSettlementEnabled !== false ||
            !op || op.command !== 'c15.dungeon.emulator.entry' || op.payloadHash !== requestDigest ||
            op.battleId !== saved.battleId)
          deny('REQUEST_REUSED', 'Dungeon request ID reused with different context', 409);
        return freeze({version: VERSION, duplicate: true, admission: saved});
      }
      if (operation.exists) deny('REQUEST_REUSED', 'Request ID already used', 409);
      if (active.exists && active.data()?.status === 'admitted-emulator' &&
          active.data()?.expiresAtMs > at)
        deny('C15_DUNGEON_ACTIVE', 'An emulator Dungeon admission is already active', 409);
      if (!int(data.wallet?.energy, 0, 100000000))
        deny('C15_DUNGEON_PROFILE_INVALID', 'Energy wallet invalid', 409);
      if (!contract.openDaysUtc.includes(new Date(at).getUTCDay()))
        deny('DUNGEON_CLOSED', 'Dungeon not open at server UTC date', 409);
      if (data.wallet.energy < contract.energyCost)
        deny('INSUFFICIENT_FUNDS', 'Not enough energy', 409);
      const admissionRecord = freeze({version: VERSION, uid, sessionId: sid, battleId,
        dungeonId: contract.dungeonId, requestId: body.requestId, requestDigest,
        contractDigest: contract.contractDigest, energyCharged: contract.energyCost,
        admittedAtMs: at, expiresAtMs: at + MAX_ACTIVE_MS, status: 'admitted-emulator',
        qaOnly: true, source: 'firestore-emulator', independentReplayVerified: false,
        rewardSettlementEnabled: false, cloudRewards: false});
      const updated = {...data, wallet: {...data.wallet, energy: data.wallet.energy - contract.energyCost}};
      tx.set(uref, updated);
      tx.create(rref, admissionRecord);
      tx.create(oref, {command: 'c15.dungeon.emulator.entry', payloadHash: requestDigest,
        battleId, createdAt: at, qaOnly: true});
      tx.set(aref, {version: VERSION, uid, sessionId: sid, battleId, requestId: body.requestId,
        status: 'admitted-emulator', expiresAtMs: at + MAX_ACTIVE_MS, qaOnly: true,
        rewardSettlementEnabled: false});
      return freeze({version: VERSION, duplicate: false, admission: admissionRecord});
    });
  }
  return freeze({enabled: true, emulatorOnly: true, productionEnabled: false,
    rewardSettlementEnabled: false, preview, admitEmulator, claim: lockedSettlement});
}

module.exports = freeze({VERSION, CONTENT_VERSION, ALLOWED_DUNGEONS,
  parseC15DungeonFoundationV1Config, createDungeonContractV1,
  inspectDungeonJournalV1, inspectUntrustedDungeonEventsV1,
  createC15DungeonFoundationV1});
