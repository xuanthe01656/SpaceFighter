/**
 * SpaceFighter V8B-2C2B - offline, deterministic movement/main-fire replay.
 *
 * ONLY a server-owned preview fed by a trusted V8B-2C1 snapshot and V8B-1
 * journal. The hashes below detect accidental divergence, NOT authentication.
 * Client-supplied snapshots/checkpoints MUST NEVER enter this module as trusted
 * input. This does not simulate collisions, enemies, victory, damage, energy,
 * rewards, or settlement. P0 BATTLE_VERIFICATION_UNAVAILABLE stays enabled.
 * No HTTP, database, Firebase, GameService or Cloud Battle admission wiring.
 *
 * QA-only tick ordering: apply quantized movement, then spawn due projectiles.
 * This order is NOT yet proven identical to all live Client render events.
 */
import {createHash} from './C15KernelHash.js';
import {openInputJournal,validateChunk,ingestInputChunk,MAX_BATTLE_TICKS} from './CombatInputJournalV8.js';
import {
  FOUNDATION_VERSION, TIMER_VERSION, previewFromTrustedSnapshot, advancePreviewMovement,
  previewMainProjectile, openFireClock, advanceFireClock,
} from './CombatMovementWeaponV8.js';

const REPLAY_VERSION = 'pve-foundation-replay-preview-v1';
const OPEN_KEYS = ['snapshot', 'policy', 'journal'];
const RUN_KEYS = ['preview', 'checkpoint', 'journal'];
const ADVANCE_KEYS = ['run', 'chunk', 'receivedAtMs'];
const CHECKPOINT_KEYS = [
  'version','previewOnly','safeForCloudBattle','uid','sessionId','battleId',
  'rulesVersion','loadoutHash','snapshotHash','tick','position','fireClock',
  'totalShots','journalDigest','eventDigest','checkpointDigest',
];
const HEX64 = /^[a-f0-9]{64}$/;

class FoundationReplayError extends Error {
  constructor(code, message) { super(message); this.name = 'FoundationReplayError'; this.code = code; }
}
const deny = (code, message) => { throw new FoundationReplayError(code, message); };
const record = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null)
  && Object.values(Object.getOwnPropertyDescriptors(obj)).every(d => Object.hasOwn(d, 'value'));
const exact = (obj, keys) => record(obj) && Object.keys(obj).length === keys.length
  && keys.every(key => Object.hasOwn(obj, key));
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const freeze = obj => {
  if (obj && typeof obj === 'object') {
    for (const child of Object.values(obj)) freeze(child);
    Object.freeze(obj);
  }
  return obj;
};
function checkpointDigest(value) {
  const { checkpointDigest: ignore, ...fields } = value;
  return digest(['sf-v8b2c2b-checkpoint', fields]);
}
function seal(data) { return freeze({...data, checkpointDigest:checkpointDigest(data)}); }

/** Fresh, server-issued journal MUST correspond to the trusted snapshot. */
function freshJournal(snapshot, journal) {
  const context = snapshot.context;
  if (!record(journal) || !record(context)
    || journal.uid !== context.uid || journal.sessionId !== context.sessionId
    || journal.battleId !== context.battleId
    || journal.rulesVersion !== context.rulesVersion
    || journal.loadoutHash !== snapshot.loadoutHash
    || journal.issuedAtMs !== context.issuedAtMs) {
    deny('FOUNDATION_REPLAY_CONTEXT_INVALID', 'Snapshot/journal identity mismatch');
  }
  let expected;
  try {
    expected = openInputJournal({
      uid:context.uid, sessionId:context.sessionId, battleId:context.battleId,
      rulesVersion:context.rulesVersion, loadoutHash:snapshot.loadoutHash,
      issuedAtMs:context.issuedAtMs,
    });
  } catch (_) {
    deny('FOUNDATION_REPLAY_CONTEXT_INVALID', 'Not a valid server-issued journal context');
  }
  if (!exact(journal, Object.keys(expected))
    || Object.keys(expected).some(k => expected[k] !== journal[k])) {
    deny('FOUNDATION_REPLAY_CONTEXT_INVALID', 'Expected fresh server-issued journal');
  }
}

/** Offline-only helper. Caller must create snapshot/policy/journal on server. */
function openFoundationPreview(args) {
  if (!exact(args, OPEN_KEYS)) {
    deny('FOUNDATION_REPLAY_OPEN_INVALID', 'Unexpected preview open fields');
  }
  const {snapshot, policy, journal} = args;
  const preview = previewFromTrustedSnapshot(snapshot, policy);
  freshJournal(snapshot, journal);
  if (preview.rulesVersion !== journal.rulesVersion
    || preview.loadoutHash !== journal.loadoutHash
    || !HEX64.test(snapshot.snapshotHash || '')) {
    deny('FOUNDATION_REPLAY_CONTEXT_INVALID', 'Preview and journal differ');
  }
  return freeze({
    preview,
    checkpoint:seal({
      version:REPLAY_VERSION, previewOnly:true, safeForCloudBattle:false,
      uid:journal.uid, sessionId:journal.sessionId, battleId:journal.battleId,
      rulesVersion:journal.rulesVersion, loadoutHash:journal.loadoutHash,
      snapshotHash:snapshot.snapshotHash,
      tick:0, position:{...preview.startPosition},
      fireClock:openFireClock(preview.mainGun.periodUs), totalShots:0,
      journalDigest:journal.digest,
      eventDigest:digest(['sf-v8b2c2b-event-chain', snapshot.snapshotHash]),
    }),
    journal,
  });
}

