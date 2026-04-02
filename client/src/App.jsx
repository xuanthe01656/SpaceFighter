import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { db, auth, googleProvider } from './firebase';
import { collection, addDoc, query, where, orderBy, limit, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,signInWithCredential, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { AdMob, RewardAdPluginEvents, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Device } from '@capacitor/device';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { t } from './utils/translations';
import { AppUpdate } from '@capawesome/capacitor-app-update';


// --- IMPORT CÁC HẰNG SỐ VÀ COMPONENT ĐÃ TÁCH ---
import { SKINS, BACKGROUNDS, PIPE_DIST_DESKTOP, PIPE_DIST_MOBILE, MAX_Y_DIFF } from './constants';
import Menu from './components/Menu';
import Lobby from './components/Lobby';
import Shop from './components/Shop';
import Leaderboard from './components/Leaderboard';
import GameOver from './components/GameOver';
import GameHUD from './components/GameHUD';
import { secureStorage } from './utils/storageHelper';

const imageCache = {};
const getImage = (src) => {
  if (!src) return null;
  if (!imageCache[src]) {
    const img = new Image();
    img.src = src;
    imageCache[src] = img;
  }
  return imageCache[src];
};

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 5 + 2;
    this.speedX = Math.random() * 4 - 2;
    this.speedY = Math.random() * 4 - 2;
    this.color = color;
    this.life = 100;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.life -= 2;
    this.size *= 0.95;
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.life / 100;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export default function Game() {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animationRef = useRef(null);
  const loadedImagesRef = useRef({});

  const [screen, setScreen] = useState('menu');
  const [lang, setLang] = useState(secureStorage.getItem('astro_lang') || 'vi');
  const [lobbyState, setLobbyState] = useState('main'); // 'main' or 'wait'
  const [leaderboardMode, setLeaderboardMode] = useState('single');
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [topRecords, setTopRecords] = useState({ 
    single: t[lang]?.topLoading || 'Đang tải...', 
    pvp: t[lang]?.topLoading || 'Đang tải...' 
  });
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [levelUpEffect, setLevelUpEffect] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const countdownTimerRef = useRef(null);
  // const [frameCount, setFrameCount] = useState(0);
  const [uiUpdates, setUIUpdates] = useState({ score: 0, level: 1, isVIP: false });
  const [currentUser, setCurrentUser] = useState(null);
  const [userRankData, setUserRankData] = useState(null);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [webAd, setWebAd] = useState({ isPlaying: false, type: null });
  const [isAdInitialized, setIsAdInitialized] = useState(false);
  const toggleLanguage = () => {
    const newLang = lang === 'vi' ? 'en' : 'vi';
    setLang(newLang);
    secureStorage.setItem('astro_lang', newLang);
  };
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  const gsRef = useRef({
    canvas: null,
    ctx: null,
    frames: 0,
    score: 0,
    level: 1,
    bestScore: 0,
    gameSpeed: 3,
    coins: 0,
    lives: 10,
    inventory: {
      skins: ['classic'], 
      bgs: ['deep']       
    },
    items: {
      shield: 0, 
      revive: 0  
    },
    isGameOver: false,
    isPlaying: false,
    isPaused: false,
    isMuted: false,
    isVIP: false,
    dailyCoinCount: 0,   // Số lần đã nhận xu hôm nay
    lastCoinDate: '',
    hourlyCoinCount: 0,  // Số lần nhận xu qua Quảng cáo (15 lần/giờ)
    lastCoinHour: '',
    userIP: 'unknown',
    gameMode: 'single',
    myName: 'Player',
    remoteName: 'Opponent',
    remoteScore: 0,
    remoteDead: false,
    isHost: false,
    pipeDistance: PIPE_DIST_DESKTOP,
    roomCode: null,
    lastFrameTime: 0,
    userSettings: { skin: 'classic', bg: 'deep' },

    cat: {
      x: 50,
      y: 150,
      radius: 15,
      velocity: 0,
      gravity: 0.25,
      jumpStrength: 5.5,
      rotation: 0,
      isInvincible: false,
      invincibleTimer: 0
    },
    pipes: { items: [], w: 60, gap: 170 },
    powerUps: [],
    particles: [],
    stars: [],
    background: { particles: [] },
    pools: { particles: [], pipes: [], powerUps: [] }
  });
  const getRealTime = () => Date.now() + (gsRef.current.timeOffset || 0);
// Thêm mới useEffect chuyên biệt cho bảo mật
useEffect(() => {
  const checkSecurity = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // Sử dụng await trực tiếp từ đối tượng Device
        const info = await Device.getInfo(); 
        
        if (info.isVirtual) {
          toast.error(t[langRef.current]?.errEmulator);
          setTimeout(() => {
             window.location.href = "about:blank";
          }, 3000);
          return;
        }

        const idResult = await Device.getId();
        gsRef.current.deviceId = idResult.uuid; // Lưu ID thiết bị để định danh
        console.log("Device ID Verified:", idResult.uuid);

      } catch (error) {
        console.error("Security Check Error:", error);
      }
    }
  };

  checkSecurity();
}, []);
useEffect(() => {
  const checkAppUpdate = async () => {
    // Chỉ chạy trên Native App (Android/iOS)
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await AppUpdate.getAppUpdateInfo();
        if (result.updateAvailability === 2) {
          console.log("Phát hiện bản cập nhật mới!");
          await AppUpdate.performImmediateUpdate();
          /* // Lựa chọn 2: CẬP NHẬT LINH HOẠT (Flexible) - Tùy bạn chọn
          // await AppUpdate.startFlexibleUpdate(); 
          */
        }
      } catch (error) {
        console.error("Lỗi khi kiểm tra bản cập nhật:", error);
      }
    }
  };

  checkAppUpdate();
}, []);
  // Preload skins
  useEffect(() => {
    SKINS.forEach(skin => {
      if (skin.imgSrc) {
        const img = new Image();
        img.src = skin.imgSrc;
        loadedImagesRef.current[skin.id] = img;
      }
    });
  }, []);
