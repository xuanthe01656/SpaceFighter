import { DEFAULT_CAMPAIGN_DATA } from '../constants.js';

// Phase 0: one schema used by initial account creation, normal saves and recovery.
// This is a compatibility/data-integrity fix, NOT a server-authoritative economy.
export const PROFILE_SCHEMA_VERSION = 2;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const objectOr = (value, fallback = {}) => isRecord(value) ? value : fallback;
const copy = (value) => JSON.parse(JSON.stringify(value));
const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value, fallback) => typeof value === 'string' ? value : fallback;

export function createDefaultCampaignData() {
  return copy(DEFAULT_CAMPAIGN_DATA);
}

export function createProfileDocument(gameState, user, now = Date.now()) {
  const c = objectOr(gameState.campaignData, createDefaultCampaignData());
  const materials = objectOr(c.materials);
  return copy({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profile: {
      displayName: text(user.displayName, text(gameState.myName, 'Player')),
      photoURL: text(user.photoURL, ''),
      isOnline: true,
      last_update_ms: now
    },
    wallet: {
      coins: finite(gameState.coins, 0),
      diamonds: finite(gameState.diamonds, 0),
      energy: finite(gameState.energy, 50),
      gears: finite(materials.gears, 0),
      blueprints: finite(materials.blueprints, 0),
      vipPoints: finite(gameState.vipPoints, 0)
    },
    ads_tracking: {
      lastCoinDate: text(gameState.lastCoinDate, ''),
      hourlyCoinCount: finite(gameState.hourlyCoinCount, 0),
      lastCoinHour: text(gameState.lastCoinHour, '')
    },
    progress: {
      ...createDefaultCampaignData().progress,
      ...objectOr(c.progress),
      hasClaimedFirstTopup: Boolean(c.hasClaimedFirstTopup)
    },
    missions: objectOr(c.missionData, { claimed: [], progress: {} }),
    attendance: objectOr(c.attendance, { streak: 0, lastDate: '', claimedDays: [] }),
    loadout: objectOr(c.loadout, DEFAULT_CAMPAIGN_DATA.loadout),
    inventory: {
      items: objectOr(c.items, DEFAULT_CAMPAIGN_DATA.items),
      aircrafts: objectOr(c.ownedAircrafts, DEFAULT_CAMPAIGN_DATA.ownedAircrafts),
      pilots: objectOr(c.ownedPilots, DEFAULT_CAMPAIGN_DATA.ownedPilots)
    },
    // These fields were silently discarded in the original Firestore serializer.
    materials: { ...materials, crates: objectOr(materials.crates) },
    eventData: objectOr(c.eventData),
    dungeonHistory: objectOr(c.dungeonHistory)
  });
}

export function restoreProfileDocument(data) {
  const source = objectOr(data);
  const legacy = objectOr(source.campaignData);
  const wallet = objectOr(source.wallet);
  const inventory = objectOr(source.inventory);
  const defaults = createDefaultCampaignData();
  const existingMaterials = objectOr(source.materials, objectOr(legacy.materials));
  const materials = {
    ...objectOr(legacy.materials),
    ...existingMaterials,
    gears: finite(wallet.gears, finite(existingMaterials.gears, finite(legacy.materials?.gears, 0))),
    blueprints: finite(wallet.blueprints, finite(existingMaterials.blueprints, finite(legacy.materials?.blueprints, 0)))
  };
  if (!isRecord(materials.crates)) materials.crates = {};
  const savedProgress = objectOr(source.progress, objectOr(legacy.progress));

  const campaignData = {
    ...defaults,
    ...copy(legacy),
    progress: { ...defaults.progress, ...copy(savedProgress) },
    hasClaimedFirstTopup: Boolean(savedProgress.hasClaimedFirstTopup ?? legacy.hasClaimedFirstTopup),
    loadout: { ...defaults.loadout, ...copy(objectOr(source.loadout, objectOr(legacy.loadout))) },
    materials: copy(materials),
    items: copy(objectOr(inventory.items, objectOr(legacy.items, defaults.items))),
    ownedAircrafts: copy(objectOr(inventory.aircrafts, objectOr(legacy.ownedAircrafts, defaults.ownedAircrafts))),
    ownedPilots: copy(objectOr(inventory.pilots, objectOr(legacy.ownedPilots, defaults.ownedPilots))),
    missionData: copy(objectOr(source.missions, objectOr(legacy.missionData, { claimed: [], progress: {} }))),
    attendance: copy(objectOr(source.attendance, objectOr(legacy.attendance, { streak: 0, lastDate: '', claimedDays: [] }))),
    eventData: copy(objectOr(source.eventData, objectOr(legacy.eventData))),
    dungeonHistory: copy(objectOr(source.dungeonHistory, objectOr(legacy.dungeonHistory)))
  };

  return {
    coins: finite(wallet.coins, finite(source.coins, 0)),
    diamonds: finite(wallet.diamonds, finite(source.diamonds, 0)),
    energy: finite(wallet.energy, finite(source.energy, 50)),
    vipPoints: finite(wallet.vipPoints, finite(source.vipPoints, 0)),
    campaignData
  };
}

// Firestore mergeFields is intentionally top-level here: replace complete inventory maps
// so SOLD items actually disappear, while leaving unknown legacy document keys intact.
export function profileMergeFields(document) {
  const leafKeys = ['profile', 'wallet', 'ads_tracking'];
  return [
    ...leafKeys.flatMap(group => Object.keys(document[group]).map(key => `${group}.${key}`)),
    ...Object.keys(document).filter(key => !leafKeys.includes(key))
  ];
}

export function parseGuestCampaign(saved) {
  if (isRecord(saved)) return saved;
  if (typeof saved !== 'string') return null;
  try {
    const parsed = JSON.parse(saved);
    return isRecord(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}
