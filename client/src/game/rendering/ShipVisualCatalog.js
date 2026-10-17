/**
 * Phase Graphics 2.1: one aircraft ID => one visual identity in HQ and battles.
 * Pure module so it can be checked in Node without Babylon or React.
 * This module never substitutes X-Wing for missing/unknown aircraft assets.
 */
import { SHIP_ASSET_MANIFEST } from './shipAssets.generated.js';

const shipHash = id => {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const hex = (number, fallback = 0x38bdf8) => `#${(Number.isInteger(number) ? number : fallback).toString(16).padStart(6, '0').slice(-6)}`;

/** Ordered outline on X,Z plane; nose is -Z / top of SVG. */
export function shipOutline(id, role = 'fighter') {
  const hash = shipHash(id);
  const heavy = ['tank', 'dreadnought', 'cruiser', 'destroyer'].includes(role);
  const reach = heavy ? 0.99 : 0.75;
  const shoulder = 0.3 + (hash % 5) * 0.035;
  const wingZ = -0.23 + ((hash >>> 5) % 5) * 0.065;
  const tailX = heavy ? 0.43 : 0.31;
  const spine = -0.87 - ((hash >>> 12) % 4) * 0.042;
  const right = [
    [0, spine],
    [0.13, -0.52],
    [shoulder, -0.36],
    [reach, wingZ],
    [reach * (heavy ? 0.91 : 0.72), wingZ + 0.37],
    [tailX, 0.36],
    [tailX * 0.74, 0.78],
    [0, 0.62],
  ];
  return [...right, ...right.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
}

function svgPlaceholder(id, color, role) {
  const outline = shipOutline(id, role);
  const points = outline.map(([x,z]) => `${(128+x*98).toFixed(1)},${(128+z*98).toFixed(1)}`).join(' ');
  // All string interpolation is restricted to number-derived paint and filtered ID.
  const label = String(id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 22).toUpperCase();
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#38bdf8';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><linearGradient id="ship" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${safeColor}"/><stop offset="1" stop-color="#101b37"/></linearGradient></defs><polygon points="${points}" fill="url(#ship)" stroke="${safeColor}" stroke-width="3" stroke-linejoin="round"/><path d="M128 39 L128 174 M110 132 L146 132" stroke="#e6faff" stroke-width="4" opacity=".85"/><text x="128" y="246" font-size="10" fill="#cdd8ec" text-anchor="middle" font-family="monospace">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function resolveShipVisual(aircraftId, aircraftCatalog = []) {
  const id = typeof aircraftId === 'string' ? aircraftId : '';
  const aircraft = aircraftCatalog.find(a => a.id === id) || null;
  const asset = aircraft ? SHIP_ASSET_MANIFEST[id] : null;
  const color = hex(aircraft?.engineFlameTint, shipHash(id) & 0xffffff);
  const role = aircraft?.role || 'fighter';
  const placeholder = svgPlaceholder(id, color, role);
  const hasModel = Boolean(aircraft?.modelSrc && asset?.model);
  const hasTop = Boolean(aircraft?.imgTop && asset?.top);
  const hasHQ = Boolean(aircraft?.imgHq && asset?.hq);
  const missing = [];
  if (!hasHQ) missing.push('hq');
  if (!hasTop) missing.push('top');
  if (!hasModel) missing.push('model');
  return Object.freeze({
    id, aircraft, known: Boolean(aircraft), color, role,
    modelSrc: hasModel ? aircraft.modelSrc : null,
    modelBytes: hasModel ? asset.modelBytes : 0,
    modelTriangles: hasModel ? asset.modelTriangles : 0,
    topSrc: hasTop ? aircraft.imgTop : null,
    // X-Wing-specific UV correction. Other aircraft keep their 2.1.1 orientation.
    spriteInvertY: aircraft?.spriteInvertY === true,
    hqSrc: hasHQ ? aircraft.imgHq : null,
    previewTopSrc: hasTop ? aircraft.imgTop : placeholder,
    previewHQSrc: hasHQ ? aircraft.imgHq : hasTop ? aircraft.imgTop : placeholder,
    placeholderSrc: placeholder,
    runtimeMode: hasModel ? 'model' : hasTop ? 'sprite' : 'procedural',
    missing,
    silhouette: shipOutline(id, role),
  });
}

/**
 * Safe default until Graphics 2.2 produces optimized LOD meshes. A model with
 * excessive triangle count should not auto-load on battery-constrained devices.
 * Explicit quality can be passed by a future Graphics Settings component.
 */
export function chooseShipRenderQuality(visual, userAgent = globalThis.navigator?.userAgent || '') {
  if (!visual?.modelSrc) return visual?.topSrc ? 'sprite' : 'procedural';
  // Graphics 2.1.3: X-Wing's supplied 57.8 MB GLB does not match the
  // approved cyan/white top art, and exceeds the safe default poly budget.
  // Use the same top sprite for desktop and mobile. Developers can still
  // explicitly request quality='auto' in createPlayerShipVisual to QA GLB.
  // IMPORTANT: do not rotate GLB to repair an art-style/model mismatch.
  const heavyweight = visual.modelTriangles > 150000 || visual.modelBytes > 8 * 1024 * 1024;
  return heavyweight && visual.topSrc ? 'sprite' : 'auto';
}
