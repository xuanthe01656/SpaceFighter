'use strict';
/**
 * C15-RC1 signed commercial-local genesis foundation.
 * It authorizes deterministic local play + later independent replay only.
 * It is explicitly non-economic and cannot be consumed by settlement.
 */
const {createHash,createHmac,timingSafeEqual}=require('node:crypto');
const {C15_RULES_VERSION,C15_CATALOG_VERSION,C15_DESCRIPTOR_VERSION,C15_RULES_DOCUMENT,
  normalizeC15CombatDescriptor,c15Digest}=require('./c15RulesV2.cjs');
const {verifyResourceManifestV1}=require('./resourceManifestV1.cjs');
const VERSION='c15-commercial-genesis-v1';
const ORIGIN_VERSION='c15-commercial-origin-v1';
const PURPOSE='commercial-local-replay-rc1';
const KEY_ID=/^[A-Za-z0-9_-]{6,48}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const safeInt=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)
  ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=(tag,value)=>createHash('sha256').update(JSON.stringify([tag,canonical(value)])).digest('hex');
const mac=(fields,key)=>createHmac('sha256',key).update(JSON.stringify(canonical(fields))).digest('hex');
const GENESIS_KEYS=['version','purpose','keyId','uid','sessionId','battleId','issuedAtMs','expiresAtMs',
  'rulesVersion','rulesDigest','catalogVersion','descriptorVersion','legacySimulationRulesVersion','snapshotHash','loadoutHash',
  'descriptor','descriptorDigest','policyDigest','stage','resourceManifestVersion','resourceManifestDigest','resourcePacks','seed',
  'rc1Only','nonEconomic','safeForSettlement','mac'];
