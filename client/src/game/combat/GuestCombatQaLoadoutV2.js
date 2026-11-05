import { ARMOR_TRAITS_V2, SHIP_ACTIVE_SKILLS_V2 } from './GuestAbilityCatalogV2.js';

export const GUEST_COMBAT_QA_SHIP_IDS = Object.freeze(Object.keys(SHIP_ACTIVE_SKILLS_V2));
export const GUEST_COMBAT_QA_ARMOR_IDS = Object.freeze(Object.keys(ARMOR_TRAITS_V2));

const parseSearch = search => new URLSearchParams(String(search || '').replace(/^\?/, ''));
const validOrFirst = (value, list) => list.includes(value) ? value : list[0];

export function resolveGuestCombatQaLoadoutV2(search = '') {
  const params = parseSearch(search);
  return Object.freeze({
    shipId: validOrFirst(params.get('sfGuestShip'), GUEST_COMBAT_QA_SHIP_IDS),
    armorId: validOrFirst(params.get('sfGuestArmor'), GUEST_COMBAT_QA_ARMOR_IDS),
  });
}

export function cycleGuestCombatQaLoadoutV2(search = '', kind = 'ship') {
  const params = parseSearch(search);
  const current = resolveGuestCombatQaLoadoutV2(search);
  const isArmor = kind === 'armor';
  const list = isArmor ? GUEST_COMBAT_QA_ARMOR_IDS : GUEST_COMBAT_QA_SHIP_IDS;
  const key = isArmor ? 'sfGuestArmor' : 'sfGuestShip';
  const value = isArmor ? current.armorId : current.shipId;
  const index = Math.max(0, list.indexOf(value));
  const next = list[(index + 1) % list.length];
  params.set(key, next);
  return Object.freeze({
    kind: isArmor ? 'armor' : 'ship',
    value: next,
    search: `?${params.toString()}`,
  });
}
