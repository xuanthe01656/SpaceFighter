/**
 * Production hostile-projectile presentation V3.2.
 *
 * Gameplay remains owned by CampaignEnemyProjectileV31/CampaignBossCombatV29.
 * This adapter only creates cached emissive visuals and rotates them along the
 * authoritative velocity. Canvas textures are generated once per style; a
 * deterministic low-poly fallback is used by NullEngine/non-DOM hosts.
 */
export const CAMPAIGN_PROJECTILE_VISUAL_VERSION = 'campaign-projectile-visual-v3.2.0';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

export const CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32 = freezeDeep({
  enemy_energy_dart: {
    id: 'enemy_energy_dart', style: 'dart', color: '#ff3f59', core: '#fff4f6', edge: '#24050d',
    width: .34, length: 1.18, pulse: .035, glow: .92,
  },
  enemy_ion_comet: {
    id: 'enemy_ion_comet', style: 'comet', color: '#54d8ff', core: '#f4ffff', edge: '#061827',
    width: .46, length: 1.04, pulse: .070, glow: .88,
  },
  enemy_plasma_slug: {
    id: 'enemy_plasma_slug', style: 'slug', color: '#ff9c2b', core: '#fff5cf', edge: '#2b1003',
    width: .54, length: 1.30, pulse: .045, glow: .96,
  },
  boss_aimed_lance: {
    id: 'boss_aimed_lance', style: 'lance', color: '#ff203f', core: '#ffffff', edge: '#260008',
    width: .42, length: 1.66, pulse: .025, glow: 1,
  },
  boss_fan_needle: {
    id: 'boss_fan_needle', style: 'dart', color: '#ff3b86', core: '#fff0fb', edge: '#260014',
    width: .36, length: 1.34, pulse: .035, glow: .96,
  },
  boss_lane_shard: {
    id: 'boss_lane_shard', style: 'slug', color: '#ff5a22', core: '#fff7df', edge: '#2a0800',
    width: .58, length: 1.54, pulse: .045, glow: 1,
  },
  boss_arc_ember: {
    id: 'boss_arc_ember', style: 'ember', color: '#ff174f', core: '#fff7fb', edge: '#260008',
    width: .46, length: .94, pulse: .085, glow: 1,
  },
  boss_preview_pulse: {
    id: 'boss_preview_pulse', style: 'lance', color: '#ff4d2e', core: '#fff8e8', edge: '#2d0800',
    width: .42, length: 1.42, pulse: .04, glow: .96,
  },
  mini_boss_heavy: {
    id: 'mini_boss_heavy', style: 'slug', color: '#ff334e', core: '#fff4f6', edge: '#260008',
    width: .50, length: 1.42, pulse: .045, glow: .98,
  },
});

export function resolveCampaignProjectileVisualV32({ visualId, sourceRole, priority, pattern } = {}) {
  if (visualId && CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32[visualId]) {
    return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32[visualId];
  }
  if (priority === 'boss') {
    if (pattern === 'fan') return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.boss_fan_needle;
    if (pattern === 'lane_sweep') return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.boss_lane_shard;
    if (pattern === 'radial_gap') return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.boss_arc_ember;
    return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.boss_aimed_lance;
  }
  if (sourceRole === 'support') return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.enemy_ion_comet;
  if (sourceRole === 'artillery') return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.enemy_plasma_slug;
  if (sourceRole === 'boss_preview') return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.boss_preview_pulse;
  if (sourceRole === 'mini_boss') return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.mini_boss_heavy;
  return CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.enemy_energy_dart;
}

const path = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
};

