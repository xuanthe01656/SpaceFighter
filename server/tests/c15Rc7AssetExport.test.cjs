'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {createC15Rc1bResourceCatalog}=require('../lib/c15Rc1bResourceCatalog.cjs');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('RC7 catalog can point immutable descriptors and payloads at an external HTTPS asset root',()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://api.example.test',
    assetBaseUrl:'https://storage.googleapis.com/spacefighter-test',assetPathPrefix:'game-assets/c15'});
  assert.equal(catalog.externalAssetDelivery,true);assert.equal(catalog.assetRootUrl,'https://storage.googleapis.com/spacefighter-test/game-assets/c15');
  for(const pack of catalog.manifest.packs){assert.match(pack.url,/^https:\/\/storage\.googleapis\.com\/spacefighter-test\/game-assets\/c15\/packs\//);
    const descriptor=catalog.getDescriptor(pack.id,pack.revision).descriptor;
    for(const file of descriptor.files)assert.match(file.url,/^https:\/\/storage\.googleapis\.com\/spacefighter-test\/game-assets\/c15\/packs\//);}
});

test('RC7 exporter writes verified GCS-ready descriptors, files, CORS and hashes',()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'sf-rc7-assets-'));
  try{
    execFileSync(process.execPath,[path.resolve(__dirname,'../tools/exportC15AssetPacks.cjs'),
      '--asset-base-url','https://storage.googleapis.com/spacefighter-test','--asset-prefix','game-assets/c15','--output-dir',output],{stdio:'pipe'});
    const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.preview.json'),'utf8'));
    assert.equal(manifest.version,'resource-manifest-v1');assert.equal(manifest.packs.length,2);
    assert.ok(fs.existsSync(path.join(output,'gcs-cors.json')));assert.ok(fs.existsSync(path.join(output,'SHA256SUMS.txt')));
    for(const pack of manifest.packs){const descriptorPath=path.join(output,'game-assets/c15/packs',pack.id,`v${pack.revision}`,'descriptor.json');
      assert.equal(sha(descriptorPath),pack.sha256);const descriptor=JSON.parse(fs.readFileSync(descriptorPath,'utf8'));
      for(const file of descriptor.files){const payload=path.join(path.dirname(descriptorPath),'files',file.path);
        assert.equal(fs.statSync(payload).size,file.sizeBytes);assert.equal(sha(payload),file.sha256);}}
  }finally{fs.rmSync(output,{recursive:true,force:true});}
});
