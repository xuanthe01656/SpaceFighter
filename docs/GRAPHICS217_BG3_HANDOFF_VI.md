# BÀN GIAO — Graphics 2.1.7-BG.3

## Baseline
Graphics 2.1.7-BG.2 FULL SOURCE; Alpha + Nereus đã nghiệm thu: cuộn xuống, không lộ seam theo kiểm tra người dùng. Giữ nguyên trọn bộ runtime cũ ngoài việc chọn ảnh nhẹ cho `mobileLow`.

## Phần đã thay đổi
- `BackgroundCatalog.js`: phiên bản 1.2.0; cấu hình mobileLow variant, artDirectionId và trạng thái art pipeline. ID nền demo và stage binding giữ nguyên.
- `BackgroundArtDirection.js`: 6 biome profiles, safe gameplay lane + HUD, 9 concept brief chưa đăng ký runtime.
- 2 ảnh 512×1024 WebP mobileLow phát triển từ demo, không tuyên bố production commercial.
- `background-asset-manifest.mjs` + `lib/background-asset-utils.mjs`: manifest SHA-256 deterministic; chỉ thay khi chạy chế độ write.
- `check-background-catalog.mjs`: bảo đảm chưa đăng ký artwork kế hoạch, ảnh đúng size, license/review/release gating và biến thể hợp lệ.
- `background-art-qa.py`: tạo contact sheet, báo cáo kỹ thuật và độ phức tạp vùng trung tâm.
- `prepare-background-assets.py`: staging WebP từ art master có seam, không tự đăng ký production.
- Tests BG3 cho metadata, biến thể, manifest, phân biệt demo/production; các tests BG1/BG2 chỉnh kỳ vọng version/low variant.
- Hướng dẫn production art trong `docs/GRAPHICS217_BG3_ART_PRODUCTION_VI.md`.

## Không thay đổi
- Scene, camera, HUD, gameplay, input, physics, ProjectileEmitter, VFX.
- Firebase, rules, dữ liệu người chơi, missions, điểm danh, rewards.
- PNG/WebP gốc 1024×2048 của hai demo, scroll speed và hướng cuộn.

## Ghi nhận kiểm thử
Các kiểm thử trong bản báo cáo kèm theo chỉ chứng minh logic/asset static đã chạy; cần tiếp tục chạy `npm ci`, `npm test`, `npm run build` và nghiệm thu WebGL trên Windows của người dùng. Bản vá không tự duyệt quyền thương mại hai asset cũ.

## Tiếp theo
Nội dung production: dựng master mới bằng công cụ hình ảnh/3D, rà khung an toàn, xuất hai profile, kiểm seam 1 vòng, đối chiếu FPS. Khi artwork được duyệt, mới thêm ID/catalog mapping; không đổi những trang đã nghiệm thu nếu chưa cần.
