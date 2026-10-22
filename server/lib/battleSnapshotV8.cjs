'use strict';
/**
 * SpaceFighter V8B-2C1 - ISOLATED, SERVER-SIDE BATTLE SNAPSHOT PREVIEW.
 *
 * PRECONDITION (not enforced by this pure helper): the future caller has
 * authenticated the Firebase UID, checked the server session and account,
 * loaded the persisted profile from Firestore, and supplied an approved,
 * pinned server catalog, rules/arena, server clock and cryptographic seed.
 * NEVER pass request.body, client stats, an unverified profile, or a mutable
 * client-owned rules object to this function. There is NO HTTP integration.
 *
 * No admission, journal ingestion, physics, victory, reward or settlement.
 * P0 BATTLE_VERIFICATION_UNAVAILABLE MUST remain enabled. SHA-256 digests
 * are deterministic consistency identifiers, NOT signatures/authentication.
 */
const { createHash } = require('node:crypto');
const { PROTOCOL_VERSION } = require('./combatInputJournalV8.cjs');
const { CORE_VERSION } = require('./combatCoreV8.cjs');

const SNAPSHOT_VERSION = 'pve-battle-snapshot-preview-v1';
const EQUIPMENT_SLOTS = Object.freeze(['pilot', 'aircraft', 'mainGun', 'wingman', 'armor', 'drone']);
const GEAR_SLOTS = Object.freeze(['mainGun', 'wingman', 'armor', 'drone']);
const INPUT_KEYS = ['identity', 'persistedProfile', 'approvedCatalog', 'rules', 'arena', 'seed'];
const IDENTITY_KEYS = ['uid', 'sessionId', 'battleId', 'issuedAtMs', 'expiresAtMs'];
const RULE_KEYS = ['mode', 'locationId', 'rulesVersion', 'catalogVersion'];
const ARENA_KEYS = ['halfWidthUnits', 'halfHeightUnits', 'spawnXUnits', 'spawnZUnits'];
const UUID_RE = /^[a-f0-9-]{36}$/;
const ID_RE = /^[a-zA-Z0-9_-]{1,90}$/;
const VERSION_RE = /^[a-z0-9._-]{3,40}$/;

class BattleSnapshotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BattleSnapshotError';
    this.code = code;
  }
}
const deny = (code, message) => { throw new BattleSnapshotError(code, message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(desc => Object.hasOwn(desc, 'value'));
const exact = (value, keys) => plain(value)
  && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const int = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value)
  && value >= min && value <= max;
const boundedId = value => typeof value === 'string' && ID_RE.test(value);
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
};
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const ownEntry = (entries, key) => plain(entries) && Object.hasOwn(entries, key)
  && plain(entries[key]) ? entries[key] : null;