// Xóa đếm ngược nếu người dùng thoát ra ngoài lúc đang đếm
  useEffect(() => {
    if (screen !== 'game' && countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      setCountdown(null);
    }
  }, [screen]);
 // Get user IP và Đồng bộ thời gian Server (Có fallback dự phòng chống sập)
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => { gsRef.current.userIP = d.ip; })
      .catch(e => console.log("IP Error"));

    // 2. Lấy giờ chuẩn từ Internet (Chống hack đổi giờ máy)
    const syncTime = async () => {
      // Sử dụng các nguồn API ổn định hơn worldtimeapi
      const sources = [
        'https://timeapi.io/api/Time/current/zone?timeZone=UTC', // Nguồn 1: Cực kỳ ổn định
        'https://worldclockapi.com/api/json/utc/now'              // Nguồn 2: Dự phòng
      ];

      for (const url of sources) {
        try {
          // Giới hạn thời gian chờ 4 giây để game không bị treo nếu mạng lag
          const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) continue;
          
          const data = await res.json();
          // Hỗ trợ đọc cả 2 format của 2 API trên
          let timeString = data.dateTime || data.currentDateTime; 
          
          // Đảm bảo chuỗi thời gian luôn ở chuẩn UTC (thêm chữ Z ở cuối nếu thiếu)
          if (timeString && !timeString.endsWith('Z')) {
             timeString += 'Z';
          }

          const realTimeMs = new Date(timeString).getTime();
          
          if (!isNaN(realTimeMs)) {
            gsRef.current.timeOffset = realTimeMs - Date.now(); 
            console.log("✅ Đã đồng bộ giờ chuẩn từ:", url);
            return; // Lấy thành công thì thoát luôn, không chạy nguồn 2
          }
        } catch (error) {
          console.warn(`⚠️ Nguồn ${url} lỗi, đang thử nguồn tiếp theo...`);
        }
      }
      
      // Nếu tất cả API đều sập, đành dùng giờ của máy tính/điện thoại
      console.warn("❌ Tất cả API giờ đều lỗi, dùng giờ thiết bị cục bộ.");
      gsRef.current.timeOffset = 0; 
    };
    syncTime();
  }, []);

  // Socket.io setup
  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtxRef.current = new AudioContext();

    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '/';

    socketRef.current = io(SOCKET_URL, {
      transports: [ 'polling','websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    socketRef.current.on('room-created', (data) => {
      gsRef.current.roomCode = data.roomCode;
      setUIUpdates(prev => ({ ...prev, roomCode: data.roomCode }));
    });

    socketRef.current.on('game-start', (data) => {
      const opponent = data.players.find(p => p.id !== socketRef.current.id);
      if (opponent) gsRef.current.remoteName = opponent.name;
      startGame('online');
    });

    socketRef.current.on('opponent-update', (data) => {
      gsRef.current.remoteScore = data.score;
      gsRef.current.remoteDead = data.isDead;
      setUIUpdates(prev => ({ ...prev, remoteScore: data.score }));
    });

    socketRef.current.on('game-finished', () => {
      finishOnlineGame();
    });

    socketRef.current.on('opponent-disconnected', () => {
      toast.error(t[langRef.current]?.errOpponentDisconnect);
      setTimeout(() => location.reload(), 2000);
    });

    socketRef.current.on('join-failed', (data) => {
      toast.error((t[langRef.current]?.errRoomNotFound || '') + (data.error || ''));
    });

    loadTopRecords();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const Sound = {
    playTone: (freq, type, duration, vol = 0.1) => {
      if (gsRef.current.isMuted || !audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime);
      gain.gain.setValueAtTime(vol, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start();
      osc.stop(audioCtxRef.current.currentTime + duration);
    },
    jump: () => Sound.playTone(400, 'triangle', 0.1),
    score: () => Sound.playTone(1000, 'sine', 0.1, 0.2),
    hit: () => Sound.playTone(150, 'sawtooth', 0.3, 0.3),
    powerUp: () => Sound.playTone(600, 'square', 0.1),
    levelUp: () => {
      Sound.playTone(500, 'sine', 0.1);
      setTimeout(() => Sound.playTone(900, 'sine', 0.4), 200);
    },
    win: () => {
      Sound.playTone(600, 'square', 0.1);
      setTimeout(() => Sound.playTone(800, 'square', 0.2), 150);
    }
  };

  const createParticles = (x, y, color, count = 5) => {
    const gs = gsRef.current;
    for (let i = 0; i < count; i++) {
      let p;
      if (gs.pools.particles.length > 0) {
        // Tái chế hạt bụi cũ
        p = gs.pools.particles.pop();
        p.x = x; p.y = y; p.color = color;
        p.size = Math.random() * 5 + 2;
        p.speedX = Math.random() * 4 - 2;
        p.speedY = Math.random() * 4 - 2;
        p.life = 100;
      } else {
        // Hết đồ tái chế mới tạo mới
        p = new Particle(x, y, color);
      }
      gs.particles.push(p);
    }
  };

  const checkLevelUp = () => {
    let newLevel = 1;
    if (gsRef.current.score >= 100) newLevel = 5;
    else if (gsRef.current.score >= 75) newLevel = 4;
    else if (gsRef.current.score >= 50) newLevel = 3;
    else if (gsRef.current.score >= 20) newLevel = 2;

    if (newLevel > gsRef.current.level) {
      gsRef.current.level = newLevel;
      Sound.levelUp();
      setUIUpdates(prev => ({ ...prev, level: newLevel }));
      gsRef.current.gameSpeed = 3 + (newLevel - 1) * 0.6;
      gsRef.current.cat.gravity = 0.25 + (newLevel - 1) * 0.02;
      setLevelUpEffect(true);
      setTimeout(() => setLevelUpEffect(false), 1500);
    }
  };

  const addPipe = () => {
    const gs = gsRef.current;
    const canvas = gs.canvas;
    let xPos = canvas.width; 
    
    let isShortScreen = canvas.height < 500;
    let currentGap = Math.max(130, 170 - (gs.level * 5));
    
    if (isShortScreen) currentGap = Math.max(90, canvas.height * 0.35); 
    
    gs.pipes.gap = currentGap;
    let minPipeHeight = isShortScreen ? 25 : 50; 
    
    let maxAvailableY = canvas.height - currentGap - minPipeHeight;
    let topHeight;
    let lastPipe = gs.pipes.items[gs.pipes.items.length - 1];

    if (lastPipe) {
      let prevTop = lastPipe.initialTop;
      let minSafe = Math.max(minPipeHeight, prevTop - MAX_Y_DIFF);
      let maxSafe = Math.max(minSafe, Math.min(maxAvailableY, prevTop + MAX_Y_DIFF));
      topHeight = Math.floor(Math.random() * (maxSafe - minSafe + 1)) + minSafe;
    } else {
      let startMin = Math.max(minPipeHeight, canvas.height / 2 - 100);
      let startMax = Math.max(startMin, Math.min(maxAvailableY, canvas.height / 2 + 50));
      topHeight = Math.floor(Math.random() * (startMax - startMin + 1)) + startMin;
    }

    let type = 0;
    if (gs.score >= 20) {
      let rand = Math.random();
      if (gs.score >= 80) type = rand > 0.6 ? 2 : (rand > 0.3 ? 1 : 0);
      else if (gs.score >= 40) type = rand > 0.5 ? 2 : 0;
      else type = rand > 0.6 ? 1 : 0;
    }

    gs.pipes.items.push({
      x: xPos,
      top: topHeight,
      bottom: canvas.height - currentGap - topHeight,
      passed: false,
      type: type,
      moveDir: Math.random() > 0.5 ? 1 : -1,
      initialTop: topHeight
    });

    if (Math.random() < 0.4) {
      const randType = Math.random();
      let pType = 'COIN';
      if (randType > 0.75) pType = 'SHIELD';
      else if (randType > 0.5) pType = 'STAR';

      gs.powerUps.push({
        x: xPos + 30,
        y: topHeight + currentGap / 2,
        type: pType,
        active: true
      });
    }
  };

  const gameOver = () => {
    const gs = gsRef.current;
    if (gs.isGameOver) return;
    gs.isGameOver = true;
    Sound.hit();

    // 1. XỬ LÝ ĐIỂM SỐ (Gộp lại một chỗ cho gọn)
    if (gs.score > gs.bestScore) {
      gs.bestScore = gs.score;
      if (!currentUser) {
        secureStorage.setItem('astroCatBestScore', gs.bestScore);
      }
    }

    // 2. XỬ LÝ MẠNG VÀ THỜI GIAN HỒI MẠNG
    if (!gs.isVIP) { // CHỈ TRỪ MẠNG NẾU KHÔNG PHẢI VIP
      if (gs.lives > 0) {
        if (gs.lives >= 10 || !gs.livesUpdatedAt) {
          const now = getRealTime();
          gs.livesUpdatedAt = now;
          if (!currentUser) {
            secureStorage.setItem('astro_guest_last_lost', now);
          }
        }

        gs.lives -= 1;
        setUIUpdates(prev => ({ ...prev, lives: gs.lives }));

        if (!currentUser) {
          secureStorage.setItem('astro_guest_lives', gs.lives);
        }
      }
    }

    // 3. LƯU DỮ LIỆU
    if (currentUser) {
      saveUserProfile(); // Hàm này sẽ lưu cả highScore, lives và livesUpdatedAt lên Firestore
    } else {
      secureStorage.setItem('astro_guest_coins', gs.coins);
    }

    // 4. HIỆU ỨNG VÀ CHUYỂN SCREEN
    createParticles(gs.cat.x, gs.cat.y, 'orange', 20);
    createParticles(gs.cat.x, gs.cat.y, 'white', 10);

    if (gs.gameMode === 'single') {
      gs.isPlaying = false;
      setTimeout(() => {
        setUIUpdates(prev => ({
          ...prev,
          finalScore: gs.score,
          bestScore: gs.bestScore,
          coins: gs.coins
        }));
        setScreen('gameover');
      }, 800);
    } else {
      sendData();
    }
  };

  const sendData = () => {
    if (socketRef.current && gsRef.current.gameMode === 'online') {
      socketRef.current.emit('game-update', {
        score: gsRef.current.score,
        isDead: gsRef.current.isGameOver
      });
    }
  };

  const finishOnlineGame = () => {
    const gs = gsRef.current;
    gs.isPlaying = false;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const result = gs.score > gs.remoteScore ? 'WIN' : gs.score < gs.remoteScore ? 'LOSE' : 'DRAW';
    if (result === 'WIN') Sound.win();

    setUIUpdates(prev => ({
      ...prev,
      finalScore: gs.score,
      remoteScore: gs.remoteScore,
      gameResult: result,
      remoteName: gs.remoteName,
      coins: gs.coins
    }));
    setScreen('gameover');
    submitScore('pvp', false);
  };

  const submitScore = async (mode = 'single', isAuto = false, customName = '') => {
    const gs = gsRef.current;
    
    // Lấy thẳng User từ Firebase (luôn mới nhất), bỏ qua React State
    const user = auth.currentUser; 
    
    if (!user) {
      console.log("❌ Hủy lưu: Không tìm thấy tài khoản!");
      return false;
    }

    let name = '';
    let scoreToSend = gs.score;

    if (mode === 'single') {
      name = customName || secureStorage.getItem('astro_custom_name') || user.displayName;
      secureStorage.setItem('astro_custom_name', name);
      gsRef.current.myName = name;
      scoreToSend = gs.score;
    } else {
      // --- FORMAT PVP STRING ĐỂ TỔNG HỢP 1 RANK DUY NHẤT ---
      scoreToSend = gs.score; 
      
      const p1Name = gs.myName || 'Player';
      const p1Score = gs.score;
      const p2Name = gs.remoteName || 'Opponent';
      const p2Score = gs.remoteScore;
      
      // Giữ nguyên logic format chuỗi để đảm bảo đồng bộ dữ liệu trên Firebase
      if (p1Score > p2Score) {
        name = `${p1Name} (${p1Score}) ⚔️ ${p2Name} (${p2Score})`;
      } else if (p2Score > p1Score) {
        name = `${p2Name} (${p2Score}) ⚔️ ${p1Name} (${p1Score})`;
      } else {
        if (p1Name.localeCompare(p2Name) <= 0) {
          name = `${p1Name} (${p1Score}) ⚔️ ${p2Name} (${p2Score})`;
        } else {
          name = `${p2Name} (${p2Score}) ⚔️ ${p1Name} (${p1Score})`;
        }
      }
    }

    // Sử dụng t[lang] cho các thông báo Toast
    if (!isAuto) toast.loading(t[lang]?.savingScore || '💾 Đang kiểm tra và lưu kỷ lục...', { id: 'saveScore' });

    try {
      const docId = `${user.uid}_${mode}`;
      const scoreRef = doc(db, "leaderboard", docId);
      const snap = await getDoc(scoreRef);
      
      if (snap.exists() && snap.data().score >= scoreToSend) {
        if (!isAuto) {
          toast.dismiss('saveScore');
          // Format thông báo lỗi điểm thấp hơn kỷ lục cũ
          const msg = t[lang]?.errScoreNotBeaten || `❌ Điểm ván này (${scoreToSend}) chưa vượt qua Kỷ lục cũ (${snap.data().score}) của bạn!`;
          toast.error(msg.replace('(${scoreToSend})', `(${scoreToSend})`).replace('(${snap.data().score})', `(${snap.data().score})`));
        }
        return false; 
      }

      await setDoc(scoreRef, {
        uid: user.uid,
        name: name,
        score: scoreToSend,
        mode: mode,
        timestamp: serverTimestamp()
      });

      if (!isAuto) {
        toast.dismiss('saveScore');
        toast.success(t[lang]?.successNewRecord || '✅ Đã cập nhật kỷ lục mới!');
        setTimeout(() => openLeaderboard(mode), 1000);
      }
      return true;
    } catch (err) {
      if (!isAuto) {
        toast.dismiss('saveScore');
        toast.error((t[lang]?.errFirebase || '❌ Lỗi Firebase: ') + err.message);
      }
      console.error("Firebase Error:", err);
      return false;
    }
  };

  const openLeaderboard = async (mode = 'single') => {
    setLeaderboardMode(mode);
    setIsLoadingLeaderboard(true);
    setLeaderboardData([]);
    setUserRankData(null); 
    setScreen('leaderboard');

    try {
      // Tăng limit lên 20 để có chỗ bù trừ khi chúng ta gộp các ván đấu trùng lặp
      const q = query(
        collection(db, "leaderboard"), 
        where("mode", "==", mode), 
        orderBy("score", "desc"), 
        limit(mode === 'pvp' ? 20 : 10) 
      );
      
      const querySnapshot = await getDocs(q);
      let data = [];
      const seenNames = new Set(); // Bộ lọc trùng lặp

      querySnapshot.forEach((doc) => {
        const docData = doc.data();
        if (mode === 'pvp') {
          // Lọc: Nếu ván đấu này (chuỗi name) chưa có trong danh sách thì mới thêm vào
          if (!seenNames.has(docData.name)) {
            seenNames.add(docData.name);
            data.push({ ...docData, id: doc.id });
          }
        } else {
          data.push({ ...docData, id: doc.id });
        }
      });
      
      // Sau khi lọc xong, cắt lại cho đúng chuẩn Top 10
      if (data.length > 10) data = data.slice(0, 10);
      
      setLeaderboardData(data);

      // --- TÍNH HẠNG CỦA CÁ NHÂN (NẾU ĐÃ ĐĂNG NHẬP) ---
      if (currentUser) {
        const userDocId = `${currentUser.uid}_${mode}`;
        const userDocRef = doc(db, "leaderboard", userDocId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const uData = userDocSnap.data();
          const isInTop10 = data.some(item => item.id === userDocId);
          
          if (!isInTop10) {
            const higherQ = query(
              collection(db, "leaderboard"),
              where("mode", "==", mode),
              where("score", ">", uData.score)
            );
            const higherSnap = await getDocs(higherQ);
            const rank = higherSnap.docs.length + 1;
            setUserRankData({ ...uData, rank: rank });
          }
        }
      }
    } catch (err) {
      console.error("Firebase Query Error:", err);
      setLeaderboardData([]);
    }
    setIsLoadingLeaderboard(false);
  };

  const loadTopRecords = () => {
    const fetchTop = async (mode, key) => {
      try {
        const q = query(
          collection(db, "leaderboard"), 
          where("mode", "==", mode), 
          orderBy("score", "desc"), 
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const topData = querySnapshot.docs[0].data();
          let name = topData.name;
          if (mode === 'pvp' && name.length > 25) name = name.substring(0, 25) + '...';
          
          const displayText = mode === 'single'
                ? `${name} - ${topData.score}`
                : `${name} (${topData.score})`;
          setTopRecords(prev => ({ ...prev, [key]: displayText }));
        } else {
          // Thay 'Chưa có' bằng key trong từ điển
          setTopRecords(prev => ({ ...prev, [key]: t[lang]?.topNone || 'Chưa có' }));
        }
      } catch (error) {
        console.error("Top records error:", error);
        // Thay 'Lỗi tải' bằng key trong từ điển
        setTopRecords(prev => ({ ...prev, [key]: t[lang]?.topError || 'Lỗi tải' }));
      }
    };

    fetchTop('single', 'single');
    fetchTop('pvp', 'pvp');
  };
 
  const createRoom = (playerName) => {
    // 1. Kiểm tra đăng nhập
    if (!currentUser) return toast.error(t[lang]?.reqLogin || 'Vui lòng đăng nhập!');
    // 2. Kiểm tra tên người chơi
    if (!playerName || playerName.length < 2) {
      toast.error(t[lang]?.reqName || 'Vui lòng nhập tên (ít nhất 2 ký tự)!');
      return;
    }
    // Cập nhật thông tin vào Ref và Storage
    gsRef.current.myName = playerName;
    secureStorage.setItem('astro_custom_name', playerName);
    gsRef.current.isHost = true;
    setLobbyState('wait');
    // 3. Thông báo tạo phòng thành công
    toast.success(t[lang]?.roomCreated || '✅ Phòng đã tạo thành công!');
    // Emit socket với settings hiện tại
    socketRef.current.emit('create-room', {
      name: playerName,
      settings: gsRef.current.userSettings
    });
  };
  const joinRoom = (playerName, roomCode) => {
    // 1. Kiểm tra đăng nhập
    if (!currentUser) return toast.error(t[lang]?.loginRequired || 'Vui lòng đăng nhập!');
    // 2. Kiểm tra tên người chơi
    if (!playerName || playerName.length < 2) {
      toast.error(t[lang]?.nameTooShort || 'Vui lòng nhập tên (ít nhất 2 ký tự)!');
      return;
    }
    // 3. Kiểm tra mã phòng
    if (!roomCode) {
      toast.error(t[lang]?.enterRoomCode || 'Vui lòng nhập mã!');
      return;
    }
    // Cập nhật thông tin vào Ref và Storage
    gsRef.current.myName = playerName;
    secureStorage.setItem('astro_custom_name', playerName);
    // 4. Thông báo đang kết nối
    toast.loading(t[lang]?.connecting || '🔗 Đang kết nối...');
    // Emit socket
    socketRef.current.emit('join-room', {
      roomCode: roomCode,
      playerName: playerName
    });
  };

  const openShop = () => {
    setScreen('shop');
  };

  const closeShop = () => {
    secureStorage.setItem('astroCatSettings', JSON.stringify(gsRef.current.userSettings));
    setScreen('menu');
  };

  const selectSkin = (skinId) => {
    gsRef.current.userSettings.skin = skinId;
    setUIUpdates(prev => ({ ...prev, selectedSkin: skinId }));
  };

  const selectBg = (bgId) => {
    gsRef.current.userSettings.bg = bgId;
    gsRef.current.background.particles = []; 
    setUIUpdates(prev => ({ ...prev, selectedBg: bgId }));
  };

  const initGame = () => {
    const gs = gsRef.current;
    gs.cat.y = 150;
    gs.cat.velocity = 0;
    gs.cat.rotation = 0;
    gs.cat.isInvincible = false;
    gs.score = 0;
    gs.level = 1;
    gs.frames = 0;
    gs.isGameOver = false;
    gs.isPaused = false;
    gs.gameSpeed = 3;
    gs.cat.gravity = 0.25;
    // Thu gom toàn bộ rác từ ván trước đưa vào kho tái chế
    gs.pools.pipes.push(...gs.pipes.items);
    gs.pools.powerUps.push(...gs.powerUps);
    gs.pools.particles.push(...gs.particles);
    // Làm trống sân chơi
    gs.powerUps = [];
    gs.particles = [];
    gs.pipes.items = [];

    const bg = BACKGROUNDS.find(b => b.id === gs.userSettings.bg) || BACKGROUNDS[0];
    gs.background.particles = [];
    
    if (bg.type === 'stars') {
      for (let i = 0; i < 100; i++) {
        gs.background.particles.push({ x: Math.random() * gs.canvas.width, y: Math.random() * gs.canvas.height, size: Math.random() * 2, speed: Math.random() * 2 + 0.5 });
      }
   } else if (bg.type === 'aurora') {
      // Tạo ít dải lụa hơn nhưng chất lượng hơn
      const waveColors = ['rgba(0, 255, 238,', 'rgba(0, 255, 140,']; // Màu Cyan và Green neon
      for (let i = 0; i < 6; i++) { 
        gs.background.particles.push({ 
          x: Math.random() * gs.canvas.width, 
          // y ở nửa trên màn hình
          y: Math.random() * gs.canvas.height * 0.4 + gs.canvas.height * 0.1, 
          height: Math.random() * 200 + 150, // Độ cao của dải lụa
          speed: Math.random() * 0.3 + 0.1, // Trôi rất chậm
          // Các thông số để tạo sóng (Wavy effect)
          color: waveColors[i % 2],
          phase: Math.random() * Math.PI * 2, // Điểm bắt đầu của sóng
          freqX: Math.random() * 0.005 + 0.002, // Độ dài sóng
          amplitude: Math.random() * 20 + 10 // Độ cao sóng
        }); 
      }
    } else if (bg.type === 'bubbles') {
      for (let i = 0; i < 30; i++) {
        gs.background.particles.push({ x: Math.random() * gs.canvas.width, y: Math.random() * gs.canvas.height, size: Math.random() * 15 + 5, speed: Math.random() * 1 + 0.5, floatOffset: Math.random() * Math.PI * 2 });
      }
    } else if (bg.type === 'fireflies') {
      for (let i = 0; i < 50; i++) {
        gs.background.particles.push({ x: Math.random() * gs.canvas.width, y: Math.random() * gs.canvas.height, size: Math.random() * 3 + 1, speed: Math.random() * 1.5 + 0.5, flicker: Math.random() * 0.1 });
      }
    } else if (bg.type === 'meteors') {
      for (let i = 0; i < 25; i++) {
        // Tạo hình dáng đa giác gồ ghề ngẫu nhiên cho từng viên đá
        const vertices = [];
        const sides = Math.floor(Math.random() * 3) + 5; // 5 đến 7 cạnh
        for (let j = 0; j < sides; j++) {
          vertices.push(Math.random() * 0.4 + 0.8); // Độ gồ ghề của đá
        }
        gs.background.particles.push({ 
          x: Math.random() * gs.canvas.width, 
          y: Math.random() * gs.canvas.height, 
          size: Math.random() * 15 + 10, // Kích thước to hơn
          speedX: Math.random() * 2 + 1,
          //speedY: Math.random() * 2 + 1,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.05, // Tốc độ xoay
          vertices: vertices
        });
      }
    } else if (bg.type === 'hyperspace') {
      // Đa dạng màu sắc chuẩn Cyberpunk/Không gian
      const colors = ['#ffffff', '#00ffff', '#8a2be2', '#ff00ff']; 
      for (let i = 0; i < 60; i++) { 
        gs.background.particles.push({ 
          x: Math.random() * gs.canvas.width, 
          y: Math.random() * gs.canvas.height, 
          length: Math.random() * 80 + 30, // Vệt dài hơn tạo cảm giác siêu tốc
          speed: Math.random() * 3 + 2,
          color: colors[Math.floor(Math.random() * colors.length)], // Lấy màu ngẫu nhiên
          thickness: Math.random() * 2 + 1
        }); 
      }
    }

    let startX = 300;
    let currentX = startX;
    while (currentX < gs.canvas.width + gs.pipeDistance) {
      let xPos = currentX;
      
      let isShortScreen = gs.canvas.height < 500;
      let currentGap = Math.max(130, 170 - (gs.level * 5));
      if (isShortScreen) currentGap = Math.max(90, gs.canvas.height * 0.35);
      
      gs.pipes.gap = currentGap;
      let minPipeHeight = isShortScreen ? 25 : 50;
      let maxAvailableY = gs.canvas.height - currentGap - minPipeHeight;
      
      let topHeight;
      let lastPipe = gs.pipes.items[gs.pipes.items.length - 1];

      if (lastPipe) {
        let prevTop = lastPipe.initialTop;
        let minSafe = Math.max(minPipeHeight, prevTop - MAX_Y_DIFF);
        let maxSafe = Math.max(minSafe, Math.min(maxAvailableY, prevTop + MAX_Y_DIFF));
        topHeight = Math.floor(Math.random() * (maxSafe - minSafe + 1)) + minSafe;
      } else {
        let startMin = Math.max(minPipeHeight, gs.canvas.height / 2 - 100);
        let startMax = Math.max(startMin, Math.min(maxAvailableY, gs.canvas.height / 2 + 50));
        topHeight = Math.floor(Math.random() * (startMax - startMin + 1)) + startMin;
      }

      let type = 0;
      if (gs.score >= 20) {
        let rand = Math.random();
        if (gs.score >= 80) type = rand > 0.6 ? 2 : (rand > 0.3 ? 1 : 0);
        else if (gs.score >= 40) type = rand > 0.5 ? 2 : 0;
        else type = rand > 0.6 ? 1 : 0;
      }

      gs.pipes.items.push({
        x: xPos,
        top: topHeight,
        bottom: gs.canvas.height - currentGap - topHeight,
        passed: false,
        type: type,
        moveDir: Math.random() > 0.5 ? 1 : -1,
        initialTop: topHeight
      });

      if (Math.random() < 0.3) {
        gs.powerUps.push({
          x: xPos + 30,
          y: topHeight + currentGap / 2,
          type: Math.random() > 0.5 ? 'SHIELD' : 'STAR',
          active: true
        });
      }

      currentX += gs.pipeDistance;
    }

    setUIUpdates(prev => ({
      ...prev,
      score: 0,
      level: 1,
      remoteScore: 0
    }));
  };

 const startGame = (mode) => {
    if (!gsRef.current.isVIP && gsRef.current.lives <= 0) {
      // Sử dụng t[lang] để hiển thị đúng ngôn ngữ người dùng đã chọn
      toast.error(t[lang]?.errNoLivesPlay || '❌ Bạn đã hết mạng! Hãy chờ hồi phục hoặc Xem quảng cáo.');
      return;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    gsRef.current.gameMode = mode;
    gsRef.current.isPlaying = true;
    gsRef.current.isGameOver = false;
    gsRef.current.remoteScore = 0;
    gsRef.current.remoteDead = false;
    gsRef.current.isPaused = true; // KHOÁ TRÒ CHƠI LẠI ĐỂ ĐẾM NGƯỢC

    setScreen('game');
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();

    const canvas = canvasRef.current;
    if (!canvas) return;

    gsRef.current.canvas = canvas;
    gsRef.current.ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gsRef.current.pipeDistance = canvas.width < 600 ? PIPE_DIST_MOBILE : PIPE_DIST_DESKTOP;
    gsRef.current.cat.radius = window.innerHeight < 500 ? 10 : 15;
    
    initGame();

    // Vẽ khung hình đầu tiên để người chơi thấy rõ vị trí con mèo
    gsRef.current.ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawCat();

    // --- LOGIC ĐẾM NGƯỢC ---
    setCountdown(3);
    Sound.jump(); // Âm báo "Bíp"

    let count = 3;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        Sound.jump(); // Bíp
      } else if (count === 0) {
        setCountdown('GO!');
        Sound.levelUp(); // Bíp dài
      } else {
        clearInterval(countdownTimerRef.current);
        setCountdown(null);
        gsRef.current.isPaused = false; // MỞ KHÓA TRÒ CHƠI
        gsRef.current.lastFrameTime = 0;
        loop(); // Bắt đầu vòng lặp đồ họa
      }
    }, 1000);
  };

  const updateCat = () => {
    const gs = gsRef.current;
    const canvas = gs.canvas;
    if (gs.isGameOver) return;

    gs.cat.velocity += gs.cat.gravity;
    gs.cat.y += gs.cat.velocity;

    if (gs.cat.y + gs.cat.radius >= canvas.height || gs.cat.y - gs.cat.radius <= 0) {
      if (!gs.cat.isInvincible) {
        gameOver();
      } else {
        gs.cat.velocity = -gs.cat.velocity * 0.8;
        gs.cat.y = Math.max(gs.cat.radius, Math.min(canvas.height - gs.cat.radius, gs.cat.y));
      }
    }

    if (gs.cat.isInvincible) {
      gs.cat.invincibleTimer--;
      if (gs.cat.invincibleTimer <= 0) gs.cat.isInvincible = false;
    }

    for (let p of gs.pipes.items) {
      if (gs.cat.x + gs.cat.radius > p.x && gs.cat.x - gs.cat.radius < p.x + gs.pipes.w) {
        if (gs.cat.y - gs.cat.radius < p.top || gs.cat.y + gs.cat.radius > canvas.height - p.bottom) {
          if (!gs.cat.isInvincible) gameOver();
        }
      }
      if (p.x + gs.pipes.w < gs.cat.x && !p.passed && !gs.isGameOver) {
        gs.score++;
        p.passed = true;
        Sound.score();
        
        // CẬP NHẬT ĐIỂM TRỰC TIẾP
        const scoreVal = document.getElementById('scoreVal');
        if (scoreVal) scoreVal.innerText = gs.score;
        const pvpScoreYou = document.getElementById('pvpScoreYou');
        if (pvpScoreYou) pvpScoreYou.innerText = gs.score;

        checkLevelUp();
        if (gs.gameMode === 'online') sendData();
      }
    }
  };

  const drawCat = () => {
    const gs = gsRef.current;
    const ctx = gs.ctx;
    const cat = gs.cat;

    if (gs.isGameOver && gs.gameMode === 'online') ctx.globalAlpha = 0.5;

    ctx.save();
    ctx.translate(cat.x, cat.y);

    const targetRotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, cat.velocity * 0.1));
    if (gs.isGameOver) {
      cat.rotation += 0.2; 
    } else {
      cat.rotation = targetRotation;
    }
    ctx.rotate(cat.rotation);

    const currentSkin = SKINS.find(s => s.id === gs.userSettings.skin) || SKINS[0];
    const catSrc = gs.isGameOver ? currentSkin.imgDead : currentSkin.imgAlive;
    const catImg = getImage(catSrc);

    if (catImg && catImg.complete && catImg.naturalWidth !== 0) {
      const size = cat.radius * 2.8;
      ctx.drawImage(catImg, -size / 2, -size / 2, size, size);
      
      if (cat.isInvincible && !gs.isGameOver) {
        ctx.beginPath();
        ctx.arc(0, 0, cat.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, ${Math.random() * 0.8})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else {
      const mainColor = currentSkin.color;
      ctx.beginPath();
      ctx.arc(0, 0, cat.radius, 0, Math.PI * 2);
      ctx.fillStyle = mainColor;
      ctx.fill();
      ctx.stroke();

      if (gs.isGameOver) {
        ctx.fillStyle = '#000';
        ctx.font = '14px Arial';
        ctx.fillText('x', -8, 4);
        ctx.fillText('x', 2, 4);
      }
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const drawPipes = () => {
    const gs = gsRef.current;
    const ctx = gs.ctx;
    const canvas = gs.canvas;

    for (let p of gs.pipes.items) {
      let coreColor, glowColor, borderColor;

      // Phân loại màu sắc theo Type
      if (p.type === 1) { // Loại 1: Nguy hiểm (Rung lắc)
        coreColor = '#ffb8b8'; // Lõi trắng hồng
        glowColor = '#ff4757'; // Glow đỏ neon
        borderColor = '#c0392b';
      } else if (p.type === 2) { // Loại 2: Di chuyển lên xuống
        coreColor = '#e0c3fc'; // Lõi trắng tím
        glowColor = '#a55eea'; // Glow tím neon
        borderColor = '#8854d0';
      } else { // Loại 0: Đứng im bình thường
        coreColor = '#c7ecee'; // Lõi trắng xanh
        glowColor = '#00FFFF'; // Glow xanh Cyan
        borderColor = '#0abde3';
      }

      const shake = p.type === 1 ? Math.random() * 4 - 2 : 0; // Lắc mạnh hơn
      const currentX = p.x + shake;

      // Hàm vẽ từng Cột Năng Lượng (Trên và Dưới)
      const drawEnergyPillar = (y, height, isTop) => {
        // 1. Quầng sáng (Fake Neon Glow - Thay cho shadowBlur)
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = 0.2; // Lớp viền mờ to ngoài cùng
        ctx.fillRect(currentX - 5, y, gs.pipes.w + 10, height);
        ctx.globalAlpha = 0.5; // Lớp viền mờ nhỏ bên trong
        ctx.fillRect(currentX - 2, y, gs.pipes.w + 4, height);

        // 2. Lõi Laser (Inner Core)
        ctx.fillStyle = coreColor;
        ctx.globalAlpha = 1;
        const coreWidth = gs.pipes.w * 0.4;
        const coreOffset = (gs.pipes.w - coreWidth) / 2;
        ctx.fillRect(currentX + coreOffset, y, coreWidth, height);

        // 3. Viền công nghệ
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(currentX, y, gs.pipes.w, height);

        // 4. Vòng năng lượng di chuyển (Animation)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const offset = (gs.frames * 2) % 40; 
        for (let k = (isTop ? y + height : y) - offset; isTop ? k > y : k < y + height; isTop ? k -= 40 : k += 40) {
           if (k > y && k < y + height) {
              ctx.moveTo(currentX, k);
              ctx.lineTo(currentX + gs.pipes.w, k);
           }
        }
        ctx.stroke();
        
        // 5. Đế phát Laser 
        ctx.fillStyle = '#1e272e'; 
        const baseHeight = 15;
        const baseY = isTop ? y + height - baseHeight : y;
        
        ctx.fillRect(currentX - 4, baseY, gs.pipes.w + 8, baseHeight);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(currentX - 4, baseY, gs.pipes.w + 8, baseHeight);
      };

      // Gọi hàm vẽ cột trên và cột dưới
      drawEnergyPillar(0, p.top, true);
      drawEnergyPillar(canvas.height - p.bottom, p.bottom, false);

      // Thêm Icon cảnh báo nhấp nháy cho cột nguy hiểm (Type 1)
      if (p.type === 1) {
        const alpha = 0.5 + Math.abs(Math.sin(gs.frames * 0.2)) * 0.5;
        // 1. Vẽ quầng sáng đỏ mờ (Thay thế cho shadowBlur bị lag)
        ctx.fillStyle = `rgba(255, 71, 87, ${alpha * 0.6})`;
        ctx.font = 'bold 32px Arial'; 
        ctx.fillText('!', currentX + gs.pipes.w/2 - 8, p.top - 34);
        ctx.fillText('!', currentX + gs.pipes.w/2 - 8, canvas.height - p.bottom + 46);
        // 2. Vẽ lõi trắng sắc nét đè lên trên
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = 'bold 24px Arial';
        ctx.fillText('!', currentX + gs.pipes.w/2 - 6, p.top - 35);
        ctx.fillText('!', currentX + gs.pipes.w/2 - 6, canvas.height - p.bottom + 45);
        
        ctx.globalAlpha = 1;
      }
    }
  };

  const updatePipes = () => {
    const gs = gsRef.current;
    const canvas = gs.canvas;

    const lastPipe = gs.pipes.items[gs.pipes.items.length - 1];
    if (lastPipe) {
      const distFromRight = canvas.width - (lastPipe.x + gs.pipes.w);
      if (distFromRight >= gs.pipeDistance) addPipe();
    } else {
      addPipe();
    }

    for (let i = gs.pipes.items.length - 1; i >= 0; i--) {
      const p = gs.pipes.items[i];

      if (!gs.isGameOver || (gs.gameMode === 'online' && !gs.remoteDead)) {
        p.x -= gs.gameSpeed;
      }

      if (p.type === 2) {
        p.top += p.moveDir * (1 + gs.level * 0.2);
        if (Math.abs(p.top - p.initialTop) > 60) p.moveDir *= -1;
        p.bottom = canvas.height - gs.pipes.gap - p.top;
      }

      if (p.x + gs.pipes.w < 0) {
        // Tái chế ống nước thay vì xóa
        const deadPipe = gs.pipes.items.splice(i, 1)[0];
        gs.pools.pipes.push(deadPipe);
      }
    }
  };

  const drawBackground = () => {
    const gs = gsRef.current;
    const ctx = gs.ctx;
    const canvas = gs.canvas;
    const bg = BACKGROUNDS.find(b => b.id === gs.userSettings.bg) || BACKGROUNDS[0];

    // TỐI ƯU HÓA: Tạo Off-screen Canvas để cache background gradient
    if (!gs.cachedBg || gs.cachedBgId !== bg.id || gs.cachedBg.width !== canvas.width) {
      const offScreen = document.createElement('canvas');
      offScreen.width = canvas.width;
      offScreen.height = canvas.height;
      const offCtx = offScreen.getContext('2d');
      
      const grd = offCtx.createLinearGradient(0, 0, 0, canvas.height);
      grd.addColorStop(0, bg.top);
      grd.addColorStop(1, bg.bottom);
      offCtx.fillStyle = grd;
      offCtx.fillRect(0, 0, canvas.width, canvas.height);
      
      gs.cachedBg = offScreen;
      gs.cachedBgId = bg.id;
    }

    // Vẽ nền đã cache (Cực kỳ nhẹ)
    ctx.drawImage(gs.cachedBg, 0, 0);

    // Vẽ hạt (Particles) theo từng Type
    const speedMult = gs.gameSpeed / 2;
    if (bg.type === 'stars') {
      ctx.fillStyle = '#fff';
      for (let p of gs.background.particles) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        if (!gs.isGameOver) p.x -= p.speed * speedMult;
        if (p.x < 0) { p.x = canvas.width; p.y = Math.random() * canvas.height; }
      }
    } else if (bg.type === 'aurora') {
      // CHẾ ĐỘ HÒA TRỘN LÀM SÁNG (Mượt và đẹp hơn cho hiệu ứng ánh sáng)
      ctx.globalCompositeOperation = 'lighter'; 
      
      for (let p of gs.background.particles) {
        // Tạo hiệu ứng lấp lánh nhẹ (Shimmer) theo thời gian
        const flicker = Math.sin(gs.frames * 0.02 + p.phase) * 0.05 + 0.15;
        
        // Tạo Gradient dọc cho dải lụa: Đậm ở dưới, mờ dần lên trên
        const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.height);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)'); // Đỉnh dải lụa mờ tịt
        grad.addColorStop(0.5, `${p.color} ${flicker})`); // Giữa dải lụa sáng màu
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)'); // Chân dải lụa mờ tịt

        ctx.fillStyle = grad;
        
        // Vẽ dải lụa gợn sóng dùng Sine Wave
        ctx.beginPath();
        const startY = p.y;
        
        // Vẽ cạnh trên của dải lụa
        for (let x = 0; x < canvas.width; x += 10) {
          const wavyY = startY + Math.sin(x * p.freqX + gs.frames * 0.01 + p.phase) * p.amplitude;
          if (x === 0) ctx.moveTo(p.x + x, wavyY);
          else ctx.lineTo(p.x + x, wavyY);
        }
        
        // Vẽ cạnh dưới của dải lụa (cách cạnh trên một khoảng p.height)
        for (let x = canvas.width; x >= 0; x -= 10) {
          const wavyY = startY + p.height + Math.sin(x * p.freqX + gs.frames * 0.01 + p.phase) * p.amplitude;
          ctx.lineTo(p.x + x, wavyY);
        }
        
        ctx.closePath();
        ctx.fill();

        // Cập nhật vị trí trôi chậm
        if (!gs.isGameOver) p.x -= p.speed * speedMult;
        if (p.x < -canvas.width) p.x = canvas.width;
      }
      
      // RESET VỀ CHẾ ĐỘ HÒA TRỘN MẶC ĐỊNH
      ctx.globalCompositeOperation = 'source-over'; 

    } else if (bg.type === 'bubbles') {
      for (let p of gs.background.particles) {
        // 1. Vẽ vỏ bong bóng thủy tinh
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; 
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
        
        // 2. Thêm đốm sáng phản chiếu (Highlight 3D) rất nhẹ
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath(); 
        ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.25, 0, Math.PI * 2); 
        ctx.fill();

        if (!gs.isGameOver) {
          p.x -= p.speed * speedMult;
          p.y += Math.sin(gs.frames * 0.02 + p.floatOffset) * 0.5; // Bay lượn sóng
        }
        if (p.x < -p.size) { p.x = canvas.width; p.y = Math.random() * canvas.height; }
      }
    } else if (bg.type === 'fireflies') {
      for (let p of gs.background.particles) {
        const alpha = 0.2 + Math.abs(Math.sin(gs.frames * p.flicker)); // Nhịp thở lấp lánh
        
        // 1. Vẽ quầng sáng mờ tỏa ra xung quanh (Glow không giật lag)
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.3})`; // Vàng nhạt mờ
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.fill();
        
        // 2. Vẽ lõi đóm lửa rực sáng
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.3})`; // Trắng sáng
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2); ctx.fill();

        if (!gs.isGameOver) p.x -= p.speed * speedMult;
        if (p.x < -p.size * 3) { p.x = canvas.width; p.y = Math.random() * canvas.height; }
      }
    } else if (bg.type === 'meteors') {
      for (let p of gs.background.particles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        
        //ctx.shadowColor = 'rgba(0,0,0,0.5)';
        //ctx.shadowBlur = 8; // Bóng đổ không gian

        // 1. Vẽ khung đa giác của tảng đá
        ctx.beginPath();
        for (let i = 0; i < p.vertices.length; i++) {
          const angle = (i / p.vertices.length) * Math.PI * 2;
          const r = p.size * p.vertices[i];
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        
        // Tô màu vành đai và viền
        ctx.fillStyle = '#636e72'; 
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#2d3436';
        ctx.stroke();

        // 2. Vẽ hố thiên thạch (craters) tạo độ sâu 3D
        ctx.fillStyle = '#2d3436';
        ctx.beginPath(); ctx.arc(-p.size/3, -p.size/4, p.size/4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.size/4, p.size/3, p.size/6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.size/3, -p.size/5, p.size/8, 0, Math.PI*2); ctx.fill();
        
        ctx.restore();

        // Cập nhật vị trí và góc xoay
        if (!gs.isGameOver) { 
          p.x -= p.speedX * speedMult; 
          p.rotation += p.rotSpeed; 
        }
        if (p.x < -p.size*2) { 
          p.x = canvas.width + Math.random() * 100; 
          p.y = Math.random() * canvas.height; // Trồi lên ở một độ cao ngẫu nhiên
        }
      }
    } else if (bg.type === 'hyperspace') {
      for (let p of gs.background.particles) {
        // Gradient để đuôi vệt sáng mờ dần (Trong suốt)
        const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.length, p.y);
        grad.addColorStop(0, p.color); // Đầu vệt sáng rõ màu
        grad.addColorStop(1, 'rgba(0,0,0,0)'); // Đuôi tan biến
        
        ctx.strokeStyle = grad; 
        ctx.lineWidth = p.thickness;
        ctx.lineCap = 'round';
        
        // Hiệu ứng phát sáng Neon cực mạnh
        //ctx.shadowBlur = 15;
        //ctx.shadowColor = p.color;

        ctx.beginPath(); 
        ctx.moveTo(p.x, p.y); 
        ctx.lineTo(p.x + p.length, p.y); 
        ctx.stroke();
        
        //ctx.shadowBlur = 0; // Reset bóng để không lỗi các vật khác

        if (!gs.isGameOver) p.x -= p.speed * speedMult;
        if (p.x < -p.length) { 
          p.x = canvas.width + Math.random() * 200; 
          p.y = Math.random() * canvas.height; 
        }
      }
    }
  };

  const updatePowerUps = () => {
    const gs = gsRef.current;
    const ctx = gs.ctx;

    for (let i = gs.powerUps.length - 1; i >= 0; i--) {
      const p = gs.powerUps[i];
      if (!gs.isGameOver) p.x -= gs.gameSpeed;

      if (p.active) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        
        if (p.type === 'SHIELD') { ctx.fillStyle = '#00FFFF'; ctx.font = '20px Arial'; ctx.fillText('🛡️', p.x - 10, p.y + 5); } 
        else if (p.type === 'STAR') { ctx.fillStyle = '#FFFF00'; ctx.font = '20px Arial'; ctx.fillText('⭐', p.x - 10, p.y + 5); } 
        else if (p.type === 'COIN') { ctx.fillStyle = '#FFD700'; ctx.font = '20px Arial'; ctx.fillText('🪙', p.x - 10, p.y + 5); }
        
        ctx.globalAlpha = 0.5 + Math.sin(gs.frames * 0.1) * 0.4;
        ctx.fill(); ctx.globalAlpha = 1;

        if (Math.hypot(gs.cat.x - p.x, gs.cat.y - p.y) < gs.cat.radius + 15 && !gs.isGameOver) {
          p.active = false;
          Sound.powerUp();
          createParticles(p.x, p.y, p.type === 'SHIELD' ? '#00FFFF' : '#FFD700', 10);

          if (p.type === 'SHIELD') { 
            gs.cat.isInvincible = true; 
            gs.cat.invincibleTimer = 300; 
          } 
          else if (p.type === 'STAR') { 
            gs.score += 5; 
            // CẬP NHẬT ĐIỂM TRỰC TIẾP
            const scoreVal = document.getElementById('scoreVal');
            if (scoreVal) scoreVal.innerText = gs.score;
            const pvpScoreYou = document.getElementById('pvpScoreYou');
            if (pvpScoreYou) pvpScoreYou.innerText = gs.score;
            
            if (gs.gameMode === 'online') sendData();
          }
          else if (p.type === 'COIN') {
            gs.coins += 1; 
            // CẬP NHẬT XU TRỰC TIẾP
            const coinVal = document.getElementById('coinVal');
            if (coinVal) coinVal.innerText = gs.coins;
            const pvpCoinVal = document.getElementById('pvpCoinVal');
            if (pvpCoinVal) pvpCoinVal.innerText = gs.coins;
            
            if (!auth.currentUser) secureStorage.setItem('astro_guest_coins', gs.coins);
          }
        }
      }

      if (p.x < -20) {
        // Tái chế vật phẩm
        const deadItem = gs.powerUps.splice(i, 1)[0];
        gs.pools.powerUps.push(deadItem);
      }
    }
  };

  const handleParticles = () => {
    const gs = gsRef.current;
    const ctx = gs.ctx;
    for (let i = gs.particles.length - 1; i >= 0; i--) {
      const p = gs.particles[i];
      p.update();
      p.draw(ctx);
      if (p.life <= 0) {
        // Tái chế thay vì xóa hẳn
        const deadParticle = gs.particles.splice(i, 1)[0];
        gs.pools.particles.push(deadParticle);
      }
    }
  };

  const loop = (timestamp) => {
    const gs = gsRef.current;
    
    if (!timestamp) timestamp = performance.now();
    if (!gs.lastFrameTime) gs.lastFrameTime = timestamp;

    const deltaTime = timestamp - gs.lastFrameTime;
    const FPS_INTERVAL = 1000 / 60; 

    if (deltaTime < FPS_INTERVAL) {
      if (!gs.isGameOver) {
        animationRef.current = requestAnimationFrame(loop);
      } else if (gs.gameMode === 'online' && !gs.remoteDead) {
        animationRef.current = requestAnimationFrame(loop);
      }
      return;
    }

    if (deltaTime > 100) {
      gs.lastFrameTime = timestamp; 
    } else {
      gs.lastFrameTime = timestamp - (deltaTime % FPS_INTERVAL);
    }

    if (gs.isPaused) return;
    if (!gs.ctx || !gs.canvas) return;

    gs.ctx.clearRect(0, 0, gs.canvas.width, gs.canvas.height);

    drawBackground();
    updatePipes();
    drawPipes();
    updatePowerUps();
    updateCat();
    drawCat();
    handleParticles();
    
    //setFrameCount(f => f + 1);

    if (gs.isGameOver && gs.gameMode === 'online') {
      if (!gs.remoteDead) {
        // Thay thế đoạn vẽ chữ tĩnh thành đoạn này:
        const textStr = t[langRef.current] || t['vi'];
        gs.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        gs.ctx.fillRect(0, 0, gs.canvas.width, gs.canvas.height);
        gs.ctx.fillStyle = '#FFD700';
        gs.ctx.font = "30px 'VT323', monospace";
        gs.ctx.textAlign = 'center';
        gs.ctx.fillText(textStr.canvasYouDied, gs.canvas.width / 2, gs.canvas.height / 2 - 40);
        gs.ctx.fillStyle = '#fff';
        gs.ctx.font = "24px 'VT323', monospace";
        gs.ctx.fillText(`${textStr.canvasSpectating} ${gs.remoteName} ${textStr.canvasPlaying}`, gs.canvas.width / 2, gs.canvas.height / 2);
        gs.ctx.fillText(`${textStr.canvasOpponentScore} ${gs.remoteScore}`, gs.canvas.width / 2, gs.canvas.height / 2 + 30);
      }
    } else {
      gs.frames++;
    }

    if (!gs.isGameOver) {
      animationRef.current = requestAnimationFrame(loop);
    } else if (gs.gameMode === 'online' && !gs.remoteDead) {
      animationRef.current = requestAnimationFrame(loop);
    }
  };

  const flipMute = () => {
    gsRef.current.isMuted = !gsRef.current.isMuted;
    setUIUpdates(prev => ({ ...prev, isMuted: gsRef.current.isMuted }));
  };
  const togglePause = () => {
    const gs = gsRef.current;
    if (!gs.isPlaying || gs.isGameOver) return;
    gs.isPaused = !gs.isPaused;
    setUIUpdates(prev => ({ ...prev, isPaused: gs.isPaused }));
    if (!gs.isPaused) loop();
  };
  const handleAction = () => {
    const gs = gsRef.current;
    if (gs.isPlaying && !gs.isGameOver && !gs.isPaused) {
      gs.cat.velocity = -gs.cat.jumpStrength;
      Sound.jump();
      createParticles(gs.cat.x, gs.cat.y + 10, '#fff', 5);
    }
  };

  useEffect(() => {
    const handleKeydown = (e) => {
      if (e.code === 'Space') handleAction();
      if (e.code === 'KeyP' && gsRef.current.gameMode === 'single') togglePause();
    };

    const handleTouchOrMouse = (e) => {
      // THÊM '.leaderboard-scroll' VÀO ĐÂY ĐỂ CHO PHÉP VUỐT CUỘN
      if (e.target && e.target.closest && e.target.closest('button, .btn, .shop-item, .control-btn, input, .tab-btn, .leaderboard-scroll')) {
        return;
      }
      if (e.type === 'touchstart' && e.cancelable) {
        e.preventDefault(); 
      }
      handleAction();
    };

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('mousedown', handleTouchOrMouse);
    window.addEventListener('touchstart', handleTouchOrMouse, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('mousedown', handleTouchOrMouse);
      window.removeEventListener('touchstart', handleTouchOrMouse);
    };
  }, []);

  const resizeCanvas = () => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
      gsRef.current.pipeDistance = window.innerWidth < 600 ? PIPE_DIST_MOBILE : PIPE_DIST_DESKTOP;
      gsRef.current.cat.radius = window.innerHeight < 500 ? 10 : 15;
    }
  };

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  useEffect(() => {
    const gs = gsRef.current;
    // Nếu là VIP hoặc mạng đã đầy thì không cần tính toán
    if (gs.isVIP || gs.lives >= 10) {
      if (uiUpdates.nextLifeTime) {
        setUIUpdates(prev => ({ ...prev, nextLifeTime: null }));
      }
      return;
    }
    const canvas = canvasRef.current;
    
    if (canvas && !gs.canvas) {
      gs.canvas = canvas;
      gs.ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    let menuAnimId;
    let lastIdleTime = performance.now();
    const FPS_INTERVAL = 1000 / 60; 
    
    const idleLoop = (timestamp) => {
      if (!gs.ctx || !gs.canvas) return;
      if (!timestamp) timestamp = performance.now();

      const deltaTime = timestamp - lastIdleTime;

      if (deltaTime < FPS_INTERVAL) {
        menuAnimId = requestAnimationFrame(idleLoop);
        return;
      }

      lastIdleTime = timestamp - (deltaTime % FPS_INTERVAL);
      
      if (gs.background.particles.length === 0) {
        const bg = BACKGROUNDS.find(b => b.id === gs.userSettings.bg) || BACKGROUNDS[0];
        if (bg.type === 'stars') {
          for (let i = 0; i < 100; i++) { gs.background.particles.push({ x: Math.random() * gs.canvas.width, y: Math.random() * gs.canvas.height, size: Math.random() * 2, speed: Math.random() * 2 + 0.5 }); }
        } else if (bg.type === 'aurora') {
          // Tạo ít dải lụa hơn nhưng chất lượng hơn
          const waveColors = ['rgba(0, 255, 238,', 'rgba(0, 255, 140,']; // Màu Cyan và Green neon
          for (let i = 0; i < 6; i++) { 
            gs.background.particles.push({ 
              x: Math.random() * gs.canvas.width, 
              // y ở nửa trên màn hình
              y: Math.random() * gs.canvas.height * 0.4 + gs.canvas.height * 0.1, 
              height: Math.random() * 200 + 150, // Độ cao của dải lụa
              speed: Math.random() * 0.3 + 0.1, // Trôi rất chậm
              // Các thông số để tạo sóng (Wavy effect)
              color: waveColors[i % 2],
              phase: Math.random() * Math.PI * 2, // Điểm bắt đầu của sóng
              freqX: Math.random() * 0.005 + 0.002, // Độ dài sóng
              amplitude: Math.random() * 20 + 10 // Độ cao sóng
            }); 
          }
        } else if (bg.type === 'bubbles') {
          for (let i = 0; i < 30; i++) { gs.background.particles.push({ x: Math.random() * gs.canvas.width, y: Math.random() * gs.canvas.height, size: Math.random() * 15 + 5, speed: Math.random() * 1 + 0.5, floatOffset: Math.random() * Math.PI * 2 }); }
        } else if (bg.type === 'fireflies') {
          for (let i = 0; i < 50; i++) { gs.background.particles.push({ x: Math.random() * gs.canvas.width, y: Math.random() * gs.canvas.height, size: Math.random() * 3 + 1, speed: Math.random() * 1.5 + 0.5, flicker: Math.random() * 0.1 }); }
        } else if (bg.type === 'meteors') {
          for (let i = 0; i < 25; i++) {
            // Tạo hình dáng đa giác gồ ghề ngẫu nhiên cho từng viên đá
            const vertices = [];
            const sides = Math.floor(Math.random() * 3) + 5; // 5 đến 7 cạnh
            for (let j = 0; j < sides; j++) {
              vertices.push(Math.random() * 0.4 + 0.8); // Độ gồ ghề của đá
            }
            gs.background.particles.push({ 
              x: Math.random() * gs.canvas.width, 
              y: Math.random() * gs.canvas.height, 
              size: Math.random() * 15 + 10, // Kích thước to hơn
              speedX: Math.random() * 2 + 1,
              //speedY: Math.random() * 2 + 1,
              rotation: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.05, // Tốc độ xoay
              vertices: vertices
            });
          }
        } else if (bg.type === 'hyperspace') {
          // Đa dạng màu sắc chuẩn Cyberpunk/Không gian
          const colors = ['#ffffff', '#00ffff', '#8a2be2', '#ff00ff']; 
          for (let i = 0; i < 60; i++) { 
            gs.background.particles.push({ 
              x: Math.random() * gs.canvas.width, 
              y: Math.random() * gs.canvas.height, 
              length: Math.random() * 80 + 30, // Vệt dài hơn tạo cảm giác siêu tốc
              speed: Math.random() * 3 + 2,
              color: colors[Math.floor(Math.random() * colors.length)], // Lấy màu ngẫu nhiên
              thickness: Math.random() * 2 + 1
            }); 
          }
        }
      }

      gs.ctx.clearRect(0, 0, gs.canvas.width, gs.canvas.height);
      drawBackground();
      
      const bgType = BACKGROUNDS.find(b => b.id === gs.userSettings.bg)?.type || 'stars';
      for (let p of gs.background.particles) {
        if (bgType === 'meteors') {
          p.x -= p.speedX * 1.5; //p.y += p.speedY * 1.5;
          if (p.rotation !== undefined) p.rotation += p.rotSpeed;
          if (p.x < -p.size * 2 ) {p.x = gs.canvas.width + Math.random() * 100; p.y = Math.random() * gs.canvas.height; }
        } else {
          p.x -= (p.speed || p.speedX || 2) * 1.5; 
          if (p.x < -100) { p.x = gs.canvas.width; p.y = Math.random() * gs.canvas.height; }
        }
      }
      
      menuAnimId = requestAnimationFrame(idleLoop);
    };

    if (screen !== 'game') {
      menuAnimId = requestAnimationFrame(idleLoop);
    }

    return () => {
      if (menuAnimId) cancelAnimationFrame(menuAnimId);
    };
  }, [screen, uiUpdates.selectedBg]);

  const loginWithGoogle = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Đăng nhập Native cho App APK
        toast.loading(t[lang]?.loginOpening, { id: 'nativeLogin' });
        // BẮT BUỘC PHẢI THÊM ĐOẠN NÀY ĐỂ ÉP KHỞI TẠO Ở NATIVE
        GoogleAuth.initialize({
          clientId: '271365354200-divjlei917agdhao9na226dnhemtiq2b.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
        const googleUser = await GoogleAuth.signIn();
        const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
        await signInWithCredential(auth, credential);
        toast.success(t[lang]?.loginAppSuccess);
      } else {
        // Đăng nhập Popup cho Web
        await signInWithPopup(auth, googleProvider);
        toast.success(t[lang]?.loginWebSuccess);
      }
    } catch (error) {
      console.error("Login Error:", error);
      toast.error(t[lang]?.loginFail);
    }
  };
  const loginWithApple = async () => {
    try {
      toast.loading(t[lang]?.loginOpening || "Đang kết nối Apple...", { id: 'appleLogin' });
      const { response } = await SignInWithApple.authorize({
        clientId: 'com.ban.astrocat', // Bundle ID của Apple sau này tạo
        redirectURI: '',
        scopes: 'email name',
      });
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: response.identityToken });
      await signInWithCredential(auth, credential);
      toast.success(t[lang]?.loginAppSuccess || "Đăng nhập thành công!");
    } catch (error) {
      toast.dismiss('appleLogin');
      console.error("Apple Login Error:", error);
      toast.error(t[lang]?.loginFail || "Đăng nhập thất bại");
    }
  };
  const logout = async () => {
    try {
      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        // Bỏ qua lỗi cập nhật mạng để luôn ưu tiên ép đăng xuất thành công ở Client
        await updateDoc(userRef, { isOnline: false, last_session_id: "" }).catch(() => {});
      }
      secureStorage.removeItem('astro_session_id');
      await signOut(auth);
      
      if (Capacitor.isNativePlatform()) {
        await GoogleAuth.signOut();
      }
  
      setCurrentUser(null);
      setScreen('menu');
      toast.success(t[lang]?.logoutSuccess);
    } catch (e) { console.log(e); }
  };

  const loadUserProfile = async (user) => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    
    try {
      // --- KHỞI TẠO REVENUECAT (CHỈ CHẠY TRÊN NATIVE APP) ---
      if (Capacitor.isNativePlatform()) {
        const isIOS = Capacitor.getPlatform() === 'ios'; 
        await Purchases.configure({ 
            apiKey: isIOS ? "appl_Dien_Key_Apple_Vao_Day" : "goog_CbZGtaRbTZyJqImOJePIWqxjpXr", 
            appUserID: user.uid 
        });
      }
      const snap = await getDoc(userRef);
      // Sử dụng Session ID cố định lưu trong máy
      let savedId = secureStorage.getItem('astro_session_id');
      if (!savedId) {
        savedId = "sess_" + Math.random().toString(36).substring(2, 15);
        secureStorage.setItem('astro_session_id', savedId);
      }
      const currentSocketId = savedId;

      if (snap.exists()) {
        const data = snap.data();
        const now = getRealTime();
        const lastUpdate = data.last_update_ms || 0;

        // Nếu ID khớp (cùng thiết bị) hoặc mới Online cách đây < 15 giây (do load lại trang)
        const isSameDevice = data.last_session_id === currentSocketId;
        const isQuickReload = (now - lastUpdate) < 15000; 

        if (data.isOnline === true && !isSameDevice && !isQuickReload) {
          toast.error(t[langRef.current]?.errMultiDevice);
          await signOut(auth);
          setCurrentUser(null);
          setScreen('menu');
          return;
        }

        // Cập nhật trạng thái mới
        await updateDoc(userRef, {
          isOnline: true,
          last_session_id: currentSocketId,
          last_update_ms: now
        });

        // Tải dữ liệu
        gsRef.current.coins = data.coins || 0;
        gsRef.current.lives = data.lives !== undefined ? data.lives : 10;
        gsRef.current.isVIP = data.isVIP || false;
        // Xử lý nạp mạng và Vô cực (∞)
        if (gsRef.current.isVIP) {
          gsRef.current.lives = '∞';
          gsRef.current.livesUpdatedAt = null;
        } else {
          gsRef.current.lives = data.lives !== undefined ? data.lives : 10;
          if (gsRef.current.lives < 10) {
            if (!data.livesUpdatedAt) {
              gsRef.current.livesUpdatedAt = now;
              updateDoc(userRef, { livesUpdatedAt: now });
            } else {
              gsRef.current.livesUpdatedAt = data.livesUpdatedAt;
            }
          } else {
            gsRef.current.livesUpdatedAt = null;
          }
        }
        // KIỂM TRA RESET LƯỢT NHẬN XU THEO NGÀY
        // Lấy giờ thật đã được đồng bộ qua API (Chống hack đổi giờ trên máy)
        const realTimeNow = new Date(getRealTime());
        // Tạo chuỗi ngày chuẩn (Ví dụ: "2026-3-23")
        const today = `${realTimeNow.getFullYear()}-${realTimeNow.getMonth() + 1}-${realTimeNow.getDate()}`;
        if (data.lastCoinDate === today) {
          gsRef.current.dailyCoinCount = data.dailyCoinCount || 0; 
        } else {
          gsRef.current.dailyCoinCount = 0; // Đã qua ngày mới chuẩn quốc tế -> Reset
        }
        gsRef.current.lastCoinDate = today;
        // KIỂM TRA ĐẾM THEO GIỜ (Cho hệ thống quảng cáo)
        const currentHourStr = `${today}-${realTimeNow.getHours()}`;
        if (data.lastCoinHour === currentHourStr) {
          gsRef.current.hourlyCoinCount = data.hourlyCoinCount || 0;
        } else {
          gsRef.current.hourlyCoinCount = 0; // Sang giờ mới -> Reset về 0
        }
        gsRef.current.lastCoinHour = currentHourStr;
        if (gsRef.current.isVIP) {
          gsRef.current.livesUpdatedAt = null;
        } else if (gsRef.current.lives < 10) {
          if (!data.livesUpdatedAt) {
            gsRef.current.livesUpdatedAt = now;
            updateDoc(userRef, { livesUpdatedAt: now });
          } else {
            gsRef.current.livesUpdatedAt = data.livesUpdatedAt;
          }
        } else {
          gsRef.current.livesUpdatedAt = null;
        }
        gsRef.current.bestScore = data.highScore || 0;
        gsRef.current.inventory = data.inventory || { skins: ['classic'], bgs: ['deep'] };
        gsRef.current.userSettings = data.equipped || { skin: 'classic', bg: 'deep' };
      } else {
        // Tạo profile mới
        await setDoc(userRef, {
          displayName: user.displayName,
          isOnline: true,
          last_session_id: currentSocketId,
          last_update_ms: Date.now(),
          coins: 0, lives: 10, highScore: 0
        });
      }
      setUIUpdates(prev => ({ ...prev, coins: gsRef.current.coins, lives: gsRef.current.lives, isVIP: gsRef.current.isVIP, nextLifeTime: gsRef.current.isVIP ? null : prev.nextLifeTime}));
    } catch (error) {
      console.error("Lỗi tải hồ sơ:", error);
    }
  };

  const saveUserProfile = async () => {
    if (!currentUser) return; 
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
      highScore: gsRef.current.bestScore,
      coins: gsRef.current.coins,
      lives: gsRef.current.lives,
      livesUpdatedAt: gsRef.current.livesUpdatedAt,
      isVIP: gsRef.current.isVIP || false,
      dailyCoinCount: gsRef.current.dailyCoinCount,
      lastCoinDate: gsRef.current.lastCoinDate,
      hourlyCoinCount: gsRef.current.hourlyCoinCount,
      lastCoinHour: gsRef.current.lastCoinHour,
      inventory: gsRef.current.inventory,
      equipped: gsRef.current.userSettings,
    });
  };
