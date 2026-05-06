/**
 * DungeonScene.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Toàn bộ logic game chạy trong Babylon.js.
 * HUD (score, HP, wave, boss bar) được đẩy lên React qua callbacks.
 * Chỉ giữ lại trong Babylon: mini-HP bar của địch (gắn vào mesh),
 * announcement text (hiệu ứng fade in-canvas), VFX particles.
 *
 * CALLBACKS nhận từ DungeonEngine.jsx:
 *   onGameOver(score)
 *   onVictory(score)
 *   onScoreUpdate(score)          ← cập nhật điểm lên React HUD
 *   onWaveStart(n, maxWave, lang) ← cập nhật wave counter lên React HUD
 *   onHpChange(hp)                ← cập nhật HP bar lên React HUD
 *   onBossSpawn(name, maxHp)      ← hiện boss bar trên React HUD
 *   onBossHpChange(hp)            ← cập nhật boss HP bar trên React HUD
 *   onBossDead()                  ← ẩn boss bar trên React HUD
 *
 * MỞ RỘNG:
 *   - Thêm loại địch: thêm case vào spawnEnemy() + MAT + hpMult/speed/shootMs
 *   - Thêm loại đạn: clone fireBullet(), thay material, điều chỉnh velocity
 *   - Thêm passive pilot: thêm check pilotBase.passive trong phần STATS
 *   - Thêm sóng boss riêng từng dungeon: tuỳ chỉnh spawnBoss() theo dungeonId
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as BABYLON from '@babylonjs/core';
import * as GUI    from '@babylonjs/gui';
import { AIRCRAFTS, GEAR_CATALOG, PILOTS, DUNGEON_CONFIG } from '../../constants';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Kẹp giá trị v trong khoảng [lo, hi] */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Tạo StandardMaterial phát sáng, không bị ảnh hưởng ánh sáng cảnh.
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.Color3} emissive
 * @param {boolean} disableLighting
 */
const makeMat = (scene, emissive, disableLighting = true) => {
    const m = new BABYLON.StandardMaterial(`mat_${Math.random()}`, scene);
    m.emissiveColor = emissive;
    if (disableLighting) m.disableLighting = true;
    return m;
};

/**
 * Safe-dispose: huỷ mesh chỉ khi chưa bị dispose.
 */
// Dùng cho BABYLON.AbstractMesh — có method .isDisposed()
const safeDis = (mesh) => {
    if (mesh && typeof mesh.isDisposed === 'function' && !mesh.isDisposed()) mesh.dispose();
};
// Dùng cho Babylon GUI controls (Rectangle, TextBlock…) — KHÔNG có .isDisposed()
const safeDisGui = (ctrl) => { if (ctrl) { try { ctrl.dispose(); } catch (_) {} } };

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Khởi tạo toàn bộ scene Babylon cho một phó bản.
 *
 * @param {BABYLON.Scene}  scene
 * @param {HTMLCanvasElement} canvas
 * @param {BABYLON.Engine} engine  – dùng getRenderWidth/Height (tránh bug canvas.width === 0)
 * @param {object}         data    – props từ DungeonEngine.jsx
 */
