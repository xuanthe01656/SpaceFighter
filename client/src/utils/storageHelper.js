import CryptoJS from 'crypto-js';

// Hãy đổi chuỗi này thành một mã bí mật riêng của bạn
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
    const data = localStorage.getItem(key);
    if (!data) return defaultValue;

    try {
      const bytes = CryptoJS.AES.decrypt(data, SECRET_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      // Nếu không giải mã được (chuỗi rỗng), có thể là do dữ liệu cũ chưa mã hóa
      if (!decrypted) return data; 

      return JSON.parse(decrypted);
    } catch (e) {
      // Trả về dữ liệu gốc nếu đó là dữ liệu cũ (chưa mã hóa) từ phiên bản trước
      return data; 
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
  }
};