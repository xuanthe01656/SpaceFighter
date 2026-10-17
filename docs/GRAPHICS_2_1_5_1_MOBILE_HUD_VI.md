# Space Fighter Graphics 2.1.5.1 — Mobile HUD Regression Hotfix

## Baseline và giới hạn

- Bản nền yêu cầu: **Graphics 2.1.5 Product Combat Configuration** (không áp riêng lên 2.1.3 hoặc 2.1.4).
- Chỉ sửa Babylon UI của Campaign/Dungeon (HUD, banner đợt, bảng tổng kết Campaign, thanh HP gắn trên quái).
- Không đổi server, Firebase config/rules, schema người chơi, mission/economy, chiến đấu, controller, asset GLB/PNG, preset FPS hoặc cơ chế phần thưởng.

## Nguyên nhân hồi quy

Trong 2.1.5, `attachAdaptiveRenderQuality()` giảm độ phân giải framebuffer (các cấu hình có `maxPixelRatio` = 1/1.25/1.5). GUI cũ vẫn nhân kích thước theo `window.devicePixelRatio`, mặc định giả định độ phân giải framebuffer luôn bằng CSS size × devicePixelRatio.

Ví dụ: mobile DPR = 2, render ratio bị giới hạn còn 1.25. Banner cũ `70 * 2 / 1.25 = 112 CSS px` thay vì khoảng 70 CSS px. Thanh HP, chữ, boss HUD bị phóng to theo cùng tỷ lệ.

## Cách sửa

- `game/ui/BattleHudLayout.js` tính kích thước logic canvas CSS và render framebuffer riêng rẽ.
- `AdvancedDynamicTexture.idealWidth = canvas CSS width` cho phép Babylon GUI tự đổi tỷ lệ kích thước pixel khi chất lượng render thay đổi. Vì thế mọi kích thước GUI chuyển về đơn vị CSS px (không nhân DPR lần nữa).
- SVG HUD tính kích thước ảnh theo framebuffer nhưng chiều cao control vẫn là 65 CSS px.
- `CampaignScene.js` sử dụng kích thước canvas CSS thay vì framebuffer để giới hạn kích thước bảng kết quả; tránh bảng vượt chiều ngang mobile khi render scale thay đổi.
- Cả Campaign/Dungeon chạy cùng layout helper; giao diện mobile được bảo toàn, không thay đổi con số thiết kế (HUD top 65px, thanh giáp 120×12px, banner 70px, font banner 32px).

## Cập nhật trên Windows

1. Dừng game client bằng `Ctrl+C` trong CMD.
2. Giải nén `SpaceFighter_Graphics2.1.5.1_MobileHUD_PATCH_ONLY.zip` vào `C:\Users\TVH01374\Desktop\SpaceFighter`, ghi đè. Cần đúng thư mục gốc chứa `client`.
3. Mở CMD:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm test
npm run check:catalog
npm run check:gameplay
npm run check:graphics21
npm run build
npm run dev
```

4. Chrome F12, chọn chế độ Pixel 10 hoặc tương đương. Nhấn `Ctrl+F5` để làm mới tài nguyên. Vào Campaign; đo thực tế HUD + banner, kéo tàu, xem thanh giáp, đạn, bảng tổng kết. Thử Dungeon. Xoay màn hình và thử thu/phóng cửa sổ.
5. Nếu có lỗi runtime, gửi Console error, kích thước viewport, devicePixelRatio, phần Screenshots Campaign/Dungeon. Không gửi UID/token/Firebase credentials.

## Tiêu chí nghiệm thu

- Banner `TIẾN VÀO ĐỢT`: ~70 CSS px, chữ ~32 CSS px thay vì bị nhân ~1.6–3 lần theo DPR.
- Topbar HUD: cao ~65 CSS px, thanh giáp 120×12 CSS px, không đè vào `ĐIỂM` và `ẢI / ĐỢT`.
- Campaign và Dungeon có cùng kích thước UI dưới cùng CSS viewport.
- Hạ chất lượng render (FPS hoặc DPR) không làm UI phóng to; kéo tàu, kỹ năng, vật phẩm, chiến đấu, nhận thưởng không thay đổi.
- Màn báo cáo Campaign và nút XÁC NHẬN không tràn chiều ngang mobile.

## Kết quả kiểm thử trong môi trường chuẩn bị

- 4 unit tests mới cho thay đổi độ phân giải render, orientation, pixel sizes và kết quả Campaign: PASS.
- 68 bài Node không phụ thuộc Babylon runtime: PASS, 0 FAIL.
- `check-product-catalog`, 14/14 gameplay static, 12/12 graphics static, imports: PASS.
- 4 bài NullEngine, Vite build/WebGL thực tế chưa thực hiện được tại đây vì chưa có `node_modules`. Log môi trường người dùng của 2.1.5 trước khi áp patch: 68/68 client tests và Vite build PASS.

## Các cảnh báo cần xử lý ở bước performance sau khi nghiệm thu

- `Portal.module.css` tham chiếu `../images/portal_landscape.png`, `../images/portal_portrait.png` chưa resolve tại Vite build. Cần kiểm tra asset và URL thực trước khi sửa.
- `dist/assets/index-*.js` ~8,984 kB chưa nén (main bundle); phải rà import Babylon, code splitting và đo Web Vitals, FPS, tải mạng trước khi thương mại hóa.
- Các warning thư viện chứa directive `use client` trong build không phải nguyên nhân khiến HUD bị phóng to.
