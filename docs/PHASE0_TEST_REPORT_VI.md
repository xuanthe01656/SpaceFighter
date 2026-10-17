# KIỂM THỬ PHASE 0 — KẾT QUẢ VÀ UAT

**Mã nguồn:** `spaceFighter.zip` (đã xử lý subset, không đụng bản gốc).  
**Ngày thực thi tĩnh:** 16/10/2026.  
**Môi trường:** Linux, Node v22.16.0, npm v10.9.2; không có đầy đủ npm registry/dependency; không có Firebase staging credentials; không chạy thiết bị Android/iOS.

## A. Kết quả tự động

| Phạm vi | Kết quả |
|---|---|
| `client: npm test` | **PASS 9/9** (profile, legacy, guest, day/week attendance) |
| `client: npm run check:safety` | **PASS 8/8** (chặn fake IAP, schema, HQ debit, attendance) |
| `client: npm run check:imports` | **PASS**: 30 source JS/JSX và 66 import tương đối đều tồn tại |
| Parser JSX/Babel độc lập | **PASS**: 30 file JS/JSX `src` và `scripts` được parser phân tích, lỗi cú pháp: 0 |
| `client: npm run audit:assets` | **WARNING**: 61 tham chiếu tài nguyên tĩnh thiếu file dưới `public/` |
| `client: npm run audit:config` | **WARNING**: 2 vấn đề: App ID mismatch; Android thiếu `google-services.json` trong source |
| `server: node --check server.js` | **PASS** |
| `server: npm test` | **3 SKIPPED**, không thể cài Express do không có package trong npm cache offline. Không tính là PASS. |
| `client: npm run build` | **NOT RUN**: `npm ci` chưa hoàn tất vì npm registry không truy cập đủ; zip gốc có `@esbuild/win32-x64`, trong khi máy chạy Linux. |
| `native: Android/iOS release build` | **NOT RUN**: cần Windows/macOS, SDK và cấu hình app. |

Không được diễn giải kiểm thử tĩnh như đã chạy thành công gameplay hay thanh toán thật.

## B. Checklist UAT thủ công bắt buộc trên Firebase *staging*

- [ ] Tạo user Google mới: document `users/{uid}` chứa `schemaVersion=2`, `wallet`, `inventory`, `materials`, `eventData`, `dungeonHistory`, `attendance`.
- [ ] Đăng nhập user cũ: coins/diamonds/energy, pilot/aircraft, nhiệm vụ, sao ải, vật phẩm và profile còn nguyên.
- [ ] Bán 1 trang bị rồi đăng nhập lại: item đã bán không xuất hiện trở lại (chú ý `mergeFields`).
- [ ] Thêm hòm, lịch sử dungeon, event progress, save và đăng nhập lại: dữ liệu đầy đủ.
- [ ] Mở Attendance trong tuần cũ và tuần mới: claimedDays reset đúng Thứ Hai, lifetime streak giữ nguyên, không thể điểm danh hai lần một ngày.
- [ ] Điểm danh bù chỉ áp dụng cho ngày đã qua của tuần hiện tại; makeupCount reset ở tuần mới.
- [ ] Dungeon không đủ năng lượng: không vào battle, không trừ âm; khi đủ năng lượng và mạng ổn định: trừ đúng một lần sau khi lưu xong.
- [ ] Rút mạng trước khi xuất kích: kiểm tra UI/logic chờ; không đóng app khi trạng thái write chưa rõ, ghi nhận UX để xử lý Phase 1.
- [ ] Nhấn liên tiếp Xuất kích: không trừ năng lượng hai lần.
- [ ] Web và native: nhấn mọi gói Top-up: luôn thông báo tạm khóa; không mua store; không thay đổi gems/VIP/first-topup reward.
- [ ] Chơi khách: lưu/khôi phục data cache mới và cache định dạng JSON string từ bản cũ.
- [ ] Đăng xuất user A, đăng nhập user B: dữ liệu tài khoản không trộn, sessionId hoạt động đúng.
- [ ] Campaign: vào ải, chiến đấu, thắng/thua, nhận thưởng, mở ải kế; so sánh với bản gốc.
- [ ] Dungeon: thắng/thua và nhận thưởng, đồng bộ cloud và lịch sử.
- [ ] Android/iOS: kiểm tra đăng nhập Google/Apple, Capacitor sync, app ID, keystore và settings Firebase.
- [ ] Build production web: kiểm tra các request ảnh/network failed; không có runtime exceptions trong console.

## C. Ghi nhận giới hạn

- Chưa chạy Firestore emulator, security rules test, kiểm thử tích hợp Firebase Auth hay simulated concurrency đa thiết bị.
- Chưa chạy IAP test trong Google Play Sandbox/TestFlight. Phase 0 intentionally disables it.
- Chưa kiểm thử FPS/CPU/RAM, màn 3D Babylon hay độ ổn định trên thiết bị thật.
- Không viết migration làm thay đổi dữ liệu Firestore hiện tại. Mọi hoạt động ghi đều chỉ xảy ra khi bạn tự chạy client mới với kết nối Firebase.
