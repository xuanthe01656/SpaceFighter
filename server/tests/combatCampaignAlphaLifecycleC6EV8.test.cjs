'use strict';
/** C6-E: end-to-end, offline QA-only Alpha stage 1 lifecycle and replay. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const {resolveCampaignAlphaStage1C6D,resolveCampaignAlphaStage1C6E,
  ENCOUNTER_C6D_VERSION,ENCOUNTER_C6E_VERSION,ALPHA_POLICY_C6E_VERSION,
  shouldCullCampaignEnemy}=require('../lib/combatCampaignAlphaC6CV8.cjs');
const T0=1782000000000;
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const isCode=code=>error=>error?.code===code;
let catalog;
test.before(async()=>{
  catalog=await import(pathToFileURL(path.resolve(__dirname,'../../client/src/constants.js')).href);
});
function createCase(override={}){
  const uid='c6e_server_owned_test';
  const identity={uid,sessionId:SID,battleId:BID,issuedAtMs:T0,expiresAtMs:T0+600000};
  const profile={campaignData:{
    loadout:{pilot:'pilot_alpha',aircraft:'ship_xwing',mainGun:'qa_rail',
      wingman:'',armor:'',drone:''},
    ownedPilots:{pilot_alpha:{level:1,stars:1}},
    ownedAircrafts:{ship_xwing:{level:1,stars:1}},
    items:{qa_rail:{baseId:override.gunId||'gun_rail',level:1,rarity:1,type:'mainGun'}},
  }};
  const snapshot=createServerBattleSnapshot({identity,persistedProfile:profile,
    approvedCatalog:catalog,rules:{mode:override.mode||'campaign',
      locationId:override.locationId||'alpha_stage_1',
      rulesVersion:'combat-v1.0.0',catalogVersion:'product-v1.0.0'},
    arena:{halfWidthUnits:13200,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500},
    seed:override.seed||11335577});
  const journal=openInputJournal({uid,sessionId:SID,battleId:BID,
    rulesVersion:snapshot.context.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs:T0});
  const policy={version:'v8c6b-pierce-burst-preview-v3',keyboardUnitsPer60HzFrame:.3,
    pilotHitRadiusUnits:700,projectileHitRadiusUnits:200};
  const encounter=override.legacy?resolveCampaignAlphaStage1C6D({snapshot})
    :resolveCampaignAlphaStage1C6E({snapshot});
  return {snapshot,journal,policy,encounter,
    open:()=>openCombatVerticalSlice({snapshot,journal,policy,encounter})};
}
function pushFrames(run,frames){
  const chunk={protocol:'pve-input-v1',battleId:BID,startTick:run.state.tick,frames};
  return replayCombatSliceChunk({run,chunk,
    receivedAtMs:T0+Math.ceil((run.state.tick+frames.length)*1000/30)+10});
}
function playback(factory,frames,batchSize){
  let run=factory.open(),events=[];
  for(let i=0;i<frames.length;i+=batchSize){
    if(run.state.phase!=='active')throw Error(`Early terminal at ${i}, expected ${frames.length} frames`);
    const out=pushFrames(run,frames.slice(i,i+batchSize));
    run=out.run;events.push(...out.events);
  }
  return {run,events};
}
function generateGolden(kind='kills'){
  // The controller is an OFFLINE TEST ORACLE, NOT a released touch controller:
  // it uses the server's state to aim and evade. The generated 30Hz frames
  // are subsequently replayed without any privileged state or event injection.
  const setup=createCase();
  let run=setup.open();const frames=[],events=[];
  for(let tick=1;tick<=4500 && run.state.phase==='active';tick++){
    const me=run.foundation.checkpoint.position;
    const choices=run.state.enemies.filter(e=>e.zUnits<8000 && e.zUnits>-19000);
    const enemy=(choices.length?choices:run.state.enemies)
      .slice().sort((a,b)=>b.zUnits-a.zUnits)[0];
    const dx=(enemy?.xUnits??0)-me.xUnits;
    let x=dx>60?-127:dx< -60?127:0;
    let threat=null;
    for(const b of run.state.enemyProjectiles){
      if(b.vzUnits<=0)continue;
      const ticks=(me.zUnits-b.zUnits)/b.vzUnits;
      if(ticks<0||ticks>18)continue;
      const projectedX=b.xUnits+ticks*b.vxUnits;
      if(Math.abs(projectedX-me.xUnits)<2100 && (!threat||ticks<threat.ticks)){
        threat={projectedX,ticks};
      }
    }
    if(threat) x=me.xUnits>threat.projectedX?-127:127;
    const input=kind==='contact' && tick<115?{x:0,z:-127}
      :kind==='contact' && tick<220?{x:0,z:127}:{x,z:0};
    const out=pushFrames(run,[input]);run=out.run;
    frames.push(input);events.push(...out.events);
  }
  if(run.state.phase!=='lab-clear'){
    throw Error(`QA controller did not complete: ${JSON.stringify({
      tick:run.state.tick,phase:run.state.phase,hp:run.state.hp,
      kills:run.state.kills,contacts:run.state.contacts,
      escaped:run.state.escaped,spawned:run.state.spawnedInWave})}`);
  }
  return {setup,run,frames,events};
}

test('C6-E pinned resolver reuses identical C6-D seeded enemies, but a new QA contract',()=>{
  const a=createCase();
  const d=resolveCampaignAlphaStage1C6D({snapshot:a.snapshot});
  const e=resolveCampaignAlphaStage1C6E({snapshot:a.snapshot});
  assert.equal(d.version,ENCOUNTER_C6D_VERSION);
  assert.equal(e.version,ENCOUNTER_C6E_VERSION);
  assert.equal(e.campaignPolicyVersion,ALPHA_POLICY_C6E_VERSION);
  assert.deepEqual(e.waves,d.waves);
  assert.equal(e.waves.flatMap(w=>w.enemies).length,70);
  assert.equal(Object.isFrozen(e.waves[0].enemies[0]),true);
  assert.equal(a.open().state.version,'pve-lab-vertical-slice-v8');
  assert.equal(a.open().state.safeForCloudBattle,false);
  assert.equal(a.open().state.escaped,0);
});
test('C6-E client culling oracle is strictly z > ZOOM+5 and never a kill',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../client/src/components/Campaign/CampaignScene.js'),'utf8');
  assert.match(src,/if\s*\(e\.mesh\.position\.z\s*>\s*ZOOM\s*\+\s*5\)\s*\{\s*cleanEnemy\(e\)/);
  assert.match(src,/const\s+alive\s*=\s*enemies\.filter\(e\s*=>\s*!e\._dead\)\.length/);
  assert.match(src,/else\s+if\s*\(!stageConfig\.hasBoss\)\s*\{\s*stageCleared\(\)/);
  assert.equal(shouldCullCampaignEnemy(20000,15000),false);
  assert.equal(shouldCullCampaignEnemy(20001,15000),true);
  assert.equal(shouldCullCampaignEnemy(-40000,15000),false);
  assert.throws(()=>shouldCullCampaignEnemy(NaN,15000),isCode('ALPHA_C6E_CULL_INPUT'));
});
test('C6-E full stage QA replay: all 5 waves, 70 real simulation kills, deterministic terminal',()=>{
  const g=generateGolden('kills');
  assert.equal(g.run.state.phase,'lab-clear');
  assert.equal(g.run.state.spawnedWaves,5);
  assert.equal(g.run.state.spawnedInWave,20);
  assert.equal(g.run.state.kills,70);
  assert.equal(g.run.state.contacts,0);
  assert.equal(g.run.state.escaped,0);
  assert.ok(g.run.state.hp>0);
  assert.equal(g.events.filter(e=>e.type==='spawn').length,70);
  assert.equal(g.events.filter(e=>e.type==='kill').length,70);
  assert.equal(g.events.filter(e=>e.type==='wave-cleared').length,4);
  assert.deepEqual(g.events.filter(e=>e.type==='lab-stage-cleared').map(e=>[e.kills,e.contacts,e.escaped]),[[70,0,0]]);
  assert.equal(g.run.state.safeForCloudBattle,false);
  assert.ok(g.run.state.stateDigest && g.run.state.traceDigest);
  const other=playback(g.setup,g.frames,55);
  assert.deepEqual(other.run.state,g.run.state);
  assert.deepEqual(other.events,g.events);
  assert.equal(other.run.state.phase,'lab-clear');
  const last={protocol:'pve-input-v1',battleId:BID,
    startTick:g.run.state.tick-1,frames:[g.frames.at(-1)]};
  const repeated=replayCombatSliceChunk({run:g.run,chunk:last,
    receivedAtMs:T0+Math.ceil(g.run.state.tick*1000/30)+20});
  assert.equal(repeated.duplicate,true);
  assert.equal(repeated.run,g.run);
  assert.deepEqual(repeated.events,[]);
  assert.throws(()=>pushFrames(g.run,[{x:0,z:0}]),isCode('SLICE_TERMINAL'));
});
test('C6-E full QA completion with 69 kills and 1 contact; C6-D remains active on identical frames',()=>{
  const g=generateGolden('contact');
  assert.equal(g.run.state.phase,'lab-clear');
  assert.equal(g.run.state.kills,69);
  assert.equal(g.run.state.contacts,1);
  assert.equal(g.run.state.escaped,0);
  assert.equal(g.run.state.hp,890);
  assert.equal(g.events.filter(e=>e.type==='spawn').length,70);
  assert.equal(g.events.filter(e=>e.type==='contact').length,1);
  assert.deepEqual(g.events.filter(e=>e.type==='lab-stage-cleared').map(e=>[e.kills,e.contacts,e.escaped]),[[69,1,0]]);
  const segmented=playback(g.setup,g.frames,60);
  assert.deepEqual(segmented.run.state,g.run.state);
  assert.deepEqual(segmented.events,g.events);
  const legacy=createCase({legacy:true});
  const old=playback(legacy,g.frames,60);
  assert.equal(old.run.state.phase,'active');
  assert.equal(old.run.state.kills,69);
  assert.equal(old.run.state.contacts,1);
  assert.equal(old.run.state.safeForCloudBattle,false);
});
test('C6-E refuses additional input frames appended after server terminal in a single chunk',()=>{
  const g=generateGolden('kills');
  const before=playback(g.setup,g.frames.slice(0,-1),60).run;
  assert.equal(before.state.phase,'active');
  assert.throws(()=>pushFrames(before,[g.frames.at(-1),{x:0,z:0}]),
    isCode('SLICE_TERMINAL_FRAME_TAIL'));
});
test('C6-E retry of accepted journal is a no-op, no duplicate spawn/contact/clear',()=>{
  const a=createCase(),opened=a.open();
  const chunk={protocol:'pve-input-v1',battleId:BID,startTick:0,frames:[{x:0,z:0},{x:0,z:0}]};
  const first=replayCombatSliceChunk({run:opened,chunk,receivedAtMs:T0+100});
  const second=replayCombatSliceChunk({run:first.run,chunk,receivedAtMs:T0+120});
  assert.equal(second.duplicate,true);
  assert.equal(second.run,first.run);
  assert.deepEqual(second.events,[]);
});
test('C6-E fail closed on forged waves, lifecycle payload or unsupported gun',()=>{
  const a=createCase();
  assert.throws(()=>createCase({gunId:'gun_pulse'}),isCode('ALPHA_C6C_LOADOUT_UNSUPPORTED'));
  for(const change of [e=>{e.version=ENCOUNTER_C6D_VERSION;},
    e=>{e.campaignPolicyVersion='fake';},
    e=>{e.waves[0].enemies[0].hp=1;},
    e=>{e.victory=true;},e=>{e.rewards={coins:999};}]){
    const forged=structuredClone(a.encounter);change(forged);
    assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,journal:a.journal,
      policy:a.policy,encounter:forged}),err=>['SLICE_STAGE_FORGED','SLICE_ENCOUNTER_INVALID'].includes(err?.code));
  }
  assert.throws(()=>pushFrames(a.open(),[{x:0,z:0,victory:true}]),isCode('INPUT_FRAME_INVALID'));
  assert.throws(()=>resolveCampaignAlphaStage1C6E({snapshot:a.snapshot,waves:[]}),isCode('ALPHA_C6C_INPUT'));
  const fake=structuredClone(a.open());fake.state.escaped=70;
  assert.throws(()=>pushFrames(fake,[{x:0,z:0}]),isCode('SLICE_STATE_INVALID'));
});
test('C6-E cross-checks lifecycle ledger even if an attacker recomputes the QA checksum',()=>{
  const a=createCase(),initial=a.open();
  // Hashes are deterministic consistency checks, not MACs. Attackers can
  // recompute one; the independent lifecycle invariant must still reject it.
  for(const changed of [{escaped:1},{phase:'lab-clear'}]){
    const fields={...initial.state,...changed};
    delete fields.stateDigest;
    const stateDigest=createHash('sha256').update(JSON.stringify(['sf-v8b-slice-state',fields])).digest('hex');
    const fake=Object.freeze({...fields,stateDigest});
    const forged=Object.freeze({...initial,state:fake});
    assert.throws(()=>pushFrames(forged,[{x:0,z:0}]),isCode('SLICE_LIFECYCLE_STATE_INVALID'));
  }
});
test('C6-E never imports economy/HTTP/Firestore and keeps existing P0 gate untouched',()=>{
  for(const file of ['combatVerticalSliceV8.cjs','combatCampaignAlphaC6CV8.cjs']){
    const code=fs.readFileSync(path.resolve(__dirname,'../lib',file),'utf8');
    assert.doesNotMatch(code,/require\(['"].*(?:economy|gameService|firebase|firestore|server)/i);
  }
  const game=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  assert.match(game,/BATTLE_VERIFICATION_UNAVAILABLE/);
  const run=createCase().open();
  assert.equal(run.state.qaOnly,true);
  assert.equal(run.state.safeForCloudBattle,false);
});