/** Detect mistaken/tampered offline checkpoint usage, not adversarial forgery. */
function validateRun(run) {
  if (!exact(run, RUN_KEYS) || !Object.isFrozen(run)
    || !record(run.preview) || !Object.isFrozen(run.preview)
    || run.preview.version !== FOUNDATION_VERSION
    || run.preview.previewOnly !== true || run.preview.safeForCloudBattle !== false
    || !record(run.journal) || !Object.isFrozen(run.journal)
    || !exact(run.checkpoint, CHECKPOINT_KEYS) || !Object.isFrozen(run.checkpoint)) {
    deny('FOUNDATION_REPLAY_STATE_INVALID', 'Unexpected run/preview/checkpoint');
  }
  const s=run.checkpoint, j=run.journal, p=run.preview;
  if (s.version !== REPLAY_VERSION || s.previewOnly !== true || s.safeForCloudBattle !== false
    || s.uid !== j.uid || s.sessionId !== j.sessionId || s.battleId !== j.battleId
    || s.rulesVersion !== j.rulesVersion || s.rulesVersion !== p.rulesVersion
    || s.loadoutHash !== j.loadoutHash || s.loadoutHash !== p.loadoutHash
    || !HEX64.test(s.snapshotHash || '')
    || !HEX64.test(s.journalDigest || '') || s.journalDigest !== j.digest
    || !HEX64.test(s.eventDigest || '') || !HEX64.test(s.checkpointDigest || '')
    || !integer(s.tick, 0, MAX_BATTLE_TICKS) || s.tick !== j.nextTick
    || !integer(s.totalShots, 0, MAX_BATTLE_TICKS)
    || !record(s.position) || !Object.isFrozen(s.position)
    || Object.keys(s.position).length !== 2
    || !integer(s.position.xUnits, -p.arena.halfWidthUnits + p.pilotHitRadiusUnits, p.arena.halfWidthUnits - p.pilotHitRadiusUnits)
    || !integer(s.position.zUnits, -p.arena.halfHeightUnits + p.pilotHitRadiusUnits, p.arena.halfHeightUnits - p.pilotHitRadiusUnits)
    || !record(s.fireClock) || !Object.isFrozen(s.fireClock)
    || s.fireClock.version !== TIMER_VERSION || Object.keys(s.fireClock).length !== 4
    || s.fireClock.periodUs !== p.mainGun.periodUs
    || s.fireClock.processedThroughTick !== s.tick
    || s.fireClock.nextShotIndex !== s.totalShots
    || checkpointDigest(s) !== s.checkpointDigest) {
    deny('FOUNDATION_REPLAY_STATE_INVALID', 'Journal/preview/checkpoint drift');
  }
}

/** V8B-1 validates chronology; duplicate resend never spawns projectiles. */
function replayFoundationChunk(args) {
  if (!exact(args, ADVANCE_KEYS)) {
    deny('FOUNDATION_REPLAY_INPUT_INVALID', 'Unexpected replay input fields');
  }
  const {run,chunk,receivedAtMs}=args;
  validateRun(run);
  const validated=validateChunk(chunk);
  const receipt=ingestInputChunk(run.journal, chunk, receivedAtMs);
  if (receipt.duplicate) return Object.freeze({run, duplicate:true, emitted:Object.freeze([])});
  const start=run.checkpoint, p=run.preview;
  let pos=start.position, clock=start.fireClock, eventDigest=start.eventDigest;
  const events=[];
  for (let i=0; i<validated.frames.length; i++) {
    const [x,z]=validated.frames[i];
    const tick=start.tick+i+1;
    pos=advancePreviewMovement(p, pos, {x,z});
    const stepped=advanceFireClock(clock,tick);
    clock=stepped.clock;
    for (const dueTick of stepped.shotTicks) {
      const shot=previewMainProjectile(p, pos);
      const event=freeze({id:start.totalShots+events.length+1, tick:dueTick, ...shot});
      events.push(event);
      eventDigest=digest([eventDigest, event]);
    }
  }
  if (events.length > validated.frames.length || clock.nextShotIndex > MAX_BATTLE_TICKS) {
    deny('FOUNDATION_REPLAY_CAP_REACHED', 'Preview event budget exceeded');
  }
  const checkpoint=seal({
    version:REPLAY_VERSION, previewOnly:true, safeForCloudBattle:false,
    uid:start.uid, sessionId:start.sessionId, battleId:start.battleId,
    rulesVersion:start.rulesVersion, loadoutHash:start.loadoutHash,
    snapshotHash:start.snapshotHash,
    tick:validated.endTick, position:pos, fireClock:clock,
    totalShots:start.totalShots+events.length,
    journalDigest:receipt.journal.digest, eventDigest,
  });
  const next=freeze({preview:p, checkpoint, journal:receipt.journal});
  return Object.freeze({run:next, duplicate:false, emitted:Object.freeze(events)});
}

export {REPLAY_VERSION,FoundationReplayError,openFoundationPreview,replayFoundationChunk};
