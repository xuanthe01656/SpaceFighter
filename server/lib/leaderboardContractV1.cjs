'use strict';
/**
 * Server-only leaderboard contract candidate.
 *
 * This module does not open a client write path and does not alter frozen C15
 * settlement. It defines versioned board identities, verified-entry rules and
 * deterministic tie-breakers for a later Firestore/Admin SDK implementation.
 */
const LEADERBOARD_CONTRACT_VERSION='leaderboard-contract-v1.0.0';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const int=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max=64)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);

const BOARD_DEFINITIONS=freeze({
  pvp_ranked: {
    id:'pvp_ranked',seasonal:true,reset:'month',minVerifiedMatches:10,
    requiredAuthority:'pvp_authority',
    primary:'conservativeSkill',direction:'desc',
    tieBreakers:freeze([{field:'wins',direction:'desc'},{field:'losses',direction:'asc'},{field:'achievedAtMs',direction:'asc'}]),
  },
  pve_campaign: {
    id:'pve_campaign',seasonal:true,reset:'month',
    requiredAuthority:'c15_trusted_outcome',
    primary:'score',direction:'desc',
    tieBreakers:freeze([{field:'clearTimeMs',direction:'asc'},{field:'damageTaken',direction:'asc'},{field:'achievedAtMs',direction:'asc'}]),
  },
  event_points: {
    id:'event_points',seasonal:false,reset:'event',
    requiredAuthority:'event_authority',
    primary:'score',direction:'desc',
    tieBreakers:freeze([{field:'completedObjectives',direction:'desc'},{field:'achievedAtMs',direction:'asc'}]),
  },
});

function utcMonthSeasonId(timestampMs=Date.now()){
  const date=new Date(timestampMs);
  if(!Number.isFinite(date.getTime()))throw new TypeError('Invalid leaderboard timestamp');
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
}
function conservativeSkill(mu=25,sigma=25/3){
  return Math.round((finite(mu,25)-3*Math.max(0,finite(sigma,25/3)))*1000)/1000;
}
function sanitizeDisplayName(value){return text(value,24)||'Pilot';}
function assertVerifiedOutcome(outcome,requiredAuthority=null){
  if(!outcome||typeof outcome!=='object'||Array.isArray(outcome))throw new TypeError('Leaderboard outcome required');
  if(outcome.verified!==true)throw new TypeError('Leaderboard outcome is not server verified');
  if(!['c15_trusted_outcome','pvp_authority','event_authority'].includes(outcome.authority))
    throw new TypeError('Leaderboard outcome authority invalid');
  if(requiredAuthority&&outcome.authority!==requiredAuthority)
    throw new TypeError('Leaderboard outcome authority does not match board');
  if(!text(outcome.rulesVersion,80))throw new TypeError('Leaderboard rulesVersion required');
  if(!text(outcome.outcomeId,128))throw new TypeError('Leaderboard outcomeId required');
  return true;
}
function createLeaderboardEntry({
  boardId,playerId,displayName,outcome,seasonId,eventId=null,
  score=0,clearTimeMs=0,damageTaken=0,completedObjectives=0,
  mu=25,sigma=25/3,wins=0,losses=0,matches=0,achievedAtMs=Date.now(),
}={}){
  const board=BOARD_DEFINITIONS[boardId];
  if(!board)throw new TypeError('Unknown leaderboard board');
  assertVerifiedOutcome(outcome,board.requiredAuthority);
  const safePlayerId=text(playerId,128);if(!safePlayerId)throw new TypeError('Leaderboard playerId required');
  const safeAchieved=Math.trunc(finite(achievedAtMs,0));if(!int(safeAchieved,0,Number.MAX_SAFE_INTEGER))throw new TypeError('Invalid achievedAtMs');
  const expectedMonth=board.reset==='month'?utcMonthSeasonId(safeAchieved):null;
  if(expectedMonth&&seasonId&&text(seasonId,80)!==expectedMonth)
    throw new TypeError('Leaderboard season does not match achievedAtMs');
  const resolvedSeason=expectedMonth||text(eventId||seasonId,80);
  if(!resolvedSeason)throw new TypeError('Leaderboard season/event version required');
  if(boardId==='pvp_ranked'&&!int(Math.trunc(matches),0,1_000_000))throw new TypeError('Invalid PvP matches');
  const entry={
    contractVersion:LEADERBOARD_CONTRACT_VERSION,boardId,seasonId:resolvedSeason,
    playerId:safePlayerId,displayName:sanitizeDisplayName(displayName),
    rulesVersion:text(outcome.rulesVersion,80),outcomeId:text(outcome.outcomeId,128),
    achievedAtMs:safeAchieved,
    score:Math.trunc(clamp(finite(score,0),0,Number.MAX_SAFE_INTEGER)),
    clearTimeMs:Math.trunc(clamp(finite(clearTimeMs,0),0,86_400_000)),
    damageTaken:Math.trunc(clamp(finite(damageTaken,0),0,Number.MAX_SAFE_INTEGER)),
    completedObjectives:Math.trunc(clamp(finite(completedObjectives,0),0,1_000_000)),
    mu:Math.round(clamp(finite(mu,25),0,1000)*1000)/1000,
    sigma:Math.round(clamp(finite(sigma,25/3),0,1000)*1000)/1000,
    conservativeSkill:conservativeSkill(mu,sigma),
    wins:Math.trunc(clamp(finite(wins,0),0,1_000_000)),
    losses:Math.trunc(clamp(finite(losses,0),0,1_000_000)),
    matches:Math.trunc(clamp(finite(matches,0),0,1_000_000)),
    provisional:boardId==='pvp_ranked'&&Math.trunc(finite(matches,0))<board.minVerifiedMatches,
  };
  return freeze(entry);
}
function compareDirection(a,b,direction){if(a===b)return 0;return direction==='asc'?(a<b?-1:1):(a>b?-1:1);}
function compareLeaderboardEntries(a,b){
  if(!a||!b||a.boardId!==b.boardId||a.seasonId!==b.seasonId)throw new TypeError('Leaderboard entries are not comparable');
  const board=BOARD_DEFINITIONS[a.boardId];
  if(board.id==='pvp_ranked'&&a.provisional!==b.provisional)return a.provisional?1:-1;
  const primary=compareDirection(a[board.primary],b[board.primary],board.direction);if(primary)return primary;
  for(const tie of board.tieBreakers){const result=compareDirection(a[tie.field],b[tie.field],tie.direction);if(result)return result;}
  return String(a.playerId).localeCompare(String(b.playerId));
}
function publicLeaderboardEntry(entry){
  return freeze({boardId:entry.boardId,seasonId:entry.seasonId,displayName:entry.displayName,
    score:entry.score,conservativeSkill:entry.conservativeSkill,wins:entry.wins,losses:entry.losses,
    matches:entry.matches,provisional:entry.provisional,clearTimeMs:entry.clearTimeMs,
    completedObjectives:entry.completedObjectives,achievedAtMs:entry.achievedAtMs});
}
module.exports=freeze({LEADERBOARD_CONTRACT_VERSION,BOARD_DEFINITIONS,utcMonthSeasonId,conservativeSkill,
  sanitizeDisplayName,assertVerifiedOutcome,createLeaderboardEntry,compareLeaderboardEntries,publicLeaderboardEntry});
