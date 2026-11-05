'use strict';
/** FASTLANE C6-D: pinned Alpha stage-1 melee/shooter AI and fire timing QA. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const {createServerBattleSnapshot}=require('../lib/battleSnapshotV8.cjs');
const {openInputJournal}=require('../lib/combatInputJournalV8.cjs');
const {openCombatVerticalSlice,replayCombatSliceChunk}=require('../lib/combatVerticalSliceV8.cjs');
const {resolveCampaignAlphaStage1C6C,resolveCampaignAlphaStage1C6D,
  ENCOUNTER_C6C_VERSION,ENCOUNTER_C6D_VERSION,ALPHA_POLICY_C6D_VERSION,
  FIRST_WAVE_AT_TICK}=require('../lib/combatCampaignAlphaC6CV8.cjs');
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
  const encounter=resolveCampaignAlphaStage1C6D({snapshot});
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

test('C6-D client code oracle has distinct melee chase and shooter sine/patrol behaviors',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../client/src/components/Campaign/CampaignScene.js'),'utf8');
  assert.match(src,/velX:\s*tier===4\s*\?\s*0\s*:\s*\(Math\.random\(\)-\.5\)\*\.05/);
  assert.match(src,/sineOff:\s*Math\.random\(\)\s*\*\s*Math\.PI\s*\*\s*2/);
  assert.match(src,/canShoot:\s*tier\s*!==\s*4\s*&&\s*Math\.random\(\)\s*>\s*\.5/);
  assert.match(src,/if\s*\(!e\.canShoot\)\s*\{/);
  assert.match(src,/e\.speed\s*\*\s*1\.2\s*\*\s*enemyFrame/);
  assert.match(src,/Math\.sin\(tick\s*\*\s*\.03\s*\+\s*e\.sineOff\)\s*\*\s*\.04/);
  assert.match(src,/e\.mesh\.position\.z\s*>\s*ZOOM\s*\*\s*\.65/);
  assert.match(src,/e\.mesh\.position\.z\s*<\s*-ZOOM\s*\+\s*1/);
  assert.match(src,/lastShoot:\s*0\s*,\s*shootMs:\s*tier===3\s*\?\s*1400\s*:\s*2200/);
  assert.match(src,/if\s*\(\s*!guestAbilities\?\.modifiers\(\)\.cloaked\s*&&\s*now\s*>\s*e\.lastShoot\s*\+\s*e\.shootMs\s*\)/);
});
test('C6-D version is opt-in and leaves all 70 C6-C QA-v6 enemies unchanged',()=>{
  const a=setup(),c=resolveCampaignAlphaStage1C6C({snapshot:a.snapshot});
  assert.equal(a.encounter.version,ENCOUNTER_C6D_VERSION);
  assert.equal(c.version,ENCOUNTER_C6C_VERSION);
  assert.equal(a.encounter.campaignPolicyVersion,ALPHA_POLICY_C6D_VERSION);
  assert.deepEqual(a.encounter.waves.map(w=>w.enemies.length),[8,11,14,17,20]);
  assert.equal(a.encounter.waves.flatMap(w=>w.enemies).length,70);
  assert.deepEqual(a.encounter.waves.map(w=>w.enemies.map(e=>{
    const {lateralVelocityUnitsPerTick,sinePhaseMicroRad,...original}=e;
    return {...original,behavior:'chase'};
  })), c.waves.map(w=>w.enemies));
  assert.equal(a.open().state.version,'pve-lab-vertical-slice-v7');
  assert.equal(a.open().state.safeForCloudBattle,false);
});
test('C6-D server seed pins shooter flags/drift/phase and not client payload',()=>{
  const a=setup({seed:11335577}),b=setup({seed:11335577}),c=setup({seed:11335578});
  assert.deepEqual(a.encounter,b.encounter);
  assert.notDeepEqual(a.encounter.waves[0].enemies,c.encounter.waves[0].enemies);
  const roster=a.encounter.waves.flatMap(w=>w.enemies);
  assert.ok(roster.some(e=>e.behavior==='shooter-sine'));
  assert.ok(roster.some(e=>e.behavior==='chase'));
  for(const e of roster){
    assert.equal(e.kind,'grunt');
    assert.equal(e.behavior==='shooter-sine',e.shotPattern==='aimed');
    if(e.behavior==='shooter-sine'){
      assert.ok(Math.abs(e.lateralVelocityUnitsPerTick)<=50);
      assert.ok(e.sinePhaseMicroRad>=0 && e.sinePhaseMicroRad<=6283186);
    }else{
      assert.equal(e.lateralVelocityUnitsPerTick,0);
      assert.equal(e.sinePhaseMicroRad,0);
    }
  }
  assert.equal(Object.isFrozen(a.encounter.waves[0].enemies[0]),true);
});
test('C6-D first materialised enemy does NOT move or shoot in its spawn tick',()=>{
  const a=setup();
  const before=advance(a.open(),86).run;
  const next=step(before,1);
  const fixture=a.encounter.waves[0].enemies[0];
  const actual=next.run.state.enemies.find(e=>e.id===fixture.id);
  assert.equal(actual.spawnTick,87);
  assert.equal(actual.zUnits,-18000);
  const bound=13200-fixture.hitRadiusUnits;
  const x=Math.max(-bound,Math.min(bound,next.run.foundation.checkpoint.position.xUnits+fixture.xUnits));
  assert.equal(actual.xUnits,x);
  assert.equal(next.events.filter(e=>e.type==='enemy-fire').length,0);
  assert.equal(next.run.state.safeForCloudBattle,false);
});
test('C6-D pinned shooter moves in Z with sine X and fires on first following tick',()=>{
  const a=setup();
  const shooters=a.encounter.waves[0].enemies.map((e,i)=>({e,i})).filter(v=>v.e.behavior==='shooter-sine');
  assert.ok(shooters.length>0);
  const target=shooters[0];
  const firstTick=87+target.i*a.encounter.waves[0].spawnIntervalTicks;
  const before=advance(a.open(),firstTick-1).run;
  const born=step(before,1);
  const e0=born.run.state.enemies.find(e=>e.id===target.e.id);
  assert.ok(e0 && e0.spawnTick===firstTick);
  const stepped=step(born.run,1);
  const e1=stepped.run.state.enemies.find(e=>e.id===target.e.id);
  assert.ok(e1);
  assert.equal(e1.zUnits,e0.zUnits+e0.moveUnitsPerTick);
  const xStep=e0.lateralVelocityUnitsPerTick+
    Math.round(Math.sin((firstTick+1)*.06+e0.sinePhaseMicroRad/1000000)*80);
  assert.equal(e1.xUnits,Math.max(-13200,Math.min(13200,e0.xUnits+xStep)));
  assert.ok(stepped.events.some(e=>e.type==='enemy-fire' && e.id===target.e.id && e.tick===firstTick+1));
  assert.equal(born.events.some(e=>e.type==='enemy-fire'&&e.id===target.e.id),false);
});
test('C6-D melee movement uses 1.2x speed and does not shoot',()=>{
  const a=setup();
  const melee=a.encounter.waves[0].enemies.map((e,i)=>({e,i})).filter(v=>v.e.behavior==='chase');
  assert.ok(melee.length>0);
  const target=melee[0];
  const firstTick=87+target.i*a.encounter.waves[0].spawnIntervalTicks;
  const born=advance(a.open(),firstTick).run;
  const e0=born.state.enemies.find(e=>e.id===target.e.id);
  assert.ok(e0);
  const pos=born.foundation.checkpoint.position;
  const dx=pos.xUnits-e0.xUnits,dz=pos.zUnits-e0.zUnits,d=Math.hypot(dx,dz)||1;
  const speed=Math.round(e0.moveUnitsPerTick*1.2);
  const future=step(born,1);
  const e1=future.run.state.enemies.find(e=>e.id===target.e.id);
  assert.ok(e1);
  assert.equal(e1.xUnits,Math.max(-13200,Math.min(13200,e0.xUnits+Math.round(dx/d*speed))));
  assert.equal(e1.zUnits,Math.max(-15000,Math.min(15000,e0.zUnits+Math.round(dz/d*speed))));
  assert.equal(future.events.some(e=>e.type==='enemy-fire' && e.id===target.e.id),false);
});
test('C6-D chunk segmentation leaves stage state AND AI/fire events invariant',()=>{
  const a=setup(),inputs=t=>frame(t%27===0?22:0,t%41===0?-15:0);
  const left=advance(a.open(),220,55,inputs);
  const right=advance(a.open(),220,22,inputs);
  assert.deepEqual(left.run.state,right.run.state);
  assert.deepEqual(left.events,right.events);
  assert.deepEqual(left.run.foundation.checkpoint.position,right.run.foundation.checkpoint.position);
});
test('C6-D duplicate journal chunk cannot duplicate an enemy shot or spawn',()=>{
  const a=setup(),run=advance(a.open(),86).run,next=step(run,2);
  const chunk={protocol:'pve-input-v1',battleId:BID,startTick:86,frames:[frame(),frame()]};
  const repeated=replayCombatSliceChunk({run:next.run,chunk,receivedAtMs:T0+4000});
  assert.equal(repeated.duplicate,true);
  assert.equal(repeated.run,next.run);
  assert.deepEqual(repeated.events,[]);
});
test('C6-D refuses attacker modifications to pinned AI motion, schedule or outcome',()=>{
  const a=setup();
  for(const mutate of [
    e=>{e.waves[0].enemies[0].lateralVelocityUnitsPerTick+=1;},
    e=>{e.waves[0].enemies[0].sinePhaseMicroRad+=1;},
    e=>{e.waves[0].enemies[0].behavior='shooter-sine';},
    e=>{e.waves[0].enemies[0].shootEveryTicks=1;},
    e=>{e.waves[0].enemies.pop();},
    e=>{e.campaignPolicyVersion='fake';},
    e=>{e.victory=true;},
    e=>{e.rewards={coins:9999};},
  ]){
    const forged=structuredClone(a.encounter);mutate(forged);
    assert.throws(()=>openCombatVerticalSlice({snapshot:a.snapshot,journal:a.journal,
      policy:a.policy,encounter:forged}),error=>['SLICE_STAGE_FORGED','SLICE_ENCOUNTER_INVALID'].includes(error?.code));
  }
});
test('C6-D rejects unrelated mode, stage, arena and unapproved loadout',()=>{
  for(const opts of [{mode:'dungeon'},{locationId:'alpha_stage_3'},
    {arena:{halfWidthUnits:13500,halfHeightUnits:15000,spawnXUnits:0,spawnZUnits:12500}},
    {gunId:'gun_pulse'}]) {
    assert.throws(()=>setup(opts),e=>['ALPHA_C6C_LOADOUT_UNSUPPORTED','ALPHA_C6C_UNSUPPORTED'].includes(e?.code));
  }
});
test('C6-D input does not accept victory/stars or clock fast-forward',()=>{
  const a=setup();
  assert.throws(()=>replayCombatSliceChunk({run:a.open(),chunk:{
    protocol:'pve-input-v1',battleId:BID,startTick:0,frames:[frame()],victory:true,stars:3,
  },receivedAtMs:T0+100}),isCode('INPUT_CHUNK_INVALID'));
  assert.throws(()=>replayCombatSliceChunk({run:a.open(),chunk:{
    protocol:'pve-input-v1',battleId:BID,startTick:0,frames:Array.from({length:60},()=>frame()),
  },receivedAtMs:T0+5}),isCode('INPUT_FAST_FORWARD'));
});
test('C6-D QA resolver and engine maintain locked Cloud Battle and never import settlement',()=>{
  for(const file of ['../lib/combatCampaignAlphaC6CV8.cjs','../lib/combatVerticalSliceV8.cjs']) {
    const src=fs.readFileSync(path.resolve(__dirname,file),'utf8');
    assert.doesNotMatch(src,/require\(['"].*(?:economy|gameService|firebase|firestore|server)/i);
  }
  const a=setup();
  assert.equal(a.open().state.qaOnly,true);
  assert.equal(a.open().state.safeForCloudBattle,false);
  const p0=fs.readFileSync(path.resolve(__dirname,'../lib/gameService.cjs'),'utf8');
  assert.match(p0,/BATTLE_VERIFICATION_UNAVAILABLE/);
});
test('C6-D stage 1 90s is a star-condition, not a forced mid-fight defeat',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../client/src/components/Campaign/CampaignScene.js'),'utf8');
  assert.equal(worlds.STAGE_CONFIG[1].timeLimit,90);
  assert.match(src,/const\s+limit\s*=\s*stageConfig\.timeLimit\s*\|\|\s*150/);
  assert.match(src,/const\s+c3Met\s*=\s*timeTaken\s*<=\s*limit/);
  assert.match(src,/if\s*\(c2Met\)\s*stars\+\+;\s*if\s*\(c3Met\)\s*stars\+\+/);
  const a=setup(),r=advance(a.open(),210).run;
  assert.notEqual(r.state.phase,'lab-clear');
  assert.equal(r.state.safeForCloudBattle,false);
});
