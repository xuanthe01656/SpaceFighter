'use strict';
// Deferred account deletion: durable tombstone and dedicated retryable worker.
// No deletion is performed in an HTTP request. Feature is OFF unless both
// GAME_ACCOUNT_DELETION_ENABLED and GAME_ACCOUNT_DELETION_WORKER_READY are true.
const crypto = require('node:crypto');
const { GameError } = require('./economy.cjs');

const JOBS = 'accountDeletionJobs';
const LEASE_MS = 15 * 60 * 1000;
const MAX_RETRY_MS = 15 * 60 * 1000;
const COMPLETED_AUDIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NEVER_SCHEDULE = Number.MAX_SAFE_INTEGER;

function isDeletionPending(data) {
  return data?.accountDeletion?.status === 'pending';
}
function assertAccountActive(data) {
  if (isDeletionPending(data)) {
    throw new GameError('ACCOUNT_DELETION_PENDING', 'Account deletion is pending; game access is locked', 423);
  }
}
function isDeletionJob(job) {
  return job && job.version === 1 && typeof job.uid === 'string' && job.uid.length > 0 &&
    Number.isSafeInteger(job.requestedAtMs) && job.requestedAtMs > 0 &&
    Number.isSafeInteger(job.attempts) && job.attempts >= 0 &&
    Number.isSafeInteger(job.nextAttemptAtMs) && job.nextAttemptAtMs >= 0;
}
function deletionJobRef(db, uid) { return db.collection(JOBS).doc(uid); }

