# Space Fighter Graphics 2.1.6.1 - Shared Player VFX

**Baseline:** Graphics 2.1.6 Startup Bundle. Đây là hotfix chỉ dành cho VFX đạn của người chơi và luồng phụt động cơ. Không cập nhật API/server, Firebase, Firestore, profile, nhiệm vụ, balance v1, logic collision hoặc gameplay.

## 1. Triệu chứng xác nhận từ ảnh thực tế

- Campaign trên nền tối hiển thị súng laser tân thủ thành vạch cyan dài gần 85 px, có cạnh cứng.
- Dungeon Nereus có nền xanh sáng gần màu đạn laser nên đạn/luồng phụt động cơ rất khó thấy.
- Hai scene tuy đã cùng dùng `createProjectileEmitter`, nhưng từng scene lại tự tạo `engineFx` với tọa độ/emitRate/hướng phun riêng. Campaign đọc `engineOffset` từ máy bay; Dungeon cố định (0, 0, 1.1).

## 2. Sửa mã nguồn

- `client/src/game/rendering/PlayerFxProfiles.js` (mới): kích thước hình học đạn VFX và cấu hình engine FX độc lập gameplay.
- `client/src/game/rendering/ShipEngineFx.js` (mới): bộ tạo particle chung. Đọc chính xác `engineOffset` và `engineFlameTint`/`engineFlameScale` theo từng phi cơ; particle core + viền tối giúp dễ nhìn khi nền sáng. Mật độ phụ thuộc preset GPU, không phụ thuộc chế độ chơi. `stop` và `dispose` đều cleanup.
- `client/public/images/effects/thruster_glow.png` (mới): texture local 64x64 (khoảng 1.5KB), giảm phụ thuộc mạng bên ngoài cho hiệu ứng động cơ.
- `client/src/game/combat/ProjectileEmitter.js` (đã sửa): đạn Babylon dạng 2D bolt/orb bo mềm, lõi màu vũ khí, viền tối, texture/material cache theo style và màu. Không còn laser beam dạng cylinder dài 2.635 world-unit. Với chế độ không có Canvas2D, dùng geometry fallback có kích thước hợp lý. Collider vẫn kiểm tra tọa độ gốc, không phụ thuộc mesh VFX.
- `client/src/components/Campaign/CampaignScene.js`, `Dungeon/DungeonScene.js`: cả hai gọi chung `createShipEngineFx`. Các lệnh `engineFx.stop()` cũ vẫn hoạt động.

## 3. Cập nhật trên Windows

1. Dừng client bằng Ctrl+C. Không cần dừng server.
2. Giải nén `SpaceFighter_Graphics2.1.6.1_PlayerVFX_PATCH_ONLY.zip` vào thư mục **gốc** `C:\Users\TVH01374\Desktop\SpaceFighter`, cho phép ghi đè. Không giải nén vào riêng `client`.
3. Tại CMD:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm test
npm run check:catalog
npm run check:gameplay
npm run check:graphics21
npm run check:safety
npm run build
npm run check:bundle
npm run dev
```

4. Mở game với Ctrl+F5. Nên kiểm tra qua Chrome Responsive Pixel 10 và Chrome Desktop thường.

## 4. Nghiệm thu bắt buộc trên browser

- Cùng X-Wing, `gun_laser`, cùng loadout và viewport: đạn Campaign/Dungeon phải có cùng hình dáng, màu sắc và tỷ lệ; vạch laser không còn quá dài.
- Nereus nền sáng: đạn/đuôi động cơ phải đủ tương phản và nhìn được; không đổi theme hành tinh.
- Engine X-Wing nằm ở gần đuôi theo `engineOffset`; mật độ, kích thước, hướng phụt giữa Campaign/Dungeon như nhau trong cùng preset.
- F12 -> Network: `/images/effects/thruster_glow.png` phải HTTP 200, không liên quan đến Firebase.
- Chuột/touch, hitbox, tốc độ bắn, sát thương, kết quả trận đấu, nhận thưởng Cloud/Guest không thay đổi.
- Chạy trận đủ lâu (5-10 phút) và đổi scene nhiều lần để kiểm tra memory/leak. FPS đo trên thiết bị thật trước khi phát hành.

**Giới hạn:** Bản hotfix được kiểm tra bằng Node unit/static. Môi trường tạo gói thiếu thư viện npm, vì vậy không chạy được build Vite và WebGL runtime tại đây. Kết quả chạy trên Windows/thiết bị thật quyết định nghiệm thu cuối cùng.