/** Draw one north-facing projectile; runtime rotates the plane to velocity. */
export function drawCampaignProjectileTextureV32(ctx, visual) {
  ctx.clearRect(0, 0, 64, 128);
  const color = visual.color;
  const core = visual.core;
  const edge = visual.edge;
  const gradient = ctx.createLinearGradient(32, 116, 32, 10);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(.32, color);
  gradient.addColorStop(1, core);

  if (visual.style === 'comet' || visual.style === 'ember') {
    ctx.globalAlpha = .34;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(32, 66, visual.style === 'ember' ? 24 : 27, 48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .95;
    ctx.fillStyle = edge;
    ctx.beginPath(); ctx.ellipse(32, 52, visual.style === 'ember' ? 16 : 18, 27, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(32, 49, visual.style === 'ember' ? 12 : 14, 23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.ellipse(29, 43, 5.5, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .65;
    ctx.fillStyle = gradient;
    path(ctx, [[21,55],[43,55],[38,116],[32,104],[26,116]]); ctx.fill();
  } else if (visual.style === 'slug') {
    ctx.globalAlpha = .30;
    ctx.fillStyle = color;
    path(ctx, [[32,7],[58,43],[50,92],[39,116],[25,116],[14,92],[6,43]]); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = edge;
    path(ctx, [[32,13],[51,46],[45,88],[37,107],[27,107],[19,88],[13,46]]); ctx.fill();
    ctx.fillStyle = color;
    path(ctx, [[32,18],[46,49],[41,84],[36,100],[28,100],[23,84],[18,49]]); ctx.fill();
    ctx.fillStyle = core;
    path(ctx, [[32,20],[37,48],[35,83],[32,92],[29,83],[27,48]]); ctx.fill();
  } else {
    const lance = visual.style === 'lance';
    ctx.lineCap = 'round';
    ctx.globalAlpha = .30;
    ctx.strokeStyle = color;
    ctx.lineWidth = lance ? 30 : 27;
    ctx.beginPath(); ctx.moveTo(32, 111); ctx.lineTo(32, 22); ctx.stroke();
    ctx.globalAlpha = .98;
    ctx.strokeStyle = edge;
    ctx.lineWidth = lance ? 21 : 19;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = lance ? 14 : 13;
    ctx.stroke();
    ctx.strokeStyle = core;
    ctx.lineWidth = lance ? 5 : 6;
    ctx.beginPath(); ctx.moveTo(32, 96); ctx.lineTo(32, 22); ctx.stroke();
    ctx.fillStyle = core;
    path(ctx, lance ? [[32,7],[39,25],[32,21],[25,25]] : [[32,9],[40,28],[32,23],[24,28]]); ctx.fill();
    ctx.globalAlpha = .72;
    ctx.fillStyle = gradient;
    path(ctx, [[26,67],[38,67],[35,122],[32,108],[29,122]]); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function campaignProjectileVisualYawV32(vx, vz) {
  // Texture nose points toward local +Y, which becomes world -Z after the
  // top-down plane rotation. Rotate that nose onto the authoritative velocity.
  return Math.atan2(-Number(vx || 0), -Number(vz || 0));
}

export function createCampaignProjectileVisualFactoryV32({ scene, BABYLON } = {}) {
  const appearances = new Map();
  let serial = 0;
  let disposed = false;

  const appearanceFor = visual => {
    if (appearances.has(visual.id)) return appearances.get(visual.id);
    let texture = null;
    let material = null;
    let sprite = false;
    try {
      if (BABYLON?.DynamicTexture && BABYLON?.MeshBuilder?.CreatePlane) {
        texture = new BABYLON.DynamicTexture(`hostile-shot-tex:${visual.id}`,
          { width: 64, height: 128 }, scene, false);
        const ctx = texture.getContext();
        if (!ctx || typeof ctx.createLinearGradient !== 'function') throw new Error('Canvas unavailable');
        drawCampaignProjectileTextureV32(ctx, visual);
        texture.hasAlpha = true;
        texture.level = Math.max(.6, Math.min(1.2, Number(visual.glow) || 1));
        texture.update(false);
        material = new BABYLON.StandardMaterial(`hostile-shot-mat:${visual.id}`, scene);
        material.diffuseTexture = texture;
        material.emissiveTexture = texture;
        material.emissiveColor = BABYLON.Color3.FromHexString('#ffffff');
        material.disableLighting = true;
        material.useAlphaFromDiffuseTexture = true;
        material.backFaceCulling = false;
        material.disableDepthWrite = true;
        if (BABYLON.Material?.MATERIAL_ALPHABLEND !== undefined) {
          material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        }
        sprite = true;
      }
    } catch (_) {
      material?.dispose?.();
      texture?.dispose?.();
      material = null;
      texture = null;
      sprite = false;
    }
    if (!material) {
      material = new BABYLON.StandardMaterial(`hostile-shot-fallback:${visual.id}`, scene);
      material.emissiveColor = BABYLON.Color3.FromHexString(visual.color);
      material.disableLighting = true;
    }
    const appearance = { material, texture, sprite };
    appearances.set(visual.id, appearance);
    return appearance;
  };

  const create = ({ name, visual, position, vx = 0, vz = .4 } = {}) => {
    if (disposed) return null;
    const resolved = visual || CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32.enemy_energy_dart;
    const appearance = appearanceFor(resolved);
    const mesh = appearance.sprite
      ? BABYLON.MeshBuilder.CreatePlane(name || `hostile-shot-${++serial}`,
        { width: resolved.width, height: resolved.length }, scene)
      : (resolved.style === 'comet' || resolved.style === 'ember'
        ? BABYLON.MeshBuilder.CreateSphere(name || `hostile-shot-${++serial}`,
          { diameter: resolved.width, segments: 8 }, scene)
        : BABYLON.MeshBuilder.CreateCylinder(name || `hostile-shot-${++serial}`,
          { height: resolved.length, diameter: resolved.width * .42, tessellation: 8 }, scene));
    mesh.position.copyFrom(position);
    mesh.position.y = .08;
    if (appearance.sprite) mesh.rotation.x = -Math.PI / 2;
    else if (!(resolved.style === 'comet' || resolved.style === 'ember')) mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.y = campaignProjectileVisualYawV32(vx, vz);
    mesh.material = appearance.material;
    mesh.isPickable = false;
    mesh.metadata = {
      ...(mesh.metadata || {}),
      hostileProjectileVisual: resolved.id,
      projectileVisualVersion: CAMPAIGN_PROJECTILE_VISUAL_VERSION,
    };
    mesh._projectileBaseScale = 1;
    return mesh;
  };

  const update = (mesh, vx, vz, nowMs, createdAtMs, pulse = 0) => {
    if (!mesh || mesh.isDisposed?.()) return;
    mesh.rotation.y = campaignProjectileVisualYawV32(vx, vz);
    if (pulse > 0) {
      const scale = 1 + pulse * Math.sin((Number(nowMs) - Number(createdAtMs)) * .028);
      mesh.scaling.x = scale;
      mesh.scaling.y = scale;
      mesh.scaling.z = scale;
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const appearance of appearances.values()) {
      appearance.material?.dispose?.();
      appearance.texture?.dispose?.();
    }
    appearances.clear();
  };
  scene?.onDisposeObservable?.addOnce?.(dispose);
  return { create, update, dispose, cachedAppearanceCount: () => appearances.size };
}

export function auditCampaignProjectileVisualV32() {
  const issues = [];
  for (const [id, visual] of Object.entries(CAMPAIGN_PROJECTILE_VISUAL_CATALOG_V32)) {
    if (visual.id !== id) issues.push(`ID:${id}`);
    if (!(visual.width > 0 && visual.length > visual.width && visual.pulse >= 0)) {
      issues.push(`DIMENSIONS:${id}`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(visual.color) || !/^#[0-9a-f]{6}$/i.test(visual.core)
      || !/^#[0-9a-f]{6}$/i.test(visual.edge)) {
      issues.push(`COLOR:${id}`);
    }
  }
  return Object.freeze(issues);
}
