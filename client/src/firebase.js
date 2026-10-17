// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // nếu bạn dùng Firestore

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD1B8Q5KtS_NOI8KOnpEbJBp1kb7tEiUww",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "distributed-inn-482605-c6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "distributed-inn-482605-c6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "distributed-inn-482605-c6.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "528039759292",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:528039759292:web:4aab5ad9ac2bddd9362fb9",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-Y5CS812JKF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app); // hoặc getDatabase(app) nếu bạn dùng Realtime Database

export { app, analytics, auth, db };
