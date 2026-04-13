import React, { useState, useEffect, useRef } from 'react';
import { AdMob, RewardAdPluginEvents, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { t } from '../utils/translations';

export function useAdMob(gsRef, setUIUpdates, currentUser, screen, isVIP, langRef, saveUserProfile, revivePlayer, getRealTime) {
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [isAdInitialized, setIsAdInitialized] = useState(false);

  const pendingRewardRef = useRef(null);
  const adReadyRef = useRef(false);
  const isBannerCreatedRef = useRef(false);

  // Bảo vệ các hàm callback khỏi bị Stale Closure
  const saveUserProfileRef = useRef(saveUserProfile);
  useEffect(() => { saveUserProfileRef.current = saveUserProfile; }, [saveUserProfile]);
  const revivePlayerRef = useRef(revivePlayer);
  useEffect(() => { revivePlayerRef.current = revivePlayer; }, [revivePlayer]);

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
              gsRef.current.coins += 50; 
              gsRef.current.hourlyCoinCount += 1;
              setUIUpdates(prev => ({ ...prev, coins: gsRef.current.coins }));
              toast.success(t[langRef.current]?.rewardCoin);
            } else if (earnedReward === 'life') {
              gsRef.current.lives += 1;  
              setUIUpdates(prev => ({ ...prev, lives: gsRef.current.lives }));
              toast.success(t[langRef.current]?.rewardLife);
            } else if (earnedReward === 'revive') {
              if (revivePlayerRef.current) revivePlayerRef.current();
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

  useEffect(() => {
    const manageBanner = async () => {
      if (!Capacitor.isNativePlatform() || !isAdInitialized) return;
      try {
        if (screen === 'game' || isVIP) {
          if (isBannerCreatedRef.current) await AdMob.hideBanner();
        } else {
          if (!isBannerCreatedRef.current) {
            await AdMob.showBanner({ adId: BANNER_ID, adSize: BannerAdSize.BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: IS_TESTING });
            isBannerCreatedRef.current = true;
          } else {
            await AdMob.resumeBanner();
          }
        }
      } catch (error) { console.error("Banner Error", error); }
    };
    manageBanner();
  }, [screen, isAdInitialized, isVIP]);

  const watchAd = async (rewardType) => {
    if (!currentUser && rewardType !== 'revive') {
      return toast.error(t[langRef.current]?.reqLoginReward || "Vui lòng đăng nhập!");
    }
    if (rewardType === 'life' && gsRef.current.lives >= 10) {
      return toast.error(t[langRef.current]?.errLifeFullAd);
    }
    if (rewardType === 'coin') {
      const realTimeNow = new Date(getRealTime());
      const currentHourStr = `${realTimeNow.getFullYear()}-${realTimeNow.getMonth() + 1}-${realTimeNow.getDate()}-${realTimeNow.getHours()}`;
      if (gsRef.current.lastCoinHour !== currentHourStr) {
        gsRef.current.hourlyCoinCount = 0;
        gsRef.current.lastCoinHour = currentHourStr;
      }
      if (gsRef.current.hourlyCoinCount >= 15) {
        return toast.error(t[langRef.current]?.errCoinHourlyLimitAd || "Đã đạt giới hạn 15 lần/giờ.");
      }
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