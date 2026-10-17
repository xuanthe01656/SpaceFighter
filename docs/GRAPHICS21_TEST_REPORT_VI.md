# Báo cáo kiểm tra Graphics Phase 2.1 — 2026-10-16

| Nhóm | Kết quả môi trường phân tích | Nhận xét |
| --- | --- | --- |
| Node client unit + Babylon NullEngine | **34 PASS, 0 FAIL** | Bao gồm 24 unit Phase 2, 6 catalog/LOD tests và 4 Babylon NullEngine |
| Graphics 2.1 static audit | **12 PASS, 0 FAIL** | 2 scene chung visual factory, hitbox riêng, fallback đúng ID, cleanup |
| Phase 2 gameplay audit | **14 PASS, 0 FAIL** | Không thay combat/energy/missions |
| Phase 1 security audit | **14 PASS, 0 FAIL** | Không sửa server authority |
| Source relative imports | **100/100 có đích** | `check:imports` |
| Syntax JS/JSX | **39/39 parse bằng Babel** | Không tương đương full Vite build |
| Manifest dữ liệu asset | **16/16 trùng file public** | `check:ship-assets` |
| Server pure tests | **20 PASS, 0 FAIL, 3 SKIP** | Express dependency không cài trong môi trường phân tích; máy user đã chạy trước đây |
| Vite release build | **CHƯA CHẠY** | Môi trường này không có đủ Vite/native dependency; cần chạy `npm ci`, `npm run build` tại Windows |
| Real Firebase / browser / mobile GPU | **CHƯA CHẠY** | Cần thực hiện checklist UAT |

**Model audit:** `ship_xwing.glb` 57,759,760 byte, 1,871,386 tam giác. Catalog: 16 phi cơ; 7 ảnh Top, 7 HQ, 1 GLB; 9 phi cơ dùng silhouette tạm. Vẫn có cảnh báo 61 asset literal path khác bị thiếu và sai lệch Android/Capacitor App ID — không được xem là sẵn sàng release.
