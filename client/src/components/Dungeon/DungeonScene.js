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
import { attachBattleEntityVisual } from '../../game/rendering/BattleEntityVisual';
import { createBattleDeathVisualQueue } from '../../game/rendering/BattleDeathVisualQueue';
import { resolveAssetVisual } from '../../game/assets/AssetRegistry.js';
import { createShipEngineFx } from '../../game/rendering/ShipEngineFx';
import { createShipInputController } from '../../game/combat/ShipInputController';
import { describeMainSalvo, describeWingSalvo, describeDroneSalvo, pickWeaponTarget, enemySpeedFactor, shieldDamageFactor, repairAmount, projectileHitsPoint } from '../../game/combat/PlayerWeapons';
import { createProjectileEmitter } from '../../game/combat/ProjectileEmitter';
import { resolveBattleBackground, legacyBattleBackgroundRequested, previewBg4Variant } from '../../game/catalog/BackgroundCatalog';
import { createScrollingBattleBackground } from '../../game/rendering/ScrollingBackgroundRenderer';
import { attachBattleBackgroundProfiler } from '../../game/rendering/BattleBackgroundProfiler.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

    const { gsRef, lang, onGameOver, onVictory, onBossDefeated, isCloud, getRealTime } = data;
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

    const dungeonId     = gsRef.current.selectedDungeonId;
    const dungeonConfig = DUNGEON_CONFIG.find(d => d.id === dungeonId) || DUNGEON_CONFIG[0];
    const DIFF = resolveDungeonDifficulty(dungeonConfig);
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
    light.intensity   = 1.0;
    light.diffuse     = new BABYLON.Color3(0.7, 0.8, 1.0);
    light.groundColor = new BABYLON.Color3(0.1, 0.1, 0.2);

    const hexToColor4 = (hex) => {
        const c = hex.replace('#', '');
        return new BABYLON.Color4(
            parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255, 1,
        );
    };
    scene.clearColor = hexToColor4(dungeonConfig.themeColor || '#010a1a');

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
            { count: Math.max(8,Math.round(200 * quality.starFraction)), size: 0.07, speed: 0.025, brightness: new BABYLON.Color3(0.4, 0.5, 0.7) },
            { count:  Math.max(8,Math.round(80 * quality.starFraction)), size: 0.14, speed: 0.060, brightness: new BABYLON.Color3(0.7, 0.8, 1.0) },
            { count:  Math.max(8,Math.round(25 * quality.starFraction)), size: 0.24, speed: 0.110, brightness: new BABYLON.Color3(1.0, 1.0, 1.0) },
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
    // Keep the load frame dark for readable shots; avoid a bright-cyan flash before the texture is ready.
    if (selectedBackground) scene.clearColor = hexToColor4(selectedBackground.fallbackColor);
    if (selectedBackground) {
        createScrollingBattleBackground({
            BABYLON, scene, engine, config: selectedBackground, qualityId: quality.id || 'mobile',
            worldHalfHeight: ZOOM, baseUrl: import.meta.env?.BASE_URL || '/',
            onFallback: createLegacyStarfield,
        });
    } else createLegacyStarfield();
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

    // Chữ Hệ Thống Giáp
    const hpLabel = new GUI.TextBlock('hpLabel');
    hpLabel.text = lang === 'vi' ? 'HỆ THỐNG GIÁP' : 'ARMOR SYSTEM';
    hpLabel.color = '#ffffff';
    hpLabel.fontFamily = '"VT323", monospace';
    hpLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    ui.addControl(hpLabel);

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
    annPanel.width = "100%"; 
    annPanel.height = `70px`;
    annPanel.background = "rgba(5,11,20,0.92)"; 
    annPanel.color = "rgba(102, 252, 241, 0.5)";
    annPanel.thickness = 2; 
    annPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    annPanel.top = "-15%"; 
    annPanel.alpha = 0;
    ui.addControl(annPanel);

    const annText = new GUI.TextBlock('annText');
    annText.color = "#66fcf1"; 
    annText.fontSize = 32; 
    annText.fontWeight = "bold";
    annText.fontFamily = '"VT323", monospace';
    annPanel.addControl(annText);

    let annAnim = null;
    const showAnnouncement = (text, colorHex = "#66fcf1", duration = 2000) => {
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
    let bossHp         = 0;
    let bossMaxHp      = 0;
    let waitingForNext = false;
    let lastEnemySpawn = 0;

    const startWave = (n) => {
        currentWave     = n;
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
        const waveStr = lang === 'vi' ? `ẢI ${dName} | ĐỢT ${currentWave}/${MAX_WAVES}` : `STAGE ${dName} | WAVE ${currentWave}/${MAX_WAVES}`;
        waveText.text = waveStr;
        
        const isLast = currentWave === MAX_WAVES;
        showAnnouncement(
            isLast ? (lang === 'vi' ? '⚠ LƯỢT CUỐI CÙNG ⚠' : '⚠ FINAL WAVE ⚠') : `${lang === 'vi' ? 'LƯỢT' : 'WAVE'} ${currentWave}`,
            isLast ? '#ff4757' : '#f1c40f'
        );
    };

    const advanceWave = () => {
        if (waitingForNext || gameOver) return;
        waitingForNext = true;
        if (currentWave >= MAX_WAVES) {
            triggerVictory();
        } else {
            scheduleBattleTimer(() => startWave(currentWave + 1), 1800);
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 10. BOSS SPAWN
    // ══════════════════════════════════════════════════════════════════════════

    const spawnBoss = () => {
        if (bossSpawned) return;
        bossSpawned = true;
        bossActive  = true;
        bossHp      = DIFF.bossBase + currentWave * DIFF.bossPerWave;
        bossMaxHp   = bossHp;

        bossMesh = BABYLON.MeshBuilder.CreateSphere('bossCore', { diameter: 2.6, segments: 24 }, scene);
        bossMesh.position.set(0, 0.5, -ZOOM - 6);
        bossMesh.material = MAT.boss;

        const bossRing = BABYLON.MeshBuilder.CreateTorus('bossRing', { diameter: 6.0, thickness: 0.35, tessellation: 64 }, scene);
        bossRing.parent     = bossMesh;
        bossRing.rotation.x = Math.PI / 2;
        bossRing.material   = makeMat(scene, new BABYLON.Color3(1, 0.5, 0), false);

        const bossCore = BABYLON.MeshBuilder.CreateSphere('bossInner', { diameter: 1.1, segments: 16 }, scene);
        bossCore.parent   = bossMesh;
        bossCore.material = makeMat(scene, new BABYLON.Color3(1, 0.85, 0.2), false);
        bossVisual = attachBattleEntityVisual(scene, BABYLON, bossMesh, 'dungeon_boss', `${dungeonId}_boss`);

        const bossName = lang === 'vi' ? `CHÚA TỂ LƯỢT ${currentWave}` : `WAVE ${currentWave} OVERLORD`;
        bossNameText.text = `⚠ ${bossName}`;
        bossHpFill.width = "100%";
        bossPanel.isVisible = true;
        showAnnouncement('⚠ BOSS ⚠', '#ff4757');
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 11. SPAWN ĐỊCH
    // ══════════════════════════════════════════════════════════════════════════

    const enemies = [];

    const spawnEnemy = () => {
        const r    = Math.random();
        const type = r < 0.15 ? 'elite' : r < 0.35 ? 'heavy' : 'scout';

        let mesh;
        switch (type) {
            case 'heavy': {
                mesh = BABYLON.MeshBuilder.CreateBox('eH', { width: 2.8, depth: 2.8, height: 0.7 }, scene);
                mesh.rotation.y = Math.PI / 8;
                const hCore = BABYLON.MeshBuilder.CreateSphere('eH_core', { diameter: 1.0 }, scene);
                hCore.parent   = mesh; hCore.position.y = 0.35; hCore.material = makeMat(scene, new BABYLON.Color3(1, 0.55, 0.25), false);
                const hWing = BABYLON.MeshBuilder.CreateBox('eH_w', { width: 3.6, depth: 0.4, height: 0.28 }, scene);
                hWing.parent     = mesh; hWing.position.y = 0.05; hWing.rotation.y = Math.PI / 4; hWing.material   = makeMat(scene, new BABYLON.Color3(0.9, 0.4, 0.12), false);
                break;
            }
            case 'elite': {
                mesh = BABYLON.MeshBuilder.CreateTorus('eE', { diameter: 2.6, thickness: 0.55, tessellation: 48 }, scene);
                mesh.rotation.x = Math.PI / 2;
                const eCore = BABYLON.MeshBuilder.CreateSphere('eE_core', { diameter: 1.0 }, scene);
                eCore.parent   = mesh; eCore.material = makeMat(scene, new BABYLON.Color3(1, 0.85, 0.2), false);
                break;
            }
            default: { 
                mesh = BABYLON.MeshBuilder.CreateSphere('eS', { diameterX: 2.0, diameterZ: 2.0, diameterY: 0.5 }, scene);
                const sFin = BABYLON.MeshBuilder.CreateCylinder('eS_fin', { diameterTop: 0.05, diameterBottom: 0.05, height: 1.4, tessellation: 8 }, scene);
                sFin.parent   = mesh; sFin.material = makeMat(scene, new BABYLON.Color3(0.4, 0.9, 1.0), false);
                sFin.position.set(0, 0, 0.9); sFin.rotation.x = Math.PI / 2;
                break;
            }
        }

        mesh.position.set((Math.random() - 0.5) * boundX() * 1.6, 0.2, -ZOOM - 2);
        mesh.material   = MAT[type];
        mesh.rotation.y += Math.random() * Math.PI * 2;
        const visual = attachBattleEntityVisual(scene, BABYLON, mesh, 'dungeon_enemy', `${dungeonId}_${type}`);

        const hpMult  = type === 'heavy' ? 3.0 : type === 'elite' ? 2.0 : 1.0;
        const hp      = Math.floor(enemyBaseHp * hpMult);
        const speed   = enemyBaseSpeed * (type === 'heavy'  ? 0.55 : type === 'elite'  ? 1.35 : 1.0);
        const shootMs = type === 'heavy'  ? 2200 : type === 'elite'  ? 1400 : Infinity;

        const miniHpBg = new GUI.Rectangle(`ehp_bg_${mesh.uniqueId}`);
        miniHpBg.width     = `54px`;
        miniHpBg.height    = `6px`;
        miniHpBg.background   = '#111';
        miniHpBg.color        = '#ffffff40';
        miniHpBg.cornerRadius = 4;
        miniHpBg.thickness    = 1;
        miniHpBg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        ui.addControl(miniHpBg);
        miniHpBg.linkWithMesh(mesh);
        miniHpBg.linkOffsetY = -34;

        const miniHp = new GUI.Rectangle(`ehp_${mesh.uniqueId}`);
        miniHp.width      = '100%';
        miniHp.height     = '100%';
        miniHp.background = type === 'heavy' ? '#ff8a66' : type === 'elite' ? '#ffdd55' : '#66ddff';
        miniHp.thickness  = 0;
        miniHp.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        miniHpBg.addControl(miniHp);

        enemies.push({
            mesh, visual, hp, maxHp: hp, type,
            speed, shootMs,
            lastShoot: 0,
            sineOff: Math.random() * Math.PI * 2,
            miniHp,
            miniHpBg,
        });
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

    // ══════════════════════════════════════════════════════════════════════════
    // 12. ĐẠN
    // ══════════════════════════════════════════════════════════════════════════

    const playerBullets = [];
    const enemyBullets  = [];
    let   lastFire      = 0;
    let   nextWingFire  = 0;
    let   nextDroneFire = 0;

    const shots = createProjectileEmitter({ scene, BABYLON, bullets: playerBullets, scheduleBattleTimer });
    const liveTargets = () => [
        ...enemies.filter(e => !e.mesh.isDisposed()),
        ...(bossMesh && !bossMesh.isDisposed() ? [{ mesh: bossMesh }] : []),
    ];
    const fireEnemyBullet = (pos, velX = 0, velZ = enemyBulletVelZ) => {
        const b = BABYLON.MeshBuilder.CreateSphere(`eb_${Date.now()}_${Math.random()}`, { diameter: 0.5 }, scene);
        b.position = pos.clone();
        b.position.y = 0; 
        
        b.material = MAT.bulletEnemy;
        b._velX    = velX;
        b._velZ    = velZ;
        enemyBullets.push(b);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 13. GAME STATE
    // ══════════════════════════════════════════════════════════════════════════

    let score        = 0;
    let totalKills   = 0;
    let enemyBulletVelZ = DIFF.bulletVel;
    let gameOver     = false;
    let invincibleMs = 0;
    const INV_DUR    = 1500;   
    let tick         = 0;


    const updateScore = (delta) => {
        score += delta;
        scoreText.text = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: ${score}`;
    };

    const damagePlayer = (rawDmg, source = 'contact') => {
        rawDmg *= shieldDamageFactor(droneBase);
        const now = Date.now();
        if (now < invincibleMs) return;

        const result = receiveBattleHit(stats, passives, rawDmg, {source, nowMs: now});
        if (result.dodged) {
            showAnnouncement(lang === 'vi' ? 'NÉ TRÁNH!' : 'DODGED!', '#4ade80', 1000);
            return;
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
        invincibleMs = now + INV_DUR;
        triggerShake(0.28, 10);
        updateHpUI();
        if (stats.hp <= 0) triggerGameOver();
    };

    const triggerGameOver = () => {
        if (gameOver) return;
        gameOver = true;
        explode(playerRoot.position, 4);
        triggerShake(0.6, 20);
        shipVisual.setVisibility(0);
        engineFx.stop();
        showAnnouncement(
            lang === 'vi' ? 'THẤT BẠI!' : 'MISSION FAILED!',
            '#ff4757',
            2000,
        );
        scheduleBattleTimer(() => onGameOver({
            score,
            totalKills,
            wavesCleared : Math.max(0, currentWave - 1),
            maxWaves     : MAX_WAVES,
        }), 1800);
    };

    const triggerVictory = () => {
        if (gameOver) return;
        gameOver = true;
        showAnnouncement(
            lang === 'vi' ? 'HOÀN THÀNH\nCHIẾN DỊCH!' : 'CAMPAIGN\nCLEARED!',
            '#2ecc71',
            2000,
        );
        // All guest dungeon rewards are paid only after Result -> Claim.
        // Cloud rewards remain server-authoritative.
        scheduleBattleTimer(() => onVictory({
            score,
            totalKills,
            wavesCleared : currentWave,
            maxWaves     : MAX_WAVES,
        }), 2800);
    };

    scheduleBattleTimer(() => startWave(1), 800);

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

    // ══════════════════════════════════════════════════════════════════════════
    // 14. MAIN RENDER LOOP
    // ══════════════════════════════════════════════════════════════════════════

    scene.onBeforeRenderObservable.add(() => {
        if (gameOver || (typeof scene.isDisposed === 'function' ? scene.isDisposed() : scene.isDisposed)) return;
        const now = Date.now();
        const frameFactor = frameScale(engine.getDeltaTime());
        tick += frameFactor;
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

        // C. Blink khi bất tử 
        if (now < invincibleMs) {
            shipVisual.setVisibility(Math.sin(now * 0.025) > 0 ? 1 : 0.3);
        } else {
            shipVisual.setVisibility(1);
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

        // G. Spawn địch 
        if (currentWave > 0 && waveSpawned < waveEnemyCount && now - lastEnemySpawn > spawnInterval) {
            spawnEnemy();
            waveSpawned++;
            lastEnemySpawn = now;
        }

        // H. Kiểm tra spawn boss 
        const allNormalDone = waveSpawned >= waveEnemyCount && enemies.length === 0;
        if (currentWave > 0 && waveBossEnabled && !bossSpawned && allNormalDone) {
            spawnBoss();
        }

        // I. Kiểm tra wave cleared (không có boss) 
        if (currentWave > 0 && !waveBossEnabled && allNormalDone && !waitingForNext) {
            advanceWave();
        }

        // J. Logic boss 
        if (bossActive && bossMesh && !bossMesh.isDisposed()) {
            bossVisual?.tick(frameFactor * (1000 / 60));
            bossVisual?.setState('move');
            bossMesh.position.z = BABYLON.Scalar.Lerp(bossMesh.position.z, -ZOOM * 0.45, scaledLerpFactor(0.004,frameFactor));
            bossMesh.position.x = Math.sin(tick * 0.012) * boundX() * 0.65;
            bossMesh.rotation.y += 0.025 * frameFactor;

            if (now - (bossMesh._lastShoot || 0) > 2000) {
                bossVisual?.setState('attack');
                for (let k = -2; k <= 2; k++) {
                    fireEnemyBullet(bossMesh.position, k * 0.08, enemyBulletVelZ * 0.85);
                }
                bossMesh._lastShoot = now;
            }

            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!projectileHitsPoint(b, bossMesh.position, 2.8)) continue;
                const hit = shots.registerHit(b, { mesh: bossMesh });
                if (!hit.accepted) continue;

                bossHp -= calculateProjectileDamage(b.atk, stats.critDamageBoost);
                bossVisual?.setState('hit');
                bossHpFill.width = `${clamp(bossHp / bossMaxHp, 0, 1) * 100}%`;

                if (hit.consumed || b._splashRadius) { safeDis(b); playerBullets.splice(j, 1); }

                if (bossHp <= 0) {
                    explode(bossMesh.position, 3.5);
                    triggerShake(0.9, 22);
                    deathVisuals.capture(bossVisual);
                    bossVisual = null;
                    safeDis(bossMesh); // boss hitbox removed without waiting for the clip
                    bossMesh   = null;
                    bossActive = false;
                    bossPanel.isVisible = false;
                    updateScore(500 * currentWave);
                    totalKills++;
                    if (!isCloud) recordGuestEventKill(gsRef.current.campaignData, EVENT_CONFIG, getRealTime?.() ?? Date.now());
                    showAnnouncement(lang === 'vi' ? '✦ BOSS ĐÃ TIÊU DIỆT ✦' : '✦ BOSS DEFEATED ✦', '#f1c40f');
                    if (typeof onBossDefeated === 'function') onBossDefeated();
                    advanceWave();
                }
                break;
            }
        }

        // K. Đạn địch → người chơi 
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const eb = enemyBullets[i];
            if (eb.isDisposed()) { enemyBullets.splice(i, 1); continue; }
            eb.position.x += eb._velX * frameFactor;
            eb.position.z += eb._velZ * frameFactor;
            if (eb.position.z > ZOOM + 3) {
                safeDis(eb);
                enemyBullets.splice(i, 1);
                continue;
            }
            if (eb.intersectsMesh(shipVisual.collider, false)) {
                damagePlayer(70, 'projectile');
                safeDis(eb);
                enemyBullets.splice(i, 1);
            }
        }

        // L. Cập nhật địch 
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.mesh.isDisposed()) { enemies.splice(i, 1); continue; }

            e.visual?.tick(frameFactor * (1000 / 60));
            e.visual?.setState('move');
            const enemyFrame = frameFactor * enemySpeedFactor(e, now);
            e.mesh.position.z += e.speed * enemyFrame;
            e.mesh.position.x += Math.sin(tick * 0.025 + e.sineOff) * 0.05 * enemyFrame;
            e.mesh.rotation.y += 0.025 * frameFactor;

            if (e.type !== 'scout' && now - e.lastShoot > e.shootMs) {
                fireEnemyBullet(e.mesh.position, 0, enemyBulletVelZ);
                e.visual?.setState('attack');
                e.lastShoot = now;
            }

            if (e.mesh.position.z > ZOOM + 3) {
                cleanEnemy(e);
                enemies.splice(i, 1);
                damagePlayer(30);
                continue;
            }

            if (e.mesh.intersectsMesh(shipVisual.collider, false)) {
                explode(e.mesh.position);
                damagePlayer(150);
                cleanEnemy(e);
                enemies.splice(i, 1);
                waveKilled++;
                continue;
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