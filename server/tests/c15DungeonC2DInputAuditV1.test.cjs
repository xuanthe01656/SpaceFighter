'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {auditDungeonC2DInputGridV1,createC15DungeonC2DInputAuditV1}=
  require('../lib/c15DungeonC2DInputAuditV1.cjs');
const UUID='7e44d837-66d5-4530-a555-b08f845ce417';
const view={canvasWidth:400,canvasHeight:800,aspect:.5,halfHeight:15,inset:1.8,pointerSpeedMultiplier:1};
let projector;
async function sample(staging=false){
  const {createDungeonC2CInputGridV1}=await import('../../client/src/game/dungeon/DungeonC2CInputGridV1.js');
  ({projectDungeonDirectTouchV2B1:projector}=await import('../../client/src/game/dungeon/DungeonSeedTouchContractV2B1.js'));
  const start={x:0,z:12.5};const delta={deltaX:12,deltaY:-4};
  const moved=projector({position:start,viewport:view,delta});
  const journal=createDungeonC2CInputGridV1({sceneSeed:123,seedSource:staging
    ?'server-ticket-local-unverified':'local-client-seed',battleId:staging?UUID:null,initialPlayer:start});
  journal.capturePointer({kind:'down',pointerId:1,atMs:10,clientX:100,clientY:200,position:start});
  journal.capturePointer({kind:'move',pointerId:1,atMs:50,clientX:112,clientY:196,
    delta,viewport:view,position:moved});
  journal.capturePointer({kind:'up',pointerId:1,atMs:70,position:moved});
  for(let i=0;i<126;i++)journal.captureFrame({deltaMs:16.667,player:moved,playerHp:4000,
    shieldHp:20,enemyCount:4});
  return JSON.parse(JSON.stringify(journal.exportEvidence()));
}
function checksum(text){let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
function resign(record){const {checksum:ignored,...body}=record;
  return {...body,checksum:checksum(JSON.stringify(body))};
}
test('C2D independently reprojects accepted touch delta on 30Hz grid, without combat authority',async()=>{
  const result=await auditDungeonC2DInputGridV1(await sample());
  assert.equal(result.status,'INPUT_SUBSET_REPROJECTED_UNTRUSTED');
  assert.equal(result.subsetInputReprojectionPass,true);
  assert.equal(result.acceptedPointerEvents,3);
  assert.ok(result.replayedInputTicks>=60);
  assert.equal(result.fullCombatReplayVerified,false);
  assert.equal(result.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(result.safeForSettlement,false);
  assert.match(result.replayDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.trailingPointerUpUnobserved,false);
  // Real Android trace: the final pointer-up is tick N+1, after sampled tick N.
  const tail=await sample();
  tail.pointerEvents.at(-1).tick=tail.ticks.length+1;
  const tailResult=await auditDungeonC2DInputGridV1(resign(tail));
  assert.equal(tailResult.subsetInputReprojectionPass,true);
  assert.equal(tailResult.acceptedPointerEvents,3);
  assert.equal(tailResult.replayedInputTicks,tail.ticks.length);
  assert.equal(tailResult.trailingPointerUpUnobserved,true);
  assert.equal(tailResult.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(tailResult.safeForSettlement,false);
});
test('C2D rejects accidental corruption and checksum forgery with wrong projection',async()=>{
  const r=await sample();r.pointerEvents[1].delta.deltaX=200;
  await assert.rejects(()=>auditDungeonC2DInputGridV1(r),{code:'C2D_CHECKSUM_MISMATCH'});
  const modified=resign(r);
  await assert.rejects(()=>auditDungeonC2DInputGridV1(modified),
    {code:'C2D_POINTER_MOVE_MISMATCH'});
});
test('C2D rejects injected tick, changed final pose and elevated reward claim',async()=>{
  const r=await sample();r.ticks[1].tick=99;
  await assert.rejects(()=>auditDungeonC2DInputGridV1(resign(r)),
    {code:'C2D_TICK_INVALID_OR_OUT_OF_ORDER'});
  const changed=await sample();changed.ticks[2].inputPosition.x+=1;
  await assert.rejects(()=>auditDungeonC2DInputGridV1(resign(changed)),
    {code:'C2D_GRID_INPUT_MISMATCH'});
  const rewards=await sample();rewards.rewardSettlementEnabled=true;
  await assert.rejects(()=>auditDungeonC2DInputGridV1(resign(rewards)),
    {code:'C2D_RECORD_UNTRUSTED_OR_UNSAFE'});
  const late=await sample();
  late.pointerEvents.at(-1).tick=late.ticks.length+2;
  await assert.rejects(()=>auditDungeonC2DInputGridV1(resign(late)),
    {code:'C2D_UNCLOSED_OR_UNPAIRED_INPUT'});
  const forged=await sample();
  forged.pointerEvents.at(-1).tick=forged.ticks.length+1;
  forged.pointerEvents.at(-1).position.x+=1;
  await assert.rejects(()=>auditDungeonC2DInputGridV1(resign(forged)),
    {code:'C2D_UNCLOSED_OR_UNPAIRED_INPUT'});
  const unsampledMove=await sample();
  unsampledMove.pointerEvents[1].tick=unsampledMove.ticks.length+1;
  await assert.rejects(()=>auditDungeonC2DInputGridV1(resign(unsampledMove)),
    {code:'C2D_GRID_INPUT_MISMATCH'});
  const extraEvent=await sample();
  extraEvent.pointerEvents.at(-1).tick=extraEvent.ticks.length+1;
  extraEvent.pointerEvents.push({...extraEvent.pointerEvents.at(-1),seq:4,atMs:90});
  await assert.rejects(()=>auditDungeonC2DInputGridV1(resign(extraEvent)),
    {code:'C2D_UNCLOSED_OR_UNPAIRED_INPUT'});
});
test('C2D detects read-only input drift without awarding independent replay PASS',async()=>{
  const r=await sample();r.ticks[4].observedPlayer.x+=1;
  const out=await auditDungeonC2DInputGridV1(resign(r));
  assert.equal(out.status,'INPUT_SUBSET_INCOMPLETE_OR_OBSERVED_DRIFT');
  assert.equal(out.subsetInputReprojectionPass,false);
});
test('C2D service is OFF by default and prohibits claims',async()=>{
  const svc=createC15DungeonC2DInputAuditV1();
  assert.equal(svc.enabled,false);
  await assert.rejects(()=>svc.audit({}),{code:'C15_DUNGEON_C2C2D_DISABLED'});
  assert.throws(()=>svc.claim(),{code:'C15_DUNGEON_SERVER_REPLAY_REQUIRED'});
});
test('C2D staged pairing requires valid C2B service, same battle, and verified loadout',async()=>{
  let calls=0;
  const c2b={enabled:true,stagingOnly:true,rewardSettlementEnabled:false,
    verify:async ({uid,sessionId,ticket})=>{
      calls++;assert.equal(uid,'qa_user');assert.equal(sessionId,'qa_session');
      assert.equal(ticket.battleId,UUID);
      return {serverQaTicketVerified:true,serverSelectedLoadoutDigestMatches:true,
        battleId:UUID,rewardSettlementEnabled:false};
    }};
  const svc=createC15DungeonC2DInputAuditV1({env:{
    GAME_C15_DUNGEON_C2C2D_ENABLED:'true',GAME_C15_DUNGEON_C2C2D_QA_APPROVED:'true',
  },c2bService:c2b});
  assert.equal(svc.enabled,true);
  const record=await sample(true);
  const ticket={battleId:UUID,sceneSeed:123,dungeonId:'dung_taurus',roomId:'taurus_entry'};
  const ok=await svc.audit({uid:'qa_user',sessionId:'qa_session',ticket,record});
  assert.equal(ok.status,'C2B_TICKET_AND_INPUT_SUBSET_BOUND_NOT_FULL_COMBAT');
  assert.equal(ok.serverSignedTicketVerified,true);
  assert.equal(ok.serverSelectedLoadoutVerified,true);
  assert.equal(ok.fullCombatReplayVerified,false);
  assert.equal(calls,1);
  await assert.rejects(()=>svc.audit({uid:'qa_user',sessionId:'qa_session',ticket:{...ticket,battleId:
    '11111111-1111-4111-8111-111111111111'},record}),
  {code:'C15_DUNGEON_C2D_INPUT_OR_TICKET_UNPAIRED'});
  assert.equal(calls,1);
});
test('C2D cannot turn on if C2B service or second approval is absent',()=>{
  const svc=createC15DungeonC2DInputAuditV1({env:{GAME_C15_DUNGEON_C2C2D_ENABLED:'true',
    GAME_C15_DUNGEON_C2C2D_QA_APPROVED:'true'},c2bService:{enabled:true,
    stagingOnly:false,rewardSettlementEnabled:false,verify:async()=>({})}});
  assert.equal(svc.enabled,false);
});