function checkIdentity(identity) {
  if (!exact(identity, IDENTITY_KEYS)
    || typeof identity.uid !== 'string' || identity.uid.length < 1 || identity.uid.length > 128
    || /[\x00-\x1f\x7f/]/.test(identity.uid)
    || !UUID_RE.test(identity.sessionId) || !UUID_RE.test(identity.battleId)
    || !int(identity.issuedAtMs, 0, Number.MAX_SAFE_INTEGER)
    || !int(identity.expiresAtMs, identity.issuedAtMs + 1, identity.issuedAtMs + 1800000)) {
    deny('SNAPSHOT_IDENTITY_INVALID', 'Invalid trusted server battle identity/expiry');
  }
}
function checkRules(rules, arena, seed) {
  if (!exact(rules, RULE_KEYS)
    || !['campaign', 'dungeon'].includes(rules.mode)
    || !boundedId(rules.locationId)
    || !VERSION_RE.test(rules.rulesVersion || '')
    || !VERSION_RE.test(rules.catalogVersion || '')) {
    deny('SNAPSHOT_RULES_INVALID', 'Invalid versioned server battle rules');
  }
  // Values must be supplied by a *trusted* arena-policy resolver. This module
  // deliberately does not choose a portrait/landscape arena or a spawn policy.
  if (!exact(arena, ARENA_KEYS)
    || !int(arena.halfWidthUnits, 2000, 50000)
    || !int(arena.halfHeightUnits, 2000, 50000)
    || !int(arena.spawnXUnits, -arena.halfWidthUnits, arena.halfWidthUnits)
    || !int(arena.spawnZUnits, -arena.halfHeightUnits, arena.halfHeightUnits)
    || !int(seed, 1, 0xffffffff)) {
    deny('SNAPSHOT_ARENA_INVALID', 'Invalid server arena/seed snapshot');
  }
}
function selectedCatalogEntry(entries, id, errorCode) {
  if (!Array.isArray(entries) || entries.length > 256) {
    deny(errorCode, 'Invalid approved catalog list');
  }
  // Duplicate IDs are not allowed, even if the matching entity is valid.
  const matches = entries.filter(entry => plain(entry) && entry.id === id);
  if (matches.length !== 1) deny(errorCode, 'Missing or duplicate selected catalog ID');
  return matches[0];
}
function selectedPilot(profile, catalog) {
  const id = profile.loadout.pilot;
  const owned = ownEntry(profile.ownedPilots, id);
  if (!owned || !int(owned.level, 1, 1000) || !int(owned.stars, 1, 5)) {
    deny('SNAPSHOT_NOT_OWNED', 'Selected pilot is missing or invalid');
  }
  const base = selectedCatalogEntry(catalog.PILOTS, id, 'SNAPSHOT_CATALOG_INVALID');
  if (!int(base.rarity, 1, 5)
    || (base.passive !== null && typeof base.passive !== 'string')
    || (typeof base.passive === 'string' && !/^[a-z][a-z0-9_]{0,50}$/.test(base.passive))) {
    deny('SNAPSHOT_CATALOG_INVALID', 'Invalid approved pilot descriptor');
  }
  let value;
  if (finite(base.value, 0, 1000000)) value = base.value;
  else if (plain(base.value) && Object.keys(base.value).length > 0
    && Object.keys(base.value).every(key => ['dodge', 'critDamage', 'interval', 'count'].includes(key))
    && Object.values(base.value).every(entry => finite(entry, 0, 1000000))) {
    value = Object.fromEntries(Object.entries(base.value).sort(([a], [b]) => a.localeCompare(b)));
  } else deny('SNAPSHOT_CATALOG_INVALID', 'Invalid approved pilot passive value');
  return { id, level: owned.level, stars: owned.stars, rarity: base.rarity,
    passive: base.passive, value };
}
function selectedAircraft(profile, catalog) {
  const id = profile.loadout.aircraft;
  const owned = ownEntry(profile.ownedAircrafts, id);
  if (!owned || !int(owned.level, 1, 1000) || !int(owned.stars, 1, 5)) {
    deny('SNAPSHOT_NOT_OWNED', 'Selected aircraft is missing or invalid');
  }
  const base = selectedCatalogEntry(catalog.AIRCRAFTS, id, 'SNAPSHOT_CATALOG_INVALID');
  if (!int(base.baseHp, 1, 10000000) || !int(base.baseAtk, 0, 1000000)
    || !int(base.baseArmor, 0, 1000) || !finite(base.speed, 0.1, 100)
    || !finite(base.hitboxScale, 0.1, 10)
    || (base.passive !== null && base.passive !== undefined
      && (typeof base.passive !== 'string' || !/^[a-z][a-z0-9_]{0,50}$/.test(base.passive)))
    || (base.passiveValue !== undefined && !finite(base.passiveValue, 0, 1000000))) {
    deny('SNAPSHOT_CATALOG_INVALID', 'Invalid approved aircraft descriptor');
  }
  return {id, level:owned.level, stars:owned.stars, baseHp:base.baseHp,
    baseAtk:base.baseAtk, baseArmor:base.baseArmor, speed:base.speed,
    hitboxScale:base.hitboxScale, passive:base.passive ?? null,
    passiveValue:base.passiveValue ?? null};
}
function selectedGear(profile, catalog, slot) {
  const instanceId = profile.loadout[slot];
  if (instanceId === '') return null;
  const item = ownEntry(profile.items, instanceId);
  if (!item || item.type !== slot || !boundedId(item.baseId)
    || (item.uuid !== undefined && item.uuid !== instanceId)
    || !int(item.level, 1, 1000) || !int(item.rarity, 1, 5)) {
    deny('SNAPSHOT_NOT_OWNED', `Selected ${slot} item is missing, invalid or mismatched`);
  }
  const base = selectedCatalogEntry(catalog.GEAR_CATALOG?.[slot], item.baseId,
    'SNAPSHOT_CATALOG_INVALID');
  const atk = base.baseAtk ?? null, hp = base.baseHp ?? null;
  const fireRate = base.fireRate ?? null;
  const firePattern = base.firePattern ?? null, behavior = base.behavior ?? null;
  const projectileType = base.projectileType ?? null, passive = base.passive ?? null;
  if ((slot === 'armor' ? !finite(hp, 0, 10000000) : !finite(atk, 0, 1000000))
    || (slot !== 'armor' && !finite(fireRate, slot === 'drone' ? 0 : 0.001, 60000))
    || [firePattern, behavior, projectileType, passive].some(value => value !== null
      && (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,50}$/.test(value)))) {
    deny('SNAPSHOT_CATALOG_INVALID', 'Invalid approved gear descriptor');
  }
  return {instanceId, baseId:item.baseId, slot, level:item.level, rarity:item.rarity,
    baseAtk:atk, baseHp:hp, fireRate, fireRateUnit:slot === 'mainGun' ? 'seconds'
      : slot === 'armor' ? null : 'milliseconds',
    firePattern, behavior, projectileType, passive};
}

