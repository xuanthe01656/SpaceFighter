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
import { createGuestAbilityRuntimeV2 } from '../../game/combat/GuestAbilityRuntimeV2.js';
import { deriveGuestAbilityActivationGateV2 } from '../../game/combat/GuestAbilityActivationGateV2.js';
import { resolveGuestCombatQaRuntimeFromViteEnv } from '../../game/combat/GuestCombatQaBuildGateV2.js';
import { resolveGuestCombatQaLoadoutV2 } from '../../game/combat/GuestCombatQaLoadoutV2.js';
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
  const mobileQaLoadout=guestAbilityQa&&import.meta.env.VITE_SF_GUEST_COMBAT_V2_QA==='true'
    ?resolveGuestCombatQaLoadoutV2(globalThis.location?.search||''):null;
  const requestedShip=requestedQa?.get('sfGuestShip')||mobileQaLoadout?.shipId;
  const requestedArmor=requestedQa?.get('sfGuestArmor')||mobileQaLoadout?.armorId;
  const forceNextProjectileEvadeQa=requestedQa?.get('sfArmorQa')==='force-next-projectile';
  const previewShip=AIRCRAFTS.some(a=>a.id===requestedShip)?requestedShip:null;
  const previewArmor=GEAR_CATALOG.armor.some(a=>a.id===requestedArmor)?requestedArmor:null;
  const previewArmorKey='__sf_guest_lab_armor__';
  const qaBattleData=(guestAbilityQa||previewShip||previewArmor)
    ?{...campaignData,
      progress:{...progress,currentPlanet:currentPlanetId,selectedStage:currentStage},
      loadout:{...loadout,...(previewShip?{aircraft:previewShip}:{}),
        ...(previewArmor?{armor:previewArmorKey}:{})},
      ...(previewArmor?{items:{...items,[previewArmorKey]:{baseId:previewArmor,level:1,rarity:1}}}:{})}
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
  const enemyBulMat = makeMat(scene, new BABYLON.Color3(1, .28, .34));
  const playerDamageGate = createPlayerDamageGateV25();
  let enemyProjectileSequence = 0;
  const shots = createProjectileEmitter({ scene, BABYLON, bullets: playerBullets, scheduleBattleTimer });
  const liveTargets = () => [
    ...enemies.filter(e => !e._dead && !e.mesh.isDisposed?.()),
    ...(bossMesh && !bossMesh.isDisposed?.() ? [{ mesh: bossMesh, isBoss: true }] : []),
  ];
  const fireEnemyBullet = (pos, vx = 0, vz = 0.24) => {
    const hitId = `campaign-enemy-projectile-${++enemyProjectileSequence}`;
    const b = BABYLON.MeshBuilder.CreateSphere(hitId, { diameter: 0.44 }, scene);
    b.position = pos.clone(); b.position.y = 0;
    b.material = enemyBulMat; b._vx = vx; b._vz = vz;
    b._damageHitId = hitId;
    enemyBullets.push(b);
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

  /** Fallback mesh nếu không có imgSrc */
  const buildFallbackEnemy = (tier) => {
    let m;
    switch (tier) {
      case 2: m = BABYLON.MeshBuilder.CreateBox(`ef2_${Date.now()}`, { width:2.0, depth:2.0, height:.45 }, scene); break;
      case 3: m = BABYLON.MeshBuilder.CreateCylinder(`ef3_${Date.now()}`, { diameterTop:1.2, diameterBottom:.5, height:.45, tessellation:6 }, scene); break;
      case 4:
        m = BABYLON.MeshBuilder.CreateTorus(`ef4_${Date.now()}`, { diameter:1.8, thickness:.35, tessellation:24 }, scene);
        m.rotation.x = Math.PI/2;
        break;
      default: m = BABYLON.MeshBuilder.CreateSphere(`ef1_${Date.now()}`, { diameterX:1.6, diameterZ:1.6, diameterY:.4 }, scene);
    }
    m.material = makeMat(scene, TIER_COL[tier] || TIER_COL[1]);
    return m;
  };

  const spawnEnemy = () => {
    const rand = Math.random() * 100;
    let tier = 1;
    if (currentStage >= 2 && rand > 50) tier = 2;
    if (currentStage >= 4 && rand > 75) tier = 3;
    if (currentStage >= 6 && rand > 85) tier = 4;

    const cfg    = curEnemyCfgs.find(e => e.tier === tier) || curEnemyCfgs[0];
    const spawnX = playerRoot.position.x + (Math.random() - .5) * boundX() * 1.6;
    const spawnZ = -ZOOM - 3;

    // Gameplay/collision root is always stable. Artwork may arrive later via
    // asset manifest; no asset load may replace this root mid-battle.
    const mesh = buildFallbackEnemy(tier);
    mesh.position.set(spawnX, .2, spawnZ);
    const visual = attachBattleEntityVisual(scene, BABYLON, mesh, 'enemy', cfg.id);

    const rawSpeed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    const speed    = rawSpeed / 1200;   // pixels/s → Babylon units/frame@60fps

    let baseHp = cfg.baseHp + currentStage * 15 + currentWave * 5;
    baseHp     = Math.floor(baseHp * combat.environment.enemyHpMultiplier);
    const pts  = isReplay ? Math.max(1, Math.floor(cfg.score / 2)) : cfg.score;

    // Mini HP bar
    const miniHpBg = new GUI.Rectangle(`ehb_${mesh.uniqueId}`);
    miniHpBg.width = `${46}px`; miniHpBg.height = `${5}px`;
    miniHpBg.background = '#111'; miniHpBg.color = '#ffffff30';
    miniHpBg.cornerRadius = 3; miniHpBg.thickness = 1;
    ui.addControl(miniHpBg);
    miniHpBg.linkWithMesh(mesh);
    miniHpBg.linkOffsetYInPixels = -28;

    const miniHp = new GUI.Rectangle(`ehf_${mesh.uniqueId}`);
    miniHp.width = '100%'; miniHp.height = '100%';
    miniHp.background = tier===3?'#ffdd55': tier===2?'#ff8a66':'#66ddff';
    miniHp.thickness = 0; miniHp.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    miniHpBg.addControl(miniHp);

    enemies.push({
      mesh, visual, hp: baseHp, maxHp: baseHp, tier, speed,
      velX: tier===4 ? 0 : (Math.random()-.5)*.05,
      sineOff: Math.random() * Math.PI * 2,
      isBoss: false, isEnraged: false,
      canShoot: tier !== 4 && Math.random() > .5,
      lastShoot: 0, shootMs: tier===3 ? 1400 : 2200,
      points: pts, miniHpBg, miniHp, _dead: false,
      _contactHitId: `campaign-enemy-contact-${mesh.uniqueId}`,
    });
  };

  const cleanEnemy = (e, killedByDamage = false) => {
    if (e._dead) return;
    e._dead = true; // prevent repeated kills/rewards before any rendering work
    if (killedByDamage) deathVisuals.capture(e.visual);
    else e.visual?.dispose();
    safeDisposeGui(e.miniHp); safeDisposeGui(e.miniHpBg);
    safeDispose(e.mesh); // authoritative hitbox is gone THIS frame
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 10. BOSS SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  let bossMesh    = null, bossVisual = null, bossHp = 0, bossMaxHp = 0;
  let bossEnraged = false, bossPts = 0;
  let bossVelX    = 0.028, bossFloatT = 0, nextBossFire = 0;

  const buildFallbackBoss = (bType) => {
    const m = BABYLON.MeshBuilder.CreateSphere('bFb', { diameter: 3.8, segments: 24 }, scene);
    m.material = makeMat(scene, new BABYLON.Color3(1, .2, .2));
    const ring = BABYLON.MeshBuilder.CreateTorus('bRingFb', { diameter: 7.5, thickness: .45, tessellation: 48 }, scene);
    ring.parent = m; ring.rotation.x = Math.PI/2;
    ring.material = makeMat(scene, new BABYLON.Color3(1, .5, 0));
    return m;
  };

  const spawnBoss = () => {
    const bType   = stageConfig.bossType || 'mech';
    const bossCfg = curBossCfgs[bType] || Object.values(curBossCfgs)[0];

    bossHp    = Math.floor((bossCfg.baseHp || 25000) * combat.environment.enemyHpMultiplier);
    bossMaxHp = bossHp; bossEnraged = false;
    bossPts   = isReplay ? Math.max(10, Math.floor((bossCfg.score||100)/3)) : (bossCfg.score||100);

    bossMesh = buildFallbackBoss(bType);
    bossMesh.position.set(0, .5, -ZOOM - 6);
    bossMesh._contactHitId = 'campaign-boss-contact';
    bossVisual = attachBattleEntityVisual(scene, BABYLON, bossMesh, 'boss', bossCfg.id);

    bossNameText.text = `⚠ ${lang==='vi' ? `TRÙM ẢI ${currentStage}` : `STAGE ${currentStage} BOSS`}`;
    bossHpFill.width  = '100%'; bossPanel.isVisible = !externalHud;
    showAnnouncement(
      lang==='vi' ? '⚠ CẢNH BÁO: TRÙM CUỐI ⚠' : '⚠ BOSS APPROACHING ⚠',
      '#ff4757', 3000);
    nextBossFire = Date.now() + 3200;
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
  let currentWave   = 0;
  let waveCount     = 0;   // total enemies to spawn in current wave
  let waveSpawned   = 0;
  let lastSpawn     = 0;
  let spawnInterval = 1200;
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
    return Object.freeze({...guestAbilities.snapshot(),activationGate:getGuestAbilityActivationGate()});
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
    waveCount = (stageConfig.baseEnemies||5) + currentWave * 3;
    spawnInterval = Math.max(300, 1500 - (currentStage*100 + currentWave*50));
    waveSpawned   = 0;
    lastSpawn     = Date.now() + 500;

    waveText.text = lang==='vi'
      ? `ẢI ${currentStage} | ĐỢT ${n}/${MAX_WAVES}`
      : `STAGE ${currentStage} | WAVE ${n}/${MAX_WAVES}`;

    if (n === MAX_WAVES && stageConfig.hasBoss) {
      showAnnouncement(
        lang==='vi' ? 'CẢNH BÁO:\nTRÙM CUỐI XUẤT HIỆN!' : 'WARNING:\nBOSS APPROACHING!',
        '#ff4757', 3000);
      setGameState('BOSS_INTRO');
      scheduleBattleTimer(() => {
        spawnBoss();
        setGameState('BOSS_FIGHT');
      }, 3500);
      return;
    }
    showAnnouncement(
      `${lang==='vi'?'TIẾN VÀO ĐỢT':'ENTERING WAVE'} ${n}`, '#66fcf1');
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
        if(!enemy.mesh?.position||enemy._dead)continue;
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
      gameOver = true; setGameState('GAMEOVER');
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
    if (!enemy || enemy._dead || enemy.mesh.isDisposed?.()) return false;
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
    if(!bossMesh||bossMesh.isDisposed?.()||bossHp<=0)return false;
    if(guestAbilities&&bossMesh._guestMarkUntilTick>guestAbilities.tick)
      damage*=1+(bossMesh._guestMarkBonus||0);
    bossHp-=Math.max(0,damage);
    bossVisual?.setState('hit');
    showTextEffect(bossMesh.position.x,bossMesh.position.z,`-${Math.round(damage)}`,'#ff4757');
    bossHpFill.width=`${Math.max(0,Math.round(bossHp/bossMaxHp*100))}%`;
    if(bossMesh.material?.emissiveColor){
      const original=bossMesh.material.emissiveColor.clone();
      bossMesh.material.emissiveColor=new BABYLON.Color3(1,1,1);
      scheduleBattleTimer(()=>{if(bossMesh?.material)bossMesh.material.emissiveColor=original;},60);
    }
    if(!bossEnraged&&bossHp<=bossMaxHp*.3&&bossHp>0){
      bossEnraged=true;
      bossVisual?.setState('enrage');
      showAnnouncement(lang==='vi'?'CẢNH BÁO: TRÙM NỔI ĐIÊN!':'WARNING: BOSS ENRAGED!','#ff0000',3000);
      bossVelX*=1.6;
      if(bossMesh.material)bossMesh.material.emissiveColor=new BABYLON.Color3(1,.3,.3);
    }
    if(bossHp>0)return false;
    explode(bossMesh.position,5);
    updateScore(bossPts);
    trackEventKill();
    bossPanel.isVisible=false;
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
          if(enemy._dead||enemy.mesh?.isDisposed?.())continue;
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
    try{data.onHudUpdate({stage:currentStage,wave:Math.max(1,currentWave),wavesTotal:MAX_WAVES,
      hp:stats.hp,maxHp:stats.maxHp,kills:verifiedClientKills,score,
      bossHp:bossMesh&&bossHp>0?bossHp:null,bossMaxHp:bossMesh&&bossMaxHp>0?bossMaxHp:null});}catch(_){}
  });

  // Kick off first wave
  scheduleBattleTimer(() => startWave(1), 1000);

  scene.onBeforeRenderObservable.add(() => {
    if (gameOver || gameState === 'CLEAR') return;
    const now = Date.now();
    activeEffects.update(now);
    const frameFactor = frameScale(engine.getDeltaTime());
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
    for (let i = enemyBullets.length-1; i >= 0; i--) {
      const b = enemyBullets[i];
      if (b.isDisposed?.()) { enemyBullets.splice(i,1); continue; }
      b.position.x += b._vx * frameFactor; b.position.z += b._vz * frameFactor;

      if (b.position.z > ZOOM+3 || b.position.z < -ZOOM-3 || Math.abs(b.position.x) > cullX) {
        safeDispose(b); enemyBullets.splice(i,1); continue;
      }
      const dx = b.position.x - playerRoot.position.x;
      const dz = b.position.z - playerRoot.position.z;
      if (dx*dx + dz*dz < 1.44) {   // hit radius 1.2
        damagePlayer({rawDamage:200,source:'projectile',damageType:'energy',hitId:b._damageHitId});
        safeDispose(b); enemyBullets.splice(i,1);
      }
    }

    // ── Enemies ──
    for (let i = enemies.length-1; i >= 0; i--) {
      const e = enemies[i];
      if (e._dead) { enemies.splice(i,1); continue; }

      e.visual?.tick(frameFactor * (1000 / 60));
      e.visual?.setState('move');
      const enemyFrame = frameFactor * enemySpeedFactor(e, now);
      if (!e.canShoot) {
        // Kamikaze / melee – chase player
        const dx = playerRoot.position.x - e.mesh.position.x;
        const dz = playerRoot.position.z - e.mesh.position.z;
        const dn = Math.sqrt(dx*dx + dz*dz) || 1;
        e.mesh.position.x += (dx/dn) * e.speed * 1.2 * enemyFrame;
        e.mesh.position.z += (dz/dn) * e.speed * 1.2 * enemyFrame;
      } else {
        // Patrol + shoot
        e.mesh.position.z += e.speed * enemyFrame;
        e.mesh.position.x += (e.velX + Math.sin(tick * .03 + e.sineOff) * .04) * enemyFrame;
        const bx = boundX();
        if (e.mesh.position.z > ZOOM * .65 && e.speed > 0) e.speed = -Math.abs(e.speed);
        if (e.mesh.position.z < -ZOOM + 1 && e.speed < 0) e.speed = Math.abs(e.speed);
        if (Math.abs(e.mesh.position.x) > bx) {
          e.velX *= -1; e.mesh.position.x = clamp(e.mesh.position.x, -bx, bx);
        }
        if (!guestAbilities?.modifiers().cloaked&&now > e.lastShoot + e.shootMs) {
          const dx = playerRoot.position.x - e.mesh.position.x;
          const dz = playerRoot.position.z - e.mesh.position.z;
          const dn = Math.sqrt(dx*dx + dz*dz) || 1;
          fireEnemyBullet(e.mesh.position, (dx/dn)*.24, (dz/dn)*.24);
          e.visual?.setState('attack');
          e.lastShoot = now;
        }
      }

      // Cull past screen bottom
      if (e.mesh.position.z > ZOOM + 5) { cleanEnemy(e); enemies.splice(i,1); continue; }

      // Collision with player
      {
        const dx = e.mesh.position.x - playerRoot.position.x;
        const dz = e.mesh.position.z - playerRoot.position.z;
        if (dx*dx + dz*dz < 3.24) {   // hit radius 1.8
          damagePlayer({rawDamage:e.tier===4?400:200,source:'contact',damageType:'kinetic',contactId:e._contactHitId});
          explode(e.mesh.position, 1.5);
          cleanEnemy(e); enemies.splice(i,1); continue;
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

    // ── Boss ──
    if (gameState==='BOSS_FIGHT' && bossMesh && !bossMesh.isDisposed?.()) {
      bossVisual?.tick(frameFactor * (1000 / 60));
      bossVisual?.setState('move');
      // Entry slide
      if (bossMesh.position.z < -ZOOM + 7)
        bossMesh.position.z = BABYLON.Scalar.Lerp(bossMesh.position.z, -ZOOM+7, scaledLerpFactor(.018,frameFactor));

      // Patrol
      bossFloatT += .010 * frameFactor;
      bossMesh.position.z = (-ZOOM+7) + Math.sin(bossFloatT*.7) * .9;
      bossMesh.position.x += bossVelX * (bossEnraged ? 1.8 : 1) * frameFactor;
      const bx = boundX() - 2;
      if (Math.abs(bossMesh.position.x) > bx) {
        bossVelX *= -1; bossMesh.position.x = clamp(bossMesh.position.x, -bx, bx);
      }

      // Boss fire
      if (now > nextBossFire) {
        bossVisual?.setState('attack');
        const isAlien    = stageConfig.bossType==='alien';
        const attackType = 1 + Math.floor(Math.random()*3);
        if (attackType===1) {
          for (let k=-3; k<=3; k++) fireEnemyBullet(bossMesh.position, k*.09, .45);
        } else if (attackType===2) {
          const cnt = isAlien ? 16 : 8;
          for (let a=0; a < Math.PI*2; a += Math.PI*2/cnt)
            fireEnemyBullet(bossMesh.position, Math.cos(a)*(isAlien?.52:.38), Math.sin(a)*(isAlien?.52:.38));
        } else {
          const dx = playerRoot.position.x - bossMesh.position.x;
          const dz = playerRoot.position.z - bossMesh.position.z;
          const dn = Math.sqrt(dx*dx+dz*dz)||1;
          fireEnemyBullet(bossMesh.position, (dx/dn)*.58, (dz/dn)*.58);
        }
        const base = isAlien ? 700+Math.random()*600 : 1100+Math.random()*900;
        nextBossFire = now + (bossEnraged ? base*.5 : base);
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
      if (bossMesh) {
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
        if (now > lastSpawn + spawnInterval) { spawnEnemy(); waveSpawned++; lastSpawn = now; }
      } else {
        // All spawned, wait for all to die
        const alive = enemies.filter(e => !e._dead).length;
        if (alive===0) {
          if (currentWave < MAX_WAVES) {
            setGameState('TRANSITION');
            showAnnouncement(lang==='vi'?'DỌN SẠCH!':'SECTOR CLEARED!', '#2ecc71', 1000);
            scheduleBattleTimer(() => startWave(currentWave+1), 2000);
          } else if (!stageConfig.hasBoss) {
            stageCleared();
          }
        }
      }
    }
  });
};