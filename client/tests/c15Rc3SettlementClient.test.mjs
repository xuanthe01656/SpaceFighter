import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createC15MemoryStore} from '../src/game/c15/C15Rc1bStore.js';
import {openOrResumeC15Rc1bSession} from '../src/game/c15/C15Rc1bSession.js';
import {C15_ARCADE_CONTROL_PROFILE_ID} from '../src/game/c15/C15ControlProfilesV1.js';
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url));
const {createC15Rc1bResourceCatalog}=require('../../server/lib/c15Rc1bResourceCatalog.cjs');
const {createC15CommercialOriginV1}=require('../../server/lib/c15CommercialGenesisV1.cjs');
const {createC15Rc1Fixture,generateC15DefeatFrames,T0,UID,BID,KEY}=require('../../server/tools/c15Rc1Fixture.cjs');
function fetchFor(catalog){return async url=>{const parsed=new URL(url),descriptor=/\/packs\/([^/]+)\/v(\d+)\/descriptor\.json$/.exec(parsed.pathname);
  if(descriptor){const found=catalog.getDescriptor(descriptor[1],Number(descriptor[2]));return found?new Response(found.bytes,{status:200}):new Response('',{status:404});}
  const file=/\/packs\/([^/]+)\/v(\d+)\/files\/(.+)$/.exec(parsed.pathname);if(!file)return new Response('',{status:404});
  const found=catalog.getFile(file[1],Number(file[2]),file[3]);if(!found)return new Response('',{status:404});
  return new Response(fs.readFileSync(found.absolute),{status:200});};}
async function fixture({tamperDuplicate=false}={}){const base=await createC15Rc1Fixture({profileId:C15_ARCADE_CONTROL_PROFILE_ID,battleId:BID});
  const catalog=createC15Rc1bResourceCatalog({publicBaseUrl:'https://assets.example.test',generatedAtMs:T0});
  const origin=createC15CommercialOriginV1({snapshot:base.snapshot,encounter:base.encounter,policy:base.policy,resourceManifest:catalog.manifest,
    selectedResourcePackIds:['core-bootstrap','campaign-alpha-mobile-low'],keyId:'c15_rc1b_key_v1',key:KEY,issuedAtMs:T0,
    expiresAtMs:base.snapshot.context.expiresAtMs});let uploaded=0,chunks=0,claims=0,claimBody=null;
  const result={version:'c15-commercial-replay-result-v1',battleId:BID,phase:'rc1-verified-defeat',ticks:0,rc1Only:true,
    nonEconomic:true,safeForSettlement:false,eligibleForSettlement:false};
  const outcome={version:'c15-rc2-trusted-outcome-v1',battleId:BID,phase:'rc2-trusted-defeat',nonEconomic:true,safeForSettlement:false,
    eligibleForSettlement:false,settlementEnabled:false,cloudRewards:false,outcomeDigest:'a'.repeat(64),mac:'b'.repeat(64)};
  const envelope=()=>({version:'c15-rc1b-runtime-v1',battleId:BID,duplicate:false,issuedAtMs:T0,expiresAtMs:base.snapshot.context.expiresAtMs,
    uploadedThroughTick:uploaded,chunkCount:chunks,phase:'active',genesis:origin.genesis,runtime:{snapshot:origin.snapshot,encounter:origin.encounter,policy:origin.policy},
    resourceManifest:catalog.manifest,result:null,outcome:null,rc2OutcomeEnabled:true,rc1bOnly:true,nonEconomic:true,safeForSettlement:false,
    settlementEnabled:false,cloudRewards:false});
  const api={async openBattle(){return envelope();},async getStatus(){return envelope();},
    async uploadChunk(_uid,{chunk}){uploaded+=chunk.frames.length;chunks++;return {battleId:BID,startTick:chunk.startTick,endTick:uploaded,uploadedThroughTick:uploaded,chunkCount:chunks,nonEconomic:true};},
    async finalize(){result.ticks=uploaded;return {version:'c15-rc1b-runtime-v1',battleId:BID,nonEconomic:true,safeForSettlement:false,
      settlementEnabled:false,cloudRewards:false,result,outcome};},async abandon(){return {battleId:BID,nonEconomic:true};},
    async claimSettlement(_uid,body){claims++;claimBody=structuredClone(body);return {version:'c15-rc3-settlement-v1',duplicate:claims>1,battleId:BID,
      receipt:{version:'c15-rc3-settlement-receipt-v1',battleId:BID,outcomeDigest:outcome.outcomeDigest,coins:0,experience:0,stars:0,
        receiptDigest:(claims>1&&tamperDuplicate?'e':'c').repeat(64),mac:'d'.repeat(64)},wallet:{coins:100,diamonds:10,energy:42},progress:{experience:0,stageOneStars:0},
      stagingOnly:true,productionSettlementEnabled:false,productionCloudRewards:false};},async fetchManifest(){return catalog.manifest;}};
  return {base,catalog,api,get:()=>({claims,claimBody})};}

