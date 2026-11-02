'use strict';
const crypto=require('node:crypto');
const {GameError}=require('./economy.cjs');
const VERSION='c15-rc4-release-gate-v1';
const CHANNELS=new Set(['staging-qa','release-candidate','production']);
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const freeze=value=>Object.freeze(value);
const csv=value=>String(value||'').split(',').map(x=>x.trim()).filter(Boolean);
function versionParts(value){const match=SEMVER.exec(String(value||''));if(!match)return null;return match.slice(1,4).map(Number);}
function compareVersions(left,right){const a=versionParts(left),b=versionParts(right);if(!a||!b)throw new TypeError('RC4 semantic version required');
  for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]<b[i]?-1:1;}return 0;}
function parseC15Rc4ReleaseGateConfig(env={}){
  if(env.GAME_C15_RC4_RELEASE_GATE_ENABLED!=='true')return null;
  const mode=String(env.GAME_C15_RC4_DEPLOYMENT_MODE||'').trim();
  if(!['staging','production'].includes(mode))throw new TypeError('RC4 deployment mode must be staging or production');
  if(!['true','false'].includes(String(env.GAME_C15_RC4_GLOBAL_KILL_SWITCH||'')))
    throw new TypeError('RC4 global kill switch must be explicit');
  const uids=csv(env.GAME_C15_RC4_CANARY_UIDS);if(!uids.length||uids.some(uid=>!UID.test(uid)))throw new TypeError('RC4 closed canary UID allowlist required');
  const minAppVersion=String(env.GAME_C15_RC4_MIN_APP_VERSION||'').trim();if(!versionParts(minAppVersion))throw new TypeError('RC4 minimum app version required');
  const allowedBuildChannels=csv(env.GAME_C15_RC4_ALLOWED_BUILD_CHANNELS);
  const expected=mode==='production'?['production']:['release-candidate'];
  const channels=allowedBuildChannels.length?allowedBuildChannels:expected;
  if(channels.some(channel=>!CHANNELS.has(channel)))throw new TypeError('RC4 build channel invalid');
  if(mode==='production'&&channels.some(channel=>channel!=='production'))throw new TypeError('Production RC4 accepts production build channel only');
  return freeze({version:VERSION,mode,killSwitch:env.GAME_C15_RC4_GLOBAL_KILL_SWITCH==='true',uids:freeze([...new Set(uids)]),
    minAppVersion,allowedBuildChannels:freeze([...new Set(channels)])});
}
const hashId=value=>crypto.createHash('sha256').update(`sf-c15-rc4|${String(value||'')}`).digest('hex').slice(0,20);
function createC15Rc4ReleaseGate(config){if(!config)return freeze({version:VERSION,enabled:false,authorize(){throw new GameError('C15_RC4_RELEASE_GATE_DISABLED','RC4 release gate disabled',503);}});
  const allowlist=new Set(config.uids),channels=new Set(config.allowedBuildChannels);
  function authorize({uid,appVersion,buildChannel}){
    if(config.killSwitch)throw new GameError('C15_RC4_KILL_SWITCH','Verified rewards are temporarily unavailable',423);
    if(!UID.test(uid||'')||!allowlist.has(uid))throw new GameError('C15_RC4_NOT_ALLOWED','Account is not in the RC4 canary cohort',403);
    if(!channels.has(buildChannel))throw new GameError('C15_RC4_BUILD_CHANNEL_REJECTED','Build channel is not approved for this deployment',409);
    if(!versionParts(appVersion)||compareVersions(appVersion,config.minAppVersion)<0)
      throw new GameError('C15_RC4_APP_UPDATE_REQUIRED','A newer app version is required',426);
    return freeze({version:VERSION,mode:config.mode,uidHash:hashId(uid),appVersion,buildChannel});
  }
  function event({uid,battleId,outcomeDigest,statusCode,outcome='unknown',duplicate=false,latencyMs=0}){
    const bounded=Number.isFinite(latencyMs)?Math.max(0,Math.min(60000,Math.round(latencyMs*1000)/1000)):0;
    return freeze({event:'sf.c15.rc4.settlement.v1',mode:config.mode,outcome,statusCode:Number(statusCode)||0,duplicate:duplicate===true,
      latencyMs:bounded,uidHash:hashId(uid),battleHash:hashId(battleId),outcomePrefix:/^[0-9a-f]{64}$/.test(outcomeDigest||'')?outcomeDigest.slice(0,12):'invalid'});
  }
  return freeze({version:VERSION,enabled:true,config,authorize,event});
}
module.exports=freeze({VERSION,parseC15Rc4ReleaseGateConfig,createC15Rc4ReleaseGate,compareVersions,hashId});
