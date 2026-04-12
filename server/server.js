const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: "*" }));
app.use(express.json());
// Route dùng để "đánh thức" server
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});
const SHOP_PRICES = {
  skin: { 'classic': 0, 'dog': 0, 'evilFly': 300, 'ufo': 500, 'plane': 700, 'astro_plane': 2000 },
  bg: { 'deep': 0, 'forest': 150, 'ocean': 550,'sunset': 1200, 'meteor': 350, 'hyperspace': 700 }
};
// Gọi API purchase
app.post('/api/shop/purchase', async (req, res) => {
  const { idToken, type, itemId } = req.body;

  if (!idToken || !type || !itemId) {
    return res.status(400).json({ error: 'Thiếu thông tin giao dịch' });
  }

  try {
    // Xác thực người dùng qua Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const itemPrice = SHOP_PRICES[type]?.[itemId];
    if (itemPrice === undefined) {
      return res.status(400).json({ error: 'Vật phẩm không tồn tại' });
    }

    const userRef = db.collection('users').doc(uid);

    // HỨNG KẾT QUẢ VÀO BIẾN finalCoins
    const finalCoins = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userRef);
      if (!doc.exists) throw new Error('Không tìm thấy dữ liệu người dùng');

      const data = doc.data();
      const currentCoins = data.coins || 0;
      const inventory = data.inventory || {};
      // 2. Kiểm tra VÀ khởi tạo từng mảng bên trong (Vá lỗi undefined gây crash)
      if (!inventory.skins) inventory.skins = ['classic'];
      if (!inventory.bgs) inventory.bgs = ['deep'];

      const targetList = type === 'skin' ? inventory.skins : inventory.bgs;
      if (targetList.includes(itemId)) {
        throw new Error('Bạn đã sở hữu vật phẩm này rồi');
      }

      if (currentCoins < itemPrice) {
        throw new Error('Không đủ Xu để mua');
      }

      targetList.push(itemId);
      const newCoins = currentCoins - itemPrice;

      transaction.update(userRef, { 
        coins: newCoins, 
        inventory: inventory 
      });

      // TRẢ VỀ SỐ XU MỚI ĐỂ DÙNG BÊN NGOÀI
      return newCoins; 
    });

    // Trả về thành công kèm số xu mới (dùng finalCoins)
    res.json({ success: true, newCoins: finalCoins });

  } catch (error) {
    console.error('Lỗi giao dịch:', error);
    res.status(500).json({ error: error.message });
  }
});
const clientPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientPath));
const PORT = process.env.PORT || 3000;

// Store active rooms and players
const rooms = new Map();
const playerSockets = new Map();

// --- VÁ LỖI MEMORY LEAK: Tự động dọn phòng "rác" mỗi 5 phút ---
setInterval(() => {
  const now = Date.now();
  for (const [roomCode, room] of rooms.entries()) {
    // Nếu phòng ở trạng thái waiting quá 10 phút (600,000 ms) mà chưa ai vào
    if (room.status === 'waiting' && (now - room.createdAt > 600000)) {
      rooms.delete(roomCode);
      console.log(`🧹 Dọn dẹp phòng rác bị treo: ${roomCode}`);
    }
  }
}, 300000); // Chạy 5 phút 1 lần

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`📡 User connected: ${socket.id}`);

  // Player joins lobby
  socket.on('join-lobby', (playerData) => {
    playerSockets.set(socket.id, {
      playerId: socket.id,
      name: playerData.name || 'Player',
      settings: playerData.settings || { skin: 'classic', bg: 'deep' }
    });
    console.log(`✅ Player ${playerData.name || 'Player'} joined lobby`);
  });

  // Host creates a room
  socket.on('create-room', (playerData) => {
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    socket.join(roomCode);
    
    const room = {
      code: roomCode,
      createdAt: Date.now(), // Thêm timestamp để theo dõi tuổi của phòng
      host: socket.id,
      players: [
        {
          id: socket.id,
          name: playerData.name,
          score: 0,
          isDead: false,
          isHost: true,
          lastScoreUpdate: Date.now(),
          isReady: false
        }
      ],
      status: 'waiting'
    };
    
    rooms.set(roomCode, room);
    playerSockets.set(socket.id, {
      ...playerSockets.get(socket.id),
      roomCode: roomCode,
      isHost: true
    });
    
    socket.emit('room-created', { roomCode: roomCode });
    console.log(`🎮 Room created: ${roomCode} (Host: ${playerData.name})`);
  });

  // Guest joins a room
  socket.on('join-room', (data) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      return socket.emit('join-failed', { error: 'Room not found' });
    }
    
    if (room.status !== 'waiting' || room.players.length >= 2) {
      return socket.emit('join-failed', { error: 'Room is full or game started' });
    }
    
    socket.join(roomCode);
    
    room.players.push({
      id: socket.id,
      name: playerName,
      score: 0,
      isDead: false,
      isHost: false,
      lastScoreUpdate: Date.now(),
      isReady: false
    });
    room.status = 'playing';
    
    playerSockets.set(socket.id, {
      ...playerSockets.get(socket.id),
      roomCode: roomCode,
      isHost: false
    });
    
   io.to(roomCode).emit('room-updated', { players: room.players, roomCode: roomCode, isRandom: false });
    console.log(`🎮 Player ${playerName} joined room ${roomCode}`);
  });
