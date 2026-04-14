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

export function useAuth(gsRef, setUIUpdates, setScreen, langRef, getRealTime) {
  const [currentUser, setCurrentUser] = useState(null);

  // 1. HÀM LƯU HỒ SƠ
  const saveUserProfile = async (specificUpdates = null) => {
    if (!currentUser) return; 
    try {
      const userRef = doc(db, "users", currentUser.uid);
      
      if (specificUpdates) {
        await setDoc(userRef, specificUpdates, { merge: true });
        return; 
      }

      const safeNum = (val, fallback) => (typeof val === 'number' && !isNaN(val)) ? val : fallback;
      const safeStr = (val, fallback) => (typeof val === 'string') ? val : fallback;
      
      let currentLives = gsRef.current.lives;
      if (currentLives !== '∞') currentLives = safeNum(currentLives, 10);

      const updateData = {
        highScore: safeNum(gsRef.current.bestScore, 0),
        coins: safeNum(gsRef.current.coins, 0),
        diamonds: safeNum(gsRef.current.diamonds, 0), // 👇 LƯU KIM CƯƠNG
        lives: currentLives,
        livesUpdatedAt: typeof gsRef.current.livesUpdatedAt === 'number' && !isNaN(gsRef.current.livesUpdatedAt) ? gsRef.current.livesUpdatedAt : null,
        energy: safeNum(gsRef.current.energy, 50), // 👇 LƯU NĂNG LƯỢNG CHIẾN DỊCH
        energyUpdatedAt: typeof gsRef.current.energyUpdatedAt === 'number' && !isNaN(gsRef.current.energyUpdatedAt) ? gsRef.current.energyUpdatedAt : null,
        isVIP: !!gsRef.current.isVIP,
        dailyCoinCount: safeNum(gsRef.current.dailyCoinCount, 0),
        lastCoinDate: safeStr(gsRef.current.lastCoinDate, ''),
        hourlyCoinCount: safeNum(gsRef.current.hourlyCoinCount, 0),
        lastCoinHour: safeStr(gsRef.current.lastCoinHour, ''),
        inventory: gsRef.current.inventory || { skins: ['classic'], bgs: ['deep'] },
        equipped: gsRef.current.userSettings || { skin: 'classic', bg: 'deep' },
        campaignData: gsRef.current.campaignData
      };

      if (currentUser.displayName) updateData.displayName = currentUser.displayName;
      if (currentUser.photoURL) updateData.photoURL = currentUser.photoURL;

      await setDoc(userRef, updateData, { merge: true });
    } catch (e) {
      console.error("Lỗi đồng bộ hồ sơ lên mây:", e);
    }
  };

  // 2. HÀM TẢI HỒ SƠ
  const loadUserProfile = async (user) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    
    try {
      try {
        if (Capacitor.isNativePlatform()) {
          const isIOS = Capacitor.getPlatform() === 'ios'; 
          await Purchases.configure({ 
              apiKey: isIOS ? "appl_Dien_Key_Apple_Vao_Day" : "goog_CbZGtaRbTZyJqImOJePIWqxjpXr", 
              appUserID: user.uid 
          });
        }
      } catch (rcError) {
        console.error("Lỗi khởi tạo Cửa Hàng:", rcError);
      }
      const snap = await getDoc(userRef);

      let savedId = window.local_astro_session || secureStorage.getItem('astro_session_id');
      if (!savedId) {
        savedId = "sess_" + Math.random().toString(36).substring(2, 15);
        secureStorage.setItem('astro_session_id', savedId);
      }
      window.local_astro_session = savedId; 
      const currentSocketId = savedId;

      let authName = user.displayName;
      let authPhoto = user.photoURL;

      if (user.providerData && user.providerData.length > 0) {
        user.providerData.forEach(provider => {
          if (provider.displayName && !authName) authName = provider.displayName;
          if (provider.photoURL && !authPhoto) authPhoto = provider.photoURL;
        });
      }

      let finalName = authName;
      let finalPhoto = authPhoto || "";

      if (snap.exists()) {
        const data = snap.data();
        const now = getRealTime();

        const isSameDevice = data.last_session_id === currentSocketId;
        if (data.isOnline === true && !isSameDevice) {
          toast.success(t[langRef.current]?.sessionTaken || "Đã ngắt kết nối thiết bị cũ!", { duration: 4000, icon: '🔄' });
        }

        finalName = authName || data.displayName || 'Player';
        finalPhoto = authPhoto || data.photoURL || '';
        gsRef.current.myName = finalName;

        await setDoc(userRef, {
          isOnline: true, last_session_id: currentSocketId, last_update_ms: now, displayName: finalName, photoURL: finalPhoto    
        }, { merge: true }).catch(e => console.error("Lỗi update online:", e));

        // 👇 ĐỌC TÀI NGUYÊN TỪ DATABASE
        gsRef.current.coins = (typeof data.coins === 'number' && !isNaN(data.coins)) ? data.coins : 0;
        gsRef.current.diamonds = (typeof data.diamonds === 'number' && !isNaN(data.diamonds)) ? data.diamonds : 0;
        gsRef.current.energy = (typeof data.energy === 'number' && !isNaN(data.energy)) ? data.energy : 50;
        gsRef.current.isVIP = data.isVIP || false;
        
        if (gsRef.current.isVIP) {
          gsRef.current.lives = '∞'; gsRef.current.livesUpdatedAt = null;
        } else {
          gsRef.current.lives = (typeof data.lives === 'number' && !isNaN(data.lives)) ? data.lives : 10;
          if (gsRef.current.lives < 10) {
            if (!data.livesUpdatedAt || isNaN(data.livesUpdatedAt)) {
              gsRef.current.livesUpdatedAt = now;
              setDoc(userRef, { livesUpdatedAt: now }, { merge: true }).catch(e => console.error("Lỗi time:", e));
            } else { gsRef.current.livesUpdatedAt = data.livesUpdatedAt; }
          } else { gsRef.current.livesUpdatedAt = null; }
        }
        
        const realTimeNow = new Date(now);
        const today = `${realTimeNow.getFullYear()}-${realTimeNow.getMonth() + 1}-${realTimeNow.getDate()}`;
        if (data.lastCoinDate === today) gsRef.current.dailyCoinCount = data.dailyCoinCount || 0; 
        else gsRef.current.dailyCoinCount = 0; 
        gsRef.current.lastCoinDate = today;
        
        const currentHourStr = `${today}-${realTimeNow.getHours()}`;
        if (data.lastCoinHour === currentHourStr) gsRef.current.hourlyCoinCount = data.hourlyCoinCount || 0;
        else gsRef.current.hourlyCoinCount = 0; 
        gsRef.current.lastCoinHour = currentHourStr;
        
        gsRef.current.bestScore = (typeof data.highScore === 'number' && !isNaN(data.highScore)) ? data.highScore : 0;
        
        const dbInv = data.inventory || {};
        gsRef.current.inventory = { 
          skins: Array.isArray(dbInv.skins) ? dbInv.skins : ['classic'], 
          bgs: Array.isArray(dbInv.bgs) ? dbInv.bgs : ['deep'] 
        };
        const dbEquip = data.equipped || {};
        const newSettings = { skin: dbEquip.skin || 'classic', bg: dbEquip.bg || 'deep' };
        
        if (gsRef.current.userSettings.bg !== newSettings.bg) { gsRef.current.background.particles = []; }
        gsRef.current.userSettings = newSettings;
        gsRef.current.campaignData = data.campaignData || defaultCampaignData;

      } else {
        if (!finalName) finalName = `Astro_${Math.floor(Math.random() * 10000)}`;

        await setDoc(userRef, {
          displayName: finalName, photoURL: finalPhoto, isOnline: true, last_session_id: currentSocketId, 
          last_update_ms: Date.now(), coins: 0, diamonds: 0, lives: 10, energy: 50, highScore: 0,
          campaignData: defaultCampaignData
        });

        gsRef.current.myName = finalName;
        gsRef.current.coins = 0; gsRef.current.diamonds = 0; gsRef.current.lives = 10; gsRef.current.energy = 50; 
        gsRef.current.isVIP = false; gsRef.current.livesUpdatedAt = null; gsRef.current.bestScore = 0;
        gsRef.current.inventory = { skins: ['classic'], bgs: ['deep'] }; 
        gsRef.current.userSettings = { skin: 'classic', bg: 'deep' };
        gsRef.current.campaignData = defaultCampaignData;
      }

      if (user.displayName !== finalName || user.photoURL !== finalPhoto) {
        try {
          await updateProfile(user, { displayName: finalName, photoURL: finalPhoto });
          user.displayName = finalName; user.photoURL = finalPhoto;
        } catch (e) { console.error("Lỗi đồng bộ Auth:", e); }
      }
      
      setUIUpdates(prev => ({ 
        ...prev, coins: gsRef.current.coins, diamonds: gsRef.current.diamonds, 
        lives: gsRef.current.lives, energy: gsRef.current.energy, 
        isVIP: gsRef.current.isVIP, nextLifeTime: gsRef.current.isVIP ? null : prev.nextLifeTime, 
        displayName: finalName, photoURL: finalPhoto 
      }));
    } catch (error) { console.error("Lỗi tải hồ sơ:", error); }
  };

  const defaultCampaignData = {
    progress: { currentStage: 1, highestStage: 1, combatPower: 1200 },
    loadout: { pilot: "pilot_alpha", aircraft: "ship_xwing", mainGun: "item_start_gun", wingman: "", armor: "" },
    ownedPilots: { "pilot_alpha": { level: 1, stars: 1 } },
    ownedAircrafts: { "ship_xwing": { level: 1, stars: 1 } },
    items: { "item_start_gun": { baseId: "gun_laser", rarity: 1, level: 1, type: "mainGun" } },
    materials: { gears: 0, blueprints: 0 }
  };

  const loginWithGoogle = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        toast.loading(t[langRef.current]?.loginOpening, { id: 'nativeLogin' });
        GoogleAuth.initialize({
          clientId: '271365354200-divjlei917agdhao9na226dnhemtiq2b.apps.googleusercontent.com',
          scopes: ['profile', 'email'], grantOfflineAccess: true,
        });
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
      const { response } = await SignInWithApple.authorize({ clientId: 'com.ban.astrocat', scopes: 'email name', nonce: hashedNonce });
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: response.identityToken, rawNonce: rawNonce });

      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("LỖI MẠNG iOS: Firebase bị treo!")), 8000));
      const userCredential = await Promise.race([ signInWithCredential(auth, credential), timeout ]);
      const user = userCredential.user;

      if (response.givenName || response.familyName) {
        const appleName = `${response.familyName || ''} ${response.givenName || ''}`.trim();
        await updateProfile(user, { displayName: appleName });
        user.displayName = appleName; 
      }
      toast.dismiss('appleLogin'); toast.success(t[langRef.current]?.loginAppSuccess || "Đăng nhập thành công!");
    } catch (error) {
      toast.dismiss('appleLogin'); toast.error(t[langRef.current]?.loginFail || "Đăng nhập thất bại");
    }
  };

  const logout = async () => {
    try {
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { isOnline: false, last_session_id: "" }).catch(() => {});
      }
      secureStorage.removeItem('astro_session_id');
      await signOut(auth);
      if (Capacitor.isNativePlatform()) { await GoogleAuth.signOut(); }
      
      // 👇 RESET CHỈ SỐ VỀ 0 KHI ĐĂNG XUẤT
      gsRef.current.coins = 0; gsRef.current.diamonds = 0; gsRef.current.lives = 10; gsRef.current.energy = 50;
      gsRef.current.inventory = { skins: ['classic'], bgs: ['deep'] }; gsRef.current.userSettings = { skin: 'classic', bg: 'deep' };
      setUIUpdates(prev => ({ ...prev, coins: 0, diamonds: 0, lives: 10, energy: 50, isVIP: false, nextLifeTime: null }));
      
      setCurrentUser(null); setScreen('portal'); toast.success(t[langRef.current]?.logoutSuccess);
    } catch (e) { console.log(e); }
  };

  const deleteAccount = async () => { /* Giữ nguyên của bạn */
    if (!currentUser) return;
    const isVipUser = gsRef.current.isVIP;
    let warningMsg = t[langRef.current]?.confirmDelete || "BẠN CÓ CHẮC CHẮN?\\n\\nHành động này sẽ xóa vĩnh viễn tài khoản và toàn bộ điểm số của bạn. KHÔNG THỂ HOÀN TÁC!";
    if (isVipUser) warningMsg = "🚨 CẢNH BÁO TÀI SẢN VIP 🚨\\n\\nTài khoản của bạn ĐANG SỞ HỮU GÓI VIP. Nếu tiếp tục xóa, bạn sẽ MẤT TOÀN BỘ quyền lợi VIP đã mua và điểm số.\\n\\nBạn có THẬT SỰ muốn xóa?";
    if (!window.confirm(warningMsg)) return;
    if (isVipUser && !window.confirm("HỎI LẠI LẦN CUỐI:\\n\\nBạn chấp nhận TỪ BỎ GÓI VIP ĐÃ MUA và xóa tài khoản này vĩnh viễn chứ?")) return;

    const loadingToast = toast.loading(t[langRef.current]?.deletingAccount || "Đang xóa dữ liệu...");
    try {
      const userRef = doc(db, "users", currentUser.uid);
      await deleteDoc(userRef); await deleteUser(currentUser);
      secureStorage.removeItem('astro_session_id');
      if (Capacitor.isNativePlatform()) GoogleAuth.signOut().catch(() => {});
      setCurrentUser(null); setScreen('portal'); toast.dismiss(loadingToast); toast.success(t[langRef.current]?.deleteSuccess || "Tài khoản đã bị xóa vĩnh viễn!");
    } catch (error) {
      toast.dismiss(loadingToast); toast.error("Lỗi xóa tài khoản: " + error.message);
    }
  };

  useEffect(() => {
    let isMounted = true; let unsubSnapshot = null;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setCurrentUser(user);
      if (user) {
        gsRef.current.myName = user.displayName || 'Player';
        await loadUserProfile(user);
        const userRef = doc(db, "users", user.uid);
        unsubSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const currentData = docSnap.data();
            const mySessionId = window.local_astro_session || secureStorage.getItem('astro_session_id');
            if (currentData.last_session_id && currentData.last_session_id !== mySessionId) {
              toast.error(t[langRef.current]?.errMultiDevice || "Tài khoản đang chơi ở thiết bị khác!");
              secureStorage.removeItem('astro_session_id'); signOut(auth);
              if (Capacitor.isNativePlatform()) GoogleAuth.signOut().catch(() => {});
              setCurrentUser(null); setScreen('portal');
            }
          }
        });
      } else {
        if (unsubSnapshot) unsubSnapshot(); 
        let savedLives = secureStorage.getItem('astro_guest_lives');
        let guestLives = savedLives !== null ? parseInt(savedLives) : 10; 
        let guestCoins = parseInt(secureStorage.getItem('astro_guest_coins')) || 0;
        
        gsRef.current.lives = guestLives; gsRef.current.coins = guestCoins;
        gsRef.current.diamonds = 0; gsRef.current.energy = 50; // 👈 Ép về mặc định cho Khách
        
        if (guestLives < 10) {
          let lastLost = secureStorage.getItem('astro_guest_last_lost');
          gsRef.current.livesUpdatedAt = lastLost ? parseInt(lastLost) : getRealTime();
          if (!lastLost) secureStorage.setItem('astro_guest_last_lost', gsRef.current.livesUpdatedAt);
        } else { gsRef.current.livesUpdatedAt = null; }
        setUIUpdates(prev => ({ ...prev, lives: guestLives, coins: guestCoins, diamonds: 0, energy: 50 }));
      }
    });

    return () => { isMounted = false; unsubscribe(); if (unsubSnapshot) unsubSnapshot(); };
  }, []);

  return { currentUser, loginWithGoogle, loginWithApple, logout, deleteAccount, saveUserProfile };
}