'use strict';
// V8A/P0 offline regression: authenticated command entry point must NOT let
// a client forge wins while PvE combat has no independent server verifier.
// No Firebase SDK, credentials, external network, or cloud service required.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameService } = require('../lib/gameService.cjs');

const now = Date.parse('2026-10-22T12:00:00Z');
class Ref {
  constructor(db,path){ this.db=db;this.path=path; }
  doc(id){ return new Ref(this.db,`${this.path}/${id}`); }
  collection(name){ return new Ref(this.db,`${this.path}/${name}`); }
  async get(){ const row=this.db.store.get(this.path);return {exists:row!==undefined,data:()=>structuredClone(row)}; }
}
class FakeDb {
  constructor(){this.store=new Map();this.transactionCalls=0;}
  collection(path){return new Ref(this,path);}
  async runTransaction(fn){
    this.transactionCalls++;
    const writes=[];
    const t={
      get: ref=>ref.get(),
      set:(ref,val)=>writes.push({action:'set',ref,val:structuredClone(val)}),
      create:(ref,val)=>writes.push({action:'create',ref,val:structuredClone(val)})
    };
    const output=await fn(t);
    for(const w of writes){
      if(w.action==='create' && this.store.has(w.ref.path)) throw Error('DUPLICATE');
      this.store.set(w.ref.path,w.val);
    }
    return output;
  }
}
function call(service,uid,sid,command,payload,n){
  return service.apply(uid,sid,{command,payload,requestId:`v8p0_req_${String(n).padStart(6,'0')}`});
}
const blocked = err=>err?.code==='BATTLE_VERIFICATION_UNAVAILABLE' && err?.status===423;

for(const [mode,payload] of [
  ['Campaign',{mode:'campaign',planetId:1,stage:1}],
  ['Dungeon',{mode:'dungeon',dungeonId:'dung_taurus'}],
]){
  test(`P0: ${mode} start blocked before Firestore transaction, no energy deducted`,async()=>{
    const db=new FakeDb();
    const game=await createGameService({db,now:()=>now});
    const sid=(await game.openSession({uid:'player_v8p0',name:'P0 Tester'})).sessionId;
    const before=structuredClone(db.store.get('users/player_v8p0'));
    const count=db.transactionCalls;
    await assert.rejects(call(game,'player_v8p0',sid,'battle.start',payload,1),blocked);
    assert.equal(db.transactionCalls,count,'no mutation transaction must begin');
    assert.deepEqual(db.store.get('users/player_v8p0'),before);
    assert.equal(db.store.get('users/player_v8p0').activeBattle??null,null);
  });
}

test('P0: forged victory rejected even if a legacy server ticket exists',async()=>{
  const db=new FakeDb();
  const game=await createGameService({db,now:()=>now});
  const sid=(await game.openSession({uid:'player_v8p0',name:'P0 Tester'})).sessionId;
  const before=structuredClone(db.store.get('users/player_v8p0'));
  before.activeBattle={id:'legacy-ticket',mode:'campaign',planetId:1,stage:1,startedAt:now-9000};
  db.store.set('users/player_v8p0',before);
  const calls=db.transactionCalls;
  await assert.rejects(call(game,'player_v8p0',sid,'battle.finish',
    {ticketId:'legacy-ticket',victory:true,stars:3,coins:999999},2),blocked);
  assert.equal(db.transactionCalls,calls);
  assert.deepEqual(db.store.get('users/player_v8p0'),before);
  assert.equal([...db.store.keys()].filter(k=>k.includes('/operations/')).length,0);
});

test('P0: legacy ticket can still be abandoned without granting currency',async()=>{
  const db=new FakeDb();
  const game=await createGameService({db,now:()=>now});
  const sid=(await game.openSession({uid:'player_v8p0',name:'P0 Tester'})).sessionId;
  const profile=structuredClone(db.store.get('users/player_v8p0'));
  profile.activeBattle={id:'legacy-ticket',mode:'campaign',planetId:1,stage:1,startedAt:now-9000};
  db.store.set('users/player_v8p0',profile);
  const response=await call(game,'player_v8p0',sid,'battle.abandon',{ticketId:'legacy-ticket'},3);
  assert.equal(response.duplicate,false);
  assert.equal(response.state.activeBattle,null);
  assert.equal(response.state.coins,profile.wallet.coins);
});
