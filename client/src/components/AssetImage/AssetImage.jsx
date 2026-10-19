import React, { useEffect, useState } from 'react';
import { resolveAssetVisual } from '../../game/assets/AssetRegistry.js';
import { makeAssetPlaceholder } from '../../game/assets/AssetPlaceholder.js';

/** Shared visual thumbnail for catalog-backed equipment/pilots/enemies/bosses.
 * Sources must appear in the generated availability manifest; no broken 404s.
 * The component itself is data-only: it never touches wallet or inventory.
 */
export default function AssetImage({ kind, assetId, alt, className, style, ...props }) {
  const visual = resolveAssetVisual(kind, assetId);
  const fallback = makeAssetPlaceholder(kind, assetId, visual?.tint);
  const preferred = visual?.iconSrc || fallback;
  const [failedSrc, setFailedSrc] = useState(null);
  useEffect(() => { setFailedSrc(null); }, [preferred]);
  const src = failedSrc === preferred ? fallback : preferred;
  return <img {...props} src={src} alt={alt || assetId || kind} className={className}
    style={{objectFit:'contain', ...style}} draggable={false}
    onError={() => { if (src !== fallback) setFailedSrc(preferred); }} />;
}
