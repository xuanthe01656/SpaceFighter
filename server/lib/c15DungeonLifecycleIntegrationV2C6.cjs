'use strict';
/**
 * Dungeon C15 V2C.6 - NON-ECONOMIC emulator-only lifecycle reconciliation.
 *
 * Wraps the instance-issued V2C.5 outgoing service ONE TICK at a time, then
 * reconciles its HP/death transitions with the V2C.3 enemy/volley/bullet
 * candidate. Builds a *filtered integration projection* (living enemies,
 * slots, pending bursts and projectiles). Does not mutate or rewind upstream
 * V2C.3/V2C.4: those upstream services STILL simulate dead actors; in
 * particular V2C.4 vitals may include hostile projectiles fired post-death.
 *
 * Therefore this is NOT actual enemy-death feedback, client/APK parity,
 * independent combat replay, outcome authority or a settlement service.
 * No production registration, no writes, no rewards, no client-supplied HP.
 */
const {createHash}=require('node:crypto');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonOutgoingStateV2C5Config}=require('./c15DungeonOutgoingStateV2C5.cjs');

const VERSION='c15-dungeon-lifecycle-integration-v2c6';
const TICK_HZ=60,MAX_TICKS=360,MAX_BATCH=60;
const MAX_ENEMIES=12,MAX_DEATHS=12,MAX_BULLETS=96,MAX_PENDING=64;
const OPEN=['ticket','movementState','uid','sessionId','requestId'];
const STEP=['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>plain(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const pos=x=>plain(x)&&finite(x.x)&&finite(x.z)&&
  Math.abs(x.x)<=100&&Math.abs(x.z)<=100;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,x)=>createHash('sha256').update(JSON.stringify([tag,canonical(x)])).digest('hex');
const freeze=x=>{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const v of Object.values(x))freeze(v);
    Object.freeze(x);
  }
  return x;
};
const deny=(code,message,status=423)=>{throw new GameError(code,message,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Full combat outcome and reward settlement remain disabled');
const actor=a=>({uid:a.uid,sessionId:a.sessionId,requestId:a.requestId});

function parseC15DungeonLifecycleIntegrationV2C6Config(env={}){
  if(!plain(env))throw new TypeError('V2C.6 config must be a plain object');
  if(env.GAME_C15_DUNGEON_V2C6_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C6_QA_APPROVED!=='true')
    throw new TypeError('V2C.6 QA requires explicit approval');
  const previous=parseC15DungeonOutgoingStateV2C5Config(env);
  if(!previous||previous.emulatorOnly!==true||
    !previous.projectId.startsWith('demo-'))
    throw new TypeError('V2C.6 requires V1 through V2C.5 demo emulator gates');
  return freeze({version:VERSION,emulatorOnly:true,
    projectId:previous.projectId,allowedUids:[...previous.allowedUids]});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C6_DISABLED','Lifecycle integration QA is OFF');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    fullEnemyAiDeathFeedbackVerified:false,independentReplayVerified:false,
    safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,claim:locked,finalize:locked});
}

/** Deterministic, conservative candidate-lifecycle audit from upstream data.
 * Called ONLY with instance-issued states obtained from the V2C.5 service;
 * never treat this exported pure helper as a source of trusted input. */
