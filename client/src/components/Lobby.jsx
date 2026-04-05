import React, { useState, useEffect } from 'react';
import { t } from '../utils/translations';
export default function Lobby({ lobbyState, setLobbyState, currentUser, gsRef, createRoom, joinRoom, joinRandom, leaveLobby, setScreen, lang }) {
  const text = t[lang] || t['vi'];

  const [playerName, setPlayerName] = useState(() => {
    return currentUser?.displayName || localStorage.getItem('astro_custom_name') || '';
  });
  const [roomCode, setRoomCode] = useState('');
  useEffect(() => {
    if (currentUser?.displayName) {
      setPlayerName(currentUser.displayName);
      localStorage.setItem('astro_custom_name', currentUser.displayName);
    }
  }, [currentUser]);

  return (
    <div className="ui-layer" style={{ background: 'rgba(0, 8, 20, 0.95)' }}>
      
      <div className="lobby-panel" style={{ 
        width: '90%', maxWidth: '500px', background: '#0a192f', borderRadius: '20px', 
        border: '3px solid #a55eea', padding: 'clamp(10px, 4vw, 20px)', boxShadow: '0 0 15px rgba(165, 94, 234, 0.5)', 
        pointerEvents: 'auto', display: 'flex', flexDirection: 'column' 
      }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #1a365d', paddingBottom: '15px' }}>
          <div style={{ fontSize: 'clamp(24px, 8vw, 40px)', color: '#a55eea', fontWeight: 'bold', textShadow: '2px 2px 0 #000', fontFamily: "'VT323', monospace", margin: 0 }}>
            {text.lobbyTitle}
          </div>
          {/* <button onClick={() => {setScreen('menu');setLobbyState('main'); gsRef.current.roomCode = null;
            }} style={{ 
            width: '40px', height: '40px', background: '#ff4757', color: '#fff', 
            border: '2px solid #fff', borderRadius: '50%', fontSize: '20px', fontWeight: 'bold', 
            cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', 
            boxShadow: '0 4px 10px rgba(255, 71, 87, 0.4)', transition: '0.2s' 
          }}>✕</button> */}
          <button onClick={leaveLobby} style={{ 
            width: '40px', height: '40px', background: '#ff4757', color: '#fff', 
            border: '2px solid #fff', borderRadius: '50%', fontSize: '20px', fontWeight: 'bold', 
            cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', 
            boxShadow: '0 4px 10px rgba(255, 71, 87, 0.4)', transition: '0.2s' 
          }}>✕</button>
        </div>

        <div style={{ width: '100%' }}>
          {lobbyState === 'main' && (
            <div id="lobbyMain">
              <input 
                type="text" 
                placeholder={text.enterWarriorName} 
                maxLength="12" 
                value={playerName} 
                onChange={(e) => setPlayerName(e.target.value)}
                style={{ width: '90%', padding: '10px', fontFamily: "'VT323', monospace", fontSize: 'clamp(18px, 5vw, 24px)', textAlign: 'center', borderRadius: '8px', border: '2px solid #FFD700', background: 'rgba(0,0,0,0.5)', color: '#fff', outline: 'none', marginBottom: '15px' }} 
              />
              <div style={{ display: 'flex', alignItems: 'center', width: '90%', margin: '10px auto', gap: '10px' }}>
                <div style={{ flex: 1, height: '1px', background: '#555' }}></div>
                <div style={{ color: '#aaa', fontSize: '16px' }}>{lang === 'vi' ? 'CHỌN CHẾ ĐỘ CHƠI' : 'SELECT MODE'}</div>
                <div style={{ flex: 1, height: '1px', background: '#555' }}></div>
              </div>
              {/* NÚT TÌM TRẬN NGẪU NHIÊN */}
              <button className="btn btn-green" onClick={() => joinRandom(playerName.trim())} style={{ width: '90%', marginBottom: '10px' }}>
                {lang === 'vi' ? '🌍 ĐẤU NGẪU NHIÊN' : '🌍 RANDOM MATCH'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', width: '90%', margin: '10px auto', gap: '10px' }}>
                <div style={{ flex: 1, height: '1px', background: '#555' }}></div>
                <div style={{ color: '#aaa', fontSize: '16px' }}>{lang === 'vi' ? 'HOẶC' : 'OR'}</div>
                <div style={{ flex: 1, height: '1px', background: '#555' }}></div>
              </div>
              <button className="btn btn-blue" onClick={() => createRoom(playerName.trim())} style={{ width: '90%', marginBottom: '10px' }}>
                {text.createNewRoom}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', width: '90%', margin: '10px auto', gap: '10px' }}>
                <div style={{ flex: 1, height: '1px', background: '#555' }}></div>
                <div style={{ color: '#aaa', fontSize: '16px' }}>{lang === 'vi' ? 'HOẶC NHẬP MÃ PHÒNG' : 'OR ENTER ROOM CODE'}</div>
                <div style={{ flex: 1, height: '1px', background: '#555' }}></div>
              </div>
              <div style={{ display: 'flex', width: '90%', gap: '10px', margin: '0 auto' }}>
                <input 
                  type="text" 
                  placeholder={text.enterCode} 
                  maxLength="4" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  style={{ flex: 1, padding: '10px', fontFamily: "'VT323', monospace", fontSize: 'clamp(18px, 5vw, 24px)', textAlign: 'center', borderRadius: '8px', border: '2px solid #a55eea', background: 'rgba(0,0,0,0.5)', color: '#fff', outline: 'none', textTransform: 'uppercase', transition: '0.3s' }} 
                  onFocus={(e) => { e.target.style.borderColor = '#FFD700'; e.target.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.5)'; }} 
                  onBlur={(e) => { e.target.style.borderColor = '#a55eea'; e.target.style.boxShadow = 'none'; }} 
                />
                <button className="btn btn-purple" onClick={() => joinRoom(playerName.trim(), roomCode.trim())} style={{ minWidth: '90px', margin: '0' }}>
                  {text.joinBtn}
                </button>
              </div>
            </div>
          )}
          {lobbyState === 'wait' && (
            <div id="lobbyWait">
              <div className="subtitle" style={{ fontSize: 'clamp(18px, 5vw, 24px)', marginBottom: '5px' }}>{text.yourRoomCode}</div>
              <div className="room-code-box" style={{ fontSize: 'clamp(35px, 15vw, 70px)', fontWeight: 'bold', color: '#55efc4', border: '4px dashed #55efc4', background: 'rgba(0, 0, 0, 0.5)', padding: '10px', margin: '15px 0', textShadow: '0 0 10px #55efc4', letterSpacing: '5px', userSelect: 'text' }}>
                {gsRef.current.roomCode || '----'}
              </div>
              <div style={{ color: '#2ed573', fontSize: 'clamp(14px, 4vw, 18px)', animation: 'blink 1.5s infinite' }}>{text.waitingForOpponent}</div>
            </div>
          )}
          {/* MÀN HÌNH TÌM KIẾM ĐỐI THỦ NGẪU NHIÊN */}
          {lobbyState === 'finding' && (
            <div id="lobbyFinding" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
              <div className="subtitle" style={{ fontSize: 'clamp(20px, 6vw, 28px)', marginBottom: '20px', color: '#0abde3', fontWeight: 'bold' }}>
                {lang === 'vi' ? 'ĐANG DÒ TÌM ĐỐI THỦ...' : 'FINDING OPPONENT...'}
              </div>
              
              {/* Icon Radar xoay / nhấp nháy */}
              <div style={{ fontSize: '60px', animation: 'pulseText 1s infinite' }}>📡</div>
              
              <div style={{ color: '#2ed573', fontSize: 'clamp(14px, 4vw, 18px)', marginTop: '20px', animation: 'blink 1.5s infinite' }}>
                {lang === 'vi' ? 'Vui lòng giữ màn hình sáng...' : 'Please keep the screen on...'}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}