/**
 * QA-ONLY: run the generated C15 combat kernel with no authenticated session.
 * Guest remains offline and non-economic; this is a parity observation lane,
 * NOT a permanent migration or a server authority bypass.
 *
 * Enable only with VITE_GUEST_C15_ALPHA1_PARITY_QA=true in local F12.
 */
import React,{useEffect,useRef,useState} from 'react';
import {createC15LocalRenderer} from '../C15LocalAlpha1/C15LocalRenderer.js';
import {createC15FramePacer} from '../../game/c15/C15FramePacer.js';
import {createC15PointerController} from '../../game/c15/C15PointerController.js';
import {C15_ARCADE_CONTROL_PROFILE_ID,resolveC15ControlProfile} from '../../game/c15/C15ControlProfilesV1.js';
import {openC15ControlIntent,sampleC15ControlTick,addC15PointerDelta,
  predictC15ControlRenderPosition,releaseC15ControlTarget,cancelC15ControlTarget,
  reconfigureC15ControlViewport,c15ControlIntentView} from '../../game/c15/C15ControlIntent.js';
import {createGuestC15QaNewBattle,createGuestC15Alpha1QaBattle,
  advanceGuestC15Alpha1QaBattle,guestC15Alpha1QaView,guestC15QaControlConfig} from '../../game/c15/GuestC15Alpha1Local.js';
import BattleHud from '../../ui-system/BattleHud.jsx';

const shell={position:'absolute',inset:0,background:'#03101c',overflow:'hidden',overscrollBehavior:'none',zIndex:50};
const panel={position:'absolute',left:'8%',right:'8%',top:'42%',padding:20,border:'1px solid #32c9e9',
  background:'rgba(3,12,23,.96)',color:'#e4f9ff',fontFamily:'monospace',textAlign:'center',zIndex:20};

