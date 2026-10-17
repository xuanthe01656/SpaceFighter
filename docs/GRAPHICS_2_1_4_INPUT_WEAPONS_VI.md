# Space Fighter Graphics 2.1.4 — Campaign Desktop Input & Unified Player Weapons

Baseline: **SpaceFighter Graphics 2.1.3 Mission History**. Chỉ thay client; **không migration, không đổi Firebase, backend, schema/profile người chơi, wallet hay quy tắc nhận thưởng**.

## 1. Nguyên nhân và cách sửa

- Campaign 2.1.3 lắng nghe `mousedown/mousemove/mouseup` riêng, không có pointer capture và quy đổi pixel dựa trên `window.innerWidth/innerHeight` thay vì canvas. Điều này gây rủi ro mất event hoặc không di chuyển trong trình duyệt desktop khi kéo chuột.
- Dungeon 2.1.3 sử dụng `scene.onPointerObservable` và picking ray — khác code với Campaign. Cả hai cũng chưa có WASD/phím mũi tên.
- 2.1.4 sử dụng **`src/game/combat/ShipInputController.js`** trong cả hai scene. Đăng ký DOM `pointerdown/move/up/cancel` ở capture phase, giữ pointer khi kéo, xử lý out-of-canvas release/window blur, và hỗ trợ WASD + arrows. Dùng `getBoundingClientRect()` của canvas và giới hạn tàu trong camera top-down. Giữ trục hướng kéo đã hoạt động trên mobile 2.1.3 (màn hình sang phải = world -X).
- Hai scene chuyển từ hệ tạo projectile riêng sang **`PlayerWeapons.js` + `ProjectileEmitter.js`**. Có một nguồn quy tắc vị trí nòng, tốc độ/đường đạn, màu theo catalog, cùng kết cấu bắn và dùng lại StandardMaterial theo màu để tránh tạo một material cho mỗi viên đạn Dungeon.

## 2. Những hiệu ứng vũ khí chung đã nối

| Catalog | V1.2.1–2.1.3 | Trong 2.1.4 |
|---|---|---|
| beam | đạn đơn thường | xung laser dài, nhanh, theo cooldown chung |
| single/plasma | 2 scene có tốc độ khác nhau | 1 viên, loại projectile và tốc độ thống nhất |
| spread3/spread5/shotgun | spread5, shotgun bị rơi vào default | 3/5/7 viên phân tán theo catalog |
| homing | chiến dịch lerp, phó bản đổi hướng tức thì | cùng một thuật toán steering |
| pierce | biến mất sau 1 hit | 3 mục tiêu khác nhau tối đa, có ledger chống trúng trùng |
| burst | đạn đơn thường | ba phát trong 0/90/180ms |
| explosive | đạn đơn thường | va chạm, gây splash 40% sát thương lên địch gần đó |
| wave | đạn đơn thường | hai tia sóng đối pha |
| charge | đạn đơn thường | đạn lớn/sát thương mạnh tự sạc theo cooldown |
| ion/EMP | không có làm chậm | làm chậm quái thường 35% trong thời gian hiệu ứng |
| wingman straight/homing/swarm/emp | hai scene tự gán tốc độ/mục tiêu | quỹ đạo theo `behavior`, từ mount thật |
| drone shield/repair/bomber/sniper/emp/laser/swarm | shield/repair vẫn bắn | bảo vệ giảm 20% sát thương, repair hồi 2.5% maxHP theo kỳ, những loại khác bắn theo catalog |

**Giới hạn sản phẩm:** `beam` hiện là xung laser lặp lại, chưa phải raycast liên tục; `charge` vẫn tự nạp theo nhịp bắn của game auto-fire (chưa thiết kế UI giữ nút bắn). Cần cân bằng lại DPS/knockback và làm kiểm thử màn hình thật trước production; các tỷ lệ shield/repair/splash là thiết kế ban đầu cho UAT. Không tuyên bố đã hoàn thiện mọi hiệu ứng VFX thương mại hoặc chống gian lận combat.

## 3. Hướng dẫn cập nhật trên Windows

1. Đảm bảo đang chạy đúng FULL SOURCE/PATCH 2.1.3. Đóng terminal client (`Ctrl+C`), nếu muốn test Cloud có thể giữ server 2.1.3 vì backend không đổi.
2. Giải nén `SpaceFighter_Graphics2.1.4_CombatInput_PATCH_ONLY.zip` vào **thư mục gốc** `C:\Users\TVH01374\Desktop\SpaceFighter`, không phải vào `client/`.
3. Mở terminal CMD:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm test
npm run check:gameplay
npm run check:graphics21
npm run build
npm run dev
```

`npm ci` cần thiết nếu chưa cài đủ Babylon từ phiên trước; bản này **không thêm package npm mới**.

## 4. UAT trên thiết bị thật

- **Desktop Chrome/Edge**: tắt Device Toolbar, `Ctrl+F5`, chọn tàu X-Wing, vào Campaign và kéo trái/phải/lên/xuống bằng cách giữ chuột trái trên canvas. Xác nhận tàu đi theo chiều kéo. Nhấn WASD và Arrow Keys, thử kéo ra ngoài canvas rồi thả; sau khi thả không được kẹt chế độ drag.
- **Desktop Dungeon**: thử y như trên; không đảo trục so với Campaign.
- **Android/PWA và giả lập Pixel**: dùng một ngón chạm kéo bốn hướng trên Campaign và Dungeon; không bị cuộn trang khi kéo. Kiểm tra hai ngón và thả pointer.
- **Cùng main gun**: chụp lại video ngắn của cả hai mode với `gun_laser` và `gun_spread`. So sánh số viên, màu, nơi xuất phát, tốc độ và hành vi chuyển hướng. Với trang bị khác nên UAT từng `firePattern`.
- **Drone shield/repair**: hai loại không được bắn như drone công kích; shield giảm damage/repair hồi HP (test quan sát thanh HP).
- **Luồng Cloud**: chiến thắng/thua/rút lui vẫn qua `battle.start/finish/abandon` hiện hành; Missions và attendance hiện tại không thay đổi.

## 5. Kiểm thử tự động và phạm vi

- Client Node test có thêm `tests/shipCombat214.test.mjs` (controller fake DOM, pointer capture, bàn phím, dispose, catalog 11 kiểu bắn, projectile speed/homing, slow/pierce và reuse materials).
- `check-phase2-gameplay.mjs` điều chỉnh điều kiện kiểm tra theo routine sát thương chung và ledger thay vì tìm tên biến `dmgToApply` đã bị loại bỏ.
- **Chưa thể thay thế WebGL UAT chỉ bằng Node/unit tests**. Cần chạy `npm run build` và Campaign/Dungeon thật trên máy Windows có @babylonjs/core đã cài.

## 6. Rollback

Nếu UAT gặp lỗi, đóng client, áp lại PATCH/FULL SOURCE 2.1.3 (chỉ file client) hoặc dùng FULL SOURCE 2.1.3 đã lưu, không thực hiện migration Firebase. Backend và dữ liệu người chơi không bị patch này tác động.