test('RC3 client claim sends only immutable outcome identity and reuses one request',async()=>{const h=await fixture(),store=createC15MemoryStore();let id=0;
  const session=await openOrResumeC15Rc1bSession({uid:UID,store,api:h.api,fetchImpl:fetchFor(h.catalog),online:()=>true,clock:()=>T0+120000,
    uuidFactory:()=>`c15_rc3_req_${String(++id).padStart(4,'0')}`,controlProfileId:C15_ARCADE_CONTROL_PROFILE_ID,rc3Enabled:true});
  const defeat=generateC15DefeatFrames(h.base);for(const frame of defeat.frames)session.advance(frame);await session.finalizeWhenOnline();
  const first=await session.claimVerifiedReward(),cached=await session.claimVerifiedReward();assert.equal(first.receipt.receiptDigest,cached.receipt.receiptDigest);
  assert.equal(h.get().claims,1);assert.deepEqual(Object.keys(h.get().claimBody).sort(),['battleId','outcomeDigest','requestId']);
  assert.equal(h.get().claimBody.battleId,BID);assert.equal(h.get().claimBody.outcomeDigest,'a'.repeat(64));
  const duplicate=await session.retryVerifiedRewardClaim();assert.equal(h.get().claims,2);assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.receipt.receiptDigest,first.receipt.receiptDigest);assert.equal(duplicate.receipt.mac,first.receipt.mac);
  assert.equal(session.getView().settlement.receipt.coins,0);assert.equal(session.getView().rc3SettlementEnabled,true);
  assert.equal(session.getView().nonEconomic,true);assert.equal(session.getView().stagingSettlementApplied,true);session.dispose();});


test('RC3 duplicate verification rejects a changed stored receipt',async()=>{const h=await fixture({tamperDuplicate:true}),store=createC15MemoryStore();let id=0;
  const session=await openOrResumeC15Rc1bSession({uid:UID,store,api:h.api,fetchImpl:fetchFor(h.catalog),online:()=>true,clock:()=>T0+120000,
    uuidFactory:()=>`c15_rc3_tamper_${String(++id).padStart(4,'0')}`,controlProfileId:C15_ARCADE_CONTROL_PROFILE_ID,rc3Enabled:true});
  const defeat=generateC15DefeatFrames(h.base);for(const frame of defeat.frames)session.advance(frame);await session.finalizeWhenOnline();
  await session.claimVerifiedReward();await assert.rejects(()=>session.retryVerifiedRewardClaim(),error=>error?.code==='C15_RC3_DUPLICATE_MISMATCH');
  assert.equal(h.get().claims,2);assert.equal(session.getView().settlement.receipt.receiptDigest,'c'.repeat(64));session.dispose();});

test('RC3 UI is staging-only and never mutates wallet locally',()=>{const ui=fs.readFileSync(path.resolve(here,'../src/components/C15LocalAlpha1/index.jsx'),'utf8');
  const api=fs.readFileSync(path.resolve(here,'../src/services/gameApi.js'),'utf8');
  const authHook=fs.readFileSync(path.resolve(here,'../src/hooks/useAuth.jsx'),'utf8');
  assert.match(ui,/CLAIM VERIFIED REWARD/);assert.match(ui,/CHECK DUPLICATE CLAIM/);assert.match(ui,/DUPLICATE CLAIM VERIFIED/);
  assert.match(ui,/RC3 SETTLEMENT VERIFIED/);assert.match(ui,/production rewards remain off/);
  assert.doesNotMatch(ui,/wallet\.(coins|diamonds)\s*[+\-]=/);assert.match(api,/\/c15\/settlement\/claim/);
  assert.match(ui,/await refreshCloudProfile\(\)/);assert.match(authHook,/request:\(\)=>fetchGameProfile\(\)/);
  assert.match(authHook,/apply:reply=>\{applyServerState\(reply.state\)/);
});
