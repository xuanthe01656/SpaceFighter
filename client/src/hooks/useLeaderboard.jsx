import { useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { secureStorage } from '../utils/storageHelper';
import { t } from '../utils/translations';
import toast from 'react-hot-toast';

export function useLeaderboard(gsRef, langRef, setScreen) {
  const [leaderboardMode, setLeaderboardMode] = useState('single');
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [topRecords, setTopRecords] = useState({ single: 'Đang tải...', pvp: 'Đang tải...' });
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [userRankData, setUserRankData] = useState(null);

  const submitScore = async (mode = 'single', isAuto = false, customName = '') => {
    const gs = gsRef.current;
    const user = auth.currentUser; 
    const lang = langRef.current;
    if (!user) return false;

    let name = '';
    let scoreToSend = gs.score;

    if (mode === 'single') {
      name = customName || secureStorage.getItem('astro_custom_name') || user.displayName;
      secureStorage.setItem('astro_custom_name', name);
      gsRef.current.myName = name;
    } else {
      scoreToSend = Math.max(gs.score, gs.remoteScore); 
      const p1Name = gs.myName || 'Player';
      const p2Name = gs.remoteName || 'Opponent';
      if (gs.score > gs.remoteScore) name = `${p1Name} (${gs.score}) ⚔️ ${p2Name} (${gs.remoteScore})`;
      else if (gs.remoteScore > gs.score) name = `${p2Name} (${gs.remoteScore}) ⚔️ ${p1Name} (${gs.score})`;
      else name = p1Name.localeCompare(p2Name) <= 0 ? `${p1Name} (${gs.score}) ⚔️ ${p2Name} (${gs.remoteScore})` : `${p2Name} (${gs.remoteScore}) ⚔️ ${p1Name} (${gs.score})`;
    }

    if (!isAuto) toast.loading(t[lang]?.savingScore || '💾 Đang lưu...', { id: 'saveScore' });

    try {
      const scoreRef = doc(db, "leaderboard", `${user.uid}_${mode}`);
      const snap = await getDoc(scoreRef);
      
      if (snap.exists() && snap.data().score >= scoreToSend) {
        if (!isAuto) {
          toast.dismiss('saveScore');
          toast.error(`❌ Điểm ván này (${scoreToSend}) chưa vượt qua Kỷ lục cũ (${snap.data().score})!`);
          if (mode === 'pvp') setTimeout(() => openLeaderboard(mode), 1500); 
        }
        return false; 
      }

      await setDoc(scoreRef, { uid: user.uid, name: name, score: scoreToSend, mode: mode, timestamp: serverTimestamp() });

      if (!isAuto) {
        toast.dismiss('saveScore');
        toast.success(t[lang]?.successNewRecord || '✅ Kỷ lục mới!');
        setTimeout(() => openLeaderboard(mode), 1000);
      }
      return true;
    } catch (err) {
      if (!isAuto) { toast.dismiss('saveScore'); toast.error('❌ Lỗi Firebase: ' + err.message); }
      return false;
    }
  };

  const openLeaderboard = async (mode = 'single') => {
    setLeaderboardMode(mode); setIsLoadingLeaderboard(true); setLeaderboardData([]); setUserRankData(null); setScreen('leaderboard');
    try {
      const q = query(collection(db, "leaderboard"), where("mode", "==", mode), orderBy("score", "desc"), limit(mode === 'pvp' ? 20 : 10));
      const timeout1 = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout 8s")), 8000));
      const querySnapshot = await Promise.race([getDocs(q), timeout1]);

      let data = []; const seenNames = new Set(); 
      querySnapshot.forEach((doc) => {
        if (mode === 'pvp') {
          if (!seenNames.has(doc.data().name)) { seenNames.add(doc.data().name); data.push({ ...doc.data(), id: doc.id }); }
        } else data.push({ ...doc.data(), id: doc.id });
      });
      if (data.length > 10) data = data.slice(0, 10);
      setLeaderboardData(data);

      if (auth.currentUser) {
        const userDocId = `${auth.currentUser.uid}_${mode}`;
        const userDocSnap = await Promise.race([getDoc(doc(db, "leaderboard", userDocId)), new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 8000))]);
        
        if (userDocSnap.exists()) {
          const uData = userDocSnap.data();
          if (!data.some(item => item.id === userDocId)) {
            const higherSnap = await Promise.race([getDocs(query(collection(db, "leaderboard"), where("mode", "==", mode), where("score", ">", uData.score))), new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 8000))]);
            setUserRankData({ ...uData, rank: higherSnap.docs.length + 1 });
          }
        }
      }
    } catch (err) { alert("🚨 LỖI LEADERBOARD:\n" + err.message); }
    setIsLoadingLeaderboard(false);
  };

  const loadTopRecords = () => {
    const fetchTop = async (mode, key) => {
      try {
        const q = query(collection(db, "leaderboard"), where("mode", "==", mode), orderBy("score", "desc"), limit(1));
        const querySnapshot = await Promise.race([getDocs(q), new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 8000))]);
        if (!querySnapshot.empty) {
          const topData = querySnapshot.docs[0].data();
          let name = topData.name;
          if (mode === 'pvp' && name.length > 25) name = name.substring(0, 25) + '...';
          setTopRecords(prev => ({ ...prev, [key]: mode === 'single' ? `${name} - ${topData.score}` : name }));
        } else setTopRecords(prev => ({ ...prev, [key]: 'Chưa có' }));
      } catch (error) { setTopRecords(prev => ({ ...prev, [key]: 'Lỗi tải' })); }
    };
    fetchTop('single', 'single'); fetchTop('pvp', 'pvp');
  };

  return { topRecords, leaderboardMode, leaderboardData, isLoadingLeaderboard, userRankData, submitScore, openLeaderboard, loadTopRecords };
}