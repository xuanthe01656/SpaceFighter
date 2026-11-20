'use strict';
/**
 * C15 Dungeon V2C.5 - emulator-only OUTGOING SHOT / ENEMY HP QA candidate.
 *
 * Server-owned test weapon only. Reuses the real pure PlayerWeapons,
 * combatStats and Dungeon V38 catalog. Builds on V2C.4's instance-issued
 * candidate timeline and signed V2B.2 ticket. State/retry authority is LOCAL
 * TO THIS SERVICE INSTANCE; not a battle authority, not a reward proof.
 *
 * Known gaps: actual account loadout, 60Hz client fire-time/frame match,
 * precise model collider, frozen player position, skill/wing/drone/critical,
 * enemy deaths feeding BACK into AI/slot simulation, charger, boss, rooms.
 */
const {createHash}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {GameError}=require('./economy.cjs');
const {parseC15DungeonDamageStateV2C4Config}=require('./c15DungeonDamageStateV2C4.cjs');

const VERSION='c15-dungeon-outgoing-state-v2c5';
const TICK_HZ=60,MAX_TICKS=360,MAX_BATCH=60,MAX_ENEMIES=12;
const MAX_SHOTS=96,MAX_TOTAL_FIRED=256,MAX_HITS=512;
const OPEN=['ticket','movementState','uid','sessionId','requestId'];
const STEP=['state','ticket','movementState','uid','sessionId','requestId','ticks'];
const QA_WEAPON=Object.freeze({id:'taurus-homing-main-v2c5-NOT-account-loadout',
  firePattern:'homing',projectileType:'laser',atk:110,fireEveryTicks:18,
  critDamageBoost:0,qaOutgoingScale:1,penetration:1,
  splashRadius:0,wingman:false,drone:false,manualSkill:false});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,fields)=>obj(x)&&Object.keys(x).length===fields.length&&
  fields.every(k=>Object.hasOwn(x,k));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const canonical=x=>Array.isArray(x)?x.map(canonical):obj(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=(tag,value)=>createHash('sha256')
  .update(JSON.stringify([tag,canonical(value)])).digest('hex');
const freeze=x=>{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const v of Object.values(x))freeze(v);
    Object.freeze(x);
  }
  return x;
};
const deny=(code,message,status=423)=>{throw new GameError(code,message,status);};
const locked=()=>deny('C15_DUNGEON_SERVER_REPLAY_REQUIRED',
  'Client battle outcome and economic settlement are not verified');
const actor=a=>({uid:a.uid,sessionId:a.sessionId,requestId:a.requestId});
const point=x=>obj(x)&&finite(x.x)&&finite(x.z)&&
  Math.abs(x.x)<=100&&Math.abs(x.z)<=100;

