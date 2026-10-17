# BÁO CÁO ASSET CÒN THIẾU — PHASE 0

Kết quả audit literal trong `client/src`: **61 tham chiếu thiếu** so với `client/public`.

Lưu ý: đây là các cặp tham chiếu–file nguồn, không nhất thiết là 61 ảnh vật lý khác nhau; các đường dẫn động chưa kiểm kê được trong phép quét này.

| STT | Đường dẫn tài nguyên | Nguồn tham chiếu |
|---:|---|---|
| 1 | `/images/armor/armor_crystal.png` | `src/constants.js` |
| 2 | `/images/armor/armor_heavy.png` | `src/constants.js` |
| 3 | `/images/armor/armor_light.png` | `src/constants.js` |
| 4 | `/images/armor/armor_nano.png` | `src/constants.js` |
| 5 | `/images/armor/armor_reactive.png` | `src/constants.js` |
| 6 | `/images/armor/armor_shield.png` | `src/constants.js` |
| 7 | `/images/armor/armor_void.png` | `src/constants.js` |
| 8 | `/images/drone/drone_bomber.png` | `src/constants.js` |
| 9 | `/images/drone/drone_emp.png` | `src/constants.js` |
| 10 | `/images/drone/drone_laser.png` | `src/constants.js` |
| 11 | `/images/drone/drone_repair.png` | `src/constants.js` |
| 12 | `/images/drone/drone_shield.png` | `src/constants.js` |
| 13 | `/images/drone/drone_swarm.png` | `src/constants.js` |
| 14 | `/images/dungeon_abaddon.jpg` | `src/constants.js` |
| 15 | `/images/dungeon_nereus.jpg` | `src/constants.js` |
| 16 | `/images/dungeon_taurus.jpg` | `src/constants.js` |
| 17 | `/images/pilots/pilot_alpha.png` | `src/constants.js` |
| 18 | `/images/pilots/pilot_bear.png` | `src/constants.js` |
| 19 | `/images/pilots/pilot_echo.png` | `src/constants.js` |
| 20 | `/images/pilots/pilot_fox.png` | `src/constants.js` |
| 21 | `/images/pilots/pilot_ghost.png` | `src/constants.js` |
| 22 | `/images/pilots/pilot_nova.png` | `src/constants.js` |
| 23 | `/images/pilots/pilot_titan.png` | `src/constants.js` |
| 24 | `/images/pilots/pilot_viper.png` | `src/constants.js` |
| 25 | `/images/ship_xwing_hq.jpg` | `src/components/HQ/index.jsx` |
| 26 | `/images/ship_xwing_hq.png` | `src/components/Inventory/index.jsx` |
| 27 | `/images/ships/abyss_hq.png` | `src/constants.js` |
| 28 | `/images/ships/abyss_top.png` | `src/constants.js` |
| 29 | `/images/ships/celestial_hq.png` | `src/constants.js` |
| 30 | `/images/ships/celestial_top.png` | `src/constants.js` |
| 31 | `/images/ships/eternal_hq.png` | `src/constants.js` |
| 32 | `/images/ships/eternal_top.png` | `src/constants.js` |
| 33 | `/images/ships/leviathan_hq.png` | `src/constants.js` |
| 34 | `/images/ships/leviathan_top.png` | `src/constants.js` |
| 35 | `/images/ships/nova_hq.png` | `src/components/ShopCampaign/index.jsx` |
| 36 | `/images/ships/nova_hq.png` | `src/constants.js` |
| 37 | `/images/ships/nova_top.png` | `src/constants.js` |
| 38 | `/images/ships/spectre_hq.png` | `src/constants.js` |
| 39 | `/images/ships/spectre_top.png` | `src/constants.js` |
| 40 | `/images/ships/storm_hq.png` | `src/constants.js` |
| 41 | `/images/ships/storm_top.png` | `src/constants.js` |
| 42 | `/images/ships/titanforge_hq.png` | `src/constants.js` |
| 43 | `/images/ships/titanforge_top.png` | `src/constants.js` |
| 44 | `/images/ships/vortex_hq.png` | `src/constants.js` |
| 45 | `/images/ships/vortex_top.png` | `src/constants.js` |
| 46 | `/images/weapons/gun_charge.png` | `src/constants.js` |
| 47 | `/images/weapons/gun_homing.png` | `src/constants.js` |
| 48 | `/images/weapons/gun_ion.png` | `src/constants.js` |
| 49 | `/images/weapons/gun_laser.png` | `src/constants.js` |
| 50 | `/images/weapons/gun_neutron.png` | `src/constants.js` |
| 51 | `/images/weapons/gun_photon.png` | `src/constants.js` |
| 52 | `/images/weapons/gun_plasma.png` | `src/constants.js` |
| 53 | `/images/weapons/gun_pulse.png` | `src/constants.js` |
| 54 | `/images/weapons/gun_rail.png` | `src/constants.js` |
| 55 | `/images/weapons/gun_shotgun.png` | `src/constants.js` |
| 56 | `/images/weapons/gun_spread.png` | `src/constants.js` |
| 57 | `/images/weapons/gun_wave.png` | `src/constants.js` |
| 58 | `/images/weapons/wing_dronelet.png` | `src/constants.js` |
| 59 | `/images/weapons/wing_emp.png` | `src/constants.js` |
| 60 | `/images/weapons/wing_homing.png` | `src/constants.js` |
| 61 | `/images/weapons/wing_torpedo.png` | `src/constants.js` |

Không nên khắc phục bằng cách trỏ mọi ảnh về cùng một ảnh rỗng nếu game cần phân biệt phi công, phi cơ và trang bị. Phase 4 sẽ bổ sung/đồng bộ asset có kiểm tra quyền sử dụng thương mại.
