import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { signInWithPopup, signInWithCredential, GoogleAuthProvider, OAuthProvider, updateProfile, signOut, onAuthStateChanged, browserPopupRedirectResolver } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { createNativeSocialLoginBridge } from '../utils/nativeSocialLoginV8.mjs';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase';
import { secureStorage } from '../utils/storageHelper';
import { t } from '../utils/translations';
import { DEFAULT_CAMPAIGN_DATA } from '../constants';
import { createDefaultCampaignData, parseGuestCampaign } from '../utils/profileSchema';
import { isCurrentAuthAttempt, canProcessSessionSnapshot, guestEnergyFromStorage } from '../utils/authSessionGuards.mjs';
import { runAuthBoundOperation } from '../utils/authRequestGuards.mjs';
import { GameApiError, openGameSession, fetchGameProfile, executeGameCommand, changePlayerName, deleteCloudAccount } from '../services/gameApi';

// One bridge per module: initialize native providers once, not on every button press.
const nativeSocial = createNativeSocialLoginBridge({
  plugin: SocialLogin,
  getPlatform: () => Capacitor.getPlatform(),
});

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

  const gameAction = useCallback((command, payload = {}, requestId = null) => {
    const expectedUid=auth.currentUser?.uid;
    const expectedAttempt=authAttemptRef.current;
    if (!expectedUid) return Promise.reject(new GameApiError('LOGIN_REQUIRED','Please sign in to use cloud game features'));
    return runQueued(() => runAuthBoundOperation({
      expectedUid, expectedAttempt,
      getCurrentUid:()=>auth.currentUser?.uid,
      getCurrentAttempt:()=>authAttemptRef.current,
      request:()=>executeGameCommand(command,payload,requestId),
      apply:reply=>{applyServerState(reply.state);return reply;}
    }));
  }, [runQueued,applyServerState]);

  // RC3 settlement writes through the Admin SDK, outside the legacy /command
  // queue. Re-read the canonical profile after a verified claim so every UI
  // surface observes exactly the server state rather than applying reward
  // deltas locally.
  const refreshCloudProfile = useCallback(() => {
    const expectedUid=auth.currentUser?.uid;
    const expectedAttempt=authAttemptRef.current;
    if (!expectedUid) return Promise.reject(new GameApiError('LOGIN_REQUIRED','Please sign in to refresh cloud profile'));
    return runQueued(() => runAuthBoundOperation({
      expectedUid, expectedAttempt,
      getCurrentUid:()=>auth.currentUser?.uid,
      getCurrentAttempt:()=>authAttemptRef.current,
      request:()=>fetchGameProfile(),
      apply:reply=>{applyServerState(reply.state);return reply.state;}
    }));
  }, [runQueued,applyServerState]);

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
      if (error?.code === 'ACCOUNT_DELETION_PENDING') {
        toast.error('Tài khoản đang được xử lý xóa. Không thể tiếp tục chơi.');
        secureStorage.removeItem('astro_session_id');
        await signOut(auth).catch(() => {});
        return false;
      }
      console.error('Cloud profile API unavailable:',error);
      toast.error('Máy chủ game không khả dụng. Không thể ghi tài nguyên hoặc tiến trình.');
      return false;
    }
  };

  const renamePlayer = async (name) => {
    const expectedUid=auth.currentUser?.uid;
    const expectedAttempt=authAttemptRef.current;
    if (!expectedUid) throw new GameApiError('LOGIN_REQUIRED','Please sign in to use cloud game features');
    return runAuthBoundOperation({
      expectedUid, expectedAttempt,
      getCurrentUid:()=>auth.currentUser?.uid,
      getCurrentAttempt:()=>authAttemptRef.current,
      request:()=>changePlayerName(name),
      apply:reply=>{
        applyServerState(reply.state);
        gsRef.current.myName=name;
        const user=auth.currentUser;
        if(user?.uid===expectedUid) updateProfile(user,{displayName:name}).catch(()=>{});
        setUIUpdates(prev=>({...prev,displayName:name}));
        return true;
      }
    });
  };

  const loginWithGoogle = async () => {
    const native = Capacitor.isNativePlatform();
    try {
      if (native) {
        toast.loading(t[langRef.current]?.loginOpening || 'Đang kết nối Google...', { id: 'nativeLogin' });
        const idToken = await nativeSocial.googleIdToken();
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
        toast.success(t[langRef.current]?.loginAppSuccess);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
        toast.success(t[langRef.current]?.loginWebSuccess);
      }
    } catch (error) {
      toast.error(t[langRef.current]?.loginFail || 'Đăng nhập thất bại');
    } finally {
      if (native) toast.dismiss('nativeLogin');
    }
  };

  const loginWithApple = async () => {
    try {
      // Apple OAuth on Android/web requires a separate Service ID and HTTPS
      // callback. Do not accidentally run an unconfigured redirect flow.
      if (Capacitor.getPlatform() !== 'ios') {
        toast.error('Apple Sign-In hiện chỉ được cấu hình cho ứng dụng iOS.');
        return;
      }
      toast.loading(t[langRef.current]?.loginOpening || 'Đang kết nối Apple...', { id: 'appleLogin' });
      const { idToken, rawNonce, givenName, familyName } = await nativeSocial.appleCredentialData();
      const credential = new OAuthProvider('apple.com').credential({ idToken, rawNonce });
      const userCredential = await signInWithCredential(auth, credential);
      const appleName = `${familyName} ${givenName}`.trim();
      if (appleName && !userCredential.user.displayName) {
        await updateProfile(userCredential.user, { displayName: appleName }).catch(() => {});
      }
      toast.success(t[langRef.current]?.loginAppSuccess || 'Đăng nhập thành công!');
    } catch (error) {
      toast.error(t[langRef.current]?.loginFail || 'Đăng nhập thất bại');
    } finally {
      toast.dismiss('appleLogin');
    }
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
      if (Capacitor.isNativePlatform()) await nativeSocial.logoutAll();
      
      setCurrentUser(null); 
      setScreen('portal'); 
      toast.success(t[langRef.current]?.logoutSuccess || 'Đã đăng xuất an toàn!');
    } catch (e) { 
      console.log(e); 
    }
  };

  const deleteAccount = async () => {
    const expectedUid = auth.currentUser?.uid;
    if (!expectedUid || currentUser?.uid !== expectedUid) return;
    const warningMsg = t[langRef.current]?.confirmDelete || 'BẠN CÓ CHẮC CHẮN XÓA TÀI KHOẢN?';
    if (!window.confirm(warningMsg)) return;

    const loadingToast = toast.loading(t[langRef.current]?.deletingAccount || 'Đang gửi yêu cầu xóa tài khoản...');
    try {
      const reply = await deleteCloudAccount(expectedUid);
      if (reply?.deletionPending !== true) throw new GameApiError('INVALID_DELETE_ACK','Server did not accept account deletion');
      // A late response for A must never sign out a newly signed-in user B.
      if (auth.currentUser?.uid !== expectedUid) return;
      authAttemptRef.current += 1;
      secureStorage.removeItem('astro_session_id');
      await signOut(auth).catch(() => {});
      if (Capacitor.isNativePlatform()) await nativeSocial.logoutAll();
      setCurrentUser(null);
      setScreen('portal');
      toast.success('Yêu cầu xóa tài khoản đã được tiếp nhận và đang được xử lý.');
    } catch (error) {
      if (error?.code === 'ACCOUNT_DELETION_UNAVAILABLE') {
        toast.error('Chức năng xóa tài khoản chưa sẵn sàng. Vui lòng liên hệ bộ phận hỗ trợ.');
      } else if (error?.code === 'REAUTH_REQUIRED') {
        toast.error('Vui lòng đăng nhập lại trước khi yêu cầu xóa tài khoản.');
      } else {
        toast.error('Không thể xác nhận yêu cầu xóa tài khoản. Vui lòng thử lại hoặc liên hệ hỗ trợ.');
      }
    } finally {
      toast.dismiss(loadingToast);
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


  return { currentUser, loginWithGoogle, loginWithApple, logout, deleteAccount, saveUserProfile, gameAction, refreshCloudProfile, renamePlayer };
}