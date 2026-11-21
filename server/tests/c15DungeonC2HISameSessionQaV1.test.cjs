'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createC15DungeonC2HISameSessionQaV1}=require('../lib/c15DungeonC2HISameSessionQaV1.cjs');
const SID='01234567-89ab-cdef-0123-456789abcdef';
const UID='approved-uid';
const env={GAME_C15_DUNGEON_C2HI_ENABLED:'true',GAME_C15_DUNGEON_C2HI_QA_APPROVED:'true'};
const ticket={battleId:SID,sceneSeed:12345,dungeonId:'dung_taurus',roomId:'taurus_entry',
  mac:'a'.repeat(64),serverLoadoutDigest:'b'.repeat(64),spawnPlanDigest:'c'.repeat(64),
  qaOnly:true,stagingOnly:true,safeForSettlement:false,rewardSettlementEnabled:false};
const record={battleId:SID,sceneSeed:12345,seedSource:'server-ticket-local-unverified',
  dungeonId:'dung_taurus',roomId:'taurus_entry',checksum:'0123abcd',
  grid:{battleId:SID,sceneSeed:12345,checksum:'0987abcd'}};
const proj=()=>({version:'qa-ballistics',ballisticSubsetPass:true,battleId:SID,
  projectionDigest:'d'.repeat(64),trueApkServerParity:'NOT_VERIFIED',
  safeForSettlement:false,rewardSettlementEnabled:false});
const good=()=>({battleId:SID,sceneSeed:12345,encounterCatalogDigest:ticket.spawnPlanDigest,
  causalSubsetPass:true,serverQaTicketVerified:true,serverSelectedLoadoutVerified:true,
  rewardSettlementEnabled:false,safeForSettlement:false,
  fullCombatReplayVerified:false,trueApkServerParity:'NOT_VERIFIED'});
const c2e=audit=>({enabled:true,stagingOnly:true,rewardSettlementEnabled:false,audit});
const make=(a=async()=>good(),p=async()=>proj(),e=env)=>
  createC15DungeonC2HISameSessionQaV1({env:e,c2eService:c2e(a),ballisticAudit:p});
const req={uid:UID,sessionId:SID,ticket,record};
test('C2HI disabled by default and without independent explicit QA approval',async()=>{
  for(const flags of [{},{GAME_C15_DUNGEON_C2HI_ENABLED:'true'}]){
    const svc=make(undefined,undefined,flags);
    assert.equal(svc.enabled,false);
    await assert.rejects(()=>svc.audit(req),e=>e.code==='C15_DUNGEON_C2HI_DISABLED');
  }
});
test('C2HI requires enabled staging-only C2E without economic privileges',()=>{
  const svc=createC15DungeonC2HISameSessionQaV1({env,c2eService:c2e(()=>good())});
  assert.equal(svc.enabled,true);
  const bad=createC15DungeonC2HISameSessionQaV1({env,c2eService:{...c2e(()=>good()),rewardSettlementEnabled:true}});
  assert.equal(bad.enabled,false);
});
test('C2HI binds signed ticket+verified Firebase UID/session via the existing C2E gate',async()=>{
  let seen;
  const svc=make(async x=>{seen=x;return good();});
  const r=await svc.audit(req);
  assert.equal(r.sameSessionQaBindingVerified,true);
  assert.equal(r.serverQaTicketVerified,true);
  assert.equal(r.serverSelectedLoadoutVerified,true);
  assert.equal(r.ballisticSubsetPass,true);
  assert.equal(r.fullCombatReplayVerified,false);
  assert.equal(r.safeForSettlement,false);
  assert.equal(r.rewardSettlementEnabled,false);
  assert.equal(r.replayProtectionAcrossCloudRunInstances,false);
  assert.deepEqual(seen,req);
  assert.match(r.reportDigest,/^[0-9a-f]{64}$/);
});
test('C2HI guest witness cannot impersonate a signed staging battle',async()=>{
  const svc=make();
  await assert.rejects(()=>svc.audit({...req,record:{...record,battleId:null,seedSource:'local-client-seed'}}),
    e=>e.code==='C15_DUNGEON_C2HI_SESSION_UNPAIRED');
});
test('C2HI blocks mismatched UID/session/ticket/battle binding before calling audit dependencies',async()=>{
  let called=0;
  const svc=make(async()=>{called++;return good();},async()=>{called++;return proj();});
  await assert.rejects(()=>svc.audit({...req,sessionId:'NOT_UUID'}),
    e=>e.code==='C15_DUNGEON_C2HI_SESSION_UNPAIRED');
  await assert.rejects(()=>svc.audit({...req,ticket:{...ticket,battleId:'fedcba98-7654-3210-fedc-ba9876543210'}}),
    e=>e.code==='C15_DUNGEON_C2HI_SESSION_UNPAIRED');
  await assert.rejects(()=>svc.audit({...req,record:{...record,grid:{...record.grid,sceneSeed:777}}}),
    e=>e.code==='C15_DUNGEON_C2HI_SESSION_UNPAIRED');
  assert.equal(called,0);
});
test('C2HI cannot accept fake full parity/reward flags in ticket',async()=>{
  const svc=make();
  await assert.rejects(()=>svc.audit({...req,ticket:{...ticket,rewardSettlementEnabled:true}}),
    e=>e.code==='C15_DUNGEON_C2HI_SESSION_UNPAIRED');
});
test('C2HI refuses incomplete projectile subset before touching C2E ticket service',async()=>{
  let called=0;
  const svc=make(async()=>{called++;return good();},async()=>({...proj(),ballisticSubsetPass:false}));
  await assert.rejects(()=>svc.audit(req),e=>e.code==='C15_DUNGEON_C2HI_BALLISTICS_UNTRUSTED');
  assert.equal(called,0);
});
test('C2HI rejects C2E service that fails to verify UID/session/loadout',async()=>{
  const svc=make(async()=>({...good(),serverQaTicketVerified:false}));
  await assert.rejects(()=>svc.audit(req),e=>e.code==='C15_DUNGEON_C2HI_C2B_C2E_BINDING_FAILED');
});
test('C2HI rejects fabricated C2E signed result with full-combat PASS or rewards',async()=>{
  const svc=make(async()=>({...good(),fullCombatReplayVerified:true}));
  await assert.rejects(()=>svc.audit(req),e=>e.code==='C15_DUNGEON_C2HI_C2B_C2E_BINDING_FAILED');
  const svc2=make(async()=>({...good(),rewardSettlementEnabled:true}));
  await assert.rejects(()=>svc2.audit(req),e=>e.code==='C15_DUNGEON_C2HI_C2B_C2E_BINDING_FAILED');
});
test('C2HI audit fingerprint is stable for same ticket, differs for another signed receipt',async()=>{
  const svc=make();
  const one=await svc.audit(req),two=await svc.audit(req);
  assert.equal(one.reportDigest,two.reportDigest);
  const other=await svc.audit({...req,ticket:{...ticket,mac:'f'.repeat(64)}});
  assert.notEqual(one.reportDigest,other.reportDigest);
});
test('C2HI exposes no settlement operation even with enabled staging QA',()=>{
  const svc=make();
  assert.throws(()=>svc.claim(),e=>e.code==='C15_DUNGEON_SERVER_REPLAY_REQUIRED');
  assert.throws(()=>svc.finalize(),e=>e.code==='C15_DUNGEON_SERVER_REPLAY_REQUIRED');
  assert.equal(svc.productionEnabled,false);
  assert.equal(svc.independentCombatReplayVerified,false);
});
