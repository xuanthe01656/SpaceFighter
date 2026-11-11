/**
 * Campaign enemy volley contract V3.4.
 *
 * A fire opportunity creates one immutable volley plan. Runtime may schedule
 * the individual shots, but count, spacing and per-shot damage never mutate
 * after commitment. This prevents single-shot enemies and duplicate salvos.
 */
export const CAMPAIGN_ENEMY_VOLLEY_VERSION = 'campaign-enemy-volley-v3.4.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function createCampaignEnemyVolleyPlanV34({
  roleId = 'gunner',
  phaseId = 'attack',
  sequence = 0,
  burstCount = 1,
  burstGapMs = 0,
  projectileDamage = 1,
  createdAtMs = 0,
} = {}) {
  const count = clamp(Math.trunc(finite(burstCount, 1)), 1, 5);
  const gapMs = clamp(Math.trunc(finite(burstGapMs, 0)), 0, 320);
  const damage = Math.max(1, Math.round(finite(projectileDamage, 1)));
  const created = Math.max(0, Math.trunc(finite(createdAtMs, 0)));
  const safeSequence = Math.max(0, Math.trunc(finite(sequence, 0)));
  const id = `enemy-volley:${roleId}:${phaseId}:${safeSequence}:${created}`;
  const shots = Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    index,
    fireOffsetMs: index * gapMs,
    rawDamage: damage,
  })));
  return Object.freeze({
    version: CAMPAIGN_ENEMY_VOLLEY_VERSION,
    id,
    roleId: String(roleId || 'gunner'),
    phaseId: String(phaseId || 'attack'),
    sequence: safeSequence,
    createdAtMs: created,
    burstCount: count,
    burstGapMs: gapMs,
    latestFireOffsetMs: shots.at(-1)?.fireOffsetMs || 0,
    shots,
  });
}

export function auditCampaignEnemyVolleyV34() {
  const issues = [];
  const example = createCampaignEnemyVolleyPlanV34({
    roleId: 'gunner', phaseId: 'strafe_a', sequence: 2,
    burstCount: 3, burstGapMs: 96, projectileDamage: 48, createdAtMs: 1000,
  });
  if (!Object.isFrozen(example) || !Object.isFrozen(example.shots)) issues.push('VOLLEY_NOT_IMMUTABLE');
  if (example.shots.length !== 3 || example.latestFireOffsetMs !== 192) issues.push('VOLLEY_TIMING');
  if (example.shots.some(shot => shot.rawDamage !== 48)) issues.push('VOLLEY_DAMAGE');
  return Object.freeze(issues);
}
