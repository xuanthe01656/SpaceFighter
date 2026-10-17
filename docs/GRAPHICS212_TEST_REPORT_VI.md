# Graphics 2.1.2 — Báo cáo kiểm thử thực hiện trong môi trường tạo patch

Ngày phát hành bản sửa: 17/10/2026. Baseline: `SpaceFighter_Graphics2.1.1_MissionSync_FULL_SOURCE.zip`.

## Đã chạy

| Kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `cd server && npm test` | **32 PASS / 0 FAIL / 3 SKIP** | Các ca HTTP skip vì thiếu Express/npm modules trong môi trường tạo patch. |
| `cd client && npm test` | **42 PASS / 1 FAIL (dependency)** | Test loader `shipVisualRuntime.test.mjs` chưa khởi chạy do thiếu `@babylonjs/core` từ npm. Các bài kiểm thử logic đã chạy đều PASS. |
| `npm run check:graphics21` | **12/12 PASS** | Phạm vi tĩnh, không phải ảnh render bằng GPU. |
| `npm run check:safety` | **14/14 PASS** | Chỉ là quy tắc kiểm tra tĩnh đã có; không chứng minh bảo mật thương mại hoàn chỉnh. |
| `npm run check:gameplay` | **14/14 PASS** | Static gameplay. |
| `npm run check:imports` | **PASS** | 40 source files, 109 relative imports. |
| `npm run audit:config` | **2 WARNING** | Capacitor app ID không khớp Android, thiếu `google-services.json` trên source native. |
| `npm run build` | **NOT EXECUTED (Vite unavailable)** | npm registry lỗi DNS EAI_AGAIN, `vite: not found`. Không quy đây là lỗi TypeScript/React. |
| `npm run audit:assets` | **Có thiếu artwork** | Đây là tình trạng đã có ở baseline, không phải asset bị hotfix xóa. |

## Đã thêm và xác nhận bằng các ca mới

1. Dry-run với fixture có đúng dữ liệu cloud `[1,2,5]`, 2 lượt makeup, d=0/w=2/m=0, lastDate cũ → preview d=0/w=1/m=1 cho ngày 17/10 UTC. Không động đến wallet, inventory, custom fields hoặc rewards.
2. Nếu ngày UTC do operator xác nhận sai, kỳ hiện tại khác, tài khoản đã có ledger, nhiệm vụ đã nhận thưởng hoặc counters khác snapshot → từ chối sửa.
3. Đã áp plan lên fixture (không kết nối Firebase) và thử điểm danh tự nhiên ngày 17/10 → nhiệm vụ d=1/w=2/m=2, chỉ cộng một lần, ghi `extra.attendance` và sổ ngày UTC.
4. `updateMissions()` khôi phục sàn tiến trình từ ngày tự nhiên có bằng chứng; không dùng legacy `lastDate` để cấp thưởng tự động.
5. Guest ghi ngày UTC thật, bỏ makeup, tự phục hồi sau reset trong cùng kỳ.
6. X-Wing: test phân biệt render quality Android vs Windows, metadata `spriteInvertY` riêng X-Wing, test đơn vị phép xoay GLB sau conversion `__root__`.
7. Các test hiện hữu cho tháng 2/30/31 ngày, streak, UUID operation, session, cap và Ghost không bị lỗi hồi quy.

## Chưa thể xác nhận

- WebGL/GLB runtime thực trên thiết bị; hiệu chỉnh sprite texture và GLB vẫn cần ảnh UAT tại máy người dùng.
- API/Firestore production/staging thực tế; CLI chỉ được test bằng hàm nghiệp vụ với snapshot giả lập, chưa truy cập account hay ghi Firestore.
- Native Android/iOS build, perf 57.8MB GLB, crash, stress/load, IAP/payment server receipt, anti-cheat PvE, PenTest. **Không được coi đây là tuyên bố production-commercial ready.**
