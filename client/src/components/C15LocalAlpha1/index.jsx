import React,{useEffect,useRef,useState} from 'react';
import toast from 'react-hot-toast';
import {auth} from '../../firebase';
import {openOrResumeC15Rc1bSession} from '../../game/c15/C15Rc1bSession.js';
import {createC15LocalRenderer} from './C15LocalRenderer.js';
import styles from './C15Presentation.module.css';
import {openC15ControlIntent,addC15PointerDelta,sampleC15ControlTick,releaseC15ControlTarget,
  cancelC15ControlTarget,predictC15ControlRenderPosition,reconfigureC15ControlViewport,
  c15ControlIntentView} from '../../game/c15/C15ControlIntent.js';
import {createC15ControlTelemetry} from '../../game/c15/C15ControlTelemetry.js';
import {createC15FramePacer} from '../../game/c15/C15FramePacer.js';
import {createC15PointerController} from '../../game/c15/C15PointerController.js';
import {C15_ARCADE_CONTROL_PROFILE_ID,C15_CURRENT_CONTROL_PROFILE_ID,
  C15_LEGACY_ARCADE_CONTROL_PROFILE_ID} from '../../game/c15/C15ControlProfilesV1.js';
import {c15KernelInputConfig} from '../../game/c15/C15KernelRuntime.js';
import {c15ReleaseChannelFromImportMeta} from '../../config/C15ReleaseChannel.js';

const surface={position:'absolute',inset:0,background:'#020814',overflow:'hidden',overscrollBehavior:'none',
  touchAction:'none',userSelect:'none',WebkitUserSelect:'none',WebkitTouchCallout:'none',zIndex:60};
const chip={background:'rgba(3,15,30,.78)',border:'1px solid #2a6680',borderRadius:8,padding:'6px 9px',color:'#d9fbff'};
const releaseChannel=c15ReleaseChannelFromImportMeta();
const abQa=()=>releaseChannel.qaControls&&String(import.meta.env?.VITE_C15_CONTROL_AB_QA||'false')==='true';
const envProfile=()=>String(import.meta.env?.VITE_C15_CONTROL_PROFILE_ID||C15_ARCADE_CONTROL_PROFILE_ID);
const rc3Enabled=()=>releaseChannel.settlementClientEnabled;
const rc5Enabled=()=>String(import.meta.env?.VITE_C15_RC5_CONTROL_ENABLED||'false')==='true';
const rc7Enabled=()=>String(import.meta.env?.VITE_C15_RC7_ASSET_DELIVERY_ENABLED||'false')==='true';
export function formatC15Rc1bFault(error,fallback='C15_RC1B_ERROR'){
  if(error?.code===25||error?.name==='DataCloneError')
    return 'C15_IDB_DATA_CLONE · Local session/resource cache could not be stored';
  const code=typeof error?.code==='string'&&error.code.trim()?error.code.trim():'';
  const name=typeof error?.name==='string'&&error.name!=='Error'?error.name:'';
  const message=typeof error?.message==='string'&&error.message.trim()?error.message.trim():'';
  if(code&&message&&code!==message)return `${code} · ${message}`;
  return code||message||name||fallback;
}