export default function GuestC15Alpha1QA({setScreen,lang='vi'}){
  const canvasRef=useRef(null),rendererRef=useRef(null),controlRef=useRef(null),battleRef=useRef(null);
  const pacerRef=useRef(null),pointerRef=useRef(null),rafRef=useRef(null),alphaRef=useRef(0);
  const [status,setStatus]=useState({phase:'opening',view:null,error:null});
  const vi=lang==='vi';
  useEffect(()=>{
    let cancelled=false;
    const stop=()=>{if(rafRef.current!==null){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
      rendererRef.current?.clearPilotPreview?.();};
    const runFrame=now=>{
      rafRef.current=null;if(cancelled||!battleRef.current||!controlRef.current||!pacerRef.current)return;
      try{
        const pacing=pacerRef.current.advance(now);alphaRef.current=pacing.alpha;
        for(let i=0;i<pacing.steps;i++){
          const sampled=sampleC15ControlTick(controlRef.current);controlRef.current=sampled.state;
          battleRef.current=advanceGuestC15Alpha1QaBattle(battleRef.current,sampled.frame);
          const view=guestC15Alpha1QaView(battleRef.current);
          rendererRef.current?.update(view);
          if(view.tick%5===0||view.terminal)setStatus({phase:view.terminal?'terminal':'active',view,error:null});
          if(view.terminal){stop();return;}
        }
        if(controlRef.current)rendererRef.current?.previewPilot(
          predictC15ControlRenderPosition(controlRef.current,pacing.alpha));
        rafRef.current=requestAnimationFrame(runFrame);
      }catch(error){stop();setStatus({phase:'error',view:null,error:String(error?.message||error)});}
    };
    const start=()=>{if(cancelled||rafRef.current!==null||!battleRef.current)return;
      pacerRef.current.reset(performance.now());rafRef.current=requestAnimationFrame(runFrame);};
    const init=async()=>{
      const seedFlag=import.meta.env.VITE_GUEST_C15_ALPHA1_QA_SEED;
      const explicit=seedFlag&&/^\d{1,10}$/.test(String(seedFlag))?Number(seedFlag):null;
      let battle=createGuestC15QaNewBattle();
      if(explicit!==null){battle=createGuestC15Alpha1QaBattle({seed:explicit,issuedAtMs:Date.now(),
        sessionId:battle.sessionId,battleId:battle.battleId});}
      battleRef.current=battle;
      const view=guestC15Alpha1QaView(battle);setStatus({phase:'active',view,error:null});
      const rect=canvasRef.current.getBoundingClientRect();
      const config=guestC15QaControlConfig(battle,{canvasWidth:Math.max(1,rect.width),canvasHeight:Math.max(1,rect.height)});
      const profile=resolveC15ControlProfile(C15_ARCADE_CONTROL_PROFILE_ID);
      pacerRef.current=createC15FramePacer({simulationHz:profile.simulationHz||30,maxCatchUpSteps:3,maxFrameDeltaMs:100});
      const renderer=await createC15LocalRenderer({canvas:canvasRef.current,
        // Public local assets only. The cloud lane separately uses verified remote packs.
        backgroundUrl:'/images/backgrounds/demo/alpha_coast_low.webp',
        pilotTextureUrl:'/images/ships/ship_xwing_top.png',
        enemyAtlasUrl:'/images/visuals/enemy/p1_small_sheet.webp',
        arenaVisualBounds:{arenaHalfWidth:config.arenaHalfWidth,
          arenaHalfHeight:config.arenaHalfHeight,hitRadius:config.hitRadius},
        pilotResponseMs:profile.renderFollowMs});
      if(cancelled){renderer.dispose();return;}rendererRef.current=renderer;renderer.update(view);
      controlRef.current=openC15ControlIntent(config,{profileId:profile.id});
      pointerRef.current=createC15PointerController({element:canvasRef.current,
        onDelta:delta=>{if(!controlRef.current)return;try{controlRef.current=addC15PointerDelta(controlRef.current,{
          deltaX:delta.deltaX,deltaY:delta.deltaY});rendererRef.current?.previewPilot(
            predictC15ControlRenderPosition(controlRef.current,alphaRef.current));}catch(_){/* invalid pointer */}},
        onRelease:()=>{if(controlRef.current)controlRef.current=releaseC15ControlTarget(controlRef.current);},
        onCancel:()=>{if(controlRef.current)controlRef.current=cancelC15ControlTarget(controlRef.current);}});
      start();
    };
    const resize=()=>{rendererRef.current?.resize();if(!controlRef.current||!canvasRef.current)return;
      const rect=canvasRef.current.getBoundingClientRect();const current=c15ControlIntentView(controlRef.current);
      try{controlRef.current=reconfigureC15ControlViewport(controlRef.current,{
        aspect:rect.width/Math.max(1,rect.height),canvasWidth:Math.max(1,rect.width),
        canvasHeight:Math.max(1,rect.height),halfHeight:15,speedMultiplier:current.speedMultiplier});}catch(_){}
    };
    const visibility=()=>{if(document.hidden){pointerRef.current?.cancel('visibility-hidden');stop();
      if(controlRef.current)controlRef.current=cancelC15ControlTarget(controlRef.current);}
      else if(battleRef.current?.run?.state?.phase==='active')start();};
    init().catch(error=>{if(!cancelled)setStatus({phase:'error',view:null,error:String(error?.message||error)});});
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);
    return()=>{cancelled=true;stop();pointerRef.current?.dispose();pointerRef.current=null;
      window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);
      rendererRef.current?.dispose();rendererRef.current=null;controlRef.current=null;
      battleRef.current=null;pacerRef.current=null;};
  },[]);
  const view=status.view;
  return <div style={shell} data-qa-only="guest-c15-same-kernel-no-rewards">
    <canvas ref={canvasRef} tabIndex={-1} style={{display:'block',width:'100%',height:'100%',outline:0,
      touchAction:'none',overscrollBehavior:'none',userSelect:'none'}}/>
    <BattleHud lang={lang} stage={1} wave={view?.wave||1} wavesTotal={view?.wavesTotal||5}
      hp={view?.hp??0} maxHp={view?.maxHp||1} kills={view?.kills||0}
      onRetreat={()=>setScreen('stage_select')}/>
    {status.phase==='opening'&&<div style={panel}>{vi?'Đang khởi động mô phỏng Guest…':'Opening Guest simulation…'}</div>}
    {status.phase==='error'&&<div style={panel} role="alert">GUEST COMBAT QA ERROR<br/>{status.error}</div>}
    {status.phase==='terminal'&&<div style={panel} role="status">
      <strong>{view?.phase==='lab-clear'?(vi?'CHIẾN THẮNG LOCAL':'LOCAL CLEAR'):(vi?'THẤT BẠI LOCAL':'LOCAL DEFEAT')}</strong>
      <p>{vi?'Chế độ so sánh gameplay: không lưu coin/XP, không gửi server.':'Combat parity QA: no coins/XP and no server writes.'}</p>
      <button type="button" onClick={()=>setScreen('stage_select')}>{vi?'TRỞ VỀ CHỌN MÀN':'BACK TO STAGE SELECT'}</button>
    </div>}
  </div>;
}
