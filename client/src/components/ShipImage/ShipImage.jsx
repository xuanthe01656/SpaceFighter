import React, { useState } from 'react';
import { AIRCRAFTS } from '../../constants';
import { resolveShipVisual } from '../../game/rendering/ShipVisualCatalog';

/** HQ/inventory view driven by the same ship ID and fallback as the battle scenes. */
export default function ShipImage({ aircraftId, view = 'hq', className, style, alt, ...props }) {
  const visual = resolveShipVisual(aircraftId, AIRCRAFTS);
  const preferred = view === 'top' ? visual.previewTopSrc : visual.previewHQSrc;
  const [failedSrc, setFailedSrc] = useState(null);
  const src = failedSrc === preferred ? visual.placeholderSrc : preferred;
  return (
    <img
      {...props}
      src={src}
      className={className}
      style={style}
      alt={alt || visual.aircraft?.name?.en || visual.id || 'Unknown aircraft'}
      draggable={false}
      onError={() => { if (src !== visual.placeholderSrc) setFailedSrc(preferred); }}
    />
  );
}
