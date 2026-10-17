/**
 * Product catalog: catalog/profileDefaults.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
// ==========================================
// --- DỮ LIỆU TÂN THỦ MẶC ĐỊNH (NEW PLAYER TEMPLATE) ---
// ==========================================
export const DEFAULT_CAMPAIGN_DATA = {
  progress: { currentStage: 1, highestStage: 1, combatPower: 1200,exp: 0 },
  loadout: { pilot: "pilot_alpha", aircraft: "ship_xwing", mainGun: "item_start_gun", wingman: "", armor: "", drone: "" },
  ownedPilots: { "pilot_alpha": { level: 1, stars: 1 } },
  ownedAircrafts: { "ship_xwing": { level: 1, stars: 1 } },
  items: { "item_start_gun": { baseId: "gun_laser", rarity: 1, level: 1, type: "mainGun" } },
  materials: { gears: 0, blueprints: 0 },
  hasClaimedFirstTopup: false,
  eventData: {},
};