const ORIGIN_KEYS=['version','genesis','snapshot','encounter','policy','originDigest'];
function selectedPacks(manifest,ids){
  if(!Array.isArray(ids)||ids.length<1||ids.length>32||new Set(ids).size!==ids.length)throw new TypeError('Invalid selected resource packs');
  const byId=new Map(manifest.packs.map(p=>[p.id,p]));
  return ids.map(id=>{const p=byId.get(id);if(!p)throw new TypeError(`Missing selected resource pack: ${id}`);return freeze({id:p.id,revision:p.revision,sha256:p.sha256,required:p.required});})
    .sort((a,b)=>a.id.localeCompare(b.id));
}
function createC15CommercialOriginV1({snapshot,encounter,policy,resourceManifest,
  selectedResourcePackIds,keyId,key,issuedAtMs,expiresAtMs}){
  if(!record(snapshot)||!record(snapshot.context)||!record(snapshot.equipment)
    ||!record(encounter)||!record(policy)||!Buffer.isBuffer(key)||key.length<32||key.length>128
    ||!KEY_ID.test(keyId||'')||!safeInt(issuedAtMs,1,Number.MAX_SAFE_INTEGER)
    ||!safeInt(expiresAtMs,issuedAtMs+1,issuedAtMs+30*60*1000))throw new TypeError('Invalid C15 trusted origin input');
  verifyResourceManifestV1(resourceManifest);
  const ctx=snapshot.context;
  if(!UUID.test(ctx.sessionId||'')||!UUID.test(ctx.battleId||'')||typeof ctx.uid!=='string'||ctx.uid.length<1||ctx.uid.length>128
    ||ctx.issuedAtMs!==issuedAtMs||ctx.expiresAtMs!==expiresAtMs||!HEX.test(snapshot.snapshotHash||'')||!HEX.test(snapshot.loadoutHash||'')){
    throw new TypeError('C15 snapshot identity mismatch');
  }
  const descriptor=normalizeC15CombatDescriptor(snapshot.equipment,{strictRc1:true});
  const rulesDigest=c15Digest(['sf-c15-rules-document',C15_RULES_DOCUMENT]);
  const descriptorDigest=c15Digest(['sf-c15-descriptor',descriptor]);
  const policyDigest=digest('sf-c15-policy',policy);
  const encounterDigest=digest('sf-c15-encounter',encounter);
  const packs=selectedPacks(resourceManifest,selectedResourcePackIds);
  const stage=freeze({id:'alpha_stage_1',version:'c15-alpha-stage1-v1',waveCount:encounter.waves?.length,
    totalEnemies:encounter.waves?.reduce((sum,w)=>sum+w.enemies.length,0),timeLimitTicks:2700,
    encounterVersion:encounter.version,encounterDigest});
  if(stage.waveCount!==5||stage.totalEnemies!==70)throw new TypeError('C15 RC1 requires pinned five-wave Alpha stage');
  const fields={version:VERSION,purpose:PURPOSE,keyId,uid:ctx.uid,sessionId:ctx.sessionId,
    battleId:ctx.battleId,issuedAtMs,expiresAtMs,rulesVersion:C15_RULES_VERSION,rulesDigest,
    catalogVersion:C15_CATALOG_VERSION,descriptorVersion:C15_DESCRIPTOR_VERSION,
    legacySimulationRulesVersion:ctx.rulesVersion,snapshotHash:snapshot.snapshotHash,
    loadoutHash:snapshot.loadoutHash,descriptor,descriptorDigest,policyDigest,stage,
    resourceManifestVersion:resourceManifest.version,resourceManifestDigest:resourceManifest.manifestDigest,
    resourcePacks:packs,seed:snapshot.seed,rc1Only:true,nonEconomic:true,safeForSettlement:false};
  const genesis=freeze({...fields,mac:mac(fields,key)});
  const base={version:ORIGIN_VERSION,genesis,snapshot,encounter,policy};
  return freeze({...base,originDigest:digest('sf-c15-commercial-origin',base)});
}
function verifyC15CommercialGenesisV1(genesis,keyRing){
  if(!exact(genesis,GENESIS_KEYS)||genesis.version!==VERSION||genesis.purpose!==PURPOSE
    ||genesis.rulesVersion!==C15_RULES_VERSION||!HEX.test(genesis.rulesDigest||'')
    ||genesis.rulesDigest!==c15Digest(['sf-c15-rules-document',C15_RULES_DOCUMENT])
    ||genesis.catalogVersion!==C15_CATALOG_VERSION
    ||genesis.descriptorVersion!==C15_DESCRIPTOR_VERSION||genesis.rc1Only!==true
    ||genesis.nonEconomic!==true||genesis.safeForSettlement!==false||!KEY_ID.test(genesis.keyId||'')
    ||!UUID.test(genesis.sessionId||'')||!UUID.test(genesis.battleId||'')||!HEX.test(genesis.mac||'')
    ||typeof genesis.uid!=='string'||genesis.uid.length<1||genesis.uid.length>128
    ||!safeInt(genesis.issuedAtMs,1,Number.MAX_SAFE_INTEGER)||!safeInt(genesis.expiresAtMs,genesis.issuedAtMs+1,genesis.issuedAtMs+30*60*1000)
    ||!safeInt(genesis.seed,1,0xffffffff)||!HEX.test(genesis.snapshotHash||'')||!HEX.test(genesis.loadoutHash||'')
    ||!HEX.test(genesis.descriptorDigest||'')||!HEX.test(genesis.policyDigest||'')
    ||!exact(genesis.stage,['id','version','waveCount','totalEnemies','timeLimitTicks','encounterVersion','encounterDigest'])
    ||genesis.stage.id!=='alpha_stage_1'||genesis.stage.waveCount!==5||genesis.stage.totalEnemies!==70
    ||!HEX.test(genesis.stage.encounterDigest||'')||genesis.resourceManifestVersion!=='resource-manifest-v1'
    ||!HEX.test(genesis.resourceManifestDigest||'')||!Array.isArray(genesis.resourcePacks)||genesis.resourcePacks.length<1
    ||genesis.resourcePacks.some(p=>!exact(p,['id','revision','sha256','required'])||typeof p.id!=='string'
      ||!safeInt(p.revision,1,1_000_000)||!HEX.test(p.sha256||'')||typeof p.required!=='boolean')
    ||new Set(genesis.resourcePacks.map(p=>p.id)).size!==genesis.resourcePacks.length)throw new TypeError('Invalid C15 genesis');
  const key=keyRing?.[genesis.keyId];
  if(!Buffer.isBuffer(key)||key.length<32||key.length>128)throw new TypeError('Unknown C15 genesis key');
  const {mac:actual,...fields}=genesis;
  const expected=mac(fields,key);
  if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')))throw new TypeError('C15 genesis signature mismatch');
  if(c15Digest(['sf-c15-descriptor',genesis.descriptor])!==genesis.descriptorDigest)throw new TypeError('C15 descriptor digest mismatch');
  return true;
}
function verifyC15CommercialOriginV1(origin,keyRing){
  if(!exact(origin,ORIGIN_KEYS)||origin.version!==ORIGIN_VERSION||!HEX.test(origin.originDigest||''))throw new TypeError('Invalid C15 origin');
  const {originDigest,...base}=origin;
  if(digest('sf-c15-commercial-origin',base)!==originDigest)throw new TypeError('C15 origin digest mismatch');
  verifyC15CommercialGenesisV1(origin.genesis,keyRing);
  const g=origin.genesis,s=origin.snapshot;
  if(s.snapshotHash!==g.snapshotHash||s.loadoutHash!==g.loadoutHash||s.seed!==g.seed
    ||s.context.uid!==g.uid||s.context.sessionId!==g.sessionId||s.context.battleId!==g.battleId
    ||digest('sf-c15-policy',origin.policy)!==g.policyDigest
    ||digest('sf-c15-encounter',origin.encounter)!==g.stage.encounterDigest)throw new TypeError('C15 origin binding mismatch');
  const descriptor=normalizeC15CombatDescriptor(s.equipment,{strictRc1:true});
  if(c15Digest(['sf-c15-descriptor',descriptor])!==g.descriptorDigest)throw new TypeError('C15 origin descriptor mismatch');
  return true;
}
function projectC15ClientGenesisV1(origin){
  if(!record(origin)||origin.version!==ORIGIN_VERSION)return null;
  return origin.genesis;
}
module.exports=freeze({VERSION,ORIGIN_VERSION,PURPOSE,createC15CommercialOriginV1,
  verifyC15CommercialGenesisV1,verifyC15CommercialOriginV1,projectC15ClientGenesisV1});
