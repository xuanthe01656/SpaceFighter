import React,{useEffect,useRef,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {getSharedResourceDownloadCoordinator,rc7StartupDownloadEnabled}
  from '../../game/assets/ResourceDownloadCoordinatorV1.js';
import styles from './ResourceDownloads.module.css';
import GameButton from '../../ui-system/GameButton.jsx';
import GamePanel from '../../ui-system/GamePanel.jsx';

const shouldRun=()=>rc7StartupDownloadEnabled()&&Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
const progressInitial={receivedBytes:0,totalBytes:0,phase:'checking'};
const formatBytes=value=>{
  const bytes=Math.max(0,Number(value||0));
  if(bytes<1024)return `${Math.round(bytes)} B`;
  if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KiB`;
  return `${(bytes/1048576).toFixed(2)} MiB`;
};
function DownloadSymbol(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>
</svg>;}
function ShieldSymbol(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M12 2l8 4v6c0 5-3.3 8.2-8 10-4.7-1.8-8-5-8-10V6l8-4z"/><path d="M8.5 12l2.5 2.5L16 9"/>
</svg>;}
export default function StartupResourceGate({lang='vi'}){
  const [state,setState]=useState(()=>({status:shouldRun()?'checking':'ready',progress:progressInitial,error:''}));
  const controller=useRef(null),runId=useRef(0);
  const enabled=shouldRun();
  const start=()=>{
    if(!enabled||controller.current)return;
    const abort=new AbortController();controller.current=abort;const id=++runId.current;
    setState({status:'checking',progress:progressInitial,error:''});
    (async()=>{
      const coordinator=await getSharedResourceDownloadCoordinator();
      if(abort.signal.aborted)throw Object.assign(new Error('Paused'),{name:'AbortError'});
      setState(old=>({...old,status:'downloading'}));
      await coordinator.ensureStartup({signal:abort.signal,onProgress:progress=>{
        if(abort.signal.aborted||runId.current!==id)return;
        setState(old=>({...old,status:'downloading',progress}));
      }});
      if(runId.current===id&&!abort.signal.aborted)setState(old=>({...old,status:'ready'}));
    })().catch(error=>{
      if(runId.current!==id)return;
      if(abort.signal.aborted||error?.name==='AbortError')setState(old=>({...old,status:'paused',error:''}));
      else setState(old=>({...old,status:'error',error:String(error?.message||error)}));
    }).finally(()=>{if(controller.current===abort)controller.current=null;});
  };
  useEffect(()=>{
    if(enabled)start();
    return()=>{runId.current++;controller.current?.abort();controller.current=null;};
  },[enabled]);
  if(!enabled||state.status==='ready')return null;
  const vi=lang==='vi',progress=state.progress||progressInitial;
  const received=Math.max(0,Number(progress.receivedBytes||0));
  const total=Math.max(0,Number(progress.totalBytes||0));
  const percent=total>0?Math.min(100,Math.round(received/total*100)):(progress.phase==='ready'?100:0);
  const loading=state.status==='checking'||state.status==='downloading';
  const phaseLabel=state.status==='checking'?(vi?'Đang đối chiếu dữ liệu':'Checking files'):
    state.status==='paused'?(vi?'Đã tạm dừng':'Paused'):
    state.status==='error'?(vi?'Cần thử lại':'Retry required'):
    progress.phase==='ready'?(vi?'Đang kích hoạt':'Activating'):(vi?'Đang tải và xác minh':'Downloading and verifying');
  return <div className={styles.fullScreen} role="dialog" aria-modal="true" aria-label={vi?'Chuẩn bị tài nguyên trò chơi':'Preparing game resources'}>
    <GamePanel as="section" variant="modal" className={styles.card} aria-live="polite">
      <span className={styles.eyebrow}>SF / SYSTEM BOOT · CONTENT DELIVERY</span>
      <div className={styles.heroArt} aria-hidden="true"><div className={styles.orbit}/><div className={styles.orbitGlyph}><DownloadSymbol/></div></div>
      <div>
        <div className={styles.brand}>SPACEFIGHTER</div>
        <h1 className={styles.subheading} style={{marginTop:12}}>{vi?'Chuẩn bị dữ liệu trò chơi':'Preparing game content'}</h1>
        <p className={styles.note} style={{marginTop:9}}>{vi
          ?'Tài nguyên bắt buộc được kiểm tra SHA-256 và lưu trong bộ nhớ riêng của thiết bị.'
          :'Essential content is SHA-256 verified and saved in private device storage.'}</p>
      </div>
      <div className={styles.progressGroup}>
        <div className={styles.metricRow}><span>{phaseLabel}</span><span className={styles.metricValue}>{percent}%</span></div>
        <div className={styles.progress} role="progressbar" aria-label={vi?'Tiến độ tải tài nguyên':'Resource download progress'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className={styles.progressFill} style={{width:`${percent}%`}}/>
        </div>
        <div className={styles.metricRow}><span>{vi?'Dữ liệu đã nhận':'Transferred'}</span>
          <span className={styles.metricValue}>{total>0?`${formatBytes(received)} / ${formatBytes(total)}`:(vi?'Đang kiểm tra':'Checking')}</span></div>
      </div>
      {state.error&&<div className={styles.error} role="alert">{state.error}</div>}
      <div className={styles.actionBar}>
        {loading&&<GameButton variant="ghost" wide
          onClick={()=>controller.current?.abort()}>{vi?'Tạm dừng':'Pause'}</GameButton>}
        {(state.status==='error'||state.status==='paused')&&<GameButton variant="primary" wide
          onClick={start}>{vi?'Tiếp tục / Thử lại':'Resume / Retry'}</GameButton>}
      </div>
      <div className={styles.securityNote}><ShieldSymbol/><span>{vi
        ?'Tải lại chỉ khi thiếu hoặc sai dữ liệu. Nội dung đã xác minh được sử dụng lại khi có thể.'
        :'Verified files are reused; only missing or invalid content is fetched again.'}</span></div>
    </GamePanel>
  </div>;
}
