import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import * as GUI    from '@babylonjs/gui';
import { measureBattleHud } from '../../game/ui/BattleHudLayout';
import {
  AIRCRAFTS, GEAR_CATALOG, PILOTS,
  PLANET_CONFIG, STAGE_CONFIG, PLANET_ENEMIES, PLANET_BOSSES, EVENT_CONFIG,
} from '../../constants';
import { deriveBattleLoadout, calculateProjectileDamage } from '../../utils/combatStats';
import { frameScale, scaledLerpFactor } from '../../utils/frameTime';
import { battleSpeedMultiplier, BATTLE_WORLD_HALF_HEIGHT } from '../../game/config/BattleRules';
import { createBattlePassiveState, receiveBattleHit, shouldEchoShot } from '../../game/combat/BattlePassives';
import { createActiveEffects } from '../../game/combat/ActiveEffects';
import { createPlayerShipVisual } from '../../game/rendering/ShipVisualFactory';
import { attachBattleEntityVisual } from '../../game/rendering/BattleEntityVisual';
import { createBattleDeathVisualQueue } from '../../game/rendering/BattleDeathVisualQueue';
import { resolveAssetVisual } from '../../game/assets/AssetRegistry.js';
import { createShipEngineFx } from '../../game/rendering/ShipEngineFx';
import { createShipInputController } from '../../game/combat/ShipInputController';
import { describeMainSalvo, describeWingSalvo, describeDroneSalvo, pickWeaponTarget, enemySpeedFactor, shieldDamageFactor, repairAmount, projectileHitsPoint } from '../../game/combat/PlayerWeapons';
import { createProjectileEmitter } from '../../game/combat/ProjectileEmitter';
import { createPlayerDamageGateV25, createPlayerDamageOutcomeV25 } from '../../game/combat/PlayerDamagePipelineV25.js';
import {
  createEnemyEntryReadabilityPolicyV26A2,
  createReadableFastEnemyProfileV26A2,
} from '../../game/combat/EnemyEntryReadabilityV26A2.js';
import {
  CAMPAIGN_RUNTIME_LIMITS_V26A3,
  createBossIntroPlanV26A3,
  createCampaignRuntimeSnapshotV26A3,
  createChargerMotionStateV26A3,
  stepChargerMotionV26A3,
} from '../../game/combat/CampaignRuntimeReliabilityV26A3.js';
import { resolveEnemyGameplayYawV26A4 } from '../../game/assets/EnemyVisualHeadingV26A4.js';
import { createEnemyDirectorV2 } from '../../game/combat/DeterministicEnemyDirectorV2.js';
import {
  completeBossPhaseGateV28,
  createBossPhaseStateV28,
  resolveBossDamageGateV28,
} from '../../game/combat/CampaignEncounterEscalationV28.js';
import {
  createBossPreviewLaneAttackPlanV282,
  lockBossPreviewLaneAttackPlanV282,
  projectilesFromBossPreviewLaneAttackPlanV282,
  trackBossPreviewLaneAttackPlanV282,
} from '../../game/combat/CampaignAttackTelegraphPlanV282.js';
import {
  createCampaignMiniBossAiStateV281,
  forceCampaignMiniBossRecoveryV281,
  getCampaignMiniBossAiProfileV281,
  stepCampaignMiniBossAiV281,
} from '../../game/combat/CampaignMiniBossAiV281.js';
import {
  createCampaignBossPreviewMotionStateV29,
  createCampaignEnemyChoreographyStateV29,
  createCampaignMiniBossMotionStateV29,
  resolveCampaignMiniBossAnchorV29,
  stepCampaignBossPreviewMotionV29,
  stepCampaignEnemyChoreographyV29,
  stepCampaignMiniBossMotionV29,
} from '../../game/combat/CampaignCombatChoreographyV29.js';
import {
  createCampaignBossCombatStateV29,
  projectilesFromCampaignBossAttackPlanV29,
  stepCampaignBossCombatV29,
} from '../../game/combat/CampaignBossCombatV29.js';
import {
  advanceCampaignEnemyProjectileV31,
  createCampaignEnemyShotPlanV31,
  resolveCampaignEnemyInterceptV31,
  resolveCampaignEnemyProjectileVisualV31,
} from '../../game/combat/CampaignEnemyProjectileV31.js';
import { createGuestAbilityRuntimeV2 } from '../../game/combat/GuestAbilityRuntimeV2.js';
import { deriveGuestAbilityActivationGateV2 } from '../../game/combat/GuestAbilityActivationGateV2.js';
import { resolveGuestCombatQaRuntimeFromViteEnv } from '../../game/combat/GuestCombatQaBuildGateV2.js';
import {
  createGuestCombatQaBattleDataV26A1,
  resolveGuestCombatQaLoadoutV2,
} from '../../game/combat/GuestCombatQaLoadoutV2.js';
import {
  createGuestBattleQaResultV26A,
  resolveGuestBattleQaSelectionV26A,
} from '../../game/combat/GuestBattleQaNavigationV26A.js';
import {
  createGuestAbilityActivationFeedbackV2,
  createGuestAbilityRejectedFeedbackV2,
  createGuestArmorProcFeedbackV2,
  getGuestAbilitySkillV2,
  localizeGuestFeedbackV2,
} from '../../game/combat/GuestAbilityFeedbackV2.js';
import {
  guestCounterMultiplierV2,
  GUN_DAMAGE_TYPES_V2,
  legacyTierDefenseClass,
} from '../../game/combat/GuestAbilityCatalogV2.js';
import { createGuestAbilityVisualFeedbackV2 } from '../../game/rendering/GuestAbilityVisualFeedbackV2.js';
import { canAutoLoadModel } from '../../game/config/PerformanceProfiles';
import { resolveBattleBackground, legacyBattleBackgroundRequested, previewBg4Variant } from '../../game/catalog/BackgroundCatalog';
import { createScrollingBattleBackground } from '../../game/rendering/ScrollingBackgroundRenderer';
import { attachBattleBackgroundProfiler } from '../../game/rendering/BattleBackgroundProfiler.js';
import { recordGuestBattle, recordGuestEventKill, activeCoinMultiplier } from '../../utils/guestProgress';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const stableSeed = (...parts) => {
  let hash = 2166136261;
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
};

/** Tạo StandardMaterial với màu phát sáng, không bị ảnh hưởng ánh sáng scene */
const makeMat = (scene, emissive) => {
  const m = new BABYLON.StandardMaterial(`cm_${Math.random()}`, scene);
  m.emissiveColor   = emissive;
  m.disableLighting = true;
  return m;
};

const makeTransparentMat = (scene, emissive, alpha = .24) => {
  const m = makeMat(scene, emissive);
  m.diffuseColor = emissive.scale(.25);
  m.alpha = clamp(alpha, .05, 1);
  m.backFaceCulling = false;
  return m;
};

/** Tạo vật liệu cho sprite tàu / quái – dùng PNG có alpha */
const makeSpriteMat = (scene, imgSrc, onSuccess, onError) => {
  const m   = new BABYLON.StandardMaterial(`sm_${Math.random()}`, scene);
  const tex = new BABYLON.Texture(
    imgSrc, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    () => { if (onSuccess) onSuccess(); },
    () => { if (onError)   onError();   },
  );
  tex.hasAlpha                = true;
  m.diffuseTexture            = tex;
  m.emissiveTexture           = tex;
  m.emissiveColor             = new BABYLON.Color3(0.12, 0.12, 0.12);
  m.disableLighting           = true;
  m.useAlphaFromDiffuseTexture = true;
  m.backFaceCulling           = false;
  return m;
};

const safeDispose    = (mesh) => { if (mesh && !mesh.isDisposed?.()) mesh.dispose(); };
const safeDisposeGui = (c)    => { if (c) { try { c.dispose(); } catch (_) {} } };
const hexToC3        = (hex)  => BABYLON.Color3.FromHexString(hex.startsWith('#') ? hex : `#${hex}`);

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * createCampaignScene(scene, canvas, engine, data)
 *
 * data: { gsRef, lang, onVictory, onDefeat, saveUserProfile }
 *   onVictory() → setScreen('stage_select')
 *   onDefeat()  → setScreen('hq')
 */
