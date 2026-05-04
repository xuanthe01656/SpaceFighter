// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // nếu bạn dùng Firestore

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD1B8Q5KtS_NOI8KOnpEbJBp1kb7tEiUww",
  authDomain: "distributed-inn-482605-c6.firebaseapp.com",
  projectId: "distributed-inn-482605-c6",
  storageBucket: "distributed-inn-482605-c6.firebasestorage.app",
  messagingSenderId: "528039759292",
  appId: "1:528039759292:web:4aab5ad9ac2bddd9362fb9",
  measurementId: "G-Y5CS812JKF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app); // hoặc getDatabase(app) nếu bạn dùng Realtime Database

export { app, analytics, auth, db };
