import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function imageDimensions(bytes, extension) {
  if (extension === 'png') {
    if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('invalid PNG header');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (extension === 'webp') {
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('invalid WebP header');
    const fourcc = bytes.toString('ascii', 12, 16);
    if (fourcc === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    if (fourcc === 'VP8 ') {
      if (bytes.toString('hex', 23, 26) !== '9d012a') throw new Error('invalid VP8 sync word');
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      if (bytes[20] !== 0x2f) throw new Error('invalid VP8L signature');
      const n = bytes.readUInt32LE(21);
      return { width: 1 + (n & 0x3fff), height: 1 + ((n >>> 14) & 0x3fff) };
    }
    throw new Error(`unsupported WebP codec ${fourcc}`);
  }
  throw new Error(`unsupported image extension ${extension}; use PNG or WebP`);
}

export function collectBackgroundAssets(catalog) {
  const collection = [];
  for (const [backgroundId, entry] of Object.entries(catalog)) {
    for (const layer of entry.layers) {
      collection.push({backgroundId, layerId:layer.id, role:layer.role, quality:'base', src:layer.src,
        width:layer.imageWidth, height:layer.imageHeight, licenseStatus:entry.licenseStatus, catalogStatus:entry.status});
      for (const [quality, v] of Object.entries(layer.qualityVariants || {})) {
        collection.push({backgroundId, layerId:layer.id, role:layer.role, quality, src:v.src,
          width:v.imageWidth, height:v.imageHeight, licenseStatus:entry.licenseStatus, catalogStatus:entry.status});
      }
    }
  }
  return collection.sort((a,b) => `${a.backgroundId}/${a.layerId}/${a.quality}`.localeCompare(`${b.backgroundId}/${b.layerId}/${b.quality}`));
}

export function buildBackgroundAssetManifest(catalog, publicRoot, versions) {
  const assets = [];
  for (const item of collectBackgroundAssets(catalog)) {
    if (!/^\/images\/backgrounds\/[a-z0-9/_\-.]+\.(webp|png)$/i.test(item.src) || item.src.includes('..')) throw new Error(`unsafe asset path: ${item.src}`);
    const file = path.join(publicRoot, item.src.substring(1));
    if (!fs.existsSync(file)) throw new Error(`asset missing: ${item.src}`);
    const bytes = fs.readFileSync(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const dimensions = imageDimensions(bytes, ext);
    if (dimensions.width !== item.width || dimensions.height !== item.height) throw new Error(`asset dimension mismatch: ${item.src}`);
    if (bytes.length < 1024 || bytes.length > 1_500_000) throw new Error(`asset size budget exceeded: ${item.src}`);
    if (item.quality === 'mobileLow' && (item.width > 512 || item.height > 1024)) throw new Error(`mobileLow texture too large: ${item.src}`);
    assets.push({...item, bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  return {
    manifestSchema:'space-fighter-background-assets/v1',
    catalogVersion:versions.catalogVersion,
    artDirectionVersion:versions.artDirectionVersion,
    generatedDeterministically:true,
    licensingNote:'Automated checks cannot establish ownership; production approval requires independent human evidence.',
    assets,
  };
}
