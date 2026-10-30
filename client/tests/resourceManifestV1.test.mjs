import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResourceManifestV1,selectResourcePacksV1,planAtomicResourceActivationV1}
  from '../src/game/assets/ResourceManifestV1.js';
function manifest(){return {version:'resource-manifest-v1',generatedAtMs:1,catalogVersion:'product-v1.0.0',manifestDigest:'a'.repeat(64),packs:[
  {version:'resource-pack-v1',id:'core-bootstrap',revision:1,sha256:'1'.repeat(64),sizeBytes:100,quality:'bootstrap',required:true,stageKeys:[],url:'https://cdn.example.invalid/packs/core-bootstrap/v1/core.zip',minAppVersion:'1.0.0',contentTypes:['ui'],dependencies:[]},
  {version:'resource-pack-v1',id:'alpha-mobile-low',revision:3,sha256:'2'.repeat(64),sizeBytes:1000,quality:'mobile-low',required:true,stageKeys:['alpha-stage-1'],url:'https://cdn.example.invalid/packs/alpha-mobile-low/v3/alpha.zip',minAppVersion:'1.0.0',contentTypes:['background','enemy-atlas'],dependencies:['core-bootstrap']},
  {version:'resource-pack-v1',id:'alpha-mobile-high',revision:2,sha256:'3'.repeat(64),sizeBytes:2000,quality:'mobile-high',required:false,stageKeys:['alpha-stage-1'],url:'https://cdn.example.invalid/packs/alpha-mobile-high/v2/alpha-hd.zip',minAppVersion:'1.0.0',contentTypes:['enemy-model'],dependencies:['alpha-mobile-low']},
]};}
test('resource manifest selects required low pack and optional high pack by quality',()=>{
  const m=manifest();assert.equal(validateResourceManifestV1(m),true);
  const low=selectResourcePacksV1({manifest:m,stageKey:'alpha-stage-1',quality:'mobile-low',installed:{}});
  assert.deepEqual(low.packs.map(x=>x.id),['alpha-mobile-low','core-bootstrap']);
  const high=selectResourcePacksV1({manifest:m,stageKey:'alpha-stage-1',quality:'mobile-high',installed:{}});
  assert.deepEqual(high.packs.map(x=>x.id),['alpha-mobile-high','alpha-mobile-low','core-bootstrap']);
});
test('atomic activation requires exact verified revision and retains rollback',()=>{
  const selection=selectResourcePacksV1({manifest:manifest(),stageKey:'alpha-stage-1',quality:'mobile-low',installed:{}});
  const verified={
    'core-bootstrap':{revision:1,sha256:'1'.repeat(64),verified:true,verifiedAtMs:10},
    'alpha-mobile-low':{revision:3,sha256:'2'.repeat(64),verified:true,verifiedAtMs:11},
  };
  const plan=planAtomicResourceActivationV1({selection,verifiedDownloads:verified,active:{}});
  assert.equal(plan.next['alpha-mobile-low'].revision,3);assert.deepEqual(plan.rollback,{});
  assert.throws(()=>planAtomicResourceActivationV1({selection,verifiedDownloads:{},active:{}}),/not verified/);
});
test('mutable latest URLs and missing dependency are rejected',()=>{
  const m=manifest();m.packs[0]={...m.packs[0],url:'https://cdn.example.invalid/packs/latest/core.zip'};
  assert.throws(()=>validateResourceManifestV1(m),/Invalid resource pack/);
});
