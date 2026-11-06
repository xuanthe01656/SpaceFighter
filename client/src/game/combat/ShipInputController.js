/**
 * Shared Campaign/Dungeon ship controller.
 * Uses DOM Pointer Events (not mouse+touch hybrids or Babylon picking) so the
 * same canvas input works on desktop browsers, Android emulation and phones.
 * This module intentionally does not import Babylon: the scene supplies its
 * position and tilt node; geometry and the authoritative battle ticket stay
 * independent of player input.
 */
import { frameScale, scaledLerpFactor } from '../../utils/frameTime.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const DIRECTION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']);

export function worldDragDelta(deltaX, deltaY, canvasWidth, canvasHeight, halfHeight, aspect, speedMultiplier = 1) {
  if (!(canvasWidth > 0 && canvasHeight > 0 && halfHeight > 0 && aspect > 0)) return { x: 0, z: 0 };
  const speed = clamp(Number(speedMultiplier) || 0, 0, 5);
  return {
    // Current overhead Babylon camera projects world -X to screen right, +Z downward.
    // Preserve the mobile drag direction that was already working in Campaign.
    x: -deltaX * (2 * halfHeight * aspect / canvasWidth) * speed,
    z: deltaY * (2 * halfHeight / canvasHeight) * speed,
  };
}

export function keyboardVector(keys) {
  let x = Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft'));
  let z = Number(keys.has('s') || keys.has('ArrowDown')) - Number(keys.has('w') || keys.has('ArrowUp'));
  const length = Math.hypot(x, z);
  if (length > 1) { x /= length; z /= length; }
  return { x, z };
}

export function createShipInputController({ canvas, scene, engine, playerRoot, tiltNode,
  halfHeight = 15, aspect, speedMultiplier = 1, pointerSpeedMultiplier = 1,
  enabled = () => true, inset = 1.8, keyboardUnitsPerFrame = 0.30 }) {
  if (!canvas || !scene || !playerRoot || typeof aspect !== 'function') {
    throw new Error('ShipInputController: canvas, scene, playerRoot and aspect are required');
  }
  const browser = canvas.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
  const previousTouchAction = canvas.style.touchAction;
  const previousTabIndex = canvas.getAttribute?.('tabindex');
  canvas.style.touchAction = 'none';
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;

  let pointerId = null;
  let lastX = 0, lastY = 0, disposed = false;
  const heldKeys = new Set();
  const usable = () => !disposed && enabled();
  const clampPosition = () => {
    const limitX = Math.max(0, halfHeight * aspect() - inset);
    const limitZ = Math.max(0, halfHeight - inset);
    playerRoot.position.x = clamp(playerRoot.position.x, -limitX, limitX);
    playerRoot.position.z = clamp(playerRoot.position.z, -limitZ, limitZ);
  };
  const applyDelta = (dx, dz, frameFactor = 1) => {
    playerRoot.position.x += dx;
    playerRoot.position.z += dz;
    clampPosition();
    if (tiltNode && (typeof tiltNode.isDisposed !== 'function' || !tiltNode.isDisposed())) {
      if (tiltNode?.rotation) {
        const tilt = clamp(dx * 0.16, -0.35, 0.35);
        tiltNode.rotation.z += (tilt - tiltNode.rotation.z) * scaledLerpFactor(.14, frameFactor);
      }
    }
  };
  const down = e => {
    if (!usable() || pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    try { canvas.setPointerCapture?.(pointerId); } catch (_) { /* capture can be unsupported */ }
    if (e.cancelable) e.preventDefault();
    try { canvas.focus?.({ preventScroll: true }); } catch (_) { canvas.focus?.(); }
  };
  const move = e => {
    if (!usable() || e.pointerId !== pointerId) return;
    const rect = canvas.getBoundingClientRect();
    // Direct touch/mouse drag is a screen-to-world mapping, not a ship-stat gain.
    // Applying aircraft speed here made heavy ships fall behind the finger and
    // fast ships overshoot it. Ship speed still affects keyboard movement and
    // remains available to the deterministic combat/rating layers.
    const { x, z } = worldDragDelta(e.clientX - lastX, e.clientY - lastY,
      rect.width, rect.height, halfHeight, aspect(), pointerSpeedMultiplier);
    applyDelta(x, z);
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.cancelable) e.preventDefault();
  };
  const up = e => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    try { if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  const lostCapture = e => { if (e.pointerId === pointerId) pointerId = null; };
  const onKeyDown = e => {
    const key = e.key?.length === 1 ? e.key.toLowerCase() : e.key;
    if (!usable() || !DIRECTION_KEYS.has(key) || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return;
    heldKeys.add(key);
    if (e.cancelable) e.preventDefault();
  };
  const onKeyUp = e => {
    const key = e.key?.length === 1 ? e.key.toLowerCase() : e.key;
    heldKeys.delete(key);
  };
  const onBlur = () => { pointerId = null; heldKeys.clear(); };
  const releaseOutsideCanvas = e => { if (pointerId !== null && e.pointerId === pointerId) up(e); };
  canvas.addEventListener('pointerdown', down, { passive: false, capture: true });
  canvas.addEventListener('pointermove', move, { passive: false, capture: true });
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', lostCapture);
  browser?.addEventListener('keydown', onKeyDown);
  browser?.addEventListener('keyup', onKeyUp);
  browser?.addEventListener('blur', onBlur);
  browser?.addEventListener('pointerup', releaseOutsideCanvas);
  browser?.addEventListener('pointercancel', releaseOutsideCanvas);

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!usable()) { heldKeys.clear(); return; }
    const direction = keyboardVector(heldKeys);
    if (direction.x || direction.z) {
      const frameFactor = frameScale(engine?.getDeltaTime?.() || 16.667);
      const speed = keyboardUnitsPerFrame * clamp(Number(speedMultiplier) || 0, 0, 5) * frameFactor;
      applyDelta(-direction.x * speed, direction.z * speed, frameFactor);
    }
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('pointerdown', down, true);
    canvas.removeEventListener('pointermove', move, true);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('lostpointercapture', lostCapture);
    browser?.removeEventListener('keydown', onKeyDown);
    browser?.removeEventListener('keyup', onKeyUp);
    browser?.removeEventListener('blur', onBlur);
    browser?.removeEventListener('pointerup', releaseOutsideCanvas);
    browser?.removeEventListener('pointercancel', releaseOutsideCanvas);
    scene.onBeforeRenderObservable.remove(observer);
    onBlur();
    canvas.style.touchAction = previousTouchAction;
    if (previousTabIndex === null) canvas.removeAttribute?.('tabindex');
    else canvas.setAttribute?.('tabindex', previousTabIndex);
  };
  scene.onDisposeObservable.addOnce(dispose);
  return { isDragging: () => pointerId !== null, dispose };
}
