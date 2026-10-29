/**
 * C8 Cloud Alpha 1 — opt-in NON-ECONOMIC QA cockpit.
 * This renders only a server-authored checkpoint projection. It is intentionally
 * NOT the Babylon Guest scene and never treats a client animation as a win.
 */
import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../../firebase';
import {openCloudQaC8,sendCloudQaInputC8,getCloudQaStatusC8,
  finalizeCloudQaC8,auditCloudQaC8,abandonCloudQaC8,
  openCandidateBattleC12,sendCandidateInputC12,getCandidateStatusC12,
  auditCandidateBattleC12,abandonCandidateBattleC12} from '../../services/gameApi';
import {createCloudQaSessionC8} from '../../game/combat/CloudQaSessionC8';
import {createCloudCandidateSessionC12} from '../../game/combat/CloudCandidateSessionC12';
import {createServerSceneModelC9} from '../../game/combat/ServerSceneModelC9';

const COLORS=Object.freeze({bg:'#020c1b',grid:'#16385a',enemy:'#ff7687',
  shot:'#68ffdc',hostile:'#ffa849',player:'#69f0ff'});
const position=(world,canvas,view)=>({
  x:canvas.width*(1-world.x/view.config.arenaHalfWidth)/2,
  y:canvas.height*(1+world.z/view.config.arenaHalfHeight)/2,
});
function drawCockpit(canvas,visual,predicted){
  if(!canvas)return;
  const r=canvas.getBoundingClientRect();
  if(!r.width||!r.height)return;
  const dpr=Math.min(2,globalThis.devicePixelRatio||1);
  const w=Math.max(1,Math.round(r.width*dpr));const h=Math.max(1,Math.round(r.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=COLORS.grid;ctx.lineWidth=1;
  for(let i=1;i<10;i++){
    const x=w*i/10,y=h*i/10;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
  }
  if(!visual)return;
  const place=o=>position(o,canvas,visual);
  const point=(o,color,radius)=>{const p=place(o);ctx.fillStyle=color;
    ctx.beginPath();ctx.arc(p.x,p.y,radius*dpr,0,Math.PI*2);ctx.fill();};
  for(const s of visual.shots)point(s,COLORS.shot,2);
  for(const s of visual.enemyShots)point(s,COLORS.hostile,2.3);
  for(const enemy of visual.enemies){
    const e=place(enemy),radius=8*dpr;ctx.strokeStyle=COLORS.enemy;
    ctx.lineWidth=2*dpr;ctx.beginPath();ctx.arc(e.x,e.y,radius,0,Math.PI*2);ctx.stroke();
    const ratio=Math.max(0,Math.min(1,enemy.hp/enemy.maxHp));
    ctx.fillStyle=COLORS.enemy;ctx.fillRect(e.x-radius,e.y-radius-8*dpr,2*radius*ratio,2*dpr);
  }
  // The smooth local marker is clearly predicted; ONLY server snapshots
  // determine QA phase, HP, kills, waves, proof and status.
  const ship=place(predicted||visual.pilot);ctx.save();ctx.translate(ship.x,ship.y);
  ctx.fillStyle=COLORS.player;ctx.beginPath();ctx.moveTo(0,-12*dpr);
  ctx.lineTo(9*dpr,12*dpr);ctx.lineTo(0,6*dpr);ctx.lineTo(-9*dpr,12*dpr);
  ctx.closePath();ctx.fill();ctx.restore();
}
export default function CloudQaAlpha1({setScreen,lang='vi',candidate=false}){
  const canvasRef=useRef(null),babylonCanvasRef=useRef(null);
  const sessionRef=useRef(null),pointerRef=useRef(null);
  const finishStarted=useRef(false),mounted=useRef(true),latestRef=useRef(null);
  const [status,setStatus]=useState('opening');
  const [hud,setHud]=useState(null),[fault,setFault]=useState(''),[proof,setProof]=useState(null);
  const [nowTick,setNowTick]=useState(0);
  const [renderMode,setRenderMode]=useState('2D FALLBACK');
  const [renderFault,setRenderFault]=useState('');
  const [renderPerf,setRenderPerf]=useState(null);
  const [diagnostics,setDiagnostics]=useState(null),[exportNotice,setExportNotice]=useState('');
  const vi=lang==='vi';
  useEffect(()=>{
    mounted.current=true;
    const expectedUid=auth.currentUser?.uid;
    if(!expectedUid){setFault('Google session required');setStatus('error');return;}
    const transport=candidate?{
      open:body=>openCandidateBattleC12(expectedUid,body),
      input:body=>sendCandidateInputC12(expectedUid,body),
      status:()=>getCandidateStatusC12(expectedUid),
      audit:body=>auditCandidateBattleC12(expectedUid,body),
      abandon:body=>abandonCandidateBattleC12(expectedUid,body),
    }:{
      open:body=>openCloudQaC8(expectedUid,body),
      input:body=>sendCloudQaInputC8(expectedUid,body),
      status:()=>getCloudQaStatusC8(expectedUid),
      receipt:body=>finalizeCloudQaC8(expectedUid,body),
      audit:body=>auditCloudQaC8(expectedUid,body),
      abandon:body=>abandonCloudQaC8(expectedUid,body),
    };
    const canvas=canvasRef.current,rect=canvas.getBoundingClientRect();
    const sceneModel=createServerSceneModelC9({clock:()=>performance.now()});
    let babylon=null,displayedServerTick=null;
    const fallback=code=>{
      if(!closed&&mounted.current){setRenderMode('2D FALLBACK');setRenderFault(code);setRenderPerf(null);}
    };
    const viewport={aspect:rect.width/Math.max(1,rect.height),
      canvasWidth:Math.max(1,rect.width),canvasHeight:Math.max(1,rect.height),
      halfHeight:15};
    let timer=null,animation=null,closed=false,deviceGone=false;
    const update=info=>{
      if(!mounted.current||closed)return;
      latestRef.current=info;
      if(candidate&&info.diagnostics)setDiagnostics(info.diagnostics);
      if(info.reply){
        try{sceneModel.accept(info.reply.visual);setHud(info.reply.visual);}catch(_e){
          setFault('C9_SERVER_VISUAL_INVALID');setStatus('error');
          void session.abandon();return;
        }
      }
      if(info.error){setStatus('error');setFault(info.error.code||info.error.message||'NETWORK_ERROR');}
      if(info.terminal&&!finishStarted.current){
        finishStarted.current=true;setStatus('auditing');
        Promise.resolve().then(()=>session.finish()).then(result=>{
          if(!closed&&mounted.current){setProof(result);setStatus('complete');}
        }).catch(e=>{
          if(!closed&&mounted.current){setFault(e?.code||e?.message||'QA_AUDIT_FAILED');setStatus('error');}
        });
      }
    };
    const session=(candidate?createCloudCandidateSessionC12:createCloudQaSessionC8)({api:transport,viewport,
      clock:()=>performance.now(),randomId:()=>crypto.randomUUID(),onUpdate:update});
    sessionRef.current=session;
    const halt=()=>{
      if(closed||deviceGone)return;
      deviceGone=true;setStatus('error');setFault('C8_QA_APP_INTERRUPTED_RESTART');
      void session.abandon();
    };
    const visualRequested=import.meta.env.VITE_C9_BABYLON_QA_UI==='true';
    // Keep the existing 2D canvas for no-WebGL devices and context-loss.
    // Babylon is lazy-loaded only in a manually enabled QA APK.
    if(visualRequested){
      import('./BabylonServerRendererC9').then(mod=>{
        if(closed||deviceGone||!mounted.current)return;
        try{
          babylon=mod.createBabylonServerRendererC9({canvas:babylonCanvasRef.current,
            onPerf:metrics=>{if(mounted.current&&!closed)setRenderPerf(metrics);},
            onFault:()=>{
              babylon?.dispose();babylon=null;
              fallback('C9_WEBGL_CONTEXT_LOST');
            }});
          displayedServerTick=null;setRenderFault('');setRenderMode('BABYLON QA');
        }catch(_){fallback('C9_BABYLON_INIT_FAILED');}
      }).catch(()=>fallback('C9_BABYLON_IMPORT_FAILED'));
    }
    const onHidden=()=>{if(document.hidden)halt();};
    const onBlur=()=>halt();
    const onResize=()=>halt();
    const unsubscribe=onAuthStateChanged(auth,user=>{
      if(!user||user.uid!==expectedUid)halt();
    });
    document.addEventListener('visibilitychange',onHidden);
    window.addEventListener('blur',onBlur);
    window.addEventListener('resize',onResize);
    const draw=()=>{
      const state=session.state;
      if(!closed&&mounted.current){
        if(babylon){
          try{
            // Large server arrays are copied only when an ACK arrives, not
            // 60 times/second. Babylon motion runs independently per render.
            if(sceneModel.tick!==null&&sceneModel.tick!==displayedServerTick){
              babylon.update(sceneModel.authoritativeFrame());
              displayedServerTick=sceneModel.tick;
            }
            babylon.updatePrediction(state.terminal?null:state.player);
          }catch(_){
            babylon.dispose();babylon=null;fallback('C9_BABYLON_UPDATE_FAILED');
          }
        }
        // 2D remains strictly based on validated checkpoint interpolation.
        if(!babylon){
          const frame=sceneModel.frame(state.player);
          drawCockpit(canvas,frame??latestRef.current?.reply?.visual,state.player);
        }
        animation=requestAnimationFrame(draw);
      }
    };animation=requestAnimationFrame(draw);
    session.start().then(()=>{
      if(closed||deviceGone||!mounted.current)return;
      setStatus('active');
      timer=setInterval(()=>{
        if(session.state.terminal||session.state.error||deviceGone||closed)return;
        try{const sample=session.sample();if(sample&&sample.tick%15===0)setNowTick(sample.tick);}
        catch(e){setFault(e?.code||e?.message||'QA_TIMER_ERROR');setStatus('error');void session.abandon();}
      },1000/30);
    }).catch(e=>{
      if(!closed&&mounted.current){setStatus('error');setFault(e?.code||e?.message||'QA_OPEN_FAILED');}
    });
    return ()=>{
      mounted.current=false;closed=true;
      if(timer!==null)clearInterval(timer);
      if(animation!==null)cancelAnimationFrame(animation);
      unsubscribe();document.removeEventListener('visibilitychange',onHidden);
      window.removeEventListener('blur',onBlur);window.removeEventListener('resize',onResize);
      babylon?.dispose();babylon=null;session.stopLocal();
    };
  },[]);
  const down=e=>{
    if(status!=='active'||pointerRef.current)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    pointerRef.current={id:e.pointerId,x:e.clientX,y:e.clientY};
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){/* optional */}
    if(e.cancelable)e.preventDefault();
  };
  const move=e=>{
    if(status!=='active'||pointerRef.current?.id!==e.pointerId)return;
    const p=pointerRef.current;const dx=e.clientX-p.x,dy=e.clientY-p.y;
    pointerRef.current={id:e.pointerId,x:e.clientX,y:e.clientY};
    try{sessionRef.current?.drag(dx,dy);}catch(_){/* controlled halt on next tick */}
    if(e.cancelable)e.preventDefault();
  };
  const up=e=>{
    if(pointerRef.current?.id!==e.pointerId)return;
    pointerRef.current=null;
    try{sessionRef.current?.release();}catch(_){/* session already ended */}
    try{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}catch(_){}
  };
  const exit=()=>{
    if(sessionRef.current)void sessionRef.current.abandon();
    setScreen('hq');
  };
  const exportCandidateEvidence=async()=>{
    if(!candidate||!sessionRef.current)return;
    const report=sessionRef.current.getDiagnostics();
    const data=JSON.stringify(report,null,2)+'\n';
    try{
      // User gesture only; NEVER send evidence to the server automatically.
      if(typeof File==='function'&&navigator.share&&navigator.canShare){
        const file=new File([data],'spacefighter-c13-movement-evidence.json',
          {type:'application/json'});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file],title:'SpaceFighter C13 local diagnostic'});
          setExportNotice(vi?'Đã mở chia sẻ JSON':'JSON share opened');return;
        }
      }
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(data);
        setExportNotice(vi?'Đã sao chép JSON':'JSON copied');return;
      }
      // Last-resort download for WebView implementations without share/clipboard.
      const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
      const anchor=document.createElement('a');
      anchor.href=url;anchor.download='spacefighter-c13-movement-evidence.json';
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      setExportNotice(vi?'Đã yêu cầu lưu JSON':'JSON download requested');
    }catch(e){
      setExportNotice(e?.name==='AbortError'?'':(vi?'Không thể xuất JSON':'Export failed'));
    }
  };
  const exportC9Perf=async()=>{
    if(!candidate||!renderPerf)return;
    // Deliberately separate from the C13 attestation-shaped report.
    // This is a LOCAL render-performance snapshot without identity or inputs.
    const data=JSON.stringify({...renderPerf,
      c12Transport:sessionRef.current?.state?.transport??null},null,2)+'\n';
    try{
      const file=typeof File==='function'
        ?new File([data],'spacefighter-c9-render-performance.json',{type:'application/json'})
        :null;
      if(file&&navigator.share&&navigator.canShare?.({files:[file]})){
        await navigator.share({files:[file],title:'SpaceFighter C9 local render QA'});
        setExportNotice(vi?'Đã mở chia sẻ C9':'C9 share opened');return;
      }
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(data);
        setExportNotice(vi?'Đã sao chép C9 JSON':'C9 JSON copied');return;
      }
      const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
      const anchor=document.createElement('a');anchor.href=url;
      anchor.download='spacefighter-c9-render-performance.json';
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      setExportNotice(vi?'Đã yêu cầu lưu C9 JSON':'C9 JSON download requested');
    }catch(e){
      setExportNotice(e?.name==='AbortError'?'':(vi?'Không thể xuất C9':'C9 export failed'));
    }
  };
  const buttonStyle={background:'#142c46',border:'1px solid #65f5ef',
    color:'#a9fbef',borderRadius:8,padding:'10px 16px',fontWeight:700};
  return <div style={{position:'absolute',inset:0,zIndex:80,background:'#020c1b',color:'#e8f5ff',overflow:'hidden'}}>
    <canvas ref={canvasRef} aria-hidden="true"
      style={{position:'absolute',inset:0,width:'100%',height:'100%',
        visibility:renderMode==='BABYLON QA'?'hidden':'visible',pointerEvents:'none'}} />
    {import.meta.env.VITE_C9_BABYLON_QA_UI === 'true'&&<canvas ref={babylonCanvasRef}
      aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',
        visibility:renderMode==='BABYLON QA'?'visible':'hidden',pointerEvents:'none'}}/>}
    <div onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={up} onLostPointerCapture={up}
      aria-label="C9 server-authoritative QA input surface"
      style={{position:'absolute',inset:0,touchAction:'none',zIndex:1}} />
    <div style={{position:'absolute',top:'calc(env(safe-area-inset-top) + 10px)',
      left:12,right:12,zIndex:2,pointerEvents:'none',textShadow:'0 1px 4px black'}}>
      <div style={{fontSize:13,fontWeight:700,color:'#ffd075'}}>
        {candidate?'C12 CANDIDATE ALPHA 1':'C9 QA CLOUD ALPHA 1'} · {renderMode} · NO REWARDS
      </div>
      {renderMode==='2D FALLBACK'&&renderFault&&<div role="status" style={{fontSize:10,color:'#ffcb86'}}>
        C9 render diagnostic: {renderFault}
      </div>}
      <div style={{fontSize:12,opacity:.85}}>{vi?'Máy chủ quyết định HP / quái / kết quả; tàu hiển thị vị trí dự đoán':'Server owns HP / enemies / outcome; local ship is predicted'}</div>
      {hud&&<div style={{marginTop:8,fontSize:14,fontWeight:600}}>
        HP {hud.hp}/{hud.maxHp} · Wave {hud.spawnedWaves}/5 · Kills {hud.kills} · Tick {hud.tick}
      </div>}
      {candidate&&renderMode==='BABYLON QA'&&renderPerf&&<div role="status"
        style={{marginTop:4,fontSize:10,color:'#a4d8ff'}}>
        C9 QA FPS ~{renderPerf.fps} · p95 frame {renderPerf.p95FrameMs}ms ·
        ACK gap {renderPerf.meanAckGapMs}ms · age {renderPerf.checkpointAgeMs}ms ·
        enemies {renderPerf.enemies} / shots {renderPerf.shots+renderPerf.enemyShots}
        {sessionRef.current?.state?.transport?.waiting&&<span style={{color:'#ffce91'}}>
          {' '}· NETWORK WAIT · queued {sessionRef.current.state.pending}/60 ·
          {sessionRef.current.state.transport.waitMs}ms
        </span>}
      </div>}
      {!hud&&<div style={{marginTop:8}}>{vi?'Đang mở vé QA từ máy chủ...':'Opening QA ticket...'}</div>}
    </div>
    <div style={{position:'absolute',bottom:'calc(env(safe-area-inset-bottom) + 12px)',
      left:12,right:12,zIndex:2,display:'flex',gap:8,alignItems:'flex-end',justifyContent:'space-between'}}>
      <button style={buttonStyle} onClick={exit}>{vi?'◀ VỀ HQ':'◀ HQ'}</button>
      <div style={{textAlign:'right',maxWidth:'65%',fontSize:12,background:'#071726c9',
        border:'1px solid #244b63',borderRadius:8,padding:8}}>
        <b>{status.toUpperCase()}</b> · {nowTick} local ticks
        {fault&&<div role="alert" style={{color:'#ff93a0',overflowWrap:'anywhere'}}>{fault}</div>}
        {proof&&<div style={{color:'#86ffc7'}}>{proof.phase} · {proof.verifiedTicks} ticks · {proof.verifiedChunks} chunks · NON-ECONOMIC</div>}
        {candidate&&diagnostics&&<div style={{marginTop:5,color:diagnostics.mismatchedCheckpoints||diagnostics.missingPredictions?'#ffb7a0':'#a4d8ff'}}>
          C13 input/checkpoint · ACK {diagnostics.acknowledgedTick} · drift {diagnostics.maxDistanceUnits/1000}u · RTT max {diagnostics.maxRttMs}ms
          {diagnostics.mismatchedCheckpoints>0&&<b> · REVIEW</b>}
        </div>}
        {candidate&&<button type="button" onClick={exportCandidateEvidence}
          style={{...buttonStyle,marginTop:7,padding:'6px 9px',fontSize:12}}>
          {vi?'Xuất báo cáo C13 JSON':'Export C13 JSON'}
        </button>}
        {candidate&&renderMode==='BABYLON QA'&&renderPerf&&<button type="button"
          onClick={exportC9Perf}
          style={{...buttonStyle,marginTop:4,padding:'5px 8px',fontSize:10}}>
          {vi?'Xuất C9 Perf JSON':'Export C9 Perf JSON'}
        </button>}
        {candidate&&exportNotice&&<div role="status" style={{marginTop:3}}>{exportNotice}</div>}
        <div style={{opacity:.7}}>30Hz · {candidate?'C11 candidate model (NOT production approved)':'clear-release QA'} · no wallet/mission changes</div>
      </div>
    </div>
  </div>;
}