function createAccountDeletionService({ db, auth, now = Date.now, newId = crypto.randomUUID }) {
  if (!db || !auth || typeof auth.deleteUser !== 'function') throw new TypeError('Admin db and auth required');
  const userRef = uid => db.collection('users').doc(uid);
  const request = async (uid, sid) => {
    // Authenticated UID comes only from server-side verifyIdToken(token, true).
    if (typeof uid !== 'string' || !uid) throw new GameError('UNAUTHORIZED', 'Valid user required', 401);
    return db.runTransaction(async t => {
      const ref = userRef(uid), jobRef = deletionJobRef(db, uid);
      // Firestore transactions must do all reads before any writes.
      const [snap, jobSnap] = await Promise.all([t.get(ref), t.get(jobRef)]);
      if (!snap.exists) throw new GameError('PROFILE_NOT_FOUND', 'Profile not initialized', 404);
      const data = snap.data();
      if (typeof sid !== 'string' || !/^[a-f0-9-]{36}$/.test(sid) || data.sessionId !== sid) {
        throw new GameError('SESSION_EXPIRED', 'Signed in on another device or session expired', 401);
      }
      if (jobSnap.exists) {
        const job = jobSnap.data();
        if (!isDeletionJob(job) || job.uid !== uid) throw new GameError('ACCOUNT_DELETION_CONFLICT', 'Deletion state invalid', 409);
        return { deletionPending: true, duplicate: true };
      }
      if (isDeletionPending(data)) throw new GameError('ACCOUNT_DELETION_CONFLICT', 'Deletion state requires administrator review', 409);
      const requestedAtMs = now();
      if (!Number.isSafeInteger(requestedAtMs) || requestedAtMs <= 0) throw new Error('Invalid clock');
      t.set(ref, { ...data, accountDeletion: { status: 'pending', requestedAtMs } });
      t.create(jobRef, { version: 1, uid, status: 'pending', requestedAtMs,
        attempts: 0, leaseId: null, leaseUntilMs: 0, retryAfterMs: 0, nextAttemptAtMs: requestedAtMs });
      return { deletionPending: true, duplicate: false };
    });
  };

  async function acquire(uid) {
    const jobRef = deletionJobRef(db, uid), ref = userRef(uid), leaseId = newId();
    const acquired = await db.runTransaction(async t => {
      const [jobSnap, userSnap] = await Promise.all([t.get(jobRef), t.get(ref)]);
      if (!jobSnap.exists) return null;
      const job = jobSnap.data();
      if (!isDeletionJob(job) || job.uid !== uid) throw new GameError('ACCOUNT_DELETION_INVALID_JOB', 'Invalid account deletion job', 409);
      if (job.status === 'completed') return null;
      if (job.status !== 'pending' && job.status !== 'processing') throw new GameError('ACCOUNT_DELETION_INVALID_JOB', 'Invalid account deletion status', 409);
      if (userSnap.exists && !isDeletionPending(userSnap.data())) {
        throw new GameError('ACCOUNT_DELETION_INVALID_JOB', 'Account does not have a deletion tombstone', 409);
      }
      const current = now();
      if (job.status === 'processing') {
        if (typeof job.leaseId !== 'string' || !job.leaseId ||
            !Number.isSafeInteger(job.leaseUntilMs) || job.leaseUntilMs <= 0) {
          throw new GameError('ACCOUNT_DELETION_INVALID_JOB', 'Invalid worker lease', 409);
        }
        if (job.leaseUntilMs > current) return null;
      }
      if (job.status === 'pending' && Number(job.retryAfterMs) > current) return null;
      const attempts = Number.isSafeInteger(job.attempts) && job.attempts >= 0 ? job.attempts + 1 : 1;
      t.set(jobRef, { ...job, status: 'processing', attempts, leaseId,
        leaseUntilMs: current + LEASE_MS, retryAfterMs: 0, lastAttemptAtMs: current,
        nextAttemptAtMs: current + LEASE_MS });
      return { leaseId, attempts };
    });
    return acquired;
  }
  async function markComplete(uid, leaseId) {
    const jobRef = deletionJobRef(db, uid);
    await db.runTransaction(async t => {
      const snap = await t.get(jobRef);
      if (!snap.exists || snap.data().leaseId !== leaseId) return;
      const job = snap.data();
      t.set(jobRef, { ...job, status: 'completed', leaseId: null, leaseUntilMs: 0,
        completedAtMs: now(), retryAfterMs: 0, nextAttemptAtMs: NEVER_SCHEDULE,
        // Enable a Firestore TTL policy on this field before real launch.
        expireAt: new Date(now() + COMPLETED_AUDIT_TTL_MS),
        lastFailureStage: null });
    });
  }
  async function processOne(uid) {
    const lease = await acquire(uid);
    if (!lease) return { processed: false, reason: 'not-ready-or-already-complete' };
    let failureStage = 'auth';
    try {
      // NEVER delete Firestore first. auth/user-not-found means a prior attempt
      // deleted the Auth user before Firestore cleanup; retry is idempotent.
      try {
        await auth.deleteUser(uid);
      } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
      }
      failureStage = 'firestore';
      await db.recursiveDelete(userRef(uid));
      await markComplete(uid, lease.leaseId);
      return { processed: true, completed: true };
    } catch (error) {
      // If marking retry also fails, keep the processing lease: expiry allows
      // the next worker to retry. Never acknowledge success after failure.
      try {
        const ref = deletionJobRef(db, uid);
        await db.runTransaction(async t => {
          const snap = await t.get(ref);
          if (!snap.exists || snap.data().leaseId !== lease.leaseId) return;
          const job = snap.data();
          const retryDelay = Math.min(MAX_RETRY_MS, Math.pow(2, Math.min(job.attempts, 8)) * 1000);
          t.set(ref, { ...job, status: 'pending', leaseId: null, leaseUntilMs: 0,
            retryAfterMs: now() + retryDelay, nextAttemptAtMs: now() + retryDelay,
            lastFailureStage: failureStage });
        });
      } catch (_) { /* The lease expires; scheduler will retry. */ }
      throw error;
    }
  }
  async function processBatch(limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid worker batch limit');
    // One automatically indexed numeric field avoids starvation: in-flight
    // leases and backoff-delayed jobs do not occupy the ready-job batch.
    const snap = await db.collection(JOBS).where('nextAttemptAtMs', '<=', now()).limit(limit).get();
    const summary = { scanned: snap.docs.length, completed: 0, skipped: 0, failed: 0 };
    for (const doc of snap.docs) {
      try {
        const result = await processOne(doc.id);
        if (result.completed) summary.completed++;
        else summary.skipped++;
      } catch (error) {
        summary.failed++;
        // No UID, tokens or Firebase API keys in operational logs.
        console.error('Account deletion worker failed:', error?.code || 'WORKER_ERROR');
      }
    }
    return summary;
  }
  return { request, processOne, processBatch };
}

async function runWorker() {
  if (process.env.GAME_ACCOUNT_DELETION_WORKER_ENABLED !== 'true' ||
      !process.env.FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID !== process.env.GAME_ACCOUNT_DELETION_TARGET_PROJECT_ID) {
    throw new Error('Account deletion worker disabled or target project not confirmed');
  }
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  const manager = createAccountDeletionService({ db: admin.firestore(), auth: admin.auth() });
  const summary = await manager.processBatch();
  console.log('Account deletion worker summary:', JSON.stringify(summary));
  if (summary.failed) process.exitCode = 1;
}
if (require.main === module) runWorker().catch(error => {
  console.error('Account deletion worker aborted:', error?.code || 'WORKER_NOT_READY');
  process.exitCode = 1;
});
module.exports = { createAccountDeletionService, assertAccountActive, isDeletionPending };
