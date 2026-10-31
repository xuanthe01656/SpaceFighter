'use strict';
/** Offline test/evidence fixture only. Never import from production HTTP. */
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const {resolveCampaignAlphaStage1C6E}=require('../lib/combatCampaignAlphaC6CV8.cjs');
const {createResourceManifestV1}=require('../lib/resourceManifestV1.cjs');
const {createC15CommercialOriginV1}=require('../lib/c15CommercialGenesisV1.cjs');
const {CURRENT_PROFILE_ID,createC15MovementPolicy}=require('../lib/c15ControlProfilesV1.cjs');
const T0=1782000000000;
const UID='c15_rc1_fixture_user';
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const KEY_ID='c15_rc1_key_v1';
const KEY=Buffer.alloc(32,0x5a);
async function createC15Rc1Fixture({battleId=BID,seed=11335577,profileId=CURRENT_PROFILE_ID}={}){
  const POLICY=createC15MovementPolicy(profileId);
  const catalog=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
  const identity={uid:UID,sessionId:SID,battleId,issuedAtMs:T0,expiresAtMs:T0+10*60*1000};
  const profile={campaignData:{loadout:{pilot:'pilot_alpha',aircraft:'ship_xwing',mainGun:'qa_rail',wingman:'',armor:'',drone:''},
    ownedPilots:{pilot_alpha:{level:1,stars:1}},ownedAircrafts:{ship_xwing:{level:1,stars:1}},
    items:{qa_rail:{baseId:'gun_rail',level:1,rarity:1,type:'mainGun'}}}};
  const snapshot=createServerBattleSnapshot({identity,persistedProfile:profile,approvedCatalog:catalog,
    rules:{mode:'campaign',locationId:'alpha_stage_1',rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},
    arena:{halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500},seed});
  const encounter=resolveCampaignAlphaStage1C6E({snapshot});
  const resourceManifest=createResourceManifestV1({generatedAtMs:T0,catalogVersion:'product-v1.0.0',packs:[
    {id:'core-bootstrap',revision:1,sha256:'1'.repeat(64),sizeBytes:256000,quality:'bootstrap',required:true,
      stageKeys:[],url:'https://cdn.example.invalid/packs/core-bootstrap/v1/core-bootstrap.zip',minAppVersion:'1.0.0',
      contentTypes:['ui','ship-atlas'],dependencies:[]},
    {id:'campaign-alpha-mobile-low',revision:1,sha256:'2'.repeat(64),sizeBytes:8_000_000,quality:'mobile-low',required:true,
      stageKeys:['alpha-stage-1'],url:'https://cdn.example.invalid/packs/campaign-alpha-mobile-low/v1/alpha.zip',minAppVersion:'1.0.0',
      contentTypes:['background','enemy-atlas','audio'],dependencies:['core-bootstrap']},
  ]});
  const origin=createC15CommercialOriginV1({snapshot,encounter,policy:POLICY,resourceManifest,
    selectedResourcePackIds:['core-bootstrap','campaign-alpha-mobile-low'],keyId:KEY_ID,key:KEY,
    issuedAtMs:T0,expiresAtMs:T0+10*60*1000});
  return {catalog,snapshot,encounter,resourceManifest,origin,keyRing:{[KEY_ID]:KEY},policy:POLICY,
    issuedAtMs:T0,uid:UID,sessionId:SID,battleId};
}
function openFixtureRun(fixture){
  const s=fixture.snapshot;
  const journal=openInputJournal({uid:fixture.uid,sessionId:fixture.sessionId,battleId:fixture.battleId,
    rulesVersion:s.context.rulesVersion,loadoutHash:s.loadoutHash,issuedAtMs:fixture.issuedAtMs});
  return openCombatVerticalSlice({snapshot:s,journal,policy:fixture.policy,encounter:fixture.encounter});
}
function pushOne(fixture,run,input){
  const chunk={protocol:'pve-input-v1',battleId:fixture.battleId,startTick:run.state.tick,frames:[input]};
  return replayCombatSliceChunk({run,chunk,receivedAtMs:fixture.issuedAtMs+Math.ceil((run.state.tick+1)*1000/30)+10}).run;
}
function generateC15VictoryFrames(fixture){
  let run=openFixtureRun(fixture);const frames=[];
  for(let tick=1;tick<=4500&&run.state.phase==='active';tick++){
    const me=run.foundation.checkpoint.position;
    const choices=run.state.enemies.filter(e=>e.zUnits<8000&&e.zUnits>-19000);
    const enemy=(choices.length?choices:run.state.enemies).slice().sort((a,b)=>b.zUnits-a.zUnits)[0];
    const dx=(enemy?.xUnits??0)-me.xUnits;
    let x=dx>60?-127:dx< -60?127:0;
    let threat=null;
    for(const b of run.state.enemyProjectiles){
      if(b.vzUnits<=0)continue;
      const ticks=(me.zUnits-b.zUnits)/b.vzUnits;
      if(ticks<0||ticks>18)continue;
      const projectedX=b.xUnits+ticks*b.vxUnits;
      if(Math.abs(projectedX-me.xUnits)<2100&&(!threat||ticks<threat.ticks))threat={projectedX,ticks};
    }
    if(threat)x=me.xUnits>threat.projectedX?-127:127;
    const input={x,z:0};run=pushOne(fixture,run,input);frames.push(input);
  }
  if(run.state.phase!=='lab-clear')throw new Error(`C15 victory oracle failed: ${run.state.phase}`);
  return {frames,run};
}
function generateC15DefeatFrames(fixture){
  let run=openFixtureRun(fixture);const frames=[];
  for(let tick=1;tick<=4500&&run.state.phase==='active';tick++){
    // Move toward the enemy lane and do not evade. The deterministic server
    // policy must eventually produce a real defeat, never a client result.
    const input={x:0,z:-127};run=pushOne(fixture,run,input);frames.push(input);
  }
  if(run.state.phase!=='lab-defeat')throw new Error(`C15 defeat oracle failed: ${run.state.phase}`);
  return {frames,run};
}
function chunkC15Frames(frames,battleId){
  const chunks=[];let offset=0,size=15;
  while(offset<frames.length){const count=Math.min(size,frames.length-offset);chunks.push(Object.freeze({protocol:'pve-input-v1',battleId,startTick:offset,frames:Object.freeze(frames.slice(offset,offset+count).map(x=>Object.freeze({...x})))}));offset+=count;size=30;}
  return Object.freeze(chunks);
}
module.exports=Object.freeze({T0,UID,SID,BID,KEY_ID,KEY,createC15Rc1Fixture,openFixtureRun,
  generateC15VictoryFrames,generateC15DefeatFrames,chunkC15Frames});
