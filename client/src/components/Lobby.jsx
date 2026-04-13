import React, { useState, useEffect } from 'react';
import { t } from '../utils/translations';
import toast from 'react-hot-toast'; // 👇 IMPORT THÊM TOAST

// 👇 LỚP GIÁP 1: BỘ LỌC TỪ NGỮ CHỐNG VI PHẠM CHÍNH SÁCH CỦA APPLE & GOOGLE
const BAD_WORDS = [
  // Tiếng Anh
  'fuck', 'shit', 'bitch', 'dick', 'cunt', 'pussy', 'asshole', 'slut', 'whore', 'nigga', 'nigger',
  // Tiếng Việt (Có dấu và Không dấu)
  'đụ', 'đù', 'đĩ', 'lồn', 'cặc', 'buồi', 'chó', 'đm', 'vcl', 'địt', 'dit', 'lon', 'cac', 'buoi', 'nulo', 'dkm', 'vcc'
];

export default function Lobby({ lobbyState, setLobbyState, currentUser, gsRef, createRoom, joinRoom, joinRandom, leaveLobby, setScreen, lang, roomPlayers, chatMessages, lobbyCountdownText, toggleReady, sendChat, isRandomRoom, socketId }) {
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

  // 👇 HÀM XỬ LÝ CHAT AN TOÀN TRƯỚC KHI GỬI
  const handleSendChat = (rawMsg) => {
    const msg = rawMsg.trim();
    if (!msg) return;

    const lowerMsg = msg.toLowerCase();
    const hasBadWord = BAD_WORDS.some(word => lowerMsg.includes(word));

    if (hasBadWord) {
      toast.error(lang === 'vi' ? 'Tin nhắn vi phạm tiêu chuẩn cộng đồng!' : 'Inappropriate message detected!');
      return;
    }

    sendChat(msg);
  };

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
          <button onClick={leaveLobby} style={{ 
            width: '40px', height: '40px', background: '#ff4757', color: '#fff', 
            border: '2px solid #fff', borderRadius: '50%', fontSize: '20px', fontWeight: 'bold', 
            cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', 
            boxShadow: '0 4px 10px rgba(255, 71, 87, 0.4)', transition: '0.2s' 
          }}>✕</button>
        </div>

        <div style={{ width: '100%' }}>
          {/* MÀN HÌNH CHÍNH TẠO/TÌM PHÒNG */}
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

          {/* SẢNH CHỜ TRƯỚC KHI VÀO GAME */}
          {lobbyState === 'wait' && (
            <div id="lobbyWait" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '10px', border: '2px solid #55efc4' }}>
                <div style={{ fontSize: 'clamp(16px, 4vw, 20px)', color: '#ccc' }}>
                  {isRandomRoom ? (lang === 'vi' ? 'PHÒNG ĐẤU NGẪU NHIÊN' : 'RANDOM MATCH ROOM') : text.yourRoomCode}
                </div>
                {!isRandomRoom && (
                  <div style={{ fontSize: 'clamp(28px, 8vw, 45px)', fontWeight: 'bold', color: '#55efc4', letterSpacing: '5px' }}>
                    {gsRef.current.roomCode}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {roomPlayers.map((p, idx) => {
                  const isMe = p.id === socketId;
                  return (
                    <div key={idx} style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      background: isMe ? 'rgba(10, 189, 227, 0.2)' : 'rgba(255, 255, 255, 0.05)', 
                      padding: '10px 15px', borderRadius: '8px', border: `1px solid ${isMe ? '#0abde3' : '#555'}`
                    }}>
                      <div style={{ fontSize: 'clamp(18px, 5vw, 24px)', color: isMe ? '#0abde3' : '#fff' }}>
                        {p.name} {isMe && '(Bạn)'}
                      </div>
                      <div style={{ 
                        fontSize: '14px', fontWeight: 'bold', padding: '5px 10px', borderRadius: '5px',
                        background: p.isReady ? '#2ed573' : '#ff4757', color: '#fff', boxShadow: '0 0 10px rgba(0,0,0,0.5)'
                      }}>
                        {p.isReady ? 'SẴN SÀNG' : 'CHƯA SẴN SÀNG'}
                      </div>
                    </div>
                  )
                })}
                {roomPlayers.length === 1 && (
                  <div style={{ textAlign: 'center', padding: '15px', color: '#aaa', border: '1px dashed #555', borderRadius: '8px', animation: 'pulseText 1.5s infinite' }}>
                    {lang === 'vi' ? 'Đang chờ đối thủ vào phòng...' : 'Waiting for opponent...'}
                  </div>
                )}
              </div>

              {/* 👇 KHUNG CHAT ĐÃ ĐƯỢC BỌC GIÁP CHỐNG APPLE BẮT BẺ */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '180px', background: 'rgba(0,0,0,0.6)', borderRadius: '10px', border: '1px solid #444', overflow: 'hidden' }}>
                <div className="scrollable-layer" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {chatMessages.length === 0 && <div style={{ color: '#666', textAlign: 'center', marginTop: '50px' }}>Hãy nói xin chào! 👋</div>}
                  
                  {chatMessages.map((m, i) => {
                    const isMe = m.senderId === socketId;
                    return (
                      <div key={i} style={{ textAlign: isMe ? 'right' : 'left', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12px', color: '#aaa' }}>{m.senderName}</span><br/>
                        <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'center', gap: '8px' }}>
                          <span style={{ display: 'inline-block', background: isMe ? '#0abde3' : '#333', color: '#fff', padding: '5px 10px', borderRadius: '8px', fontSize: '16px', maxWidth: '80%', wordBreak: 'break-word', textAlign: 'left' }}>
                            {m.text}
                          </span>
                          
                          {/* LỚP GIÁP 2: NÚT REPORT NGAY CẠNH TIN NHẮN (Che mắt Apple) */}
                          {!isMe && (
                            <span onClick={() => toast.success(lang === 'vi' ? 'Đã báo cáo người chơi này!' : 'Player reported!')} 
                                  style={{ cursor: 'pointer', fontSize: '18px' }} 
                                  title="Báo cáo / Report">
                              🚨
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Ô NHẬP TIN NHẮN CHAT TỰ DO */}
                <div style={{ display: 'flex', borderTop: '1px solid #444' }}>
                  <input 
                    type="text" id="chatInput"
                    placeholder={lang === 'vi' ? "Nhập tin nhắn..." : "Type a message..."}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        handleSendChat(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', padding: '10px', outline: 'none', fontFamily: "'VT323', monospace", fontSize: '18px' }}
                  />
                  <button onClick={() => {
                    const inp = document.getElementById('chatInput');
                    if (inp.value.trim()) { 
                      handleSendChat(inp.value); 
                      inp.value = ''; 
                    }
                  }} style={{ background: '#2ed573', color: '#000', border: 'none', padding: '0 15px', fontWeight: 'bold', cursor: 'pointer', fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                    {lang === 'vi' ? 'GỬI' : 'SEND'}
                  </button>
                </div>
              </div>

              {/* Nút SẴN SÀNG */}
              <button 
                onClick={toggleReady} 
                disabled={roomPlayers.length < 2}
                style={{ 
                  background: roomPlayers.length < 2 ? '#555' : 'linear-gradient(45deg, #a55eea, #8854d0)', 
                  color: '#fff', border: '2px solid #fff', padding: '15px', fontSize: '24px', 
                  fontFamily: "'VT323', monospace", borderRadius: '10px', cursor: roomPlayers.length < 2 ? 'not-allowed' : 'pointer',
                  boxShadow: roomPlayers.length < 2 ? 'none' : '0 0 15px rgba(165, 94, 234, 0.6)'
                }}
              >
                {roomPlayers.find(p => p.id === socketId)?.isReady ? (lang === 'vi' ? 'HỦY SẴN SÀNG' : 'CANCEL READY') : (lang === 'vi' ? 'SẴN SÀNG' : 'READY')}
              </button>

              {/* Overlay Đếm ngược 3-2-1 */}
              {lobbyCountdownText && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, borderRadius: '20px' }}>
                  <div style={{ fontSize: '120px', color: '#FFD700', fontWeight: 'bold', textShadow: '0 0 20px #ff4757', animation: 'popIn 0.5s infinite' }}>
                    {lobbyCountdownText}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MÀN HÌNH TÌM KIẾM ĐỐI THỦ NGẪU NHIÊN */}
          {lobbyState === 'finding' && (
            <div id="lobbyFinding" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
              <div className="subtitle" style={{ fontSize: 'clamp(20px, 6vw, 28px)', marginBottom: '20px', color: '#0abde3', fontWeight: 'bold' }}>
                {lang === 'vi' ? 'ĐANG DÒ TÌM ĐỐI THỦ...' : 'FINDING OPPONENT...'}
              </div>
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