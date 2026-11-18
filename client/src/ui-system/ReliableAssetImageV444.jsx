/**
 * Space Fighter V4.4.4 reliable image presentation.
 *
 * It advances through distinct candidate URLs and renders an explicit visual
 * fallback after the last failure. This prevents the browser broken-image icon
 * and avoids the old same-src/same-fallback retry loop.
 */
import React, { useEffect, useMemo, useState } from 'react';
import styles from './ReliableAssetImageV444.module.css';

export const RELIABLE_ASSET_IMAGE_VERSION_V444 = 'reliable-asset-image-v4.4.4';

const normalizeCandidates = values => [
  ...new Set((Array.isArray(values) ? values : [values])
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim())),
];

export default function ReliableAssetImageV444({
  candidates = [],
  fallbackSrc = null,
  alt = '',
  className = '',
  fallbackClassName = '',
  placeholder = '◇',
  kind = 'asset',
  assetId = '',
  loading = 'eager',
  decoding = 'async',
  onResolved = null,
}) {
  const sources = useMemo(
    () => normalizeCandidates([...(Array.isArray(candidates) ? candidates : [candidates]), fallbackSrc]),
    [candidates, fallbackSrc],
  );
  const sourceKey = sources.join('|');
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sourceKey]);

  const source = sources[sourceIndex] || null;
  if (!source) {
    return (
      <span
        className={`${styles.fallback} ${fallbackClassName || className}`.trim()}
        data-sf-reliable-image={RELIABLE_ASSET_IMAGE_VERSION_V444}
        data-sf-image-kind={kind}
        data-sf-image-id={assetId || undefined}
        aria-label={alt || undefined}
        role={alt ? 'img' : undefined}
      >
        {placeholder}
      </span>
    );
  }

  return (
    <img
      key={`${sourceKey}:${sourceIndex}`}
      src={source}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      data-sf-reliable-image={RELIABLE_ASSET_IMAGE_VERSION_V444}
      data-sf-image-kind={kind}
      data-sf-image-id={assetId || undefined}
      data-sf-image-candidate={sourceIndex}
      onLoad={() => onResolved?.({ source, sourceIndex, assetId, kind })}
      onError={() => setSourceIndex(index => Math.min(index + 1, sources.length))}
    />
  );
}
