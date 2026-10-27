/**
 * C8 Cloud Alpha 1 — opt-in NON-ECONOMIC QA cockpit.
 * This renders only a server-authored checkpoint projection. It is intentionally
 * NOT the Babylon Guest scene and never treats a client animation as a win.
 */
import React,{useEffect,useRef,useState} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from '../../firebase';
import {openCloudQaC8,sendCloudQaInputC8,getCloudQaStatusC8,
  finalizeCloudQaC8,auditCloudQaC8,abandonCloudQaC8} from '../../services/gameApi';
import {createCloudQaSessionC8} from '../../game/combat/CloudQaSessionC8';

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
export default function CloudQaAlpha1({setScreen,lang='vi'}){
  const canvasRef=useRef(null),sessionRef=useRef(null),pointerRef=useRef(null);
  const finishStarted=useRef(false),mounted=useRef(true),latestRef=useRef(null);
  const [status,setStatus]=useState('opening');
  const [hud,setHud]=useState(null),[fault,setFault]=useState(''),[proof,setProof]=useState(null);
  const [nowTick,setNowTick]=useState(0);
  const vi=lang==='vi';
  useEffect(()=>{
    mounted.current=true;
    const expectedUid=auth.currentUser?.uid;
    if(!expectedUid){setFault('Google session required');setStatus('error');return;}
    const transport={
      open:body=>openCloudQaC8(expectedUid,body),
      input:body=>sendCloudQaInputC8(expectedUid,body),
      status:()=>getCloudQaStatusC8(expectedUid),
      receipt:body=>finalizeCloudQaC8(expectedUid,body),
      audit:body=>auditCloudQaC8(expectedUid,body),
      abandon:body=>abandonCloudQaC8(expectedUid,body),
    };
    const canvas=canvasRef.current,rect=canvas.getBoundingClientRect();
    const viewport={aspect:rect.width/Math.max(1,rect.height),
      canvasWidth:Math.max(1,rect.width),canvasHeight:Math.max(1,rect.height),
      halfHeight:15};
    let timer=null,animation=null,closed=false,deviceGone=false;
    const update=info=>{
      if(!mounted.current||closed)return;
      latestRef.current=info;
      if(info.reply)setHud(info.reply.visual);
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
    const session=createCloudQaSessionC8({api:transport,viewport,
      clock:()=>performance.now(),randomId:()=>crypto.randomUUID(),onUpdate:update});
    sessionRef.current=session;
    const halt=()=>{
      if(closed||deviceGone)return;
      deviceGone=true;setStatus('error');setFault('C8_QA_APP_INTERRUPTED_RESTART');
      void session.abandon();
    };
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
        drawCockpit(canvas,latestRef.current?.reply?.visual,state.player);
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
      session.stopLocal();
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
  const buttonStyle={background:'#142c46',border:'1px solid #65f5ef',
    color:'#a9fbef',borderRadius:8,padding:'10px 16px',fontWeight:700};
  return <div style={{position:'absolute',inset:0,zIndex:80,background:'#020c1b',color:'#e8f5ff',overflow:'hidden'}}>
    <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move}
      onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      style={{position:'absolute',inset:0,width:'100%',height:'100%',touchAction:'none'}} />
    <div style={{position:'absolute',top:'calc(env(safe-area-inset-top) + 10px)',
      left:12,right:12,pointerEvents:'none',textShadow:'0 1px 4px black'}}>
      <div style={{fontSize:13,fontWeight:700,color:'#ffd075'}}>
        C8 QA CLOUD ALPHA 1 · OFFICIAL REWARDS DISABLED
      </div>
      <div style={{fontSize:12,opacity:.85}}>{vi?'Máy chủ quyết định HP / quái / kết quả; tàu hiển thị vị trí dự đoán':'Server owns HP / enemies / outcome; local ship is predicted'}</div>
      {hud&&<div style={{marginTop:8,fontSize:14,fontWeight:600}}>
        HP {hud.hp}/{hud.maxHp} · Wave {hud.spawnedWaves}/5 · Kills {hud.kills} · Tick {hud.tick}
      </div>}
      {!hud&&<div style={{marginTop:8}}>{vi?'Đang mở vé QA từ máy chủ...':'Opening QA ticket...'}</div>}
    </div>
    <div style={{position:'absolute',bottom:'calc(env(safe-area-inset-bottom) + 12px)',
      left:12,right:12,display:'flex',gap:8,alignItems:'flex-end',justifyContent:'space-between'}}>
      <button style={buttonStyle} onClick={exit}>{vi?'◀ VỀ HQ':'◀ HQ'}</button>
      <div style={{textAlign:'right',maxWidth:'65%',fontSize:12,background:'#071726c9',
        border:'1px solid #244b63',borderRadius:8,padding:8}}>
        <b>{status.toUpperCase()}</b> · {nowTick} local ticks
        {fault&&<div role="alert" style={{color:'#ff93a0',overflowWrap:'anywhere'}}>{fault}</div>}
        {proof&&<div style={{color:'#86ffc7'}}>{proof.phase} · {proof.verifiedTicks} ticks · {proof.verifiedChunks} chunks · QA ONLY</div>}
        <div style={{opacity:.7}}>30Hz · clear-release QA candidate · no wallet/mission changes</div>
      </div>
    </div>
  </div>;
}
