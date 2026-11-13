import * as BABYLON from '@babylonjs/core';
import * as GUI    from '@babylonjs/gui';
import { measureBattleHud } from '../../game/ui/BattleHudLayout';
import { AIRCRAFTS, GEAR_CATALOG, PILOTS, DUNGEON_CONFIG, EVENT_CONFIG } from '../../constants';
import { recordGuestEventKill } from '../../utils/guestProgress';
import { deriveBattleLoadout, calculateProjectileDamage } from '../../utils/combatStats';
import { frameScale, scaledLerpFactor } from '../../utils/frameTime';
import { battleSpeedMultiplier, BATTLE_WORLD_HALF_HEIGHT } from '../../game/config/BattleRules';
import { resolveDungeonDifficulty } from '../../game/config/DungeonDifficulty';
import { createBattlePassiveState, receiveBattleHit, shouldEchoShot } from '../../game/combat/BattlePassives';
import { createPlayerShipVisual } from '../../game/rendering/ShipVisualFactory';
import { attachBattleEntityVisual, preloadBattleEntityVisualProfiles } from '../../game/rendering/BattleEntityVisual';
import { createBattleDeathVisualQueue } from '../../game/rendering/BattleDeathVisualQueue';
import { resolveAssetVisual } from '../../game/assets/AssetRegistry.js';
import { createShipEngineFx } from '../../game/rendering/ShipEngineFx';
import { createShipInputController } from '../../game/combat/ShipInputController';
import { describeMainSalvo, describeWingSalvo, describeDroneSalvo, pickWeaponTarget, enemySpeedFactor, shieldDamageFactor, repairAmount, projectileHitsPoint } from '../../game/combat/PlayerWeapons';
import { createProjectileEmitter } from '../../game/combat/ProjectileEmitter';
import { createPlayerDamageGateV25, createPlayerDamageOutcomeV25 } from '../../game/combat/PlayerDamagePipelineV25.js';
import { resolveEnemyGameplayYawV26A4 } from '../../game/assets/EnemyVisualHeadingV26A4.js';
import { resolveBattleBackground, legacyBattleBackgroundRequested, previewBg4Variant } from '../../game/catalog/BackgroundCatalog';
import { createScrollingBattleBackground } from '../../game/rendering/ScrollingBackgroundRenderer';
import { attachBattleBackgroundProfiler } from '../../game/rendering/BattleBackgroundProfiler.js';
import { assertCampaignGameplayFoundationLockRC1 } from '../../game/combat/CampaignGameplayFoundationLockRC1.js';
import {
    createCampaignEnemyChoreographyStateV29,
    stepCampaignEnemyChoreographyV29,
} from '../../game/combat/CampaignCombatChoreographyV29.js';
import {
    createCampaignEnemyCombatSlotRegistryV37,
    getCampaignEnemyCombatSlotV37,
    syncCampaignEnemyCombatSlotsV37,
} from '../../game/combat/CampaignEnemyCombatSlotsV37.js';
import {
    createChargerMotionStateV26A3,
    stepChargerMotionV26A3,
} from '../../game/combat/CampaignRuntimeReliabilityV26A3.js';
import {
    advanceCampaignEnemyProjectileV31,
    createCampaignEnemyShotPlanV31,
    resolveCampaignEnemyProjectileVisualV31,
} from '../../game/combat/CampaignEnemyProjectileV31.js';
import { createCampaignEnemyVolleyPlanV34 } from '../../game/combat/CampaignEnemyVolleyV34.js';
import { createCampaignProjectileVisualFactoryV32 } from '../../game/rendering/CampaignProjectileVisualV32.js';
import {
    isDungeonParityFoundationEnabledV38,
    resolveDungeonRuntimeProfileV38,
} from '../../game/dungeon/DungeonEncounterCatalogV38.js';
import { resolveDungeonVisualAssetRefsV393 } from '../../game/dungeon/DungeonContentCatalogV393.js';
import {
    advanceNaturalHazardMotionV394,
    createNaturalHazardMotionV394,
    createProgressiveObjectiveSequenceV394,
    getProgressiveObjectiveSnapshotV394,
    resolveDungeonHazardCueV394,
    resolveDungeonHazardLaneNormV394,
    stepProgressiveObjectiveSequenceV394,
} from '../../game/dungeon/DungeonRoomFlowV394.js';
import {
    resolveDungeonBossVisualBindingV394,
    resolveDungeonEnemyVisualBindingV394,
} from '../../game/dungeon/DungeonVisualBindingV394.js';
import {
    advanceDungeonObjectiveWorldMotionV395,
    createDungeonObjectiveWorldMotionV395,
} from '../../game/dungeon/DungeonWorldTraversalV395.js';
import {
    createDungeonEncounterDirectorV38,
    getDungeonEncounterSnapshotV38,
    stepDungeonEncounterDirectorV38,
} from '../../game/dungeon/DungeonEncounterDirectorV38.js';
import {
    createDungeonCombatSlotDescriptorV38,
    createDungeonEnemyChoreographyStateV38,
    resolveDungeonEnemySpawnPointV38,
    resolveDungeonEnemySpecV38,
} from '../../game/dungeon/DungeonCombatAdapterV38.js';
import {
    createDungeonBossControllerV38,
    getDungeonBossSnapshotV38,
    projectilesFromDungeonBossAttackPlanV38,
    stepDungeonBossControllerV38,
    stopDungeonBossControllerV38,
} from '../../game/dungeon/DungeonBossAdapterV38.js';
import {
    resolveDungeonBossPatternPresentationV39,
    resolveDungeonPresentationV39,
    resolveDungeonRoomObjectiveV39,
} from '../../game/dungeon/DungeonPresentationV39.js';
import { isDungeonQaRunV391 } from '../../game/dungeon/DungeonQaAccessV391.js';
import {
    buildDungeonRoomMarkersV396,
    resolveDungeonHudOcclusionLineV396,
    resolveDungeonHudProfileV396,
    resolveDungeonHudRoomV396,
    resolveDungeonObjectiveProgressV396,
} from '../../game/dungeon/DungeonHudCatalogV396.js';
import {
    logicalCircleHitV392,
    logicalSegmentCircleHitV392,
    resolveDungeonHazardCombatV392,
    resolveDungeonHostileProjectileHitRadiusV392,
} from '../../game/dungeon/DungeonCombatIntegrityV392.js';
import {
    createDungeonBackdropV39,
    createDungeonBossFallbackV39,
    createDungeonBreakableVisualV39,
    createDungeonHazardTelegraphV39,
    createDungeonHazardVisualV39,
} from '../../game/rendering/DungeonPresentationFactoryV39.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const stableSeed = (...parts) => {
    let hash = 2166136261;
    for (const char of parts.join('|')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0 || 1;
};

