/**
 * GalaxyMapScene — AAA 3D Galaxy Navigation (Babylon.js v2)
 * ─────────────────────────────────────────────────────────
 * ✦ Real planet images (planet_base / ice / fire) on 3D spheres
 * ✦ Isometric-style camera (55° tilt) — true 3D perspective
 * ✦ Correct drag direction (pan left/right/up/down naturally)
 * ✦ Light bloom (0.18) — no color bleed, no grain artifacts
 * ✦ GlowLayer 0.35 intensity — subtle neon accent, not blob
 * ✦ Hyperlane tubes + animated energy orbs
 * ✦ Orbital torus rings + floating planet animation
 * ✦ Billboard name labels + bouncing current-planet arrow
 * ✦ Full destroy() cleanup — no memory leaks
 */

import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  DynamicTexture,
  Texture,
  ParticleSystem,
  GlowLayer,
  HighlightLayer,
  DefaultRenderingPipeline,
  ActionManager,
  ExecuteCodeAction,
  Mesh,
} from '@babylonjs/core';

// ── Camera geometry constants ──────────────────────────────────────────────────
//   Camera sits 950 units above ground, 680 units BEHIND the look-target (–Z).
//   Camera looks at a point that is +120 units AHEAD of center (+Z) and at Y=0.
//   This produces a ~54° downward tilt — clear isometric-style 3D perspective.
const CAM_Y      = 950;
const CAM_Z_BACK = 680;   // how far behind target camera sits
const CAM_LOOK_Z = 120;   // how far ahead of cam-X/Z the look-target is

export default class GalaxyMapScene {
  constructor(canvas, config) {
    this.canvas         = canvas;
    this.gsRef          = config.gsRef;
    this.planetsData    = config.planetsData;
    this.onPlanetSelect = config.onPlanetSelect;
    this.lang           = config.lang || 'vi';

    // ── Tuning ────────────────────────────────────────────────────────────
    this.CFG = {
      HOVER_HEIGHT : 60,    // planets float this high above Y=0
      CAMERA_LERP  : 0.09,
      MIN_ZOOM     : 380,   // camera.position.y minimum (zoom in)
      MAX_ZOOM     : 1600,  // camera.position.y maximum (zoom out)
      GRID_SPACING : 880,   // logical X spacing between planets
    };

    // ── Mutable state ─────────────────────────────────────────────────────
    this.isDragging     = false;
    this.dragDistance   = 0;
    this.velocity       = { x: 0, z: 0 };
    this.targetCamX     = 0;
    this.targetCamZ     = 0;

    this._planetPositions = {};
    this._planetMeshes    = {};
    this._planetAnimData  = [];
    this._animRings       = [];
    this._energyOrbs      = [];
    this._nebulaPlanes    = [];
    this._hoverTarget     = null;
    this._selRingData     = null;
    this._cometInterval   = null;
    this._resizeHandler   = null;
    this._pointers        = {};
    this._pinchInit       = null;

    this._init();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════════════
  _init() {
    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer : true,
      stencil               : true,
      antialias             : true,
      powerPreference       : 'high-performance',
    });

    const scene = new Scene(this.engine);
    this.scene  = scene;
    scene.clearColor = new Color4(0.003, 0.006, 0.018, 1);

    this._buildPlanetPositions();

    // ── Camera ────────────────────────────────────────────────────────────
    const highestPlanet = this.gsRef.current?.campaignData?.progress?.highestPlanet || 1;
    const startPos      = this._planetPositions[highestPlanet]
                       || this._planetPositions[1]
                       || { x: 0, z: 0 };

    this.targetCamX = startPos.x;
    this.targetCamZ = startPos.z;

    this.camera = new FreeCamera('mapCam',
      new Vector3(startPos.x, CAM_Y, startPos.z - CAM_Z_BACK),
      scene
    );
    this.camera.setTarget(new Vector3(startPos.x, 0, startPos.z + CAM_LOOK_Z));
    this.camera.fov  = 0.72;   // 41° — wide enough for context
    this.camera.minZ = 10;
    this.camera.maxZ = 80000;
    this.camera.inputs.clear(); // manual input only

