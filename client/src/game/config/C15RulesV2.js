/**
 * SpaceFighter C15-RC1 rules/constants foundation.
 *
 * This is a strict data-driven contract, not an authority to issue rewards.
 * New ships/weapons may reuse registered stats/effects/patterns without changing
 * the deterministic kernel. Unknown mechanics must fail closed until a reviewed
 * handler exists on both client and server.
 */
export const C15_RULES_VERSION = 'c15-rules-v2.0.0';
export const C15_CATALOG_VERSION = 'product-v1.0.0';
export const C15_DESCRIPTOR_VERSION = 'c15-combat-descriptor-v1';
export const C15_RC1_LOADOUT_ID = 'alpha-xwing-rail-l1';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const int = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const C15_STAT_SCHEMA = freeze({
  maxHp: {type:'integer', min:1, max:1_000_000_000, default:1000},
  attack: {type:'integer', min:0, max:1_000_000_000, default:0},
  armor: {type:'integer', min:0, max:90, default:0},
  moveSpeed: {type:'number', min:0.5, max:30, default:6},
  movePerTickUnits: {type:'integer', min:1, max:3000, default:600},
  fireIntervalMs: {type:'number', min:50, max:60_000, default:400},
  projectileDamage: {type:'integer', min:0, max:1_000_000, default:0},
  projectileSpeedUnitsPerTick: {type:'integer', min:1, max:10_000, default:1700},
  projectileHitRadiusUnits: {type:'integer', min:10, max:1500, default:200},
  pilotHitRadiusUnits: {type:'integer', min:100, max:2500, default:700},
  dodgeRate: {type:'number', min:0, max:0.9, default:0},
  damageReduction: {type:'number', min:0, max:0.9, default:0},
  hpRegenRate: {type:'number', min:0, max:0.15, default:0},
  critDamageBoost: {type:'number', min:0, max:10, default:0},
});

export const C15_EFFECT_REGISTRY = freeze({
  main_damage_boost: {
    handler:'stat-multiplier', stat:'attack', valueType:'number', min:0, max:9,
    commercialRc1:true,
  },
  movement_speed: {
    handler:'stat-multiplier', stat:'moveSpeed', valueType:'number', min:-0.9, max:2,
    commercialRc1:false,
  },
  hp_regen: {
    handler:'regen-rate', stat:'hpRegenRate', valueType:'number', min:0, max:0.15,
    commercialRc1:false,
  },
  damage_reduction: {
    handler:'damage-reduction', stat:'damageReduction', valueType:'number', min:0, max:0.9,
    commercialRc1:false,
  },
  dodge_and_crit: {
    handler:'dodge-and-crit', valueType:'object', commercialRc1:false,
  },
});

export const C15_WEAPON_PATTERN_REGISTRY = freeze({
  'beam:laser': {
    handler:'single-projectile', pattern:'beam', projectileType:'laser',
    count:1, spreadMilliDeg:0, penetration:1, burstCount:1, burstIntervalTicks:0,
    speedUnitsPerTick:2300, damagePermille:1000, commercialRc1:false,
  },
  'single:plasma': {
    handler:'single-projectile', pattern:'single', projectileType:'plasma',
    count:1, spreadMilliDeg:0, penetration:1, burstCount:1, burstIntervalTicks:0,
    speedUnitsPerTick:1260, damagePermille:1000, commercialRc1:false,
  },
  'spread3:laser': {
    handler:'spread', pattern:'spread3', projectileType:'laser',
    count:3, spreadMilliDeg:12_000, penetration:1, burstCount:1, burstIntervalTicks:0,
    speedUnitsPerTick:1700, damagePermille:880, commercialRc1:false,
  },
  'spread5:photon': {
    handler:'spread', pattern:'spread5', projectileType:'photon',
    count:5, spreadMilliDeg:18_000, penetration:1, burstCount:1, burstIntervalTicks:0,
    speedUnitsPerTick:1700, damagePermille:700, commercialRc1:false,
  },
  'shotgun:plasma': {
    handler:'spread', pattern:'shotgun', projectileType:'plasma',
    count:7, spreadMilliDeg:28_000, penetration:1, burstCount:1, burstIntervalTicks:0,
    speedUnitsPerTick:1720, damagePermille:600, commercialRc1:false,
  },
  'pierce:rail': {
    handler:'pierce', pattern:'pierce', projectileType:'rail',
    count:1, spreadMilliDeg:0, penetration:3, burstCount:1, burstIntervalTicks:0,
    speedUnitsPerTick:2700, damagePermille:1000, commercialRc1:true,
  },
  'burst:pulse': {
    handler:'burst', pattern:'burst', projectileType:'pulse',
    count:1, spreadMilliDeg:0, penetration:1, burstCount:3, burstIntervalTicks:3,
    speedUnitsPerTick:1900, damagePermille:520, commercialRc1:false,
  },
});