/// ĐẤU NGẪU NHIÊN (Random Matchmaking)
  socket.on('join-random', (playerData) => {
    let foundRoom = null;
    for (const [roomCode, room] of rooms.entries()) {
      if (room.status === 'waiting' && room.isRandom && room.players.length === 1) {
        foundRoom = room;
        break;
      }
    }

    if (foundRoom) {
      // 2. TÌM THẤY -> Ghép vào phòng và CÙNG VÀO SẢNH CHỜ
      socket.join(foundRoom.code);
      foundRoom.players.push({
        id: socket.id, name: playerData.name, score: 0, isDead: false, isHost: false, lastScoreUpdate: Date.now(), isReady: false
      });
      playerSockets.set(socket.id, { ...playerSockets.get(socket.id), roomCode: foundRoom.code, isHost: false });
      
      // Báo cho cả 2 người cập nhật danh sách phòng
      io.to(foundRoom.code).emit('room-updated', { players: foundRoom.players, roomCode: foundRoom.code, isRandom: true });
      console.log(`🌍 Random Match: ${playerData.name} joined ${foundRoom.code}`);
      
    } else {
      // 3. KHÔNG TÌM THẤY -> Tạo phòng ngẫu nhiên chờ
      const roomCode = 'RND-' + Math.floor(1000 + Math.random() * 9000).toString();
      socket.join(roomCode);
      const room = {
        code: roomCode, createdAt: Date.now(), host: socket.id, isRandom: true,
        players: [{ id: socket.id, name: playerData.name, score: 0, isDead: false, isHost: true, lastScoreUpdate: Date.now(), isReady: false }],
        status: 'waiting'
      };
      rooms.set(roomCode, room);
      playerSockets.set(socket.id, { ...playerSockets.get(socket.id), roomCode: roomCode, isHost: true });
      
      socket.emit('waiting-random'); // Vẫn báo Radar
      console.log(`🌍 Random Room created: ${roomCode} by ${playerData.name}`);
    }
  });
  // --- TÍNH NĂNG CHAT TRONG LOBBY ---
  socket.on('chat-message', (msg) => {
    const p = playerSockets.get(socket.id);
    if (p && p.roomCode) {
      io.to(p.roomCode).emit('chat-message', { senderId: socket.id, senderName: p.name, text: msg });
    }
  });

  // --- TÍNH NĂNG SẴN SÀNG & ĐẾM NGƯỢC ---
  socket.on('toggle-ready', () => {
    const p = playerSockets.get(socket.id);
    if (!p || !p.roomCode) return;
    const room = rooms.get(p.roomCode);
    if (!room || room.status !== 'waiting') return;

    const player = room.players.find(pl => pl.id === socket.id);
    if (player) {
      player.isReady = !player.isReady; // Đảo trạng thái
      io.to(p.roomCode).emit('room-updated', { players: room.players, roomCode: p.roomCode, isRandom: room.isRandom });

      // Nếu đủ 2 người và CẢ HAI đều sẵn sàng
      if (room.players.length === 2 && room.players.every(pl => pl.isReady)) {
        room.status = 'starting'; // Khóa phòng không cho đổi trạng thái nữa
        io.to(p.roomCode).emit('lobby-countdown', 3);
        
        let count = 2;
        room.countdownInterval = setInterval(() => {
          if (count > 0) {
            io.to(p.roomCode).emit('lobby-countdown', count);
            count--;
          } else {
            clearInterval(room.countdownInterval);
            room.status = 'playing';
            // Reset sẵn sàng cho ván sau
            room.players.forEach(pl => pl.isReady = false);
            io.to(p.roomCode).emit('game-start', { players: room.players });
          }
        }, 1000);
      }
    }
  });
  // Gộp chung xử lý trạng thái game vào game-update
  socket.on('game-update', (data) => {
    const playerData = playerSockets.get(socket.id);
    if (!playerData || !playerData.roomCode) return;
    
    const roomCode = playerData.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      const player = room.players[playerIndex];

      // --- VÁ LỖI BẢO MẬT: ANTI-CHEAT CƠ BẢN ---
      // Nếu client gửi lên số điểm lớn hơn điểm hiện tại
      if (data.score > player.score) {
        const now = Date.now();
        const timeSinceLastUpdate = now - player.lastScoreUpdate;
        const scoreDifference = data.score - player.score;

        // Cho phép nhảy tối đa 6 điểm 1 lúc (1 ống nước + 1 ngôi sao)
        // Cho phép nhận điểm liên tục với khoảng cách tối thiểu 300ms (tốc độ bay max)
        if (data.score > player.score) {
          const scoreDifference = data.score - player.score;
          // Nếu mạng lag, nhiều gói tin có thể gửi gộp, nới lỏng giới hạn lên khoảng 15 điểm (VD: 2 sao + 5 ống)
          if (scoreDifference > 15) {
            console.log(`⚠️ Nghi vấn Hack điểm: User ${socket.id} - Nhảy vọt ${scoreDifference} điểm. Bỏ qua update`);
            data.score = player.score; 
          } else {
            player.score = data.score;
          }
        }
      }
      
      player.isDead = data.isDead;
    }
    
    // Phát tín hiệu cho đối thủ
    socket.to(roomCode).emit('opponent-update', {
      playerId: socket.id,
      score: data.score, // Đã được validate
      isDead: data.isDead
    });

    // LOGIC TRỌNG TÀI DUY NHẤT (Đã xóa sự kiện game-over thừa thãi)
    const bothDead = room.players.length === 2 && room.players.every(p => p.isDead);
    if (bothDead) {
      io.to(roomCode).emit('game-finished');
      rooms.delete(roomCode);
      console.log(`🏁 Game finished in room ${roomCode} - Cả 2 đã chết.`);
    }
  });
  // Rời phòng / Hủy tìm trận ngẫu nhiên
  socket.on('leave-room', () => {
    const playerData = playerSockets.get(socket.id);
    if (playerData && playerData.roomCode) {
      const room = rooms.get(playerData.roomCode);
      
      if (room && room.countdownInterval) clearInterval(room.countdownInterval);

      if (room && (room.status === 'waiting' || room.status === 'starting')) {
        // BÁO CHO NGƯỜI CÒN LẠI BIẾT LÀ ĐỐI THỦ ĐÃ THOÁT
        socket.to(playerData.roomCode).emit('opponent-left-lobby');
        
        rooms.delete(playerData.roomCode);
        console.log(`🚫 Đã hủy phòng: ${playerData.roomCode}`);
      }
      
      socket.leave(playerData.roomCode);
      playerSockets.set(socket.id, { ...playerData, roomCode: null, isHost: false });
    }
  });

  // Disconnect handling (Trường hợp mất mạng hoặc tắt app ngang)
  socket.on('disconnect', () => {
    const playerData = playerSockets.get(socket.id);
    
    if (playerData && playerData.roomCode) {
      const room = rooms.get(playerData.roomCode);
      if (room) {
        if (room.countdownInterval) clearInterval(room.countdownInterval);
        
        // Phân loại: Đang ở sảnh chờ thì báo rời sảnh, đang trong game thì báo mất kết nối ván đấu
        if (room.status === 'waiting' || room.status === 'starting') {
          socket.to(playerData.roomCode).emit('opponent-left-lobby');
        } else {
          io.to(playerData.roomCode).emit('opponent-disconnected', {
            playerId: socket.id
          });
        }
        rooms.delete(playerData.roomCode);
        console.log(`🎮 Room ${playerData.roomCode} deleted (player disconnect)`);
      }
    }
    
    playerSockets.delete(socket.id);
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server đang chạy thành công tại PORT: ${PORT}`);
});