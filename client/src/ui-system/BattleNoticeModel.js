/** Pure presentation adapter, independent of Guest/C15 combat authority. */
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
export function normalizeBattleNotice(input){
  if(!input||typeof input.text!=='string'||!input.text.trim())return null;
  const color=String(input.colorHex||input.color||'').toLowerCase();
  const tone=input.tone==='danger'||['#ff0000','#ff4757','#ff425e'].includes(color)?'danger':
    input.tone==='success'||color==='#2ecc71'?'success':'accent';
  return Object.freeze({id:String(input.id??input.text),text:input.text.trim(),tone,
    durationMs:clamp(Number.isFinite(Number(input.duration))?Number(input.duration):2000,800,6000)});
}
export function c15WaveNotice(wave,lang='vi'){
  const n=Number(wave);
  if(!Number.isInteger(n)||n<1||n>100)return null;
  return normalizeBattleNotice({id:`c15-wave-${n}`,text:lang==='vi'?`TIẾN VÀO ĐỢT ${n}`:`ENTERING WAVE ${n}`,
    tone:'accent',duration:2000});
}
