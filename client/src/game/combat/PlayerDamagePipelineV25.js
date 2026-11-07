/**
 * Shared player-hit admission and outcome contract for legacy Campaign/Dungeon.
 * Pure JS: no React, Babylon, wall-clock or persistence dependency.
 *
 * V2.5 separates three concerns that were previously hidden behind one global
 * invulnerability timer:
 *   1) projectile identity/deduplication,
 *   2) per-source contact cooldown,
 *   3) the final damage outcome consumed by HUD/replay adapters.
 */

export const PLAYER_DAMAGE_PIPELINE_VERSION = 'player-damage-pipeline-v2.5.0';

export const PLAYER_DAMAGE_OUTCOME_V25 = Object.freeze({
  ACCEPTED: 'accepted',
  DUPLICATE_PROJECTILE: 'duplicate_projectile',
  INVALID_PROJECTILE: 'invalid_projectile',
  CONTACT_COOLDOWN: 'contact_cooldown',
  EVADED: 'evaded',
  ABSORBED: 'absorbed',
  DAMAGED: 'damaged',
  FATAL: 'fatal',
  NO_DAMAGE: 'no_damage',
});

export const PLAYER_DAMAGE_GATE_DEFAULTS_V25 = Object.freeze({
  contactCooldownMs: 900,
  projectileRetentionMs: 30_000,
  maxProjectileLedgerSize: 1024,
  maxContactLedgerSize: 256,
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positiveInteger = (value, fallback) => {
  const normalized = Math.trunc(finite(value, fallback));
  return normalized > 0 ? normalized : fallback;
};
const normalizeId = value => String(value ?? '').trim();

function freezeAdmission({
  accepted,
  reason,
  source,
  nowMs,
  hitId = null,
  contactId = null,
  remainingMs = 0,
}) {
  return Object.freeze({
    version: PLAYER_DAMAGE_PIPELINE_VERSION,
    accepted: Boolean(accepted),
    reason,
    source,
    nowMs,
    hitId,
    contactId,
    remainingMs: Math.max(0, Math.ceil(finite(remainingMs, 0))),
  });
}

/**
 * Creates a bounded battle-local ledger. The caller supplies `nowMs`, allowing
 * tests and a future fixed-tick adapter to remain deterministic.
 */
export function createPlayerDamageGateV25({
  contactCooldownMs = PLAYER_DAMAGE_GATE_DEFAULTS_V25.contactCooldownMs,
  projectileRetentionMs = PLAYER_DAMAGE_GATE_DEFAULTS_V25.projectileRetentionMs,
  maxProjectileLedgerSize = PLAYER_DAMAGE_GATE_DEFAULTS_V25.maxProjectileLedgerSize,
  maxContactLedgerSize = PLAYER_DAMAGE_GATE_DEFAULTS_V25.maxContactLedgerSize,
} = {}) {
  const safeContactCooldownMs = Math.max(0, finite(contactCooldownMs, 900));
  const safeProjectileRetentionMs = Math.max(1000, finite(projectileRetentionMs, 30_000));
  const safeMaxProjectileLedgerSize = positiveInteger(maxProjectileLedgerSize, 1024);
  const safeMaxContactLedgerSize = positiveInteger(maxContactLedgerSize, 256);

  const projectileLedger = new Map();
  const contactReadyAt = new Map();
  let lastNowMs = 0;

  const trimOldest = (map, maxSize) => {
    while (map.size > maxSize) {
      const first = map.keys().next();
      if (first.done) break;
      map.delete(first.value);
    }
  };

  const normalizeNowMs = value => {
    const next = Math.max(0, finite(value, lastNowMs));
    lastNowMs = Math.max(lastNowMs, next);
    return lastNowMs;
  };

  const prune = nowMs => {
    const projectileCutoff = nowMs - safeProjectileRetentionMs;
    for (const [id, acceptedAt] of projectileLedger) {
      if (acceptedAt > projectileCutoff) break;
      projectileLedger.delete(id);
    }
    for (const [id, readyAt] of contactReadyAt) {
      if (readyAt <= nowMs) contactReadyAt.delete(id);
    }
    trimOldest(projectileLedger, safeMaxProjectileLedgerSize);
    trimOldest(contactReadyAt, safeMaxContactLedgerSize);
  };

  function admitHit({
    source = 'contact',
    hitId = null,
    contactId = null,
    nowMs = 0,
  } = {}) {
    const normalizedSource = String(source || 'contact');
    const safeNowMs = normalizeNowMs(nowMs);
    prune(safeNowMs);

    if (normalizedSource === 'projectile') {
      const normalizedHitId = normalizeId(hitId);
      if (!normalizedHitId) {
        return freezeAdmission({
          accepted: false,
          reason: PLAYER_DAMAGE_OUTCOME_V25.INVALID_PROJECTILE,
          source: normalizedSource,
          nowMs: safeNowMs,
        });
      }
      if (projectileLedger.has(normalizedHitId)) {
        return freezeAdmission({
          accepted: false,
          reason: PLAYER_DAMAGE_OUTCOME_V25.DUPLICATE_PROJECTILE,
          source: normalizedSource,
          nowMs: safeNowMs,
          hitId: normalizedHitId,
        });
      }
      projectileLedger.set(normalizedHitId, safeNowMs);
      trimOldest(projectileLedger, safeMaxProjectileLedgerSize);
      return freezeAdmission({
        accepted: true,
        reason: PLAYER_DAMAGE_OUTCOME_V25.ACCEPTED,
        source: normalizedSource,
        nowMs: safeNowMs,
        hitId: normalizedHitId,
      });
    }

    if (normalizedSource === 'contact') {
      const normalizedContactId = normalizeId(contactId) || 'contact:global';
      const readyAt = contactReadyAt.get(normalizedContactId) || 0;
      if (safeNowMs < readyAt) {
        return freezeAdmission({
          accepted: false,
          reason: PLAYER_DAMAGE_OUTCOME_V25.CONTACT_COOLDOWN,
          source: normalizedSource,
          nowMs: safeNowMs,
          contactId: normalizedContactId,
          remainingMs: readyAt - safeNowMs,
        });
      }
      contactReadyAt.set(normalizedContactId, safeNowMs + safeContactCooldownMs);
      trimOldest(contactReadyAt, safeMaxContactLedgerSize);
      return freezeAdmission({
        accepted: true,
        reason: PLAYER_DAMAGE_OUTCOME_V25.ACCEPTED,
        source: normalizedSource,
        nowMs: safeNowMs,
        contactId: normalizedContactId,
      });
    }

    return freezeAdmission({
      accepted: true,
      reason: PLAYER_DAMAGE_OUTCOME_V25.ACCEPTED,
      source: normalizedSource,
      nowMs: safeNowMs,
      hitId: normalizeId(hitId) || null,
      contactId: normalizeId(contactId) || null,
    });
  }

  function snapshot() {
    return Object.freeze({
      version: PLAYER_DAMAGE_PIPELINE_VERSION,
      lastNowMs,
      contactCooldownMs: safeContactCooldownMs,
      projectileRetentionMs: safeProjectileRetentionMs,
      projectileLedgerSize: projectileLedger.size,
      contactLedgerSize: contactReadyAt.size,
    });
  }

  function reset() {
    projectileLedger.clear();
    contactReadyAt.clear();
    lastNowMs = 0;
  }

  return Object.freeze({ admitHit, reset, snapshot });
}

/**
 * Stable presentation/replay result. No caller needs to infer whether a
 * zero-damage hit was evaded, absorbed, rejected as a duplicate, or blocked by
 * contact cooldown.
 */
export function createPlayerDamageOutcomeV25({
  gate = null,
  source = 'contact',
  hitId = null,
  contactId = null,
  rawDamage = 0,
  hpBefore = 0,
  hpAfter = hpBefore,
  absorbed = 0,
  dodged = false,
  dodgeSource = null,
  reflected = 0,
  novaDamage = 0,
} = {}) {
  const safeHpBefore = Math.max(0, finite(hpBefore, 0));
  const safeHpAfter = Math.max(0, finite(hpAfter, safeHpBefore));
  const hpDamage = Math.max(0, safeHpBefore - safeHpAfter);
  const safeAbsorbed = Math.max(0, finite(absorbed, 0));
  const accepted = gate?.accepted !== false;

  let outcome = PLAYER_DAMAGE_OUTCOME_V25.NO_DAMAGE;
  if (!accepted) outcome = gate?.reason || PLAYER_DAMAGE_OUTCOME_V25.NO_DAMAGE;
  else if (dodged) outcome = PLAYER_DAMAGE_OUTCOME_V25.EVADED;
  else if (hpDamage > 0 && safeHpAfter <= 0) outcome = PLAYER_DAMAGE_OUTCOME_V25.FATAL;
  else if (hpDamage > 0) outcome = PLAYER_DAMAGE_OUTCOME_V25.DAMAGED;
  else if (safeAbsorbed > 0) outcome = PLAYER_DAMAGE_OUTCOME_V25.ABSORBED;

  return Object.freeze({
    version: PLAYER_DAMAGE_PIPELINE_VERSION,
    accepted,
    outcome,
    source: String(source || 'contact'),
    hitId: normalizeId(hitId) || null,
    contactId: normalizeId(contactId) || null,
    rawDamage: Math.max(0, finite(rawDamage, 0)),
    hpBefore: safeHpBefore,
    hpAfter: safeHpAfter,
    hpDamage,
    absorbed: safeAbsorbed,
    dodged: Boolean(dodged),
    dodgeSource: dodgeSource || null,
    reflected: Math.max(0, finite(reflected, 0)),
    novaDamage: Math.max(0, finite(novaDamage, 0)),
    gateReason: gate?.reason || null,
  });
}
