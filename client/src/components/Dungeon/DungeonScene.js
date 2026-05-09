import * as BABYLON from '@babylonjs/core';
import * as GUI    from '@babylonjs/gui';
import { AIRCRAFTS, GEAR_CATALOG, PILOTS, DUNGEON_CONFIG } from '../../constants';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const makeMat = (scene, emissive, disableLighting = true) => {
    const m = new BABYLON.StandardMaterial(`mat_${Math.random()}`, scene);
    m.emissiveColor = emissive;
    if (disableLighting) m.disableLighting = true;
    return m;
};

const safeDis = (mesh) => {
    if (mesh && typeof mesh.isDisposed === 'function' && !mesh.isDisposed()) mesh.dispose();
};
const safeDisGui = (ctrl) => { if (ctrl) { try { ctrl.dispose(); } catch (_) {} } };

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export const createDungeonScene = (scene, canvas, engine, data) => {

    const { gsRef, lang, onGameOver, onVictory, onBossDefeated } = data;

    // ══════════════════════════════════════════════════════════════════════════
    // 1. LOAD TRANG BỊ & TÍNH TOÁN STATS CHUẨN RPG TỪ CAMPAIGN
    // ══════════════════════════════════════════════════════════════════════════

    const dungeonId     = gsRef.current.selectedDungeonId;
    const dungeonConfig = DUNGEON_CONFIG.find(d => d.id === dungeonId) || DUNGEON_CONFIG[0];
    const { items, loadout } = gsRef.current.campaignData;

    const pilotBase    = PILOTS.find(p => p.id === loadout.pilot)       || PILOTS[0];
    const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];

    const ownedAircrafts = gsRef.current.campaignData.ownedAircrafts || {};
    const acData = ownedAircrafts[loadout.aircraft];
    const acLevel = (typeof acData === 'object' ? acData.level : 1) || 1;

    const mainGunItem = items?.[loadout.mainGun] ?? null;
    const mainGunBase = mainGunItem ? (GEAR_CATALOG.mainGun?.find(g => g.id === mainGunItem.baseId) ?? null) : null;
    const armorItem   = items?.[loadout.armor] ?? null;
    const armorBase   = armorItem ? (GEAR_CATALOG.armor?.find(g => g.id === armorItem.baseId) ?? null) : null;
    const wingmanItem = items?.[loadout.wingman] ?? null;
    const wingmanBase = wingmanItem ? (GEAR_CATALOG.wingman?.find(g => g.id === wingmanItem.baseId) ?? null) : null;
    const droneItem   = items?.[loadout.drone] ?? null;
    const droneBase   = droneItem ? (GEAR_CATALOG.drone?.find(g => g.id === droneItem.baseId) ?? null) : null;

    const getDynamicStat = (baseStat, level = 1, rarity = 1, isHp = false) => {
        if (!baseStat) return 0;
        const perLv = Math.max(isHp ? 5 : 1, Math.round(baseStat * 0.1 + rarity * (isHp ? 10 : 2)));
        return baseStat + perLv * (level - 1);
    };
    const getFireRate = (baseRate, level) => baseRate ? (baseRate * Math.pow(0.985, (level || 1) - 1)) * 1000 : 400;

    const baseAcHp    = Math.floor((aircraftBase.baseHp || 1000) * (1 + (acLevel - 1) * 0.05));
    const baseAcAtk   = Math.floor((aircraftBase.baseAtk || 10) * (1 + (acLevel - 1) * 0.05));
    const baseAcArmor = Math.floor((aircraftBase.baseArmor || 20) * (1 + (acLevel - 1) * 0.05));

    const gunAtk   = mainGunBase ? getDynamicStat(mainGunBase.baseAtk, mainGunItem?.level, mainGunItem?.rarity) : 0;
    const wingAtk  = wingmanBase ? getDynamicStat(wingmanBase.baseAtk, wingmanItem?.level, wingmanItem?.rarity) : 0;
    const droneAtk = droneBase ? getDynamicStat(droneBase.baseAtk, droneItem?.level, droneItem?.rarity) : 0;
    const extraHp  = armorBase ? getDynamicStat(armorBase.baseHp, armorItem?.level, armorItem?.rarity, true) : 0;

    let mainAtkMult = 1.0, wingRateMult = 1.0, moveSpeedMult = 1.0;
    let dmgReduce = 0, hpRegenRate = 0, dodgeRate = 0, critDamageBoost = 0;

    if (pilotBase.passive) {
        const val = pilotBase.value;
        switch (pilotBase.passive) {
            case 'main_damage_boost': mainAtkMult = 1 + val; break;
            case 'hp_regen':          hpRegenRate = val; break;
            case 'wing_fire_rate':    wingRateMult = 1 - val; break;
            case 'movement_speed':    moveSpeedMult = 1 + val; break;
            case 'damage_reduction':  dmgReduce = val; break;
            case 'dodge_and_crit':    dodgeRate = val.dodge || 0.15; critDamageBoost = val.critDamage || 0.25; break;
        }
    }

    const doubleShot = pilotBase.passive === 'double_shot';

    const stats = {
        maxHp:         Math.floor(baseAcHp + extraHp),
        hp:            Math.floor(baseAcHp + extraHp),
        atk:           Math.floor((baseAcAtk + gunAtk) * mainAtkMult),
        wingAtk:       wingAtk,
        droneAtk:      droneAtk,
        armor:         baseAcArmor,
        speed:         (aircraftBase.speed || 6.0) * moveSpeedMult,
        fireRate:      getFireRate(mainGunBase?.fireRate, mainGunItem?.level),
        wingFireRate:  (wingmanBase?.fireRate || 900) * wingRateMult,
        droneFireRate: droneBase?.fireRate ? (droneBase.fireRate * Math.pow(0.985, (droneItem?.level || 1) - 1)) : 800,
        mainGunId:     mainGunBase?.id || 'gun_laser',
        wingmanId:     wingmanBase?.id || null,
        droneId:       droneBase?.id || null,
        hpRegenRate, dodgeRate, critDamageBoost, dmgReduce
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 2. CAMERA
    // ══════════════════════════════════════════════════════════════════════════

    const ZOOM = 15;
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
    glow.intensity = 0.2;

    const CAM_BASE = camera.position.clone();

    // ══════════════════════════════════════════════════════════════════════════
    // 3. PARALLAX STARFIELD BACKGROUND
    // ══════════════════════════════════════════════════════════════════════════

    (() => {
        const r      = getAspect();
        const SPAN_X = ZOOM * r * 2.5;
        const SPAN_Z = ZOOM * 2.5;

        const layers = [
            { count: 200, size: 0.07, speed: 0.025, brightness: new BABYLON.Color3(0.4, 0.5, 0.7) },
            { count:  80, size: 0.14, speed: 0.060, brightness: new BABYLON.Color3(0.7, 0.8, 1.0) },
            { count:  25, size: 0.24, speed: 0.110, brightness: new BABYLON.Color3(1.0, 1.0, 1.0) },
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
            allLayers.forEach(({ stars, speed, span }) => {
                stars.forEach(s => {
                    s.position.z -= speed;
                    if (s.position.z < -span / 2) s.position.z += span;
                });
            });
        });
    })();

    // ══════════════════════════════════════════════════════════════════════════
    // 4. GUI - ĐÃ KHẮC PHỤC KÍCH THƯỚC (SCALE THEO THIẾT BỊ)
    // ══════════════════════════════════════════════════════════════════════════
    const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('HUD');
    
    // Tự động nhận diện độ nét màn hình (iPhone thường là 2 hoặc 3)
    const dpr = window.devicePixelRatio || 1;

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
    scoreText.left = `${15 * dpr}px`; 
    scoreText.top = `${10 * dpr}px`;
    ui.addControl(scoreText);

    // Sóng
    const waveText = new GUI.TextBlock('waveText');
    waveText.text = '';
    waveText.color = '#f1c40f';
    waveText.fontFamily = '"VT323", monospace';
    waveText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    waveText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    waveText.left = `-${15 * dpr}px`; 
    waveText.top = `${10 * dpr}px`;
    ui.addControl(waveText);

    // Chữ Hệ Thống Giáp
    const hpLabel = new GUI.TextBlock('hpLabel');
    hpLabel.text = lang === 'vi' ? 'HỆ THỐNG GIÁP' : 'ARMOR SYSTEM';
    hpLabel.color = '#ffffff';
    hpLabel.fontFamily = '"VT323", monospace';
    hpLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    ui.addControl(hpLabel);

    const drawHudSvg = () => {
        const w = engine.getRenderWidth() || 1000;
        const cssW = w / dpr; // Tính toán chiều rộng thực tế CSS
        const cx = w / 2;
        const h1 = 35 * dpr; const h2 = 65 * dpr;
        const dx1 = 90 * dpr; const dx2 = 70 * dpr;

        const svgHex = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h2}" viewBox="0 0 ${w} ${h2}">
            <polygon points="0,0 ${w},0 ${w},${h1} ${cx + dx1},${h1} ${cx + dx2},${h2} ${cx - dx2},${h2} ${cx - dx1},${h1} 0,${h1}" fill="rgba(5,11,20,0.85)"/>
            <polyline points="0,${h1} ${cx - dx1},${h1} ${cx - dx2},${h2} ${cx + dx2},${h2} ${cx + dx1},${h1} ${w},${h1}" fill="none" stroke="rgba(0,229,255,0.6)" stroke-width="${2.5 * dpr}"/>
        </svg>`.replace(/"/g, "'").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E");
        topBar.source = "data:image/svg+xml;utf8," + svgHex;
        topBar.height = `${h2}px`;

        // KHẮC PHỤC LỖI TRÀN CHỮ: Tự động thu nhỏ font trên thiết bị di động y hệt CampaignScene
        const isSmallScreen = cssW < 400;
        scoreText.fontSize = (isSmallScreen ? 18 : 22) * dpr;
        waveText.fontSize  = (isSmallScreen ? 14 : 18) * dpr; // Ép về 16 nếu tên ải dài
        hpLabel.fontSize   = (isSmallScreen ? 12 : 14) * dpr;
        hpLabel.top        = `${(isSmallScreen ? 20 : 22) * dpr}px`;
    };
    drawHudSvg();
    engine.onResizeObservable.add(drawHudSvg);

    // Thanh HP người chơi (10 đoạn)
    const hpBarContainer = new GUI.Rectangle("hpBarContainer");
    hpBarContainer.width = `${120 * dpr}px`; 
    hpBarContainer.height = `${12 * dpr}px`;
    hpBarContainer.background = "rgba(0,0,0,0.8)";
    hpBarContainer.color = "rgba(0,229,255,0.4)";
    hpBarContainer.thickness = 1 * dpr;
    hpBarContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    hpBarContainer.top = `${40 * dpr}px`;
    ui.addControl(hpBarContainer);

    const hpSegments = [];
    for (let i = 0; i < 10; i++) {
        const seg = new GUI.Rectangle(`seg_${i}`);
        seg.width = `${10 * dpr}px`; 
        seg.height = `${8 * dpr}px`;
        seg.background = "#00e5ff"; 
        seg.thickness = 0;
        seg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        seg.left = `${(i * 12 + 1) * dpr}px`;
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
    bossPanel.width = `${300 * dpr}px`;
    bossPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    bossPanel.top = `${80 * dpr}px`;
    bossPanel.isVisible = false;
    ui.addControl(bossPanel);

    const bossNameText = new GUI.TextBlock('bossNameText');
    bossNameText.text = "⚠ BOSS";
    bossNameText.color = "#ff4757";
    bossNameText.fontSize = 20 * dpr;
    bossNameText.fontFamily = '"VT323", monospace';
    bossNameText.height = `${25 * dpr}px`;
    bossPanel.addControl(bossNameText);

    const bossHpContainer = new GUI.Rectangle("bossHpContainer");
    bossHpContainer.width = "100%"; 
    bossHpContainer.height = `${10 * dpr}px`;
    bossHpContainer.background = "rgba(30,0,0,0.8)";
    bossHpContainer.color = "#ff4757"; 
    bossHpContainer.thickness = 2 * dpr;
    bossPanel.addControl(bossHpContainer);

    const bossHpFill = new GUI.Rectangle("bossHpFill");
    bossHpFill.width = "100%"; bossHpFill.height = "100%";
    bossHpFill.background = "#ff4757"; bossHpFill.thickness = 0;
    bossHpFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bossHpContainer.addControl(bossHpFill);

    // Chữ chạy cảnh báo (Announcement)
    const annPanel = new GUI.Rectangle('annPanel');
    annPanel.width = "100%"; 
    annPanel.height = `${70 * dpr}px`;
    annPanel.background = "rgba(5,11,20,0.92)"; 
    annPanel.color = "rgba(102, 252, 241, 0.5)";
    annPanel.thickness = 2 * dpr; 
    annPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    annPanel.top = "-15%"; 
    annPanel.alpha = 0;
    ui.addControl(annPanel);

    const annText = new GUI.TextBlock('annText');
    annText.color = "#66fcf1"; 
    annText.fontSize = 32 * dpr; 
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
    playerRoot.position.z = 8;

    // --- 5A. TÀU CHÍNH ---
    const playerPlane = BABYLON.MeshBuilder.CreatePlane('playerPlane', { size: 2 }, scene);
    playerPlane.parent     = playerRoot;
    playerPlane.rotation.x = Math.PI / 2;
    playerPlane.rotation.z = Math.PI;

    const playerMat = new BABYLON.StandardMaterial('playerMat', scene);
    const shipTex   = new BABYLON.Texture(aircraftBase.imgTop || '/images/ships/ship_default_top.png', scene, false, false);
    shipTex.hasAlpha               = true;
    playerMat.diffuseTexture       = shipTex;
    playerMat.emissiveTexture      = shipTex;   
    playerMat.disableLighting      = true;      
    playerMat.useAlphaFromDiffuseTexture = true;
    playerPlane.material           = playerMat;
    glow.addExcludedMesh(playerPlane);

    // --- 5B. WINGMAN (VŨ KHÍ PHỤ TRÊN 2 CÁNH TÀU) ---
    if (stats.wingmanId && wingmanBase) {
        const wingOffsets = [-1.2, 1.2]; // Tọa độ gắn 2 bên cánh
        wingOffsets.forEach(offsetX => {
            // Tạo Node chứa để gộp Plane và Khối Fallback
            const wNode = new BABYLON.TransformNode('wNode', scene);
            wNode.parent = playerRoot;
            wNode.position.set(offsetX, 0, 0.2);

            // 1. Dựng sẵn Khối Fallback (Ống trụ cam)
            const wFallback = BABYLON.MeshBuilder.CreateCylinder('wingman_fb', { diameter: 0.25, height: 0.8 }, scene);
            wFallback.rotation.x = Math.PI / 2;
            wFallback.material = makeMat(scene, BABYLON.Color3.FromHexString('#ffa502'), true);
            wFallback.parent = wNode;

            if (wingmanBase.imgSrc) {
                // 2. Dựng mặt Plane 2D
                const wPlane = BABYLON.MeshBuilder.CreatePlane('wingman', { size: 1 }, scene);
                wPlane.rotation.x = Math.PI / 2;
                wPlane.rotation.z = Math.PI; 
                wPlane.parent = wNode;

                const wMat = new BABYLON.StandardMaterial('wMat', scene);
                // 3. Load Texture với cơ chế bắt lỗi 404
                const wTex = new BABYLON.Texture(wingmanBase.imgSrc, scene, false, false, undefined, 
                    () => { wFallback.isVisible = false; }, // Thành công: Ẩn cục fallback
                    () => { wPlane.dispose(); }             // Lỗi 404: Xóa mặt phẳng caro lỗi, giữ cục fallback
                );
                wTex.hasAlpha = true;
                wMat.diffuseTexture = wTex;
                wMat.emissiveTexture = wTex;
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

            if (droneBase.imgSrc) {
                // 2. Dựng mặt Plane 2D
                const dPlane = BABYLON.MeshBuilder.CreatePlane('drone', { size: 0.5 }, scene);
                dPlane.rotation.x = Math.PI / 2;
                dPlane.rotation.z = Math.PI;
                dPlane.parent = dNode;

                const dMat = new BABYLON.StandardMaterial('dMat', scene);
                // 3. Load Texture với cơ chế bắt lỗi 404
                const dTex = new BABYLON.Texture(droneBase.imgSrc, scene, false, false, undefined, 
                    () => { dFallback.isVisible = false; }, // Thành công: Ẩn quả cầu fallback
                    () => { dPlane.dispose(); }             // Lỗi 404: Xóa mặt phẳng caro lỗi
                );
                dTex.hasAlpha = true;
                dMat.diffuseTexture = dTex;
                dMat.emissiveTexture = dTex;
                dMat.disableLighting = true;
                dMat.useAlphaFromDiffuseTexture = true;
                dPlane.material = dMat;
                glow.addExcludedMesh(dPlane);
            }
            drones.push(dNode); // Push cái Node chứa vào mảng để vòng lặp cập nhật nó di chuyển
        });
    }
    const engineMount = new BABYLON.TransformNode('engineMount', scene);
    engineMount.parent = playerRoot;
    engineMount.position.set(0, 0, 1.9);

    const flameTintHex = aircraftBase.engineFlameTint ? '#' + aircraftBase.engineFlameTint.toString(16).padStart(6, '0') : '#38bdf8';
    const flameR = parseInt(flameTintHex.slice(1, 3), 16) / 255;
    const flameG = parseInt(flameTintHex.slice(3, 5), 16) / 255;
    const flameB = parseInt(flameTintHex.slice(5, 7), 16) / 255;
    const flameScale = aircraftBase.engineFlameScale || 1.0;

    const engineFx = new BABYLON.ParticleSystem('engineFx', 160, scene);
    engineFx.particleTexture = new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png', scene);
    engineFx.emitter      = engineMount;
    engineFx.minEmitBox   = new BABYLON.Vector3(-0.12 * flameScale, 0, 0);
    engineFx.maxEmitBox   = new BABYLON.Vector3( 0.12 * flameScale, 0, 0);
    engineFx.color1       = new BABYLON.Color4(Math.min(1, flameR + 0.2), Math.min(1, flameG + 0.2), Math.min(1, flameB + 0.2), 1.0);
    engineFx.color2       = new BABYLON.Color4(flameR * 0.4, flameG * 0.4, flameB * 0.4, 0.9);
    engineFx.colorDead    = new BABYLON.Color4(0, 0, 0.3, 0);
    engineFx.minSize      = 0.12 * flameScale;
    engineFx.maxSize      = 0.45 * flameScale;
    engineFx.minLifeTime  = 0.08;
    engineFx.maxLifeTime  = 0.22;
    engineFx.emitRate     = 120;
    engineFx.direction1   = new BABYLON.Vector3(-0.1, 0.07, 1);
    engineFx.direction2   = new BABYLON.Vector3( 0.1, 0.10, 0.8);
    engineFx.minEmitPower = 4;
    engineFx.maxEmitPower = 8;
    engineFx.updateSpeed  = 0.02;
    engineFx.start();

    // ══════════════════════════════════════════════════════════════════════════
    // 6. INPUT – KÉO ĐỂ DI CHUYỂN
    // ══════════════════════════════════════════════════════════════════════════

    let isDragging = false;
    let dragOrigin = null;

    const getWorldPos = () => {
        const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera);
        const t = -ray.origin.y / ray.direction.y;
        if (!isFinite(t) || t < 0) return null;
        return ray.origin.add(ray.direction.scale(t));
    };

    const boundX = () => ZOOM * getAspect() - 1.8;

    scene.onPointerObservable.add((pi) => {
        if (gameOver) return;
        const { POINTERDOWN, POINTERUP, POINTERMOVE } = BABYLON.PointerEventTypes;

        if (pi.type === POINTERDOWN) {
            dragOrigin = getWorldPos();
            isDragging = !!dragOrigin;
        } else if (pi.type === POINTERUP) {
            isDragging = false;
            dragOrigin = null;
        } else if (pi.type === POINTERMOVE && isDragging && dragOrigin) {
            const cur = getWorldPos();
            if (!cur) return;
            const diff = cur.subtract(dragOrigin);
            playerRoot.position.addInPlace(diff);
            dragOrigin = cur;

            playerRoot.position.x = clamp(playerRoot.position.x, -boundX(), boundX());
            playerRoot.position.z = clamp(playerRoot.position.z, -ZOOM + 1.8, ZOOM - 1.8);

            const targetRoll = BABYLON.Scalar.Clamp(diff.x * -1.5, -0.45, 0.45);
            playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, targetRoll, 0.14);
        }
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
        const ps = new BABYLON.ParticleSystem(`exp_${Date.now()}`, Math.ceil(80 * scale), scene);
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
    let bossHp         = 0;
    let bossMaxHp      = 0;
    let waitingForNext = false;
    let lastEnemySpawn = 0;

    const startWave = (n) => {
        currentWave     = n;
        waveEnemyCount  = 6 + n * 4;
        spawnInterval   = Math.max(650, 1450 - n * 70);
        enemyBaseHp     = 120 + n * 40;
        enemyBaseSpeed  = 0.07 + n * 0.01;
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
            setTimeout(() => startWave(currentWave + 1), 1800);
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 10. BOSS SPAWN
    // ══════════════════════════════════════════════════════════════════════════

    const spawnBoss = () => {
        if (bossSpawned) return;
        bossSpawned = true;
        bossActive  = true;
        bossHp      = 4200 + currentWave * 1600;
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

        mesh.position.set((Math.random() - 0.5) * boundX() * 1.6, 0.2, -ZOOM - 3);
        mesh.material   = MAT[type];
        mesh.rotation.y += Math.random() * Math.PI * 2;

        const hpMult  = type === 'heavy' ? 3.0 : type === 'elite' ? 2.0 : 1.0;
        const hp      = Math.floor(enemyBaseHp * hpMult);
        const speed   = enemyBaseSpeed * (type === 'heavy'  ? 0.55 : type === 'elite'  ? 1.35 : 1.0);
        const shootMs = type === 'heavy'  ? 2200 : type === 'elite'  ? 1400 : Infinity;

        const dpr = window.devicePixelRatio || 1;
        const miniHpBg = new GUI.Rectangle(`ehp_bg_${mesh.uniqueId}`);
        miniHpBg.width     = `${54 * dpr}px`;
        miniHpBg.height    = `${6 * dpr}px`;
        miniHpBg.background   = '#111';
        miniHpBg.color        = '#ffffff40';
        miniHpBg.cornerRadius = 4 * dpr;
        miniHpBg.thickness    = 1 * dpr;
        miniHpBg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        ui.addControl(miniHpBg);
        miniHpBg.linkWithMesh(mesh);
        miniHpBg.linkOffsetY = -34 * dpr;

        const miniHp = new GUI.Rectangle(`ehp_${mesh.uniqueId}`);
        miniHp.width      = '100%';
        miniHp.height     = '100%';
        miniHp.background = type === 'heavy' ? '#ff8a66' : type === 'elite' ? '#ffdd55' : '#66ddff';
        miniHp.thickness  = 0;
        miniHp.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        miniHpBg.addControl(miniHp);

        enemies.push({
            mesh, hp, maxHp: hp, type,
            speed, shootMs,
            lastShoot: 0,
            sineOff: Math.random() * Math.PI * 2,
            miniHp,
            miniHpBg,
        });
    };

    const cleanEnemy = (e) => {
        safeDisGui(e.miniHp);
        safeDisGui(e.miniHpBg);
        safeDis(e.mesh);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 12. ĐẠN
    // ══════════════════════════════════════════════════════════════════════════

    const playerBullets = [];
    const enemyBullets  = [];
    let   lastFire      = 0;
    let   nextWingFire  = 0;
    let   nextDroneFire = 0;

    const fireBullet = (x, z, velX, velZ, atk, colorHex, isHoming = false, target = null) => {
        const b = BABYLON.MeshBuilder.CreateCylinder(`b_${Date.now()}_${Math.random()}`, { height: 1.2, diameter: 0.15, tessellation: 6 }, scene);
        b.position.set(x, 0, z);
        b.rotation.x = Math.PI / 2;
        // Bẻ góc nghiêng của viên đạn nếu súng bắn chéo (spread3)
        if (velX !== 0) b.rotation.z = Math.atan2(velX, -velZ);
        
        b.material = makeMat(scene, BABYLON.Color3.FromHexString(colorHex));
        b.atk = atk;
        b._velX = velX;
        b._velZ = velZ;
        b.isHoming = isHoming;
        b.target = target;
        playerBullets.push(b);
    };

    const fireEnemyBullet = (pos, velX = 0, velZ = 0.45) => {
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
    let gameOver     = false;
    let invincibleMs = 0;
    const INV_DUR    = 1500;   
    let tick         = 0;
    let lastRegenTime = Date.now();

    const updateScore = (delta) => {
        score += delta;
        scoreText.text = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: ${score}`;
    };

    const damagePlayer = (rawDmg) => {
        const now = Date.now();
        if (now < invincibleMs) return;

        // Tính năng NÉ TRÁNH từ chỉ số phi công
        if (stats.dodgeRate > 0 && Math.random() < stats.dodgeRate) {
            showAnnouncement(lang === 'vi' ? 'NÉ TRÁNH!' : 'DODGED!', '#4ade80', 1000);
            return;
        }

        // TÍNH TOÁN GIÁP TỪ PHI CƠ (Armor) - Giống hệt Campaign
        let damage = rawDmg;
        if (stats.armor) damage = Math.floor(damage * (1 - stats.armor / 100));

        // TÍNH TOÁN KỸ NĂNG GIẢM SÁT THƯƠNG TỪ PILOT
        const finalDmg = Math.floor(damage * (1 - stats.dmgReduce));
        
        stats.hp -= finalDmg;
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
        playerPlane.visibility = 0;
        engineFx.stop();
        showAnnouncement(
            lang === 'vi' ? 'THẤT BẠI!' : 'MISSION FAILED!',
            '#ff4757',
            2000,
        );
        setTimeout(() => onGameOver(score), 1800);
    };

    const triggerVictory = () => {
        if (gameOver) return;
        gameOver = true;
        showAnnouncement(
            lang === 'vi' ? 'HOÀN THÀNH\nCHIẾN DỊCH!' : 'CAMPAIGN\nCLEARED!',
            '#2ecc71',
            2000,
        );
        setTimeout(() => onVictory(score), 2800);
    };

    setTimeout(() => { if (!scene.isDisposed) startWave(1); }, 800);

    // ══════════════════════════════════════════════════════════════════════════
    // 14. MAIN RENDER LOOP
    // ══════════════════════════════════════════════════════════════════════════

    scene.onBeforeRenderObservable.add(() => {
        if (gameOver || scene.isDisposed) return;
        const now = Date.now();
        tick++;

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
        if (!isDragging) {
            playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, 0, 0.05);
        }

        // C. Blink khi bất tử 
        if (now < invincibleMs) {
            playerPlane.visibility = Math.sin(now * 0.025) > 0 ? 1 : 0.3;
        } else {
            playerPlane.visibility = 1;
        }

        // B. Di chuyển Vệ tinh (Drones Hovering)
        if (drones.length > 0) {
            const hoverZ = Math.sin(tick * 0.05) * 0.3;
            drones.forEach(d => {
                d.position.x = BABYLON.Scalar.Lerp(d.position.x, playerRoot.position.x + d.offsetX, 0.15);
                d.position.z = BABYLON.Scalar.Lerp(d.position.z, playerRoot.position.z + d.offsetY + hoverZ, 0.15);
            });
        }

        // C. Hồi HP tự động
        if (stats.hpRegenRate > 0 && stats.hp < stats.maxHp) {
            const dt = (now - lastRegenTime) / 1000;
            lastRegenTime = now;
            stats.hp = Math.min(stats.maxHp, stats.hp + stats.maxHp * stats.hpRegenRate * dt);
            updateHpUI();
        }

       // D. Khai Hỏa (Player + Drones + Wingman) - ĐỒNG BỘ THUỘC TÍNH VŨ KHÍ
       const activeEnemies = enemies.filter(e => !e.mesh.isDisposed());
       const lockTarget = activeEnemies.length > 0 ? activeEnemies[Math.floor(Math.random() * activeEnemies.length)] : null;

       if (now - lastFire > stats.fireRate) {
           const mColor = mainGunBase?.color ? '#' + mainGunBase.color.toString(16).padStart(6,'0') : '#00e5ff';
           const pX = playerRoot.position.x; const pZ = playerRoot.position.z + 1.8;
           
           // XỬ LÝ KIỂU BẮN (FIRE PATTERN) TỪ CONSTANTS
           switch (mainGunBase?.firePattern) {
               case 'spread3': // Bắn tỏa 3 tia
                   fireBullet(pX, pZ, 0, -1.0, stats.atk, mColor); // Đạn giữa thẳng
                   fireBullet(pX - 0.4, pZ - 0.1, -0.25, -0.9, stats.atk * 0.88, mColor); // Đạn chéo trái
                   fireBullet(pX + 0.4, pZ - 0.1, 0.25, -0.9, stats.atk * 0.88, mColor); // Đạn chéo phải
                   break;
               case 'homing':  // Đạn tự dẫn đường
                   fireBullet(pX, pZ, 0, -0.8, stats.atk, mColor, true, lockTarget);
                   break;
               default:        // Bắn thẳng cơ bản
                   fireBullet(pX, pZ, 0, -1.1, stats.atk, mColor);
           }
           lastFire = now;
       }

       // Bắn đạn Wingman (Homing từ 2 cánh)
       if (stats.wingmanId && now > nextWingFire) {
           const wColor = wingmanBase?.color ? '#' + wingmanBase.color.toString(16).padStart(6,'0') : '#ffa502';
           fireBullet(playerRoot.position.x - 1.2, playerRoot.position.z + 0.5, 0, -0.8, stats.wingAtk, wColor, true, lockTarget);
           fireBullet(playerRoot.position.x + 1.2, playerRoot.position.z + 0.5, 0, -0.8, stats.wingAtk, wColor, true, lockTarget);
           nextWingFire = now + stats.wingFireRate;
       }

       // Bắn đạn Drone (Ngắm thẳng vào mục tiêu giống hệ Sniper bên Campaign)
       if (stats.droneId && now > nextDroneFire && drones.length > 0) {
           const dColor = droneBase?.color ? '#' + droneBase.color.toString(16).padStart(6,'0') : '#2ecc71';
           drones.forEach(d => {
               let dVx = 0, dVz = -0.9; // Mặc định bắn thẳng nếu không có mục tiêu
               if (lockTarget && lockTarget.mesh && !lockTarget.mesh.isDisposed()) {
                   // Tính vector hướng bay thẳng đến kẻ địch
                   const dx = lockTarget.mesh.position.x - d.position.x;
                   const dz = lockTarget.mesh.position.z - d.position.z;
                   const dist = Math.sqrt(dx*dx + dz*dz);
                   if (dist > 0) { dVx = (dx/dist) * 0.9; dVz = (dz/dist) * 0.9; }
               }
               fireBullet(d.position.x, d.position.z - 0.2, dVx, dVz, stats.droneAtk, dColor, false, null);
           });
           nextDroneFire = now + stats.droneFireRate;
       }

       // E. Di chuyển đạn người chơi (Kết hợp Spread Vector và Homing)
       for (let i = playerBullets.length - 1; i >= 0; i--) {
           const b = playerBullets[i];
           if (b.isDisposed()) { playerBullets.splice(i, 1); continue; }
           
           if (b.isHoming && b.target && b.target.mesh && !b.target.mesh.isDisposed()) {
               const dx = b.target.mesh.position.x - b.position.x;
               const dz = b.target.mesh.position.z - b.position.z;
               const dist = Math.sqrt(dx*dx + dz*dz);
               if (dist > 0.1) {
                   b.position.x += (dx/dist) * 0.6;
                   b.position.z += (dz/dist) * 0.6; 
               } else {
                   b.position.x += b._velX;
                   b.position.z += b._velZ;
               }
           } else {
               // Áp dụng vector cho súng Spread hoặc Sniper Drone
               b.position.x += b._velX;
               b.position.z += b._velZ;
           }

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
            bossMesh.position.z = BABYLON.Scalar.Lerp(bossMesh.position.z, -ZOOM * 0.45, 0.004);
            bossMesh.position.x = Math.sin(tick * 0.012) * boundX() * 0.65;
            bossMesh.rotation.y += 0.025;

            if (now - (bossMesh._lastShoot || 0) > 2000) {
                for (let k = -2; k <= 2; k++) {
                    fireEnemyBullet(bossMesh.position, k * 0.08, 0.35);
                }
                bossMesh._lastShoot = now;
            }

            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!b.intersectsMesh(bossMesh, false)) continue;

                bossHp -= stats.atk;
                bossHpFill.width = `${clamp(bossHp / bossMaxHp, 0, 1) * 100}%`;

                safeDis(b);
                playerBullets.splice(j, 1);

                if (bossHp <= 0) {
                    explode(bossMesh.position, 3.5);
                    triggerShake(0.9, 22);
                    safeDis(bossMesh);
                    bossMesh   = null;
                    bossActive = false;
                    bossPanel.isVisible = false;
                    updateScore(500 * currentWave);
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
            eb.position.x += eb._velX;
            eb.position.z += eb._velZ;
            if (eb.position.z > ZOOM + 3) {
                safeDis(eb);
                enemyBullets.splice(i, 1);
                continue;
            }
            if (eb.intersectsMesh(playerPlane, false)) {
                damagePlayer(70);
                safeDis(eb);
                enemyBullets.splice(i, 1);
            }
        }

        // L. Cập nhật địch 
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.mesh.isDisposed()) { enemies.splice(i, 1); continue; }

            e.mesh.position.z += e.speed;
            e.mesh.position.x += Math.sin(tick * 0.025 + e.sineOff) * 0.05;
            e.mesh.rotation.y += 0.025;

            if (e.type !== 'scout' && now - e.lastShoot > e.shootMs) {
                fireEnemyBullet(e.mesh.position, 0, 0.40);
                e.lastShoot = now;
            }

            if (e.mesh.position.z > ZOOM + 3) {
                cleanEnemy(e);
                enemies.splice(i, 1);
                damagePlayer(30);
                continue;
            }

            if (e.mesh.intersectsMesh(playerPlane, false)) {
                explode(e.mesh.position);
                damagePlayer(150);
                cleanEnemy(e);
                enemies.splice(i, 1);
                waveKilled++;
                continue;
            }

            let destroyed = false;
            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!b.intersectsMesh(e.mesh, false)) continue;
                let dmgToApply = b.atk;
                if (stats.critDamageBoost > 0 && Math.random() < 0.15) dmgToApply *= (1 + stats.critDamageBoost);
                e.hp -= dmgToApply;
                e.hp -= stats.atk;
                const pct = clamp(e.hp / e.maxHp, 0, 1);
                e.miniHp.width = `${(pct * 100).toFixed(0)}%`;
                if (pct < 0.4) {
                    e.miniHp.background = '#ff8800';
                } else if (e.type === 'heavy') {
                    e.miniHp.background = '#ff8a66';
                } else if (e.type === 'elite') {
                    e.miniHp.background = '#ffdd55';
                } else {
                    e.miniHp.background = '#66ddff';
                }

                safeDis(b);
                playerBullets.splice(j, 1);

                if (e.hp <= 0) {
                    const gain = e.type === 'scout' ? 10 : e.type === 'heavy' ? 30 : 60;
                    updateScore(gain);
                    explode(e.mesh.position, e.type === 'heavy' ? 2 : 1);
                    cleanEnemy(e);
                    enemies.splice(i, 1);
                    waveKilled++;
                    destroyed = true;
                    break;
                }
            }
            if (destroyed) continue;
        }
    });

    return scene;
};