import React, { useState, useEffect, useRef } from 'react';
import { AdMob, RewardAdPluginEvents, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { t } from '../utils/translations';

// Đã gỡ bỏ revivePlayer vì Campaign không xài hồi sinh kiểu cũ
export function useAdMob(gsRef, setUIUpdates, currentUser, screen, isVIP, langRef, saveUserProfile, getRealTime) {
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [isAdInitialized, setIsAdInitialized] = useState(false);

  const pendingRewardRef = useRef(null);
  const adReadyRef = useRef(false);
  const isBannerCreatedRef = useRef(false);

  const saveUserProfileRef = useRef(saveUserProfile);
  useEffect(() => { saveUserProfileRef.current = saveUserProfile; }, [saveUserProfile]);

  const IS_TESTING = true; 
  const isIOS = Capacitor.getPlatform() === 'ios';
  
  const AD_ID = IS_TESTING 
    ? (isIOS ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-3940256099942544/5224354917') 
    : (isIOS ? 'ca-app-pub-xxx/yyy_ios' : 'ca-app-pub-8735238443425732/3739555790'); 

  const BANNER_ID = IS_TESTING 
    ? (isIOS ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111') 
    : (isIOS ? 'ca-app-pub-xxx/zzz_ios' : 'ca-app-pub-8735238443425732/8524978611');

  const preloadAd = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await AdMob.prepareRewardVideoAd({ adId: AD_ID, isTesting: IS_TESTING });
      adReadyRef.current = true;
    } catch (error) {
      adReadyRef.current = false;
    }
  };

  useEffect(() => {
    let rewardListener, dismissListener, failedListener;
    const initAdMob = async () => {
      try {
        await AdMob.initialize();
        if (Capacitor.getPlatform() === 'ios') {
          try { await AdMob.requestTrackingAuthorization(); } catch (e) {}
        }
        await AdMob.initialize({ requestTrackingAuthorization: true });
        setIsAdInitialized(true);

        let earnedReward = null;
        rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          earnedReward = pendingRewardRef.current; 
        });

        dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          setIsWatchingAd(false);
          adReadyRef.current = false;
          if (earnedReward) {
            if (earnedReward === 'coin') {
              gsRef.current.coins = (gsRef.current.coins || 0) + 1000; 
              gsRef.current.hourlyCoinCount += 1;
              setUIUpdates(prev => ({ ...prev, coins: gsRef.current.coins }));
              toast.success(langRef.current === 'vi' ? '+1000 Xu' : '+1000 Coins');
            } else if (earnedReward === 'energy') {
              gsRef.current.energy = Math.min(100, (gsRef.current.energy || 50) + 20);  
              setUIUpdates(prev => ({ ...prev, energy: gsRef.current.energy }));
              toast.success(langRef.current === 'vi' ? '+20 Năng lượng' : '+20 Energy');
            }
            if (saveUserProfileRef.current) saveUserProfileRef.current(); 
            earnedReward = null; 
          }
          pendingRewardRef.current = null;
          preloadAd(); 
        });

        failedListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
          adReadyRef.current = false;
        });

        preloadAd();
      } catch (e) {
        console.log("Web environment - AdMob disabled.");
      }
    };
    initAdMob();

    return () => {
      if (rewardListener) rewardListener.remove();
      if (dismissListener) dismissListener.remove();
      if (failedListener) failedListener.remove();
    };
  }, []);

  const showBanner = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      if (!isBannerCreatedRef.current) {
        await AdMob.showBanner({
          adId: BANNER_ID,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: IS_TESTING
        });
        isBannerCreatedRef.current = true;
      } else {
        await AdMob.resumeBanner(); 
      }
    } catch (e) { console.log("Lỗi hiện Banner:", e); }
  };

  const hideBanner = async () => {
    if (!Capacitor.isNativePlatform() || !isBannerCreatedRef.current) return;
    try {
      await AdMob.hideBanner(); 
    } catch (e) { console.log("Lỗi ẩn Banner:", e); }
  };

  useEffect(() => {
    // CHỈ CHO PHÉP BANNER Ở CÁC MÀN HÌNH SẢNH CHỜ CHIẾN DỊCH
    const safeScreens = ['portal', 'campaign_portal', 'hq', 'shop_campaign', 'inventory', 'pilots', 'stage_select'];
    const shouldShowBanner = safeScreens.includes(screen) && !isVIP && !isWatchingAd && isAdInitialized;

    if (shouldShowBanner) showBanner();
    else hideBanner();
  }, [screen, isVIP, isWatchingAd, isAdInitialized]);

  const watchAd = async (rewardType) => {
    if (!currentUser) {
      return toast.error(t[langRef.current]?.reqLoginReward || "Vui lòng đăng nhập!");
    }
    
    // Giới hạn xem nhận thưởng
    const realTimeNow = new Date(getRealTime());
    const currentHourStr = `${realTimeNow.getFullYear()}-${realTimeNow.getMonth() + 1}-${realTimeNow.getDate()}-${realTimeNow.getHours()}`;
    if (gsRef.current.lastCoinHour !== currentHourStr) {
      gsRef.current.hourlyCoinCount = 0;
      gsRef.current.lastCoinHour = currentHourStr;
    }
    if (gsRef.current.hourlyCoinCount >= 20) {
      return toast.error(langRef.current === 'vi' ? "Đã đạt giới hạn quảng cáo giờ này." : "Hourly ad limit reached.");
    }
    
    if (isWatchingAd) return;
    setIsWatchingAd(true);
    pendingRewardRef.current = rewardType;

    if (!Capacitor.isNativePlatform()) {
      setIsWatchingAd(false);
      pendingRewardRef.current = null;
      toast((tToast) => (
        <div style={{ textAlign: 'center', padding: '5px' }}>
          <div style={{ fontSize: '30px', marginBottom: '5px' }}>📱</div>
          <div style={{ fontSize: '16px', marginBottom: '10px', color: '#FFD700' }}>
            <b>{t[langRef.current]?.errAppOnly || 'Chỉ dành cho Ứng dụng!'}</b>
          </div>
          <button 
            onClick={() => { 
              window.open("https://play.google.com/store/apps/details?id=com.ban.astrocat", "_blank"); 
              toast.dismiss(tToast.id); 
            }} 
            style={{ background: '#2ed573', color: '#fff', border: 'none', padding: '8px', borderRadius: '5px', width: '100%', fontFamily: "'VT323', monospace", cursor: 'pointer' }}
          >
            {langRef.current === 'vi' ? 'Tải App Ngay' : 'Download Now'}
          </button>
        </div>
      ), { duration: 6000 });
      return;
    }

    if (adReadyRef.current) {
      try {
        await AdMob.showRewardVideoAd();
        adReadyRef.current = false; 
      } catch (error) {
        setIsWatchingAd(false); pendingRewardRef.current = null; preloadAd(); 
        toast.error(t[langRef.current]?.errAdNotReady || "Lỗi phát quảng cáo.");
      }
    } else {
      const loadingToast = toast.loading(t[langRef.current]?.adConnecting || "Đang kết nối quảng cáo...");
      try {
        await Promise.race([
          AdMob.prepareRewardVideoAd({ adId: AD_ID, isTesting: IS_TESTING }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
        ]);
        toast.dismiss(loadingToast);
        await AdMob.showRewardVideoAd();
      } catch (error) {
        toast.dismiss(loadingToast); setIsWatchingAd(false); pendingRewardRef.current = null;
        toast.error(t[langRef.current]?.errAdNotReady || "Quảng cáo chưa sẵn sàng.");
      }
    }
  };

  return { watchAd, isWatchingAd };
}