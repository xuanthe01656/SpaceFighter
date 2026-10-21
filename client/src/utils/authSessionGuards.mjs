// Space Fighter B2.2: pure auth lifecycle guards for Firebase + Cloud Run.
// Keep these rules independent of React and Firebase so they can be unit tested.
export function isCurrentAuthAttempt(attempt, latestAttempt, requestedUid, signedInUid) {
  return Number.isSafeInteger(attempt) && attempt > 0 && attempt === latestAttempt &&
    typeof requestedUid === 'string' && requestedUid.length > 0 && requestedUid === signedInUid;
}

export function canProcessSessionSnapshot(snapshot, attempt, latestAttempt, requestedUid, signedInUid) {
  return isCurrentAuthAttempt(attempt, latestAttempt, requestedUid, signedInUid) &&
    snapshot?.metadata?.fromCache !== true && snapshot?.exists?.() === true;
}

export function guestEnergyFromStorage(value, fallback = 50) {
  // Avoid `parseInt(value) || 50`: a legitimate stored value of 0 must stay 0.
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
