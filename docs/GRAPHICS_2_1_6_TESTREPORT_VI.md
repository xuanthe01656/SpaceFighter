# Báo cáo kiểm thử — Space Fighter Graphics 2.1.6 Startup Bundle

**Baseline:** Graphics 2.1.5.1; không thay server/Firebase.

## Bằng chứng từ người dùng (baseline)

- Ảnh Campaign mobile sau 2.1.5.1: HUD/boss/banner quay lại kích thước hợp lý và X-Wing hướng lên.
- Log máy Windows: `npm test`: 72 PASS/0 FAIL; `check:catalog` PASS; gameplay 14/14; graphics 12/12; `npm run build` PASS, 45.43 giây.
- Lỗi tồn tại: `Portal.module.css` tham chiếu 2 ảnh từ `../images` không resolve (file nằm ở `public/images`); Vite entry JS 8,983.87 kB trước gzip, 2,038.63 kB gzip. Cảnh báo `use client` không làm build fail.

## Thay đổi và lý do

- Portal asset paths qua `import.meta.env.BASE_URL` + CSS variables, không phụ thuộc vị trí file CSS hoặc deploy base.
- `App.jsx` giữ `Portal` eager và lazy 13 màn khác để Babylon không tải ngay khi mở Portal; trạng thái Suspense khi chuyển màn và Error Boundary có nút tải lại khi chunk thất bại.
- `BattleScreenLoaders.js` cung cấp dynamic import tái sử dụng; `HQ` tải scene trước khi mở Cloud battle ticket / dùng Guest dungeon energy, tránh trừ tài nguyên trước khi chunk sẵn sàng.
- `check-startup-bundle.mjs` đo kích thước entry và kiểm tra output sau build thực.

## Kết quả trong môi trường đóng gói

| Nhóm | Kết quả |
|---|---|
| 74 bài client Node không cần Babylon | 74 PASS, 0 FAIL |
| 6 bài mới cho lazy screens, preflight và Portal CSS | 6 PASS |
| Product Catalog | PASS |
| Gameplay static | 14/14 PASS |
| Graphics static | 12/12 PASS |
| Security static | 14/14 PASS |
| Relative imports | PASS |
| Cú pháp JSX (TypeScript parser), JS module | PASS |
| Bundle report script với dist giả lập | PASS (test chức năng parser, không phải kết quả Vite build) |

**Chưa chạy được:** 4 Babylon NullEngine tests, Vite production build thật sau patch, waterfall JavaScript, Android/iOS native WebView. Npm registry không khả dụng trong container. Không suy diễn dung lượng entry sau splitting trước khi `npm run build` trên máy người dùng.

## Nghiệm thu trên Windows

- `npm test` dự kiến 78/78 PASS nếu môi trường giống 2.1.5.1.
- `npm run build` và `npm run check:bundle` PASS; hai cảnh báo unresolved Portal biến mất.
- Portal backgrounds hiển thị dọc/ngang; HQ, Campaign, Dungeon và Missions chuyển màn không lỗi.
- Nút Xuất kích giữ khóa khi đang preload; Cloud `battle.start` chỉ được gửi sau khi module đã tải; dữ liệu nhiệm vụ và thưởng không đổi.

Lưu ý: không coi PATCH 2.1.6 đã nghiệm thu WebGL/native hoặc sẵn sàng phát hành thương mại cho đến khi kiểm thử thực tế.
