'use strict';
/**
 * FASTLANE C6-C: pinned, server-authored *offline QA* policy for the FIRST
 * Campaign Alpha stage only. This is NOT an HTTP admission authority:
 * `snapshot` must have been built from authenticated, persisted server state.
 * No client-supplied waves, enemies, spawn rolls, boss, reward or outcome.
 *
 * Catalog oracle: client/src/game/catalog/worlds.js (planet 1, stage 1).
 * In the live CampaignScene, spawn time depends on Date.now() and frame rate,
 * spawnX depends on the moving player's x, and shooter AI has sine/patrol.
 * This deterministic 30Hz approximation needs native golden/UX signoff.
 * It is deliberately NOT safe for cloud reward settlement.
 */
const {SNAPSHOT_VERSION}=require('./battleSnapshotV8.cjs');
const ENCOUNTER_C6C_VERSION='pve-server-encounter-qa-v6';
const ALPHA_POLICY_VERSION='v8c6c-alpha-stage1-pinned-qa-v1';
const LOCATION_ID='alpha_stage_1';
const RULES_VERSION='combat-v1.0.0';
const CATALOG_VERSION='product-v1.0.0';
const WAVE_COUNT=5;
const BASE_ENEMIES=5;
const TIME_LIMIT_SECONDS=90;
const FIRST_WAVE_AT_TICK=31; // 1000ms initial client scene transition, ceil on 30Hz
const INTER_WAVE_DELAY_TICKS=60; // 2000ms after fully cleared wave
const ARENA_HALF_WIDTH_UNITS=13200;
const ARENA_HALF_HEIGHT_UNITS=15000;
const ENEMY_SPAWN_Z_UNITS=-18000; // -ZOOM-3 from CampaignScene
class CampaignAlphaC6CError extends Error {
  constructor(code,message){super(message);this.name='CampaignAlphaC6CError';this.code=code;}
}
function deny(code,message){throw new CampaignAlphaC6CError(code,message);}
const plain=o=>o!==null && typeof o==='object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o)===Object.prototype || Object.getPrototypeOf(o)===null)
  && Object.values(Object.getOwnPropertyDescriptors(o)).every(desc=>Object.hasOwn(desc,'value'));