const makeMat = (scene, emissive, disableLighting = true) => {
    const m = new BABYLON.StandardMaterial(`mat_${Math.random()}`, scene);
    m.emissiveColor = emissive;
    if (disableLighting) m.disableLighting = true;
    return m;
};
const makeSpriteMat = (scene, imgSrc, onSuccess, onError) => {
    const m   = new BABYLON.StandardMaterial(`sm_${Math.random()}`, scene);
    const tex = new BABYLON.Texture(
        imgSrc, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE,
        () => { if (onSuccess) onSuccess(); },
        () => { if (onError)   onError();   },
    );
    tex.hasAlpha                 = true;
    m.diffuseTexture             = tex;
    m.emissiveTexture            = tex;
    m.emissiveColor              = new BABYLON.Color3(0.12, 0.12, 0.12);
    m.disableLighting            = true;
    m.useAlphaFromDiffuseTexture = true;
    m.backFaceCulling            = false;
    return m;
};
const safeDis = (mesh) => {
    if (mesh && typeof mesh.isDisposed === 'function' && !mesh.isDisposed()) mesh.dispose();
};
const safeDisGui = (ctrl) => { if (ctrl) { try { ctrl.dispose(); } catch (_) {} } };

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export const createDungeonScene = (scene, canvas, engine, data) => {

    const {
      gsRef, lang, onGameOver, onVictory, onBossDefeated, isCloud, getRealTime,
      onHudUpdate, onAnnouncement,
    } = data;
    const externalHudV396 = typeof onHudUpdate === 'function';
    const externalAnnouncementV396 = typeof onAnnouncement === 'function';
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
  // Updates death sprites even after gameOver freezes the combat loop.
  const deathVisuals = createBattleDeathVisualQueue(scene);


    // ══════════════════════════════════════════════════════════════════════════
    // 1. LOAD TRANG BỊ & TÍNH TOÁN STATS CHUẨN RPG TỪ CAMPAIGN
    // ══════════════════════════════════════════════════════════════════════════

    const selectedDungeonId = gsRef.current.selectedDungeonId;
    const dungeonConfig = DUNGEON_CONFIG.find(d => d.id === selectedDungeonId) || DUNGEON_CONFIG[0];
    const dungeonId = dungeonConfig.id;
    const dungeonQaRunV391 = isDungeonQaRunV391(gsRef.current?.dungeonQa, dungeonId)
        ? gsRef.current.dungeonQa
        : null;
    const DIFF = resolveDungeonDifficulty(dungeonConfig);
    const dungeonParityV38 = isDungeonParityFoundationEnabledV38({
        dungeonId,
        envEnabled: import.meta.env?.VITE_SF_DUNGEON_PARITY_V38 !== 'false',
    });
    const dungeonRuntimeProfileV38 = resolveDungeonRuntimeProfileV38(dungeonId);
    const dungeonPresentationV39 = resolveDungeonPresentationV39(dungeonId);
    const dungeonHudProfileV396 = resolveDungeonHudProfileV396(dungeonId);
    const dungeonVisualProfilesV392 = resolveDungeonVisualAssetRefsV393(dungeonId)
        .map(({ kind, id }) => resolveAssetVisual(kind, id))
        .filter(Boolean);
    const dungeonVisualPreloadV392 = {
        settled: dungeonVisualProfilesV392.length === 0,
        deadlineMs: Date.now() + 2600,
        results: [],
        warned: false,
    };
    if (dungeonVisualProfilesV392.length) {
        preloadBattleEntityVisualProfiles(scene, BABYLON, dungeonVisualProfilesV392)
            .then(results => {
                if (battleSceneDisposed) return;
                dungeonVisualPreloadV392.results = results;
                dungeonVisualPreloadV392.settled = true;
                const failed = results.filter(result => !result.loaded);
                if (failed.length) {
                    console.warn('[DUNGEON_VISUAL_V392_FALLBACK]', failed.map(result => result.assetId));
                    dungeonVisualPreloadV392.warned = true;
                }
            })
            .catch(error => {
                if (battleSceneDisposed) return;
                dungeonVisualPreloadV392.settled = true;
                dungeonVisualPreloadV392.warned = true;
                console.warn('[DUNGEON_VISUAL_V392_PRELOAD]', error?.message || String(error));
            });
    }
    if (dungeonParityV38) assertCampaignGameplayFoundationLockRC1();
    const dungeonSeedV38 = stableSeed(
        dungeonId,
        gsRef.current?.campaignData?.profileId || 'guest',
        dungeonQaRunV391?.seedKey || gsRef.current?.activeBattleId || 'local',
    );
    const qaStartRoomIndexV391 = dungeonParityV38 && Number.isInteger(dungeonQaRunV391?.directRoomIndex)
        ? dungeonQaRunV391.directRoomIndex
        : 0;
    const dungeonDirectorV38 = dungeonParityV38
        ? createDungeonEncounterDirectorV38({
            dungeonId,
            seed: dungeonSeedV38,
            nowMs: 0,
            startRoomIndex: qaStartRoomIndexV391,
            endAfterRoomIndex: dungeonQaRunV391?.singleRoom ? qaStartRoomIndexV391 : null,
        })
        : null;
    const combat = deriveBattleLoadout(gsRef.current.campaignData, { PILOTS, AIRCRAFTS, GEAR_CATALOG },
      {mode:'dungeon', location:dungeonConfig});
    const passives = createBattlePassiveState(combat.stats, Date.now());
    const { stats, pilotBase, aircraftBase } = combat;
    const mainGunBase = combat.gear.mainGun.base;
    const wingmanBase = combat.gear.wingman.base;
    const droneBase = combat.gear.drone.base;
    const wingmanArt = wingmanBase ? resolveAssetVisual('equipment', wingmanBase.id)?.topSrc : null;
    const droneArt = droneBase ? resolveAssetVisual('equipment', droneBase.id)?.topSrc : null;

    // ══════════════════════════════════════════════════════════════════════════
    // 2. CAMERA
    // ══════════════════════════════════════════════════════════════════════════

    const ZOOM = BATTLE_WORLD_HALF_HEIGHT;
    const getAspect = () => engine.getRenderWidth() / Math.max(engine.getRenderHeight(), 1);

    const camera = new BABYLON.TargetCamera('cam', new BABYLON.Vector3(0, 50, 0), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;

    const syncCamera = () => {
        const r = getAspect();
        camera.orthoTop    =  ZOOM;
        camera.orthoBottom = -ZOOM;
        camera.orthoLeft   = -ZOOM * r;
        camera.orthoRight  =  ZOOM * r;
    };
    syncCamera();
    engine.onResizeObservable.add(syncCamera);

    const light = new BABYLON.HemisphericLight('amb', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity   = .92;
    light.diffuse     = BABYLON.Color3.FromHexString(dungeonPresentationV39.palette.ambientDiffuse);
    light.groundColor = BABYLON.Color3.FromHexString(dungeonPresentationV39.palette.ambientGround);

    const hexToColor4 = (hex) => {
        const c = hex.replace('#', '');
        return new BABYLON.Color4(
            parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255, 1,
        );
    };
    // Theme accent colors must never become the whole arena background. The
    // video review exposed a flat bright-green Taurus battlefield when no
    // authored background was bound. V3.9 uses a dark production fallback.
    scene.clearColor = hexToColor4(dungeonPresentationV39.palette.clearColor || '#03110e');

    const glow = new BABYLON.GlowLayer('glow', scene);
    glow.intensity = quality.glow ? 0.2 : 0;

    const CAM_BASE = camera.position.clone();

    // ══════════════════════════════════════════════════════════════════════════
    // 3. PARALLAX STARFIELD BACKGROUND
    // ══════════════════════════════════════════════════════════════════════════

    const createLegacyStarfield = () => {
        const r      = getAspect();
        const SPAN_X = ZOOM * r * 2.5;
        const SPAN_Z = ZOOM * 2.5;

        const layers = [
            { count: Math.max(8,Math.round(200 * quality.starFraction)), size: 0.07, speed: 0.025,
              brightness: BABYLON.Color3.FromHexString(dungeonPresentationV39.palette.starFar) },
            { count:  Math.max(8,Math.round(80 * quality.starFraction)), size: 0.14, speed: 0.060,
              brightness: BABYLON.Color3.FromHexString(dungeonPresentationV39.palette.starMid) },
            { count:  Math.max(8,Math.round(25 * quality.starFraction)), size: 0.24, speed: 0.110,
              brightness: BABYLON.Color3.FromHexString(dungeonPresentationV39.palette.starNear) },
        ];

        const allLayers = layers.map(({ count, size, speed, brightness }) => {
            const mat   = makeMat(scene, brightness);
            const stars = [];
            for (let i = 0; i < count; i++) {
                const s = BABYLON.MeshBuilder.CreateSphere(`star_${i}_${Math.random()}`, { diameter: size, segments: 3 }, scene);
                s.position.set((Math.random() - 0.5) * SPAN_X, -0.5, (Math.random() - 0.5) * SPAN_Z);
                s.material = mat;
                stars.push(s);
            }
            return { stars, speed, span: SPAN_Z };
        });

        scene.onBeforeRenderObservable.add(() => {
            const dtFactor = frameScale(engine.getDeltaTime());
            allLayers.forEach(({ stars, speed, span }) => {
                stars.forEach(s => {
                    s.position.z -= speed * dtFactor;
                    if (s.position.z < -span / 2) s.position.z += span;
                });
            });
        });
    };
    const selectedBackground = legacyBattleBackgroundRequested(globalThis.location?.search) ? null : resolveBattleBackground({ mode: 'dungeon', dungeonId,
        variantId: previewBg4Variant({mode: 'dungeon', dungeonId, queryString: globalThis.location?.search}) });
    // Keep the load frame dark for readable shots; avoid a bright accent-color
    // flash before an authored background is ready.
    if (selectedBackground) scene.clearColor = hexToColor4(selectedBackground.fallbackColor);
    if (selectedBackground) {
        createScrollingBattleBackground({
            BABYLON, scene, engine, config: selectedBackground, qualityId: quality.id || 'mobile',
            worldHalfHeight: ZOOM, baseUrl: import.meta.env?.BASE_URL || '/',
            onFallback: createLegacyStarfield,
        });
    } else createLegacyStarfield();
    const dungeonBackdropV39 = !selectedBackground && dungeonParityV38
        ? createDungeonBackdropV39({
            scene,
            BABYLON,
            arenaHalfWidth: ZOOM * getAspect(),
            worldHalfHeight: ZOOM,
            count: dungeonPresentationV39.backdrop?.decorativeDebrisCount || 0,
            scrollSpeed: dungeonPresentationV39.backdrop?.scrollSpeed || .014,
        })
        : null;
    // Developer-only measurement: ?bgPerf=1; no mission or wallet writes.
    attachBattleBackgroundProfiler({
        scene, engine, mode: 'dungeon',
        backgroundId: selectedBackground?.id || 'legacy',
        queryString: globalThis.location?.search || '',
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 4. GUI - ĐÃ KHẮC PHỤC KÍCH THƯỚC (SCALE THEO THIẾT BỊ)
    // ══════════════════════════════════════════════════════════════════════════
    const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('HUD');
    
    // Babylon GUI distances are CSS pixels; idealWidth tracks framebuffer changes.

    const topBar = new GUI.Image("topBar", "");
    topBar.width = "100%";
    topBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    topBar.stretch = GUI.Image.STRETCH_NONE; 
    ui.addControl(topBar);
    topBar.isVisible = !externalHudV396;

    // Điểm số
    const scoreText = new GUI.TextBlock('scoreText');
    scoreText.text = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: 0`;
    scoreText.color = '#00e5ff';
    scoreText.fontFamily = '"VT323", monospace';
    scoreText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    scoreText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    scoreText.left = `15px`; 
    scoreText.top = `10px`;
    ui.addControl(scoreText);
    scoreText.isVisible = !externalHudV396;

    // Sóng
    const waveText = new GUI.TextBlock('waveText');
    waveText.text = '';
    waveText.color = '#f1c40f';
    waveText.fontFamily = '"VT323", monospace';
    waveText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    waveText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    waveText.left = `-15px`; 
    waveText.top = `10px`;
    ui.addControl(waveText);
    waveText.isVisible = !externalHudV396;

    // Chữ Hệ Thống Giáp
    const hpLabel = new GUI.TextBlock('hpLabel');
    hpLabel.text = lang === 'vi' ? 'HỆ THỐNG GIÁP' : 'ARMOR SYSTEM';
    hpLabel.color = '#ffffff';
    hpLabel.fontFamily = '"VT323", monospace';
    hpLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    ui.addControl(hpLabel);
    hpLabel.isVisible = !externalHudV396;

    const drawHudSvg = () => {
        const { w, cssW, cx, h1, h2, dx1, dx2, stroke } = measureBattleHud(engine, canvas, ui);

        const svgHex = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h2}" viewBox="0 0 ${w} ${h2}">
            <polygon points="0,0 ${w},0 ${w},${h1} ${cx + dx1},${h1} ${cx + dx2},${h2} ${cx - dx2},${h2} ${cx - dx1},${h1} 0,${h1}" fill="rgba(5,11,20,0.85)"/>
            <polyline points="0,${h1} ${cx - dx1},${h1} ${cx - dx2},${h2} ${cx + dx2},${h2} ${cx + dx1},${h1} ${w},${h1}" fill="none" stroke="rgba(0,229,255,0.6)" stroke-width="${stroke}"/>
        </svg>`.replace(/"/g, "'").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E");
        topBar.source = "data:image/svg+xml;utf8," + svgHex;
        topBar.height = '65px';

        // KHẮC PHỤC LỖI TRÀN CHỮ: Tự động thu nhỏ font trên thiết bị di động y hệt CampaignScene
        const isSmallScreen = cssW < 400;
        scoreText.fontSize = (isSmallScreen ? 18 : 22);
        waveText.fontSize  = (isSmallScreen ? 14 : 18); // Ép về 16 nếu tên ải dài
        hpLabel.fontSize   = (isSmallScreen ? 12 : 14);
        hpLabel.top        = `${(isSmallScreen ? 20 : 22)}px`;
    };
    drawHudSvg();
    engine.onResizeObservable.add(drawHudSvg);

    // Thanh HP người chơi (10 đoạn)
    const hpBarContainer = new GUI.Rectangle("hpBarContainer");
    hpBarContainer.width = `120px`; 
    hpBarContainer.height = `12px`;
    hpBarContainer.background = "rgba(0,0,0,0.8)";
    hpBarContainer.color = "rgba(0,229,255,0.4)";
    hpBarContainer.thickness = 1;
    hpBarContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    hpBarContainer.top = `40px`;
    ui.addControl(hpBarContainer);
    hpBarContainer.isVisible = !externalHudV396;

    const hpSegments = [];
    for (let i = 0; i < 10; i++) {
        const seg = new GUI.Rectangle(`seg_${i}`);
        seg.width = `10px`; 
        seg.height = `8px`;
        seg.background = "#00e5ff"; 
        seg.thickness = 0;
        seg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        seg.left = `${(i * 12 + 1)}px`;
        hpBarContainer.addControl(seg);
        hpSegments.push(seg);
    }

    const updateHpUI = () => {
        const ratio = clamp(stats.hp / stats.maxHp, 0, 1);
        const color = ratio > 0.5 ? '#00e5ff' : (ratio > 0.25 ? '#f1c40f' : '#ff4757');
        hpSegments.forEach((seg, i) => {
            seg.isVisible = (i / 10) < ratio;
            seg.background = color;
        });
    };

    // Boss Bar
    const bossPanel = new GUI.StackPanel();
    bossPanel.width = `300px`;
    bossPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    bossPanel.top = `80px`;
    bossPanel.isVisible = false;
    ui.addControl(bossPanel);

    const bossNameText = new GUI.TextBlock('bossNameText');
    bossNameText.text = "⚠ BOSS";
    bossNameText.color = "#ff4757";
    bossNameText.fontSize = 20;
    bossNameText.fontFamily = '"VT323", monospace';
    bossNameText.height = `25px`;
    bossPanel.addControl(bossNameText);

    const bossHpContainer = new GUI.Rectangle("bossHpContainer");
    bossHpContainer.width = "100%"; 
    bossHpContainer.height = `10px`;
    bossHpContainer.background = "rgba(30,0,0,0.8)";
    bossHpContainer.color = "#ff4757"; 
    bossHpContainer.thickness = 2;
    bossPanel.addControl(bossHpContainer);

    const bossHpFill = new GUI.Rectangle("bossHpFill");
    bossHpFill.width = "100%"; bossHpFill.height = "100%";
    bossHpFill.background = "#ff4757"; bossHpFill.thickness = 0;
    bossHpFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bossHpContainer.addControl(bossHpFill);

    // Chữ chạy cảnh báo (Announcement)
    const annPanel = new GUI.Rectangle('annPanel');
    annPanel.width = "86%";
    annPanel.height = `70px`;
    annPanel.background = dungeonPresentationV39.palette.panel || "rgba(5,11,20,0.92)";
    annPanel.color = dungeonPresentationV39.palette.accent || "#66fcf1";
    annPanel.thickness = 2; 
    annPanel.cornerRadius = 10;
    annPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    annPanel.top = "-12%";
    annPanel.alpha = 0;
    ui.addControl(annPanel);
    annPanel.isVisible = !externalAnnouncementV396;

    const annText = new GUI.TextBlock('annText');
    annText.color = dungeonPresentationV39.palette.accent || "#66fcf1";
    annText.fontSize = 27;
    annText.fontWeight = "bold";
    annText.fontFamily = '"VT323", monospace';
    annPanel.addControl(annText);

    let annAnim = null;
    let announcementSequenceV396 = 0;
    const showAnnouncement = (text, colorHex = "#66fcf1", duration = 2000) => {
        if (externalAnnouncementV396) {
            onAnnouncement({
                id: `dungeon-announcement-${++announcementSequenceV396}`,
                text,
                colorHex,
                duration,
            });
            return;
        }
        annText.text = text; annText.color = colorHex; annPanel.color = colorHex;
        if (annAnim) clearInterval(annAnim);
        let step = 0;
        annAnim = setInterval(() => {
            step += 50;
            if (step < 300) annPanel.alpha = step / 300;
            else if (step < 300 + duration) annPanel.alpha = 1;
            else if (step < 600 + duration) annPanel.alpha = 1 - ((step - 300 - duration) / 300);
            else { annPanel.alpha = 0; clearInterval(annAnim); }
        }, 50);
    };
    scene.onDisposeObservable.add(() => {
        if (annAnim) clearInterval(annAnim);
        annAnim = null;
    });

    // Compact objective card. It stays outside the player combat lane and
    // replaces the ambiguous full-screen room banners seen in the V3.8 video.
    const objectivePanel = new GUI.Rectangle('dungeonObjectivePanel');
    objectivePanel.width = '270px';
    objectivePanel.height = '58px';
    objectivePanel.background = dungeonPresentationV39.palette.panel || 'rgba(3,12,14,0.92)';
    objectivePanel.color = `${dungeonPresentationV39.palette.accent || '#4ade80'}aa`;
    objectivePanel.thickness = 1;
    objectivePanel.cornerRadius = 8;
    objectivePanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    objectivePanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    objectivePanel.top = '68px';
    objectivePanel.left = '-10px';
    objectivePanel.isVisible = false;
    ui.addControl(objectivePanel);
    objectivePanel.isVisible = false;

    const objectiveStack = new GUI.StackPanel('dungeonObjectiveStack');
    objectiveStack.paddingTop = '5px';
    objectiveStack.paddingLeft = '8px';
    objectiveStack.paddingRight = '8px';
    objectivePanel.addControl(objectiveStack);

    const objectiveTitleText = new GUI.TextBlock('dungeonObjectiveTitle');
    objectiveTitleText.height = '20px';
    objectiveTitleText.color = dungeonPresentationV39.palette.accentSoft || '#9ff5bb';
    objectiveTitleText.fontFamily = '"VT323", monospace';
    objectiveTitleText.fontSize = 16;
    objectiveTitleText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    objectiveStack.addControl(objectiveTitleText);

    const objectiveBodyText = new GUI.TextBlock('dungeonObjectiveBody');
    objectiveBodyText.height = '17px';
    objectiveBodyText.color = '#e7fff6';
    objectiveBodyText.fontFamily = '"VT323", monospace';
    objectiveBodyText.fontSize = 13;
    objectiveBodyText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    objectiveStack.addControl(objectiveBodyText);

    const objectiveProgressText = new GUI.TextBlock('dungeonObjectiveProgress');
    objectiveProgressText.height = '16px';
    objectiveProgressText.color = dungeonPresentationV39.palette.objective || '#ffd166';
    objectiveProgressText.fontFamily = '"VT323", monospace';
    objectiveProgressText.fontSize = 13;
    objectiveProgressText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    objectiveStack.addControl(objectiveProgressText);

    // ══════════════════════════════════════════════════════════════════════════
    // 5. TÀU NGƯỜI CHƠI
    // ══════════════════════════════════════════════════════════════════════════

    const playerRoot = new BABYLON.TransformNode('playerRoot', scene);
    playerRoot.position.set(0, 0, ZOOM - 2.5);

    // --- 5A. One player-ship visual pipeline shared with Campaign ---
    const shipVisual = createPlayerShipVisual(scene, playerRoot, {
        aircraftId: gsRef.current.campaignData.loadout.aircraft,
        aircraftCatalog: AIRCRAFTS, glowLayer: glow,
    });
    const playerPlane = shipVisual.tiltNode; // visual tilt, NOT collision geometry

    // --- 5B. WINGMAN (VŨ KHÍ PHỤ TRÊN 2 CÁNH TÀU) ---
    const wingNodes = [];
    if (stats.wingmanId && wingmanBase) {
        const wingMountX = aircraftBase.wingmanOffset?.x || 1.8;
        const wingMountZ = aircraftBase.wingmanOffset?.z || 0.3;
        const wingOffsets = [-wingMountX, wingMountX]; // Match Campaign aircraft mounts
        wingOffsets.forEach(offsetX => {
            // Tạo Node chứa để gộp Plane và Khối Fallback
            const wNode = new BABYLON.TransformNode('wNode', scene);
            wNode.parent = playerRoot;
            wNode.position.set(offsetX, 0, wingMountZ);
            wingNodes.push(wNode);

            // 1. Dựng sẵn Khối Fallback (Ống trụ cam)
            const wFallback = BABYLON.MeshBuilder.CreateCylinder('wingman_fb', { diameter: 0.25, height: 0.8 }, scene);
            wFallback.rotation.x = Math.PI / 2;
            wFallback.material = makeMat(scene, BABYLON.Color3.FromHexString('#ffa502'), true);
            wFallback.parent = wNode;

            if (wingmanArt) {
                // 2. Dựng mặt Plane 2D
                const wPlane = BABYLON.MeshBuilder.CreatePlane('wingman', { size: 1 }, scene);
                wPlane.rotation.x = Math.PI / 2;
                wPlane.rotation.z = Math.PI; 
                wPlane.parent = wNode;

                const wMat = new BABYLON.StandardMaterial('wMat', scene);
                // 3. Load Texture với cơ chế bắt lỗi 404
                const wTex = new BABYLON.Texture(wingmanArt, scene, false, false, undefined, 
                    () => { wFallback.isVisible = false; }, // Thành công: Ẩn cục fallback
                    () => { wPlane.dispose(); }             // Lỗi 404: Xóa mặt phẳng caro lỗi, giữ cục fallback
                );
                wTex.hasAlpha = true;
                wMat.diffuseTexture = wTex;
                wMat.emissiveTexture = wTex;
                wMat.emissiveColor = new BABYLON.Color3(0,0,0);
                wMat.disableLighting = true;
                wMat.useAlphaFromDiffuseTexture = true;
                wPlane.material = wMat;
                glow.addExcludedMesh(wPlane);
            }
        });
    }

    // --- 5C. DRONE (VỆ TINH BAY LƠ LỬNG QUANH TÀU) ---
    const drones = [];
    if (stats.droneId && droneBase) {
        const formation = [{ offsetX: -2.0, offsetY: 0.5 }, { offsetX: 2.0, offsetY: 0.5 }];
        const colorHex = droneBase.color ? '#' + droneBase.color.toString(16).padStart(6, '0') : '#2ecc71';
        
        formation.forEach((pos) => {
            // Tạo Node chứa bay lơ lửng
            const dNode = new BABYLON.TransformNode('dNode', scene);
            dNode.position.set(playerRoot.position.x + pos.offsetX, 0, playerRoot.position.z + pos.offsetY);
            dNode.offsetX = pos.offsetX;
            dNode.offsetY = pos.offsetY;

            // 1. Dựng sẵn Fallback (Quả cầu màu)
            const dFallback = BABYLON.MeshBuilder.CreateSphere('drone_fb', { diameter: 0.6, segments: 16 }, scene);
            dFallback.material = makeMat(scene, BABYLON.Color3.FromHexString(colorHex), true);
            dFallback.parent = dNode;

            if (droneArt) {
                // 2. Dựng mặt Plane 2D
                const dPlane = BABYLON.MeshBuilder.CreatePlane('drone', { size: 0.5 }, scene);
                dPlane.rotation.x = Math.PI / 2;
                dPlane.rotation.z = Math.PI;
                dPlane.parent = dNode;

                const dMat = new BABYLON.StandardMaterial('dMat', scene);
                // 3. Load Texture với cơ chế bắt lỗi 404
                const dTex = new BABYLON.Texture(droneArt, scene, false, false, undefined, 
                    () => { dFallback.isVisible = false; }, // Thành công: Ẩn quả cầu fallback
                    () => { dPlane.dispose(); }             // Lỗi 404: Xóa mặt phẳng caro lỗi
                );
                dTex.hasAlpha = true;
                dMat.diffuseTexture = dTex;
                dMat.emissiveTexture = dTex;
                dMat.emissiveColor = new BABYLON.Color3(0,0,0);
                dMat.disableLighting = true;
                dMat.useAlphaFromDiffuseTexture = true;
                dPlane.material = dMat;
                glow.addExcludedMesh(dPlane);
            }
            drones.push(dNode); // Push cái Node chứa vào mảng để vòng lặp cập nhật nó di chuyển
        });
    }
    // Shared aircraft-aware engine VFX (same mount, colors, particles, texture as Campaign).
    const engineFx = createShipEngineFx({ scene, BABYLON, playerRoot, aircraft: aircraftBase, quality });

    // ══════════════════════════════════════════════════════════════════════════
    // 6. INPUT – KÉO ĐỂ DI CHUYỂN
    // ══════════════════════════════════════════════════════════════════════════

    const boundX = () => ZOOM * getAspect() - 1.8;
    const shipInput = createShipInputController({
        canvas: engine.getRenderingCanvas(), scene, engine, playerRoot, tiltNode: playerPlane,
        halfHeight: ZOOM, aspect: getAspect,
        speedMultiplier: battleSpeedMultiplier(stats), pointerSpeedMultiplier: 1,
        enabled: () => !gameOver,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 7. MATERIALS
    // ══════════════════════════════════════════════════════════════════════════

    const MAT = {
        bullet:      makeMat(scene, new BABYLON.Color3(0,    1,    1   )),  
        bulletEnemy: makeMat(scene, new BABYLON.Color3(1,    0.3,  0   )),  
        scout:       makeMat(scene, new BABYLON.Color3(1,    0.2,  0.2 )),  
        heavy:       makeMat(scene, new BABYLON.Color3(0.8,  0.1,  0.9 )),  
        elite:       makeMat(scene, new BABYLON.Color3(1,    0.6,  0   )),  
        boss:        makeMat(scene, new BABYLON.Color3(1,    0.35, 0   )),  
    };
    const dungeonBossTelegraphMaterialsV39 = new Map();
    const resolveDungeonBossTelegraphMaterialV39 = patternId => {
        const presentation = resolveDungeonBossPatternPresentationV39({
            dungeonId,
            patternId,
        });
        const key = presentation.telegraphColor || dungeonPresentationV39.palette.danger || '#ff3f2e';
        if (!dungeonBossTelegraphMaterialsV39.has(key)) {
            const material = makeMat(scene, BABYLON.Color3.FromHexString(key));
            material.alpha = .20;
            material.backFaceCulling = false;
            dungeonBossTelegraphMaterialsV39.set(key, material);
        }
        return Object.freeze({ material: dungeonBossTelegraphMaterialsV39.get(key), presentation });
    };

    const hostileProjectileVisualsV38 = createCampaignProjectileVisualFactoryV32({ scene, BABYLON });
    const enemyCombatSlotRegistryV38 = createCampaignEnemyCombatSlotRegistryV37();
    const dungeonBreakablesV38 = [];
    const dungeonHazardsV38 = [];
    const dungeonHazardWarningsV39 = [];
    let activeDungeonHazardV38 = null;
    let dungeonHazardSequenceV38 = 0;
    let currentRoomV38 = null;
    let currentRoomInitialEnemyCountV39 = 0;
    let currentRoomInitialBreakableCountV39 = 0;
    let currentRoomCompleteV396 = false;
    let dungeonObjectiveSequenceV394 = null;
    const dungeonVisualFallbackWarningsV394 = new Set();
    let bossDefeatedPulseV38 = false;
    const dungeonVisualSpawnGateReadyV392 = nowMs => {
        if (dungeonVisualPreloadV392.settled) return true;
        if (nowMs < dungeonVisualPreloadV392.deadlineMs) return false;
        if (!dungeonVisualPreloadV392.warned) {
            dungeonVisualPreloadV392.warned = true;
            console.warn('[DUNGEON_VISUAL_V392_TIMEOUT]', dungeonVisualProfilesV392.map(profile => profile.assetId));
        }
        return true;
    };
    let playerVelocityV38 = Object.freeze({ x: 0, z: 0 });
    const playerMotionSampleV38 = {
        x: playerRoot.position.x,
        z: playerRoot.position.z,
        initialized: false,
    };
    const samplePlayerCombatVelocityV38 = frameFactorValue => {
        const safeFrame = Math.max(.25, Math.min(4, Number(frameFactorValue) || 1));
        const dx = playerRoot.position.x - playerMotionSampleV38.x;
        const dz = playerRoot.position.z - playerMotionSampleV38.z;
        const teleported = Math.hypot(dx, dz) > 2.4;
        if (!playerMotionSampleV38.initialized || teleported) {
            playerVelocityV38 = Object.freeze({ x: 0, z: 0 });
            playerMotionSampleV38.initialized = true;
        } else {
            const instantX = dx / safeFrame;
            const instantZ = dz / safeFrame;
            playerVelocityV38 = Object.freeze({
                x: clamp(playerVelocityV38.x * .62 + instantX * .38, -.22, .22),
                z: clamp(playerVelocityV38.z * .62 + instantZ * .38, -.18, .18),
            });
        }
        playerMotionSampleV38.x = playerRoot.position.x;
        playerMotionSampleV38.z = playerRoot.position.z;
        return playerVelocityV38;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 8. VFX – SCREEN SHAKE + EXPLOSION PARTICLES
    // ══════════════════════════════════════════════════════════════════════════

    let shakeFrames = 0;
    let shakeStr    = 0;
    const triggerShake = (str = 0.2, frames = 8) => { shakeStr = str; shakeFrames = frames; };

    const explode = (pos, scale = 1) => {
        const ps = new BABYLON.ParticleSystem(`exp_${Date.now()}`, Math.max(24,Math.ceil(80 * scale * quality.particleFraction)), scene);
        ps.particleTexture     = new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png', scene);
        ps.emitter             = pos.clone();
        ps.color1              = new BABYLON.Color4(1, 0.8, 0.1, 1);
        ps.color2              = new BABYLON.Color4(1, 0.3, 0,   1);
        ps.colorDead           = new BABYLON.Color4(0.1, 0, 0,   0);
        ps.minSize             = 0.3 * scale;
        ps.maxSize             = 1.2 * scale;
        ps.minLifeTime         = 0.1;
        ps.maxLifeTime         = 0.4;
        ps.emitRate            = 800;
        ps.createSphereEmitter(0.6 * scale);
        ps.minEmitPower        = 3 * scale;
        ps.maxEmitPower        = 8 * scale;
        ps.gravity             = BABYLON.Vector3.Zero();
        ps.targetStopDuration  = 0.15;
        ps.disposeOnStop       = true;
        ps.start();
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 9. WAVE SYSTEM
    // ══════════════════════════════════════════════════════════════════════════

    const MAX_WAVES = dungeonConfig.waves || 5;
    const ACTIVE_MAX_WAVES = dungeonParityV38
        ? dungeonRuntimeProfileV38.rooms.length
        : MAX_WAVES;

    let currentWave    = 0;
    let waveEnemyCount = 0;   
    let waveSpawned    = 0;   
    let waveKilled     = 0;   
    let spawnInterval  = 1200;
    let enemyBaseHp    = 120;
    let enemyBaseSpeed = 0.08;
    let waveBossEnabled = false;
    let bossSpawned    = false;
    let bossActive     = false;
    let bossMesh       = null;
    let bossVisual     = null;
    let bossFallbackVisualV39 = null;
    let bossHp         = 0;
    let bossMaxHp      = 0;
    let currentBossSpecV38 = null;
    let dungeonBossRuntimeV38 = null;
    let dungeonBossAttackTelegraphsV38 = [];
    const dungeonBossMuzzleLocalV38 = new BABYLON.Vector3(0, 0, 1.9);
    let waitingForNext = false;
    let lastEnemySpawn = 0;

    scene.onDisposeObservable.add(() => {
        stopDungeonBossControllerV38(dungeonBossRuntimeV38);
        dungeonBossRuntimeV38 = null;
        bossFallbackVisualV39?.dispose?.();
        bossFallbackVisualV39 = null;
        dungeonBackdropV39?.dispose?.();
        for (const corridor of dungeonBossAttackTelegraphsV38.splice(0)) safeDis(corridor);
    });

    const syncObjectivePanelSizeV39 = () => {
        const cssWidth = canvas?.clientWidth || engine.getRenderWidth();
        objectivePanel.width = cssWidth < 390 ? '230px' : '270px';
        objectivePanel.left = cssWidth < 390 ? '-6px' : '-10px';
        objectiveBodyText.fontSize = cssWidth < 390 ? 12 : 13;
    };
    syncObjectivePanelSizeV39();
    engine.onResizeObservable.add(syncObjectivePanelSizeV39);

    const updateDungeonObjectiveHudV39 = () => {
        if (!dungeonParityV38 || !currentRoomV38) {
            objectivePanel.isVisible = false;
            return;
        }
        const roomTitle = currentRoomV38.title?.[lang]
            || currentRoomV38.title?.vi
            || currentRoomV38.id;
        objectiveTitleText.text = `${lang === 'vi' ? 'MỤC TIÊU' : 'OBJECTIVE'} · ${roomTitle}`;
        objectiveBodyText.text = currentRoomV38.objective?.[lang]
            || currentRoomV38.objective?.vi
            || resolveDungeonRoomObjectiveV39({ dungeonId, room: currentRoomV38, lang });
        if (currentRoomV38.kind === 'boss') {
            const ratio = bossMaxHp > 0 ? clamp(bossHp / bossMaxHp, 0, 1) : 1;
            objectiveProgressText.text = `${lang === 'vi' ? 'TRÙM' : 'BOSS'} · ${Math.round(ratio * 100)}%`;
        } else if (currentRoomV38.breakablesRequired) {
            const sequence = getProgressiveObjectiveSnapshotV394(dungeonObjectiveSequenceV394);
            const broken = sequence.totalCount > 0
                ? sequence.destroyedCount
                : Math.max(0, currentRoomInitialBreakableCountV39 - dungeonBreakablesV38.length);
            const defeated = Math.min(currentRoomInitialEnemyCountV39, Math.max(0, waveKilled));
            objectiveProgressText.text = `${lang === 'vi' ? 'MỤC TIÊU' : 'NODES'} ${broken}/${currentRoomInitialBreakableCountV39}`
                + ` · ${lang === 'vi' ? 'ĐỊCH' : 'HOSTILES'} ${defeated}/${currentRoomInitialEnemyCountV39}`;
        } else {
            const defeated = Math.min(currentRoomInitialEnemyCountV39, Math.max(0, waveKilled));
            objectiveProgressText.text = `${lang === 'vi' ? 'ĐỊCH' : 'HOSTILES'} ${defeated}/${currentRoomInitialEnemyCountV39}`;
        }
        objectivePanel.isVisible = !externalHudV396;
    };

    const startWave = (n) => {
        currentWave     = n;
        currentRoomCompleteV396 = false;
        waveEnemyCount  = DIFF.countBase + n * DIFF.countInc;
        spawnInterval   = Math.max(DIFF.spawnMin, DIFF.spawnBase - n * 60);
        enemyBaseHp     = DIFF.hpBase + n * DIFF.hpInc;
        enemyBaseSpeed  = DIFF.speedBase + n * DIFF.speedInc;
        waveBossEnabled = n % 3 === 0;
        bossSpawned     = false;
        bossActive      = false;
        waveSpawned     = 0;
        waveKilled      = 0;
        waitingForNext  = false;
        lastEnemySpawn  = Date.now();
        // KHẮC PHỤC TÊN DÀI: Nếu config có tên thì dùng, nếu không thì cắt bỏ chữ "dung_" cho ngắn
        const dName = dungeonConfig.name || dungeonId.replace('dung_', '').toUpperCase();
        const waveStr = lang === 'vi' ? `ẢI ${dName} | ĐỢT ${currentWave}/${ACTIVE_MAX_WAVES}` : `STAGE ${dName} | WAVE ${currentWave}/${ACTIVE_MAX_WAVES}`;
        waveText.text = waveStr;
        
        const isLast = currentWave === ACTIVE_MAX_WAVES;
        showAnnouncement(
            isLast ? (lang === 'vi' ? '⚠ LƯỢT CUỐI CÙNG ⚠' : '⚠ FINAL WAVE ⚠') : `${lang === 'vi' ? 'LƯỢT' : 'WAVE'} ${currentWave}`,
            isLast ? '#ff4757' : '#f1c40f'
        );
    };

    const advanceWave = () => {
        if (waitingForNext || gameOver) return;
        waitingForNext = true;
        currentRoomCompleteV396 = true;
        publishDungeonHudV396(true);
        if (currentWave >= ACTIVE_MAX_WAVES) {
            triggerVictory();
        } else {
            scheduleBattleTimer(() => startWave(currentWave + 1), 1800);
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 10. BOSS SPAWN
    // ══════════════════════════════════════════════════════════════════════════

    const spawnBoss = (bossSpec = null) => {
        if (bossSpawned) return;
        bossSpawned = true;
        bossActive  = true;
        bossHp = bossSpec?.hp
            ? Math.max(1, Math.round(bossSpec.hp))
            : (DIFF.bossBase + currentWave * DIFF.bossPerWave);
        bossMaxHp = bossHp;
        bossDefeatedPulseV38 = false;
        currentBossSpecV38 = bossSpec;
        stopDungeonBossControllerV38(dungeonBossRuntimeV38);
        dungeonBossRuntimeV38 = dungeonParityV38 && bossSpec?.sharedBossProfileId
            ? createDungeonBossControllerV38({
                bossSpec,
                seed: stableSeed(dungeonSeedV38, bossSpec.id, 'boss'),
                nowMs: Date.now(),
            })
            : null;
        for (const corridor of dungeonBossAttackTelegraphsV38.splice(0)) safeDis(corridor);
        bossFallbackVisualV39?.dispose?.();
        bossFallbackVisualV39 = null;

        // Invisible logical collider/root. The production atlas/GLB or the
        // multi-part Rust Driller fallback owns presentation. V3.8 passed the
        // Campaign profile ID to the dungeon asset registry, so no dungeon art
        // could resolve and the video showed only a sphere/torus placeholder.
        bossMesh = BABYLON.MeshBuilder.CreateSphere('bossCore', { diameter: 4.4, segments: 16 }, scene);
        bossMesh.position.set(0, 0.5, -ZOOM - 6);
        bossMesh.visibility = .02;
        bossMesh.material = MAT.boss;
        bossMesh._facingYaw = 0;
        bossFallbackVisualV39 = createDungeonBossFallbackV39({
            scene,
            BABYLON,
            root: bossMesh,
            style: dungeonPresentationV39.boss?.fallbackStyle || 'rust_driller',
        });
        const requestedBossVisualAssetId = dungeonBossRuntimeV38?.binding?.visualAssetId
            || bossSpec?.visualAssetId
            || dungeonPresentationV39.boss?.visualAssetId
            || `${dungeonId}_boss`;
        const bossVisualBindingV394 = resolveDungeonBossVisualBindingV394({
            dungeonId,
            requestedAssetId: requestedBossVisualAssetId,
        });
        const bossVisualAssetId = bossVisualBindingV394.assetId;
        if (bossVisualBindingV394.mode === 'temporary_procedural'
            && !dungeonVisualFallbackWarningsV394.has(`boss:${bossVisualAssetId}`)) {
            dungeonVisualFallbackWarningsV394.add(`boss:${bossVisualAssetId}`);
            console.warn('[DUNGEON_VISUAL_V394_TEMPORARY]', 'boss', bossVisualAssetId);
        }
        bossVisual = attachBattleEntityVisual(scene, BABYLON,
            bossMesh,
            'dungeon_boss',
            bossVisualAssetId,
            { profile: bossVisualBindingV394.profile },
        );

        const bossName = bossSpec?.displayName?.[lang]
            || bossSpec?.displayName?.vi
            || (lang === 'vi' ? `CHÚA TỂ LƯỢT ${currentWave}` : `WAVE ${currentWave} OVERLORD`);
        bossMesh.metadata = {
            ...(bossMesh.metadata || {}),
            dungeonBossId: bossSpec?.id || `${dungeonId}_boss`,
            sharedBossProfileId: bossSpec?.sharedBossProfileId || null,
            visualAssetId: bossVisualAssetId,
            visualBindingMode: bossVisualBindingV394.mode,
        };
        bossNameText.text = `⚠ ${bossName}`;
        bossHpFill.width = "100%";
        bossPanel.isVisible = !externalHudV396;
        showAnnouncement('⚠ BOSS ⚠', '#ff4757');
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 11. SPAWN ĐỊCH
    // ══════════════════════════════════════════════════════════════════════════

    const enemies = [];

    const buildDungeonEnemyMesh = (type, runtimeId, roleId = 'raider', temporaryStyle = 'scout_wedge') => {
        let mesh;
        switch (type) {
            case 'heavy': {
                mesh = BABYLON.MeshBuilder.CreateBox(`eH_${runtimeId}`, { width: 2.8, depth: 2.8, height: 0.7 }, scene);
                const hCore = BABYLON.MeshBuilder.CreateSphere(`eH_core_${runtimeId}`, { diameter: 1.0 }, scene);
                hCore.parent = mesh;
                hCore.position.y = 0.35;
                hCore.material = makeMat(scene, new BABYLON.Color3(1, 0.55, 0.25), false);
                const hWing = BABYLON.MeshBuilder.CreateBox(`eH_w_${runtimeId}`, { width: 3.6, depth: 0.4, height: 0.28 }, scene);
                hWing.parent = mesh;
                hWing.position.y = 0.05;
                hWing.rotation.y = Math.PI / 4;
                hWing.material = makeMat(scene, new BABYLON.Color3(0.9, 0.4, 0.12), false);
                break;
            }
            case 'elite': {
                // Keep the gameplay/presentation root pitch- and roll-neutral.
                // V3.9.4 used the rotated torus itself as the root; the atlas
                // plane inherited that 90-degree pitch and could become edge-on,
                // leaving only the linked HP bar visible.
                mesh = BABYLON.MeshBuilder.CreateSphere(`eE_${runtimeId}`, {
                    diameterX: 2.55, diameterZ: 2.55, diameterY: .62, segments: 10,
                }, scene);
                mesh.visibility = .02;
                const eRing = BABYLON.MeshBuilder.CreateTorus(`eE_ring_${runtimeId}`, {
                    diameter: 2.6, thickness: 0.55, tessellation: 48,
                }, scene);
                eRing.parent = mesh;
                eRing.rotation.x = Math.PI / 2;
                eRing.material = makeMat(scene, new BABYLON.Color3(1, 0.6, 0), false);
                const eCore = BABYLON.MeshBuilder.CreateSphere(`eE_core_${runtimeId}`, { diameter: 1.0 }, scene);
                eCore.parent = mesh;
                eCore.position.y = .18;
                eCore.material = makeMat(scene, new BABYLON.Color3(1, 0.85, 0.2), false);
                break;
            }
            default: {
                mesh = BABYLON.MeshBuilder.CreateSphere(`eS_${runtimeId}`, { diameterX: 2.0, diameterZ: 2.0, diameterY: 0.5 }, scene);
                const sFin = BABYLON.MeshBuilder.CreateCylinder(`eS_fin_${runtimeId}`, { diameterTop: 0.05, diameterBottom: 0.05, height: 1.4, tessellation: 8 }, scene);
                sFin.parent = mesh;
                sFin.material = makeMat(scene, new BABYLON.Color3(0.4, 0.9, 1.0), false);
                sFin.position.set(0, 0, 0.9);
                sFin.rotation.x = Math.PI / 2;
                break;
            }
        }

        // Role-specific temporary presentation. It is visible only when an
        // authored atlas/static image is unavailable and is hidden atomically
        // by BattleEntityVisual as soon as the real art is ready.
        const temporaryMat = MAT[type] || MAT.scout;
        if (roleId === 'gunner') {
            for (const side of [-1, 1]) {
                const barrel = BABYLON.MeshBuilder.CreateCylinder(`temp-gun-${runtimeId}-${side}`, {
                    diameter: .16, height: 1.15, tessellation: 8,
                }, scene);
                barrel.parent = mesh;
                barrel.position.set(side * .55, .18, .65);
                barrel.rotation.x = Math.PI / 2;
                barrel.material = temporaryMat;
            }
        } else if (roleId === 'charger') {
            const ram = BABYLON.MeshBuilder.CreateCylinder(`temp-ram-${runtimeId}`, {
                diameterTop: 0, diameterBottom: .48, height: 1.45, tessellation: 10,
            }, scene);
            ram.parent = mesh;
            ram.position.set(0, .12, 1.0);
            ram.rotation.x = Math.PI / 2;
            ram.material = temporaryMat;
        } else if (roleId === 'shieldbearer') {
            const shield = BABYLON.MeshBuilder.CreateTorus(`temp-shield-${runtimeId}`, {
                diameter: 3.1, thickness: .14, tessellation: 32,
            }, scene);
            shield.parent = mesh;
            shield.position.y = .22;
            shield.rotation.x = Math.PI / 2;
            shield.material = temporaryMat;
        } else if (roleId === 'support') {
            for (const side of [-1, 1]) {
                const pod = BABYLON.MeshBuilder.CreateSphere(`temp-support-${runtimeId}-${side}`, {
                    diameter: .44, segments: 8,
                }, scene);
                pod.parent = mesh;
                pod.position.set(side * 1.15, .18, -.15);
                pod.material = temporaryMat;
            }
        } else if (roleId === 'artillery') {
            const cannon = BABYLON.MeshBuilder.CreateBox(`temp-cannon-${runtimeId}`, {
                width: .34, height: .30, depth: 2.15,
            }, scene);
            cannon.parent = mesh;
            cannon.position.set(0, .28, .72);
            cannon.material = temporaryMat;
        }
        // BattleEntityVisual assumes a neutral root and applies yaw only.
        // Procedural parts may rotate locally, but the collider/root must not
        // carry pitch or roll into an authored atlas plane.
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;
        mesh.metadata = {
            ...(mesh.metadata || {}),
            temporaryVisualStyle: temporaryStyle,
            temporaryRoleId: roleId,
            dungeonVisualRootNeutralV395: true,
        };
        return mesh;
    };

    const spawnEnemy = (spawnEntry = null, room = currentRoomV38) => {
        const nowMs = Date.now();
        const runtimeId = spawnEntry?.id || `legacy:${currentWave}:${waveSpawned}:${nowMs}`;
        let spec = null;
        let type;
        let hp;
        let speed;
        let shootMs;
        let laneNorm = null;
        let seed = stableSeed(dungeonSeedV38, runtimeId);

        if (dungeonParityV38 && spawnEntry) {
            spec = resolveDungeonEnemySpecV38({ dungeonId, room, entry: spawnEntry });
            type = spec.visualAssetKind || spec.assetKind;
            hp = spec.hp;
            speed = spec.speed;
            shootMs = spec.weapon.cadence?.cooldownMs || Infinity;
            laneNorm = spec.laneNorm;
        } else {
            const r = Math.random();
            type = r < 0.15 ? 'elite' : r < 0.35 ? 'heavy' : 'scout';
            const hpMult = type === 'heavy' ? 3.0 : type === 'elite' ? 2.0 : 1.0;
            hp = Math.floor(enemyBaseHp * hpMult);
            speed = enemyBaseSpeed * (type === 'heavy' ? 0.55 : type === 'elite' ? 1.35 : 1.0);
            shootMs = type === 'heavy' ? 2200 : type === 'elite' ? 1400 : Infinity;
        }

        const resolvedRoleId = spec?.roleId
            || (type === 'heavy' ? 'shieldbearer' : type === 'elite' ? 'gunner' : 'raider');
        const requestedEnemyVisualAssetId = spec?.visualAssetId || `${dungeonId}_${type}`;
        const enemyVisualBindingV394 = resolveDungeonEnemyVisualBindingV394({
            dungeonId,
            roleId: resolvedRoleId,
            elite: Boolean(spec?.elite),
            requestedAssetId: requestedEnemyVisualAssetId,
        });
        const mesh = buildDungeonEnemyMesh(
            type,
            runtimeId.replace(/[^a-z0-9_-]/gi, '_'),
            resolvedRoleId,
            enemyVisualBindingV394.temporaryStyle,
        );
        if (spec) {
            const spawnPoint = resolveDungeonEnemySpawnPointV38({
                laneNorm: spec.laneNorm,
                arenaHalfWidth: boundX(),
                worldHalfHeight: ZOOM,
                index: spawnEntry.index,
            });
            mesh.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
        } else {
            mesh.position.set((Math.random() - 0.5) * boundX() * 1.6, 0.2, -ZOOM - 2);
        }
        mesh.material = MAT[type] || MAT.scout;
        mesh.rotation.y = 0;
        const enemyVisualAssetId = enemyVisualBindingV394.assetId;
        if (enemyVisualBindingV394.mode === 'temporary_procedural'
            && !dungeonVisualFallbackWarningsV394.has(`enemy:${enemyVisualAssetId}`)) {
            dungeonVisualFallbackWarningsV394.add(`enemy:${enemyVisualAssetId}`);
            console.warn('[DUNGEON_VISUAL_V394_TEMPORARY]', resolvedRoleId, enemyVisualAssetId);
        }
        const visual = attachBattleEntityVisual(scene, BABYLON,
            mesh,
            'dungeon_enemy',
            enemyVisualAssetId,
            { profile: enemyVisualBindingV394.profile },
        );
        mesh.metadata = {
            ...(mesh.metadata || {}),
            dungeonEnemyRoleId: resolvedRoleId,
            visualAssetId: enemyVisualAssetId,
            visualBindingMode: enemyVisualBindingV394.mode,
        };

        const miniHpBg = new GUI.Rectangle(`ehp_bg_${mesh.uniqueId}`);
        miniHpBg.width = `54px`;
        miniHpBg.height = `6px`;
        miniHpBg.background = '#111';
        miniHpBg.color = '#ffffff40';
        miniHpBg.cornerRadius = 4;
        miniHpBg.thickness = 1;
        miniHpBg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        ui.addControl(miniHpBg);
        miniHpBg.linkWithMesh(mesh);
        miniHpBg.linkOffsetY = -34;

        const miniHp = new GUI.Rectangle(`ehp_${mesh.uniqueId}`);
        miniHp.width = '100%';
        miniHp.height = '100%';
        miniHp.background = type === 'heavy' ? '#ff8a66' : type === 'elite' ? '#ffdd55' : '#66ddff';
        miniHp.thickness = 0;
        miniHp.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        miniHpBg.addControl(miniHp);

        const enemy = {
            runtimeId,
            seed,
            mesh, visual, hp,
            maxHp: hp,
            type,
            spec,
            roleId: resolvedRoleId,
            speed,
            shootMs,
            canShoot: spec ? spec.canShoot : type !== 'scout',
            lastShoot: spec ? nowMs - Math.max(0, shootMs) : 0,
            sineOff: spec ? ((seed % 6284) / 1000) : Math.random() * Math.PI * 2,
            miniHp,
            miniHpBg,
            _contactHitId: `dungeon-enemy-contact-${mesh.uniqueId}`,
            _facingYaw: 0,
            _combatSlot: null,
            _lastVolleyPhaseId: null,
            _volleySequence: 0,
            _choreographyState: spec
                ? createDungeonEnemyChoreographyStateV38(spec, { seed, nowMs })
                : null,
            _chargerState: spec?.roleId === 'charger'
                ? createChargerMotionStateV26A3({ nowMs })
                : null,
        };
        enemies.push(enemy);
        return enemy;
    };

    const cleanEnemy = (e, killedByDamage = false) => {
        if (e._dead) return;
        e._dead = true;
        if (killedByDamage) deathVisuals.capture(e.visual);
        else e.visual?.dispose();
        safeDisGui(e.miniHp);
        safeDisGui(e.miniHpBg);
        safeDis(e.mesh); // collider removed synchronously; only noninteractive art remains
    };

    const clearDungeonRoomObjectsV38 = () => {
        for (const item of dungeonBreakablesV38.splice(0)) {
            item.disposeHud?.();
            item.visual?.dispose?.();
            safeDis(item.mesh);
        }
        for (const item of dungeonHazardsV38.splice(0)) {
            item.visual?.dispose?.();
            safeDis(item.mesh);
        }
        for (const warning of dungeonHazardWarningsV39.splice(0)) warning?.dispose?.();
        activeDungeonHazardV38 = null;
        dungeonObjectiveSequenceV394 = null;
    };

    const spawnDungeonBreakableNodeV394 = (definition, nowMs) => {
        if (!definition) return null;
        const policy = dungeonObjectiveSequenceV394?.policy || currentRoomV38?.objectiveRevealPolicy || {};
        const motion = createDungeonObjectiveWorldMotionV395({
            seed: stableSeed(dungeonSeedV38, currentRoomV38?.id || 'room', definition.id),
            definition,
            policy,
            arenaHalfWidth: boundX(),
            worldHalfHeight: ZOOM,
            nowMs,
        });
        const position = new BABYLON.Vector3(motion.x, .08, motion.z);
        const visual = createDungeonBreakableVisualV39({
            scene,
            BABYLON,
            name: `dungeon-breakable-${definition.id}`,
            position,
            style: definition.visualStyle || definition.visualId || 'ore_pod',
            scale: definition.scale || 1,
        });
        const mesh = visual.mesh;
        mesh.rotation.y = (stableSeed(dungeonSeedV38, definition.id) % 6284) / 1000;
        mesh.isPickable = false;

        const hpBg = new GUI.Rectangle(`dungeon-breakable-hp-bg-${definition.id}`);
        hpBg.width = '62px';
        hpBg.height = '7px';
        hpBg.background = 'rgba(3,10,9,.88)';
        hpBg.color = `${dungeonPresentationV39.palette.objective || '#ffd166'}99`;
        hpBg.thickness = 1;
        hpBg.cornerRadius = 4;
        ui.addControl(hpBg);
        hpBg.linkWithMesh(mesh);
        hpBg.linkOffsetY = -38;

        const hpFill = new GUI.Rectangle(`dungeon-breakable-hp-fill-${definition.id}`);
        hpFill.width = '100%';
        hpFill.height = '100%';
        hpFill.background = dungeonPresentationV39.breakable?.hpBarColor || '#ffd166';
        hpFill.thickness = 0;
        hpFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        hpBg.addControl(hpFill);

        const maxHp = Math.max(1, Number(definition.hp) || 200);
        const item = {
            id: definition.id,
            mesh,
            visual,
            hp: maxHp,
            maxHp,
            hpFill,
            hpBg,
            score: Math.max(0, Math.round(Number(definition.score) || 0)),
            hitRadius: clamp(Number(definition.hitRadius) || 1.15, .7, 2.0),
            objectiveRole: definition.objectiveRole || 'node',
            sequenceIndex: Number(definition.sequenceIndex) || 0,
            motion,
            isWorldVisible: true,
            passCount: 0,
            spawnedAtMs: nowMs,
            disposeHud: () => {
                safeDisGui(hpFill);
                safeDisGui(hpBg);
            },
        };
        dungeonBreakablesV38.push(item);
        updateDungeonObjectiveHudV39();
        return item;
    };

    const startDungeonBreakableSequenceV394 = (definitions = [], nowMs = 0) => {
        dungeonObjectiveSequenceV394 = createProgressiveObjectiveSequenceV394({
            definitions,
            policy: currentRoomV38?.objectiveRevealPolicy || {},
            nowMs,
        });
        updateDungeonObjectiveHudV39();
    };

    const startDungeonHazardV38 = (hazard, nowMs) => {
        activeDungeonHazardV38 = hazard ? {
            ...hazard,
            nextTelegraphAtMs: nowMs + 420,
            pending: null,
            spawnIndex: 0,
            remainingSpawns: Math.max(1, Math.trunc(Number(hazard.count) || 1)),
        } : null;
    };

    const prepareDungeonHazardWarningV39 = (hazard, nowMs) => {
        if (!hazard || hazard.remainingSpawns <= 0 || hazard.pending) return null;
        const index = hazard.spawnIndex;
        const laneNorm = resolveDungeonHazardLaneNormV394({
            seed: stableSeed(dungeonSeedV38, currentRoomV38?.id || 'room', hazard.id || 'hazard'),
            index,
        });
        const cue = resolveDungeonHazardCueV394({
            ...dungeonPresentationV39.hazard,
            ...hazard,
        });
        const warning = createDungeonHazardTelegraphV39({
            scene,
            BABYLON,
            name: `dungeon-hazard-warning-${currentWave}-${index}`,
            x: laneNorm * (boundX() - .65),
            z: -ZOOM + .62,
            width: cue.width,
            depth: 0,
            colorHex: dungeonPresentationV39.palette.warning || '#ff8a32',
            mode: cue.mode,
        });
        if (cue.mode !== 'none') dungeonHazardWarningsV39.push(warning);
        hazard.pending = {
            index,
            laneNorm,
            warning,
            spawnAtMs: nowMs + cue.durationMs,
        };
        return hazard.pending;
    };

    const spawnDungeonHazardDebrisV38 = (hazard, nowMs, pending = hazard?.pending) => {
        if (!hazard || hazard.remainingSpawns <= 0 || !pending) return false;
        const index = pending.index;
        hazard.spawnIndex += 1;
        hazard.remainingSpawns -= 1;
        const motion = createNaturalHazardMotionV394({
            seed: stableSeed(dungeonSeedV38, currentRoomV38?.id || 'room', hazard.id || 'hazard'),
            index,
            laneNorm: pending.laneNorm,
            speed: Math.max(.035, Number(hazard.speed) || .075),
            arenaHalfWidth: boundX(),
        });
        const position = new BABYLON.Vector3(
            motion.baseX,
            .12,
            -ZOOM - 1.8,
        );
        const visual = createDungeonHazardVisualV39({
            scene,
            BABYLON,
            name: `dungeon-hazard-${++dungeonHazardSequenceV38}`,
            position,
            variant: index,
        });
        const mesh = visual.mesh;
        const combat = resolveDungeonHazardCombatV392(hazard);
        mesh.rotation.y = (index * .73) % (Math.PI * 2);
        mesh.isPickable = false;
        mesh.metadata = {
            ...(mesh.metadata || {}),
            dungeonHazardId: hazard.id || 'drifting_debris',
            destructible: combat.destructible,
            logicalHitRadius: combat.hitRadius,
            movementPresentation: 'natural_drift_v394',
        };
        dungeonHazardsV38.push({
            mesh,
            visual,
            motion,
            rotationX: .010 + (index % 3) * .003,
            rotationY: .015 + (index % 2) * .004,
            rotationZ: .008 + (index % 4) * .002,
            damage: Math.max(1, Math.round(Number(hazard.damage) || 60)),
            hitId: `dungeon-hazard-${currentWave}-${index}-${Math.trunc(nowMs)}`,
            destructible: combat.destructible,
            hp: combat.hp,
            maxHp: combat.maxHp,
            score: combat.score,
            hitRadius: combat.hitRadius,
            contactRadius: combat.contactRadius,
        });
        return true;
    };

    const handleDungeonDirectorEventV38 = (event, nowMs) => {
        if (!event) return;
        if (event.type === 'room_started') {
            clearDungeonRoomObjectsV38();
            clearDungeonHostileProjectilesV38();
            disposeDungeonBossTelegraphsV38();
            currentRoomV38 = event.room;
            currentWave = event.roomIndex + 1;
            currentRoomInitialEnemyCountV39 = event.roomPlan?.entries?.length || 0;
            currentRoomInitialBreakableCountV39 = event.room.breakables?.length || 0;
            currentRoomCompleteV396 = false;
            waveSpawned = 0;
            waveKilled = 0;
            bossSpawned = false;
            bossActive = false;
            bossDefeatedPulseV38 = false;
            waveText.text = `${lang === 'vi' ? 'PHÒNG' : 'ROOM'} ${currentWave}/${ACTIVE_MAX_WAVES} · ${event.room.title?.[lang] || event.room.title?.vi || event.room.id}`;
            showAnnouncement(event.room.title?.[lang] || event.room.title?.vi || event.room.id,
                event.room.kind === 'boss' ? '#ff4757' : dungeonConfig.themeColor || '#66fcf1',
                event.room.kind === 'boss' ? 1300 : 850);
            updateDungeonObjectiveHudV39();
            publishDungeonHudV396(true);
            return;
        }
        if (event.type === 'spawn_breakables') {
            startDungeonBreakableSequenceV394(event.breakables, nowMs);
            return;
        }
        if (event.type === 'hazard_started') {
            startDungeonHazardV38(event.hazard, nowMs);
            return;
        }
        if (event.type === 'spawn_enemy') {
            spawnEnemy(event.entry, currentRoomV38);
            waveSpawned += 1;
            updateDungeonObjectiveHudV39();
            return;
        }
        if (event.type === 'spawn_boss') {
            clearDungeonHostileProjectilesV38();
            spawnBoss(event.boss);
            updateDungeonObjectiveHudV39();
            publishDungeonHudV396(true);
            return;
        }
        if (event.type === 'room_cleared') {
            currentRoomCompleteV396 = true;
            clearDungeonRoomObjectsV38();
            clearDungeonHostileProjectilesV38();
            disposeDungeonBossTelegraphsV38();
            objectiveProgressText.text = lang === 'vi' ? 'HOÀN TẤT' : 'COMPLETE';
            showAnnouncement(lang === 'vi' ? 'PHÒNG ĐÃ DỌN SẠCH' : 'ROOM CLEARED', '#4ade80', 650);
            publishDungeonHudV396(true);
            return;
        }
        if (event.type === 'dungeon_completed') {
            clearDungeonRoomObjectsV38();
            clearDungeonHostileProjectilesV38();
            disposeDungeonBossTelegraphsV38();
            objectivePanel.isVisible = false;
            triggerVictory();
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 12. ĐẠN
    // ══════════════════════════════════════════════════════════════════════════

    const playerBullets = [];
    const enemyBullets  = [];
    const playerDamageGate = createPlayerDamageGateV25();
    let enemyProjectileSequence = 0;
    let   lastFire      = 0;
    let   nextWingFire  = 0;
    let   nextDroneFire = 0;

    const shots = createProjectileEmitter({ scene, BABYLON, bullets: playerBullets, scheduleBattleTimer });
    const clearDungeonHostileProjectilesV38 = ({ sourceRole = null } = {}) => {
        for (let index = enemyBullets.length - 1; index >= 0; index -= 1) {
            const projectile = enemyBullets[index];
            if (sourceRole && projectile?._sourceRole !== sourceRole) continue;
            safeDis(projectile);
            enemyBullets.splice(index, 1);
        }
    };
    scene.onDisposeObservable.add(() => {
        clearDungeonHostileProjectilesV38();
        clearDungeonRoomObjectsV38();
        hostileProjectileVisualsV38.dispose();
    });
    const liveTargets = () => {
        const combatTargets = [
            ...enemies.filter(e => !e.mesh.isDisposed()),
            ...(bossMesh && !bossMesh.isDisposed() ? [{ mesh: bossMesh }] : []),
        ];
        if (combatTargets.length) return combatTargets;
        return dungeonHazardsV38
            .filter(hazard => hazard.destructible && hazard.mesh && !hazard.mesh.isDisposed())
            .map(hazard => ({ mesh: hazard.mesh, hazard }));
    };
    const fireEnemyBullet = (pos, velX = 0, velZ = enemyBulletVelZ, options = {}) => {
        const hitId = `dungeon-enemy-projectile-${++enemyProjectileSequence}`;
        const plan = options.plan || null;
        const sourceRole = options.sourceRole || plan?.sourceRole || 'legacy';
        const priority = options.priority || (sourceRole === 'boss' ? 'boss' : 'normal');
        const visual = plan?.visual || options.visual || resolveCampaignEnemyProjectileVisualV31({
            sourceRole,
            priority,
            visualId: options.visualId || plan?.visualId || null,
            pattern: options.pattern || plan?.pattern || null,
        });
        const hitRadius = resolveDungeonHostileProjectileHitRadiusV392({
            priority,
            visual,
            requestedRadius: options.hitRadius || plan?.hitRadius,
        });
        const b = visual
            ? hostileProjectileVisualsV38.create({
                name: hitId,
                visual,
                position: pos,
                vx: velX,
                vz: velZ,
            })
            : BABYLON.MeshBuilder.CreateSphere(hitId, { diameter: 0.5 }, scene);
        if (!b) return null;
        if (!visual) {
            b.position = pos.clone();
            b.position.y = 0;
            b.material = MAT.bulletEnemy;
        }
        b._velX = velX;
        b._velZ = velZ;
        b._damageHitId = hitId;
        b._damage = Math.max(1, Math.round(Number(options.damage ?? options.rawDamage) || 70));
        b._damageType = options.damageType || 'energy';
        b._shotPlan = plan;
        b._createdAtMs = Number(plan?.createdAtMs) || Date.now();
        b._expiresAtMs = Number(plan?.expiresAtMs) || (b._createdAtMs + (priority === 'boss' ? 5600 : 4400));
        b._sourceRole = sourceRole;
        b._priority = priority;
        b._hitRadius = hitRadius;
        b.metadata = {
            ...(b.metadata || {}),
            logicalHitRadius: hitRadius,
            damageAuthority: 'dungeon-logical-projectile-v392',
        };
        enemyBullets.push(b);
        return b;
    };

    const disposeDungeonBossTelegraphsV38 = () => {
        for (const corridor of dungeonBossAttackTelegraphsV38.splice(0)) safeDis(corridor);
    };

    const resolveDungeonBossMuzzleOriginV38 = () => {
        if (!bossMesh || bossMesh.isDisposed?.()) return null;
        bossMesh.computeWorldMatrix(true);
        const world = BABYLON.Vector3.TransformCoordinates(
            dungeonBossMuzzleLocalV38,
            bossMesh.getWorldMatrix(),
        );
        return Object.freeze({ x: world.x, y: 0, z: world.z });
    };

    const activeDungeonBossPlanIdV38 = () => getDungeonBossSnapshotV38(
        dungeonBossRuntimeV38,
    )?.statechart?.attackPlan?.id || null;

    const updateDungeonBossFacingV38 = (velocityX, velocityZ, frameDeltaMs) => {
        if (!bossMesh || bossMesh.isDisposed?.()) return;
        bossMesh._facingYaw = resolveEnemyGameplayYawV26A4({
            currentYaw: bossMesh._facingYaw,
            velocityX,
            velocityZ,
            maxTurnRadians: 5.2 * Math.max(0, Math.min(100, frameDeltaMs)) / 1000,
        });
        bossMesh.rotation.y = bossMesh._facingYaw;
    };

    const createDungeonBossTelegraphsV38 = (plan) => {
        disposeDungeonBossTelegraphsV38();
        if (!plan?.paths?.length) return Object.freeze([]);
        const telegraph = resolveDungeonBossTelegraphMaterialV39(plan.pattern);
        dungeonBossAttackTelegraphsV38 = plan.paths.map((path, index) => {
            const corridor = BABYLON.MeshBuilder.CreateBox(
                `dungeon-boss-telegraph-${plan.id}-${index}`,
                { width: 1, height: .025, depth: 1 },
                scene,
            );
            corridor.position.set(path.midpoint.x, .045, path.midpoint.z);
            corridor.rotation.y = path.yawRadians;
            corridor.scaling.set(path.width, 1, path.length);
            corridor.material = telegraph.material;
            corridor.isPickable = false;
            corridor.visibility = .64;
            corridor.metadata = {
                ...(corridor.metadata || {}),
                dungeonBossPlanId: plan.id,
                sourcePatternId: plan.pattern,
                presentationPatternId: telegraph.presentation.patternId,
            };
            return corridor;
        });
        return Object.freeze([...dungeonBossAttackTelegraphsV38]);
    };

    const fireDungeonBossAttackPlanV38 = (plan) => {
        if (!plan?.paths?.length || !currentBossSpecV38) return 0;
        const planId = plan.id;
        let scheduled = 0;
        for (const projectile of projectilesFromDungeonBossAttackPlanV38(plan, currentBossSpecV38)) {
            const fire = () => {
                if (battleSceneDisposed || gameOver || !bossActive || bossHp <= 0
                    || !bossMesh || bossMesh.isDisposed?.()) return;
                if (activeDungeonBossPlanIdV38() !== planId) return;
                fireEnemyBullet(
                    new BABYLON.Vector3(projectile.origin.x, 0, projectile.origin.z),
                    projectile.velocity.x,
                    projectile.velocity.z,
                    {
                        priority: 'boss',
                        sourceRole: 'boss',
                        visualId: projectile.visualId,
                        pattern: projectile.pattern,
                        rawDamage: projectile.rawDamage,
                        damageType: projectile.damageType,
                    },
                );
            };
            if (projectile.fireOffsetMs > 0) scheduleBattleTimer(fire, projectile.fireOffsetMs);
            else fire();
            scheduled += 1;
        }
        return scheduled;
    };

    const resolveDungeonEnemyMuzzleOriginV38 = enemy => {
        if (!enemy?.mesh || enemy.mesh.isDisposed?.()) return null;
        enemy.mesh.computeWorldMatrix(true);
        const localForward = enemy.spec?.roleId === 'artillery' ? 1.02 : .76;
        const world = BABYLON.Vector3.TransformCoordinates(
            new BABYLON.Vector3(0, 0, localForward),
            enemy.mesh.getWorldMatrix(),
        );
        return world;
    };

    const fireDungeonEnemyShotV38 = (enemy, nowMs, shotIndex = 0, burstCount = 1) => {
        if (!dungeonParityV38 || !enemy?.spec?.weapon?.projectile
            || enemy._dead || enemy.mesh?.isDisposed?.()) return null;
        const weapon = enemy.spec.weapon;
        const projectile = weapon.projectile;
        const origin = resolveDungeonEnemyMuzzleOriginV38(enemy)
            || enemy.mesh.getAbsolutePosition?.().clone?.()
            || enemy.mesh.position.clone();
        origin.y = 0;
        const spreadOffset = (shotIndex - (burstCount - 1) / 2) * .20;
        const target = {
            x: playerRoot.position.x + spreadOffset,
            z: playerRoot.position.z,
        };
        const plan = createCampaignEnemyShotPlanV31({
            origin,
            target,
            targetVelocity: playerVelocityV38,
            projectileSpeed: projectile.speed,
            aimMode: projectile.aimMode,
            leadFactor: projectile.leadFactor,
            maxLeadMs: projectile.maxLeadMs,
            guidanceMs: projectile.guidanceMs,
            turnRateRadians: projectile.turnRateRadians,
            lifetimeMs: projectile.lifetimeMs,
            sourceRole: enemy.spec.roleId,
            priority: enemy.spec.elite ? 'elite' : 'normal',
            damageType: weapon.bulletType || enemy.spec.archetype.damageType,
            visualId: projectile.visualId,
            pattern: weapon.bulletPattern,
            createdAtMs: nowMs,
        });
        enemy.visual?.setState('attack');
        return fireEnemyBullet(origin, plan.velocity.x, plan.velocity.z, {
            plan,
            damage: projectile.damage,
            damageType: weapon.bulletType || enemy.spec.archetype.damageType,
            sourceRole: enemy.spec.roleId,
        });
    };

    const tryFireDungeonEnemyVolleyV38 = (enemy, choreography, nowMs) => {
        if (!dungeonParityV38 || !enemy?.spec || !enemy.canShoot || !choreography?.mayFire) return false;
        if (nowMs <= enemy.lastShoot + enemy.shootMs) return false;
        const phaseId = choreography.phaseId || 'attack';
        const cadence = enemy.spec.weapon.cadence || {};
        const plan = createCampaignEnemyVolleyPlanV34({
            roleId: enemy.spec.roleId,
            phaseId,
            sequence: enemy._volleySequence++,
            burstCount: cadence.burstCount || 1,
            burstGapMs: cadence.burstGapMs || 0,
            projectileDamage: enemy.spec.weapon.projectile?.damage || 1,
            createdAtMs: nowMs,
        });
        enemy.lastShoot = nowMs;
        enemy._lastVolleyPhaseId = phaseId;
        for (const shot of plan.shots) {
            scheduleBattleTimer(() => {
                if (battleSceneDisposed || gameOver || enemy._dead || enemy.mesh?.isDisposed?.()) return;
                fireDungeonEnemyShotV38(enemy, Date.now(), shot.index, plan.shots.length);
            }, shot.fireOffsetMs);
        }
        return true;
    };


    // ══════════════════════════════════════════════════════════════════════════
    // 13. GAME STATE
    // ══════════════════════════════════════════════════════════════════════════

    let score        = 0;
    let totalKills   = 0;
    let enemyBulletVelZ = DIFF.bulletVel;
    let gameOver     = false;
    let tick         = 0;
    let lastDungeonHudPublishAtV396 = -Infinity;

    const publishDungeonHudV396 = (force = false) => {
        if (!externalHudV396 || battleSceneDisposed) return;
        const nowMs = Date.now();
        const publishIntervalMs = dungeonHudProfileV396.layout?.publishIntervalMs || 100;
        if (!force && nowMs - lastDungeonHudPublishAtV396 < publishIntervalMs) return;
        lastDungeonHudPublishAtV396 = nowMs;

        const roomIndex = Math.max(0, currentWave - 1);
        const roomHud = resolveDungeonHudRoomV396({
            dungeonId,
            room: currentRoomV38,
            roomIndex,
            lang,
        });
        const sequence = getProgressiveObjectiveSnapshotV394(dungeonObjectiveSequenceV394);
        const nodesTotal = sequence.totalCount > 0
            ? sequence.totalCount
            : currentRoomInitialBreakableCountV39;
        const nodesDestroyed = sequence.totalCount > 0
            ? sequence.destroyedCount
            : Math.max(0, currentRoomInitialBreakableCountV39 - dungeonBreakablesV38.length);
        const enemyTotalForHudV396 = currentRoomInitialEnemyCountV39 || waveEnemyCount;
        const progress = resolveDungeonObjectiveProgressV396({
            roomKind: roomHud.kind,
            roomComplete: currentRoomCompleteV396,
            enemiesDefeated: Math.min(enemyTotalForHudV396, Math.max(0, waveKilled)),
            enemiesTotal: enemyTotalForHudV396,
            nodesDestroyed,
            nodesTotal,
            bossHp: bossActive ? bossHp : null,
            bossMaxHp: bossActive ? bossMaxHp : null,
            lang,
        });
        const roomMarkers = buildDungeonRoomMarkersV396({
            dungeonId,
            rooms: dungeonRuntimeProfileV38?.rooms,
            currentRoomIndex: roomIndex,
            maxMarkers: dungeonHudProfileV396.layout?.maxRoomMarkers,
            lang,
        });
        const roomMarkerSignature = roomMarkers
            .map(marker => `${marker.index}:${marker.status}:${marker.gapBefore ? 1 : 0}`)
            .join('|');
        const objectiveBody = roomHud.objective
            || resolveDungeonRoomObjectiveV39({ dungeonId, room: currentRoomV38, lang });
        const bossName = currentBossSpecV38?.displayName?.[lang]
            || currentBossSpecV38?.displayName?.vi
            || currentBossSpecV38?.displayName?.en
            || '';
        const directQaLabel = dungeonQaRunV391?.directRoomId || dungeonQaRunV391?.runtimeMode || '';

        onHudUpdate({
            dungeonId,
            score,
            kills: totalKills,
            hp: stats.hp,
            maxHp: stats.maxHp,
            roomIndex,
            roomNumber: roomIndex + 1,
            roomTotal: ACTIVE_MAX_WAVES,
            roomId: roomHud.id,
            roomTitle: roomHud.title,
            roomKind: roomHud.kind,
            roomKindLabel: roomHud.kindLabel,
            roomTone: roomHud.tone,
            roomMarkers,
            roomMarkerSignature,
            objectiveTitle: `${lang === 'vi' ? 'MỤC TIÊU' : 'OBJECTIVE'} · ${roomHud.title}`,
            objectiveBody,
            objectiveMode: progress.mode,
            objectiveLabel: progress.label,
            objectiveValue: progress.value,
            objectiveSecondary: progress.secondary,
            objectiveRatio: progress.ratio,
            bossName,
            bossHp: bossActive ? bossHp : null,
            bossMaxHp: bossActive ? bossMaxHp : null,
            roomComplete: currentRoomCompleteV396,
            qaLabel: dungeonQaRunV391
                ? `${dungeonHudProfileV396.qaLabel}${directQaLabel ? ` · ${directQaLabel}` : ''}`
                : null,
        });
    };

    const updateScore = (delta) => {
        score += delta;
        scoreText.text = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: ${score}`;
    };

    const damagePlayer = ({
        rawDamage,
        source = 'contact',
        damageType = 'kinetic',
        hitId = null,
        contactId = null,
    } = {}) => {
        const nowMs = globalThis.performance?.now?.() ?? Date.now();
        const hpBefore = stats.hp;
        if (gameOver || hpBefore <= 0) {
            return createPlayerDamageOutcomeV25({
                source, hitId, contactId, rawDamage, hpBefore, hpAfter: stats.hp,
            });
        }
        const gate = playerDamageGate.admitHit({ source, hitId, contactId, nowMs });
        if (!gate.accepted) {
            return createPlayerDamageOutcomeV25({
                gate, source, hitId, contactId, rawDamage, hpBefore, hpAfter: stats.hp,
            });
        }

        const scaledRawDamage = Math.max(0, Number(rawDamage) || 0) * shieldDamageFactor(droneBase);
        const result = receiveBattleHit(stats, passives, scaledRawDamage, {
            source, nowMs: Date.now(),
        });
        if (result.dodged) {
            showAnnouncement(lang === 'vi' ? 'NÉ TRÁNH!' : 'DODGED!', '#4ade80', 1000);
            return createPlayerDamageOutcomeV25({
                gate, source, hitId, contactId, rawDamage: scaledRawDamage,
                hpBefore, hpAfter: stats.hp, dodged: true, dodgeSource: 'pilot',
            });
        }

        // Battle passives hit nearby enemies, without changing cloud rewards.
        if (result.reflected || result.novaDamage) {
            for(const enemy of [...enemies]) {
                if(!enemy.mesh?.position || enemy.hp<=0) continue;
                const dx=enemy.mesh.position.x-playerRoot.position.x;
                const dz=enemy.mesh.position.z-playerRoot.position.z;
                if(dx*dx+dz*dz <= (result.novaDamage ? 25 : 9))
                    applyPlayerDamageToEnemy(enemy,result.reflected+result.novaDamage);
            }
        }

        const outcome = createPlayerDamageOutcomeV25({
            gate, source, hitId, contactId, rawDamage: scaledRawDamage,
            hpBefore, hpAfter: stats.hp, absorbed: result.absorbed,
            reflected: result.reflected, novaDamage: result.novaDamage,
        });
        updateHpUI();
        if (outcome.outcome === 'absorbed' || outcome.outcome === 'no_damage') return outcome;
        triggerShake(0.28, 10);
        if (stats.hp <= 0) triggerGameOver();
        return outcome;
    };

    const triggerGameOver = () => {
        if (gameOver) return;
        gameOver = true;
        publishDungeonHudV396(true);
        explode(playerRoot.position, 4);
        triggerShake(0.6, 20);
        shipVisual.setVisibility(0);
        engineFx.stop();
        showAnnouncement(
            lang === 'vi' ? 'THẤT BẠI!' : 'MISSION FAILED!',
            '#ff4757',
            2000,
        );
        const dungeonSnapshot = dungeonParityV38
            ? getDungeonEncounterSnapshotV38(dungeonDirectorV38)
            : null;
        scheduleBattleTimer(() => onGameOver({
            score,
            totalKills,
            wavesCleared : dungeonSnapshot?.roomsCleared ?? Math.max(0, currentWave - 1),
            maxWaves     : dungeonSnapshot?.totalRooms ?? ACTIVE_MAX_WAVES,
        }), 1800);
    };

    const triggerVictory = () => {
        if (gameOver) return;
        gameOver = true;
        currentRoomCompleteV396 = true;
        publishDungeonHudV396(true);
        showAnnouncement(
            lang === 'vi' ? 'HOÀN THÀNH\nPHÓ BẢN!' : 'DUNGEON\nCLEARED!',
            '#2ecc71',
            2000,
        );
        // All guest dungeon rewards are paid only after Result -> Claim.
        // Cloud rewards remain server-authoritative.
        const dungeonSnapshot = dungeonParityV38
            ? getDungeonEncounterSnapshotV38(dungeonDirectorV38)
            : null;
        scheduleBattleTimer(() => onVictory({
            score,
            totalKills,
            wavesCleared : dungeonSnapshot?.roomsCleared ?? currentWave,
            maxWaves     : dungeonSnapshot?.totalRooms ?? ACTIVE_MAX_WAVES,
        }), 2800);
    };

    if (!dungeonParityV38) {
        const startLegacyDungeonWhenVisualsReadyV392 = () => {
            if (dungeonVisualSpawnGateReadyV392(Date.now())) {
                startWave(1);
                return;
            }
            scheduleBattleTimer(startLegacyDungeonWhenVisualsReadyV392, 80);
        };
        scheduleBattleTimer(startLegacyDungeonWhenVisualsReadyV392, 800);
    }

    const applyPlayerDamageToEnemy = (enemy, damage) => {
        if (!enemy || enemy.mesh.isDisposed() || enemy.hp <= 0) return false;
        enemy.hp -= damage;
        enemy.visual?.setState('hit');
        const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
        enemy.miniHp.width = `${(ratio * 100).toFixed(0)}%`;
        enemy.miniHp.background = ratio < .4 ? '#ff8800'
          : enemy.type === 'heavy' ? '#ff8a66' : enemy.type === 'elite' ? '#ffdd55' : '#66ddff';
        if (enemy.hp > 0) return false;
        const gain = enemy.type === 'scout' ? 10 : enemy.type === 'heavy' ? 30 : 60;
        updateScore(gain);
        if (!isCloud) recordGuestEventKill(gsRef.current.campaignData, EVENT_CONFIG, getRealTime?.() ?? Date.now());
        explode(enemy.mesh.position, enemy.type === 'heavy' ? 2 : 1);
        cleanEnemy(enemy, true);
        const index = enemies.indexOf(enemy);
        if (index >= 0) enemies.splice(index, 1);
        waveKilled++;
        updateDungeonObjectiveHudV39();
        return true;
    };
    const applyDungeonSplash = (bullet, impact, damage, primary) => {
        if (!bullet._splashRadius) return;
        explode(new BABYLON.Vector3(impact.x, 0, impact.z), bullet._splashRadius * .45);
        const nearby = enemies.filter(other => other !== primary && !other.mesh.isDisposed()
          && projectileHitsPoint({ position: impact }, other.mesh.position, bullet._splashRadius));
        nearby.forEach(other => {
            if (bullet._slowMs) other._slowUntil = Date.now() + bullet._slowMs;
            applyPlayerDamageToEnemy(other, damage * .4);
        });
    };

    const resolveDungeonEnemySeparationV38 = enemy => {
        let x = 0;
        let z = 0;
        let contributors = 0;
        const radius = Math.max(1.65, Number(enemy?._combatSlot?.minSpacing) || 1.85);
        for (const other of enemies) {
            if (other === enemy || other._dead || other.mesh?.isDisposed?.()) continue;
            const dx = enemy.mesh.position.x - other.mesh.position.x;
            const dz = enemy.mesh.position.z - other.mesh.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance <= .001 || distance >= radius) continue;
            const weight = (radius - distance) / radius;
            x += dx / distance * weight;
            z += dz / distance * weight;
            contributors += 1;
        }
        if (!contributors) return { x: 0, z: 0 };
        const length = Math.hypot(x, z) || 1;
        return {
            x: x / length * Math.min(1, contributors * .30),
            z: z / length * Math.min(1, contributors * .22),
        };
    };

    const updateDungeonEnemyFacingV38 = (enemy, velocityX, velocityZ, frameDeltaMs) => {
        enemy._facingYaw = resolveEnemyGameplayYawV26A4({
            currentYaw: enemy._facingYaw,
            velocityX,
            velocityZ,
            maxTurnRadians: 7 * Math.max(0, Math.min(100, frameDeltaMs)) / 1000,
        });
        enemy.mesh.rotation.y = enemy._facingYaw;
    };

    const stepDungeonEnemyRuntimeV38 = (enemy, nowMs, frameFactor, frameDeltaMs) => {
        if (!enemy?.spec) return false;
        const enemyFrame = frameFactor * enemySpeedFactor(enemy, nowMs);
        const beforeX = enemy.mesh.position.x;
        const beforeZ = enemy.mesh.position.z;

        if (enemy.spec.roleId === 'charger') {
            const returnX = clamp(enemy.spec.laneNorm * (boundX() - .75), -boundX() + .5, boundX() - .5);
            const returnZ = -ZOOM * .48;
            const charge = stepChargerMotionV26A3(enemy._chargerState, {
                nowMs,
                enemyX: enemy.mesh.position.x,
                enemyZ: enemy.mesh.position.z,
                targetX: playerRoot.position.x,
                targetZ: playerRoot.position.z,
                returnTargetX: returnX,
                returnTargetZ: returnZ,
            });
            enemy._chargerState = charge.state;
            const speed = enemy.speed * Math.max(0, Number(charge.speedMultiplier) || 0);
            enemy.mesh.position.x = clamp(
                enemy.mesh.position.x + charge.direction.x * speed * enemyFrame,
                -boundX() + .35,
                boundX() - .35,
            );
            enemy.mesh.position.z = clamp(
                enemy.mesh.position.z + charge.direction.z * speed * enemyFrame,
                -ZOOM - 3,
                ZOOM + 2.4,
            );
            enemy.visual?.setState(['telegraph', 'charge'].includes(charge.state.phase) ? 'attack' : 'move');
            updateDungeonEnemyFacingV38(
                enemy,
                enemy.mesh.position.x - beforeX,
                enemy.mesh.position.z - beforeZ,
                frameDeltaMs,
            );
            return true;
        }

        const separation = resolveDungeonEnemySeparationV38(enemy);
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
            viewportHeight: canvas?.clientHeight || engine.getRenderHeight(),
            hudOcclusionLineZ: resolveDungeonHudOcclusionLineV396({
                dungeonId,
                worldHalfHeight: ZOOM,
                viewportHeight: canvas?.clientHeight || engine.getRenderHeight(),
            }),
            entityScale: enemy.spec.elite ? 1.15 : 1,
            hpBarOffsetPx: -34,
            hpBarHeightPx: 6,
            separationX: separation.x,
            separationZ: separation.z,
            combatSlot: enemy._combatSlot,
            fireCooldownMs: enemy.shootMs,
        });
        if (!result.handled) return false;
        enemy.mesh.position.x = clamp(enemy.mesh.position.x + result.deltaX, -boundX() + .35, boundX() - .35);
        enemy.mesh.position.z += result.deltaZ;
        if (!result.canCrossPlayer && Number.isFinite(Number(result.maxCombatZ))
            && enemy.mesh.position.z > result.maxCombatZ) {
            enemy.mesh.position.z = result.maxCombatZ;
            enemy._choreographyState.velocityZ = Math.min(0, enemy._choreographyState.velocityZ || 0);
        }
        if (result.facePlayer) {
            updateDungeonEnemyFacingV38(
                enemy,
                playerRoot.position.x - enemy.mesh.position.x,
                playerRoot.position.z - enemy.mesh.position.z,
                frameDeltaMs,
            );
        } else {
            updateDungeonEnemyFacingV38(
                enemy,
                enemy.mesh.position.x - beforeX,
                enemy.mesh.position.z - beforeZ,
                frameDeltaMs,
            );
        }
        enemy.visual?.setState(result.fireWindup || result.mayFire ? 'attack' : 'move');
        tryFireDungeonEnemyVolleyV38(enemy, result, nowMs);
        return true;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 14. MAIN RENDER LOOP
    // ══════════════════════════════════════════════════════════════════════════

    scene.onBeforeRenderObservable.add(() => {
        if (gameOver || (typeof scene.isDisposed === 'function' ? scene.isDisposed() : scene.isDisposed)) return;
        const now = Date.now();
        publishDungeonHudV396();
        const frameFactor = frameScale(engine.getDeltaTime());
        tick += frameFactor;
        dungeonBackdropV39?.tick?.(frameFactor);
        samplePlayerCombatVelocityV38(frameFactor);
        // A. Screen shake
        if (shakeFrames > 0) {
            camera.position.x = CAM_BASE.x + (Math.random() - 0.5) * shakeStr;
            camera.position.z = CAM_BASE.z + (Math.random() - 0.5) * shakeStr;
            shakeFrames--;
            if (shakeFrames === 0) {
                camera.position.x = CAM_BASE.x;
                camera.position.z = CAM_BASE.z;
            }
        }
        // B. Trả lái tàu về thẳng 
        if (!shipInput.isDragging()) {
            playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, 0, scaledLerpFactor(0.05,frameFactor));
        }

        // B. Di chuyển Vệ tinh (Drones Hovering)
        if (drones.length > 0) {
            const hoverZ = Math.sin(tick * 0.04) * 0.18;
            drones.forEach(d => {
                d.position.x = BABYLON.Scalar.Lerp(d.position.x, playerRoot.position.x + d.offsetX, scaledLerpFactor(0.22,frameFactor));
                d.position.z = BABYLON.Scalar.Lerp(d.position.z, playerRoot.position.z + d.offsetY + hoverZ, scaledLerpFactor(0.22,frameFactor));
            });
        }
        // C. Hồi HP tự động
        if (stats.hpRegenRate > 0 && stats.hp < stats.maxHp) {
            const dt = frameFactor / 60;
            stats.hp = Math.min(stats.maxHp, stats.hp + stats.maxHp * stats.hpRegenRate * dt);
            updateHpUI();
        }
       // D. Shared weapon policy, unchanged across Campaign and Dungeon.
       const target = pickWeaponTarget(liveTargets(), playerRoot.position);
       if (now > lastFire + stats.fireRate) {
           const salvo=describeMainSalvo(mainGunBase || GEAR_CATALOG.mainGun[0], playerRoot.position, stats.atk, target);
           shots.fire(salvo);
           if(salvo.length && shouldEchoShot(stats, passives, Date.now())) {
             const extra=salvo[0];
             shots.fire(Array.from({length:stats.echoCount},(_,i)=>({...extra,x:extra.x+(i%2===0?-.28:.28),delayMs:0})));
           }
           lastFire = now;
       }
       if (stats.wingmanId && wingmanBase && now > nextWingFire) {
           const mounts = wingNodes.map(w => w.getAbsolutePosition());
           shots.fire(describeWingSalvo(wingmanBase, mounts, stats.wingAtk, target));
           nextWingFire = now + stats.wingFireRate;
       }
       if (stats.droneId && droneBase && now > nextDroneFire && drones.length > 0) {
           if (droneBase.behavior === 'repair') {
               stats.hp = Math.min(stats.maxHp, stats.hp + repairAmount(droneBase, stats.maxHp));
               updateHpUI();
           } else {
               shots.fire(describeDroneSalvo(droneBase, drones.map(dr => dr.position), stats.droneAtk, target));
           }
           nextDroneFire = now + stats.droneFireRate;
       }

       // E. Di chuyển đạn người chơi (Kết hợp Spread Vector và Homing)
       for (let i = playerBullets.length - 1; i >= 0; i--) {
           const b = playerBullets[i];
           if (b.isDisposed()) { playerBullets.splice(i, 1); continue; }
           
           shots.advance(b, frameFactor);

           // Hủy đạn nếu bay ra khỏi màn hình
           if (b.position.z < -ZOOM - 3 || b.position.z > ZOOM + 3 || Math.abs(b.position.x) > boundX() + 3) { 
               safeDis(b); playerBullets.splice(i, 1); 
           }
       }

        if (dungeonParityV38) {
            if (dungeonObjectiveSequenceV394) {
                const sequenceStep = stepProgressiveObjectiveSequenceV394(dungeonObjectiveSequenceV394, {
                    nowMs: now,
                    activeIds: dungeonBreakablesV38.map(item => item.id),
                });
                for (const event of sequenceStep.events) {
                    if (event.type === 'spawn_objective_node') {
                        spawnDungeonBreakableNodeV394(event.definition, now);
                    }
                }
                if (sequenceStep.events.length) updateDungeonObjectiveHudV39();
            }

            for (const item of dungeonBreakablesV38) {
                if (!item.mesh || item.mesh.isDisposed()) continue;
                const motionStep = advanceDungeonObjectiveWorldMotionV395(item.motion, {
                    nowMs: now,
                    frameFactor,
                });
                item.isWorldVisible = motionStep.visible;
                if (motionStep.visible) {
                    item.mesh.setEnabled?.(true);
                    item.mesh.position.x = motionStep.x;
                    item.mesh.position.z = motionStep.z;
                    item.mesh.rotation.y += .0042 * frameFactor;
                    item.visual?.tick?.(engine.getDeltaTime(), motionStep.phase);
                } else {
                    item.mesh.setEnabled?.(false);
                }
                if (item.hpBg) item.hpBg.isVisible = motionStep.visible;
                if (motionStep.wrapped) item.passCount += 1;
            }

            if (activeDungeonHazardV38) {
                const activeHazard = activeDungeonHazardV38;
                if (activeHazard.pending) {
                    activeHazard.pending.warning?.update?.(now);
                    if (now >= activeHazard.pending.spawnAtMs) {
                        const pending = activeHazard.pending;
                        pending.warning?.dispose?.();
                        const warningIndex = dungeonHazardWarningsV39.indexOf(pending.warning);
                        if (warningIndex >= 0) dungeonHazardWarningsV39.splice(warningIndex, 1);
                        spawnDungeonHazardDebrisV38(activeHazard, now, pending);
                        activeHazard.pending = null;
                        if (activeHazard.remainingSpawns > 0) {
                            const interval = Math.max(900, Number(activeHazard.intervalMs) || 1800);
                            const cueMs = resolveDungeonHazardCueV394({
                                ...dungeonPresentationV39.hazard,
                                ...activeHazard,
                            }).durationMs;
                            activeHazard.nextTelegraphAtMs = now + Math.max(420, interval - cueMs);
                        } else {
                            activeDungeonHazardV38 = null;
                        }
                    }
                } else if (activeHazard.remainingSpawns > 0 && now >= activeHazard.nextTelegraphAtMs) {
                    prepareDungeonHazardWarningV39(activeHazard, now);
                }
            }

            for (let index = dungeonHazardsV38.length - 1; index >= 0; index -= 1) {
                const hazard = dungeonHazardsV38[index];
                if (!hazard.mesh || hazard.mesh.isDisposed()) {
                    dungeonHazardsV38.splice(index, 1);
                    continue;
                }
                const previousHazardPositionV392 = {
                    x: hazard.mesh.position.x,
                    z: hazard.mesh.position.z,
                };
                const hazardMotionStepV394 = advanceNaturalHazardMotionV394(hazard.motion, frameFactor);
                hazard.mesh.position.x = hazardMotionStepV394.x;
                hazard.mesh.position.z += hazardMotionStepV394.zDelta;
                hazard.mesh.rotation.x += hazard.rotationX * frameFactor;
                hazard.mesh.rotation.y += hazard.rotationY * frameFactor;
                hazard.mesh.rotation.z += hazard.rotationZ * frameFactor;
                if (logicalSegmentCircleHitV392(
                    previousHazardPositionV392,
                    hazard.mesh.position,
                    playerRoot.position,
                    hazard.contactRadius || 1.1,
                )) {
                    damagePlayer({
                        rawDamage: hazard.damage,
                        source: 'environment',
                        damageType: 'kinetic',
                        hitId: hazard.hitId,
                    });
                    hazard.visual?.dispose?.();
                    safeDis(hazard.mesh);
                    dungeonHazardsV38.splice(index, 1);
                    continue;
                }
                if (hazard.mesh.position.z > ZOOM + 2.5) {
                    hazard.visual?.dispose?.();
                    safeDis(hazard.mesh);
                    dungeonHazardsV38.splice(index, 1);
                }
            }

            for (let bulletIndex = playerBullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
                const bullet = playerBullets[bulletIndex];
                if (!bullet || bullet.isDisposed()) continue;
                let consumed = false;
                for (let hazardIndex = dungeonHazardsV38.length - 1; hazardIndex >= 0; hazardIndex -= 1) {
                    const hazard = dungeonHazardsV38[hazardIndex];
                    if (!hazard.destructible) continue;
                    if (!hazard.mesh || hazard.mesh.isDisposed()) {
                        dungeonHazardsV38.splice(hazardIndex, 1);
                        continue;
                    }
                    if (!projectileHitsPoint(bullet, hazard.mesh.position, hazard.hitRadius || 1.25)) continue;
                    const hit = shots.registerHit(bullet, { mesh: hazard.mesh });
                    if (!hit.accepted) continue;
                    hazard.hp -= calculateProjectileDamage(bullet.atk, stats.critDamageBoost);
                    const hazardRatio = clamp(hazard.hp / Math.max(1, hazard.maxHp), 0, 1);
                    hazard.visual?.setRatio?.(hazardRatio);
                    if (hazard.hp <= 0) {
                        explode(hazard.mesh.position, 1.15);
                        triggerShake(.10, 3);
                        updateScore(hazard.score || 0);
                        hazard.visual?.dispose?.();
                        safeDis(hazard.mesh);
                        dungeonHazardsV38.splice(hazardIndex, 1);
                    }
                    if (hit.consumed || bullet._splashRadius) {
                        safeDis(bullet);
                        playerBullets.splice(bulletIndex, 1);
                        consumed = true;
                    }
                    break;
                }
                if (consumed) continue;
                for (let debrisIndex = dungeonBreakablesV38.length - 1; debrisIndex >= 0; debrisIndex -= 1) {
                    const debris = dungeonBreakablesV38[debrisIndex];
                    if (!debris.mesh || debris.mesh.isDisposed()) {
                        dungeonBreakablesV38.splice(debrisIndex, 1);
                        continue;
                    }
                    if (debris.isWorldVisible === false) continue;
                    if (!projectileHitsPoint(bullet, debris.mesh.position, debris.hitRadius || 1.15)) continue;
                    const hit = shots.registerHit(bullet, { mesh: debris.mesh });
                    if (!hit.accepted) continue;
                    debris.hp -= calculateProjectileDamage(bullet.atk, stats.critDamageBoost);
                    const debrisRatio = clamp(debris.hp / debris.maxHp, 0, 1);
                    debris.visual?.setRatio?.(debrisRatio);
                    if (debris.hpFill) {
                        debris.hpFill.width = `${Math.round(debrisRatio * 100)}%`;
                        debris.hpFill.background = debrisRatio <= .30
                            ? (dungeonPresentationV39.breakable?.criticalColor || '#ff7b32')
                            : (dungeonPresentationV39.breakable?.hpBarColor || '#ffd166');
                    }
                    if (debris.hp <= 0) {
                        explode(debris.mesh.position, 1.3);
                        updateScore(debris.score);
                        debris.disposeHud?.();
                        debris.visual?.dispose?.();
                        safeDis(debris.mesh);
                        dungeonBreakablesV38.splice(debrisIndex, 1);
                        if (dungeonObjectiveSequenceV394) {
                            stepProgressiveObjectiveSequenceV394(dungeonObjectiveSequenceV394, {
                                nowMs: now,
                                activeIds: dungeonBreakablesV38.map(item => item.id),
                            });
                        }
                        updateDungeonObjectiveHudV39();
                    }
                    if (hit.consumed) {
                        safeDis(bullet);
                        playerBullets.splice(bulletIndex, 1);
                        consumed = true;
                    }
                    break;
                }
                if (consumed) continue;
            }
        }

        // G-I. Dungeon encounter director V3.8 (Taurus vertical slice) or legacy waves.
        if (dungeonParityV38) {
            if (dungeonVisualSpawnGateReadyV392(now)) {
                const directorStep = stepDungeonEncounterDirectorV38(dungeonDirectorV38, {
                    nowMs: now,
                    activeEnemyCount: enemies.length,
                    activeBreakableCount: currentRoomV38?.breakablesRequired
                        ? getProgressiveObjectiveSnapshotV394(dungeonObjectiveSequenceV394).remainingCount
                        : dungeonBreakablesV38.length,
                    bossAlive: Boolean(bossActive && bossMesh && !bossMesh.isDisposed()),
                    bossDefeated: bossDefeatedPulseV38,
                    maxSpawnEventsPerStep: 3,
                });
                bossDefeatedPulseV38 = false;
                for (const event of directorStep.events) handleDungeonDirectorEventV38(event, now);
            }
        } else {
            if (currentWave > 0 && waveSpawned < waveEnemyCount && now - lastEnemySpawn > spawnInterval) {
                spawnEnemy();
                waveSpawned++;
                lastEnemySpawn = now;
            }

            const allNormalDone = waveSpawned >= waveEnemyCount && enemies.length === 0;
            if (currentWave > 0 && waveBossEnabled && !bossSpawned && allNormalDone) {
                spawnBoss();
            }

            if (currentWave > 0 && !waveBossEnabled && allNormalDone && !waitingForNext) {
                advanceWave();
            }
        }

        // J. Logic boss 
        if (bossActive && bossMesh && !bossMesh.isDisposed()) {
            bossVisual?.tick(frameFactor * (1000 / 60));
            if (dungeonParityV38 && dungeonBossRuntimeV38) {
                const beforeBossX = bossMesh.position.x;
                const beforeBossZ = bossMesh.position.z;
                const bossStep = stepDungeonBossControllerV38(dungeonBossRuntimeV38, {
                    nowMs: now,
                    hpRatio: bossMaxHp > 0 ? bossHp / bossMaxHp : 0,
                    frameScale: frameFactor,
                    baseSpeed: .044,
                    enemyX: bossMesh.position.x,
                    enemyZ: bossMesh.position.z,
                    playerX: playerRoot.position.x,
                    playerZ: playerRoot.position.z,
                    playerVelocityX: playerVelocityV38.x,
                    playerVelocityZ: playerVelocityV38.z,
                    origin: resolveDungeonBossMuzzleOriginV38(),
                    arenaHalfWidth: boundX(),
                    worldHalfHeight: ZOOM,
                    viewportHeight: canvas?.clientHeight || engine.getRenderHeight(),
                    hudOcclusionLineZ: resolveDungeonHudOcclusionLineV396({
                        dungeonId,
                        worldHalfHeight: ZOOM,
                        viewportHeight: canvas?.clientHeight || engine.getRenderHeight(),
                    }),
                    entityScale: 1.7,
                });
                dungeonBossRuntimeV38 = bossStep.runtime;
                bossMesh.position.x = clamp(
                    bossMesh.position.x + (Number(bossStep.deltaX) || 0),
                    -boundX() + 1.25,
                    boundX() - 1.25,
                );
                bossMesh.position.z = clamp(
                    bossMesh.position.z + (Number(bossStep.deltaZ) || 0),
                    -ZOOM + 4.4,
                    ZOOM - 5.2,
                );
                if (bossStep.facePlayer) {
                    updateDungeonBossFacingV38(
                        playerRoot.position.x - bossMesh.position.x,
                        playerRoot.position.z - bossMesh.position.z,
                        engine.getDeltaTime(),
                    );
                } else if (!bossStep.holdOrientation) {
                    updateDungeonBossFacingV38(
                        bossMesh.position.x - beforeBossX,
                        bossMesh.position.z - beforeBossZ,
                        engine.getDeltaTime(),
                    );
                }
                bossVisual?.setState(bossStep.visualState || 'move');
                bossFallbackVisualV39?.tick?.(engine.getDeltaTime(), bossStep.visualState || 'move');
                for (const event of bossStep.events || []) {
                    if (event.type === 'telegraph_started') createDungeonBossTelegraphsV38(event.plan);
                    else if (event.type === 'fire_pattern') fireDungeonBossAttackPlanV38(event.plan);
                    else if (event.type === 'enrage_started') {
                        showAnnouncement(
                            lang === 'vi' ? 'CẢNH BÁO: TRÙM NỔI ĐIÊN!' : 'WARNING: BOSS ENRAGED!',
                            dungeonPresentationV39.palette.danger || '#ff2a16',
                            1800,
                        );
                    } else if (event.type === 'telegraph_ended' || event.type === 'telegraph_cancelled') {
                        disposeDungeonBossTelegraphsV38();
                    }
                }
                for (const corridor of dungeonBossAttackTelegraphsV38) {
                    if (!corridor?.isDisposed?.()) corridor.visibility = .52 + .18 * Math.sin(now * .021);
                }
            } else {
                bossVisual?.setState('move');
                bossFallbackVisualV39?.tick?.(engine.getDeltaTime(), 'move');
                bossMesh.position.z = BABYLON.Scalar.Lerp(
                    bossMesh.position.z,
                    -ZOOM * 0.45,
                    scaledLerpFactor(0.004, frameFactor),
                );
                bossMesh.position.x = Math.sin(tick * 0.012) * boundX() * 0.65;
                bossMesh.rotation.y += 0.025 * frameFactor;

                if (now - (bossMesh._lastShoot || 0) > 2000) {
                    bossVisual?.setState('attack');
                    for (let k = -2; k <= 2; k++) {
                        fireEnemyBullet(bossMesh.position, k * 0.08, enemyBulletVelZ * 0.85);
                    }
                    bossMesh._lastShoot = now;
                }
            }

            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!projectileHitsPoint(b, bossMesh.position, 2.8)) continue;
                const hit = shots.registerHit(b, { mesh: bossMesh });
                if (!hit.accepted) continue;

                bossHp -= calculateProjectileDamage(b.atk, stats.critDamageBoost);
                bossVisual?.setState('hit');
                bossFallbackVisualV39?.tick?.(0, 'hit');
                bossHpFill.width = `${clamp(bossHp / bossMaxHp, 0, 1) * 100}%`;
                updateDungeonObjectiveHudV39();

                if (hit.consumed || b._splashRadius) { safeDis(b); playerBullets.splice(j, 1); }

                if (bossHp <= 0) {
                    explode(bossMesh.position, 3.5);
                    triggerShake(0.9, 22);
                    deathVisuals.capture(bossVisual);
                    bossVisual = null;
                    bossFallbackVisualV39?.dispose?.();
                    bossFallbackVisualV39 = null;
                    stopDungeonBossControllerV38(dungeonBossRuntimeV38);
                    dungeonBossRuntimeV38 = null;
                    disposeDungeonBossTelegraphsV38();
                    clearDungeonHostileProjectilesV38();
                    currentBossSpecV38 = null;
                    safeDis(bossMesh); // boss hitbox removed without waiting for the clip
                    bossMesh   = null;
                    bossActive = false;
                    bossPanel.isVisible = false;
                    updateScore(500 * currentWave);
                    totalKills++;
                    if (!isCloud) recordGuestEventKill(gsRef.current.campaignData, EVENT_CONFIG, getRealTime?.() ?? Date.now());
                    showAnnouncement(lang === 'vi' ? '✦ BOSS ĐÃ TIÊU DIỆT ✦' : '✦ BOSS DEFEATED ✦', '#f1c40f');
                    if (typeof onBossDefeated === 'function') onBossDefeated();
                    if (dungeonParityV38) bossDefeatedPulseV38 = true;
                    else advanceWave();
                }
                break;
            }
        }

        // K. Đạn địch → người chơi
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const eb = enemyBullets[i];
            if (eb.isDisposed()) { enemyBullets.splice(i, 1); continue; }
            const previousProjectilePositionV392 = { x: eb.position.x, z: eb.position.z };
            let expired = false;
            if (eb._shotPlan) {
                const advanced = advanceCampaignEnemyProjectileV31({
                    plan: eb._shotPlan,
                    position: eb.position,
                    velocity: { x: eb._velX, z: eb._velZ },
                    target: { x: playerRoot.position.x, z: playerRoot.position.z },
                    targetVelocity: playerVelocityV38,
                    nowMs: now,
                    frameScale: frameFactor,
                });
                eb._velX = advanced.velocity.x;
                eb._velZ = advanced.velocity.z;
                eb.position.x += advanced.delta.x;
                eb.position.z += advanced.delta.z;
                hostileProjectileVisualsV38.update(
                    eb,
                    eb._velX,
                    eb._velZ,
                    now,
                    eb._createdAtMs,
                    eb._shotPlan.visual?.pulse || 0,
                );
                expired = advanced.expired;
            } else {
                eb.position.x += eb._velX * frameFactor;
                eb.position.z += eb._velZ * frameFactor;
            }
            if (logicalSegmentCircleHitV392(
                previousProjectilePositionV392,
                eb.position,
                playerRoot.position,
                eb._hitRadius || 1,
            )) {
                damagePlayer({
                    rawDamage: eb._damage || 70,
                    source: 'projectile',
                    damageType: eb._damageType || 'energy',
                    hitId: eb._damageHitId,
                });
                safeDis(eb);
                enemyBullets.splice(i, 1);
                continue;
            }
            if (now >= Number(eb._expiresAtMs || Infinity)) expired = true;
            if (expired || eb.position.z > ZOOM + 3 || eb.position.z < -ZOOM - 4
                || Math.abs(eb.position.x) > boundX() + 4) {
                safeDis(eb);
                enemyBullets.splice(i, 1);
            }
        }

        // L. Cập nhật địch
        if (dungeonParityV38) {
            syncCampaignEnemyCombatSlotsV37(
                enemyCombatSlotRegistryV38,
                enemies.filter(enemy => enemy.spec).map(createDungeonCombatSlotDescriptorV38),
                { nowMs: now },
            );
            for (const enemy of enemies) {
                if (!enemy.spec || enemy.spec.roleId === 'charger') continue;
                enemy._combatSlot = getCampaignEnemyCombatSlotV37(
                    enemyCombatSlotRegistryV38,
                    enemy.runtimeId,
                );
            }
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.mesh.isDisposed()) { enemies.splice(i, 1); continue; }

            e.visual?.tick(frameFactor * (1000 / 60));
            let parityHandled = false;
            if (dungeonParityV38 && e.spec) {
                parityHandled = stepDungeonEnemyRuntimeV38(e, now, frameFactor, engine.getDeltaTime());
            }

            if (!parityHandled) {
                e.visual?.setState('move');
                const enemyFrame = frameFactor * enemySpeedFactor(e, now);
                const beforeX = e.mesh.position.x;
                const beforeZ = e.mesh.position.z;
                e.mesh.position.z += e.speed * enemyFrame;
                e.mesh.position.x += Math.sin(tick * 0.025 + e.sineOff) * 0.05 * enemyFrame;
                const facingVelocity = {
                    velocityX: e.mesh.position.x - beforeX,
                    velocityZ: e.mesh.position.z - beforeZ,
                };
                updateDungeonEnemyFacingV38(
                    e,
                    facingVelocity.velocityX,
                    facingVelocity.velocityZ,
                    engine.getDeltaTime(),
                );

                if (e.type !== 'scout' && now - e.lastShoot > e.shootMs) {
                    fireEnemyBullet(e.mesh.position, 0, enemyBulletVelZ);
                    e.visual?.setState('attack');
                    e.lastShoot = now;
                }

                if (e.mesh.position.z > ZOOM + 3) {
                    cleanEnemy(e);
                    enemies.splice(i, 1);
                    damagePlayer({rawDamage:30,source:'environment',damageType:'kinetic'});
                    continue;
                }
            }

            if (e.mesh.intersectsMesh(shipVisual.collider, false)) {
                explode(e.mesh.position, e.spec?.roleId === 'charger' ? 1.35 : .75);
                damagePlayer({
                    rawDamage: e.spec?.weapon?.contactDamage || 150,
                    source: 'contact',
                    damageType: e.spec?.weapon?.bulletType || 'kinetic',
                    contactId: e._contactHitId,
                });
                if (!dungeonParityV38 || e.spec?.roleId === 'charger') {
                    cleanEnemy(e);
                    enemies.splice(i, 1);
                    waveKilled++;
                    continue;
                }
                // Ranged roles never become accidental kamikaze units. Push
                // them back into their authored firing band and keep fighting.
                e.mesh.position.z = Math.min(e.mesh.position.z, playerRoot.position.z - 2.2);
                if (e._choreographyState) e._choreographyState.velocityZ = Math.min(0, e._choreographyState.velocityZ || 0);
            }

            let destroyed = false;
            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const bullet = playerBullets[j];
                if (bullet.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!projectileHitsPoint(bullet, e.mesh.position, 1.5)) continue;
                const hit = shots.registerHit(bullet, e);
                if (!hit.accepted) continue;
                const impact = { x: e.mesh.position.x, z: e.mesh.position.z };
                const damage = calculateProjectileDamage(bullet.atk, stats.critDamageBoost);
                if (bullet._slowMs) e._slowUntil = now + bullet._slowMs;
                destroyed = applyPlayerDamageToEnemy(e, damage);
                if (bullet._splashRadius) applyDungeonSplash(bullet, impact, damage, e);
                if (hit.consumed || bullet._splashRadius) {
                    safeDis(bullet);
                    playerBullets.splice(j, 1);
                }
                if (destroyed) break;
            }
            if (destroyed) continue;
        }

    });

    return scene;
};