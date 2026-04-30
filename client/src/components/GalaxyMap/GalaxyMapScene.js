import * as Phaser from 'phaser';
import { PLANET_CONFIG } from '../../constants';

/**
 * GalaxyMapScene — AAA 2.5D Isometric Galaxy Navigation
 * -------------------------------------------------------
 * ✦ Background không gian Massive Tile 40000x40000 cực mượt (Khôi phục bản cũ)
 * ✦ Procedural planet textures (tự vẽ hành tinh cực xịn)
 * ✦ Camera inertia / momentum sau khi thả tay
 * ✦ Pinch-to-zoom đa điểm chống lỗi
 * ✦ Sương mù tinh vân (Nebula clouds)
 * ✦ Dòng năng lượng (Hyperlane energy)
 */
export default class GalaxyMapScene extends Phaser.Scene {
  constructor() {
    super('GalaxyMapScene');

    this.CFG = {
      HOVER_HEIGHT:   190,
      DRAG_THRESHOLD:  12,
      CAMERA_LERP:    0.10,
      MIN_ZOOM:       0.22,
      MAX_ZOOM:       2.00,
      GRID_SPACING:  1050,
      ISO_SCALE_Y:   0.38,
    };

    this.backgroundTime   = 0;
    this.isDragging       = false;
    this.dragDistance     = 0;
    this.velocity         = { x: 0, y: 0 };
    this.targetCameraX    = 0;
    this.targetCameraY    = 0;
    this.initialPinch     = null;   
    this._planetTexMap    = {};
  }

  // ─────────────────────────────────────────────
  //  PRELOAD
  // ─────────────────────────────────────────────
  preload() {
    this.load.on('loaderror', (f) => console.warn('[GalaxyMap] asset load error:', f.key));
    this.load.image('galaxy_bg', '/images/galaxy_bg.png');
    if (typeof PLANET_CONFIG !== 'undefined') {
      Object.values(PLANET_CONFIG).forEach(p => {
        if (p.imgSrc) this.load.image(`planet_${p.id}`, p.imgSrc);
      });
    }
  }

  // ─────────────────────────────────────────────
  //  CREATE
  // ─────────────────────────────────────────────
  create() {
    const gsRef          = this.registry.get('gsRef');
    const planetsData    = this.registry.get('planetsData');
    const onPlanetSelect = this.registry.get('onPlanetSelect');
    const lang           = this.registry.get('lang') || 'en';
    const highestPlanet  = gsRef.current?.campaignData?.progress?.highestPlanet || 1;

    this.input.addPointer(2);

    this._genUtilTextures();
    planetsData.forEach(p => this._genPlanetTexture(p));
    this._genAtmosphereTexture();
    this._genCometTexture();

    // Layers
    this.L = {
      space:     this.add.layer().setDepth(0),
      nebula:    this.add.layer().setDepth(1),
      asteroids: this.add.layer().setDepth(2),
      grid:      this.add.layer().setDepth(3),
      routes:    this.add.layer().setDepth(4),
      shadows:   this.add.layer().setDepth(5),
      stems:     this.add.layer().setDepth(6),
      planets:   this.add.layer().setDepth(7),
      ui:        this.add.layer().setDepth(8),
      fx:        this.add.layer().setDepth(9),
    };

    this.isoPositions = this._buildGrid(planetsData);

    this._buildDeepSpace();
    this._buildNebulaClouds();
    this._buildAsteroidDust(planetsData);
    this._buildCyberGrid();
    this._buildRoutes(planetsData, highestPlanet);
    this._buildPlanets(planetsData, highestPlanet, lang, onPlanetSelect);
    this._startCometTimer();

    // Focus Camera
    const startPos = this.isoPositions[highestPlanet] || this.isoPositions[1];
    this.targetCameraX = startPos.x;
    this.targetCameraY = startPos.y - this.CFG.HOVER_HEIGHT * 0.5;

    const cam = this.cameras.main;
    cam.centerOn(this.targetCameraX, this.targetCameraY);
    cam.setZoom(window.innerWidth <= 768 ? 0.52 : 0.80);
    cam.fadeIn(900, 0, 0, 0);

    this._buildCameraBounds();
    this._setupInput();
    this._setupResize();
  }

  toIso(lx, ly) {
    const angle = Math.PI / 4;
    return {
      x: (lx - ly) * Math.cos(angle),
      y: (lx + ly) * Math.sin(angle) * this.CFG.ISO_SCALE_Y,
    };
  }

  _buildGrid(planetsData) {
    const map = {};
    const S = this.CFG.GRID_SPACING;
    planetsData.forEach((p, i) => {
      const arc  = Math.sin(i * 0.72) * 980;
      const wave = Math.cos(i * 0.45) * 420;
      const lx   = i * S + wave;
      const ly   = arc + (i % 2 === 0 ? 280 : -280);
      const iso  = this.toIso(lx, ly);
      map[p.id]  = { x: iso.x, y: iso.y, lx, ly };
    });
    return map;
  }

