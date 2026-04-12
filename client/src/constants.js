// src/constants.js
export const SKINS = [
  { id: 'classic', name: { vi: 'Mèo Sầu Bi', en: 'Sad Cat' }, color: '#FFD700', imgAlive: '/images/cat_alive.png', imgDead: '/images/cat_dead.png', price: 0 },
  { id: 'dog', name: { vi: 'Cún Tinh Nghịch', en: 'Playful Dog' }, color: '#FFD700', imgAlive: '/images/dog_alive.png', imgDead: '/images/dog_dead.png', price: 0 },
  { id: 'evilFly', name: { vi: 'Ruồi Vui Vẻ', en: 'Happy Fly' }, color: '#FFD700', imgAlive: '/images/evil_fly_alive.png', imgDead: '/images/evil_fly_dead.png', price: 300 },
  { id: 'ufo', name: { vi: 'Phi Thuyền UFO', en: 'UFO Spaceship' }, color: '#FFD700', imgAlive: '/images/ufo_alive.png', imgDead: '/images/ufo_dead.png', price: 500 },
  { id: 'plane', name: { vi: 'Phi Công Trẻ', en: 'Young Pilot' }, color: '#FFD700', imgAlive: '/images/pilot_alive.png', imgDead: '/images/pilot_dead.png', price: 700 },
  { id: 'astro_plane', name: { vi: 'Tàu Vũ Trụ', en: 'Space Plane' }, color: '#FFD700', imgAlive: '/images/astro_plane_alive.png', imgDead: '/images/astro_plane_dead.png', price: 2000 },
];
  
 export const BACKGROUNDS = [
  { id: 'deep', name: { vi: 'Không Gian Sâu', en: 'Deep Space' }, top: '#0d0e15', bottom: '#0d0e15', type: 'stars', price: 0 },
  { id: 'forest', name: { vi: 'Đêm Tĩnh Lặng', en: 'Midnight' }, top: '#020024', bottom: '#101030', type: 'aurora', price: 150 },
  { id: 'meteor', name: { vi: 'Vành Đai Đá', en: 'Meteor Belt' }, top: '#100a1c', bottom: '#000000', type: 'meteors', price: 350 },
  { id: 'ocean', name: { vi: 'Đại Dương Xanh', en: 'Ocean' }, top: '#1a2a6c', bottom: '#b21f1f', type: 'bubbles', price: 550 },
  { id: 'hyperspace', name: { vi: 'Siêu Không Gian', en: 'Hyperspace' }, top: '#050510', bottom: '#1a1a2e', type: 'hyperspace', price: 700 },
  { id: 'sunset', name: { vi: 'Hoàng Hôn', en: 'Sunset' }, top: '#2c3e50', bottom: '#fd746c', type: 'fireflies', price: 1200 },
];
  
  export const PIPE_DIST_DESKTOP = 250;
  export const PIPE_DIST_MOBILE = 200;
  export const MAX_Y_DIFF = 180;