'use strict';
/**
 * Dungeon C15 V2C.9: DEMO-EMULATOR-ONLY per-tick touch / server-read loadout proof.
 *
 * Reads an admitted, HMAC-verified V2B.2 QA ticket; validates an entire closed
 * accepted-pointer trace using the V2B.2 and V2B.3 services; converts its
 * CLIENT-REPORTED RELATIVE timestamps into 60-Hz candidate player positions;
 * derives battle stats from a fresh SERVER-READ Firestore Emulator profile and
 * the unchanged versioned shared client catalog + battle-stat calculator.
 *
 * It intentionally DOES NOT drive V2C.8's fixed-position/fixed-weapon combat
 * loop; it does not independently establish device clocks, authenticity,
 * actual production account loadout, movement/input tick parity, gameplay
 * damage, victory, or rewards. No HTTP route, writes, or economic authority.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonUnifiedCombatV2C8Config}=require('./c15DungeonUnifiedCombatV2C8.cjs');

const VERSION='c15-dungeon-input-loadout-v2c9';
const TICK_HZ=60,MAX_TICKS=360,MAX_BATCH=60,MAX_TRACE_EVENTS=256;
const OPEN=['ticket','trace','uid','sessionId','requestId'];
const STEP=['state','ticket','uid','sessionId','requestId','ticks'];
const SLOTS=['mainGun','wingman','armor','drone'];
const ALLOWED_LOADOUT=['pilot','aircraft',...SLOTS];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>plain(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const position=x=>plain(x)&&finite(x.x)&&finite(x.z)&&
  Math.abs(x.x)<=100&&Math.abs(x.z)<=100;
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=(tag,x)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(x)])).digest('hex');
function freeze(x){
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const value of Object.values(x))freeze(value);
    Object.freeze(x);
  }
  return x;
}
const deny=(code,message,http=423)=>{throw new GameError(code,message,http);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'C15 actual replay and Dungeon settlement have not been verified');
const actor=x=>({uid:x.uid,sessionId:x.sessionId,requestId:x.requestId});
const samePosition=(a,b)=>position(a)&&position(b)&&
  Math.abs(a.x-b.x)<=1e-6&&Math.abs(a.z-b.z)<=1e-6;

function parseC15DungeonInputLoadoutV2C9Config(env={}){
  if(!plain(env))throw new TypeError('V2C.9 environment must be plain');
  if(env.GAME_C15_DUNGEON_V2C9_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C9_QA_APPROVED!=='true')
    throw new TypeError('V2C.9 requires explicit QA approval');
  const prev=parseC15DungeonUnifiedCombatV2C8Config(env);
  if(!prev||prev.emulatorOnly!==true||!prev.projectId.startsWith('demo-'))
    throw new TypeError('V2C.9 requires all predecessor demo QA gates');
  return freeze({version:VERSION,projectId:prev.projectId,
    allowedUids:[...prev.allowedUids],emulatorOnly:true});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C9_DISABLED','V2C.9 QA is disabled');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
    actualCombatParityVerified:false,open:off,step:off,inspect:off,
    claim:locked,finalize:locked});
}

/** Build a complete 360-tick candidate map. Tick zero is always (0,12.5). */
function projectRelativeTouchTicksV2C9(trace,finalPose){
  if(!plain(trace)||!Array.isArray(trace.events)||
    trace.events.length<3||trace.events.length>MAX_TRACE_EVENTS||
    trace.events[0]?.kind!=='down'||trace.events.at(-1)?.kind!=='up'||
    !position(finalPose))
    throw new TypeError('V2B.3-inspected closed trace is required');
  const t0=trace.events[0].atMs;
  if(!finite(t0)||t0<0||t0>Number.MAX_SAFE_INTEGER)
    throw new TypeError('Trace origin invalid');
  const events=[];
  let lastMs=t0;
  for(const e of trace.events){
    if(!plain(e)||!finite(e.atMs)||e.atMs<lastMs||
      e.atMs-t0>MAX_TICKS*1000/TICK_HZ||!position(e.position))
      throw new TypeError('Trace timestamp or pose beyond six-second QA window');
    lastMs=e.atMs;
    if(e.kind==='move')events.push({tick:Math.max(1,
      Math.ceil((e.atMs-t0)*TICK_HZ/1000)),pose:{x:e.position.x,z:e.position.z}});
  }
  if(events.length<1||!samePosition(events.at(-1).pose,finalPose))
    throw new TypeError('Movement replay endpoint and projected trace disagree');
  const poses=[freeze({x:0,z:12.5})];
  let index=0,now={x:0,z:12.5},lastMoveTick=0;
  for(let tick=1;tick<=MAX_TICKS;tick++){
    while(index<events.length&&events[index].tick<=tick){
      now={...events[index].pose};lastMoveTick=tick;index++;
    }
    poses.push(freeze({...now}));
  }
  if(index!==events.length)throw new TypeError('Unconsumed event tick');
  return freeze({poses,moveCount:events.length,lastMoveTick,
    relativeTraceDurationMs:lastMs-t0});
}