    // ── Lighting ──────────────────────────────────────────────────────────
    const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene);
    amb.intensity   = 0.40;
    amb.diffuse     = new Color3(0.28, 0.42, 0.75);
    amb.groundColor = new Color3(0.05, 0.07, 0.14);

    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.3), scene);
    sun.intensity = 1.8;
    sun.diffuse   = new Color3(1.0, 0.95, 0.85);
    sun.specular  = new Color3(1.0, 0.90, 0.70);

    // ── Post-processing (subtle — no blob) ───────────────────────────────
    const pp = new DefaultRenderingPipeline('pp', true, scene, [this.camera]);
    pp.bloomEnabled   = true;
    pp.bloomThreshold = 0.62;   // only very bright surfaces bloom
    pp.bloomWeight    = 0.20;   // light bloom — not aggressive
    pp.bloomKernel    = 48;
    pp.bloomScale     = 0.5;
    pp.imageProcessingEnabled     = true;
    pp.imageProcessing.contrast   = 1.12;
    pp.imageProcessing.exposure   = 1.02;
    pp.chromaticAberrationEnabled = false;  // no color fringe
    pp.grainEnabled               = false;  // no noise
    this._pipeline = pp;

    // ── FX layers (subtle) ────────────────────────────────────────────────
    this.glowLayer      = new GlowLayer('glow', scene);
    this.glowLayer.intensity = 0.38;   // was 1.4 — much gentler

    this.highlightLayer = new HighlightLayer('hl', scene);

    // ── Build world ───────────────────────────────────────────────────────
    this._buildBackground();
    this._buildStarfield();
    this._buildCyberGrid();
    this._buildRoutes(highestPlanet);
    this._buildPlanets(highestPlanet);
    this._buildNebulaClouds();
    this._startCometTimer();

    // ── Input / resize ────────────────────────────────────────────────────
    this._setupInput();
    this._setupResize();

    // ── Render loop ───────────────────────────────────────────────────────
    this.engine.runRenderLoop(() => {
      this._update();
      scene.render();
    });

    // ── Fade-in ───────────────────────────────────────────────────────────
    scene.imageProcessingConfiguration.exposure = 0;
    let fadeT = 0;
    const fadeObs = scene.onBeforeRenderObservable.add(() => {
      fadeT += scene.getEngine().getDeltaTime() / 800;
      scene.imageProcessingConfiguration.exposure = Math.min(fadeT, 1.02);
      if (fadeT >= 1.0) scene.onBeforeRenderObservable.remove(fadeObs);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLANET POSITIONS  (sine/arc wave — same logical spread as Phaser)
  // ═══════════════════════════════════════════════════════════════════════
  _buildPlanetPositions() {
    const S = this.CFG.GRID_SPACING;
    this.planetsData.forEach((p, i) => {
      // Gentle arc so planets feel like a galaxy path, not a straight line
      const arc  = Math.sin(i * 0.65) * 520;
      const wave = Math.cos(i * 0.42) * 180;
      const x    = i * S + wave;
      const z    = arc + (i % 2 === 0 ? 180 : -180);
      this._planetPositions[p.id] = { x, z };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  BACKGROUND  (galaxy image + ground)
  // ═══════════════════════════════════════════════════════════════════════
  _buildBackground() {
    // Ground disc (dark space "floor")
    const floor = MeshBuilder.CreateGround('floor', { width: 90000, height: 90000 }, this.scene);
    floor.position.y  = -40;
    floor.isPickable  = false;
    const floorMat = new StandardMaterial('floorMat', this.scene);
    floorMat.emissiveColor   = new Color3(0.004, 0.008, 0.018);
    floorMat.disableLighting = true;
    floor.material = floorMat;

    // Galaxy background billboard (deep background plane)
    const bgPlane = MeshBuilder.CreatePlane('galaxyBg', { width: 40000, height: 22500 }, this.scene);
    bgPlane.position.set(2000, 200, 18000);
    bgPlane.isPickable = false;
    bgPlane.renderingGroupId = 0;
    const bgMat = new StandardMaterial('bgMat', this.scene);
    bgMat.disableLighting  = true;
    bgMat.backFaceCulling  = false;
    bgMat.emissiveColor    = new Color3(1, 1, 1);
    const bgTex = new Texture('/images/galaxy_bg.png', this.scene);
    bgMat.emissiveTexture  = bgTex;
    bgMat.alpha            = 0.55;
    bgPlane.material       = bgMat;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STARFIELD
  // ═══════════════════════════════════════════════════════════════════════
  _buildStarfield() {
    const tex = new DynamicTexture('starTex', { width: 32, height: 32 }, this.scene, false);
    const ctx = tex.getContext();
    const g   = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(200,220,255,0.7)');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();

    const ps = new ParticleSystem('stars', 1800, this.scene);
    ps.particleTexture = tex;
    ps.emitter         = new Vector3(0, 0, 0);
    ps.minEmitBox      = new Vector3(-12000, -8, -9000);
    ps.maxEmitBox      = new Vector3( 12000,  8,  9000);
    ps.color1          = new Color4(0.88, 0.94, 1.0, 0.85);
    ps.color2          = new Color4(0.65, 0.75, 1.0, 0.30);
    ps.colorDead       = new Color4(0, 0, 0, 0);
    ps.minSize         = 1.2;
    ps.maxSize         = 5.0;
    ps.minLifeTime     = 999999;
    ps.maxLifeTime     = 999999;
    ps.emitRate        = 1800;
    ps.blendMode       = ParticleSystem.BLENDMODE_ADD;
    ps.gravity         = Vector3.Zero();
    ps.direction1      = Vector3.Zero();
    ps.direction2      = Vector3.Zero();
    ps.start();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CYBER GRID  (subtle scrolling grid overlay)
  // ═══════════════════════════════════════════════════════════════════════
  _buildCyberGrid() {
    const gTex = new DynamicTexture('gridTex', { width: 256, height: 256 }, this.scene, false);
    const ctx  = gTex.getContext();
    ctx.strokeStyle = 'rgba(56,189,248,0.16)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(1, 1, 254, 254);
    ctx.strokeStyle = 'rgba(56,189,248,0.05)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath(); ctx.moveTo(128,   0); ctx.lineTo(128, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(  0, 128); ctx.lineTo(256, 128); ctx.stroke();
    gTex.update();

    const grid = MeshBuilder.CreateGround('cyberGrid', { width: 70000, height: 70000 }, this.scene);
    grid.position.y = -36;
    grid.isPickable = false;
    const gMat = new StandardMaterial('gridMat', this.scene);
    gMat.emissiveTexture        = gTex;
    gMat.emissiveTexture.uScale = 240;
    gMat.emissiveTexture.vScale = 240;
    gMat.disableLighting        = true;
    gMat.alpha                  = 0.042;
    gMat.alphaMode              = Engine.ALPHA_ADD;
    grid.material = gMat;
    this._gridMesh = grid;
    this._gridUOff = 0;
    this._gridVOff = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  NEBULA CLOUDS  (background atmosphere blobs)
  // ═══════════════════════════════════════════════════════════════════════
  _buildNebulaClouds() {
    const palette = [
      [34,211,238],[124,58,237],[244,114,182],
      [99,102,241],[249,115,22],[16,185,129],
    ];
    for (let i = 0; i < 10; i++) {
      const [r, g, b] = palette[i % palette.length];
      const nTex = new DynamicTexture(`nebTex_${i}`, { width: 256, height: 256 }, this.scene, false);
      const ctx  = nTex.getContext();
      const gr   = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0.0, `rgba(${r},${g},${b},0.18)`);
      gr.addColorStop(0.5, `rgba(${r},${g},${b},0.08)`);
      gr.addColorStop(1.0, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 256, 256);
      nTex.update();

      const nPlane = MeshBuilder.CreatePlane(`neb_${i}`, {
        width:  2200 + Math.random() * 2800,
        height:  700 + Math.random() * 1200,
      }, this.scene);
      nPlane.rotation.x = Math.PI / 2;
      nPlane.position.set(
        (Math.random() - 0.5) * 20000,
        -30,
        (Math.random() - 0.5) * 14000
      );
      nPlane.isPickable = false;
      const nMat = new StandardMaterial(`nebMat_${i}`, this.scene);
      nMat.emissiveTexture  = nTex;
      nMat.opacityTexture   = nTex;
      nMat.disableLighting  = true;
      nMat.backFaceCulling  = false;
      nMat.alphaMode        = Engine.ALPHA_ADD;
      nPlane.material = nMat;
      this._nebulaPlanes.push({ mesh: nPlane, phase: Math.random() * Math.PI * 2, spd: 0.15 + Math.random() * 0.30 });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HYPERLANE ROUTES
  // ═══════════════════════════════════════════════════════════════════════
  _buildRoutes(highestPlanet) {
    for (let i = 0; i < this.planetsData.length - 1; i++) {
      const p1   = this.planetsData[i];
      const p2   = this.planetsData[i + 1];
      const pos1 = this._planetPositions[p1.id];
      const pos2 = this._planetPositions[p2.id];
      if (!pos1 || !pos2) continue;

      const isActive = p1.id < highestPlanet;
      const mid = { x: (pos1.x + pos2.x) / 2, z: (pos1.z + pos2.z) / 2 };
      const path = [
        new Vector3(pos1.x, -10, pos1.z),
        new Vector3(mid.x,   -6, mid.z),
        new Vector3(pos2.x, -10, pos2.z),
      ];

      // Tube
      const tube = MeshBuilder.CreateTube(`route_${i}`, {
        path, radius: isActive ? 2.2 : 1.0, tessellation: 6,
      }, this.scene);
      tube.isPickable = false;
      const rMat = new StandardMaterial(`rMat_${i}`, this.scene);
      rMat.emissiveColor   = isActive
        ? new Color3(0.04, 0.72, 0.90)
        : new Color3(0.08, 0.12, 0.20);
      rMat.alpha           = isActive ? 0.55 : 0.18;
      rMat.disableLighting = true;
      tube.material = rMat;
      if (isActive) this.glowLayer.addIncludedOnlyMesh(tube);

      // Node dot at source
      const node = MeshBuilder.CreateSphere(`node_${i}`, { diameter: 12, segments: 6 }, this.scene);
      node.position.set(pos1.x, -10, pos1.z);
      node.isPickable = false;
      const nodeMat = new StandardMaterial(`nodeMat_${i}`, this.scene);
      nodeMat.emissiveColor   = isActive ? new Color3(0.04, 0.72, 0.90) : new Color3(0.10, 0.14, 0.22);
      nodeMat.disableLighting = true;
      node.material = nodeMat;
      if (isActive) this.glowLayer.addIncludedOnlyMesh(node);

      // Energy orbs
      if (isActive) {
        const count  = 2;
        const hexStr = (p1.color || '#0abde3').replace('#', '');
        const oR = parseInt(hexStr.slice(0, 2), 16) / 255;
        const oG = parseInt(hexStr.slice(2, 4), 16) / 255;
        const oB = parseInt(hexStr.slice(4, 6), 16) / 255;
        for (let k = 0; k < count; k++) {
          const orb  = MeshBuilder.CreateSphere(`orb_${i}_${k}`, { diameter: 11, segments: 5 }, this.scene);
          orb.isPickable = false;
          const oMat = new StandardMaterial(`oMat_${i}_${k}`, this.scene);
          oMat.emissiveColor   = new Color3(oR, oG, oB);
          oMat.disableLighting = true;
          orb.material = oMat;
          this.glowLayer.addIncludedOnlyMesh(orb);
          const duration = 3800 + Math.random() * 2000;
          orb.metadata = { s: pos1, e: pos2, progress: k / count, speed: 1 / duration };
          this._energyOrbs.push(orb);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLANETS  (3D spheres with real PNG textures + rings + labels)
  // ═══════════════════════════════════════════════════════════════════════
  _buildPlanets(highestPlanet) {
    this.planetsData.forEach(planet => {
      const pos = this._planetPositions[planet.id];
      if (!pos) return;

      const isUnlocked = planet.id <= highestPlanet;
      const isCurrent  = planet.id === highestPlanet;

      const hexStr = (planet.color || '#4488ff').replace('#', '');
      const pR = parseInt(hexStr.slice(0, 2), 16) / 255;
      const pG = parseInt(hexStr.slice(2, 4), 16) / 255;
      const pB = parseInt(hexStr.slice(4, 6), 16) / 255;
      const pColor = new Color3(pR, pG, pB);

      const floatY = this.CFG.HOVER_HEIGHT;
      // Smaller radii so planets look proportional at the correct camera height
      const radius = isCurrent ? 58 : isUnlocked ? 48 : 40;

      // ── Shadow disc ────────────────────────────────────────────────────
      const shadow = MeshBuilder.CreateDisc(`shad_${planet.id}`, { radius: 62, tessellation: 32 }, this.scene);
      shadow.rotation.x = Math.PI / 2;
      shadow.position.set(pos.x, -18, pos.z);
      shadow.isPickable = false;
      const shdMat = new StandardMaterial(`shdMat_${planet.id}`, this.scene);
      shdMat.emissiveColor   = Color3.Black();
      shdMat.alpha           = 0.55;
      shdMat.disableLighting = true;
      shadow.material = shdMat;

      // ── Planet sphere with real image ─────────────────────────────────
      const sphere = MeshBuilder.CreateSphere(`planet_${planet.id}`, {
        diameter: radius * 2,
        segments: 36,
      }, this.scene);
      sphere.position.set(pos.x, floatY, pos.z);
      sphere.material = isUnlocked
        ? this._createPlanetMaterial(planet, pR, pG, pB, isCurrent)
        : this._createLockedMaterial(planet.id);
      if (isUnlocked) this.glowLayer.addIncludedOnlyMesh(sphere);

      // ── Thin atmosphere halo (kept VERY small — 1.12× radius) ─────────
      if (isUnlocked) {
        const atmo = MeshBuilder.CreateSphere(`atmo_${planet.id}`, {
          diameter: radius * 2.24, // was 2.55 — that caused the giant blob
          segments: 14,
        }, this.scene);
        atmo.position.set(pos.x, floatY, pos.z);
        atmo.isPickable = false;
        const atmoMat = new StandardMaterial(`atmoMat_${planet.id}`, this.scene);
        atmoMat.emissiveColor   = pColor.scale(0.45);
        atmoMat.alpha           = isCurrent ? 0.09 : 0.045;  // was 0.15 / 0.07
        atmoMat.backFaceCulling = false;
        atmoMat.disableLighting = true;
        atmo.material = atmoMat;
        // Atmosphere intentionally NOT added to glowLayer — avoids blob FX

        // ── Orbital ring (torus) ────────────────────────────────────────
        const ring = MeshBuilder.CreateTorus(`ring_${planet.id}`, {
          diameter    : radius * 3.0,
          thickness   : isCurrent ? 4.5 : 2.8,
          tessellation: 48,
        }, this.scene);
        ring.position.set(pos.x, floatY, pos.z);
        ring.rotation.x = Math.PI / 2 - 0.28;
        ring.rotation.z = Math.random() * Math.PI;
        ring.isPickable = false;
        const ringMat = new StandardMaterial(`ringMat_${planet.id}`, this.scene);
        ringMat.emissiveColor   = pColor.scale(0.80);
        ringMat.alpha           = isCurrent ? 0.55 : 0.25;
        ringMat.disableLighting = true;
        ring.material = ringMat;
        this.glowLayer.addIncludedOnlyMesh(ring);
        this._animRings.push({
          mesh  : ring,
          speed : (isCurrent ? 0.0040 : 0.0018) + Math.random() * 0.001,
        });
      }

      // ── Current planet: pulsing gold selection ring ────────────────────
      if (isCurrent) {
        const selRing = MeshBuilder.CreateTorus(`selRing_${planet.id}`, {
          diameter: radius * 3.65, thickness: 2.8, tessellation: 64,
        }, this.scene);
        selRing.position.set(pos.x, floatY, pos.z);
        selRing.rotation.x = Math.PI / 2;
        selRing.isPickable = false;
        const selMat = new StandardMaterial(`selMat_${planet.id}`, this.scene);
        selMat.emissiveColor   = new Color3(0.98, 0.82, 0.08);
        selMat.alpha           = 0.88;
        selMat.disableLighting = true;
        selRing.material = selMat;
        this.glowLayer.addIncludedOnlyMesh(selRing);
        this._selRingData = { mesh: selRing, mat: selMat, phase: 0 };

        this._buildCurrentArrow(pos, floatY + radius * 2 + 55);
      }

      // ── Name label billboard ───────────────────────────────────────────
      this._buildPlanetLabel(planet, pos, floatY + radius + 30, isUnlocked, pR, pG, pB);

      // ── Float animation data ───────────────────────────────────────────
      this._planetAnimData.push({
        sphere,
        shadow,
        floatBaseY : floatY,
        fRange     : 18 + Math.random() * 14,
        fDur       : 2200 + Math.random() * 1400,
        phase      : Math.random() * Math.PI * 2,
        isUnlocked,
      });

      if (isUnlocked) {
        sphere.metadata = { rotY: Math.random() * Math.PI * 2, rotSpeed: 0.003 + Math.random() * 0.003 };
      }

      // ── Interaction ────────────────────────────────────────────────────
      sphere.isPickable = isUnlocked;
      if (isUnlocked) {
        sphere.actionManager = new ActionManager(this.scene);
        sphere.actionManager.registerAction(new ExecuteCodeAction(
          ActionManager.OnPointerOverTrigger, () => {
            this._hoverTarget = { mesh: sphere, target: 1.10 };
          }
        ));
        sphere.actionManager.registerAction(new ExecuteCodeAction(
          ActionManager.OnPointerOutTrigger, () => {
            this._hoverTarget = { mesh: sphere, target: 1.00 };
          }
        ));
        sphere.actionManager.registerAction(new ExecuteCodeAction(
          ActionManager.OnPickUpTrigger, () => {
            if (this.dragDistance < 18) {
              this.highlightLayer.removeAllMeshes();
              this.highlightLayer.addMesh(sphere, pColor);
              this.onPlanetSelect(planet);
              this.targetCamX = pos.x;
              this.targetCamZ = pos.z;
            }
          }
        ));
      }

      this._planetMeshes[planet.id] = sphere;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLANET MATERIAL  — uses the actual PNG image from planet.imgSrc
  // ═══════════════════════════════════════════════════════════════════════
  _createPlanetMaterial(planet, pR, pG, pB, isCurrent) {
    const mat = new StandardMaterial(`pMat_${planet.id}`, this.scene);

    // ── Real planet image as diffuse + mild emissive ──────────────────────
    const imgSrc = planet.imgSrc || '/images/planet_base.png';
    const tex    = new Texture(imgSrc, this.scene);
    tex.wrapU    = Texture.WRAP_ADDRESSMODE;
    tex.wrapV    = Texture.WRAP_ADDRESSMODE;

    mat.diffuseTexture  = tex;
    mat.emissiveTexture = tex;
    // Mild self-illumination so planet is visible even in shadow but not glowing
    mat.emissiveColor   = new Color3(pR * 0.22, pG * 0.22, pB * 0.22);
    mat.specularColor   = new Color3(0.18, 0.18, 0.18);
    mat.specularPower   = 32;

    return mat;
  }

  _createLockedMaterial(id) {
    const SIZE   = 256;
    const lkTex  = new DynamicTexture(`lockTex_${id}`, { width: SIZE, height: SIZE }, this.scene, false);
    const ctx    = lkTex.getContext();
    // Dark marbled surface
    ctx.fillStyle = 'rgb(10,12,20)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(40,60,100,${0.04 + i * 0.02})`;
      ctx.lineWidth   = 12 - i;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE * (0.12 + i * 0.08), 0, Math.PI * 2);
      ctx.stroke();
    }
    lkTex.update();

    const mat = new StandardMaterial(`lockedMat_${id}`, this.scene);
    mat.diffuseTexture  = lkTex;
    mat.emissiveColor   = new Color3(0.04, 0.06, 0.12);
    mat.alpha           = 0.45;
    mat.disableLighting = false;
    return mat;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLANET LABEL  (billboard floating above planet)
  // ═══════════════════════════════════════════════════════════════════════
  _buildPlanetLabel(planet, pos, labelY, isUnlocked, pR, pG, pB) {
    const W = 480, H = 96;
    const lTex = new DynamicTexture(`lTex_${planet.id}`, { width: W, height: H }, this.scene, false);
    const ctx  = lTex.getContext();

    // Background pill
    const r = 10;
    ctx.fillStyle = 'rgba(2,6,16,0.82)';
    ctx.beginPath();

    ctx.moveTo(r, 0); ctx.lineTo(W - r, 0);
    ctx.quadraticCurveTo(W, 0, W, r);
    ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
    ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill();

    if (isUnlocked) {
      const hex = `#${[pR, pG, pB].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
      ctx.strokeStyle = hex;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.fillStyle = hex;
      ctx.fillRect(W / 2 - 24, 0, 48, 2);
    }

    ctx.font         = 'bold 30px "Share Tech Mono", monospace, sans-serif';
    ctx.fillStyle    = isUnlocked ? '#e2e8f0' : '#3a4560';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      isUnlocked ? (planet.name?.[this.lang] || planet.name?.en || '?') : '? ? ? ? ?',
      W / 2, H * 0.42
    );

    if (isUnlocked) {
      ctx.font      = '17px "Share Tech Mono", monospace';
      ctx.fillStyle = `rgba(${Math.min(Math.round(pR * 255) + 60, 255)},${Math.min(Math.round(pG * 255) + 60, 255)},${Math.min(Math.round(pB * 255) + 80, 255)},0.65)`;
      ctx.fillText(`SECTOR-${String(planet.id).padStart(2, '0')}`, W / 2, H * 0.75);
    }
    lTex.update();

    const lPlane = MeshBuilder.CreatePlane(`label_${planet.id}`, { width: 230, height: 46 }, this.scene);
    lPlane.position.set(pos.x, labelY, pos.z);
    lPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    lPlane.isPickable    = false;
    const lMat = new StandardMaterial(`lMat_${planet.id}`, this.scene);
    lMat.emissiveTexture  = lTex;
    lMat.opacityTexture   = lTex;
    lMat.disableLighting  = true;
    lMat.backFaceCulling  = false;
    lPlane.material = lMat;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CURRENT PLANET ARROW  (bouncing ▼ indicator above planet)
  // ═══════════════════════════════════════════════════════════════════════
  _buildCurrentArrow(pos, topY) {
    const aTex = new DynamicTexture('arrowTex', { width: 80, height: 80 }, this.scene, false);
    const ctx  = aTex.getContext();
    ctx.font         = 'bold 52px sans-serif';
    ctx.fillStyle    = '#facc15';
    ctx.shadowColor  = '#facc15';
    ctx.shadowBlur   = 16;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼', 40, 40);
    aTex.update();

    const aPlane = MeshBuilder.CreatePlane('arrowPlane', { width: 50, height: 50 }, this.scene);
    aPlane.position.set(pos.x, topY + 18, pos.z);
    aPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    aPlane.isPickable    = false;
    const aMat = new StandardMaterial('arrowMat', this.scene);
    aMat.emissiveTexture  = aTex;
    aMat.opacityTexture   = aTex;
    aMat.disableLighting  = true;
    aMat.backFaceCulling  = false;
    aPlane.material = aMat;
    this.glowLayer.addIncludedOnlyMesh(aPlane);
    this._arrowPlane = { mesh: aPlane, baseY: topY + 18, phase: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COMETS
  // ═══════════════════════════════════════════════════════════════════════
  _startCometTimer() {
    this._spawnComet(); this._spawnComet();
    this._cometInterval = setInterval(() => {
      if (Math.random() < 0.70) this._spawnComet();
    }, 5000);
  }

  _spawnComet() {
    if (!this.scene) return;
    const angle    = 0.45 + Math.random() * 0.90;
    const startX   = (Math.random() - 0.5) * 22000;
    const startZ   = -8000 - Math.random() * 4000;
    const dist     = 5500 + Math.random() * 6500;
    const duration = 3800 + Math.random() * 4500;

    const head = MeshBuilder.CreateSphere(`comet_${Date.now()}`, { diameter: 7, segments: 4 }, this.scene);
    head.position.set(startX, 45, startZ);
    head.isPickable = false;
    const hMat = new StandardMaterial(`cometMat_${Date.now()}`, this.scene);
    hMat.emissiveColor   = new Color3(0.90, 0.96, 1.0);
    hMat.disableLighting = true;
    head.material = hMat;
    this.glowLayer.addIncludedOnlyMesh(head);

    const endX   = startX + Math.cos(angle) * dist;
    const endZ   = startZ + Math.sin(angle) * dist;
    const tStart = performance.now();
    const obs    = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - tStart) / duration;
      if (t >= 1) {
        head.dispose();
        this.scene?.onBeforeRenderObservable.remove(obs);
        return;
      }
      head.position.x = startX + (endX - startX) * t;
      head.position.z = startZ + (endZ - startZ) * t;
      hMat.alpha = Math.min(t * 4, 1) * (1 - Math.max(0, (t - 0.75) / 0.25));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INPUT  (pan + inertia + pinch-to-zoom)
  //
  //  Drag direction fix:
  //   • Screen X → World X  (drag right = camera moves right = map pans left) ✓
  //   • Screen Y → World +Z (drag DOWN = camera moves forward = map pans up)
  //     Previous code had   targetCamZ -= dz  → INVERTED
  //     Fixed to            targetCamZ += dz  → CORRECT
  // ═══════════════════════════════════════════════════════════════════════
  _setupInput() {
    let lastX = 0, lastY = 0;

    const onDown = (e) => {
      this._pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(this._pointers).length === 1) {
        this.isDragging   = true;
        this.dragDistance = 0;
        this.velocity     = { x: 0, z: 0 };
        lastX = e.clientX; lastY = e.clientY;
      }
    };
    const onUp = (e) => {
      delete this._pointers[e.pointerId];
      if (Object.keys(this._pointers).length === 0) {
        this.isDragging = false;
        this._pinchInit = null;
      }
    };
    const onMove = (e) => {
      if (this._pointers[e.pointerId]) {
        this._pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      }
      const keys = Object.keys(this._pointers);

      // ── Pinch zoom ──────────────────────────────────────────────────────
      if (keys.length >= 2) {
        const [k1, k2] = keys;
        const a = this._pointers[k1], b = this._pointers[k2];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (!this._pinchInit) {
          this._pinchInit = { dist, zoom: this.camera.position.y };
        } else {
          this.camera.position.y = Math.max(this.CFG.MIN_ZOOM, Math.min(
            this.CFG.MAX_ZOOM, this._pinchInit.zoom * (this._pinchInit.dist / dist)
          ));
        }
        return;
      }

      // ── Pan ─────────────────────────────────────────────────────────────
      if (this.isDragging && keys.length === 1) {
        const factor = this.camera.position.y / 680;  // scale drag with zoom
        const dx =  (e.clientX - lastX) * factor;
        const dz =  (e.clientY - lastY) * factor;

        // X: drag right → targetCamX decreases (map moves left) — standard pan ✓
        this.velocity.x   = -dx;
        this.targetCamX  -= dx;

        // Z: drag DOWN (+dz) → targetCamZ increases (camera moves forward, map pans up) ✓
        // FIXED: was -= dz (inverted), now += dz (correct)
        this.velocity.z   = dz;
        this.targetCamZ  += dz;

        this.dragDistance += Math.abs(dx) + Math.abs(dz);
        lastX = e.clientX; lastY = e.clientY;
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 55 : -55;
      this.camera.position.y = Math.max(
        this.CFG.MIN_ZOOM,
        Math.min(this.CFG.MAX_ZOOM, this.camera.position.y + delta)
      );
    };

    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointerup',   onUp);
    this.canvas.addEventListener('pointerout',  onUp);
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });

    this._inputCleanup = () => {
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('pointerup',   onUp);
      this.canvas.removeEventListener('pointerout',  onUp);
      this.canvas.removeEventListener('pointermove', onMove);
      this.canvas.removeEventListener('wheel', onWheel);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  RESIZE
  // ═══════════════════════════════════════════════════════════════════════
  _setupResize() {
    this._resizeHandler = () => this.engine?.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  UPDATE LOOP
  // ═══════════════════════════════════════════════════════════════════════
  _update() {
    if (!this.scene || !this.engine) return;
    const dt = this.engine.getDeltaTime() / 16.667;
    const T  = performance.now() / 1000;

    // ── Camera position lerp ─────────────────────────────────────────────
    //   Camera always stays CAM_Z_BACK units behind the look-target in Z.
    const LERP = this.CFG.CAMERA_LERP;
    this.camera.position.x += (this.targetCamX                   - this.camera.position.x) * LERP;
    this.camera.position.z += ((this.targetCamZ - CAM_Z_BACK)    - this.camera.position.z) * LERP;
    // Y changes only via zoom (wheel/pinch) — lerp keeps it smooth
    this.camera.setTarget(new Vector3(
      this.camera.position.x,
      0,
      this.camera.position.z + CAM_Z_BACK + CAM_LOOK_Z
    ));

    // ── Inertia ─────────────────────────────────────────────────────────
    if (!this.isDragging) {
      this.targetCamX  += this.velocity.x * 0.82 * dt;
      this.targetCamZ  += this.velocity.z * 0.82 * dt;
      this.velocity.x  *= 0.87;
      this.velocity.z  *= 0.87;
    }

    // ── Planet float + shadow scale ──────────────────────────────────────
    this._planetAnimData.forEach(d => {
      if (!d.isUnlocked) return;
      const fOff = Math.sin(T * (1000 / d.fDur) * Math.PI * 2 + d.phase) * d.fRange;
      d.sphere.position.y = d.floatBaseY + fOff;
      const scl = Math.max(0.30, 1 - Math.abs(fOff) * 0.004);
      d.shadow.scaling.x = scl * 1.20;
      d.shadow.scaling.z = scl;
      d.shadow.material.alpha = scl * 0.55;
    });

    // ── Planet self-rotation ─────────────────────────────────────────────
    for (const id in this._planetMeshes) {
      const m = this._planetMeshes[id];
      if (m?.metadata?.rotSpeed) m.rotation.y += m.metadata.rotSpeed * dt;
    }

    // ── Ring rotation ────────────────────────────────────────────────────
    this._animRings.forEach(r => { r.mesh.rotation.z += r.speed * dt; });

    // ── Energy orbs ──────────────────────────────────────────────────────
    this._energyOrbs.forEach(orb => {
      const md = orb.metadata;
      if (!md) return;
      md.progress += md.speed * dt * 16.667;
      if (md.progress > 1) md.progress = 0;
      const t = md.progress;
      orb.position.x = md.s.x + (md.e.x - md.s.x) * t;
      orb.position.z = md.s.z + (md.e.z - md.s.z) * t;
      orb.position.y = -10 + Math.sin(t * Math.PI) * 28;
    });

    // ── Selection ring pulse ─────────────────────────────────────────────
    if (this._selRingData) {
      this._selRingData.phase += 0.042 * dt;
      this._selRingData.mat.alpha = 0.58 + Math.sin(this._selRingData.phase) * 0.28;
      this._selRingData.mesh.rotation.y += 0.005 * dt;
    }

    // ── Arrow bounce ─────────────────────────────────────────────────────
    if (this._arrowPlane) {
      this._arrowPlane.phase += 0.055 * dt;
      this._arrowPlane.mesh.position.y =
        this._arrowPlane.baseY + Math.sin(this._arrowPlane.phase) * 15;
    }

    // ── Nebula pulsing ───────────────────────────────────────────────────
    this._nebulaPlanes.forEach(n => {
      n.mesh.material.alpha = 0.04 + Math.sin(T * n.spd + n.phase) * 0.025;
    });

    // ── Cyber grid scroll ────────────────────────────────────────────────
    if (this._gridMesh?.material?.emissiveTexture) {
      this._gridUOff += 0.00008 * dt;
      this._gridVOff += 0.00004 * dt;
      this._gridMesh.material.emissiveTexture.uOffset = this._gridUOff;
      this._gridMesh.material.emissiveTexture.vOffset = this._gridVOff;
    }

    // ── Hover scale lerp ─────────────────────────────────────────────────
    if (this._hoverTarget) {
      const m   = this._hoverTarget.mesh;
      const cur = m.scaling.x;
      const nxt = cur + (this._hoverTarget.target - cur) * 0.14;
      m.scaling.setAll(nxt);
      if (Math.abs(nxt - this._hoverTarget.target) < 0.001) this._hoverTarget = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PUBLIC API — zoom readout for React HUD
  // ═══════════════════════════════════════════════════════════════════════
  getZoomPercent() {
    if (!this.camera) return null;
    const { MIN_ZOOM, MAX_ZOOM } = this.CFG;
    const pct = 1 - (this.camera.position.y - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
    return Math.round(Math.max(0, Math.min(1, pct)) * 200);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DESTROY
  // ═══════════════════════════════════════════════════════════════════════
  destroy() {
    if (this._cometInterval)  clearInterval(this._cometInterval);
    if (this._resizeHandler)  window.removeEventListener('resize', this._resizeHandler);
    if (this._inputCleanup)   this._inputCleanup();
    this.engine?.stopRenderLoop();
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene  = null;
    this.engine = null;
  }
}