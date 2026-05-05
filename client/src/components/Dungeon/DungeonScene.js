import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { AIRCRAFTS, GEAR_CATALOG, PILOTS, DUNGEON_CONFIG } from '../../constants';


//  HELPERS

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const makeMat = (scene, emissive, disableLighting = true) => {
    const m = new BABYLON.StandardMaterial(`mat_${Math.random()}`, scene);
    m.emissiveColor = emissive;
    if (disableLighting) m.disableLighting = true;
    return m;
};


//  MAIN EXPORT
//  Signature updated: engine is now the 3rd argument so we can
//  read actual render dimensions (fixes the canvas.width === 0 bug).

export const createDungeonScene = (scene, canvas, engine, data) => {
    const { gsRef, lang, onGameOver, onVictory } = data;

    // ══════════════════════════════════════════════════════════
    // 1. LOAD CONFIG & STATS
    // ══════════════════════════════════════════════════════════
    const dungeonId     = gsRef.current.selectedDungeonId;
    const dungeonConfig = DUNGEON_CONFIG.find(d => d.id === dungeonId) || DUNGEON_CONFIG[0];
    const { items, loadout } = gsRef.current.campaignData;

    const pilotBase    = PILOTS.find(p => p.id === loadout.pilot)         || PILOTS[0];
    const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft)   || AIRCRAFTS[0];
    const mainGunItem  = items[loadout.mainGun];
    const mainGunBase  = mainGunItem ? GEAR_CATALOG.mainGun.find(g => g.id === mainGunItem.baseId) : null;
    const armorItem    = items[loadout.armor];
    const armorBase    = armorItem ? GEAR_CATALOG.armor.find(g => g.id === armorItem.baseId) : null;

    const getStat = (base, level, rarity, isHp = false) => {
        if (!base) return 0;
        const perLv = Math.max(isHp ? 5 : 1, Math.round(base * 0.1 + (rarity || 1) * (isHp ? 10 : 2)));
        return base + perLv * ((level || 1) - 1);
    };

    const baseHp  = aircraftBase.baseHp  || 1000;
    const baseAtk = aircraftBase.baseAtk || 10;
    const gunAtk  = mainGunBase ? getStat(mainGunBase.baseAtk, mainGunItem && mainGunItem.level, mainGunItem?.rarity) : 0;
    const extraHp = armorBase   ? getStat(armorBase.baseHp,   armorItem?.level,   armorItem?.rarity, true) : 0;
    const atkMult = pilotBase.passive === 'main_damage_boost' ? (1 + (pilotBase.value || 0)) : 1;
    const doubleShot = pilotBase.passive === 'double_shot';

    const stats = {
        maxHp:    Math.floor(baseHp + extraHp),
        hp:       Math.floor(baseHp + extraHp),
        atk:      Math.floor((baseAtk + gunAtk) * atkMult),
        fireRate: mainGunBase?.fireRate ? mainGunBase.fireRate * 1000 : 400,
    };

    // ══════════════════════════════════════════════════════════
    // 2. CAMERA  (BUG FIX: use engine dimensions, not canvas.width)
    // ══════════════════════════════════════════════════════════
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

    // Ambient light – raise intensity so diffuse textures aren't black
    const light = new BABYLON.HemisphericLight('amb', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity    = 1.0;
    light.diffuse      = new BABYLON.Color3(0.7, 0.8, 1.0);
    light.groundColor  = new BABYLON.Color3(0.1, 0.1, 0.2);

    // Background tint from dungeon config
    scene.clearColor = BABYLON.Color4.FromHexString((dungeonConfig.themeColor || '#010a1a') + 'ff');

    // Camera base position for screen-shake maths
    const CAM_BASE = camera.position.clone();

    // ══════════════════════════════════════════════════════════
    // 3. PARALLAX STARFIELD BACKGROUND
    // ══════════════════════════════════════════════════════════
    (() => {
        const r = getAspect();
        const SPAN_X = ZOOM * r * 2.5;
        const SPAN_Z = ZOOM * 2.5;

        const layers = [
            { count: 200, size: 0.07, speed: 0.025, brightness: new BABYLON.Color3(0.4, 0.5, 0.7) },
            { count:  80, size: 0.14, speed: 0.06,  brightness: new BABYLON.Color3(0.7, 0.8, 1.0) },
            { count:  25, size: 0.24, speed: 0.11,  brightness: new BABYLON.Color3(1.0, 1.0, 1.0) },
        ];

        const allLayers = layers.map(({ count, size, speed, brightness }) => {
            const mat = makeMat(scene, brightness);
            const stars = [];
            for (let i = 0; i < count; i++) {
                const s = BABYLON.MeshBuilder.CreateSphere(`star_${i}`, { diameter: size, segments: 3 }, scene);
                s.position.set(
                    (Math.random() - 0.5) * SPAN_X,
                    -0.5,
                    (Math.random() - 0.5) * SPAN_Z
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

    // ══════════════════════════════════════════════════════════
    // 4. HUD
    // ══════════════════════════════════════════════════════════
    const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('HUD');

    // Score (top-left)
    const scoreText = new GUI.TextBlock('score');
    scoreText.text  = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: 0`;
    scoreText.color = '#ffffff';
    scoreText.fontSize = 22;
    scoreText.fontFamily = 'monospace';
    scoreText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    scoreText.textVerticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    scoreText.paddingLeft = '20px';
    scoreText.paddingTop  = '60px';
    ui.addControl(scoreText);

    // Wave (top-center)
    const waveText = new GUI.TextBlock('wave');
    waveText.color = '#ffd700';
    waveText.fontSize = 18;
    waveText.fontFamily = 'monospace';
    waveText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    waveText.textVerticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    waveText.paddingTop = '60px';
    ui.addControl(waveText);

    // HP bar (bottom-right)
    const buildHpBar = () => {
        const panel = new GUI.StackPanel('hpPanel');
        panel.isVertical = true;
        panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        panel.verticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        panel.paddingRight  = '20px';
        panel.paddingBottom = '30px';
        panel.width = '220px';
        ui.addControl(panel);

        const label = new GUI.TextBlock('hpLabel');
        label.text = 'HP';
        label.color = '#00e5ff';
        label.fontSize = 13;
        label.fontFamily = 'monospace';
        label.height = '18px';
        label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        panel.addControl(label);

        const bg = new GUI.Rectangle('hpBg');
        bg.width  = '220px';
        bg.height = '14px';
        bg.background    = '#0a1020';
        bg.color         = '#00e5ff33';
        bg.cornerRadius  = 4;
        bg.thickness     = 1;
        panel.addControl(bg);

        const bar = new GUI.Rectangle('hpBar');
        bar.width  = '100%';
        bar.height = '100%';
        bar.background   = '#00e5ff';
        bar.cornerRadius = 4;
        bar.thickness    = 0;
        bar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        bg.addControl(bar);

        const val = new GUI.TextBlock('hpVal');
        val.text     = `${stats.hp} / ${stats.maxHp}`;
        val.color    = '#8899bb';
        val.fontSize = 11;
        val.fontFamily = 'monospace';
        val.height   = '16px';
        val.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        panel.addControl(val);

        return {
            update: () => {
                const pct = clamp(stats.hp / stats.maxHp, 0, 1);
                bar.width = `${(pct * 100).toFixed(1)}%`;
                if (pct > 0.6)      bar.background = '#00e5ff';
                else if (pct > 0.3) bar.background = '#ffaa00';
                else                bar.background = '#ff3344';
                val.text = `${Math.max(0, stats.hp)} / ${stats.maxHp}`;
            }
        };
    };
    const hpBar = buildHpBar();

    // Boss bar (top-center, hidden until boss spawns)
    const buildBossBar = () => {
        const panel = new GUI.StackPanel('bossPanel');
        panel.isVertical = true;
        panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.verticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        panel.paddingTop = '90px';
        panel.width      = '320px';
        panel.isVisible  = false;
        ui.addControl(panel);

        const label = new GUI.TextBlock('bossLabel');
        label.text = '⚠ BOSS';
        label.color = '#ff4444';
        label.fontSize = 15;
        label.fontFamily = 'monospace';
        label.height = '22px';
        panel.addControl(label);

        const bg = new GUI.Rectangle('bossBg');
        bg.width  = '320px';
        bg.height = '16px';
        bg.background   = '#2a0808';
        bg.color        = '#ff444466';
        bg.cornerRadius = 4;
        bg.thickness    = 1;
        panel.addControl(bg);

        const bar = new GUI.Rectangle('bossBar');
        bar.width  = '100%';
        bar.height = '100%';
        bar.background   = '#ff4444';
        bar.cornerRadius = 4;
        bar.thickness    = 0;
        bar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        bg.addControl(bar);

        return {
            panel,
            show: (name) => {
                label.text      = `⚠ ${name || 'BOSS'}`;
                panel.isVisible = true;
            },
            hide: () => { panel.isVisible = false; },
            update: (pct) => { bar.width = `${clamp(pct * 100, 0, 100).toFixed(1)}%`; }
        };
    };
    const bossBar = buildBossBar();

    // ══════════════════════════════════════════════════════════
    // 5. PLAYER SHIP
    // ══════════════════════════════════════════════════════════
    const playerRoot = new BABYLON.TransformNode('playerRoot', scene);
    playerRoot.position.z = 8;

    const playerPlane = BABYLON.MeshBuilder.CreatePlane('playerPlane', { size: 3.5 }, scene);
    playerPlane.parent     = playerRoot;
    playerPlane.rotation.x = Math.PI / 2;
    playerPlane.rotation.y = 0;   // face forward
    playerPlane.rotation.z = Math.PI;

    const playerMat = new BABYLON.StandardMaterial('playerMat', scene);
    const shipTex   = new BABYLON.Texture(aircraftBase.imgTop || '/images/ships/ship_default_top.png', scene, false, false);
    shipTex.hasAlpha = true;
    playerMat.diffuseTexture           = shipTex;
    playerMat.emissiveColor            = new BABYLON.Color3(0.12, 0.12, 0.12);
    playerMat.useAlphaFromDiffuseTexture = true;
    playerPlane.material = playerMat;

    // Engine glow trail
    const engineFx = new BABYLON.ParticleSystem('engineFx', 120, scene);
    engineFx.particleTexture = new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png', scene);
    engineFx.emitter     = playerRoot;
    engineFx.minEmitBox  = new BABYLON.Vector3(-0.5, 0, -1.6);
    engineFx.maxEmitBox  = new BABYLON.Vector3( 0.5, 0, -1.9);
    engineFx.color1      = new BABYLON.Color4(0.3, 0.6, 1.0, 1.0);
    engineFx.color2      = new BABYLON.Color4(0.1, 0.3, 0.9, 0.8);
    engineFx.colorDead   = new BABYLON.Color4(0, 0, 0.4, 0);
    engineFx.minSize     = 0.08; engineFx.maxSize = 0.32;
    engineFx.minLifeTime = 0.05; engineFx.maxLifeTime = 0.18;
    engineFx.emitRate    = 90;
    engineFx.direction1  = new BABYLON.Vector3(-0.1, 0, -1);
    engineFx.direction2  = new BABYLON.Vector3( 0.1, 0, -1);
    engineFx.minEmitPower = 3; engineFx.maxEmitPower = 6;
    engineFx.updateSpeed  = 0.02;
    engineFx.start();

    // ══════════════════════════════════════════════════════════
    // 6. INPUT (drag-to-move with clamped boundaries)
    // ══════════════════════════════════════════════════════════
    let isDragging = false;
    let dragOrigin = null;

    const getWorldPos = () => {
        const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera);
        const t   = -ray.origin.y / ray.direction.y;
        if (!isFinite(t) || t < 0) return null;
        return ray.origin.add(ray.direction.scale(t));
    };

    const boundX = () => ZOOM * getAspect() - 1.8;

    scene.onPointerObservable.add((pi) => {
        if (gameOver) return;
        const { POINTERDOWN, POINTERUP, POINTERMOVE } = BABYLON.PointerEventTypes;
        if (pi.type === POINTERDOWN) {
            dragOrigin  = getWorldPos();
            isDragging  = !!dragOrigin;
        } else if (pi.type === POINTERUP) {
            isDragging = false; dragOrigin = null;
        } else if (pi.type === POINTERMOVE && isDragging && dragOrigin) {
            const cur = getWorldPos();
            if (!cur) return;
            const diff = cur.subtract(dragOrigin);
            playerRoot.position.addInPlace(diff);
            dragOrigin = cur;

            playerRoot.position.x = clamp(playerRoot.position.x, -boundX(), boundX());
            playerRoot.position.z = clamp(playerRoot.position.z, -ZOOM + 1.8, ZOOM - 1.8);

            playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, diff.x * -5, 0.2);
        }
    });

    // ══════════════════════════════════════════════════════════
    // 7. SHARED MATERIALS
    // ══════════════════════════════════════════════════════════
    const MAT = {
        bullet:      makeMat(scene, new BABYLON.Color3(0, 1, 1)),
        bulletEnemy: makeMat(scene, new BABYLON.Color3(1, 0.3, 0)),
        scout:       makeMat(scene, new BABYLON.Color3(1,  0.2, 0.2)),
        heavy:       makeMat(scene, new BABYLON.Color3(0.8, 0.1, 0.9)),
        elite:       makeMat(scene, new BABYLON.Color3(1,  0.6, 0)),
        boss:        makeMat(scene, new BABYLON.Color3(1,  0.35, 0)),
    };

    // ══════════════════════════════════════════════════════════
    // 8. VFX
    // ══════════════════════════════════════════════════════════
    let shakeFrames = 0, shakeStr = 0;
    const triggerShake = (str = 0.3, frames = 8) => { shakeStr = str; shakeFrames = frames; };

    const explode = (pos, scale = 1) => {
        const ps = new BABYLON.ParticleSystem('exp', Math.ceil(80 * scale), scene);
        ps.particleTexture = new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png', scene);
        ps.emitter    = pos.clone();
        ps.color1     = new BABYLON.Color4(1, 0.8, 0.1, 1);
        ps.color2     = new BABYLON.Color4(1, 0.3, 0, 1);
        ps.colorDead  = new BABYLON.Color4(0.1, 0, 0, 0);
        ps.minSize    = 0.3 * scale; ps.maxSize  = 1.2 * scale;
        ps.minLifeTime = 0.1;        ps.maxLifeTime = 0.4;
        ps.emitRate   = 800;
        ps.createSphereEmitter(0.6 * scale);
        ps.minEmitPower = 3 * scale; ps.maxEmitPower = 8 * scale;
        ps.gravity    = BABYLON.Vector3.Zero();
        ps.targetStopDuration = 0.15;
        ps.disposeOnStop      = true;
        ps.start();
    };

    // ══════════════════════════════════════════════════════════
    // 9. WAVE SYSTEM
    // ══════════════════════════════════════════════════════════
    const MAX_WAVES  = dungeonConfig.waves || 5;
    let currentWave  = 0;
    let waveEnemyCount  = 0;  // total enemies this wave
    let waveSpawned     = 0;  // how many spawned so far
    let waveKilled      = 0;  // how many killed so far
    let spawnInterval   = 1200;
    let enemyBaseHp     = 120;
    let enemyBaseSpeed  = 0.08;
    let waveBossEnabled = false;
    let bossSpawned     = false;
    let bossActive      = false;
    let bossMesh = null;
    let bossHp          = 0, bossMaxHp = 0;
    let waitingForNext  = false; // debounce wave advancement

    const showAnnouncement = (msg, color = '#ffd700') => {
        const t = new GUI.TextBlock(`ann_${Date.now()}`);
        t.text = msg;
        t.color = color;
        t.fontSize = 52;
        t.fontFamily = 'monospace';
        t.alpha = 0;
        ui.addControl(t);
        let step = 0;
        const iv = setInterval(() => {
            step += 0.04;
            if      (step < 0.5) t.alpha = step * 2;
            else if (step < 1.5) t.alpha = 1;
            else if (step < 2.0) t.alpha = (2 - step) * 2;
            else { ui.removeControl(t); clearInterval(iv); }
        }, 50);
    };

    const startWave = (n) => {
        currentWave     = n;
        waveEnemyCount  = 6 + n * 4;
        spawnInterval   = Math.max(500, 1300 - n * 80);
        enemyBaseHp     = 120 + n * 45;
        enemyBaseSpeed  = 0.08 + n * 0.012;
        waveBossEnabled = n % 3 === 0;
        bossSpawned     = false;
        bossActive      = false;
        waveSpawned     = 0;
        waveKilled      = 0;
        waitingForNext  = false;
        waveText.text   = `${lang === 'vi' ? 'SÓNG' : 'WAVE'} ${n}/${MAX_WAVES}`;
        lastEnemySpawn  = Date.now();

        const isLast = n === MAX_WAVES;
        showAnnouncement(
            isLast
                ? (lang === 'vi' ? '⚠ SÓNG CUỐI CÙNG ⚠' : '⚠ FINAL WAVE ⚠')
                : `${lang === 'vi' ? 'SÓNG' : 'WAVE'} ${n}`,
            isLast ? '#ff4444' : '#ffd700'
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

    // ══════════════════════════════════════════════════════════
    // 10. BOSS SPAWN
    // ══════════════════════════════════════════════════════════
    const spawnBoss = () => {
        if (bossSpawned) return;
        bossSpawned = true;
        bossActive  = true;
        bossHp      = 3000 + currentWave * 1200;
        bossMaxHp   = bossHp;

        bossMesh = BABYLON.MeshBuilder.CreatePolyhedron('boss', { type: 3, size: 3.2 }, scene);
        bossMesh.position.set(0, 0.5, -ZOOM - 6);
        bossMesh.material = MAT.boss;

        const bossName = lang === 'vi' ? `CHÚA TỂ SÓNG ${currentWave}` : `WAVE ${currentWave} OVERLORD`;
        bossBar.show(bossName);
        showAnnouncement('⚠ BOSS ⚠', '#ff4444');
    };

    // ══════════════════════════════════════════════════════════
    // 11. ENEMY SPAWN
    // ══════════════════════════════════════════════════════════
    const enemies = [];

    const spawnEnemy = () => {
        const r = Math.random();
        const type = r < 0.15 ? 'elite' : r < 0.35 ? 'heavy' : 'scout';

        let mesh;
        switch (type) {
            case 'heavy':
                mesh = BABYLON.MeshBuilder.CreateBox('eH', { width: 2.8, depth: 2.8, height: 0.5 }, scene);
                break;
            case 'elite':
                mesh = BABYLON.MeshBuilder.CreateTorus('eE', { diameter: 2.6, thickness: 0.55, tessellation: 6 }, scene);
                break;
            default:
                mesh = BABYLON.MeshBuilder.CreateSphere('eS', { diameterX: 2.2, diameterZ: 2.2, diameterY: 0.45 }, scene);
        }

        const bx = boundX();
        mesh.position.set((Math.random() - 0.5) * bx * 1.6, 0.2, -ZOOM - 3);
        mesh.material = MAT[type];

        const hpMult  = type === 'heavy' ? 3.0 : type === 'elite' ? 2.0 : 1.0;
        const hp      = Math.floor(enemyBaseHp * hpMult);
        const speed   = enemyBaseSpeed * (type === 'heavy' ? 0.55 : type === 'elite' ? 1.35 : 1.0);
        const shootMs = type === 'heavy' ? 2200 : type === 'elite' ? 1400 : Infinity; // scouts don't shoot

        // Mini HP bar linked to mesh position
        const miniHp = new GUI.Rectangle(`ehp_${mesh.uniqueId}`);
        miniHp.width  = '44px'; miniHp.height = '4px';
        miniHp.background   = '#ff4444';
        miniHp.thickness    = 0;
        miniHp.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        ui.addControl(miniHp);
        miniHp.linkWithMesh(mesh);
        miniHp.linkOffsetY = -28;

        enemies.push({
            mesh, hp, maxHp: hp, type,
            speed, shootMs,
            lastShoot: 0,
            sineOff: Math.random() * Math.PI * 2,
            miniHp,
        });
    };

    // ══════════════════════════════════════════════════════════
    // 12. PROJECTILES
    // ══════════════════════════════════════════════════════════
    const playerBullets = [];
    const enemyBullets  = [];
    let lastFire        = 0;
    let lastEnemySpawn  = 0;

    const fireBullet = (xOff = 0) => {
        const b = BABYLON.MeshBuilder.CreateCylinder('b', { height: 1.2, diameter: 0.15, tessellation: 6 }, scene);
        b.position.set(playerRoot.position.x + xOff, 0, playerRoot.position.z + 1.8);
        b.rotation.x = Math.PI / 2;
        b.material   = MAT.bullet;
        playerBullets.push(b);
    };

    const fireEnemyBullet = (pos, velX = 0, velZ = -0.45) => {
        const b = BABYLON.MeshBuilder.CreateSphere('eb', { diameter: 0.35 }, scene);
        b.position  = pos.clone();
        b.material  = MAT.bulletEnemy;
        b._velX     = velX;
        b._velZ     = velZ;
        enemyBullets.push(b);
    };

    // ══════════════════════════════════════════════════════════
    // 13. GAME STATE
    // ══════════════════════════════════════════════════════════
    let score        = 0;
    let gameOver     = false;
    let invincibleMs = 0;           // timestamp until player is invincible
    const INV_DUR    = 1500;        // ms of invincibility after being hit
    let tick         = 0;

    const updateScore = (delta) => {
        score += delta;
        scoreText.text = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: ${score.toLocaleString()}`;
    };

    const damagePlayer = (dmg) => {
        const now = Date.now();
        if (now < invincibleMs) return;
        stats.hp    -= dmg;
        invincibleMs = now + INV_DUR;
        hpBar.update();
        triggerShake(0.45, 10);
        if (stats.hp <= 0) triggerGameOver();
    };

    const triggerGameOver = () => {
        if (gameOver) return;
        gameOver = true;
        explode(playerRoot.position, 4);
        triggerShake(1.0, 25);
        playerPlane.visibility = 0;
        engineFx.stop();
        setTimeout(() => onGameOver(score), 1800);
    };

    const triggerVictory = () => {
        if (gameOver) return;
        gameOver = true;
        setTimeout(() => onVictory(score), 1000);
    };

    // Kick off wave 1
    setTimeout(() => startWave(1), 800);

    // ══════════════════════════════════════════════════════════
    // 14. MAIN RENDER LOOP
    // ══════════════════════════════════════════════════════════
    scene.onBeforeRenderObservable.add(() => {
        if (gameOver) return;
        const now = Date.now();
        tick++;

        // Screen shake 
        if (shakeFrames > 0) {
            camera.position.x = CAM_BASE.x + (Math.random() - 0.5) * shakeStr;
            camera.position.z = CAM_BASE.z + (Math.random() - 0.5) * shakeStr;
            shakeFrames--;
            if (shakeFrames === 0) {
                camera.position.x = CAM_BASE.x;
                camera.position.z = CAM_BASE.z;
            }
        }

        // Player tilt reset 
        if (!isDragging) {
            playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, 0, 0.08);
        }

        // Invincibility blink 
        if (now < invincibleMs) {
            playerPlane.visibility = Math.sin(now * 0.025) > 0 ? 1 : 0.3;
        } else {
            playerPlane.visibility = 1;
        }

        // A. Player fire 
        if (now - lastFire > stats.fireRate) {
            if (doubleShot) { fireBullet(-0.5); fireBullet(0.5); }
            else             fireBullet(0);
            lastFire = now;
        }

        // ── B. Move player bullets 
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            b.position.z -= 0.9;
            if (b.position.z < -ZOOM - 3) { b.dispose(); playerBullets.splice(i, 1); }
        }

        // C. Spawn enemies 
        if (currentWave > 0 && waveSpawned < waveEnemyCount && now - lastEnemySpawn > spawnInterval) {
            spawnEnemy();
            waveSpawned++;
            lastEnemySpawn = now;
        }

        // Check if we should spawn boss (all normal enemies dead & spawned)
        const allNormalDone = waveSpawned >= waveEnemyCount && enemies.length === 0;
        if (currentWave > 0 && waveBossEnabled && !bossSpawned && allNormalDone) {
            spawnBoss();
        }

        // Check wave cleared (no boss wave)
        if (currentWave > 0 && !waveBossEnabled && allNormalDone && !waitingForNext) {
            advanceWave();
        }

        // D. Boss logic 
        if (bossActive && bossMesh && !bossMesh.isDisposed()) {
            // Drift into view then sweep side to side
            bossMesh.position.z  = BABYLON.Scalar.Lerp(bossMesh.position.z, -ZOOM * 0.45, 0.004);
            bossMesh.position.x  = Math.sin(tick * 0.012) * boundX() * 0.65;
            bossMesh.rotation.y += 0.025;

            // Boss spread fire
            if (now - (bossMesh._lastShoot || 0) > 750) {
                for (let k = -2; k <= 2; k++) {
                    fireEnemyBullet(bossMesh.position, k * 0.18, -0.55);
                }
                bossMesh._lastShoot = now;
            }

            // Player bullets → boss
            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (b.intersectsMesh(bossMesh, false)) {
                    bossHp -= stats.atk;
                    bossBar.update(bossHp / bossMaxHp);
                    b.dispose(); playerBullets.splice(j, 1);
                    if (bossHp <= 0) {
                        explode(bossMesh.position, 3.5);
                        triggerShake(0.9, 22);
                        bossMesh.dispose(); bossMesh = null;
                        bossActive = false;
                        bossBar.hide();
                        updateScore(500 * currentWave);
                        advanceWave();
                    }
                    break;
                }
            }
        }

        // E. Enemy bullets → player
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const eb = enemyBullets[i];
            if (eb.isDisposed()) { enemyBullets.splice(i, 1); continue; }
            eb.position.x += eb._velX;
            eb.position.z += eb._velZ;
            if (eb.position.z < -ZOOM - 3) { eb.dispose(); enemyBullets.splice(i, 1); continue; }

            if (eb.intersectsMesh(playerPlane, false)) {
                damagePlayer(70);
                eb.dispose(); enemyBullets.splice(i, 1);
            }
        }

        // F. Enemies 
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.mesh.isDisposed()) { enemies.splice(i, 1); continue; }

            // Movement: forward + sine drift
            e.mesh.position.z += e.speed;
            e.mesh.position.x += Math.sin(tick * 0.025 + e.sineOff) * 0.05;
            e.mesh.rotation.y += 0.025;

            // Enemy fire
            if (e.type !== 'scout' && now - e.lastShoot > e.shootMs) {
                fireEnemyBullet(e.mesh.position, 0, -0.42);
                e.lastShoot = now;
            }

            // Off-screen → penalty
            if (e.mesh.position.z > ZOOM + 3){
                e.miniHp.dispose(); e.mesh.dispose(); enemies.splice(i, 1);
                damagePlayer(30);
                continue;
            }

            // Ram player  ← THE MAIN BUG FIX
            if (e.mesh.intersectsMesh(playerPlane, false)) {
                explode(e.mesh.position);
                damagePlayer(150);
                e.miniHp.dispose(); e.mesh.dispose(); enemies.splice(i, 1);
                waveKilled++;
                continue;
            }

            // Player bullets → enemy
            let destroyed = false;
            for (let j = playerBullets.length - 1; j >= 0; j--) {
                const b = playerBullets[j];
                if (b.isDisposed()) { playerBullets.splice(j, 1); continue; }
                if (!b.intersectsMesh(e.mesh, false)) continue;

                e.hp -= stats.atk;
                // Update mini bar
                const pct = clamp(e.hp / e.maxHp, 0, 1);
                e.miniHp.width = `${(pct * 44).toFixed(0)}px`;
                if (pct < 0.4) e.miniHp.background = '#ff8800';

                b.dispose(); playerBullets.splice(j, 1);

                if (e.hp <= 0) {
                    const gain = e.type === 'scout' ? 10 : e.type === 'heavy' ? 30 : 60;
                    updateScore(gain);
                    explode(e.mesh.position, e.type === 'heavy' ? 2 : 1);
                    e.miniHp.dispose(); e.mesh.dispose(); enemies.splice(i, 1);
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