export const createCampaignScene = (scene, canvas, engine, data) => {

  const { gsRef, lang, onVictory, onDefeat, saveUserProfile, getRealTime, gameAction, isCloud } = data;
  const quality = data.qualityProfile || {starFraction:1, particleFraction:1, glow:true, maxModelBytes:8*1024*1024};

  // Dispose all pending scene-owned timeouts to prevent late spawns/rewards
  // or screen callbacks from a previous battle after React unmounts the scene.
  let battleSceneDisposed = false;
  const pendingTimers = new Set();
  const scheduleBattleTimer = (callback, delay) => {
    if (battleSceneDisposed) return null;
    const timer = globalThis.setTimeout(() => {
      pendingTimers.delete(timer);
      if (!battleSceneDisposed) callback();
    }, delay);
    pendingTimers.add(timer);
    return timer;
  };
  scene.onDisposeObservable.add(() => {
    battleSceneDisposed = true;
    pendingTimers.forEach(clearTimeout);
    pendingTimers.clear();
  });
  // Visual afterimages are independent of the gameOver/CLEAR battle loop.
  const deathVisuals = createBattleDeathVisualQueue(scene);
  const runtimeLimits = CAMPAIGN_RUNTIME_LIMITS_V26A3;
  const runtimeCapacityClamps = { enemies: 0, playerProjectiles: 0, enemyProjectiles: 0 };
  const bossIntroPlan = createBossIntroPlanV26A3();


  // ══════════════════════════════════════════════════════════════════════════
  // 1. TÍNH CHỈ SỐ RPG (KHỚP 100% VỚI PHASER VÀ DUNGEON)
  // ══════════════════════════════════════════════════════════════════════════

  const campaignData = gsRef.current.campaignData;
  const { items, loadout, progress } = campaignData;

  // One ruleset for HQ, Campaign and Dungeon: catalog fire rates are mixed
  // (main gun = seconds, wing/drone = milliseconds). See combatStats.js.
  const guestAbilityQa=Boolean(data.guestAbilitiesQa)&&resolveGuestCombatQaRuntimeFromViteEnv(import.meta.env,{
    authenticated:Boolean(isCloud),
    cloudBattle:Boolean(isCloud),
  });
  const requestedQa=guestAbilityQa
    ?new URLSearchParams(globalThis.location?.search||''):null;
  const qaBattleSelection=guestAbilityQa?resolveGuestBattleQaSelectionV26A(
    globalThis.location?.search||'',{
      fallbackPlanetId:Number(progress.currentPlanet)||1,
      fallbackStageId:Number(progress.selectedStage)
        ||(progress.planets?.[Number(progress.currentPlanet)||1]?.highestStage??1),
    }):null;
  const currentPlanetId = qaBattleSelection?.planetId ?? (Number(progress.currentPlanet) || 1);
  const planetConfig    = PLANET_CONFIG[currentPlanetId] || PLANET_CONFIG[1];
  const currentStage    = qaBattleSelection?.stageId ?? (Number(progress.selectedStage)
    || (progress.planets?.[currentPlanetId]?.highestStage ?? 1));
  const isReplay        = guestAbilityQa ? false
    : currentStage < (progress.planets?.[currentPlanetId]?.highestStage ?? 1);
  const stageConfig     = STAGE_CONFIG[currentStage] || STAGE_CONFIG[1];
  // V3 campaign combat is the production default. Guest QA still owns only
  // loadout/navigation/progress isolation; it no longer gates enemy AI itself.
  // Set VITE_SF_CAMPAIGN_COMBAT_V3=false only as an emergency rollback switch.
  const campaignCombatV3Enabled=import.meta.env.VITE_SF_CAMPAIGN_COMBAT_V3!=='false';
  const campaignWaveDirector=campaignCombatV3Enabled?createEnemyDirectorV2({
    seed:stableSeed('campaign-wave-v30',currentPlanetId,currentStage),
    stage:currentStage,
    planetId:currentPlanetId,
    difficulty:clamp(0.9+currentPlanetId*.1+currentStage*.015,1,1.35),
  }):null;
  const campaignStagePlan=campaignWaveDirector?.buildCampaignStagePlan({
    planetId:currentPlanetId,
    totalWaves:stageConfig.waves||5,
    hasBoss:Boolean(stageConfig.hasBoss),
    baseEnemies:stageConfig.baseEnemies||5,
  })||null;
  const qaLoadoutSelection=guestAbilityQa
    ?resolveGuestCombatQaLoadoutV2(globalThis.location?.search||''):null;
  const mobileQaLoadout=guestAbilityQa&&import.meta.env.VITE_SF_GUEST_COMBAT_V2_QA==='true'
    ?qaLoadoutSelection:null;
  const requestedShip=requestedQa?.get('sfGuestShip')||mobileQaLoadout?.shipId;
  const requestedArmor=requestedQa?.get('sfGuestArmor')||mobileQaLoadout?.armorId;
  const requestedEquipmentPreset=qaLoadoutSelection?.equipmentPresetId||'profile';
  const forceNextProjectileEvadeQa=requestedQa?.get('sfArmorQa')==='force-next-projectile';
  const previewShip=AIRCRAFTS.some(a=>a.id===requestedShip)?requestedShip:null;
  const previewArmor=GEAR_CATALOG.armor.some(a=>a.id===requestedArmor)?requestedArmor:null;
  const qaBattleData=guestAbilityQa
    ?createGuestCombatQaBattleDataV26A1(campaignData,{
      shipId:previewShip,
      armorId:previewArmor,
      equipmentPresetId:requestedEquipmentPreset,
      planetId:currentPlanetId,
      stageId:currentStage,
    })
    :campaignData;
  const combat = deriveBattleLoadout(qaBattleData, { PILOTS, AIRCRAFTS, GEAR_CATALOG },
    { mode: 'campaign', location: planetConfig,
      armorPassivePolicy:guestAbilityQa?'none':'legacy',
      combatRatingVersion:guestAbilityQa?'v2':'legacy' });
  const passives = createBattlePassiveState(combat.stats, Date.now());
  const activeEffects = createActiveEffects(combat.stats);
  const { stats, pilotBase, aircraftBase } = combat;
  const guestAbilities=guestAbilityQa?createGuestAbilityRuntimeV2({
    aircraftId:aircraftBase.id,armorId:combat.gear.armor.base?.id||null,maxHp:stats.maxHp,
    seed:stableSeed(currentPlanetId,currentStage,aircraftBase.id,combat.gear.armor.base?.id||'none'),
    mode:'pve',baseArmor:stats.armor,baseDamageReduction:stats.dmgReduce,
    pilotDodgePermille:Math.round((stats.dodgeRate||0)*1000),
    pilotNovaDamage:stats.novaExplosionDamage||0,
    qaForceNextProjectileEvade:forceNextProjectileEvadeQa,
  }):null;
  const qaEquipmentInfo=guestAbilityQa?Object.freeze({
    version:'guest-combat-qa-equipment-v2.6a1',
    presetId:qaLoadoutSelection?.equipmentPresetId||'profile',
    presetIndex:qaLoadoutSelection?.equipmentPresetIndex||1,
    presetTotal:qaLoadoutSelection?.equipmentPresetTotal||1,
    aircraftLevel:combat.aircraftLevel,
    mainGunId:combat.gear.mainGun.base?.id||null,
    mainGunLevel:combat.gear.mainGun.item?.level||0,
    wingmanId:combat.gear.wingman.base?.id||null,
    droneId:combat.gear.drone.base?.id||null,
    armorId:combat.gear.armor.base?.id||null,
    gearLevel:Math.max(
      combat.gear.mainGun.item?.level||0,
      combat.gear.wingman.item?.level||0,
      combat.gear.armor.item?.level||0,
      combat.gear.drone.item?.level||0,
    ),
    rarity:Math.max(
      combat.gear.mainGun.item?.rarity||0,
      combat.gear.wingman.item?.rarity||0,
      combat.gear.armor.item?.rarity||0,
      combat.gear.drone.item?.rarity||0,
    ),
    combatRating:combat.cp,
  }):null;

  const wingmanBase = combat.gear.wingman.base;
  const droneBase = combat.gear.drone.base;
  const wingmanArt = wingmanBase ? resolveAssetVisual('equipment', wingmanBase.id)?.topSrc : null;
  const droneArt = droneBase ? resolveAssetVisual('equipment', droneBase.id)?.topSrc : null;

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CAMERA ORTHOGRAPHIC TOP-DOWN
  // ══════════════════════════════════════════════════════════════════════════

  const ZOOM      = BATTLE_WORLD_HALF_HEIGHT;
  const getAspect = () => engine.getRenderWidth() / Math.max(engine.getRenderHeight(), 1);
  const boundX    = () => ZOOM * getAspect() - 1.8;

  const camera = new BABYLON.TargetCamera('cCam', new BABYLON.Vector3(0, 50, 0), scene);
  camera.setTarget(BABYLON.Vector3.Zero());
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

  const syncCamera = () => {
    const r = getAspect();
    camera.orthoTop    =  ZOOM; camera.orthoBottom = -ZOOM;
    camera.orthoLeft   = -ZOOM * r; camera.orthoRight  =  ZOOM * r;
  };
  syncCamera();
  engine.onResizeObservable.add(syncCamera);

  const ambient = new BABYLON.HemisphericLight('cAmb', new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity   = 1.0;
  ambient.diffuse     = new BABYLON.Color3(0.7, 0.8, 1.0);
  ambient.groundColor = new BABYLON.Color3(0.1, 0.1, 0.2);

  const themeHex = planetConfig.color || '#00e5ff';
  const themeC3  = hexToC3(themeHex);
  scene.clearColor = new BABYLON.Color4(0.008, 0.047, 0.105, 1);

  const glow = new BABYLON.GlowLayer('cGlow', scene);
  glow.intensity = quality.glow ? 0.22 : 0;

  // ══════════════════════════════════════════════════════════════════════════
  // 3. STARFIELD + SCROLLING GRID (PLANET-THEMED)
  // ══════════════════════════════════════════════════════════════════════════

  const createLegacyStarfield = () => {
    const r = getAspect();
    const SX = ZOOM * r * 2.5, SZ = ZOOM * 2.5;

    // Parallax stars – 3 layers
    const layers = [
      { count: Math.max(8,Math.round(220 * quality.starFraction)), size: 0.06, speed: 0.020, bright: new BABYLON.Color3(0.35, 0.45, 0.65) },
      { count:  Math.max(8,Math.round(90 * quality.starFraction)), size: 0.13, speed: 0.048, bright: new BABYLON.Color3(0.65, 0.75, 1.00) },
      { count:  Math.max(8,Math.round(28 * quality.starFraction)), size: 0.22, speed: 0.095, bright: new BABYLON.Color3(1.00, 1.00, 1.00) },
    ];
    const allLayers = layers.map(({ count, size, speed, bright }) => {
      const mat   = makeMat(scene, bright);
      const stars = Array.from({ length: count }, () => {
        const s = BABYLON.MeshBuilder.CreateSphere(`cs_${Math.random()}`, { diameter: size, segments: 3 }, scene);
        s.position.set((Math.random() - 0.5) * SX, -0.5, (Math.random() - 0.5) * SZ);
        s.material = mat;
        return s;
      });
      return { stars, speed, span: SZ };
    });

    // Infinite grid lines – planet theme colour, very subtle
    const gridMat  = makeMat(scene, themeC3.scale(0.07));
    const GRID     = 2.2;
    const rowCount = Math.ceil(SZ / GRID) + 2;
    const gridRows = Array.from({ length: rowCount }, (_, i) => {
      const m = BABYLON.MeshBuilder.CreateBox(`cgr_${i}`, { width: ZOOM * r * 2.2, height: 0.01, depth: 0.018 }, scene);
      m.position.set(0, -0.45, -ZOOM - i * GRID);
      m.material = gridMat;
      return m;
    });

    scene.onBeforeRenderObservable.add(() => {
      const dtFactor = frameScale(engine.getDeltaTime());
      allLayers.forEach(({ stars, speed, span }) =>
        stars.forEach(s => { s.position.z += speed * dtFactor; if (s.position.z > span / 2) s.position.z -= span; })
      );
      const span = GRID * rowCount;
      gridRows.forEach(m => { m.position.z += 0.038 * dtFactor; if (m.position.z > ZOOM + GRID) m.position.z -= span; });
    });
  };
  const selectedBackground = legacyBattleBackgroundRequested(globalThis.location?.search) ? null : resolveBattleBackground({
    mode: 'campaign', planetId: currentPlanetId, stage: currentStage,
    variantId: previewBg4Variant({ mode: 'campaign', planetId: currentPlanetId, queryString: globalThis.location?.search }),
  });
  if (selectedBackground) {
    createScrollingBattleBackground({
      BABYLON, scene, engine, config: selectedBackground, qualityId: quality.id || 'mobile',
      worldHalfHeight: ZOOM, baseUrl: import.meta.env?.BASE_URL || '/',
      onFallback: createLegacyStarfield,
    });
  } else createLegacyStarfield();
  // Developer-only measurement: ?bgPerf=1; same probe works with ?bg=legacy.
  attachBattleBackgroundProfiler({
    scene, engine, mode: 'campaign',
    backgroundId: selectedBackground?.id || 'legacy',
    queryString: globalThis.location?.search || '',
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. GUI
  // ══════════════════════════════════════════════════════════════════════════

  const ui  = GUI.AdvancedDynamicTexture.CreateFullscreenUI('CampaignUI', true, scene);
  // During the G1/G2 migration we keep Babylon GUI damage labels, enemy mini
  // bars and announcements. The fixed top HUD moves to one shared React view.
  const externalHud=typeof data.onHudUpdate==='function';
  let battleViewportMetrics={cssW:393,cssH:852};
  const createEnemyEntryPolicy=()=>{
    battleViewportMetrics=measureBattleHud(engine,canvas,ui);
    const {cssW,cssH}=battleViewportMetrics;
    return createEnemyEntryReadabilityPolicyV26A2({
      worldHalfHeight:ZOOM,viewportWidth:cssW,viewportHeight:cssH,externalHud,
    });
  };
  let enemyEntryPolicy=createEnemyEntryPolicy();
  engine.onResizeObservable.add(()=>{enemyEntryPolicy=createEnemyEntryPolicy();});

  // ── SVG HUD top-bar (hexagon shape – planet theme colour) ─────────────────
   const topBar = new GUI.Image('topBar', '');
  topBar.width              = '100%';
  topBar.verticalAlignment  = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  topBar.stretch            = GUI.Image.STRETCH_NONE;
  ui.addControl(topBar);
  topBar.isVisible=!externalHud;

  // ── Score (left) ──────────────────────────────────────────────────────────
  const scoreText = new GUI.TextBlock('scoreText');
  scoreText.text                    = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: 0`;
  scoreText.color                   = '#00e5ff';
  scoreText.fontFamily              = '"VT323", monospace';
  scoreText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  scoreText.textVerticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  scoreText.left                    = `15px`;
  scoreText.top                     = `10px`;
  ui.addControl(scoreText);
  scoreText.isVisible=!externalHud;

  // ── Wave info (right) ─────────────────────────────────────────────────────
  const waveText = new GUI.TextBlock('waveText');
  waveText.text                    = '';
  waveText.color                   = '#f1c40f';
  waveText.fontFamily              = '"VT323", monospace';
  waveText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  waveText.textVerticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  waveText.left                    = `-15px`;
  waveText.top                     = `10px`;
  ui.addControl(waveText);
  waveText.isVisible=!externalHud;
  // ── HP system label (center) ──────────────────────────────────────────────
  const hpLabel = new GUI.TextBlock('hpLabel');
  hpLabel.text                   = lang === 'vi' ? 'HỆ THỐNG GIÁP' : 'ARMOR SYSTEM';
  hpLabel.color                  = '#ffffff';
  hpLabel.fontFamily             = '"VT323", monospace';
  hpLabel.textVerticalAlignment  = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  ui.addControl(hpLabel);
  hpLabel.isVisible=!externalHud;

   // ── Rebuild SVG whenever resolution changes ───────────────────────────────
  const drawHudSvg = () => {
  const { w, cssW, cx, h1, h2, dx1, dx2, stroke } = measureBattleHud(engine, canvas, ui);
  const accent = themeHex.replace('#', '%23');   // URL-encode '#'

   const svgStr = [
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h2}' viewBox='0 0 ${w} ${h2}'>`,
      `<polygon points='0,0 ${w},0 ${w},${h1} ${cx+dx1},${h1} ${cx+dx2},${h2} ${cx-dx2},${h2} ${cx-dx1},${h1} 0,${h1}' fill='rgba(5,11,20,0.85)'/>`,
      `<polyline points='0,${h1} ${cx-dx1},${h1} ${cx-dx2},${h2} ${cx+dx2},${h2} ${cx+dx1},${h1} ${w},${h1}' fill='none' stroke='${accent}99' stroke-width='${stroke}'/>`,
      `</svg>`,
    ].join('');
    topBar.source = 'data:image/svg+xml;utf8,' + svgStr;
    topBar.height = '65px';

    const isSmall = cssW < 400;
    scoreText.fontSize = (isSmall ? 18 : 22);
    waveText.fontSize  = (isSmall ? 14 : 18);
    hpLabel.fontSize   = (isSmall ? 12 : 14);
    hpLabel.top        = `${(isSmall ? 20 : 22)}px`;
  };
  drawHudSvg();
  engine.onResizeObservable.add(drawHudSvg);

  // ── HP bar – 10 segmented blocks (same as DungeonScene) ──────────────────
  const hpBarContainer = new GUI.Rectangle('hpBarCon');
  hpBarContainer.width             = `120px`;
  hpBarContainer.height            = `12px`;
  hpBarContainer.background        = 'rgba(0,0,0,0.8)';
  hpBarContainer.color             = 'rgba(0,229,255,0.4)';
  hpBarContainer.thickness         = 1;
  hpBarContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  hpBarContainer.top               = `40px`;
  ui.addControl(hpBarContainer);
  hpBarContainer.isVisible=!externalHud;

  const hpSegments = [];
  for (let i = 0; i < 10; i++) {
    const seg = new GUI.Rectangle(`hseg_${i}`);
    seg.width               = `10px`;
    seg.height              = `8px`;
    seg.background          = '#00e5ff';
    seg.thickness           = 0;
    seg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    seg.left                = `${(i * 12 + 1)}px`;
    hpBarContainer.addControl(seg);
    hpSegments.push(seg);
  }

  const updateHpBar = () => {
    const ratio = Math.max(0, stats.hp / stats.maxHp);
    const color = ratio > 0.5 ? '#00e5ff' : ratio > 0.25 ? '#f1c40f' : '#ff4757';
    hpSegments.forEach((seg, i) => {
      seg.isVisible  = (i / 10) < ratio;
      seg.background = color;
    });
  };

 // ── Boss HP panel (StackPanel, same as DungeonScene) ──────────────────────
  const bossPanel = new GUI.StackPanel('bossPanel');
  bossPanel.width             = `300px`;
  bossPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  bossPanel.top               = `80px`;
  bossPanel.isVisible         = false;
  ui.addControl(bossPanel);

  const bossNameText = new GUI.TextBlock('bossNameText');
  bossNameText.text       = '⚠ BOSS';
  bossNameText.color      = '#ff4757';
  bossNameText.fontSize   = 20;
  bossNameText.fontFamily = '"VT323", monospace';
  bossNameText.height     = `25px`;
  bossPanel.addControl(bossNameText);

  const bossHpContainer = new GUI.Rectangle('bossHpCon');
  bossHpContainer.width      = '100%';
  bossHpContainer.height     = `10px`;
  bossHpContainer.background = 'rgba(30,0,0,0.8)';
  bossHpContainer.color      = '#ff4757';
  bossHpContainer.thickness  = 2;
  bossPanel.addControl(bossHpContainer);

  const bossHpFill = new GUI.Rectangle('bossHpFill');
  bossHpFill.width               = '100%'; bossHpFill.height = '100%';
  bossHpFill.background          = '#ff4757'; bossHpFill.thickness = 0;
  bossHpFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
 bossHpContainer.addControl(bossHpFill);

   // ── Announcement banner (CENTER-based + '-15%', same as DungeonScene) ────
  const annPanel = new GUI.Rectangle('annPanel');
  annPanel.width             = '100%';
  annPanel.height            = `70px`;
  annPanel.background        = 'rgba(5,11,20,0.92)';
  annPanel.color             = 'rgba(102,252,241,0.5)';
  annPanel.thickness         = 2;
  annPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  annPanel.top               = '-15%';
  annPanel.alpha             = 0;
  ui.addControl(annPanel);

  const annText = new GUI.TextBlock('annText');
  annText.color      = '#66fcf1';
  annText.fontSize   = 32;
  annText.fontWeight = 'bold';
  annText.fontFamily = '"VT323", monospace';
  annPanel.addControl(annText);

  let annAnim = null;
  const showAnnouncement = (text, colorHex = '#66fcf1', duration = 2000) => {
    // In unified presentation mode all announcements use one React overlay.
    // Preserve Babylon announcement implementation for non-migrated consumers.
    if(externalHud&&typeof data.onAnnouncement==='function'){
      data.onAnnouncement({text,colorHex,duration});return;
    }
    annText.text = text; annText.color = colorHex; annPanel.color = colorHex;
    if (annAnim) { clearInterval(annAnim); annAnim = null; }
    let step = 0;
    annAnim = setInterval(() => {
      step += 50;
      if      (step < 300)            annPanel.alpha = step / 300;
      else if (step < 300 + duration) annPanel.alpha = 1;
      else if (step < 600 + duration) annPanel.alpha = 1 - (step - 300 - duration) / 300;
      else { annPanel.alpha = 0; clearInterval(annAnim); annAnim = null; }
    }, 50);
  };

  // ── Floating damage / pick-up text ────────────────────────────────────────
  const showTextEffect = (worldX, worldZ, text, color = '#FFD700') => {
    // Dummy invisible mesh để linkWithMesh (cách chuẩn Babylon GUI)
    const dummy = BABYLON.MeshBuilder.CreateBox(`dum_${Date.now()}`, { size: 0.01 }, scene);
    dummy.position.set(worldX, 0.5, worldZ);
    dummy.isVisible = false;

    const lbl = new GUI.TextBlock(`fl_${Date.now()}`, text);
    lbl.color      = color;
    lbl.fontFamily = '"VT323", monospace';
    lbl.fontSize   = 20;
    lbl.fontStyle  = 'bold';
    lbl.isPickable = false;
    ui.addControl(lbl);
    lbl.linkWithMesh(dummy);
    lbl.linkOffsetYInPixels = -10;

    let t0 = null;
    const obs = scene.onBeforeRenderObservable.add(() => {
      if (!t0) t0 = performance.now();
      const p = (performance.now() - t0) / 900;
      if (p >= 1) { lbl.dispose(); safeDispose(dummy); scene.onBeforeRenderObservable.remove(obs); return; }
      lbl.alpha = 1 - p;
      dummy.position.z -= 0.025;
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 5. PLAYER SHIP
  // ══════════════════════════════════════════════════════════════════════════

  const playerRoot = new BABYLON.TransformNode('playerRoot', scene);
  playerRoot.position.set(0, 0, ZOOM - 2.5);

  // One visual factory shared by Campaign and Dungeon. Sprite/procedural
  // appears immediately; GLB takes its place only after successful import.
  // Visuals never control the combat hitbox or server-issued battle rewards.
  const shipVisual = createPlayerShipVisual(scene, playerRoot, {
    aircraftId: aircraftBase.id, aircraftCatalog: AIRCRAFTS, glowLayer: glow,
  });
  const playerPlane = shipVisual.tiltNode; // tilt animation lives on visual root

  // Shared aircraft-aware engine VFX (same mount, colors, particles, texture as Dungeon).
  const engineFx = createShipEngineFx({ scene, BABYLON, playerRoot, aircraft: aircraftBase, quality });

  // One presentation-only feedback bridge for all 16 Guest V2 ship skills and
  // automatic armor procs. It never changes combat state or trusted outcomes.
  let guestFeedbackSequence = 0;
  const guestVisualFeedback = guestAbilities ? createGuestAbilityVisualFeedbackV2({
    scene, BABYLON, playerRoot, shipVisual, getTick: () => guestAbilities.tick,
  }) : null;
  const publishGuestFeedback = (feedback, { worldText = true } = {}) => {
    if (!feedback) return;
    data.onAbilityFeedback?.(feedback);
    if (feedback.status !== 'rejected') guestVisualFeedback?.play(feedback);
    if (worldText) {
      const label = localizeGuestFeedbackV2(feedback.name, lang);
      if (label) showTextEffect(playerRoot.position.x, playerRoot.position.z - .9, label, feedback.color || '#5be5f3');
    }
  };
  const publishArmorFeedback = (proc, amount = 0, { worldText = true } = {}) => {
    if (!guestAbilities) return null;
    const armorId = guestAbilities.snapshot().armor?.id || null;
    const feedback = createGuestArmorProcFeedbackV2({
      armorId, proc, amount, tick: guestAbilities.tick, sequence: ++guestFeedbackSequence,
    });
    publishGuestFeedback(feedback, { worldText });
    return feedback;
  };

  // ── Wingman drones ────────────────────────────────────────────────────────
  const drones = [];
  if (stats.droneId && droneBase) {
    const formation = [{ ox: -2.0, oz: 0.5 }, { ox: 2.0, oz: 0.5 }];
    const dColor = droneBase.color
      ? '#' + droneBase.color.toString(16).padStart(6,'0') : '#2ecc71';
    formation.forEach(pos => {
      const node = new BABYLON.TransformNode('dNode', scene);
      node.position.set(playerRoot.position.x + pos.ox, 0, playerRoot.position.z + pos.oz);
      node.offsetX = pos.ox; node.offsetZ = pos.oz;

      const fb = BABYLON.MeshBuilder.CreateSphere('dFb', { diameter: 0.55, segments: 10 }, scene);
      fb.material = makeMat(scene, BABYLON.Color3.FromHexString(dColor));
      fb.parent   = node;

      if (droneArt) {
        const dp = BABYLON.MeshBuilder.CreatePlane('dPlane', { size: 0.9 }, scene);
        dp.rotation.x = Math.PI/2; dp.rotation.z = 0;
        dp.parent     = node;
        dp.material   = makeSpriteMat(scene, droneArt,
          () => { fb.isVisible = false; }, () => { safeDispose(dp); });
      }
      drones.push(node);
    });
  }
  // THÊM WINGMAN
  const wingNodes = [];
  if (stats.wingmanId && wingmanBase) {
    const wX = aircraftBase.wingmanOffset?.x || 1.8;
    const wZ = aircraftBase.wingmanOffset?.z || 0.3;
    const wOffsets = [-wX, wX];
    const wColor = wingmanBase.color
      ? '#' + wingmanBase.color.toString(16).padStart(6,'0') : '#ffa502';
    wOffsets.forEach(ox => {
      const wNode = new BABYLON.TransformNode('wNode', scene);
      wNode.parent = playerRoot;               // ← gắn cứng vào tàu
      wNode.position.set(ox, 0, wZ);          // ← chỉ cần offset local, không cần cộng playerRoot
      wNode.offsetX = ox; wNode.offsetZ = wZ;

      const wFb = BABYLON.MeshBuilder.CreateCylinder('wFb',
        { diameterTop: 0.05, diameterBottom: 0.05, height: 0.8, tessellation: 8 }, scene);
      wFb.rotation.x = Math.PI / 2;
      wFb.material = makeMat(scene, BABYLON.Color3.FromHexString(wColor));
      wFb.parent = wNode;

      if (wingmanBase.modelSrc && canAutoLoadModel(wingmanBase.modelBytes || Infinity, quality)) {
        // ── Load GLB wingman model ──
        BABYLON.SceneLoader.ImportMeshAsync('', wingmanBase.modelSrc, '', scene)
          .then(result => {
            const wRoot = result.meshes[0];
            wRoot.parent   = wNode;
            wRoot.position = BABYLON.Vector3.Zero();
            const ws = wingmanBase.modelScale || 0.4;
            wRoot.scaling.setAll(ws);
            const wr = wingmanBase.modelRotation || { x: 0, y: 0, z: 0 };
            wRoot.rotation.set(wr.x, wr.y, wr.z);
            wFb.isVisible = false; // ẩn fallback
          })
          .catch(() => {
            // GLB lỗi → thử load sprite
            if (wingmanArt) {
              const wp = BABYLON.MeshBuilder.CreatePlane('wPlane', { size: 1.0 }, scene);
              wp.rotation.x = Math.PI / 2;
              wp.parent     = wNode;
              wp.material   = makeSpriteMat(scene, wingmanArt,
                () => { wFb.isVisible = false; },
                () => { safeDispose(wp); });
            }
          });
      } else if (wingmanArt) {
        // ── Sprite fallback nếu không có GLB ──
        const wp = BABYLON.MeshBuilder.CreatePlane('wPlane', { size: 1.0 }, scene);
        wp.rotation.x = Math.PI / 2;
        wp.parent     = wNode;
        wp.material   = makeSpriteMat(scene, wingmanArt,
          () => { wFb.isVisible = false; },
          () => { safeDispose(wp); });
      }
      wingNodes.push(wNode);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. INPUT – DRAG TO MOVE
  // ══════════════════════════════════════════════════════════════════════════

  const speedMod = battleSpeedMultiplier(stats);
  const shipInput = createShipInputController({
    canvas: engine.getRenderingCanvas(), scene, engine, playerRoot, tiltNode: playerPlane,
    halfHeight: ZOOM, aspect: getAspect, speedMultiplier: speedMod, pointerSpeedMultiplier: 1,
    enabled: () => !gameOver && gameState !== 'CLEAR' && gameState !== 'GAMEOVER',
  });

  // C7-C2BC: explicit build flag + URL flag + Guest Alpha stage 1 ONLY.
  // Observes real phone pointer events; never replaces Guest movement,
  // sends network requests or authorizes a Cloud battle/reward.
  if (import.meta.env.VITE_SF_NATIVE_TOUCH_QA === '1' && !isCloud &&
      currentPlanetId === 1 && currentStage === 1 &&
      (globalThis.Capacitor?.isNativePlatform?.() === true ||
       new URLSearchParams(globalThis.location?.search || '').get('touchQa') === '1')) {
    import('../../game/combat/CloudNativeTouchQaC7C2.js').then(({attachNativeTouchQaOverlay}) => {
      if (battleSceneDisposed) return;
      attachNativeTouchQaOverlay({canvas:engine.getRenderingCanvas(),scene,playerRoot,
        halfHeight:ZOOM,aspect:getAspect,speedMultiplier:speedMod});
    }).catch(() => {
      // Diagnostic tool is optional. A failure never affects Guest gameplay.
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. EXPLOSION FX
  // ══════════════════════════════════════════════════════════════════════════

  const explode = (pos, scale = 1) => {
    const ps = new BABYLON.ParticleSystem('exp', Math.max(24,Math.round(80*quality.particleFraction)), scene);
    ps.particleTexture = new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png', scene);
    ps.emitter     = pos.clone();
    ps.color1      = new BABYLON.Color4(1, .8, .1, 1); ps.color2 = new BABYLON.Color4(1, .3, 0, 1);
    ps.colorDead   = new BABYLON.Color4(.1, 0, 0, 0);
    ps.minSize     = .3*scale; ps.maxSize  = 1.2*scale;
    ps.minLifeTime = .1;       ps.maxLifeTime = .4;
    ps.emitRate    = 800;
    ps.createSphereEmitter(.6*scale);
    ps.minEmitPower = 3*scale; ps.maxEmitPower = 8*scale;
    ps.gravity     = BABYLON.Vector3.Zero();
    ps.targetStopDuration = .15;
    ps.disposeOnStop = true;
    ps.start();
  };

  // Camera shake
  const shakeCamera = () => {
    let c = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      camera.position.x += (Math.random() - .5) * .35;
      if (++c > 7) { camera.position.x = 0; scene.onBeforeRenderObservable.remove(obs); }
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 8. BULLETS
  // ══════════════════════════════════════════════════════════════════════════

  const playerBullets = [];
  const enemyBullets  = [];
  let lastFire      = 0;
  let nextWingFire  = 0;
  let nextDroneFire = 0;
  let nextRegenTime = 0;

  const mainGunBase = combat.gear.mainGun.base || GEAR_CATALOG.mainGun[0];
  const enemyProjectileMaterials = Object.freeze({
    energy: makeMat(scene, new BABYLON.Color3(1, .28, .34)),
    ion: makeMat(scene, new BABYLON.Color3(.42, .72, 1)),
    explosive: makeMat(scene, new BABYLON.Color3(1, .58, .12)),
    boss: makeMat(scene, new BABYLON.Color3(1, .10, .08)),
  });
  const playerDamageGate = createPlayerDamageGateV25();
  let enemyProjectileSequence = 0;
  let playerVelocityFrame = Object.freeze({ x: 0, z: 0 });
  let playerMotionSample = {
    x: playerRoot.position.x,
    z: playerRoot.position.z,
    initialized: false,
  };
  const samplePlayerCombatVelocity = frameFactorValue => {
    const safeFrame = Math.max(.25, Math.min(4, Number(frameFactorValue) || 1));
    const dx = playerRoot.position.x - playerMotionSample.x;
    const dz = playerRoot.position.z - playerMotionSample.z;
    const teleported = Math.hypot(dx, dz) > 2.4;
    if (!playerMotionSample.initialized || teleported) {
      playerVelocityFrame = Object.freeze({ x: 0, z: 0 });
      playerMotionSample.initialized = true;
    } else {
      const instantX = dx / safeFrame;
      const instantZ = dz / safeFrame;
      playerVelocityFrame = Object.freeze({
        x: clamp(playerVelocityFrame.x * .62 + instantX * .38, -.22, .22),
        z: clamp(playerVelocityFrame.z * .62 + instantZ * .38, -.18, .18),
      });
    }
    playerMotionSample.x = playerRoot.position.x;
    playerMotionSample.z = playerRoot.position.z;
    return playerVelocityFrame;
  };
  const shots = createProjectileEmitter({
    scene, BABYLON, bullets: playerBullets, scheduleBattleTimer,
    maxBullets: runtimeLimits.maxPlayerProjectiles,
    maxPendingShots: runtimeLimits.maxPendingPlayerShots,
    onCapacityClamped: () => { runtimeCapacityClamps.playerProjectiles++; },
  });
  const liveTargets = () => [
    ...enemies.filter(e => !e._dead && !e.mesh.isDisposed?.()
      && enemyEntryPolicy.isEngageable(e._entryState)
      && (!e._encounterMechanicProtected || e._encounterMechanicComplete)),
    ...(gameState === 'BOSS_FIGHT' && bossMesh && !bossMesh.isDisposed?.()
      ? [{ mesh: bossMesh, isBoss: true }] : []),
  ];
  const fireEnemyBullet = (pos, vx = 0, vz = 0.24, {
    priority = 'normal', rawDamage = 200, damageType = 'energy', sourceRole = null,
    shotPlan = null,
  } = {}) => {
    if (enemyBullets.length >= runtimeLimits.maxEnemyProjectiles) {
      if (priority === 'boss') {
        const replaceIndex = enemyBullets.findIndex(projectile => projectile?._priority !== 'boss');
        if (replaceIndex >= 0) {
          safeDispose(enemyBullets[replaceIndex]);
          enemyBullets.splice(replaceIndex, 1);
        } else {
          runtimeCapacityClamps.enemyProjectiles++;
          return false;
        }
      } else {
        runtimeCapacityClamps.enemyProjectiles++;
        return false;
      }
    }
    const hitId = `campaign-enemy-projectile-${++enemyProjectileSequence}`;
    const visual = shotPlan?.visual
      || resolveCampaignEnemyProjectileVisualV31({ sourceRole, priority });
    const b = BABYLON.MeshBuilder.CreateBox(hitId, {
      width: visual.width,
      depth: visual.length,
      height: visual.height,
    }, scene);
    b.position = pos.clone(); b.position.y = .04;
    const materialKey = priority === 'boss' ? 'boss'
      : damageType === 'ion' ? 'ion'
        : damageType === 'explosive' ? 'explosive' : 'energy';
    b.material = enemyProjectileMaterials[materialKey];
    b._vx = Number(shotPlan?.velocity?.x ?? vx) || 0;
    b._vz = Number(shotPlan?.velocity?.z ?? vz) || .24;
    b.rotation.y = Math.atan2(b._vx, b._vz);
    b._shotPlan = shotPlan;
    b._visualPulse = Number(visual.pulse) || 0;
    b._createdAtMs = Number(shotPlan?.createdAtMs) || Date.now();
    b._expiresAtMs = Number(shotPlan?.expiresAtMs) || (b._createdAtMs + (priority === 'boss' ? 5200 : 4200));
    b._damageHitId = hitId;
    b._priority = priority;
    b._rawDamage = Math.max(1, Math.round(Number(rawDamage) || 200));
    b._damageType = damageType || 'energy';
    b._sourceRole = sourceRole;
    b.isPickable = false;
    enemyBullets.push(b);
    return true;
  };

  const fireWeapons = () => {
    const target = pickWeaponTarget(liveTargets(), playerRoot.position);
    const abilityDamage=guestAbilities?.modifiers().damageMultiplier||1;
    const salvo = describeMainSalvo(mainGunBase, playerRoot.position, stats.atk*abilityDamage, target);
    shots.fire(salvo);
    if (salvo.length && shouldEchoShot(stats, passives, Date.now())) {
      // One extra shot per cooldown, even for spread/shotgun (no exponential fanout).
      const extra = salvo[0];
      shots.fire(Array.from({length:stats.echoCount},(_,i)=>({...extra, x:extra.x+(i%2===0?-.28:.28), delayMs:0})));
    }
  };
  const fireWingman = () => {
    if (!wingmanBase || !wingNodes.length) return;
    const target = pickWeaponTarget(liveTargets(), playerRoot.position);
    const mounts = wingNodes.map(w => w.getAbsolutePosition());
    shots.fire(describeWingSalvo(wingmanBase, mounts, stats.wingAtk, target));
  };
  const fireDrones = () => {
    if (!droneBase || !drones.length) return;
    if (droneBase.behavior === 'repair') {
      stats.hp = Math.min(stats.maxHp, stats.hp + repairAmount(droneBase, stats.maxHp));
      updateHpBar();
      return;
    }
    const target = pickWeaponTarget(liveTargets(), playerRoot.position);
    shots.fire(describeDroneSalvo(droneBase, drones.map(d => d.position), stats.droneAtk, target));
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 9. ENEMY SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  const curEnemyCfgs = PLANET_ENEMIES[currentPlanetId] || PLANET_ENEMIES[1];
  const curBossCfgs  = PLANET_BOSSES[currentPlanetId]  || PLANET_BOSSES[1];

  // enemies[i] = { mesh, hp, maxHp, tier, speed, velX, sineOff,
  //               isBoss, isEnraged, canShoot, lastShoot, shootMs,
  //               points, miniHpBg, miniHp, _dead }
  const enemies = [];

  const TIER_COL = {
    1: new BABYLON.Color3(.4, .9, 1.0),
    2: new BABYLON.Color3(1.0, .55, .25),
    3: new BABYLON.Color3(.95, .8, .15),
    4: new BABYLON.Color3(.55, .2, .9),
  };
  const entryHaloMat = makeMat(scene, new BABYLON.Color3(.18, .82, 1));
  const fastEntryHaloMat = makeMat(scene, new BABYLON.Color3(1, .45, .12));
  const encounterSummonMat = makeMat(scene, new BABYLON.Color3(.75, .2, 1));
  const encounterMiniBossMat = makeMat(scene, new BABYLON.Color3(1, .55, .08));
  const encounterLaneDangerMat = makeTransparentMat(scene, new BABYLON.Color3(1, .58, .12), .22);
  const encounterPreviewDangerMat = makeTransparentMat(scene, new BABYLON.Color3(.68, .35, 1), .20);
  const encounterAimChargeMat = makeTransparentMat(scene, new BABYLON.Color3(1, .72, .22), .32);
  const encounterChargeCorridorMat = makeTransparentMat(scene, new BABYLON.Color3(1, .46, .08), .20);
  const bossAttackDangerMat = makeTransparentMat(scene, new BABYLON.Color3(1, .18, .12), .18);
  const encounterMuzzleLocal = new BABYLON.Vector3(0, 0, 1.15);

  const resolveEncounterMuzzleOrigin = enemy => {
    if (!enemy?.mesh || enemy.mesh.isDisposed?.()) return null;
    enemy.mesh.computeWorldMatrix(true);
    const world = BABYLON.Vector3.TransformCoordinates(encounterMuzzleLocal, enemy.mesh.getWorldMatrix());
    return Object.freeze({ x: world.x, y: 0, z: world.z });
  };

  const updateEnemyFacing = (enemy, velocityX, velocityZ, deltaMs) => {
    if (!enemy?.mesh || enemy.mesh.isDisposed?.()) return;
    enemy._facingYaw = resolveEnemyGameplayYawV26A4({
      currentYaw: enemy._facingYaw,
      velocityX,
      velocityZ,
      maxTurnRadians: (enemy.tier === 4 ? 12 : 7) * Math.max(0, Math.min(100, deltaMs)) / 1000,
    });
    enemy.mesh.rotation.y = enemy._facingYaw;
  };

  const disposeChargeTelegraph = enemy => {
    safeDispose(enemy?._chargeTelegraph);
    if (enemy) enemy._chargeTelegraph = null;
  };

  const createChargeTelegraph = (enemy, direction) => {
    disposeChargeTelegraph(enemy);
    if (!enemy?.mesh?.position || !direction) return null;
    const start = new BABYLON.Vector3(enemy.mesh.position.x, .06, enemy.mesh.position.z);
    const length = Math.min(18, Math.max(7,
      Math.hypot(playerRoot.position.x - start.x, playerRoot.position.z - start.z) + 2));
    const corridor = BABYLON.MeshBuilder.CreateBox(`charge_telegraph_${enemy.mesh.uniqueId}`, {
      width: enemy._encounterKind === 'mini_boss' ? 2.4 : 1.45,
      height: .025,
      depth: length,
    }, scene);
    corridor.position.set(
      start.x + direction.x * length * .5,
      .045,
      start.z + direction.z * length * .5,
    );
    corridor.rotation.y = Math.atan2(direction.x, direction.z);
    corridor.material = encounterChargeCorridorMat;
    corridor.isPickable = false;
    corridor.visibility = .72;
    enemy._chargeTelegraph = corridor;
    return corridor;
  };


  const disposeEncounterTelegraph = enemy => {
    for (const mesh of enemy?._encounterTelegraphs || []) safeDispose(mesh);
    if (enemy) {
      enemy._encounterTelegraphs = [];
      enemy._encounterTelegraphKind = null;
      enemy._encounterAttackCorridors = [];
    }
  };

  const createMiniBossLaneSweepTelegraph = (enemy, laneNorms = [-.62, 0, .62]) => {
    disposeEncounterTelegraph(enemy);
    if (!enemy?.mesh?.position) return [];
    const laneXs = laneNorms.map(value => clamp(Number(value) || 0, -.9, .9) * boundX());
    const startZ = Math.max(-ZOOM + 2, enemy.mesh.position.z + 1);
    const endZ = ZOOM + 1;
    const depth = Math.max(3, endZ - startZ);
    const width = Math.max(1.05, boundX() * .16);
    const zones = laneXs.map((x, index) => {
      const zone = BABYLON.MeshBuilder.CreateBox(`enc_lane_${enemy.mesh.uniqueId}_${index}`, {
        width,
        height: .025,
        depth,
      }, scene);
      zone.position.set(x, .045, startZ + depth * .5);
      zone.material = enemy._encounterKind === 'mini_boss'
        ? encounterLaneDangerMat : encounterPreviewDangerMat;
      zone.isPickable = false;
      zone.visibility = .62;
      return zone;
    });
    enemy._encounterTelegraphs = zones;
    enemy._encounterTelegraphKind = 'lane_zones';
    return zones;
  };

  const syncBossPreviewLaneTelegraph = (enemy, plan) => {
    const corridors = enemy?._encounterAttackCorridors || [];
    for (let index = 0; index < corridors.length; index += 1) {
      const corridor = corridors[index];
      const path = plan?.paths?.[index];
      if (!corridor || corridor.isDisposed?.() || !path) continue;
      corridor.position.set(path.midpoint.x, .045, path.midpoint.z);
      corridor.rotation.y = path.yawRadians;
      corridor.scaling.set(path.width, 1, path.length);
    }
  };

  const createBossPreviewLaneTelegraph = (enemy, plan) => {
    disposeEncounterTelegraph(enemy);
    if (!enemy?.mesh || !plan?.paths?.length) return [];
    const corridors = plan.paths.map((path, index) => {
      const corridor = BABYLON.MeshBuilder.CreateBox(`enc_preview_lane_${enemy.mesh.uniqueId}_${index}`, {
        width: 1,
        height: .025,
        depth: 1,
      }, scene);
      corridor.material = encounterPreviewDangerMat;
      corridor.isPickable = false;
      corridor.visibility = .68;
      return corridor;
    });
    enemy._encounterTelegraphs = corridors;
    enemy._encounterAttackCorridors = corridors;
    enemy._encounterTelegraphKind = 'attack_corridors';
    syncBossPreviewLaneTelegraph(enemy, plan);
    return corridors;
  };

  const updateBossPreviewLaneAttackPlan = (enemy, nowMs) => {
    let plan = enemy?._encounterAttackPlan;
    if (!plan) return null;
    const origin = resolveEncounterMuzzleOrigin(enemy);
    if (plan.phase !== 'locked') {
      plan = trackBossPreviewLaneAttackPlanV282(plan, {
        origin,
        arenaHalfWidth: boundX(),
        targetZ: ZOOM + 1,
      });
      if (nowMs >= plan.lockAtMs) {
        plan = lockBossPreviewLaneAttackPlanV282(plan, {
          nowMs,
          origin,
          arenaHalfWidth: boundX(),
          targetZ: ZOOM + 1,
        });
      }
      enemy._encounterAttackPlan = plan;
    }
    syncBossPreviewLaneTelegraph(enemy, plan);
    return plan;
  };

  const fireBossPreviewLaneAttack = (enemy, nowMs) => {
    let plan = updateBossPreviewLaneAttackPlan(enemy, nowMs);
    if (!plan) return 0;
    if (plan.phase !== 'locked') {
      plan = lockBossPreviewLaneAttackPlanV282(plan, {
        nowMs,
        origin: resolveEncounterMuzzleOrigin(enemy),
        arenaHalfWidth: boundX(),
        targetZ: ZOOM + 1,
      });
      enemy._encounterAttackPlan = plan;
      syncBossPreviewLaneTelegraph(enemy, plan);
    }
    const projectiles = projectilesFromBossPreviewLaneAttackPlanV282(plan);
    for (const projectile of projectiles) {
      const fire = () => fireEnemyBullet(
        new BABYLON.Vector3(projectile.origin.x, 0, projectile.origin.z),
        projectile.velocity.x,
        projectile.velocity.z,
        { sourceRole: 'boss_preview', rawDamage: enemy._projectileDamage || 240,
          damageType: enemy._damageType || 'energy' },
      );
      if (projectile.fireOffsetMs > 0) scheduleBattleTimer(fire, projectile.fireOffsetMs);
      else fire();
    }
    return projectiles.length;
  };

  const createMuzzleChargeTelegraph = enemy => {
    disposeEncounterTelegraph(enemy);
    if (!enemy?.mesh) return null;
    const marker = BABYLON.MeshBuilder.CreateTorus(`enc_muzzle_${enemy.mesh.uniqueId}`, {
      diameter: 1.05,
      thickness: .13,
      tessellation: 28,
    }, scene);
    marker.parent = enemy.mesh;
    marker.position.set(0, .10, 1.15);
    marker.material = encounterAimChargeMat;
    marker.isPickable = false;
    marker.visibility = .8;
    enemy._encounterTelegraphs = [marker];
    enemy._encounterTelegraphKind = 'muzzle_charge';
    return marker;
  };

  const createSummonTelegraph = enemy => {
    disposeEncounterTelegraph(enemy);
    if (!enemy?.mesh) return null;
    const ring = BABYLON.MeshBuilder.CreateTorus(`enc_summon_${enemy.mesh.uniqueId}`, {
      diameter: enemy._encounterKind === 'mini_boss' ? 4.1 : 3.4,
      thickness: .14,
      tessellation: 40,
    }, scene);
    ring.parent = enemy.mesh;
    ring.position.y = .08;
    ring.material = enemy._encounterKind === 'mini_boss' ? encounterMiniBossMat : encounterSummonMat;
    ring.isPickable = false;
    ring.visibility = .82;
    enemy._encounterTelegraphs = [ring];
    enemy._encounterTelegraphKind = 'summon';
    return ring;
  };

  const completeEncounterMechanic = enemy => {
    if (!enemy) return;
    enemy._encounterMechanicComplete = true;
    enemy._encounterMechanicProtected = false;
    enemy._encounterMechanicPhase = 'complete';
    disposeEncounterTelegraph(enemy);
    enemy._encounterAttackPlan = null;
  };

  const spawnEncounterReinforcements = enemy => {
    const roles = enemy?._encounterSummonRoles || [];
    if (!roles.length || !campaignWaveDirector) return false;
    const groupId = enemy._encounterReinforcementGroupId
      || `encounter-${currentWave}-${enemy.mesh.uniqueId}`;
    enemy._encounterReinforcementGroupId = groupId;
    const plan = campaignWaveDirector.buildReinforcementPlan({
      roles,
      formation: currentWavePlan?.formation || 'pincer',
      groupId,
    });
    plan.forEach((spec, index) => scheduleBattleTimer(() => {
      if (!battleSceneDisposed && !gameOver) spawnEnemy({ ...spec, hpMultiplier: spec.hpMultiplier * .82 });
    }, index * 180));
    return groupId;
  };

  const countEncounterReinforcements = enemy => {
    const groupId = enemy?._encounterReinforcementGroupId;
    if (!groupId) return 0;
    return enemies.filter(candidate => !candidate._dead
      && candidate._reinforcementGroupId === groupId).length;
  };

  const armEncounterMechanic = (enemy, nowMs) => {
    if (!enemy?._encounterFeatured || enemy._encounterKind === 'mini_boss'
      || enemy._encounterMechanicPhase !== 'idle') return;
    if (enemy._encounterKind === 'boss_preview' && !enemy._previewCanArm) return;
    const telegraphMs = Math.max(500, enemy._encounterTelegraphMs || 850);
    enemy._encounterMechanicStartedAt = nowMs;
    enemy._encounterMechanicFireAt = nowMs + telegraphMs;
    enemy._encounterMechanicPhase = enemy._encounterMechanicId === 'charge_rush'
      ? 'waiting_charge' : 'telegraph';
    if (enemy._encounterMechanicId === 'lane_sweep') {
      const plan = createBossPreviewLaneAttackPlanV282({
        origin: resolveEncounterMuzzleOrigin(enemy),
        laneNorms: [-.62, 0, .62],
        arenaHalfWidth: boundX(),
        targetZ: ZOOM + 1,
        width: Math.max(1.05, boundX() * .16),
        createdAtMs: nowMs,
        telegraphMs,
        lockLeadMs: 200,
        projectileSpeed: .38,
      });
      enemy._encounterAttackPlan = plan;
      enemy._encounterMechanicFireAt = plan.telegraphEndsAtMs;
      createBossPreviewLaneTelegraph(enemy, plan);
    } else if (enemy._encounterMechanicId === 'summon_escort'
      || enemy._encounterMechanicId === 'summon_swarm') createSummonTelegraph(enemy);
  };

  const stepEncounterMechanic = (enemy, nowMs) => {
    if (!enemy?._encounterFeatured || enemy._encounterKind === 'mini_boss'
      || enemy._encounterMechanicComplete) return;
    armEncounterMechanic(enemy, nowMs);
    if (enemy._encounterMechanicId === 'lane_sweep') updateBossPreviewLaneAttackPlan(enemy, nowMs);
    for (const telegraph of enemy._encounterTelegraphs || []) {
      if (!telegraph?.isDisposed?.()) {
        const pulse = .92 + .12 * Math.sin(nowMs * .018);
        if (enemy._encounterTelegraphKind !== 'lane_zones'
          && enemy._encounterTelegraphKind !== 'attack_corridors') {
          telegraph.scaling.x = pulse;
          telegraph.scaling.z = pulse;
        }
        telegraph.visibility = .55 + .25 * Math.sin(nowMs * .022);
      }
    }
    if (enemy._encounterMechanicPhase !== 'telegraph' || nowMs < enemy._encounterMechanicFireAt) return;
    if (enemy._encounterMechanicId === 'lane_sweep') {
      fireBossPreviewLaneAttack(enemy, nowMs);
    } else if (enemy._encounterMechanicId === 'summon_escort'
      || enemy._encounterMechanicId === 'summon_swarm') {
      spawnEncounterReinforcements(enemy);
    }
    completeEncounterMechanic(enemy);
  };

  const fireMiniBossAimedBurst = (enemy, event) => {
    if (!enemy?.mesh?.position) return;
    const origin = resolveEncounterMuzzleOrigin(enemy)
      || Object.freeze({ x: enemy.mesh.position.x, y: 0, z: enemy.mesh.position.z });
    const speed = Math.max(.34, Number(event?.projectileSpeed) || .38);
    const intercept = resolveCampaignEnemyInterceptV31({
      origin,
      target: { x: playerRoot.position.x, z: playerRoot.position.z },
      targetVelocity: playerVelocityFrame,
      projectileSpeed: speed,
      leadFactor: .78,
      maxLeadMs: 620,
    });
    const baseX = intercept.direction.x;
    const baseZ = intercept.direction.z;
    const count = Math.max(1, Math.trunc(Number(event?.shotCount) || 1));
    const spread = Math.max(0, Number(event?.spreadRadians) || 0);
    for (let index = 0; index < count; index += 1) {
      const normalized = count === 1 ? 0 : index / (count - 1) - .5;
      const angle = normalized * spread * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      fireEnemyBullet(new BABYLON.Vector3(origin.x, 0, origin.z),
        (baseX * cos - baseZ * sin) * speed,
        (baseX * sin + baseZ * cos) * speed,
        {
          sourceRole: 'mini_boss',
          rawDamage: enemy._projectileDamage || 260,
          damageType: enemy._damageType || 'energy',
        });
    }
  };

  const fireMiniBossLaneVolley = (enemy, event) => {
    if (!enemy?.mesh?.position) return;
    const origin = resolveEncounterMuzzleOrigin(enemy)
      || Object.freeze({ x: enemy.mesh.position.x, y: 0, z: enemy.mesh.position.z });
    const speed = Math.max(.34, Number(event?.projectileSpeed) || .38);
    for (const lane of event?.lanes || []) {
      const targetX = clamp(Number(lane) || 0, -.9, .9) * boundX();
      const targetZ = ZOOM + 2;
      const dx = targetX - origin.x;
      const dz = targetZ - origin.z;
      const length = Math.hypot(dx, dz) || 1;
      fireEnemyBullet(new BABYLON.Vector3(origin.x, 0, origin.z),
        dx / length * speed, dz / length * speed, {
          sourceRole: 'mini_boss',
          rawDamage: enemy._projectileDamage || 260,
          damageType: enemy._damageType || 'energy',
        });
    }
  };

  const applyMiniBossTelegraph = (enemy, telegraph) => {
    disposeEncounterTelegraph(enemy);
    disposeChargeTelegraph(enemy);
    if (!telegraph) return;
    if (telegraph.kind === 'lane_zones') createMiniBossLaneSweepTelegraph(enemy, telegraph.lanes);
    else if (telegraph.kind === 'charge_corridor') createChargeTelegraph(enemy, telegraph.direction);
    else if (telegraph.kind === 'summon_ring') createSummonTelegraph(enemy);
    else createMuzzleChargeTelegraph(enemy);
  };

  const resolveMiniBossAnchor = (enemy, aiState = enemy?._miniBossAiState) => {
    const profile = getCampaignMiniBossAiProfileV281(enemy?._encounterAiProfileId);
    if (!profile || !aiState) return null;
    return resolveCampaignMiniBossAnchorV29({
      profileId: profile.id,
      cycle: aiState.cycle,
      targetLane: aiState.targetLane,
      requestedOffsetZ: profile.anchorOffsetZ,
      arenaHalfWidth: boundX(),
      worldHalfHeight: ZOOM,
      viewportHeight: battleViewportMetrics.cssH,
      hudOcclusionLineZ: enemyEntryPolicy.engagementLineZ,
      entityScale: enemy._encounterScale || 1,
      hpBarOffsetPx: enemy._miniHpOffsetPx || -40,
      hpBarHeightPx: enemy._encounterFeatured ? 8 : 7,
      playerZ: playerRoot.position.z,
    });
  };

  const stepMiniBossEnemy = (enemy, nowMs, enemyFrame, frameDeltaMs) => {
    const profile = getCampaignMiniBossAiProfileV281(enemy?._encounterAiProfileId);
    if (!profile || !enemy?._miniBossAiState || !enemy.mesh?.position) return false;
    enemy._miniBossMotionState ||= createCampaignMiniBossMotionStateV29();
    const currentAnchor = resolveMiniBossAnchor(enemy);
    if (!currentAnchor) return false;
    const atAnchor = Math.hypot(
      currentAnchor.x - enemy.mesh.position.x,
      currentAnchor.z - enemy.mesh.position.z,
    ) <= .45;
    const result = stepCampaignMiniBossAiV281(enemy._miniBossAiState, {
      nowMs,
      atAnchor,
      enemyX: enemy.mesh.position.x,
      enemyZ: enemy.mesh.position.z,
      playerX: playerRoot.position.x,
      playerZ: playerRoot.position.z,
      hpRatio: enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0,
      addsAlive: countEncounterReinforcements(enemy),
    });
    enemy._miniBossAiState = result.state;

    for (const telegraph of enemy._encounterTelegraphs || []) {
      if (!telegraph?.isDisposed?.()) {
        const pulse = .94 + .08 * Math.sin(nowMs * .018);
        if (enemy._encounterTelegraphKind !== 'lane_zones') {
          telegraph.scaling.x = pulse;
          telegraph.scaling.z = pulse;
        }
        telegraph.visibility = .58 + .18 * Math.sin(nowMs * .022);
      }
    }
    if (enemy._chargeTelegraph && !enemy._chargeTelegraph.isDisposed?.()) {
      enemy._chargeTelegraph.visibility = .55 + .20 * Math.sin(nowMs * .02);
    }

    for (const event of result.events) {
      if (event.type === 'telegraph_started') {
        applyMiniBossTelegraph(enemy, event.telegraph);
        enemy.visual?.setState('attack');
      } else if (event.type === 'telegraph_ended') {
        disposeEncounterTelegraph(enemy);
        disposeChargeTelegraph(enemy);
        if (!enemy._encounterMechanicComplete) completeEncounterMechanic(enemy);
      } else if (event.type === 'fire_lane_volley') {
        fireMiniBossLaneVolley(enemy, event);
        enemy.visual?.setState('attack');
      } else if (event.type === 'fire_aimed_burst') {
        fireMiniBossAimedBurst(enemy, event);
        enemy.visual?.setState('attack');
      } else if (event.type === 'summon') {
        spawnEncounterReinforcements(enemy);
      }
    }

    const nextAnchor = resolveMiniBossAnchor(enemy, result.state) || currentAnchor;
    const movement = result.movement || { mode: 'hold', facePlayer: true };
    const motion = stepCampaignMiniBossMotionV29(enemy._miniBossMotionState, {
      profileId: profile.id,
      mode: movement.mode,
      nowMs,
      frameScale: enemyFrame,
      baseSpeed: enemy.speed,
      enemyX: enemy.mesh.position.x,
      enemyZ: enemy.mesh.position.z,
      targetX: nextAnchor.x,
      targetZ: nextAnchor.z,
      directionX: movement.direction?.x,
      directionZ: movement.direction?.z,
      speedMultiplier: movement.speedMultiplier,
    });
    const beforeX = enemy.mesh.position.x;
    const beforeZ = enemy.mesh.position.z;
    enemy.mesh.position.x = clamp(enemy.mesh.position.x + motion.deltaX, -boundX() + .65, boundX() - .65);
    enemy.mesh.position.z += motion.deltaZ;

    if (movement.mode === 'hold') {
      const faceDirection = profile.attackType === 'charge_cycle'
        && result.state.phase === 'telegraph'
        ? result.state.lockedDirection
        : {
            x: playerRoot.position.x - enemy.mesh.position.x,
            z: playerRoot.position.z - enemy.mesh.position.z,
          };
      updateEnemyFacing(enemy, faceDirection.x, faceDirection.z, frameDeltaMs);
      if (result.state.phase === 'recover') enemy.visual?.setState('idle');
    } else {
      updateEnemyFacing(enemy,
        enemy.mesh.position.x - beforeX,
        enemy.mesh.position.z - beforeZ,
        frameDeltaMs);
      enemy.visual?.setState('move');
    }
    return true;
  };

  const fireAimedEnemyBullet = (enemy, speed = null, priority = 'normal') => {
    if (!enemy?.mesh?.position) return false;
    const origin = resolveEncounterMuzzleOrigin(enemy)
      || Object.freeze({ x: enemy.mesh.position.x, y: 0, z: enemy.mesh.position.z });
    const projectileSpeed = Number.isFinite(Number(speed))
      ? Number(speed) : Math.max(.18, Number(enemy._projectileSpeed) || .34);
    const shotPlan = createCampaignEnemyShotPlanV31({
      origin,
      target: { x: playerRoot.position.x, z: playerRoot.position.z },
      targetVelocity: playerVelocityFrame,
      projectileSpeed,
      aimMode: enemy._projectileAimMode || 'predictive',
      leadFactor: enemy._projectileLeadFactor ?? .78,
      maxLeadMs: enemy._projectileMaxLeadMs ?? 680,
      guidanceMs: enemy._projectileGuidanceMs ?? 0,
      turnRateRadians: enemy._projectileTurnRateRadians ?? 0,
      lifetimeMs: enemy._projectileLifetimeMs ?? 4200,
      sourceRole: enemy._waveRole || enemy._encounterKind || null,
      priority,
      damageType: enemy._damageType || 'energy',
      createdAtMs: Date.now(),
    });
    return fireEnemyBullet(
      new BABYLON.Vector3(shotPlan.origin.x, 0, shotPlan.origin.z),
      shotPlan.velocity.x,
      shotPlan.velocity.z,
      {
        priority,
        rawDamage: enemy._projectileDamage || 200,
        damageType: enemy._damageType || 'energy',
        sourceRole: enemy._waveRole || enemy._encounterKind || null,
        shotPlan,
      },
    );
  };

  const resolveEnemySeparation = enemy => {
    if (!enemy?.mesh?.position || enemy._encounterFeatured) return { x: 0, z: 0 };
    let separationX = 0;
    let separationZ = 0;
    let contributors = 0;
    const radius = 1.9;
    for (const candidate of enemies) {
      if (candidate === enemy || candidate._dead || candidate._encounterFeatured
        || !candidate.mesh?.position || candidate.mesh.isDisposed?.()
        || !enemyEntryPolicy.isEngageable(candidate._entryState)) continue;
      const dx = enemy.mesh.position.x - candidate.mesh.position.x;
      const dz = enemy.mesh.position.z - candidate.mesh.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= .001 || distance >= radius) continue;
      const weight = (radius - distance) / radius;
      separationX += dx / distance * weight;
      separationZ += dz / distance * weight;
      contributors += 1;
    }
    if (!contributors) return { x: 0, z: 0 };
    const length = Math.hypot(separationX, separationZ) || 1;
    return {
      x: separationX / length * Math.min(1, contributors * .34),
      z: separationZ / length * Math.min(1, contributors * .24),
    };
  };

  const stepChoreographedEnemy = (enemy, nowMs, enemyFrame, frameDeltaMs) => {
    if (!enemy?._choreographyState) return null;
    const separation = resolveEnemySeparation(enemy);
    const result = stepCampaignEnemyChoreographyV29(enemy._choreographyState, {
      nowMs,
      frameScale: enemyFrame,
      baseSpeed: enemy.speed,
      enemyX: enemy.mesh.position.x,
      enemyZ: enemy.mesh.position.z,
      playerX: playerRoot.position.x,
      playerZ: playerRoot.position.z,
      arenaHalfWidth: boundX(),
      worldHalfHeight: ZOOM,
      viewportHeight: battleViewportMetrics.cssH,
      hudOcclusionLineZ: enemyEntryPolicy.engagementLineZ,
      entityScale: enemy._encounterScale || 1,
      hpBarOffsetPx: enemy._miniHpOffsetPx || -28,
      hpBarHeightPx: enemy._encounterFeatured ? 7 : 5,
      separationX: separation.x,
      separationZ: separation.z,
      fireCooldownMs: enemy.shootMs,
    });
    if (!result.handled) return null;
    if (result.completed) return result;

    const beforeX = enemy.mesh.position.x;
    const beforeZ = enemy.mesh.position.z;
    enemy.mesh.position.x = clamp(enemy.mesh.position.x + result.deltaX, -boundX() + .35, boundX() - .35);
    enemy.mesh.position.z += result.deltaZ;
    if (result.facePlayer) {
      updateEnemyFacing(enemy,
        playerRoot.position.x - enemy.mesh.position.x,
        playerRoot.position.z - enemy.mesh.position.z,
        frameDeltaMs);
    } else {
      updateEnemyFacing(enemy,
        enemy.mesh.position.x - beforeX,
        enemy.mesh.position.z - beforeZ,
        frameDeltaMs);
    }

    if (result.fireWindup) enemy.visual?.setState('attack');
    else if (result.egress) enemy.visual?.setState('move');
    if (result.mayFire && enemy.canShoot && !guestAbilities?.modifiers().cloaked
      && nowMs > enemy.lastShoot + (result.fireCooldownMs || enemy.shootMs)) {
      fireAimedEnemyBullet(enemy);
      enemy.visual?.setState('attack');
      enemy.lastShoot = nowMs;
    }
    return result;
  };

  const stepBossPreviewEnemy = (enemy, nowMs, enemyFrame, frameDeltaMs) => {
    if (enemy?._encounterKind !== 'boss_preview' || !enemy.mesh?.position) return null;
    enemy._previewMotionState ||= createCampaignBossPreviewMotionStateV29({
      lane: enemy._spawnLane,
      strafeDirection: enemy._spawnStrafeDirection,
      seed: enemy._motionSeed,
      nowMs,
    });
    const result = stepCampaignBossPreviewMotionV29(enemy._previewMotionState, {
      nowMs,
      frameScale: enemyFrame,
      baseSpeed: enemy.speed,
      enemyX: enemy.mesh.position.x,
      enemyZ: enemy.mesh.position.z,
      playerX: playerRoot.position.x,
      playerZ: playerRoot.position.z,
      arenaHalfWidth: boundX(),
      worldHalfHeight: ZOOM,
      viewportHeight: battleViewportMetrics.cssH,
      hudOcclusionLineZ: enemyEntryPolicy.engagementLineZ,
      entityScale: enemy._encounterScale || 1,
      hpBarOffsetPx: enemy._miniHpOffsetPx || -34,
      hpBarHeightPx: 7,
      mechanicPhase: enemy._encounterMechanicPhase,
      mechanicComplete: enemy._encounterMechanicComplete,
      attackPlanPhase: enemy._encounterAttackPlan?.phase,
      attackPlanId: enemy._encounterAttackPlan?.id,
    });
    enemy._previewCanArm = Boolean(result.canArm);
    if (!result.handled) return result;

    const beforeX = enemy.mesh.position.x;
    const beforeZ = enemy.mesh.position.z;
    enemy.mesh.position.x = clamp(enemy.mesh.position.x + result.deltaX, -boundX() + .55, boundX() - .55);
    enemy.mesh.position.z += result.deltaZ;
    const mayFacePlayer = result.facePlayer
      && !['attack_hold', 'ready'].includes(result.phaseId);
    if (mayFacePlayer) {
      updateEnemyFacing(enemy,
        playerRoot.position.x - enemy.mesh.position.x,
        playerRoot.position.z - enemy.mesh.position.z,
        frameDeltaMs);
    } else if (!result.holdOrientation) {
      updateEnemyFacing(enemy,
        enemy.mesh.position.x - beforeX,
        enemy.mesh.position.z - beforeZ,
        frameDeltaMs);
    }
    enemy.visual?.setState(result.mayFire ? 'attack'
      : result.holdOrientation ? 'idle' : 'move');
    if (result.mayFire && enemy.canShoot && !guestAbilities?.modifiers().cloaked
      && nowMs > enemy.lastShoot + enemy.shootMs) {
      fireAimedEnemyBullet(enemy);
      enemy.lastShoot = nowMs;
    }
    return result;
  };

  /** Fallback mesh nếu không có imgSrc */
  const buildFallbackEnemy = (tier) => {
    let m;
    switch (tier) {
      case 2: m = BABYLON.MeshBuilder.CreateBox(`ef2_${Date.now()}`, { width:2.0, depth:2.0, height:.45 }, scene); break;
      case 3: m = BABYLON.MeshBuilder.CreateCylinder(`ef3_${Date.now()}`, { diameterTop:1.2, diameterBottom:.5, height:.45, tessellation:6 }, scene); break;
      case 4:
        // Readable top-down dart fallback. The former vertical torus was nearly
        // edge-on to the camera, leaving only the linked HP bar visible.
        m = BABYLON.MeshBuilder.CreateCylinder(`ef4_${Date.now()}`, {
          diameterTop:.35,diameterBottom:1.9,height:.45,tessellation:3,
        }, scene);
        m.scaling.z = 1.25;
        break;
      default: m = BABYLON.MeshBuilder.CreateSphere(`ef1_${Date.now()}`, { diameterX:1.6, diameterZ:1.6, diameterY:.4 }, scene);
    }
    m.material = makeMat(scene, TIER_COL[tier] || TIER_COL[1]);
    return m;
  };

  const spawnEnemy = (spawnSpec = null) => {
    if (enemies.length >= runtimeLimits.maxActiveEnemies) {
      runtimeCapacityClamps.enemies++;
      return false;
    }
    let tier;
    if(spawnSpec){
      tier=clamp(Math.trunc(Number(spawnSpec.tier)||1),1,4);
    }else{
      const rand = Math.random() * 100;
      tier = 1;
      if (currentStage >= 2 && rand > 50) tier = 2;
      if (currentStage >= 4 && rand > 75) tier = 3;
      if (currentStage >= 6 && rand > 85) tier = 4;
    }

    const cfg    = curEnemyCfgs.find(e => e.tier === tier) || curEnemyCfgs[0];
    const spawnX = spawnSpec
      ?clamp(Number(spawnSpec.lane)||0,-.88,.88)*boundX()
      :playerRoot.position.x + (Math.random() - .5) * boundX() * 1.6;
    // Deterministic choreography enters just outside the readable arena so
    // the entry remains visible without spending several seconds drifting in
    // from an unnecessarily distant off-screen point. Legacy fallback keeps
    // its original spawn depth.
    const spawnZ = spawnSpec ? -ZOOM - 1.8 : -ZOOM - 3;

    // Gameplay/collision root is always stable. Artwork may arrive later via
    // asset manifest; no asset load may replace this root mid-battle.
    const mesh = buildFallbackEnemy(tier);
    mesh.position.set(spawnX, .2, spawnZ);
    // Source art is authored nose -Z, while BattleEntityVisual converts the
    // gameplay root to +Z-forward. Entry movement is screen-down (+Z), so yaw 0
    // is the canonical initial heading.
    mesh.rotation.y = 0;
    const encounterScale=Math.max(1,Number(spawnSpec?.scaleMultiplier)||1);
    const motionSeed=stableSeed(
      currentPlanetId,currentStage,currentWave,spawnSpec?.index||0,
      spawnSpec?.archetypeId||'legacy',spawnSpec?.lane||0,
      spawnSpec?.reinforcementGroupId||spawnSpec?.encounterId||'wave',
    );
    const miniHpOffsetPx=spawnSpec?.encounterKind==='mini_boss'
      ?-Math.round(34+Math.max(0,encounterScale-1)*18)
      :spawnSpec?.encounterKind==='boss_preview'
        ?-Math.round(31+Math.max(0,encounterScale-1)*14):-28;
    if(encounterScale>1){mesh.scaling.x*=encounterScale;mesh.scaling.z*=encounterScale;}
    const visualProfile=createReadableFastEnemyProfileV26A2(
      resolveAssetVisual('enemy',cfg.id),{tier});
    const visual = attachBattleEntityVisual(scene, BABYLON, mesh, 'enemy', cfg.id,
      {profile:visualProfile});
    const entryHalo = BABYLON.MeshBuilder.CreateTorus(`entry_${mesh.uniqueId}`, {
      diameter:tier===4?2.7:2.25,thickness:.075,tessellation:28,
    }, scene);
    entryHalo.parent=mesh;
    entryHalo.position.y=.36;
    entryHalo.material=tier===4?fastEntryHaloMat:entryHaloMat;
    entryHalo.isPickable=false;
    entryHalo.visibility=.72;

    const speedRoll=spawnSpec?clamp(Number(spawnSpec.speedRoll)||0,0,1):Math.random();
    const rawSpeed = cfg.speedMin + speedRoll * (cfg.speedMax - cfg.speedMin);
    const speed    = rawSpeed / 1200 * (spawnSpec?.speedMultiplier||1);   // pixels/s → Babylon units/frame@60fps

    let baseHp = cfg.baseHp + currentStage * 15 + currentWave * 5;
    // PLANET_ENEMIES already owns planet-specific base HP. Production V3 plans
    // add role/wave/planet tactical scaling exactly once; applying the legacy
    // environment multiplier again would double/triple-scale later planets.
    const environmentHpMultiplier = spawnSpec ? 1 : combat.environment.enemyHpMultiplier;
    baseHp = Math.floor(baseHp * environmentHpMultiplier * (spawnSpec?.hpMultiplier || 1));
    const ptsBase=isReplay ? Math.max(1, Math.floor(cfg.score / 2)) : cfg.score;
    const ptsMultiplier=Number(spawnSpec?.pointsMultiplier)||(spawnSpec?.elite?2:1);
    const pts  = Math.max(1,Math.round(ptsBase*ptsMultiplier));
    if(spawnSpec?.elite){
      mesh.scaling.x*=1.14;mesh.scaling.z*=1.14;
      entryHalo.scaling.x=1.12;entryHalo.scaling.z=1.12;
    }

    // Mini HP bar
    const miniHpBg = new GUI.Rectangle(`ehb_${mesh.uniqueId}`);
    miniHpBg.width = `${spawnSpec?.encounterKind==='mini_boss'?82:spawnSpec?.encounterFeatured?72:46}px`;
    miniHpBg.height = `${spawnSpec?.encounterKind==='mini_boss'?8:spawnSpec?.encounterFeatured?7:5}px`;
    miniHpBg.background = '#111'; miniHpBg.color = '#ffffff30';
    miniHpBg.cornerRadius = 3; miniHpBg.thickness = 1;
    ui.addControl(miniHpBg);
    miniHpBg.linkWithMesh(mesh);
    miniHpBg.linkOffsetYInPixels = miniHpOffsetPx;
    miniHpBg.isVisible = false;

    const miniHp = new GUI.Rectangle(`ehf_${mesh.uniqueId}`);
    miniHp.width = '100%'; miniHp.height = '100%';
    miniHp.background = spawnSpec?.encounterKind==='mini_boss'?'#ff8c2a'
      :spawnSpec?.encounterKind==='boss_preview'?'#bd7cff'
      :spawnSpec?.elite?'#ffd166':tier===3?'#ffdd55': tier===2?'#ff8a66':'#66ddff';
    miniHp.thickness = 0; miniHp.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    miniHpBg.addControl(miniHp);

    const legacyMotion=spawnSpec?null:{
      velX: tier===4 ? 0 : (Math.random()-.5)*.05,
      sineOff: Math.random() * Math.PI * 2,
      canShoot: tier !== 4 && Math.random() > .5,
      lastShoot: 0, shootMs: tier===3 ? 1400 : 2200,
    };
    const miniBossAiState = spawnSpec?.encounterKind === 'mini_boss'
      && spawnSpec?.encounterAiProfileId
      ? createCampaignMiniBossAiStateV281({
        profileId: spawnSpec.encounterAiProfileId,
        nowMs: Date.now(),
      }) : null;
    const choreographyState=spawnSpec&&!spawnSpec.encounterFeatured&&tier!==4
      ?createCampaignEnemyChoreographyStateV29({
        roleId:spawnSpec.archetypeId,lane:spawnSpec.lane,
        strafeDirection:spawnSpec.strafeDirection,seed:motionSeed,nowMs:Date.now(),
        routeVariant:spawnSpec.routeVariant,
      }):null;
    const previewMotionState=spawnSpec?.encounterKind==='boss_preview'
      ?createCampaignBossPreviewMotionStateV29({
        lane:spawnSpec.lane,strafeDirection:spawnSpec.strafeDirection,
        seed:motionSeed,nowMs:Date.now(),
      }):null;
    const miniBossMotionState=miniBossAiState?createCampaignMiniBossMotionStateV29():null;
    enemies.push({
      mesh, visual, hp: baseHp, maxHp: baseHp, tier, speed,
      velX: spawnSpec?(tier===4?0:(Number(spawnSpec.strafeDirection)||1)*.035):legacyMotion.velX,
      sineOff: spawnSpec?Number(spawnSpec.sinePhase)||0:legacyMotion.sineOff,
      isBoss: false, isEnraged: false,
      canShoot: spawnSpec?Boolean(spawnSpec.canShoot):legacyMotion.canShoot,
      lastShoot: spawnSpec?Date.now():legacyMotion.lastShoot,
      shootMs: spawnSpec?.shootMs||legacyMotion?.shootMs||2200,
      points: pts, miniHpBg, miniHp, entryHalo, _dead: false,
      _routeVariant:spawnSpec?.routeVariant||null,
      _projectileSpeed:Math.max(.12,Number(spawnSpec?.projectileSpeed)||.24),
      _projectileDamage:Math.max(1,Math.round(Number(spawnSpec?.projectileDamage)||200)),
      _projectileAimMode:spawnSpec?.projectileAimMode||'predictive',
      _projectileLeadFactor:Number.isFinite(Number(spawnSpec?.projectileLeadFactor))
        ?Number(spawnSpec.projectileLeadFactor):.78,
      _projectileMaxLeadMs:Math.max(0,Number(spawnSpec?.projectileMaxLeadMs)||680),
      _projectileGuidanceMs:Math.max(0,Number(spawnSpec?.projectileGuidanceMs)||0),
      _projectileTurnRateRadians:Math.max(0,Number(spawnSpec?.projectileTurnRateRadians)||0),
      _projectileLifetimeMs:Math.max(1600,Number(spawnSpec?.projectileLifetimeMs)||4200),
      _contactDamage:Math.max(1,Math.round(Number(spawnSpec?.contactDamage)||(tier===4?400:200))),
      _damageMultiplier:Number(spawnSpec?.damageMultiplier)||1,
      _damageType:spawnSpec?.damageType||'kinetic',
      _waveRole:spawnSpec?.archetypeId||null,
      _waveElite:Boolean(spawnSpec?.elite),
      _motionSeed:motionSeed,
      _spawnLane:Number(spawnSpec?.lane)||0,
      _spawnStrafeDirection:Number(spawnSpec?.strafeDirection)||1,
      _encounterScale:encounterScale,
      _miniHpOffsetPx:miniHpOffsetPx,
      _choreographyState:choreographyState,
      _previewMotionState:previewMotionState,
      _previewCanArm:false,
      _entryState:enemyEntryPolicy.createState({tier}),
      _contactHitId: `campaign-enemy-contact-${mesh.uniqueId}`,
      _facingYaw: 0,
      _chargerState: tier === 4 ? createChargerMotionStateV26A3({ nowMs: Date.now() }) : null,
      _chargeTelegraph: null,
      _encounterKind:spawnSpec?.encounterKind||null,
      _encounterId:spawnSpec?.encounterId||null,
      _encounterLabel:spawnSpec?.encounterLabel||null,
      _encounterFeatured:Boolean(spawnSpec?.encounterFeatured),
      _encounterMechanicId:spawnSpec?.encounterMechanicId||null,
      _encounterAiProfileId:spawnSpec?.encounterAiProfileId||null,
      _miniBossAiState:miniBossAiState,
      _miniBossMotionState:miniBossMotionState,
      _encounterTelegraphMs:Number(spawnSpec?.mechanicTelegraphMs)||850,
      _encounterSummonRoles:Object.freeze([...(spawnSpec?.mechanicSummonRoles||[])]),
      _encounterMechanicProtected:Boolean(spawnSpec?.encounterFeatured&&spawnSpec?.protectUntilMechanic),
      _encounterMechanicComplete:!Boolean(spawnSpec?.encounterFeatured),
      _encounterMechanicPhase:spawnSpec?.encounterFeatured?'idle':'complete',
      _encounterTelegraphs:[],
      _encounterTelegraphKind:null,
      _encounterAttackPlan:null,
      _encounterAttackCorridors:[],
      _reinforcementGroupId:spawnSpec?.reinforcementGroupId||null,
      _encounterReinforcementGroupId:null,
      _bossSupport:Boolean(spawnSpec?.bossSupport),
    });
    return true;
  };

  const cleanEnemy = (e, killedByDamage = false) => {
    if (e._dead) return;
    e._dead = true; // prevent repeated kills/rewards before any rendering work
    if (killedByDamage) deathVisuals.capture(e.visual);
    else e.visual?.dispose();
    safeDisposeGui(e.miniHp); safeDisposeGui(e.miniHpBg);
    safeDispose(e.entryHalo); e.entryHalo=null;
    safeDispose(e._chargeTelegraph); e._chargeTelegraph=null;
    disposeEncounterTelegraph(e);
    e._encounterAttackPlan = null;
    safeDispose(e.mesh); // authoritative hitbox is gone THIS frame
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 10. BOSS SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  let bossMesh    = null, bossVisual = null, bossHp = 0, bossMaxHp = 0;
  let bossEnraged = false, bossPts = 0;
  let bossVelX    = 0.028, bossFloatT = 0, nextBossFire = 0;
  let bossRevealHalo = null, bossFrenzyAura = null, bossIntroStartedAt = 0;
  let bossPhaseState=campaignCombatV3Enabled?createBossPhaseStateV28(currentPlanetId):null;
  let bossPhaseTransition=null;
  let bossCombatState=null;
  let bossAttackTelegraphs=[];
  let bossSupportSequence=0;
  const bossSupportGroups=new Map();
  const bossMuzzleLocal=new BABYLON.Vector3(0,0,1.9);

  const buildFallbackBoss = (bType) => {
    const m = BABYLON.MeshBuilder.CreateSphere('bFb', { diameter: 3.8, segments: 24 }, scene);
    m.material = makeMat(scene, new BABYLON.Color3(1, .2, .2));
    const ring = BABYLON.MeshBuilder.CreateTorus('bRingFb', { diameter: 7.5, thickness: .45, tessellation: 48 }, scene);
    ring.parent = m; ring.rotation.x = Math.PI/2;
    ring.material = makeMat(scene, new BABYLON.Color3(1, .5, 0));
    return m;
  };

  const clearProjectilesForBossIntro = () => {
    for (const projectile of playerBullets.splice(0)) safeDispose(projectile);
    for (const projectile of enemyBullets.splice(0)) safeDispose(projectile);
  };

  const cleanBossReveal = () => {
    safeDispose(bossRevealHalo);
    bossRevealHalo = null;
  };

  const disposeBossFrenzyAura = () => {
    safeDispose(bossFrenzyAura);
    bossFrenzyAura = null;
  };

  const ensureBossFrenzyAura = () => {
    if (!bossMesh || bossMesh.isDisposed?.()) return null;
    if (bossFrenzyAura && !bossFrenzyAura.isDisposed?.()) return bossFrenzyAura;
    bossFrenzyAura = BABYLON.MeshBuilder.CreateTorus('boss_frenzy_aura_v31', {
      diameter: 6.6,
      thickness: .24,
      tessellation: 56,
    }, scene);
    bossFrenzyAura.parent = bossMesh;
    bossFrenzyAura.position.set(0, .10, 0);
    bossFrenzyAura.material = makeMat(scene, new BABYLON.Color3(1, .06, .02));
    bossFrenzyAura.isPickable = false;
    bossFrenzyAura.visibility = .78;
    return bossFrenzyAura;
  };

  const activateBossFrenzyV31 = ({ announce = true } = {}) => {
    const firstActivation = !bossEnraged;
    bossEnraged = true;
    ensureBossFrenzyAura();
    bossVisual?.setState('enrage');
    if (announce && firstActivation) {
      showAnnouncement(lang==='vi'?'CẢNH BÁO: TRÙM NỔI ĐIÊN!':'WARNING: BOSS ENRAGED!','#ff2a16',2200);
    }
    return firstActivation;
  };

  const disposeBossAttackTelegraph = () => {
    for (const corridor of bossAttackTelegraphs) safeDispose(corridor);
    bossAttackTelegraphs=[];
  };

  const resolveBossMuzzleOrigin = () => {
    if(!bossMesh||bossMesh.isDisposed?.())return null;
    bossMesh.computeWorldMatrix(true);
    const world=BABYLON.Vector3.TransformCoordinates(bossMuzzleLocal,bossMesh.getWorldMatrix());
    return Object.freeze({x:world.x,y:0,z:world.z});
  };

  const updateBossFacing = (velocityX,velocityZ,deltaMs) => {
    if(!bossMesh||bossMesh.isDisposed?.())return;
    bossMesh._facingYaw=resolveEnemyGameplayYawV26A4({
      currentYaw:bossMesh._facingYaw,
      velocityX,velocityZ,
      maxTurnRadians:5.2*Math.max(0,Math.min(100,deltaMs))/1000,
    });
    bossMesh.rotation.y=bossMesh._facingYaw;
  };

  const createBossAttackTelegraph = plan => {
    disposeBossAttackTelegraph();
    if(!plan?.paths?.length)return [];
    bossAttackTelegraphs=plan.paths.map((path,index)=>{
      const corridor=BABYLON.MeshBuilder.CreateBox(`boss_attack_v29_${plan.id}_${index}`,{
        width:1,height:.025,depth:1,
      },scene);
      corridor.position.set(path.midpoint.x,.045,path.midpoint.z);
      corridor.rotation.y=path.yawRadians;
      corridor.scaling.set(path.width,1,path.length);
      corridor.material=bossAttackDangerMat;
      corridor.isPickable=false;
      corridor.visibility=.66;
      return corridor;
    });
    return bossAttackTelegraphs;
  };

  const fireBossAttackPlan = plan => {
    if(!plan?.paths?.length)return 0;
    const planId=plan.id;
    let scheduled=0;
    for(const projectile of projectilesFromCampaignBossAttackPlanV29(plan)){
      const fire=()=>{
        if(battleSceneDisposed||gameOver||gameState!=='BOSS_FIGHT'
          ||!bossMesh||bossMesh.isDisposed?.()||bossHp<=0)return;
        if(campaignCombatV3Enabled&&bossCombatState?.attackPlan?.id!==planId)return;
        fireEnemyBullet(
          new BABYLON.Vector3(projectile.origin.x,0,projectile.origin.z),
          projectile.velocity.x,projectile.velocity.z,{priority:'boss',sourceRole:'boss'},
        );
      };
      if(projectile.fireOffsetMs>0)scheduleBattleTimer(fire,projectile.fireOffsetMs);
      else fire();
      scheduled+=1;
    }
    return scheduled;
  };

  const prepareBoss = () => {
    if (bossMesh && !bossMesh.isDisposed?.()) return bossMesh;
    const bType   = stageConfig.bossType || 'mech';
    const bossCfg = curBossCfgs[bType] || Object.values(curBossCfgs)[0];

    bossHp    = Math.floor((bossCfg.baseHp || 25000) * combat.environment.enemyHpMultiplier);
    bossMaxHp = bossHp; bossEnraged = false;
    disposeBossFrenzyAura();
    bossPts   = isReplay ? Math.max(10, Math.floor((bossCfg.score||100)/3)) : (bossCfg.score||100);
    bossPhaseState=campaignCombatV3Enabled?createBossPhaseStateV28(currentPlanetId):null;
    bossPhaseTransition=null;
    bossCombatState=campaignCombatV3Enabled?createCampaignBossCombatStateV29({
      seed:stableSeed(currentPlanetId,currentStage,'final_boss'),nowMs:Date.now(),
    }):null;
    bossSupportGroups.clear();
    disposeBossAttackTelegraph();

    bossMesh = buildFallbackBoss(bType);
    bossMesh.position.set(0, .5, -ZOOM + 7);
    bossMesh._facingYaw=0;
    bossMesh._contactHitId = 'campaign-boss-contact';
    bossMesh.setEnabled(false);
    bossVisual = attachBattleEntityVisual(scene, BABYLON, bossMesh, 'boss', bossCfg.id);
    bossVisual?.setState('spawn');

    bossNameText.text = `⚠ ${lang==='vi' ? `TRÙM ẢI ${currentStage}` : `STAGE ${currentStage} BOSS`}`;
    bossHpFill.width  = '100%';
    bossPanel.isVisible = false;

    cleanBossReveal();
    bossRevealHalo = BABYLON.MeshBuilder.CreateTorus('boss_reveal_v26a3', {
      diameter: 7.2, thickness: .16, tessellation: 48,
    }, scene);
    bossRevealHalo.position.set(0, .08, -ZOOM + 7);
    bossRevealHalo.material = makeMat(scene, new BABYLON.Color3(1, .18, .12));
    bossRevealHalo.isPickable = false;
    return bossMesh;
  };

  const bossSupportDamageMultiplier = () => {
    let multiplier=1;
    for(const [groupId,group] of bossSupportGroups){
      const alive=enemies.some(enemy=>!enemy._dead&&enemy._reinforcementGroupId===groupId);
      if(!alive){bossSupportGroups.delete(groupId);continue;}
      multiplier=Math.min(multiplier,Number(group.damageMultiplier)||1);
    }
    return multiplier;
  };

  const spawnBossPhaseReinforcements = gate => {
    if(!campaignWaveDirector||!gate?.summonRoles?.length)return null;
    const groupId=`boss-${gate.id}-${++bossSupportSequence}`;
    bossSupportGroups.set(groupId,Object.freeze({
      damageMultiplier:Number(gate.bossDamageMultiplierWhileAddsAlive)||1,
    }));
    const plan=campaignWaveDirector.buildReinforcementPlan({
      roles:gate.summonRoles,
      formation:gate.formation||'pincer',
      groupId,
    });
    plan.forEach((spec,index)=>scheduleBattleTimer(()=>{
      if(!battleSceneDisposed&&!gameOver&&bossMesh){
        spawnEnemy({...spec,bossSupport:true,reinforcementGroupId:groupId,hpMultiplier:spec.hpMultiplier*.9});
      }
    },index*190));
    return groupId;
  };

  const beginBossPhaseTransition = gate => {
    if(!gate||bossPhaseTransition||!bossMesh)return false;
    const nowMs=Date.now();
    disposeBossAttackTelegraph();
    if(bossCombatState){
      bossCombatState.attackPlan=null;
      bossCombatState.phase='reposition';
      bossCombatState.phaseStartedAt=nowMs;
      bossCombatState.targetX=null;
      bossCombatState.targetZ=null;
      bossCombatState.velocityX=0;
      bossCombatState.velocityZ=0;
    }
    bossPhaseTransition=Object.freeze({gate,startedAt:nowMs,endsAt:nowMs+gate.transitionMs});
    for(let index=enemyBullets.length-1;index>=0;index--){
      if(enemyBullets[index]?._priority==='boss'){
        safeDispose(enemyBullets[index]);enemyBullets.splice(index,1);
      }
    }
    bossVisual?.setState('enrage');
    showAnnouncement(gate.label?.[lang==='vi'?'vi':'en']||gate.id,'#ff9f43',Math.min(1400,gate.transitionMs+350));
    scheduleBattleTimer(()=>spawnBossPhaseReinforcements(gate),Math.min(360,Math.floor(gate.transitionMs*.45)));
    scheduleBattleTimer(()=>{
      bossPhaseState=completeBossPhaseGateV28(bossPhaseState);
      bossPhaseTransition=null;
      nextBossFire=Date.now()+850;
    },gate.transitionMs);
    return true;
  };

  const activateBossFight = () => {
    if (!bossMesh || bossMesh.isDisposed?.()) return false;
    cleanBossReveal();
    bossMesh.setEnabled(true);
    bossVisual?.setState('move');
    bossPanel.isVisible = !externalHud;
    if(campaignCombatV3Enabled)bossCombatState=createCampaignBossCombatStateV29({
      seed:stableSeed(currentPlanetId,currentStage,'final_boss'),nowMs:Date.now(),
    });
    nextBossFire = Date.now() + bossIntroPlan.firstAttackDelayMs;
    setGameState('BOSS_FIGHT');
    return true;
  };

  const startBossIntro = () => {
    clearProjectilesForBossIntro();
    bossIntroStartedAt = Date.now();
    setGameState('BOSS_INTRO');
    showAnnouncement(
      lang==='vi' ? 'CẢNH BÁO:\nTRÙM CUỐI XUẤT HIỆN!' : 'WARNING:\nBOSS APPROACHING!',
      '#ff4757', bossIntroPlan.warningMs);
    scheduleBattleTimer(() => {
      prepareBoss();
      scheduleBattleTimer(activateBossFight, bossIntroPlan.revealMs);
    }, bossIntroPlan.warningMs);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 11. DROPS
  // ══════════════════════════════════════════════════════════════════════════

  const drops = [];
  const dropMats = {
    coin:  makeMat(scene, new BABYLON.Color3(1, .85, 0)),
    heal:  makeMat(scene, new BABYLON.Color3(.2, .85, .2)),
    power: makeMat(scene, new BABYLON.Color3(.2, .6, 1)),
  };

  const spawnDrop = (x, z, type) => {
    let mesh;
    if (type==='coin')  mesh = BABYLON.MeshBuilder.CreateCylinder(`dc_${Date.now()}`, { diameter:.7, height:.15, tessellation:10 }, scene);
    else if (type==='heal') mesh = BABYLON.MeshBuilder.CreateBox(`dh_${Date.now()}`, { width:.6, depth:.6, height:.15 }, scene);
    else mesh = BABYLON.MeshBuilder.CreateSphere(`dp_${Date.now()}`, { diameter:.6 }, scene);
    mesh.position.set(x, .1, z);
    mesh.material = dropMats[type];
    drops.push({ mesh, type, _dead: false });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 12. WAVE SYSTEM + GAME STATE
  // ══════════════════════════════════════════════════════════════════════════

  const MAX_WAVES   = stageConfig.waves || 5;
  const CAMPAIGN_WAVES_TOTAL = campaignStagePlan?.totalWaves || MAX_WAVES;
  let currentWave   = 0;
  let waveCount     = 0;   // total enemies to spawn in current wave
  let waveSpawned   = 0;
  let lastSpawn     = 0;
  let spawnInterval = 1200;
  let currentWavePlan = null;
  let currentWaveStartedAt = 0;
  let waveRecoveryDropSpawned = false;
  let gameOver      = false;
  let gameState     = 'TRANSITION';  // PLAYING | BOSS_INTRO | BOSS_FIGHT | TRANSITION | GAMEOVER | CLEAR
  let score         = 0;
  let verifiedClientKills = 0;
  let collectedCoins = 0;
  let startTime     = Date.now();
  let lastPlayerDamageFxAt = -Infinity;
  const PLAYER_DAMAGE_FX_COOLDOWN_MS = 120;
  let tick          = 0;
  let qaResultPublished = false;

  const publishGuestBattleQaResult = outcome => {
    if (!guestAbilityQa || qaResultPublished) return false;
    qaResultPublished = true;
    data.onQaResult?.(createGuestBattleQaResultV26A({
      outcome,
      planetId: currentPlanetId,
      stageId: currentStage,
      isBoss: Boolean(stageConfig.hasBoss),
      kills: verifiedClientKills,
      score,
      hp: stats.hp,
      maxHp: stats.maxHp,
      durationMs: Date.now() - startTime,
    }));
    return true;
  };

  const getGuestAbilityActivationGate=()=>deriveGuestAbilityActivationGateV2({gameState,gameOver});
  const getGuestAbilityHudSnapshot=()=>{
    if(!guestAbilities)return null;
    return Object.freeze({
      ...guestAbilities.snapshot(),
      activationGate:getGuestAbilityActivationGate(),
      qaEquipment:qaEquipmentInfo,
    });
  };
  const publishGuestAbilityState=()=>{
    const snapshot=getGuestAbilityHudSnapshot();
    if(snapshot)data.onAbilityState?.(snapshot);
    return snapshot;
  };
  const setGameState=next=>{
    gameState=String(next||'TRANSITION');
    publishGuestAbilityState();
  };

  const updateScore = delta => {
    score += delta;
    scoreText.text = `${lang==='vi'?'ĐIỂM':'SCORE'}: ${score}`;
  };
  const trackEventKill = () => {
    verifiedClientKills++;
    if (isCloud||guestAbilityQa) return; // QA kills never update a saved guest event.
    recordGuestEventKill(gsRef.current.campaignData, EVENT_CONFIG, getRealTime?.() || Date.now());
  };
  const startWave = n => {
    currentWave   = n;
    currentWavePlan=campaignStagePlan?.waves?.[n-1]||null;
    waveRecoveryDropSpawned=false;
    if(currentWavePlan){
      waveCount=currentWavePlan.entries.length;
      spawnInterval=currentWavePlan.spawnGapMs||1200;
      waveSpawned=0;
      currentWaveStartedAt=Date.now();
      lastSpawn=currentWaveStartedAt;
    }else{
      // Frozen legacy fallback for non-QA lanes. Guest Combat QA uses the
      // deterministic V2.7 stage plan above and never reads these random counts.
      waveCount = (stageConfig.baseEnemies||5) + currentWave * 3;
      spawnInterval = Math.max(300, 1500 - (currentStage*100 + currentWave*50));
      waveSpawned   = 0;
      lastSpawn     = Date.now() + 500;
    }

    waveText.text = lang==='vi'
      ? `ẢI ${currentStage} | ĐỢT ${n}/${CAMPAIGN_WAVES_TOTAL}`
      : `STAGE ${currentStage} | WAVE ${n}/${CAMPAIGN_WAVES_TOTAL}`;

    if (currentWavePlan?.boss || (n === CAMPAIGN_WAVES_TOTAL && stageConfig.hasBoss)) {
      startBossIntro();
      return;
    }
    const planLabel=currentWavePlan?.label?.[lang==='vi'?'vi':'en'];
    showAnnouncement(
      `${lang==='vi'?'TIẾN VÀO ĐỢT':'ENTERING WAVE'} ${n}${planLabel?`\n${planLabel}`:''}`, '#66fcf1');
    setGameState('PLAYING');
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 13. PLAYER DAMAGE / DEATH
  // ══════════════════════════════════════════════════════════════════════════

  const damagePlayer = ({
    rawDamage,
    source = 'contact',
    damageType = 'kinetic',
    hitId = null,
    contactId = null,
    unavoidable = false,
  } = {}) => {
    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    const hpBefore = stats.hp;
    if(gameOver||hpBefore<=0){
      return createPlayerDamageOutcomeV25({
        source,hitId,contactId,rawDamage,hpBefore,hpAfter:stats.hp,
      });
    }
    const gate = playerDamageGate.admitHit({ source, hitId, contactId, nowMs });
    if (!gate.accepted) {
      return createPlayerDamageOutcomeV25({
        gate, source, hitId, contactId, rawDamage, hpBefore, hpAfter: stats.hp,
      });
    }

    const applyRetaliation=(reflection=0,nova=0)=>{
      const total=Math.max(0,reflection)+Math.max(0,nova);
      if(total<=0)return;
      const radiusSquared=nova>0?25:9;
      for(const enemy of [...enemies]){
        if(!enemy.mesh?.position||enemy._dead
          ||!enemyEntryPolicy.isEngageable(enemy._entryState))continue;
        const dx=enemy.mesh.position.x-playerRoot.position.x;
        const dz=enemy.mesh.position.z-playerRoot.position.z;
        if(dx*dx+dz*dz<=radiusSquared)applyPlayerDamageToEnemy(enemy,total);
      }
      if(bossMesh&&!bossMesh.isDisposed?.()){
        const dx=bossMesh.position.x-playerRoot.position.x;
        const dz=bossMesh.position.z-playerRoot.position.z;
        if(dx*dx+dz*dz<=radiusSquared)applyPlayerDamageToBoss(total);
      }
    };

    const scaledRawDamage = Math.max(0, Number(rawDamage) || 0) * shieldDamageFactor(droneBase);
    let impact;
    let outcome;
    if(guestAbilities){
      const guestHit=guestAbilities.resolveIncomingHit({
        damage:scaledRawDamage,source,damageType,unavoidable,
      });
      if(guestHit.dodged){
        publishArmorFeedback(guestHit.dodgeSource==='armor'?'evade':'pilot_evade');
        publishGuestAbilityState();
        return createPlayerDamageOutcomeV25({
          gate, source, hitId, contactId, rawDamage:scaledRawDamage,
          hpBefore, hpAfter:stats.hp, dodged:true, dodgeSource:guestHit.dodgeSource,
        });
      }
      const crystalProc=guestHit.events?.some(event=>event.type==='crystal_prism');
      const reactiveProc=!crystalProc&&guestHit.reflected>0
        &&guestAbilities.snapshot().armor?.id==='armor_reactive_plating';
      if(crystalProc)publishArmorFeedback('crystal_prism',guestHit.reflected||0);
      else if(reactiveProc)publishArmorFeedback('reactive_reflect',guestHit.reflected||0);
      stats.hp=clamp(stats.hp-guestHit.remaining,0,stats.maxHp);
      impact={dodged:false,damage:guestHit.remaining,absorbed:guestHit.absorbed||0,
        reflected:guestHit.reflected||0,novaDamage:guestHit.novaDamage||0};
      applyRetaliation(impact.reflected,impact.novaDamage);
      publishGuestAbilityState();
      outcome=createPlayerDamageOutcomeV25({
        gate, source, hitId, contactId, rawDamage:scaledRawDamage,
        hpBefore, hpAfter:stats.hp, absorbed:impact.absorbed,
        reflected:impact.reflected, novaDamage:impact.novaDamage,
      });
    }else{
      impact = receiveBattleHit(stats, passives, scaledRawDamage, { source, nowMs:Date.now() });
      if (impact.dodged) {
        showAnnouncement(lang==='vi'?'NÉ TRÁNH!':'DODGED!', '#4ade80', 900);
        return createPlayerDamageOutcomeV25({
          gate, source, hitId, contactId, rawDamage:scaledRawDamage,
          hpBefore, hpAfter:stats.hp, dodged:true, dodgeSource:'pilot',
        });
      }
      applyRetaliation(impact.reflected,impact.novaDamage);
      outcome=createPlayerDamageOutcomeV25({
        gate, source, hitId, contactId, rawDamage:scaledRawDamage,
        hpBefore, hpAfter:stats.hp, absorbed:impact.absorbed,
        reflected:impact.reflected, novaDamage:impact.novaDamage,
      });
    }

    updateHpBar();
    if(outcome.outcome==='absorbed'||outcome.outcome==='no_damage')return outcome;
    if(nowMs-lastPlayerDamageFxAt>=PLAYER_DAMAGE_FX_COOLDOWN_MS){
      lastPlayerDamageFxAt=nowMs;
      explode(playerRoot.position, 2);
      shakeCamera();
    }

    if (stats.hp <= 0) {
      gameOver = true; cleanBossReveal(); setGameState('GAMEOVER');
      guestVisualFeedback?.dispose();
      engineFx.stop(); playerRoot.isVisible = false;
      explode(playerRoot.position, 4);
      showAnnouncement(lang==='vi'?'THẤT BẠI!':'MISSION FAILED!', '#ff0000', 3000);
      if (guestAbilityQa) {
        scheduleBattleTimer(() => publishGuestBattleQaResult('defeat'), 1400);
      } else scheduleBattleTimer(async () => {
        if (isCloud) {
          try {
            await gameAction('battle.finish',{ticketId:gsRef.current.activeBattleId,victory:false,kills:verifiedClientKills});
            onDefeat();
          } catch(error) {console.error('Battle settlement failed',error);showAnnouncement(lang==='vi'?'LỖI MÁY CHỦ - HÃY RÚT LUI':'SERVER ERROR - PLEASE RETREAT', '#ff4757');}
        } else {
          const coinMult = activeCoinMultiplier(EVENT_CONFIG, getRealTime?.() || Date.now());
          gsRef.current.coins = (Number(gsRef.current.coins)||0) + score + (collectedCoins * coinMult);
          recordGuestBattle(gsRef.current.campaignData,{mode:"campaign",victory:false,kills:verifiedClientKills}, getRealTime?.() ?? Date.now());
          if (saveUserProfile) saveUserProfile();
          onDefeat();
        }
      }, 4000);
    }
    return outcome;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 14. STAGE CLEAR
  // ══════════════════════════════════════════════════════════════════════════

  const stageCleared = () => {
    cleanBossReveal();
    setGameState('CLEAR'); guestVisualFeedback?.dispose(); engineFx.stop();
    showAnnouncement(lang==='vi'?'HOÀN THÀNH\nCHIẾN DỊCH!':'CAMPAIGN\nCLEARED!', '#2ecc71', 2000);
    if(guestAbilityQa){
      showAnnouncement(lang==='vi'?'GUEST LAB · KHÔNG LƯU THƯỞNG':'GUEST LAB · NO REWARDS','#57e6ed',1400);
      scheduleBattleTimer(()=>publishGuestBattleQaResult('victory'),1000);
      return;
    }
    scheduleBattleTimer(() => showRewardSummary(), 2600);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 15. REWARD SUMMARY (FULL BABYLON GUI OVERLAY – AAA STYLE)
  // ══════════════════════════════════════════════════════════════════════════

  const showRewardSummary = () => {
    const timeTaken  = (Date.now() - startTime) / 1000;
    const mm         = Math.floor(timeTaken/60), ss = Math.floor(timeTaken%60);
    const timeStr    = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    const c1Met      = true;
    const c2Met      = (stats.hp / stats.maxHp) >= 0.5;
    const limit      = stageConfig.timeLimit || 150;
    const c3Met      = timeTaken <= limit;
    const limM = Math.floor(limit/60), limS = Math.floor(limit%60);
    const limStr = `${String(limM).padStart(2,'0')}:${String(limS).padStart(2,'0')}`;

    let stars = 1;
    if (c2Met) stars++; if (c3Met) stars++;

    const stageBonus = isReplay ? 10 : 50 + currentStage*50;
    const earnedExp  = isReplay ? 0 : (stageConfig.expReward||100);
    const coinMult2 = activeCoinMultiplier(EVENT_CONFIG, getRealTime?.() || Date.now());
    const totalCoins = stageBonus + score + (collectedCoins * coinMult2);
    // ── Overlay backdrop (fade in qua observable, giữ nguyên logic cũ) ──
    const overlay = new GUI.Rectangle('summaryOverlay');
    overlay.width = '100%'; overlay.height = '100%';
    overlay.background = 'rgba(0,0,0,0)'; overlay.thickness = 0;
    ui.addControl(overlay);
 
    // ── Constants layout ──
    // The report panel shares the same CSS-pixel sizing as the battle HUD.
    // Using framebuffer dimensions here would overflow after adaptive scaling.
    const { cssW: RW, cssH: RH } = measureBattleHud(engine, canvas, ui);
    const PW = Math.min(RW * 0.92, 420);
    const PH = Math.min(580, RH * 0.88);
 
    // ── Panel chính ──
    const panel = new GUI.Rectangle('sPanel');
    panel.width        = `${PW}px`;
    panel.height       = `${PH}px`;
    panel.background   = 'rgba(4,9,20,0.98)';
    panel.color        = themeHex;
    panel.thickness    = Math.round(2);
    panel.cornerRadius = Math.round(16);
    // Viền neon glow (box shadow không có trong Babylon GUI → dùng 2 rect lồng)
    overlay.addControl(panel);
 
    // Đường kẻ accent ngang ở đỉnh panel (thay thế cho gradient header)
    const topAccent = new GUI.Rectangle('topAccent');
    topAccent.width            = `${Math.round(PW * 0.7)}px`;
    topAccent.height           = `${Math.round(3)}px`;
    topAccent.background       = themeHex;
    topAccent.thickness        = 0;
    topAccent.verticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    topAccent.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    topAccent.top              = `0px`;
    panel.addControl(topAccent);
 
    // ── Stack nội dung ──
    const stack = new GUI.StackPanel('sStack');
    stack.isVertical = true;
    stack.paddingTop = `${Math.round(22)}px`;
    panel.addControl(stack);
 
    // ─── Helper: addSpacer ────────────────────────────────────────────────────
    const addSpacer = (h = 8) => {
      const s = new GUI.Rectangle();
      s.height = `${Math.round(h)}px`; s.thickness = 0; s.background = 'transparent';
      stack.addControl(s);
    };
 
    // ─── Helper: addTxt ───────────────────────────────────────────────────────
    const addTxt = (text, color, fs, align = 'center', pt = 0) => {
      const t = new GUI.TextBlock();
      t.text        = text;
      t.color       = color;
      t.fontFamily  = '"VT323", monospace';
      t.fontSize    = Math.round(fs);
      t.height      = `${Math.round((fs * 1.35))}px`;
      t.paddingTop  = `${Math.round(pt)}px`;
      t.textHorizontalAlignment = align === 'left'
        ? GUI.Control.HORIZONTAL_ALIGNMENT_LEFT
        : align === 'right'
        ? GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT
        : GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      stack.addControl(t);
      return t;
    };
 
    // ─── Helper: addRow (label trái + value phải) ─────────────────────────────
    const addRow = (label, value, vcol = '#00e5ff', labelFs = 17, valueFs = 20) => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height     = `${Math.round(30)}px`;
      row.paddingLeft  = `${Math.round(24)}px`;
      row.paddingRight = `${Math.round(24)}px`;
      stack.addControl(row);
 
      const lbl = new GUI.TextBlock();
      lbl.text       = label; lbl.color = '#64748b';
      lbl.fontFamily = '"VT323", monospace'; lbl.fontSize = Math.round(labelFs);
      lbl.width = `${Math.round((PW - Math.round(48)) * 0.56)}px`;
      lbl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
 
      const val = new GUI.TextBlock();
      val.text       = value; val.color = vcol;
      val.fontFamily = '"VT323", monospace'; val.fontSize = Math.round(valueFs); val.fontStyle = 'bold';
      val.width = `${Math.round((PW - Math.round(48)) * 0.44)}px`;
      val.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
 
      row.addControl(lbl); row.addControl(val);
    };
 
    // ─── Helper: addDivider ───────────────────────────────────────────────────
    const addDiv = (opacity = '22') => {
      const d = new GUI.Rectangle();
      d.width      = `${Math.round(PW * 0.86)}px`;
      d.height     = `${Math.round(1)}px`;
      d.background = `${themeHex}${opacity}`; d.thickness = 0;
      stack.addControl(d);
      addSpacer(6);
    };
 
    // ─── Helper: addConditionRow ──────────────────────────────────────────────
    const addCond = (met, label) => {
      const row = new GUI.StackPanel();
      row.isVertical = false;
      row.height     = `${Math.round(26)}px`;
      row.paddingLeft = `${Math.round(24)}px`;
      stack.addControl(row);
 
      // Icon (ô vuông nhỏ thay cho emoji ✅/❌)
      const iconBox = new GUI.Rectangle();
      iconBox.width      = `${Math.round(16)}px`;
      iconBox.height     = `${Math.round(16)}px`;
      iconBox.background = met ? '#2ecc71' : '#ff4757';
      iconBox.thickness  = 0;
      iconBox.cornerRadius = Math.round(3);
 
      const iconTxt = new GUI.TextBlock();
      iconTxt.text      = met ? '✓' : '✗';
      iconTxt.color     = '#000';
      iconTxt.fontFamily = '"VT323", monospace';
      iconTxt.fontSize  = Math.round(13);
      iconBox.addControl(iconTxt);
 
      const lbl = new GUI.TextBlock();
      lbl.text       = `  ${label}`;
      lbl.color      = met ? '#a3f7bf' : '#ff8a8a';
      lbl.fontFamily = '"VT323", monospace';
      lbl.fontSize   = Math.round(16);
      lbl.width = `${Math.round(PW - Math.round(16) - Math.round(32))}px`;
      lbl.paddingLeft = `${Math.round(8)}px`;
      lbl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
 
      row.addControl(iconBox); row.addControl(lbl);
    };
 
    // ══════════════════════════════════════════════════════════════════════════
    // NỘI DUNG CHÍNH
    // ══════════════════════════════════════════════════════════════════════════
 
    // Tiêu đề
    addTxt(
      lang === 'vi' ? 'BÁO CÁO CHIẾN DỊCH' : 'MISSION REPORT',
      themeHex, 26, 'center', 0,
    );
    addTxt(
      lang === 'vi'
        ? `ẢI ${currentStage} · ${planetConfig.name?.[lang] || ''}`
        : `STAGE ${currentStage} · ${planetConfig.name?.[lang] || ''}`,
      '#475569', 15, 'center',
    );
 
    addSpacer(10);
 
    // ── Sao (3 sao lớn, đẹp) ──
    // Dùng 3 TextBlock riêng để tô màu riêng từng sao
    const starRow = new GUI.StackPanel('starRow');
    starRow.isVertical = false;
    starRow.height     = `${Math.round(52)}px`;
    stack.addControl(starRow);
 
    for (let i = 0; i < 3; i++) {
      const s = new GUI.TextBlock();
      s.text       = '★';
      s.color      = i < stars ? '#facc15' : '#1e293b';
      s.fontFamily = '"VT323", monospace';
      s.fontSize   = Math.round(44);
      s.width      = `${Math.round(60)}px`;
      // Sao giữa to hơn chút (sao 2, index 1)
      if (i === 1) { s.fontSize = Math.round(50); s.color = i < stars ? '#fde047' : '#1e293b'; }
      starRow.addControl(s);
    }
 
    addSpacer(8);
 
    // ── 3 điều kiện ──
    addCond(c1Met, lang === 'vi' ? 'Hoàn thành nhiệm vụ'      : 'Mission Cleared');
    addCond(c2Met, lang === 'vi' ? 'Giáp còn lại ≥ 50%'       : 'Armor ≥ 50%');
    addCond(c3Met, lang === 'vi' ? `Thời gian ≤ ${limStr}`    : `Clear Time ≤ ${limStr}`);
 
    addSpacer(10);
    addDiv('33');
 
    // ── Các chỉ số ──
    addRow(lang === 'vi' ? 'Thời gian:'          : 'Clear Time:',     timeStr,             '#ffffff');
    addSpacer(2);
    addRow(lang === 'vi' ? 'Kinh nghiệm:'        : 'EXP Gained:',     `+${earnedExp}`,     '#34d399');
    addSpacer(2);
    addRow(lang === 'vi' ? 'Điểm tác chiến:'     : 'Combat Score:',   `+${score}`,         '#60a5fa');
    addSpacer(2);
    addRow(lang === 'vi' ? 'Chiến lợi phẩm:'     : 'Loot Collected:', `+${collectedCoins}`, '#60a5fa');
 
    addSpacer(4);
    addDiv('55');
 
    // ── Tổng ──
    addRow(
      lang === 'vi' ? 'TỔNG NHẬN:' : 'TOTAL EARNED:',
      `${totalCoins} ${lang === 'vi' ? 'XU' : 'COINS'}`,
      '#facc15', 19, 24,
    );
 
    addSpacer(14);
 
    // ── Nút XÁC NHẬN (thiết kế lại: nền đậm + viền cyan + text lớn) ──
    const btnOuter = new GUI.Rectangle('btnOuter');
    btnOuter.width        = `${Math.round(220)}px`;
    btnOuter.height       = `${Math.round(50)}px`;
    btnOuter.background   = 'rgba(0,229,255,0.12)';
    btnOuter.color        = themeHex;
    btnOuter.thickness    = Math.round(2);
    btnOuter.cornerRadius = Math.round(8);
    btnOuter.isPointerBlocker = true;
    stack.addControl(btnOuter);
 
    const btnTxt = new GUI.TextBlock('btnTxt');
    btnTxt.text       = lang === 'vi' ? '✦  XÁC NHẬN  ✦' : '✦  CONFIRM  ✦';
    btnTxt.color      = themeHex;
    btnTxt.fontFamily = '"VT323", monospace';
    btnTxt.fontSize   = Math.round(24);
    btnTxt.fontStyle  = 'bold';
    btnOuter.addControl(btnTxt);
 
    // Hover effect
    btnOuter.onPointerEnterObservable.add(() => {
      btnOuter.background = `${themeHex}33`;
      btnTxt.color = '#ffffff';
    });
    btnOuter.onPointerOutObservable.add(() => {
      btnOuter.background = 'rgba(0,229,255,0.12)';
      btnTxt.color = themeHex;
    });
 
    // ── Fade in overlay (giữ nguyên logic cũ) ──
    let fadeT0 = null;
    const fadeObs = scene.onBeforeRenderObservable.add(() => {
      if (!fadeT0) fadeT0 = performance.now();
      overlay.background = `rgba(0,0,0,${Math.min(.85, (performance.now()-fadeT0)/400)})`;
      if ((performance.now()-fadeT0) >= 400) scene.onBeforeRenderObservable.remove(fadeObs);
    });

    // Confirm click – save progress
    let clicked = false;
    btnOuter.onPointerDownObservable.add(async () => {
      if (clicked) return; clicked = true;
      btnOuter.background = `${themeHex}66`; btnTxt.color = '#000';
      if (isCloud) {
        try {
          await gameAction('battle.finish',{ticketId:gsRef.current.activeBattleId,victory:true,stars,kills:verifiedClientKills});
          scheduleBattleTimer(() => onVictory(), 200);
        } catch(error) {
          clicked=false;
          btnTxt.text=lang==='vi'?'LỖI MÁY CHỦ - THỬ LẠI':'SERVER ERROR - RETRY';
          console.error('Campaign reward settlement failed',error);
        }
        return;
      }

      const prog  = gsRef.current.campaignData.progress;
      const pId   = Number(prog.currentPlanet) || 1;
      const cStg  = Number(prog.selectedStage) || 1;

      if (!prog.planets)          prog.planets = {};
      if (!prog.planets[pId])     prog.planets[pId] = { highestStage: 1, stars: {} };
      if (!prog.planets[pId].stars) prog.planets[pId].stars = {};

      const oldStars = Number(prog.planets[pId].stars[cStg]) || 0;
      prog.planets[pId].stars[cStg] = Math.max(oldStars, stars);

      const curHigh = Number(prog.planets[pId].highestStage) || 1;
      if (cStg === curHigh && cStg < 10) {
        prog.planets[pId].highestStage = cStg + 1;
        prog.selectedStage = cStg + 1;
      }

      if (cStg === 10 && cStg === curHigh) {
        const nextPId = pId + 1;
        if (nextPId <= Object.keys(PLANET_CONFIG).length) {
          prog.highestPlanet = Math.max(Number(prog.highestPlanet)||1, nextPId);
          if (!prog.planets[nextPId]) prog.planets[nextPId] = { highestStage: 1, stars: {} };
          prog.currentPlanet = nextPId; prog.selectedStage = 1;
        }
      }

      if (prog.exp === undefined) prog.exp = 0;
      prog.exp += earnedExp;
      gsRef.current.coins = (Number(gsRef.current.coins)||0) + totalCoins;

      recordGuestBattle(gsRef.current.campaignData,{mode:'campaign',victory:true,kills:verifiedClientKills,boss:Boolean(stageConfig.hasBoss)}, getRealTime?.() ?? Date.now());
      // saveUserProfile handles both authenticated Firestore and guest cache.
      // Do not overwrite guest cache with plaintext after encrypted storage.
      if (saveUserProfile) saveUserProfile();

      scheduleBattleTimer(() => onVictory(), 200);
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 16. MAIN GAME LOOP (scene.onBeforeRenderObservable)
  // ══════════════════════════════════════════════════════════════════════════

  // Identical projectile hit semantics in Campaign and Dungeon; this scene
  // retains only its own scoring, drop and enemy-health UI callbacks.
  const applyPlayerDamageToEnemy = (enemy, damage) => {
    if (!enemy || enemy._dead || enemy.mesh.isDisposed?.()
      || !enemyEntryPolicy.isEngageable(enemy._entryState)) return false;
    if(enemy._encounterMechanicProtected&&!enemy._encounterMechanicComplete){
      const nowMs=Date.now();
      if(nowMs-(enemy._encounterShieldTextAt||0)>650){
        enemy._encounterShieldTextAt=nowMs;
        showTextEffect(enemy.mesh.position.x,enemy.mesh.position.z,
          lang==='vi'?'ĐANG TRIỂN KHAI':'DEPLOYING','#bd7cff');
      }
      return false;
    }
    // Mark applies only in the local Guest ability experiment.
    if(guestAbilities&&enemy._guestMarkUntilTick>guestAbilities.tick)
      damage*=1+(enemy._guestMarkBonus||0);
    enemy.hp -= damage;
    enemy.visual?.setState('hit');
    showTextEffect(enemy.mesh.position.x, enemy.mesh.position.z, `-${Math.round(damage)}`, '#ff4757');
    enemy.miniHp.width = `${Math.max(0, Math.round(enemy.hp / enemy.maxHp * 100))}%`;
    if (enemy.mesh.material?.emissiveColor) {
      const original = enemy.mesh.material.emissiveColor.clone();
      enemy.mesh.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
      scheduleBattleTimer(() => { if (enemy.mesh?.material) enemy.mesh.material.emissiveColor = original; }, 60);
    }
    if (enemy.hp > 0) return false;
    explode(enemy.mesh.position, enemy.tier === 3 ? 2 : 1.5);
    updateScore(enemy.points);
    trackEventKill();
    const roll = Math.random() * 100;
    if (roll < 4) spawnDrop(enemy.mesh.position.x, enemy.mesh.position.z, 'power');
    else if (roll < 9) spawnDrop(enemy.mesh.position.x, enemy.mesh.position.z, 'heal');
    else if (roll < 20) spawnDrop(enemy.mesh.position.x, enemy.mesh.position.z, 'coin');
    cleanEnemy(enemy, true);
    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);
    return true;
  };
  const applyPlayerDamageToBoss = damage => {
    if(gameState!=='BOSS_FIGHT'||!bossMesh||bossMesh.isDisposed?.()||bossHp<=0)return false;
    if(bossPhaseTransition)return false;
    if(guestAbilities&&bossMesh._guestMarkUntilTick>guestAbilities.tick)
      damage*=1+(bossMesh._guestMarkBonus||0);
    const supportMultiplier=bossSupportDamageMultiplier();
    if(supportMultiplier<1){
      damage*=supportMultiplier;
      const nowMs=Date.now();
      if(nowMs-(bossMesh._supportShieldTextAt||0)>700){
        bossMesh._supportShieldTextAt=nowMs;
        showTextEffect(bossMesh.position.x,bossMesh.position.z,
          lang==='vi'?'HỘ TỐNG':'GUARDED','#ffd166');
      }
    }
    const gateResult=campaignCombatV3Enabled
      ?resolveBossDamageGateV28({
        state:bossPhaseState,hp:bossHp,maxHp:bossMaxHp,damage:Math.max(0,damage),
      })
      :Object.freeze({
        nextHp:Math.max(0,bossHp-Math.max(0,damage)),
        appliedDamage:Math.min(bossHp,Math.max(0,damage)),
        gate:null,state:bossPhaseState,
      });
    bossPhaseState=gateResult.state;
    bossHp=gateResult.nextHp;
    const appliedDamage=gateResult.appliedDamage;
    bossVisual?.setState('hit');
    if(appliedDamage>0)showTextEffect(bossMesh.position.x,bossMesh.position.z,`-${Math.round(appliedDamage)}`,'#ff4757');
    bossHpFill.width=`${Math.max(0,Math.round(bossHp/bossMaxHp*100))}%`;
    if(bossMesh.material?.emissiveColor){
      const original=bossMesh.material.emissiveColor.clone();
      bossMesh.material.emissiveColor=new BABYLON.Color3(1,1,1);
      scheduleBattleTimer(()=>{if(bossMesh?.material)bossMesh.material.emissiveColor=original;},60);
    }
    if(gateResult.gate){
      beginBossPhaseTransition(gateResult.gate);
      return false;
    }
    if(!bossEnraged&&bossHp<=bossMaxHp*.3&&bossHp>0){
      activateBossFrenzyV31({announce:true});
    }
    if(bossHp>0)return false;
    explode(bossMesh.position,5);
    updateScore(bossPts);
    trackEventKill();
    bossPanel.isVisible=false;
    for(let index=enemies.length-1;index>=0;index--){
      if(enemies[index]._bossSupport){cleanEnemy(enemies[index]);enemies.splice(index,1);}
    }
    bossSupportGroups.clear();
    disposeBossAttackTelegraph();
    disposeBossFrenzyAura();
    bossCombatState=null;
    deathVisuals.capture(bossVisual);
    bossVisual=null;
    safeDispose(bossMesh);bossMesh=null;
    stageCleared();
    return true;
  };
  const applyCampaignSplash = (bullet, impact, damage, primary) => {
    if (!bullet._splashRadius) return;
    explode(new BABYLON.Vector3(impact.x, 0, impact.z), bullet._splashRadius * .45);
    const nearby = enemies.filter(other => other !== primary && !other._dead && !other.mesh.isDisposed?.()
      && enemyEntryPolicy.isEngageable(other._entryState)
      && projectileHitsPoint({ position: impact }, other.mesh.position, bullet._splashRadius));
    nearby.forEach(other => {
      if (bullet._slowMs) other._slowUntil = Date.now() + bullet._slowMs;
      applyPlayerDamageToEnemy(other, damage * .4);
    });
  };

  // One ship activation command for the DEV Guest lane only. Armor effects
  // are automatic/passive and never consume a second touch control.
  // C15/cloud never creates this controller; no ability result is sent to API.
  let guestAbilityAccumulator=0;
  let guestNanoFeedbackAmount=0;
  let guestNanoFeedbackAt=-Infinity;
  const activateGuestAbility=slot=>{
    if(!guestAbilities||slot!=='ship_skill')return false;
    const before=guestAbilities.snapshot();
    const activationGate=getGuestAbilityActivationGate();
    if(!activationGate.canActivate){
      publishGuestFeedback(createGuestAbilityRejectedFeedbackV2({
        abilityId:before.ship?.id,reason:activationGate.lockReason||'UNAVAILABLE',tick:guestAbilities.tick,
        sequence:++guestFeedbackSequence,
      }),{worldText:false});
      return false;
    }
    const definition=getGuestAbilitySkillV2(before.ship?.id);
    let selectedMarkTarget=null;
    if(before.ship?.kind==='mark'){
      selectedMarkTarget=pickWeaponTarget(liveTargets(),playerRoot.position);
      const range=Number(definition?.params?.range||0);
      const dx=selectedMarkTarget?.mesh?.position?.x-playerRoot.position.x;
      const dz=selectedMarkTarget?.mesh?.position?.z-playerRoot.position.z;
      if(!selectedMarkTarget||!Number.isFinite(dx)||!Number.isFinite(dz)||Math.hypot(dx,dz)>range){
        publishGuestFeedback(createGuestAbilityRejectedFeedbackV2({
          abilityId:before.ship.id,reason:'NO_TARGET',tick:guestAbilities.tick,
          sequence:++guestFeedbackSequence,
        }),{worldText:false});
        return false;
      }
    }
    const result=guestAbilities.activate(slot);
    if(!result.ok){
      publishGuestFeedback(createGuestAbilityRejectedFeedbackV2({
        abilityId:before.ship?.id,reason:result.reason,tick:guestAbilities.tick,
        sequence:++guestFeedbackSequence,
      }),{worldText:false});
      return false;
    }
    const feedback=createGuestAbilityActivationFeedbackV2({
      abilityId:result.abilityId,tick:result.tick,sequence:++guestFeedbackSequence,
    });
    publishGuestFeedback(feedback);
    for(const event of result.events){
      if(event.type==='heal'){
        const beforeHp=stats.hp;
        stats.hp=clamp(stats.hp+event.amount,0,stats.maxHp);
        const restored=Math.max(0,Math.round(stats.hp-beforeHp));
        if(restored>0)showTextEffect(playerRoot.position.x,playerRoot.position.z-.45,`+${restored} HP`,'#69f0a9');
      }
      if(event.type==='pierce'){
        const target=pickWeaponTarget(liveTargets(),playerRoot.position);
        const salvo=describeMainSalvo(GEAR_CATALOG.mainGun.find(g=>g.id==='gun_rail'),
          playerRoot.position,stats.atk*event.damageMultiplier,target);
        shots.fire(salvo.map(shot=>({...shot,penetration:event.penetration,projectileType:'rail'})));
      }
      if(event.type==='mark'){
        const target=selectedMarkTarget;
        if(target){
          const marked=target.isBoss?target.mesh:target;
          marked._guestMarkUntilTick=guestAbilities.tick+event.durationTicks;
          marked._guestMarkBonus=event.bonus;
          target.isBoss?bossVisual?.setState('hit'):target.visual?.setState('hit');
          guestVisualFeedback?.markTarget(target.mesh,feedback,event.durationTicks);
          showTextEffect(target.mesh.position.x,target.mesh.position.z-.6,
            lang==='vi'?`ĐÁNH DẤU +${Math.round(event.bonus*100)}%`:`MARK +${Math.round(event.bonus*100)}%`,
            feedback?.color||'#ffd166');
        }
      }
      if(event.type==='burst'){
        const target=pickWeaponTarget(liveTargets(),playerRoot.position);
        const base=describeMainSalvo(mainGunBase,playerRoot.position,
          stats.atk*event.damageMultiplier,target)[0];
        if(base){
          const center=(event.shots-1)/2;
          shots.fire(Array.from({length:event.shots},(_,index)=>({
            ...base,x:base.x+(index-center)*event.spread,delayMs:index*70,
          })));
        }
      }
      if(event.type==='area'||event.type==='pull'){
        for(const enemy of [...enemies]){
          if(enemy._dead||enemy.mesh?.isDisposed?.()
            ||!enemyEntryPolicy.isEngageable(enemy._entryState))continue;
          const dx=enemy.mesh.position.x-playerRoot.position.x;
          const dz=enemy.mesh.position.z-playerRoot.position.z;
          const distance=Math.hypot(dx,dz);
          if(distance>event.radius)continue;
          if(event.type==='area')applyPlayerDamageToEnemy(enemy,stats.atk*event.damageMultiplier);
          else if(distance>.001){
            const n=Math.min(event.distance,distance);
            enemy.mesh.position.x-=dx/distance*n;
            enemy.mesh.position.z-=dz/distance*n;
          }
          if(event.slowTicks)enemy._slowUntil=Date.now()+event.slowTicks*1000/30;
        }
        if(event.type==='area'&&bossMesh&&!bossMesh.isDisposed?.()){
          const dx=bossMesh.position.x-playerRoot.position.x;
          const dz=bossMesh.position.z-playerRoot.position.z;
          if(Math.hypot(dx,dz)<=event.radius)
            applyPlayerDamageToBoss(stats.atk*event.damageMultiplier*.65);
        }
      }
    }
    updateHpBar();
    publishGuestAbilityState();
    return true;
  };
  if(guestAbilities){
    data.onAbilityController?.(activateGuestAbility);
    publishGuestAbilityState();
  }

  // Exactly one shared HUD for Guest and C15. This observer reads legacy
  // gameplay data but never writes it; emission is capped at 10 Hz to protect
  // mobile React performance and the 60Hz Babylon render loop.
  let lastHudPublishAt=-Infinity;
  if(externalHud)scene.onBeforeRenderObservable.add(()=>{
    const now=Date.now();if(now-lastHudPublishAt<100)return;lastHudPublishAt=now;
    if(guestAbilities)publishGuestAbilityState();
    try{data.onHudUpdate({stage:currentStage,wave:Math.max(1,currentWave),wavesTotal:CAMPAIGN_WAVES_TOTAL,
      hp:stats.hp,maxHp:stats.maxHp,kills:verifiedClientKills,score,
      bossHp:gameState==='BOSS_FIGHT'&&bossMesh&&bossHp>0?bossHp:null,
      bossMaxHp:gameState==='BOSS_FIGHT'&&bossMesh&&bossMaxHp>0?bossMaxHp:null});}catch(_){}
  });

  // Kick off first wave
  scheduleBattleTimer(() => startWave(1), 1000);

  scene.onBeforeRenderObservable.add(() => {
    if (gameOver || gameState === 'CLEAR') return;
    const now = Date.now();
    activeEffects.update(now);
    const frameDeltaMs = Math.max(0, Math.min(100, Number(engine.getDeltaTime()) || 0));
    const frameFactor = frameScale(frameDeltaMs);
    tick += frameFactor;
    if(guestAbilities){
      guestAbilityAccumulator+=Math.min(100,Math.max(0,engine.getDeltaTime()));
      const steps=Math.min(3,Math.floor(guestAbilityAccumulator/(1000/30)));
      if(steps>0){
        guestAbilities.advanceTicks(steps);
        guestAbilityAccumulator-=steps*1000/30;
        let healed=false;
        for(const event of guestAbilities.drainEvents()){
          if(event.type==='heal'&&event.amount>0){
            const before=stats.hp;
            stats.hp=clamp(stats.hp+event.amount,0,stats.maxHp);
            const restored=Math.max(0,Math.round(stats.hp-before));
            healed=healed||restored>0;
            if(event.source==='armor_nano'&&restored>0)guestNanoFeedbackAmount+=restored;
          }
        }
        if(healed)updateHpBar();
        if(guestNanoFeedbackAmount>0&&guestAbilities.tick-guestNanoFeedbackAt>=30){
          publishArmorFeedback('nano_repair',guestNanoFeedbackAmount,{worldText:false});
          showTextEffect(playerRoot.position.x,playerRoot.position.z-.45,`+${guestNanoFeedbackAmount} HP`,'#69f0a9');
          guestNanoFeedbackAmount=0;
          guestNanoFeedbackAt=guestAbilities.tick;
        }
      }
      if(!Number.isFinite(guestAbilityAccumulator))guestAbilityAccumulator=0;
      guestVisualFeedback?.update();
    }
    // Regen normalized to elapsed simulation time; paused tabs cannot heal instantly.
    if (stats.hpRegenRate > 0 && stats.hp > 0 && stats.hp < stats.maxHp) {
      stats.hp = Math.min(stats.maxHp, stats.hp + stats.maxHp * stats.hpRegenRate * frameFactor / 60);
      updateHpBar();
    }

    // ── Roll return ──
    if (playerPlane && !shipInput.isDragging()) {
      playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, 0, scaledLerpFactor(.04,frameFactor));
    }

    // ── Drone hover float ──
    const hoverZ = Math.sin(tick * .04) * .18;
    drones.forEach(d => {
      d.position.x = BABYLON.Scalar.Lerp(d.position.x, playerRoot.position.x + d.offsetX, scaledLerpFactor(.22,frameFactor));
      d.position.z = BABYLON.Scalar.Lerp(d.position.z, playerRoot.position.z + d.offsetZ + hoverZ, scaledLerpFactor(.22,frameFactor));
    });
    
    // ── Auto-fire ──
    const mainInterval=stats.fireRate*(guestAbilities?.modifiers().fireIntervalMultiplier||1);
    if (now > lastFire + mainInterval)       { fireWeapons();  lastFire      = now; }
    if (stats.wingmanId && now > nextWingFire) { fireWingman();  nextWingFire  = now + stats.wingFireRate; }
    if (stats.droneId   && now > nextDroneFire){ fireDrones();   nextDroneFire = now + stats.droneFireRate; }

    const aspect = getAspect();
    const cullX  = ZOOM * aspect + 3;

    // ── Player bullets ──
    for (let i = playerBullets.length-1; i >= 0; i--) {
      const b = playerBullets[i];
      if (b.isDisposed?.()) { playerBullets.splice(i,1); continue; }

      shots.advance(b, frameFactor);

      if (b.position.z < -ZOOM-3 || b.position.z > ZOOM+3 || Math.abs(b.position.x) > cullX) {
        safeDispose(b); playerBullets.splice(i,1);
      }
    }

    // ── Enemy bullets ──
    samplePlayerCombatVelocity(frameFactor);
    for (let i = enemyBullets.length-1; i >= 0; i--) {
      const b = enemyBullets[i];
      if (b.isDisposed?.()) { enemyBullets.splice(i,1); continue; }
      if (b._shotPlan) {
        const motion = advanceCampaignEnemyProjectileV31({
          plan: b._shotPlan,
          position: { x: b.position.x, z: b.position.z },
          velocity: { x: b._vx, z: b._vz },
          target: { x: playerRoot.position.x, z: playerRoot.position.z },
          targetVelocity: playerVelocityFrame,
          nowMs: now,
          frameScale: frameFactor,
        });
        b._vx = motion.velocity.x;
        b._vz = motion.velocity.z;
        b.position.x += motion.delta.x;
        b.position.z += motion.delta.z;
        b.rotation.y = motion.yawRadians;
        if (motion.expired) {
          safeDispose(b); enemyBullets.splice(i,1); continue;
        }
      } else {
        b.position.x += b._vx * frameFactor;
        b.position.z += b._vz * frameFactor;
        b.rotation.y = Math.atan2(b._vx, b._vz);
      }
      if (now >= b._expiresAtMs) {
        safeDispose(b); enemyBullets.splice(i,1); continue;
      }
      if (b._visualPulse > 0) {
        const pulse = 1 + b._visualPulse * Math.sin((now - b._createdAtMs) * .028);
        b.scaling.x = pulse;
        b.scaling.y = pulse;
      }

      if (b.position.z > ZOOM+3 || b.position.z < -ZOOM-3 || Math.abs(b.position.x) > cullX) {
        safeDispose(b); enemyBullets.splice(i,1); continue;
      }
      const dx = b.position.x - playerRoot.position.x;
      const dz = b.position.z - playerRoot.position.z;
      if (dx*dx + dz*dz < 1.44) {   // hit radius 1.2
        damagePlayer({rawDamage:b._rawDamage||200,source:'projectile',damageType:b._damageType||'energy',hitId:b._damageHitId});
        safeDispose(b); enemyBullets.splice(i,1);
      }
    }

    // ── Enemies ──
    for (let i = enemies.length-1; i >= 0; i--) {
      const e = enemies[i];
      if (e._dead) { enemies.splice(i,1); continue; }

      e.visual?.tick(frameFactor * (1000 / 60));
      const enemyFrame = frameFactor * enemySpeedFactor(e, now);
      if(!enemyEntryPolicy.isEngageable(e._entryState)){
        e.visual?.setState('idle');
        if(e.entryHalo&&!e.entryHalo.isDisposed?.()){
          const pulse=.94+.08*Math.sin(now*.012+e.sineOff);
          e.entryHalo.scaling.x=pulse;
          e.entryHalo.scaling.z=pulse;
          e.entryHalo.visibility=.55+.17*Math.sin(now*.016+e.sineOff);
        }
        const beforeZ=e.mesh.position.z;
        e.mesh.position.z += enemyEntryPolicy.entrySpeed(e.speed,e.tier) * frameFactor;
        updateEnemyFacing(e,0,e.mesh.position.z-beforeZ,frameDeltaMs);
        enemyEntryPolicy.update(e._entryState,{positionZ:e.mesh.position.z,nowMs:now});
        if(enemyEntryPolicy.isEngageable(e._entryState)){
          safeDispose(e.entryHalo);e.entryHalo=null;
          e.miniHpBg.isVisible=true;
          e.visual?.setState('move');
          if(e._encounterKind==='mini_boss'&&e._encounterAiProfileId){
            e._miniBossAiState=createCampaignMiniBossAiStateV281({
              profileId:e._encounterAiProfileId,nowMs:now,
            });
            e._miniBossMotionState=createCampaignMiniBossMotionStateV29();
          }
          if(e._encounterKind==='boss_preview'){
            e._previewMotionState=createCampaignBossPreviewMotionStateV29({
              lane:e._spawnLane,strafeDirection:e._spawnStrafeDirection,
              seed:e._motionSeed,nowMs:now,
            });
            e._previewCanArm=false;
          }
          if(e._choreographyState){
            e._choreographyState=createCampaignEnemyChoreographyStateV29({
              roleId:e._waveRole,lane:e._spawnLane,
              strafeDirection:e._spawnStrafeDirection,seed:e._motionSeed,nowMs:now,
              routeVariant:e._routeVariant,
            });
          }
          if(e._chargerState)e._chargerState=createChargerMotionStateV26A3({nowMs:now});
        }
        // The entry ring communicates temporary spawn protection. Until it
        // disappears the enemy cannot be targeted, damaged, shoot or collide.
        continue;
      }
      e.miniHpBg.isVisible=true;
      e.visual?.setState('move');
      // Boss Preview first reaches a deliberate attack slot. Only then may the
      // accepted V2.8.2 mechanic capture its real entity/muzzle world origin.
      const previewMotion = e._encounterKind === 'boss_preview'
        ? stepBossPreviewEnemy(e,now,enemyFrame,frameDeltaMs) : null;
      stepEncounterMechanic(e,now);
      const miniBossHandled = e._encounterKind === 'mini_boss'
        && stepMiniBossEnemy(e,now,enemyFrame,frameDeltaMs);
      if (!miniBossHandled && !previewMotion?.handled) {
        if(e._encounterMechanicProtected&&!e._encounterMechanicComplete
          &&e._encounterMechanicId!=='charge_rush'){
          e.visual?.setState('attack');
          continue;
        }
        const beforeX=e.mesh.position.x;
        const beforeZ=e.mesh.position.z;
        if (!e.canShoot && e.tier===4) {
          const charge=stepChargerMotionV26A3(e._chargerState,{
            nowMs:now,enemyX:e.mesh.position.x,enemyZ:e.mesh.position.z,
            targetX:playerRoot.position.x,targetZ:playerRoot.position.z,
          });
          e._chargerState=charge.state;
          if(charge.event==='telegraph_started')createChargeTelegraph(e,charge.direction);
          if(charge.event==='charge_started'){
            disposeChargeTelegraph(e);
            if(e._encounterMechanicId==='charge_rush')completeEncounterMechanic(e);
          }
          if(charge.event==='recovery_started')disposeChargeTelegraph(e);
          if(charge.state.phase==='telegraph')e.visual?.setState('attack');
          else if(charge.state.phase==='recovery')e.visual?.setState('idle');
          else e.visual?.setState('move');
          if(e._chargeTelegraph&&!e._chargeTelegraph.isDisposed?.()){
            e._chargeTelegraph.visibility=.55+.25*Math.sin(now*.02);
          }
          e.mesh.position.x += charge.direction.x * e.speed * charge.speedMultiplier * enemyFrame;
          e.mesh.position.z += charge.direction.z * e.speed * charge.speedMultiplier * enemyFrame;
          updateEnemyFacing(e,charge.direction.x,charge.direction.z,frameDeltaMs);
        } else {
          const choreography = stepChoreographedEnemy(e,now,enemyFrame,frameDeltaMs);
          if (choreography?.completed) {
            cleanEnemy(e); enemies.splice(i,1); continue;
          }
          if (!choreography) {
            // Emergency/legacy movement fallback. It remains reachable only when
            // the production director is disabled or no spawn contract exists.
            if (!e.canShoot) {
              const dx = playerRoot.position.x - e.mesh.position.x;
              const dz = playerRoot.position.z - e.mesh.position.z;
              const dn = Math.sqrt(dx*dx + dz*dz) || 1;
              e.mesh.position.x += (dx/dn) * e.speed * 1.2 * enemyFrame;
              e.mesh.position.z += (dz/dn) * e.speed * 1.2 * enemyFrame;
              updateEnemyFacing(e,e.mesh.position.x-beforeX,e.mesh.position.z-beforeZ,frameDeltaMs);
            } else {
              e.mesh.position.z += e.speed * enemyFrame;
              e.mesh.position.x += (e.velX + Math.sin(tick * .03 + e.sineOff) * .04) * enemyFrame;
              const bx = boundX();
              if (e.mesh.position.z > ZOOM * .65 && e.speed > 0) e.speed = -Math.abs(e.speed);
              if (e.mesh.position.z < -ZOOM + 1 && e.speed < 0) e.speed = Math.abs(e.speed);
              if (Math.abs(e.mesh.position.x) > bx) {
                e.velX *= -1; e.mesh.position.x = clamp(e.mesh.position.x, -bx, bx);
              }
              updateEnemyFacing(e,e.mesh.position.x-beforeX,e.mesh.position.z-beforeZ,frameDeltaMs);
              if (!guestAbilities?.modifiers().cloaked&&now > e.lastShoot + e.shootMs) {
                fireAimedEnemyBullet(e,.24);
                e.visual?.setState('attack');
                e.lastShoot = now;
              }
            }
          }
        }
      }


      // Cull past screen bottom
      if (e.mesh.position.z > ZOOM + 5) { cleanEnemy(e); enemies.splice(i,1); continue; }

      // Collision with player
      {
        const dx = e.mesh.position.x - playerRoot.position.x;
        const dz = e.mesh.position.z - playerRoot.position.z;
        if (dx*dx + dz*dz < 3.24) {   // hit radius 1.8
          damagePlayer({rawDamage:e._contactDamage||(e.tier===4?400:200),source:'contact',damageType:e._damageType||'kinetic',contactId:e._contactHitId});
          if (e._encounterKind === 'mini_boss' && e._miniBossAiState) {
            e._miniBossAiState = forceCampaignMiniBossRecoveryV281(e._miniBossAiState, now);
            disposeEncounterTelegraph(e);
            disposeChargeTelegraph(e);
            const pushLength = Math.hypot(dx, dz) || 1;
            e.mesh.position.x += dx / pushLength * .45;
            e.mesh.position.z += dz / pushLength * .45;
            explode(e.mesh.position, .85);
          } else {
            explode(e.mesh.position, 1.5);
            cleanEnemy(e); enemies.splice(i,1); continue;
          }
        }
      }

      // Shared bullet collision radius, pierce ledger, status and splash.
      let killed = false;
      for (let j = playerBullets.length - 1; j >= 0; j--) {
        const bullet = playerBullets[j];
        if (bullet.isDisposed?.() || !projectileHitsPoint(bullet, e.mesh.position, 1.5)) continue;
        const hit = shots.registerHit(bullet, e);
        if (!hit.accepted) continue; // pierced target already hit: never double damage
        const impact = { x: e.mesh.position.x, z: e.mesh.position.z };
        const rawProjectileDamage=calculateProjectileDamage(bullet.atk, stats.critDamageBoost);
        const damage=guestAbilities&&bullet._kind==='main'
          ?rawProjectileDamage*guestCounterMultiplierV2({
            damageType:GUN_DAMAGE_TYPES_V2[stats.mainGunId],
            targetDefense:legacyTierDefenseClass(e.tier),
          })
          :rawProjectileDamage;
        if (bullet._slowMs) e._slowUntil = now + bullet._slowMs;
        killed = applyPlayerDamageToEnemy(e, damage);
        if (bullet._splashRadius) applyCampaignSplash(bullet, impact, damage, e);
        if (hit.consumed || bullet._splashRadius) {
          safeDispose(bullet);
          playerBullets.splice(j, 1);
        }
        if (killed) break;
      }
      if (killed) continue;
    }

    // ── Boss intro telegraph ──
    if(gameState==='BOSS_INTRO'){
      if(bossMesh&&!bossMesh.isDisposed?.())bossVisual?.tick(frameDeltaMs);
      if(bossRevealHalo&&!bossRevealHalo.isDisposed?.()){
        const elapsed=Math.max(0,now-bossIntroStartedAt);
        const pulse=1+.08*Math.sin(elapsed*.018);
        bossRevealHalo.scaling.x=pulse;
        bossRevealHalo.scaling.z=pulse;
        bossRevealHalo.visibility=.55+.25*Math.sin(elapsed*.022);
      }
    }

    // ── Boss ──
    if (gameState==='BOSS_FIGHT' && bossMesh && !bossMesh.isDisposed?.()) {
      bossVisual?.tick(frameFactor * (1000 / 60));
      bossVisual?.setState('move');
      // Entry slide
      if (bossMesh.position.z < -ZOOM + 7)
        bossMesh.position.z = BABYLON.Scalar.Lerp(bossMesh.position.z, -ZOOM+7, scaledLerpFactor(.018,frameFactor));

      const bossTransitioning=Boolean(bossPhaseTransition);
      if(bossTransitioning){
        bossVisual?.setState('enrage');
        const pulse=1+.035*Math.sin(now*.025);
        bossMesh.scaling.x=pulse;
        bossMesh.scaling.z=pulse;
      }else{
        bossMesh.scaling.x=1;
        bossMesh.scaling.z=1;
        if(campaignCombatV3Enabled&&bossCombatState){
          const bossStep=stepCampaignBossCombatV29(bossCombatState,{
            nowMs:now,
            hpRatio:bossMaxHp>0?bossHp/bossMaxHp:0,
            frameScale:frameFactor,
            baseSpeed:.045,
            enemyX:bossMesh.position.x,
            enemyZ:bossMesh.position.z,
            playerX:playerRoot.position.x,
            playerZ:playerRoot.position.z,
            origin:resolveBossMuzzleOrigin(),
            arenaHalfWidth:boundX(),
            worldHalfHeight:ZOOM,
            viewportHeight:battleViewportMetrics.cssH,
            hudOcclusionLineZ:enemyEntryPolicy.engagementLineZ,
            entityScale:1.7,
          });
          bossCombatState=bossStep.state;
          const beforeX=bossMesh.position.x;
          const beforeZ=bossMesh.position.z;
          bossMesh.position.x=clamp(bossMesh.position.x+bossStep.deltaX,-boundX()+1.25,boundX()-1.25);
          bossMesh.position.z=clamp(bossMesh.position.z+bossStep.deltaZ,-ZOOM+4.4,ZOOM-5.2);
          if(bossStep.facePlayer){
            updateBossFacing(
              playerRoot.position.x-bossMesh.position.x,
              playerRoot.position.z-bossMesh.position.z,
              frameDeltaMs,
            );
          }else if(!bossStep.holdOrientation){
            updateBossFacing(
              bossMesh.position.x-beforeX,
              bossMesh.position.z-beforeZ,
              frameDeltaMs,
            );
          }
          bossVisual?.setState(bossStep.visualState||'move');
          for(const event of bossStep.events){
            if(event.type==='telegraph_started')createBossAttackTelegraph(event.plan);
            else if(event.type==='fire_pattern')fireBossAttackPlan(event.plan);
            else if(event.type==='enrage_started')activateBossFrenzyV31({announce:!bossEnraged});
            else if(event.type==='telegraph_ended'||event.type==='telegraph_cancelled'){
              disposeBossAttackTelegraph();
            }
          }
          if(bossEnraged){
            const aura=ensureBossFrenzyAura();
            if(aura&&!aura.isDisposed?.()){
              const auraPulse=1+.11*Math.sin(now*.024);
              aura.scaling.x=auraPulse;
              aura.scaling.z=auraPulse;
              aura.visibility=.62+.24*Math.sin(now*.031);
            }
          }
          for(const corridor of bossAttackTelegraphs){
            if(corridor&&!corridor.isDisposed?.()){
              corridor.visibility=.54+.18*Math.sin(now*.021);
            }
          }
        }else{
          // Emergency kill-switch legacy boss fallback.
          bossFloatT += .010 * frameFactor;
          bossMesh.position.z = (-ZOOM+7) + Math.sin(bossFloatT*.7) * .9;
          bossMesh.position.x += bossVelX * (bossEnraged ? 1.8 : 1) * frameFactor;
          const bx = boundX() - 2;
          if (Math.abs(bossMesh.position.x) > bx) {
            bossVelX *= -1; bossMesh.position.x = clamp(bossMesh.position.x, -bx, bx);
          }

          if (now > nextBossFire) {
            bossVisual?.setState('attack');
            const isAlien    = stageConfig.bossType==='alien';
            const attackType = 1 + Math.floor(Math.random()*3);
            if (attackType===1) {
              for (let k=-3; k<=3; k++) fireEnemyBullet(bossMesh.position, k*.09, .45,{priority:'boss'});
            } else if (attackType===2) {
              const cnt = isAlien ? 16 : 8;
              for (let a=0; a < Math.PI*2; a += Math.PI*2/cnt)
                fireEnemyBullet(bossMesh.position, Math.cos(a)*(isAlien?.52:.38), Math.sin(a)*(isAlien?.52:.38),{priority:'boss'});
            } else {
              const dx = playerRoot.position.x - bossMesh.position.x;
              const dz = playerRoot.position.z - bossMesh.position.z;
              const dn = Math.sqrt(dx*dx+dz*dz)||1;
              fireEnemyBullet(bossMesh.position, (dx/dn)*.58, (dz/dn)*.58,{priority:'boss'});
            }
            const base = isAlien ? 700+Math.random()*600 : 1100+Math.random()*900;
            nextBossFire = now + (bossEnraged ? base*.5 : base);
          }
        }
      }

      // Bullet hits boss
      for (let j = playerBullets.length-1; j >= 0; j--) {
        const b = playerBullets[j];
        if (b.isDisposed?.()) continue;
        const dx = b.position.x - bossMesh.position.x;
        const dz = b.position.z - bossMesh.position.z;
        if (dx*dx + dz*dz > 7.84) continue;  // hit radius 2.8
        const hit = shots.registerHit(b, { mesh: bossMesh });
        if (!hit.accepted) continue;

        const rawBossDamage = calculateProjectileDamage(b.atk, stats.critDamageBoost);
        const bossDamage = guestAbilities && b._kind === 'main'
          ? rawBossDamage * guestCounterMultiplierV2({
              damageType:GUN_DAMAGE_TYPES_V2[stats.mainGunId],targetDefense:'boss',
            })
          : rawBossDamage;
        const bossKilled=applyPlayerDamageToBoss(bossDamage);
        if (hit.consumed || b._splashRadius) { safeDispose(b); playerBullets.splice(j,1); }
        if(bossKilled)break;
      }

      // Boss ↔ player collision
      if (bossMesh&&!bossPhaseTransition) {
        const dx = bossMesh.position.x - playerRoot.position.x;
        const dz = bossMesh.position.z - playerRoot.position.z;
        if (dx*dx + dz*dz < 10.24) damagePlayer({
          rawDamage:400,source:'contact',damageType:'kinetic',
          contactId:bossMesh._contactHitId||'campaign-boss-contact',
        });   // hit radius 3.2
      }
    }

    // ── Drops ──
    for (let i = drops.length-1; i >= 0; i--) {
      const d = drops[i];
      if (d._dead) { drops.splice(i,1); continue; }
      d.mesh.position.z += .055 * frameFactor;
      // Magnet collect
      const dx = d.mesh.position.x - playerRoot.position.x;
      const dz = d.mesh.position.z - playerRoot.position.z;
      if (dx*dx + dz*dz < 2.25) {
        if (d.type==='coin') {
          collectedCoins += 5;
          showTextEffect(playerRoot.position.x, playerRoot.position.z-.5, lang==='vi'?'+5 Xu':'+5 Coins', '#f1c40f');
        } else if (d.type==='heal') {
          stats.hp = Math.min(stats.maxHp, stats.hp+200); updateHpBar();
          showTextEffect(playerRoot.position.x, playerRoot.position.z-.5, '+200 HP', '#2ecc71');
        } else {
          activeEffects.add({id:'campaign_attack_boost',stat:'atk',op:'add',value:50,
            durationMs:5000,stackGroup:'campaign_attack_boost',maxStacks:3},now);
          showTextEffect(playerRoot.position.x, playerRoot.position.z-.5, lang==='vi'?'TĂNG SỨC MẠNH!':'POWER UP!', '#3498db');
        }
        safeDispose(d.mesh); d._dead=true; drops.splice(i,1); continue;
      }
      if (d.mesh.position.z > ZOOM+5) { safeDispose(d.mesh); d._dead=true; drops.splice(i,1); }
    }

    // ── Spawn enemies (PLAYING state) ──
    if (gameState==='PLAYING') {
      if (waveSpawned < waveCount) {
        if(currentWavePlan){
          const elapsed=Math.max(0,now-currentWaveStartedAt);
          let spawnedThisFrame=0;
          while(waveSpawned<waveCount&&spawnedThisFrame<2){
            const nextSpec=currentWavePlan.entries[waveSpawned];
            if(!nextSpec||elapsed<nextSpec.spawnOffsetMs)break;
            if(!spawnEnemy(nextSpec))break;
            waveSpawned++;
            spawnedThisFrame++;
          }
        }else if (now > lastSpawn + spawnInterval) {
          if (spawnEnemy()) waveSpawned++;
          // A capacity clamp queues the remaining spawn instead of retrying on
          // every render frame and overwhelming low-end devices.
          lastSpawn = now;
        }
      } else {
        // All spawned, wait for all to die
        const alive = enemies.filter(e => !e._dead).length;
        if (alive===0) {
          if(currentWavePlan?.guaranteedDrop&&!waveRecoveryDropSpawned){
            waveRecoveryDropSpawned=true;
            spawnDrop(playerRoot.position.x,playerRoot.position.z-2,currentWavePlan.guaranteedDrop);
          }
          if (currentWave < CAMPAIGN_WAVES_TOTAL) {
            setGameState('TRANSITION');
            showAnnouncement(lang==='vi'?'DỌN SẠCH!':'SECTOR CLEARED!', '#2ecc71', 1000);
            if(currentWavePlan){
              scheduleBattleTimer(
                () => startWave(currentWave+1),
                currentWavePlan.interWaveDelayMs||2000,
              );
            }else{
              scheduleBattleTimer(() => startWave(currentWave+1), 2000);
            }
          } else if (!stageConfig.hasBoss) {
            stageCleared();
          }
        }
      }
    }
  });

  // Runtime heartbeat is emitted after the gameplay observer. If gameplay
  // throws, the render wrapper catches it and this heartbeat is intentionally
  // not advanced, preserving the last useful diagnostic snapshot.
  let lastRuntimeHeartbeatAt = -Infinity;
  scene.onBeforeRenderObservable.add(() => {
    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    if (nowMs - lastRuntimeHeartbeatAt < 250) return;
    lastRuntimeHeartbeatAt = nowMs;
    try {
      data.onRuntimeHeartbeat?.(createCampaignRuntimeSnapshotV26A3({
        active: !battleSceneDisposed && !gameOver && gameState !== 'CLEAR' && gameState !== 'GAMEOVER',
        gameState,
        planetId: currentPlanetId,
        stageId: currentStage,
        wave: currentWave,
        wavesTotal: CAMPAIGN_WAVES_TOTAL,
        tick,
        enemies: enemies.filter(enemy => !enemy._dead).length,
        playerProjectiles: playerBullets.length,
        pendingPlayerShots: shots.pendingCount(),
        enemyProjectiles: enemyBullets.length,
        deathVisuals: deathVisuals.activeCount,
        capacityClamps: runtimeCapacityClamps,
      }));
    } catch (_) {
      // Diagnostics must never affect gameplay.
    }
  });
};
