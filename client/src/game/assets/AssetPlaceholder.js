/**
 * Deterministic, uniquely labeled TEMP thumbnails for ALL catalog IDs.
 * No HTTP, no GPU textures until rendered as img; safe for offline mobile.
 */
const cache = new Map();
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kindIcon = {
  ship: '<path d="M64 13L48 47 15 63 48 72 43 111 64 94 85 111 80 72 113 63 80 47Z"/>',
  pilot: '<circle cx="64" cy="46" r="19"/><path d="M22 110Q22 73 64 73Q106 73 106 110Z"/>',
  equipment: '<path d="M20 61L93 35 105 47 43 74 32 98 18 91 28 71Z"/>',
  enemy: '<path d="M64 16L108 45 92 97 64 112 36 97 20 45Z"/>',
  boss: '<path d="M64 7L89 27 115 33 103 67 115 97 82 111 64 121 46 111 13 97 25 67 13 33 39 27Z"/>',
  dungeon_enemy: '<path d="M64 18L112 64 64 110 16 64Z"/>',
  dungeon_boss: '<circle cx="64" cy="64" r="49"/><circle cx="64" cy="64" r="22"/>',
  projectile: '<path d="M64 6L79 78 64 120 49 78Z"/>',
  effect: '<path d="M64 9L76 42 105 23 92 57 122 64 92 75 105 104 76 89 64 119 51 89 23 104 37 75 7 64 37 53 23 23 51 42Z"/>',
};
export function makeAssetPlaceholder(kind, id, color = '#38bdf8') {
  const safeKind = /^[a-zA-Z_]+$/.test(kind) ? kind : 'enemy';
  const safeId = String(id ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
  const safeColor = /^#[a-f0-9]{6}$/i.test(color) ? color : '#38bdf8';
  const key = `${safeKind}:${safeId}:${safeColor}`;
  if (cache.has(key)) return cache.get(key);
  const shape = kindIcon[safeKind] || kindIcon.enemy;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="c" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${safeColor}"/><stop offset="1" stop-color="#13253c"/></linearGradient></defs><rect width="128" height="128" rx="13" fill="#0d1526"/><g fill="url(#c)" stroke="${safeColor}" stroke-width="2.5" stroke-linejoin="round">${shape}</g><rect x="2" y="98" width="124" height="28" rx="5" fill="#07111c" opacity=".94"/><text x="64" y="110" fill="#90d5e5" font-size="9" text-anchor="middle" font-family="monospace">TEMP / ${esc(safeKind.toUpperCase())}</text><text x="64" y="121" fill="white" font-size="8" text-anchor="middle" font-family="monospace">${esc(safeId.toUpperCase())}</text></svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, uri);
  return uri;
}
