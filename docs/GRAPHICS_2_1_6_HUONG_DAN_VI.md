# Hướng dẫn cập nhật Space Fighter Graphics 2.1.6 — Startup & Bundle

**Trạng thái gốc:** Graphics 2.1.5.1 đã được người dùng kiểm thử 72/72 PASS, Vite build thành công, HUD mobile hiển thị gọn.

## Cập nhật

1. Dừng client bằng `Ctrl+C`; nếu server 2.1.3 đang hoạt động, có thể giữ nguyên.
2. Giải nén `SpaceFighter_Graphics2.1.6_StartupBundle_PATCH_ONLY.zip` vào thư mục gốc `C:\Users\TVH01374\Desktop\SpaceFighter` (nơi có `client`, `server`, `docs`) và ghi đè.
3. Mở CMD:

```
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

Nếu thiếu node_modules: `npm ci`. Không cần chạy Firestore migration, không thay service account hoặc .env.

## Thử trên trình duyệt

1. Vào `http://localhost:5173`, quan sát Portal ở màn hình đứng/ngang: ảnh nền phải xuất hiện, không lỗi 404.
2. F12 > Network > JS > Disable cache > Ctrl+F5. Ở Portal ban đầu **không tải** mã Babylon của Campaign/Dungeon; khi vào trận mới tải những chunk đó.
3. Thử Campaign/Dungeon trên desktop bằng WASD và kéo chuột, mobile bằng touch, theo dõi banner/HP/HUD có còn kích thước của 2.1.5.1.
4. Trên Cloud, lần đầu Xuất kích có thể hiển thị `ĐANG CHUẨN BỊ TRẬN...` khi tải mã scene. Ticket Cloud chỉ mở sau khi tải hoàn tất. Kiểm tra năng lượng/trạng thái nhiệm vụ sau trận.
5. Gửi log `npm run check:bundle` và ảnh Portal (đứng/ngang), Campaign mobile. Nếu Vite build lỗi, gửi đoạn ERROR thay vì toàn bộ node_modules logs.

## Ghi chú

Bundle splitting giúp tải lần đầu nhanh hơn về lý thuyết nhưng cần đo thật trên máy/mạng; tổng dung lượng APK/IPA không nhất thiết giảm. Tất cả file GLB vẫn nằm nguyên trong source. Lộ trình thương mại vẫn cần tối ưu asset, GPU/CPU, bảo mật reward và Store purchase verification.
