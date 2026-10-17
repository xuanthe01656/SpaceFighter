import CryptoJS from 'crypto-js';

// Backwards-compatible guest cache obfuscation; NOT tamper-proof security.
// Do not rotate the key without migrating existing guest saves.
const SECRET_KEY = import.meta.env.VITE_STORAGE_KEY || "AstroCat_Secure_Key_99@2026";

export const secureStorage = {
  setItem: (key, value) => {
    try {
      const strValue = JSON.stringify(value);
      const encrypted = CryptoJS.AES.encrypt(strValue, SECRET_KEY).toString();
      localStorage.setItem(key, encrypted);
    } catch (e) {
      console.error("Lỗi mã hóa:", e);
    }
  },

  getItem: (key, defaultValue = null) => {
    try {
      const data = localStorage.getItem(key);
      if (!data) return defaultValue;
      const bytes = CryptoJS.AES.decrypt(data, SECRET_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      // Nếu không giải mã được (chuỗi rỗng), có thể là do dữ liệu cũ chưa mã hóa
      if (!decrypted) return data; 

      return JSON.parse(decrypted);
    } catch (e) {
      // Private mode / storage denied / corrupted ciphertext: fail safely.
      return defaultValue;
    }
  },
  removeItem: (key) => {
    try { localStorage.removeItem(key); } catch (_) { /* blocked storage */ }
  }
};