export const C15_RULES_DOCUMENT = freeze({
  version:C15_RULES_VERSION,
  catalogVersion:C15_CATALOG_VERSION,
  descriptorVersion:C15_DESCRIPTOR_VERSION,
  tickHz:30,
  unitsPerWorld:1000,
  maxBattleTicks:4500,
  maxJournalChunks:256,
  firstUploadFrames:15,
  steadyUploadFrames:30,
  statSchema:C15_STAT_SCHEMA,
  effectRegistry:C15_EFFECT_REGISTRY,
  weaponPatternRegistry:C15_WEAPON_PATTERN_REGISTRY,
});

export function canonicalizeC15(value) {
  if (Array.isArray(value)) return value.map(canonicalizeC15);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalizeC15(value[key]);
    return out;
  }
  return value;
}

export function c15CanonicalJson(value) {
  return JSON.stringify(canonicalizeC15(value));
}

function dynamicStat(base, level, rarity, isHp=false) {
  if (!finite(base) || base < 0 || !int(level,1,1000) || !int(rarity,1,5)) {
    throw new TypeError('C15 invalid dynamic stat input');
  }
  if (base === 0) return 0;
  const perLevel = Math.max(isHp ? 5 : 1,
    Math.round(base * 0.1 + rarity * (isHp ? 10 : 2)));
  return base + perLevel * (level - 1);
}

function assertPassive(pilot, strictRc1) {
  if (pilot.passive === null) return {attackMultiplier:1, speedMultiplier:1,
    hpRegenRate:0, damageReduction:0, dodgeRate:0, critDamageBoost:0, effects:[]};
  const effect = C15_EFFECT_REGISTRY[pilot.passive];
  if (!effect) throw new TypeError(`C15 unsupported pilot effect: ${pilot.passive}`);
  if (strictRc1 && effect.commercialRc1 !== true) {
    throw new TypeError(`C15 effect not RC1 verified: ${pilot.passive}`);
  }
  const result={attackMultiplier:1,speedMultiplier:1,hpRegenRate:0,
    damageReduction:0,dodgeRate:0,critDamageBoost:0,effects:[]};
  if (pilot.passive === 'dodge_and_crit') {
    if (!record(pilot.value) || !finite(pilot.value.dodge) || !finite(pilot.value.critDamage)) {
      throw new TypeError('C15 invalid dodge_and_crit value');
    }
    result.dodgeRate=clamp(pilot.value.dodge,0,0.9);
    result.critDamageBoost=clamp(pilot.value.critDamage,0,10);
    result.effects.push({type:pilot.passive,dodgeRate:result.dodgeRate,
      critDamageBoost:result.critDamageBoost});
    return result;
  }
  if (!finite(pilot.value) || pilot.value < effect.min || pilot.value > effect.max) {
    throw new TypeError(`C15 invalid effect value: ${pilot.passive}`);
  }
  if (pilot.passive === 'main_damage_boost') result.attackMultiplier=1+pilot.value;
  else if (pilot.passive === 'movement_speed') result.speedMultiplier=1+pilot.value;
  else if (pilot.passive === 'hp_regen') result.hpRegenRate=pilot.value;
  else if (pilot.passive === 'damage_reduction') result.damageReduction=pilot.value;
  result.effects.push({type:pilot.passive,value:pilot.value});
  return result;
}

/**
 * Normalize a trusted V8 snapshot equipment object into one versioned,
 * data-driven descriptor consumed by local presentation and server replay.
 */
