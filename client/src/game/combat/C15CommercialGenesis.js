/** Client-side strict parser for the opaque server-signed C15 genesis. */
import {C15_RULES_VERSION,C15_CATALOG_VERSION,C15_DESCRIPTOR_VERSION,
  normalizeC15CombatDescriptor,c15CanonicalJson} from '../config/C15RulesV2.js';
export const C15_CLIENT_GENESIS_VERSION='c15-commercial-genesis-v1';
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const GENESIS_KEYS=['version','purpose','keyId','uid','sessionId','battleId','issuedAtMs','expiresAtMs',
  'rulesVersion','rulesDigest','catalogVersion','descriptorVersion','legacySimulationRulesVersion','snapshotHash','loadoutHash',
  'descriptor','descriptorDigest','policyDigest','stage','resourceManifestVersion','resourceManifestDigest','resourcePacks','seed',
  'rc1Only','nonEconomic','safeForSettlement','mac'];
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
export function parseC15CommercialGenesis(raw){
  if(!exact(raw,GENESIS_KEYS)||raw.version!==C15_CLIENT_GENESIS_VERSION||raw.purpose!=='commercial-local-replay-rc1'
    ||raw.rulesVersion!==C15_RULES_VERSION||raw.catalogVersion!==C15_CATALOG_VERSION
    ||raw.descriptorVersion!==C15_DESCRIPTOR_VERSION||raw.rc1Only!==true||raw.nonEconomic!==true
    ||raw.safeForSettlement!==false||typeof raw.uid!=='string'||raw.uid.length<1||raw.uid.length>128
    ||typeof raw.keyId!=='string'||!/^[A-Za-z0-9_-]{6,48}$/.test(raw.keyId)
    ||!Number.isSafeInteger(raw.issuedAtMs)||!Number.isSafeInteger(raw.expiresAtMs)||raw.expiresAtMs<=raw.issuedAtMs
    ||!Number.isSafeInteger(raw.seed)||raw.seed<1||raw.seed>0xffffffff
    ||!UUID.test(raw.sessionId||'')||!UUID.test(raw.battleId||'')
    ||!HEX.test(raw.mac||'')||!HEX.test(raw.rulesDigest||'')||!HEX.test(raw.snapshotHash||'')||!HEX.test(raw.loadoutHash||'')
    ||!HEX.test(raw.descriptorDigest||'')||!HEX.test(raw.policyDigest||'')||!record(raw.stage)||raw.stage.waveCount!==5
    ||raw.stage.totalEnemies!==70||!HEX.test(raw.stage.encounterDigest||'')
    ||raw.resourceManifestVersion!=='resource-manifest-v1'||!HEX.test(raw.resourceManifestDigest||'')||!Array.isArray(raw.resourcePacks)
    ||raw.resourcePacks.some(p=>!record(p)||typeof p.id!=='string'||!Number.isSafeInteger(p.revision)
      ||!HEX.test(p.sha256||'')||typeof p.required!=='boolean')){
    throw new TypeError('C15 server genesis invalid');
  }
  if(c15CanonicalJson(raw).length>240000)throw new TypeError('C15 genesis exceeds client safety budget');
  // Re-normalize the descriptor contract. The client cannot verify the HMAC,
  // but it refuses malformed/unsupported mechanics before local play starts.
  const d=raw.descriptor;
  if(!record(d)||d.version!==C15_DESCRIPTOR_VERSION||d.rulesVersion!==C15_RULES_VERSION
    ||d.catalogVersion!==C15_CATALOG_VERSION||d.commercialRc1!==true){
    throw new TypeError('C15 descriptor invalid');
  }
  // Canonical JSON is retained for diagnostics and future public-key signing.
  return freeze({version:'c15-client-genesis-view-v1',opaqueSignedGenesis:freeze(structuredClone(raw)),
    battleId:raw.battleId,rulesVersion:raw.rulesVersion,descriptor:d,stage:raw.stage,
    resourcePacks:raw.resourcePacks,canonicalLength:c15CanonicalJson(raw).length,
    hmacVerifiedByClient:false,serverReplayRequired:true,settlementEnabled:false});
}
// Exported only for tests/future adapters; local inventory must never replace
// the descriptor embedded in the server-signed genesis.
export function normalizeC15LocalDescriptorForComparison(equipment){
  return normalizeC15CombatDescriptor(equipment,{strictRc1:true});
}
