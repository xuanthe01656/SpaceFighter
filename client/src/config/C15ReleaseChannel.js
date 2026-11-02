export const C15_BUILD_CHANNEL_STAGING_QA='staging-qa';
export const C15_BUILD_CHANNEL_RELEASE_CANDIDATE='release-candidate';
export const C15_BUILD_CHANNEL_PRODUCTION='production';
export const C15_BUILD_CHANNELS=Object.freeze([
  C15_BUILD_CHANNEL_STAGING_QA,
  C15_BUILD_CHANNEL_RELEASE_CANDIDATE,
  C15_BUILD_CHANNEL_PRODUCTION,
]);
const TRUE=new Set(['1','true','yes','on']);
const bool=value=>TRUE.has(String(value??'').trim().toLowerCase());
const cleanVersion=value=>{const text=String(value??'0.0.0').trim();return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(text)?text:'0.0.0';};
export function resolveC15ReleaseChannel(env={}){
  const fallback=env.PROD===true?C15_BUILD_CHANNEL_RELEASE_CANDIDATE:C15_BUILD_CHANNEL_STAGING_QA;
  const id=String(env.VITE_SF_BUILD_CHANNEL||fallback).trim();
  if(!C15_BUILD_CHANNELS.includes(id))throw new TypeError(`Unsupported SpaceFighter build channel: ${id}`);
  const qaControls=id===C15_BUILD_CHANNEL_STAGING_QA;
  const releaseCandidate=id===C15_BUILD_CHANNEL_RELEASE_CANDIDATE;
  const production=id===C15_BUILD_CHANNEL_PRODUCTION;
  const legacyRc3=bool(env.VITE_C15_RC3_ENABLED);
  const canarySettlement=bool(env.VITE_C15_RC4_CANARY_SETTLEMENT_ENABLED);
  if(!qaControls&&bool(env.VITE_C15_CONTROL_AB_QA))throw new TypeError('C15 control A/B QA is forbidden outside staging-qa');
  if(production&&legacyRc3)throw new TypeError('Legacy RC3 staging settlement flag is forbidden in production');
  if(production&&canarySettlement)throw new TypeError('RC4 canary settlement must not be compiled into production by default');
  return Object.freeze({
    id,qaControls,releaseCandidate,production,
    settlementClientEnabled:qaControls?legacyRc3:releaseCandidate?canarySettlement:false,
    appVersion:cleanVersion(env.VITE_APP_VERSION),
    showDiagnosticHud:qaControls,
    showControlExport:qaControls,
    showDuplicateButton:qaControls,
    showDigestPrefixes:qaControls,
  });
}
export function c15ReleaseChannelFromImportMeta(){return resolveC15ReleaseChannel(import.meta.env||{});}
