import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { t } from './utils/translations';
import { AppUpdate } from '@capawesome/capacitor-app-update';
import { useAuth } from './hooks/useAuth';
import { loadCampaignEngine, loadDungeonEngine } from './game/routing/BattleScreenLoaders';

// Keep Portal eagerly loaded for fast first paint/login. Other screens are
// route-level chunks: Babylon is downloaded only when battle/map opens.
import Portal from './components/Portal';
const HQ = lazy(() => import('./components/HQ'));
const Pilots = lazy(() => import('./components/Pilots'));
const Inventory = lazy(() => import('./components/Inventory'));
const CampaignEngine = lazy(loadCampaignEngine);
const CloudQaAlpha1 = lazy(() => import('./components/CloudQaAlpha1'));
const StageSelect = lazy(() => import('./components/StageSelect'));
const CampaignPortal = lazy(() => import('./components/CampaignPortal'));
const ShopCampaign = lazy(() => import('./components/ShopCampaign'));
const GalaxyMap = lazy(() => import('./components/GalaxyMap'));
const Missions = lazy(() => import('./components/Missions'));
const DungeonSelect = lazy(() => import('./components/DungeonSelect'));
const DungeonEngine = lazy(loadDungeonEngine);
const DungeonResult = lazy(() => import('./components/DungeonResult'));
const Events = lazy(() => import('./components/Events'));

import { secureStorage } from './utils/storageHelper';
import { DEFAULT_CAMPAIGN_DATA } from './constants';

// A failed lazy chunk (offline, version mismatch, aborted download) must
// show an actionable UI instead of crashing into an empty WebView.
class ScreenLoadBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{
        minHeight: '100dvh', display: 'grid', placeContent: 'center',
        gap: '14px', padding: '24px', textAlign: 'center',
        background: '#020c1b', color: '#66fcf1',
        fontFamily: "'VT323', monospace", fontSize: '22px',
      }}>
        <span>{this.props.lang === 'vi'
          ? 'KHÔNG THỂ TẢI KHU VỰC. VUI LÒNG KIỂM TRA MẠNG.'
          : 'UNABLE TO LOAD THIS AREA. PLEASE CHECK YOUR CONNECTION.'}</span>
        <button type="button" onClick={() => window.location.reload()} style={{
          padding: '10px 20px', border: '1px solid #66fcf1',
          borderRadius: '6px', background: '#12223b', color: '#66fcf1',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '20px',
        }}>
          {this.props.lang === 'vi' ? 'TẢI LẠI' : 'RELOAD'}
        </button>
      </div>
    );
  }
}

