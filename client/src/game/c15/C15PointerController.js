/** Native DOM Pointer Events ownership for RC5 mobile control. */
const noop=()=>{};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validTarget=value=>value&&typeof value.addEventListener==='function'&&typeof value.removeEventListener==='function';

export function createC15PointerController({element,windowTarget=globalThis.window,documentTarget=globalThis.document,
  onDelta=noop,onRelease=noop,onCancel=noop,onMetric=noop}={}){
  if(!validTarget(element)||typeof onDelta!=='function'||typeof onRelease!=='function'
    ||typeof onCancel!=='function'||typeof onMetric!=='function')throw new TypeError('C15 pointer controller config invalid');
  let active=null,disposed=false;
  const metric=name=>{try{onMetric(name);}catch(_){}};
  const prevent=event=>{if(event?.cancelable)event.preventDefault?.();};
  const releaseCapture=id=>{try{if(element.hasPointerCapture?.(id))element.releasePointerCapture?.(id);}catch(_){}};
  function clear(kind,event){if(!active||event&&event.pointerId!==undefined&&event.pointerId!==active.id)return false;
    const prior=active;active=null;releaseCapture(prior.id);
    if(kind==='release')onRelease({pointerId:prior.id,pointerType:prior.type});
    else{metric(kind);onCancel({reason:kind,pointerId:prior.id,pointerType:prior.type});}
    return true;
  }
  function down(event){if(disposed)return;if(active){metric('secondary-pointer-ignored');prevent(event);return;}
    if(event?.pointerType==='mouse'&&event.button!==0)return;
    if(event?.pointerType==='touch'&&event.isPrimary===false){metric('secondary-pointer-ignored');prevent(event);return;}
    if(!Number.isSafeInteger(event?.pointerId)||!finite(event.clientX)||!finite(event.clientY))return;
    active={id:event.pointerId,type:event.pointerType||'unknown',x:event.clientX,y:event.clientY};
    try{element.setPointerCapture?.(active.id);}catch(_){metric('capture-unavailable');}
    prevent(event);try{element.focus?.({preventScroll:true});}catch(_){try{element.focus?.();}catch(_focus){}}
  }
  function move(event){if(disposed||!active||event?.pointerId!==active.id)return;
    let samples=[];try{samples=event.getCoalescedEvents?.()||[];}catch(_){samples=[];}
    const sample=[...samples].reverse().find(item=>item?.pointerId===undefined||item.pointerId===active.id)||event;
    if(!finite(sample?.clientX)||!finite(sample?.clientY))return;
    const deltaX=sample.clientX-active.x,deltaY=sample.clientY-active.y;
    active={...active,x:sample.clientX,y:sample.clientY};
    if(deltaX!==0||deltaY!==0)onDelta({deltaX,deltaY,pointerId:active.id,pointerType:active.type,timeStamp:Number(event.timeStamp)||0});
    prevent(event);
  }
  const up=event=>{prevent(event);clear('release',event);};
  const cancel=event=>{prevent(event);clear('pointer-cancel',event);};
  const lost=event=>{clear('lost-pointer-capture',event);};
  const blur=()=>{clear('window-blur');};
  const visibility=()=>{if(documentTarget?.hidden)clear('visibility-hidden');};
  const outsideUp=event=>{if(active&&event?.pointerId===active.id)up(event);};
  const options={passive:false,capture:true};
  element.addEventListener('pointerdown',down,options);element.addEventListener('pointerrawupdate',move,options);
  element.addEventListener('pointermove',move,options);
  element.addEventListener('pointerup',up,options);element.addEventListener('pointercancel',cancel,options);
  element.addEventListener('lostpointercapture',lost,true);
  windowTarget?.addEventListener?.('pointerup',outsideUp,true);windowTarget?.addEventListener?.('pointercancel',cancel,true);
  windowTarget?.addEventListener?.('blur',blur);documentTarget?.addEventListener?.('visibilitychange',visibility);
  function dispose(){if(disposed)return;disposed=true;clear('dispose');
    element.removeEventListener('pointerdown',down,true);element.removeEventListener('pointerrawupdate',move,true);
    element.removeEventListener('pointermove',move,true);
    element.removeEventListener('pointerup',up,true);element.removeEventListener('pointercancel',cancel,true);
    element.removeEventListener('lostpointercapture',lost,true);
    windowTarget?.removeEventListener?.('pointerup',outsideUp,true);windowTarget?.removeEventListener?.('pointercancel',cancel,true);
    windowTarget?.removeEventListener?.('blur',blur);documentTarget?.removeEventListener?.('visibilitychange',visibility);}
  return Object.freeze({dispose,cancel:reason=>clear(reason||'manual-cancel'),isActive:()=>active!==null,getActivePointer:()=>active?Object.freeze({...active}):null});
}
