'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createResourceManifestV1,verifyResourceManifestV1}=require('../lib/resourceManifestV1.cjs');
function packs(){return [{id:'core-bootstrap',revision:1,sha256:'1'.repeat(64),sizeBytes:100,quality:'bootstrap',required:true,stageKeys:[],url:'https://cdn.example.invalid/packs/core-bootstrap/v1/core.zip',minAppVersion:'1.0.0',contentTypes:['ui'],dependencies:[]},{id:'alpha-mobile-low',revision:2,sha256:'2'.repeat(64),sizeBytes:1000,quality:'mobile-low',required:true,stageKeys:['alpha-stage-1'],url:'https://cdn.example.invalid/packs/alpha-mobile-low/v2/alpha.zip',minAppVersion:'1.0.0',contentTypes:['background','enemy-atlas'],dependencies:['core-bootstrap']}];}
test('server creates deterministic immutable resource manifest',()=>{
  const a=createResourceManifestV1({generatedAtMs:1,catalogVersion:'product-v1.0.0',packs:packs()});
  const b=createResourceManifestV1({generatedAtMs:1,catalogVersion:'product-v1.0.0',packs:packs().reverse()});
  assert.equal(a.manifestDigest,b.manifestDigest);assert.equal(verifyResourceManifestV1(a),true);assert.equal(Object.isFrozen(a.packs[0]),true);
});
test('resource manifest rejects overwrite-style latest URLs and tampered digest',()=>{
  const bad=packs();bad[0].url='https://cdn.example.invalid/packs/latest/core.zip';
  assert.throws(()=>createResourceManifestV1({generatedAtMs:1,catalogVersion:'product-v1.0.0',packs:bad}),/Invalid/);
  const good=createResourceManifestV1({generatedAtMs:1,catalogVersion:'product-v1.0.0',packs:packs()});
  assert.throws(()=>verifyResourceManifestV1({...good,manifestDigest:'f'.repeat(64)}),/digest/);
});