function reconcileC15DungeonLifecycleTickV2C6(previous,nextOutgoing){
  if(!plain(previous)||!plain(nextOutgoing)||
    !int(previous.tick,0,MAX_TICKS-1)||nextOutgoing.tick!==previous.tick+1||
    !Array.isArray(previous.roster)||!Array.isArray(nextOutgoing.enemies)||
    !Array.isArray(previous.outgoingState?.hits)||!Array.isArray(nextOutgoing.hits)||
    !plain(nextOutgoing.upstreamState)||
    !plain(nextOutgoing.upstreamState.upstreamState))
    throw new TypeError('Instance-issued candidate tick chain required');
  const tick=nextOutgoing.tick;
  const c4=nextOutgoing.upstreamState;
  const c3=c4.upstreamState;
  const priorC4=previous.outgoingState.upstreamState;
  if(c4.tick!==tick||c3.tick!==tick||
    nextOutgoing.upstreamDigest!==c4.damageDigest||
    c4.upstreamDigest!==c3.traceDigest||
    !hex(nextOutgoing.outgoingDigest)||!hex(c4.damageDigest)||
    !hex(c3.traceDigest)||
    nextOutgoing.battleId!==previous.battleId||
    nextOutgoing.sceneSeed!==previous.sceneSeed||
    nextOutgoing.ticketMac!==previous.ticketMac||
    nextOutgoing.movementDigest!==previous.movementDigest||
    nextOutgoing.actor?.uid!==previous.actor.uid||
    nextOutgoing.actor?.sessionId!==previous.actor.sessionId||
    nextOutgoing.actor?.requestId!==previous.actor.requestId||
    c4.battleId!==previous.battleId||c3.battleId!==previous.battleId||
    c4.sceneSeed!==previous.sceneSeed||c3.sceneSeed!==previous.sceneSeed||
    c4.movementDigest!==previous.movementDigest||
    c3.movementDigest!==previous.movementDigest||
    !Array.isArray(c4.hits)||!Array.isArray(priorC4?.hits))
    throw new TypeError('Broken V2C.3/4/5 tick, actor or digest linkage');
  if(!Array.isArray(c3.enemies)||c3.enemies.length>MAX_ENEMIES||
    !Array.isArray(c3.bullets)||c3.bullets.length>MAX_BULLETS||
    !Array.isArray(c3.pending)||c3.pending.length>MAX_PENDING||
    !Array.isArray(nextOutgoing.enemies)||
    nextOutgoing.enemies.length!==previous.roster.length||
    nextOutgoing.enemies.length>MAX_ENEMIES||
    !Array.isArray(nextOutgoing.hits)||
    nextOutgoing.hits.length<previous.outgoingState.hits.length||
    !Array.isArray(c4.hits)||c4.hits.length<priorC4.hits.length)
    throw new TypeError('Invalid bounded combat roster or hit histories');
  const priorHitCount=previous.outgoingState.hits.length;
  for(let i=0;i<priorHitCount;i++){
    if(digest('outgoing-hit',nextOutgoing.hits[i])!==
       digest('outgoing-hit',previous.outgoingState.hits[i]))
      throw new TypeError('Outgoing hit history rewritten');
  }
  for(let i=0;i<priorC4.hits.length;i++){
    if(digest('hostile-hit',c4.hits[i])!==digest('hostile-hit',priorC4.hits[i]))
      throw new TypeError('Incoming hit history rewritten');
  }
  const incomingRows=nextOutgoing.enemies;
  const old=new Map(previous.roster.map(x=>[x.id,x]));
  if(old.size!==previous.roster.length||
    new Set(incomingRows.map(x=>x.id)).size!==incomingRows.length)
    throw new TypeError('Duplicate candidate enemy ID');
  const freshHits=nextOutgoing.hits.slice(priorHitCount);
  for(const hit of freshHits){
    if(!plain(hit)||!old.has(hit.enemyId)||hit.tick!==tick||
      !finite(hit.applied)||hit.applied<0||!finite(hit.hpAfter)||
      !int(hit.tick,1,MAX_TICKS)||typeof hit.id!=='string')
      throw new TypeError('Unexpected outgoing damage event');
  }
  const roster=[],newDeaths=[];
  let damageApplied=0;
  for(const e of incomingRows){
    const prev=old.get(e.id);
    if(!prev||e.roleId!==prev.roleId||e.maxHp!==prev.maxHp||
      !finite(e.hp)||e.hp<0||e.hp>prev.maxHp||
      e.hp>prev.hp+1e-8||e.dead!==(e.hp===0)||
      prev.dead!==(prev.hp===0)||
      (!prev.dead&&prev.deathTick!==null)||
      (prev.dead&&!int(prev.deathTick,1,previous.tick)))
      throw new TypeError('Enemy HP resurrection, roster drift or death mismatch');
    const events=freshHits.filter(x=>x.enemyId===e.id);
    const applied=events.reduce((sum,x)=>sum+x.applied,0);
    if(Math.abs((prev.hp-e.hp)-applied)>1e-7)
      throw new TypeError('Candidate HP delta not explained by outgoing hits');
    if(events.length&&Math.abs(events[events.length-1].hpAfter-e.hp)>1e-7)
      throw new TypeError('Candidate hit ledger final HP mismatch');
    if(prev.dead&&events.length)
      throw new TypeError('Previously dead enemy received outgoing damage');
    const newlyDead=!prev.dead&&e.dead;
    if(newlyDead&&(!events.some(x=>x.killed===true)||
      events[events.length-1].hpAfter!==0))
      throw new TypeError('Death without candidate fatal hit');
    damageApplied+=applied;
    if(newlyDead)newDeaths.push(freeze({id:e.id,tick,source:'candidate-outgoing-v2c5'}));
    roster.push({id:e.id,roleId:e.roleId,maxHp:e.maxHp,hp:e.hp,
      dead:e.dead,deathTick:newlyDead?tick:prev.deathTick});
  }
  if(newDeaths.length>MAX_DEATHS||previous.deaths.length+newDeaths.length>MAX_DEATHS)
    throw new TypeError('Death ledger overflow');
  if(Math.abs((nextOutgoing.outgoingDamage-previous.outgoingState.outgoingDamage)-
    damageApplied)>1e-7)
    throw new TypeError('Outgoing damage counter not justified by events');
  const hpById=new Map(roster.map(e=>[e.id,e]));
  const c3Ids=new Set();
  const active=[];
  let ghostFrames=0;
  for(const e of c3.enemies){
    if(!plain(e)||!hpById.has(e.id)||c3Ids.has(e.id)||!pos(e.position)||
      !plain(e.entryShield))
      throw new TypeError('Unrecognized candidate AI actor');
    c3Ids.add(e.id);
    const l=hpById.get(e.id);
    if(l.dead){
      if(tick>l.deathTick)ghostFrames++;
      continue;
    }
    active.push({id:l.id,roleId:l.roleId,hp:l.hp,
      position:{x:e.position.x,z:e.position.z},
      slotId:e.slotLease?.slotId||null,
      entryPhase:e.entryShield.phase});
  }
  const knownBullets=[];
  let suppressedShots=0;
  for(const b of c3.bullets){
    const owner=hpById.get(b?.enemyId);
    if(!owner||!int(b.createdTick,1,tick)||!pos(b.position)||
      !pos(b.velocity))
      throw new TypeError('Malformed enemy projectile in candidate timeline');
    if(owner.dead&&b.createdTick>owner.deathTick){
      if(b.createdTick===tick)suppressedShots++;
      continue;
    }
    knownBullets.push({enemyId:b.enemyId,createdTick:b.createdTick,
      position:{x:b.position.x,z:b.position.z}});
  }
  const pending=[];
  let suppressedPending=0;
  for(const p of c3.pending){
    const owner=hpById.get(p?.enemyId);
    if(!owner||!int(p.dueTick,tick+1,MAX_TICKS*2))
      throw new TypeError('Malformed pending burst candidate');
    if(owner.dead&&p.dueTick>owner.deathTick){
      suppressedPending++;
      continue;
    }
    pending.push({enemyId:p.enemyId,dueTick:p.dueTick});
  }
  const liveSlotIds=active.map(x=>x.slotId);
  if(liveSlotIds.some(x=>typeof x!=='string'||!x)||
    new Set(liveSlotIds).size!==liveSlotIds.length)
    throw new TypeError('Active candidate slots are missing or duplicated');
  const deaths=[...previous.deaths,...newDeaths];
  if(deaths.length!==roster.filter(e=>e.dead).length||
    deaths.some(d=>hpById.get(d.id)?.deathTick!==d.tick))
    throw new TypeError('Candidate death ledger inconsistent');
  return freeze({roster,deaths,active,knownBullets,pending,
    newDeaths,ghostFrames,suppressedShots,suppressedPending,
    damageApplied,upstreamV2C3Digest:c3.traceDigest,
    upstreamV2C4Digest:c4.damageDigest,
    upstreamV2C5Digest:nextOutgoing.outgoingDigest,
    incomingCandidateHits:c4.hits.length-priorC4.hits.length});
}

