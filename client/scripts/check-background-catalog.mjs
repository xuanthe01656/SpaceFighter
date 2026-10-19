import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATTLE_BACKGROUND_CATALOG, BATTLE_BACKGROUND_BINDINGS,
  BACKGROUND_CATALOG_VERSION, resolveBattleBackground, BACKGROUND_SCROLL_DIRECTIONS,
  BACKGROUND_ART_BIOMES, BACKGROUND_ART_ROADMAP, BACKGROUND_COMBAT_READABILITY } from '../src/game/catalog/BackgroundCatalog.js';
import { imageDimensions as assetImageDimensions } from './lib/background-asset-utils.mjs';

const check = (v, msg) => { if (!v) throw new Error(`BACKGROUND_CATALOG_INVALID: ${msg}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supported = ['webp','png','jpg','jpeg'];
function webpDimensions(buffer) {
  check(buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP','bad WEBP RIFF header');
  const tag = buffer.toString('ascii',12,16);
  if(tag==='VP8X') return {width:1+buffer.readUIntLE(24,3),height:1+buffer.readUIntLE(27,3)};
  if(tag==='VP8 ') {
    check(buffer.toString('hex',23,26)==='9d012a','bad VP8 sync');
    return {width:buffer.readUInt16LE(26)&0x3fff,height:buffer.readUInt16LE(28)&0x3fff};
  }
  if(tag==='VP8L') {
    check(buffer[20]===0x2f,'bad VP8L signature');
    const n = buffer.readUInt32LE(21);
    return {width:1+(n&0x3fff),height:1+((n>>>14)&0x3fff)};
  }
  throw new Error(`Unsupported WEBP bitstream chunk ${tag}`);
}
function imageDimensions(bytes, ext) {
  if (ext === 'webp') return webpDimensions(bytes);
  if (ext === 'png') {
    check(bytes.toString('hex',0,8)==='89504e470d0a1a0a','bad PNG signature');
    return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  }
  return null; // JPEG can be catalogued, but production requires WebP/PNG for validation.
}
check(/^\d+\.\d+\.\d+$/.test(BACKGROUND_CATALOG_VERSION),'catalog must be semver');
const ids=new Set();let layerCount=0,totalBytes=0;
for(const [id,entry] of Object.entries(BATTLE_BACKGROUND_CATALOG)) {
  check(/^[a-z][a-z0-9_]+$/.test(id),'invalid id');
  check(id===entry.id,`id mismatch ${id}`);
  check(!ids.has(id),`duplicate ${id}`);ids.add(id);
  check(Number.isInteger(entry.revision)&&entry.revision>=1,`revision invalid ${id}`);
  check(entry.status==='demo'||entry.status==='candidate'||entry.status==='production',`status invalid ${id}`);
  check(BACKGROUND_ART_BIOMES[entry.artDirectionId] && entry.artDirectionId===entry.biome,`art direction not registered ${id}`);
  check(['prototype_qa','review','released'].includes(entry.artPipelineStatus),`art pipeline status ${id}`);
  if(entry.status==='candidate') check(entry.licenseStatus==='prototype_only' && entry.artPipelineStatus==='review',`unapproved BG4 candidate ${id}`);
  check(typeof entry.biome==='string' && entry.biome.length>=3,`biome invalid ${id}`);
  check(typeof entry.name?.vi==='string'&&typeof entry.name?.en==='string',`translations missing ${id}`);
  check(/^#[0-9a-f]{6}$/i.test(entry.fallbackColor),`fallback color invalid ${id}`);
  if(entry.status==='production') {
    check(entry.licenseStatus==='approved',`production background needs license approval ${id}`);
    check(entry.artPipelineStatus==='released',`production background needs released art ${id}`);
    check(typeof entry.releaseEvidenceId==='string' && /^BGREL-[A-Z0-9-]{6,}$/.test(entry.releaseEvidenceId),`production asset missing release evidence ID ${id}`);
  }
  check(Object.values(BACKGROUND_SCROLL_DIRECTIONS).includes(entry.scrollDirection),`invalid scroll direction ${id}`);
  check(Number.isFinite(entry.loadTimeoutMs)&&entry.loadTimeoutMs>=3000&&entry.loadTimeoutMs<=60000,`load timeout ${id}`);
  check(Array.isArray(entry.layers) && entry.layers.length>=1 && entry.layers.length<=3,`layers 1-3 ${id}`);
  check(entry.layers[0].role==='base',`first layer must be base ${id}`);
  for(const q of ['desktop','mobile','mobileLow']) check(Number.isInteger(entry.layerLimit?.[q])&&entry.layerLimit[q]>=1&&entry.layerLimit[q]<=3,`layer limit ${id}/${q}`);
  const seen=new Set();
  for(const l of entry.layers) {
    layerCount++;
    check(/^[a-z][a-z0-9_]+$/.test(l.id) && !seen.has(l.id),`layer id ${id}`);seen.add(l.id);
    check(['base','overlay','weather'].includes(l.role),`unknown layer role ${id}/${l.id}`);
    check(l.fit==='cover' && l.tiling==='repeat-y',`unsupported layer fit/repeat ${id}/${l.id}`);
    check(Number.isFinite(l.scrollCssPixelsPerSecond)&&l.scrollCssPixelsPerSecond>=0&&l.scrollCssPixelsPerSecond<=300,`CSS scroll speed invalid ${id}/${l.id}`);
    check(l.scrollDirection === undefined || Object.values(BACKGROUND_SCROLL_DIRECTIONS).includes(l.scrollDirection),`layer direction invalid ${id}/${l.id}`);
    check(l.seamlessY === true,`non-seamless Y tile cannot repeat ${id}/${l.id}`);
    if (entry.status === 'production') check(l.artReview === 'approved',`production artwork review required ${id}/${l.id}`);
    check(Number.isFinite(l.opacity)&&l.opacity>0&&l.opacity<=1,`opacity invalid ${id}/${l.id}`);
    check(Number.isInteger(l.priority),`priority invalid ${id}/${l.id}`);
    check(l.src.startsWith('/images/backgrounds/') && !l.src.includes('..') && !l.src.includes('\\'),`unsafe asset path ${id}/${l.id}`);
    const ext=l.src.split('.').pop().toLowerCase();
    check(supported.includes(ext),`unsupported format ${id}/${l.id}`);
    const abs=path.join(root,'public',l.src.slice(1));
    check(fs.existsSync(abs),`missing asset ${id}/${l.id}: ${abs}`);
    const size=fs.statSync(abs).size;totalBytes+=size;
    check(size>1000 && size<=1_500_000,`size budget exceeded ${id}/${l.id}`);
    const dimensions=imageDimensions(fs.readFileSync(abs),ext);
    check(dimensions!==null,`use decodable WebP or PNG for verified assets ${id}/${l.id}`);
    check(dimensions.width===l.imageWidth && dimensions.height===l.imageHeight,`dimension mismatch ${id}/${l.id}`);
    check(dimensions.width<=2048&&dimensions.height<=4096,`texture resolution budget ${id}/${l.id}`);
    for(const [quality,variant] of Object.entries(l.qualityVariants||{})) {
      check(['desktop','mobile','mobileLow'].includes(quality),`invalid quality variant ${id}/${l.id}/${quality}`);
      check(variant.src!==l.src && /^\/images\/backgrounds\/[a-z0-9/_\-.]+\.(webp|png)$/i.test(variant.src) && !variant.src.includes('..'),`variant path unsafe ${id}/${l.id}/${quality}`);
      check(Number.isInteger(variant.imageWidth)&&Number.isInteger(variant.imageHeight),`variant dimensions missing ${id}/${l.id}/${quality}`);
      const f=path.join(root,'public',variant.src.slice(1));
      check(fs.existsSync(f),`variant missing ${id}/${l.id}/${quality}`);
      const bytes=fs.readFileSync(f);
      check(bytes.length>=1024 && bytes.length<=1500000,`variant file budget ${id}/${l.id}/${quality}`);
      const size=assetImageDimensions(bytes, path.extname(f).slice(1).toLowerCase());
      check(size.width===variant.imageWidth&&size.height===variant.imageHeight,`variant dimensions mismatch ${id}/${l.id}/${quality}`);
      if(quality==='mobileLow') check(size.width<=512&&size.height<=1024,`mobileLow variant dimensions too large ${id}/${l.id}`);
      totalBytes+=bytes.length;
    }
  }
}
for(const [planetId,loc] of Object.entries(BATTLE_BACKGROUND_BINDINGS.campaign)) {
  check(Number.isInteger(Number(planetId)) && Number(planetId)>0,`invalid planetId ${planetId}`);
  check(ids.has(loc.defaultId),`unknown campaign default ${planetId}`);
  const ranges = loc.stageRanges || [];
  let previousTo = 0;
  for (const range of ranges) {
    check(Number.isInteger(range.from)&&Number.isInteger(range.to)&&range.from>=1&&range.from<=range.to&&range.to<=1000,`range bounds invalid ${planetId}`);
    check(range.from>previousTo,`overlapping or unsorted stage ranges ${planetId}`);
    check(ids.has(range.id),`unknown stage range background ${planetId}`);
    previousTo=range.to;
  }
  for (const [stage,variantId] of Object.entries(loc.stages)) {
    check(Number.isInteger(Number(stage))&&Number(stage)>=1&&Number(stage)<=1000,`stage invalid ${stage}`);
    check(ids.has(variantId),`unknown stage background ${stage}`);
  }
}
for(const [dungeonId,id] of Object.entries(BATTLE_BACKGROUND_BINDINGS.dungeon)) {
  check(/^dung_[a-z]+$/.test(dungeonId) && ids.has(id),`invalid dungeon binding ${dungeonId}`);
}
check(BACKGROUND_COMBAT_READABILITY.centerLane.xMin>=0&&BACKGROUND_COMBAT_READABILITY.centerLane.xMax<=1,'safe center lane coordinates');
for (const [id,profile] of Object.entries(BACKGROUND_ART_BIOMES)) {
  check(id===profile.id && profile.palette.length>=3 && profile.keepCenterOpen,`biome art brief ${id}`);
}
for(const item of BACKGROUND_ART_ROADMAP) {
  check(BACKGROUND_ART_BIOMES[item.biomeId] && item.status==='planned',`invalid future art brief ${item.artBriefId}`);
  check(item.stageFrom<=item.stageTo,`invalid stage range ${item.artBriefId}`);
  // Planned art must not be bound to runtime until image+rights approval.
  check(!ids.has(item.artBriefId),`planned art inadvertently registered ${item.artBriefId}`);
}
check(resolveBattleBackground({mode:'campaign',planetId:1,stage:1})?.id==='alpha_coast_demo','Alpha binding');
check(resolveBattleBackground({mode:'dungeon',dungeonId:'dung_nereus'})?.id==='nereus_ocean_demo','Nereus binding');
console.log(`PASS BackgroundCatalog ${BACKGROUND_CATALOG_VERSION}: ${ids.size} registered backgrounds, ${Object.keys(BACKGROUND_ART_BIOMES).length} future biome briefs, ${layerCount} active layers, ${(totalBytes/1024).toFixed(1)} KiB compressed (incl. mobileLow).`);
console.log('PASS stage/range bindings, CSS scroll direction/speed, seam declarations, asset signatures, license gates and fallback eligibility.');