useEffect(() => {
    let isMounted = true;

    // Lắng nghe đăng nhập (Xử lý chung cho cả Web và APK)
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setCurrentUser(user);
      
      if (user) {
        gsRef.current.myName = user.displayName; 
        await loadUserProfile(user);
      } else {
        // Xử lý khách (Guest)
        let savedLives = secureStorage.getItem('astro_guest_lives');
        // SỬA LỖI 0 || 10 bằng cách kiểm tra null rõ ràng
        let guestLives = savedLives !== null ? parseInt(savedLives) : 10; 
        let guestCoins = parseInt(secureStorage.getItem('astro_guest_coins')) || 0;
        
        gsRef.current.lives = guestLives;
        gsRef.current.coins = guestCoins;
        
        // Khôi phục mốc đếm ngược cho Guest
        if (guestLives < 10) {
          let lastLost = secureStorage.getItem('astro_guest_last_lost');
          gsRef.current.livesUpdatedAt = lastLost ? parseInt(lastLost) : getRealTime();
          if (!lastLost) secureStorage.setItem('astro_guest_last_lost', gsRef.current.livesUpdatedAt);
        } else {
          gsRef.current.livesUpdatedAt = null;
        }

        setUIUpdates(prev => ({ ...prev, lives: guestLives, coins: guestCoins }));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);
  
 // ==========================================
  // HỆ THỐNG QUẢNG CÁO TẶNG THƯỞNG (ADMOB) - ĐÃ TỐI ƯU PRELOAD
  // ==========================================
  const pendingRewardRef = useRef(null); // Lưu lại người dùng đang xem QC để nhận xu hay mạng
  const adReadyRef = useRef(false);      // Cờ đánh dấu quảng cáo đã tải sẵn sàng chưa
  const IS_TESTING = false; 
  
  const AD_ID = IS_TESTING 
    ? (isIOS ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-3940256099942544/5224354917') 
    : (isIOS ? 'ca-app-pub-xxx/yyy_ios' : 'ca-app-pub-8735238443425732/3739555790'); 

  // --- ID QUẢNG CÁO BIỂU NGỮ (BANNER) ---
  const BANNER_ID = IS_TESTING 
    ? (isIOS ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111') 
    : (isIOS ? 'ca-app-pub-xxx/zzz_ios' : 'ca-app-pub-8735238443425732/8524978611');

  const isBannerCreatedRef = useRef(false);
  const saveUserProfileRef = useRef(saveUserProfile);
    useEffect(() => {
      saveUserProfileRef.current = saveUserProfile;
    }, [saveUserProfile]);
  // Hàm tải ngầm quảng cáo
  const preloadAd = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await AdMob.prepareRewardVideoAd({ adId: AD_ID, isTesting: IS_TESTING });
      adReadyRef.current = true;
      console.log("✅ Quảng cáo đã được preload sẵn sàng!");
    } catch (error) {
      console.error("❌ Lỗi preload quảng cáo:", error);
      adReadyRef.current = false;
    }
  };

  useEffect(() => {
    let rewardListener;
    let dismissListener;
    let failedListener;

    const initAdMob = async () => {
      try {
        await AdMob.initialize();
        setIsAdInitialized(true);
        let earnedReward = null;
        rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          earnedReward = pendingRewardRef.current; 
        });
        // 1. Nhận thưởng thành công
        dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          setIsWatchingAd(false);
          adReadyRef.current = false;
          //const rewardType = pendingRewardRef.current;
          if (earnedReward) {
            if (earnedReward === 'coin') {
              gsRef.current.coins += 50; 
              gsRef.current.hourlyCoinCount += 1; // Tăng đếm giờ
              setUIUpdates(prev => ({ ...prev, coins: gsRef.current.coins }));
              toast.success(t[langRef.current]?.rewardCoin);
            } else if (earnedReward === 'life') {
              gsRef.current.lives += 1;  
              setUIUpdates(prev => ({ ...prev, lives: gsRef.current.lives }));
              toast.success(t[langRef.current]?.rewardLife);
            }
            saveUserProfileRef.current(); 
            earnedReward = null; // Reset lại cờ
          }
          pendingRewardRef.current = null;
          preloadAd(); // Tải video tiếp theo
        });

        // // 2. Khi đóng quảng cáo (dù có nhận thưởng hay không) -> Tải sẵn luôn video tiếp theo
        // dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        //   setIsWatchingAd(false);
        //   adReadyRef.current = false; // Reset cờ
        //   preloadAd(); // Kích hoạt tải ngầm quảng cáo mới
        // });

        // 3. (Tuỳ chọn) Bắt lỗi nếu quảng cáo load xịt giữa chừng
        failedListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
          adReadyRef.current = false;
        });

        // GỌI PRELOAD NGAY KHI KHỞI TẠO XONG
        preloadAd();

      } catch (e) {
        console.log("Đang chạy trên Web hoặc lỗi khởi tạo AdMob.");
      }
    };

    initAdMob();

    return () => {
      if (rewardListener && rewardListener.remove) rewardListener.remove();
      if (dismissListener && dismissListener.remove) dismissListener.remove();
      if (failedListener && failedListener.remove) failedListener.remove();
    };
  }, []);
