import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { signInWithPopup, signInWithCredential, GoogleAuthProvider, OAuthProvider, updateProfile, deleteUser, signOut, onAuthStateChanged, browserPopupRedirectResolver } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Purchases } from '@revenuecat/purchases-capacitor';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase';
import { secureStorage } from '../utils/storageHelper';
import { t } from '../utils/translations';
import { DEFAULT_CAMPAIGN_DATA } from '../constants';

export function useAuth(gsRef, setUIUpdates, setScreen, langRef, getRealTime) {
  const [currentUser, setCurrentUser] = useState(null);

  const saveUserProfile = async (specificUpdates = null) => {
    const safeNum = (val, fallback) => (typeof val === 'number' && !isNaN(val)) ? val : fallback;
    const safeStr = (val, fallback) => (typeof val === 'string') ? val : fallback;

    if (!currentUser) {
      secureStorage.setItem('astro_guest_coins', safeNum(gsRef.current.coins, 0));
      secureStorage.setItem('astro_guest_diamonds', safeNum(gsRef.current.diamonds, 0));
      secureStorage.setItem('astro_guest_energy', safeNum(gsRef.current.energy, 50));
      if (gsRef.current.campaignData) {
         secureStorage.setItem('astro_guest_campaign', JSON.stringify(gsRef.current.campaignData));
      }
      return; 
    }

    try {
      const userRef = doc(db, "users", currentUser.uid);
      if (specificUpdates) {
        await setDoc(userRef, specificUpdates, { merge: true });
        return; 
      }

      // ==========================================
      // CẤU TRÚC FIRESTORE MỚI: SẠCH, PHẲNG VÀ DỄ QUẢN LÝ
      // ==========================================
      const cData = gsRef.current.campaignData || DEFAULT_CAMPAIGN_DATA;

      const updateData = {
        // 1. Thông tin cơ bản
        profile: {
          displayName: currentUser.displayName || gsRef.current.myName,
          photoURL: currentUser.photoURL || '',
          isOnline: true,
          last_update_ms: Date.now()
        },

        // 2. Ví tài nguyên (Gộp toàn bộ Tiền & Vật liệu vào 1 chỗ)
        wallet: {
          coins: safeNum(gsRef.current.coins, 0),
          diamonds: safeNum(gsRef.current.diamonds, 0),
          energy: safeNum(gsRef.current.energy, 50),
          gears: safeNum(cData.materials?.gears, 0),
          blueprints: safeNum(cData.materials?.blueprints, 0),
          vipPoints: safeNum(gsRef.current.vipPoints, 0)
        },

        // 3. Theo dõi Quảng cáo & VIP
        ads_tracking: {
          lastCoinDate: safeStr(gsRef.current.lastCoinDate, ''),
          hourlyCoinCount: safeNum(gsRef.current.hourlyCoinCount, 0),
          lastCoinHour: safeStr(gsRef.current.lastCoinHour, '')
        },

        // 4. Tiến trình Chiến dịch, Nhiệm vụ và ĐIỂM DANH (Attendance)
        progress: {
          ...(cData.progress || DEFAULT_CAMPAIGN_DATA.progress),
          hasClaimedFirstTopup: cData.hasClaimedFirstTopup || false
        },
        missions: cData.missionData || { claimed: [], progress: {} },
        attendance: cData.attendance || { streak: 0, lastDate: '' }, // <-- THÊM DÒNG NÀY ĐỂ LƯU LÊN MÂY
        
        // 5. Trang bị đang sử dụng
        loadout: cData.loadout || DEFAULT_CAMPAIGN_DATA.loadout,

        // 6. Kho đồ các loại
        inventory: {
          items: cData.items || DEFAULT_CAMPAIGN_DATA.items,
          aircrafts: cData.ownedAircrafts || DEFAULT_CAMPAIGN_DATA.ownedAircrafts,
          pilots: cData.ownedPilots || DEFAULT_CAMPAIGN_DATA.ownedPilots
        }
      };

      // Dùng setDoc để đẩy toàn bộ cấu trúc siêu gọn này lên Firebase
      await setDoc(userRef, updateData);

    } catch (e) {
      console.error("Lỗi đồng bộ hồ sơ lên mây:", e);
    }
  };

  const loadUserProfile = async (user) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    
    try {
      if (Capacitor.isNativePlatform()) {
        const isIOS = Capacitor.getPlatform() === 'ios'; 
        Purchases.configure({ apiKey: isIOS ? "appl_Dien_Key_Apple_Vao_Day" : "goog_CbZGtaRbTZyJqImOJePIWqxjpXr", appUserID: user.uid }).catch(()=>{});
      }

      const snap = await getDoc(userRef);
      let authName = user.displayName; let authPhoto = user.photoURL;

      if (user.providerData?.length > 0) {
        user.providerData.forEach(p => {
          if (p.displayName && !authName) authName = p.displayName;
          if (p.photoURL && !authPhoto) authPhoto = p.photoURL;
        });
      }

      let finalName = authName || 'Player';
      let finalPhoto = authPhoto || "";

      if (snap.exists()) {
        const data = snap.data();
        const now = getRealTime();

        finalName = authName || data.profile?.displayName || data.displayName || 'Player';
        finalPhoto = authPhoto || data.profile?.photoURL || data.photoURL || '';
        gsRef.current.myName = finalName;

        const wallet = data.wallet || {};
        const ads = data.ads_tracking || {};

        gsRef.current.coins = wallet.coins ?? (data.coins || 0);
        gsRef.current.diamonds = wallet.diamonds ?? (data.diamonds || 0);
        gsRef.current.energy = wallet.energy ?? (data.energy || 50);
        gsRef.current.vipPoints = wallet.vipPoints ?? (data.vipPoints || 0);
        
        const realTimeNow = new Date(now);
        const today = `${realTimeNow.getFullYear()}-${realTimeNow.getMonth() + 1}-${realTimeNow.getDate()}`;
        const currentHourStr = `${today}-${realTimeNow.getHours()}`;
        
        gsRef.current.lastCoinDate = today;
        gsRef.current.lastCoinHour = currentHourStr;
        gsRef.current.hourlyCoinCount = (ads.lastCoinHour === currentHourStr) ? (ads.hourlyCoinCount || 0) : 0;

        // BÓC TÁCH PROGRESS BAO GỒM CỜ NẠP ĐẦU
        const loadedProgress = data.progress || data.campaignData?.progress || {};
        
        gsRef.current.campaignData = {
          progress: { ...DEFAULT_CAMPAIGN_DATA.progress, ...loadedProgress },
          // Gắn cờ Nạp Đầu vào campaignData
          hasClaimedFirstTopup: loadedProgress.hasClaimedFirstTopup || data.campaignData?.hasClaimedFirstTopup || false,
          
          loadout: data.loadout || data.campaignData?.loadout || DEFAULT_CAMPAIGN_DATA.loadout,
          materials: {
            gears: wallet.gears ?? (data.campaignData?.materials?.gears || 0),
            blueprints: wallet.blueprints ?? (data.campaignData?.materials?.blueprints || 0)
          },
          items: data.inventory?.items || data.campaignData?.items || DEFAULT_CAMPAIGN_DATA.items,
          ownedAircrafts: data.inventory?.aircrafts || data.campaignData?.ownedAircrafts || DEFAULT_CAMPAIGN_DATA.ownedAircrafts,
          ownedPilots: data.inventory?.pilots || data.campaignData?.ownedPilots || DEFAULT_CAMPAIGN_DATA.ownedPilots,
          missionData: data.missions || data.campaignData?.missionData || { claimed: [], progress: {} },
          attendance: data.attendance || data.campaignData?.attendance || { streak: 0, lastDate: '' } // <-- THÊM DÒNG NÀY ĐỂ KÉO TỪ MÂY XUỐNG
        };
        setScreen(prev => prev === 'portal' ? 'campaign_portal' : prev);
      } else {
        // TẠO MỚI HOÀN TOÀN
        finalName = authName || `Astro_${Math.floor(Math.random() * 10000)}`;
        gsRef.current.myName = finalName;
        gsRef.current.coins = 0; gsRef.current.diamonds = 0; gsRef.current.energy = 50; gsRef.current.isVIP = false;
        gsRef.current.campaignData = JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN_DATA));
        
        await saveUserProfile();
      }

      if (user.displayName !== finalName || user.photoURL !== finalPhoto) {
        updateProfile(user, { displayName: finalName, photoURL: finalPhoto }).catch(()=>{});
      }
      
      setUIUpdates(prev => ({ ...prev, coins: gsRef.current.coins, diamonds: gsRef.current.diamonds, energy: gsRef.current.energy, vipPoints: gsRef.current.vipPoints, displayName: finalName, photoURL: finalPhoto }));
    } catch (error) { console.error("Lỗi tải hồ sơ:", error); }
  };

  const loginWithGoogle = async () => { 
    try {
      if (Capacitor.isNativePlatform()) {
        toast.loading(t[langRef.current]?.loginOpening, { id: 'nativeLogin' });
        GoogleAuth.initialize({ clientId: '528039759292-052m13c4bffv1t5vskvdvmjdl9n23gb8.apps.googleusercontent.com', scopes: ['profile', 'email'], grantOfflineAccess: true });
        const googleUser = await GoogleAuth.signIn();
        const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
        await signInWithCredential(auth, credential);
        toast.success(t[langRef.current]?.loginAppSuccess);
      } else {
        const provider = new GoogleAuthProvider(); 
        await signInWithPopup(auth, provider, browserPopupRedirectResolver); 
        toast.success(t[langRef.current]?.loginWebSuccess);
      }
    } catch (error) { toast.error(t[langRef.current]?.loginFail); }
  };

  const loginWithApple = async () => { 
    try {
      toast.loading(t[langRef.current]?.loginOpening || "Đang kết nối Apple...", { id: 'appleLogin' });
      const generateNonce = () => {
        const array = new Uint8Array(32); window.crypto.getRandomValues(array);
        return Array.from(array, c => c.toString(16).padStart(2, '0')).join('');
      };
      const rawNonce = generateNonce();
      const sha256 = async (raw) => {
        const encoder = new TextEncoder(); const data = encoder.encode(raw);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      };
      const hashedNonce = await sha256(rawNonce);
      const { response } = await SignInWithApple.authorize({ clientId: 'com.theIT.spacefighter4', scopes: 'email name', nonce: hashedNonce });
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: response.identityToken, rawNonce: rawNonce });

      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("LỖI MẠNG iOS")), 8000));
      const userCredential = await Promise.race([ signInWithCredential(auth, credential), timeout ]);
      const user = userCredential.user;

      if (response.givenName || response.familyName) {
        const appleName = `${response.familyName || ''} ${response.givenName || ''}`.trim();
        await updateProfile(user, { displayName: appleName });
      }
      toast.dismiss('appleLogin'); toast.success(t[langRef.current]?.loginAppSuccess || "Đăng nhập thành công!");
    } catch (error) { toast.dismiss('appleLogin'); toast.error(t[langRef.current]?.loginFail || "Đăng nhập thất bại"); }
  };

 const logout = async () => {
    try {
      // 1. Đánh dấu Offline trên DB
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        await setDoc(userRef, { profile: { isOnline: false } }, { merge: true }).catch(() => {});
      }

      // 2. XÓA SẠCH DỮ LIỆU CỤC BỘ BẢO MẬT (Tránh rò rỉ tài nguyên)
      secureStorage.removeItem('astro_session_id');
      secureStorage.removeItem('astro_guest_coins');
      secureStorage.removeItem('astro_guest_diamonds');
      secureStorage.removeItem('astro_guest_energy');
      secureStorage.removeItem('astro_guest_campaign');
      try {
        window.localStorage.removeItem('astro_guest_campaign');
        window.localStorage.removeItem('astro_guest_coins');
      } catch(e) {}

      // 3. RESET gsRef VÀ GIAO DIỆN VỀ TRẠNG THÁI TÂN THỦ
      gsRef.current.coins = 0;
      gsRef.current.diamonds = 0;
      gsRef.current.energy = 50; // Năng lượng cơ bản cho khách
      gsRef.current.vipPoints = 0;
      gsRef.current.myName = 'Guest';
      gsRef.current.campaignData = JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN_DATA));

      setUIUpdates(prev => ({
        ...prev,
        coins: 0,
        diamonds: 0,
        energy: 50,
        vipPoints: 0,
        displayName: 'Guest',
        photoURL: ''
      }));

      // 4. Ngắt kết nối Firebase & Plugin Auth
      await signOut(auth);
      if (Capacitor.isNativePlatform()) { await GoogleAuth.signOut(); }
      
      setCurrentUser(null); 
      setScreen('portal'); 
      toast.success(t[langRef.current]?.logoutSuccess || 'Đã đăng xuất an toàn!');
    } catch (e) { 
      console.log(e); 
    }
  };

  const deleteAccount = async () => {
    if (!currentUser) return;
    const isVipUser = gsRef.current.isVIP;
    let warningMsg = t[langRef.current]?.confirmDelete || "BẠN CÓ CHẮC CHẮN XÓA TÀI KHOẢN?";
    if (!window.confirm(warningMsg)) return;

    const loadingToast = toast.loading(t[langRef.current]?.deletingAccount || "Đang xóa dữ liệu...");
    try {
      const userRef = doc(db, "users", currentUser.uid);
      await deleteDoc(userRef);
      await deleteUser(currentUser);
      secureStorage.removeItem('astro_session_id');
      if (Capacitor.isNativePlatform()) GoogleAuth.signOut().catch(() => {});
      setCurrentUser(null); setScreen('portal'); toast.dismiss(loadingToast); toast.success(t[langRef.current]?.deleteSuccess || "Đã xóa!");
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Lỗi xóa tài khoản, vui lòng đăng nhập lại rồi thử lại.");
    }
  };

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setCurrentUser(user);
      
      if (user) {
        gsRef.current.myName = user.displayName || 'Player';
        await loadUserProfile(user);
      } else {
        let guestCoins = parseInt(secureStorage.getItem('astro_guest_coins')) || 0;
        let guestDiamonds = parseInt(secureStorage.getItem('astro_guest_diamonds')) || 0;
        let guestEnergy = parseInt(secureStorage.getItem('astro_guest_energy')) || 50;
        
        gsRef.current.coins = guestCoins; 
        gsRef.current.diamonds = guestDiamonds; 
        gsRef.current.energy = guestEnergy; 

        setUIUpdates(prev => ({ ...prev, coins: guestCoins, diamonds: guestDiamonds, energy: guestEnergy, vipPoints: gsRef.current.vipPoints, displayName: 'Guest', photoURL: '' }));

        let guestCampaign = secureStorage.getItem('astro_guest_campaign');
        if (guestCampaign) {
          gsRef.current.campaignData = JSON.parse(guestCampaign);
        } else {
          gsRef.current.campaignData = JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN_DATA));
        }
      }
    });

    return () => { isMounted = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!currentUser) return;
      const userRef = doc(db, "users", currentUser.uid);
      if (document.visibilityState === 'hidden') {
         setDoc(userRef, { profile: { isOnline: false, last_update_ms: Date.now() } }, { merge: true }).catch(() => {});
      } else {
         setDoc(userRef, { profile: { isOnline: true, last_update_ms: Date.now() } }, { merge: true }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser]);

  return { currentUser, loginWithGoogle, loginWithApple, logout, deleteAccount, saveUserProfile };
}