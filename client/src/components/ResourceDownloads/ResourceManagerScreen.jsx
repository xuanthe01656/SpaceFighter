import React,{useEffect,useRef,useState} from 'react';
import {getSharedResourceDownloadCoordinator} from '../../game/assets/ResourceDownloadCoordinatorV1.js';
import styles from './ResourceDownloads.module.css';

const mb=value=>(Math.max(0,Number(value||0))/1048576).toFixed(2);
export default function ResourceManagerScreen({setScreen,lang='vi'}){
  const vi=lang==='vi';
  const [state,setState]=useState({status:'loading',packs:[],progress:null,error:''});
  const current=useRef(null),mounted=useRef(true);
  const refresh=async()=>{
    const coordinator=await getSharedResourceDownloadCoordinator();
    const packs=await coordinator.listContent();
    if(mounted.current)setState(old=>({...old,status:'ready',packs,error:''}));
  };
  useEffect(()=>{
    mounted.current=true;refresh().catch(error=>{
      if(mounted.current)setState(old=>({...old,status:'error',error:String(error?.message||error)}));
    });
    return()=>{mounted.current=false;current.current?.abort();current.current=null;};
  },[]);
  const start=async()=>{
    if(current.current)return;
    const abort=new AbortController();current.current=abort;
    setState(old=>({...old,status:'downloading',error:'',progress:null}));
    try{
      const coordinator=await getSharedResourceDownloadCoordinator();
      if(abort.signal.aborted)return;
      await coordinator.downloadCampaignAlpha({signal:abort.signal,onProgress:progress=>{
        if(mounted.current&&!abort.signal.aborted)setState(old=>({...old,progress}));
      }});
      if(mounted.current&&!abort.signal.aborted)await refresh();
    }catch(error){
      if(mounted.current)setState(old=>({...old,status:abort.signal.aborted?'paused':'error',
        error:abort.signal.aborted?'':String(error?.message||error)}));
    }finally{if(current.current===abort)current.current=null;}
  };
  const remove=async()=>{
    if(current.current)return;
    setState(old=>({...old,status:'removing',error:''}));
    try{
      const coordinator=await getSharedResourceDownloadCoordinator();
      await coordinator.removeCampaignAlpha();
      await refresh();
    }catch(error){if(mounted.current)setState(old=>({...old,status:'error',error:String(error?.message||error)}));}
  };
  const busy=['loading','downloading','removing'].includes(state.status);
  const p=state.progress;
  const percent=p?.totalBytes>0?Math.min(100,Math.round(p.receivedBytes/p.totalBytes*100)):0;
  return <main className={styles.manager}>
    <div className={styles.managerBody}>
      <header>
        <h1 className={styles.header}>{vi?'QUẢN LÝ TÀI NGUYÊN':'RESOURCE MANAGER'}</h1>
        <p className={styles.note}>{vi?'Các gói tải về nằm trong bộ nhớ riêng của ứng dụng.':'Downloads are stored privately on this device.'}</p>
      </header>
      <div className={styles.actionBar}>
        <button className={styles.btn} disabled={busy} onClick={()=>setScreen('campaign_portal')}>
          {vi?'◀ TRỞ VỀ':'◀ BACK'}</button>
        <button className={styles.btn} disabled={busy} onClick={()=>{
          setState(old=>({...old,status:'loading',error:''}));refresh().catch(error=>setState(old=>({...old,status:'error',error:String(error?.message||error)})));
        }}>{vi?'LÀM MỚI':'REFRESH'}</button>
      </div>
      {state.error&&<div className={styles.error} role="alert">{state.error}</div>}
      {state.packs.map(pack=><section key={pack.id} className={styles.pack}>
        <div className={styles.packTitle}>{vi?pack.labelVi:pack.labelEn}</div>
        <div className={styles.information}><span>{mb(pack.sizeBytes)} MiB</span>
          <span className={styles.status}>{pack.installed?(vi?'Đã tải':'Installed'):(vi?'Chưa tải':'Not installed')}</span></div>
        <p className={styles.note}>{pack.requiredAtStartup
          ?(vi?'Bắt buộc để khởi động. Không thể xóa.':'Required for launch. Cannot be removed.')
          :(vi?'Tải trước để vào Alpha Stage 1; game cũng có thể tải khi bắt đầu trận.':'Pre-download for Alpha Stage 1, or download on demand.')}</p>
        {pack.removable&&<div className={styles.actionBar}>
          {!pack.installed&&<button className={styles.btn} disabled={busy} onClick={start}>
            {vi?'TẢI / TIẾP TỤC':'DOWNLOAD / RESUME'}</button>}
          {pack.installed&&<button className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={remove}>
            {vi?'XÓA GÓI ĐÃ TẢI':'REMOVE DOWNLOADED PACK'}</button>}
        </div>}
      </section>)}
      {state.status==='downloading'&&<section className={styles.pack}>
        <div className={styles.information}><span>{vi?'ĐANG TẢI':'DOWNLOADING'}</span><span>{percent}%</span></div>
        <div className={styles.progress} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.progressFill} style={{width:`${percent}%`}} /></div>
        <p className={styles.note}>{mb(p?.receivedBytes)} / {mb(p?.totalBytes)} MiB</p>
        <button className={styles.btn} onClick={()=>current.current?.abort()}>{vi?'TẠM DỪNG':'PAUSE'}</button>
      </section>}
      {state.status==='paused'&&<p className={styles.note}>{vi?'Đã tạm dừng. Dữ liệu tải dở sẽ được giữ lại để tiếp tục.':'Paused. Partial downloads are retained for resume.'}</p>}
      <section className={styles.pack}>
        <div className={styles.packTitle}>{vi?'Nội dung tương lai':'Future content'}</div>
        <p className={styles.note}>{vi?'Dungeon, HD GLB và audio bổ sung chưa có pack phát hành trên server; chưa thể tải.':'Dungeon, HD models and extra audio do not yet have released server packs.'}</p>
      </section>
    </div>
  </main>;
}
