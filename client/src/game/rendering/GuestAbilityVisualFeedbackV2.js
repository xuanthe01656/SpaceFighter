/**
 * Lightweight Babylon presentation for Guest Ability Feedback V2.
 *
 * It owns only reusable procedural rings and never changes movement, hitboxes,
 * damage, rewards or network state. The deterministic runtime tick controls all
 * lifetimes so pause/resume cannot leave a visual buff active indefinitely.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createGuestAbilityVisualFeedbackV2({
  scene,
  BABYLON,
  playerRoot,
  shipVisual,
  getTick,
} = {}) {
  if (!scene || !BABYLON || !playerRoot || typeof getTick !== 'function') {
    return Object.freeze({ play() {}, markTarget() {}, update() {}, dispose() {} });
  }

  const makeMaterial = name => {
    const material = new BABYLON.StandardMaterial(name, scene);
    material.diffuseColor = BABYLON.Color3.Black();
    material.emissiveColor = BABYLON.Color3.FromHexString('#5be5f3');
    material.specularColor = BABYLON.Color3.Black();
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.alpha = 0;
    return material;
  };
  const makeRing = (name, diameter, thickness, material, parent = playerRoot) => {
    const mesh = BABYLON.MeshBuilder.CreateTorus(name, {
      diameter,
      thickness,
      tessellation: 48,
    }, scene);
    mesh.parent = parent;
    mesh.position.set(0, .08, 0);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.isVisible = false;
    mesh.renderingGroupId = 2;
    return mesh;
  };
  const setColor = (material, color) => {
    try { material.emissiveColor = BABYLON.Color3.FromHexString(color || '#5be5f3'); }
    catch (_) { material.emissiveColor = BABYLON.Color3.FromHexString('#5be5f3'); }
  };

  const activeMaterial = makeMaterial('guestAbilityV2:activeMat');
  const innerMaterial = makeMaterial('guestAbilityV2:innerMat');
  const pulseMaterial = makeMaterial('guestAbilityV2:pulseMat');
  const targetMaterial = makeMaterial('guestAbilityV2:targetMat');
  const activeRing = makeRing('guestAbilityV2:activeRing', 3.05, .075, activeMaterial);
  const innerRing = makeRing('guestAbilityV2:innerRing', 2.45, .035, innerMaterial);
  const pulseRing = makeRing('guestAbilityV2:pulseRing', 2.45, .11, pulseMaterial);
  const targetRing = makeRing('guestAbilityV2:targetRing', 2.8, .065, targetMaterial, null);

  let activeState = null;
  let pulseState = null;
  let targetState = null;
  let disposed = false;
  let cloakApplied = false;

  function restoreShipVisibility() {
    if (!cloakApplied) return;
    cloakApplied = false;
    shipVisual?.setVisibility?.(1);
  }

  function play(feedback) {
    if (disposed || !feedback) return;
    const tick = Math.max(0, Number(getTick()) || 0);
    const color = feedback.color || '#5be5f3';
    setColor(pulseMaterial, color);
    pulseState = {
      startTick: tick,
      endTick: tick + 16,
      scale: clamp(Number(feedback.pulseScale || 1.45), 1.1, 2.2),
    };
    if (feedback.status === 'activated' && feedback.activeUntilTick > tick) {
      setColor(activeMaterial, color);
      setColor(innerMaterial, feedback.secondary || color);
      activeState = {
        endTick: feedback.activeUntilTick,
        fx: feedback.fx,
      };
    }
  }

  function markTarget(targetMesh, feedback, durationTicks = 0) {
    if (disposed || !targetMesh || targetMesh.isDisposed?.()) return;
    const tick = Math.max(0, Number(getTick()) || 0);
    setColor(targetMaterial, feedback?.color || '#ffd166');
    targetState = {
      mesh: targetMesh,
      endTick: tick + Math.max(1, Math.trunc(Number(durationTicks) || 1)),
    };
  }

  function update() {
    if (disposed) return;
    const tick = Math.max(0, Number(getTick()) || 0);

    if (pulseState && tick < pulseState.endTick) {
      const progress = clamp((tick - pulseState.startTick) / Math.max(1, pulseState.endTick - pulseState.startTick), 0, 1);
      const scale = .72 + progress * pulseState.scale;
      pulseRing.isVisible = true;
      pulseRing.scaling.setAll(scale);
      pulseMaterial.alpha = (1 - progress) * .82;
    } else {
      pulseState = null;
      pulseRing.isVisible = false;
      pulseMaterial.alpha = 0;
    }

    if (activeState && tick < activeState.endTick) {
      const wave = (Math.sin(tick * .28) + 1) * .5;
      activeRing.isVisible = true;
      innerRing.isVisible = true;
      activeRing.scaling.setAll(.96 + wave * .08);
      innerRing.scaling.setAll(1.02 - wave * .05);
      activeMaterial.alpha = .35 + wave * .30;
      innerMaterial.alpha = .22 + (1 - wave) * .22;
      activeRing.rotation.y += .015;
      innerRing.rotation.y -= .02;
      if (activeState.fx === 'cloak') {
        cloakApplied = true;
        shipVisual?.setVisibility?.(.58 + wave * .08);
      } else {
        restoreShipVisibility();
      }
    } else {
      activeState = null;
      activeRing.isVisible = false;
      innerRing.isVisible = false;
      activeMaterial.alpha = 0;
      innerMaterial.alpha = 0;
      restoreShipVisibility();
    }

    const target = targetState?.mesh;
    if (targetState && tick < targetState.endTick && target && !target.isDisposed?.()) {
      const position = target.getAbsolutePosition?.() || target.position;
      targetRing.position.set(position.x, .1, position.z);
      targetRing.isVisible = true;
      targetRing.scaling.setAll(.94 + (Math.sin(tick * .3) + 1) * .06);
      targetRing.rotation.y += .02;
      targetMaterial.alpha = .42 + (Math.sin(tick * .24) + 1) * .18;
    } else {
      targetState = null;
      targetRing.isVisible = false;
      targetMaterial.alpha = 0;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    restoreShipVisibility();
    for (const mesh of [activeRing, innerRing, pulseRing, targetRing]) mesh.dispose();
    for (const material of [activeMaterial, innerMaterial, pulseMaterial, targetMaterial]) material.dispose();
  }

  scene.onDisposeObservable.addOnce(dispose);
  return Object.freeze({ play, markTarget, update, dispose });
}
