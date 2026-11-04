import React,{useEffect,useRef,useState} from 'react';
import {getSharedResourceDownloadCoordinator} from '../../game/assets/ResourceDownloadCoordinatorV1.js';
import styles from './ResourceDownloads.module.css';
import GameButton from '../../ui-system/GameButton.jsx';
import GamePanel from '../../ui-system/GamePanel.jsx';

const formatBytes=value=>{
  const bytes=Math.max(0,Number(value||0));
  if(bytes<1024)return `${Math.round(bytes)} B`;
  if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KiB`;
  return `${(bytes/1048576).toFixed(2)} MiB`;
};
function Symbol({kind}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind==='core'?<><path d="m12 2 8 4v6c0 5-3.3 8.2-8 10-4.7-1.8-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/></>:
    kind==='campaign'?<><path d="M3 5h18v14H3zM7 2v6m10-6v6M8 12h8m-8 4h5"/></>:
    kind==='back'?<path d="m15 18-6-6 6-6"/>:
    kind==='refresh'?<><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/></>:
    kind==='lock'?<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>:
    <><path d="M12 4v10m-4-4 4 4 4-4"/><path d="M4 17v3h16v-3"/></>}
</svg>;}
const futureItems=[['DUNGEON','Dungeon'],['HIGH DEFINITION','HD / GLB'],['SOUND PACK','Audio']];
export default function ResourceManagerScreen({setScreen,lang='vi'}){
  const vi=lang==='vi';
  const [state,setState]=useState({status:'loading',packs:[],progress:null,error:''});
  const [removeConfirm,setRemoveConfirm]=useState(false);
  const [online,setOnline]=useState(()=>typeof navigator==='undefined'?true:navigator.onLine!==false);
  const current=useRef(null),mounted=useRef(true);
  const refresh=async()=>{
    const coordinator=await getSharedResourceDownloadCoordinator();
    const packs=await coordinator.listContent();
    if(mounted.current)setState(old=>({...old,status:'ready',packs,error:''}));
  };
  useEffect(()=>{
    mounted.current=true;
    const updateOnline=()=>setOnline(navigator.onLine!==false);
    window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline);
    refresh().catch(error=>{if(mounted.current)setState(old=>({...old,status:'error',error:String(error?.message||error)}));});
    return()=>{mounted.current=false;current.current?.abort();current.current=null;
      window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline);};
  },[]);
  const start=async()=>{
    if(current.current)return;
    const abort=new AbortController();current.current=abort;
    setState(old=>({...old,status:'downloading',error:'',progress:null}));
    try{
      const coordinator=await getSharedResourceDownloadCoordinator();
      if(abort.signal.aborted)throw Object.assign(new Error('Paused'),{name:'AbortError'});
      await coordinator.downloadCampaignAlpha({signal:abort.signal,onProgress:progress=>{
        if(mounted.current&&!abort.signal.aborted)setState(old=>({...old,progress}));
      }});
      if(abort.signal.aborted)throw Object.assign(new Error('Paused'),{name:'AbortError'});
      if(mounted.current)await refresh();
    }catch(error){
      if(mounted.current)setState(old=>({...old,status:abort.signal.aborted?'paused':'error',
        error:abort.signal.aborted?'':String(error?.message||error)}));
    }finally{if(current.current===abort)current.current=null;}
  };
  const remove=async()=>{
    if(current.current)return;
    setRemoveConfirm(false);setState(old=>({...old,status:'removing',error:''}));
    try{
      const coordinator=await getSharedResourceDownloadCoordinator();
      await coordinator.removeCampaignAlpha();
      await refresh();
    }catch(error){if(mounted.current)setState(old=>({...old,status:'error',error:String(error?.message||error)}));}
  };
  const busy=['loading','downloading','removing'].includes(state.status);
  const p=state.progress;
  const percent=p?.totalBytes>0?Math.min(100,Math.round(p.receivedBytes/p.totalBytes*100)):0;
  const ready=state.packs.filter(pack=>pack.installed);
  const installedBytes=ready.reduce((total,pack)=>total+Math.max(0,Number(pack.sizeBytes||0)),0);
  return <main className={styles.manager}>
    <div className={styles.managerBody}>
      <nav className={styles.managerNav} aria-label={vi?'Điều hướng tải tài nguyên':'Content navigation'}>
        <GameButton variant="ghost" disabled={busy} onClick={()=>setScreen('campaign_portal')}>
          <Symbol kind="back"/>{vi?'Trở về':'Back'}</GameButton>
        <GameButton variant="ghost" disabled={busy} onClick={()=>{
          setRemoveConfirm(false);setState(old=>({...old,status:'loading',error:''}));
          refresh().catch(error=>{if(mounted.current)setState(old=>({...old,status:'error',error:String(error?.message||error)}));});
        }}><Symbol kind="refresh"/>{vi?'Làm mới':'Refresh'}</GameButton>
      </nav>
      <header className={styles.managerHero}>
        <span className={styles.eyebrow}>SPACEFIGHTER / CONTENT HUB</span>
        <h1 className={styles.header} style={{marginTop:10}}>{vi?'Kho tài nguyên':'Game resources'}</h1>
        <p className={styles.managerSubtitle}>{vi
          ?'Quản lý dữ liệu đã xác minh trên thiết bị. Tải trước màn chơi để giảm thời gian chờ khi vào trận.'
          :'Manage verified game files on your device. Preload content before starting a battle.'}</p>
        <div className={styles.summaryRow}>
          <div className={styles.summary}><strong className={styles.summaryNumber}>{ready.length} / {state.packs.length}</strong>
            <span className={styles.summaryLabel}>{vi?'Gói đã cài':'Installed packs'}</span></div>
          <div className={styles.summary}><strong className={styles.summaryNumber}>{formatBytes(installedBytes)}</strong>
            <span className={styles.summaryLabel}>{vi?'Tài nguyên đã tải':'Downloaded content'}</span></div>
        </div>
      </header>
      <div className={styles.metricRow} aria-live="polite"><span>{vi?'NỘI DUNG HIỆN CÓ':'AVAILABLE CONTENT'}</span>
        <span className={styles.metricValue}>{online?(vi?'Đã kết nối':'Online'):(vi?'Ngoại tuyến':'Offline')}</span></div>
      {state.error&&<div className={styles.error} role="alert">{state.error}</div>}
      {state.packs.map(pack=>{
        const isAlpha=pack.id==='campaign-alpha-mobile-low';
        const downloading=isAlpha&&state.status==='downloading';
        return <GamePanel as="section" variant="standard" key={pack.id} className={styles.pack}>
          <div className={styles.packTop}>
            <div className={styles.packSymbol}><Symbol kind={pack.removable?'campaign':'core'}/></div>
            <div className={styles.packHeading}><div className={styles.packTitle}>{vi?pack.labelVi:pack.labelEn}</div>
              <div className={styles.packCategory}>{pack.removable?'ALPHA / CONTENT PACK':'SYSTEM / REQUIRED'}</div></div>
          </div>
          <div className={styles.packMeta}>
            <span className={styles.packSize}>{formatBytes(pack.sizeBytes)}</span>
            <span className={`${styles.status} ${!pack.installed?styles.statusPending:''}`}>
              {pack.installed?(vi?'Đã cài đặt':'Installed'):(vi?'Chưa tải':'Not downloaded')}</span>
          </div>
          <p className={styles.packDescription}>{pack.requiredAtStartup
            ?(vi?'Dữ liệu bắt buộc để khởi động, được bảo vệ khỏi thao tác xóa.':'Required launch content; cannot be removed.')
            :(vi?'Có thể tải sẵn hoặc game tự tải khi bạn bắt đầu Alpha Stage 1.':'Optional preload; the game also fetches this pack when you start Alpha Stage 1.')}</p>
          {downloading&&<div className={styles.progressGroup}>
            <div className={styles.metricRow}><span>{vi?'Đang tải và kiểm tra':'Downloading and verifying'}</span>
              <span className={styles.metricValue}>{percent}%</span></div>
            <div className={styles.progress} role="progressbar" aria-label={vi?'Tiến độ tải Alpha':'Alpha pack progress'}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className={styles.progressFill} style={{width:`${percent}%`}}/></div>
            <div className={styles.metricRow}><span>{formatBytes(p?.receivedBytes)} / {formatBytes(p?.totalBytes)}</span></div>
          </div>}
          {pack.removable&&<div className={styles.actionBar}>
            {downloading?<GameButton variant="ghost" onClick={()=>current.current?.abort()}>
              {vi?'Tạm dừng':'Pause'}</GameButton>:
              pack.installed?<GameButton variant="danger" disabled={busy} onClick={()=>setRemoveConfirm(true)}>
                {vi?'Xóa gói đã tải':'Remove downloaded pack'}</GameButton>:
                <GameButton variant="primary" disabled={busy} onClick={start}>
                  <Symbol kind="download"/>{vi?'Tải tài nguyên':'Download pack'}</GameButton>}
          </div>}
          {pack.removable&&pack.installed&&removeConfirm&&<div className={styles.confirmation}>
            <p>{vi?'Xóa tài nguyên Alpha trên thiết bị? Game sẽ cần tải lại khi vào màn này.':'Remove Alpha resources from this device? You will need to download them again.'}</p>
            <GameButton variant="ghost" onClick={()=>setRemoveConfirm(false)}>{vi?'Hủy':'Cancel'}</GameButton>
            <GameButton variant="danger" onClick={remove}>{vi?'Xác nhận xóa':'Confirm removal'}</GameButton>
          </div>}
        </GamePanel>;
      })}
      {state.status==='paused'&&<p className={styles.note}>{vi
        ?'Đã tạm dừng. Phần dữ liệu tải dở được giữ lại để thử tiếp.'
        :'Paused. Partial files are kept for a later retry.'}</p>}
      <h2 className={styles.sectionHeading}>{vi?'Sắp ra mắt':'Coming later'}</h2>
      <section className={`${styles.pack} ${styles.future}`}>
        <div className={styles.packTop}><div className={styles.packSymbol}><Symbol kind="lock"/></div>
          <div className={styles.packHeading}><div className={styles.packTitle}>{vi?'Nội dung bổ sung':'Additional content'}</div>
            <div className={styles.packCategory}>FUTURE / NOT PUBLISHED</div></div></div>
        <div className={styles.actionBar}>{futureItems.map(([code,name])=><span key={code} className={`${styles.status} ${styles.statusUnavailable}`}>{name}</span>)}</div>
        <p className={styles.packDescription}>{vi
          ?'Các gói Dungeon, đồ họa HD và âm thanh chưa được phát hành trên máy chủ; chưa thể tải.'
          :'Dungeon, HD models and extra audio are not yet published on the server.'}</p>
      </section>
      <footer className={styles.footer}><div className={styles.securityNote} style={{borderTop:0,paddingTop:0}}>
        <Symbol kind="core"/><span>{vi
          ?'Mỗi file được xác minh kích thước và SHA-256 trước khi kích hoạt. Xóa nội dung tùy chọn không xóa tài khoản hoặc tiến trình trò chơi.'
          :'Files are size/SHA-256 checked before activation. Removing optional downloads never deletes your account or progress.'}</span>
      </div></footer>
    </div>
  </main>;
}
