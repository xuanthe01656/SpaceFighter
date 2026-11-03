import test from 'node:test';
import assert from 'node:assert/strict';
import {createC15PointerController} from '../src/game/c15/C15PointerController.js';
class Target{constructor(){this.listeners=new Map();this.captured=new Set();this.hidden=false;}
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  dispatch(name,event={}){for(const fn of [...(this.listeners.get(name)||[])])fn(event);}
  setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);}focus(){}
}
const event=(id,x,y,extra={})=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',isPrimary:id===1,
  cancelable:true,preventDefault(){this.prevented=true;},...extra});
test('first pointer owns movement and secondary touches cannot steal or release it',()=>{
  const element=new Target(),win=new Target(),doc=new Target(),deltas=[],metrics=[],releases=[];
  const controller=createC15PointerController({element,windowTarget:win,documentTarget:doc,onDelta:value=>deltas.push(value),
    onRelease:value=>releases.push(value),onCancel:()=>{},onMetric:name=>metrics.push(name)});
  element.dispatch('pointerdown',event(1,10,10));element.dispatch('pointerdown',event(2,20,20));
  element.dispatch('pointermove',event(2,40,40));element.dispatch('pointermove',event(1,30,25));element.dispatch('pointerup',event(2,40,40));
  assert.equal(controller.getActivePointer().id,1);assert.deepEqual(deltas.map(({deltaX,deltaY})=>({deltaX,deltaY})),[{deltaX:20,deltaY:15}]);
  assert.ok(metrics.includes('secondary-pointer-ignored'));element.dispatch('pointerup',event(1,30,25));assert.equal(releases.length,1);
  controller.dispose();
});
test('coalesced latest sample is used and pointercancel/lost capture stop control safely',()=>{
  const element=new Target(),win=new Target(),doc=new Target(),deltas=[],cancels=[];
  const controller=createC15PointerController({element,windowTarget:win,documentTarget:doc,onDelta:value=>deltas.push(value),
    onRelease:()=>{},onCancel:value=>cancels.push(value),onMetric:()=>{}});
  element.dispatch('pointerdown',event(1,0,0));element.dispatch('pointerrawupdate',event(1,5,5,{getCoalescedEvents:()=>[event(1,2,3),event(1,8,9)]}));
  assert.deepEqual({x:deltas[0].deltaX,y:deltas[0].deltaY},{x:8,y:9});element.dispatch('pointercancel',event(1,8,9));
  assert.equal(cancels[0].reason,'pointer-cancel');assert.equal(controller.isActive(),false);
  element.dispatch('pointerdown',event(1,10,10));element.dispatch('lostpointercapture',event(1,10,10));
  assert.equal(cancels.at(-1).reason,'lost-pointer-capture');controller.dispose();
});
