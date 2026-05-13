import React, { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { t } from './utils/translations';
import { AppUpdate } from '@capawesome/capacitor-app-update';
import { useAuth } from './hooks/useAuth';

// --- IMPORT COMPONENT CHIẾN DỊCH ---
import Portal from './components/Portal';
import HQ from './components/HQ';
import Pilots from './components/Pilots';
import Inventory from './components/Inventory';
import CampaignEngine from './components/Campaign/CampaignEngine';
import StageSelect from './components/StageSelect';
import CampaignPortal from './components/CampaignPortal';
import ShopCampaign from './components/ShopCampaign';
import GalaxyMap from './components/GalaxyMap';
import Missions from './components/Missions';
import DungeonSelect from './components/DungeonSelect';
import DungeonEngine from './components/Dungeon/DungeonEngine';
import DungeonResult from './components/DungeonResult'
import Events from './components/Events';;
import { secureStorage } from './utils/storageHelper';
import { DEFAULT_CAMPAIGN_DATA } from './constants';

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
  
  const { currentUser, loginWithGoogle, loginWithApple, logout, deleteAccount, saveUserProfile } = useAuth(
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
      {screen === 'portal' && (
        <Portal 
          gsRef={gsRef} setScreen={setScreen}
          currentUser={currentUser} loginWithGoogle={loginWithGoogle}
          loginWithApple={loginWithApple} logout={logout}
          deleteAccount={deleteAccount} lang={lang} toggleLanguage={toggleLanguage}
        />
      )}
      
      {screen === 'hq' && (
        <HQ gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'pilots' && (
        <Pilots gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'campaign' && (
        <CampaignEngine gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} getRealTime={getRealTime}/>
      )}
      
      {screen === 'inventory' && (
        <Inventory gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'stage_select' && (
        <StageSelect gsRef={gsRef} setScreen={setScreen} lang={lang} />
      )}
      
      {screen === 'galaxy_map' && (
        <GalaxyMap gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
      {screen === 'campaign_portal' && (
        <CampaignPortal gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} currentUser={currentUser} logout={logout} deleteAccount={deleteAccount} loginWithGoogle={loginWithGoogle} loginWithApple={loginWithApple} toggleLanguage={toggleLanguage} setLang={setLang} getRealTime={getRealTime}/>
      )}
      {screen === 'missions' && (
        <Missions gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} getRealTime={getRealTime}/>
      )}
      {screen === 'dungeon_select' && (
        <DungeonSelect gsRef={gsRef} setScreen={setScreen} lang={lang} getRealTime={getRealTime} />
      )}
      {screen === 'dungeon' && (
        <DungeonEngine gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      {screen === 'dungeon_result' && (
        <DungeonResult gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      {screen === 'events' && (
        <Events
          gsRef={gsRef}
          setScreen={setScreen}
          lang={lang}
          saveUserProfile={saveUserProfile}
          getRealTime={getRealTime}
        />
      )}
      {screen === 'shop_campaign' && (
        <ShopCampaign gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile} />
      )}
      
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