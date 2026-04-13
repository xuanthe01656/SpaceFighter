import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { secureStorage } from '../utils/storageHelper';
import { t } from '../utils/translations';

export function useMultiplayer(gsRef, setUIUpdates, setScreen, currentUser, langRef, startGame, onGameFinished) {
  const socketRef = useRef(null);
  const findMatchTimeoutRef = useRef(null);
  const [myId, setMyId] = useState(null);
  // Mang toàn bộ UI State của Lobby vào đây quản lý
  const [lobbyState, setLobbyState] = useState('main');
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [lobbyCountdownText, setLobbyCountdownText] = useState(null);
  const [isRandomRoom, setIsRandomRoom] = useState(false);

  useEffect(() => {
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '/';

    socketRef.current = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    socketRef.current.on('connect', () => {
      setMyId(socketRef.current.id); // Lưu lại ID ngay khi vào mạng
    });
    if (socketRef.current.connected) {
      setMyId(socketRef.current.id);
    }
    socketRef.current.on('room-updated', (data) => {
      toast.dismiss('joinRoom'); // Tắt loading nếu đang join
      setRoomPlayers(data.players);
      setLobbyState('wait');
      gsRef.current.roomCode = data.roomCode;
      gsRef.current.isRandomRoom = data.isRandom;
      setIsRandomRoom(data.isRandom);
      if (findMatchTimeoutRef.current) clearTimeout(findMatchTimeoutRef.current);
    });

    socketRef.current.on('opponent-left-lobby', () => {
      setLobbyCountdownText(null);

      // NẾU LÀ PHÒNG NGẪU NHIÊN -> Dò tìm người mới
      if (gsRef.current.isRandomRoom) {
        gsRef.current.roomCode = null;
        setRoomPlayers([]);
        setChatMessages([]);
        toast.error(langRef.current === 'vi' ? '⚠️ Đối thủ đã rời đi. Đang tìm người mới...' : '⚠️ Opponent left. Finding new match...', { duration: 4000, icon: '🔄' });
        setLobbyState('finding');
        socketRef.current.emit('join-random', { name: gsRef.current.myName });

        if (findMatchTimeoutRef.current) clearTimeout(findMatchTimeoutRef.current);
        findMatchTimeoutRef.current = setTimeout(() => {
          socketRef.current.emit('leave-room');
          setScreen('menu');
          setLobbyState('main');
          gsRef.current.roomCode = null;
          setRoomPlayers([]);
          setChatMessages([]);
          setLobbyCountdownText(null);
          toast.error(langRef.current === 'vi' ? '⏱️ Không tìm thấy đối thủ!' : '⏱️ Matchmaking timeout!', { duration: 4000 });
        }, 120000);
      } 
      // NẾU LÀ PHÒNG THƯỜNG -> Chỉ báo Toast, KHÔNG clear dữ liệu phòng để chờ bạn mới vào
      else {
        toast.error(langRef.current === 'vi' ? '⚠️ Đối thủ đã rời phòng!' : '⚠️ Opponent left the room!', { duration: 3000, icon: '🏃' });
      }
    });

    socketRef.current.on('chat-message', (data) => {
      setChatMessages(prev => [...prev, data]);
    });

    socketRef.current.on('lobby-countdown', (count) => {
      setLobbyCountdownText(count);
    });

    socketRef.current.on('room-created', (data) => {
      gsRef.current.roomCode = data.roomCode;
      setUIUpdates(prev => ({ ...prev, roomCode: data.roomCode }));
    });

    socketRef.current.on('game-start', (data) => {
      setLobbyCountdownText(null);
      if (findMatchTimeoutRef.current) clearTimeout(findMatchTimeoutRef.current);
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
      if (onGameFinished) onGameFinished();
    });

    socketRef.current.on('opponent-disconnected', () => {
      toast.error(t[langRef.current]?.errOpponentDisconnect || 'Đối thủ mất kết nối!');
      setTimeout(() => location.reload(), 2000);
    });

    socketRef.current.on('join-failed', (data) => {
      toast.dismiss('joinRoom');
      toast.error((t[langRef.current]?.errRoomNotFound || 'Lỗi: ') + (data.error || ''));
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const toggleReady = () => socketRef.current.emit('toggle-ready');
  
  const sendChat = (msg) => socketRef.current.emit('chat-message', msg);
  
  const sendData = () => {
    if (socketRef.current && gsRef.current.gameMode === 'online') {
      socketRef.current.emit('game-update', {
        score: gsRef.current.score,
        isDead: gsRef.current.isGameOver
      });
    }
  };

  const leaveLobby = (targetScreen) => {
    // ÉP KIỂU: Chặn lỗi event click đè lên chữ 'menu'
    const screenToGo = typeof targetScreen === 'string' ? targetScreen : 'menu';

    if (findMatchTimeoutRef.current) clearTimeout(findMatchTimeoutRef.current);
    if (socketRef.current) socketRef.current.emit('leave-room');
    
    setScreen(screenToGo);
    setLobbyState('main');
    gsRef.current.roomCode = null;
    setRoomPlayers([]);
    setChatMessages([]);
    setLobbyCountdownText(null);
  };

  const createRoom = (playerName) => {
    if (!currentUser) return toast.error(t[langRef.current]?.reqLogin || 'Vui lòng đăng nhập!');
    if (!playerName || playerName.length < 2) return toast.error(t[langRef.current]?.reqName || 'Vui lòng nhập tên (ít nhất 2 ký tự)!');
    
    gsRef.current.myName = playerName;
    secureStorage.setItem('astro_custom_name', playerName);
    gsRef.current.isHost = true;
    setLobbyState('wait');
    toast.success(t[langRef.current]?.roomCreated || '✅ Phòng đã tạo thành công!');
    socketRef.current.emit('create-room', { name: playerName, settings: gsRef.current.userSettings });
  };

  const joinRoom = (playerName, roomCode) => {
    if (!currentUser) return toast.error(t[langRef.current]?.loginRequired || 'Vui lòng đăng nhập!');
    if (!playerName || playerName.length < 2) return toast.error(t[langRef.current]?.nameTooShort || 'Tên quá ngắn!');
    if (!roomCode) return toast.error(t[langRef.current]?.enterRoomCode || 'Vui lòng nhập mã!');
    
    gsRef.current.myName = playerName;
    secureStorage.setItem('astro_custom_name', playerName);
    toast.loading(t[langRef.current]?.connecting || '🔗 Đang kết nối...', { id: 'joinRoom' });
    socketRef.current.emit('join-room', { roomCode, playerName });
  };

  const joinRandom = (playerName) => {
    if (!currentUser) return toast.error(t[langRef.current]?.reqLogin || 'Vui lòng đăng nhập!');
    if (!playerName || playerName.length < 2) return toast.error(t[langRef.current]?.reqName || 'Tên quá ngắn!');
    
    gsRef.current.myName = playerName;
    secureStorage.setItem('astro_custom_name', playerName);
    setLobbyState('finding'); 
    socketRef.current.emit('join-random', { name: playerName });

    if (findMatchTimeoutRef.current) clearTimeout(findMatchTimeoutRef.current);
    findMatchTimeoutRef.current = setTimeout(() => {
      leaveLobby('menu');
      toast.error(langRef.current === 'vi' ? '⏱️ Không tìm thấy đối thủ, vui lòng thử lại!' : '⏱️ Matchmaking timeout. Try again!', { duration: 4000 });
    }, 120000); 
  };

  return {
    socketId: myId,
    socketRef, lobbyState, setLobbyState, roomPlayers, chatMessages, lobbyCountdownText, isRandomRoom,
    toggleReady, sendChat, sendData, leaveLobby, createRoom, joinRoom, joinRandom
  };
}