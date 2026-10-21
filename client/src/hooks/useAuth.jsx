import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { signInWithPopup, signInWithCredential, GoogleAuthProvider, OAuthProvider, updateProfile, deleteUser, signOut, onAuthStateChanged, browserPopupRedirectResolver } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase';
import { secureStorage } from '../utils/storageHelper';
import { t } from '../utils/translations';
import { DEFAULT_CAMPAIGN_DATA } from '../constants';
import { createDefaultCampaignData, parseGuestCampaign } from '../utils/profileSchema';
import { isCurrentAuthAttempt, canProcessSessionSnapshot, guestEnergyFromStorage } from '../utils/authSessionGuards.mjs';
import { openGameSession, executeGameCommand, changePlayerName, deleteCloudAccount } from '../services/gameApi';

export function useAuth(gsRef, setUIUpdates, setScreen, langRef, getRealTime) {
  const [currentUser, setCurrentUser] = useState(null);
  const sessionListenerRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const authAttemptRef = useRef(0);

  // Reconcile only the server-signed canonical economic/profile state.
  const applyServerState = useCallback((data) => {
    if (!data) return;
    const s = gsRef.current;
    s.coins = data.coins; s.diamonds = data.diamonds;
    s.energy = data.energy; s.vipPoints = data.vipPoints;
    s.campaignData = data.campaignData;
    s.activeBattleId = data.activeBattle?.id || null;
    setUIUpdates(prev => ({...prev,coins:s.coins,diamonds:s.diamonds,energy:s.energy,vipPoints:s.vipPoints}));
  }, [gsRef,setUIUpdates]);

  const runQueued = useCallback(task => {
    const running = saveQueueRef.current.then(task,task);
    saveQueueRef.current = running.then(()=>undefined,()=>undefined);
    return running;
  }, []);

  const gameAction = useCallback((command, payload = {}, requestId = null) => runQueued(async () => {
    // The API rejects unauthenticated and stale sessions. No local fallback.
    const reply = await executeGameCommand(command, payload, requestId);
    applyServerState(reply.state);
    return reply;
  }), [runQueued,applyServerState]);

  // Phase1: saveUserProfile may update ONLY validated, non-economic preferences.
  // Legacy components calling save after local rewards cannot mint currency.
  const saveUserProfile = useCallback((specificUpdates = null) => {
    if (!auth.currentUser) {
      const state = gsRef.current;
      secureStorage.setItem('astro_guest_coins', Number.isFinite(state.coins) ? state.coins : 0);
      secureStorage.setItem('astro_guest_diamonds', Number.isFinite(state.diamonds) ? state.diamonds : 0);
      secureStorage.setItem('astro_guest_energy', Number.isFinite(state.energy) ? state.energy : 50);
      if (state.campaignData) secureStorage.setItem('astro_guest_campaign', state.campaignData);
      return Promise.resolve(true);
    }
    const c=gsRef.current.campaignData || {};
    const progress=c.progress || {};
    const prefs={
      loadout: {...(c.loadout||{})},
      currentPlanet: Number(progress.currentPlanet)||1,
      selectedStage: Number(progress.selectedStage)||1,
    };
    return gameAction('profile.preferences',prefs).then(()=>true).catch(error=>{
      console.warn('Profile preferences rejected:',error);
      return false;
    });
  }, [gsRef,gameAction]);

  const loadUserProfile = async (user, attempt) => {
    if (!user) return false;
    try {
      const reply=await openGameSession();
      // Auth state can change while the HTTPS session request is in flight.
      // Never apply a response belonging to a signed-out or superseded user.
      if (!isCurrentAuthAttempt(attempt, authAttemptRef.current, user.uid, auth.currentUser?.uid)) return false;
      secureStorage.setItem('astro_session_id',reply.sessionId);
      applyServerState(reply.state);
      gsRef.current.myName=user.displayName||'Player';
      setUIUpdates(prev=>({...prev,displayName:gsRef.current.myName,photoURL:user.photoURL||''}));
      setScreen(prev=>prev==='portal'?'campaign_portal':prev);
      return true;
    }catch(error){
      if (!isCurrentAuthAttempt(attempt, authAttemptRef.current, user.uid, auth.currentUser?.uid)) return false;
      console.error('Cloud profile API unavailable:',error);
      toast.error('Máy chủ game không khả dụng. Không thể ghi tài nguyên hoặc tiến trình.');
      return false;
    }
  };

  const renamePlayer = async (name) => {
    const reply=await changePlayerName(name);
    applyServerState(reply.state);
    gsRef.current.myName=name;
    if(auth.currentUser) updateProfile(auth.currentUser,{displayName:name}).catch(()=>{});
    setUIUpdates(prev=>({...prev,displayName:name}));
    return true;
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
      // Invalidate pending /session responses immediately, before signOut resolves.
      authAttemptRef.current += 1;
      // 1. Đánh dấu Offline trên DB
      // Presence is server-maintained. Client is forbidden to write users/{uid}.

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
      await deleteCloudAccount();
      await signOut(auth).catch(() => {});
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
      const attempt = ++authAttemptRef.current;
      // Stop listening to the previous user's document before opening a new session.
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }
      setCurrentUser(user);      
      if (user) {
        gsRef.current.myName = user.displayName || 'Player';
        const loaded = await loadUserProfile(user, attempt);
        if (!loaded || !isMounted || !isCurrentAuthAttempt(attempt, authAttemptRef.current, user.uid, auth.currentUser?.uid)) return;
        // --- CHỐNG ĐA THIẾT BỊ: Lắng nghe sessionId, đăng xuất nếu bị chiếm ---
        const userDocRef = doc(db, 'users', user.uid);
        sessionListenerRef.current = onSnapshot(userDocRef, (snap) => {
          // Firestore may emit a stale cached document first; wait for server data.
          if (!isMounted || !canProcessSessionSnapshot(snap, attempt, authAttemptRef.current, user.uid, auth.currentUser?.uid)) return;
          const remoteSession = snap.data().sessionId;
          const localSession = secureStorage.getItem('astro_session_id');
          if (remoteSession && localSession && remoteSession !== localSession) {
            toast.error(t[langRef.current]?.sessionKicked || '⚠️ Tài khoản đã đăng nhập ở thiết bị khác!');
            signOut(auth).then(() => {
              secureStorage.removeItem('astro_session_id');
              if (isMounted) { setCurrentUser(null); setScreen('portal'); }
            }).catch(() => {});
          }
        });
      } else {
        if (sessionListenerRef.current) {
          sessionListenerRef.current();
          sessionListenerRef.current = null;
        }
        let guestCoins = parseInt(secureStorage.getItem('astro_guest_coins')) || 0;
        let guestDiamonds = parseInt(secureStorage.getItem('astro_guest_diamonds')) || 0;
        let guestEnergy = guestEnergyFromStorage(secureStorage.getItem('astro_guest_energy'));
        
        gsRef.current.coins = guestCoins; 
        gsRef.current.diamonds = guestDiamonds; 
        gsRef.current.energy = guestEnergy; 

        setUIUpdates(prev => ({ ...prev, coins: guestCoins, diamonds: guestDiamonds, energy: guestEnergy, vipPoints: gsRef.current.vipPoints, displayName: 'Guest', photoURL: '' }));

        const guestCampaign = parseGuestCampaign(secureStorage.getItem('astro_guest_campaign'));
        gsRef.current.campaignData = guestCampaign || createDefaultCampaignData();
      }
    });

    return () => { isMounted = false; authAttemptRef.current += 1; unsubscribe(); if (sessionListenerRef.current) sessionListenerRef.current(); };
  }, []);


  return { currentUser, loginWithGoogle, loginWithApple, logout, deleteAccount, saveUserProfile, gameAction, renamePlayer };
}