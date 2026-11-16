/**
 * Shared immutable authoring primitives for Campaign and Dungeon content V4.3.
 * Content is assembled at module-load time from reviewed static packs. Runtime
 * registration is intentionally unsupported so a live session cannot mutate
 * balance, release state, rewards or asset bindings.
 */
export const CONTENT_AUTHORING_SCHEMA_VERSION_V430 = 1;
export const CONTENT_AUTHORING_FOUNDATION_VERSION_V430 = 'content-authoring-foundation-v4.3.0';

export const freezeDeepV430 = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeepV430));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeepV430(entry)])));
  }
  return value;
};

export const isPlainObjectV430 = value => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export const positiveIntegerV430 = value => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

export const finiteNumberV430 = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Number(value)
  : fallback;

export const localizedTextCompleteV430 = value => Boolean(
  value && typeof value === 'object'
  && String(value.vi || '').trim()
  && String(value.en || '').trim()
);

export const releaseStateV430 = value => {
  const state = String(value || '').trim().toLowerCase();
  return ['production', 'qa', 'disabled'].includes(state) ? state : null;
};

export function cloneJsonLikeV430(value) {
  if (Array.isArray(value)) return value.map(cloneJsonLikeV430);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, cloneJsonLikeV430(entry)]));
  }
  return value;
}

export function sortedNumericRecordV430(record = {}) {
  return Object.freeze(Object.fromEntries(Object.entries(record)
    .sort(([left], [right]) => Number(left) - Number(right))));
}

export function duplicateValuesV430(values = []) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Object.freeze([...duplicates]);
}
