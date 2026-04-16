import React, { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {auth } from './firebase';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { t } from './utils/translations';
import { AppUpdate } from '@capawesome/capacitor-app-update';
import RevivePopup from './components/RevivePopup';
import { useAdMob } from './hooks/useAdMob';
import { useAuth } from './hooks/useAuth';
import { useLifeRegen } from './hooks/useLifeRegen';
import { useMultiplayer } from './hooks/useMultiplayer';
import { useLeaderboard } from './hooks/useLeaderboard';
// --- IMPORT CÁC HẰNG SỐ VÀ COMPONENT ĐÃ TÁCH ---
import { SKINS, BACKGROUNDS, PIPE_DIST_DESKTOP, PIPE_DIST_MOBILE, MAX_Y_DIFF } from './constants';
import Menu from './components/Menu';
import Lobby from './components/Lobby';
import Shop from './components/Shop';
import Leaderboard from './components/Leaderboard';
import GameOver from './components/GameOver';
import GameHUD from './components/GameHUD';
import Portal from './components/Portal';
import HQ from './components/HQ';
import Pilots from './components/Pilots';
import Inventory from './components/Inventory';
import CampaignEngine from './components/Campaign/CampaignEngine';
import StageSelect from './components/StageSelect';
import CampaignPortal from './components/CampaignPortal';
import ShopCampaign from './components/ShopCampaign';
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
const setupBackground = (gs) => {
  const bg = BACKGROUNDS.find(b => b.id === gs.userSettings.bg) || BACKGROUNDS[0];
  gs.background.particles = [];
  const canvasWidth = gs.canvas.width;
  const canvasHeight = gs.canvas.height;

  if (bg.type === 'stars') {
    for (let i = 0; i < 100; i++) gs.background.particles.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight, size: Math.random() * 2, speed: Math.random() * 2 + 0.5 });
  } else if (bg.type === 'aurora') {
    const waveColors = ['rgba(0, 255, 238,', 'rgba(0, 255, 140,']; 
    for (let i = 0; i < 6; i++) { 
      gs.background.particles.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight * 0.4 + canvasHeight * 0.1, height: Math.random() * 200 + 150, speed: Math.random() * 0.3 + 0.1, color: waveColors[i % 2], phase: Math.random() * Math.PI * 2, freqX: Math.random() * 0.005 + 0.002, amplitude: Math.random() * 20 + 10 }); 
    }
  } else if (bg.type === 'bubbles') {
    for (let i = 0; i < 30; i++) gs.background.particles.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight, size: Math.random() * 15 + 5, speed: Math.random() * 1 + 0.5, floatOffset: Math.random() * Math.PI * 2 });
  } else if (bg.type === 'fireflies') {
    for (let i = 0; i < 50; i++) gs.background.particles.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight, size: Math.random() * 3 + 1, speed: Math.random() * 1.5 + 0.5, flicker: Math.random() * 0.1 });
  } else if (bg.type === 'meteors') {
    for (let i = 0; i < 25; i++) {
      const vertices = []; const sides = Math.floor(Math.random() * 3) + 5; 
      for (let j = 0; j < sides; j++) vertices.push(Math.random() * 0.4 + 0.8); 
      gs.background.particles.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight, size: Math.random() * 15 + 10, speedX: Math.random() * 2 + 1, rotation: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.05, vertices: vertices });
    }
  } else if (bg.type === 'hyperspace') {
    const colors = ['#ffffff', '#00ffff', '#8a2be2', '#ff00ff']; 
    for (let i = 0; i < 60; i++) { 
      gs.background.particles.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight, length: Math.random() * 80 + 30, speed: Math.random() * 3 + 2, color: colors[Math.floor(Math.random() * colors.length)], thickness: Math.random() * 2 + 1 }); 
    }
  }
};
export default function Game() {
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animationRef = useRef(null);
  const loadedImagesRef = useRef({});

  const [screen, setScreen] = useState('portal');
  const [lang, setLang] = useState(secureStorage.getItem('astro_lang') || 'vi');
  const [levelUpEffect, setLevelUpEffect] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const countdownTimerRef = useRef(null);
  const [uiUpdates, setUIUpdates] = useState({ score: 0, level: 1, isVIP: false });
  const [showRevivePopup, setShowRevivePopup] = useState(false);
  const [reviveTimer, setReviveTimer] = useState(6);
  const reviveIntervalRef = useRef(null);
  const revivePlayerRef = useRef(null);
  const isWatchingAdRef = useRef(false);
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
    reviveCount: 0,
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
  const { currentUser, loginWithGoogle, loginWithApple, logout, deleteAccount, saveUserProfile } = useAuth(
    gsRef, setUIUpdates, setScreen, langRef, getRealTime
  );
  const { 
    topRecords, leaderboardMode, leaderboardData, isLoadingLeaderboard, 
    userRankData, submitScore, openLeaderboard, loadTopRecords 
  } = useLeaderboard(gsRef, langRef, setScreen);
  // Gọi bộ đếm hồi mạng
  useLifeRegen(gsRef, currentUser, uiUpdates, setUIUpdates, langRef, getRealTime, saveUserProfile);
  // Kích hoạt Hệ thống Multiplayer
  const {socketId,
    socketRef, lobbyState, setLobbyState, roomPlayers, chatMessages, 
    lobbyCountdownText, isRandomRoom, toggleReady, sendChat, sendData, 
    leaveLobby, createRoom, joinRoom, joinRandom
  } = useMultiplayer(gsRef, setUIUpdates, setScreen, currentUser, langRef, (mode) => startGame(mode), () => finishOnlineGame());
  // Bù lại dòng loadTopRecords() lúc nãy vừa lỡ tay xóa
  useEffect(() => {
    loadTopRecords();
  }, []);
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
    BACKGROUNDS.forEach(bg => {
      if (bg.type === 'image' && bg.imgSrc) {
        const img = new Image();
        img.src = bg.imgSrc;
        loadedImagesRef.current[bg.id] = img;
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
  const Sound = {
    playTone: (freq, type, duration, vol = 0.1) => {
      // 1. Nếu đang tắt tiếng thì không phát
      if (gsRef.current.isMuted) return;
      // 2. KHỞI TẠO AudioContext NẾU CHƯA CÓ (Đây là mấu chốt)
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          audioCtxRef.current = new AudioContext();
        } else {
          return; // Trình duyệt không hỗ trợ
        }
      }
      // 3. Đánh thức AudioContext nếu nó bị trình duyệt cho ngủ (chính sách bảo mật)
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      // 4. Khối logic tạo âm thanh của bạn (giữ nguyên)
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
  // 1. HÀM KÍCH HOẠT CÁI CHẾT (Chạy animation nổ và hiển thị Popup)
  const gameOver = () => {
    const gs = gsRef.current;
    if (gs.isGameOver) return;
    gs.isGameOver = true;
    Sound.hit();
    createParticles(gs.cat.x, gs.cat.y, 'orange', 20);
    createParticles(gs.cat.x, gs.cat.y, 'white', 10);
    if (gs.gameMode === 'single') {
      setTimeout(() => {
        if (gs.reviveCount < 2) {
          gs.isPaused = true; 
          setShowRevivePopup(true);
          setReviveTimer(6);
          if (reviveIntervalRef.current) clearInterval(reviveIntervalRef.current);
          reviveIntervalRef.current = setInterval(() => {
            // --- CƠ CHẾ ĐÓNG BĂNG ĐỒNG HỒ ---
            if (isWatchingAdRef.current) return;
            setReviveTimer(prev => {
              if (prev <= 1) {
                clearInterval(reviveIntervalRef.current);
                finalizeGameOver();
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          finalizeGameOver();
        }
      }, 800); 
    } else {
      sendData();
    }
  };
  // 2. HÀM CHẾT THẬT (Trừ mạng, lưu điểm và chuyển sang Game Over)
  const finalizeGameOver = () => {
    const gs = gsRef.current;
    setShowRevivePopup(false);
    gs.isPaused = false; // Mở khóa lại
    gs.isPlaying = false; 
    if (reviveIntervalRef.current) clearInterval(reviveIntervalRef.current);
    // XỬ LÝ ĐIỂM SỐ
    if (gs.score > gs.bestScore) {
      gs.bestScore = gs.score;
      if (!currentUser) secureStorage.setItem('astroCatBestScore', gs.bestScore);
    }
    // XỬ LÝ TRỪ MẠNG
    if (!gs.isVIP) {
      if (gs.lives > 0) {
        if (gs.lives >= 10 || !gs.livesUpdatedAt) {
          const now = getRealTime();
          gs.livesUpdatedAt = now;
          if (!currentUser) secureStorage.setItem('astro_guest_last_lost', now);
        }
        gs.lives -= 1;
        setUIUpdates(prev => ({ ...prev, lives: gs.lives }));
        if (!currentUser) secureStorage.setItem('astro_guest_lives', gs.lives);
      }
    }
    // LƯU DỮ LIỆU
    if (currentUser) {
      saveUserProfile({
        coins: gs.coins,
        lives: gs.lives,
        livesUpdatedAt: gs.livesUpdatedAt,
        highScore: gs.bestScore
      });
    } else {
      secureStorage.setItem('astro_guest_coins', gs.coins);
    }
    // CHUYỂN MÀN HÌNH
    setUIUpdates(prev => ({
      ...prev,
      finalScore: gs.score,
      bestScore: gs.bestScore,
      coins: gs.coins
    }));
    setScreen('gameover');
  };
  const revivePlayer = () => {
    const gs = gsRef.current;
    gs.reviveCount++;
    gs.isGameOver = false;
    // 1. KHOÁ GAME LẠI ĐỂ CHUẨN BỊ ĐẾM NGƯỢC
    gs.isPaused = true; 
    // 2. Thiết lập lại trạng thái an toàn cho mèo
    gs.cat.y = gs.canvas.height / 2;
    gs.cat.velocity = 0;
    gs.cat.rotation = 0;
    gs.cat.isInvincible = true;
    gs.cat.invincibleTimer = 180; // 3 giây bất tử
    // 3. Dọn chướng ngại vật ở gần
    gs.pipes.items.forEach(p => {
      if (p.x > gs.cat.x - 150 && p.x < gs.cat.x + 300) {
        p.x = -200; 
      }
    });
    // 4. Đóng popup và dọn dẹp các đồng hồ cũ
    setShowRevivePopup(false);
    if (reviveIntervalRef.current) clearInterval(reviveIntervalRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    // 5. Cập nhật ngay 1 khung hình tĩnh để hiển thị vị trí mới của mèo đứng chờ
    gs.ctx.clearRect(0, 0, gs.canvas.width, gs.canvas.height);
    drawBackground();
    drawPipes();
    drawCat();
    // 6. BẮT ĐẦU ĐẾM NGƯỢC 3-2-1
    setCountdown(3);
    Sound.jump(); // Phát tiếng "Bíp"
    let count = 3;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        Sound.jump(); 
      } else if (count === 0) {
        setCountdown('GO!');
        Sound.levelUp(); // Phát tiếng bíp dài
      } else {
        // KẾT THÚC ĐẾM NGƯỢC -> CHO GAME CHẠY TIẾP
        clearInterval(countdownTimerRef.current);
        setCountdown(null);
        gsRef.current.isPaused = false; // Mở khóa vòng lặp
        gsRef.current.lastFrameTime = 0; // Reset lại bộ đếm FPS
        loop(); // Kích hoạt lại đồ họa
      }
    }, 1000);
    toast.success(langRef.current === 'vi' ? '⚡ Hồi sinh thành công!' : '⚡ Revived!');
  };
  // Lưu hàm vào Ref để AdMob gọi không bị lỗi closure
  useEffect(() => {
    revivePlayerRef.current = revivePlayer;
  }, [revivePlayer]);
  const handleReviveWithCoins = () => {
    if (gsRef.current.coins >= 550) {
      gsRef.current.coins -= 550;
      setUIUpdates(prev => ({ ...prev, coins: gsRef.current.coins }));
      if (currentUser) saveUserProfile({ coins: gsRef.current.coins });
      else secureStorage.setItem('astro_guest_coins', gsRef.current.coins);
      revivePlayer();
    } else {
      toast.error(langRef.current === 'vi' ? '❌ Không đủ 550 Xu!' : '❌ Not enough 550 Coins!');
    }
  };
  const handleWatchAdRevive = () => {
    // Dừng đồng hồ đếm ngược ngay lập tức để chờ xem quảng cáo
    //if (reviveIntervalRef.current) clearInterval(reviveIntervalRef.current);
    watchAd('revive');
  };
  const finishOnlineGame = () => {
    const gs = gsRef.current;
    gs.isPlaying = false;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);    
    const result = gs.score > gs.remoteScore ? 'WIN' : gs.score < gs.remoteScore ? 'LOSE' : 'DRAW';
    if (result === 'WIN') Sound.win();   
    setUIUpdates(prev => ({
      ...prev, finalScore: gs.score, remoteScore: gs.remoteScore, gameResult: result, remoteName: gs.remoteName, coins: gs.coins
    }));   
    submitScore('pvp', false);
    if (auth.currentUser) saveUserProfile({ coins: gs.coins });    
    // 👇 GỌI HÀM LEAVE LOBBY TỪ HOOK (Ép chuyển sang màn hình 'gameover')
    leaveLobby('gameover');    
    gs.isGameOver = false; 
    gs.isPaused = false;
  };  
  const openShop = () => {
    setScreen('shop');
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
    gs.reviveCount = 0;
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
    
   setupBackground(gs);

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
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtxRef.current = new AudioContext();
    }
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
    if (bg.type === 'image' && bg.imgSrc) {
      const bgImg = getImage(bg.imgSrc); 
      
      if (bgImg && bgImg.complete && bgImg.naturalWidth !== 0) {
        // Thuật toán co giãn ảnh vừa chiều cao màn hình và lặp vô tận chiều ngang
        const scale = canvas.height / bgImg.naturalHeight;
        const scaledWidth = bgImg.naturalWidth * scale; 
        
        // Tốc độ trôi của nền (0.4 là trôi chậm tạo cảm giác có chiều sâu)
        let scrollSpeed = gs.gameSpeed * 0.4; 
        
        if (!gs.isGameOver) {
          gs.bgX = (gs.bgX || 0) - scrollSpeed;
          if (gs.bgX <= -scaledWidth) gs.bgX = 0;
        }

        const neededTiles = Math.ceil(canvas.width / scaledWidth) + 1;

        for (let i = 0; i < neededTiles; i++) {
          const drawX = (gs.bgX || 0) + (i * scaledWidth);
          ctx.drawImage(bgImg, drawX, 0, scaledWidth, canvas.height);
        }
      } else {
        ctx.fillStyle = '#0d0e15';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      return; // Cực kỳ quan trọng: Phải có return để không vẽ đè các hạt (particles) cũ
    }
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
      if (e.target && e.target.closest && e.target.closest('button, .btn, .shop-item, .control-btn, input, .tab-btn, .leaderboard-scroll, .scrollable-layer, .portal-card, .hq-interact, portal-card')) {
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

  // ĐOẠN CODE ĐÃ ĐƯỢC GỠ BẪY "RETURN": TÁCH BẠCH VÒNG LẶP NỀN KHỎI BỘ ĐẾM MẠNG
  useEffect(() => {
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    
    // Khởi tạo Canvas an toàn
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
      
      // Tạo lại hạt nếu rỗng
      if (gs.background.particles.length === 0) {
        setupBackground(gs);
      }

      // Xóa màn hình và vẽ lại (Sẽ tự động xóa mèo chết khi về menu)
      gs.ctx.clearRect(0, 0, gs.canvas.width, gs.canvas.height);
      drawBackground();
      
      const bgType = BACKGROUNDS.find(b => b.id === gs.userSettings.bg)?.type || 'stars';
      for (let p of gs.background.particles) {
        if (bgType === 'meteors') {
          p.x -= p.speedX * 1.5; 
          if (p.rotation !== undefined) p.rotation += p.rotSpeed;
          if (p.x < -p.size * 2 ) {p.x = gs.canvas.width + Math.random() * 100; p.y = Math.random() * gs.canvas.height; }
        } else {
          p.x -= (p.speed || p.speedX || 2) * 1.5; 
          if (p.x < -100) { p.x = gs.canvas.width; p.y = Math.random() * gs.canvas.height; }
        }
      }
      
      menuAnimId = requestAnimationFrame(idleLoop);
    };

    // Chỉ chạy nền chuyển động khi KHÔNG ở trong game
    if (screen !== 'game') {
      menuAnimId = requestAnimationFrame(idleLoop);
    }

    return () => {
      if (menuAnimId) cancelAnimationFrame(menuAnimId);
    };
  }, [screen, uiUpdates.selectedBg]);

  
 // ==========================================
  // HỆ THỐNG QUẢNG CÁO TẶNG THƯỞNG (ADMOB) - ĐÃ TỐI ƯU PRELOAD
  // ==========================================
  
  const { watchAd, isWatchingAd } = useAdMob(
    gsRef, setUIUpdates, currentUser, screen, uiUpdates.isVIP, langRef, saveUserProfile, revivePlayer, getRealTime
  );
  useEffect(() => {
    isWatchingAdRef.current = isWatchingAd;
  }, [isWatchingAd]);
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
      {screen === 'portal' && (
          <Portal 
            gsRef={gsRef}
            setScreen={setScreen}
            currentUser={currentUser}
            loginWithGoogle={loginWithGoogle}
            loginWithApple={loginWithApple}
            logout={logout}
            deleteAccount={deleteAccount}
            lang={lang}
            toggleLanguage={toggleLanguage}
          />
        )}

        {screen === 'hq' && (
          <HQ 
            gsRef={gsRef}
            setScreen={setScreen}
            lang={lang}
          />
        )}
        {screen === 'pilots' && (
          <Pilots 
            gsRef={gsRef} setScreen={setScreen} lang={lang} saveUserProfile={saveUserProfile}
          />
        )}
        {screen === 'campaign' && (
        <CampaignEngine 
          gsRef={gsRef}
          setScreen={setScreen}
          lang={lang}
        />
      )}
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
          deleteAccount={deleteAccount}
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
          joinRandom={joinRandom}
          leaveLobby={leaveLobby}
          setScreen={setScreen} 
          lang={lang}
          roomPlayers={roomPlayers}
          chatMessages={chatMessages}
          lobbyCountdownText={lobbyCountdownText}
          toggleReady={toggleReady}
          sendChat={sendChat}
          isRandomRoom={isRandomRoom}
          socketId={socketId}
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
          loginWithApple={loginWithApple}
          lang={lang}
          setLobbyState={setLobbyState}
          saveUserProfile={saveUserProfile}
          startGame={startGame}
          leaveLobby={leaveLobby}
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
      {screen === 'inventory' && (
        <Inventory 
          gsRef={gsRef}
          setScreen={setScreen}
          lang={lang}
          saveUserProfile={saveUserProfile} // Truyền hàm lưu từ useAuth
        />
      )}
      {screen === 'stage_select' && (
        <StageSelect
          gsRef={gsRef}
          setScreen={setScreen}
          lang={lang}
        />
      )}
      {screen === 'campaign_portal' && (
        <CampaignPortal
          gsRef={gsRef}
          setScreen={setScreen}
          lang={lang}
        />
      )}
      {screen === 'shop_campaign' && (
        <ShopCampaign
          gsRef={gsRef}
          setScreen={setScreen}
          lang={lang}
          saveUserProfile={saveUserProfile}
        />
      )}
      {showRevivePopup && (
        <RevivePopup 
          gsRef={gsRef}
          uiUpdates={uiUpdates}
          revivePlayer={revivePlayer}
          handleReviveWithCoins={handleReviveWithCoins}
          handleWatchAdRevive={handleWatchAdRevive}
          finalizeGameOver={finalizeGameOver}
          reviveTimer={reviveTimer}
          lang={lang}
        />
      )}
      <Toaster 
        position="top-center" 
        reverseOrder={false} 
        gutter={8} 
        containerStyle={{
          top: 'calc(env(safe-area-inset-top) + 20px)' // Đẩy xuống khỏi tai thỏ 20px
        }}
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