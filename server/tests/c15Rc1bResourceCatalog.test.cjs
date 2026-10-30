'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {createC15Rc1bResourceCatalog}=require('../lib/c15Rc1bResourceCatalog.cjs');
const {verifyResourceManifestV1}=require('../lib/resourceManifestV1.cjs');
const sha=value=>createHash('sha256').update(value).digest('hex');

test('C15 RC1B catalog exposes immutable real files and descriptor hashes',()=>{
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://spacefighter.example'});
  assert.equal(verifyResourceManifestV1(catalog.manifest),true);assert.deepEqual(catalog.packIds,['core-bootstrap','campaign-alpha-mobile-low']);
  for(const pack of catalog.manifest.packs){assert.match(pack.url,new RegExp(`/v${pack.revision}/descriptor\\.json$`));assert.doesNotMatch(pack.url,/latest|current/i);
    const found=catalog.getDescriptor(pack.id,pack.revision);assert.equal(sha(found.bytes),pack.sha256);
    assert.equal(found.descriptor.totalBytes,pack.sizeBytes);for(const entry of found.descriptor.files){const file=catalog.getFile(pack.id,pack.revision,entry.path);
      assert.equal(file.sizeBytes,entry.sizeBytes);assert.equal(sha(fs.readFileSync(file.absolute)),entry.sha256);}}
});

test('C15 RC1B catalog rejects non-HTTPS resource authority',()=>{
  assert.throws(()=>createC15Rc1bResourceCatalog({publicBaseUrl:'http://localhost'}),/HTTPS/);
});