function deepFreeze(o){if(o&&typeof o==='object'){for(const v of Object.values(o))deepFreeze(v);Object.freeze(o);}return o;}
function nextRandom(state){
  // Xorshift32 with uint32 arithmetic; fixed call order constitutes the QA policy.
  let n=state>>>0;
  n^=n<<13;n^=n>>>17;n^=n<<5;
  return n>>>0;
}
const fraction=n=>n/4294967296;
/** A pure resolver. No options for client-defined wave manifests exist. */
function resolveCampaignAlphaStage1C6C(args){
  if(!plain(args)||Object.keys(args).length!==1||!Object.hasOwn(args,'snapshot'))
    deny('ALPHA_C6C_INPUT','The QA resolver accepts only a trusted snapshot');
  const {snapshot}=args;
  const context=snapshot?.context,arena=snapshot?.arena;
  if(!plain(snapshot)||snapshot.snapshotVersion!==SNAPSHOT_VERSION
    || !Object.isFrozen(snapshot) || !Object.isFrozen(context)
    || !Object.isFrozen(arena)
    || context.mode!=='campaign'||context.locationId!==LOCATION_ID
    || context.rulesVersion!==RULES_VERSION||context.catalogVersion!==CATALOG_VERSION
    || !Number.isSafeInteger(snapshot.seed)||snapshot.seed<1||snapshot.seed>0xffffffff
    || typeof snapshot.snapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.snapshotHash)
    || !plain(arena)||arena.halfWidthUnits!==ARENA_HALF_WIDTH_UNITS
    || arena.halfHeightUnits!==ARENA_HALF_HEIGHT_UNITS
    || arena.spawnXUnits!==0||arena.spawnZUnits!==12500) {
    deny('ALPHA_C6C_UNSUPPORTED','Only pinned Alpha stage 1 QA snapshot and arena are supported');
  }
  // Narrow C6-C to a single evidenced equipment combination. Other legal
  // player inventories, weapon patterns and auxiliary effects remain CLOSED.
  const gear=snapshot.equipment;
  if(!plain(gear)||gear.pilot?.id!=='pilot_alpha'||gear.pilot?.level!==1
    || gear.aircraft?.id!=='ship_xwing'||gear.aircraft?.level!==1
    || gear.mainGun?.baseId!=='gun_rail'||gear.mainGun?.level!==1
    || gear.wingman!==null||gear.armor!==null||gear.drone!==null){
    deny('ALPHA_C6C_LOADOUT_UNSUPPORTED','Stage-1 QA policy is pinned to the Alpha/X-Wing/Rail level-1 loadout');
  }
  let randomState=snapshot.seed>>>0;
  function roll(){randomState=nextRandom(randomState);return fraction(randomState);}
  const waves=[];
  for(let wave=1;wave<=WAVE_COUNT;wave++){
    const count=BASE_ENEMIES+wave*3;
    const spawnIntervalMs=Math.max(300,1500-(1*100+wave*50));
    const spawnIntervalTicks=Math.ceil(spawnIntervalMs*30/1000);
    const firstSpawnDelayTicks=Math.ceil((500+spawnIntervalMs)*30/1000);
    const enemies=[];
    for(let ordinal=1;ordinal<=count;ordinal++){
      // Client tier selection is ALWAYS tier 1 for stage 1. Three other tier
      // branches only begin at stage 2/4/6 in CampaignScene#spawnEnemy.
      // Match the *call order* of CampaignScene#spawnEnemy, even though the
      // seeded PRNG differs from JavaScript Math.random used by Guest.
      const tierRoll=roll(); // tier is ALWAYS 1 at stage 1
      const offsetX=Math.round((roll()-.5)*(ARENA_HALF_WIDTH_UNITS-1800)*1.6);
      const speedRaw=50+roll()*(150-50);
      const velocity=Math.round(speedRaw/1200*2000);
      const lateral=roll(),sine=roll();
      const shoot=roll()>.5;
      void tierRoll;void lateral;void sine;
      enemies.push({
        id:`alpha1_w${wave}_e${ordinal}`,kind:'grunt',
        behavior:'chase', // conservative C6-C approximation for shooter patrol
        // For v6 ONLY, xUnits is a player-relative spawn offset. The engine
        // anchors it to player x when each enemy is actually materialised.
        xUnits:offsetX,zUnits:ENEMY_SPAWN_Z_UNITS,
        hp:30+1*15+wave*5,hitRadiusUnits:1300,
        moveUnitsPerTick:velocity,contactDamage:200,
        shootEveryTicks:shoot?66:0,
        shotSpeedUnitsPerTick:shoot?480:0,
        shotDamage:shoot?200:0,
        shotPattern:shoot?'aimed':'none',
      });
    }
    waves.push({
      // Later waves are actually *gated by completed spawns and living enemies*.
      // atTick is a strict earliest lower-bound, NOT a predetermined spawn time.
      atTick:FIRST_WAVE_AT_TICK+(wave-1),firstSpawnDelayTicks,
      spawnIntervalTicks,enemies,
    });
  }
  return deepFreeze({
    version:ENCOUNTER_C6C_VERSION,qaOnly:true,snapshotHash:snapshot.snapshotHash,
    mode:'campaign',locationId:LOCATION_ID,waves,
    damageCooldownTicks:45,enemyProjectileRadiusUnits:200,
    campaignPolicyVersion:ALPHA_POLICY_VERSION,stageId:1,
    interWaveDelayTicks:INTER_WAVE_DELAY_TICKS,
  });
}
module.exports=Object.freeze({
  ENCOUNTER_C6C_VERSION,ALPHA_POLICY_VERSION,LOCATION_ID,RULES_VERSION,CATALOG_VERSION,
  WAVE_COUNT,BASE_ENEMIES,TIME_LIMIT_SECONDS,FIRST_WAVE_AT_TICK,INTER_WAVE_DELAY_TICKS,
  ARENA_HALF_WIDTH_UNITS,ARENA_HALF_HEIGHT_UNITS,CampaignAlphaC6CError,
  resolveCampaignAlphaStage1C6C,
});
