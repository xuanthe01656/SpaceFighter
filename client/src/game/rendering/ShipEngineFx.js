/**
 * Reusable, multi-nozzle engine FX for both battle scenes.
 * Does not mutate ship movement, damage, wallet, or Firebase state.
 * The asset texture and TOTAL particle budget are shared by all nozzles.
 */
import { thrusterFxProfile } from './PlayerFxProfiles.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const colorPart = (color, shift) => ((color >> shift) & 0xff) / 255;

export function createShipEngineFx({ scene, BABYLON, playerRoot, aircraft, quality }) {
  const settings = thrusterFxProfile(aircraft, quality);
  const mountCount = settings.mounts.length;
  // Local texture keeps FX available in offline APK/IPA/WebView.
  const baseUrl = import.meta.env?.BASE_URL || '/';
  const assetUrl = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}images/effects/thruster_glow.png`;
  const flare = new BABYLON.Texture(assetUrl, scene, true, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
  const resources = [];
  for (const nozzle of settings.mounts) {
    const nameSuffix = mountCount === 1 ? '' : `:${nozzle.id}`;
    const mount = new BABYLON.TransformNode(`player:sharedEngineMount${nameSuffix}`, scene);
    mount.parent = playerRoot; // no tilting visual child: hitbox/ship-root stable
    mount.position.set(nozzle.offset.x, nozzle.offset.y, nozzle.offset.z);

    // Distribute budgets across nozzles, never multiply full emit rate by N.
    const rim = new BABYLON.ParticleSystem(`player:engineContrastRim${nameSuffix}`,
      Math.max(1, Math.ceil(settings.rimCapacity / mountCount)), scene);
    const core = new BABYLON.ParticleSystem(`player:engineCore${nameSuffix}`,
      Math.max(1, Math.ceil(settings.coreCapacity / mountCount)), scene);
    for (const ps of [rim, core]) {
      ps.particleTexture = flare;
      ps.emitter = mount;
      ps.minEmitBox = new BABYLON.Vector3(-.12 * settings.scale * nozzle.scale, 0, 0);
      ps.maxEmitBox = new BABYLON.Vector3(.12 * settings.scale * nozzle.scale, 0, 0);
      ps.direction1 = new BABYLON.Vector3(-.06, .02, .60);
      ps.direction2 = new BABYLON.Vector3(.06, .15, .90);
      ps.minEmitPower = 4; ps.maxEmitPower = 8;
      ps.updateSpeed = .02;
    }
    const scale = settings.scale * nozzle.scale;
    const r = colorPart(nozzle.tint, 16), g = colorPart(nozzle.tint, 8), b = colorPart(nozzle.tint, 0);
    core.color1 = new BABYLON.Color4(clamp(r + .35, 0, 1), clamp(g + .35, 0, 1), clamp(b + .35, 0, 1), 1);
    core.color2 = new BABYLON.Color4(clamp(r * .7, 0, 1), clamp(g * .7, 0, 1), clamp(b * .7, 0, 1), .92);
    core.colorDead = new BABYLON.Color4(r * .1, g * .1, b * .1, 0);
    core.minSize = .12 * scale; core.maxSize = .34 * scale;
    core.minLifeTime = .09; core.maxLifeTime = .22;
    core.emitRate = Math.max(1, Math.floor(settings.coreEmitRate / mountCount));
    if (BABYLON.ParticleSystem.BLENDMODE_ONEONE !== undefined)
      core.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;

    rim.color1 = new BABYLON.Color4(.018, .055, .10, .52);
    rim.color2 = new BABYLON.Color4(.025, .095, .16, .28);
    rim.colorDead = new BABYLON.Color4(0, 0, .03, 0);
    rim.minSize = .32 * scale; rim.maxSize = .50 * scale;
    rim.minLifeTime = .10; rim.maxLifeTime = .25;
    rim.emitRate = Math.max(1, Math.floor(settings.rimEmitRate / mountCount));
    if (BABYLON.ParticleSystem.BLENDMODE_STANDARD !== undefined)
      rim.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    resources.push({ mount, rim, core });
  }

  let disposed = false;
  const stop = () => {
    if (disposed) return;
    for (const { rim, core } of resources) { core.stop(); rim.stop(); }
  };
  const dispose = () => {
    if (disposed) return;
    stop();
    disposed = true;
    for (const { mount, rim, core } of resources) {
      core.dispose(); rim.dispose(); mount.dispose();
    }
    flare.dispose();
  };
  scene.onDisposeObservable.addOnce(dispose);
  for (const { rim, core } of resources) { rim.start(); core.start(); }
  return { stop, dispose, getDebugInfo: () => ({ ...settings, localTexture: assetUrl }) };
}
