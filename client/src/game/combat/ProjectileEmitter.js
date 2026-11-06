import { advancePlayerProjectile, registerProjectileHit } from './PlayerWeapons.js';
import { projectileFxProfile } from '../rendering/PlayerFxProfiles.js';

/**
 * One player-projectile visual adapter for Campaign and Dungeon.
 * Collision, damage and timing remain owned by the original gameplay path.
 * A small cached Canvas texture provides a glowing center AND a dark contour:
 * weapon colors remain legible on both a dark planet and bright-blue Nereus.
 */
export function drawProjectileTexture(ctx, appearance) {
  const { style, color } = appearance;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.clearRect(0, 0, 64, 128);
  if (style === 'orb') {
    // Soft colored halo around an outlined orb (plasma, EMP, charged shells).
    ctx.fillStyle = hex;
    ctx.globalAlpha = .40;
    ctx.beginPath(); ctx.ellipse(32, 64, 28, 56, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#09192b';
    ctx.beginPath(); ctx.ellipse(32, 64, 23, 46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hex;
    ctx.beginPath(); ctx.ellipse(32, 64, 18, 36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4ffff';
    ctx.beginPath(); ctx.ellipse(28, 56, 7.5, 15, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    // Rounded bolt with tapered nose. Not the old 2.635-unit hard rectangle.
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(32, 105); ctx.lineTo(32, 27);
    ctx.strokeStyle = hex; ctx.globalAlpha = .40; ctx.lineWidth = 31; ctx.stroke();
    ctx.strokeStyle = '#08192b'; ctx.globalAlpha = .97; ctx.lineWidth = 24; ctx.stroke();
    ctx.strokeStyle = hex; ctx.globalAlpha = 1; ctx.lineWidth = 17; ctx.stroke();
    ctx.strokeStyle = '#b6faff'; ctx.lineWidth = 8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(32, 82); ctx.lineTo(32, 25);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(32, 24, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function createProjectileEmitter({ scene, BABYLON, bullets, scheduleBattleTimer }) {
  const appearances = new Map();
  let serial = 0, disposed = false;
  const visualFor = shot => {
    const spec = projectileFxProfile(shot);
    if (!appearances.has(spec.textureKey)) {
      let texture = null, mat = null, sprite = false;
      try {
        if (BABYLON.DynamicTexture && BABYLON.MeshBuilder.CreatePlane) {
          texture = new BABYLON.DynamicTexture(`player-shot-tex:${spec.textureKey}`, { width: 64, height: 128 }, scene, false);
          const ctx = texture.getContext();
          if (!ctx || typeof ctx.createLinearGradient !== 'function') throw new Error('Canvas texture unavailable');
          drawProjectileTexture(ctx, spec);
          texture.hasAlpha = true;
          texture.update(false);
          mat = new BABYLON.StandardMaterial(`player-shot-mat:${spec.textureKey}`, scene);
          mat.diffuseTexture = texture;
          mat.emissiveTexture = texture;
          mat.emissiveColor = BABYLON.Color3.FromHexString('#ffffff');
          mat.disableLighting = true;
          mat.useAlphaFromDiffuseTexture = true;
          mat.backFaceCulling = false;
          mat.disableDepthWrite = true;
          if (BABYLON.Material?.MATERIAL_ALPHABLEND !== undefined)
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
          sprite = true;
        }
      } catch (_) {
        // NullEngine/non-DOM hosts use deterministic geometry instead of failing.
        if (mat) mat.dispose();
        if (texture) texture.dispose();
        texture = null; mat = null; sprite = false;
      }
      if (!mat) {
        mat = new BABYLON.StandardMaterial(`player-shot-fallback:${spec.textureKey}`, scene);
        mat.emissiveColor = BABYLON.Color3.FromHexString(`#${spec.color.toString(16).padStart(6, '0')}`);
        mat.disableLighting = true;
      }
      appearances.set(spec.textureKey, { mat, texture, sprite });
    }
    return { spec, ...appearances.get(spec.textureKey) };
  };

  const create = shot => {
    if (disposed || (typeof scene.isDisposed === 'function' ? scene.isDisposed() : scene.isDisposed)) return;
    const { spec, mat, sprite } = visualFor(shot);
    const mesh = sprite
      ? BABYLON.MeshBuilder.CreatePlane(`player-shot-${++serial}`, { width: spec.width, height: spec.length }, scene)
      : (spec.style === 'orb'
        ? BABYLON.MeshBuilder.CreateSphere(`player-shot-${++serial}`, { diameter: spec.width, segments: 8 }, scene)
        : BABYLON.MeshBuilder.CreateCylinder(`player-shot-${++serial}`,
          { height: spec.length, diameter: spec.width * .42, tessellation: 8 }, scene));
    mesh.position.set(shot.x, .12, shot.z);
    if (spec.style === 'bolt') {
      mesh.rotation.x = sprite ? -Math.PI / 2 : Math.PI / 2;
      mesh.rotation.y = Math.atan2(-shot.vx, -shot.vz);
    } else if (sprite) {
      mesh.rotation.x = -Math.PI / 2;
    }
    mesh.material = mat;
    mesh.metadata = { playerProjectileFx: spec.style, color: spec.color, worldLength: spec.length };
    mesh.atk = shot.atk;
    mesh._vx = shot.vx; mesh._vz = shot.vz;
    mesh.isHoming = shot.homing;
    mesh.target = shot.target;
    mesh._waveAmplitude = shot.waveAmplitude;
    mesh._remainingPenetration = shot.penetration || 1;
    mesh._splashRadius = shot.splashRadius || 0;
    mesh._slowMs = shot.slowMs || 0;
    mesh._projectileType = shot.projectileType;
    mesh._kind = shot.kind;
    bullets.push(mesh);
  };
  const fire = shots => {
    for (const shot of shots) {
      if (shot.delayMs > 0) scheduleBattleTimer(() => create(shot), shot.delayMs);
      else create(shot);
    }
  };
  const advance = (bullet, frameFactor) => {
    advancePlayerProjectile(bullet, frameFactor);
    if (bullet.metadata?.playerProjectileFx === 'bolt')
      bullet.rotation.y = Math.atan2(-bullet._vx, -bullet._vz);
  };
  const registerHit = (bullet, enemy) => registerProjectileHit(bullet, enemy?.mesh?.uniqueId ?? enemy?.uniqueId ?? enemy?.mesh?.id ?? enemy?.id);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const { mat, texture } of appearances.values()) {
      mat.dispose();
      texture?.dispose();
    }
    appearances.clear();
  };
  scene.onDisposeObservable.addOnce(dispose);
  return { fire, advance, registerHit, dispose };
}
