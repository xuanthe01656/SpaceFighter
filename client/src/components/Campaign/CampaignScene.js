import * as BABYLON from '@babylonjs/core';
import * as GUI    from '@babylonjs/gui';
import {
  AIRCRAFTS, GEAR_CATALOG, PILOTS,
  PLANET_CONFIG, STAGE_CONFIG, PLANET_ENEMIES, PLANET_BOSSES,
} from '../../constants';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

  const { gsRef, lang, onVictory, onDefeat, saveUserProfile } = data;

  // ══════════════════════════════════════════════════════════════════════════
  // 1. TÍNH CHỈ SỐ RPG (KHỚP 100% VỚI PHASER VÀ DUNGEON)
  // ══════════════════════════════════════════════════════════════════════════

  const { items, loadout, progress } = gsRef.current.campaignData;
  const currentPlanetId = Number(progress.currentPlanet) || 1;
  const planetConfig    = PLANET_CONFIG[currentPlanetId] || PLANET_CONFIG[1];
  const currentStage    = Number(progress.selectedStage)
    || (progress.planets?.[currentPlanetId]?.highestStage ?? 1);
  const isReplay        = currentStage < (progress.planets?.[currentPlanetId]?.highestStage ?? 1);
  const stageConfig     = STAGE_CONFIG[currentStage] || STAGE_CONFIG[1];

  const pilotBase    = PILOTS.find(p => p.id === loadout.pilot)       || PILOTS[0];
  const aircraftBase = AIRCRAFTS.find(a => a.id === loadout.aircraft) || AIRCRAFTS[0];

  const ownedAircrafts = gsRef.current.campaignData.ownedAircrafts || {};
  const acData  = ownedAircrafts[loadout.aircraft];
  const acLevel = (typeof acData === 'object' ? acData.level : 1) || 1;

  const mainGunItem = items?.[loadout.mainGun]  ?? null;
  const mainGunBase = mainGunItem ? (GEAR_CATALOG.mainGun?.find(g => g.id === mainGunItem.baseId) ?? null) : null;
  const armorItem   = items?.[loadout.armor]    ?? null;
  const armorBase   = armorItem ? (GEAR_CATALOG.armor?.find(g => g.id === armorItem.baseId) ?? null) : null;
  const wingmanItem = items?.[loadout.wingman]  ?? null;
  const wingmanBase = wingmanItem ? (GEAR_CATALOG.wingman?.find(g => g.id === wingmanItem.baseId) ?? null) : null;
  const droneItem   = items?.[loadout.drone]    ?? null;
  const droneBase   = droneItem ? (GEAR_CATALOG.drone?.find(g => g.id === droneItem.baseId) ?? null) : null;

  const getDynamicStat = (base, lv = 1, rar = 1, isHp = false) => {
    if (!base) return 0;
    const perLv = Math.max(isHp ? 5 : 1, Math.round(base * 0.1 + rar * (isHp ? 10 : 2)));
    return base + perLv * (lv - 1);
  };
  const getFireRate = (baseRate, lv) =>
    baseRate ? (baseRate * Math.pow(0.985, (lv || 1) - 1)) * 1000 : 400;

  const baseAcHp    = Math.floor((aircraftBase.baseHp    || 1000) * (1 + (acLevel - 1) * 0.05));
  const baseAcAtk   = Math.floor((aircraftBase.baseAtk   || 10)   * (1 + (acLevel - 1) * 0.05));
  const baseAcArmor = Math.floor((aircraftBase.baseArmor || 20)   * (1 + (acLevel - 1) * 0.05));

  const gunAtk    = mainGunBase ? getDynamicStat(mainGunBase.baseAtk,  mainGunItem?.level,  mainGunItem?.rarity)       : 0;
  const wingAtk   = wingmanBase ? getDynamicStat(wingmanBase.baseAtk,  wingmanItem?.level,  wingmanItem?.rarity)       : 0;
  const droneAtk  = droneBase   ? getDynamicStat(droneBase.baseAtk,    droneItem?.level,    droneItem?.rarity)         : 0;
  const extraHp   = armorBase   ? getDynamicStat(armorBase.baseHp,     armorItem?.level,    armorItem?.rarity, true)   : 0;

  let mainAtkMult = 1.0, wingRateMult = 1.0, moveSpeedMult = 1.0;

  if (pilotBase.passive) {
    const val = pilotBase.value;
    switch (pilotBase.passive) {
      case 'main_damage_boost': mainAtkMult    = 1 + val;             break;
      case 'hp_regen':          /* hpRegenRate    = val; */             break;
      case 'wing_fire_rate':    wingRateMult   = 1 - val;             break;
      case 'movement_speed':    moveSpeedMult  = 1 + val;             break;
      case 'damage_reduction':  /* damageReduc      = val; */             break;
      case 'dodge_and_crit':    /* dodgeRate      = val.dodge ?? 0.15;
                                critDmgBoost   = val.critDamage ?? 0.25; */ break;
    }
  }

  const stats = {
    maxHp:        Math.floor(baseAcHp + extraHp),
    hp:           Math.floor(baseAcHp + extraHp),
    atk:          Math.floor((baseAcAtk + gunAtk) * mainAtkMult),
    wingAtk, droneAtk,
    armor:        baseAcArmor,
    fireRate:     getFireRate(mainGunBase?.fireRate, mainGunItem?.level),
    wingFireRate: 600 * wingRateMult,
    droneFireRate: droneBase?.fireRate
      ? (droneBase.fireRate * Math.pow(0.985, (droneItem?.level || 1) - 1))
      : 800,
    mainGunId: mainGunBase?.id || 'gun_laser',
    wingmanId: wingmanBase?.id || null,
    droneId:   droneBase?.id   || null,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CAMERA ORTHOGRAPHIC TOP-DOWN
  // ══════════════════════════════════════════════════════════════════════════

  const ZOOM      = 15;
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
  glow.intensity = 0.22;

  // ══════════════════════════════════════════════════════════════════════════
  // 3. STARFIELD + SCROLLING GRID (PLANET-THEMED)
  // ══════════════════════════════════════════════════════════════════════════

  (() => {
    const r = getAspect();
    const SX = ZOOM * r * 2.5, SZ = ZOOM * 2.5;

    // Parallax stars – 3 layers
    const layers = [
      { count: 220, size: 0.06, speed: 0.020, bright: new BABYLON.Color3(0.35, 0.45, 0.65) },
      { count:  90, size: 0.13, speed: 0.048, bright: new BABYLON.Color3(0.65, 0.75, 1.00) },
      { count:  28, size: 0.22, speed: 0.095, bright: new BABYLON.Color3(1.00, 1.00, 1.00) },
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
      allLayers.forEach(({ stars, speed, span }) =>
        stars.forEach(s => { s.position.z += speed; if (s.position.z > span / 2) s.position.z -= span; })
      );
      const span = GRID * rowCount;
      gridRows.forEach(m => { m.position.z += 0.038; if (m.position.z > ZOOM + GRID) m.position.z -= span; });
    });
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // 4. GUI
  // ══════════════════════════════════════════════════════════════════════════

  const ui  = GUI.AdvancedDynamicTexture.CreateFullscreenUI('CampaignUI', true, scene);
  const dpr = window.devicePixelRatio || 1;

  // ── SVG HUD top-bar (hexagon shape – planet theme colour) ─────────────────
   const topBar = new GUI.Image('topBar', '');
  topBar.width              = '100%';
  topBar.verticalAlignment  = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  topBar.stretch            = GUI.Image.STRETCH_NONE;
  ui.addControl(topBar);

  // ── Score (left) ──────────────────────────────────────────────────────────
  const scoreText = new GUI.TextBlock('scoreText');
  scoreText.text                    = `${lang === 'vi' ? 'ĐIỂM' : 'SCORE'}: 0`;
  scoreText.color                   = '#00e5ff';
  scoreText.fontFamily              = '"VT323", monospace';
  scoreText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  scoreText.textVerticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  scoreText.left                    = `${15 * dpr}px`;
  scoreText.top                     = `${10 * dpr}px`;
  ui.addControl(scoreText);

  // ── Wave info (right) ─────────────────────────────────────────────────────
  const waveText = new GUI.TextBlock('waveText');
  waveText.text                    = '';
  waveText.color                   = '#f1c40f';
  waveText.fontFamily              = '"VT323", monospace';
  waveText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  waveText.textVerticalAlignment   = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  waveText.left                    = `-${15 * dpr}px`;
  waveText.top                     = `${10 * dpr}px`;
  ui.addControl(waveText);
  // ── HP system label (center) ──────────────────────────────────────────────
  const hpLabel = new GUI.TextBlock('hpLabel');
  hpLabel.text                   = lang === 'vi' ? 'HỆ THỐNG GIÁP' : 'ARMOR SYSTEM';
  hpLabel.color                  = '#ffffff';
  hpLabel.fontFamily             = '"VT323", monospace';
  hpLabel.textVerticalAlignment  = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  ui.addControl(hpLabel);

   // ── Rebuild SVG whenever resolution changes ───────────────────────────────
  const drawHudSvg = () => {
  const w    = engine.getRenderWidth() || 1000;
  const cssW = w / dpr;
  const cx   = w / 2;
  const h1   = 35 * dpr, h2 = 65 * dpr;
  const dx1  = 90 * dpr, dx2 = 70 * dpr;
  const accent = themeHex.replace('#', '%23');   // URL-encode '#'

   const svgStr = [
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h2}' viewBox='0 0 ${w} ${h2}'>`,
      `<polygon points='0,0 ${w},0 ${w},${h1} ${cx+dx1},${h1} ${cx+dx2},${h2} ${cx-dx2},${h2} ${cx-dx1},${h1} 0,${h1}' fill='rgba(5,11,20,0.85)'/>`,
      `<polyline points='0,${h1} ${cx-dx1},${h1} ${cx-dx2},${h2} ${cx+dx2},${h2} ${cx+dx1},${h1} ${w},${h1}' fill='none' stroke='${accent}99' stroke-width='${2.5*dpr}'/>`,
      `</svg>`,
    ].join('');
    topBar.source = 'data:image/svg+xml;utf8,' + svgStr;
    topBar.height = `${h2}px`;

    const isSmall = cssW < 400;
    scoreText.fontSize = (isSmall ? 18 : 22) * dpr;
    waveText.fontSize  = (isSmall ? 14 : 18) * dpr;
    hpLabel.fontSize   = (isSmall ? 12 : 14) * dpr;
    hpLabel.top        = `${(isSmall ? 20 : 22) * dpr}px`;
  };
  drawHudSvg();
  engine.onResizeObservable.add(drawHudSvg);

  // ── HP bar – 10 segmented blocks (same as DungeonScene) ──────────────────
  const hpBarContainer = new GUI.Rectangle('hpBarCon');
  hpBarContainer.width             = `${120 * dpr}px`;
  hpBarContainer.height            = `${12 * dpr}px`;
  hpBarContainer.background        = 'rgba(0,0,0,0.8)';
  hpBarContainer.color             = 'rgba(0,229,255,0.4)';
  hpBarContainer.thickness         = 1 * dpr;
  hpBarContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  hpBarContainer.top               = `${40 * dpr}px`;
  ui.addControl(hpBarContainer);

  const hpSegments = [];
  for (let i = 0; i < 10; i++) {
    const seg = new GUI.Rectangle(`hseg_${i}`);
    seg.width               = `${10 * dpr}px`;
    seg.height              = `${8  * dpr}px`;
    seg.background          = '#00e5ff';
    seg.thickness           = 0;
    seg.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    seg.left                = `${(i * 12 + 1) * dpr}px`;
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
  bossPanel.width             = `${300 * dpr}px`;
  bossPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  bossPanel.top               = `${80 * dpr}px`;
  bossPanel.isVisible         = false;
  ui.addControl(bossPanel);

  const bossNameText = new GUI.TextBlock('bossNameText');
  bossNameText.text       = '⚠ BOSS';
  bossNameText.color      = '#ff4757';
  bossNameText.fontSize   = 20 * dpr;
  bossNameText.fontFamily = '"VT323", monospace';
  bossNameText.height     = `${25 * dpr}px`;
  bossPanel.addControl(bossNameText);

  const bossHpContainer = new GUI.Rectangle('bossHpCon');
  bossHpContainer.width      = '100%';
  bossHpContainer.height     = `${10 * dpr}px`;
  bossHpContainer.background = 'rgba(30,0,0,0.8)';
  bossHpContainer.color      = '#ff4757';
  bossHpContainer.thickness  = 2 * dpr;
  bossPanel.addControl(bossHpContainer);

  const bossHpFill = new GUI.Rectangle('bossHpFill');
  bossHpFill.width               = '100%'; bossHpFill.height = '100%';
  bossHpFill.background          = '#ff4757'; bossHpFill.thickness = 0;
  bossHpFill.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
 bossHpContainer.addControl(bossHpFill);

   // ── Announcement banner (CENTER-based + '-15%', same as DungeonScene) ────
  const annPanel = new GUI.Rectangle('annPanel');
  annPanel.width             = '100%';
  annPanel.height            = `${70 * dpr}px`;
  annPanel.background        = 'rgba(5,11,20,0.92)';
  annPanel.color             = 'rgba(102,252,241,0.5)';
  annPanel.thickness         = 2 * dpr;
  annPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  annPanel.top               = '-15%';
  annPanel.alpha             = 0;
  ui.addControl(annPanel);

  const annText = new GUI.TextBlock('annText');
  annText.color      = '#66fcf1';
  annText.fontSize   = 32 * dpr;
  annText.fontWeight = 'bold';
  annText.fontFamily = '"VT323", monospace';
  annPanel.addControl(annText);

  let annAnim = null;
  const showAnnouncement = (text, colorHex = '#66fcf1', duration = 2000) => {
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
    lbl.fontSize   = 20 * dpr;
    lbl.fontStyle  = 'bold';
    lbl.isPickable = false;
    ui.addControl(lbl);
    lbl.linkWithMesh(dummy);
    lbl.linkOffsetYInPixels = -10 * dpr;

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

  const playerRoot  = new BABYLON.TransformNode('playerRoot', scene);
  playerRoot.position.set(0, 0, ZOOM - 2.5);

  // Sprite plane (2D image, faces camera via rotation)
  const playerPlane = BABYLON.MeshBuilder.CreatePlane('playerPlane', { width: 2.4, height: 2.4 }, scene);
  playerPlane.rotation.x = Math.PI / 2;
  playerPlane.rotation.z = 0;  // Hướng mũi tàu lên trên (về phía -Z)
  playerPlane.parent     = playerRoot;

  const playerMat = makeSpriteMat(
    scene,
    aircraftBase.imgTop || '/images/ships/ship_xwing_top.png',
    null,
    () => {
      // Fallback nếu không load được ảnh: dùng hình học đơn giản
      const fb = BABYLON.MeshBuilder.CreateCylinder('pFb',
        { diameterTop: 0.4, diameterBottom: 2.0, height: 0.4, tessellation: 6 }, scene);
      fb.parent    = playerRoot;
      fb.position.y = 0.2;
      fb.material  = makeMat(scene, new BABYLON.Color3(0.1, 0.85, 1.0));
      playerPlane.isVisible = false;
    },
  );
  playerPlane.material = playerMat;

  // ── Engine flame particles ────────────────────────────────────────────────
  const flameHex   = aircraftBase.engineFlameTint
    ? '#' + aircraftBase.engineFlameTint.toString(16).padStart(6, '0') : '#38bdf8';
  const fR = parseInt(flameHex.slice(1,3),16)/255;
  const fG = parseInt(flameHex.slice(3,5),16)/255;
  const fB = parseInt(flameHex.slice(5,7),16)/255;
  const fS = aircraftBase.engineFlameScale || 1.0;

  const engineMount = new BABYLON.TransformNode('eMnt', scene);
  engineMount.parent   = playerRoot;
  engineMount.position.set(0, 0, 1.1);

  const engineFx = new BABYLON.ParticleSystem('eFx', 160, scene);
  engineFx.particleTexture = new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png', scene);
  engineFx.emitter      = engineMount;
  engineFx.minEmitBox   = new BABYLON.Vector3(-0.12*fS, 0, 0);
  engineFx.maxEmitBox   = new BABYLON.Vector3( 0.12*fS, 0, 0);
  engineFx.color1       = new BABYLON.Color4(Math.min(1,fR+.2), Math.min(1,fG+.2), Math.min(1,fB+.2), 1);
  engineFx.color2       = new BABYLON.Color4(fR*.4, fG*.4, fB*.4, .9);
  engineFx.colorDead    = new BABYLON.Color4(0, 0, .3, 0);
  engineFx.minSize      = 0.12*fS; engineFx.maxSize   = 0.42*fS;
  engineFx.minLifeTime  = 0.08;    engineFx.maxLifeTime = 0.22;
  engineFx.emitRate     = 115;
  engineFx.direction1   = new BABYLON.Vector3(-0.1, 0.07, 1);
  engineFx.direction2   = new BABYLON.Vector3( 0.1, 0.10, 0.8);
  engineFx.minEmitPower = 4; engineFx.maxEmitPower = 8;
  engineFx.updateSpeed  = 0.02;
  engineFx.start();

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

      if (droneBase.imgSrc) {
        const dp = BABYLON.MeshBuilder.CreatePlane('dPlane', { size: 0.9 }, scene);
        dp.rotation.x = Math.PI/2; dp.rotation.z = 0;
        dp.parent     = node;
        dp.material   = makeSpriteMat(scene, droneBase.imgSrc,
          () => { fb.isVisible = false; }, () => { safeDispose(dp); });
      }
      drones.push(node);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. INPUT – DRAG TO MOVE
  // ══════════════════════════════════════════════════════════════════════════

  let isDragging = false, dragOrigin = null;

  const getWorldPos = () => {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera);
    const t   = -ray.origin.y / ray.direction.y;
    if (!isFinite(t) || t < 0) return null;
    return ray.origin.add(ray.direction.scale(t));
  };

  const speedMod = 1 - (planetConfig.speedDebuff || 0);

  scene.onPointerObservable.add(pi => {
    if (gameOver || gameState === 'CLEAR') return;
    const { POINTERDOWN, POINTERUP, POINTERMOVE } = BABYLON.PointerEventTypes;
    if (pi.type === POINTERDOWN) {
      dragOrigin = getWorldPos(); isDragging = !!dragOrigin;
    } else if (pi.type === POINTERUP) {
      isDragging = false; dragOrigin = null;
    } else if (pi.type === POINTERMOVE && isDragging && dragOrigin) {
      const cur = getWorldPos();
      if (!cur) return;
      const d = cur.subtract(dragOrigin);
      playerRoot.position.x = clamp(playerRoot.position.x + d.x * speedMod, -boundX(), boundX());
      playerRoot.position.z = clamp(playerRoot.position.z + d.z * speedMod, -ZOOM + 1.8, ZOOM - 1.8);
      dragOrigin = cur;
      // Roll tilt on X-axis drag
      const targetRoll = clamp(d.x * -1.5, -0.45, 0.45);
      if (!isDragging) {
        playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, 0, .06);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. EXPLOSION FX
  // ══════════════════════════════════════════════════════════════════════════

  const explode = (pos, scale = 1) => {
    const ps = new BABYLON.ParticleSystem('exp', 80, scene);
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

  const gun       = GEAR_CATALOG.mainGun?.find(g => g.id === stats.mainGunId);
  const gunPattern = gun?.firePattern || 'default';
  const gunC       = gun?.color
    ? new BABYLON.Color3(((gun.color>>16)&0xff)/255, ((gun.color>>8)&0xff)/255, (gun.color&0xff)/255)
    : new BABYLON.Color3(0, .9, 1);
  const gunMat    = makeMat(scene, gunC);
  const wingMat   = makeMat(scene, new BABYLON.Color3(.8, .8, 0));
  const droneMat  = makeMat(scene, new BABYLON.Color3(.2, 1, .4));
  const enemyBulMat = makeMat(scene, new BABYLON.Color3(1, .28, .34));

  const fireBullet = (x, z, vx, vz, atk, mat, isHoming = false, target = null) => {
    const b = BABYLON.MeshBuilder.CreateCylinder(
      `pb_${Date.now()}_${Math.random()}`, { height: 1.1, diameter: 0.13, tessellation: 6 }, scene);
    b.position.set(x, 0, z);
    b.rotation.x = Math.PI/2;
    if (vx !== 0) b.rotation.z = Math.atan2(vx, -vz);
    b.material = mat; b.atk = atk; b._vx = vx; b._vz = vz;
    b.isHoming = isHoming; b.target = target;
    playerBullets.push(b);
  };

  const fireEnemyBullet = (pos, vx = 0, vz = 0.24) => {
    const b = BABYLON.MeshBuilder.CreateSphere(`eb_${Date.now()}_${Math.random()}`, { diameter: 0.44 }, scene);
    b.position = pos.clone(); b.position.y = 0;
    b.material = enemyBulMat; b._vx = vx; b._vz = vz;
    enemyBullets.push(b);
  };

  const fireWeapons = () => {
    const x = playerRoot.position.x, z = playerRoot.position.z - 1.2;
    const atk = stats.atk;
    switch (gunPattern) {
      case 'spread3':
        fireBullet(x,      z,     0,      -.58, atk,      gunMat);
        fireBullet(x-.35,  z+.2, -.14,   -.52,  atk*.88, gunMat);
        fireBullet(x+.35,  z+.2,  .14,   -.52,  atk*.88, gunMat);
        break;
      case 'homing': {
        const tgt = enemies.find(e => !e._dead);
        fireBullet(x, z, 0, -.54, atk, gunMat, true, tgt || null);
        break;
      }
      default:
        fireBullet(x, z, 0, -.60, atk, gunMat);
    }
  };

  const fireWingman = () => {
    if (!stats.wingmanId || drones.length === 0) return;
    const alive = enemies.filter(e => !e._dead);
    const tgt   = alive[Math.floor(Math.random() * alive.length)] || null;
    drones.forEach(d => fireBullet(d.position.x, d.position.z - 1.0, 0, -.52, stats.wingAtk, wingMat, true, tgt));
  };

  const fireDrones = () => {
    if (drones.length === 0) return;
    const alive = enemies.filter(e => !e._dead);
    const tgt   = alive[Math.floor(Math.random() * alive.length)] || null;
    drones.forEach(d => {
      let vx = 0, vz = -.68;
      if (tgt) {
        const dx = tgt.mesh.position.x - d.position.x;
        const dz = tgt.mesh.position.z - d.position.z;
        const dn = Math.sqrt(dx*dx + dz*dz) || 1;
        vx = (dx/dn)*.68; vz = (dz/dn)*.68;
      }
      fireBullet(d.position.x, d.position.z-.5, vx, vz, stats.droneAtk, droneMat, !!tgt, tgt);
    });
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
    const spawnZ = playerRoot.position.z - ZOOM - 3;

    let mesh;
    if (cfg.imgSrc) {
      mesh = BABYLON.MeshBuilder.CreatePlane(`ep_${Date.now()}`, { width: 2.2, height: 2.2 }, scene);
      mesh.rotation.x = Math.PI/2;
      mesh.rotation.z = Math.PI; 
      mesh.material   = makeSpriteMat(scene, cfg.imgSrc,
        null,
        () => { safeDispose(mesh); mesh = buildFallbackEnemy(tier); mesh.position.set(spawnX, .2, spawnZ); }
      );
    } else {
      mesh = buildFallbackEnemy(tier);
    }
    mesh.position.set(spawnX, .2, spawnZ);

    const rawSpeed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    const speed    = rawSpeed / 1200;   // pixels/s → Babylon units/frame@60fps

    let baseHp = cfg.baseHp + currentStage * 15 + currentWave * 5;
    baseHp     = Math.floor(baseHp * (planetConfig.enemyHpBuff || 1));
    const pts  = isReplay ? Math.max(1, Math.floor(cfg.score / 2)) : cfg.score;

    // Mini HP bar
    const miniHpBg = new GUI.Rectangle(`ehb_${mesh.uniqueId}`);
    miniHpBg.width = `${Math.round(46*dpr)}px`; miniHpBg.height = `${Math.round(5*dpr)}px`;
    miniHpBg.background = '#111'; miniHpBg.color = '#ffffff30';
    miniHpBg.cornerRadius = 3; miniHpBg.thickness = 1;
    ui.addControl(miniHpBg);
    miniHpBg.linkWithMesh(mesh);
    miniHpBg.linkOffsetYInPixels = -Math.round(28*dpr);

    const miniHp = new GUI.Rectangle(`ehf_${mesh.uniqueId}`);
    miniHp.width = '100%'; miniHp.height = '100%';
    miniHp.background = tier===3?'#ffdd55': tier===2?'#ff8a66':'#66ddff';
    miniHp.thickness = 0; miniHp.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    miniHpBg.addControl(miniHp);

    enemies.push({
      mesh, hp: baseHp, maxHp: baseHp, tier, speed,
      velX: tier===4 ? 0 : (Math.random()-.5)*.05,
      sineOff: Math.random() * Math.PI * 2,
      isBoss: false, isEnraged: false,
      canShoot: tier !== 4 && Math.random() > .5,
      lastShoot: 0, shootMs: tier===3 ? 1400 : 2200,
      points: pts, miniHpBg, miniHp, _dead: false,
    });
  };

  const cleanEnemy = e => {
    safeDisposeGui(e.miniHp); safeDisposeGui(e.miniHpBg); safeDispose(e.mesh); e._dead = true;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 10. BOSS SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  let bossMesh    = null, bossHp = 0, bossMaxHp = 0;
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

    bossHp    = Math.floor((bossCfg.baseHp || 25000) * (planetConfig.enemyHpBuff || 1));
    bossMaxHp = bossHp; bossEnraged = false;
    bossPts   = isReplay ? Math.max(10, Math.floor((bossCfg.score||100)/3)) : (bossCfg.score||100);

    if (bossCfg.imgSrc) {
      bossMesh = BABYLON.MeshBuilder.CreatePlane('bossPlane', { width: 5.2, height: 5.2 }, scene);
      bossMesh.rotation.x = Math.PI/2; bossMesh.rotation.z = Math.PI;
      bossMesh.material   = makeSpriteMat(scene, bossCfg.imgSrc,
        null, () => { safeDispose(bossMesh); bossMesh = buildFallbackBoss(bType); bossMesh.position.set(0, .5, -ZOOM-6); });
    } else {
      bossMesh = buildFallbackBoss(bType);
    }
    bossMesh.position.set(0, .5, -ZOOM - 6);

    bossNameText.text = `⚠ ${lang==='vi' ? `TRÙM ẢI ${currentStage}` : `STAGE ${currentStage} BOSS`}`;
    bossHpFill.width  = '100%'; bossPanel.isVisible = true;
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
  let gameState     = 'TRANSITION';  // PLAYING | BOSS_FIGHT | TRANSITION | GAMEOVER | CLEAR
  let score         = 0;
  let collectedCoins = 0;
  let startTime     = Date.now();
  let invincibleUntil = 0;
  const INV_DUR     = 1500;
  let tick          = 0;

  const updateScore = delta => {
    score += delta;
    scoreText.text = `${lang==='vi'?'ĐIỂM':'SCORE'}: ${score}`;
  };

  const startWave = n => {
    currentWave   = n;
    waveCount     = (stageConfig.baseEnemies||5) + currentWave * 2;
    spawnInterval = Math.max(300, 1500 - (currentStage*100 + currentWave*50));
    waveSpawned   = 0;
    lastSpawn     = Date.now();

    waveText.text = lang==='vi'
      ? `ẢI ${currentStage} | ĐỢT ${n}/${MAX_WAVES}`
      : `STAGE ${currentStage} | WAVE ${n}/${MAX_WAVES}`;

    if (n === MAX_WAVES && stageConfig.hasBoss) {
      showAnnouncement(
        lang==='vi' ? 'CẢNH BÁO:\nTRÙM CUỐI XUẤT HIỆN!' : 'WARNING:\nBOSS APPROACHING!',
        '#ff4757', 3000);
      gameState = 'BOSS_FIGHT';
      setTimeout(() => spawnBoss(), 3500);
      return;
    }
    showAnnouncement(
      `${lang==='vi'?'TIẾN VÀO ĐỢT':'ENTERING WAVE'} ${n}`, '#66fcf1');
    gameState = 'PLAYING';
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 13. PLAYER DAMAGE / DEATH
  // ══════════════════════════════════════════════════════════════════════════

  const damagePlayer = rawDmg => {
    if (Date.now() < invincibleUntil) return;
    invincibleUntil = Date.now() + INV_DUR;
    let dmg = rawDmg;
    if (stats.armor) dmg = Math.floor(dmg * (1 - stats.armor / 100));
    stats.hp = Math.max(0, stats.hp - dmg);
    updateHpBar();
    explode(playerRoot.position, 2);
    shakeCamera();

    if (stats.hp <= 0) {
      gameOver = true; gameState = 'GAMEOVER';
      engineFx.stop(); playerRoot.isVisible = false;
      explode(playerRoot.position, 4);
      showAnnouncement(lang==='vi'?'THẤT BẠI!':'MISSION FAILED!', '#ff0000', 3000);
      setTimeout(() => {
        gsRef.current.coins = (Number(gsRef.current.coins)||0) + score + collectedCoins;
        if (saveUserProfile) saveUserProfile();
        onDefeat();
      }, 4000);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 14. STAGE CLEAR
  // ══════════════════════════════════════════════════════════════════════════

  const stageCleared = () => {
    gameState = 'CLEAR'; engineFx.stop();
    showAnnouncement(lang==='vi'?'HOÀN THÀNH\nCHIẾN DỊCH!':'CAMPAIGN\nCLEARED!', '#2ecc71', 2000);
    setTimeout(() => showRewardSummary(), 2600);
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
    const totalCoins = stageBonus + score + collectedCoins;

    // ── Overlay background ──
    const overlay = new GUI.Rectangle('summaryOverlay');
    overlay.width = '100%'; overlay.height = '100%';
    overlay.background = 'rgba(0,0,0,0)'; overlay.thickness = 0;
    ui.addControl(overlay);

    // ── Panel ──
    const PW = Math.min(engine.getRenderWidth() * 0.90, Math.round(400 * dpr));
    const panel = new GUI.Rectangle('summaryPanel');
    panel.width        = `${PW}px`;
    panel.height       = `${Math.round(540 * dpr)}px`;
    panel.background   = 'rgba(5,11,20,0.97)';
    panel.color        = themeHex;
    panel.thickness    = Math.round(2 * dpr);
    panel.cornerRadius = Math.round(14 * dpr);
    overlay.addControl(panel);

    const stack = new GUI.StackPanel('summaryStack');
    stack.isVertical  = true;
    stack.paddingTop  = `${Math.round(16 * dpr)}px`;
    panel.addControl(stack);

    // Helper: add a text line
    const addTxt = (text, color, fs, pt = 6) => {
      const t = new GUI.TextBlock();
      t.text = text; t.color = color;
      t.fontFamily = '"VT323", monospace'; t.fontSize = Math.round(fs * dpr);
      t.height     = `${Math.round((fs * 1.3 + pt) * dpr)}px`;
      t.paddingTop = `${Math.round(pt * dpr)}px`;
      stack.addControl(t); return t;
    };

    // Helper: add a label + value row
    const addRow = (label, value, vcol = '#00e5ff') => {
      const row = new GUI.StackPanel();
      row.isVertical  = false;
      row.height      = `${Math.round(28 * dpr)}px`;
      row.paddingTop  = `${Math.round(4 * dpr)}px`;
      stack.addControl(row);
      const lbl = new GUI.TextBlock();
      lbl.text = label; lbl.color = '#94a3b8';
      lbl.fontFamily = '"VT323", monospace'; lbl.fontSize = Math.round(17 * dpr);
      lbl.width       = `${Math.round(PW * 0.55)}px`;
      lbl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      lbl.paddingLeft = `${Math.round(22 * dpr)}px`;
      const val = new GUI.TextBlock();
      val.text = value; val.color = vcol;
      val.fontFamily = '"VT323", monospace'; val.fontSize = Math.round(20 * dpr); val.fontStyle = 'bold';
      val.width       = `${Math.round(PW * 0.45)}px`;
      val.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      val.paddingRight = `${Math.round(22 * dpr)}px`;
      row.addControl(lbl); row.addControl(val);
    };

    // Helper: thin divider
    const addDiv = (color = '#00e5ff33') => {
      const d = new GUI.Rectangle();
      d.width      = `${Math.round(PW * 0.88)}px`;
      d.height     = `${Math.round(1.5 * dpr)}px`;
      d.background = color; d.thickness = 0;
      d.paddingTop = `${Math.round(8 * dpr)}px`;
      stack.addControl(d);
    };

    // ── Content ──
    addTxt(lang==='vi'?'BÁO CÁO CHIẾN DỊCH':'MISSION REPORT', '#facc15', 28, 0);

    const starStr = [0,1,2].map(i => stars > i ? '★' : '☆').join(' ');
    addTxt(starStr, '#facc15', 32, 4);

    const cond = (met, label) => addTxt((met?'✅ ':'❌ ') + label, met?'#2ecc71':'#ff4757', 16, 4);
    cond(c1Met, lang==='vi'?'Hoàn thành nhiệm vụ':'Mission Cleared');
    cond(c2Met, lang==='vi'?'Giáp còn lại ≥ 50%':'Armor remaining ≥ 50%');
    cond(c3Met, lang==='vi'?`Thời gian ≤ ${limStr}`:`Clear Time ≤ ${limStr}`);

    addDiv();
    addRow(lang==='vi'?'Thời gian:':'Clear Time:', timeStr, '#fff');
    addRow(lang==='vi'?'Kinh nghiệm:':'EXP Gained:', `+${earnedExp}`, '#00ffcc');
    addRow(lang==='vi'?'Điểm tác chiến:':'Combat Score:', `+${score}`, '#00e5ff');
    addRow(lang==='vi'?'Nhặt được:':'Loot Collected:', `+${collectedCoins}`, '#00e5ff');
    addDiv('#00e5ff55');
    addRow(lang==='vi'?'TỔNG NHẬN:':'TOTAL EARNED:',
      `${totalCoins} ${lang==='vi'?'XU':'COINS'}`, '#facc15');

    // ── Confirm button ──
    const btn = new GUI.Rectangle('btnConfirm');
    btn.width        = `${Math.round(180 * dpr)}px`;
    btn.height       = `${Math.round(46 * dpr)}px`;
    btn.background   = '#00e5ff'; btn.cornerRadius = Math.round(10 * dpr); btn.thickness = 0;
    btn.paddingTop   = `${Math.round(16 * dpr)}px`;
    btn.isPointerBlocker = true;
    const btnTxt = new GUI.TextBlock('btnTxt', lang==='vi'?'XÁC NHẬN':'ACCEPT');
   btnTxt.color = '#000'; btnTxt.fontFamily = '"VT323", monospace';
    btnTxt.fontSize = Math.round(22 * dpr); btnTxt.fontStyle = 'bold';
    btn.addControl(btnTxt); stack.addControl(btn);

    // Fade-in overlay
    let fadeT0 = null;
    const fadeObs = scene.onBeforeRenderObservable.add(() => {
      if (!fadeT0) fadeT0 = performance.now();
      overlay.background = `rgba(0,0,0,${Math.min(.85, (performance.now()-fadeT0)/400)})`;
      if ((performance.now()-fadeT0) >= 400) scene.onBeforeRenderObservable.remove(fadeObs);
    });

    // Confirm click – save progress
    let clicked = false;
    btn.onPointerDownObservable.addOnce(() => {
      if (clicked) return; clicked = true;
      btn.background = '#00b8d4';

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

      if (saveUserProfile) saveUserProfile();
      try {
        localStorage.setItem('astro_guest_campaign', JSON.stringify(gsRef.current.campaignData));
        localStorage.setItem('astro_guest_coins', String(gsRef.current.coins));
      } catch(_) {}

      setTimeout(() => onVictory(), 200);
    });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 16. MAIN GAME LOOP (scene.onBeforeRenderObservable)
  // ══════════════════════════════════════════════════════════════════════════

  // Kick off first wave
  setTimeout(() => startWave(1), 1000);

  scene.onBeforeRenderObservable.add(() => {
    if (gameOver || gameState === 'CLEAR') return;
    const now = Date.now();
    tick++;

    // ── Roll return ──
    playerPlane.rotation.z = BABYLON.Scalar.Lerp(playerPlane.rotation.z, 0, .06);

    // ── Drone hover float ──
    const hoverZ = Math.sin(tick * .04) * .18;
    drones.forEach(d => {
      d.position.x = BABYLON.Scalar.Lerp(d.position.x, playerRoot.position.x + d.offsetX, .22);
      d.position.z = BABYLON.Scalar.Lerp(d.position.z, playerRoot.position.z + d.offsetZ + hoverZ, .22);
    });

    // ── Auto-fire ──
    if (now > lastFire + stats.fireRate)       { fireWeapons();  lastFire      = now; }
    if (stats.wingmanId && now > nextWingFire) { fireWingman();  nextWingFire  = now + stats.wingFireRate; }
    if (stats.droneId   && now > nextDroneFire){ fireDrones();   nextDroneFire = now + stats.droneFireRate; }

    const aspect = getAspect();
    const cullX  = ZOOM * aspect + 3;

    // ── Player bullets ──
    for (let i = playerBullets.length-1; i >= 0; i--) {
      const b = playerBullets[i];
      if (b.isDisposed?.()) { playerBullets.splice(i,1); continue; }

      // Homing steering
      if (b.isHoming && b.target && !b.target._dead && b.target.mesh && !b.target.mesh.isDisposed?.()) {
        const dx = b.target.mesh.position.x - b.position.x;
        const dz = b.target.mesh.position.z - b.position.z;
        const dn = Math.sqrt(dx*dx + dz*dz) || 1;
        b._vx = BABYLON.Scalar.Lerp(b._vx, (dx/dn)*.55, .08);
        b._vz = BABYLON.Scalar.Lerp(b._vz, (dz/dn)*.55, .08);
      }
      b.position.x += b._vx; b.position.z += b._vz;

      if (b.position.z < -ZOOM-3 || b.position.z > ZOOM+3 || Math.abs(b.position.x) > cullX) {
        safeDispose(b); playerBullets.splice(i,1);
      }
    }

    // ── Enemy bullets ──
    for (let i = enemyBullets.length-1; i >= 0; i--) {
      const b = enemyBullets[i];
      if (b.isDisposed?.()) { enemyBullets.splice(i,1); continue; }
      b.position.x += b._vx; b.position.z += b._vz;

      if (b.position.z > ZOOM+3 || b.position.z < -ZOOM-3 || Math.abs(b.position.x) > cullX) {
        safeDispose(b); enemyBullets.splice(i,1); continue;
      }
      const dx = b.position.x - playerRoot.position.x;
      const dz = b.position.z - playerRoot.position.z;
      if (dx*dx + dz*dz < 1.44) {   // hit radius 1.2
        damagePlayer(200); safeDispose(b); enemyBullets.splice(i,1);
      }
    }

    // ── Enemies ──
    for (let i = enemies.length-1; i >= 0; i--) {
      const e = enemies[i];
      if (e._dead) { enemies.splice(i,1); continue; }

      if (!e.canShoot) {
        // Kamikaze / melee – chase player
        const dx = playerRoot.position.x - e.mesh.position.x;
        const dz = playerRoot.position.z - e.mesh.position.z;
        const dn = Math.sqrt(dx*dx + dz*dz) || 1;
        e.mesh.position.x += (dx/dn) * e.speed * 1.2;
        e.mesh.position.z += (dz/dn) * e.speed * 1.2;
      } else {
        // Patrol + shoot
        e.mesh.position.z += e.speed;
        e.mesh.position.x += e.velX + Math.sin(tick * .03 + e.sineOff) * .04;
        const bx = boundX();
        if (e.mesh.position.z > ZOOM * .65 && e.speed > 0) e.speed = -Math.abs(e.speed);
        if (e.mesh.position.z < -ZOOM + 1 && e.speed < 0) e.speed = Math.abs(e.speed);
        if (Math.abs(e.mesh.position.x) > bx) {
          e.velX *= -1; e.mesh.position.x = clamp(e.mesh.position.x, -bx, bx);
        }
        if (now > e.lastShoot + e.shootMs) {
          const dx = playerRoot.position.x - e.mesh.position.x;
          const dz = playerRoot.position.z - e.mesh.position.z;
          const dn = Math.sqrt(dx*dx + dz*dz) || 1;
          fireEnemyBullet(e.mesh.position, (dx/dn)*.24, (dz/dn)*.24);
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
          damagePlayer(e.tier===4 ? 400 : 200);
          explode(e.mesh.position, 1.5);
          cleanEnemy(e); enemies.splice(i,1); continue;
        }
      }

      // Bullet hits
      let killed = false;
      for (let j = playerBullets.length-1; j >= 0; j--) {
        const b = playerBullets[j];
        if (b.isDisposed?.()) continue;
        const dx = b.position.x - e.mesh.position.x;
        const dz = b.position.z - e.mesh.position.z;
        if (dx*dx + dz*dz > 2.25) continue;  // hit radius 1.5

        let dmg = b.atk;
        e.hp -= dmg;
        showTextEffect(e.mesh.position.x, e.mesh.position.z, `-${Math.round(dmg)}`, '#ff4757');
        e.miniHp.width = `${Math.max(0, Math.round(e.hp/e.maxHp*100))}%`;

        // Hit flash
        if (e.mesh.material?.emissiveColor) {
          const orig = e.mesh.material.emissiveColor.clone();
          e.mesh.material.emissiveColor = new BABYLON.Color3(1,1,1);
          setTimeout(()=>{ if (e.mesh?.material) e.mesh.material.emissiveColor = orig; }, 60);
        }

        safeDispose(b); playerBullets.splice(j,1);

        if (e.hp <= 0) {
          killed = true;
          explode(e.mesh.position, e.tier===3 ? 2 : 1.5);
          updateScore(e.points);
          const roll = Math.random()*100;
          if (roll < 4)       spawnDrop(e.mesh.position.x, e.mesh.position.z, 'power');
          else if (roll < 9)  spawnDrop(e.mesh.position.x, e.mesh.position.z, 'heal');
          else if (roll < 20) spawnDrop(e.mesh.position.x, e.mesh.position.z, 'coin');
          cleanEnemy(e); enemies.splice(i,1);
          break;
        }
      }
      if (killed) continue;
    }

    // ── Boss ──
    if (gameState==='BOSS_FIGHT' && bossMesh && !bossMesh.isDisposed?.()) {
      // Entry slide
      if (bossMesh.position.z < -ZOOM + 7)
        bossMesh.position.z = BABYLON.Scalar.Lerp(bossMesh.position.z, -ZOOM+7, .018);

      // Patrol
      bossFloatT += .010;
      bossMesh.position.z = (-ZOOM+7) + Math.sin(bossFloatT*.7) * .9;
      bossMesh.position.x += bossVelX * (bossEnraged ? 1.8 : 1);
      const bx = boundX() - 2;
      if (Math.abs(bossMesh.position.x) > bx) {
        bossVelX *= -1; bossMesh.position.x = clamp(bossMesh.position.x, -bx, bx);
      }

      // Boss fire
      if (now > nextBossFire) {
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

        let dmg = b.atk;
        bossHp -= dmg;
        showTextEffect(bossMesh.position.x, bossMesh.position.z, `-${Math.round(dmg)}`, '#ff4757');
        bossHpFill.width = `${Math.max(0, Math.round(bossHp/bossMaxHp*100))}%`;

        // Flash boss
        if (bossMesh.material?.emissiveColor) {
          const orig = bossMesh.material.emissiveColor.clone();
          bossMesh.material.emissiveColor = new BABYLON.Color3(1,1,1);
          setTimeout(()=>{ if (bossMesh?.material) bossMesh.material.emissiveColor=orig; }, 60);
        }
        safeDispose(b); playerBullets.splice(j,1);

        // Enrage at 30%
        if (!bossEnraged && bossHp <= bossMaxHp*.3) {
          bossEnraged = true;
          showAnnouncement(lang==='vi'?'CẢNH BÁO: TRÙM NỔI ĐIÊN!':'WARNING: BOSS ENRAGED!', '#ff0000', 3000);
          bossVelX *= 1.6;
          // Change boss color to red
          if (bossMesh.material) {
            bossMesh.material.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3);
          }
        }

        if (bossHp <= 0) {
          explode(bossMesh.position, 5);
          updateScore(bossPts);
          bossPanel.isVisible = false;
          safeDispose(bossMesh); bossMesh = null;
          stageCleared(); break;
        }
      }

      // Boss ↔ player collision
      if (bossMesh) {
        const dx = bossMesh.position.x - playerRoot.position.x;
        const dz = bossMesh.position.z - playerRoot.position.z;
        if (dx*dx + dz*dz < 10.24) damagePlayer(400);   // hit radius 3.2
      }
    }

    // ── Drops ──
    for (let i = drops.length-1; i >= 0; i--) {
      const d = drops[i];
      if (d._dead) { drops.splice(i,1); continue; }
      d.mesh.position.z += .055;
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
          stats.atk += 50;
          showTextEffect(playerRoot.position.x, playerRoot.position.z-.5, lang==='vi'?'TĂNG SỨC MẠNH!':'POWER UP!', '#3498db');
          setTimeout(()=>{ stats.atk -= 50; }, 5000);
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
            gameState = 'TRANSITION';
            showAnnouncement(lang==='vi'?'DỌN SẠCH!':'SECTOR CLEARED!', '#2ecc71', 1000);
            setTimeout(() => startWave(currentWave+1), 2000);
          } else if (!stageConfig.hasBoss) {
            stageCleared();
          }
        }
      }
    }
  });
};