useEffect(() => {
    const manageBanner = async () => {
      // Chỉ chạy trên thiết bị di động (Android/iOS)
      if (!Capacitor.isNativePlatform() || !isAdInitialized) return;

      try {
        if (screen === 'game' || uiUpdates.isVIP) {
          // 1. ĐANG CHƠI GAME -> ẨN BANNER ĐI
          if (isBannerCreatedRef.current) {
            await AdMob.hideBanner();
          }
        } else {
          // 2. CÁC MÀN HÌNH KHÁC (Menu, Shop...) -> HIỆN BANNER LÊN
          if (!isBannerCreatedRef.current) {
            // Lần đầu khởi tạo Banner
            await AdMob.showBanner({
              adId: BANNER_ID,
              adSize: BannerAdSize.BANNER,
              position: BannerAdPosition.BOTTOM_CENTER,
              margin: 0,
              isTesting: IS_TESTING
            });
            isBannerCreatedRef.current = true;
          } else {
            // Đã có sẵn rồi thì gọi nó hiện lại
            await AdMob.resumeBanner();
          }
        }
      } catch (error) {
        console.error("Lỗi xử lý Banner:", error);
      }
    };

    manageBanner();

  }, [screen,isAdInitialized, uiUpdates.isVIP]);
  const watchAd = async (rewardType) => {
    if (!currentUser) {
      toast.error(t[langRef.current]?.reqLoginReward || "Vui lòng đăng nhập!");
      return;
    }
    if (rewardType === 'life' && gsRef.current.lives >= 10) {
      toast.error(t[langRef.current]?.errLifeFullAd);
      return; 
    }
    if (rewardType === 'coin') {
      const realTimeNow = new Date(getRealTime());
      const currentHourStr = `${realTimeNow.getFullYear()}-${realTimeNow.getMonth() + 1}-${realTimeNow.getDate()}-${realTimeNow.getHours()}`;
      
      // Nếu nhảy sang giờ mới thì reset ngay lập tức
      if (gsRef.current.lastCoinHour !== currentHourStr) {
        gsRef.current.hourlyCoinCount = 0;
        gsRef.current.lastCoinHour = currentHourStr;
      }

      if (gsRef.current.hourlyCoinCount >= 15) {
        toast.error(t[langRef.current]?.errCoinHourlyLimitAd || "Đã đạt giới hạn 15 lần/giờ. Vui lòng quay lại vào giờ tiếp theo!");
        return;
      }
    }
    if (isWatchingAd) return;

    setIsWatchingAd(true);
    pendingRewardRef.current = rewardType;

    const isNative = Capacitor.isNativePlatform();

    if (!isNative) {
      runFakeAd(rewardType);
      return;
    }

    // --- LOGIC PHÁT QUẢNG CÁO ĐÃ TỐI ƯU ---
    if (adReadyRef.current) {
      // TRƯỜNG HỢP 1: Quảng cáo đã tải sẵn -> Bật lên ngay lập tức!
      try {
        await AdMob.showRewardVideoAd();
        adReadyRef.current = false; 
      } catch (error) {
        console.error("Lỗi khi show ad đã preload:", error);
        setIsWatchingAd(false);
        pendingRewardRef.current = null;
        toast.error(t[langRef.current]?.errAdNotReady || "Lỗi phát quảng cáo. Vui lòng thử lại!");
        preloadAd(); 
      }
    } else {
      // TRƯỜNG HỢP 2: Fallback (Mạng chậm, preload chưa kịp xong) -> Phải chờ tải
      const loadingToast = toast.loading(t[langRef.current]?.adConnecting || "Đang kết nối quảng cáo...");
      try {
        // 2. VÁ LỖI TREO KẾT NỐI (TIMEOUT 10 GIÂY)
        await Promise.race([
          AdMob.prepareRewardVideoAd({ adId: AD_ID, isTesting: IS_TESTING }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
        ]);
        toast.dismiss(loadingToast);
        await AdMob.showRewardVideoAd();
      } catch (error) {
        console.error("AdMob Fallback Error:", error);
        toast.dismiss(loadingToast);
        setIsWatchingAd(false);
        pendingRewardRef.current = null;
        toast.error(t[langRef.current]?.errAdNotReady || "Quảng cáo chưa sẵn sàng. Vui lòng thử lại sau!");
      }
    }
  };

  const runFakeAd = (rewardType) => {
    setWebAd({ isPlaying: true, type: rewardType });
  };

  const handleWebAdComplete = () => {
    const rewardType = webAd.type;
    setWebAd({ isPlaying: false, type: null });
    setIsWatchingAd(false);

    if (rewardType === 'coin') {
      gsRef.current.coins += 50; 
      gsRef.current.hourlyCoinCount += 1; // Tăng đếm giờ
      setUIUpdates(prev => ({ ...prev, coins: gsRef.current.coins }));
      toast.success(t[langRef.current]?.rewardCoin);
    } else if (rewardType === 'life') {
      gsRef.current.lives += 1;  
      setUIUpdates(prev => ({ ...prev, lives: gsRef.current.lives }));
      toast.success(t[langRef.current]?.rewardLife);
    }
    
    if (currentUser) saveUserProfile(); 
    pendingRewardRef.current = null;
  };

  const handleWebAdClose = () => {
    setWebAd({ isPlaying: false, type: null });
    setIsWatchingAd(false);
    pendingRewardRef.current = null;
    toast.error(t[langRef.current]?.errAdIncomplete);
  };
  // ==========================================
  // BỘ ĐẾM NGƯỢC THỜI GIAN HỒI MẠNG (CHẠY NGẦM & OFFLINE)
  // ==========================================
  useEffect(() => {
    const REGEN_TIME = 2 * 60 * 60 * 1000; // Đã chỉnh về 3 tiếng
    
    const timer = setInterval(() => {
      const gs = gsRef.current;
      if (gs.isVIP) {
        if (uiUpdates.nextLifeTime !== null || uiUpdates.lives !== '∞') {
          setUIUpdates(prev => ({ ...prev, nextLifeTime: null, lives: '∞' }));
        }
        return; // Thoát ra, không đếm nữa
      }
      // Nếu mạng đã đầy thì không cần tính toán
      if (gs.lives >= 10) {
        if (uiUpdates.nextLifeTime) {
          setUIUpdates(prev => ({ ...prev, nextLifeTime: null }));
        }
        return;
      }

      // Lấy mốc thời gian mất mạng đầu tiên
      let lastLost = currentUser ? gs.livesUpdatedAt : parseInt(secureStorage.getItem('astro_guest_last_lost'));
      
      if (!lastLost || isNaN(lastLost)) {
        lastLost = getRealTime();
        gs.livesUpdatedAt = lastLost;
        if (!currentUser) secureStorage.setItem('astro_guest_last_lost', lastLost);
        return;
      }

      const now = getRealTime();
      const timePassed = now - lastLost;

      // KIỂM TRA HỒI MẠNG (Xử lý được cả trường hợp hồi nhiều mạng cùng lúc)
      if (timePassed >= REGEN_TIME) {
        const gained = Math.floor(timePassed / REGEN_TIME); // Tính số mạng được nhận
        const newLives = Math.min(10, gs.lives + gained);
        
        // CẬP NHẬT MỐC THỜI GIAN MỚI: 
        // Thay vì dùng Date.now(), ta cộng thêm các khoảng REGEN_TIME vào mốc cũ 
        // để bảo toàn số phút/giây dư thừa cho mạng tiếp theo.
        const newLastLost = lastLost + (gained * REGEN_TIME);
        
        gs.lives = newLives;
        gs.livesUpdatedAt = newLives >= 10 ? null : newLastLost;

        // Lưu trữ ngay lập tức để không bị mất khi reload/đóng app
        if (currentUser) {
          saveUserProfile(); // Lưu lên Firestore
        } else {
          secureStorage.setItem('astro_guest_lives', gs.lives);
          if (gs.lives >= 10) {
            secureStorage.removeItem('astro_guest_last_lost');
          } else {
            secureStorage.setItem('astro_guest_last_lost', gs.livesUpdatedAt);
          }
        }

        setUIUpdates(prev => ({ ...prev, lives: gs.lives }));
        if(gained >= 10){
          toast.success(t[langRef.current]?.regenAllLives);
        }else{
          toast.success(`${t[langRef.current]?.regenSomeLives} ${gained} ${t[langRef.current]?.regenSomeLivesEnd}`);
        }
        
      } else {
        // CẬP NHẬT GIAO DIỆN ĐẾM NGƯỢC
        const remainingMs = REGEN_TIME - timePassed;
        const h = Math.floor(remainingMs / (1000 * 60 * 60));
        const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((remainingMs % (1000 * 60)) / 1000);
        const formattedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        if (uiUpdates.nextLifeTime !== formattedTime) {
          setUIUpdates(prev => ({ ...prev, nextLifeTime: formattedTime }));
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentUser, uiUpdates.lives]);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!currentUser) return;
      
      // Khi người dùng ẩn app xuống nền hoặc tắt app
      if (document.visibilityState === 'hidden') {
        const userRef = doc(db, "users", currentUser.uid);
        updateDoc(userRef, { isOnline: false, last_update_ms: Date.now() }).catch(() => {});
      } else if (document.visibilityState === 'visible') {
        // Khi người dùng quay lại app
        const userRef = doc(db, "users", currentUser.uid);
        updateDoc(userRef, { isOnline: true, last_update_ms: Date.now() }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser]);
  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', backgroundColor: '#0d0e15' }}>
      
      <canvas
        ref={canvasRef}
        id="gameCanvas"
        style={{ 
          display: 'block', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, 
          zIndex: screen === 'game' ? 1 : 0, 
          pointerEvents: screen === 'game' ? 'auto' : 'none' 
        }}
      />

      {screen === 'menu' && (
        <Menu 
          currentUser={currentUser} 
          uiUpdates={uiUpdates} 
          topRecords={topRecords} 
          startGame={startGame} 
          setScreen={setScreen} 
          loginWithGoogle={loginWithGoogle} 
          loginWithApple={loginWithApple}
          logout={logout} 
          openShop={openShop}
          openLeaderboard={openLeaderboard}
          lang={lang}
          toggleLanguage={toggleLanguage}
        />
      )}

      {screen === 'lobby' && (
        <Lobby 
          lobbyState={lobbyState} 
          setLobbyState={setLobbyState} 
          currentUser={currentUser} 
          gsRef={gsRef} 
          createRoom={createRoom} 
          joinRoom={joinRoom} 
          setScreen={setScreen} 
          lang={lang}
        />
      )}

      {screen === 'shop' && (
        <Shop 
          currentUser={currentUser}
          uiUpdates={uiUpdates} 
          setUIUpdates={setUIUpdates} 
          gsRef={gsRef} 
          setScreen={setScreen} 
          selectSkin={selectSkin} 
          selectBg={selectBg} 
          saveUserProfile={saveUserProfile} 
          watchAd={watchAd} 
          isWatchingAd={isWatchingAd} 
          lang={lang}
        />
      )}

      {screen === 'leaderboard' && (
        <Leaderboard 
          leaderboardMode={leaderboardMode} 
          isLoadingLeaderboard={isLoadingLeaderboard} 
          leaderboardData={leaderboardData} 
          openLeaderboard={openLeaderboard} 
          setScreen={setScreen} 
          userRankData={userRankData}
          lang={lang}
        />
      )}

      {screen === 'gameover' && (
        <GameOver 
          gsRef={gsRef} 
          uiUpdates={uiUpdates} 
          currentUser={currentUser} 
          setScreen={setScreen} 
          submitScore={submitScore} 
          loginWithGoogle={loginWithGoogle} 
          lang={lang}
          setLobbyState={setLobbyState}
          saveUserProfile={saveUserProfile}
          startGame={startGame}
        />
      )}

      {screen === 'game' && (
        <GameHUD 
          gsRef={gsRef} 
          uiUpdates={uiUpdates} 
          levelUpEffect={levelUpEffect} 
          flipMute={flipMute} 
          togglePause={togglePause} 
          countdown={countdown}
          lang={lang}
          //frameCount={frameCount}
        />
      )}
      {/* --- GIAO DIỆN QUẢNG CÁO WEB (VIDEO MẪU) --- */}
      {webAd.isPlaying && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}>
          {/* Nút Đóng */}
          <button 
            onClick={handleWebAdClose}
            style={{
              position: 'absolute', top: '20px', right: '20px', padding: '10px 20px',
              backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: '2px solid #fff',
              borderRadius: '8px', fontSize: '18px', cursor: 'pointer', zIndex: 10000,
              fontFamily: "'VT323', monospace"
            }}
          >
            {t[lang]?.closeBtn}
          </button>

          <p style={{ 
            color: '#FFD700', 
            marginBottom: '15px', 
            fontSize: 'clamp(16px, 5vw, 24px)', /* Chữ tự co giãn từ 16px đến 24px tùy màn hình */
            fontFamily: "'VT323', monospace",
            textAlign: 'center', /* Ép chữ luôn nằm giữa dù bị rớt dòng */
            padding: '0 15px'    /* Tránh chữ dính sát lề điện thoại */
          }}>
            {t[lang]?.adPlaying}<br/>({t[lang]?.adCompleteToEarn})
          </p>

          {/* Trình phát Video Mẫu (10 giây) */}
          <video 
            src="https://www.w3schools.com/html/mov_bbb.mp4" 
            autoPlay 
            playsInline
            onEnded={handleWebAdComplete} 
            style={{ width: '90%', maxWidth: '700px', borderRadius: '12px', border: '4px solid #333', boxShadow: '0 0 20px rgba(0,255,255,0.3)' }}
          >
            {t[lang]?.videoNotSupported || "Trình duyệt của bạn không hỗ trợ video."}
          </video>
        </div>
      )}
      <Toaster 
        position="top-center" 
        reverseOrder={false} 
        gutter={8} 
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a2e',
            color: '#fff',
            fontFamily: "'VT323', monospace",
            fontSize: '18px',
            fontWeight: 'bold',
            borderRadius: '8px',
            border: '2px solid #FFD700',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
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