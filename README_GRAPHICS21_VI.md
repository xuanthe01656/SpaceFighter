# SPACE FIGHTER 4.0 — GRAPHICS PHASE 2.1 (V1.2.1)

**Baseline:** `SpaceFighter_Phase2_V1_2_0_FULL_SOURCE.zip` (đã bao gồm Phase 1 + Hotfix H1/H2).  
**Phạm vi:** Chuẩn hóa hệ thống hiển thị phi cơ cho HQ / Inventory / Campaign / Dungeon. **Không thay đổi** nền tảng Firebase, Firestore Rules, Game API, giao dịch hay chỉ số combat.

## 1. Đã thực hiện

- Tạo `client/src/game/rendering/ShipVisualCatalog.js`: tra cứu hình ảnh/model theo `aircraftId` thực, không thay model thành X-Wing khi thiếu asset. Dùng silhouette riêng (đúng ID + màu/phom theo role) nếu ảnh/model chưa có.
- Tạo `client/src/game/rendering/ShipVisualFactory.js`: chung cho Campaign và Dungeon; dựng silhouette tức thời → hiện top-down PNG nếu có và đã load → đổi sang GLB nếu có, được phép dùng và load thành công. Nếu GLB lỗi, giữ đúng sprite của phi cơ đó.
- Tách **collision hitbox** 2.4×2.4 khỏi model/sprite. Khi phi cơ 3D, 2D hoặc đang nạp asset, vùng va chạm không thay đổi. Nháy bất tử / phá hủy sử dụng `setVisibility()` cho cả sprite và mesh.
- Đổi mặt phẳng sprite về `rotation.x = -π/2` để PNG có mũi ở phía trên ảnh hướng đúng **-Z** (hướng tiến của phi cơ). **Giữ nguyên** `modelRotation` GLB trong catalog; cần UAT hình thật để hiệu chỉnh từng model.
- HQ bổ sung ảnh top-down dự kiến trong trận; HQ / popup chọn phi cơ / Inventory / ItemModal dùng chung `ShipImage` tự fallback đúng ID, tránh link ảnh vỡ.
- Tạo `shipAssets.generated.js` từ `constants.js` và các file `public/` hiện hữu; có script phát hiện manifest cũ khi người phát triển thêm/sửa/xóa asset.
- Giới hạn mô hình quá nặng trên thiết bị mobile (dùng sprite). **X-Wing GLB thực tế: 57.759.760 byte và 1.871.386 tam giác**, quá nặng cho mobile. Desktop vẫn có thể chọn nạp GLB. Tính năng chọn Graphics Quality thủ công sẽ được phát triển về sau.
- Bộ kiểm thử Node và Babylon NullEngine: tính đúng ID, fallback, hitbox, load GLB giả lập, callback về muộn và điều kiện hạn chế 3D trên mobile.

## 2. Tình trạng nguồn asset (không tự ý tạo model 3D mới)

| Nhóm phi cơ | Tình trạng |
| --- | --- |
| X-Wing | Có ảnh HQ, ảnh top, GLB thật (model chưa tối ưu) |
| Scout, Tank, Phantom, Void, Nebula, Raptor | Có HQ + Top PNG, chưa có GLB |
| Spectre, Storm, Leviathan, Vortex, Nova, Eternal, Abyss, Titanforge, Celestial | **Chưa có cả PNG lẫn GLB** — fallback silhouette riêng theo ID chỉ là tạm thời |

Silhouette không phải mẫu thiết kế hoàn chỉnh để bán thương mại. Graphics 2.2 sẽ yêu cầu quy trình dựng model/ảnh từ cùng nguồn chuẩn.

## 3. Cài đặt bản PATCH ONLY (Windows)

1. Sao lưu source đang chạy, không gửi/chèn file `.env`, service account JSON hay `google-services.json` vào bản ZIP chia sẻ.
2. **Chỉ áp PATCH ONLY Graphics 2.1 lên Phase 2 V1.2.0**. Giải nén vào thư mục gốc chứa `client/`, `server/`, ghi đè file cùng tên.
3. Thử nghiệm tại máy trước khi triển khai production:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\client
npm ci
npm run check:graphics21:full
npm run build
npm run dev
```

Ở terminal khác:

```bat
cd C:\Users\TVH01374\Desktop\SpaceFighter\server
npm test
npm start
```

Lưu ý `npm run check:release` **còn FAIL theo thiết kế** do thiếu asset/định danh Android chưa chuẩn hóa, không được coi là build release thương mại.

## 4. Khi thêm model hoặc ảnh mới

1. Bổ sung file vào `client/public/` và cập nhật `client/src/constants.js` đúng `aircraftId`.
2. Chạy: `cd client && npm run generate:ship-assets`.
3. Chạy: `npm run check:graphics21:full`, `npm run build`; xem cả HQ → Campaign → Dungeon trên desktop/mobile.
4. Model mới phải được kiểm tra trục mũi, tâm, scale, texture, hiệu năng và dispose. Không giả định asset nào cũng quay giống X-Wing.

## 5. Kiểm thử trên trình duyệt / thiết bị

Xem `docs/GRAPHICS21_UAT_VI.md`. Chỉ khi màn hình thực tế và FPS đã kiểm tra mới xác nhận nghiệm thu Graphics 2.1. Tại môi trường phân tích, Babylon NullEngine/test static **đã đạt**, nhưng **Vite build và kiểm thử GPU Android/iOS/Web chưa được chạy**.

## 6. Rollback

Không có database migration hay thay đổi Firestore Rules. Dừng client mới; khôi phục các file trong Phase 2 V1.2.0 hoặc backup trước khi áp patch; chạy `npm ci` nếu cần và khởi động lại. Server, Firebase và tài khoản người chơi không cần rollback.
