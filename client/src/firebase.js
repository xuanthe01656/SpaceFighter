// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
// 👇 1. THAY ĐỔI Ở ĐÂY: Import thêm initializeAuth và indexedDBLocalPersistence
import { getAuth, GoogleAuthProvider, initializeAuth, indexedDBLocalPersistence } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// 👇 DÙNG TRY-CATCH ĐỂ BẢO VỆ APP KHỎI MÀN HÌNH ĐEN
let dbInstance;
try {
  // Chỉ dùng 1 cờ duy nhất, bỏ dòng AutoDetect đi để tránh lỗi
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true
  });
} catch (error) {
  alert("🚨 LỖI FIRESTORE KHI MỞ APP:\n" + error.message);
  console.error("Lỗi initializeFirestore, lùi về getFirestore:", error);
  // Nếu lỗi, tự động dùng hàm cũ để App vẫn lên hình bình thường
  dbInstance = getFirestore(app);
}

export const db = dbInstance;

// 👇 2. ĐẶC TRỊ TREO ĐĂNG NHẬP IOS Ở ĐÂY
let authInstance;
try {
  // Ép iOS sử dụng bộ nhớ gốc của máy để lưu Token, tránh bị WebKit đóng băng
  authInstance = initializeAuth(app, {
    persistence: indexedDBLocalPersistence
  });
} catch (error) {
  // Dự phòng: Nếu hệ thống đã tự khởi tạo Auth từ trước thì xài lại đồ cũ
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();