export default function C15LocalAlpha1({setScreen,lang='vi',refreshCloudProfile=async()=>null}){
  const canvasRef=useRef(null),rendererRef=useRef(null),sessionRef=useRef(null),inputRef=useRef(null),telemetryRef=useRef(null);
  const rafRef=useRef(null),pacerRef=useRef(null),pointerControllerRef=useRef(null),resourceRefs=useRef([]),lastHudTick=useRef(-1),renderAlphaRef=useRef(0);
  const [profileId,setProfileId]=useState(()=>abQa()?null:envProfile());
  const [ui,setUi]=useState({status:abQa()?'profile-select':'opening',message:lang==='vi'?'Đang mở trận và chuẩn bị tài nguyên…':'Opening battle and resources…',
    view:null,fps:null,fault:null});
  const [continuing,setContinuing]=useState(false);
  const [claiming,setClaiming]=useState(false);
  const [retryingClaim,setRetryingClaim]=useState(false);
  useEffect(()=>{
    if(!profileId)return undefined;
    let cancelled=false,unsubscribe=()=>{};const resourceAbort=new AbortController();
    setUi(value=>({...value,status:'opening',message:lang==='vi'?'Đang mở trận và chuẩn bị tài nguyên…':'Opening battle and resources…',fault:null}));
    const stopLoop=()=>{if(rafRef.current!==null){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
      renderAlphaRef.current=0;rendererRef.current?.clearPilotPreview?.();};
    const runFrame=now=>{rafRef.current=null;if(cancelled||!sessionRef.current||!inputRef.current||!pacerRef.current)return;
      try{const current=sessionRef.current.getView();if(!current||current.phase!=='active'){stopLoop();return;}
        const pacing=pacerRef.current.advance(now);renderAlphaRef.current=pacing.alpha;telemetryRef.current?.observeFramePacing(pacing);
        for(let step=0;step<pacing.steps;step++){
          const sampled=sampleC15ControlTick(inputRef.current);inputRef.current=sampled.state;
          telemetryRef.current?.observeTick(c15ControlIntentView(sampled.state));
          const advanced=sessionRef.current.advance(sampled.frame);rendererRef.current?.update(advanced.view.kernel);
          if(advanced.view.phase!=='active')break;
        }
        if(sessionRef.current?.getView().phase==='active'&&inputRef.current){
          rendererRef.current?.previewPilot(predictC15ControlRenderPosition(inputRef.current,pacing.alpha));
          rafRef.current=requestAnimationFrame(runFrame);
        }else stopLoop();
      }catch(error){stopLoop();setUi(value=>({...value,status:'error',fault:formatC15Rc1bFault(error,'C15_LOCAL_RUNTIME_ERROR')}));}};
    const startLoop=()=>{if(rafRef.current!==null||!sessionRef.current||!inputRef.current||!pacerRef.current)return;
      pacerRef.current.reset(performance.now());rafRef.current=requestAnimationFrame(runFrame);};
    const init=async()=>{
      const user=auth.currentUser;if(!user)throw new Error('C15 RC1B requires an authenticated account');
      const quality=(navigator.deviceMemory||0)>=6?'mobile-high':'mobile-low';
      const session=await openOrResumeC15Rc1bSession({uid:user.uid,quality,controlProfileId:profileId,
        resourceSignal:resourceAbort.signal,onResourceProgress:progress=>{if(cancelled)return;const total=Number(progress?.totalBytes||0),received=Number(progress?.receivedBytes||0);
          const percent=total>0?Math.max(0,Math.min(100,Math.round(received*100/total))):100;
          const message=progress?.phase==='ready'
            ?(lang==='vi'?'Tài nguyên đã sẵn sàng.':'Resources ready.')
            :(lang==='vi'?`Đang tải tài nguyên… ${percent}%`:`Downloading resources… ${percent}%`);
          setUi(old=>({...old,status:'opening',message}));},onChange:value=>{
        if(cancelled)return;rendererRef.current?.update(value.kernel);
        if(value.kernel.tick-lastHudTick.current>=5||value.phase!=='active'){
          lastHudTick.current=value.kernel.tick;setUi(old=>({...old,status:value.phase,view:value,message:null}));
        }
      }});
      if(cancelled){session.dispose();return;}sessionRef.current=session;
      const profile=session.getControlProfile();telemetryRef.current=createC15ControlTelemetry({profileId:profile.id});
      pacerRef.current=createC15FramePacer({simulationHz:profile.simulationHz||30,maxCatchUpSteps:3,maxFrameDeltaMs:100});
      const [backgroundResource,pilotResource,enemyAtlasResource]=await Promise.all([
        session.resolveResource('campaign-alpha-mobile-low','alpha_coast_low.webp'),
        session.resolveResource('campaign-alpha-mobile-low','ship_xwing_top.png'),
        session.resolveResource('campaign-alpha-mobile-low','p1_small_sheet.webp'),
      ]);
      resourceRefs.current=[backgroundResource,pilotResource,enemyAtlasResource].filter(Boolean);
      const renderer=await createC15LocalRenderer({canvas:canvasRef.current,backgroundUrl:backgroundResource?.url,
        pilotTextureUrl:pilotResource?.url,enemyAtlasUrl:enemyAtlasResource?.url,
        pilotResponseMs:profile.renderFollowMs,onFrame:metrics=>telemetryRef.current?.observePresentation(metrics),
        onMetrics:metrics=>{telemetryRef.current?.observePresentation(metrics);setUi(old=>({...old,fps:metrics.fps}));}});
      if(cancelled){renderer.dispose();return;}rendererRef.current=renderer;renderer.update(session.getView().kernel);
      const rect=canvasRef.current.getBoundingClientRect();inputRef.current=openC15ControlIntent(c15KernelInputConfig(session.getKernel(),{
        canvasWidth:Math.max(1,rect.width),canvasHeight:Math.max(1,rect.height),halfHeight:15}),{profileId:profile.id});
      telemetryRef.current.observeTick(c15ControlIntentView(inputRef.current));
      pointerControllerRef.current=createC15PointerController({element:canvasRef.current,
        onDelta:delta=>{if(!inputRef.current)return;try{inputRef.current=addC15PointerDelta(inputRef.current,{deltaX:delta.deltaX,deltaY:delta.deltaY});
            const view=c15ControlIntentView(inputRef.current);telemetryRef.current?.markTarget(view);
            rendererRef.current?.previewPilot(predictC15ControlRenderPosition(inputRef.current,renderAlphaRef.current));}catch(_){}},
        onRelease:()=>{try{if(inputRef.current)inputRef.current=releaseC15ControlTarget(inputRef.current);}catch(_){}},
        onCancel:()=>{try{if(inputRef.current)inputRef.current=cancelC15ControlTarget(inputRef.current);}catch(_){}},
        onMetric:name=>telemetryRef.current?.recordPointerEvent(name)});
      unsubscribe=session.subscribe(value=>{if(cancelled)return;renderer.update(value.kernel);
        if(value.kernel.tick-lastHudTick.current>=5||value.phase!=='active'){
          lastHudTick.current=value.kernel.tick;setUi(old=>({...old,status:value.phase,view:value,message:null}));}
        if(value.phase==='active')startLoop();else stopLoop();});
      startLoop();
    };
    init().catch(error=>{if(!cancelled)setUi(value=>({...value,status:'error',fault:formatC15Rc1bFault(error,'C15_RC1B_OPEN_FAILED')}));});
    const resize=()=>{rendererRef.current?.resize();if(!inputRef.current||!canvasRef.current)return;try{const rect=canvasRef.current.getBoundingClientRect();
      const controlView=c15ControlIntentView(inputRef.current);inputRef.current=reconfigureC15ControlViewport(inputRef.current,{
        aspect:rect.width/Math.max(1,rect.height),canvasWidth:Math.max(1,rect.width),canvasHeight:Math.max(1,rect.height),
        halfHeight:15,speedMultiplier:controlView.speedMultiplier});}catch(_){}};
    const visibility=()=>{if(document.hidden){pointerControllerRef.current?.cancel('visibility-hidden');stopLoop();
        try{if(inputRef.current)inputRef.current=cancelC15ControlTarget(inputRef.current);}catch(_){}
        void sessionRef.current?.suspend();}
      else if(sessionRef.current?.getView().phase==='active')startLoop();};
    const online=()=>{void sessionRef.current?.retryNetwork().catch(()=>{});};
    window.addEventListener('resize',resize);window.addEventListener('online',online);document.addEventListener('visibilitychange',visibility);
    return()=>{cancelled=true;resourceAbort.abort();stopLoop();pointerControllerRef.current?.dispose();pointerControllerRef.current=null;unsubscribe();
      window.removeEventListener('resize',resize);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visibility);
      const session=sessionRef.current;sessionRef.current=null;inputRef.current=null;pacerRef.current=null;telemetryRef.current=null;
      if(session)void session.suspend().catch(()=>{}).finally(()=>session.dispose());
      rendererRef.current?.dispose();rendererRef.current=null;for(const resource of resourceRefs.current){try{resource?.revoke?.();}catch(_){}}resourceRefs.current=[];};
  },[lang,profileId]);
  const retreat=async()=>{try{await sessionRef.current?.abandon();setScreen('stage_select');}catch(error){toast.error(error?.message||'Retreat failed');}};
  const retry=()=>{void sessionRef.current?.retryNetwork().catch(error=>toast.error(error?.message||'Verification retry failed'));};
  const continueVerified=async()=>{if(continuing)return;setContinuing(true);try{
      await sessionRef.current?.completeVerified();setScreen('stage_select');
    }catch(error){setContinuing(false);toast.error(error?.message||'Unable to close verified battle');}};
  const claimVerifiedReward=async()=>{if(claiming||retryingClaim)return;setClaiming(true);try{
      const response=await sessionRef.current?.claimVerifiedReward();
      try{await refreshCloudProfile();}
      catch(_refreshError){toast.error(lang==='vi'?'Đã cấp thưởng nhưng chưa thể làm mới hồ sơ. Hãy mở lại HQ.':'Reward settled, but profile refresh failed. Reopen HQ.');}
      toast.success(response?.duplicate
        ?(lang==='vi'?'Phần thưởng đã được quyết toán trước đó.':'Reward already settled')
        :(lang==='vi'?'Phần thưởng đã được xác minh và quyết toán.':'Verified reward settled'));
    }catch(error){toast.error(error?.message||'Unable to settle verified reward');}finally{setClaiming(false);}};
  const retryDuplicateClaim=async()=>{if(claiming||retryingClaim)return;setRetryingClaim(true);try{
      const response=await sessionRef.current?.retryVerifiedRewardClaim();
      try{await refreshCloudProfile();}catch(_refreshError){}
      toast.success(response?.duplicate
        ?(lang==='vi'?'Đã xác nhận claim trùng: không cộng thưởng lần hai.':'Duplicate claim verified: no second reward')
        :(lang==='vi'?'Phản hồi duplicate không hợp lệ.':'Duplicate response invalid'));
    }catch(error){toast.error(error?.message||'Unable to verify duplicate claim');}finally{setRetryingClaim(false);}};
  const exportTelemetry=async()=>{try{const report=telemetryRef.current?.report();if(!report)throw new Error('No control telemetry yet');
      await navigator.clipboard.writeText(JSON.stringify(report,null,2));toast.success('Đã sao chép Control Feel JSON');
    }catch(error){toast.error(error?.message||'Không thể xuất Control Feel JSON');}};
  const k=ui.view?.kernel,t=ui.view?.transport,profile=ui.view?.controlProfile,settlement=ui.view?.settlement;
  const hpRatio=k?Math.max(0,Math.min(1,Number(k.hp||0)/Math.max(1,Number(k.maxHp||1)))):1;
  const boss=Array.isArray(k?.enemies)?k.enemies.find(enemy=>enemy.kind==='boss'&&Number(enemy.maxHp)>0):null;
  const bossRatio=boss?Math.max(0,Math.min(1,Number(boss.hp||0)/Number(boss.maxHp))):0;
  const vi=lang==='vi';
  return <div style={surface}>
    <canvas ref={canvasRef} tabIndex={-1} style={{width:'100%',height:'100%',display:'block',touchAction:'none',overscrollBehavior:'none',
      userSelect:'none',WebkitUserSelect:'none',WebkitTouchCallout:'none'}}/>
    <header className={styles.hud} aria-label={vi?'Thông tin trận chiến':'Battle status'}>
      <div className={styles.hudTop}>
        <div className={styles.mode}>
          <span className={styles.modeLabel}>{vi?'Chiến dịch Alpha':'Alpha Campaign'}</span>
          <span className={styles.modeSub}>{vi?'Màn 01 · Đã xác minh':'Stage 01 · Verified battle'}</span>
        </div>
        <div className={styles.wave}>
          <small>{vi?'Đợt':'Wave'}</small>
          <strong>{k?.wave||1}/{k?.wavesTotal||5}</strong>
        </div>
      </div>
      <div className={styles.hp}>
        <span className={styles.hpTitle}>{vi?'GIÁP':'ARMOR'}</span>
        <div className={styles.hpBlocks} role="meter" aria-label={vi?'Giáp còn lại':'Remaining armor'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hpRatio*100)}>
          {Array.from({length:10},(_,i)=><div key={i} aria-hidden="true"
            className={`${styles.hpSegment} ${hpRatio*10>i?styles.hpSegmentOn:''}`}/>)}
        </div>
        <span className={styles.hpValue}>{k?`${Math.max(0,Math.round(k.hp))}/${Math.round(k.maxHp)}`:'--/--'}</span>
      </div>
      <div className={styles.hudStats}>
        <span className={styles.stat}>{vi?'HẠ GỤC':'KILLS'} <strong>{k?.kills||0}</strong></span>
        {releaseChannel.showDiagnosticHud&&ui.fps&&<span className={styles.stat}>{ui.fps} FPS</span>}
        {releaseChannel.showDiagnosticHud&&t&&<span className={styles.stat}>UPLOAD {t.summary.uploadedThroughTick}/{t.summary.ticks}{t.online?'':' · OFFLINE'}</span>}
        {releaseChannel.qaControls&&profile&&<span className={styles.stat}>{profile.id}</span>}
        {releaseChannel.qaControls&&<span className={styles.stat}>{rc7Enabled()?'C15 RC7':rc5Enabled()?'C15 RC5':'C15 QA'}</span>}
      </div>
      {boss&&<div className={styles.boss}><span className={styles.bossLabel}>BOSS</span>
        <div className={styles.bossRail}><div className={styles.bossFill} style={{width:`${bossRatio*100}%`}}/></div></div>}
    </header>
    <button onClick={retreat} className={styles.retreat}>◀ {vi?'RÚT LUI':'RETREAT'}</button>
    {releaseChannel.showControlExport&&profile&&<button onClick={exportTelemetry} style={{position:'absolute',right:14,
      bottom:'calc(env(safe-area-inset-bottom) + 15px)',zIndex:8,padding:'9px 12px',borderRadius:7,
      border:'1px solid #5de8ff',background:'rgba(0,0,0,.65)',color:'#bdf9ff'}}>CONTROL JSON</button>}
    {releaseChannel.qaControls&&profileId===null&&<div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.panelTitle}>RC1C CONTROL A/B</div>
        <span className={styles.panelSub}>{vi?'Chọn profile điều khiển kiểm thử.':'Choose QA control profile.'}</span>
        <button className={styles.resultButton} onClick={()=>setProfileId(C15_CURRENT_CONTROL_PROFILE_ID)}>A · CURRENT BALANCED</button>
        <button className={`${styles.resultButton} ${styles.resultButtonSecondary}`} onClick={()=>setProfileId(C15_LEGACY_ARCADE_CONTROL_PROFILE_ID)}>B · ARCADE RESPONSIVE V1</button>
      </div>
    </div>}
    {profileId!==null&&['opening','verifying','provisional-terminal','verified','error'].includes(ui.status)&&
      <div className={styles.overlay}>
        <section className={styles.panel} role="status" aria-live="polite">
          <div className={styles.panelAccent}/>
          {ui.status==='opening'&&<><div className={styles.panelTitle}>{vi?'Đang chuẩn bị trận':'Preparing battle'}</div>
            <span className={styles.panelSub}>{ui.message}</span></>}
          {ui.status==='verifying'&&<><div className={styles.panelTitle}>{vi?'Đang xác minh':'Verifying battle'}</div>
            <span className={styles.panelSub}>{vi?'Đang tải journal và replay độc lập trên server…':'Uploading journal and verifying server replay…'}</span></>}
          {ui.status==='provisional-terminal'&&<>
            <div className={styles.panelTitle}>{k?.provisionalPhase==='local-clear'?'LOCAL CLEAR':'LOCAL DEFEAT'}</div>
            <span className={styles.panelSub}>{vi?'Kết quả tạm thời; cần mạng để server xác minh.':'Provisional result; network is required for server verification.'}</span>
            <button className={styles.resultButton} onClick={retry}>RETRY VERIFY</button></>}
          {ui.status==='verified'&&<>
            <div className={styles.panelTitle}>{ui.view?.result?.phase==='rc1-verified-clear'
              ?(vi?'CHIẾN THẮNG ĐƯỢC XÁC MINH':'SERVER VERIFIED CLEAR')
              :(vi?'THẤT BẠI ĐƯỢC XÁC MINH':'SERVER VERIFIED DEFEAT')}</div>
            {ui.view?.outcome&&<div className={styles.panelSub}>{releaseChannel.qaControls?'RC2 SIGNED OUTCOME':'SERVER RESULT VERIFIED'}
              {releaseChannel.showDigestPrefixes&&<div className={styles.qa}>{ui.view.outcome.outcomeDigest.slice(0,16)}…</div>}</div>}
            {settlement?<>
              <div className={styles.resultMetrics}>{releaseChannel.qaControls?'RC3 SETTLEMENT VERIFIED':'REWARD RECEIVED'}
                <div>+{settlement.receipt.coins} coins · +{settlement.receipt.experience} XP · +{settlement.receipt.stars} star</div></div>
              {releaseChannel.showDigestPrefixes&&<span className={styles.qa}>{settlement.receipt.receiptDigest.slice(0,16)}…</span>}
              {releaseChannel.qaControls&&settlement.duplicate===true&&<span className={styles.qa}>DUPLICATE CLAIM VERIFIED · NO SECOND REWARD</span>}
              {releaseChannel.showDuplicateButton&&<button className={styles.resultButton} disabled={claiming||retryingClaim}
                onClick={retryDuplicateClaim}>{retryingClaim?'RETRYING…':'CHECK DUPLICATE CLAIM'}</button>}
            </>:rc3Enabled()?<>
              <button className={styles.resultButton} disabled={claiming} onClick={claimVerifiedReward}>
                {claiming?'CLAIMING…':(releaseChannel.qaControls?'CLAIM VERIFIED REWARD':'RECEIVE REWARD')}</button>
              {releaseChannel.qaControls&&<span className={styles.qa}>{vi?'Chỉ staging allowlist; production rewards vẫn tắt.':'Staging allowlist only; production rewards remain off.'}</span>}
            </>:<span className={styles.panelSub}>{releaseChannel.production
              ?(vi?'Phần thưởng trực tuyến hiện đang tạm khóa.':'Online rewards are currently unavailable.')
              :(vi?'Ứng viên phát hành chưa bật cấp thưởng.':'Release candidate rewards are not enabled.')}</span>}
            <button className={`${styles.resultButton} ${styles.resultButtonSecondary}`} disabled={continuing||claiming||retryingClaim}
              onClick={continueVerified}>{continuing?'CLOSING…':(vi?'TIẾP TỤC':'CONTINUE')}</button>
          </>}
          {ui.status==='error'&&<><div className={styles.panelTitle}>{releaseChannel.qaControls
            ?(rc3Enabled()?'RC3 ERROR':'RC1C ERROR'):(vi?'Lỗi trận chiến':'Battle error')}</div>
            <span className={styles.errorText}>{ui.fault}</span></>}
        </section>
      </div>}
  </div>;
}