async function createC15DungeonInputLoadoutV2C9({env={},db,ticketService,
  movementService,listingModule,statModule}={}){
  const cfg=parseC15DungeonInputLoadoutV2C9Config(env);
  if(!cfg)return disabled();
  if(!db||typeof db.collection!=='function'||
    db.app?.options?.projectId!==cfg.projectId||
    !ticketService||ticketService.enabled!==true||
    ticketService.emulatorOnly!==true||ticketService.productionEnabled!==false||
    ticketService.rewardSettlementEnabled!==false||
    typeof ticketService.verifyTicket!=='function'||
    typeof ticketService.inspectDeviceTrace!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.open!=='function'||
    typeof movementService.ingestSnapshot!=='function'||
    typeof movementService.inspect!=='function')
    throw new TypeError('Demo Firestore, V2B.2 ticket and V2B.3 movement required');
  const root=path.resolve(__dirname,'../../client/src');
  const load=f=>import(pathToFileURL(path.join(root,f)).href);
  const [listing,statsMath]=await Promise.all([
    listingModule||load('constants.js'),
    statModule||load('utils/combatStats.js'),
  ]);
  if(!Array.isArray(listing.PILOTS)||!Array.isArray(listing.AIRCRAFTS)||
    !plain(listing.GEAR_CATALOG)||!Array.isArray(listing.DUNGEON_CONFIG)||
    typeof statsMath.deriveBattleLoadout!=='function')
    throw new TypeError('Versioned battle catalogs/loadout calculator unavailable');
  const location=listing.DUNGEON_CONFIG.find(x=>x.id==='dung_taurus');
  if(!location)throw new TypeError('Taurus Dungeon catalog missing');
  const issued=new WeakSet(),tables=new WeakMap(),used=new WeakMap(),running=new WeakMap();
  const make=(fields,table)=>{
    const s=freeze(fields);issued.add(s);tables.set(s,table);return s;
  };
  const requireState=s=>{
    if(!plain(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C9_STATE_UNTRUSTED',
        'Only instance-issued immutable QA state can advance',403);
  };
  const verifiedTicket=async(ticket,a)=>{
    if(!cfg.allowedUids.includes(a.uid))
      deny('C15_DUNGEON_V2C9_ACTOR_INVALID','Not an approved emulator QA actor',403);
    const proof=await ticketService.verifyTicket(ticket,a);
    if(!plain(proof)||proof.serverAdmissionVerified!==true||
      proof.serverSceneSeedBound!==true||proof.battleId!==ticket?.battleId||
      proof.sceneSeed!==ticket?.sceneSeed||
      proof.spawnPlanDigest!==ticket?.spawnPlanDigest||
      proof.safeForSettlement!==false||proof.rewardSettlementEnabled!==false||
      proof.cloudRewards!==false||ticket?.roomId!=='taurus_entry'||
      ticket?.dungeonId!=='dung_taurus')
      deny('C15_DUNGEON_V2C9_TICKET_INVALID','Verified demo ticket required',403);
    return proof;
  };
  const accountProof=async(a,ticket)=>{
    const snap=await db.collection('users').doc(a.uid).get();
    if(!snap?.exists)deny('C15_DUNGEON_V2C9_PROFILE_MISSING',
      'Emulator profile does not exist',403);
    const profile=snap.data();
    if(!plain(profile)||profile.sessionId!==a.sessionId||
      !plain(profile.campaignData)||
      profile.campaignData.profileId!==ticket.profileId)
      deny('C15_DUNGEON_V2C9_PROFILE_CHANGED',
        'Account session and scene profile must match server ticket',409);
    const c=profile.campaignData,l=c.loadout;
    if(!plain(l)||!plain(c.ownedPilots)||!plain(c.ownedAircrafts)||
      !plain(c.items)||Object.keys(l).some(k=>!ALLOWED_LOADOUT.includes(k))||
      !ALLOWED_LOADOUT.every(k=>typeof l[k]==='string')||
      !l.pilot||!l.aircraft||!l.mainGun||
      !listing.PILOTS.some(p=>p.id===l.pilot)||
      !listing.AIRCRAFTS.some(p=>p.id===l.aircraft)||
      !plain(c.ownedPilots[l.pilot])||
      !plain(c.ownedAircrafts[l.aircraft])||
      !integer(c.ownedAircrafts[l.aircraft].level,1,1000))
      deny('C15_DUNGEON_V2C9_LOADOUT_INVALID',
        'Server-owned loadout inventory/ownership invalid',409);
    const equipped={};
    for(const slot of SLOTS){
      const itemId=l[slot];
      if(!itemId){equipped[slot]=null;continue;}
      const item=c.items[itemId];
      if(!plain(item)||item.type!==slot||
        !integer(item.rarity,1,5)||!integer(item.level,1,1000)||
        !Array.isArray(listing.GEAR_CATALOG[slot])||
        !listing.GEAR_CATALOG[slot].some(g=>g.id===item.baseId))
        deny('C15_DUNGEON_V2C9_LOADOUT_INVALID',
          'Equipped item ownership or catalog does not match',409);
      equipped[slot]={itemId,baseId:item.baseId,rarity:item.rarity,
        level:item.level,type:item.type};
    }
    const source={profileId:c.profileId,loadout:{...l},
      pilotOwnership:c.ownedPilots[l.pilot],
      aircraftOwnership:c.ownedAircrafts[l.aircraft],equipped};
    let result;
    try{result=statsMath.deriveBattleLoadout(c,
      {PILOTS:listing.PILOTS,AIRCRAFTS:listing.AIRCRAFTS,
        GEAR_CATALOG:listing.GEAR_CATALOG},
      {mode:'dungeon',location});}
    catch(_){deny('C15_DUNGEON_V2C9_LOADOUT_INVALID',
      'Shared battle stat derivation failed',409);}
    const stats=result?.stats;
    for(const k of ['maxHp','hp','atk','armor','speed','fireRate',
      'wingAtk','droneAtk','passiveShieldMax'])
      if(!finite(stats?.[k])||stats[k]<0||stats[k]>1e9)
        deny('C15_DUNGEON_V2C9_STATS_INVALID',
          'Shared catalog produced invalid combat stats',409);
    if(stats.maxHp<1||stats.hp!==stats.maxHp||
      !integer(stats.atk,0,1e9)||stats.fireRate<50||
      stats.passiveShieldMax>stats.maxHp||
      stats.mainGunId!==equipped.mainGun.baseId)
      deny('C15_DUNGEON_V2C9_STATS_INVALID','Battle loadout invalid',409);
    const selected={pilotId:l.pilot,aircraftId:l.aircraft,
      mainGunId:stats.mainGunId,armorId:equipped.armor?.baseId||null,
      wingmanId:stats.wingmanId,droneId:stats.droneId,
      aircraftLevel:result.aircraftLevel,
      maxHp:stats.maxHp,atk:stats.atk,armor:stats.armor,
      fireRateMs:stats.fireRate,passiveShieldMax:stats.passiveShieldMax,
      wingAtk:stats.wingAtk,droneAtk:stats.droneAtk,
      armorPassive:stats.armorPassive};
    return freeze({profileDigest:hash('sf-c15-v2c9-profile',source),
      loadoutDigest:hash('sf-c15-v2c9-derived',selected),loadout:selected});
  };
  const report=s=>{
    requireState(s);
    return freeze({version:VERSION,battleId:s.battleId,tickHz:TICK_HZ,
      simulatedInputTicks:s.tick,lastBatch:s.lastBatch,
      inputDigest:s.inputDigest,traceDigest:s.traceDigest,
      loadoutDigest:s.loadoutDigest,profileDigest:s.profileDigest,
      serverReadDemoProfileLoadout:true,sharedBattleLoadoutMathUsed:true,
      candidateLoadout:s.loadout,acceptedPointerEvents:s.eventCount,
      acceptedPointerMoves:s.moveCount,lastCandidateMoveTick:s.lastMoveTick,
      relativeTraceDurationMs:s.traceDurationMs,
      candidatePlayerPosition:s.player,
      reportedTouchProjectionChecked:true,relativeInputTickMappingChecked:true,
      absoluteClientServerClockAligned:false,
      realDeviceInputAuthenticated:false,liveAccountLoadoutVerified:false,
      integratedIntoV2C8CombatTick:false,
      clientHitDamageKillAccepted:false,independentFullDungeonReplayVerified:false,
      safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false});
  };
  async function open(args={}){
    if(!exact(args,OPEN))
      deny('C15_DUNGEON_V2C9_INPUT_INVALID',
        'Exactly ticket, trace and actor; no client stats or combat outcome',400);
    const a=actor(args);
    const proof=await verifiedTicket(args.ticket,a);
    const touch=await ticketService.inspectDeviceTrace({ticket:args.ticket,
      trace:args.trace,...a});
    if(touch?.battleId!==proof.battleId||
      touch?.reportedPointerFormulaConsistent!==true||
      touch?.independentReplayVerified!==false||touch?.safeForSettlement!==false)
      deny('C15_DUNGEON_V2C9_TRACE_INVALID','Closed verified pointer trace required',403);
    const first=await movementService.open({ticket:args.ticket,...a});
    const last=await movementService.ingestSnapshot({state:first,
      ticket:args.ticket,trace:args.trace,...a});
    const movement=movementService.inspect(last.state);
    if(movement?.battleId!==proof.battleId||
      movement?.sceneSeed!==proof.sceneSeed||
      movement?.spawnPlanDigest!==proof.spawnPlanDigest||
      movement?.cumulativeEventsVerified!==args.trace.events.length||
      movement?.clientReportedPathContinuityChecked!==true||
      !position(movement?.replayedPosition))
      deny('C15_DUNGEON_V2C9_TRACE_INVALID','Movement continuity not verified',403);
    let timeline;
    try{timeline=projectRelativeTouchTicksV2C9(args.trace,movement.replayedPosition);}
    catch(_){deny('C15_DUNGEON_V2C9_TIME_INVALID',
      'Relative timing exceeds bounded candidate window',400);}
    const account=await accountProof(a,args.ticket);
    const traceDigest=hash('sf-c15-v2c9-touch',{
      movementDigest:movement.traceDigest,events:args.trace.events,
      battleId:proof.battleId});
    const sealedTicket=hash('sf-c15-v2c9-ticket',args.ticket);
    const s=make({version:VERSION,battleId:proof.battleId,
      actor:a,ticketDigest:sealedTicket,sceneSeed:proof.sceneSeed,
      spawnDigest:proof.spawnPlanDigest,tick:0,
      traceDigest,profileDigest:account.profileDigest,
      loadoutDigest:account.loadoutDigest,loadout:account.loadout,
      eventCount:args.trace.events.length,moveCount:timeline.moveCount,
      lastMoveTick:timeline.lastMoveTick,
      traceDurationMs:timeline.relativeTraceDurationMs,
      player:{x:0,z:12.5},lastBatch:[],
      inputDigest:hash('sf-c15-v2c9-input-init',{
        battleId:proof.battleId,ticketDigest:sealedTicket,traceDigest,
        profileDigest:account.profileDigest,loadoutDigest:account.loadoutDigest})},
      timeline.poses);
    return freeze({state:s,report:report(s)});
  }
  async function step(args={}){
    if(!exact(args,STEP)||!integer(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C9_INPUT_INVALID',
        'Bounded exact tick request only; no client loadout/damage/kills',400);
    requireState(args.state);
    const s=args.state,a=actor(args);
    if(a.uid!==s.actor.uid||a.sessionId!==s.actor.sessionId||
      a.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C9_ACTOR_MISMATCH','Cannot transfer input state',403);
    if(hash('sf-c15-v2c9-ticket',args.ticket)!==s.ticketDigest||
      args.ticket?.battleId!==s.battleId||
      args.ticket?.sceneSeed!==s.sceneSeed||
      args.ticket?.spawnPlanDigest!==s.spawnDigest)
      deny('C15_DUNGEON_V2C9_TICKET_MISMATCH','QA ticket changed',403);
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C9_TICK_CAP','Six-second candidate input cap',400);
    const request=hash('sf-c15-v2c9-op',{
      battleId:s.battleId,tick:s.tick,ticks:args.ticks,
      ticketDigest:s.ticketDigest,inputDigest:s.inputDigest});
    const prior=used.get(s);
    if(prior&&prior.request!==request)
      deny('C15_DUNGEON_V2C9_REUSED_STATE','Consumed state fork denied',409);
    const ongoing=running.get(s);
    if(ongoing){if(ongoing.request!==request)
      deny('C15_DUNGEON_V2C9_REUSED_STATE','Concurrent state fork denied',409);
      // Even an in-flight retry must observe live admission and equipment.
      await verifiedTicket(args.ticket,a);
      const account=await accountProof(a,args.ticket);
      if(account.profileDigest!==s.profileDigest||
        account.loadoutDigest!==s.loadoutDigest)
        deny('C15_DUNGEON_V2C9_LOADOUT_DRIFT',
          'Account equipment changed during concurrent replay',409);
      return freeze({duplicate:true,...await ongoing.promise});}
    const promise=(async()=>{
      // Admission can be revoked at any time, including before an idempotent retry.
      const verified=await verifiedTicket(args.ticket,a);
      if(verified.battleId!==s.battleId)
        deny('C15_DUNGEON_V2C9_TICKET_MISMATCH','Battle changed',403);
      const account=await accountProof(a,args.ticket);
      if(account.profileDigest!==s.profileDigest||
        account.loadoutDigest!==s.loadoutDigest)
        deny('C15_DUNGEON_V2C9_LOADOUT_DRIFT',
          'Server-stored account equipment changed during candidate replay',409);
      if(prior)return prior.outcome;
      const table=tables.get(s);
      if(!table||table.length!==MAX_TICKS+1)
        throw new TypeError('Instance-owned input table missing');
      let previous={...s.player},inputDigest=s.inputDigest;
      const batch=[];
      for(let tick=s.tick+1;tick<=s.tick+args.ticks;tick++){
        const pose=table[tick],changed=!samePosition(pose,previous);
        inputDigest=hash('sf-c15-v2c9-input-tick',{
          previous:inputDigest,tick,player:pose,changed,
          loadoutDigest:s.loadoutDigest,traceDigest:s.traceDigest});
        batch.push({tick,player:{...pose},changed});
        previous=pose;
      }
      const next=make({...s,tick:s.tick+args.ticks,player:{...previous},
        lastBatch:batch,inputDigest},table);
      const outcome=freeze({state:next,report:report(next)});
      used.set(s,{request,outcome});return outcome;
    })();
    running.set(s,{request,promise});
    try{
      const outcome=await promise;
      return freeze({duplicate:Boolean(prior),...outcome});
    }finally{if(running.get(s)?.promise===promise)running.delete(s);}
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    actualCombatParityVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  parseC15DungeonInputLoadoutV2C9Config,
  projectRelativeTouchTicksV2C9,
  createC15DungeonInputLoadoutV2C9});
