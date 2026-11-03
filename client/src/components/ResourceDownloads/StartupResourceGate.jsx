import React,{useEffect,useRef,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {getSharedResourceDownloadCoordinator,rc7StartupDownloadEnabled}
  from '../../game/assets/ResourceDownloadCoordinatorV1.js';
import styles from './ResourceDownloads.module.css';

const shouldRun=()=>rc7StartupDownloadEnabled()&&Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
const mb=value=>(Math.max(0,Number(value||0))/1048576).toFixed(2);
const progressInitial={receivedBytes:0,totalBytes:0,phase:'checking'};

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
      if(abort.signal.aborted)return;
      setState(old=>({...old,status:'downloading'}));
      await coordinator.ensureStartup({signal:abort.signal,onProgress:progress=>{
        if(abort.signal.aborted||runId.current!==id)return;
        setState(old=>({...old,status:'downloading',progress}));
      }});
      if(runId.current===id&&!abort.signal.aborted)setState(old=>({...old,status:'ready'}));
    })().catch(error=>{
      if(runId.current!==id)return;
      if(abort.signal.aborted||error?.name==='AbortError'){
        setState(old=>({...old,status:'paused',error:''}));
      }else setState(old=>({...old,status:'error',error:String(error?.message||error)}));
    }).finally(()=>{if(controller.current===abort)controller.current=null;});
  };
  useEffect(()=>{
    if(enabled)start();
    return()=>{runId.current++;controller.current?.abort();controller.current=null;};
    // The RC7 feature flag is a build-time constant, not a runtime toggle.
  },[enabled]);
  if(!enabled||state.status==='ready')return null;
  const isVi=lang==='vi',progress=state.progress||progressInitial;
  const received=Math.max(0,Number(progress.receivedBytes||0));
  const total=Math.max(0,Number(progress.totalBytes||0));
  const percent=total>0?Math.min(100,Math.round(received/total*100)):(progress.phase==='ready'?100:0);
  const loading=state.status==='checking'||state.status==='downloading';
  return <div className={styles.fullScreen} role="dialog" aria-modal="true" aria-label="Game resources">
    <section className={styles.card}>
      <h1 className={styles.header}>SPACEFIGHTER</h1>
      <p className={styles.subheading}>{isVi?'CHUẨN BỊ TÀI NGUYÊN':'PREPARING RESOURCES'}</p>
      <p className={styles.note}>{isVi
        ?'Đang kiểm tra và tải gói cơ bản có xác minh SHA-256. Lần mở tiếp theo sẽ sử dụng dữ liệu đã lưu.'
        :'Checking and downloading verified core resources. Cached content will be reused on the next launch.'}</p>
      <div className={styles.progress} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.progressFill} style={{width:`${percent}%`}} />
      </div>
      <div className={styles.information}><span>{state.status==='checking'?(isVi?'Đang kiểm tra...':'Checking...')
        :`${mb(received)} / ${mb(total)} MiB`}</span><span>{percent}%</span></div>
      {state.error&&<div className={styles.error} role="alert">{state.error}</div>}
      <div className={styles.actionBar}>
        {loading&&<button type="button" className={styles.btn} onClick={()=>controller.current?.abort()}>
          {isVi?'TẠM DỪNG':'PAUSE'}</button>}
        {(state.status==='error'||state.status==='paused')&&<button type="button" className={styles.btn}
          onClick={start}>{isVi?'TIẾP TỤC / THỬ LẠI':'RESUME / RETRY'}</button>}
      </div>
      <p className={styles.note}>{isVi
        ?'Lần đầu cần mạng. Nếu đã tải đầy đủ, game có thể dùng gói đã cache khi mất kết nối.'
        :'Internet is needed on first launch. Verified cached packs can be used offline.'}</p>
    </section>
  </div>;
}
