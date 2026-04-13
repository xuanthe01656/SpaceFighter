import React, { useEffect } from 'react';
import toast from 'react-hot-toast';
import { secureStorage } from '../utils/storageHelper';
import { t } from '../utils/translations';

export function useLifeRegen(gsRef, currentUser, uiUpdates, setUIUpdates, langRef, getRealTime, saveUserProfile) {
  useEffect(() => {
    const REGEN_TIME = 2 * 60 * 60 * 1000; 
    
    const timer = setInterval(() => {
      const gs = gsRef.current;
      if (gs.isVIP) {
        if (uiUpdates.nextLifeTime !== null || uiUpdates.lives !== '∞') {
          setUIUpdates(prev => ({ ...prev, nextLifeTime: null, lives: '∞' }));
        }
        return; 
      }
      if (gs.lives >= 10) {
        if (uiUpdates.nextLifeTime) setUIUpdates(prev => ({ ...prev, nextLifeTime: null }));
        return;
      }

      let lastLost = currentUser ? gs.livesUpdatedAt : parseInt(secureStorage.getItem('astro_guest_last_lost'));
      
      if (!lastLost || isNaN(lastLost)) {
        lastLost = getRealTime();
        gs.livesUpdatedAt = lastLost;
        if (!currentUser) secureStorage.setItem('astro_guest_last_lost', lastLost);
        return;
      }

      const now = getRealTime();
      const timePassed = now - lastLost;

      if (timePassed >= REGEN_TIME) {
        const gained = Math.floor(timePassed / REGEN_TIME);
        const newLives = Math.min(10, gs.lives + gained);
        const newLastLost = lastLost + (gained * REGEN_TIME);
        
        gs.lives = newLives;
        gs.livesUpdatedAt = newLives >= 10 ? null : newLastLost;

        if (currentUser) {
          // Bơm mạng tự động mà không cần đẩy các dữ liệu khác
          saveUserProfile({ 
            lives: gs.lives, 
            livesUpdatedAt: gs.livesUpdatedAt 
          }); 
        } else {
          secureStorage.setItem('astro_guest_lives', gs.lives);
          if (gs.lives >= 10) secureStorage.removeItem('astro_guest_last_lost');
          else secureStorage.setItem('astro_guest_last_lost', gs.livesUpdatedAt);
        }

        setUIUpdates(prev => ({ ...prev, lives: gs.lives }));
        if(gained >= 10) toast.success(t[langRef.current]?.regenAllLives);
        else toast.success(`${t[langRef.current]?.regenSomeLives} ${gained} ${t[langRef.current]?.regenSomeLivesEnd}`);
        
      } else {
        const remainingMs = REGEN_TIME - timePassed;
        const h = Math.floor(remainingMs / (1000 * 60 * 60));
        const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((remainingMs % (1000 * 60)) / 1000);
        const formattedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        if (uiUpdates.nextLifeTime !== formattedTime) {
          setUIUpdates(prev => ({ ...prev, nextLifeTime: formattedTime }));
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentUser, uiUpdates.lives]);
}