export const createDungeonScene = (scene, canvas, engine, data) => {

    // ── Destructure tất cả callbacks ────────────────────────────────────────
    const {
        gsRef, lang,
        onGameOver,
        onVictory,
        onScoreUpdate,
        onWaveStart,
        onHpChange,
        onBossSpawn,
        onBossHpChange,
        onBossDead,
        onBossDefeated,   // ← thông báo boss bị tiêu diệt (React HUD xử lý)
    } = data;

    // Helper gọi callback an toàn
    const cb = (fn, ...args) => { if (typeof fn === 'function') fn(...args); };

    // ══════════════════════════════════════════════════════════════════════════
    // 1. LOAD CONFIG & TÍNH STATS
    // ══════════════════════════════════════════════════════════════════════════

    const dungeonId     = gsRef.current.selectedDungeonId;
    const dungeonConfig = DUNGEON_CONFIG.find(d => d.id === dungeonId) || DUNGEON_CONFIG[0];
    const { items, loadout } = gsRef.current.campaignData;

    const pilotBase    = PILOTS.find(p => p.id === loadout.pilot)       || PILOTS[0];
    const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];

    const mainGunItem = items?.[loadout.mainGun] ?? null;
    const mainGunBase = mainGunItem
        ? (GEAR_CATALOG.mainGun?.find(g => g.id === mainGunItem.baseId) ?? null)
        : null;

    const armorItem = items?.[loadout.armor] ?? null;
    const armorBase = armorItem
        ? (GEAR_CATALOG.armor?.find(g => g.id === armorItem.baseId) ?? null)
        : null;

    const wingmanItem = items?.[loadout.wingman] ?? null;
    const wingmanBase = wingmanItem
        ? (GEAR_CATALOG.wingman?.find(g => g.id === wingmanItem.baseId) ?? null)
        : null;

    const droneItem = items?.[loadout.drone] ?? null;
    const droneBase = droneItem
        ? (GEAR_CATALOG.drone?.find(g => g.id === droneItem.baseId) ?? null)
        : null;

    /** Tính stat có tính level + rarity */
    const getStat = (base, level = 1, rarity = 1, isHp = false) => {
        if (!base) return 0;
        const perLv = Math.max(
            isHp ? 5 : 1,
            Math.round(base * 0.1 + rarity * (isHp ? 10 : 2))
        );
        return base + perLv * (level - 1);
    };

    const baseHp  = aircraftBase.baseHp  || 1000;
    const baseAtk = aircraftBase.baseAtk || 10;
    const gunAtk  = mainGunBase
        ? getStat(mainGunBase.baseAtk, mainGunItem?.level, mainGunItem?.rarity)
        : 0;
    const extraHp = armorBase
        ? getStat(armorBase.baseHp, armorItem?.level, armorItem?.rarity, true)
        : 0;

    // ── Passive pilots ───────────────────────────────────────────────────────
    const atkMult    = pilotBase.passive === 'main_damage_boost' ? (1 + (pilotBase.value || 0)) : 1;
    const doubleShot = pilotBase.passive === 'double_shot';
    const hpRegen    = pilotBase.passive === 'hp_regen'   ? (pilotBase.value || 0) : 0; // % / giây
    const dmgReduce  = pilotBase.passive === 'damage_reduction' ? (pilotBase.value || 0) : 0;
    const wingFireMult = pilotBase.passive === 'wing_fire_rate' ? (1 + (pilotBase.value || 0)) : 1;

    // ── Bảng chỉ số cuối cùng ────────────────────────────────────────────────
    const stats = {
        maxHp:    Math.floor(baseHp + extraHp),
        hp:       Math.floor(baseHp + extraHp),
        atk:      Math.floor((baseAtk + gunAtk) * atkMult),
        armor:    aircraftBase.baseArmor || 0,
        speed:    aircraftBase.speed     || 6.0,
        fireRate: mainGunBase?.fireRate  ? mainGunBase.fireRate * 1000 : 400,
    };

    // Đẩy stats ban đầu lên React HUD
    cb(onHpChange, stats.hp, stats.maxHp);

    // ══════════════════════════════════════════════════════════════════════════
    // 2. CAMERA  (dùng engine.getRenderWidth/Height thay vì canvas.width)
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

    // Ánh sáng môi trường (diffuse textures không bị tối)
    const light = new BABYLON.HemisphericLight('amb', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity   = 1.0;
    light.diffuse     = new BABYLON.Color3(0.7, 0.8, 1.0);
    light.groundColor = new BABYLON.Color3(0.1, 0.1, 0.2);

    // Màu nền theo dungeon
    const hexToColor4 = (hex) => {
        const c = hex.replace('#', '');
        return new BABYLON.Color4(
            parseInt(c.slice(0, 2), 16) / 255,
            parseInt(c.slice(2, 4), 16) / 255,
            parseInt(c.slice(4, 6), 16) / 255,
            1,
        );
    };
    scene.clearColor = hexToColor4(dungeonConfig.themeColor || '#010a1a');

    const glow = new BABYLON.GlowLayer('glow', scene);
    glow.intensity = 0.2;

    // Camera base cho screen-shake
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
                const s = BABYLON.MeshBuilder.CreateSphere(
                    `star_${i}_${Math.random()}`,
                    { diameter: size, segments: 3 },
                    scene,
                );
                s.position.set(
                    (Math.random() - 0.5) * SPAN_X,
                    -0.5,
                    (Math.random() - 0.5) * SPAN_Z,
                );
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
    // 4. BABYLON GUI (CHỈ CÒN: announcement + mini-HP địch)
    //    Score / HP bar / Wave / Boss bar → đã chuyển sang React HUD
    // ══════════════════════════════════════════════════════════════════════════

    const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('HUD');

    // Announcement được xử lý hoàn toàn bởi React HUD qua callbacks.
    // Babylon GUI chỉ giữ lại mini-HP bar của địch (cần linkWithMesh).

    // ══════════════════════════════════════════════════════════════════════════
    // 5. TÀU NGƯỜI CHƠI
    // ══════════════════════════════════════════════════════════════════════════

    const playerRoot = new BABYLON.TransformNode('playerRoot', scene);
    playerRoot.position.z = 8;

    const playerPlane = BABYLON.MeshBuilder.CreatePlane(
        'playerPlane', { size: 3.5 }, scene,
    );
    playerPlane.parent     = playerRoot;
    playerPlane.rotation.x = Math.PI / 2;
    playerPlane.rotation.z = Math.PI;

    // Texture tàu (dùng imgTop cho góc nhìn top-down)
    const playerMat = new BABYLON.StandardMaterial('playerMat', scene);
    const shipTex   = new BABYLON.Texture(
        aircraftBase.imgTop || '/images/ships/ship_default_top.png',
        scene, false, false,
    );
    shipTex.hasAlpha               = true;
    playerMat.diffuseTexture       = shipTex;
    playerMat.emissiveTexture      = shipTex;   // tránh tàu bị trắng bệch
    playerMat.disableLighting      = true;      // tránh tàu bị trắng bệch
    playerMat.diffuseColor         = new BABYLON.Color3(1, 1, 1);
    playerMat.emissiveColor        = new BABYLON.Color3(0, 0, 0);
    playerMat.specularColor        = new BABYLON.Color3(0, 0, 0);
    playerMat.useAlphaFromDiffuseTexture = true;
    playerPlane.material           = playerMat;
    glow.addExcludedMesh(playerPlane);

    // ── Engine flame (particles) ─────────────────────────────────────────────
    const engineMount = new BABYLON.TransformNode('engineMount', scene);
    engineMount.parent = playerRoot;
    engineMount.position.set(0, 0, 1.9);

    // Màu flame từ engineFlameTint của aircraft
    const flameTintHex = aircraftBase.engineFlameTint
        ? '#' + aircraftBase.engineFlameTint.toString(16).padStart(6, '0')
        : '#38bdf8';
    const flameR = parseInt(flameTintHex.slice(1, 3), 16) / 255;
    const flameG = parseInt(flameTintHex.slice(3, 5), 16) / 255;
    const flameB = parseInt(flameTintHex.slice(5, 7), 16) / 255;
    const flameScale = aircraftBase.engineFlameScale || 1.0;

    const engineFx = new BABYLON.ParticleSystem('engineFx', 160, scene);
    engineFx.particleTexture = new BABYLON.Texture(
        'https://assets.babylonjs.com/textures/flare.png', scene,
    );
    engineFx.emitter      = engineMount;
    engineFx.minEmitBox   = new BABYLON.Vector3(-0.12 * flameScale, 0, 0);
    engineFx.maxEmitBox   = new BABYLON.Vector3( 0.12 * flameScale, 0, 0);
    engineFx.color1       = new BABYLON.Color4(
        Math.min(1, flameR + 0.2), Math.min(1, flameG + 0.2), Math.min(1, flameB + 0.2), 1.0,
    );
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

    // ── Trail (chỉ bật nếu aircraft có trailEnabled) ─────────────────────────
    if (aircraftBase.trailEnabled) {
        const trail = new BABYLON.TrailMesh('trail', playerPlane, scene, 0.08, 20, true);
        const trailMat = makeMat(scene, new BABYLON.Color3(flameR, flameG, flameB));
        trailMat.alpha = 0.25;
        trail.material = trailMat;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. INPUT – KÉO ĐỂ DI CHUYỂN (drag-to-move)
    // ══════════════════════════════════════════════════════════════════════════

    let isDragging = false;
    let dragOrigin = null;

    /** Chuyển tọa độ pointer sang world-space y=0 */
    const getWorldPos = () => {
        const ray = scene.createPickingRay(
            scene.pointerX, scene.pointerY,
            BABYLON.Matrix.Identity(), camera,
        );
        const t = -ray.origin.y / ray.direction.y;
        if (!isFinite(t) || t < 0) return null;
        return ray.origin.add(ray.direction.scale(t));
    };

    /** Biên X tối đa mà tàu được di chuyển */
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

            // Clamp trong màn hình
            playerRoot.position.x = clamp(playerRoot.position.x, -boundX(), boundX());
            playerRoot.position.z = clamp(playerRoot.position.z, -ZOOM + 1.8, ZOOM - 1.8);

            // Nghiêng thân tàu khi lái
            const targetRoll = BABYLON.Scalar.Clamp(diff.x * -0.8, -0.25, 0.25);
            playerPlane.rotation.z = BABYLON.Scalar.Lerp(
                playerPlane.rotation.z, targetRoll, 0.1,
            );
        }
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 7. MATERIALS DÙNG CHUNG
    // ══════════════════════════════════════════════════════════════════════════

    const MAT = {
        bullet:      makeMat(scene, new BABYLON.Color3(0,    1,    1   )),  // cyan
        bulletEnemy: makeMat(scene, new BABYLON.Color3(1,    0.3,  0   )),  // orange
        scout:       makeMat(scene, new BABYLON.Color3(1,    0.2,  0.2 )),  // red
        heavy:       makeMat(scene, new BABYLON.Color3(0.8,  0.1,  0.9 )),  // purple
        elite:       makeMat(scene, new BABYLON.Color3(1,    0.6,  0   )),  // gold
        boss:        makeMat(scene, new BABYLON.Color3(1,    0.35, 0   )),  // boss-orange
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 8. VFX – SCREEN SHAKE + EXPLOSION PARTICLES
    // ══════════════════════════════════════════════════════════════════════════

    let shakeFrames = 0;
    let shakeStr    = 0;
    const triggerShake = (str = 0.2, frames = 8) => {
        shakeStr   = str;
        shakeFrames = frames;
    };

    /**
     * Tạo hiệu ứng nổ particle tại vị trí pos.
     * @param {BABYLON.Vector3} pos
     * @param {number} scale  – hệ số kích thước (mặc định 1)
     */
    const explode = (pos, scale = 1) => {
        const ps = new BABYLON.ParticleSystem(
            `exp_${Date.now()}`, Math.ceil(80 * scale), scene,
        );
        ps.particleTexture     = new BABYLON.Texture(
            'https://assets.babylonjs.com/textures/flare.png', scene,
        );
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
    let waveEnemyCount = 0;   // tổng địch cần spawn trong wave này
    let waveSpawned    = 0;   // đã spawn bao nhiêu
    let waveKilled     = 0;   // đã giết bao nhiêu
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

    /**
     * Bắt đầu wave n.
     * Gọi callback onWaveStart để React HUD cập nhật.
     */
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

        // → React HUD xử lý wave text + announcement
        cb(onWaveStart, n, MAX_WAVES, lang);
    };

    /** Kết thúc wave, chuyển sang wave tiếp hoặc victory */
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

        // Hình dạng boss: sphere + ring + inner core
        bossMesh = BABYLON.MeshBuilder.CreateSphere(
            'bossCore', { diameter: 2.6, segments: 24 }, scene,
        );
        bossMesh.position.set(0, 0.5, -ZOOM - 6);
        bossMesh.material = MAT.boss;

        const bossRing = BABYLON.MeshBuilder.CreateTorus('bossRing', {
            diameter: 6.0, thickness: 0.35, tessellation: 64,
        }, scene);
        bossRing.parent     = bossMesh;
        bossRing.rotation.x = Math.PI / 2;
        bossRing.material   = makeMat(scene, new BABYLON.Color3(1, 0.5, 0), false);

        const bossCore = BABYLON.MeshBuilder.CreateSphere(
            'bossInner', { diameter: 1.1, segments: 16 }, scene,
        );
        bossCore.parent   = bossMesh;
        bossCore.material = makeMat(scene, new BABYLON.Color3(1, 0.85, 0.2), false);

        const bossName = lang === 'vi'
            ? `CHÚA TỂ SÓNG ${currentWave}`
            : `WAVE ${currentWave} OVERLORD`;

        // → React HUD hiện boss bar + announcement
        cb(onBossSpawn, bossName, bossMaxHp);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 11. SPAWN ĐỊCH
    // ══════════════════════════════════════════════════════════════════════════

    const enemies = [];

    /**
     * Spawn một địch ngẫu nhiên (scout 50%, heavy 35%, elite 15%).
     * Mỗi địch có mini HP bar gắn vào mesh (Babylon GUI).
     */
    const spawnEnemy = () => {
        const r    = Math.random();
        const type = r < 0.15 ? 'elite' : r < 0.35 ? 'heavy' : 'scout';

        // ── Hình dạng theo type ──────────────────────────────────────────────
        let mesh;
        switch (type) {
            case 'heavy': {
                mesh = BABYLON.MeshBuilder.CreateBox(
                    'eH', { width: 2.8, depth: 2.8, height: 0.7 }, scene,
                );
                mesh.rotation.y = Math.PI / 8;

                const hCore = BABYLON.MeshBuilder.CreateSphere(
                    'eH_core', { diameter: 1.0 }, scene,
                );
                hCore.parent   = mesh;
                hCore.position.y = 0.35;
                hCore.material = makeMat(scene, new BABYLON.Color3(1, 0.55, 0.25), false);

                const hWing = BABYLON.MeshBuilder.CreateBox(
                    'eH_w', { width: 3.6, depth: 0.4, height: 0.28 }, scene,
                );
                hWing.parent     = mesh;
                hWing.position.y = 0.05;
                hWing.rotation.y = Math.PI / 4;
                hWing.material   = makeMat(scene, new BABYLON.Color3(0.9, 0.4, 0.12), false);
                break;
            }
            case 'elite': {
                mesh = BABYLON.MeshBuilder.CreateTorus(
                    'eE', { diameter: 2.6, thickness: 0.55, tessellation: 48 }, scene,
                );
                mesh.rotation.x = Math.PI / 2;

                const eCore = BABYLON.MeshBuilder.CreateSphere(
                    'eE_core', { diameter: 1.0 }, scene,
                );
                eCore.parent   = mesh;
                eCore.material = makeMat(scene, new BABYLON.Color3(1, 0.85, 0.2), false);
                break;
            }
            default: { // scout
                mesh = BABYLON.MeshBuilder.CreateSphere(
                    'eS', { diameterX: 2.0, diameterZ: 2.0, diameterY: 0.5 }, scene,
                );
                const sFin = BABYLON.MeshBuilder.CreateCylinder(
                    'eS_fin',
                    { diameterTop: 0.05, diameterBottom: 0.05, height: 1.4, tessellation: 8 },
                    scene,
                );
                sFin.parent   = mesh;
                sFin.material = makeMat(scene, new BABYLON.Color3(0.4, 0.9, 1.0), false);
                sFin.position.set(0, 0, 0.9);
                sFin.rotation.x = Math.PI / 2;
                break;
            }
        }

        // ── Vị trí + material ────────────────────────────────────────────────
        mesh.position.set(
            (Math.random() - 0.5) * boundX() * 1.6,
            0.2,
            -ZOOM - 3,
        );
        mesh.material   = MAT[type];
        mesh.rotation.y += Math.random() * Math.PI * 2;

        // ── Chỉ số địch ─────────────────────────────────────────────────────
        const hpMult  = type === 'heavy' ? 3.0 : type === 'elite' ? 2.0 : 1.0;
        const hp      = Math.floor(enemyBaseHp * hpMult);
        const speed   = enemyBaseSpeed * (
            type === 'heavy'  ? 0.55 :
            type === 'elite'  ? 1.35 : 1.0
        );
        const shootMs = type === 'heavy'  ? 2200
                      : type === 'elite'  ? 1400
                      : Infinity;   // scout không bắn

        // ── Mini HP bar (gắn vào mesh, vẫn dùng Babylon GUI) ────────────────
        const miniHpBg = new GUI.Rectangle(`ehp_bg_${mesh.uniqueId}`);
        miniHpBg.width     = '54px';
        miniHpBg.height    = '6px';
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
        miniHp.background = type === 'heavy' ? '#ff8a66'
                          : type === 'elite' ? '#ffdd55'
                          : '#66ddff';
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

    // Hàm dọn dẹp một địch
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

    /**
     * Bắn đạn người chơi.
     * @param {number} xOff – lệch X so với tâm tàu (cho doubleShot)
     */
    const fireBullet = (xOff = 0) => {
        const b = BABYLON.MeshBuilder.CreateCylinder(
            `b_${Date.now()}`,
            { height: 1.2, diameter: 0.15, tessellation: 6 },
            scene,
        );
        b.position.set(playerRoot.position.x + xOff, 0, playerRoot.position.z + 1.8);
        b.rotation.x = Math.PI / 2;
        b.material   = MAT.bullet;
        playerBullets.push(b);
    };

    /**
     * Bắn đạn địch.
     * @param {BABYLON.Vector3} pos   – vị trí xuất phát
     * @param {number} velX           – vận tốc ngang
     * @param {number} velZ           – vận tốc tiến (về phía người chơi)
     */
    const fireEnemyBullet = (pos, velX = 0, velZ = 0.45) => {
        const b = BABYLON.MeshBuilder.CreateSphere(
            `eb_${Date.now()}`, { diameter: 0.5 }, scene,
        );
        b.position = pos.clone();
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
    const INV_DUR    = 1500;   // ms bất tử sau khi bị đánh
    let tick         = 0;

    // HP regen timer (pilot passive)
    let lastRegenTime = Date.now();

    /**
     * Cộng điểm và đẩy lên React HUD.
     */
    const updateScore = (delta) => {
        score += delta;
        cb(onScoreUpdate, score);
    };

    /**
     * Gây sát thương cho người chơi.
     * Có invincibility frame sau mỗi đòn (INV_DUR ms).
     */
    const damagePlayer = (rawDmg) => {
        const now = Date.now();
        if (now < invincibleMs) return;
        const finalDmg = Math.floor(rawDmg * (1 - dmgReduce));
        stats.hp    -= finalDmg;
        invincibleMs = now + INV_DUR;
        triggerShake(0.28, 10);
        cb(onHpChange, stats.hp);
        if (stats.hp <= 0) triggerGameOver();
    };

    /** Kết thúc thua: nổ lớn → callback onGameOver */
    const triggerGameOver = () => {
        if (gameOver) return;
        gameOver = true;
        explode(playerRoot.position, 4);
        triggerShake(0.6, 20);
        playerPlane.visibility = 0;
        engineFx.stop();
        setTimeout(() => onGameOver(score), 1800);
    };

    /** Kết thúc thắng: callback onVictory */
    const triggerVictory = () => {
        if (gameOver) return;
        gameOver = true;
        setTimeout(() => onVictory(score), 1200);
    };

    // Khởi động wave 1 sau 800ms (để scene render xong trước)
    // Khởi động wave 1 — guard chống React StrictMode double-invoke
    setTimeout(() => { if (!scene.isDisposed) startWave(1); }, 800);

    // ══════════════════════════════════════════════════════════════════════════
    // 14. MAIN RENDER LOOP
    // ══════════════════════════════════════════════════════════════════════════

    scene.onBeforeRenderObservable.add(() => {
        if (gameOver || scene.isDisposed) return;
        const now = Date.now();
        tick++;

        // ── A. Screen shake ────────────────────────────────────────────────
        if (shakeFrames > 0) {
            camera.position.x = CAM_BASE.x + (Math.random() - 0.5) * shakeStr;
            camera.position.z = CAM_BASE.z + (Math.random() - 0.5) * shakeStr;
            shakeFrames--;
            if (shakeFrames === 0) {
                camera.position.x = CAM_BASE.x;
                camera.position.z = CAM_BASE.z;
            }
        }

        // ── B. Trả lái tàu về thẳng ───────────────────────────────────────
        if (!isDragging) {
            playerPlane.rotation.z = BABYLON.Scalar.Lerp(
                playerPlane.rotation.z, 0, 0.05,
            );
        }

        // ── C. Blink khi bất tử ───────────────────────────────────────────
        if (now < invincibleMs) {
            playerPlane.visibility = Math.sin(now * 0.025) > 0 ? 1 : 0.3;
        } else {
            playerPlane.visibility = 1;
        }

        // ── D. HP Regen (pilot passive) ───────────────────────────────────
        if (hpRegen > 0 && stats.hp < stats.maxHp) {
            const dt = (now - lastRegenTime) / 1000; // giây
            lastRegenTime = now;
            const gained = stats.maxHp * hpRegen * dt;
            stats.hp = Math.min(stats.maxHp, stats.hp + gained);
            cb(onHpChange, Math.floor(stats.hp));
        }

        // ── E. Bắn đạn người chơi ─────────────────────────────────────────
        if (now - lastFire > stats.fireRate) {
            if (doubleShot) {
                fireBullet(-0.5);
                fireBullet( 0.5);
            } else {
                fireBullet(0);
            }
            lastFire = now;
        }

        // ── F. Di chuyển đạn người chơi ───────────────────────────────────
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            if (b.isDisposed()) { playerBullets.splice(i, 1); continue; }
            b.position.z -= 0.9;
            if (b.position.z < -ZOOM - 3) {
                safeDis(b);
                playerBullets.splice(i, 1);
            }
        }

        // ── G. Spawn địch ─────────────────────────────────────────────────
        if (
            currentWave > 0 &&
            waveSpawned < waveEnemyCount &&
            now - lastEnemySpawn > spawnInterval
        ) {
            spawnEnemy();
            waveSpawned++;
            lastEnemySpawn = now;
        }

        // ── H. Kiểm tra spawn boss ────────────────────────────────────────
        const allNormalDone = waveSpawned >= waveEnemyCount && enemies.length === 0;
        if (currentWave > 0 && waveBossEnabled && !bossSpawned && allNormalDone) {
            spawnBoss();
        }

        // ── I. Kiểm tra wave cleared (không có boss) ──────────────────────
        if (currentWave > 0 && !waveBossEnabled && allNormalDone && !waitingForNext) {
            advanceWave();
        }

        // ── J. Logic boss ─────────────────────────────────────────────────
        if (bossActive && bossMesh && !bossMesh.isDisposed()) {
            // Drift vào màn hình rồi lắc ngang
            bossMesh.position.z = BABYLON.Scalar.Lerp(
                bossMesh.position.z, -ZOOM * 0.45, 0.004,
            );
            bossMesh.position.x = Math.sin(tick * 0.012) * boundX() * 0.65;
            bossMesh.rotation.y += 0.025;

            // Boss bắn spread
            if (now - (bossMesh._lastShoot || 0) > 2000) {
                for (let k = -2; k <= 2; k++) {
                    fireEnemyBullet(bossMesh.position, k * 0.15, 0.7);
                }
                bossMesh._lastShoot = now;
            }

            // Đạn người chơi trúng boss
            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!b.intersectsMesh(bossMesh, false)) continue;

                bossHp -= stats.atk;
                cb(onBossHpChange, bossHp);

                safeDis(b);
                playerBullets.splice(j, 1);

                if (bossHp <= 0) {
                    explode(bossMesh.position, 3.5);
                    triggerShake(0.9, 22);
                    safeDis(bossMesh);
                    bossMesh   = null;
                    bossActive = false;
                    cb(onBossDead);
                    updateScore(500 * currentWave);
                    cb(onBossDefeated);   // React HUD hiện "BOSS DEFEATED"
                    advanceWave();
                }
                break;
            }
        }

        // ── K. Đạn địch → người chơi ──────────────────────────────────────
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

        // ── L. Cập nhật địch ──────────────────────────────────────────────
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.mesh.isDisposed()) { enemies.splice(i, 1); continue; }

            // Di chuyển: tiến về phía người chơi + sine drift
            e.mesh.position.z += e.speed;
            e.mesh.position.x += Math.sin(tick * 0.025 + e.sineOff) * 0.05;
            e.mesh.rotation.y += 0.025;

            // Địch bắn
            if (e.type !== 'scout' && now - e.lastShoot > e.shootMs) {
                fireEnemyBullet(e.mesh.position, 0, 0.40);
                e.lastShoot = now;
            }

            // Ra ngoài màn → phạt HP người chơi
            if (e.mesh.position.z > ZOOM + 3) {
                cleanEnemy(e);
                enemies.splice(i, 1);
                damagePlayer(30);
                continue;
            }

            // Húc thẳng vào người chơi
            if (e.mesh.intersectsMesh(playerPlane, false)) {
                explode(e.mesh.position);
                damagePlayer(150);
                cleanEnemy(e);
                enemies.splice(i, 1);
                waveKilled++;
                continue;
            }

            // Đạn người chơi → địch
            let destroyed = false;
            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!b.intersectsMesh(e.mesh, false)) continue;

                e.hp -= stats.atk;

                // Cập nhật mini HP bar (màu đổi theo ngưỡng)
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
                    const gain = e.type === 'scout' ? 10
                               : e.type === 'heavy' ? 30 : 60;
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