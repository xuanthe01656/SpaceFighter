'use strict';
// V8B-1 experimental, server-owned PvE input journal contract.
// This module is NOT a combat simulator, victory verifier, or permission to
// settle rewards. P0 Cloud Battle lock must remain in force.
const { createHash } = require('node:crypto');

const PROTOCOL_VERSION = 'pve-input-v1';
const JOURNAL_VERSION = 1;
const TICK_HZ = 30;
const MAX_CHUNK_FRAMES = 60;
const MAX_BATTLE_TICKS = TICK_HZ * 30 * 60;
const MAX_AHEAD_TICKS = 15;
// Do not allow a client to accumulate an arbitrarily large unsubmitted battle.
// A long network outage requires an explicit server-controlled pause/resume flow
// (not part of V8B-1); Guest play is unaffected.
const MAX_LAG_TICKS = 300;
const MAX_BATTLE_MS = 30 * 60 * 1000;
const HASH_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[a-f0-9-]{36}$/;
const INPUT_KEYS = Object.freeze(['x', 'z']);
const CHUNK_KEYS = Object.freeze(['battleId', 'frames', 'protocol', 'startTick']);

class CombatInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CombatInputError';
    this.code = code;
  }
}
const deny = (code, message) => { throw new CombatInputError(code, message); };
const isRecord = value => value !== null && typeof value === 'object'
  && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null);
const hasExactKeys = (value, keys) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((k, i) => k === keys[i]);
};
const finiteMs = ms => Number.isSafeInteger(ms) && ms >= 0;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isBoundId = text => typeof text === 'string' && text.length >= 1 && text.length <= 128
  && !/[\u0000-\u001f\u007f\/]/.test(text);

function openInputJournal({ uid, sessionId, battleId, rulesVersion, loadoutHash, issuedAtMs }) {
  // Caller must supply values derived from verified Firebase identity, a valid
  // server session and a server-created ticket. Never use payload-supplied UID.
  if (!isBoundId(uid) || !UUID_RE.test(sessionId) || !UUID_RE.test(battleId)
    || typeof rulesVersion !== 'string' || !/^[a-z0-9._-]{3,40}$/.test(rulesVersion)
    || !HASH_RE.test(loadoutHash) || !finiteMs(issuedAtMs)) {
    deny('INPUT_JOURNAL_INVALID_CONTEXT', 'Invalid server-owned combat journal context');
  }
  const base = [PROTOCOL_VERSION, uid, sessionId, battleId, rulesVersion, loadoutHash, issuedAtMs];
  return Object.freeze({
    version: JOURNAL_VERSION,
    protocol: PROTOCOL_VERSION,
    uid, sessionId, battleId, rulesVersion, loadoutHash, issuedAtMs,
    nextTick: 0,
    lastReceivedAtMs: issuedAtMs,
    digest: digest(['sf-v8b1-input-ledger', ...base]),
    lastChunkStart: -1,
    lastChunkDigest: null,
  });
}

function validateJournal(journal) {
  if (!isRecord(journal) || journal.version !== JOURNAL_VERSION
    || journal.protocol !== PROTOCOL_VERSION
    || !isBoundId(journal.uid) || !UUID_RE.test(journal.sessionId)
    || !UUID_RE.test(journal.battleId)
    || typeof journal.rulesVersion !== 'string'
    || !/^[a-z0-9._-]{3,40}$/.test(journal.rulesVersion)
    || !HASH_RE.test(journal.loadoutHash)
    || !finiteMs(journal.issuedAtMs)
    || !Number.isSafeInteger(journal.nextTick)
    || journal.nextTick < 0 || journal.nextTick > MAX_BATTLE_TICKS
    || !finiteMs(journal.lastReceivedAtMs)
    || journal.lastReceivedAtMs < journal.issuedAtMs
    || !HASH_RE.test(journal.digest)
    || !Number.isSafeInteger(journal.lastChunkStart)
    || journal.lastChunkStart < -1 || journal.lastChunkStart > journal.nextTick
    || (journal.lastChunkDigest !== null && !HASH_RE.test(journal.lastChunkDigest))) {
    deny('INPUT_JOURNAL_INVALID_STATE', 'Invalid stored input journal');
  }
}

