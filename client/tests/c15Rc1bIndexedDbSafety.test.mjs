import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {cloneC15PersistentValue,c15StandaloneArrayBuffer,createC15MemoryStore}
  from '../src/game/c15/C15Rc1bStore.js';

const here=dirname(fileURLToPath(import.meta.url));
const source=relative=>readFileSync(resolve(here,'..',relative),'utf8');

test('C15 persistent clone creates independent fixed binary payloads',()=>{
  const original=new Uint8Array([4,7,9,12]);
  const value={version:'v1',nested:{bytes:original.buffer},list:[{ok:true}]};
  const cloned=cloneC15PersistentValue(value);
  assert.notEqual(cloned,value);
  assert.notEqual(cloned.nested.bytes,original.buffer);
  assert.deepEqual([...new Uint8Array(cloned.nested.bytes)],[4,7,9,12]);
  original[0]=99;
  assert.deepEqual([...new Uint8Array(cloned.nested.bytes)],[4,7,9,12]);
});

test('C15 standalone buffer copies only the selected view range',()=>{
  const sourceBytes=new Uint8Array([1,2,3,4,5,6]);
  const view=new Uint8Array(sourceBytes.buffer,2,3);
  const buffer=c15StandaloneArrayBuffer(view);
  assert.deepEqual([...new Uint8Array(buffer)],[3,4,5]);
  assert.notEqual(buffer,sourceBytes.buffer);
});

test('C15 persistent clone rejects functions before IndexedDB receives them',()=>{
  assert.throws(()=>cloneC15PersistentValue({bad(){}}),error=>{
    assert.equal(error.code,'C15_STORE_UNCLONEABLE');
    assert.match(error.message,/root\.bad/);
    return true;
  });
});

test('C15 memory store mirrors browser clone-safe persistence semantics',async()=>{
  const store=createC15MemoryStore();
  const bytes=new Uint8Array([8,6,4,2]);
  await store.put('files','pack:v1:file',{bytes:bytes.buffer,meta:{sha256:'a'.repeat(64)}});
  bytes[0]=1;
  const saved=await store.get('files','pack:v1:file');
  assert.deepEqual([...new Uint8Array(saved.bytes)],[8,6,4,2]);
  saved.meta.sha256='b'.repeat(64);
  assert.equal((await store.get('files','pack:v1:file')).meta.sha256,'a'.repeat(64));
});

test('RC1B/RC7 resource/session source stores clone-safe copies instead of transient buffers',()=>{
  const resource=source('src/game/c15/C15ResourceDelivery.js');
  const payload=source('src/game/assets/AssetPayloadStoreV1.js');
  const session=source('src/game/c15/C15Rc1bSession.js');
  assert.match(resource,/createAutoAssetPayloadStore/);
  assert.match(resource,/payloadStore\.download/);
  assert.match(resource,/payloadStore\.verify/);
  assert.match(payload,/c15StandaloneArrayBuffer\(merged\)/);
  assert.match(payload,/c15StandaloneArrayBuffer\(bytes\)/);
  assert.doesNotMatch(payload,/store\.put\([^\n]+bytes:bytes\.buffer/);
  assert.match(session,/envelope:cloneC15PersistentValue\(envelope\)/);
  assert.doesNotMatch(session,/envelope:structuredClone\(envelope\)/);
});

test('RC1B UI surfaces legacy DOM DataCloneError code 25 as an actionable code',()=>{
  const ui=source('src/components/C15LocalAlpha1/index.jsx');
  assert.match(ui,/error\?\.code===25/);
  assert.match(ui,/C15_IDB_DATA_CLONE/);
  assert.match(ui,/formatC15Rc1bFault\(error,'C15_RC1B_OPEN_FAILED'\)/);
});


test('C15 persistent clone accepts cross-realm plain rollback metadata but rejects class instances',()=>{
  const foreign=runInNewContext(`({
    version:'c15-active-resource-set-v1',
    rollback:{packs:{alpha:{revision:1,sha256:'${'a'.repeat(64)}'}}}
  })`);
  const cloned=cloneC15PersistentValue(foreign);
  assert.equal(cloned.rollback.packs.alpha.revision,1);
  assert.equal(Object.getPrototypeOf(cloned),Object.prototype);
  assert.equal(Object.getPrototypeOf(cloned.rollback),Object.prototype);

  class LegacyRollback{}
  assert.throws(()=>cloneC15PersistentValue({rollback:new LegacyRollback()}),error=>{
    assert.equal(error.code,'C15_STORE_UNCLONEABLE');
    assert.match(error.message,/root\.rollback/);
    return true;
  });
});

test('C15 persistent clone rejects enumerable accessors without invoking them',()=>{
  let invoked=false;
  const value={};
  Object.defineProperty(value,'rollback',{enumerable:true,get(){invoked=true;return {};}});
  assert.throws(()=>cloneC15PersistentValue(value),error=>{
    assert.equal(error.code,'C15_STORE_UNCLONEABLE');
    assert.match(error.message,/root\.rollback/);
    return true;
  });
  assert.equal(invoked,false);
});