function parseC15DungeonOutgoingStateV2C5Config(env={}){
  if(!obj(env))throw new TypeError('QA config must be plain object');
  if(env.GAME_C15_DUNGEON_V2C5_ENABLED!=='true')return null;
  if(env.GAME_C15_DUNGEON_V2C5_QA_APPROVED!=='true')
    throw new TypeError('V2C.5 requires explicit QA approval');
  const prev=parseC15DungeonDamageStateV2C4Config(env);
  if(!prev||prev.emulatorOnly!==true||!prev.projectId.startsWith('demo-'))
    throw new TypeError('V2C.5 requires V2C.4 and all earlier demo QA gates');
  return freeze({version:VERSION,emulatorOnly:true,projectId:prev.projectId,
    allowedUids:[...prev.allowedUids]});
}
function disabled(){
  const off=()=>deny('C15_DUNGEON_V2C5_DISABLED','Outgoing state QA is OFF');
  return freeze({enabled:false,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open:off,step:off,inspect:off,claim:locked,finalize:locked});
}
/** Only pure functions and trusted *server-owned* candidate inputs. */
function applyCandidateOutgoingHitV2C5({enemy,shot,position},
  {weapons,combatMath}){
  if(!obj(enemy)||!point(position)||!point(enemy.position)||
    !finite(enemy.hp)||!finite(enemy.maxHp)||
    enemy.maxHp<=0||enemy.maxHp>1000000||
    enemy.hp<0||enemy.hp>enemy.maxHp||
    !obj(shot)||!finite(shot.atk)||shot.atk<0||shot.atk>100000||
    !finite(shot.remaining)||!integer(shot.remaining,0,3)||
    !Array.isArray(shot.hitKeys)||shot.hitKeys.some(x=>typeof x!=='string')||
    !point(shot.position))
    throw new TypeError('Bounded server-owned enemy and projectile required');
  if(enemy.hp===0||enemy.entryActive!==true||
    !weapons.projectileHitsPoint({position:shot.position},position,1.5))
    return freeze({hit:false,consumed:false,hpAfter:enemy.hp,
      damageApplied:0,killed:false,hitKeys:[...shot.hitKeys],remaining:shot.remaining});
  const bullet={_remainingPenetration:shot.remaining,
    _hitKeys:new Set(shot.hitKeys)};
  const registration=weapons.registerProjectileHit(bullet,enemy.id);
  if(!registration.accepted)
    return freeze({hit:false,consumed:registration.consumed,
      hpAfter:enemy.hp,damageApplied:0,killed:false,
      hitKeys:[...bullet._hitKeys],remaining:bullet._remainingPenetration});
  const raw=combatMath.calculateProjectileDamage(shot.atk,0,()=>1);
  if(!finite(raw)||raw<0||raw>100000)
    throw new TypeError('Shared weapon damage outside QA bounds');
  const hpAfter=Math.max(0,enemy.hp-raw*QA_WEAPON.qaOutgoingScale);
  return freeze({hit:true,consumed:registration.consumed,
    hpAfter,damageApplied:enemy.hp-hpAfter,
    killed:hpAfter===0,hitKeys:[...bullet._hitKeys],
    remaining:bullet._remainingPenetration});
}
async function createC15DungeonOutgoingStateV2C5({env={},damageService,
  movementService,encounterModule,combatModule,weaponsModule,
  combatMathModule}={}){
  const config=parseC15DungeonOutgoingStateV2C5Config(env);
  if(!config)return disabled();
  if(!damageService||damageService.enabled!==true||
    damageService.emulatorOnly!==true||
    damageService.productionEnabled!==false||
    damageService.safeForSettlement!==false||
    damageService.rewardSettlementEnabled!==false||
    damageService.cloudRewards!==false||
    typeof damageService.open!=='function'||
    typeof damageService.step!=='function'||
    typeof damageService.inspect!=='function'||
    !movementService||movementService.enabled!==true||
    movementService.emulatorOnly!==true||
    movementService.productionEnabled!==false||
    movementService.rewardSettlementEnabled!==false||
    typeof movementService.inspect!=='function')
    throw new TypeError('V2C.5 needs non-economic V2C.4 and V2B.3 QA services');
  const root=path.resolve(__dirname,'../../client/src');
  const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [encounter,combat,weapons,combatMath]=await Promise.all([
    encounterModule||load('game/dungeon/DungeonEncounterDirectorV38.js'),
    combatModule||load('game/dungeon/DungeonCombatAdapterV38.js'),
    weaponsModule||load('game/combat/PlayerWeapons.js'),
    combatMathModule||load('utils/combatStats.js'),
  ]);
  for(const [mod,name] of [
    [encounter,'buildDungeonRoomSpawnPlanV38'],
    [combat,'resolveDungeonEnemySpecV38'],
    [weapons,'describeMainSalvo'],[weapons,'advancePlayerProjectile'],
    [weapons,'projectileHitsPoint'],[weapons,'registerProjectileHit'],
    [weapons,'pickWeaponTarget'],[combatMath,'calculateProjectileDamage']
  ])if(typeof mod?.[name]!=='function')
    throw new TypeError('Missing reviewed outgoing pure function '+name);

  const issued=new WeakSet(),used=new WeakMap(),inflight=new WeakMap();
  const makeState=x=>{const s=freeze(x);issued.add(s);return s;};
  const requireState=s=>{
    if(!obj(s)||!issued.has(s))
      deny('C15_DUNGEON_V2C5_STATE_UNTRUSTED',
        'Instance-issued outgoing QA state required',403);
  };
  const recipeFor=seed=>{
    const plan=encounter.buildDungeonRoomSpawnPlanV38({
      dungeonId:'dung_taurus',roomIndex:0,seed});
    if(plan?.room?.id!=='taurus_entry'||!Array.isArray(plan.entries)||
      plan.entries.length<1||plan.entries.length>40)
      throw new TypeError('Taurus Entry catalog drift');
    const rows=plan.entries.map(entry=>({entry,
      spec:combat.resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',
        room:plan.room,entry})})).filter(x=>x.spec?.canShoot&&
        x.spec.weapon?.projectile&&x.spec.roleId!=='charger')
      .map(({entry,spec})=>({id:entry.id,roleId:spec.roleId,
        maxHp:spec.hp,hp:spec.hp,dead:false}));
    if(!rows.length||rows.length>MAX_ENEMIES||
      new Set(rows.map(x=>x.id)).size!==rows.length||
      rows.some(x=>!finite(x.maxHp)||x.maxHp<=0||x.maxHp>1000000))
      throw new TypeError('Unreviewed enemy HP roster');
    return rows;
  };
  const report=s=>{
    requireState(s);
    return freeze({version:VERSION,battleId:s.battleId,
      dungeonId:'dung_taurus',roomId:'taurus_entry',sceneSeed:s.sceneSeed,
      tickHz:TICK_HZ,simulatedTicks:s.tick,
      qaWeaponPreset:QA_WEAPON.id,
      candidateShotsCreated:s.created,candidateShotsActive:s.shots.length,
      candidateShotsConsumed:s.consumed,candidateShotsExpired:s.expired,
      candidateOutgoingHits:s.hits.length,
      candidateEnemyDeaths:s.enemies.filter(e=>e.dead).length,
      candidateEnemyHp:s.enemies.map(e=>({id:e.id,roleId:e.roleId,
        maxHp:e.maxHp,hp:e.hp,dead:e.dead})),
      candidateHpDamage:s.outgoingDamage,
      outgoingDigest:s.outgoingDigest,
      upstreamDamageDigest:s.upstreamDigest,
      playerFrozenAtOpen:true,serverOwnedQaWeaponOnly:true,
      sharedPlayerWeaponMathUsed:true,sharedEnemyCatalogHpUsed:true,
      candidateDeathsDoNotDespawnUpstreamAI:true,
      actualAccountLoadoutVerified:false,
      actualFireCadenceAndTickAlignmentVerified:false,
      liveProjectileColliderAndMuzzleVerified:false,
      fullEnemyAiDeathFeedbackVerified:false,
      actualDeviceProvenanceVerified:false,
      bossAndHazardsVerified:false,battleVictoryVerified:false,
      independentReplayVerified:false,safeForSettlement:false,
      rewardSettlementEnabled:false,cloudRewards:false});
  };
  async function open(args={}){
    if(!exact(args,OPEN))
      deny('C15_DUNGEON_V2C5_INPUT_INVALID',
        'Exact ticket/movement/actor fields required',400);
    if(!config.allowedUids.includes(args.uid))
      deny('C15_DUNGEON_V2C5_ACTOR_NOT_ALLOWED','UID not allowlisted',403);
    const upstream=await damageService.open(args);
    const r=upstream?.report;
    const m=movementService.inspect(args.movementState);
    if(r?.battleId!==args.ticket?.battleId||
      r?.sceneSeed!==args.ticket?.sceneSeed||
      r?.simulatedTicks!==0||r?.safeForSettlement!==false||
      r?.actualAccountLoadoutVerified!==false||
      r?.outgoingDamageAndEnemyHpVerified!==false||
      r?.candidateFixedLoadoutOnly!==true||
      m?.battleId!==r.battleId||
      m?.traceDigest!==upstream.state?.movementDigest||
      !point(upstream.state?.player)||
      m.replayedPosition?.x!==upstream.state.player.x||
      m.replayedPosition?.z!==upstream.state.player.z)
      deny('C15_DUNGEON_V2C5_UPSTREAM_INVALID',
        'Signed server-issued damage state and touch proof required',403);
    const rows=recipeFor(r.sceneSeed);
    if(rows.length!==upstream.state.roster?.length||
      rows.some(x=>!upstream.state.roster.some(y=>y.enemyId===x.id)))
      deny('C15_DUNGEON_V2C5_CATALOG_DRIFT',
        'Server-roster drift from V2C.4',409);
    const s=makeState({version:VERSION,tick:0,
      actor:actor(args),battleId:r.battleId,sceneSeed:r.sceneSeed,
      ticketMac:args.ticket.mac,movementDigest:m.traceDigest,
      player:{...upstream.state.player},enemies:rows,shots:[],
      hits:[],created:0,consumed:0,expired:0,outgoingDamage:0,
      upstreamState:upstream.state,upstreamDigest:r.damageDigest,
      outgoingDigest:hash('sf-c15-v2c5-init',{battleId:r.battleId,
        seed:r.sceneSeed,ticketMac:args.ticket.mac,
        movementDigest:m.traceDigest,upstreamDigest:r.damageDigest,
        qaWeapon:QA_WEAPON.id,enemyRoster:rows})});
    return freeze({state:s,report:report(s)});
  }
  function nextTick(before,upstream){
    const tick=before.tick+1;
    const actual=upstream?.state?.upstreamState?.enemies;
    if(!Array.isArray(actual)||actual.length>MAX_ENEMIES||
      upstream.report?.simulatedTicks!==tick||
      upstream.report?.battleId!==before.battleId||
      upstream.report?.sceneSeed!==before.sceneSeed||
      upstream.report?.safeForSettlement!==false||
      upstream.report?.actualAccountLoadoutVerified!==false)
      deny('C15_DUNGEON_V2C5_UPSTREAM_MISMATCH',
        'Untrusted tick or enemy timeline',403);
    const positions=new Map();
    for(const e of actual){
      if(!obj(e)||!point(e.position)||!obj(e.entryShield)||
        positions.has(e.id)||!before.enemies.some(x=>x.id===e.id))
        throw new TypeError('Unexpected V2C.3 server-owned enemy record');
      positions.set(e.id,{position:{...e.position},
        entryActive:e.entryShield.phase==='active'});
    }
    const enemies=before.enemies.map(x=>({...x}));
    const byId=new Map(enemies.map(x=>[x.id,x]));
    const alive=()=>enemies.filter(e=>!e.dead&&positions.has(e.id)&&
      positions.get(e.id).entryActive).map(e=>({id:e.id,_dead:false,
        mesh:{position:positions.get(e.id).position}}));
    let created=before.created,consumed=before.consumed,
      expired=before.expired,outgoingDamage=before.outgoingDamage;
    const shots=before.shots.map(x=>({...x,hitKeys:[...x.hitKeys]}));
    const hits=before.hits.map(x=>({...x})),tickHits=[];
    if(tick%QA_WEAPON.fireEveryTicks===0){
      const targets=alive();
      const target=weapons.pickWeaponTarget(targets,before.player);
      if(target){
        const salvo=weapons.describeMainSalvo(QA_WEAPON,before.player,
          QA_WEAPON.atk,target);
        if(salvo.length!==1||salvo[0].homing!==true)
          throw new TypeError('QA gun no longer matches shared weapon policy');
        for(const x of salvo){
          if(![x.x,x.z,x.vx,x.vz,x.atk].every(finite)||
            x.atk<=0||x.atk>100000||shots.length>=MAX_SHOTS||
            created>=MAX_TOTAL_FIRED)
            deny('C15_DUNGEON_V2C5_SHOT_CAP',
              'Outgoing QA weapon bounds exceeded',400);
          shots.push({id:hash('sf-c15-v2c5-shot',{battleId:before.battleId,
            tick,ordinal:created}),targetId:target.id,
            position:{x:x.x,z:x.z},vx:x.vx,vz:x.vz,
            atk:x.atk,remaining:QA_WEAPON.penetration,hitKeys:[],
            createdTick:tick});
          created++;
        }
      }
    }
    const survivors=[];
    for(const shot of shots){
      if(shot.createdTick>tick||!integer(shot.createdTick,1,tick))
        throw new TypeError('Invalid instance-issued shot tick');
      const target=alive().find(e=>e.id===shot.targetId)||null;
      const bullet={position:{...shot.position},_vx:shot.vx,_vz:shot.vz,
        isHoming:true,target,_waveAmplitude:0};
      weapons.advancePlayerProjectile(bullet,1);
      if(!point(bullet.position)||![bullet._vx,bullet._vz].every(finite))
        throw new TypeError('Shared player projectile generated invalid position');
      const moving={...shot,position:{...bullet.position},
        vx:bullet._vx,vz:bullet._vz};
      if(tick-shot.createdTick>120||moving.position.z< -18||
        moving.position.z>18||Math.abs(moving.position.x)>10){
        expired++;continue;
      }
      let used=false;
      for(const e of alive()){
        const enemy=byId.get(e.id);
        const impact=applyCandidateOutgoingHitV2C5({enemy:{...enemy,
          entryActive:true,position:e.mesh.position},
          shot:moving,position:e.mesh.position},{weapons,combatMath});
        if(!impact.hit)continue;
        if(hits.length>=MAX_HITS)
          deny('C15_DUNGEON_V2C5_HIT_CAP','Outgoing hit ledger full',400);
        enemy.hp=impact.hpAfter;enemy.dead=impact.killed;
        outgoingDamage+=impact.damageApplied;
        const event={tick,id:shot.id,enemyId:e.id,
          applied:impact.damageApplied,hpAfter:enemy.hp,killed:enemy.dead};
        hits.push(event);tickHits.push(event);
        moving.hitKeys=impact.hitKeys;
        moving.remaining=impact.remaining;
        used=impact.consumed;
        if(used)consumed++;
        break;
      }
      if(!used)survivors.push(moving);
    }
    const digest=hash('sf-c15-v2c5-tick',{previous:before.outgoingDigest,
      tick,ticketMac:before.ticketMac,
      upstreamDigest:upstream.report.damageDigest,
      player:before.player,tickHits,enemies:enemies.map(e=>({
        id:e.id,hp:e.hp,dead:e.dead})),
      shots:survivors.map(s=>({id:s.id,p:s.position,
        v:{x:s.vx,z:s.vz},remaining:s.remaining}))});
    return {...before,tick,enemies,shots:survivors,
      hits,created,consumed,expired,outgoingDamage,
      upstreamState:upstream.state,upstreamDigest:upstream.report.damageDigest,
      outgoingDigest:digest};
  }
  async function step(args={}){
    if(!exact(args,STEP)||!integer(args.ticks,1,MAX_BATCH))
      deny('C15_DUNGEON_V2C5_INPUT_INVALID',
        'Exact bounded tick input required',400);
    requireState(args.state);
    const s=args.state;
    if(args.uid!==s.actor.uid||args.sessionId!==s.actor.sessionId||
      args.requestId!==s.actor.requestId)
      deny('C15_DUNGEON_V2C5_ACTOR_MISMATCH','State actor cannot change',403);
    if(args.ticket?.mac!==s.ticketMac||
      args.ticket?.battleId!==s.battleId||
      args.ticket?.sceneSeed!==s.sceneSeed)
      deny('C15_DUNGEON_V2C5_TICKET_MISMATCH',
        'Signed ticket binding changed',403);
    const m=movementService.inspect(args.movementState);
    if(m?.traceDigest!==s.movementDigest||
      m?.replayedPosition?.x!==s.player.x||
      m?.replayedPosition?.z!==s.player.z)
      deny('C15_DUNGEON_V2C5_MOVEMENT_MISMATCH',
        'Cannot retarget a frozen candidate player pose',409);
    if(s.tick+args.ticks>MAX_TICKS)
      deny('C15_DUNGEON_V2C5_TICK_CAP','Six-second QA limit',400);
    const requested=hash('sf-c15-v2c5-operation',{
      battleId:s.battleId,tick:s.tick,ticks:args.ticks,
      ticketMac:s.ticketMac,movementDigest:s.movementDigest});
    const existing=used.get(s);
    if(existing){
      if(existing.requested!==requested)
        deny('C15_DUNGEON_V2C5_REUSED_STATE',
          'Rewind/fork/reused state denied',409);
      return freeze({duplicate:true,...existing.outcome});
    }
    const running=inflight.get(s);
    if(running){
      if(running.requested!==requested)
        deny('C15_DUNGEON_V2C5_REUSED_STATE',
          'Concurrent fork denied',409);
      return freeze({duplicate:true,...await running.promise});
    }
    const promise=(async()=>{
      let current=s;
      for(let i=0;i<args.ticks;i++){
        const upstream=await damageService.step({state:current.upstreamState,
          ticket:args.ticket,movementState:args.movementState,
          ...actor(args),ticks:1});
        current=nextTick(current,upstream);
      }
      const next=makeState(current);
      const outcome=freeze({state:next,report:report(next)});
      used.set(s,{requested,outcome});
      return outcome;
    })();
    inflight.set(s,{requested,promise});
    try{return freeze({duplicate:false,...await promise});}
    finally{if(inflight.get(s)?.promise===promise)inflight.delete(s);}
  }
  return freeze({enabled:true,emulatorOnly:true,productionEnabled:false,
    independentReplayVerified:false,safeForSettlement:false,
    rewardSettlementEnabled:false,cloudRewards:false,
    open,step,inspect:report,claim:locked,finalize:locked});
}
module.exports=freeze({VERSION,TICK_HZ,MAX_TICKS,MAX_BATCH,
  QA_WEAPON,parseC15DungeonOutgoingStateV2C5Config,
  applyCandidateOutgoingHitV2C5,createC15DungeonOutgoingStateV2C5});
