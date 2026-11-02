'use strict';
const VERSION='c15-rc4-reconciliation-v1';
const freeze=value=>Object.freeze(value);
const num=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const get=(obj,path)=>path.reduce((value,key)=>value&&typeof value==='object'?value[key]:undefined,obj);
function reconcileC15Rc4Settlement({outcome,receipt,operation,userBefore,userAfter}={}){
  const issues=[];
  if(!outcome||!receipt||!operation||!userBefore||!userAfter)issues.push('MISSING_EVIDENCE');
  if(outcome&&receipt){
    if(receipt.outcomeDigest!==outcome.outcomeDigest)issues.push('OUTCOME_DIGEST_MISMATCH');
    if(receipt.battleId!==outcome.battleId)issues.push('BATTLE_MISMATCH');
    if(receipt.outcomePhase!==outcome.phase)issues.push('OUTCOME_PHASE_MISMATCH');
  }
  if(receipt&&operation){
    if(operation.command!=='c15.settlement.claim')issues.push('OPERATION_COMMAND_INVALID');
    if(operation.battleId!==receipt.battleId)issues.push('OPERATION_BATTLE_MISMATCH');
    if(operation.outcomeDigest!==receipt.outcomeDigest)issues.push('OPERATION_OUTCOME_MISMATCH');
    if(operation.extra?.receiptDigest!==receipt.receiptDigest)issues.push('OPERATION_RECEIPT_MISMATCH');
  }
  if(receipt&&userBefore&&userAfter){
    const beforeCoins=num(get(userBefore,['wallet','coins'])),afterCoins=num(get(userAfter,['wallet','coins']));
    const beforeXp=num(get(userBefore,['progress','exp'])??0),afterXp=num(get(userAfter,['progress','exp'])??0);
    if(beforeCoins===null||afterCoins===null||afterCoins-beforeCoins!==receipt.coins)issues.push('COIN_DELTA_MISMATCH');
    if(beforeXp===null||afterXp===null||afterXp-beforeXp!==receipt.experience)issues.push('XP_DELTA_MISMATCH');
    const beforePlay=num(get(userBefore,['missions','progress','d_play_3'])??0),afterPlay=num(get(userAfter,['missions','progress','d_play_3'])??0);
    const beforeClear=num(get(userBefore,['missions','progress','m_clear_planet'])??0),afterClear=num(get(userAfter,['missions','progress','m_clear_planet'])??0);
    if(beforePlay===null||afterPlay===null||afterPlay-beforePlay!==receipt.missionDeltas?.d_play_3)issues.push('PLAY_MISSION_DELTA_MISMATCH');
    if(beforeClear===null||afterClear===null||afterClear-beforeClear!==receipt.missionDeltas?.m_clear_planet)issues.push('CLEAR_MISSION_DELTA_MISMATCH');
    const afterStars=num(get(userAfter,['progress','planets',1,'stars',1])??get(userAfter,['progress','planets','1','stars','1'])??0);
    if(afterStars===null||afterStars<receipt.stars)issues.push('STAR_PROGRESS_MISMATCH');
  }
  return freeze({version:VERSION,status:issues.length?'FAIL':'PASS',issues:freeze(issues)});
}
module.exports=freeze({VERSION,reconcileC15Rc4Settlement});