async function createC15DungeonLifecycleIntegrationV2C6({env={},outgoingService,
  movementService}={}){
  const cfg=parseC15DungeonLifecycleIntegrationV2C6Config(env);
  if(!cfg)return disabled();
  if(!outgoingService||outgoingService.enabled!==true||
    outgoingService.emulatorOnly!==true||
    outgoingService.productionEnabled!==false||
    outgoingService.safeForSettlement!==false||
    outgoingService.rewardSettlementEnabled!==false||
    outgoingService.cloudRewards!==false||
    typeof outgoingService.open!=='function'||
    typeof outgoingService.step!=='function'||
    typeof outgoingService.inspect!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||
    movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.inspect!=='function')
    throw new TypeError('V2C.6 requires server-owned V2C.5 + V2B.3 QA');
  const issued=new WeakSet(),used=new WeakMap(),inflight=new WeakMap();
  const make=x=>{const s=freeze(x);issued.add(s);return s;};
  const requireIssued=s=>{
    if(!plain(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C6_STATE_UNTRUSTED',
        'Only this instance may issue lifecycle states',403);
  };
  const report=s=>{
    requireIssued(s);
    return freeze({version:VERSION,battleId:s.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',
      sceneSeed:s.sceneSeed,tickHz:TICK_HZ,simulatedTicks:s.tick,
      candidateAliveActive:s.active.length,
      candidateDead:s.deaths.length,
      candidateDeaths:s.deaths.map(x=>({...x})),
      candidateProjectedActors:s.active.map(x=>({...x,position:{...x.position}})),
      candidateVisibleEnemyProjectiles:s.knownBullets.length,
      candidateVisiblePendingBursts:s.pending.length,
      upstreamGhostEnemyFrames:s.ghostFrames,
      candidatePostDeathShotsFiltered:s.suppressedShots,
      candidatePostDeathPendingFiltered:s.suppressedPending,
      candidateIncomingHitsUnreconciled:s.incomingHits,
      totalCandidateOutgoingDamage:s.outgoingDamage,
      lifecycleDigest:s.lifecycleDigest,
      upstreamOutgoingDigest:s.upstreamDigest,
      candidateDeathRemovesFromProjectedView:true,
      actualUpstreamEnemyAiDespawnVerified:false,
      actualPostDeathIncomingDamageReconciled:false,
      actualAccountLoadoutVerified:false,
      actualPlayerMovementTickParityVerified:false,
      liveMuzzleWorldMatrixVerified:false,
      deviceProvenanceVerified:false,
      bossAndHazardsVerified:false,battleVictoryVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  };
  const assertMovement=(s,m)=>{
    if(m?.traceDigest!==s.movementDigest||
      m?.battleId!==s.battleId||m?.sceneSeed!==s.sceneSeed||
      m?.replayedPosition?.x!==s.player.x||
      m?.replayedPosition?.z!==s.player.z)
      deny('C15_DUNGEON_V2C6_MOVEMENT_MISMATCH',
        'Frozen V2B.3 QA player pose changed',409);
  };
  async function open(args={}){
    if(!exact(args,OPEN))
      deny('C15_DUNGEON_V2C6_INPUT_INVALID',
        'Exact ticket/movement/actor input required',400);
    if(!cfg.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C6_ACTOR_NOT_ALLOWED',
        'QA UID is not allowlisted',403);
    const u=await outgoingService.open(args);
    const s=u?.state,r=u?.report,m=movementService.inspect(args.movementState);
    const c4=s?.upstreamState,c3=c4?.upstreamState;
    if(!plain(s)||!plain(c4)||!plain(c3)||
      r?.battleId!==args.ticket?.battleId||
      r?.sceneSeed!==args.ticket?.sceneSeed||
      r?.simulatedTicks!==0||r?.safeForSettlement!==false||
      r?.candidateDeathsDoNotDespawnUpstreamAI!==true||
      c4.tick!==0||c3.tick!==0||
      c4.upstreamDigest!==c3.traceDigest||
      s.upstreamDigest!==c4.damageDigest||
      s.ticketMac!==args.ticket.mac||
      s.actor?.uid!==args.uid||s.actor?.sessionId!==args.sessionId||
      s.actor?.requestId!==args.requestId||
      !Array.isArray(s.enemies)||s.enemies.length<1||s.enemies.length>MAX_ENEMIES||
      new Set(s.enemies.map(e=>e.id)).size!==s.enemies.length||
      s.enemies.some(e=>!plain(e)||!finite(e.hp)||e.hp<=0||
        e.hp!==e.maxHp||e.dead!==false)||
      s.hits?.length!==0||s.shots?.length!==0||
      !pos(s.player)||!hex(s.outgoingDigest))
      deny('C15_DUNGEON_V2C6_UPSTREAM_INVALID',
        'Only live instance-issued V2C.5 candidate admission accepted',403);
    const initial=make({version:VERSION,tick:0,
      actor:actor(args),battleId:r.battleId,sceneSeed:r.sceneSeed,
      ticketMac:args.ticket.mac,movementDigest:s.movementDigest,
      player:{...s.player},outgoingState:s,upstreamDigest:s.outgoingDigest,
      roster:s.enemies.map(e=>({id:e.id,roleId:e.roleId,
        maxHp:e.maxHp,hp:e.hp,dead:false,deathTick:null})),
      deaths:[],active:[],knownBullets:[],pending:[],
      ghostFrames:0,suppressedShots:0,suppressedPending:0,
      incomingHits:0,outgoingDamage:0,
      lifecycleDigest:digest('sf-c15-v2c6-init',{
        battleId:r.battleId,seed:r.sceneSeed,ticketMac:args.ticket.mac,
        movementDigest:s.movementDigest,upstreamDigest:s.outgoingDigest,
        qaEnemyRoster:s.enemies})});
    assertMovement(initial,m);
    return freeze({state:initial,report:report(initial)});
  }
  async function step(args={}){
    if(!exact(args,STEP)||!int(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C6_INPUT_INVALID','Exact bounded ticks required',400);
    requireIssued(args.state);
    const s=args.state;
    if(args.uid!==s.actor.uid||args.sessionId!==s.actor.sessionId||
      args.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C6_ACTOR_MISMATCH',
        'Lifecycle state cannot change actor',403);
    if(args.ticket?.mac!==s.ticketMac||
      args.ticket?.battleId!==s.battleId||
      args.ticket?.sceneSeed!==s.sceneSeed)
      deny('C15_DUNGEON_V2C6_TICKET_MISMATCH',
        'Signed admission context changed',403);
    assertMovement(s,movementService.inspect(args.movementState));
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C6_TICK_CAP','Six-second sandbox cap',400);
    const requested=digest('sf-c15-v2c6-operation',{
      battleId:s.battleId,tick:s.tick,ticks:args.ticks,
      ticketMac:s.ticketMac,movementDigest:s.movementDigest});
    const prior=used.get(s);
    if(prior){
      if(prior.requested!==requested)
        deny('C15_DUNGEON_V2C6_REUSED_STATE',
          'Rewind or fork already consumed state',409);
      return freeze({duplicate:true,...prior.outcome});
    }
    const running=inflight.get(s);
    if(running){
      if(running.requested!==requested)
        deny('C15_DUNGEON_V2C6_REUSED_STATE','Concurrent fork denied',409);
      return freeze({duplicate:true,...await running.promise});
    }
    const promise=(async()=>{
      let current=s;
      for(let index=0;index<args.ticks;index++){
        const u=await outgoingService.step({state:current.outgoingState,
          ticket:args.ticket,movementState:args.movementState,
          ...actor(args),ticks:1});
        if(u?.report?.simulatedTicks!==current.tick+1||
          u.report.battleId!==current.battleId||
          u.report.sceneSeed!==current.sceneSeed||
          u.report.outgoingDigest!==u.state?.outgoingDigest||
          u.report.safeForSettlement!==false||
          u.report.fullEnemyAiDeathFeedbackVerified!==false||
          u.report.actualAccountLoadoutVerified!==false)
          deny('C15_DUNGEON_V2C6_OUTGOING_UNVERIFIED',
            'V2C.5 candidate proof is not consistent',403);
        const x=reconcileC15DungeonLifecycleTickV2C6(current,u.state);
        const newState={...current,tick:current.tick+1,
          outgoingState:u.state,upstreamDigest:x.upstreamV2C5Digest,
          roster:x.roster,deaths:x.deaths,active:x.active,
          knownBullets:x.knownBullets,pending:x.pending,
          ghostFrames:current.ghostFrames+x.ghostFrames,
          suppressedShots:current.suppressedShots+x.suppressedShots,
          suppressedPending:current.suppressedPending+x.suppressedPending,
          incomingHits:current.incomingHits+x.incomingCandidateHits,
          outgoingDamage:current.outgoingDamage+x.damageApplied};
        newState.lifecycleDigest=digest('sf-c15-v2c6-tick',{
          previous:current.lifecycleDigest,tick:newState.tick,
          upstreamV2C3:x.upstreamV2C3Digest,
          upstreamV2C4:x.upstreamV2C4Digest,
          upstreamV2C5:x.upstreamV2C5Digest,
          deaths:x.newDeaths,roster:x.roster,
          active:x.active,bullets:x.knownBullets,pending:x.pending,
          ghostFrames:x.ghostFrames,suppressedShots:x.suppressedShots,
          suppressedPending:x.suppressedPending,
          incomingHits:x.incomingCandidateHits});
        current=newState;
      }
      const state=make(current);
      const outcome=freeze({state,report:report(state)});
      used.set(s,{requested,outcome});
      return outcome;
    })();
    inflight.set(s,{requested,promise});
    try{return freeze({duplicate:false,...await promise});}
    finally{if(inflight.get(s)?.promise===promise)inflight.delete(s);}
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    fullEnemyAiDeathFeedbackVerified:false,independentReplayVerified:false,
    safeForSettlement:false,rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  parseC15DungeonLifecycleIntegrationV2C6Config,
  reconcileC15DungeonLifecycleTickV2C6,
  createC15DungeonLifecycleIntegrationV2C6});