  // ─────────────────────────────────────────────
  //  TEXTURE GENERATION
  // ─────────────────────────────────────────────
  _genUtilTextures() {
    const g = this.make.graphics({ add: false });

    g.clear();
    for (let r = 32; r >= 0; r--) {
      const a = Math.pow(1 - r / 32, 2.2) * 0.85;
      g.fillStyle(0xffffff, a); g.fillCircle(32, 32, r);
    }
    g.generateTexture('glow_pt', 64, 64);

    g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(2, 2, 2);
    g.generateTexture('star_dot', 4, 4);

    g.clear();
    g.fillStyle(0xffffff, 0.06); g.fillCircle(12, 12, 12);
    g.fillStyle(0xffffff, 0.25); g.fillCircle(12, 12, 6);
    g.fillStyle(0xffffff, 0.90); g.fillCircle(12, 12, 2);
    g.generateTexture('star_bright', 24, 24);

    g.clear(); g.lineStyle(1, 0x38bdf8, 0.10); g.strokeRect(0, 0, 256, 256);
    g.generateTexture('grid_tile', 256, 256);

    g.clear();
    for (let r = 128; r >= 0; r -= 10) {
      g.fillStyle(0xffffff, (1 - r / 128) * 0.055); g.fillCircle(128, 128, r);
    }
    g.generateTexture('nebula_blob', 256, 256);

    g.clear();
    g.fillStyle(0x00e5ff, 0.85); g.fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 0.60); g.fillCircle(8, 8, 4);
    g.fillStyle(0xffffff, 1.00); g.fillCircle(8, 8, 2);
    g.generateTexture('energy_orb', 16, 16);
    g.destroy();
  }

  _genPlanetTexture(planet) {
    const key  = `planet_proc_${planet.id}`;
    const SIZE = 256;
    const cx   = SIZE / 2, cy = SIZE / 2;
    const rad  = SIZE * 0.42;

    const ct  = this.textures.createCanvas(key, SIZE, SIZE);
    const ctx = ct.getContext();

    const hex = (planet.color || '#4488ff').replace('#', '');
    const R   = parseInt(hex.slice(0, 2), 16);
    const G   = parseInt(hex.slice(2, 4), 16);
    const B   = parseInt(hex.slice(4, 6), 16);

    const clamp = (v) => Math.max(0, Math.min(255, v));

    const baseGrad = ctx.createRadialGradient(cx - rad * 0.28, cy - rad * 0.32, rad * 0.06, cx, cy, rad);
    baseGrad.addColorStop(0.00, `rgb(${clamp(R+90)},${clamp(G+90)},${clamp(B+90)})`);
    baseGrad.addColorStop(0.38, `rgb(${R},${G},${B})`);
    baseGrad.addColorStop(0.80, `rgb(${clamp(R-55)},${clamp(G-55)},${clamp(B-55)})`);
    baseGrad.addColorStop(1.00, `rgba(${clamp(R-100)},${clamp(G-100)},${clamp(B-100)},0)`);

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = baseGrad; ctx.fillRect(0, 0, SIZE, SIZE);

    const bands = 3 + (planet.id % 4);
    for (let i = 0; i < bands; i++) {
      const fy    = cy - rad + (i / bands) * rad * 2;
      const fw    = rad * (0.75 + Math.sin(i * 1.7 + planet.id) * 0.22);
      const alpha = 0.06 + (i % 2) * 0.08;
      const grad  = ctx.createLinearGradient(cx - fw, fy - 10, cx + fw, fy + 10);
      grad.addColorStop(0, `rgba(0,0,0,0)`);
      grad.addColorStop(0.35, `rgba(0,0,0,${alpha})`);
      grad.addColorStop(0.65, `rgba(255,255,255,${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(cx - fw, fy - 14, fw * 2, 28);
    }

    if (planet.id % 2 === 0) {
      for (let i = 0; i < 6; i++) {
        const a   = (i / 6) * Math.PI * 2 + planet.id * 0.4;
        const d   = rad * (0.18 + (i * 0.097) % 0.38);
        const crx = cx + Math.cos(a) * d;
        const cry = cy + Math.sin(a) * d;
        const cr  = 7 + (i * 3.7) % 12;
        ctx.beginPath(); ctx.arc(crx, cry, cr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,0.22)`; ctx.fill();
        ctx.beginPath(); ctx.arc(crx - cr * 0.18, cry - cr * 0.18, cr * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,0.07)`; ctx.fill();
      }
    }

    if (planet.id % 2 === 1) {
      const capGrad = ctx.createRadialGradient(cx, cy - rad * 0.75, 0, cx, cy - rad * 0.6, rad * 0.45);
      capGrad.addColorStop(0, `rgba(220,240,255,0.55)`);
      capGrad.addColorStop(0.6, `rgba(180,220,255,0.20)`);
      capGrad.addColorStop(1, `rgba(180,220,255,0)`);
      ctx.fillStyle = capGrad; ctx.fillRect(0, 0, SIZE, SIZE);
    }

    ctx.restore();

    const rimGrad = ctx.createRadialGradient(cx, cy, rad * 0.68, cx, cy, rad * 1.14);
    rimGrad.addColorStop(0.00, `rgba(${R},${G},${B},0)`);
    rimGrad.addColorStop(0.72, `rgba(${R},${G},${B},0)`);
    rimGrad.addColorStop(0.86, `rgba(${clamp(R+40)},${clamp(G+40)},${clamp(B+80)},0.42)`);
    rimGrad.addColorStop(1.00, `rgba(${R},${G},${B},0)`);
    ctx.beginPath(); ctx.arc(cx, cy, rad * 1.14, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad; ctx.fill();

    const specGrad = ctx.createRadialGradient(
      cx - rad * 0.30, cy - rad * 0.36, 0, cx - rad * 0.28, cy - rad * 0.33, rad * 0.42
    );
    specGrad.addColorStop(0, `rgba(255,255,255,0.52)`);
    specGrad.addColorStop(0.4, `rgba(255,255,255,0.14)`);
    specGrad.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = specGrad; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();

    ct.refresh();
    this._planetTexMap[planet.id] = key;
  }

  _genAtmosphereTexture() {
    const SIZE = 512, cx = 256, cy = 256;
    const ct   = this.textures.createCanvas('planet_atmo', SIZE, SIZE);
    const ctx  = ct.getContext();
    const grad = ctx.createRadialGradient(cx, cy, SIZE * 0.29, cx, cy, SIZE * 0.50);
    grad.addColorStop(0.00, `rgba(255,255,255,0)`);
    grad.addColorStop(0.66, `rgba(255,255,255,0)`);
    grad.addColorStop(0.80, `rgba(255,255,255,0.10)`);
    grad.addColorStop(0.90, `rgba(255,255,255,0.22)`);
    grad.addColorStop(1.00, `rgba(255,255,255,0)`);
    ctx.beginPath(); ctx.arc(cx, cy, SIZE * 0.50, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ct.refresh();
  }

  _genCometTexture() {
    const ct  = this.textures.createCanvas('comet_tex', 96, 14);
    const ctx = ct.getContext();
    const g   = ctx.createLinearGradient(0, 7, 96, 7);
    g.addColorStop(0.00, `rgba(56,189,248,0)`);
    g.addColorStop(0.50, `rgba(148,220,255,0.28)`);
    g.addColorStop(0.85, `rgba(220,242,255,0.75)`);
    g.addColorStop(1.00, `rgba(255,255,255,1)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(48, 7, 48, 5, 0, 0, Math.PI * 2); ctx.fill();
    ct.refresh();
  }

  _getPlanetTexKey(planet) {
    if (this.textures.exists(`planet_${planet.id}`)) return `planet_${planet.id}`;
    return this._planetTexMap[planet.id] || 'glow_pt';
  }

  // ─────────────────────────────────────────────
  //  DEEP SPACE BACKGROUND (KHÔI PHỤC BẢN MASSIVE TILE CHUẨN AAA)
  // ─────────────────────────────────────────────
  _buildDeepSpace() {
    const bgDark = this.add.graphics();
    bgDark.fillStyle(0x02040a, 1);
    bgDark.fillRect(-25000, -25000, 50000, 50000);
    this.L.space.add(bgDark);

    // Dùng 1 ảnh duy nhất, mọi xử lý Scale & Parallax sẽ thực hiện ở update()
    if (this.textures.exists('galaxy_bg')) {
      this.galaxyBg = this.add.image(0, 0, 'galaxy_bg').setOrigin(0.5);
      this.galaxyBg.setBlendMode(Phaser.BlendModes.SCREEN);
      this.galaxyBg.setAlpha(0.7);
      this.L.space.add(this.galaxyBg);
    }

    // Hạt sao điểm xuyết lơ lửng
    const stars = this.add.particles(0, 0, 'glow_pt', {
      x: { min: -10000, max: 10000 }, 
      y: { min: -10000, max: 10000 },
      scale: { min: 0.02, max: 0.06 }, 
      alpha: { min: 0.05, max: 0.3 },
      lifespan: 60000, 
      quantity: 300, 
      blendMode: 'SCREEN'
    });
    stars.setScrollFactor(0.02);
    this.L.space.add(stars);
  }

  // ─────────────────────────────────────────────
  //  NEBULA CLOUDS
  // ─────────────────────────────────────────────
  _buildNebulaClouds() {
    const palette = [
      [34, 211, 238], [124, 58, 237], [244, 114, 182], 
      [99, 102, 241], [249, 115, 22], [16, 185, 129],
    ];

    this.nebulaData = [];

    for (let i = 0; i < 10; i++) {
      const [r, g, b] = Phaser.Utils.Array.GetRandom(palette);
      const cg        = this.add.graphics();
      const sf        = Phaser.Math.FloatBetween(0.015, 0.06);
      cg.setScrollFactor(sf);
      const ox   = Phaser.Math.Between(-9000, 9000);
      const oy   = Phaser.Math.Between(-6000, 6000);
      const brad = Phaser.Math.Between(350, 850);

      for (let layer = 8; layer >= 0; layer--) {
        const lr = brad * (1 - layer / 10);
        const la = 0.012 + layer * 0.009;
        cg.fillStyle(Phaser.Display.Color.GetColor(r, g, b), la);
        cg.fillEllipse(ox, oy, lr * 2.4, lr * 0.85);
      }
      this.L.nebula.add(cg);
      this.nebulaData.push({ obj: cg, phase: Math.random() * Math.PI * 2, spd: Phaser.Math.FloatBetween(0.18, 0.50) });
    }

    this.nebulaBlobs = [];
    const blobColors = [0x22d3ee, 0x7c3aed, 0xf472b6, 0x818cf8, 0x34d399];
    for (let i = 0; i < 22; i++) {
      const b = this.add.image(
        Phaser.Math.Between(-8000, 8000), Phaser.Math.Between(-5500, 5500), 'nebula_blob'
      );
      b.setTint(Phaser.Utils.Array.GetRandom(blobColors));
      b.setAlpha(Phaser.Math.FloatBetween(0.04, 0.13));
      b.setScale(Phaser.Math.FloatBetween(2.8, 6.8));
      b.setBlendMode(Phaser.BlendModes.SCREEN);
      b.setScrollFactor(Phaser.Math.FloatBetween(0.018, 0.075));
      this.L.nebula.add(b);
      this.nebulaBlobs.push({ obj: b, phase: Math.random() * Math.PI * 2, spd: Phaser.Math.FloatBetween(0.15, 0.50) });
    }
  }

  // ─────────────────────────────────────────────
  //  ASTEROID SCATTER
  // ─────────────────────────────────────────────
  _buildAsteroidDust(planetsData) {
    const ag = this.add.graphics();
    ag.setScrollFactor(0.92);
    for (let i = 0; i < planetsData.length - 1; i++) {
      const p1  = this.isoPositions[planetsData[i].id];
      const p2  = this.isoPositions[planetsData[i + 1].id];
      const num = Phaser.Math.Between(10, 20);
      for (let j = 0; j < num; j++) {
        const t  = j / num;
        const mx = Phaser.Math.Linear(p1.x, p2.x, t) + Phaser.Math.Between(-180, 180);
        const my = Phaser.Math.Linear(p1.y, p2.y, t) + Phaser.Math.Between(-100, 100);
        const sz = Phaser.Math.Between(2, 7);
        const a  = Phaser.Math.FloatBetween(0.06, 0.25);
        ag.fillStyle(0x94a3b8, a);
        ag.fillRect(mx, my, sz, sz * 0.7);
      }
    }
    this.L.asteroids.add(ag);
  }

  // ─────────────────────────────────────────────
  //  CYBER GRID
  // ─────────────────────────────────────────────
  _buildCyberGrid() {
    this.gridMain = this.add.tileSprite(0, 0, 50000, 50000, 'grid_tile');
    this.gridMain.rotation = Math.PI / 4;
    this.gridMain.scaleY   = this.CFG.ISO_SCALE_Y;
    this.gridMain.setAlpha(0.06).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0.95);
    this.L.grid.add(this.gridMain);

    this.gridSec = this.add.tileSprite(0, 0, 50000, 50000, 'grid_tile');
    this.gridSec.rotation = -Math.PI / 4;
    this.gridSec.scaleY   = this.CFG.ISO_SCALE_Y;
    this.gridSec.setAlpha(0.025).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0.88);
    this.L.grid.add(this.gridSec);
  }

  // ─────────────────────────────────────────────
  //  HYPERLANE ROUTES
  // ─────────────────────────────────────────────
  _buildRoutes(planetsData, highestPlanet) {
    const rg = this.add.graphics();
    this.L.routes.add(rg);

    for (let i = 0; i < planetsData.length - 1; i++) {
      const p1 = this.isoPositions[planetsData[i].id];
      const p2 = this.isoPositions[planetsData[i + 1].id];
      const isActive = planetsData[i].id < highestPlanet;

      rg.lineStyle(28, isActive ? 0x0abde3 : 0x1e293b, isActive ? 0.035 : 0.02);
      rg.beginPath(); rg.moveTo(p1.x, p1.y); rg.lineTo(p2.x, p2.y); rg.strokePath();
      
      rg.lineStyle(10, isActive ? 0x22d3ee : 0x1e293b, isActive ? 0.10 : 0.05);
      rg.beginPath(); rg.moveTo(p1.x, p1.y); rg.lineTo(p2.x, p2.y); rg.strokePath();
      
      rg.lineStyle(2.5, isActive ? 0x38bdf8 : 0x2d3a4a, isActive ? 0.55 : 0.10);
      rg.beginPath(); rg.moveTo(p1.x, p1.y); rg.lineTo(p2.x, p2.y); rg.strokePath();

      if (!isActive) {
        rg.lineStyle(1.5, 0x334155, 0.18);
        for (let s = 0; s < 14; s += 2) {
          const t1 = s / 14, t2 = (s + 0.9) / 14;
          rg.beginPath();
          rg.moveTo(Phaser.Math.Linear(p1.x, p2.x, t1), Phaser.Math.Linear(p1.y, p2.y, t1));
          rg.lineTo(Phaser.Math.Linear(p1.x, p2.x, t2), Phaser.Math.Linear(p1.y, p2.y, t2));
          rg.strokePath();
        }
      }

      const nodeG = this.add.graphics();
      nodeG.fillStyle(isActive ? 0x0abde3 : 0x1e293b, 0.65);
      nodeG.fillCircle(p1.x, p1.y, 4.5);
      nodeG.lineStyle(1, isActive ? 0x38bdf8 : 0x334155, 0.55);
      nodeG.strokeCircle(p1.x, p1.y, 7);
      this.L.routes.add(nodeG);

      if (isActive) {
        const count = planetsData[i].id === highestPlanet - 1 ? 3 : 1;
        for (let k = 0; k < count; k++) {
          const orb  = this.add.image(p1.x, p1.y, 'energy_orb');
          const scl  = 1.0 + k * 0.35;
          orb.setBlendMode('ADD').setScale(scl).setAlpha(0.9);
          this.L.routes.add(orb);
          this.tweens.add({
            targets: orb, x: p2.x, y: p2.y,
            duration: 3200 + Math.random() * 1800, ease: 'Linear',
            repeat: -1, delay: (k / count) * 4000,
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  //  PLANET CREATION
  // ─────────────────────────────────────────────
  _buildPlanets(planetsData, highestPlanet, lang, onPlanetSelect) {
    planetsData.forEach(planet => {
      const pos      = this.isoPositions[planet.id];
      const floorPos = { x: pos.x, y: pos.y };
      const floatPos = { x: pos.x, y: pos.y - this.CFG.HOVER_HEIGHT };

      const isUnlocked = planet.id <= highestPlanet;
      const isCurrent  = planet.id === highestPlanet;

      const hexStr  = (planet.color || '#4488ff').replace('#', '');
      const colInt  = parseInt(hexStr, 16);
      const cR      = parseInt(hexStr.slice(0, 2), 16);
      const cG      = parseInt(hexStr.slice(2, 4), 16);
      const cB      = parseInt(hexStr.slice(4, 6), 16);

      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.60); shadow.fillEllipse(floorPos.x, floorPos.y, 140, 44);
      shadow.fillStyle(0x000000, 0.20); shadow.fillEllipse(floorPos.x, floorPos.y, 200, 60);
      this.L.shadows.add(shadow);

      const stem = this.add.graphics();
      this.L.stems.add(stem);

      const ctr = this.add.container(floatPos.x, floatPos.y);
      this.L.planets.add(ctr);

      const texKey  = this._getPlanetTexKey(planet);
      const imgScl  = texKey.startsWith('planet_proc') ? 0.62 : 0.46;
      const imgOffY = -10;

      if (isUnlocked) {
        const atmoImg = this.add.image(0, imgOffY, 'planet_atmo');
        atmoImg.setScale(isCurrent ? 0.68 : 0.56);
        atmoImg.setTint(colInt).setBlendMode('ADD');
        atmoImg.setAlpha(isCurrent ? 0.55 : 0.28);
        ctr.add(atmoImg);
        ctr._atmoImg = atmoImg;

        const ringG = this.add.graphics();
        ringG.lineStyle(3.5, colInt, 0.60); ringG.strokeEllipse(0, imgOffY, 192, 54);
        ringG.lineStyle(9,   colInt, 0.12); ringG.strokeEllipse(0, imgOffY, 212, 60);
        ctr.add(ringG);
        this.tweens.add({ targets: ringG, scaleX: -1, duration: 16000 + Math.random() * 8000, yoyo: true, repeat: -1 });

        if (isCurrent) {
          const orbG = this.add.graphics(); ctr.add(orbG); ctr._orbG = orbG;
          let orbAngle = 0;
          this.time.addEvent({ delay: 33, loop: true, callback: () => {
            orbAngle += 0.028;
            orbG.clear();
            for (let k = 0; k < 8; k++) {
              const a  = orbAngle + (k / 8) * Math.PI * 2;
              const ox = Math.cos(a) * 96;
              const oy = Math.sin(a) * 27 + imgOffY;
              const br = (Math.sin(a) + 1) * 0.5;
              orbG.fillStyle(colInt, 0.12 + br * 0.62);
              orbG.fillCircle(ox, oy, 2.5 + br * 3.5);
            }
          }});
        }

        const planetImg = this.add.image(0, imgOffY, texKey);
        planetImg.setScale(imgScl);
        ctr.add(planetImg);

        if (isCurrent) {
          const selG = this.add.graphics(); ctr.add(selG); ctr._selG = selG;
          let selAngle = 0;
          this.time.addEvent({ delay: 16, loop: true, callback: () => {
            selAngle += 0.018;
            selG.clear();
            const segCount = 18;
            for (let s = 0; s < segCount; s++) {
              if (s % 2 === 0) {
                const a1 = selAngle + (s / segCount) * Math.PI * 2;
                const a2 = selAngle + ((s + 0.75) / segCount) * Math.PI * 2;
                selG.lineStyle(2, 0xfacc15, 0.75);
                // Đổi 82 thành 140 (Hoặc to hơn tùy vào ảnh Tinh cầu của bạn)
                selG.beginPath(); selG.arc(0, imgOffY, 200, a1, a2); selG.strokePath(); 
              }
            }
          }});

          const arrow = this.add.text(0, -250, '▼', {
            fontSize: '30px', color: '#facc15',
            shadow: { offsetX: 0, offsetY: 0, color: '#facc15', blur: 14, fill: true }
          }).setOrigin(0.5);
          ctr.add(arrow);
          this.tweens.add({ targets: arrow, y: -220, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

          ctr.add(this.add.text(0, -270, '◆  ACTIVE  ◆', {
            fontFamily: '"Share Tech Mono", monospace', fontSize: '20px', color: '#facc15',
            shadow: { offsetX: 0, offsetY: 0, color: '#facc15', blur: 10, fill: true }
          }).setOrigin(0.5));
        }

        ctr.setSize(165, 165).setInteractive({ useHandCursor: true });

        ctr.on('pointerover', () => {
          this.tweens.killTweensOf(ctr);
          this.tweens.add({ targets: ctr, scaleX: 1.07, scaleY: 1.07, duration: 160, ease: 'Back.easeOut' });
          if (ctr._atmoImg) ctr._atmoImg.setAlpha(Math.min(ctr._atmoImg.alpha + 0.22, 0.88));
        });
        ctr.on('pointerout', () => {
          this.tweens.add({ targets: ctr, scaleX: 1, scaleY: 1, duration: 200, ease: 'Sine.easeOut' });
          if (ctr._atmoImg) ctr._atmoImg.setAlpha(isCurrent ? 0.55 : 0.28);
        });
        ctr.on('pointerdown', () => {
          this.tweens.add({ targets: ctr, scaleX: 0.92, scaleY: 0.92, duration: 75 });
        });
        ctr.on('pointerup', () => {
          this.tweens.add({ targets: ctr, scaleX: 1, scaleY: 1, duration: 110 });
          if (this.dragDistance < this.CFG.DRAG_THRESHOLD) {
            onPlanetSelect(planet);
            this.targetCameraX = floorPos.x;
            this.targetCameraY = floorPos.y - this.CFG.HOVER_HEIGHT * 0.5;
          }
        });

      } else {
        const lockedImg = this.add.image(0, imgOffY, texKey);
        lockedImg.setScale(imgScl).setTint(0x1a2433).setAlpha(0.38);
        ctr.add(lockedImg);

        const lockOverlay = this.add.graphics();
        lockOverlay.fillStyle(0x0a1020, 0.52);
        lockOverlay.fillCircle(0, imgOffY, 76);
        lockOverlay.lineStyle(2, 0x283548, 0.40);
        lockOverlay.strokeCircle(0, imgOffY, 76);
        ctr.add(lockOverlay);

        ctr.add(this.add.text(0, imgOffY, '🔒', { fontSize: '28px' }).setOrigin(0.5).setAlpha(0.45));
      }

      this._buildPlanetLabel(floorPos, planet, lang, isUnlocked, colInt, cR, cG, cB);

      if (isUnlocked) {
        const fRange = 22 + Math.random() * 18;
        const fDur   = 2100 + Math.random() * 1300;
        this.tweens.add({
          targets: ctr, y: floatPos.y - fRange, duration: fDur,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          onUpdate: () => {
            stem.clear();
            const segs = 14;
            for (let s = 0; s < segs; s++) {
              const t1 = s / segs, t2 = (s + 1) / segs;
              const a  = 0.12 + (1 - t1) * 0.50;
              const w  = 1.2 + (1 - t1) * 2.5;
              stem.lineStyle(w, colInt, a);
              stem.beginPath();
              stem.moveTo(Phaser.Math.Linear(floorPos.x, ctr.x, t1), Phaser.Math.Linear(floorPos.y, ctr.y, t1));
              stem.lineTo(Phaser.Math.Linear(floorPos.x, ctr.x, t2), Phaser.Math.Linear(floorPos.y, ctr.y, t2));
              stem.strokePath();
            }
            const diff = floorPos.y - ctr.y;
            const scl  = Phaser.Math.Clamp(1 - (diff - this.CFG.HOVER_HEIGHT) * 0.005, 0.30, 1.15);
            shadow.setScale(scl); shadow.setAlpha(scl * 0.68);
          },
        });
      } else {
        stem.lineStyle(1.5, 0x283548, 0.22);
        stem.beginPath(); stem.moveTo(floorPos.x, floorPos.y); stem.lineTo(floatPos.x, floatPos.y); stem.strokePath();
      }
    });
  }

  _buildPlanetLabel(floorPos, planet, lang, isUnlocked, colInt, cR, cG, cB) {
    const lx = floorPos.x, ly = floorPos.y + 30;
    const W  = 300, H = 32;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.72);
    bg.fillRoundedRect(lx - W / 2, ly, W, H, 5);
    if (isUnlocked) {
      bg.lineStyle(1, colInt, 0.38);
      bg.strokeRoundedRect(lx - W / 2, ly, W, H, 5);
      bg.fillStyle(colInt, 0.75);
      bg.fillRect(lx - 22, ly, 44, 2);
    }
    this.L.ui.add(bg);

    this.L.ui.add(
      this.add.text(lx, ly + H / 2 + 2, isUnlocked ? planet.name[lang] : '? ? ? ? ?', {
        fontFamily: '"Share Tech Mono", monospace', fontSize: '25px',
        color: isUnlocked ? '#e2e8f0' : '#4a5568', align: 'center',
      }).setOrigin(0.5)
    );

    if (isUnlocked) {
      this.L.ui.add(
        this.add.text(lx, ly + H + 8, `SECTOR-${String(planet.id).padStart(2, '0')}`, {
          fontFamily: '"Share Tech Mono", monospace', fontSize: '20px',
          color: `#${Math.min(cR + 40, 255).toString(16).padStart(2,'0')}${Math.min(cG + 40, 255).toString(16).padStart(2,'0')}${Math.min(cB + 80, 255).toString(16).padStart(2,'0')}`,
        }).setOrigin(0.5).setAlpha(0.62)
      );
    }
  }

  // ─────────────────────────────────────────────
  //  COMETS
  // ─────────────────────────────────────────────
  _startCometTimer() {
    const spawnComet = () => {
      const angle  = Phaser.Math.FloatBetween(0.5, 1.3);
      const startX = Phaser.Math.Between(-10000, 10000);
      const startY = Phaser.Math.Between(-8000, -5000);
      const dist   = Phaser.Math.Between(5000, 10000);
      const sf     = Phaser.Math.FloatBetween(0.08, 0.25);
      const speed  = Phaser.Math.Between(3500, 7500);

      const comet = this.add.graphics();
      comet.setScrollFactor(sf);
      const tailLen = 130;
      for (let i = 16; i >= 0; i--) {
        const t  = i / 16;
        const px = -Math.cos(angle) * tailLen * t;
        const py = -Math.sin(angle) * tailLen * t;
        comet.fillStyle(0x38bdf8, (1 - t) * 0.45);
        comet.fillCircle(px, py, (1 - t) * 3 + 0.5);
      }
      comet.fillStyle(0xffffff, 1); comet.fillCircle(0, 0, 3);
      comet.fillStyle(0xaaddff, 0.7); comet.fillCircle(0, 0, 5);

      comet.x = startX; comet.y = startY;
      comet.rotation = angle;
      this.L.fx.add(comet);

      this.tweens.add({
        targets: comet,
        x: startX + Math.cos(angle) * dist,
        y: startY + Math.sin(angle) * dist,
        alpha: 0, duration: speed, ease: 'Linear',
        onComplete: () => comet.destroy(),
      });
    };

    this.time.addEvent({ delay: 4500, loop: true, startAt: 1000, callback: () => {
      if (Math.random() < 0.70) spawnComet();
    }});
    spawnComet(); spawnComet();
  }

  // ─────────────────────────────────────────────
  //  CAMERA BOUNDS
  // ─────────────────────────────────────────────
  _buildCameraBounds() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    Object.values(this.isoPositions).forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const pad = 3000;
    this.cameras.main.setBounds(
      minX - pad, minY - pad,
      (maxX - minX) + pad * 2, (maxY - minY) + pad * 2
    );
  }

  // ─────────────────────────────────────────────
  //  INPUT HANDLING
  // ─────────────────────────────────────────────
  _setupInput() {
    let lastX = 0, lastY = 0;

    this.input.on('pointerdown', (ptr) => {
      this.isDragging  = true;
      this.dragDistance = 0;
      this.velocity    = { x: 0, y: 0 };
      lastX = ptr.x; lastY = ptr.y;
      this.targetCameraX = this.cameras.main.scrollX + this.cameras.main.width  / 2;
      this.targetCameraY = this.cameras.main.scrollY + this.cameras.main.height / 2;
    });

    this.input.on('pointerup',  () => { this.isDragging = false; this.initialPinch = null; });
    this.input.on('pointerout', () => { this.isDragging = false; this.initialPinch = null; });

    this.input.on('pointermove', (ptr) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;

      if (p1?.isDown && p2?.isDown) {
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (!this.initialPinch) {
          this.initialPinch = { dist, zoom: this.cameras.main.zoom, cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
        } else {
          const newZoom = Phaser.Math.Clamp(this.initialPinch.zoom * (dist / this.initialPinch.dist), this.CFG.MIN_ZOOM, this.CFG.MAX_ZOOM);
          this.cameras.main.setZoom(newZoom);
        }
        return;
      }

      if (this.isDragging && ptr.isDown) {
        const dx = (ptr.x - lastX) / this.cameras.main.zoom;
        const dy = (ptr.y - lastY) / this.cameras.main.zoom;
        this.velocity.x = -dx;
        this.velocity.y = -dy;
        this.targetCameraX -= dx;
        this.targetCameraY -= dy;
        this.dragDistance  += Math.abs(dx) + Math.abs(dy);
        lastX = ptr.x; lastY = ptr.y;
      }
    });

    this.input.on('wheel', (ptr, objs, dX, dY) => {
      const delta  = dY > 0 ? -0.09 : 0.09;
      const newZoom = Phaser.Math.Clamp(this.cameras.main.zoom + delta, this.CFG.MIN_ZOOM, this.CFG.MAX_ZOOM);
      this.cameras.main.setZoom(newZoom);
    });
  }

  // ─────────────────────────────────────────────
  //  RESPONSIVE
  // ─────────────────────────────────────────────
  _setupResize() {
    this.scale.on('resize', (gameSize) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
    });
  }

  // ─────────────────────────────────────────────
  //  UPDATE LOOP
  // ─────────────────────────────────────────────
  update(time, delta) {
    const dt = delta / 16.667; 
    const cam = this.cameras.main;

    // Smooth camera lerp
    cam.scrollX = Phaser.Math.Linear(cam.scrollX, this.targetCameraX - cam.width  / 2, this.CFG.CAMERA_LERP);
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, this.targetCameraY - cam.height / 2, this.CFG.CAMERA_LERP);

    // Quán tính sau khi vuốt
    if (!this.isDragging && this.velocity) {
      this.targetCameraX += this.velocity.x * 0.82 * dt;
      this.targetCameraY += this.velocity.y * 0.82 * dt;
      this.velocity.x    *= 0.87;
      this.velocity.y    *= 0.87;
    }

    // ==============================================================
    // THUẬT TOÁN AAA: DYNAMIC COVER FIT & CLAMPED PARALLAX
    // Đảm bảo không vỡ nét (Over-scale) và KHÔNG BAO GIỜ hở viền
    // ==============================================================
    if (this.galaxyBg) {
      const zoom = cam.zoom;
      
      // 1. Tính kích thước THỰC TẾ mà Camera nhìn thấy trong không gian
      const viewW = cam.width / zoom;
      const viewH = cam.height / zoom;

      // 2. Kích thước gốc của bức ảnh Background (Tỷ lệ 16:9)
      const imgW = 1536;
      const imgH = 1024;

      // 3. Tính Scale để phủ kín (Cover) + Dư ra 20% làm lề (Margin) để trượt Parallax
      const scaleX = viewW / imgW;
      const scaleY = viewH / imgH;
      const coverScale = Math.max(scaleX, scaleY) * 1.20;
      this.galaxyBg.setScale(coverScale);

      // 4. Tính khoảng cách trượt tối đa cho phép để không bị hở viền đen
      const maxShiftX = (imgW * coverScale - viewW) / 2;
      const maxShiftY = (imgH * coverScale - viewH) / 2;

      // 5. Tính độ lệch Parallax dựa trên tọa độ tâm của Camera
      let offsetX = cam.midPoint.x * 0.04;
      let offsetY = cam.midPoint.y * 0.04;

      // CHẶN ĐỨNG (Clamp): Nếu vuốt quá xa, ngưng trượt Parallax để bảo vệ viền
      offsetX = Phaser.Math.Clamp(offsetX, -maxShiftX, maxShiftX);
      offsetY = Phaser.Math.Clamp(offsetY, -maxShiftY, maxShiftY);

      // 6. Gắn ảnh vào tâm Camera và trừ đi độ lệch để tạo ảo giác chiều sâu
      this.galaxyBg.x = cam.midPoint.x - offsetX;
      this.galaxyBg.y = cam.midPoint.y - offsetY;
    }
    // ==============================================================

    this.backgroundTime += delta * 0.001;
    const T = this.backgroundTime;

    if (this.gridMain) { this.gridMain.tilePositionX += 0.045 * dt; this.gridMain.tilePositionY += 0.018 * dt; }
    if (this.gridSec)  { this.gridSec.tilePositionY  += 0.038 * dt; }

    if (this.nebulaBlobs) {
      this.nebulaBlobs.forEach((nb) => {
        nb.obj.alpha = 0.05 + Math.sin(T * nb.spd + nb.phase) * 0.04;
      });
    }
    if (this.nebulaData) {
      this.nebulaData.forEach((nd) => {
        nd.obj.alpha = 0.04 + Math.sin(T * nd.spd + nd.phase) * 0.025;
      });
    }
  }
}