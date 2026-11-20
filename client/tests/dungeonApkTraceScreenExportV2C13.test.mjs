import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareDungeonApkTraceJsonV2C13,
  shareDungeonQaJsonV2C13,
  mountDungeonApkTraceScreenExportV2C13,
} from '../src/game/dungeon/DungeonApkTraceScreenExportV2C13.js';

const trace = () => ({
  version:'c15-dungeon-apk-trace-v2c11',source:'qa-babylon-observer-untrusted',
  dungeonId:'dung_taurus',roomId:'taurus_entry',sceneSeed:123,
  seedSource:'local-client-seed',tickBasis:'frameScale-delta-not-fixed-tick',
  frames:[{frameSeq:1}],events:[],finished:false,truncated:false,error:null,
  safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
  liveApkParityVerified:false,checksum:'abcdef01',
});

test('builds a lossless JSON export for the original untrusted V2C11 trace', () => {
  const evidence=trace();
  const out=prepareDungeonApkTraceJsonV2C13(evidence,new Date('2026-11-20T12:22:05Z'));
  assert.equal(out.fileName,'dungeon_taurus_v2c11_20261120_122205.json');
  assert.deepEqual(JSON.parse(out.json), evidence);
  assert.equal(out.isCompleteShortTrace,true);
  assert.equal(out.evidenceStatus,'CLIENT_TRACE_UNTRUSTED_UNPAIRED');
});

test('never rewrites, forges or removes the original untrusted checksum',()=>{
  const evidence=trace();
  const out=prepareDungeonApkTraceJsonV2C13(evidence);
  assert.equal(JSON.parse(out.json).checksum,'abcdef01');
  assert.equal(evidence.checksum,'abcdef01');
});

test('rejects non-QA or reward-authoritative claims and extra user identifiers',()=>{
  for(const changed of [
    {cloudRewards:true},{rewardSettlementEnabled:true},
    {liveApkParityVerified:true},{safeForSettlement:true},
    {dungeonId:'dung_nebula'},{source:'production-replay'},{uid:'private'},
  ]){
    assert.throws(()=>prepareDungeonApkTraceJsonV2C13({...trace(),...changed}),/INVALID_OR_NON_QA/);
  }
});

test('truncated trace remains exportable for diagnostics but cannot pass short capture',()=>{
  const out=prepareDungeonApkTraceJsonV2C13({...trace(),truncated:true,error:'FRAME_CAP'});
  assert.equal(out.isCompleteShortTrace,false);
  assert.equal(JSON.parse(out.json).error,'FRAME_CAP');
});

test('zero frames is not a valid short capture',()=>{
  const out=prepareDungeonApkTraceJsonV2C13({...trace(),frames:[]});
  assert.equal(out.isCompleteShortTrace,false);
});

test('Android share calls only the injected QA native plugin with the full JSON',async()=>{
  const evidence=prepareDungeonApkTraceJsonV2C13(trace());
  let args;
  const result=await shareDungeonQaJsonV2C13(evidence,{
    native:true,
    nativePlugin:{shareJson:async x=>{args=x;return {status:'chooser_opened'};}},
  });
  assert.equal(result,'NATIVE_SHARE_CHOOSER_OPENED');
  assert.deepEqual(args,{fileName:evidence.fileName,json:evidence.json});
});

test('native share must not claim success if chooser did not open',async()=>{
  const evidence=prepareDungeonApkTraceJsonV2C13(trace());
  await assert.rejects(()=>shareDungeonQaJsonV2C13(evidence,{
    native:true,nativePlugin:{shareJson:async()=>({status:'saved'})},
  }),/NATIVE_SHARE_NOT_OPENED/);
});

test('browser unsupported share must fail closed and leave clipboard fallback',async()=>{
  const evidence=prepareDungeonApkTraceJsonV2C13(trace());
  await assert.rejects(()=>shareDungeonQaJsonV2C13(evidence,{
    native:false,navigator:{},File:class File {},
  }),/FILE_SHARE_UNAVAILABLE_USE_COPY/);
});

test('browser File share remains user-initiated with unchanged payload',async()=>{
  const evidence=prepareDungeonApkTraceJsonV2C13(trace());
  let sent;
  const navigator={canShare:()=>true,share:async x=>{sent=x;}};
  class FakeFile{ constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type;} }
  const status=await shareDungeonQaJsonV2C13(evidence,{
    native:false,navigator,File:FakeFile,
  });
  assert.equal(status,'BROWSER_FILE_SHARE_REQUESTED');
  assert.equal(sent.files[0].parts[0],evidence.json);
  assert.equal(sent.files[0].type,'application/json');
});

test('without DOM, QA panel does not mount or alter global state',()=>{
  const dispose=mountDungeonApkTraceScreenExportV2C13({getSnapshot:trace,document:null});
  assert.equal(typeof dispose,'function');dispose();
});

test('QA panel is on-screen, exports full JSON on tap and cleans up on scene dispose',()=>{
  class FakeNode {
    constructor(tag) {this.tag=tag;this.style={};this.children=[];this.handlers={};this.textContent='';this.value='';}
    addEventListener(type,cb){this.handlers[type]=cb;}
    appendChild(x){this.children.push(x);return x;}
    setAttribute(name,value){this[name]=value;}
    remove(){this.removed=true;}
    focus(){this.focused=true;}
    select(){this.selected=true;}
  }
  const body=new FakeNode('body');
  const doc={body,createElement:tag=>new FakeNode(tag)};
  const dispose=mountDungeonApkTraceScreenExportV2C13({document:doc,getSnapshot:trace});
  assert.equal(body.children.length,2);
  assert.equal(body.children[0].children[0].textContent,'QA JSON');
  assert.equal(body.children[1].style.display,'none');
  body.children[0].children[0].handlers.click({stopPropagation(){}});
  assert.equal(body.children[1].style.display,'flex');
  const section=body.children[1].children[0];
  const textarea=section.children.find(x=>x.tag==='textarea');
  assert.deepEqual(JSON.parse(textarea.value),trace());
  assert.equal(textarea.readOnly,true);
  dispose();
  assert.equal(body.children[0].removed,true);
  assert.equal(body.children[1].removed,true);
});
