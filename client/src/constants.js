// src/constants.js
export const SKINS = [
  { id: 'classic', name: { vi: 'Mèo Sầu Bi', en: 'Sad Cat' }, color: '#FFD700', imgAlive: '/images/cat_alive.png', imgDead: '/images/cat_dead.png', price: 0 },
  { id: 'dog', name: { vi: 'Cún Tinh Nghịch', en: 'Playful Dog' }, color: '#FFD700', imgAlive: '/images/dog.png', imgDead: '/images/dog.png', price: 0 },
  { id: 'evilFly', name: { vi: 'Ruồi Vui Vẻ', en: 'Happy Fly' }, color: '#FFD700', imgAlive: '/images/evil_fly.png', imgDead: '/images/evil_fly.png', price: 200 },
  { id: 'ufo', name: { vi: 'Phi Thuyền UFO', en: 'UFO Spaceship' }, color: '#FFD700', imgAlive: '/images/ufo.png', imgDead: '/images/ufo.png', price: 300 },
  { id: 'plane', name: { vi: 'Phi Công Trẻ', en: 'Young Pilot' }, color: '#FFD700', imgAlive: '/images/fly_alive.png', imgDead: '/images/fly_dead.png', price: 500 },
];
  
 export const BACKGROUNDS = [
  { id: 'deep', name: { vi: 'Không Gian Sâu', en: 'Deep Space' }, top: '#0d0e15', bottom: '#0d0e15', type: 'stars', price: 0 },
  { id: 'forest', name: { vi: 'Đêm Tĩnh Lặng', en: 'Midnight' }, top: '#000000', bottom: '#434343', type: 'aurora', price: 150 },
  { id: 'ocean', name: { vi: 'Đại Dương Xanh', en: 'Ocean' }, top: '#1a2a6c', bottom: '#b21f1f', type: 'bubbles', price: 350 },
  { id: 'sunset', name: { vi: 'Hoàng Hôn', en: 'Sunset' }, top: '#2c3e50', bottom: '#fd746c', type: 'fireflies', price: 550 },
  { id: 'meteor', name: { vi: 'Vành Đai Đá', en: 'Meteor Belt' }, top: '#100a1c', bottom: '#000000', type: 'meteors', price: 700 },
  { id: 'hyperspace', name: { vi: 'Siêu Không Gian', en: 'Hyperspace' }, top: '#020024', bottom: '#090979', type: 'hyperspace', price: 1200 },
];
  
  export const PIPE_DIST_DESKTOP = 250;
  export const PIPE_DIST_MOBILE = 200;
  export const MAX_Y_DIFF = 180;