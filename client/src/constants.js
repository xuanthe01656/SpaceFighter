/**
 * Public catalog API (compatibility facade, Product Config v1).
 * Do not import this facade inside leaf config modules to avoid circular imports.
 * Profile IDs and persistent schema stay unchanged for Guest and Cloud.
 */
export { PILOTS } from './game/catalog/pilots.js';
export { AIRCRAFTS } from './game/catalog/aircraft.js';
export { GEAR_CATALOG } from './game/catalog/gear.js';
export { AIRCRAFT_PRICE, PILOT_PRICE, GEAR_PRICE, CRATE_CONFIGS, FIRST_TOPUP_REWARD, TOPUP_PACKAGES } from './game/catalog/economy.js';
export { PLANET_CONFIG, STAGE_CONFIG, PLANET_STAGE_NAMES, PLANET_ENEMIES, PLANET_BOSSES, DUNGEON_CONFIG } from './game/catalog/worlds.js';
export { DEFAULT_CAMPAIGN_DATA } from './game/catalog/profileDefaults.js';
export { calculatePlayerLevel, calculateVIPLevel } from './game/catalog/progression.js';
export { MISSIONS_CONFIG } from './game/catalog/missions.js';
export { EVENT_CONFIG, getActiveEvents, getEventById } from './game/catalog/events.js';
export { PIPE_DIST_DESKTOP, PIPE_DIST_MOBILE, MAX_Y_DIFF } from './game/catalog/uiLegacy.js';
