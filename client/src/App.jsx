import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { createHudAssetToastOptionsV424 } from './ui-system/HudAssetToastV424.js';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { t } from './utils/translations';
import { AppUpdate } from '@capawesome/capacitor-app-update';
import { useAuth } from './hooks/useAuth';
import { loadCampaignEngine, loadDungeonEngine } from './game/routing/BattleScreenLoaders';

// Keep Portal eagerly loaded for fast first paint/login. Other screens are
// route-level chunks: Babylon is downloaded only when battle/map opens.
import Portal from './components/Portal';
import StartupResourceGate from './components/ResourceDownloads/StartupResourceGate.jsx';
import ProductScreenShell from './ui-system/ProductScreenShell.jsx';
import ProductStateScreen from './ui-system/ProductStateScreen.jsx';
const HQ = lazy(() => import('./components/HQ'));
const ResourceManagerScreen = lazy(() => import('./components/ResourceDownloads/ResourceManagerScreen.jsx'));
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

// UI-only switch. V4.2.4 is an APK evaluation skin; disable with VITE_SF_UI_ASSET_SKIN_V424=false.
const hudAssetSkinV424Enabled = import.meta.env.VITE_SF_UI_ASSET_SKIN_V424 !== 'false';

// A failed lazy chunk (offline, version mismatch, aborted download) must
// show an actionable UI instead of crashing into an empty WebView.
class ScreenLoadBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const isVi = this.props.lang === 'vi';
    return (
      <ProductStateScreen
        state="error"
        overlay
        title={isVi ? 'KHÔNG THỂ TẢI KHU VỰC' : 'UNABLE TO LOAD THIS AREA'}
        description={isVi
          ? 'Vui lòng kiểm tra kết nối hoặc tải lại phiên hiện tại.'
          : 'Please check your connection or reload the current session.'}
        actionLabel={isVi ? 'TẢI LẠI' : 'RELOAD'}
        onAction={() => window.location.reload()}
      />
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
    <ProductScreenShell
      data-sf-ui-skin={hudAssetSkinV424Enabled ? 'hud-v2' : 'legacy'}
      data-sf-ui-screen={screen}
      screen={screen}
      uiSkin={hudAssetSkinV424Enabled ? 'hud-v2' : 'legacy'}
    >
      <ScreenLoadBoundary key={screen} lang={lang}>
      <Suspense fallback={
        <ProductStateScreen
          state="loading"
          overlay
          title={lang === 'vi' ? 'ĐANG TẢI KHU VỰC' : 'LOADING AREA'}
          description={lang === 'vi'
            ? 'Đang chuẩn bị giao diện và dữ liệu cục bộ.'
            : 'Preparing the interface and local data.'}
        />
      }>
      {screen === 'portal' && (
        <Portal renamePlayer={renamePlayer} 
          gsRef={gsRef} setScreen={setScreen}
          currentUser={currentUser} loginWithGoogle={loginWithGoogle}
          loginWithApple={loginWithApple} logout={logout}
          deleteAccount={deleteAccount} lang={lang} toggleLanguage={toggleLanguage}
        />
      )}
      
      {screen === 'resource_manager' && (
        <ResourceManagerScreen setScreen={setScreen} lang={lang} />
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
        <ProductStateScreen
          state="disabled"
          title={lang === 'vi' ? 'CLOUD QA ĐANG TẮT' : 'CLOUD QA IS DISABLED'}
          description={lang === 'vi'
            ? 'Build hiện tại không bật giao diện QA máy chủ.'
            : 'This build does not enable the server QA interface.'}
          actionLabel="HQ"
          onAction={() => setScreen('hq')}
        />
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

      <StartupResourceGate lang={lang} />

      {/* KHUNG THÔNG BÁO (TOAST) */}
      <Toaster 
        position="top-center" 
        reverseOrder={false} 
        gutter={8} 
        containerStyle={{
          top: 'calc(env(safe-area-inset-top) + 20px)' 
        }}
        toastOptions={createHudAssetToastOptionsV424(hudAssetSkinV424Enabled)}
      />
    </ProductScreenShell>
  );
}