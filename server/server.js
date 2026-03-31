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
const SHOP_PRICES = {
  skin: { 'classic': 0, 'dog': 0, 'evilFly': 200, 'ufo': 300, 'plane': 500 },
  bg: { 'deep': 0, 'forest': 150, 'ocean': 350,'sunset': 550, 'meteor': 700, 'hyperspace': 1200}
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
      const inventory = data.inventory || { skins: ['classic'], bgs: ['deep'] };

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
          lastScoreUpdate: Date.now() // Phục vụ Anti-cheat
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
      lastScoreUpdate: Date.now() // Phục vụ Anti-cheat
    });
    room.status = 'playing';
    
    playerSockets.set(socket.id, {
      ...playerSockets.get(socket.id),
      roomCode: roomCode,
      isHost: false
    });
    
    io.to(roomCode).emit('game-start', { players: room.players });
    console.log(`🎮 Player ${playerName} joined room ${roomCode}`);
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
        if (scoreDifference > 6 || timeSinceLastUpdate < 300) {
          console.log(`⚠️ Nghi vấn Hack điểm: User ${socket.id} - Bỏ qua update`);
          data.score = player.score; 
        } else {
          player.score = data.score;
          player.lastScoreUpdate = now;
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

  // Disconnect handling
  socket.on('disconnect', () => {
    const playerData = playerSockets.get(socket.id);
    
    if (playerData && playerData.roomCode) {
      const room = rooms.get(playerData.roomCode);
      if (room) {
        io.to(playerData.roomCode).emit('opponent-disconnected', {
          playerId: socket.id
        });
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