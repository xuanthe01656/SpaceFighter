'use strict';
/** FASTLANE C6-C: real stage-1 catalog golden and offline 30Hz gated spawn QA. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const {resolveCampaignAlphaStage1C6C,ALPHA_POLICY_VERSION,
  ENCOUNTER_C6C_VERSION,FIRST_WAVE_AT_TICK,INTER_WAVE_DELAY_TICKS}=require('../lib/combatCampaignAlphaC6CV8.cjs');
const T0=1782000000000;
const SID='53f3a57d-28c3-469b-9e0f-69d16a1f3228';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
const RULES='combat-v1.0.0',CATALOG='product-v1.0.0';
let clientCatalog,worlds;
test.before(async()=>{
  const url=rel=>pathToFileURL(path.resolve(__dirname,'../../client/src',rel)).href;
  [clientCatalog,worlds]=await Promise.all([import(url('constants.js')),
    import(url('game/catalog/worlds.js'))]);
});
const isCode=code=>error=>error?.code===code;
function setup(options={}){
  const uid='c6c_server_owned_qa';
  const identity={uid,sessionId:SID,battleId:BID,issuedAtMs:T0,expiresAtMs:T0+600000};
  const profile={campaignData:{
    loadout:{pilot:'pilot_alpha',aircraft:'ship_xwing',mainGun:'qa_rail',
      wingman:'',armor:'',drone:''},
    ownedPilots:{pilot_alpha:{level:1,stars:1}},
    ownedAircrafts:{ship_xwing:{level:1,stars:1}},
    items:{qa_rail:{baseId:options.gunId||'gun_rail',level:1,rarity:1,type:'mainGun'}},
  }};
  const snapshot=createServerBattleSnapshot({identity,persistedProfile:profile,
    approvedCatalog:clientCatalog,rules:{mode:options.mode||'campaign',
      locationId:options.locationId||'alpha_stage_1',
      rulesVersion:options.rulesVersion||RULES,catalogVersion:CATALOG},
    arena:options.arena||{halfWidthUnits:13200,halfHeightUnits:15000,
      spawnXUnits:0,spawnZUnits:12500},seed:options.seed||11335577});
  const journal=openInputJournal({uid,sessionId:SID,battleId:BID,
    rulesVersion:snapshot.context.rulesVersion,loadoutHash:snapshot.loadoutHash,issuedAtMs:T0});
  const policy={version:'v8c6b-pierce-burst-preview-v3',keyboardUnitsPer60HzFrame:.3,
    pilotHitRadiusUnits:700,projectileHitRadiusUnits:200};
  const encounter=resolveCampaignAlphaStage1C6C({snapshot});
  return {snapshot,encounter,journal,policy,
    open:()=>openCombatVerticalSlice({snapshot,journal,encounter,policy})};
}
const frame=(x=0,z=0)=>({x,z});
function step(run,count,fn=()=>frame()){
  const startTick=run.state.tick;
  const chunk={protocol:'pve-input-v1',battleId:BID,startTick,
    frames:Array.from({length:count},(_,i)=>fn(startTick+i+1))};
  const receivedAtMs=T0+Math.ceil((startTick+count)*1000/30)+5;
  return replayCombatSliceChunk({run,chunk,receivedAtMs});
}
function advance(run,ticks,batch=60,fn=()=>frame()){
  let current=run,events=[];
  for(let count=ticks;count>0;){
    const size=Math.min(count,batch),out=step(current,size,fn);
    current=out.run;events.push(...out.events);count-=size;
  }
  return {run:current,events};
}
test('C6-C stage1 catalog golden: planet Alpha, 5 waves and 70 tier-1 units',()=>{
  assert.equal(worlds.PLANET_CONFIG[1].id,1);
  assert.equal(worlds.PLANET_CONFIG[1].battle.enemyHpMultiplier,1);
  assert.deepEqual(Object.keys(worlds.STAGE_CONFIG[1]).sort(),
    ['waves','baseEnemies','timeLimit','expReward'].sort());
  assert.equal(worlds.STAGE_CONFIG[1].waves,5);
  assert.equal(worlds.STAGE_CONFIG[1].baseEnemies,5);
  assert.equal(worlds.STAGE_CONFIG[1].timeLimit,90);
  assert.deepEqual(worlds.PLANET_ENEMIES[1].find(e=>e.tier===1).baseHp,30);
  assert.equal(worlds.PLANET_ENEMIES[1].find(e=>e.tier===1).speedMin,50);
  assert.equal(worlds.PLANET_ENEMIES[1].find(e=>e.tier===1).speedMax,150);
  const a=setup(),e=a.encounter;
  assert.equal(e.campaignPolicyVersion,ALPHA_POLICY_VERSION);
  assert.equal(e.version,ENCOUNTER_C6C_VERSION);
  assert.equal(e.stageId,1);
  assert.equal(e.interWaveDelayTicks,INTER_WAVE_DELAY_TICKS);
  assert.deepEqual(e.waves.map(w=>w.enemies.length),[8,11,14,17,20]);
  assert.equal(e.waves.reduce((sum,w)=>sum+w.enemies.length,0),70);
  assert.deepEqual(e.waves.map(w=>w.enemies[0].hp),[50,55,60,65,70]);
  assert.ok(e.waves.flatMap(w=>w.enemies).every(enemy=>enemy.kind==='grunt'
    && enemy.zUnits===-18000 && enemy.hitRadiusUnits===1300));
});
test('C6-C stage1 pinned spawn intervals match CampaignScene formula (30Hz rounded)',()=>{
  const a=setup();
  const ms=Array.from({length:5},(_,i)=>Math.max(300,1500-(100+(i+1)*50)));
  assert.deepEqual(ms,[1350,1300,1250,1200,1150]);
  assert.deepEqual(a.encounter.waves.map(w=>w.spawnIntervalTicks),
    ms.map(value=>Math.ceil(value*30/1000)));
  assert.deepEqual(a.encounter.waves.map(w=>w.firstSpawnDelayTicks),
    ms.map(value=>Math.ceil((500+value)*30/1000)));
  const src=fs.readFileSync(path.resolve(__dirname,'../../client/src/components/Campaign/CampaignScene.js'),'utf8');
  assert.match(src,/waveCount\s*=\s*\(stageConfig\.baseEnemies\s*\|\|\s*5\)\s*\+\s*currentWave\s*\*\s*3/);
  assert.match(src,/spawnInterval\s*=\s*Math\.max\(300,\s*1500\s*-\s*\(currentStage\s*\*\s*100\s*\+\s*currentWave\s*\*\s*50\)\)/);
  assert.match(src,/lastSpawn\s*=\s*Date\.now\(\)\s*\+\s*500/);
  assert.match(src,/scheduleBattleTimer\(\(\)\s*=>\s*startWave\(currentWave\+1\),\s*2000\)/);
  assert.match(src,/scheduleBattleTimer\(\(\)\s*=>\s*startWave\(1\),\s*1000\)/);
});
test('C6-C encounter entirely server-authored and frozen across reproducible seed',()=>{
  const a=setup({seed:23145}),b=setup({seed:23145}),c=setup({seed:23146});
  assert.deepEqual(a.encounter,b.encounter);
  assert.notDeepEqual(a.encounter.waves[0].enemies,c.encounter.waves[0].enemies);
  assert.equal(Object.isFrozen(a.encounter),true);
  assert.equal(Object.isFrozen(a.encounter.waves[0].enemies[0]),true);
  assert.equal(a.encounter.qaOnly,true);
  assert.equal(a.open().state.safeForCloudBattle,false);
});
test('C6-C opener rejects client-edited wave enemy HP/count/timing/reward',()=>{
  const a=setup();
  for(const mutate of [
    e=>{e.waves[0].enemies[0].hp+=1;},
    e=>{e.waves[0].enemies.pop();},
    e=>{e.waves[0].firstSpawnDelayTicks=1;},
    e=>{e.interWaveDelayTicks=1;},
    e=>{e.rewards={coins:100000};},
    e=>{e.victory=true;},
  ]){
    const forged=structuredClone(a.encounter);mutate(forged);
    assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,
      journal:a.journal,policy:a.policy,encounter:forged}),error=>['SLICE_STAGE_FORGED','SLICE_ENCOUNTER_INVALID'].includes(error?.code));
  }
});
test('C6-C resolver rejects wrong mode, stage, catalog, arena or unapproved arguments',()=>{
  for(const options of [{mode:'dungeon'},{locationId:'alpha_stage_2'},
    {rulesVersion:'combat-v2.0.0'},
    {arena:{halfWidthUnits:14000,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500}}]){
    // Snapshot creation itself is allowed; stage policy must refuse it.
    assert.throws(()=>setup(options),isCode('ALPHA_C6C_UNSUPPORTED'));
  }
  const a=setup();
  assert.throws(()=>resolveCampaignAlphaStage1C6C({snapshot:a.snapshot,waves:[]}),isCode('ALPHA_C6C_INPUT'));
});
test('C6-C pinned policy refuses a different valid gun loadout rather than silently simulating',()=>{
  assert.throws(()=>setup({gunId:'gun_pulse'}),isCode('ALPHA_C6C_LOADOUT_UNSUPPORTED'));
});
test('C6-C tick 31 begins first wave; spawn delayed until tick 87',()=>{
  const a=setup(),initial=a.open();
  assert.equal(initial.state.version,'pve-lab-vertical-slice-v6');
  assert.equal(initial.state.nextWaveTick,FIRST_WAVE_AT_TICK);
  const before=advance(initial,30).run;
  assert.equal(before.state.spawnedWaves,0);
  const started=step(before,1);
  assert.deepEqual(started.events.filter(e=>e.type==='wave').map(e=>e.wave),[1]);
  assert.equal(started.run.state.spawnedWaves,1);
  assert.equal(started.run.state.spawnedInWave,0);
  assert.equal(started.run.state.nextSpawnTick,87);
  const to86=advance(started.run,55);
  assert.equal(to86.run.state.spawnedInWave,0);
  const to87=step(to86.run,1);
  assert.deepEqual(to87.events.filter(e=>e.type==='spawn').map(e=>e.id),['alpha1_w1_e1']);
  assert.equal(to87.run.state.spawnedInWave,1);
  assert.equal(to87.run.state.nextSpawnTick,128);
  assert.equal(to87.run.state.safeForCloudBattle,false);
});
test('C6-C first enemy is materialised against player X on its spawn tick',()=>{
  const a=setup();
  const until=advance(a.open(),87,29,()=>frame(-127,0));
  const enemy=until.run.state.enemies.find(e=>e.id==='alpha1_w1_e1');
  // Enemy also moves towards the player during the spawn tick. Keep a small
  // tolerance for that movement, but enforce player-relative offset/clamp.
  const bound=13200-1300;
  const ideal=Math.max(-bound,Math.min(bound,
    until.run.foundation.checkpoint.position.xUnits+a.encounter.waves[0].enemies[0].xUnits));
  assert.ok(enemy && Math.abs(enemy.xUnits-ideal)<500);
});
test('C6-C first wave spawns one by one and cannot open wave2 while not cleared',()=>{
  const a=setup();
  const until=advance(a.open(),440,60);
  assert.equal(until.run.state.spawnedWaves,1);
  assert.equal(until.run.state.spawnedInWave,8);
  assert.equal(until.run.state.nextSpawnTick,0);
  assert.equal(until.events.filter(e=>e.type==='spawn').length,8);
  assert.equal(until.events.filter(e=>e.type==='wave').length,1);
  const gate=until.events.find(e=>e.type==='wave-cleared');
  if(gate){
    // For this pinned loadout/seed, all eight were defeated during wave 1.
    assert.equal(until.run.state.nextWaveTick,gate.tick+INTER_WAVE_DELAY_TICKS);
    const untilNext=advance(until.run,until.run.state.nextWaveTick-until.run.state.tick-1);
    assert.equal(untilNext.run.state.spawnedWaves,1);
    const next=step(untilNext.run,1);
    assert.deepEqual(next.events.filter(e=>e.type==='wave').map(e=>e.wave),[2]);
  } else {
    // If any target survives, the next wave MUST remain blocked.
    assert.equal(until.run.state.nextWaveTick,0);
    assert.ok(until.run.state.enemies.length>0);
  }
  assert.equal(until.run.state.safeForCloudBattle,false);
});
test('C6-C chunk invariant state and emitted events for fixed 30Hz input',()=>{
  const a=setup();
  const f=tick=>frame(tick%31===0?15:0,0);
  const left=advance(a.open(),200,40,f);
  const right=advance(a.open(),200,25,f);
  assert.deepEqual(left.run.state,right.run.state);
  assert.deepEqual(left.events,right.events);
  assert.deepEqual(left.run.foundation.checkpoint.position,right.run.foundation.checkpoint.position);
});
test('C6-C retry identical last chunk neither respawns nor advances gate',()=>{
  const a=setup();
  const before=advance(a.open(),85).run;
  const next=step(before,2);
  const resend={protocol:'pve-input-v1',battleId:BID,startTick:85,
    frames:[frame(),frame()]};
  const repeated=replayCombatSliceChunk({run:next.run,chunk:resend,
    receivedAtMs:T0+Math.ceil(87*1000/30)+200});
  assert.equal(repeated.duplicate,true);
  assert.equal(repeated.run,next.run);
  assert.equal(repeated.events.length,0);
});
test('C6-C illegal journal outcome field and fast-forward still rejected',()=>{
  const a=setup();
  const bad={protocol:'pve-input-v1',battleId:BID,startTick:0,frames:[frame()],victory:true};
  assert.throws(()=>replayCombatSliceChunk({run:a.open(),chunk:bad,receivedAtMs:T0+100}),isCode('INPUT_CHUNK_INVALID'));
  const tooFast={protocol:'pve-input-v1',battleId:BID,startTick:0,
    frames:Array.from({length:60},()=>frame())};
  assert.throws(()=>replayCombatSliceChunk({run:a.open(),chunk:tooFast,receivedAtMs:T0+5}),isCode('INPUT_FAST_FORWARD'));
});
test('C6-C no Cloud API/economy/Firestore imports or reward entrypoints',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../lib/combatCampaignAlphaC6CV8.cjs'),'utf8');
  assert.doesNotMatch(src,/require\(['"].*(?:economy|gameService|firebase|firestore|server)/i);
  assert.deepEqual(Object.keys(require('../lib/combatCampaignAlphaC6CV8.cjs')).sort().filter(k=>/settle|reward|http|admission/i.test(k)),[]);
  const a=setup();
  assert.equal(a.open().state.qaOnly,true);
  assert.equal(a.open().state.safeForCloudBattle,false);
});