export function normalizeC15CombatDescriptor(equipment,{strictRc1=true}={}) {
  if (!exact(equipment,['pilot','aircraft','mainGun','wingman','armor','drone'])) {
    throw new TypeError('C15 equipment shape invalid');
  }
  const {pilot,aircraft,mainGun,wingman,armor,drone}=equipment;
  if (!record(pilot)||!record(aircraft)||!record(mainGun)
    || !int(pilot.level,1,1000)||!int(pilot.stars,1,5)||!int(pilot.rarity,1,5)
    || !int(aircraft.level,1,1000)||!int(aircraft.stars,1,5)
    || !int(aircraft.baseHp,1,10_000_000)||!int(aircraft.baseAtk,0,1_000_000)
    || !int(aircraft.baseArmor,0,1000)||!finite(aircraft.speed)
    || !int(mainGun.level,1,1000)||!int(mainGun.rarity,1,5)
    || !finite(mainGun.baseAtk)||!finite(mainGun.fireRate)
    || mainGun.fireRateUnit!=='seconds') {
    throw new TypeError('C15 trusted equipment values invalid');
  }
  if (strictRc1 && (pilot.id!=='pilot_alpha'||aircraft.id!=='ship_xwing'
    ||mainGun.baseId!=='gun_rail'||pilot.level!==1||aircraft.level!==1
    ||mainGun.level!==1||wingman!==null||armor!==null||drone!==null)) {
    throw new TypeError('C15 RC1 is pinned to Alpha/X-Wing/Rail level-1 without accessories');
  }
  const patternKey=`${mainGun.firePattern}:${mainGun.projectileType}`;
  const weaponPattern=C15_WEAPON_PATTERN_REGISTRY[patternKey];
  if (!weaponPattern) throw new TypeError(`C15 unsupported weapon pattern: ${patternKey}`);
  if (strictRc1 && weaponPattern.commercialRc1!==true) {
    throw new TypeError(`C15 weapon pattern not RC1 verified: ${patternKey}`);
  }
  const passive=assertPassive(pilot,strictRc1);
  if (strictRc1 && (aircraft.passive!==null||aircraft.passiveValue!==null
    ||mainGun.passive!==null)) {
    throw new TypeError('C15 RC1 does not model aircraft/gun passive effects');
  }
  const aircraftHp=Math.floor(aircraft.baseHp*(1+(aircraft.level-1)*0.05));
  const aircraftAtk=Math.floor(aircraft.baseAtk*(1+(aircraft.level-1)*0.05));
  const armorStat=Math.floor(aircraft.baseArmor*(1+(aircraft.level-1)*0.05));
  if (armorStat>C15_STAT_SCHEMA.armor.max) throw new TypeError('C15 armor exceeds verified bound');
  const gunAtk=dynamicStat(mainGun.baseAtk,mainGun.level,mainGun.rarity,false);
  const attack=Math.floor((aircraftAtk+gunAtk)*passive.attackMultiplier);
  const moveSpeed=aircraft.speed*passive.speedMultiplier;
  const movePerTickUnits=Math.round(0.3*1000*2*clamp(moveSpeed/6,0.15,3));
  const fireIntervalMs=Math.max(50,mainGun.fireRate*1000*Math.pow(0.985,mainGun.level-1));
  const projectileDamage=Math.floor(attack*weaponPattern.damagePermille/1000);
  const descriptor={
    version:C15_DESCRIPTOR_VERSION,
    rulesVersion:C15_RULES_VERSION,
    catalogVersion:C15_CATALOG_VERSION,
    commercialRc1:strictRc1===true,
    loadoutId:strictRc1?C15_RC1_LOADOUT_ID:'custom-supported-loadout',
    pilot:{id:pilot.id,level:pilot.level,stars:pilot.stars,effects:passive.effects},
    aircraft:{id:aircraft.id,level:aircraft.level,stars:aircraft.stars},
    mainGun:{id:mainGun.baseId,instanceId:mainGun.instanceId,level:mainGun.level,
      rarity:mainGun.rarity,patternKey,pattern:weaponPattern},
    auxiliary:{wingman:wingman?.baseId??null,armor:armor?.baseId??null,drone:drone?.baseId??null},
    stats:{maxHp:aircraftHp,attack,armor:armorStat,moveSpeed,movePerTickUnits,
      fireIntervalMs,projectileDamage,
      projectileSpeedUnitsPerTick:weaponPattern.speedUnitsPerTick,
      projectileHitRadiusUnits:200,pilotHitRadiusUnits:700,
      dodgeRate:passive.dodgeRate,damageReduction:passive.damageReduction,
      hpRegenRate:passive.hpRegenRate,critDamageBoost:passive.critDamageBoost},
  };
  return freeze(descriptor);
}

export function assertC15RulesDocument(document=C15_RULES_DOCUMENT) {
  if (!record(document)||document.version!==C15_RULES_VERSION
    ||document.catalogVersion!==C15_CATALOG_VERSION
    ||document.descriptorVersion!==C15_DESCRIPTOR_VERSION
    ||document.tickHz!==30||document.maxBattleTicks!==4500
    ||document.maxJournalChunks!==256||document.firstUploadFrames!==15
    ||document.steadyUploadFrames!==30) {
    throw new TypeError('C15 rules document invalid');
  }
  return true;
}
