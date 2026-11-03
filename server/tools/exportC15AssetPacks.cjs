'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createC15Rc1bResourceCatalog}=require('../lib/c15Rc1bResourceCatalog.cjs');

const arg=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;};
const root=path.resolve(__dirname,'../..');
const output=path.resolve(arg('--output-dir')||path.join(root,'server/dist/c15-asset-export'));
const assetBaseUrl=String(arg('--asset-base-url')||'').replace(/\/+$/,'');
const assetPathPrefix=String(arg('--asset-prefix')||'spacefighter-assets/c15-rc1b').replace(/^\/+|\/+$/g,'');
const controlBaseUrl=String(arg('--control-base-url')||'https://spacefighter.invalid').replace(/\/+$/,'');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonical=value=>JSON.stringify(value,null,2)+'\n';

if(!assetBaseUrl.startsWith('https://')){
  console.error('Usage: node exportC15AssetPacks.cjs --asset-base-url https://storage.googleapis.com/BUCKET [--asset-prefix path]');
  process.exit(2);
}

const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:controlBaseUrl,assetBaseUrl,assetPathPrefix,generatedAtMs:Date.now()});
fs.rmSync(output,{recursive:true,force:true});
const exportRoot=path.join(output,...assetPathPrefix.split('/'));
fs.mkdirSync(exportRoot,{recursive:true});
const written=[];
for(const pack of catalog.manifest.packs){
  const packRoot=path.join(exportRoot,'packs',pack.id,`v${pack.revision}`);
  fs.mkdirSync(path.join(packRoot,'files'),{recursive:true});
  const descriptor=catalog.getDescriptor(pack.id,pack.revision);
  const descriptorPath=path.join(packRoot,'descriptor.json');
  fs.writeFileSync(descriptorPath,descriptor.bytes);written.push(descriptorPath);
  for(const entry of descriptor.descriptor.files){
    const found=catalog.getFile(pack.id,pack.revision,entry.path);
    const destination=path.join(packRoot,'files',...entry.path.split('/'));
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.copyFileSync(found.absolute,destination);written.push(destination);
    if(fs.statSync(destination).size!==entry.sizeBytes||sha(destination)!==entry.sha256)
      throw new Error(`Exported asset verification failed: ${pack.id}/${entry.path}`);
  }
}
const manifestPath=path.join(output,'manifest.preview.json');
fs.writeFileSync(manifestPath,canonical(catalog.manifest));written.push(manifestPath);
const corsPath=path.join(output,'gcs-cors.json');
fs.writeFileSync(corsPath,canonical([{origin:['http://localhost','capacitor://localhost'],method:['GET','HEAD'],
  responseHeader:['Content-Type','Content-Length','Content-Range','Accept-Ranges','ETag'],maxAgeSeconds:3600}]));written.push(corsPath);
const sums=written.sort().map(file=>`${sha(file)}  ${path.relative(output,file).replaceAll('\\','/')}`).join('\n')+'\n';
fs.writeFileSync(path.join(output,'SHA256SUMS.txt'),sums);
fs.writeFileSync(path.join(output,'UPLOAD_INSTRUCTIONS.txt'),[
  'Generated immutable SpaceFighter asset packs.',
  `Asset base URL: ${assetBaseUrl}`,
  `Asset prefix: ${assetPathPrefix}`,
  '',
  'Example upload (replace BUCKET):',
  `gcloud storage rsync --recursive "${path.join(output,assetPathPrefix)}" "gs://BUCKET/${assetPathPrefix}"`,
  `gcloud storage buckets update gs://BUCKET --cors-file="${corsPath}"`,
  '',
  'Set Cloud Run with --update-env-vars only:',
  `GAME_C15_ASSET_BASE_URL=${assetBaseUrl}`,
  `GAME_C15_ASSET_PATH_PREFIX=${assetPathPrefix}`,
].join('\n')+'\n');
console.log(`C15_ASSET_EXPORT_OK ${output}`);
console.log(`PACKS=${catalog.manifest.packs.length} FILES=${written.length} EXTERNAL=${catalog.externalAssetDelivery}`);