export default function Game() {
  const [screen, setScreen] = useState('portal');
  const [lang, setLang] = useState(secureStorage.getItem('astro_lang') || 'vi');
  const [uiUpdates, setUIUpdates] = useState({ isVIP: false });

  const toggleLanguage = () => {
    const newLang = lang === 'vi' ? 'en' : 'vi';
    setLang(newLang);
    secureStorage.setItem('astro_lang', newLang);
  };
  
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // ==========================================
  // BẢN ĐỒNG BỘ GSREF MỚI NHẤT (Khớp 100% với DB Firestore mới)
  // ==========================================
  const gsRef = useRef({
    // Tài nguyên
    coins: 0,
    diamonds: 0,
    energy: 50,
    vipPoints: 0,
    
    // Tracking
    lastCoinDate: '',
    hourlyCoinCount: 0,
    lastCoinHour: '',
    
    // Hệ thống
    timeOffset: 0,
    deviceId: 'unknown',
    myName: 'Player',
    // Nạp sẵn Dữ liệu Chiến dịch để các component con load an toàn
    campaignData: JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN_DATA))
  });

  const getRealTime = () => Date.now() + (gsRef.current.timeOffset || 0);
  
  const { currentUser, loginWithGoogle, loginWithApple, logout, deleteAccount, saveUserProfile, gameAction, refreshCloudProfile, renamePlayer } = useAuth(
    gsRef, setUIUpdates, setScreen, langRef, getRealTime
  );
  
  // 1. KIỂM TRA BẢO MẬT THIẾT BỊ (Chống giả lập)
  useEffect(() => {
    const checkSecurity = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const info = await Device.getInfo(); 
          if (info.isVirtual) {
            toast.error(t[langRef.current]?.errEmulator || 'Emulator not allowed!');
            setTimeout(() => {
               window.location.href = "about:blank";
            }, 3000);
            return;
          }
          const idResult = await Device.getId();
          gsRef.current.deviceId = idResult.uuid;
        } catch (error) {
          console.error("Security Check Error:", error);
        }
      }
    };
    checkSecurity();
  }, []);

  // 2. KIỂM TRA CẬP NHẬT ỨNG DỤNG TỰ ĐỘNG
  useEffect(() => {
    const checkAppUpdate = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const result = await AppUpdate.getAppUpdateInfo();
          if (result.updateAvailability === 2) {
            console.log("Phát hiện bản cập nhật mới!");
            await AppUpdate.performImmediateUpdate();
          }
        } catch (error) {
          console.error("Lỗi khi kiểm tra bản cập nhật:", error);
        }
      }
    };
    checkAppUpdate();
  }, []);
 
  // 3. ĐỒNG BỘ GIỜ CHUẨN UTC (Chống hack đổi giờ điện thoại)
  useEffect(() => {
    const syncTime = async () => {
      const sources = [
        'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
        'https://worldclockapi.com/api/json/utc/now'             
      ];
      for (const url of sources) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) continue;        
          const data = await res.json();
          let timeString = data.dateTime || data.currentDateTime;       
          if (timeString && !timeString.endsWith('Z')) timeString += 'Z';
          
          const realTimeMs = new Date(timeString).getTime();        
          if (!isNaN(realTimeMs)) {
            gsRef.current.timeOffset = realTimeMs - Date.now(); 
            return; 
          }
        } catch (error) {
          console.warn(`Nguồn ${url} lỗi, đang thử nguồn tiếp theo...`);
        }
      } 
      gsRef.current.timeOffset = 0; 
    };
    syncTime();
  }, []);

  // ===============================================
  // QUẢN LÝ MÀN HÌNH (ROUTER)
  // ===============================================
  return (
    <div style={{ 
      width: '100%',
      minHeight: '100dvh',
      overflowY: 'auto',
      position: 'relative',
      backgroundColor: '#0d0e15'
    }}>
      <ScreenLoadBoundary key={screen} lang={lang}>
      <Suspense fallback={
        <div role="status" aria-live="polite" style={{
          position: 'absolute', inset: 0, zIndex: 50, display: 'flex',
          justifyContent: 'center', alignItems: 'center',
          background: '#020c1b', color: '#66fcf1',
          fontFamily: "'VT323', monospace", fontSize: '24px',
        }}>
          {lang === 'vi' ? 'ĐANG TẢI KHU VỰC...' : 'LOADING AREA...'}
        </div>
      }>
      {screen === 'portal' && (
        <Portal renamePlayer={renamePlayer} 
          gsRef={gsRef} setScreen={setScreen}
          currentUser={currentUser} loginWithGoogle={loginWithGoogle}
          loginWithApple={loginWithApple} logout={logout}
          deleteAccount={deleteAccount} lang={lang} toggleLanguage={toggleLanguage}
        />
      )}
      
      {screen === 'hq' && (
        <HQ gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'pilots' && (
        <Pilots gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'cloud_qa_alpha1' && import.meta.env.VITE_C8_CLOUD_QA_UI === 'true' && (
        <CloudQaAlpha1 setScreen={setScreen} lang={lang}
          candidate={import.meta.env.VITE_C12_CANDIDATE_QA_UI === 'true'}/>
      )}
      {screen === 'cloud_qa_alpha1' && import.meta.env.VITE_C8_CLOUD_QA_UI !== 'true' && (
        <div role="alert">Cloud QA disabled. <button onClick={()=>setScreen('hq')}>HQ</button></div>
      )}

      {screen === 'campaign' && (
        <CampaignEngine gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} refreshCloudProfile={refreshCloudProfile} getRealTime={getRealTime}/>
      )}
      
      {screen === 'inventory' && (
        <Inventory gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'stage_select' && (
        <StageSelect gsRef={gsRef} setScreen={setScreen} lang={lang} />
      )}
      
      {screen === 'galaxy_map' && (
        <GalaxyMap gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'campaign_portal' && (
        <CampaignPortal gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} currentUser={currentUser} logout={logout} deleteAccount={deleteAccount} loginWithGoogle={loginWithGoogle} loginWithApple={loginWithApple} toggleLanguage={toggleLanguage} setLang={setLang} getRealTime={getRealTime}/>
      )}
      {screen === 'missions' && (
        <Missions gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} getRealTime={getRealTime}/>
      )}
      {screen === 'dungeon_select' && (
        <DungeonSelect gsRef={gsRef} setScreen={setScreen} lang={lang} getRealTime={getRealTime} />
      )}
      {screen === 'dungeon' && (
        <DungeonEngine gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} getRealTime={getRealTime} />
      )}
      {screen === 'dungeon_result' && (
        <DungeonResult gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} getRealTime={getRealTime} />
      )}
      {screen === 'events' && (
        <Events gameAction={gameAction}           gsRef={gsRef}
          setScreen={setScreen}
          lang={lang}
          saveUserProfile={saveUserProfile}
          getRealTime={getRealTime}
        />
      )}
      {screen === 'shop_campaign' && (
        <ShopCampaign gameAction={gameAction} gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} getRealTime={getRealTime} />
      )}
      
      </Suspense>
      </ScreenLoadBoundary>

      {/* KHUNG THÔNG BÁO (TOAST) */}
      <Toaster 
        position="top-center" 
        reverseOrder={false} 
        gutter={8} 
        containerStyle={{
          top: 'calc(env(safe-area-inset-top) + 20px)' 
        }}
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a2e', color: '#fff', fontFamily: "'VT323', monospace",
            fontSize: '18px', fontWeight: 'bold', borderRadius: '8px',
            border: '2px solid #FFD700', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
          },
          success: { style: { background: '#2ed573', borderColor: '#2ed573' }, iconTheme: { primary: '#fff', secondary: '#2ed573' } },
          error: { style: { background: '#ff4757', borderColor: '#ff4757' }, iconTheme: { primary: '#fff', secondary: '#ff4757' } },
          loading: { style: { background: '#0abde3', borderColor: '#0abde3' } }
        }} 
      />
    </div>
  );
}