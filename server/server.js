const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

// Cấu hình Firebase Admin (Giữ lại để sau này làm API Nạp tiền/Quay Gacha bảo mật cho Chiến dịch nếu cần)
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined,
};

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("✅ Firebase Admin initialized.");
} catch (error) {
  console.log("⚠️ Firebase Admin warning:", error.message);
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Route dùng để "đánh thức" server (Giúp các dịch vụ host như Render/Heroku không bị sleep)
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// =========================================================================
// --- NƠI ĐÂY DÀNH CHO CÁC API CHIẾN DỊCH TRONG TƯƠNG LAI (NẾU CẦN) ---
// Ví dụ: Xác thực mua in-app purchase (IAP), Xác thực quay Gacha phía server...
// =========================================================================



// =========================================================================
// PHỤC VỤ GIAO DIỆN CLIENT (REACT / VITE)
// =========================================================================
const clientPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientPath));

// Bắt mọi route khác và trả về index.html để React Router tự xử lý
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Campaign đang chạy mượt mà tại PORT: ${PORT}`);
});