function validateChunk(chunk) {
  // Opaque client combat results (victory, stars, kills, HP, damage, drops)
  // are explicitly outside this input protocol.
  if (!hasExactKeys(chunk, CHUNK_KEYS)
    || chunk.protocol !== PROTOCOL_VERSION
    || !UUID_RE.test(chunk.battleId)
    || !Number.isSafeInteger(chunk.startTick) || chunk.startTick < 0
    || !Array.isArray(chunk.frames)
    || chunk.frames.length < 1 || chunk.frames.length > MAX_CHUNK_FRAMES
    || chunk.startTick + chunk.frames.length > MAX_BATTLE_TICKS) {
    deny('INPUT_CHUNK_INVALID', 'Invalid input chunk envelope');
  }
  const frames = chunk.frames.map(frame => {
    if (!hasExactKeys(frame, INPUT_KEYS)
      || !Number.isInteger(frame.x) || frame.x < -127 || frame.x > 127
      || !Number.isInteger(frame.z) || frame.z < -127 || frame.z > 127
      || frame.x * frame.x + frame.z * frame.z > 128 * 128) {
      deny('INPUT_FRAME_INVALID', 'Invalid quantized input frame');
    }
    return Object.freeze([frame.x, frame.z]);
  });
  return Object.freeze({
    battleId: chunk.battleId,
    startTick: chunk.startTick,
    endTick: chunk.startTick + frames.length,
    frames: Object.freeze(frames),
    chunkDigest: digest([PROTOCOL_VERSION, chunk.battleId, chunk.startTick, frames]),
  });
}

function ingestInputChunk(journal, chunk, receivedAtMs) {
  validateJournal(journal);
  const validated = validateChunk(chunk);
  if (validated.battleId !== journal.battleId) {
    deny('INPUT_WRONG_BATTLE', 'Input bound to another battle');
  }
  // Only the server sets receivedAtMs, based on its own clock. This is not
  // a client timestamp, and cannot be used by the client to fast-forward.
  if (!finiteMs(receivedAtMs) || receivedAtMs < journal.lastReceivedAtMs
    || receivedAtMs < journal.issuedAtMs) {
    deny('INPUT_SERVER_TIME_INVALID', 'Non-monotonic server receive time');
  }
  if (receivedAtMs > journal.issuedAtMs + MAX_BATTLE_MS) {
    deny('INPUT_BATTLE_EXPIRED', 'Battle input acceptance window expired');
  }
  // Support at most the immediately preceding identical chunk as a no-op.
  // Earlier retries should be served by the existing requestId ledger.
  if (validated.startTick === journal.lastChunkStart
    && validated.endTick === journal.nextTick
    && validated.chunkDigest === journal.lastChunkDigest) {
    return Object.freeze({journal, duplicate: true, acceptedFrames: 0});
  }
  if (validated.startTick !== journal.nextTick) {
    deny('INPUT_SEQUENCE_INVALID', 'Missing, replayed or reordered frames');
  }
  const elapsedTicks = Math.floor((receivedAtMs - journal.issuedAtMs) * TICK_HZ / 1000);
  if (validated.endTick > elapsedTicks + MAX_AHEAD_TICKS) {
    deny('INPUT_FAST_FORWARD', 'Inputs advanced faster than server time');
  }
  if (validated.endTick < elapsedTicks - MAX_LAG_TICKS) {
    deny('INPUT_TOO_LATE', 'Input backlog exceeds provisional network tolerance');
  }
  const next = Object.freeze({
    ...journal,
    nextTick: validated.endTick,
    lastReceivedAtMs: receivedAtMs,
    lastChunkStart: validated.startTick,
    lastChunkDigest: validated.chunkDigest,
    digest: digest([journal.digest, validated.chunkDigest, receivedAtMs]),
  });
  return Object.freeze({journal: next, duplicate: false, acceptedFrames: validated.frames.length});
}

module.exports = Object.freeze({
  PROTOCOL_VERSION, TICK_HZ, MAX_CHUNK_FRAMES, MAX_BATTLE_TICKS, MAX_LAG_TICKS,
  CombatInputError, openInputJournal, validateChunk, ingestInputChunk,
});
