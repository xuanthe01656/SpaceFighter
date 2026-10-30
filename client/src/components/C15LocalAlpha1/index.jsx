import React,{useEffect,useRef,useState} from 'react';
import toast from 'react-hot-toast';
import {auth} from '../../firebase';
import {openOrResumeC15Rc1bSession} from '../../game/c15/C15Rc1bSession.js';
import {createC15LocalRenderer} from './C15LocalRenderer.js';
import {openCloudInputIntent,addCloudPointerDelta,sampleCloudInputTick,clearCloudPointerTarget,
  reconfigureCloudViewport} from '../../game/combat/CloudInputIntentV8.js';
import {c15KernelInputConfig} from '../../game/c15/C15KernelRuntime.js';

const surface={position:'absolute',inset:0,background:'#020814',overflow:'hidden',zIndex:60};
const chip={background:'rgba(3,15,30,.78)',border:'1px solid #2a6680',borderRadius:8,padding:'6px 9px',color:'#d9fbff'};

export default function C15LocalAlpha1({setScreen,lang='vi'}){
  const canvasRef=useRef(null),rendererRef=useRef(null),sessionRef=useRef(null),inputRef=useRef(null);
  const timerRef=useRef(null),pointerRef=useRef(null),resourceRef=useRef(null),lastHudTick=useRef(-1);
  const [ui,setUi]=useState({status:'opening',message:lang==='vi'?'Đang mở trận và chuẩn bị tài nguyên…':'Opening battle and resources…',
    view:null,fps:null,fault:null});
  useEffect(()=>{
    let cancelled=false,unsubscribe=()=>{};
    const stopTimer=()=>{if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}};
    const startTimer=()=>{if(timerRef.current||!sessionRef.current||!inputRef.current)return;
      timerRef.current=setInterval(()=>{try{const current=sessionRef.current?.getView();if(!current||current.phase!=='active'){stopTimer();return;}
        const sampled=sampleCloudInputTick(inputRef.current);inputRef.current=sampled.state;
        const advanced=sessionRef.current.advance(sampled.frame);rendererRef.current?.update(advanced.view.kernel);
      }catch(error){stopTimer();setUi(value=>({...value,status:'error',fault:error?.code||error?.message||'C15_LOCAL_RUNTIME_ERROR'}));}},1000/30);};
    const init=async()=>{
      const user=auth.currentUser;if(!user)throw new Error('C15 RC1B requires an authenticated account');
      const quality=(navigator.deviceMemory||0)>=6?'mobile-high':'mobile-low';
      const session=await openOrResumeC15Rc1bSession({uid:user.uid,quality,onChange:value=>{
        if(cancelled)return;rendererRef.current?.update(value.kernel);
        if(value.kernel.tick-lastHudTick.current>=5||value.phase!=='active'){
          lastHudTick.current=value.kernel.tick;setUi(old=>({...old,status:value.phase,view:value,message:null}));
        }
      }});
      if(cancelled){session.dispose();return;}sessionRef.current=session;
      resourceRef.current=await session.resolveResource('campaign-alpha-mobile-low','alpha_coast_low.webp');
      const renderer=await createC15LocalRenderer({canvas:canvasRef.current,backgroundUrl:resourceRef.current?.url,
        onMetrics:metrics=>setUi(old=>({...old,fps:metrics.fps}))});
      if(cancelled){renderer.dispose();return;}rendererRef.current=renderer;renderer.update(session.getView().kernel);
      const rect=canvasRef.current.getBoundingClientRect();inputRef.current=openCloudInputIntent(c15KernelInputConfig(session.getKernel(),{
        canvasWidth:Math.max(1,rect.width),canvasHeight:Math.max(1,rect.height),halfHeight:15}));
      unsubscribe=session.subscribe(value=>{if(cancelled)return;renderer.update(value.kernel);
        if(value.kernel.tick-lastHudTick.current>=5||value.phase!=='active'){lastHudTick.current=value.kernel.tick;setUi(old=>({...old,status:value.phase,view:value,message:null}));}
        if(value.phase==='active')startTimer();else stopTimer();});
      startTimer();
    };
    init().catch(error=>{if(!cancelled)setUi(value=>({...value,status:'error',fault:error?.code||error?.message||'C15_RC1B_OPEN_FAILED'}));});
    const resize=()=>{rendererRef.current?.resize();if(!inputRef.current||!canvasRef.current)return;try{const rect=canvasRef.current.getBoundingClientRect();
      inputRef.current=reconfigureCloudViewport(inputRef.current,{aspect:rect.width/Math.max(1,rect.height),canvasWidth:Math.max(1,rect.width),
        canvasHeight:Math.max(1,rect.height),halfHeight:15,speedMultiplier:1});}catch(_){}};
    const visibility=()=>{if(document.hidden){stopTimer();pointerRef.current=null;
        try{if(inputRef.current)inputRef.current=clearCloudPointerTarget(inputRef.current);}catch(_){}
        void sessionRef.current?.suspend();}
      else if(sessionRef.current?.getView().phase==='active')startTimer();};
    const online=()=>{void sessionRef.current?.retryNetwork().catch(()=>{});};
    window.addEventListener('resize',resize);window.addEventListener('online',online);document.addEventListener('visibilitychange',visibility);
    return()=>{cancelled=true;stopTimer();unsubscribe();window.removeEventListener('resize',resize);window.removeEventListener('online',online);
      document.removeEventListener('visibilitychange',visibility);void sessionRef.current?.suspend();sessionRef.current?.dispose();rendererRef.current?.dispose();resourceRef.current?.revoke?.();};
  },[lang]);
  const pointerDown=event=>{if(!inputRef.current||pointerRef.current!==null)return;pointerRef.current={id:event.pointerId,x:event.clientX,y:event.clientY};
    event.currentTarget.setPointerCapture?.(event.pointerId);};
  const pointerMove=event=>{const prior=pointerRef.current;if(!prior||prior.id!==event.pointerId||!inputRef.current)return;
    try{inputRef.current=addCloudPointerDelta(inputRef.current,{deltaX:event.clientX-prior.x,deltaY:event.clientY-prior.y});
      pointerRef.current={id:prior.id,x:event.clientX,y:event.clientY};}catch(_){}};
  const pointerUp=event=>{if(pointerRef.current?.id!==event.pointerId)return;pointerRef.current=null;try{if(inputRef.current)inputRef.current=clearCloudPointerTarget(inputRef.current);}catch(_){}};
  const retreat=async()=>{try{await sessionRef.current?.abandon();setScreen('stage_select');}catch(error){toast.error(error?.message||'Retreat failed');}};
  const retry=()=>{void sessionRef.current?.retryNetwork().catch(error=>toast.error(error?.message||'Verification retry failed'));};
  const k=ui.view?.kernel,t=ui.view?.transport;
  return <div style={surface}>
    <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
      style={{width:'100%',height:'100%',display:'block',touchAction:'none'}}/>
    <div style={{position:'absolute',top:'calc(env(safe-area-inset-top) + 10px)',left:10,right:10,display:'flex',gap:7,flexWrap:'wrap',fontSize:12,pointerEvents:'none'}}>
      <span style={chip}>C15 RC1B · LOCAL 30Hz · NON-ECONOMIC</span>
      {k&&<><span style={chip}>HP {Math.max(0,Math.round(k.hp))}/{Math.round(k.maxHp)}</span><span style={chip}>WAVE {k.wave}/{k.wavesTotal}</span>
        <span style={chip}>KILLS {k.kills}</span><span style={chip}>TICK {k.tick}</span></>}
      {ui.fps&&<span style={chip}>{ui.fps} FPS</span>}
      {t&&<span style={chip}>UPLOAD {t.summary.uploadedThroughTick}/{t.summary.ticks}{t.online?'':' · OFFLINE'}</span>}
    </div>
    <button onClick={retreat} style={{position:'absolute',left:14,bottom:'calc(env(safe-area-inset-bottom) + 15px)',zIndex:5,
      padding:'9px 14px',borderRadius:7,border:'1px solid #5de8ff',background:'rgba(0,0,0,.65)',color:'#bdf9ff'}}>◀ {lang==='vi'?'RÚT LUI':'RETREAT'}</button>
    {(ui.status==='opening'||ui.status==='verifying'||ui.status==='provisional-terminal'||ui.status==='verified'||ui.status==='error')&&
      <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',pointerEvents:'none'}}>
        <div style={{...chip,maxWidth:430,textAlign:'center',fontSize:14,padding:16,pointerEvents:'auto'}}>
          {ui.status==='opening'&&ui.message}
          {ui.status==='verifying'&&(lang==='vi'?'Đang tải journal và replay độc lập trên server…':'Uploading journal and verifying server replay…')}
          {ui.status==='provisional-terminal'&&<><b>{k?.provisionalPhase==='local-clear'?'LOCAL CLEAR':'LOCAL DEFEAT'}</b><br/>
            {lang==='vi'?'Kết quả tạm thời; cần mạng để server xác minh.':'Provisional result; network is required for server verification.'}<br/>
            <button onClick={retry}>RETRY VERIFY</button></>}
          {ui.status==='verified'&&<><b>{ui.view?.result?.phase==='rc1-verified-clear'?'SERVER VERIFIED CLEAR':'SERVER VERIFIED DEFEAT'}</b><br/>
            {lang==='vi'?'RC1B không cấp thưởng.':'RC1B is non-economic.'}<br/><button onClick={()=>setScreen('stage_select')}>CONTINUE</button></>}
          {ui.status==='error'&&<><b>RC1B ERROR</b><br/>{ui.fault}</>}
        </div>
      </div>}
  </div>;
}
