import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDungeonC2BOptIn,validateDungeonC2BTicket,
  isDungeonC2BSeedAllowed,DUNGEON_C2B_STAGING_QA_VERSION} from
  '../src/game/dungeon/DungeonC2BStagingQaContract.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const env={VITE_SF_DUNGEON_QA:'true',VITE_SF_DUNGEON_V2C11_APK_TRACE:'true',
  VITE_SF_DUNGEON_C2B_APK_QA:'true'};
const qa={enabled:true,dungeonId:'dung_taurus',directRoomId:null,
  rewardMode:'none',consumeEnergy:false,trustedWrites:false};
const NOW=Date.UTC(2026,10,21,3,30,0);
const ticket={version:DUNGEON_C2B_STAGING_QA_VERSION,
  battleId:'f61fc764-851c-4b4c-82f9-8264f3e8a019',
  sessionDigest:'1'.repeat(64),actorDigest:'2'.repeat(64),
  dungeonId:'dung_taurus',roomId:'taurus_entry',sceneSeed:3060395586,
  spawnPlanDigest:'3'.repeat(64),contractDigest:'4'.repeat(64),
  serverLoadoutDigest:'5'.repeat(64),issuedAtMs:NOW-1000,
  expiresAtMs:NOW+89000,qaOnly:true,stagingOnly:true,
  emulatorOnly:false,serverAdmissionVerified:false,fixedTickAligned:false,
  apkReceiptVerified:false,independentReplayVerified:false,
  safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
  mac:'6'.repeat(64)};
test('C2B never turns on without compiled flags + explicit user choice',()=>{
  assert.equal(isDungeonC2BOptIn({env:{},qaRun:qa,requested:true}),false);
  assert.equal(isDungeonC2BOptIn({env,qaRun:qa}),false);
  assert.equal(isDungeonC2BOptIn({env,qaRun:qa,search:'?sfDungeonC2B=1'}),true);
  assert.equal(isDungeonC2BOptIn({env,qaRun:qa,requested:true}),true);
});
test('C2B rejects non QA, Nereus and unmatched direct room',()=>{
  for(const x of [{...qa,dungeonId:'dung_nereus'},
    {...qa,directRoomId:'taurus_boss'},
    {...qa,trustedWrites:true},{...qa,rewardMode:'normal'}])
    assert.equal(isDungeonC2BOptIn({env,qaRun:x,requested:true}),false);
});
test('C2B only accepts non-authoritative staging seed envelope',()=>{
  const safe=validateDungeonC2BTicket({ticket,qaRun:qa,nowMs:NOW});
  assert.equal(safe.sceneSeed,3060395586);
  assert.equal(safe.serverAdmissionVerified,false);
  assert.equal(safe.independentReplayVerified,false);
  assert.equal(safe.rewardSettlementEnabled,false);
});
test('C2B rejects missing MAC, extra fields, seed or room mutation',()=>{
  for(const change of [{mac:'7'}, {sceneSeed:0},
    {roomId:'taurus_boss'},{uid:'some_user'},{claimedVictory:true}])
    assert.throws(()=>validateDungeonC2BTicket({ticket:{...ticket,...change},
      qaRun:qa,nowMs:NOW}));
});
test('C2B rejects expired/future and inflated expiry',()=>{
  assert.throws(()=>validateDungeonC2BTicket({ticket,qaRun:qa,nowMs:NOW+89001}));
  assert.throws(()=>validateDungeonC2BTicket({ticket,qaRun:qa,nowMs:NOW-1001}));
  assert.throws(()=>validateDungeonC2BTicket({ticket:{...ticket,
    expiresAtMs:NOW+1000000},qaRun:qa,nowMs:NOW}));
});
test('C2B rejects forged admission/parity/reward flags',()=>{
  for(const change of [{serverAdmissionVerified:true},{fixedTickAligned:true},
    {apkReceiptVerified:true},{independentReplayVerified:true},
    {safeForSettlement:true},{rewardSettlementEnabled:true},{cloudRewards:true},
    {stagingOnly:false},{emulatorOnly:true}])
    assert.throws(()=>validateDungeonC2BTicket({ticket:{...ticket,...change},
      qaRun:qa,nowMs:NOW}));
});
test('C2B seed may only be used with all QA build flags and valid ticket',()=>{
  assert.equal(isDungeonC2BSeedAllowed({env,qaRun:qa,ticket,nowMs:NOW}),true);
  assert.equal(isDungeonC2BSeedAllowed({env:{...env,
    VITE_SF_DUNGEON_C2B_APK_QA:'false'},qaRun:qa,ticket,nowMs:NOW}),false);
  assert.equal(isDungeonC2BSeedAllowed({env,qaRun:qa,
    ticket:{...ticket,cloudRewards:true},nowMs:NOW}),false);
});
test('native Android build gate is real DEBUG BuildConfig not just Vite variable',()=>{
  const java=read('android/app/src/main/java/com/theIT/spacefighter4/SpaceFighterQaTraceExportPlugin.java');
  const main=read('android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
  const gate=read('src/game/dungeon/DungeonC2BDebugGate.js');
  assert.match(java,/getDebugBuildGate\(PluginCall call\)/);
  assert.match(java,/if \(!BuildConfig\.DEBUG\)/);
  assert.match(main,/if \(BuildConfig\.DEBUG\) registerPlugin\(SpaceFighterQaTraceExportPlugin\.class\)/);
  assert.match(gate,/Capacitor\.isNativePlatform\(\)/);
  assert.match(gate,/plugin\.getDebugBuildGate\(\)/);
});
test('C2B scene bootstrap is gated before Babylon and cannot silently use local seed',()=>{
  const engine=read('src/components/Dungeon/DungeonEngine.jsx');
  const scene=read('src/components/Dungeon/DungeonScene.js');
  assert.match(engine,/c2bOptIn && c2bBoot\.status !== 'ready'/);
  assert.match(engine,/C2B_TICKET_EXPIRED_BEFORE_SCENE/);
  assert.match(scene,/C2B_QA_TICKET_INVALID_NO_LOCAL_FALLBACK/);
  assert.match(scene,/dungeonSeedV38 = dungeonC2BLocalQa \? dungeonC2BQaTicket\.sceneSeed/);
  assert.match(scene,/server-ticket-local-unverified/);
  assert.doesNotMatch(engine,/localStorage\.setItem\([^)]*c2b/i);
});
test('C2B client requires Firebase Auth and has no settle / reward write path',()=>{
  const api=read('src/services/gameApi.js');
  const ui=read('src/components/DungeonSelect/index.jsx');
  assert.match(api,/issueDungeonC2BTicket/);
  assert.match(api,/\/c15\/dungeon\/qa-c2b\/ticket/);
  assert.match(ui,/dungeonC2BRequested/);
  assert.match(ui,/auth\.currentUser/);
  assert.match(ui,/type="checkbox" checked=\{c2bStagingOptIn\}/);
});