/** No client authored payload can be used in place of these trusted inputs. */
function createServerBattleSnapshot(args) {
  if (!exact(args, INPUT_KEYS)) {
    deny('SNAPSHOT_INPUT_INVALID', 'Unexpected input fields to trusted server snapshot builder');
  }
  const {identity, persistedProfile, approvedCatalog, rules, arena, seed} = args;
  checkIdentity(identity);
  checkRules(rules, arena, seed);
  if (!plain(persistedProfile) || !plain(persistedProfile.campaignData)
    || !plain(persistedProfile.campaignData.loadout)
    || !plain(approvedCatalog) || !plain(approvedCatalog.GEAR_CATALOG)) {
    deny('SNAPSHOT_PROFILE_INVALID', 'Invalid persisted profile or server catalog');
  }
  const profile = persistedProfile.campaignData;
  if (!EQUIPMENT_SLOTS.every(slot => Object.hasOwn(profile.loadout, slot)
    && (profile.loadout[slot] === '' || boundedId(profile.loadout[slot])))
    || !profile.loadout.pilot || !profile.loadout.aircraft || !profile.loadout.mainGun) {
    deny('SNAPSHOT_LOADOUT_INVALID', 'Missing or invalid persisted equipment slot');
  }
  const equipment = {
    pilot:selectedPilot(profile, approvedCatalog),
    aircraft:selectedAircraft(profile, approvedCatalog),
  };
  for (const slot of GEAR_SLOTS) equipment[slot] = selectedGear(profile, approvedCatalog, slot);
  const catalogFields = {
    pilot:{id:equipment.pilot.id, rarity:equipment.pilot.rarity,
      passive:equipment.pilot.passive, value:equipment.pilot.value},
    aircraft:Object.fromEntries(Object.entries(equipment.aircraft)
      .filter(([key]) => !['level','stars'].includes(key))),
    gear:Object.fromEntries(GEAR_SLOTS.map(slot => [slot, equipment[slot] === null ? null
      : Object.fromEntries(Object.entries(equipment[slot])
        .filter(([key]) => !['instanceId','level','rarity'].includes(key)))])),
  };
  const selectedCatalogHash = digest(['sf-v8b2c1-selected-catalog', catalogFields]);
  const loadoutHash = digest(['sf-v8b2c1-loadout', equipment]);
  const context = {...identity, ...rules, protocolVersion:PROTOCOL_VERSION, coreVersion:CORE_VERSION};
  const baseSnapshot = {snapshotVersion:SNAPSHOT_VERSION, context, seed, arena:{...arena},
    equipment, selectedCatalogHash, loadoutHash};
  return freeze({...baseSnapshot, snapshotHash:digest(['sf-v8b2c1-snapshot', baseSnapshot])});
}

module.exports = Object.freeze({
  SNAPSHOT_VERSION, EQUIPMENT_SLOTS, GEAR_SLOTS, BattleSnapshotError,
  createServerBattleSnapshot,
});
